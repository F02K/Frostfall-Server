# Frostfall Roleplay — Server Codebase

## Language

All gamemode code is **plain CommonJS JavaScript**. No TypeScript. No compile step.
Frost (co-owner) works directly in JS — everything must be readable and runnable by him without a build.

## Gamemode structure

Active code lives in `gamemode/*.js`. Entry point: `gamemode/index.js`.

Each module exports: `init(mp, store, bus)` and `onConnect(mp, store, bus, userId)` at minimum.

## World-level persistence

**Do not use `mp.get(0, ...)` or `mp.get(0x3C, ...)`** — those form IDs may not exist at startup (see issue #4).

Use `worldStore.get(key)` / `worldStore.set(key, value)` for all world-level data (prison queue, property state, treasury, faction docs, etc.). Backed by `world/ff-world-data.json`.

## Inventory / gold

Inventory key is `'inv'` (not `'inventory'`). Gold base ID is `0x0000000F`.

## Permission model

Player flags: `isStaff: boolean`, `isLeader: boolean` in the store. Set via `/role` command (to be built). These currently reset on reconnect — persistence via `mp.set(actorId, 'ff_role', ...)` is needed.

## Style

```js
'use strict'

const CONSTANT = value

function doThing(mp, store, bus, userId) { ... }

function init(mp, store, bus) { ... }
function onConnect(mp, store, bus, userId) { ... }

module.exports = { doThing, init, onConnect }
```

## What's done (Plans 1–9 equivalent in JS)

hunger, drunkBar, economy, courier, housing, bounty, combat, captivity, prison, factions, college, skills, training, nvfl, commands, koid, resources, worldStore, store, bus

## What's missing

- Role persistence (isStaff/isLeader reset on reconnect)
- `/role set` command
- Hold treasury
- Staff sub-commands: `/bounty add|clear`, `/property approve|summon|deny|setprice`
- Economy Plans 10–15: production sites, commodity exchange, crafting, shops
