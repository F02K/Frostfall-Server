'use strict'

// ── Event Bus ─────────────────────────────────────────────────────────────────
// Minimal event emitter for inter-system communication.
// Systems never call each other directly — they dispatch events and listen.

const handlers = new Map()

function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, [])
  handlers.get(type).push(fn)
}

function off(type, fn) {
  if (!handlers.has(type)) return
  const list = handlers.get(type).filter(h => h !== fn)
  handlers.set(type, list)
}

function dispatch(event) {
  const list = handlers.get(event.type)
  if (!list) return
  for (const fn of list) {
    try { fn(event) } catch (err) {
      console.error(`[bus] Handler error for "${event.type}": ${err.message}`)
    }
  }
}

module.exports = { on, off, dispatch }
