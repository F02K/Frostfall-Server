'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const NVFL_WINDOW_MS = 24 * 60 * 60 * 1000  // 24 hours

// ── Pure functions ────────────────────────────────────────────────────────────
// No mp calls, no side effects. downedAt in PlayerStore is the source of truth.

function isNvflRestricted(store, playerId, now) {
  const player = store.get(playerId)
  if (!player || player.downedAt === null) return false
  const ts = now || Date.now()
  return (ts - player.downedAt) < NVFL_WINDOW_MS
}

function getNvflRemainingMs(store, playerId, now) {
  const player = store.get(playerId)
  if (!player || player.downedAt === null) return 0
  const ts      = now || Date.now()
  const elapsed = ts - player.downedAt
  return Math.max(0, NVFL_WINDOW_MS - elapsed)
}

function clearNvfl(store, playerId) {
  const player = store.get(playerId)
  if (!player) return
  store.update(playerId, { downedAt: null })
}

module.exports = { isNvflRestricted, getNvflRemainingMs, clearNvfl }
