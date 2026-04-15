'use strict'

// Took from a Unity project and adapted for SkyMP. Still a WIP, but the core spawning/despawning logic is in place and can be tested with placeholder formIds. Once we have a way to reference Skyrim records, we'll need to update the formIds and verify that the spawns work as intended (e.g. spawn positions, facing angles, group sizes).
// ─────────────────────────────────────────────────────────────────────────────
// wildlife.js — server-side procedural wildlife for SkyMP
//
// Require from gamemode.js:
//   const wildlife = require('./wildlife')
//   wildlife.init(mp)
//
// Currently broken
// ─────────────────────────────────────────────────────────────────────────────

// ── Configuration ─────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS   = 5_000        // how often the system updates
const ZONE_RADIUS        = 3_000        // spawn radius per player (Skyrim units, ~1u = 14cm)
const MERGE_THRESHOLD    = ZONE_RADIUS * 2  // two zones merge when centers are closer than this
const MAX_PER_ZONE       = 8            // max alive wildlife per merged zone
const DESPAWN_GRACE_MS   = 15_000       // keep creatures alive this long after a player leaves the area
const DEATH_COOLDOWN_MS  = 5 * 60_000   // after a creature dies, its species won't respawn in that worldspace for this long

// ── Spawn table ───────────────────────────────────────────────────────────────
// formId: base NPC record in Skyrim.esm (verify with xEdit if a creature misbehaves)
// weight: relative spawn chance
// minGroup / maxGroup: creatures spawned per spawn event

// formIds sourced from skyrim-esm-data/npcs.json export. Each entry notes its EditorID for cross-reference.
const SPAWN_TABLE = [
  // Common — wolves
  { id: 'wolf',        name: 'Wolf',        formId: 0x0010FE05, weight: 30, minGroup: 1, maxGroup: 3 }, // EncWolfRed
  { id: 'wolf_timber', name: 'Timber Wolf', formId: 0x00023ABF, weight: 15, minGroup: 1, maxGroup: 2 }, // EncWolfIce

  // Bears — solitary
  { id: 'bear_black',  name: 'Bear (Black)',formId: 0x00023A8B, weight: 10, minGroup: 1, maxGroup: 1 }, // EncBearCave
  { id: 'bear_brown',  name: 'Bear (Brown)',formId: 0x00023A8A, weight: 10, minGroup: 1, maxGroup: 1 }, // EncBear
  { id: 'bear_snow',   name: 'Bear (Snow)', formId: 0x00023A8C, weight:  5, minGroup: 1, maxGroup: 1 }, // EncBearSnow

  // Peaceful — deer and elk
  { id: 'deer',        name: 'Deer',        formId: 0x000CF89D, weight: 25, minGroup: 1, maxGroup: 3 }, // EncDeer
  { id: 'elk',         name: 'Elk',         formId: 0x00023A91, weight: 15, minGroup: 1, maxGroup: 2 }, // EncElk

  // Small creatures
  { id: 'mudcrab',     name: 'Mudcrab',     formId: 0x000E4010, weight: 20, minGroup: 1, maxGroup: 4 }, // EncMudcrabMedium
  { id: 'skeever',     name: 'Skeever',     formId: 0x00023AB7, weight: 20, minGroup: 1, maxGroup: 3 }, // EncSkeever

  // Apex — rare
  { id: 'sabrecat',    name: 'Sabre Cat',   formId: 0x00023AB5, weight:  8, minGroup: 1, maxGroup: 1 }, // EncSabreCat
  { id: 'horker',      name: 'Horker',      formId: 0x00023AB1, weight: 10, minGroup: 1, maxGroup: 3 }, // EncHorker
]

// Pre-compute cumulative weight table for O(log n) weighted random selection
const _totalWeight = SPAWN_TABLE.reduce((s, e) => s + e.weight, 0)
const _cumulative  = []
let   _acc = 0
for (const entry of SPAWN_TABLE) {
  _acc += entry.weight
  _cumulative.push({ threshold: _acc / _totalWeight, entry })
}

function pickRandomEntry() {
  const r = Math.random()
  for (const c of _cumulative) {
    if (r <= c.threshold) return c.entry
  }
  return SPAWN_TABLE[SPAWN_TABLE.length - 1]
}

