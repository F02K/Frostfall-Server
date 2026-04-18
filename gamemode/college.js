'use strict'

const { safeGet } = require('./mpUtil')

// ── Constants ─────────────────────────────────────────────────────────────────
const RANK_THRESHOLDS = [
  { rank: 'novice',     xp: 0 },
  { rank: 'apprentice', xp: 100 },
  { rank: 'adept',      xp: 300 },
  { rank: 'expert',     xp: 600 },
  { rank: 'master',     xp: 1000 },
]

const LECTURE_XP_ATTENDEE = 50
const LECTURE_XP_LECTURER = 25
const LECTURE_BOOST_MS    = 24 * 60 * 60 * 1000  // 24h
const LECTURE_MAGICKA_MULT = 1.15

// baseId → XP gained from studying that tome
// FormIDs verified against skyrim-esm-references/books.json
const TOME_XP = {
  // Novice (15 XP)
  0x0009CD51: 15, // Spell Tome: Flames           edid: SpellTomeFlames
  0x0009CD52: 15, // Spell Tome: Frostbite        edid: SpellTomeFrostbite
  0x0009CD53: 15, // Spell Tome: Sparks           edid: SpellTomeSparks
  // Apprentice (30 XP)
  0x000A26FD: 30, // Spell Tome: Firebolt         edid: SpellTomeFirebolt
  0x000A26FE: 30, // Spell Tome: Ice Spike        edid: SpellTomeIceSpike
  0x000A26FF: 30, // Spell Tome: Lightning Bolt   edid: SpellTomeLightningBolt
  // Adept (50 XP)
  0x000A2706: 50, // Spell Tome: Fireball         edid: SpellTomeFireball
  0x000A2707: 50, // Spell Tome: Ice Storm        edid: SpellTomeIceStorm
  0x000A2708: 50, // Spell Tome: Chain Lightning  edid: SpellTomeChainLightning
  0x0010F7F4: 50, // Spell Tome: Incinerate       edid: SpellTomeIncinerate
  // Expert (75 XP)
  0x000A2709: 75, // Spell Tome: Wall of Flames   edid: SpellTomeWallOfFlames
  0x000A270A: 75, // Spell Tome: Wall of Frost    edid: SpellTomeWallOfFrost
  0x000A270B: 75, // Spell Tome: Wall of Storms   edid: SpellTomeWallOfStorms
  0x0010F7F3: 75, // Spell Tome: Icy Spear        edid: SpellTomeIcySpear
  0x0010F7F5: 75, // Spell Tome: Thunderbolt      edid: SpellTomeThunderbolt
  // Master (100 XP)
  0x000A270C: 100, // Spell Tome: Fire Storm      edid: SpellTomeFireStorm
  0x000A270D: 100, // Spell Tome: Blizzard        edid: SpellTomeBlizzard
  0x000A270E: 100, // Spell Tome: Lightning Storm edid: SpellTomeLightningStorm
}

// ── In-memory lecture sessions ────────────────────────────────────────────────
// lecturerId → { attendees: Set<userId> }
const lectures = new Map()

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getCollegeRank(xp) {
  let rank = 'novice'
  for (const t of RANK_THRESHOLDS) {
    if (xp >= t.xp) rank = t.rank
  }
  return rank
}

function getTomeRank(tomeBaseId) {
  const xp = TOME_XP[tomeBaseId]
  if (xp === undefined) return null
  if (xp >= 100) return 'master'
  if (xp >= 75)  return 'expert'
  if (xp >= 50)  return 'adept'
  if (xp >= 30)  return 'apprentice'
  return 'novice'
}

function getStudyXp(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return 0
  const saved = mp.get(player.actorId, 'ff_study_xp')
  return (saved !== null && saved !== undefined) ? saved : 0
}

function getCollegeRankForPlayer(mp, store, playerId) {
  return getCollegeRank(getStudyXp(mp, store, playerId))
}

// ── Actions ───────────────────────────────────────────────────────────────────

