// Tiny client for the designs API exposed by the Vite dev plugin.

import { nextId, bumpIdsPast } from './utils.js'

const BASE = '/api/designs'

export async function listDesigns() {
  const r = await fetch(BASE)
  if (!r.ok) throw new Error('list failed')
  return r.json()
}

export async function loadDesign(name) {
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}`)
  if (!r.ok) throw new Error('load failed')
  return r.json()
}

export async function saveDesign(name, design) {
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(design, null, 2),
  })
  if (!r.ok) throw new Error('save failed')
  return r.json()
}

export async function deleteDesign(name) {
  const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('delete failed')
  return r.json()
}

// Strip UI-only fields from the design before saving.
export function serializeDesign(design) {
  const { mode: _mode, ...rest } = design
  return { version: 1, ...rest }
}

// Apply defaults and version-tolerance when loading.
export function deserializeDesign(loaded, fallback) {
  const d = { ...fallback, ...loaded, mode: 'select' }

  // Bay dividers: migrate legacy bayBottom/bayTop → anchorY; strip the legacy fields.
  d.bayDividers = (d.bayDividers || []).map((bd) => {
    const anchorY = typeof bd.anchorY === 'number'
      ? bd.anchorY
      : (typeof bd.bayBottom === 'number' && typeof bd.bayTop === 'number'
          ? (bd.bayBottom + bd.bayTop) / 2
          : 0)
    return { id: bd.id, x: bd.x, thickness: bd.thickness, anchorY }
  })
  d.shelves = d.shelves || []
  d.fullDividers = d.fullDividers || []

  // Bump the id counter past any loaded ids first, then reassign duplicates.
  bumpIdsPast(d.shelves, d.fullDividers, d.bayDividers)
  const seen = new Set()
  const dedupe = (items) => items.map((it) => {
    if (it.id == null || seen.has(it.id)) return { ...it, id: nextId() }
    seen.add(it.id)
    return it
  })
  d.shelves = dedupe(d.shelves)
  d.fullDividers = dedupe(d.fullDividers)
  d.bayDividers = dedupe(d.bayDividers)

  return d
}
