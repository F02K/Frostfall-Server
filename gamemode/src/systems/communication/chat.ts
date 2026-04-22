// ── Chat System ───────────────────────────────────────────────────────────────
//
// Channels
//   IC (default)   proximity speech within SAY_RANGE
//   /me            roleplay action, proximity
//   /ooc           global out-of-character
//   /w <name>      private whisper (must be within WHISPER_RANGE)
//   /f             faction members only
//
// Server → Client flow
//   deliver() → mp.set(ff_chatMsg, JSON payload) → UPDATE_OWNER_JS (SP runtime)
//   → executeJavaScript → browser _ffChatPush → widgets.set → React re-render
//
// Client → Server flow
//   Chat input → skyrimPlatform.sendMessage("cef::chat:send", text)
//   → EVENT_SOURCE_JS browserMessage → ctx.sendEvent(text)
//   → mp['cef_chat_send'](refrId, text) → handleChatInput()
//
// Reload resilience
//   'front-loaded' → re-runs initChat in browser + ctx.sendEvent('__reload__')
//   → handleChatInput sees '__reload__' → replayHistory() re-delivers recent msgs
//
// Public API
//   init(mp)
//   handleChatInput(mp, store, userId, text): boolean  — true = consumed
//   sendSystem(mp, store, userId, text)
//   broadcastSystem(mp, store, text)
//   sendToPlayer(mp, store, userId, text, color?)      — legacy plain-text
//   broadcast(mp, store, text, color?)                 — legacy plain-text broadcast

import { safeSet } from '../../core/mpUtil'
import { signScript } from '../../core/signHelper'
import * as wsClient from './wsClient'
import type { Mp, Store } from '../../types'

// ── Config ────────────────────────────────────────────────────────────────────

const CHAT_MSG_PROP  = 'ff_chatMsg'
const SAY_RANGE      = 3500    // Skyrim units ≈ 50 m
const WHISPER_RANGE  = 400     // units ≈ 6 m  (must be standing next to someone)
export const MAX_MSG_LEN = 300
const MAX_HISTORY    = 30      // msgs kept server-side per player for reload replay
const BROWSER_LIMIT  = 100    // ring-buffer cap inside the browser
const RATE_LIMIT_MS  = 1000   // minimum ms between messages per player

// ── Color palette ─────────────────────────────────────────────────────────────

