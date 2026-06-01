// Snap a value to the nearest multiple of `increment`.
export const snap = (value, increment) => Math.round(value / increment) * increment

// Clamp a value into [min, max].
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

// Format an inch value as a readable string with eighth-inch fractions.
export function fmtIn(n) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const eighths = Math.round(abs * 8)
  const whole = Math.floor(eighths / 8)
  const rem = eighths - whole * 8
  const fracMap = {
    0: '',
    1: '⅛',
    2: '¼',
    3: '⅜',
    4: '½',
    5: '⅝',
    6: '¾',
    7: '⅞',
  }
  if (rem === 0) return `${sign}${whole}"`
  if (whole === 0) return `${sign}${fracMap[rem]}"`
  return `${sign}${whole}${fracMap[rem]}"`
}

// Resolve the effective frame thicknesses, honoring unifiedThickness.
export function resolveThicknesses(design) {
  if (design.unifiedThickness) {
    const t = design.thickness
    return { side: t, top: t, bottom: t }
  }
  return {
    side: design.sideThickness,
    top: design.topThickness,
    bottom: design.bottomThickness,
  }
}

// Effective thickness for a piece (shelf / divider), honoring unifiedThickness.
export function pieceThickness(design, piece) {
  return design.unifiedThickness ? design.thickness : piece.thickness
}

// Derive vertical columns from full-height dividers.
// Returns array of { index, left, right } in interior coordinates (inches from inside-left).
export function getColumns(design) {
  const { side } = resolveThicknesses(design)
  const interiorWidth = design.width - 2 * side
  const fulls = [...design.fullDividers].sort((a, b) => a.x - b.x)
  const cols = []
  let left = 0
  fulls.forEach((d) => {
    cols.push({ left, right: d.x })
    left = d.x + pieceThickness(design, d)
  })
  cols.push({ left, right: interiorWidth })
  return cols.map((c, i) => ({ index: i, ...c }))
}

// Given an interior-x coordinate, find which column it falls in.
export function columnAt(design, x) {
  const cols = getColumns(design)
  for (const c of cols) {
    if (x >= c.left && x <= c.right) return c
  }
  return cols[cols.length - 1]
}

// For a given column and an interior-y (from inside-bottom), find the bay this y sits in.
// Returns { bottom, top } in interior-y coordinates.
// If y falls inside a shelf board, snaps to that shelf's top face (treats it as the upper bay).
export function bayAt(design, columnIndex, y) {
  const { top: tt, bottom: tb } = resolveThicknesses(design)
  const interiorHeight = design.height - tt - tb
  const shelvesInCol = design.shelves
    .filter((s) => s.columnIndex === columnIndex)
    .map((s) => ({ topFace: s.y, bottomFace: s.y - pieceThickness(design, s) }))
    .sort((a, b) => a.topFace - b.topFace)

  for (const s of shelvesInCol) {
    if (y > s.bottomFace && y < s.topFace) { y = s.topFace; break }
  }

  let bottom = 0
  let top = interiorHeight
  for (const s of shelvesInCol) {
    if (s.topFace <= y && s.topFace > bottom) bottom = s.topFace
    if (s.bottomFace >= y && s.bottomFace < top) top = s.bottomFace
  }
  return { bottom, top }
}

// Get the y-anchor for a bay divider. Falls back to legacy bayBottom/bayTop midpoint.
export function bayAnchorY(d) {
  if (typeof d.anchorY === 'number') return d.anchorY
  if (typeof d.bayBottom === 'number' && typeof d.bayTop === 'number') {
    return (d.bayBottom + d.bayTop) / 2
  }
  return 0
}

// Compute cut list, grouping identical boards.
export function computeCutList(design) {
  const { width: W, height: H, depth } = design
  const { side: ts, top: tt, bottom: tb } = resolveThicknesses(design)
  const pieces = []

  if (design.sidesOutside) {
    pieces.push({ name: 'Side', length: H, width: depth, thickness: ts, count: 2 })
    pieces.push({ name: 'Top', length: W - 2 * ts, width: depth, thickness: tt, count: 1 })
    pieces.push({ name: 'Bottom', length: W - 2 * ts, width: depth, thickness: tb, count: 1 })
  } else {
    pieces.push({ name: 'Top', length: W, width: depth, thickness: tt, count: 1 })
    pieces.push({ name: 'Bottom', length: W, width: depth, thickness: tb, count: 1 })
    pieces.push({ name: 'Side', length: H - tt - tb, width: depth, thickness: ts, count: 2 })
  }

  for (const d of design.fullDividers) {
    pieces.push({
      name: 'Divider (full)',
      length: H - tt - tb,
      width: depth,
      thickness: pieceThickness(design, d),
      count: 1,
    })
  }

  const cols = getColumns(design)
  for (const s of design.shelves) {
    const col = cols[s.columnIndex] ?? cols[cols.length - 1]
    pieces.push({
      name: 'Shelf',
      length: col.right - col.left,
      width: depth,
      thickness: pieceThickness(design, s),
      count: 1,
    })
  }

  const cutListCols = cols
  for (const d of design.bayDividers) {
    const col = columnAt(design, d.x + pieceThickness(design, d) / 2)
    const bay = bayAt(design, col.index, bayAnchorY(d))
    const length = bay.top - bay.bottom
    if (length <= 1e-6) continue
    pieces.push({
      name: 'Divider (bay)',
      length,
      width: depth,
      thickness: pieceThickness(design, d),
      count: 1,
    })
  }

  // Group identical (name + length + thickness + width)
  const grouped = []
  for (const p of pieces) {
    const key = `${p.name}|${p.length.toFixed(4)}|${p.thickness}|${p.width}`
    const existing = grouped.find((g) => g.key === key)
    if (existing) existing.count += p.count
    else grouped.push({ ...p, key })
  }
  return grouped
}

