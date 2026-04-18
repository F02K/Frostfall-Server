'use strict'

// ── Player Store ──────────────────────────────────────────────────────────────
// In-memory state for all connected players, keyed by SkyMP userId.
// Cleared on disconnect — persistent data lives in mp.set / mp.get.

const players = new Map()

function defaultState(id, actorId, name) {
  return {
    id,
    actorId,
    name,
    holdId:           null,
    factions:         [],
    bounty:           {},
    isDown:           false,
    isCaptive:        false,
    downedAt:         null,
    captiveAt:        null,
    properties:       [],
    hungerLevel:      10,
    drunkLevel:       0,
    septims:          0,
    stipendPaidHours: 0,
    minutesOnline:    0,
    isStaff:          false,
    isLeader:         false,
  }
}

function register(id, actorId, name) {
  players.set(id, defaultState(id, actorId, name))
}

function deregister(id) {
  players.delete(id)
}

function get(id) {
  return players.get(id) || null
}

function getAll() {
  return Array.from(players.values())
}

function update(id, patch) {
  const player = players.get(id)
  if (!player) throw new Error(`store.update: unknown player ${id}`)
  Object.assign(player, patch)
}

module.exports = { register, deregister, get, getAll, update }