const C = {
  nameIc:      '#e8c87a',  // golden  — IC speaker
  nameOoc:     '#8888bb',  // slate   — OOC speaker
  nameFaction: '#66bb66',  // green   — faction chat
  nameWhisper: '#bb88cc',  // purple  — whisper
  nameSystem:  '#ff9933',  // orange  — [System] prefix
  tagIc:       '#666666',  // dim     — [Say] (unused, kept for future)
  tagOoc:      '#444466',  // dim     — [OOC] tag
  tagFaction:  '#335533',  // dim grn — [Faction] tag
  tagWhisper:  '#553366',  // dim pur — [Whisper] tag
  msgIc:       '#ffffff',  // white   — IC speech
  msgOoc:      '#ccccdd',  // lavender— OOC text
  msgMe:       '#ccccbb',  // pale    — /me action text
  msgWhisper:  '#cc99ff',  // light pur
  msgFaction:  '#aaddaa',  // light grn
  system:      '#ffcc44',  // gold    — system body
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Span    { text: string; color: string; opacity: number; type: string[] }
interface ChatMsg { category: string; text: Span[]; opacity: number }

function sp(text: string, color: string, types: string[] = ['text']): Span {
  return { text, color, opacity: 1, type: types }
}

function mkMsg(category: 'plain' | 'rp', ...spans: Span[]): ChatMsg {
  return { category, text: spans, opacity: 1 }
}

// ── Per-player recent-message history (for reload replay) ─────────────────────

const playerHistory = new Map<number, ChatMsg[]>()
const lastMsgTime   = new Map<number, number>()

function pushHistory(userId: number, m: ChatMsg): void {
  const h = playerHistory.get(userId) ?? []
  h.push(m)
  if (h.length > MAX_HISTORY) h.shift()
  playerHistory.set(userId, h)
}

function replayHistory(mp: Mp, store: Store, userId: number): void {
  const player = store.get(userId)
  if (!player) return
  const history = playerHistory.get(userId) ?? []
  for (const m of history) {
    deliver(mp, player.actorId, userId, m)
  }
}

// ── Delivery ──────────────────────────────────────────────────────────────────

let _seq = 0

function deliver(mp: Mp, actorId: number, userId: number, m: ChatMsg): void {
  if (wsClient.isConnected(userId)) {
    // Player's browser has an active WS connection — deliver directly.
    wsClient.deliver(userId, m)
  } else {
    // Fallback: push via SkyMP property sync (UPDATE_OWNER_JS → executeJavaScript).
    // _seq ensures uniqueness so the SP-runtime dedup never suppresses a replay.
    safeSet(mp, actorId, CHAT_MSG_PROP, JSON.stringify({ msg: m, _: ++_seq }))
  }
}

// ── Proximity helper ──────────────────────────────────────────────────────────

function dist3(
  a: [number, number, number] | null,
  b: [number, number, number] | null,
): number {
  if (!a || !b) return Infinity
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

function sendProximity(
  mp: Mp,
  store: Store,
  senderActorId: number,
  m: ChatMsg,
  range: number,
): void {
  const origin = mp.getActorPos(senderActorId)
  for (const p of store.getAll()) {
    if (dist3(origin, mp.getActorPos(p.actorId)) <= range) {
      deliver(mp, p.actorId, p.id, m)
      pushHistory(p.id, m)
    }
  }
}

// ── Browser-side bootstrap JS ─────────────────────────────────────────────────
//
// WIDGET_EXPR is a JS expression (not a string) evaluated *in the browser*
// whenever widgets.set() is called.  It reads window.chatMessages at call time
// so each widget update carries the latest snapshot, giving React a new
// reference and triggering the useEffect([props.messages]) scroll handler.

// isInputHidden:true — keep the input hidden until the player explicitly opens
// chat (e.g. presses Enter).  Showing it immediately on load would focus the
// input and swallow all keyboard input before the actor is created, making the
// player unable to move.  The input is shown by the client when needed.
const WIDGET_EXPR =
  '[{type:"chat",' +
  'messages:window.chatMessages.slice(),' +
  'send:function(t){window.skyrimPlatform.sendMessage("cef::chat:send",t);},' +
  'placeholder:"",' +
  'isInputHidden:true}]'

// Runs in the SP runtime when ff_chatMsg changes on the owning actor.
//
// ctx.value  = JSON string  { msg: ChatMsg, _: seq }
// Dedup via ctx.state.last so the SP runtime never re-delivers the same payload.
// If _ffChatPush is not yet defined in the browser (race at session start),
// messages are queued in window._ffChatPendingMsgs and flushed by initChat.
const UPDATE_OWNER_JS = `
if (!ctx.value) return;
if (ctx.state.last === ctx.value) return;
ctx.state.last = ctx.value;
var p; try { p = JSON.parse(ctx.value); } catch(e) { return; }
var enc = JSON.stringify(p.msg);
ctx.sp.browser.executeJavaScript(
  'if(typeof window._ffChatPush==="function"){window._ffChatPush(' + enc + ')}' +
  'else{' +
  'if(!Array.isArray(window._ffChatPendingMsgs))window._ffChatPendingMsgs=[];' +
  'window._ffChatPendingMsgs.push(' + enc + ')}'
);
`.trim()

// Runs in the SP runtime once per player session (makeEventSource).
//
// initChat (a browser-side JS string) is executed on session start and again
// on every 'front-loaded' event (browser reload).  It:
//   1. Defines window._ffChatPush — appends a message and triggers a widget update
//   2. Flushes window._ffChatPendingMsgs accumulated before _ffChatPush existed
//   3. Calls widgets.set() so the React tree mounts the chat widget immediately
//
// 'cef::chat:send'  — user submitted a message; forwarded to server via sendEvent
// 'front-loaded'    — browser (re)loaded; re-runs initChat and requests history
//                     replay via the '__reload__' sentinel passed to sendEvent
const EVENT_SOURCE_JS = `
var initChat =
  'if(!Array.isArray(window.chatMessages))window.chatMessages=[];' +
  'window._ffChatPush=function(m){' +
  '  window.chatMessages.push(m);' +
  '  while(window.chatMessages.length>${BROWSER_LIMIT})window.chatMessages.shift();' +
  '  window.skyrimPlatform.widgets.set(${WIDGET_EXPR});' +
  '  if(typeof window.scrollToLastMessage==="function")window.scrollToLastMessage();' +
  '};' +
  'if(Array.isArray(window._ffChatPendingMsgs)){' +
  '  window._ffChatPendingMsgs.forEach(function(m){window._ffChatPush(m);});' +
  '  window._ffChatPendingMsgs=[];' +
  '}' +
  'window.skyrimPlatform.widgets.set(${WIDGET_EXPR});';

ctx.sp.browser.executeJavaScript(initChat);

ctx.sp.on('browserMessage', function(evt) {
  var key = evt.arguments[0];
  if (key === 'front-loaded') {
    ctx.sp.browser.executeJavaScript(initChat);
    ctx.sendEvent('__reload__');
  }
  if (key === 'cef::chat:send') {
    ctx.sendEvent(evt.arguments[1]);
  }
});
`.trim()

// ── init ──────────────────────────────────────────────────────────────────────

export function init(mp: Mp): void {
  mp.makeProperty(CHAT_MSG_PROP, {
    isVisibleByOwner:    true,
    isVisibleByNeighbors: false,
    updateOwner:         signScript(UPDATE_OWNER_JS),
    updateNeighbor:      '',
  })

  mp.makeEventSource('cef_chat_send', signScript(EVENT_SOURCE_JS))

  console.log('[chat] property and event source registered')
}

// ── handleChatInput ───────────────────────────────────────────────────────────
//
// Returns true  → input was consumed (chat channel or IC speech, or __reload__)
// Returns false → not a chat channel; caller should route to commands

export function handleChatInput(
  mp: Mp,
  store: Store,
  userId: number,
  text: string,
): boolean {
  // ── Special reload sentinel (fired by EVENT_SOURCE_JS on 'front-loaded') ───
  if (text === '__reload__') {
    replayHistory(mp, store, userId)
    return true
  }

  const player = store.get(userId)
  if (!player) return true  // player not registered yet, silently consume

  // ── Server-side rate limiting ─────────────────────────────────────────────
  const now = Date.now()
  const last = lastMsgTime.get(userId) ?? 0
  if (now - last < RATE_LIMIT_MS) {
    const rateMsg = mkMsg('plain',
      sp('[System] ', C.nameSystem, ['nonrp']),
      sp('Please wait before sending another message.', C.system, ['nonrp', 'text']),
    )
    deliver(mp, player.actorId, userId, rateMsg)
    return true
  }
  lastMsgTime.set(userId, now)

  // Strip control characters to prevent rendering artifacts
  const raw = text.trim().replace(/[\x00-\x1F\x7F]/g, '')
  if (!raw || raw.length > MAX_MSG_LEN) return true

  const lower = raw.toLowerCase()

  // ── /me <action> ─────────────────────────────────────────────────────────
  if (lower.startsWith('/me ')) {
    const action = raw.slice(4).trim()
    if (!action) return true
    const m = mkMsg('rp',
      sp('* ', C.tagIc, ['nonrp']),
      sp(player.name, C.nameIc, ['nonrp']),
      sp(' ' + action + ' *', C.msgMe, ['rp']),
    )
    sendProximity(mp, store, player.actorId, m, SAY_RANGE)
    console.log(`[chat:me] ${player.name} ${action}`)
    return true
  }

  // ── /ooc <text> ───────────────────────────────────────────────────────────
  if (lower.startsWith('/ooc ') || lower === '/ooc') {
    const body = raw.slice(5).trim()
    if (!body) return true
    const m = mkMsg('plain',
      sp('[OOC] ', C.tagOoc, ['nonrp']),
      sp(player.name + ': ', C.nameOoc, ['nonrp']),
      sp(body, C.msgOoc, ['nonrp', 'text']),
    )
    for (const p of store.getAll()) {
      deliver(mp, p.actorId, p.id, m)
      pushHistory(p.id, m)
    }
    console.log(`[chat:ooc] ${player.name}: ${body}`)
    return true
  }

  // ── /w <name> <text> ──────────────────────────────────────────────────────
  if (lower.startsWith('/w ')) {
    const rest     = raw.slice(3).trim()
    const spaceIdx = rest.indexOf(' ')
    if (spaceIdx === -1) return true
    const targetName = rest.slice(0, spaceIdx).toLowerCase()
    const body       = rest.slice(spaceIdx + 1).trim()
    if (!body) return true

    const target = store.getAll().find(p => p.name.toLowerCase() === targetName)
    if (!target) {
      const notFound = mkMsg('plain',
        sp('[Whisper] ', C.tagWhisper, ['nonrp']),
        sp(`Player "${rest.slice(0, spaceIdx)}" is not online.`, C.system, ['nonrp', 'text']),
      )
      deliver(mp, player.actorId, userId, notFound)
      return true
    }

    const d = dist3(mp.getActorPos(player.actorId), mp.getActorPos(target.actorId))
    if (d > WHISPER_RANGE) {
      const tooFar = mkMsg('plain',
        sp('[Whisper] ', C.tagWhisper, ['nonrp']),
        sp('Too far away to whisper.', C.system, ['nonrp', 'text']),
      )
      deliver(mp, player.actorId, userId, tooFar)
      return true
    }

    const toTarget = mkMsg('plain',
      sp('[Whisper] ', C.tagWhisper, ['nonrp']),
      sp(player.name + ' whispers: ', C.nameWhisper, ['nonrp']),
      sp(body, C.msgWhisper, ['text']),
    )
    const toSelf = mkMsg('plain',
      sp('[→ ' + target.name + '] ', C.tagWhisper, ['nonrp']),
      sp(body, C.msgWhisper, ['text']),
    )
    deliver(mp, target.actorId, target.id, toTarget)
    pushHistory(target.id, toTarget)
    deliver(mp, player.actorId, userId, toSelf)
    pushHistory(player.id, toSelf)
    console.log(`[chat:whisper] ${player.name} → ${target.name}: ${body}`)
    return true
  }

  // ── /f <text> (faction chat) ──────────────────────────────────────────────
  if (lower.startsWith('/f ') || lower === '/f') {
    const body = raw.slice(3).trim()
    if (!body) return true

    if (!player.factions.length) {
      const noFaction = mkMsg('plain',
        sp('[Faction] ', C.tagFaction, ['nonrp']),
        sp('You are not in a faction.', C.system, ['nonrp', 'text']),
      )
      deliver(mp, player.actorId, userId, noFaction)
      return true
    }

    const m = mkMsg('plain',
      sp('[Faction] ', C.tagFaction, ['nonrp']),
      sp(player.name + ': ', C.nameFaction, ['nonrp']),
      sp(body, C.msgFaction, ['text']),
    )
    for (const p of store.getAll()) {
      if (p.factions.some(f => player.factions.includes(f))) {
        deliver(mp, p.actorId, p.id, m)
        pushHistory(p.id, m)
      }
    }
    console.log(`[chat:faction] ${player.name}: ${body}`)
    return true
  }

  // ── Unknown /command → let caller route to command handler ───────────────
  if (raw.startsWith('/')) return false

  // ── IC (proximity speech, default) ───────────────────────────────────────
  const m = mkMsg('plain',
    sp(player.name + ': ', C.nameIc, ['text']),
    sp(raw, C.msgIc, ['text']),
  )
  sendProximity(mp, store, player.actorId, m, SAY_RANGE)
  console.log(`[chat:ic] ${player.name}: ${raw}`)
  return true
}

// ── Named API ─────────────────────────────────────────────────────────────────

/**
 * Send a styled [System] message to a single player.
 */
export function sendSystem(mp: Mp, store: Store, userId: number, text: string): void {
  const player = store.get(userId)
  if (!player) return
  const m = mkMsg('plain',
    sp('[System] ', C.nameSystem, ['nonrp']),
    sp(text, C.system, ['nonrp', 'text']),
  )
  deliver(mp, player.actorId, userId, m)
  pushHistory(userId, m)
}

/**
 * Broadcast a styled [System] message to all connected players.
 */
export function broadcastSystem(mp: Mp, store: Store, text: string): void {
  const m = mkMsg('plain',
    sp('[System] ', C.nameSystem, ['nonrp']),
    sp(text, C.system, ['nonrp', 'text']),
  )
  for (const p of store.getAll()) {
    deliver(mp, p.actorId, p.id, m)
    pushHistory(p.id, m)
  }
  console.log(`[chat:system] ${text}`)
}

/**
 * Send a plain-text message to a single player.
 * Kept for backward compatibility with other systems that call this directly.
 */
export function sendToPlayer(
  mp: Mp,
  store: Store,
  userId: number,
  text: string,
  color = '#ffffff',
): void {
  const player = store.get(userId)
  if (!player) return
  const m = mkMsg('plain', sp(text, color, ['text']))
  deliver(mp, player.actorId, userId, m)
  pushHistory(userId, m)
}

/**
 * Broadcast a plain-text message to all connected players.
 * Kept for backward compatibility.
 */
export function broadcast(mp: Mp, store: Store, text: string, color = '#ffffff'): void {
  const m = mkMsg('plain', sp(text, color, ['text']))
  for (const p of store.getAll()) {
    deliver(mp, p.actorId, p.id, m)
    pushHistory(p.id, m)
  }
}
