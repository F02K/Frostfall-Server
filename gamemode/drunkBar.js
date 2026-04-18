'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const DRUNK_MIN          = 0
const DRUNK_MAX          = 10
const SOBER_INTERVAL_MIN = 5    // sober tick every 5 minutes of playtime
const TICK_INTERVAL_MS   = 60 * 1000

// baseId → alcohol strength (1–3)
// FormIDs verified against skyrim-esm-references/potions.json
const ALCOHOL_STRENGTHS = {
  0x0003133B: 1, // Alto Wine          edid: FoodWineAlto
  0x000C5349: 1, // Alto Wine (var.)   edid: FoodWineAltoA
  0x0003133C: 1, // Wine               edid: FoodWineBottle02
  0x000C5348: 1, // Wine (var.)        edid: FoodWineBottle02A
  0x00034C5D: 2, // Nord Mead          edid: FoodMead
  0x0002C35A: 2, // Black-Briar Mead   edid: FoodBlackBriarMead
  0x000508CA: 2, // Honningbrew Mead   edid: FoodHonningbrewMead
  0x000F693F: 3, // Black-Briar Reserve edid: FoodBlackBriarMeadPrivateReserve
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function calcNewDrunkLevel(current, delta) {
  return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta))
}

function shouldSober(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % SOBER_INTERVAL_MIN === 0
}

function getAlcoholStrength(baseId) {
  return ALCOHOL_STRENGTHS[baseId] || 0
}

// ── Actions ───────────────────────────────────────────────────────────────────

function drinkAlcohol(mp, store, bus, playerId, baseId) {
  const player = store.get(playerId)
  if (!player) return
  const strength = getAlcoholStrength(baseId)
  if (!strength) return
  const newLevel = calcNewDrunkLevel(player.drunkLevel, strength)
  store.update(playerId, { drunkLevel: newLevel })
  mp.set(player.actorId, 'ff_drunk', newLevel)
  bus.dispatch({ type: 'drunkChanged', playerId, drunkLevel: newLevel })
}

function soberPlayer(mp, store, bus, playerId) {
  const player = store.get(playerId)
  if (!player) return
  store.update(playerId, { drunkLevel: 0 })
  mp.set(player.actorId, 'ff_drunk', 0)
  bus.dispatch({ type: 'drunkChanged', playerId, drunkLevel: 0 })
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[drunkBar] Initializing')

  mp.makeProperty('ff_drunk', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: `
      (() => {
        const d = ctx.value;
        if (d === null || d === undefined) return;
        if (d >= 8) return { weaponSpeedMult: 0.6 };
        if (d >= 5) return { weaponSpeedMult: 0.8 };
        return {};
      })()
    `,
    updateNeighbor: '',
  })

  const scheduleTick = () => {
    setTimeout(() => {
      try {
        for (const player of store.getAll()) {
          if (shouldSober(player.minutesOnline)) {
            if (player.drunkLevel > 0) {
              const newLevel = calcNewDrunkLevel(player.drunkLevel, -1)
              store.update(player.id, { drunkLevel: newLevel })
              mp.set(player.actorId, 'ff_drunk', newLevel)
              bus.dispatch({ type: 'drunkChanged', playerId: player.id, drunkLevel: newLevel })
            }
          }
        }
      } catch (err) {
        console.error(`[drunkBar] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, TICK_INTERVAL_MS)
  }

  scheduleTick()
  console.log('[drunkBar] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const saved = mp.get(player.actorId, 'ff_drunk')
  const level = (saved !== null && saved !== undefined) ? saved : 0
  store.update(userId, { drunkLevel: level })
}

module.exports = { calcNewDrunkLevel, shouldSober, getAlcoholStrength, drinkAlcohol, soberPlayer, onConnect, init }
