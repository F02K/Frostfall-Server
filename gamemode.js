/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 592
(__unused_webpack_module, exports, __webpack_require__) {


// ── Commands ──────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseCommand = parseCommand;
exports.findPlayer = findPlayer;
exports.checkPermission = checkPermission;
exports.registerAll = registerAll;
const bountyMod = __importStar(__webpack_require__(667));
const captivity = __importStar(__webpack_require__(800));
const college = __importStar(__webpack_require__(316));
const combat = __importStar(__webpack_require__(421));
const drunkBar = __importStar(__webpack_require__(968));
const economy = __importStar(__webpack_require__(15));
const factions = __importStar(__webpack_require__(757));
const housing = __importStar(__webpack_require__(121));
const hunger = __importStar(__webpack_require__(92));
const nvfl = __importStar(__webpack_require__(315));
const prison = __importStar(__webpack_require__(239));
const skills = __importStar(__webpack_require__(399));
const training = __importStar(__webpack_require__(491));
const chat = __importStar(__webpack_require__(809));
// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCommand(text) {
    if (!text || !text.startsWith('/'))
        return null;
    const parts = text.trim().slice(1).split(/\s+/);
    return { cmd: parts[0].toLowerCase(), args: parts.slice(1) };
}
function findPlayer(store, name) {
    if (!name)
        return null;
    const lower = name.toLowerCase();
    return store.getAll().find(p => p.name.toLowerCase() === lower) ?? null;
}
function checkPermission(store, playerId, level) {
    if (level === 'player')
        return true;
    const player = store.get(playerId);
    if (!player)
        return false;
    if (level === 'staff')
        return player.isStaff;
    if (level === 'leader')
        return player.isLeader || player.isStaff;
    return false;
}
// reply is assigned inside registerAll once we have the chat module.
let reply = () => { };
// ── Command registration ──────────────────────────────────────────────────────
function registerAll(mp, store, bus) {
    // Wire reply to the chat module so command responses appear in the UI.
    reply = (mp_, store_, playerId, message) => chat.sendToPlayer(mp_, store_, playerId, message);
    const handlers = {};
    // ── College ──────────────────────────────────────────────────────────────
    handlers['lecture'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const sub = args[0];
        if (sub === 'start') {
            const ok = college.startLecture(mp, store, bus, userId);
            reply(mp, store, userId, ok ? 'Lecture started.' : 'You already have an active lecture.');
        }
        else if (sub === 'join') {
            const lecturerId = _findUserIdByName(store, args[1]);
            if (lecturerId === null)
                return reply(mp, store, userId, `Player "${args[1]}" not found.`);
            const ok = college.joinLecture(mp, store, bus, userId, lecturerId);
            reply(mp, store, userId, ok ? 'Joined lecture.' : 'Could not join that lecture.');
        }
        else if (sub === 'end') {
            const ok = college.endLecture(mp, store, bus, userId);
            reply(mp, store, userId, ok ? 'Lecture ended. XP distributed.' : 'No active lecture.');
        }
        else {
            reply(mp, store, userId, 'Usage: /lecture start | join [name] | end');
        }
    };
    handlers['study'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const baseId = parseInt(args[0], 16);
        if (!baseId)
            return reply(mp, store, userId, 'Usage: /study [tomeBaseId]');
        college.studyTome(mp, store, bus, userId, baseId);
        reply(mp, store, userId, 'Studied tome.');
    };
    // ── Training ─────────────────────────────────────────────────────────────
    handlers['train'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const sub = args[0];
        const skillIds = skills.SKILL_IDS;
        if (sub === 'start') {
            const skillId = (args[1] ?? '').toLowerCase();
            if (!skillIds.includes(skillId))
                return reply(mp, store, userId, `Valid skills: ${skillIds.join(', ')}`);
            const ok = training.startTraining(mp, store, bus, userId, skillId);
            reply(mp, store, userId, ok ? `Training session started for ${skillId}.` : 'You already have an active session.');
        }
        else if (sub === 'join') {
            const trainerId = _findUserIdByName(store, args[1]);
            if (trainerId === null)
                return reply(mp, store, userId, `Player "${args[1]}" not found.`);
            const ok = training.joinTraining(mp, store, bus, userId, trainerId);
            reply(mp, store, userId, ok ? 'Joined training session.' : 'Could not join (not nearby or no session).');
        }
        else if (sub === 'end') {
            const ok = training.endTraining(mp, store, bus, userId);
            reply(mp, store, userId, ok ? 'Training ended. Boosts granted to attendees.' : 'No active session.');
        }
        else {
            reply(mp, store, userId, 'Usage: /train start [skillId] | join [name] | end');
        }
    };
    // ── Skills ───────────────────────────────────────────────────────────────
    handlers['skill'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const player = store.get(userId);
        if (!player)
            return;
        const target = (args[0] ?? '').toLowerCase();
        const list = target ? [target] : skills.SKILL_IDS;
        const lines = [];
        for (const skillId of list) {
            const xp = skills.getSkillXp(mp, userId, skillId);
            const level = skills.getSkillLevel(xp);
            const cap = skills.getSkillCap(mp, store, userId, skillId);
            lines.push(`${skillId}: level ${level} (${xp}/${cap} XP)`);
        }
        reply(mp, store, userId, lines.join('\n'));
    };
    // ── Economy ──────────────────────────────────────────────────────────────
    handlers['pay'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const amount = parseInt(args[0]);
        if (!amount || amount <= 0)
            return reply(mp, store, userId, 'Usage: /pay [amount] [playerName]');
        const target = findPlayer(store, args[1]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[1]}" not found.`);
        const ok = economy.transferGold(mp, store, userId, target.id, amount);
        if (ok) {
            reply(mp, store, userId, `Paid ${amount} Septims to ${target.name}.`);
            reply(mp, store, target.id, `Received ${amount} Septims from ${store.get(userId).name}.`);
        }
        else {
            reply(mp, store, userId, 'Insufficient funds.');
        }
    };
    // ── Housing ──────────────────────────────────────────────────────────────
    handlers['property'] = (userId, args) => {
        const sub = args[0];
        if (sub === 'list') {
            if (!checkPermission(store, userId, 'player'))
                return reply(mp, store, userId, 'No permission.');
            const player = store.get(userId);
            const holdId = player ? player.holdId : null;
            if (!holdId)
                return reply(mp, store, userId, 'You are not assigned to a hold.');
            const list = housing.getPropertiesByHold(holdId);
            const lines = list.map(p => `${p.id}: ${p.name} [${p.type}] — ${p.ownerId ? 'Owned' : p.pendingOwnerId ? 'Pending' : 'Available'}`);
            reply(mp, store, userId, lines.length ? lines.join('\n') : 'No properties in this hold.');
        }
        else if (sub === 'request') {
            if (!checkPermission(store, userId, 'player'))
                return reply(mp, store, userId, 'No permission.');
            const propertyId = args[1];
            if (!propertyId)
                return reply(mp, store, userId, 'Usage: /property request [propertyId]');
            const stewardId = _findStewardForProperty(store, propertyId);
            if (stewardId === null)
                return reply(mp, store, userId, 'No Steward available in this hold.');
            const ok = housing.requestProperty(mp, store, bus, userId, propertyId, stewardId);
            reply(mp, store, userId, ok ? 'Property request sent to Steward.' : 'Property unavailable.');
        }
        else if (sub === 'approve') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const propertyId = args[1];
            const ok = housing.approveProperty(mp, store, bus, propertyId, userId);
            reply(mp, store, userId, ok ? 'Property approved.' : 'No pending request for that property.');
        }
        else if (sub === 'deny') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const propertyId = args[1];
            const ok = housing.denyProperty(mp, propertyId);
            reply(mp, store, userId, ok ? 'Property request denied.' : 'Property not found.');
        }
        else if (sub === 'revoke') {
            if (!checkPermission(store, userId, 'staff'))
                return reply(mp, store, userId, 'No permission.');
            const propertyId = args[1];
            const ok = housing.revokeProperty(mp, store, propertyId);
            reply(mp, store, userId, ok ? 'Property revoked.' : 'Property not found.');
        }
        else {
            reply(mp, store, userId, 'Usage: /property list | request [id] | approve [id] | deny [id] | revoke [id]');
        }
    };
    // ── Bounty ───────────────────────────────────────────────────────────────
    handlers['bounty'] = (userId, args) => {
        const sub = args[0];
        if (!sub) {
            if (!checkPermission(store, userId, 'player'))
                return reply(mp, store, userId, 'No permission.');
            const bounties = bountyMod.getAllBounties(mp, store, userId);
            const lines = Object.entries(bounties).filter(([, v]) => v > 0).map(([h, v]) => `${h}: ${v}`);
            reply(mp, store, userId, lines.length ? lines.join('\n') : 'No bounties.');
        }
        else if (sub === 'check') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            if (!target)
                return reply(mp, store, userId, `Player "${args[1]}" not found.`);
            const bounties = bountyMod.getAllBounties(mp, store, target.id);
            const lines = Object.entries(bounties).filter(([, v]) => v > 0).map(([h, v]) => `${h}: ${v}`);
            reply(mp, store, userId, `Bounties for ${target.name}:\n${lines.length ? lines.join('\n') : 'None'}`);
        }
        else if (sub === 'add') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            const holdId = (args[2] ?? '').toLowerCase();
            const amount = parseInt(args[3]);
            if (!target || !holdId || !amount)
                return reply(mp, store, userId, 'Usage: /bounty add [name] [holdId] [amount]');
            bountyMod.addBounty(mp, store, bus, target.id, holdId, amount);
            reply(mp, store, userId, `Added ${amount} bounty for ${target.name} in ${holdId}.`);
        }
        else if (sub === 'clear') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            const holdId = (args[2] ?? '').toLowerCase();
            if (!target || !holdId)
                return reply(mp, store, userId, 'Usage: /bounty clear [name] [holdId]');
            bountyMod.clearBounty(mp, store, bus, target.id, holdId);
            reply(mp, store, userId, `Cleared bounty for ${target.name} in ${holdId}.`);
        }
        else {
            reply(mp, store, userId, 'Usage: /bounty | check [name] | add [name] [hold] [amount] | clear [name] [hold]');
        }
    };
    // ── Justice ──────────────────────────────────────────────────────────────
    handlers['arrest'] = (userId, args) => {
        if (!checkPermission(store, userId, 'leader'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        const officer = store.get(userId);
        const holdId = officer ? officer.holdId : null;
        if (!holdId)
            return reply(mp, store, userId, 'You are not assigned to a hold.');
        const jarlId = _findJarlForHold(store, holdId);
        const ok = prison.queueForSentencing(mp, store, bus, target.id, holdId, userId, jarlId ?? userId);
        reply(mp, store, userId, ok ? `${target.name} queued for sentencing.` : `${target.name} is already in queue.`);
    };
    handlers['sentence'] = (userId, args) => {
        if (!checkPermission(store, userId, 'leader'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        const type = (args[1] ?? '').toLowerCase();
        if (!['fine', 'release', 'banish'].includes(type))
            return reply(mp, store, userId, 'Usage: /sentence [name] fine [amount] | release | banish');
        const sentence = { type: type };
        if (type === 'fine')
            sentence.fineAmount = parseInt(args[2]) || 0;
        const ok = prison.sentencePlayer(mp, store, bus, target.id, userId, sentence);
        reply(mp, store, userId, ok ? `Sentenced ${target.name}: ${type}.` : `${target.name} is not in queue.`);
    };
    // ── Captivity ────────────────────────────────────────────────────────────
    handlers['capture'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        if (!target.isDown)
            return reply(mp, store, userId, `${target.name} is not downed.`);
        captivity.capturePlayer(mp, store, bus, target.id, userId);
        reply(mp, store, userId, `${target.name} taken captive.`);
    };
    handlers['release'] = (userId, args) => {
        if (!checkPermission(store, userId, 'player'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        captivity.releasePlayer(mp, store, bus, target.id);
        reply(mp, store, userId, `${target.name} released.`);
    };
    // ── Combat (staff) ───────────────────────────────────────────────────────
    handlers['down'] = (userId, args) => {
        if (!checkPermission(store, userId, 'staff'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        combat.downPlayer(mp, store, bus, target.id, userId);
        reply(mp, store, userId, `${target.name} forced down.`);
    };
    handlers['rise'] = (userId, args) => {
        if (!checkPermission(store, userId, 'staff'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        combat.risePlayer(mp, store, bus, target.id);
        reply(mp, store, userId, `${target.name} risen.`);
    };
    handlers['nvfl'] = (userId, args) => {
        if (!checkPermission(store, userId, 'staff'))
            return reply(mp, store, userId, 'No permission.');
        if (args[0] === 'clear') {
            const target = findPlayer(store, args[1]);
            if (!target)
                return reply(mp, store, userId, `Player "${args[1]}" not found.`);
            nvfl.clearNvfl(store, target.id);
            reply(mp, store, userId, `NVFL cleared for ${target.name}.`);
        }
        else {
            reply(mp, store, userId, 'Usage: /nvfl clear [name]');
        }
    };
    // ── Factions ─────────────────────────────────────────────────────────────
    handlers['faction'] = (userId, args) => {
        const sub = args[0];
        if (sub === 'join') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            const factionId = (args[2] ?? '').toLowerCase();
            const rank = args[3] !== undefined ? parseInt(args[3]) : 0;
            if (!target || !factionId)
                return reply(mp, store, userId, 'Usage: /faction join [name] [factionId] (rank)');
            factions.joinFaction(mp, store, bus, target.id, factionId, rank);
            reply(mp, store, userId, `${target.name} joined ${factionId} at rank ${rank}.`);
        }
        else if (sub === 'leave') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            const factionId = (args[2] ?? '').toLowerCase();
            if (!target || !factionId)
                return reply(mp, store, userId, 'Usage: /faction leave [name] [factionId]');
            factions.leaveFaction(mp, store, bus, target.id, factionId);
            reply(mp, store, userId, `${target.name} left ${factionId}.`);
        }
        else if (sub === 'rank') {
            if (!checkPermission(store, userId, 'leader'))
                return reply(mp, store, userId, 'No permission.');
            const target = findPlayer(store, args[1]);
            const factionId = (args[2] ?? '').toLowerCase();
            const rank = parseInt(args[3]);
            if (!target || !factionId || isNaN(rank))
                return reply(mp, store, userId, 'Usage: /faction rank [name] [factionId] [rank]');
            factions.joinFaction(mp, store, bus, target.id, factionId, rank);
            reply(mp, store, userId, `${target.name} set to rank ${rank} in ${factionId}.`);
        }
        else if (sub === 'bbb') {
            if (args[1] === 'set') {
                if (!checkPermission(store, userId, 'staff'))
                    return reply(mp, store, userId, 'No permission.');
                reply(mp, store, userId, 'BBB set not yet implemented (requires multi-line input).');
            }
            else {
                const factionId = (args[1] ?? '').toLowerCase();
                const doc = factions.getFactionDocument(mp, factionId);
                if (!doc)
                    return reply(mp, store, userId, `No BBB document for ${factionId}.`);
                reply(mp, store, userId, `[${factionId}] Benefits: ${doc.benefits}\nBurdens: ${doc.burdens}\nBylaws: ${doc.bylaws}`);
            }
        }
        else {
            reply(mp, store, userId, 'Usage: /faction join|leave|rank|bbb ...');
        }
    };
    // ── Staff utilities ──────────────────────────────────────────────────────
    handlers['sober'] = (userId, args) => {
        if (!checkPermission(store, userId, 'staff'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        drunkBar.soberPlayer(mp, store, bus, target.id);
        reply(mp, store, userId, `${target.name} sobered.`);
    };
    handlers['feed'] = (userId, args) => {
        if (!checkPermission(store, userId, 'staff'))
            return reply(mp, store, userId, 'No permission.');
        const target = findPlayer(store, args[0]);
        if (!target)
            return reply(mp, store, userId, `Player "${args[0]}" not found.`);
        const levels = parseInt(args[1]) || 5;
        hunger.feedPlayer(mp, store, bus, target.id, levels);
        reply(mp, store, userId, `Fed ${target.name} (${levels} levels).`);
    };
    console.log(`[commands] Registered ${Object.keys(handlers).length} commands`);
    function handle(userId, text) {
        const parsed = parseCommand(text);
        if (!parsed)
            return false;
        const handler = handlers[parsed.cmd];
        if (!handler) {
            reply(mp, store, userId, `Unknown command: /${parsed.cmd}`);
            return true;
        }
        try {
            handler(userId, parsed.args);
        }
        catch (err) {
            console.error(`[commands] Error in /${parsed.cmd} for ${userId}: ${err.message}`);
            reply(mp, store, userId, 'Command error — see server log.');
        }
        return true;
    }
    return { handle };
}
// ── Private helpers ───────────────────────────────────────────────────────────
function _findUserIdByName(store, name) {
    const player = store.getAll().find(p => p.name.toLowerCase() === (name ?? '').toLowerCase());
    return player ? player.id : null;
}
function _findStewardForProperty(store, propertyId) {
    const prop = housing.getProperty(propertyId);
    if (!prop)
        return null;
    const candidates = store.getAll().filter(p => p.holdId === prop.holdId && p.isLeader);
    return candidates.length ? candidates[0].id : null;
}
function _findJarlForHold(store, holdId) {
    const candidates = store.getAll().filter(p => p.holdId === holdId && p.isLeader);
    return candidates.length ? candidates[0].id : null;
}


/***/ },

/***/ 503
(__unused_webpack_module, exports) {


// ── Event Bus ─────────────────────────────────────────────────────────────────
// Minimal event emitter for inter-system communication.
// Systems never call each other directly — they dispatch events and listen.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bus = void 0;
const handlers = new Map();
function on(type, fn) {
    if (!handlers.has(type))
        handlers.set(type, []);
    handlers.get(type).push(fn);
}
function off(type, fn) {
    if (!handlers.has(type))
        return;
    const list = handlers.get(type).filter(h => h !== fn);
    handlers.set(type, list);
}
function dispatch(event) {
    const list = handlers.get(event.type);
    if (!list)
        return;
    for (const fn of list) {
        try {
            fn(event);
        }
        catch (err) {
            console.error(`[bus] Handler error for "${event.type}": ${err.message}`);
        }
    }
}
exports.bus = { on, off, dispatch };


/***/ },

/***/ 56
(__unused_webpack_module, exports) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.safeGet = safeGet;
exports.safeSet = safeSet;
function safeGet(mp, actorId, key, fallback) {
    if (!actorId)
        return fallback;
    try {
        const val = mp.get(actorId, key);
        return (val !== null && val !== undefined) ? val : fallback;
    }
    catch {
        return fallback;
    }
}
function safeSet(mp, actorId, key, value) {
    if (!actorId)
        return false;
    try {
        mp.set(actorId, key, value);
        return true;
    }
    catch {
        return false;
    }
}


/***/ },

/***/ 552
(__unused_webpack_module, exports) {


// ── Player Store ──────────────────────────────────────────────────────────────
// In-memory state for all connected players, keyed by SkyMP userId.
// Cleared on disconnect — persistent data lives in mp.set / mp.get.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.store = void 0;
const players = new Map();
function defaultState(id, actorId, name) {
    return {
        id,
        actorId,
        name,
        holdId: null,
        factions: [],
        bounty: {},
        isDown: false,
        isCaptive: false,
        downedAt: null,
        captiveAt: null,
        properties: [],
        hungerLevel: 10,
        drunkLevel: 0,
        septims: 0,
        stipendPaidHours: 0,
        minutesOnline: 0,
        isStaff: false,
        isLeader: false,
    };
}
function register(id, actorId, name) {
    players.set(id, defaultState(id, actorId, name));
}
function deregister(id) {
    players.delete(id);
}
function get(id) {
    return players.get(id) ?? null;
}
function getAll() {
    return Array.from(players.values());
}
function update(id, patch) {
    const player = players.get(id);
    if (!player)
        throw new Error(`store.update: unknown player ${id}`);
    Object.assign(player, patch);
}
exports.store = { register, deregister, get, getAll, update };


/***/ },

/***/ 100
(__unused_webpack_module, exports, __webpack_require__) {


// ── World Store ───────────────────────────────────────────────────────────────
// File-backed key-value store for world-level data (properties, prison queue,
// faction docs). Avoids depending on any SkyMP form ID existing.
// Writes are synchronous to prevent partial-write corruption on crash.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.get = get;
exports.set = set;
const fs_1 = __importDefault(__webpack_require__(896));
const path_1 = __importDefault(__webpack_require__(928));
const FILE = path_1.default.join(__dirname, '..', '..', 'world', 'ff-world-data.json');
let _cache = null;
function _load() {
    if (_cache)
        return _cache;
    try {
        _cache = JSON.parse(fs_1.default.readFileSync(FILE, 'utf8'));
    }
    catch {
        _cache = {};
    }
    return _cache;
}
function _save() {
    const dir = path_1.default.dirname(FILE);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    fs_1.default.writeFileSync(FILE, JSON.stringify(_cache, null, 2));
}
function get(key) {
    const data = _load();
    return data[key] !== undefined ? data[key] : null;
}
function set(key, value) {
    _load();
    _cache[key] = value;
    _save();
}


/***/ },

/***/ 229
(__unused_webpack_module, exports, __webpack_require__) {


// ── Frostfall Roleplay — Entry Point ─────────────────────────────────────────
// Wires all systems together and hands control to the SkyMP runtime.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.init = init;
const store_1 = __webpack_require__(552);
const bus_1 = __webpack_require__(503);
const probeGlobals_1 = __webpack_require__(805);
const wsClient = __importStar(__webpack_require__(862));
const chat = __importStar(__webpack_require__(809));
const courier = __importStar(__webpack_require__(924));
const hunger = __importStar(__webpack_require__(92));
const drunkBar = __importStar(__webpack_require__(968));
const economy = __importStar(__webpack_require__(15));
const bounty = __importStar(__webpack_require__(667));
const factions = __importStar(__webpack_require__(757));
const housing = __importStar(__webpack_require__(121));
const combat = __importStar(__webpack_require__(421));
const captivity = __importStar(__webpack_require__(800));
const prison = __importStar(__webpack_require__(239));
const college = __importStar(__webpack_require__(316));
const skills = __importStar(__webpack_require__(399));
const training = __importStar(__webpack_require__(491));
const commands = __importStar(__webpack_require__(592));
function init(mp) {
    console.log('[gamemode] Frostfall Roleplay — initializing');
    // ── Dev probe: set PROBE_GLOBALS=1 to check what SkyMP's Chakra exposes ───
    if (globalThis.process?.env?.PROBE_GLOBALS === '1') {
        (0, probeGlobals_1.runGlobalProbes)().catch((err) => console.error('[probe] unhandled error: ' + String(err?.message ?? err)));
    }
    // ── Chat must be first — other systems may send messages during init ──────
    chat.init(mp);
    // ── WS relay client — init after chat so handleChatInput is available ─────
    // Defined here as a let so the closure below can capture it once commands
    // are registered later in this function.
    let handleCommand = null;
    wsClient.init(mp, (userId, text) => {
        if (!chat.handleChatInput(mp, store_1.store, userId, text)) {
            handleCommand?.(userId, text);
        }
    });
    // ── System init (courier before housing/prison so notifications work) ─────
    hunger.init(mp, store_1.store, bus_1.bus);
    drunkBar.init(mp, store_1.store, bus_1.bus);
    economy.init(mp, store_1.store, bus_1.bus);
    courier.init(mp, store_1.store, bus_1.bus);
    housing.init(mp, store_1.store, bus_1.bus);
    bounty.init(mp, store_1.store, bus_1.bus);
    combat.init(mp, store_1.store, bus_1.bus);
    captivity.init(mp, store_1.store, bus_1.bus);
    prison.init(mp, store_1.store, bus_1.bus);
    factions.init(mp, store_1.store, bus_1.bus);
    college.init(mp, store_1.store, bus_1.bus);
    skills.init(mp, store_1.store, bus_1.bus);
    training.init(mp, store_1.store, bus_1.bus);
    // ── Command layer ─────────────────────────────────────────────────────────
    const { handle: _handleCommand } = commands.registerAll(mp, store_1.store, bus_1.bus);
    handleCommand = _handleCommand;
    // ── Player lifecycle ──────────────────────────────────────────────────────
    mp.on('connect', (userId) => {
        try {
            const actorId = mp.getUserActor(userId);
            const name = (actorId && mp.get(actorId, 'name')) || `User${userId}`;
            store_1.store.register(userId, actorId, name);
            console.log(`[gamemode] ${name} (${userId}) connected`);
            // Register player with WS relay so the browser can authenticate
            wsClient.registerPlayer(mp, userId, actorId);
            // Restore per-system state in dependency order
            hunger.onConnect(mp, store_1.store, bus_1.bus, userId);
            drunkBar.onConnect(mp, store_1.store, bus_1.bus, userId);
            economy.onConnect(mp, store_1.store, bus_1.bus, userId);
            bounty.onConnect(mp, store_1.store, bus_1.bus, userId);
            factions.onConnect(mp, store_1.store, bus_1.bus, userId);
            housing.onConnect(mp, store_1.store, bus_1.bus, userId);
            college.onConnect(mp, store_1.store, bus_1.bus, userId);
            skills.onConnect(mp, store_1.store, bus_1.bus, userId);
            courier.onConnect(mp, store_1.store, bus_1.bus, userId);
        }
        catch (err) {
            console.error(`[gamemode] connect error for ${userId}: ${err.message}`);
        }
    });
    mp.on('disconnect', (userId) => {
        try {
            const player = store_1.store.get(userId);
            if (player)
                console.log(`[gamemode] ${player.name} (${userId}) disconnected`);
            skills.onSkillPlayerDisconnect(mp, userId);
            store_1.store.deregister(userId);
        }
        catch (err) {
            console.error(`[gamemode] disconnect error for ${userId}: ${err.message}`);
        }
    });
    // ── Chat input from the browser ───────────────────────────────────────────
    // Called by the C++ layer when ctx.sendEvent(text) fires on the client.
    // First arg is the actor's refrId, second is the raw text the player typed.
    // handleChatInput handles __reload__, all channels (/me /ooc /w /f), proximity,
    // history, and returns false only for unknown /commands so we can route them.
    mp['cef_chat_send'] = (refrId, text) => {
        try {
            if (typeof text !== 'string')
                return;
            const userId = mp.getUserByActor(refrId);
            if (!chat.handleChatInput(mp, store_1.store, userId, text)) {
                handleCommand(userId, text);
            }
        }
        catch (err) {
            console.error(`[chat] cef_chat_send error: ${err.message}`);
        }
    };
    console.log('[gamemode] Frostfall Roleplay — ready');
}
// ── SkyMP runtime bootstrap ───────────────────────────────────────────────────
// The server sets globalThis.mp before require()-ing this file and never calls
// init() itself — so we self-execute here using the global mp object.
init(globalThis.mp);


/***/ },

/***/ 800
(__unused_webpack_module, exports) {


// ── Captivity ─────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isCaptive = isCaptive;
exports.getCaptivityRemainingMs = getCaptivityRemainingMs;
exports.capturePlayer = capturePlayer;
exports.releasePlayer = releasePlayer;
exports.checkExpiredCaptivity = checkExpiredCaptivity;
exports.init = init;
// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_INTERVAL_MS = 60 * 1000;
// ── Pure helpers ──────────────────────────────────────────────────────────────
function isCaptive(store, playerId) {
    const player = store.get(playerId);
    return player ? player.isCaptive : false;
}
function getCaptivityRemainingMs(store, playerId, now) {
    const player = store.get(playerId);
    if (!player || !player.isCaptive || player.captiveAt === null)
        return 0;
    const ts = now ?? Date.now();
    return Math.max(0, MAX_CAPTIVITY_MS - (ts - player.captiveAt));
}
// ── Actions ───────────────────────────────────────────────────────────────────
function capturePlayer(mp, store, bus, captiveId, captorId) {
    const captive = store.get(captiveId);
    const captor = store.get(captorId);
    if (!captive)
        return;
    const now = Date.now();
    store.update(captiveId, { isCaptive: true, captiveAt: now });
    mp.sendCustomPacket(captive.actorId, 'playerCaptured', { remainingMs: MAX_CAPTIVITY_MS });
    if (captor)
        mp.sendCustomPacket(captor.actorId, 'playerCaptured', { captiveId });
    bus.dispatch({ type: 'playerCaptured', captiveId, captorId });
}
function releasePlayer(mp, store, bus, captiveId) {
    const captive = store.get(captiveId);
    if (!captive)
        return;
    store.update(captiveId, { isCaptive: false, captiveAt: null });
    mp.sendCustomPacket(captive.actorId, 'playerReleased', {});
    bus.dispatch({ type: 'playerReleased', captiveId });
}
function checkExpiredCaptivity(mp, store, bus, now) {
    const ts = now ?? Date.now();
    const released = [];
    for (const player of store.getAll()) {
        if (player.isCaptive && player.captiveAt !== null) {
            if ((ts - player.captiveAt) >= MAX_CAPTIVITY_MS) {
                releasePlayer(mp, store, bus, player.id);
                released.push(player.id);
            }
        }
    }
    return released;
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[captivity] Initializing');
    const scheduleTick = () => {
        setTimeout(() => {
            try {
                checkExpiredCaptivity(mp, store, bus);
            }
            catch (err) {
                console.error(`[captivity] Tick error: ${err.message}`);
            }
            scheduleTick();
        }, CHECK_INTERVAL_MS);
    };
    scheduleTick();
    console.log('[captivity] Started');
}


/***/ },

/***/ 421
(__unused_webpack_module, exports) {


// ── Combat ────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isDowned = isDowned;
exports.downPlayer = downPlayer;
exports.risePlayer = risePlayer;
exports.init = init;
// ── Constants ─────────────────────────────────────────────────────────────────
const LOOT_CAP_GOLD = 500;
const LOOT_CAP_ITEMS = 3;
// ── Pure helpers ──────────────────────────────────────────────────────────────
function isDowned(store, playerId) {
    const player = store.get(playerId);
    return player ? player.isDown : false;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function downPlayer(mp, store, bus, victimId, attackerId) {
    const victim = store.get(victimId);
    const attacker = store.get(attackerId);
    if (!victim)
        return;
    store.update(victimId, { isDown: true, downedAt: Date.now() });
    const lootInfo = { lootCapGold: LOOT_CAP_GOLD, lootCapItems: LOOT_CAP_ITEMS };
    mp.sendCustomPacket(victim.actorId, 'playerDowned', lootInfo);
    if (attacker)
        mp.sendCustomPacket(attacker.actorId, 'playerDowned', lootInfo);
    bus.dispatch({
        type: 'playerDowned',
        victimId,
        attackerId,
        holdId: victim.holdId,
    });
}
function risePlayer(mp, store, bus, playerId) {
    const player = store.get(playerId);
    if (!player)
        return;
    // Preserve downedAt for NVFL — only clear isDown
    store.update(playerId, { isDown: false });
    mp.sendCustomPacket(player.actorId, 'playerRisen', {});
    bus.dispatch({ type: 'playerRisen', playerId });
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[combat] Initializing');
    // No ticks or makeProperty needed — downPlayer/risePlayer are called externally
    console.log('[combat] Started');
}


/***/ },

/***/ 315
(__unused_webpack_module, exports) {


// ── NVFL ──────────────────────────────────────────────────────────────────────
// No Violence For Life — 24-hour protection window after being downed.
// Pure functions; no mp calls, no side effects.
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isNvflRestricted = isNvflRestricted;
exports.getNvflRemainingMs = getNvflRemainingMs;
exports.clearNvfl = clearNvfl;
const NVFL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
function isNvflRestricted(store, playerId, now) {
    const player = store.get(playerId);
    if (!player || player.downedAt === null)
        return false;
    const ts = now ?? Date.now();
    return (ts - player.downedAt) < NVFL_WINDOW_MS;
}
function getNvflRemainingMs(store, playerId, now) {
    const player = store.get(playerId);
    if (!player || player.downedAt === null)
        return 0;
    const ts = now ?? Date.now();
    const elapsed = ts - player.downedAt;
    return Math.max(0, NVFL_WINDOW_MS - elapsed);
}
function clearNvfl(store, playerId) {
    const player = store.get(playerId);
    if (!player)
        return;
    store.update(playerId, { downedAt: null });
}


/***/ },

/***/ 809
(__unused_webpack_module, exports, __webpack_require__) {


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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MAX_MSG_LEN = void 0;
exports.init = init;
exports.handleChatInput = handleChatInput;
exports.sendSystem = sendSystem;
exports.broadcastSystem = broadcastSystem;
exports.sendToPlayer = sendToPlayer;
exports.broadcast = broadcast;
const mpUtil_1 = __webpack_require__(56);
const wsClient = __importStar(__webpack_require__(862));
// ── Config ────────────────────────────────────────────────────────────────────
const CHAT_MSG_PROP = 'ff_chatMsg';
const SAY_RANGE = 3500; // Skyrim units ≈ 50 m
const WHISPER_RANGE = 400; // units ≈ 6 m  (must be standing next to someone)
exports.MAX_MSG_LEN = 300;
const MAX_HISTORY = 30; // msgs kept server-side per player for reload replay
const BROWSER_LIMIT = 100; // ring-buffer cap inside the browser
const RATE_LIMIT_MS = 1000; // minimum ms between messages per player
// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
    nameIc: '#e8c87a', // golden  — IC speaker
    nameOoc: '#8888bb', // slate   — OOC speaker
    nameFaction: '#66bb66', // green   — faction chat
    nameWhisper: '#bb88cc', // purple  — whisper
    nameSystem: '#ff9933', // orange  — [System] prefix
    tagIc: '#666666', // dim     — [Say] (unused, kept for future)
    tagOoc: '#444466', // dim     — [OOC] tag
    tagFaction: '#335533', // dim grn — [Faction] tag
    tagWhisper: '#553366', // dim pur — [Whisper] tag
    msgIc: '#ffffff', // white   — IC speech
    msgOoc: '#ccccdd', // lavender— OOC text
    msgMe: '#ccccbb', // pale    — /me action text
    msgWhisper: '#cc99ff', // light pur
    msgFaction: '#aaddaa', // light grn
    system: '#ffcc44', // gold    — system body
};
function sp(text, color, types = ['text']) {
    return { text, color, opacity: 1, type: types };
}
function mkMsg(category, ...spans) {
    return { category, text: spans, opacity: 1 };
}
// ── Per-player recent-message history (for reload replay) ─────────────────────
const playerHistory = new Map();
const lastMsgTime = new Map();
function pushHistory(userId, m) {
    const h = playerHistory.get(userId) ?? [];
    h.push(m);
    if (h.length > MAX_HISTORY)
        h.shift();
    playerHistory.set(userId, h);
}
function replayHistory(mp, store, userId) {
    const player = store.get(userId);
    if (!player)
        return;
    const history = playerHistory.get(userId) ?? [];
    for (const m of history) {
        deliver(mp, player.actorId, userId, m);
    }
}
// ── Delivery ──────────────────────────────────────────────────────────────────
let _seq = 0;
function deliver(mp, actorId, userId, m) {
    if (wsClient.isConnected(userId)) {
        // Player's browser has an active WS connection — deliver directly.
        wsClient.deliver(userId, m);
    }
    else {
        // Fallback: push via SkyMP property sync (UPDATE_OWNER_JS → executeJavaScript).
        // _seq ensures uniqueness so the SP-runtime dedup never suppresses a replay.
        (0, mpUtil_1.safeSet)(mp, actorId, CHAT_MSG_PROP, JSON.stringify({ msg: m, _: ++_seq }));
    }
}
// ── Proximity helper ──────────────────────────────────────────────────────────
function dist3(a, b) {
    if (!a || !b)
        return Infinity;
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
function sendProximity(mp, store, senderActorId, m, range) {
    const origin = mp.getActorPos(senderActorId);
    for (const p of store.getAll()) {
        if (dist3(origin, mp.getActorPos(p.actorId)) <= range) {
            deliver(mp, p.actorId, p.id, m);
            pushHistory(p.id, m);
        }
    }
}
// ── Browser-side bootstrap JS ─────────────────────────────────────────────────
//
// WIDGET_EXPR is a JS expression (not a string) evaluated *in the browser*
// whenever widgets.set() is called.  It reads window.chatMessages at call time
// so each widget update carries the latest snapshot, giving React a new
// reference and triggering the useEffect([props.messages]) scroll handler.
const WIDGET_EXPR = '[{type:"chat",' +
    'messages:window.chatMessages.slice(),' +
    'send:function(t){window.skyrimPlatform.sendMessage("cef::chat:send",t);},' +
    'placeholder:"",' +
    'isInputHidden:false}]';
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
`.trim();
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
`.trim();
// ── init ──────────────────────────────────────────────────────────────────────
function init(mp) {
    mp.makeProperty(CHAT_MSG_PROP, {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: UPDATE_OWNER_JS,
        updateNeighbor: '',
    });
    mp.makeEventSource('cef_chat_send', EVENT_SOURCE_JS);
    console.log('[chat] property and event source registered');
}
// ── handleChatInput ───────────────────────────────────────────────────────────
//
// Returns true  → input was consumed (chat channel or IC speech, or __reload__)
// Returns false → not a chat channel; caller should route to commands
function handleChatInput(mp, store, userId, text) {
    // ── Special reload sentinel (fired by EVENT_SOURCE_JS on 'front-loaded') ───
    if (text === '__reload__') {
        replayHistory(mp, store, userId);
        return true;
    }
    const player = store.get(userId);
    if (!player)
        return true; // player not registered yet, silently consume
    // ── Server-side rate limiting ─────────────────────────────────────────────
    const now = Date.now();
    const last = lastMsgTime.get(userId) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
        const rateMsg = mkMsg('plain', sp('[System] ', C.nameSystem, ['nonrp']), sp('Please wait before sending another message.', C.system, ['nonrp', 'text']));
        deliver(mp, player.actorId, userId, rateMsg);
        return true;
    }
    lastMsgTime.set(userId, now);
    // Strip control characters to prevent rendering artifacts
    const raw = text.trim().replace(/[\x00-\x1F\x7F]/g, '');
    if (!raw || raw.length > exports.MAX_MSG_LEN)
        return true;
    const lower = raw.toLowerCase();
    // ── /me <action> ─────────────────────────────────────────────────────────
    if (lower.startsWith('/me ')) {
        const action = raw.slice(4).trim();
        if (!action)
            return true;
        const m = mkMsg('rp', sp('* ', C.tagIc, ['nonrp']), sp(player.name, C.nameIc, ['nonrp']), sp(' ' + action + ' *', C.msgMe, ['rp']));
        sendProximity(mp, store, player.actorId, m, SAY_RANGE);
        console.log(`[chat:me] ${player.name} ${action}`);
        return true;
    }
    // ── /ooc <text> ───────────────────────────────────────────────────────────
    if (lower.startsWith('/ooc ') || lower === '/ooc') {
        const body = raw.slice(5).trim();
        if (!body)
            return true;
        const m = mkMsg('plain', sp('[OOC] ', C.tagOoc, ['nonrp']), sp(player.name + ': ', C.nameOoc, ['nonrp']), sp(body, C.msgOoc, ['nonrp', 'text']));
        for (const p of store.getAll()) {
            deliver(mp, p.actorId, p.id, m);
            pushHistory(p.id, m);
        }
        console.log(`[chat:ooc] ${player.name}: ${body}`);
        return true;
    }
    // ── /w <name> <text> ──────────────────────────────────────────────────────
    if (lower.startsWith('/w ')) {
        const rest = raw.slice(3).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx === -1)
            return true;
        const targetName = rest.slice(0, spaceIdx).toLowerCase();
        const body = rest.slice(spaceIdx + 1).trim();
        if (!body)
            return true;
        const target = store.getAll().find(p => p.name.toLowerCase() === targetName);
        if (!target) {
            const notFound = mkMsg('plain', sp('[Whisper] ', C.tagWhisper, ['nonrp']), sp(`Player "${rest.slice(0, spaceIdx)}" is not online.`, C.system, ['nonrp', 'text']));
            deliver(mp, player.actorId, userId, notFound);
            return true;
        }
        const d = dist3(mp.getActorPos(player.actorId), mp.getActorPos(target.actorId));
        if (d > WHISPER_RANGE) {
            const tooFar = mkMsg('plain', sp('[Whisper] ', C.tagWhisper, ['nonrp']), sp('Too far away to whisper.', C.system, ['nonrp', 'text']));
            deliver(mp, player.actorId, userId, tooFar);
            return true;
        }
        const toTarget = mkMsg('plain', sp('[Whisper] ', C.tagWhisper, ['nonrp']), sp(player.name + ' whispers: ', C.nameWhisper, ['nonrp']), sp(body, C.msgWhisper, ['text']));
        const toSelf = mkMsg('plain', sp('[→ ' + target.name + '] ', C.tagWhisper, ['nonrp']), sp(body, C.msgWhisper, ['text']));
        deliver(mp, target.actorId, target.id, toTarget);
        pushHistory(target.id, toTarget);
        deliver(mp, player.actorId, userId, toSelf);
        pushHistory(player.id, toSelf);
        console.log(`[chat:whisper] ${player.name} → ${target.name}: ${body}`);
        return true;
    }
    // ── /f <text> (faction chat) ──────────────────────────────────────────────
    if (lower.startsWith('/f ') || lower === '/f') {
        const body = raw.slice(3).trim();
        if (!body)
            return true;
        if (!player.factions.length) {
            const noFaction = mkMsg('plain', sp('[Faction] ', C.tagFaction, ['nonrp']), sp('You are not in a faction.', C.system, ['nonrp', 'text']));
            deliver(mp, player.actorId, userId, noFaction);
            return true;
        }
        const m = mkMsg('plain', sp('[Faction] ', C.tagFaction, ['nonrp']), sp(player.name + ': ', C.nameFaction, ['nonrp']), sp(body, C.msgFaction, ['text']));
        for (const p of store.getAll()) {
            if (p.factions.some(f => player.factions.includes(f))) {
                deliver(mp, p.actorId, p.id, m);
                pushHistory(p.id, m);
            }
        }
        console.log(`[chat:faction] ${player.name}: ${body}`);
        return true;
    }
    // ── Unknown /command → let caller route to command handler ───────────────
    if (raw.startsWith('/'))
        return false;
    // ── IC (proximity speech, default) ───────────────────────────────────────
    const m = mkMsg('plain', sp(player.name + ': ', C.nameIc, ['text']), sp(raw, C.msgIc, ['text']));
    sendProximity(mp, store, player.actorId, m, SAY_RANGE);
    console.log(`[chat:ic] ${player.name}: ${raw}`);
    return true;
}
// ── Named API ─────────────────────────────────────────────────────────────────
/**
 * Send a styled [System] message to a single player.
 */
function sendSystem(mp, store, userId, text) {
    const player = store.get(userId);
    if (!player)
        return;
    const m = mkMsg('plain', sp('[System] ', C.nameSystem, ['nonrp']), sp(text, C.system, ['nonrp', 'text']));
    deliver(mp, player.actorId, userId, m);
    pushHistory(userId, m);
}
/**
 * Broadcast a styled [System] message to all connected players.
 */
function broadcastSystem(mp, store, text) {
    const m = mkMsg('plain', sp('[System] ', C.nameSystem, ['nonrp']), sp(text, C.system, ['nonrp', 'text']));
    for (const p of store.getAll()) {
        deliver(mp, p.actorId, p.id, m);
        pushHistory(p.id, m);
    }
    console.log(`[chat:system] ${text}`);
}
/**
 * Send a plain-text message to a single player.
 * Kept for backward compatibility with other systems that call this directly.
 */
function sendToPlayer(mp, store, userId, text, color = '#ffffff') {
    const player = store.get(userId);
    if (!player)
        return;
    const m = mkMsg('plain', sp(text, color, ['text']));
    deliver(mp, player.actorId, userId, m);
    pushHistory(userId, m);
}
/**
 * Broadcast a plain-text message to all connected players.
 * Kept for backward compatibility.
 */
function broadcast(mp, store, text, color = '#ffffff') {
    const m = mkMsg('plain', sp(text, color, ['text']));
    for (const p of store.getAll()) {
        deliver(mp, p.actorId, p.id, m);
        pushHistory(p.id, m);
    }
}


/***/ },

/***/ 924
(__unused_webpack_module, exports, __webpack_require__) {


// ── Courier ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createNotification = createNotification;
exports.filterExpired = filterExpired;
exports.getUnread = getUnread;
exports.sendNotification = sendNotification;
exports.markRead = markRead;
exports.getPendingNotifications = getPendingNotifications;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// ── Pure helpers ──────────────────────────────────────────────────────────────
let _nextId = 1;
function createNotification(type, fromPlayerId, toPlayerId, holdId, payload, now) {
    const ts = now ?? Date.now();
    return {
        id: _nextId++,
        type,
        fromPlayerId,
        toPlayerId,
        holdId,
        payload,
        createdAt: ts,
        expiresAt: ts + DEFAULT_EXPIRY_MS,
        read: false,
    };
}
function filterExpired(notifications, now) {
    const ts = now ?? Date.now();
    return notifications.filter(n => n.expiresAt === null || ts < n.expiresAt);
}
function getUnread(notifications) {
    return notifications.filter(n => !n.read);
}
// ── Actions ───────────────────────────────────────────────────────────────────
function sendNotification(mp, store, notification) {
    const recipient = store.get(notification.toPlayerId);
    if (!recipient)
        return;
    const existing = mp.get(recipient.actorId, 'ff_courier') ?? [];
    const pruned = filterExpired(existing);
    pruned.push(notification);
    mp.set(recipient.actorId, 'ff_courier', pruned);
    mp.sendCustomPacket(recipient.actorId, 'courierNotification', notification);
}
function markRead(mp, store, playerId, notificationId) {
    const player = store.get(playerId);
    if (!player)
        return;
    const notes = mp.get(player.actorId, 'ff_courier') ?? [];
    const updated = notes.map(n => n.id === notificationId ? Object.assign({}, n, { read: true }) : n);
    mp.set(player.actorId, 'ff_courier', updated);
}
function getPendingNotifications(mp, store, playerId) {
    const player = store.get(playerId);
    if (!player)
        return [];
    const notes = mp.get(player.actorId, 'ff_courier') ?? [];
    return getUnread(filterExpired(notes));
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[courier] Initializing');
    console.log('[courier] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player || !player.actorId)
        return;
    const notes = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_courier', []);
    const pending = getUnread(filterExpired(notes));
    for (const n of pending) {
        mp.sendCustomPacket(player.actorId, 'courierNotification', n);
    }
}


/***/ },

/***/ 862
(__unused_webpack_module, exports) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.init = init;
exports.registerPlayer = registerPlayer;
exports.isConnected = isConnected;
exports.deliver = deliver;
exports.broadcast = broadcast;
const g = globalThis;
const RELAY_URL = g.process?.env?.RELAY_URL ?? 'ws://frostfall.online:7778';
const RELAY_SECRET = g.process?.env?.RELAY_SECRET ?? 'dev-relay-secret';
// Property that carries the one-time nonce to the player's browser.
// UPDATE_OWNER_JS runs in the SP runtime and injects it into window.ffWsNonce,
// then calls window.ffWsConnect() if the WS client script is already loaded.
const NONCE_PROP = 'ff_wsNonce';
const NONCE_UPDATE_JS = `
if (!ctx.value) return;
if (ctx.state.nonce === ctx.value) return;
ctx.state.nonce = ctx.value;
ctx.sp.browser.executeJavaScript(
  'window.ffWsNonce=' + JSON.stringify(ctx.value) + ';' +
  'if(typeof window.ffWsConnect==="function")window.ffWsConnect();'
);
`.trim();
let socket = null;
let ready = false;
let onChatSend = null;
// Players whose browser has completed WS auth — delivery goes over WS for these.
const connectedPlayers = new Set();
// Messages queued while socket is not yet ready.
const sendQueue = [];
// ── Internal helpers ──────────────────────────────────────────────────────────
function rawSend(payload) {
    if (ready && socket && socket.readyState === 1 /* OPEN */) {
        socket.send(payload);
    }
    else {
        sendQueue.push(payload);
    }
}
function send(msg) {
    rawSend(JSON.stringify(msg));
}
function flushQueue() {
    while (sendQueue.length > 0) {
        const payload = sendQueue.shift();
        if (socket && socket.readyState === 1)
            socket.send(payload);
    }
}
function connect() {
    try {
        socket = new g.WebSocket(RELAY_URL);
    }
    catch (err) {
        console.error('[ws-client] failed to create socket:', err?.message ?? err);
        setTimeout(connect, 5000);
        return;
    }
    socket.onopen = () => {
        send({ type: 'auth', role: 'gamemode', secret: RELAY_SECRET });
    };
    socket.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        }
        catch {
            return;
        }
        if (msg.type === 'auth_ok') {
            ready = true;
            console.log('[ws-client] connected to relay at', RELAY_URL);
            flushQueue();
            return;
        }
        if (msg.type === 'player_connected') {
            connectedPlayers.add(msg.userId);
            console.log(`[ws-client] player ${msg.userId} browser connected`);
            return;
        }
        if (msg.type === 'player_disconnected') {
            connectedPlayers.delete(msg.userId);
            return;
        }
        if (msg.type === 'chat_send' && onChatSend) {
            onChatSend(msg.userId, msg.text);
        }
    };
    socket.onclose = () => {
        ready = false;
        socket = null;
        connectedPlayers.clear();
        console.log('[ws-client] relay disconnected — reconnecting in 3s');
        setTimeout(connect, 3000);
    };
    socket.onerror = (err) => {
        console.error('[ws-client] socket error:', err?.message ?? String(err));
    };
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Initialise the WS client. Must be called once during gamemode init.
 * onChatSendFn is invoked whenever a player sends a chat message over WS.
 */
function init(mp, onChatSendFn) {
    onChatSend = onChatSendFn;
    mp.makeProperty(NONCE_PROP, {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: NONCE_UPDATE_JS,
        updateNeighbor: '',
    });
    connect();
    console.log('[ws-client] initialized');
}
/**
 * Call when a player connects to SkyMP.
 * Generates a nonce, registers it with the relay, and pushes it to the
 * player's browser so skymp5-front can authenticate its WS connection.
 */
function registerPlayer(mp, userId, actorId) {
    const nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    send({ type: 'register_nonce', nonce, userId });
    mp.set(actorId, NONCE_PROP, nonce);
}
/**
 * Returns true if this player's browser has an active WS connection.
 * Used by chat.ts to choose between WS delivery and mp.set fallback.
 */
function isConnected(userId) {
    return connectedPlayers.has(userId);
}
/**
 * Deliver a chat message to a single player over WS.
 */
function deliver(userId, msg) {
    send({ type: 'chat_deliver', userId, msg });
}
/**
 * Broadcast a chat message to all WS-connected players.
 * Falls back gracefully — players not on WS won't receive this call,
 * so callers must still handle non-WS players via mp.set.
 */
function broadcast(msg) {
    send({ type: 'chat_broadcast', msg });
}


/***/ },

/***/ 15
(__unused_webpack_module, exports, __webpack_require__) {


// ── Economy ───────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isStipendEligible = isStipendEligible;
exports.shouldPayStipend = shouldPayStipend;
exports.transferGold = transferGold;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const STIPEND_RATE = 50; // Septims per hour
const STIPEND_CAP_HOURS = 24;
const STIPEND_INTERVAL_MIN = 60; // pay every 60 minutes of playtime
const TICK_INTERVAL_MS = 60 * 1000;
// ── Pure helpers ──────────────────────────────────────────────────────────────
function isStipendEligible(stipendPaidHours) {
    return stipendPaidHours < STIPEND_CAP_HOURS;
}
function shouldPayStipend(minutesOnline, stipendPaidHours) {
    if (!isStipendEligible(stipendPaidHours))
        return false;
    return minutesOnline > 0 && minutesOnline % STIPEND_INTERVAL_MIN === 0;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function transferGold(mp, store, fromId, toId, amount) {
    if (!amount || amount <= 0)
        return false;
    const from = store.get(fromId);
    const to = store.get(toId);
    if (!from || !to)
        return false;
    if (from.septims < amount)
        return false;
    const fromGold = from.septims - amount;
    const toGold = to.septims + amount;
    store.update(fromId, { septims: fromGold });
    store.update(toId, { septims: toGold });
    // Sync to inventory gold
    mp.set(from.actorId, 'inv', _setGoldInInventory(mp.get(from.actorId, 'inv'), fromGold));
    mp.set(to.actorId, 'inv', _setGoldInInventory(mp.get(to.actorId, 'inv'), toGold));
    return true;
}
// ── Internal ──────────────────────────────────────────────────────────────────
const GOLD_BASE_ID = 0x0000000F;
function _getGoldFromInventory(inv) {
    if (!inv || !inv.entries)
        return 0;
    const entry = inv.entries.find(e => e.baseId === GOLD_BASE_ID);
    return entry ? entry.count : 0;
}
function _setGoldInInventory(inv, amount) {
    const entries = (inv && inv.entries) ? inv.entries.filter(e => e.baseId !== GOLD_BASE_ID) : [];
    if (amount > 0)
        entries.push({ baseId: GOLD_BASE_ID, count: amount });
    return { entries };
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[economy] Initializing');
    const scheduleTick = () => {
        setTimeout(() => {
            try {
                for (const player of store.getAll()) {
                    if (shouldPayStipend(player.minutesOnline, player.stipendPaidHours) && player.actorId) {
                        const newSeptims = player.septims + STIPEND_RATE;
                        const newHours = player.stipendPaidHours + 1;
                        store.update(player.id, { septims: newSeptims, stipendPaidHours: newHours });
                        const inv = (0, mpUtil_1.safeGet)(mp, player.actorId, 'inv', null);
                        mp.set(player.actorId, 'inv', _setGoldInInventory(inv, newSeptims));
                        mp.set(player.actorId, 'ff_stipendHours', newHours);
                        bus.dispatch({ type: 'stipendTick', playerId: player.id, septims: newSeptims, stipendPaidHours: newHours });
                    }
                }
            }
            catch (err) {
                console.error(`[economy] Tick error: ${err.message}`);
            }
            scheduleTick();
        }, TICK_INTERVAL_MS);
    };
    scheduleTick();
    console.log('[economy] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player)
        return;
    const inv = (0, mpUtil_1.safeGet)(mp, player.actorId, 'inv', null);
    const gold = _getGoldFromInventory(inv);
    store.update(userId, { septims: gold });
    const hours = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_stipendHours', 0);
    store.update(userId, { stipendPaidHours: hours });
}


/***/ },

/***/ 316
(__unused_webpack_module, exports, __webpack_require__) {


// ── College of Winterhold ─────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getCollegeRank = getCollegeRank;
exports.getTomeRank = getTomeRank;
exports.getStudyXp = getStudyXp;
exports.getCollegeRankForPlayer = getCollegeRankForPlayer;
exports.studyTome = studyTome;
exports.startLecture = startLecture;
exports.joinLecture = joinLecture;
exports.endLecture = endLecture;
exports.getActiveLecture = getActiveLecture;
exports.hasLectureBoost = hasLectureBoost;
exports.getLectureBoostRemainingMs = getLectureBoostRemainingMs;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const RANK_THRESHOLDS = [
    { rank: 'novice', xp: 0 },
    { rank: 'apprentice', xp: 100 },
    { rank: 'adept', xp: 300 },
    { rank: 'expert', xp: 600 },
    { rank: 'master', xp: 1000 },
];
const LECTURE_XP_ATTENDEE = 50;
const LECTURE_XP_LECTURER = 25;
const LECTURE_BOOST_MS = 24 * 60 * 60 * 1000; // 24h
const LECTURE_MAGICKA_MULT = 1.15;
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
};
// ── In-memory lecture sessions ────────────────────────────────────────────────
// lecturerId → { attendees: Set<userId> }
const lectures = new Map();
// ── Pure helpers ──────────────────────────────────────────────────────────────
function getCollegeRank(xp) {
    let rank = 'novice';
    for (const t of RANK_THRESHOLDS) {
        if (xp >= t.xp)
            rank = t.rank;
    }
    return rank;
}
function getTomeRank(tomeBaseId) {
    const xp = TOME_XP[tomeBaseId];
    if (xp === undefined)
        return null;
    if (xp >= 100)
        return 'master';
    if (xp >= 75)
        return 'expert';
    if (xp >= 50)
        return 'adept';
    if (xp >= 30)
        return 'apprentice';
    return 'novice';
}
function getStudyXp(mp, store, playerId) {
    const player = store.get(playerId);
    if (!player)
        return 0;
    const saved = mp.get(player.actorId, 'ff_study_xp');
    return (saved !== null && saved !== undefined) ? saved : 0;
}
function getCollegeRankForPlayer(mp, store, playerId) {
    return getCollegeRank(getStudyXp(mp, store, playerId));
}
// ── Actions ───────────────────────────────────────────────────────────────────
function studyTome(mp, store, bus, playerId, tomeBaseId) {
    const player = store.get(playerId);
    if (!player)
        return;
    const xpGain = TOME_XP[tomeBaseId];
    if (xpGain === undefined)
        return;
    const current = getStudyXp(mp, store, playerId);
    const newXp = current + xpGain;
    mp.set(player.actorId, 'ff_study_xp', newXp);
    bus.dispatch({ type: 'collegeXpGained', playerId, xpGain, totalXp: newXp });
}
function startLecture(mp, store, bus, lecturerId) {
    if (lectures.has(lecturerId))
        return false;
    lectures.set(lecturerId, { attendees: new Set() });
    bus.dispatch({ type: 'lectureStarted', lecturerId });
    return true;
}
function joinLecture(mp, store, bus, playerId, lecturerId) {
    const session = lectures.get(lecturerId);
    if (!session)
        return false;
    if (playerId === lecturerId)
        return false;
    session.attendees.add(playerId);
    bus.dispatch({ type: 'lectureJoined', playerId, lecturerId });
    return true;
}
function endLecture(mp, store, bus, lecturerId, now) {
    const session = lectures.get(lecturerId);
    if (!session)
        return false;
    const boostExpiry = (now ?? Date.now()) + LECTURE_BOOST_MS;
    // Award XP + boost to attendees
    for (const attendeeId of session.attendees) {
        const attendee = store.get(attendeeId);
        if (!attendee)
            continue;
        const current = getStudyXp(mp, store, attendeeId);
        mp.set(attendee.actorId, 'ff_study_xp', current + LECTURE_XP_ATTENDEE);
        mp.set(attendee.actorId, 'ff_lecture_boost', boostExpiry);
        bus.dispatch({ type: 'lectureXpGained', playerId: attendeeId, xpGain: LECTURE_XP_ATTENDEE });
    }
    // Award XP only to lecturer
    const lecturer = store.get(lecturerId);
    if (lecturer) {
        const current = getStudyXp(mp, store, lecturerId);
        mp.set(lecturer.actorId, 'ff_study_xp', current + LECTURE_XP_LECTURER);
        bus.dispatch({ type: 'lectureXpGained', playerId: lecturerId, xpGain: LECTURE_XP_LECTURER });
    }
    lectures.delete(lecturerId);
    bus.dispatch({ type: 'lectureEnded', lecturerId, attendeeCount: session.attendees.size });
    return true;
}
function getActiveLecture(lecturerId) {
    return lectures.get(lecturerId) ?? null;
}
function hasLectureBoost(mp, store, playerId, now) {
    const player = store.get(playerId);
    if (!player)
        return false;
    const expiry = mp.get(player.actorId, 'ff_lecture_boost');
    if (!expiry)
        return false;
    return (now ?? Date.now()) < expiry;
}
function getLectureBoostRemainingMs(mp, store, playerId, now) {
    const player = store.get(playerId);
    if (!player)
        return 0;
    const expiry = mp.get(player.actorId, 'ff_lecture_boost');
    if (!expiry)
        return 0;
    return Math.max(0, expiry - (now ?? Date.now()));
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[college] Initializing');
    mp.makeProperty('ff_study_xp', {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: '',
        updateNeighbor: '',
    });
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
    });
    console.log('[college] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player || !player.actorId)
        return;
    const xp = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_study_xp', 0);
    const rank = getCollegeRank(xp);
    mp.sendCustomPacket(player.actorId, 'collegeSync', { xp, rank });
}


/***/ },

/***/ 399
(__unused_webpack_module, exports, __webpack_require__) {


// ── Skills ────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SKILL_IDS = void 0;
exports.getSkillLevel = getSkillLevel;
exports.getSkillXp = getSkillXp;
exports.getSkillCap = getSkillCap;
exports.addSkillXp = addSkillXp;
exports.grantStudyBoost = grantStudyBoost;
exports.getActiveStudyBoost = getActiveStudyBoost;
exports.getStudyBoosts = getStudyBoosts;
exports.onSkillPlayerDisconnect = onSkillPlayerDisconnect;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
const factions = __importStar(__webpack_require__(757));
// ── Constants ─────────────────────────────────────────────────────────────────
const SKILL_LEVEL_XP = 10;
const DEFAULT_CAP_XP = 250; // ~level 25
exports.SKILL_IDS = [
    'destruction', 'restoration', 'alteration', 'conjuration', 'illusion',
    'smithing', 'enchanting', 'alchemy',
];
// Faction cap bonuses
const FACTION_CAPS = [
    { factionId: 'collegeOfWinterhold', minRank: 1, skills: ['destruction', 'restoration', 'alteration', 'conjuration', 'illusion'], cap: 500 },
    { factionId: 'collegeOfWinterhold', minRank: 2, skills: ['destruction', 'restoration', 'alteration', 'conjuration', 'illusion'], cap: 750 },
    { factionId: 'collegeOfWinterhold', minRank: 3, skills: ['destruction', 'restoration', 'alteration', 'conjuration', 'illusion'], cap: 1000 },
    { factionId: 'companions', minRank: 1, skills: ['smithing'], cap: 500 },
    { factionId: 'companions', minRank: 2, skills: ['smithing'], cap: 750 },
    { factionId: 'companions', minRank: 3, skills: ['smithing'], cap: 1000 },
    { factionId: 'eastEmpireCompany', minRank: 1, skills: ['smithing', 'enchanting', 'alchemy'], cap: 500 },
    { factionId: 'eastEmpireCompany', minRank: 2, skills: ['smithing', 'enchanting', 'alchemy'], cap: 750 },
    { factionId: 'thievesGuild', minRank: 1, skills: ['alchemy'], cap: 500 },
    { factionId: 'thievesGuild', minRank: 2, skills: ['alchemy'], cap: 750 },
    { factionId: 'bardsCollege', minRank: 1, skills: ['enchanting'], cap: 500 },
    { factionId: 'bardsCollege', minRank: 2, skills: ['enchanting'], cap: 750 },
];
// ── In-memory session tracking ─────────────────────────────────────────────────
// userId → session start timestamp (wall clock)
const sessionStart = new Map();
// ── Pure helpers ──────────────────────────────────────────────────────────────
function getSkillLevel(xp) {
    return Math.floor(xp / SKILL_LEVEL_XP);
}
function getSkillXp(mp, playerId, skillId) {
    const xpMap = mp.get(_actorForPlayer(mp, playerId), 'ff_skill_xp') ?? {};
    return xpMap[skillId] ?? 0;
}
function getSkillCap(mp, store, playerId, skillId) {
    let cap = DEFAULT_CAP_XP;
    for (const rule of FACTION_CAPS) {
        if (!rule.skills.includes(skillId))
            continue;
        const rank = factions.getPlayerFactionRank(mp, store, playerId, rule.factionId);
        if (rank !== null && rank >= rule.minRank && rule.cap > cap) {
            cap = rule.cap;
        }
    }
    return cap;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function addSkillXp(mp, store, playerId, skillId, baseXp, now) {
    const player = store.get(playerId);
    if (!player)
        return 0;
    const cap = getSkillCap(mp, store, playerId, skillId);
    const current = getSkillXp(mp, playerId, skillId);
    if (current >= cap)
        return 0;
    let multiplier = 1;
    const boost = getActiveStudyBoost(mp, playerId, skillId, now);
    if (boost)
        multiplier = boost.multiplier;
    const gain = Math.round(baseXp * multiplier);
    const newXp = Math.min(current + gain, cap);
    const actual = newXp - current;
    const xpMap = mp.get(player.actorId, 'ff_skill_xp') ?? {};
    xpMap[skillId] = newXp;
    mp.set(player.actorId, 'ff_skill_xp', xpMap);
    return actual;
}
function grantStudyBoost(mp, playerId, skillId, multiplier, onlineMs) {
    const actorId = _actorForPlayer(mp, playerId);
    const boosts = mp.get(actorId, 'ff_study_boosts') ?? [];
    boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs, sessionStart: Date.now() });
    mp.set(actorId, 'ff_study_boosts', boosts);
}
function getActiveStudyBoost(mp, playerId, skillId, now) {
    _consumeBoostTime(mp, playerId, now);
    const actorId = _actorForPlayer(mp, playerId);
    const boosts = mp.get(actorId, 'ff_study_boosts') ?? [];
    return boosts.find(b => b.skillId === skillId && b.remainingOnlineMs > 0) ?? null;
}
function getStudyBoosts(mp, playerId) {
    const actorId = _actorForPlayer(mp, playerId);
    return mp.get(actorId, 'ff_study_boosts') ?? [];
}
// ── Internal ──────────────────────────────────────────────────────────────────
function _consumeBoostTime(mp, playerId, now) {
    const actorId = _actorForPlayer(mp, playerId);
    const boosts = mp.get(actorId, 'ff_study_boosts') ?? [];
    const start = sessionStart.get(playerId);
    if (!start)
        return;
    const elapsed = (now ?? Date.now()) - start;
    const updated = boosts
        .map(b => Object.assign({}, b, { remainingOnlineMs: Math.max(0, b.remainingOnlineMs - elapsed) }))
        .filter(b => b.remainingOnlineMs > 0);
    sessionStart.set(playerId, now ?? Date.now());
    mp.set(actorId, 'ff_study_boosts', updated);
}
function onSkillPlayerDisconnect(mp, playerId, now) {
    _consumeBoostTime(mp, playerId, now);
    sessionStart.delete(playerId);
}
function _actorForPlayer(mp, playerId) {
    try {
        return mp.getUserActor(playerId);
    }
    catch {
        return 0;
    }
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[skills] Initializing');
    mp.makeProperty('ff_skill_xp', {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: '',
        updateNeighbor: '',
    });
    mp.makeProperty('ff_study_boosts', {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: '',
        updateNeighbor: '',
    });
    console.log('[skills] Started');
}
function onConnect(mp, store, bus, userId) {
    sessionStart.set(userId, Date.now());
    const player = store.get(userId);
    if (!player || !player.actorId)
        return;
    const xpMap = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_skill_xp', {});
    mp.sendCustomPacket(player.actorId, 'skillsSync', { xpMap });
}


/***/ },

/***/ 491
(__unused_webpack_module, exports, __webpack_require__) {


// ── Training ──────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getActiveTraining = getActiveTraining;
exports.startTraining = startTraining;
exports.joinTraining = joinTraining;
exports.endTraining = endTraining;
exports.init = init;
const skills = __importStar(__webpack_require__(399));
// ── Constants ─────────────────────────────────────────────────────────────────
const TRAINING_BOOST_MULTIPLIER = 2.0;
const TRAINING_BOOST_ONLINE_MS = 24 * 60 * 60 * 1000; // 24h of online time
const TRAINING_LOCATION_RADIUS = 500; // Skyrim units
// ── In-memory sessions ────────────────────────────────────────────────────────
// trainerId → { skillId, attendees: Set<userId> }
const sessions = new Map();
// ── Pure helpers ──────────────────────────────────────────────────────────────
function getActiveTraining(trainerId) {
    return sessions.get(trainerId) ?? null;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function startTraining(mp, store, bus, trainerId, skillId) {
    if (sessions.has(trainerId))
        return false;
    sessions.set(trainerId, { skillId, attendees: new Set() });
    bus.dispatch({ type: 'trainingStarted', trainerId, skillId });
    return true;
}
function joinTraining(mp, store, bus, playerId, trainerId) {
    const session = sessions.get(trainerId);
    if (!session)
        return false;
    if (playerId === trainerId)
        return false;
    const player = store.get(playerId);
    const trainer = store.get(trainerId);
    if (!player || !trainer)
        return false;
    // Location check — only if positional data is available
    try {
        const playerPos = mp.getActorPos(player.actorId);
        const trainerPos = mp.getActorPos(trainer.actorId);
        if (playerPos && trainerPos) {
            const dx = playerPos[0] - trainerPos[0];
            const dy = playerPos[1] - trainerPos[1];
            const dz = playerPos[2] - trainerPos[2];
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) > TRAINING_LOCATION_RADIUS)
                return false;
        }
    }
    catch { }
    session.attendees.add(playerId);
    bus.dispatch({ type: 'trainingJoined', playerId, trainerId });
    return true;
}
function endTraining(mp, store, bus, trainerId) {
    const session = sessions.get(trainerId);
    if (!session)
        return false;
    for (const attendeeId of session.attendees) {
        skills.grantStudyBoost(mp, attendeeId, session.skillId, TRAINING_BOOST_MULTIPLIER, TRAINING_BOOST_ONLINE_MS);
        const attendee = store.get(attendeeId);
        if (attendee)
            mp.sendCustomPacket(attendee.actorId, 'trainingBoostGranted', { skillId: session.skillId });
    }
    sessions.delete(trainerId);
    bus.dispatch({ type: 'trainingEnded', trainerId, skillId: session.skillId, attendeeCount: session.attendees.size });
    return true;
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[training] Initializing');
    // Sessions are in-memory only — intentionally do not persist across restarts
    console.log('[training] Started');
}


/***/ },

/***/ 239
(__unused_webpack_module, exports, __webpack_require__) {


// ── Prison ────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getQueue = getQueue;
exports.isQueued = isQueued;
exports.queueForSentencing = queueForSentencing;
exports.sentencePlayer = sentencePlayer;
exports.init = init;
const worldStore = __importStar(__webpack_require__(100));
const courier = __importStar(__webpack_require__(924));
// ── State ─────────────────────────────────────────────────────────────────────
let queue = [];
// ── Accessors ─────────────────────────────────────────────────────────────────
function getQueue(mp, holdId) {
    if (holdId)
        return queue.filter(e => e.holdId === holdId);
    return queue.slice();
}
function isQueued(mp, playerId) {
    return queue.some(e => e.playerId === playerId);
}
// ── Actions ───────────────────────────────────────────────────────────────────
function queueForSentencing(mp, store, bus, playerId, holdId, arrestingOfficerId, notifyId) {
    if (isQueued(mp, playerId))
        return false;
    const entry = { playerId, holdId, arrestedBy: arrestingOfficerId, queuedAt: Date.now() };
    queue.push(entry);
    _persist();
    const note = courier.createNotification('prisonRequest', playerId, notifyId, holdId, { playerId, arrestedBy: arrestingOfficerId });
    courier.sendNotification(mp, store, note);
    bus.dispatch({ type: 'playerArrested', playerId, holdId, arrestedBy: arrestingOfficerId });
    return true;
}
function sentencePlayer(mp, store, bus, playerId, jarlId, sentence) {
    const entry = queue.find(e => e.playerId === playerId);
    if (!entry)
        return false;
    const { holdId } = entry;
    queue = queue.filter(e => e.playerId !== playerId);
    _persist();
    const player = store.get(playerId);
    if (sentence.type === 'fine') {
        const fineAmount = Math.min(sentence.fineAmount ?? 0, player ? player.septims : 0);
        if (player && fineAmount > 0) {
            const newSeptims = player.septims - fineAmount;
            store.update(playerId, { septims: newSeptims });
            const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 });
            store.update(playerId, { bounty: newBounty });
            mp.set(player.actorId, 'ff_bounty', []);
        }
    }
    else if (sentence.type === 'release') {
        if (player) {
            const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 });
            store.update(playerId, { bounty: newBounty });
        }
    }
    else if (sentence.type === 'banish') {
        if (player) {
            const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 });
            store.update(playerId, { bounty: newBounty });
            mp.sendCustomPacket(player.actorId, 'playerBanished', { holdId });
        }
    }
    bus.dispatch({ type: 'playerSentenced', playerId, jarlId, holdId, sentence });
    return true;
}
// ── Internal ──────────────────────────────────────────────────────────────────
function _persist() {
    worldStore.set('ff_prison_queue', queue);
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[prison] Initializing');
    const saved = worldStore.get('ff_prison_queue');
    if (Array.isArray(saved))
        queue = saved;
    console.log('[prison] Started');
}


