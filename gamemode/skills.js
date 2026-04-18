'use strict'

const { safeGet } = require('./mpUtil')

// ── Constants ─────────────────────────────────────────────────────────────────
const SKILL_LEVEL_XP  = 10
const DEFAULT_CAP_XP  = 250  // ~level 25

const SKILL_IDS = [
  'destruction', 'restoration', 'alteration', 'conjuration', 'illusion',
  'smithing', 'enchanting', 'alchemy',
]

// Faction cap bonuses: { factionId, minRank, skills, cap }
const FACTION_CAPS = [
  { factionId: 'collegeOfWinterhold', minRank: 1, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: 500 },
  { factionId: 'collegeOfWinterhold', minRank: 2, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: 750 },
  { factionId: 'collegeOfWinterhold', minRank: 3, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: 1000 },
  { factionId: 'companions',          minRank: 1, skills: ['smithing'], cap: 500 },
  { factionId: 'companions',          minRank: 2, skills: ['smithing'], cap: 750 },
  { factionId: 'companions',          minRank: 3, skills: ['smithing'], cap: 1000 },
  { factionId: 'eastEmpireCompany',   minRank: 1, skills: ['smithing','enchanting','alchemy'], cap: 500 },
  { factionId: 'eastEmpireCompany',   minRank: 2, skills: ['smithing','enchanting','alchemy'], cap: 750 },
  { factionId: 'thievesGuild',        minRank: 1, skills: ['alchemy'], cap: 500 },
  { factionId: 'thievesGuild',        minRank: 2, skills: ['alchemy'], cap: 750 },
  { factionId: 'bardsCollege',        minRank: 1, skills: ['enchanting'], cap: 500 },
  { factionId: 'bardsCollege',        minRank: 2, skills: ['enchanting'], cap: 750 },
]

// ── In-memory session tracking ─────────────────────────────────────────────────
// userId → session start timestamp (wall clock)
const sessionStart = new Map()

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getSkillLevel(xp) {
  return Math.floor(xp / SKILL_LEVEL_XP)
}

function getSkillXp(mp, playerId, skillId) {
  const xpMap = mp.get(_actorForPlayer(mp, playerId), 'ff_skill_xp') || {}
  return xpMap[skillId] || 0
}

function getSkillCap(mp, store, playerId, skillId) {
  const factions = require('./factions')
  let cap = DEFAULT_CAP_XP
  for (const rule of FACTION_CAPS) {
    if (!rule.skills.includes(skillId)) continue
    const rank = factions.getPlayerFactionRank(mp, store, playerId, rule.factionId)
    if (rank !== null && rank >= rule.minRank && rule.cap > cap) {
      cap = rule.cap
    }
  }
  return cap
}

// ── Actions ───────────────────────────────────────────────────────────────────

function addSkillXp(mp, store, playerId, skillId, baseXp, now) {
  const player  = store.get(playerId)
  if (!player) return 0
  const cap     = getSkillCap(mp, store, playerId, skillId)
  const current = getSkillXp(mp, playerId, skillId)
  if (current >= cap) return 0

  // Apply any active study boost
  let multiplier = 1
  const boost = getActiveStudyBoost(mp, playerId, skillId, now)
  if (boost) multiplier = boost.multiplier

  const gain     = Math.round(baseXp * multiplier)
  const newXp    = Math.min(current + gain, cap)
  const actual   = newXp - current

  const xpMap = mp.get(player.actorId, 'ff_skill_xp') || {}
  xpMap[skillId] = newXp
  mp.set(player.actorId, 'ff_skill_xp', xpMap)
  return actual
}

function grantStudyBoost(mp, playerId, skillId, multiplier, onlineMs) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs, sessionStart: Date.now() })
  mp.set(actorId, 'ff_study_boosts', boosts)
}

function getActiveStudyBoost(mp, playerId, skillId, now) {
  _consumeBoostTime(mp, playerId, now)
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  return boosts.find(b => b.skillId === skillId && b.remainingOnlineMs > 0) || null
}

function getStudyBoosts(mp, playerId) {
  const actorId = _actorForPlayer(mp, playerId)
  return mp.get(actorId, 'ff_study_boosts') || []
}

// ── Internal ──────────────────────────────────────────────────────────────────

// Drain elapsed online time from all boosts for this player
function _consumeBoostTime(mp, playerId, now) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  const start   = sessionStart.get(playerId)
  if (!start) return
  const elapsed = (now || Date.now()) - start
  const updated = boosts
    .map(b => Object.assign({}, b, { remainingOnlineMs: Math.max(0, b.remainingOnlineMs - elapsed) }))
    .filter(b => b.remainingOnlineMs > 0)
  sessionStart.set(playerId, now || Date.now())
  mp.set(actorId, 'ff_study_boosts', updated)
}

function onSkillPlayerDisconnect(mp, playerId, now) {
  _consumeBoostTime(mp, playerId, now)
  sessionStart.delete(playerId)
}

function _actorForPlayer(mp, playerId) {
  try { return mp.getUserActor(playerId) } catch { return null }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[skills] Initializing')

  mp.makeProperty('ff_skill_xp', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty('ff_study_boosts', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  console.log('[skills] Started')
}

function onConnect(mp, store, bus, userId) {
  sessionStart.set(userId, Date.now())
  const player = store.get(userId)
  if (!player || !player.actorId) return
  const xpMap = safeGet(mp, player.actorId, 'ff_skill_xp', {})
  mp.sendCustomPacket(player.actorId, 'skillsSync', { xpMap })
}

module.exports = {
  SKILL_IDS, getSkillLevel, getSkillXp, getSkillCap,
  addSkillXp, grantStudyBoost, getActiveStudyBoost, getStudyBoosts,
  onSkillPlayerDisconnect, onConnect,
  init,
}
