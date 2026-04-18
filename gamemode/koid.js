'use strict'

// ── KOID Table ────────────────────────────────────────────────────────────────
// Kill-On-Identification: which faction pairs have mutual lethal-force permission.
// This is a reference table only — it does not enforce anything on its own.

const KOID_PAIRS = [
  { factionA: 'thalmor',          factionB: 'stormcloakUnderground', reason: 'Standing Justiciar orders' },
  { factionA: 'imperialGarrison', factionB: 'stormcloakUnderground', reason: 'Active conflict' },
  { factionA: 'guard',            factionB: 'highBounty',            reason: 'Wanted criminal threshold' },
]

function hasKoidPermission(factionA, factionB) {
  return KOID_PAIRS.some(p =>
    (p.factionA === factionA && p.factionB === factionB) ||
    (p.factionA === factionB && p.factionB === factionA)
  )
}

function getKoidPair(factionA, factionB) {
  return KOID_PAIRS.find(p =>
    (p.factionA === factionA && p.factionB === factionB) ||
    (p.factionA === factionB && p.factionB === factionA)
  ) || null
}

function getKoidTargeters(faction) {
  const result = []
  for (const p of KOID_PAIRS) {
    if (p.factionA === faction) result.push(p.factionB)
    if (p.factionB === faction) result.push(p.factionA)
  }
  return result
}

module.exports = { hasKoidPermission, getKoidPair, getKoidTargeters }