function studyTome(mp, store, bus, playerId, tomeBaseId) {
  const player = store.get(playerId)
  if (!player) return
  const xpGain = TOME_XP[tomeBaseId]
  if (xpGain === undefined) return

  const current = getStudyXp(mp, store, playerId)
  const newXp   = current + xpGain
  mp.set(player.actorId, 'ff_study_xp', newXp)
  bus.dispatch({ type: 'collegeXpGained', playerId, xpGain, totalXp: newXp })
}

function startLecture(mp, store, bus, lecturerId) {
  if (lectures.has(lecturerId)) return false
  lectures.set(lecturerId, { attendees: new Set() })
  bus.dispatch({ type: 'lectureStarted', lecturerId })
  return true
}

function joinLecture(mp, store, bus, playerId, lecturerId) {
  const session = lectures.get(lecturerId)
  if (!session) return false
  if (playerId === lecturerId) return false
  session.attendees.add(playerId)
  bus.dispatch({ type: 'lectureJoined', playerId, lecturerId })
  return true
}

function endLecture(mp, store, bus, lecturerId, now) {
  const session = lectures.get(lecturerId)
  if (!session) return false

  const boostExpiry = (now || Date.now()) + LECTURE_BOOST_MS

  // Award XP + boost to attendees
  for (const attendeeId of session.attendees) {
    const attendee = store.get(attendeeId)
    if (!attendee) continue
    const current = getStudyXp(mp, store, attendeeId)
    mp.set(attendee.actorId, 'ff_study_xp', current + LECTURE_XP_ATTENDEE)
    mp.set(attendee.actorId, 'ff_lecture_boost', boostExpiry)
    bus.dispatch({ type: 'lectureXpGained', playerId: attendeeId, xpGain: LECTURE_XP_ATTENDEE })
  }

  // Award XP only to lecturer
  const lecturer = store.get(lecturerId)
  if (lecturer) {
    const current = getStudyXp(mp, store, lecturerId)
    mp.set(lecturer.actorId, 'ff_study_xp', current + LECTURE_XP_LECTURER)
    bus.dispatch({ type: 'lectureXpGained', playerId: lecturerId, xpGain: LECTURE_XP_LECTURER })
  }

  lectures.delete(lecturerId)
  bus.dispatch({ type: 'lectureEnded', lecturerId, attendeeCount: session.attendees.size })
  return true
}

function getActiveLecture(lecturerId) {
  return lectures.get(lecturerId) || null
}

function hasLectureBoost(mp, store, playerId, now) {
  const player = store.get(playerId)
  if (!player) return false
  const expiry = mp.get(player.actorId, 'ff_lecture_boost')
  if (!expiry) return false
  return (now || Date.now()) < expiry
}

function getLectureBoostRemainingMs(mp, store, playerId, now) {
  const player = store.get(playerId)
  if (!player) return 0
  const expiry = mp.get(player.actorId, 'ff_lecture_boost')
  if (!expiry) return 0
  return Math.max(0, expiry - (now || Date.now()))
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[college] Initializing')

  mp.makeProperty('ff_study_xp', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty('ff_lecture_boost', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: `
      (() => {
        const expiry = ctx.value;
        const now    = Date.now();
        if (!expiry || now >= expiry) return { magickaRegenMult: 1.0, boostActive: false };
        return { magickaRegenMult: ${LECTURE_MAGICKA_MULT}, boostActive: true };
      })()
    `,
    updateNeighbor: '',
  })

  console.log('[college] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player || !player.actorId) return
  const xp   = safeGet(mp, player.actorId, 'ff_study_xp', 0)
  const rank = getCollegeRank(xp)
  mp.sendCustomPacket(player.actorId, 'collegeSync', { xp, rank })
}

module.exports = {
  getCollegeRank, getTomeRank, getStudyXp, getCollegeRankForPlayer,
  studyTome, startLecture, joinLecture, endLecture,
  getActiveLecture, hasLectureBoost, getLectureBoostRemainingMs,
  onConnect, init,
}
