import React, { useState, useEffect, useMemo } from 'react'
import Designer from './Designer.jsx'
import { computeCutList, fmtIn, computeStockBoards, bayAnchorY, bayAt, columnAt, pieceThickness } from './utils.js'
import { listDesigns, loadDesign, saveDesign, deleteDesign, serializeDesign, deserializeDesign } from './storage.js'

const DEFAULT_DESIGN = {
  width: 72,
  height: 28,
  depth: 11.25,
  snap: 0.5,
  unifiedThickness: true,
  thickness: 1.0,          // used when unifiedThickness is true
  sidesOutside: true,      // sides run full height; top/bottom fit between sides
  sideThickness: 1.0,      // used when unifiedThickness is false
  topThickness: 1.0,
  bottomThickness: 1.0,
  defaultShelfThickness: 1.0,
  defaultDividerThickness: 1.0,
  shelves: [],
  fullDividers: [],
  bayDividers: [],
  stockLengthFt: 8,
  kerf: 0.125,
  mode: 'select',
}

const THICKNESS_OPTIONS = [
  { label: '¾" (1x)', value: 0.75 },
  { label: '1"', value: 1.0 },
  { label: '1½" (2x)', value: 1.5 },
  { label: '½"', value: 0.5 },
  { label: '⅝"', value: 0.625 },
]

export default function App() {
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [selected, setSelected] = useState(null) // { type, id } | null
  const [currentName, setCurrentName] = useState('') // name of last loaded/saved design

  // Delete with keyboard
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        const tag = (e.target.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return
        deleteSelected()
      }
      if (e.key === 'Escape') {
        setDesign((d) => ({ ...d, mode: 'select' }))
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  function deleteSelected() {
    if (!selected) return
    setDesign((d) => {
      if (selected.type === 'shelf') {
        return { ...d, shelves: d.shelves.filter((x) => x.id !== selected.id) }
      }
      if (selected.type === 'fullDivider') {
        return { ...d, fullDividers: d.fullDividers.filter((x) => x.id !== selected.id) }
      }
      if (selected.type === 'bayDivider') {
        return { ...d, bayDividers: d.bayDividers.filter((x) => x.id !== selected.id) }
      }
      return d
    })
    setSelected(null)
  }

  function setMode(m) {
    setDesign((d) => ({ ...d, mode: m }))
    setSelected(null)
  }

  const cutList = useMemo(() => computeCutList(design), [design])

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Shelf Designer</h1>

        <div className="field">
          <label>Width</label>
          <input
            type="number" step="0.5" value={design.width}
            onChange={(e) => setDesign({ ...design, width: parseFloat(e.target.value) || 0 })}
          /> in
        </div>
        <div className="field">
          <label>Height</label>
          <input
            type="number" step="0.5" value={design.height}
            onChange={(e) => setDesign({ ...design, height: parseFloat(e.target.value) || 0 })}
          /> in
        </div>
        <div className="field">
          <label>Depth</label>
          <input
            type="number" step="0.25" value={design.depth}
            onChange={(e) => setDesign({ ...design, depth: parseFloat(e.target.value) || 0 })}
          /> in
        </div>

        <div className="divider-v" />

        <div className="field">
          <label>Snap</label>
          <select
            value={design.snap}
            onChange={(e) => setDesign({ ...design, snap: parseFloat(e.target.value) })}
          >
            <option value={0.5}>½"</option>
            <option value={1}>1"</option>
            <option value={0.25}>¼"</option>
          </select>
        </div>

        <div className="divider-v" />

        <div className="mode-group">
          <button
            className={`mode-btn${design.mode === 'select' ? ' active' : ''}`}
            onClick={() => setMode('select')}
          >Select</button>
          <button
            className={`mode-btn${design.mode === 'addShelf' ? ' active' : ''}`}
            onClick={() => setMode('addShelf')}
          >+ Shelf (in column)</button>
          <button
            className={`mode-btn${design.mode === 'addShelfAll' ? ' active' : ''}`}
            onClick={() => setMode('addShelfAll')}
          >+ Shelf (all columns)</button>
          <button
            className={`mode-btn${design.mode === 'addFullDivider' ? ' active' : ''}`}
            onClick={() => setMode('addFullDivider')}
          >+ Divider (full)</button>
          <button
            className={`mode-btn${design.mode === 'addBayDivider' ? ' active' : ''}`}
            onClick={() => setMode('addBayDivider')}
          >+ Divider (bay)</button>
        </div>
      </header>

      <div className="main">
        <div className="canvas-wrap">
          <Designer
            design={design}
            setDesign={setDesign}
            selected={selected}
            setSelected={setSelected}
          />
        </div>

        <aside className="side-panel">
          <SavePanel
            design={design}
            setDesign={setDesign}
            setSelected={setSelected}
            currentName={currentName}
            setCurrentName={setCurrentName}
          />
          <ConstructionPanel design={design} setDesign={setDesign} />
          <SelectedPanel
            design={design}
            setDesign={setDesign}
            selected={selected}
            onDelete={deleteSelected}
          />
          <CutListPanel cutList={cutList} design={design} setDesign={setDesign} />
        </aside>
      </div>
    </div>
  )
}

