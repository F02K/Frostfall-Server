'use strict'

const path = require('path')

const chat     = require(path.join(__dirname, 'chat'))
const store    = require(path.join(__dirname, 'store'))
const bus      = require(path.join(__dirname, 'bus'))
const hunger   = require(path.join(__dirname, 'hunger'))
const drunkBar = require(path.join(__dirname, 'drunkBar'))
const economy  = require(path.join(__dirname, 'economy'))
const courier  = require(path.join(__dirname, 'courier'))
const housing  = require(path.join(__dirname, 'housing'))
const bounty   = require(path.join(__dirname, 'bounty'))
const combat   = require(path.join(__dirname, 'combat'))
const captivity = require(path.join(__dirname, 'captivity'))
const prison   = require(path.join(__dirname, 'prison'))
const factions = require(path.join(__dirname, 'factions'))
const college  = require(path.join(__dirname, 'college'))
const skills   = require(path.join(__dirname, 'skills'))
const training = require(path.join(__dirname, 'training'))
const nvfl     = require(path.join(__dirname, 'nvfl'))
const commands = require(path.join(__dirname, 'commands'))

function init(mp) {
  console.log('[gamemode] Frostfall Roleplay — initializing')

  // ── Chat — must be first so the property and event source exist before any
  // other system tries to send a message ────────────────────────────────────
  chat.init(mp)

  // ── Player lifecycle — single listeners, systems called in order ─────────
  mp.on('connect', (userId) => {
    try {
      const actorId = mp.getUserActor(userId)
      const name    = (actorId && mp.get(actorId, 'name')) || `User${userId}`
      store.register(userId, actorId, name)
      console.log(`[gamemode] ${name} (${userId}) connected`)
      // Restore per-system state (order: economy before stipend tick can fire)
      hunger.onConnect(mp, store, bus, userId)
      drunkBar.onConnect(mp, store, bus, userId)
      economy.onConnect(mp, store, bus, userId)
      bounty.onConnect(mp, store, bus, userId)
      factions.onConnect(mp, store, bus, userId)
      housing.onConnect(mp, store, bus, userId)
      college.onConnect(mp, store, bus, userId)
      skills.onConnect(mp, store, bus, userId)
      courier.onConnect(mp, store, bus, userId)
    } catch (err) {
      console.error(`[gamemode] connect error for ${userId}: ${err.message}`)
    }
  })

  mp.on('disconnect', (userId) => {
    try {
      const player = store.get(userId)
      if (player) console.log(`[gamemode] ${player.name} (${userId}) disconnected`)
      skills.onSkillPlayerDisconnect(mp, userId)
      store.deregister(userId)
    } catch (err) {
      console.error(`[gamemode] disconnect error for ${userId}: ${err.message}`)
    }
  })

  // ── System init (order matters: courier before housing/prison) ────────────
  hunger.init(mp, store, bus)
  drunkBar.init(mp, store, bus)
  economy.init(mp, store, bus)
  courier.init(mp, store, bus)
  housing.init(mp, store, bus)
  bounty.init(mp, store, bus)
  combat.init(mp, store, bus)
  captivity.init(mp, store, bus)
  prison.init(mp, store, bus)
  factions.init(mp, store, bus)
  college.init(mp, store, bus)
  skills.init(mp, store, bus)
  training.init(mp, store, bus)

  // ── Command layer ─────────────────────────────────────────────────────────
  const { handle: handleCommand } = commands.registerAll(mp, store, bus, {
    hunger, drunkBar, economy, housing, bounty,
    combat, nvfl, captivity, prison, factions,
    college, skills, training,
    chat,
  })

  // ── Chat input from the browser ───────────────────────────────────────────
  // mp['cef::chat:send'] is called by the C++ layer when the event source fires
  // ctx.sendEvent(text) on the client.  First arg is the actor's refrId, second
  // is the raw text the player typed.
  mp['cef_chat_send'] = (refrId, text) => {
    try {
      if (typeof text !== 'string' || !text.trim()) return
      const userId = mp.getUserByActor(refrId)
      const player = store.get(userId)
      if (!player) return

      // Commands — handled silently, not broadcast
      if (text.startsWith('/')) {
        handleCommand(userId, text)
        return
      }

      // Regular chat — broadcast to everyone
      const message = `${player.name}: ${text}`
      console.log(`[chat] ${message}`)
      chat.broadcast(mp, store, message)
    } catch (err) {
      console.error(`[chat] cef::chat:send error: ${err.message}`)
    }
  }

  console.log('[gamemode] Frostfall Roleplay — ready')
}

module.exports = { init }
