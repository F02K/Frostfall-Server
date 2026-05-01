'use strict'

// ── Role Persistence ──────────────────────────────────────────────────────────
// Persists isStaff / isLeader across reconnects via mp.set on the actor.
// On connect: reads stored role and restores the booleans into the store.
// On /role set: writes to mp.set so it survives restarts.

const ROLE_KEY = 'ff_role'

function getRole(mp, actorId) {
  return mp.get(actorId, ROLE_KEY) || 'player'
}

function setRole(mp, store, bus, userId, role) {
  const player = store.get(userId)
  if (!player) return false
  if (!['player', 'leader', 'staff'].includes(role)) return false
  mp.set(player.actorId, ROLE_KEY, role)
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
  bus.dispatch({ type: 'roleChanged', targetId: userId, role })
  console.log(`[permissions] ${player.name} role set to ${role}`)
  return true
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const role = getRole(mp, player.actorId)
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
}

function init(mp, store, bus) {
  console.log('[permissions] Initialized')
}

module.exports = { getRole, setRole, onConnect, init }
