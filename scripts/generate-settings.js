'use strict'

/**
 * Generates server-settings.json from the .env file in the repo root.
 *
 * Run:  node scripts/generate-settings.js
 *       npm run generate
 *
 * The output file is gitignored — never commit server-settings.json directly.
 * Real credentials and machine-specific paths live only in .env.
 */

const path = require('path')
const fs   = require('fs')

// Load .env from the repo root without requiring an external dependency.
// Existing process.env values are never overwritten (same behaviour as dotenv).
;(function loadEnv(filePath) {
  try {
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      const val = t.slice(eq + 1).trim()
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch { /* .env absent — fall back to real env vars */ }
}(path.join(__dirname, '..', '.env')))

const e = process.env

// ── Helpers ───────────────────────────────────────────────────────────────────

const int  = (key, def) => parseInt(e[key] || String(def), 10)
const bool = (key, def) => e[key] !== undefined ? e[key] === 'true' : def
const str  = (key, def = '') => e[key] || def

// ── loadOrder — five vanilla ESM files from SKYRIM_DATA_PATH ─────────────────

const VANILLA_ESMS = ['Skyrim.esm', 'Update.esm', 'Dawnguard.esm', 'HearthFires.esm', 'Dragonborn.esm']

function buildLoadOrder() {
  const dataPath = str('SKYRIM_DATA_PATH').replace(/\\/g, '/')
  if (!dataPath) {
    console.warn('[generate] SKYRIM_DATA_PATH not set — loadOrder will be empty.')
    return []
  }
  return VANILLA_ESMS.map(f => `${dataPath}/${f}`)
}

// ── discordAuth — only written when at least clientId is provided ─────────────

function buildDiscordAuth() {
  const clientId = str('DISCORD_CLIENT_ID')
  if (!clientId) return undefined

  // Remove undefined values so JSON.stringify drops them cleanly
  const obj = {
    clientId,
    clientSecret:       str('DISCORD_CLIENT_SECRET')       || undefined,
    botToken:           str('DISCORD_BOT_TOKEN')           || undefined,
    guildId:            str('DISCORD_GUILD_ID')            || undefined,
    banRoleId:          str('DISCORD_BAN_ROLE_ID')         || undefined,
    eventLogChannelId:  str('DISCORD_EVENT_LOG_CHANNEL_ID')|| undefined,
    hideIpRoleId:       str('DISCORD_HIDE_IP_ROLE_ID')     || undefined,
  }

  // Strip keys whose value is undefined
  return JSON.parse(JSON.stringify(obj))
}

// ── metricsAuth — only written when both credentials are provided ─────────────

function buildMetricsAuth() {
  const user     = str('METRICS_USER')
  const password = str('METRICS_PASSWORD')
  if (!user || !password) return undefined
  return { user, password }
}

// ── Assemble settings object ──────────────────────────────────────────────────

const settings = {
  dataDir:      'data',
  loadOrder:    buildLoadOrder(),
  master:       str('MASTER_URL'),
  maxPlayers:   int('MAX_PLAYERS', 100),
  name:         str('SERVER_NAME', 'My Server'),
  npcEnabled:   bool('NPC_ENABLED', false),
  npcSettings:  {},
  offlineMode:  bool('OFFLINE_MODE', false),
  port:         int('SERVER_PORT', 7777),
}

const discordAuth = buildDiscordAuth()
if (discordAuth)  settings.discordAuth  = discordAuth

const metricsAuth = buildMetricsAuth()
if (metricsAuth)  settings.metricsAuth  = metricsAuth

// ── Write output ──────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, '..', 'server-settings.json')
fs.writeFileSync(outPath, JSON.stringify(settings, null, 2) + '\n')
console.log(`[generate] server-settings.json written → ${outPath}`)
