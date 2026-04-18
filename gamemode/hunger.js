'use strict'

const { safeGet, safeSet } = require('./mpUtil')

// ── Constants ─────────────────────────────────────────────────────────────────
const HUNGER_MIN           = 0
const HUNGER_MAX           = 10
const DRAIN_INTERVAL_MIN   = 30   // drain 1 level every 30 minutes of playtime
const TICK_INTERVAL_MS     = 60 * 1000

// ── Pure helpers ──────────────────────────────────────────────────────────────

function calcNewHunger(current, delta) {
  return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta))
}

function shouldDrainHunger(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % DRAIN_INTERVAL_MIN === 0
}

// ── Actions ───────────────────────────────────────────────────────────────────

function feedPlayer(mp, store, bus, playerId, levels) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return -1
  const newLevel = calcNewHunger(player.hungerLevel, levels)
  store.update(playerId, { hungerLevel: newLevel })
  safeSet(mp, player.actorId, 'ff_hunger', newLevel)
  bus.dispatch({ type: 'hungerTick', playerId, hungerLevel: newLevel })
  return newLevel
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[hunger] Initializing')

  mp.makeProperty('ff_hunger', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: `
      (() => {
        const h = ctx.value;
        if (h === null || h === undefined) return;
        if (h <= 2) return { healthRegenMult: 0.7 };
        if (h >= 10) return { staminaRegenMult: 1.4 };
        return {};
      })()
    `,
    updateNeighbor: '',
  })

  const scheduleTick = () => {
    setTimeout(() => {
      try {
        for (const player of store.getAll()) {
          store.update(player.id, { minutesOnline: player.minutesOnline + 1 })
          const updated = store.get(player.id)
          if (shouldDrainHunger(updated.minutesOnline) && updated.actorId) {
            const newLevel = calcNewHunger(updated.hungerLevel, -1)
            store.update(player.id, { hungerLevel: newLevel })
            safeSet(mp, updated.actorId, 'ff_hunger', newLevel)
            bus.dispatch({ type: 'hungerTick', playerId: player.id, hungerLevel: newLevel })
          }
        }
      } catch (err) {
        console.error(`[hunger] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, TICK_INTERVAL_MS)
  }

  scheduleTick()
  console.log('[hunger] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const level = safeGet(mp, player.actorId, 'ff_hunger', HUNGER_MAX)
  store.update(userId, { hungerLevel: level })
}

module.exports = { calcNewHunger, shouldDrainHunger, feedPlayer, onConnect, init }
