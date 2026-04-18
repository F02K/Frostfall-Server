'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

// ── Pure helpers ──────────────────────────────────────────────────────────────

let _nextId = 1

function createNotification(type, fromPlayerId, toPlayerId, holdId, payload, now) {
  const ts = now || Date.now()
  return {
    id:           _nextId++,
    type,           // 'propertyRequest' | 'prisonRequest' | 'bountyReport' | 'holdMessage'
    fromPlayerId,
    toPlayerId,
    holdId,
    payload,
    createdAt:    ts,
    expiresAt:    ts + DEFAULT_EXPIRY_MS,
    read:         false,
  }
}

function filterExpired(notifications, now) {
  const ts = now || Date.now()
  return notifications.filter(n => n.expiresAt === null || ts < n.expiresAt)
}

function getUnread(notifications) {
  return notifications.filter(n => !n.read)
}

// ── Actions ───────────────────────────────────────────────────────────────────

function sendNotification(mp, store, notification) {
  const recipient = store.get(notification.toPlayerId)
  if (!recipient) return

  // Persist to recipient's actor storage
  const existing = mp.get(recipient.actorId, 'ff_courier') || []
  const pruned   = filterExpired(existing)
  pruned.push(notification)
  mp.set(recipient.actorId, 'ff_courier', pruned)

  // Deliver immediately if online
  mp.sendCustomPacket(recipient.actorId, 'courierNotification', notification)
}

function markRead(mp, store, playerId, notificationId) {
  const player = store.get(playerId)
  if (!player) return
  const notes = mp.get(player.actorId, 'ff_courier') || []
  const updated = notes.map(n => n.id === notificationId ? Object.assign({}, n, { read: true }) : n)
  mp.set(player.actorId, 'ff_courier', updated)
}

function getPendingNotifications(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return []
  const notes = mp.get(player.actorId, 'ff_courier') || []
  return getUnread(filterExpired(notes))
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[courier] Initializing')

  console.log('[courier] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const notes   = mp.get(player.actorId, 'ff_courier') || []
  const pending = getUnread(filterExpired(notes))
  for (const n of pending) {
    mp.sendCustomPacket(player.actorId, 'courierNotification', n)
  }
}

module.exports = { createNotification, filterExpired, getUnread, sendNotification, markRead, getPendingNotifications, onConnect, init }
