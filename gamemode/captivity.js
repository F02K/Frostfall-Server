'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000  // 24 hours
const CHECK_INTERVAL_MS = 60 * 1000

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isCaptive(store, playerId) {
  const player = store.get(playerId)
  return player ? player.isCaptive : false
}

function getCaptivityRemainingMs(store, playerId, now) {
  const player = store.get(playerId)
  if (!player || !player.isCaptive || player.captiveAt === null) return 0
  const ts = now || Date.now()
  return Math.max(0, MAX_CAPTIVITY_MS - (ts - player.captiveAt))
}

// ── Actions ───────────────────────────────────────────────────────────────────

function capturePlayer(mp, store, bus, captiveId, captorId) {
  const captive = store.get(captiveId)
  const captor  = store.get(captorId)
  if (!captive) return

  const now = Date.now()
  store.update(captiveId, { isCaptive: true, captiveAt: now })

  const timerInfo = { remainingMs: MAX_CAPTIVITY_MS }
  mp.sendCustomPacket(captive.actorId, 'playerCaptured', timerInfo)
  if (captor) mp.sendCustomPacket(captor.actorId, 'playerCaptured', { captiveId })

  bus.dispatch({ type: 'playerCaptured', captiveId, captorId })
}

function releasePlayer(mp, store, bus, captiveId) {
  const captive = store.get(captiveId)
  if (!captive) return

  store.update(captiveId, { isCaptive: false, captiveAt: null })
  mp.sendCustomPacket(captive.actorId, 'playerReleased', {})
  bus.dispatch({ type: 'playerReleased', captiveId })
}

function checkExpiredCaptivity(mp, store, bus, now) {
  const ts      = now || Date.now()
  const released = []
  for (const player of store.getAll()) {
    if (player.isCaptive && player.captiveAt !== null) {
      if ((ts - player.captiveAt) >= MAX_CAPTIVITY_MS) {
        releasePlayer(mp, store, bus, player.id)
        released.push(player.id)
      }
    }
  }
  return released
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[captivity] Initializing')

  const scheduleTick = () => {
    setTimeout(() => {
      try { checkExpiredCaptivity(mp, store, bus) } catch (err) {
        console.error(`[captivity] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, CHECK_INTERVAL_MS)
  }

  scheduleTick()
  console.log('[captivity] Started')
}

module.exports = { isCaptive, getCaptivityRemainingMs, capturePlayer, releasePlayer, checkExpiredCaptivity, init }
