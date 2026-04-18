'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const LOOT_CAP_GOLD  = 500
const LOOT_CAP_ITEMS = 3

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isDowned(store, playerId) {
  const player = store.get(playerId)
  return player ? player.isDown : false
}

// ── Actions ───────────────────────────────────────────────────────────────────

function downPlayer(mp, store, bus, victimId, attackerId) {
  const victim   = store.get(victimId)
  const attacker = store.get(attackerId)
  if (!victim) return

  store.update(victimId, { isDown: true, downedAt: Date.now() })

  const lootInfo = { lootCapGold: LOOT_CAP_GOLD, lootCapItems: LOOT_CAP_ITEMS }
  mp.sendCustomPacket(victim.actorId, 'playerDowned', lootInfo)
  if (attacker) mp.sendCustomPacket(attacker.actorId, 'playerDowned', lootInfo)

  bus.dispatch({
    type:      'playerDowned',
    victimId,
    attackerId,
    holdId:    victim.holdId,
  })
}

function risePlayer(mp, store, bus, playerId) {
  const player = store.get(playerId)
  if (!player) return

  // Preserve downedAt for NVFL — only clear isDown
  store.update(playerId, { isDown: false })

  mp.sendCustomPacket(player.actorId, 'playerRisen', {})
  bus.dispatch({ type: 'playerRisen', playerId })
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[combat] Initializing')
  // No ticks or makeProperty needed — downPlayer/risePlayer are called externally
  console.log('[combat] Started')
}

module.exports = { isDowned, downPlayer, risePlayer, init }