// ── State ─────────────────────────────────────────────────────────────────────

// Tracks every actor we spawned
// formId → { entryId, pos: [x,y,z], cellOrWorld: number, spawnedAt: number }
const spawnedActors = new Map()

// Key: `${entryId}:${cellOrWorldId}` → ms timestamp after which respawn is allowed
const deathCooldowns = new Map()

// formId → ms timestamp after which the actor may be despawned (grace window)
const despawnGraceMap = new Map()

// Connected userIds — populated via mp.on("connect"/"disconnect")
const onlineUserIds = new Set()

// ── Math helpers ──────────────────────────────────────────────────────────────

function dist3D(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx*dx + dy*dy + dz*dz)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randAngle() {
  return Math.random() * Math.PI * 2
}

// Uniformly distributed random point inside a circle (2D, Z kept from center)
function randPosInCircle(center, radius) {
  const angle = randAngle()
  const r     = Math.sqrt(Math.random()) * radius * 0.85 // 0.85 keeps spawns away from the very edge
  return [
    center[0] + Math.cos(angle) * r,
    center[1] + Math.sin(angle) * r,
    center[2],
  ]
}

// ── Zone merging ──────────────────────────────────────────────────────────────
//
// Algorithm:
//   1. Group players by worldspace (different worlds never merge)
//   2. Build an adjacency graph: two players are adjacent if dist < MERGE_THRESHOLD
//   3. Find connected components via BFS
//   4. Each component becomes one zone whose bounding sphere wraps all its players
//
// Result: O(n²) over players (≤100), called every 5s — negligible cost.

function buildZones(players) {
  if (players.length === 0) return []

  // Group by worldspace
  const byWorld = new Map()
  players.forEach((p, i) => {
    if (!byWorld.has(p.cellOrWorld)) byWorld.set(p.cellOrWorld, [])
    byWorld.get(p.cellOrWorld).push(i)
  })

  const zones = []

  for (const [worldId, indices] of byWorld) {
    const n   = indices.length
    const adj = Array.from({ length: n }, () => [])

    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (dist3D(players[indices[a]].pos, players[indices[b]].pos) < MERGE_THRESHOLD) {
          adj[a].push(b)
          adj[b].push(a)
        }
      }
    }

    // BFS connected components
    const visited = new Set()
    for (let start = 0; start < n; start++) {
      if (visited.has(start)) continue

      const cluster = []
      const queue   = [start]
      visited.add(start)

      while (queue.length) {
        const curr = queue.shift()
        cluster.push(indices[curr])
        for (const next of adj[curr]) {
          if (!visited.has(next)) { visited.add(next); queue.push(next) }
        }
      }

      // Bounding sphere: center = mean of player positions
      // effective radius = (max distance from center to any player) + ZONE_RADIUS
      const positions = cluster.map(i => players[i].pos)
      const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length
      const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length
      const cz = positions.reduce((s, p) => s + p[2], 0) / positions.length
      const center = [cx, cy, cz]
      const spread = positions.reduce((max, p) => Math.max(max, dist3D(center, p)), 0)

      zones.push({
        center,
        radius:       spread + ZONE_RADIUS,
        cellOrWorld:  worldId,
        playerCount:  cluster.length,
      })
    }
  }

  return zones
}

function isInZone(pos, zone) {
  return dist3D(pos, zone.center) <= zone.radius
}

function isInAnyZone(pos, zones) {
  return zones.some(z => isInZone(pos, z))
}

// ── Spawn tick ────────────────────────────────────────────────────────────────

