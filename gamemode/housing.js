'use strict'

const path       = require('path')
const worldStore = require(path.join(__dirname, 'worldStore'))

// ── Property Registry ─────────────────────────────────────────────────────────
// 16 properties across 9 holds. propertyId is the stable key used everywhere.

const PROPERTY_REGISTRY = [
  // Whiterun
  { id: 'wrun_breezehome',   name: 'Breezehome',          holdId: 'whiterun',   type: 'home' },
  { id: 'wrun_breezeannex',  name: 'Breezehome Annex',    holdId: 'whiterun',   type: 'business' },
  // Eastmarch
  { id: 'east_hjerim',       name: 'Hjerim',              holdId: 'eastmarch',  type: 'home' },
  { id: 'east_windhelm_shop',name: 'Windhelm Market Stall',holdId: 'eastmarch', type: 'business' },
  // Rift
  { id: 'rift_honeyside',    name: 'Honeyside',           holdId: 'rift',       type: 'home' },
  { id: 'rift_riften_shop',  name: 'Riften Stall',        holdId: 'rift',       type: 'business' },
  // Reach
  { id: 'reach_vlindrel',    name: 'Vlindrel Hall',       holdId: 'reach',      type: 'home' },
  { id: 'reach_markarth_shop','name': 'Markarth Stall',   holdId: 'reach',      type: 'business' },
  // Haafingar
  { id: 'haaf_proudspire',   name: 'Proudspire Manor',    holdId: 'haafingar',  type: 'home' },
  { id: 'haaf_solitude_shop','name': 'Solitude Market',   holdId: 'haafingar',  type: 'business' },
  // Pale
  { id: 'pale_dawnstar_home','name': 'Dawnstar Cottage',  holdId: 'pale',       type: 'home' },
  { id: 'pale_dawnstar_shop','name': 'Dawnstar Stall',    holdId: 'pale',       type: 'business' },
  // Falkreath
  { id: 'falk_lakeview',     name: 'Lakeview Manor',      holdId: 'falkreath',  type: 'home' },
  { id: 'falk_falkreath_shop','name': 'Falkreath Stall',  holdId: 'falkreath',  type: 'business' },
  // Hjaalmarch
  { id: 'hjaal_windstad',    name: 'Windstad Manor',      holdId: 'hjaalmarch', type: 'home' },
  // Winterhold
  { id: 'wint_college_quarters','name': 'College Quarters',holdId: 'winterhold',type: 'home' },
]

// ── Runtime state ─────────────────────────────────────────────────────────────
// properties Map: propertyId → { ownerId: null|userId, pendingOwnerId: null|userId }

const properties = new Map()

function _loadRegistry() {
  for (const def of PROPERTY_REGISTRY) {
    if (!properties.has(def.id)) {
      properties.set(def.id, { ownerId: null, pendingOwnerId: null })
    }
  }
}

// ── Pure lookups ──────────────────────────────────────────────────────────────

function getProperty(id) {
  const def   = PROPERTY_REGISTRY.find(p => p.id === id)
  const state = properties.get(id)
  if (!def || !state) return null
  return Object.assign({}, def, state)
}

function getPropertiesByHold(holdId) {
  return PROPERTY_REGISTRY
    .filter(p => p.holdId === holdId)
    .map(p => getProperty(p.id))
}

function getOwnedProperties(playerId) {
  return PROPERTY_REGISTRY
    .map(p => getProperty(p.id))
    .filter(p => p && p.ownerId === playerId)
}

function isAvailable(propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  return state.ownerId === null && state.pendingOwnerId === null
}

// ── Actions ───────────────────────────────────────────────────────────────────

function requestProperty(mp, store, bus, playerId, propertyId, stewardId) {
  if (!isAvailable(propertyId)) return false
  const courier = require('./courier')
  properties.get(propertyId).pendingOwnerId = playerId
  _persist(mp)
  const note = courier.createNotification(
    'propertyRequest', playerId, stewardId, null,
    { propertyId, requesterName: store.get(playerId) ? store.get(playerId).name : String(playerId) }
  )
  courier.sendNotification(mp, store, note)
  bus.dispatch({ type: 'propertyRequested', playerId, propertyId })
  return true
}

function approveProperty(mp, store, bus, propertyId, approverId) {
  const state = properties.get(propertyId)
  if (!state || state.pendingOwnerId === null) return false
  const newOwnerId = state.pendingOwnerId
  state.ownerId        = newOwnerId
  state.pendingOwnerId = null
  _persist(mp)

  const player = store.get(newOwnerId)
  if (player) {
    const owned = store.get(newOwnerId).properties.concat([propertyId])
    store.update(newOwnerId, { properties: owned })
    mp.sendCustomPacket(player.actorId, 'propertyApproved', { propertyId })
  }
  bus.dispatch({ type: 'propertyApproved', propertyId, newOwnerId, approvedBy: approverId })
  return true
}

function denyProperty(mp, propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  state.pendingOwnerId = null
  _persist(mp)
  return true
}

function revokeProperty(mp, store, propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  const prevOwner = state.ownerId
  state.ownerId        = null
  state.pendingOwnerId = null
  _persist(mp)
  if (prevOwner !== null) {
    const player = store.get(prevOwner)
    if (player) {
      const owned = player.properties.filter(id => id !== propertyId)
      store.update(prevOwner, { properties: owned })
    }
  }
  return true
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _persist(mp) {
  const data = []
  for (const [id, state] of properties) {
    data.push({ id, ownerId: state.ownerId, pendingOwnerId: state.pendingOwnerId })
  }
  worldStore.set('ff_properties', data)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[housing] Initializing')
  _loadRegistry()

  // Restore persisted state
  const saved = worldStore.get('ff_properties')
  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (properties.has(entry.id)) {
        properties.get(entry.id).ownerId        = entry.ownerId
        properties.get(entry.id).pendingOwnerId = entry.pendingOwnerId
      }
    }
  }

  console.log('[housing] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const owned = getOwnedProperties(userId).map(p => p.id)
  store.update(userId, { properties: owned })
  if (player.holdId) {
    const list = getPropertiesByHold(player.holdId)
    mp.sendCustomPacket(player.actorId, 'propertyList', { properties: list })
  }
}

module.exports = {
  getProperty, getPropertiesByHold, getOwnedProperties, isAvailable,
  requestProperty, approveProperty, denyProperty, revokeProperty,
  onConnect, init,
}