function ConstructionPanel({ design, setDesign }) {
  return (
    <div className="panel">
      <h2>Construction</h2>

      <div className="panel-row">
        <label>Frame style</label>
        <select
          value={design.sidesOutside ? 'sides' : 'topBottom'}
          onChange={(e) => setDesign({ ...design, sidesOutside: e.target.value === 'sides' })}
        >
          <option value="sides">Sides outside (full height)</option>
          <option value="topBottom">Top/bottom outside (full width)</option>
        </select>
      </div>

      <div className="panel-row">
        <label>
          <input
            type="checkbox"
            checked={design.unifiedThickness}
            onChange={(e) => setDesign({ ...design, unifiedThickness: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          Same thickness for all pieces
        </label>
      </div>

      {design.unifiedThickness ? (
        <ThicknessRow
          label="Thickness"
          value={design.thickness}
          onChange={(v) => setDesign({ ...design, thickness: v })}
        />
      ) : (
        <>
          <div style={{ height: 6 }} />
          <h2>Frame thickness</h2>
          <ThicknessRow
            label="Sides"
            value={design.sideThickness}
            onChange={(v) => setDesign({ ...design, sideThickness: v })}
          />
          <ThicknessRow
            label="Top"
            value={design.topThickness}
            onChange={(v) => setDesign({ ...design, topThickness: v })}
          />
          <ThicknessRow
            label="Bottom"
            value={design.bottomThickness}
            onChange={(v) => setDesign({ ...design, bottomThickness: v })}
          />
          <div style={{ height: 6 }} />
          <h2>Default for new pieces</h2>
          <ThicknessRow
            label="Shelves"
            value={design.defaultShelfThickness}
            onChange={(v) => setDesign({ ...design, defaultShelfThickness: v })}
          />
          <ThicknessRow
            label="Dividers"
            value={design.defaultDividerThickness}
            onChange={(v) => setDesign({ ...design, defaultDividerThickness: v })}
          />
        </>
      )}
    </div>
  )
}

function ThicknessRow({ label, value, onChange }) {
  const matches = THICKNESS_OPTIONS.some((o) => o.value === value)
  return (
    <div className="panel-row">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={matches ? value : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') return
            onChange(parseFloat(e.target.value))
          }}
        >
          {THICKNESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <input
          type="number" step="0.0625" value={value}
          style={{ width: 64 }}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </div>
    </div>
  )
}

function SelectedPanel({ design, setDesign, selected, onDelete }) {
  if (!selected) {
    return (
      <div className="panel">
        <h2>Selected</h2>
        <div className="empty-hint">
          Click a piece to select it. Drag to reposition. Press Delete to remove.
        </div>
      </div>
    )
  }

  let piece = null
  let updateThickness = null
  let positionRow = null

  if (selected.type === 'shelf') {
    piece = design.shelves.find((x) => x.id === selected.id)
    if (!piece) return null
    updateThickness = (v) => setDesign({
      ...design,
      shelves: design.shelves.map((x) => x.id === piece.id ? { ...x, thickness: v } : x),
    })
    positionRow = (
      <div className="panel-row">
        <label>Top face at</label>
        <input
          type="number" step={design.snap} value={piece.y}
          onChange={(e) => setDesign({
            ...design,
            shelves: design.shelves.map((x) => x.id === piece.id ? { ...x, y: parseFloat(e.target.value) || 0 } : x),
          })}
        />
      </div>
    )
  } else if (selected.type === 'fullDivider') {
    piece = design.fullDividers.find((x) => x.id === selected.id)
    if (!piece) return null
    updateThickness = (v) => setDesign({
      ...design,
      fullDividers: design.fullDividers.map((x) => x.id === piece.id ? { ...x, thickness: v } : x),
    })
    positionRow = (
      <div className="panel-row">
        <label>Left face at</label>
        <input
          type="number" step={design.snap} value={piece.x}
          onChange={(e) => setDesign({
            ...design,
            fullDividers: design.fullDividers.map((x) => x.id === piece.id ? { ...x, x: parseFloat(e.target.value) || 0 } : x),
          })}
        />
      </div>
    )
  } else if (selected.type === 'bayDivider') {
    piece = design.bayDividers.find((x) => x.id === selected.id)
    if (!piece) return null
    updateThickness = (v) => setDesign({
      ...design,
      bayDividers: design.bayDividers.map((x) => x.id === piece.id ? { ...x, thickness: v } : x),
    })
    const anchor = bayAnchorY(piece)
    const col = columnAt(design, piece.x + pieceThickness(design, piece) / 2)
    const bay = bayAt(design, col.index, anchor)
    positionRow = (
      <>
        <div className="panel-row">
          <label>Left face at</label>
          <input
            type="number" step={design.snap} value={piece.x}
            onChange={(e) => setDesign({
              ...design,
              bayDividers: design.bayDividers.map((x) => x.id === piece.id ? { ...x, x: parseFloat(e.target.value) || 0 } : x),
            })}
          />
        </div>
        <div className="panel-row">
          <label>Anchor Y</label>
          <input
            type="number" step={design.snap} value={anchor}
            onChange={(e) => setDesign({
              ...design,
              bayDividers: design.bayDividers.map((x) => x.id === piece.id ? { ...x, anchorY: parseFloat(e.target.value) || 0 } : x),
            })}
          />
        </div>
        <div className="panel-row">
          <label>Bay</label>
          <span className="muted">{fmtIn(bay.bottom)} – {fmtIn(bay.top)} (len {fmtIn(bay.top - bay.bottom)})</span>
        </div>
      </>
    )
  }

  if (!piece) return null

  const typeLabel = {
    shelf: 'Shelf',
    fullDivider: 'Full-height divider',
    bayDivider: 'Bay divider',
  }[selected.type]

  return (
    <div className="panel">
      <h2>Selected · {typeLabel}</h2>
      {positionRow}
      {design.unifiedThickness ? (
        <div className="panel-row">
          <label>Thickness</label>
          <span className="muted">{fmtIn(design.thickness)} (unified)</span>
        </div>
      ) : (
        <ThicknessRow label="Thickness" value={piece.thickness} onChange={updateThickness} />
      )}
      <div className="panel-row" style={{ marginTop: 10 }}>
        <span />
        <button className="danger-btn" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

function CutListPanel({ cutList, design, setDesign }) {
  if (cutList.length === 0) {
    return (
      <div className="panel">
        <h2>Cut list</h2>
        <div className="empty-hint">Add pieces to see the cut list.</div>
      </div>
    )
  }

  const totalCuts = cutList.reduce((s, p) => s + p.count, 0)
  const totalLinearIn = cutList.reduce((s, p) => s + p.count * p.length, 0)
  const stockLenIn = (design.stockLengthFt || 8) * 12
  const stockGroups = computeStockBoards(cutList, stockLenIn, design.kerf || 0)
  const totalStock = stockGroups.reduce((s, g) => s + g.boards.length, 0)
  const hasOversized = stockGroups.some((g) => g.boards.some((b) => b.oversized))

  return (
    <div className="panel">
      <h2>Cut list</h2>

      <div className="panel-row">
        <label>Stock length</label>
        <span>
          <input
            type="number" min="1" step="1"
            value={design.stockLengthFt}
            onChange={(e) => setDesign({ ...design, stockLengthFt: parseFloat(e.target.value) || 0 })}
            style={{ width: 56 }}
          /> ft
        </span>
      </div>
      <div className="panel-row">
        <label>Kerf</label>
        <span>
          <input
            type="number" min="0" step="0.0625"
            value={design.kerf}
            onChange={(e) => setDesign({ ...design, kerf: parseFloat(e.target.value) || 0 })}
            style={{ width: 56 }}
          /> in
        </span>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        {totalCuts} cuts · {fmtIn(totalLinearIn)} total
      </div>

      <div style={{ marginTop: 8 }}>
        <strong>
          Buy {totalStock} × {design.stockLengthFt}ft board{totalStock === 1 ? '' : 's'}
        </strong>
        {hasOversized && (
          <div style={{ color: '#cf222e', fontSize: 12, marginTop: 4 }}>
            ⚠ Some cuts are longer than {design.stockLengthFt}ft — increase stock length.
          </div>
        )}
        {stockGroups.map((g, gi) => (
          <div key={gi} style={{ marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {g.boards.length} × {design.stockLengthFt}ft {stockLabel(g.thickness, g.width)}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0 0', fontSize: 12 }}>
              {g.boards.map((b, bi) => {
                const scrap = stockLenIn - b.used
                return (
                  <li key={bi} style={{
                    padding: '3px 6px',
                    background: b.oversized ? '#ffebe9' : '#f6f8fa',
                    borderRadius: 3, margin: '2px 0',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <strong>#{bi + 1}:</strong>{' '}
                    {b.cuts.map((c, ci) => (
                      <span key={ci}>
                        {ci > 0 && ' + '}
                        {c.name} {fmtIn(c.length)}
                      </span>
                    ))}
                    {!b.oversized && scrap > 0.01 && (
                      <span style={{ color: '#6e7781' }}> · {fmtIn(scrap)} scrap</span>
                    )}
                    {b.oversized && (
                      <span style={{ color: '#cf222e' }}> · too long for stock</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 12 }}>All cuts</h2>
      <table className="cutlist">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Piece</th>
            <th>Length</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {cutList.map((p) => (
            <tr key={p.key}>
              <td className="num">{p.count}</td>
              <td>{p.name}</td>
              <td className="num">{fmtIn(p.length)}</td>
              <td>{stockLabel(p.thickness, p.width)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SavePanel({ design, setDesign, setSelected, currentName, setCurrentName }) {
  const [names, setNames] = useState([])
  const [nameInput, setNameInput] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const list = await listDesigns()
      setNames(list)
    } catch (e) {
      setStatus(`Couldn't list designs: ${e.message}`)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    setNameInput(currentName)
  }, [currentName])

  async function doSave() {
    const name = (nameInput || '').trim()
    if (!name) { setStatus('Enter a name first.'); return }
    if (!/^[a-zA-Z0-9 _.\-]+$/.test(name)) {
      setStatus('Use only letters, numbers, spaces, dots, dashes, underscores.')
      return
    }
    setBusy(true); setStatus('')
    try {
      await saveDesign(name, serializeDesign(design))
      setCurrentName(name)
      setStatus(`Saved “${name}”.`)
      await refresh()
    } catch (e) {
      setStatus(`Save failed: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function doLoad(name) {
    setBusy(true); setStatus('')
    try {
      const loaded = await loadDesign(name)
      setDesign(deserializeDesign(loaded, DEFAULT_DESIGN))
      setSelected(null)
      setCurrentName(name)
      setStatus(`Loaded “${name}”.`)
    } catch (e) {
      setStatus(`Load failed: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function doDelete(name) {
    if (!confirm(`Delete “${name}”?`)) return
    setBusy(true); setStatus('')
    try {
      await deleteDesign(name)
      if (currentName === name) setCurrentName('')
      setStatus(`Deleted “${name}”.`)
      await refresh()
    } catch (e) {
      setStatus(`Delete failed: ${e.message}`)
    } finally { setBusy(false) }
  }

  function doNew() {
    if (!confirm('Discard current design and start fresh?')) return
    setDesign(DEFAULT_DESIGN)
    setSelected(null)
    setCurrentName('')
    setNameInput('')
    setStatus('New design.')
  }

  return (
    <div className="panel">
      <h2>Save / Load</h2>
      <div className="panel-row">
        <label>Name</label>
        <input
          type="text" value={nameInput}
          placeholder="e.g. garage-shelf"
          onChange={(e) => setNameInput(e.target.value)}
          style={{ width: 160 }}
        />
      </div>
      <div className="panel-row">
        <span />
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="mode-btn" disabled={busy} onClick={doSave}>Save</button>
          <button className="mode-btn" disabled={busy} onClick={doNew}>New</button>
        </div>
      </div>
      {status && <div className="muted" style={{ marginTop: 4 }}>{status}</div>}

      <div style={{ height: 8 }} />
      <h2>Saved designs</h2>
      {names.length === 0 ? (
        <div className="empty-hint">None yet. Saved files go to <code>./designs/</code>.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {names.map((n) => (
            <li key={n} className="panel-row" style={{ margin: '4px 0' }}>
              <span style={{
                fontWeight: n === currentName ? 600 : 400,
                color: n === currentName ? '#0969da' : 'inherit',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{n}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="mode-btn" disabled={busy} onClick={() => doLoad(n)}>Load</button>
                <button className="danger-btn" disabled={busy} onClick={() => doDelete(n)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function stockLabel(thickness, width) {
  // Guess at dimensional lumber names
  if (Math.abs(thickness - 0.75) < 0.01 && Math.abs(width - 11.25) < 0.01) return '1x12'
  if (Math.abs(thickness - 1.5) < 0.01 && Math.abs(width - 11.25) < 0.01) return '2x12'
  if (Math.abs(thickness - 0.75) < 0.01 && Math.abs(width - 9.25) < 0.01) return '1x10'
  if (Math.abs(thickness - 1.5) < 0.01 && Math.abs(width - 9.25) < 0.01) return '2x10'
  return `${fmtIn(thickness)} × ${fmtIn(width)}`
}