/***/ },

/***/ 667
(__unused_webpack_module, exports, __webpack_require__) {


// ── Bounty ────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBounty = getBounty;
exports.getAllBounties = getAllBounties;
exports.isGuardKoid = isGuardKoid;
exports.addBounty = addBounty;
exports.clearBounty = clearBounty;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const GUARD_KOID_THRESHOLD = 1000; // Septims; guard gets KOID at or above this
// ── Pure helpers ──────────────────────────────────────────────────────────────
function getBounty(mp, store, playerId, holdId) {
    const player = store.get(playerId);
    if (!player)
        return 0;
    return player.bounty[holdId] ?? 0;
}
function getAllBounties(mp, store, playerId) {
    const player = store.get(playerId);
    if (!player)
        return {};
    return Object.assign({}, player.bounty);
}
function isGuardKoid(mp, store, playerId, holdId) {
    return getBounty(mp, store, playerId, holdId) >= GUARD_KOID_THRESHOLD;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function addBounty(mp, store, bus, playerId, holdId, amount) {
    const player = store.get(playerId);
    if (!player)
        return;
    const current = player.bounty[holdId] ?? 0;
    const newAmount = current + amount;
    const newBounty = Object.assign({}, player.bounty, { [holdId]: newAmount });
    store.update(playerId, { bounty: newBounty });
    _persist(mp, player.actorId, newBounty);
    mp.sendCustomPacket(player.actorId, 'bountyChanged', { holdId, amount: newAmount });
    bus.dispatch({ type: 'bountyChanged', playerId, holdId, newAmount, delta: amount });
}
function clearBounty(mp, store, bus, playerId, holdId) {
    const player = store.get(playerId);
    if (!player)
        return;
    const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 });
    store.update(playerId, { bounty: newBounty });
    _persist(mp, player.actorId, newBounty);
    mp.sendCustomPacket(player.actorId, 'bountyChanged', { holdId, amount: 0 });
    bus.dispatch({ type: 'bountyChanged', playerId, holdId, newAmount: 0, delta: -(player.bounty[holdId] ?? 0) });
}
// ── Internal ──────────────────────────────────────────────────────────────────
function _persist(mp, actorId, bountyMap) {
    const records = Object.entries(bountyMap)
        .filter(([, amount]) => amount > 0)
        .map(([holdId, amount]) => ({ holdId, amount, updatedAt: Date.now() }));
    mp.set(actorId, 'ff_bounty', records);
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[bounty] Initializing');
    console.log('[bounty] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player)
        return;
    const records = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_bounty', []);
    const bountyMap = {};
    for (const r of records)
        bountyMap[r.holdId] = r.amount;
    store.update(userId, { bounty: bountyMap });
}


/***/ },

