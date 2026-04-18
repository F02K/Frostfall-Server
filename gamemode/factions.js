'use strict'

const path       = require('path')
const worldStore = require(path.join(__dirname, 'worldStore'))
const { safeGet, safeSet } = require('./mpUtil')

// ── Actions ───────────────────────────────────────────────────────────────────

function getFactionDocument(mp, factionId) {
  const docs = worldStore.get('ff_faction_docs') || {}
  return docs[factionId] || null
}

function setFactionDocument(mp, doc) {
  const docs = worldStore.get('ff_faction_docs') || {}
  docs[doc.factionId] = Object.assign({}, doc, { updatedAt: Date.now() })
  worldStore.set('ff_faction_docs', docs)
}

function joinFaction(mp, store, bus, playerId, factionId, rank) {
  const player = store.get(playerId)
  if (!player) return false

  const joinRank  = (rank !== undefined && rank !== null) ? rank : 0
  const memberships = _getMemberships(mp, player.actorId)
  const existing    = memberships.findIndex(m => m.factionId === factionId)

  if (existing >= 0) {
    memberships[existing].rank = joinRank
  } else {
    memberships.push({ factionId, rank: joinRank, joinedAt: Date.now() })
  }

  _saveMemberships(mp, player.actorId, memberships)

  // Sync factions list in store
  const factionIds = memberships.map(m => m.factionId)
  store.update(playerId, { factions: factionIds })

  bus.dispatch({ type: 'factionJoined', playerId, factionId, rank: joinRank })
  return true
}

function leaveFaction(mp, store, bus, playerId, factionId) {
  const player = store.get(playerId)
  if (!player) return false

  const memberships = _getMemberships(mp, player.actorId)
  const filtered    = memberships.filter(m => m.factionId !== factionId)
  _saveMemberships(mp, player.actorId, filtered)

  const factionIds = filtered.map(m => m.factionId)
  store.update(playerId, { factions: factionIds })

  bus.dispatch({ type: 'factionLeft', playerId, factionId })
  return true
}

function isFactionMember(mp, store, playerId, factionId) {
  const player = store.get(playerId)
  if (!player) return false
  return player.factions.includes(factionId)
}

function getPlayerFactionRank(mp, store, playerId, factionId) {
  const player = store.get(playerId)
  if (!player) return null
  const memberships = _getMemberships(mp, player.actorId)
  const m = memberships.find(m => m.factionId === factionId)
  return m ? m.rank : null
}

function getPlayerMemberships(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return []
  return _getMemberships(mp, player.actorId)
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _getMemberships(mp, actorId) {
  return safeGet(mp, actorId, 'ff_memberships', [])
}

function _saveMemberships(mp, actorId, memberships) {
  safeSet(mp, actorId, 'ff_memberships', memberships)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[factions] Initializing')

  console.log('[factions] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player || !player.actorId) return
  const memberships = _getMemberships(mp, player.actorId)
  const factionIds  = memberships.map(m => m.factionId)
  store.update(userId, { factions: factionIds })
  mp.sendCustomPacket(player.actorId, 'factionsSync', { memberships })
}

module.exports = {
  getFactionDocument, setFactionDocument,
  joinFaction, leaveFaction, isFactionMember,
  getPlayerFactionRank, getPlayerMemberships,
  onConnect, init,
}
