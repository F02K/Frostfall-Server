// ── Gamemode WS Relay Client ───────────────────────────────────────────────────
//
// Connects the SkyMP gamemode sandbox to the Frostfall-Backend WS relay.
//
// Startup flow:
//   1. init(mp, onChatSend) — registers ff_wsNonce property, opens WS connection
//   2. registerPlayer(mp, userId, actorId) — generates a one-time nonce,
//      sends it to the relay (register_nonce), and pushes it to the player's
//      browser via mp.set so skymp5-front can authenticate itself.
//
// Once a player's browser authenticates, the relay sends player_connected and
// this module marks them as WS-connected. Delivery then routes via WS instead
// of the mp.set property-sync path. On disconnect the flag is cleared.
//
// Environment (read from globalThis.process.env):
//   RELAY_URL    — default ws://localhost:7778
//   RELAY_SECRET — default dev-relay-secret

import { signScript } from '../../core/signHelper'
import type { Mp } from '../../types'

const g = globalThis as any

const RELAY_URL    = g.process?.env?.RELAY_URL    ?? 'ws://ws.frostfall.online:7778'
const RELAY_SECRET = g.process?.env?.RELAY_SECRET ?? 'dev-relay-secret'

// Property that carries the one-time nonce to the player's browser.
// UPDATE_OWNER_JS runs in the SP runtime and injects it into window.ffWsNonce,
// sets window.ffWsUrl so the browser connects to the real relay host instead of
// the localhost:7778 fallback, then calls window.ffWsConnect().
const NONCE_PROP = 'ff_wsNonce'
const NONCE_UPDATE_JS = `
if (!ctx.value) return;
if (ctx.state.nonce === ctx.value) return;
ctx.state.nonce = ctx.value;
ctx.sp.browser.executeJavaScript(
  'window.ffWsUrl=${JSON.stringify(RELAY_URL)};' +
  'window.ffWsNonce=' + JSON.stringify(ctx.value) + ';' +
  'if(typeof window.ffWsConnect==="function")window.ffWsConnect();'
);
`.trim()

// ── State ─────────────────────────────────────────────────────────────────────

type ChatSendHandler = (userId: number, text: string) => void

let socket: any = null
let ready = false
let onChatSend: ChatSendHandler | null = null
// Exponential back-off: start at 3 s, double each failure up to 60 s.
// Resets to 3 s on a successful connection so recovery is fast once the relay
// comes back.
let _reconnectDelay = 3000

// Players whose browser has completed WS auth — delivery goes over WS for these.
const connectedPlayers = new Set<number>()

// Messages queued while socket is not yet ready.
const sendQueue: string[] = []

// ── Internal helpers ──────────────────────────────────────────────────────────

function rawSend(payload: string): void {
  if (ready && socket && socket.readyState === 1 /* OPEN */) {
    socket.send(payload)
  } else {
    sendQueue.push(payload)
  }
}

function send(msg: Record<string, unknown>): void {
  rawSend(JSON.stringify(msg))
}

function flushQueue(): void {
  while (sendQueue.length > 0) {
    const payload = sendQueue.shift()!
    if (socket && socket.readyState === 1) socket.send(payload)
  }
}

function connect(): void {
  try {
    socket = new g.WebSocket(RELAY_URL)
  } catch (err: any) {
    console.error('[ws-client] failed to create socket:', err?.message ?? err)
    _reconnectDelay = Math.min(_reconnectDelay * 2, 60000)
    setTimeout(connect, _reconnectDelay)
    return
  }

  socket.onopen = () => {
    send({ type: 'auth', role: 'gamemode', secret: RELAY_SECRET })
  }

  socket.onmessage = (event: any) => {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(event.data as string) } catch { return }

    if (msg.type === 'auth_ok') {
      ready = true
      _reconnectDelay = 3000  // reset back-off on successful connect
      console.log('[ws-client] connected to relay at', RELAY_URL)
      flushQueue()
      return
    }

    if (msg.type === 'player_connected') {
      connectedPlayers.add(msg.userId as number)
      console.log(`[ws-client] player ${msg.userId} browser connected`)
      return
    }

    if (msg.type === 'player_disconnected') {
      connectedPlayers.delete(msg.userId as number)
      return
    }

    if (msg.type === 'chat_send' && onChatSend) {
      onChatSend(msg.userId as number, msg.text as string)
    }
  }

  socket.onclose = () => {
    ready = false
    socket = null
    connectedPlayers.clear()
    _reconnectDelay = Math.min(_reconnectDelay * 2, 60000)
    console.log(`[ws-client] relay disconnected — reconnecting in ${_reconnectDelay / 1000}s`)
    setTimeout(connect, _reconnectDelay)
  }

  socket.onerror = (err: any) => {
    // Only log the first error per connection attempt to avoid spamming the log.
    // The onclose handler fires immediately after and will schedule the retry.
    console.error('[ws-client] socket error:', err?.message ?? String(err))
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the WS client. Must be called once during gamemode init.
 * onChatSendFn is invoked whenever a player sends a chat message over WS.
 */
export function init(mp: Mp, onChatSendFn: ChatSendHandler): void {
  onChatSend = onChatSendFn

  mp.makeProperty(NONCE_PROP, {
    isVisibleByOwner:     true,
    isVisibleByNeighbors: false,
    updateOwner:          signScript(NONCE_UPDATE_JS),
    updateNeighbor:       '',
  })

  connect()
  console.log('[ws-client] initialized')
}

/**
 * Call when a player connects to SkyMP.
 * Generates a nonce, registers it with the relay, and pushes it to the
 * player's browser so skymp5-front can authenticate its WS connection.
 */
export function registerPlayer(mp: Mp, userId: number, actorId: number): void {
  const nonce = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')

  send({ type: 'register_nonce', nonce, userId })
  if (actorId) mp.set(actorId, NONCE_PROP, nonce)
}

/**
 * Returns true if this player's browser has an active WS connection.
 * Used by chat.ts to choose between WS delivery and mp.set fallback.
 */
export function isConnected(userId: number): boolean {
  return connectedPlayers.has(userId)
}

/**
 * Deliver a chat message to a single player over WS.
 */
export function deliver(userId: number, msg: unknown): void {
  send({ type: 'chat_deliver', userId, msg })
}

/**
 * Broadcast a chat message to all WS-connected players.
 * Falls back gracefully — players not on WS won't receive this call,
 * so callers must still handle non-WS players via mp.set.
 */
export function broadcast(msg: unknown): void {
  send({ type: 'chat_broadcast', msg })
}