/***/ 757
(__unused_webpack_module, exports, __webpack_require__) {


// ── Factions ──────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFactionDocument = getFactionDocument;
exports.setFactionDocument = setFactionDocument;
exports.joinFaction = joinFaction;
exports.leaveFaction = leaveFaction;
exports.isFactionMember = isFactionMember;
exports.getPlayerFactionRank = getPlayerFactionRank;
exports.getPlayerMemberships = getPlayerMemberships;
exports.init = init;
exports.onConnect = onConnect;
const worldStore = __importStar(__webpack_require__(100));
const mpUtil_1 = __webpack_require__(56);
// ── Actions ───────────────────────────────────────────────────────────────────
function getFactionDocument(mp, factionId) {
    const docs = worldStore.get('ff_faction_docs') ?? {};
    return docs[factionId] ?? null;
}
function setFactionDocument(mp, doc) {
    const docs = worldStore.get('ff_faction_docs') ?? {};
    docs[doc.factionId] = Object.assign({}, doc, { updatedAt: Date.now() });
    worldStore.set('ff_faction_docs', docs);
}
function joinFaction(mp, store, bus, playerId, factionId, rank) {
    const player = store.get(playerId);
    if (!player)
        return false;
    const joinRank = rank ?? 0;
    const memberships = _getMemberships(mp, player.actorId);
    const existingIdx = memberships.findIndex(m => m.factionId === factionId);
    if (existingIdx >= 0) {
        memberships[existingIdx].rank = joinRank;
    }
    else {
        memberships.push({ factionId, rank: joinRank, joinedAt: Date.now() });
    }
    _saveMemberships(mp, player.actorId, memberships);
    const factionIds = memberships.map(m => m.factionId);
    store.update(playerId, { factions: factionIds });
    bus.dispatch({ type: 'factionJoined', playerId, factionId, rank: joinRank });
    return true;
}
function leaveFaction(mp, store, bus, playerId, factionId) {
    const player = store.get(playerId);
    if (!player)
        return false;
    const memberships = _getMemberships(mp, player.actorId);
    const filtered = memberships.filter(m => m.factionId !== factionId);
    _saveMemberships(mp, player.actorId, filtered);
    const factionIds = filtered.map(m => m.factionId);
    store.update(playerId, { factions: factionIds });
    bus.dispatch({ type: 'factionLeft', playerId, factionId });
    return true;
}
function isFactionMember(mp, store, playerId, factionId) {
    const player = store.get(playerId);
    if (!player)
        return false;
    return player.factions.includes(factionId);
}
function getPlayerFactionRank(mp, store, playerId, factionId) {
    const player = store.get(playerId);
    if (!player)
        return null;
    const memberships = _getMemberships(mp, player.actorId);
    const m = memberships.find(m => m.factionId === factionId);
    return m ? m.rank : null;
}
function getPlayerMemberships(mp, store, playerId) {
    const player = store.get(playerId);
    if (!player)
        return [];
    return _getMemberships(mp, player.actorId);
}
// ── Internal ──────────────────────────────────────────────────────────────────
function _getMemberships(mp, actorId) {
    return (0, mpUtil_1.safeGet)(mp, actorId, 'ff_memberships', []);
}
function _saveMemberships(mp, actorId, memberships) {
    (0, mpUtil_1.safeSet)(mp, actorId, 'ff_memberships', memberships);
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[factions] Initializing');
    console.log('[factions] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player || !player.actorId)
        return;
    const memberships = _getMemberships(mp, player.actorId);
    const factionIds = memberships.map(m => m.factionId);
    store.update(userId, { factions: factionIds });
    mp.sendCustomPacket(player.actorId, 'factionsSync', { memberships });
}


/***/ },

/***/ 121
(__unused_webpack_module, exports, __webpack_require__) {


// ── Housing ───────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getProperty = getProperty;
exports.getPropertiesByHold = getPropertiesByHold;
exports.getOwnedProperties = getOwnedProperties;
exports.isAvailable = isAvailable;
exports.requestProperty = requestProperty;
exports.approveProperty = approveProperty;
exports.denyProperty = denyProperty;
exports.revokeProperty = revokeProperty;
exports.init = init;
exports.onConnect = onConnect;
const worldStore = __importStar(__webpack_require__(100));
const courier = __importStar(__webpack_require__(924));
// ── Property Registry ─────────────────────────────────────────────────────────
// 16 properties across 9 holds. propertyId is the stable key used everywhere.
const PROPERTY_REGISTRY = [
    // Whiterun
    { id: 'wrun_breezehome', name: 'Breezehome', holdId: 'whiterun', type: 'home' },
    { id: 'wrun_breezeannex', name: 'Breezehome Annex', holdId: 'whiterun', type: 'business' },
    // Eastmarch
    { id: 'east_hjerim', name: 'Hjerim', holdId: 'eastmarch', type: 'home' },
    { id: 'east_windhelm_shop', name: 'Windhelm Market Stall', holdId: 'eastmarch', type: 'business' },
    // Rift
    { id: 'rift_honeyside', name: 'Honeyside', holdId: 'rift', type: 'home' },
    { id: 'rift_riften_shop', name: 'Riften Stall', holdId: 'rift', type: 'business' },
    // Reach
    { id: 'reach_vlindrel', name: 'Vlindrel Hall', holdId: 'reach', type: 'home' },
    { id: 'reach_markarth_shop', name: 'Markarth Stall', holdId: 'reach', type: 'business' },
    // Haafingar
    { id: 'haaf_proudspire', name: 'Proudspire Manor', holdId: 'haafingar', type: 'home' },
    { id: 'haaf_solitude_shop', name: 'Solitude Market', holdId: 'haafingar', type: 'business' },
    // Pale
    { id: 'pale_dawnstar_home', name: 'Dawnstar Cottage', holdId: 'pale', type: 'home' },
    { id: 'pale_dawnstar_shop', name: 'Dawnstar Stall', holdId: 'pale', type: 'business' },
    // Falkreath
    { id: 'falk_lakeview', name: 'Lakeview Manor', holdId: 'falkreath', type: 'home' },
    { id: 'falk_falkreath_shop', name: 'Falkreath Stall', holdId: 'falkreath', type: 'business' },
    // Hjaalmarch
    { id: 'hjaal_windstad', name: 'Windstad Manor', holdId: 'hjaalmarch', type: 'home' },
    // Winterhold
    { id: 'wint_college_quarters', name: 'College Quarters', holdId: 'winterhold', type: 'home' },
];
// ── Runtime state ─────────────────────────────────────────────────────────────
const properties = new Map();
function _loadRegistry() {
    for (const def of PROPERTY_REGISTRY) {
        if (!properties.has(def.id)) {
            properties.set(def.id, { ownerId: null, pendingOwnerId: null });
        }
    }
}
// ── Pure lookups ──────────────────────────────────────────────────────────────
function getProperty(id) {
    const def = PROPERTY_REGISTRY.find(p => p.id === id);
    const state = properties.get(id);
    if (!def || !state)
        return null;
    return Object.assign({}, def, state);
}
function getPropertiesByHold(holdId) {
    return PROPERTY_REGISTRY
        .filter(p => p.holdId === holdId)
        .map(p => getProperty(p.id));
}
function getOwnedProperties(playerId) {
    return PROPERTY_REGISTRY
        .map(p => getProperty(p.id))
        .filter(p => p && p.ownerId === playerId);
}
function isAvailable(propertyId) {
    const state = properties.get(propertyId);
    if (!state)
        return false;
    return state.ownerId === null && state.pendingOwnerId === null;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function requestProperty(mp, store, bus, playerId, propertyId, stewardId) {
    if (!isAvailable(propertyId))
        return false;
    properties.get(propertyId).pendingOwnerId = playerId;
    _persist();
    const player = store.get(playerId);
    const note = courier.createNotification('propertyRequest', playerId, stewardId, null, { propertyId, requesterName: player ? player.name : String(playerId) });
    courier.sendNotification(mp, store, note);
    bus.dispatch({ type: 'propertyRequested', playerId, propertyId });
    return true;
}
function approveProperty(mp, store, bus, propertyId, approverId) {
    const state = properties.get(propertyId);
    if (!state || state.pendingOwnerId === null)
        return false;
    const newOwnerId = state.pendingOwnerId;
    state.ownerId = newOwnerId;
    state.pendingOwnerId = null;
    _persist();
    const player = store.get(newOwnerId);
    if (player) {
        const owned = store.get(newOwnerId).properties.concat([propertyId]);
        store.update(newOwnerId, { properties: owned });
        mp.sendCustomPacket(player.actorId, 'propertyApproved', { propertyId });
    }
    bus.dispatch({ type: 'propertyApproved', propertyId, newOwnerId, approvedBy: approverId });
    return true;
}
function denyProperty(mp, propertyId) {
    const state = properties.get(propertyId);
    if (!state)
        return false;
    state.pendingOwnerId = null;
    _persist();
    return true;
}
function revokeProperty(mp, store, propertyId) {
    const state = properties.get(propertyId);
    if (!state)
        return false;
    const prevOwner = state.ownerId;
    state.ownerId = null;
    state.pendingOwnerId = null;
    _persist();
    if (prevOwner !== null) {
        const player = store.get(prevOwner);
        if (player) {
            const owned = player.properties.filter(id => id !== propertyId);
            store.update(prevOwner, { properties: owned });
        }
    }
    return true;
}
// ── Internal ──────────────────────────────────────────────────────────────────
function _persist() {
    const data = [];
    for (const [id, state] of properties) {
        data.push({ id, ownerId: state.ownerId, pendingOwnerId: state.pendingOwnerId });
    }
    worldStore.set('ff_properties', data);
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[housing] Initializing');
    _loadRegistry();
    const saved = worldStore.get('ff_properties');
    if (Array.isArray(saved)) {
        for (const entry of saved) {
            if (properties.has(entry.id)) {
                const state = properties.get(entry.id);
                state.ownerId = entry.ownerId;
                state.pendingOwnerId = entry.pendingOwnerId;
            }
        }
    }
    console.log('[housing] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player || !player.actorId)
        return;
    const owned = getOwnedProperties(userId).map(p => p.id);
    store.update(userId, { properties: owned });
    if (player.holdId) {
        const list = getPropertiesByHold(player.holdId);
        mp.sendCustomPacket(player.actorId, 'propertyList', { properties: list });
    }
}


/***/ },

/***/ 968
(__unused_webpack_module, exports, __webpack_require__) {


// ── Drunk Bar ─────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.calcNewDrunkLevel = calcNewDrunkLevel;
exports.shouldSober = shouldSober;
exports.getAlcoholStrength = getAlcoholStrength;
exports.drinkAlcohol = drinkAlcohol;
exports.soberPlayer = soberPlayer;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const DRUNK_MIN = 0;
const DRUNK_MAX = 10;
const SOBER_INTERVAL_MIN = 5; // sober tick every 5 minutes of playtime
const TICK_INTERVAL_MS = 60 * 1000;
// baseId → alcohol strength (1–3)
// FormIDs verified against skyrim-esm-references/potions.json
const ALCOHOL_STRENGTHS = {
    0x0003133B: 1, // Alto Wine          edid: FoodWineAlto
    0x000C5349: 1, // Alto Wine (var.)   edid: FoodWineAltoA
    0x0003133C: 1, // Wine               edid: FoodWineBottle02
    0x000C5348: 1, // Wine (var.)        edid: FoodWineBottle02A
    0x00034C5D: 2, // Nord Mead          edid: FoodMead
    0x0002C35A: 2, // Black-Briar Mead   edid: FoodBlackBriarMead
    0x000508CA: 2, // Honningbrew Mead   edid: FoodHonningbrewMead
    0x000F693F: 3, // Black-Briar Reserve edid: FoodBlackBriarMeadPrivateReserve
};
// ── Pure helpers ──────────────────────────────────────────────────────────────
function calcNewDrunkLevel(current, delta) {
    return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta));
}
function shouldSober(minutesOnline) {
    return minutesOnline > 0 && minutesOnline % SOBER_INTERVAL_MIN === 0;
}
function getAlcoholStrength(baseId) {
    return ALCOHOL_STRENGTHS[baseId] ?? 0;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function drinkAlcohol(mp, store, bus, playerId, baseId) {
    const player = store.get(playerId);
    if (!player)
        return;
    const strength = getAlcoholStrength(baseId);
    if (!strength)
        return;
    const newLevel = calcNewDrunkLevel(player.drunkLevel, strength);
    store.update(playerId, { drunkLevel: newLevel });
    (0, mpUtil_1.safeSet)(mp, player.actorId, 'ff_drunk', newLevel);
    bus.dispatch({ type: 'drunkChanged', playerId, drunkLevel: newLevel });
}
function soberPlayer(mp, store, bus, playerId) {
    const player = store.get(playerId);
    if (!player)
        return;
    store.update(playerId, { drunkLevel: 0 });
    (0, mpUtil_1.safeSet)(mp, player.actorId, 'ff_drunk', 0);
    bus.dispatch({ type: 'drunkChanged', playerId, drunkLevel: 0 });
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[drunkBar] Initializing');
    mp.makeProperty('ff_drunk', {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: `
      (() => {
        const d = ctx.value;
        if (d === null || d === undefined) return;
        if (d >= 8) return { weaponSpeedMult: 0.6 };
        if (d >= 5) return { weaponSpeedMult: 0.8 };
        return {};
      })()
    `,
        updateNeighbor: '',
    });
    const scheduleTick = () => {
        setTimeout(() => {
            try {
                for (const player of store.getAll()) {
                    if (shouldSober(player.minutesOnline)) {
                        if (player.drunkLevel > 0 && player.actorId) {
                            const newLevel = calcNewDrunkLevel(player.drunkLevel, -1);
                            store.update(player.id, { drunkLevel: newLevel });
                            (0, mpUtil_1.safeSet)(mp, player.actorId, 'ff_drunk', newLevel);
                            bus.dispatch({ type: 'drunkChanged', playerId: player.id, drunkLevel: newLevel });
                        }
                    }
                }
            }
            catch (err) {
                console.error(`[drunkBar] Tick error: ${err.message}`);
            }
            scheduleTick();
        }, TICK_INTERVAL_MS);
    };
    scheduleTick();
    console.log('[drunkBar] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player)
        return;
    const level = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_drunk', 0);
    store.update(userId, { drunkLevel: level });
}


/***/ },

/***/ 92
(__unused_webpack_module, exports, __webpack_require__) {


// ── Hunger ────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.calcNewHunger = calcNewHunger;
exports.shouldDrainHunger = shouldDrainHunger;
exports.feedPlayer = feedPlayer;
exports.init = init;
exports.onConnect = onConnect;
const mpUtil_1 = __webpack_require__(56);
// ── Constants ─────────────────────────────────────────────────────────────────
const HUNGER_MIN = 0;
const HUNGER_MAX = 10;
const DRAIN_INTERVAL_MIN = 30; // drain 1 level every 30 minutes of playtime
const TICK_INTERVAL_MS = 60 * 1000;
// ── Pure helpers ──────────────────────────────────────────────────────────────
function calcNewHunger(current, delta) {
    return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta));
}
function shouldDrainHunger(minutesOnline) {
    return minutesOnline > 0 && minutesOnline % DRAIN_INTERVAL_MIN === 0;
}
// ── Actions ───────────────────────────────────────────────────────────────────
function feedPlayer(mp, store, bus, playerId, levels) {
    const player = store.get(playerId);
    if (!player || !player.actorId)
        return -1;
    const newLevel = calcNewHunger(player.hungerLevel, levels);
    store.update(playerId, { hungerLevel: newLevel });
    (0, mpUtil_1.safeSet)(mp, player.actorId, 'ff_hunger', newLevel);
    bus.dispatch({ type: 'hungerTick', playerId, hungerLevel: newLevel });
    return newLevel;
}
// ── Init ─────────────────────────────────────────────────────────────────────
function init(mp, store, bus) {
    console.log('[hunger] Initializing');
    mp.makeProperty('ff_hunger', {
        isVisibleByOwner: true,
        isVisibleByNeighbors: false,
        updateOwner: `
      (() => {
        const h = ctx.value;
        if (h === null || h === undefined) return;
        if (h <= 2) return { healthRegenMult: 0.7 };
        if (h >= 10) return { staminaRegenMult: 1.4 };
        return {};
      })()
    `,
        updateNeighbor: '',
    });
    const scheduleTick = () => {
        setTimeout(() => {
            try {
                for (const player of store.getAll()) {
                    store.update(player.id, { minutesOnline: player.minutesOnline + 1 });
                    const updated = store.get(player.id);
                    if (shouldDrainHunger(updated.minutesOnline) && updated.actorId) {
                        const newLevel = calcNewHunger(updated.hungerLevel, -1);
                        store.update(player.id, { hungerLevel: newLevel });
                        (0, mpUtil_1.safeSet)(mp, updated.actorId, 'ff_hunger', newLevel);
                        bus.dispatch({ type: 'hungerTick', playerId: player.id, hungerLevel: newLevel });
                    }
                }
            }
            catch (err) {
                console.error(`[hunger] Tick error: ${err.message}`);
            }
            scheduleTick();
        }, TICK_INTERVAL_MS);
    };
    scheduleTick();
    console.log('[hunger] Started');
}
function onConnect(mp, store, bus, userId) {
    const player = store.get(userId);
    if (!player)
        return;
    const level = (0, mpUtil_1.safeGet)(mp, player.actorId, 'ff_hunger', HUNGER_MAX);
    store.update(userId, { hungerLevel: level });
}


/***/ },

/***/ 805
(__unused_webpack_module, exports) {


// ── Runtime Global Probe ───────────────────────────────────────────────────────
//
// Checks which networking and I/O globals SkyMP's Chakra sandbox exposes.
// Run once at startup (gated by PROBE_GLOBALS=1 env var or dev mode).
//
// Results appear in the SkyMP server console — grep for [probe].
//
// What we're looking for:
//   fetch          → can make outbound HTTP from gamemode directly
//   WebSocket      → native WS client support
//   XMLHttpRequest → legacy XHR
//   require        → Node.js module system (would mean actual Node, not Chakra)
//   process        → Node.js process object
//   http / https   → Node.js http modules already required
//   setInterval    → timer support (needed for polling fallbacks)
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.runGlobalProbes = runGlobalProbes;
function probe(name, value) {
    let status;
    if (value === undefined || value === null) {
        status = 'missing';
    }
    else if (typeof value === 'function') {
        status = 'function';
    }
    else if (typeof value === 'object') {
        status = 'object';
    }
    else {
        status = 'other';
    }
    console.log(`[probe] ${name.padEnd(20)} → ${status}`);
}
async function attemptFetch() {
    // Use httpbin as a neutral echo endpoint — safe, no auth, returns JSON.
    const url = 'https://httpbin.org/get';
    try {
        const g = globalThis;
        if (typeof g.fetch !== 'function') {
            console.log('[probe] fetch live test       → skipped (not a function)');
            return;
        }
        console.log('[probe] fetch live test       → attempting GET ' + url);
        const res = await g.fetch(url);
        const json = await res.json();
        console.log('[probe] fetch live test       → OK  status=' + res.status);
        console.log('[probe] fetch response origin → ' + String(json['origin'] ?? '(none)'));
    }
    catch (err) {
        console.log('[probe] fetch live test       → FAILED  ' + String(err?.message ?? err));
    }
}
/**
 * Run all runtime global probes and log results to the SkyMP console.
 * Call this from index.ts init() gated by a dev flag.
 */
async function runGlobalProbes() {
    const g = globalThis;
    console.log('[probe] ── SkyMP runtime global probe ──────────────────────────');
    // Networking
    probe('fetch', g.fetch);
    probe('WebSocket', g.WebSocket);
    probe('XMLHttpRequest', g.XMLHttpRequest);
    // Node.js indicators
    probe('require', g.require);
    probe('process', g.process);
    probe('Buffer', g.Buffer);
    // Node built-in modules (only resolvable if actual Node.js)
    try {
        probe('require("http")', g.require?.('http'));
    }
    catch {
        probe('require("http")', undefined);
    }
    try {
        probe('require("https")', g.require?.('https'));
    }
    catch {
        probe('require("https")', undefined);
    }
    try {
        probe('require("net")', g.require?.('net'));
    }
    catch {
        probe('require("net")', undefined);
    }
    // Timer support (important for any polling fallback)
    probe('setInterval', g.setInterval);
    probe('setTimeout', g.setTimeout);
    probe('clearInterval', g.clearInterval);
    probe('Promise', g.Promise);
    console.log('[probe] ── live fetch attempt ────────────────────────────────────');
    await attemptFetch();
    console.log('[probe] ── WebSocket live test ───────────────────────────────────');
    attemptWebSocket();
    console.log('[probe] ── done (ws result will appear asynchronously) ──────────');
}
// Test whether the WebSocket constructor actually fires events.
// Connects to ws://localhost:7778 — start the backend relay before running.
function attemptWebSocket() {
    const g = globalThis;
    if (typeof g.WebSocket !== 'function') {
        console.log('[probe] WebSocket live test    → skipped (not a function)');
        return;
    }
    try {
        const ws = new g.WebSocket('ws://localhost:7778');
        console.log('[probe] WebSocket constructed  → readyState=' + ws.readyState);
        ws.onopen = () => console.log('[probe] WebSocket onopen       → FIRED (readyState=' + ws.readyState + ')');
        ws.onclose = (e) => console.log('[probe] WebSocket onclose      → FIRED code=' + e?.code);
        ws.onerror = (e) => console.log('[probe] WebSocket onerror      → FIRED ' + String(e?.message ?? e));
        ws.onmessage = (e) => console.log('[probe] WebSocket onmessage    → FIRED data=' + String(e?.data).slice(0, 80));
        // If no event fires within 5 s, the event loop likely doesn't tick WS callbacks
        setTimeout(() => {
            console.log('[probe] WebSocket 5s check     → readyState=' + ws.readyState + ' (0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED)');
        }, 5000);
    }
    catch (err) {
        console.log('[probe] WebSocket live test    → FAILED (constructor threw) ' + String(err?.message ?? err));
    }
}


/***/ },

/***/ 896
(module) {

module.exports = require("fs");

/***/ },

/***/ 928
(module) {

module.exports = require("path");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(229);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
// skymp:sig:y:frostfall:aPX8ZbkukFgy9Lq65PydCA69E6ou+3keGiZM8YSxJ85phMbvqMf/yovWs6ZK++AR+rt9Rq8LsBW9HntNv0AXCg==