function tick(mp) {
  const now = Date.now()

  // 1. Collect online player positions
  const players = []

  for (const userId of onlineUserIds) {
    try {
      const actorId    = mp.getUserActor(userId)
      if (!actorId) continue
      const pos        = mp.getActorPos(actorId)
      const cellOrWorld = mp.getActorCellOrWorld(actorId)
      if (pos && cellOrWorld) players.push({ actorId, pos, cellOrWorld })
    } catch {
      // Player may have just disconnected — skip silently
    }
  }

  // 2. Build merged zones
  const zones = buildZones(players)

  // 3. Despawn actors that are no longer covered by any zone
  for (const [formId, info] of spawnedActors) {
    if (isInAnyZone(info.pos, zones)) {
      // Still covered — cancel any pending grace timer
      despawnGraceMap.delete(formId)
      continue
    }

    if (!despawnGraceMap.has(formId)) {
      // Start grace period — don't despawn immediately in case player turns around
      despawnGraceMap.set(formId, now + DESPAWN_GRACE_MS)
    } else if (now >= despawnGraceMap.get(formId)) {
      // Grace expired — despawn
      try { mp.destroyActor(formId) } catch {}
      spawnedActors.delete(formId)
      despawnGraceMap.delete(formId)
    }
  }

  // 4. Spawn wildlife into each zone up to MAX_PER_ZONE
  for (const zone of zones) {
    // Count alive tracked actors inside this zone
    let aliveCount = 0
    for (const [, info] of spawnedActors) {
      if (isInZone(info.pos, zone)) aliveCount++
    }

    if (aliveCount >= MAX_PER_ZONE) continue

    // Pick a random species, respecting death cooldowns
    // Try up to SPAWN_TABLE.length times to find a species not on cooldown
    let entry = null
    for (let attempt = 0; attempt < SPAWN_TABLE.length; attempt++) {
      const candidate   = pickRandomEntry()
      const cooldownKey = `${candidate.id}:${zone.cellOrWorld}`
      if (!deathCooldowns.has(cooldownKey) || now >= deathCooldowns.get(cooldownKey)) {
        entry = candidate
        break
      }
    }

    if (!entry) continue // all species on cooldown in this worldspace

    const groupSize = Math.min(
      randInt(entry.minGroup, entry.maxGroup),
      MAX_PER_ZONE - aliveCount
    )

    for (let g = 0; g < groupSize; g++) {
      const spawnPos = randPosInCircle(zone.center, zone.radius)
      try {
        const newId = mp.createActor(
          entry.formId,
          spawnPos,
          randAngle(),
          zone.cellOrWorld
        )
        if (newId) {
          spawnedActors.set(newId, {
            entryId:    entry.id,
            pos:        spawnPos,
            cellOrWorld: zone.cellOrWorld,
            spawnedAt:  now,
          })
        }
      } catch (err) {
        console.error(`[wildlife] createActor failed for ${entry.name} (0x${entry.formId.toString(16)}): ${err.message}`)
      }
    }
  }
}

// ── Public init ───────────────────────────────────────────────────────────────

function init(mp) {
  console.log('[wildlife] Initializing')

  // Track connected players — mp.on("connect"/"disconnect")
  mp.on('connect', (userId) => onlineUserIds.add(userId))
  mp.on('disconnect', (userId) => onlineUserIds.delete(userId))

  // Detect wildlife deaths via a client-side event source.
  // actorKill fires on the client whenever any actor is killed nearby.
  // The server receives the formId of the player whose client observed the kill.
  mp.makeEventSource('_onActorDeath', `
    ctx.sp.on('actorKill', () => {
      ctx.sendEvent();
    });
  `)
  mp._onActorDeath = (pcFormId) => {
    const worldspace = mp.getActorCellOrWorld(pcFormId)
    for (const [id, info] of spawnedActors) {
      if (info.cellOrWorld !== worldspace) continue
      try { mp.getActorPos(id) } catch {
        // Actor is gone — apply cooldown and stop tracking it
        const cooldownKey = `${info.entryId}:${info.cellOrWorld}`
        deathCooldowns.set(cooldownKey, Date.now() + DEATH_COOLDOWN_MS)
        spawnedActors.delete(id)
        despawnGraceMap.delete(id)
        console.log(`[wildlife] ${info.entryId} gone (id=0x${id.toString(16)}), cooldown ${DEATH_COOLDOWN_MS / 1000}s`)
      }
    }
  }

  const scheduleTick = () => {
    setTimeout(() => {
      try { tick(mp) } catch (err) {
        console.error(`[wildlife] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, TICK_INTERVAL_MS)
  }

  scheduleTick()

  console.log(
    `[wildlife] Started — ${SPAWN_TABLE.length} species, zone radius ${ZONE_RADIUS}u, ` +
    `max ${MAX_PER_ZONE}/zone, tick ${TICK_INTERVAL_MS}ms`
  )
}

module.exports = { init }
