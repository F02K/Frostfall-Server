'use strict'

const path       = require('path')
const worldStore = require(path.join(__dirname, 'worldStore'))

// ── Types ─────────────────────────────────────────────────────────────────────
// SentenceType: 'fine' | 'release' | 'banish'
// PrisonQueueEntry: { playerId, holdId, arrestedBy, queuedAt }

// ── State ─────────────────────────────────────────────────────────────────────
// In-memory queue, also persisted to world storage

let queue = []

// ── Accessors ─────────────────────────────────────────────────────────────────

function getQueue(mp, holdId) {
  if (holdId) return queue.filter(e => e.holdId === holdId)
  return queue.slice()
}

function isQueued(mp, playerId) {
  return queue.some(e => e.playerId === playerId)
}

// ── Actions ───────────────────────────────────────────────────────────────────

function queueForSentencing(mp, store, bus, playerId, holdId, arrestingOfficerId, notifyId) {
  if (isQueued(mp, playerId)) return false

  const entry = { playerId, holdId, arrestedBy: arrestingOfficerId, queuedAt: Date.now() }
  queue.push(entry)
  _persist(mp)

  const courier = require('./courier')
  const note = courier.createNotification(
    'prisonRequest', playerId, notifyId, holdId,
    { playerId, arrestedBy: arrestingOfficerId }
  )
  courier.sendNotification(mp, store, note)
  bus.dispatch({ type: 'playerArrested', playerId, holdId, arrestedBy: arrestingOfficerId })
  return true
}

function sentencePlayer(mp, store, bus, playerId, jarlId, sentence) {
  const entry = queue.find(e => e.playerId === playerId)
  if (!entry) return false

  const { holdId } = entry
  queue = queue.filter(e => e.playerId !== playerId)
  _persist(mp)

  const player = store.get(playerId)

  if (sentence.type === 'fine') {
    const fineAmount = Math.min(sentence.fineAmount || 0, player ? player.septims : 0)
    if (player && fineAmount > 0) {
      const newSeptims = player.septims - fineAmount
      store.update(playerId, { septims: newSeptims })
      // Clear hold bounty
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
      mp.set(player.actorId, 'ff_bounty', [])
    }
  } else if (sentence.type === 'release') {
    if (player) {
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
    }
  } else if (sentence.type === 'banish') {
    if (player) {
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
      mp.sendCustomPacket(player.actorId, 'playerBanished', { holdId })
    }
  }

  bus.dispatch({ type: 'playerSentenced', playerId, jarlId, holdId, sentence })
  return true
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _persist(mp) {
  worldStore.set('ff_prison_queue', queue)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[prison] Initializing')

  const saved = worldStore.get('ff_prison_queue')
  if (Array.isArray(saved)) queue = saved

  console.log('[prison] Started')
}

module.exports = { getQueue, isQueued, queueForSentencing, sentencePlayer, init }
