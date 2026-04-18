'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const STIPEND_RATE        = 50   // Septims per hour
const STIPEND_CAP_HOURS   = 24
const STIPEND_INTERVAL_MIN = 60  // pay every 60 minutes of playtime
const TICK_INTERVAL_MS    = 60 * 1000

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isStipendEligible(stipendPaidHours) {
  return stipendPaidHours < STIPEND_CAP_HOURS
}

function shouldPayStipend(minutesOnline, stipendPaidHours) {
  if (!isStipendEligible(stipendPaidHours)) return false
  return minutesOnline > 0 && minutesOnline % STIPEND_INTERVAL_MIN === 0
}

// ── Actions ───────────────────────────────────────────────────────────────────

function transferGold(mp, store, fromId, toId, amount) {
  if (!amount || amount <= 0) return false
  const from = store.get(fromId)
  const to   = store.get(toId)
  if (!from || !to) return false
  if (from.septims < amount) return false

  const fromGold = from.septims - amount
  const toGold   = to.septims + amount

  store.update(fromId, { septims: fromGold })
  store.update(toId,   { septims: toGold })

  // Sync to inventory gold
  mp.set(from.actorId, 'inv', _setGoldInInventory(mp.get(from.actorId, 'inv'), fromGold))
  mp.set(to.actorId,   'inv', _setGoldInInventory(mp.get(to.actorId,   'inv'), toGold))

  return true
}

// ── Internal ──────────────────────────────────────────────────────────────────

const GOLD_BASE_ID = 0x0000000F

function _getGoldFromInventory(inv) {
  if (!inv || !inv.entries) return 0
  const entry = inv.entries.find(e => e.baseId === GOLD_BASE_ID)
  return entry ? entry.count : 0
}

function _setGoldInInventory(inv, amount) {
  const entries = (inv && inv.entries) ? inv.entries.filter(e => e.baseId !== GOLD_BASE_ID) : []
  if (amount > 0) entries.push({ baseId: GOLD_BASE_ID, count: amount })
  return { entries }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[economy] Initializing')

  const scheduleTick = () => {
    setTimeout(() => {
      try {
        for (const player of store.getAll()) {
          if (shouldPayStipend(player.minutesOnline, player.stipendPaidHours)) {
            const newSeptims = player.septims + STIPEND_RATE
            const newHours   = player.stipendPaidHours + 1
            store.update(player.id, { septims: newSeptims, stipendPaidHours: newHours })
            const inv = mp.get(player.actorId, 'inv')
            mp.set(player.actorId, 'inv', _setGoldInInventory(inv, newSeptims))
            mp.set(player.actorId, 'ff_stipendHours', newHours)
            bus.dispatch({ type: 'stipendTick', playerId: player.id, septims: newSeptims, stipendPaidHours: newHours })
          }
        }
      } catch (err) {
        console.error(`[economy] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, TICK_INTERVAL_MS)
  }

  scheduleTick()
  console.log('[economy] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const inv  = mp.get(player.actorId, 'inv')
  const gold = _getGoldFromInventory(inv)
  store.update(userId, { septims: gold })

  const saved = mp.get(player.actorId, 'ff_stipendHours')
  const hours = (saved !== null && saved !== undefined) ? saved : 0
  store.update(userId, { stipendPaidHours: hours })
}

module.exports = { isStipendEligible, shouldPayStipend, transferGold, onConnect, init }
