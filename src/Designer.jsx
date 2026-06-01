import React, { useRef, useState, useEffect } from 'react'
import { snap, clamp, fmtIn, getColumns, columnAt, bayAt, nextId, computeOpenCells, resolveThicknesses, pieceThickness, bayAnchorY } from './utils.js'

// SVG renders in inches; CSS scales it visually.
// SVG y=0 at TOP. Interior coordinates ("interior-x", "interior-y") use:
//   interior-x: distance from the inside-left face of the left side board.
//   interior-y: distance from the inside-BOTTOM (upward), so users think bottom-up.
//
// Conversions:
//   svg_x = sideThickness + interior_x
//   svg_y(interior_y) = topThickness + (interiorHeight - interior_y)

const PX_PER_IN = 14 // visual scale for the SVG

export default function Designer({ design, setDesign, selected, setSelected }) {
  const { width: W, height: H, snap: snapInc } = design
  const { side: ts, top: tt, bottom: tb } = resolveThicknesses(design)
  const pt = (p) => pieceThickness(design, p)
  const interiorWidth = W - 2 * ts
  const interiorHeight = H - tt - tb

  const svgRef = useRef(null)
  const [hover, setHover] = useState(null) // {x, y} in svg coords for ghost piece while in add mode
  const [dragging, setDragging] = useState(null) // {type, id, startMouseSvg, startVal}

  // Mode comes from design.mode
  const mode = design.mode

  const svgWidth = W
  const svgHeight = H
  const margin = 3 // inches of margin in SVG for the outer W/H labels

  // Convert a clientX/Y to SVG coordinates (in inches).
  function clientToSvg(e) {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = svg.getScreenCTM()
    if (!m) return null
    const inv = m.inverse()
    const out = pt.matrixTransform(inv)
    return { x: out.x, y: out.y }
  }

  // ---------- Mouse interactions ----------

  function handleMouseMove(e) {
    const p = clientToSvg(e)
    if (!p) return

    if (dragging) {
      // Update the dragged piece's position.
      if (dragging.type === 'shelf') {
        const s = design.shelves.find((x) => x.id === dragging.id)
        if (!s) return
        // mouse y in svg → interior_y (from bottom)
        const interiorY = clamp(
          snap((tt + interiorHeight) - p.y, snapInc),
          pt(s), // shelf top face can't go below thickness above interior bottom (so bottom face is >= 0)
          interiorHeight, // shelf top face can't go above interior top
        )
        setDesign((d) => ({
          ...d,
          shelves: d.shelves.map((x) => (x.id === s.id ? { ...x, y: interiorY } : x)),
        }))
      } else if (dragging.type === 'fullDivider') {
        const d0 = design.fullDividers.find((x) => x.id === dragging.id)
        if (!d0) return
        const interiorX = clamp(
          snap(p.x - ts, snapInc),
          0,
          interiorWidth - pt(d0),
        )
        setDesign((d) => ({
          ...d,
          fullDividers: d.fullDividers.map((x) => (x.id === d0.id ? { ...x, x: interiorX } : x)),
        }))
      } else if (dragging.type === 'bayDivider') {
        const d0 = design.bayDividers.find((x) => x.id === dragging.id)
        if (!d0) return
        const interiorX = clamp(
          snap(p.x - ts, snapInc),
          0,
          interiorWidth - pt(d0),
        )
        setDesign((d) => ({
          ...d,
          bayDividers: d.bayDividers.map((x) => (x.id === d0.id ? { ...x, x: interiorX } : x)),
        }))
      }
      return
    }

    if (mode !== 'select') {
      // Update ghost position
      setHover({ x: p.x, y: p.y })
    } else {
      setHover(null)
    }
  }

  function handleMouseUp() {
    setDragging(null)
  }

  function handleMouseLeave() {
    setHover(null)
    setDragging(null)
  }

  function handleCanvasClick(e) {
    if (dragging) return
    const p = clientToSvg(e)
    if (!p) return

    // Interior coordinates
    const ix = p.x - ts
    const iy = (tt + interiorHeight) - p.y // from inside bottom upward

    // Outside the interior? Ignore for add modes.
    const inside = ix >= 0 && ix <= interiorWidth && iy >= 0 && iy <= interiorHeight

    const defaultShelfT = design.unifiedThickness ? design.thickness : design.defaultShelfThickness
    const defaultDivT = design.unifiedThickness ? design.thickness : design.defaultDividerThickness

    if (mode === 'addShelf') {
      if (!inside) return
      const col = columnAt(design, ix)
      const thickness = defaultShelfT
      const y = clamp(snap(iy, snapInc), thickness, interiorHeight)
      const id = nextId()
      setDesign((d) => ({
        ...d,
        shelves: [...d.shelves, { id, y, columnIndex: col.index, thickness }],
        mode: 'select',
      }))
      setSelected({ type: 'shelf', id })
    } else if (mode === 'addShelfAll') {
      if (!inside) return
      const thickness = defaultShelfT
      const y = clamp(snap(iy, snapInc), thickness, interiorHeight)
      const cols = getColumns(design)
      const newShelves = cols.map((col) => ({
        id: nextId(),
        y,
        columnIndex: col.index,
        thickness,
      }))
      setDesign((d) => ({
        ...d,
        shelves: [...d.shelves, ...newShelves],
        mode: 'select',
      }))
      setSelected(newShelves.length > 0 ? { type: 'shelf', id: newShelves[0].id } : null)
    } else if (mode === 'addFullDivider') {
      if (!inside) return
      const thickness = defaultDivT
      const x = clamp(snap(ix, snapInc), 0, interiorWidth - thickness)
      const id = nextId()
      setDesign((d) => ({
        ...d,
        fullDividers: [...d.fullDividers, { id, x, thickness }],
        mode: 'select',
      }))
      setSelected({ type: 'fullDivider', id })
    } else if (mode === 'addBayDivider') {
      if (!inside) return
      const thickness = defaultDivT
      const x = clamp(snap(ix, snapInc), 0, interiorWidth - thickness)
      const anchorY = clamp(snap(iy, snapInc), 0, interiorHeight)
      const id = nextId()
      setDesign((d) => ({
        ...d,
        bayDividers: [...d.bayDividers, { id, x, thickness, anchorY }],
        mode: 'select',
      }))
      setSelected({ type: 'bayDivider', id })
    } else {
      // select mode: clicking empty space clears selection
      setSelected(null)
    }
  }

  function startDrag(e, type, id) {
    if (mode !== 'select') return
    e.stopPropagation()
    setSelected({ type, id })
    setDragging({ type, id })
  }

  function handlePieceClick(e, type, id) {
    e.stopPropagation()
    if (mode !== 'select') return
    setSelected({ type, id })
  }

  // ---------- Geometry helpers (interior → SVG) ----------
  const svgX = (ix) => ts + ix
  const svgYTopFace = (iy) => tt + (interiorHeight - iy) // top face of shelf at interior_y iy

  // ---------- Render pieces ----------
  const isSelected = (type, id) =>
    selected && selected.type === type && selected.id === id

  const cols = getColumns(design)

  // Grid lines (every snap increment within the interior)
  const gridLines = []
  for (let xi = 0; xi <= interiorWidth + 1e-6; xi += snapInc) {
    const isMajor = Math.abs(xi - Math.round(xi)) < 1e-6 && Math.round(xi) % 6 === 0
    gridLines.push(
      <line
        key={`gx${xi}`}
        x1={svgX(xi)} x2={svgX(xi)}
        y1={tt} y2={tt + interiorHeight}
        className={isMajor ? 'grid-line major' : 'grid-line'}
      />
    )
  }
  for (let yi = 0; yi <= interiorHeight + 1e-6; yi += snapInc) {
    const isMajor = Math.abs(yi - Math.round(yi)) < 1e-6 && Math.round(yi) % 6 === 0
    gridLines.push(
      <line
        key={`gy${yi}`}
        x1={ts} x2={ts + interiorWidth}
        y1={svgYTopFace(yi)} y2={svgYTopFace(yi)}
        className={isMajor ? 'grid-line major' : 'grid-line'}
      />
    )
  }

  // Ghost piece for add mode
  let ghost = null
  if (hover && mode !== 'select') {
    const ix = clamp(hover.x - ts, 0, interiorWidth)
    const iy = clamp((tt + interiorHeight) - hover.y, 0, interiorHeight)
    const defaultShelfT = design.unifiedThickness ? design.thickness : design.defaultShelfThickness
    const defaultDivT = design.unifiedThickness ? design.thickness : design.defaultDividerThickness
    if (mode === 'addShelf') {
      const col = columnAt(design, ix)
      const thickness = defaultShelfT
      const yTop = clamp(snap(iy, snapInc), thickness, interiorHeight)
      ghost = (
        <rect
          x={svgX(col.left)} y={svgYTopFace(yTop)}
          width={col.right - col.left} height={thickness}
          className="piece-ghost"
        />
      )
    } else if (mode === 'addShelfAll') {
      const thickness = defaultShelfT
      const yTop = clamp(snap(iy, snapInc), thickness, interiorHeight)
      ghost = (
        <g>
          {cols.map((c) => (
            <rect key={c.index}
              x={svgX(c.left)} y={svgYTopFace(yTop)}
              width={c.right - c.left} height={thickness}
              className="piece-ghost"
            />
          ))}
        </g>
      )
    } else if (mode === 'addFullDivider') {
      const thickness = defaultDivT
      const x = clamp(snap(ix, snapInc), 0, interiorWidth - thickness)
      ghost = (
        <rect
          x={svgX(x)} y={tt}
          width={thickness} height={interiorHeight}
          className="piece-ghost"
        />
      )
    } else if (mode === 'addBayDivider') {
      const thickness = defaultDivT
      const x = clamp(snap(ix, snapInc), 0, interiorWidth - thickness)
      const col = columnAt(design, x + thickness / 2)
      const bay = bayAt(design, col.index, iy)
      ghost = (
        <rect
          x={svgX(x)} y={svgYTopFace(bay.top)}
          width={thickness} height={bay.top - bay.bottom}
          className="piece-ghost"
        />
      )
    }
  }

  return (
    <svg
      ref={svgRef}
      className="canvas-svg"
      width={(svgWidth + 2 * margin) * PX_PER_IN}
      height={(svgHeight + 2 * margin) * PX_PER_IN}
      viewBox={`${-margin} ${-margin} ${svgWidth + 2 * margin} ${svgHeight + 2 * margin}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleCanvasClick}
      style={{ cursor: mode === 'select' ? 'default' : 'crosshair' }}
    >
      {/* Outer dimension labels: overall W & H, plus the cut length for the top and side boards. */}
      {(() => {
        const topCut = design.sidesOutside ? W - 2 * ts : W
        const sideCut = design.sidesOutside ? H : H - tt - tb
        return (
          <>
            <text x={W / 2} y={-1.9} textAnchor="middle" className="dim-label">
              {fmtIn(W)}
            </text>
            <text x={W / 2} y={-0.5} textAnchor="middle" className="cut-label">
              {fmtIn(topCut)}
              <tspan dx="0.1" style={{ fontSize: '0.55em' }}>cut</tspan>
            </text>
            <text
              x={-1.9} y={H / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${-1.9} ${H / 2})`}
              className="dim-label"
            >{fmtIn(H)}</text>
            <text
              x={-0.5} y={H / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${-0.5} ${H / 2})`}
              className="cut-label"
            >
              {fmtIn(sideCut)}
              <tspan dx="0.1" style={{ fontSize: '0.55em' }}>cut</tspan>
            </text>
          </>
        )
      })()}

      {/* Interior grid */}
      <g>{gridLines}</g>

      {/* Frame — drawn based on which boards run "outside" */}
      {design.sidesOutside ? (
        <>
          <rect className="piece frame-piece" x={0} y={0} width={ts} height={H} />
          <rect className="piece frame-piece" x={W - ts} y={0} width={ts} height={H} />
          <rect className="piece frame-piece" x={ts} y={0} width={W - 2 * ts} height={tt} />
          <rect className="piece frame-piece" x={ts} y={H - tb} width={W - 2 * ts} height={tb} />
        </>
      ) : (
        <>
          <rect className="piece frame-piece" x={0} y={0} width={W} height={tt} />
          <rect className="piece frame-piece" x={0} y={H - tb} width={W} height={tb} />
          <rect className="piece frame-piece" x={0} y={tt} width={ts} height={H - tt - tb} />
          <rect className="piece frame-piece" x={W - ts} y={tt} width={ts} height={H - tt - tb} />
        </>
      )}

      {/* Full-height dividers (drawn under shelves so shelves visually butt against them) */}
      {design.fullDividers.map((d) => (
        <rect
          key={`fd-${d.id}`}
          className={`piece divider-piece${isSelected('fullDivider', d.id) ? ' selected' : ''}`}
          x={svgX(d.x)} y={tt}
          width={pt(d)} height={interiorHeight}
          onMouseDown={(e) => startDrag(e, 'fullDivider', d.id)}
          onClick={(e) => handlePieceClick(e, 'fullDivider', d.id)}
        />
      ))}

      {/* Shelves */}
      {design.shelves.map((s) => {
        const col = cols[s.columnIndex]
        if (!col) return null
        return (
          <rect
            key={`s-${s.id}`}
            className={`piece shelf-piece${isSelected('shelf', s.id) ? ' selected' : ''}`}
            x={svgX(col.left)} y={svgYTopFace(s.y)}
            width={col.right - col.left} height={pt(s)}
            onMouseDown={(e) => startDrag(e, 'shelf', s.id)}
            onClick={(e) => handlePieceClick(e, 'shelf', s.id)}
          />
        )
      })}

      {/* Bay dividers — bay is derived from current shelves and the divider's anchorY. */}
      {design.bayDividers.map((d) => {
        const col = columnAt(design, d.x + pt(d) / 2)
        const bay = bayAt(design, col.index, bayAnchorY(d))
        if (bay.top - bay.bottom <= 1e-6) return null
        return (
          <rect
            key={`bd-${d.id}`}
            className={`piece divider-piece${isSelected('bayDivider', d.id) ? ' selected' : ''}`}
            x={svgX(d.x)} y={svgYTopFace(bay.top)}
            width={pt(d)} height={bay.top - bay.bottom}
            onMouseDown={(e) => startDrag(e, 'bayDivider', d.id)}
            onClick={(e) => handlePieceClick(e, 'bayDivider', d.id)}
          />
        )
      })}

      {/* Ghost piece */}
      {ghost}

      {/* Open-cell dimensions (W × H of each gap) */}
      <Dimensions
        design={design}
        svgX={svgX}
        svgYTopFace={svgYTopFace}
        cols={cols}
      />
    </svg>
  )
}

function Dimensions({ design, svgX, svgYTopFace, cols }) {
  const cells = computeOpenCells(design)
  const { side: ts, top: tt, bottom: tb } = resolveThicknesses(design)
  const interiorWidth = design.width - 2 * ts
  const interiorHeight = design.height - tt - tb

  // For each open cell, stack W: and H: labels vertically and centered.
  const cellLabels = cells.map((c, i) => {
    const w = c.right - c.left
    const h = c.top - c.bottom
    // Font scales to fit two stacked lines (height needs ~2.4 line-heights).
    const fs = Math.max(0.5, Math.min(1.4, w / 5, h / 2.4))
    if (fs < 0.55) return null
    const cx = svgX((c.left + c.right) / 2)
    const cy = svgYTopFace((c.bottom + c.top) / 2)
    const offset = fs * 0.6
    return (
      <g key={`cell-${i}`}>
        <text
          x={cx} y={cy - offset}
          textAnchor="middle" dominantBaseline="middle"
          className="cell-dim-label"
          style={{ fontSize: fs }}
        >
          {fmtIn(w)}
          <tspan dx={fs * 0.08} style={{ fontSize: fs * 0.55 }}>W</tspan>
        </text>
        <text
          x={cx} y={cy + offset}
          textAnchor="middle" dominantBaseline="middle"
          className="cell-dim-label"
          style={{ fontSize: fs }}
        >
          {fmtIn(h)}
          <tspan dx={fs * 0.08} style={{ fontSize: fs * 0.55 }}>H</tspan>
        </text>
      </g>
    )
  })

  return <g pointerEvents="none">{cellLabels}</g>
}