let _id = 0
export const nextId = () => ++_id
export function bumpIdsPast(...arrays) {
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue
    for (const it of arr) {
      if (typeof it.id === 'number' && it.id > _id) _id = it.id
    }
  }
}

// First-fit-decreasing bin-packing of cuts onto stock boards, per stock type.
// Returns an array of groups: [{ thickness, width, boards: [{ used, cuts, oversized? }] }, ...].
// Each cut is expanded by its count and tagged with its piece name.
export function computeStockBoards(cutList, stockLengthIn, kerfIn = 0) {
  const groups = {}
  for (const p of cutList) {
    const key = `${p.thickness}|${p.width}`
    if (!groups[key]) {
      groups[key] = { thickness: p.thickness, width: p.width, cuts: [] }
    }
    for (let i = 0; i < p.count; i++) {
      groups[key].cuts.push({ name: p.name, length: p.length })
    }
  }

  const result = []
  for (const g of Object.values(groups)) {
    const cuts = [...g.cuts].sort((a, b) => b.length - a.length)
    const boards = []
    for (const c of cuts) {
      if (c.length > stockLengthIn + 1e-6) {
        boards.push({ used: c.length, cuts: [c], oversized: true })
        continue
      }
      let placed = false
      for (const b of boards) {
        if (b.oversized) continue
        const needed = b.cuts.length === 0 ? c.length : b.used + kerfIn + c.length
        if (needed <= stockLengthIn + 1e-6) {
          b.used = needed
          b.cuts.push(c)
          placed = true
          break
        }
      }
      if (!placed) boards.push({ used: c.length, cuts: [c] })
    }
    result.push({ thickness: g.thickness, width: g.width, boards })
  }
  return result
}

// Compute the open (negative-space) rectangles between boards, per column.
// Returned cells are in interior coordinates:
//   left/right = interior-x (from inside-left)
//   bottom/top = interior-y (from inside-bottom, with bottom < top)
export function computeOpenCells(design) {
  const { top: tt, bottom: tb } = resolveThicknesses(design)
  const interiorHeight = design.height - tt - tb
  const cols = getColumns(design)
  const cells = []

  for (const col of cols) {
    const colShelves = design.shelves
      .filter((s) => s.columnIndex === col.index)
      .sort((a, b) => a.y - b.y)

    // Build the y-bays (gaps in y) for this column.
    const bays = []
    let prevTop = 0
    for (const s of colShelves) {
      const sBottom = s.y - pieceThickness(design, s)
      if (sBottom - prevTop > 1e-6) {
        bays.push({ bottom: prevTop, top: sBottom })
      }
      prevTop = s.y
    }
    if (interiorHeight - prevTop > 1e-6) {
      bays.push({ bottom: prevTop, top: interiorHeight })
    }

    // For each bay, split horizontally by bay-dividers that sit in this column AND this bay.
    for (const bay of bays) {
      const inBay = design.bayDividers
        .filter((d) => {
          if (d.x < col.left - 0.01) return false
          if (d.x + pieceThickness(design, d) > col.right + 0.01) return false
          const ab = bayAt(design, col.index, bayAnchorY(d))
          return Math.abs(ab.bottom - bay.bottom) < 0.01 && Math.abs(ab.top - bay.top) < 0.01
        })
        .sort((a, b) => a.x - b.x)

      let prevX = col.left
      for (const d of inBay) {
        if (d.x - prevX > 1e-6) {
          cells.push({ left: prevX, right: d.x, bottom: bay.bottom, top: bay.top })
        }
        prevX = d.x + pieceThickness(design, d)
      }
      if (col.right - prevX > 1e-6) {
        cells.push({ left: prevX, right: col.right, bottom: bay.bottom, top: bay.top })
      }
    }
  }
  return cells
}
