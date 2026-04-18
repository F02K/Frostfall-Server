'use strict'

// ── Safe mp wrappers ──────────────────────────────────────────────────────────
//
// PartOne::GetUserActor returns 0 when no actor has been assigned yet (a "no
// actor" sentinel).  The C++ form with id 0x0 never exists in worldState at
// connect-time, so any mp.get / mp.set call with actorId 0 (or any id whose
// form isn't loaded yet) throws "Form with id 0x0 doesn't exist" and produces
// ANTIGO context noise in the server log.
//
// Use these wrappers everywhere a module reads or writes a custom ff_* property
// so that a not-yet-ready actor is silently skipped instead of erroring.

function safeGet(mp, actorId, key, fallback = null) {
  if (!actorId) return fallback
  try {
    const val = mp.get(actorId, key)
    return (val !== null && val !== undefined) ? val : fallback
  } catch (_) {
    return fallback
  }
}

function safeSet(mp, actorId, key, value) {
  if (!actorId) return false
  try {
    mp.set(actorId, key, value)
    return true
  } catch (_) {
    return false
  }
}

module.exports = { safeGet, safeSet }
