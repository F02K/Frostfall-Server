'use strict'

const worldStore = require('./worldStore')

// ── Hold Treasury ─────────────────────────────────────────────────────────────
// Per-hold gold ledger. Persisted to world/ff-world-data.json via worldStore.
// Sources: shop taxes, property purchases, sentencing fines.
// Withdrawals: Jarl / Steward via /treasury withdraw.

const ALL_HOLDS = [
  'whiterun', 'eastmarch', 'rift', 'reach', 'haafingar',
  'pale', 'falkreath', 'hjaalmarch', 'winterhold',
]

const TREASURY_KEY = 'ff_treasury'

function _load() {
  const saved = worldStore.get(TREASURY_KEY)
  const data  = (saved && typeof saved === 'object') ? saved : {}
  // Ensure every hold has an entry
  for (const h of ALL_HOLDS) {
    if (typeof data[h] !== 'number') data[h] = 0
  }
  return data
}

function _save(data) {
  worldStore.set(TREASURY_KEY, data)
}

// ── Public API ────────────────────────────────────────────────────────────────

function getBalance(holdId) {
  return _load()[holdId] || 0
}

function getAllBalances() {
  return _load()
}

function deposit(bus, holdId, amount) {
  const data    = _load()
  data[holdId]  = (data[holdId] || 0) + amount
  _save(data)
  if (bus) bus.dispatch({ type: 'treasuryChanged', holdId, delta: amount, newBalance: data[holdId] })
  console.log(`[treasury] ${holdId} +${amount} → ${data[holdId]}`)
}

function withdraw(bus, holdId, amount) {
  const data = _load()
  if ((data[holdId] || 0) < amount) return false
  data[holdId] -= amount
  _save(data)
  if (bus) bus.dispatch({ type: 'treasuryChanged', holdId, delta: -amount, newBalance: data[holdId] })
  console.log(`[treasury] ${holdId} -${amount} → ${data[holdId]}`)
  return true
}

function init(mp, store, bus) {
  console.log('[treasury] Initialized')
}

module.exports = { getBalance, getAllBalances, deposit, withdraw, ALL_HOLDS, init }
