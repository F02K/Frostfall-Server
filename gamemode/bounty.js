'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const GUARD_KOID_THRESHOLD = 1000  // Septims; guard gets KOID at or above this

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getBounty(mp, store, playerId, holdId) {
  const player = store.get(playerId)
  if (!player) return 0
  return (player.bounty[holdId] || 0)
}

function getAllBounties(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return {}
  return Object.assign({}, player.bounty)
}

function isGuardKoid(mp, store, playerId, holdId) {
  return getBounty(mp, store, playerId, holdId) >= GUARD_KOID_THRESHOLD
}

// ── Actions ───────────────────────────────────────────────────────────────────

function addBounty(mp, store, bus, playerId, holdId, amount) {
  const player = store.get(playerId)
  if (!player) return
  const current = player.bounty[holdId] || 0
  const newAmount = current + amount
  const newBounty = Object.assign({}, player.bounty, { [holdId]: newAmount })
  store.update(playerId, { bounty: newBounty })
  _persist(mp, player.actorId, newBounty)
  mp.sendCustomPacket(player.actorId, 'bountyChanged', { holdId, amount: newAmount })
  bus.dispatch({ type: 'bountyChanged', playerId, holdId, newAmount, delta: amount })
}

function clearBounty(mp, store, bus, playerId, holdId) {
  const player = store.get(playerId)
  if (!player) return
  const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
  store.update(playerId, { bounty: newBounty })
  _persist(mp, player.actorId, newBounty)
  mp.sendCustomPacket(player.actorId, 'bountyChanged', { holdId, amount: 0 })
  bus.dispatch({ type: 'bountyChanged', playerId, holdId, newAmount: 0, delta: -(player.bounty[holdId] || 0) })
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _persist(mp, actorId, bountyMap) {
  const records = Object.entries(bountyMap)
    .filter(([, amount]) => amount > 0)
    .map(([holdId, amount]) => ({ holdId, amount, updatedAt: Date.now() }))
  mp.set(actorId, 'ff_bounty', records)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[bounty] Initializing')

  console.log('[bounty] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const records = mp.get(player.actorId, 'ff_bounty') || []
  const bountyMap = {}
  for (const r of records) bountyMap[r.holdId] = r.amount
  store.update(userId, { bounty: bountyMap })
}

module.exports = { getBounty, getAllBounties, isGuardKoid, addBounty, clearBounty, onConnect, init }
