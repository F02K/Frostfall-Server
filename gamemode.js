var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// gamemode/store.ts
function createDefaultState(id, actorId, name) {
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
    minutesOnline: 0
  };
}
__name(createDefaultState, "createDefaultState");
var _PlayerStore = class _PlayerStore {
  players = /* @__PURE__ */ new Map();
  registerPlayer(id, actorId, name) {
    const state = createDefaultState(id, actorId, name);
    this.players.set(id, state);
    return state;
  }
  deregisterPlayer(id) {
    this.players.delete(id);
  }
  get(id) {
    return this.players.get(id) ?? null;
  }
  getAll() {
    return Array.from(this.players.values());
  }
  /** Shallow-merge patch into the player's state. Throws if player not found. */
  update(id, patch) {
    const current = this.players.get(id);
    if (!current) throw new Error(`Player ${id} not in store`);
    const next = { ...current, ...patch };
    this.players.set(id, next);
    return next;
  }
};
__name(_PlayerStore, "PlayerStore");
var PlayerStore = _PlayerStore;

// gamemode/events.ts
var _ExtendedEventBus = class _ExtendedEventBus {
  listeners = /* @__PURE__ */ new Map();
  on(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, /* @__PURE__ */ new Set());
    }
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }
  once(type, handler) {
    const wrapper = /* @__PURE__ */ __name((event) => {
      this.off(type, wrapper);
      handler(event);
    }, "wrapper");
    this.on(type, wrapper);
  }
  off(type, handler) {
    var _a;
    (_a = this.listeners.get(type)) == null ? void 0 : _a.delete(handler);
  }
  dispatch(event) {
    const targeted = this.listeners.get(event.type);
    const wildcard = this.listeners.get("*");
    const all = [
      ...targeted ? [...targeted] : [],
      ...wildcard ? [...wildcard] : []
    ];
    for (const handler of all) {
      try {
        handler(event);
      } catch (e) {
        console.error(`[EventBus] Uncaught error in handler for "${event.type}":`, e);
      }
    }
  }
};
__name(_ExtendedEventBus, "ExtendedEventBus");
var ExtendedEventBus = _ExtendedEventBus;

// gamemode/core/CommandBus.ts
var _CommandBus = class _CommandBus {
  commands = /* @__PURE__ */ new Map();
  permissions;
  /** Called by Registry during bootstrap */
  setPermissions(p) {
    this.permissions = p;
  }
  register(def) {
    const key = def.name.toLowerCase();
    if (this.commands.has(key)) {
      console.warn(`[CommandBus] Duplicate command "${key}" \u2014 overwriting`);
    }
    this.commands.set(key, def);
  }
  /**
   * Dispatch a raw command string (without leading slash).
   * Called by index.ts when a "command" customPacket arrives.
   * Returns true if a handler was found.
   */
  dispatch(caller, raw, replySender) {
    var _a;
    const parts = raw.trim().split(/\s+/);
    const cmdName = (_a = parts[0]) == null ? void 0 : _a.toLowerCase();
    if (!cmdName) return false;
    const def = this.commands.get(cmdName);
    if (!def) {
      replySender(caller.id, `Unknown command "/${cmdName}". Type /help for a list.`);
      return false;
    }
    const reply = /* @__PURE__ */ __name((msg) => replySender(caller.id, msg), "reply");
    const replyError = /* @__PURE__ */ __name((msg) => replySender(caller.id, `[Error] ${msg}`), "replyError");
    if (def.permission && !this.permissions.has(caller, def.permission)) {
      replyError(`You do not have permission to use /${cmdName}.`);
      return true;
    }
    if (def.subcommands && parts[1]) {
      const subName = parts[1].toLowerCase();
      const sub = def.subcommands[subName];
      if (!sub) {
        const available = Object.keys(def.subcommands).join(", ");
        reply(`Unknown subcommand "${subName}". Available: ${available}`);
        return true;
      }
      if (!this.permissions.has(caller, sub.permission)) {
        replyError(`You do not have permission to use /${cmdName} ${subName}.`);
        return true;
      }
      const ctx = { caller, args: parts.slice(2), reply, replyError };
      void Promise.resolve(sub.handler(ctx)).catch(
        (e) => console.error(`[CommandBus] Error in /${cmdName} ${subName}:`, e)
      );
      return true;
    }
    if (def.handler) {
      const ctx = { caller, args: parts.slice(1), reply, replyError };
      void Promise.resolve(def.handler(ctx)).catch(
        (e) => console.error(`[CommandBus] Error in /${cmdName}:`, e)
      );
      return true;
    }
    if (def.subcommands) {
      const available = Object.keys(def.subcommands).join(", ");
      reply(`Usage: /${cmdName} <${available}>`);
    }
    return true;
  }
  /** Return all registered commands (for /help listing) */
  list() {
    return [...this.commands.values()];
  }
};
__name(_CommandBus, "CommandBus");
var CommandBus = _CommandBus;

// gamemode/core/Permissions.ts
var STAFF_RANKS = ["owner", "admin", "moderator", "staff"];
var _Permissions = class _Permissions {
  staffList = [];
  govtList = [];
  jobList = [];
  /** Load persisted permissions from world store on startup */
  load(staffList, govtList, jobList) {
    this.staffList = staffList;
    this.govtList = govtList;
    this.jobList = jobList;
  }
  /** Test whether a player satisfies a permission string */
  has(player, permission) {
    if (permission === "any") return true;
    const [base, qualifier] = permission.split(":");
    const staffRanks = ["owner", "admin", "moderator", "staff"];
    if (staffRanks.includes(base)) {
      const rank = this.getStaffRank(player.id);
      if (!rank) return false;
      const required = STAFF_RANKS.indexOf(base);
      const actual = STAFF_RANKS.indexOf(rank);
      return actual <= required;
    }
    const govtRoles = ["jarl", "housecarl", "steward", "thane", "courtWizard", "captain"];
    if (govtRoles.includes(base)) {
      return this.govtList.some(
        (g) => g.playerId === player.id && g.role === base && (qualifier == null || g.holdId === qualifier)
      );
    }
    const jobRoles = [
      "guard",
      "merchant",
      "blacksmith",
      "innkeeper",
      "farmer",
      "miner",
      "woodcutter",
      "hunter",
      "alchemist",
      "bard",
      "healer",
      "courier",
      "fisherman",
      "lumberjack"
    ];
    if (jobRoles.includes(base)) {
      const now = Date.now();
      return this.jobList.some(
        (j) => j.playerId === player.id && j.jobId === base && (qualifier == null || j.holdId === qualifier) && (j.licenseExpiry == null || j.licenseExpiry > now)
      );
    }
    return false;
  }
  // ── Staff management ────────────────────────────────────────────────────────
  grantStaff(targetId, rank, grantedBy, notes) {
    this.staffList = this.staffList.filter((s) => s.playerId !== targetId);
    const record = { playerId: targetId, rank, grantedBy, grantedAt: Date.now(), notes };
    this.staffList.push(record);
    return record;
  }
  revokeStaff(targetId) {
    const before = this.staffList.length;
    this.staffList = this.staffList.filter((s) => s.playerId !== targetId);
    return this.staffList.length < before;
  }
  getStaffRank(playerId) {
    var _a;
    return ((_a = this.staffList.find((s) => s.playerId === playerId)) == null ? void 0 : _a.rank) ?? null;
  }
  isStaff(playerId) {
    return this.staffList.some((s) => s.playerId === playerId);
  }
  getAllStaff() {
    return [...this.staffList];
  }
  // ── Government management ───────────────────────────────────────────────────
  appoint(targetId, role, holdId, appointedBy, customTitle) {
    this.govtList = this.govtList.filter(
      (g) => !(g.holdId === holdId && g.role === role)
    );
    const pos = {
      playerId: targetId,
      role,
      holdId,
      appointedBy,
      appointedAt: Date.now(),
      customTitle
    };
    this.govtList.push(pos);
    return pos;
  }
  removeGovernmentRole(playerId, role, holdId) {
    const before = this.govtList.length;
    this.govtList = this.govtList.filter(
      (g) => !(g.playerId === playerId && g.role === role && g.holdId === holdId)
    );
    return this.govtList.length < before;
  }
  getGovernmentPositions(playerId) {
    if (playerId == null) return [...this.govtList];
    return this.govtList.filter((g) => g.playerId === playerId);
  }
  getHoldGovernment(holdId) {
    return this.govtList.filter((g) => g.holdId === holdId);
  }
  getJarl(holdId) {
    return this.govtList.find((g) => g.holdId === holdId && g.role === "jarl") ?? null;
  }
  // ── Job management ──────────────────────────────────────────────────────────
  assignJob(targetId, jobId, holdId, assignedBy, licenseExpiry = null) {
    this.jobList = this.jobList.filter(
      (j) => !(j.playerId === targetId && j.jobId === jobId && j.holdId === holdId)
    );
    const job = { playerId: targetId, jobId, holdId, assignedBy, assignedAt: Date.now(), licenseExpiry };
    this.jobList.push(job);
    return job;
  }
  revokeJob(targetId, jobId, holdId) {
    const before = this.jobList.length;
    this.jobList = this.jobList.filter(
      (j) => !(j.playerId === targetId && j.jobId === jobId && j.holdId === holdId)
    );
    return this.jobList.length < before;
  }
  revokeAllJobs(targetId) {
    const before = this.jobList.length;
    this.jobList = this.jobList.filter((j) => j.playerId !== targetId);
    return before - this.jobList.length;
  }
  getPlayerJobs(playerId) {
    const now = Date.now();
    return this.jobList.filter(
      (j) => j.playerId === playerId && (j.licenseExpiry == null || j.licenseExpiry > now)
    );
  }
  getJobHolders(jobId, holdId) {
    const now = Date.now();
    return this.jobList.filter(
      (j) => j.jobId === jobId && (holdId == null || j.holdId === holdId) && (j.licenseExpiry == null || j.licenseExpiry > now)
    );
  }
  // ── Serialization (for WorldStore) ──────────────────────────────────────────
  serialize() {
    return { staff: this.staffList, govt: this.govtList, jobs: this.jobList };
  }
};
__name(_Permissions, "Permissions");
var Permissions = _Permissions;

// gamemode/core/WorldStore.ts
var WORLD_FORM_ID = 0x0000003C;
var _WorldStore = class _WorldStore {
  constructor(mp2) {
    this.mp = mp2;
  }
  /** Read a world-level key; returns `defaultValue` if missing. */
  get(key, defaultValue) {
    const raw = this.mp.get(WORLD_FORM_ID, key);
    return raw ?? defaultValue;
  }
  /** Write a world-level key. */
  set(key, value) {
    this.mp.set(WORLD_FORM_ID, key, value);
  }
  /**
   * Atomically read-modify-write.
   * The mutator receives the current value (or defaultValue) and must return the new value.
   */
  mutate(key, mutator, defaultValue) {
    const current = this.get(key, defaultValue);
    const next = mutator(current);
    this.set(key, next);
    return next;
  }
  /** Delete a key by setting it to undefined. */
  delete(key) {
    this.mp.set(WORLD_FORM_ID, key, void 0);
  }
};
__name(_WorldStore, "WorldStore");
var WorldStore = _WorldStore;

// gamemode/core/Sync.ts
var _SyncManager = class _SyncManager {
  constructor(mp2) {
    this.mp = mp2;
  }
  /** Send a typed packet to a single client. */
  send(userId, type, payload) {
    try {
      const packet = JSON.stringify({ customPacketType: `ff:${type}`, payload });
      this.mp.sendCustomPacket(userId, packet);
    } catch (e) {
      console.error(`[Sync] Failed to send "${type}" to userId=${userId}:`, e);
    }
  }
  /** Send to multiple specific players. */
  sendAll(userIds, type, payload) {
    for (const uid of userIds) {
      this.send(uid, type, payload);
    }
  }
  /**
   * Broadcast to all connected players.
   * The mp object doesn't expose a broadcast primitive, so we iterate the user list.
   * Pass the connected userId list from the store.
   */
  broadcast(connectedUserIds, type, payload) {
    this.sendAll(connectedUserIds, type, payload);
  }
  /**
   * Send a server message (notification) to a player.
   * Displayed as a chat-style notification on the client.
   */
  notify(userId, message, category = "info") {
    this.send(userId, "notification", { message, category });
  }
  notifyAll(userIds, message, category = "info") {
    for (const uid of userIds) {
      this.notify(uid, message, category);
    }
  }
};
__name(_SyncManager, "SyncManager");
var SyncManager = _SyncManager;

// gamemode/core/Module.ts
var TICK_INTERVAL_MS = 6e4;

// gamemode/core/Registry.ts
var _ModuleRegistry = class _ModuleRegistry {
  constructor(mp2) {
    this.mp = mp2;
    this.store = new PlayerStore();
    this.bus = new ExtendedEventBus();
    this.commands = new CommandBus();
    this.permissions = new Permissions();
    this.world = new WorldStore(mp2);
    this.sync = new SyncManager(mp2);
    this.commands.setPermissions(this.permissions);
  }
  modules = [];
  ctx;
  // ── Core singletons (created on construction) ──────────────────────────────
  store;
  bus;
  commands;
  permissions;
  world;
  sync;
  /** Register a module. Returns `this` for chaining. */
  register(module2) {
    this.modules.push(module2);
    return this;
  }
  /**
   * Get a registered module's public API by id.
   * Throws if not found (catches typos at startup, not runtime).
   */
  get(id) {
    const m = this.modules.find((m2) => m2.id === id);
    if (!m) throw new Error(`[Registry] Module "${id}" is not registered`);
    return m;
  }
  /** Initialize all modules and wire up SkyMP events. */
  async start() {
    const sorted = this.topologicalSort();
    this.ctx = {
      mp: this.mp,
      store: this.store,
      bus: this.bus,
      commands: this.commands,
      permissions: this.permissions,
      world: this.world,
      sync: this.sync,
      registry: this
    };
    const permData = this.world.get("ff_world_permissions", { staff: [], govt: [], jobs: [] });
    this.permissions.load(permData.staff, permData.govt, permData.jobs);
    for (const mod of sorted) {
      console.log(`[Registry] Initializing module: ${mod.name} v${mod.version}`);
      try {
        await mod.onInit(this.ctx);
      } catch (e) {
        console.error(`[Registry] Module "${mod.id}" failed to initialize:`, e);
      }
    }
    setInterval(() => {
      const now = Date.now();
      for (const mod of sorted) {
        if (mod.onTick) {
          void Promise.resolve(mod.onTick(this.ctx, now)).catch(
            (e) => console.error(`[Registry] Tick error in "${mod.id}":`, e)
          );
        }
      }
      this.persistPermissions();
    }, TICK_INTERVAL_MS);
    this.mp.on("connect", (userId) => {
      const actorId = this.mp.getUserActor(userId);
      const name = this.mp.getActorName(actorId);
      const state = this.store.registerPlayer(userId, actorId, name);
      this.bus.dispatch({ type: "playerJoined", payload: { playerId: userId, actorId, name }, timestamp: Date.now() });
      for (const mod of sorted) {
        if (mod.onPlayerJoin) {
          void Promise.resolve(mod.onPlayerJoin(this.ctx, state)).catch(
            (e) => console.error(`[Registry] onPlayerJoin error in "${mod.id}":`, e)
          );
        }
      }
      console.log(`[Frostfall] + ${name} (userId=${userId})`);
    });
    this.mp.on("disconnect", (userId) => {
      const state = this.store.get(userId);
      if (!state) return;
      for (const mod of sorted) {
        if (mod.onPlayerLeave) {
          void Promise.resolve(mod.onPlayerLeave(this.ctx, state)).catch(
            (e) => console.error(`[Registry] onPlayerLeave error in "${mod.id}":`, e)
          );
        }
      }
      this.bus.dispatch({ type: "playerLeft", payload: { playerId: userId }, timestamp: Date.now() });
      this.store.deregisterPlayer(userId);
      console.log(`[Frostfall] - ${state.name} disconnected`);
    });
    this.mp.on("customPacket", (userId, rawContent) => {
      let content;
      try {
        content = JSON.parse(rawContent);
      } catch {
        return;
      }
      const type = content["customPacketType"];
      if (typeof type !== "string") return;
      if (type === "ff:command") {
        const text = content["text"];
        if (typeof text === "string") {
          const state2 = this.store.get(userId);
          if (state2) {
            const raw = text.startsWith("/") ? text.slice(1) : text;
            this.commands.dispatch(state2, raw, (uid, msg) => {
              this.sync.notify(uid, msg);
            });
          }
        }
        return;
      }
      const state = this.store.get(userId);
      if (!state) return;
      for (const mod of sorted) {
        if (mod.onPacket) {
          void Promise.resolve(mod.onPacket(this.ctx, userId, type, content)).catch(
            (e) => console.error(`[Registry] onPacket error in "${mod.id}" for type="${type}":`, e)
          );
        }
      }
    });
    console.log(`[Registry] All ${sorted.length} modules initialized.`);
  }
  /** Expose connected player IDs for broadcast helpers */
  getConnectedUserIds() {
    return this.store.getAll().map((p) => p.id);
  }
  persistPermissions() {
    const data = this.permissions.serialize();
    this.world.set("ff_world_permissions", data);
  }
  // ── Topological sort (Kahn's algorithm) ──────────────────────────────────
  topologicalSort() {
    var _a;
    const idToMod = new Map(this.modules.map((m) => [m.id, m]));
    const inDegree = new Map(this.modules.map((m) => [m.id, 0]));
    for (const mod of this.modules) {
      for (const dep of mod.dependsOn ?? []) {
        if (!idToMod.has(dep)) {
          throw new Error(
            `[Registry] Module "${mod.id}" depends on "${dep}" which is not registered`
          );
        }
        inDegree.set(mod.id, (inDegree.get(mod.id) ?? 0) + 1);
      }
    }
    const queue = this.modules.filter((m) => (inDegree.get(m.id) ?? 0) === 0);
    const result = [];
    while (queue.length > 0) {
      const mod = queue.shift();
      result.push(mod);
      for (const other of this.modules) {
        if ((_a = other.dependsOn) == null ? void 0 : _a.includes(mod.id)) {
          const deg = (inDegree.get(other.id) ?? 0) - 1;
          inDegree.set(other.id, deg);
          if (deg === 0) queue.push(other);
        }
      }
    }
    if (result.length !== this.modules.length) {
      throw new Error("[Registry] Circular dependency detected in module graph");
    }
    return result;
  }
};
__name(_ModuleRegistry, "ModuleRegistry");
var ModuleRegistry = _ModuleRegistry;

// gamemode/hunger.ts
var HUNGER_MAX = 10;
var HUNGER_MIN = 0;
var HUNGER_DRAIN_INTERVAL_MINUTES = 30;
var TICK_INTERVAL_MS2 = 6e4;
function calcNewHunger(current, delta) {
  return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta));
}
__name(calcNewHunger, "calcNewHunger");
function shouldDrainHunger(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % HUNGER_DRAIN_INTERVAL_MINUTES === 0;
}
__name(shouldDrainHunger, "shouldDrainHunger");
function getHungerUpdateOwner() {
  return `
    const v = ctx.value;
    const sp = ctx.sp;
    const pl = sp.Game.getPlayer();
    if (!pl) return;
    if (v <= 2) {
      pl.setActorValue("HealRate", Math.max(0, pl.getActorValue("HealRate") - 15));
    } else if (v >= 9) {
      pl.setActorValue("StaminaRate", pl.getActorValue("StaminaRate") + 25);
    }
  `.trim();
}
__name(getHungerUpdateOwner, "getHungerUpdateOwner");
function initHunger(mp2, store, bus) {
  mp2.makeProperty("ff_hunger", {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: getHungerUpdateOwner(),
    updateNeighbor: ""
  });
  bus.on("playerJoined", (event) => {
    const { playerId, actorId } = event.payload;
    const persisted = mp2.get(actorId, "ff_hunger");
    const hunger = persisted ?? HUNGER_MAX;
    store.update(playerId, { hungerLevel: hunger });
    mp2.set(actorId, "ff_hunger", hunger);
  });
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      const next = player.minutesOnline + 1;
      store.update(player.id, { minutesOnline: next });
      if (shouldDrainHunger(next)) {
        const newHunger = calcNewHunger(player.hungerLevel, -1);
        store.update(player.id, { hungerLevel: newHunger });
        mp2.set(player.actorId, "ff_hunger", newHunger);
        bus.dispatch({
          type: "hungerTick",
          payload: { playerId: player.id, hungerLevel: newHunger },
          timestamp: Date.now()
        });
      }
    }
  }, TICK_INTERVAL_MS2);
  return () => clearInterval(interval);
}
__name(initHunger, "initHunger");

// gamemode/adapters/HungerModule.ts
var _HungerModule = class _HungerModule {
  id = "hunger";
  name = "Hunger";
  version = "1.0.0";
  onInit(ctx) {
    initHunger(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_HungerModule, "HungerModule");
var HungerModule = _HungerModule;

// gamemode/drunkBar.ts
var DRUNK_MAX = 10;
var DRUNK_MIN = 0;
var SOBER_DRAIN_INTERVAL_MINUTES = 5;
var TICK_INTERVAL_MS3 = 6e4;
function calcNewDrunkLevel(current, delta) {
  return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta));
}
__name(calcNewDrunkLevel, "calcNewDrunkLevel");
function shouldSober(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % SOBER_DRAIN_INTERVAL_MINUTES === 0;
}
__name(shouldSober, "shouldSober");
function getDrunkUpdateOwner() {
  return `
    const v = ctx.value;
    const sp = ctx.sp;
    const pl = sp.Game.getPlayer();
    if (!pl) return;
    if (v >= 8) {
      pl.setActorValue("WeaponSpeedMult", Math.max(0.5, pl.getActorValue("WeaponSpeedMult") - 0.3));
    } else if (v >= 5) {
      pl.setActorValue("WeaponSpeedMult", Math.max(0.7, pl.getActorValue("WeaponSpeedMult") - 0.15));
    }
  `.trim();
}
__name(getDrunkUpdateOwner, "getDrunkUpdateOwner");
function initDrunkBar(mp2, store, bus) {
  mp2.makeProperty("ff_drunk", {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: getDrunkUpdateOwner(),
    updateNeighbor: ""
  });
  bus.on("playerJoined", (event) => {
    const { playerId, actorId } = event.payload;
    const persisted = mp2.get(actorId, "ff_drunk");
    const drunk = persisted ?? DRUNK_MIN;
    store.update(playerId, { drunkLevel: drunk });
    mp2.set(actorId, "ff_drunk", drunk);
  });
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      if (player.drunkLevel <= DRUNK_MIN) continue;
      if (shouldSober(player.minutesOnline)) {
        const newDrunk = calcNewDrunkLevel(player.drunkLevel, -1);
        store.update(player.id, { drunkLevel: newDrunk });
        mp2.set(player.actorId, "ff_drunk", newDrunk);
        bus.dispatch({
          type: "drunkChanged",
          payload: { playerId: player.id, drunkLevel: newDrunk },
          timestamp: Date.now()
        });
      }
    }
  }, TICK_INTERVAL_MS3);
  return () => clearInterval(interval);
}
__name(initDrunkBar, "initDrunkBar");

// gamemode/adapters/DrunkBarModule.ts
var _DrunkBarModule = class _DrunkBarModule {
  id = "drunkBar";
  name = "Drunk Bar";
  version = "1.0.0";
  onInit(ctx) {
    initDrunkBar(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_DrunkBarModule, "DrunkBarModule");
var DrunkBarModule = _DrunkBarModule;

// gamemode/skymp.ts
function getInventory(mp2, actorId) {
  const inv = mp2.get(actorId, "inventory");
  return inv ?? { entries: [] };
}
__name(getInventory, "getInventory");
function setInventory(mp2, actorId, inventory) {
  mp2.set(actorId, "inventory", inventory);
}
__name(setInventory, "setInventory");
function getGold(mp2, actorId) {
  const inv = getInventory(mp2, actorId);
  const entry = inv.entries.find((e) => e.baseId === 15);
  return (entry == null ? void 0 : entry.count) ?? 0;
}
__name(getGold, "getGold");
function setGold(mp2, actorId, amount) {
  const inv = getInventory(mp2, actorId);
  const filtered = inv.entries.filter((e) => e.baseId !== 15);
  if (amount > 0) {
    filtered.push({ baseId: 15, count: amount });
  }
  setInventory(mp2, actorId, { entries: filtered });
}
__name(setGold, "setGold");
function addGold(mp2, actorId, amount) {
  const current = getGold(mp2, actorId);
  const next = current + amount;
  setGold(mp2, actorId, next);
  return next;
}
__name(addGold, "addGold");
function sendPacket(mp2, userId, type, payload) {
  mp2.sendCustomPacket(userId, JSON.stringify({ customPacketType: type, ...payload }));
}
__name(sendPacket, "sendPacket");

// gamemode/economy.ts
var STIPEND_PER_HOUR = 50;
var STIPEND_MAX_HOURS = 24;
var STIPEND_TOTAL = STIPEND_PER_HOUR * STIPEND_MAX_HOURS;
var STIPEND_INTERVAL_MINUTES = 60;
var TICK_INTERVAL_MS4 = 6e4;
function isStipendEligible(stipendPaidHours) {
  return stipendPaidHours < STIPEND_MAX_HOURS;
}
__name(isStipendEligible, "isStipendEligible");
function shouldPayStipend(minutesOnline, stipendPaidHours) {
  if (!isStipendEligible(stipendPaidHours)) return false;
  return minutesOnline > 0 && minutesOnline % STIPEND_INTERVAL_MINUTES === 0;
}
__name(shouldPayStipend, "shouldPayStipend");
function initEconomy(mp2, store, bus) {
  bus.on("playerJoined", (event) => {
    const { playerId, actorId } = event.payload;
    const septims = getGold(mp2, actorId);
    const paidHours = mp2.get(actorId, "ff_stipendHours") ?? 0;
    store.update(playerId, { septims, stipendPaidHours: paidHours });
  });
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      if (shouldPayStipend(player.minutesOnline, player.stipendPaidHours)) {
        const newTotal = addGold(mp2, player.actorId, STIPEND_PER_HOUR);
        const newHours = player.stipendPaidHours + 1;
        store.update(player.id, {
          septims: newTotal,
          stipendPaidHours: newHours
        });
        mp2.set(player.actorId, "ff_stipendHours", newHours);
        bus.dispatch({
          type: "stipendTick",
          payload: { playerId: player.id, amount: STIPEND_PER_HOUR, totalPaid: newHours * STIPEND_PER_HOUR },
          timestamp: Date.now()
        });
        console.log(`[Economy] Stipend paid to ${player.name}: ${STIPEND_PER_HOUR} septims (hour ${newHours}/${STIPEND_MAX_HOURS})`);
      }
    }
  }, TICK_INTERVAL_MS4);
  return () => clearInterval(interval);
}
__name(initEconomy, "initEconomy");

// gamemode/adapters/EconomyModule.ts
var _EconomyModule = class _EconomyModule {
  id = "economy";
  name = "Economy";
  version = "1.0.0";
  onInit(ctx) {
    initEconomy(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_EconomyModule, "EconomyModule");
var EconomyModule = _EconomyModule;

// gamemode/bounty.ts
var PROP_KEY = "ff_bounty";
function loadBounties(mp2, actorId) {
  const raw = mp2.get(actorId, PROP_KEY);
  return raw ?? [];
}
__name(loadBounties, "loadBounties");
function buildBountyMap(records) {
  const map = {};
  for (const r of records) {
    if (r.amount > 0) map[r.holdId] = r.amount;
  }
  return map;
}
__name(buildBountyMap, "buildBountyMap");
function initBounty(mp2, store, bus) {
  bus.on("playerJoined", (event) => {
    const { playerId } = event.payload;
    const player = store.get(playerId);
    if (!player) return;
    const records = loadBounties(mp2, player.actorId);
    const bountyMap = buildBountyMap(records);
    store.update(playerId, { bounty: bountyMap });
    if (records.length > 0) {
      sendPacket(mp2, playerId, "bountySync", { records });
    }
  });
}
__name(initBounty, "initBounty");

// gamemode/adapters/BountyModule.ts
var _BountyModule = class _BountyModule {
  id = "bounty";
  name = "Bounty";
  version = "1.0.0";
  onInit(ctx) {
    initBounty(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_BountyModule, "BountyModule");
var BountyModule = _BountyModule;

// gamemode/courier.ts
var DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1e3;
function filterExpired(notifications, now = Date.now()) {
  return notifications.filter(
    (n) => n.expiresAt === null || n.expiresAt > now
  );
}
__name(filterExpired, "filterExpired");
function getUnread(notifications) {
  return notifications.filter((n) => !n.read);
}
__name(getUnread, "getUnread");
var PROP_KEY2 = "ff_courier";
function loadNotifications(mp2, actorId) {
  const raw = mp2.get(actorId, PROP_KEY2);
  return raw ?? [];
}
__name(loadNotifications, "loadNotifications");
function initCourier(mp2, store, bus) {
  bus.on("playerJoined", (event) => {
    var _a;
    const { playerId, actorId } = event.payload;
    const notifications = loadNotifications(mp2, actorId);
    const unread = getUnread(filterExpired(notifications));
    if (unread.length > 0) {
      sendPacket(mp2, playerId, "courierDelivery", {
        count: unread.length,
        notifications: unread
      });
      console.log(`[Courier] Delivered ${unread.length} notification(s) to ${((_a = store.get(playerId)) == null ? void 0 : _a.name) ?? playerId}`);
    }
  });
}
__name(initCourier, "initCourier");

// gamemode/housing.ts
var PROPERTY_REGISTRY = [
  // Whiterun
  { id: "whiterun-breezehome", holdId: "whiterun", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "whiterun-drunken-huntsman", holdId: "whiterun", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "whiterun-belethor-general", holdId: "whiterun", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Windhelm
  { id: "eastmarch-hjerim", holdId: "eastmarch", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "eastmarch-candlehearth", holdId: "eastmarch", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Riften
  { id: "rift-honeyside", holdId: "rift", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "rift-pawned-prawn", holdId: "rift", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Markarth
  { id: "reach-vlindrel-hall", holdId: "reach", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "reach-silver-blood-inn", holdId: "reach", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Solitude
  { id: "haafingar-proudspire", holdId: "haafingar", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "haafingar-winking-skeever", holdId: "haafingar", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Dawnstar
  { id: "pale-windpeak-inn", holdId: "pale", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Falkreath
  { id: "falkreath-lakeview-manor", holdId: "falkreath", type: "home", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: "falkreath-dead-mans-drink", holdId: "falkreath", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Morthal
  { id: "hjaalmarch-highmoon-hall", holdId: "hjaalmarch", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Winterhold
  { id: "winterhold-frozen-hearth", holdId: "winterhold", type: "business", ownerId: null, pendingRequestBy: null, pendingRequestAt: null }
];
var PROP_KEY3 = "ff_properties";
var properties = new Map(
  PROPERTY_REGISTRY.map((p) => [p.id, { ...p }])
);
function loadProperties(mp2) {
  const saved = mp2.get(0, PROP_KEY3);
  if (saved && Array.isArray(saved)) {
    for (const p of saved) {
      if (properties.has(p.id)) {
        properties.set(p.id, p);
      }
    }
  }
}
__name(loadProperties, "loadProperties");
function getPropertiesByHold(holdId) {
  return Array.from(properties.values()).filter((p) => p.holdId === holdId);
}
__name(getPropertiesByHold, "getPropertiesByHold");
function getOwnedProperties(playerId) {
  return Array.from(properties.values()).filter((p) => p.ownerId === playerId);
}
__name(getOwnedProperties, "getOwnedProperties");
function isAvailable(propertyId) {
  const p = properties.get(propertyId);
  if (!p) return false;
  return p.ownerId === null && p.pendingRequestBy === null;
}
__name(isAvailable, "isAvailable");
function initHousing(mp2, store, bus) {
  loadProperties(mp2);
  bus.on("playerJoined", (event) => {
    const { playerId } = event.payload;
    const owned = getOwnedProperties(playerId).map((p) => p.id);
    store.update(playerId, { properties: owned });
    const player = store.get(playerId);
    if (player == null ? void 0 : player.holdId) {
      const available = getPropertiesByHold(player.holdId).filter((p) => isAvailable(p.id));
      sendPacket(mp2, playerId, "propertyList", { properties: available });
    }
  });
}
__name(initHousing, "initHousing");

// gamemode/adapters/HousingModule.ts
var _HousingModule = class _HousingModule {
  id = "housing";
  name = "Housing";
  version = "1.0.0";
  onInit(ctx) {
    initHousing(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_HousingModule, "HousingModule");
var HousingModule = _HousingModule;

// gamemode/adapters/CourierModule.ts
var _CourierModule = class _CourierModule {
  id = "courier";
  name = "Courier";
  version = "1.0.0";
  onInit(ctx) {
    initCourier(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_CourierModule, "CourierModule");
var CourierModule = _CourierModule;

// gamemode/factions.ts
var MEMBERS_KEY = "ff_memberships";
function loadMemberships(mp2, actorId) {
  return mp2.get(actorId, MEMBERS_KEY) ?? [];
}
__name(loadMemberships, "loadMemberships");
function initFactions(mp2, store, bus) {
  bus.on("playerJoined", (event) => {
    const { playerId } = event.payload;
    const player = store.get(playerId);
    if (!player) return;
    const memberships = loadMemberships(mp2, player.actorId);
    const factionIds = memberships.map((m) => m.factionId);
    store.update(playerId, { factions: factionIds });
    if (memberships.length > 0) {
      sendPacket(mp2, playerId, "factionSync", { memberships });
    }
  });
}
__name(initFactions, "initFactions");

// gamemode/adapters/FactionsModule.ts
var _FactionsModule = class _FactionsModule {
  id = "factions";
  name = "Factions";
  version = "1.0.0";
  onInit(ctx) {
    initFactions(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_FactionsModule, "FactionsModule");
var FactionsModule = _FactionsModule;

// gamemode/college.ts
var XP_THRESHOLDS = {
  novice: 0,
  apprentice: 100,
  adept: 300,
  expert: 600,
  master: 1e3
};
var LECTURE_BOOST_MS = 24 * 60 * 60 * 1e3;
var XP_KEY = "ff_study_xp";
var BOOST_KEY = "ff_lecture_boost";
function getCollegeRank(xp) {
  const tiers = ["master", "expert", "adept", "apprentice", "novice"];
  for (const tier of tiers) {
    if (xp >= XP_THRESHOLDS[tier]) return tier;
  }
  return "novice";
}
__name(getCollegeRank, "getCollegeRank");
function initCollege(mp2, store, bus) {
  mp2.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: "",
    updateNeighbor: ""
  });
  mp2.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    // Client reads boostUntil timestamp; if future, applies +15% magicka regen
    updateOwner: `
      var boostUntil = mp.get(mp.actor, 'ff_lecture_boost') || 0;
      var active = boostUntil > Date.now() ? 1 : 0;
      return { magickaRegenMult: active === 1 ? 1.15 : 1.0, boostActive: active };
    `,
    updateNeighbor: ""
  });
  bus.on("playerJoined", (event) => {
    const { playerId, actorId } = event.payload;
    const player = store.get(playerId);
    if (!player) return;
    const xp = mp2.get(actorId, XP_KEY) ?? 0;
    const rank = getCollegeRank(xp);
    sendPacket(mp2, playerId, "studyXpUpdate", { xp, rank });
    const boostUntil = mp2.get(actorId, BOOST_KEY) ?? 0;
    if (boostUntil > Date.now()) {
      sendPacket(mp2, playerId, "lectureBoostActive", {
        boostUntil,
        remainingMs: boostUntil - Date.now()
      });
    }
  });
}
__name(initCollege, "initCollege");

// gamemode/adapters/CollegeModule.ts
var _CollegeModule = class _CollegeModule {
  id = "college";
  name = "College of Winterhold";
  version = "1.0.0";
  onInit(ctx) {
    initCollege(ctx.mp, ctx.store, ctx.bus);
  }
};
__name(_CollegeModule, "CollegeModule");
var CollegeModule = _CollegeModule;

// gamemode/types/index.ts
var ALL_HOLDS = [
  "whiterun",
  "eastmarch",
  "rift",
  "reach",
  "haafingar",
  "pale",
  "falkreath",
  "hjaalmarch",
  "winterhold"
];
var HOLD_NAMES = {
  whiterun: "Whiterun",
  eastmarch: "Eastmarch",
  rift: "The Rift",
  reach: "The Reach",
  haafingar: "Haafingar",
  pale: "The Pale",
  falkreath: "Falkreath",
  hjaalmarch: "Hjaalmarch",
  winterhold: "Winterhold"
};

// gamemode/modules/governance/GovernanceModule.ts
var APPOINTABLE_BY_JARL = [
  "housecarl",
  "steward",
  "thane",
  "courtWizard",
  "captain"
];
var _GovernanceModule = class _GovernanceModule {
  id = "governance";
  name = "Governance";
  version = "1.0.0";
  onInit(ctx) {
    this.registerCommands(ctx);
    console.log("[Governance] Module initialized");
  }
  onPlayerJoin(ctx, player) {
    const positions = ctx.permissions.getGovernmentPositions();
    ctx.sync.send(player.id, "governanceSync", { positions });
  }
  registerCommands(ctx) {
    ctx.commands.register({
      name: "appoint",
      description: "Appoint a player to a government role in your hold",
      permission: "jarl",
      handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        if (args.length < 2) {
          reply(`Usage: /appoint <${APPOINTABLE_BY_JARL.join("|")}> <playerName>`);
          return;
        }
        const role = args[0].toLowerCase();
        if (!APPOINTABLE_BY_JARL.includes(role)) {
          replyError(`Invalid role. Available: ${APPOINTABLE_BY_JARL.join(", ")}`);
          return;
        }
        const targetName = args.slice(1).join(" ");
        const target = ctx.store.getAll().find(
          (p) => p.name.toLowerCase() === targetName.toLowerCase()
        );
        if (!target) {
          replyError(`Player "${targetName}" is not online.`);
          return;
        }
        const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl");
        if (!jarlPos) {
          replyError("You are not a Jarl.");
          return;
        }
        ctx.permissions.appoint(target.id, role, jarlPos.holdId, caller.id);
        this.persistAndBroadcast(ctx);
        reply(`You appointed ${target.name} as ${role} of ${HOLD_NAMES[jarlPos.holdId]}.`);
        ctx.sync.notify(target.id, `You have been appointed as ${role} of ${HOLD_NAMES[jarlPos.holdId]} by ${caller.name}.`);
        ctx.bus.dispatch({
          type: "positionAppointed",
          payload: { playerId: target.id, role, holdId: jarlPos.holdId, appointedBy: caller.id },
          timestamp: Date.now()
        });
      }, "handler")
    });
    ctx.commands.register({
      name: "dismiss",
      description: "Remove a player from a government role in your hold",
      permission: "jarl",
      handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        if (args.length < 2) {
          reply("Usage: /dismiss <role> <playerName>");
          return;
        }
        const role = args[0].toLowerCase();
        const targetName = args.slice(1).join(" ");
        const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl");
        if (!jarlPos) {
          replyError("You are not a Jarl.");
          return;
        }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === targetName.toLowerCase());
        if (!target) {
          replyError(`Player "${targetName}" is not online.`);
          return;
        }
        const removed = ctx.permissions.removeGovernmentRole(target.id, role, jarlPos.holdId);
        if (!removed) {
          replyError(`${target.name} does not hold that role.`);
          return;
        }
        this.persistAndBroadcast(ctx);
        reply(`You dismissed ${target.name} from ${role}.`);
        ctx.sync.notify(target.id, `You have been dismissed from ${role} by ${caller.name}.`);
      }, "handler")
    });
    ctx.commands.register({
      name: "resign",
      description: "Resign from your government role",
      permission: "any",
      handler: /* @__PURE__ */ __name(({ caller, reply, replyError }) => {
        const positions = ctx.permissions.getGovernmentPositions(caller.id);
        if (positions.length === 0) {
          replyError("You hold no government position.");
          return;
        }
        for (const pos of positions) {
          ctx.permissions.removeGovernmentRole(caller.id, pos.role, pos.holdId);
        }
        this.persistAndBroadcast(ctx);
        reply("You have resigned from your government role(s).");
      }, "handler")
    });
    ctx.commands.register({
      name: "government",
      description: "Show the government of a hold",
      permission: "any",
      handler: /* @__PURE__ */ __name(({ caller, args, reply }) => {
        const holdId = args[0] ?? caller.holdId;
        if (!holdId) {
          reply("Specify a hold: /government <holdId>");
          return;
        }
        const positions = ctx.permissions.getHoldGovernment(holdId);
        if (positions.length === 0) {
          reply(`${HOLD_NAMES[holdId] ?? holdId} has no government appointed.`);
          return;
        }
        const lines = positions.map((p) => {
          var _a;
          const name = ((_a = ctx.store.getAll().find((s) => s.id === p.playerId)) == null ? void 0 : _a.name) ?? `(offline:${p.playerId})`;
          return `  ${p.role}: ${name}${p.customTitle ? ` (${p.customTitle})` : ""}`;
        });
        reply(`Government of ${HOLD_NAMES[holdId] ?? holdId}:
${lines.join("\n")}`);
      }, "handler")
    });
    ctx.commands.register({
      name: "jarl",
      description: "Admin: manage Jarls of holds",
      subcommands: {
        appoint: {
          description: "Appoint a Jarl",
          usage: "<hold> <playerName>",
          permission: "admin",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            if (args.length < 2) {
              reply("Usage: /jarl appoint <hold> <playerName>");
              return;
            }
            const holdId = args[0];
            const targetName = args.slice(1).join(" ");
            const target = ctx.store.getAll().find(
              (p) => p.name.toLowerCase() === targetName.toLowerCase()
            );
            if (!target) {
              replyError(`Player "${targetName}" is not online.`);
              return;
            }
            const existing = ctx.permissions.getJarl(holdId);
            if (existing) {
              ctx.permissions.removeGovernmentRole(existing.playerId, "jarl", holdId);
              ctx.sync.notify(existing.playerId, `You have been replaced as Jarl of ${HOLD_NAMES[holdId]}.`);
            }
            ctx.permissions.appoint(target.id, "jarl", holdId, "console");
            this.persistAndBroadcast(ctx);
            reply(`${target.name} is now Jarl of ${HOLD_NAMES[holdId]}.`);
            ctx.sync.notify(target.id, `You have been appointed as Jarl of ${HOLD_NAMES[holdId]}!`);
            ctx.bus.dispatch({
              type: "jarlAppointed",
              payload: { playerId: target.id, holdId, appointedBy: "console" },
              timestamp: Date.now()
            });
          }, "handler")
        },
        remove: {
          description: "Remove the Jarl of a hold",
          usage: "<hold>",
          permission: "admin",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            const holdId = args[0];
            if (!holdId) {
              reply("Usage: /jarl remove <hold>");
              return;
            }
            const jarl = ctx.permissions.getJarl(holdId);
            if (!jarl) {
              replyError(`${HOLD_NAMES[holdId]} has no Jarl.`);
              return;
            }
            ctx.permissions.removeGovernmentRole(jarl.playerId, "jarl", holdId);
            this.persistAndBroadcast(ctx);
            ctx.sync.notify(jarl.playerId, `You have been removed as Jarl of ${HOLD_NAMES[holdId]}.`);
            reply(`The Jarl of ${HOLD_NAMES[holdId]} has been removed.`);
          }, "handler")
        },
        list: {
          description: "List all Jarls",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ reply }) => {
            const lines = Object.entries(HOLD_NAMES).map(([holdId, name]) => {
              var _a;
              const jarl = ctx.permissions.getJarl(holdId);
              const jarlName = jarl ? ((_a = ctx.store.getAll().find((p) => p.id === jarl.playerId)) == null ? void 0 : _a.name) ?? `(offline:${jarl.playerId})` : "(vacant)";
              return `  ${name}: ${jarlName}`;
            });
            reply(`Current Jarls:
${lines.join("\n")}`);
          }, "handler")
        }
      }
    });
  }
  persistAndBroadcast(ctx) {
    ctx.world.set("ff_world_permissions", ctx.permissions.serialize());
    const positions = ctx.permissions.getGovernmentPositions();
    const ids = ctx.store.getAll().map((p) => p.id);
    ctx.sync.broadcast(ids, "governanceSync", { positions });
  }
};
__name(_GovernanceModule, "GovernanceModule");
var GovernanceModule = _GovernanceModule;

// gamemode/modules/taxation/TaxationModule.ts
var WORLD_KEY = "ff_world_treasury";
var BUSINESS_TAX_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_TAX_RATE = 5;
var DEFAULT_BUSINESS_TAX = 100;
var MAX_TAX_RATE = 30;
var MAX_BUSINESS_TAX = 500;
var _TaxationModule = class _TaxationModule {
  id = "taxation";
  name = "Taxation";
  version = "1.0.0";
  dependsOn = ["governance"];
  treasuries = [];
  onInit(ctx) {
    this.treasuries = ctx.world.get(WORLD_KEY, []);
    for (const holdId of ALL_HOLDS) {
      if (!this.treasuries.find((t) => t.holdId === holdId)) {
        this.treasuries.push({
          holdId,
          septims: 0,
          taxRate: DEFAULT_TAX_RATE,
          businessTaxRate: DEFAULT_BUSINESS_TAX,
          lastCollectedAt: Date.now()
        });
      }
    }
    this.persist(ctx);
    ctx.bus.on("goldTransferred", (event) => {
      const { fromId, toId, amount, reason } = event.payload;
      if (reason === "tax") return;
      const fromState = ctx.store.get(fromId);
      const toState = ctx.store.get(toId);
      if (!fromState || !toState) return;
      if (fromState.holdId !== toState.holdId || !fromState.holdId) return;
      const treasury = this.getTreasury(fromState.holdId);
      if (treasury.taxRate === 0) return;
      const taxAmount = Math.floor(amount * treasury.taxRate / 100);
      if (taxAmount <= 0) return;
      this.addToTreasury(fromState.holdId, taxAmount, ctx);
      ctx.sync.notify(fromId, `${taxAmount} septim tax collected by ${HOLD_NAMES[fromState.holdId]} (${treasury.taxRate}%).`);
    });
    this.registerCommands(ctx);
    console.log("[Taxation] Module initialized");
  }
  onTick(ctx, now) {
    for (const treasury of this.treasuries) {
      const elapsed = now - treasury.lastCollectedAt;
      if (elapsed < BUSINESS_TAX_INTERVAL_MS) continue;
      const merchants = ctx.permissions.getJobHolders("merchant", treasury.holdId);
      let collected = 0;
      for (const job of merchants) {
        const player = ctx.store.get(job.playerId);
        if (!player) continue;
        const fee = treasury.businessTaxRate;
        if (player.septims >= fee) {
          ctx.store.update(job.playerId, { septims: player.septims - fee });
          collected += fee;
          ctx.sync.notify(job.playerId, `${fee} septims business tax collected for ${HOLD_NAMES[treasury.holdId]}.`);
        } else {
          const jarl = ctx.permissions.getJarl(treasury.holdId);
          if (jarl) ctx.sync.notify(jarl.playerId, `Merchant ${player.name} cannot pay business tax in ${HOLD_NAMES[treasury.holdId]}.`);
        }
      }
      if (collected > 0) this.addToTreasury(treasury.holdId, collected, ctx);
      treasury.lastCollectedAt = now;
    }
    this.persist(ctx);
  }
  onPlayerJoin(ctx, player) {
    if (!player.holdId) return;
    ctx.sync.send(player.id, "treasurySync", this.getTreasury(player.holdId));
  }
  getTreasury(holdId) {
    return this.treasuries.find((t) => t.holdId === holdId);
  }
  applyTransactionTax(holdId, transferAmount, ctx) {
    const treasury = this.getTreasury(holdId);
    const tax = Math.floor(transferAmount * treasury.taxRate / 100);
    if (tax > 0) this.addToTreasury(holdId, tax, ctx);
    return tax;
  }
  addToTreasury(holdId, amount, ctx) {
    const t = this.getTreasury(holdId);
    t.septims += amount;
    ctx.bus.dispatch({ type: "taxCollected", payload: { holdId, amount, fromId: 0 }, timestamp: Date.now() });
    ctx.bus.dispatch({ type: "treasuryChanged", payload: { holdId, septims: t.septims }, timestamp: Date.now() });
    const jarl = ctx.permissions.getJarl(holdId);
    if (jarl) ctx.sync.send(jarl.playerId, "treasurySync", t);
  }
  persist(ctx) {
    ctx.world.set(WORLD_KEY, this.treasuries);
  }
  registerCommands(ctx) {
    ctx.commands.register({
      name: "tax",
      description: "Manage hold taxation and treasury",
      subcommands: {
        rate: {
          description: `Set transaction tax rate (0-${MAX_TAX_RATE}%)`,
          permission: "jarl",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const rate = parseInt(args[0] ?? "", 10);
            if (isNaN(rate) || rate < 0 || rate > MAX_TAX_RATE) {
              replyError(`Rate must be 0-${MAX_TAX_RATE}.`);
              return;
            }
            const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl");
            if (!jarlPos) {
              replyError("You are not a Jarl.");
              return;
            }
            this.getTreasury(jarlPos.holdId).taxRate = rate;
            this.persist(ctx);
            reply(`Transaction tax in ${HOLD_NAMES[jarlPos.holdId]} set to ${rate}%.`);
          }, "handler")
        },
        business: {
          description: `Set daily merchant fee (0-${MAX_BUSINESS_TAX} septims)`,
          permission: "jarl",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const fee = parseInt(args[0] ?? "", 10);
            if (isNaN(fee) || fee < 0 || fee > MAX_BUSINESS_TAX) {
              replyError(`Fee must be 0-${MAX_BUSINESS_TAX}.`);
              return;
            }
            const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl");
            if (!jarlPos) {
              replyError("You are not a Jarl.");
              return;
            }
            this.getTreasury(jarlPos.holdId).businessTaxRate = fee;
            this.persist(ctx);
            reply(`Merchant fee in ${HOLD_NAMES[jarlPos.holdId]} set to ${fee} septims/day.`);
          }, "handler")
        },
        treasury: {
          description: "View a hold treasury",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const holdId = args[0] ?? caller.holdId;
            if (!holdId) {
              replyError("Specify a hold.");
              return;
            }
            const t = this.getTreasury(holdId);
            reply(`${HOLD_NAMES[holdId]} Treasury
  Balance: ${t.septims} septims
  Tx tax: ${t.taxRate}%
  Merchant fee: ${t.businessTaxRate}/day`);
          }, "handler")
        },
        withdraw: {
          description: "Admin: withdraw from treasury",
          permission: "admin",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            if (args.length < 2) {
              reply("Usage: /tax withdraw <hold> <amount>");
              return;
            }
            const t = this.getTreasury(args[0]);
            const amount = parseInt(args[1], 10);
            if (!t || isNaN(amount) || amount <= 0) {
              replyError("Invalid.");
              return;
            }
            if (t.septims < amount) {
              replyError(`Insufficient (${t.septims} available).`);
              return;
            }
            t.septims -= amount;
            this.persist(ctx);
            reply(`Withdrew ${amount} from ${HOLD_NAMES[t.holdId]}. Remaining: ${t.septims}`);
          }, "handler")
        },
        give: {
          description: "Admin: add septims to treasury",
          permission: "admin",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            if (args.length < 2) {
              reply("Usage: /tax give <hold> <amount>");
              return;
            }
            const holdId = args[0];
            const amount = parseInt(args[1], 10);
            if (isNaN(amount) || amount <= 0) {
              replyError("Invalid amount.");
              return;
            }
            this.addToTreasury(holdId, amount, ctx);
            this.persist(ctx);
            reply(`Added ${amount} septims to ${HOLD_NAMES[holdId]} treasury.`);
          }, "handler")
        }
      }
    });
  }
};
__name(_TaxationModule, "TaxationModule");
var TaxationModule = _TaxationModule;

// gamemode/modules/jobs/JobsModule.ts
var JOBS = [
  { id: "guard", name: "Hold Guard", description: "Law enforcement.", perks: ["Can arrest players", "/arrest command"], requiresApproval: true, grantedBy: ["captain", "jarl", "admin"] },
  { id: "merchant", name: "Merchant", description: "Licensed trader.", perks: ["Market stall access", "/shop commands"], requiresApproval: true, grantedBy: ["steward", "jarl", "admin"] },
  { id: "blacksmith", name: "Blacksmith", description: "Crafts and repairs arms.", perks: ["Repair services", "Ore tax discount"], requiresApproval: true, grantedBy: ["steward", "jarl", "admin"] },
  { id: "innkeeper", name: "Innkeeper", description: "Runs an inn.", perks: ["Sell food/drink", "Rent rooms"], requiresApproval: true, grantedBy: ["steward", "jarl", "admin"] },
  { id: "farmer", name: "Farmer", description: "Crops and flora.", perks: ["Farm plots access", "Reduced crop tax"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "miner", name: "Miner", description: "Extracts ore.", perks: ["Mine access", "Reduced ore tax"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "woodcutter", name: "Woodcutter", description: "Chops lumber.", perks: ["Lumber camp access"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "hunter", name: "Hunter", description: "Hunts wildlife.", perks: ["Hunting license", "Tax-free market day"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "alchemist", name: "Alchemist", description: "Brews potions.", perks: ["Sell potions at stall", "Lab access"], requiresApproval: true, grantedBy: ["courtWizard", "steward", "jarl", "admin"] },
  { id: "bard", name: "Bard", description: "Entertains.", perks: ["Tip system via /tip"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "healer", name: "Healer", description: "Restoration.", perks: ["Charge for healing", "Apothecary access"], requiresApproval: false, grantedBy: ["courtWizard", "steward", "jarl", "admin"] },
  { id: "courier", name: "Courier", description: "Message delivery.", perks: ["Package delivery", "Reduced tolls"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "fisherman", name: "Fisherman", description: "Catches fish.", perks: ["Fishing rights", "Market selling"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] },
  { id: "lumberjack", name: "Lumberjack", description: "Bulk lumber.", perks: ["Bulk contracts", "Supply chain role"], requiresApproval: false, grantedBy: ["steward", "jarl", "admin"] }
];
var _JobsModule = class _JobsModule {
  id = "jobs";
  name = "Jobs";
  version = "1.0.0";
  dependsOn = ["governance"];
  onInit(ctx) {
    this.registerCommands(ctx);
    console.log("[Jobs] Module initialized");
  }
  onPlayerJoin(ctx, player) {
    ctx.sync.send(player.id, "jobsSync", { jobs: ctx.permissions.getPlayerJobs(player.id) });
  }
  registerCommands(ctx) {
    ctx.commands.register({
      name: "job",
      description: "Job management",
      subcommands: {
        apply: {
          description: "Apply for a job in your current hold",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const jobId = args[0];
            if (!jobId) {
              reply(`Usage: /job apply <${JOBS.map((j) => j.id).join("|")}>`);
              return;
            }
            const def = JOBS.find((j) => j.id === jobId);
            if (!def) {
              replyError(`Unknown job. Use /job list.`);
              return;
            }
            if (!caller.holdId) {
              replyError("You must be in a hold.");
              return;
            }
            if (def.requiresApproval) {
              const govt = ctx.permissions.getHoldGovernment(caller.holdId);
              const notifyList = govt.filter((g) => g.role === "steward" || g.role === "jarl");
              for (const pos of notifyList) {
                ctx.sync.notify(pos.playerId, `${caller.name} requests ${def.name} job. Use: /job assign ${caller.name} ${jobId}`);
              }
              reply(`${def.name} requires approval. A request has been sent to the Steward/Jarl.`);
              return;
            }
            ctx.permissions.assignJob(caller.id, jobId, caller.holdId, "system");
            ctx.sync.send(caller.id, "jobsSync", { jobs: ctx.permissions.getPlayerJobs(caller.id) });
            reply(`You are now a ${def.name} in ${HOLD_NAMES[caller.holdId]}.`);
            ctx.bus.dispatch({ type: "jobAssigned", payload: { playerId: caller.id, jobId, holdId: caller.holdId }, timestamp: Date.now() });
          }, "handler")
        },
        assign: {
          description: "Assign a job to a player",
          permission: "steward",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            var _a;
            if (args.length < 2) {
              reply("Usage: /job assign <playerName> <jobId>");
              return;
            }
            const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
            if (!target) {
              replyError(`Player "${args[0]}" not online.`);
              return;
            }
            const jobId = args[1];
            if (!JOBS.find((j) => j.id === jobId)) {
              replyError("Unknown job.");
              return;
            }
            const pos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl" || g.role === "steward");
            if (!pos) {
              replyError("Must be Jarl or Steward.");
              return;
            }
            ctx.permissions.assignJob(target.id, jobId, pos.holdId, caller.id);
            ctx.sync.send(target.id, "jobsSync", { jobs: ctx.permissions.getPlayerJobs(target.id) });
            ctx.sync.notify(target.id, `You are now a ${((_a = JOBS.find((j) => j.id === jobId)) == null ? void 0 : _a.name) ?? jobId} in ${HOLD_NAMES[pos.holdId]}, assigned by ${caller.name}.`);
            reply(`${target.name} assigned as ${jobId} in ${HOLD_NAMES[pos.holdId]}.`);
          }, "handler")
        },
        revoke: {
          description: "Revoke a job from a player",
          permission: "steward",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            if (args.length < 2) {
              reply("Usage: /job revoke <playerName> <jobId>");
              return;
            }
            const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
            if (!target) {
              replyError("Player not online.");
              return;
            }
            const pos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === "jarl" || g.role === "steward");
            if (!pos) {
              replyError("Must be Jarl or Steward.");
              return;
            }
            const removed = ctx.permissions.revokeJob(target.id, args[1], pos.holdId);
            if (!removed) {
              replyError("Job not found for that player in this hold.");
              return;
            }
            ctx.sync.send(target.id, "jobsSync", { jobs: ctx.permissions.getPlayerJobs(target.id) });
            ctx.sync.notify(target.id, `Your ${args[1]} license in ${HOLD_NAMES[pos.holdId]} was revoked by ${caller.name}.`);
            reply(`Revoked ${args[1]} from ${target.name}.`);
          }, "handler")
        },
        list: {
          description: "List available jobs",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ reply }) => {
            const lines = JOBS.map((j) => `  ${j.id.padEnd(12)} \u2014 ${j.name}${j.requiresApproval ? " [approval]" : ""}`);
            reply(`Available Jobs:
${lines.join("\n")}`);
          }, "handler")
        },
        info: {
          description: "Info about a job",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            const def = JOBS.find((j) => j.id === args[0]);
            if (!def) {
              replyError("Unknown job.");
              return;
            }
            reply(`${def.name}
${def.description}
Perks:
${def.perks.map((p) => `  - ${p}`).join("\n")}`);
          }, "handler")
        }
      }
    });
    ctx.commands.register({
      name: "myjobs",
      description: "View your current jobs",
      permission: "any",
      handler: /* @__PURE__ */ __name(({ caller, reply }) => {
        const jobs = ctx.permissions.getPlayerJobs(caller.id);
        if (jobs.length === 0) {
          reply("No jobs assigned.");
          return;
        }
        const lines = jobs.map((j) => {
          const def = JOBS.find((d) => d.id === j.jobId);
          return `  ${(def == null ? void 0 : def.name) ?? j.jobId} in ${HOLD_NAMES[j.holdId]}`;
        });
        reply(`Your jobs:
${lines.join("\n")}`);
      }, "handler")
    });
    ctx.commands.register({
      name: "tip",
      description: "Tip a bard",
      permission: "any",
      handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        if (args.length < 2) {
          reply("Usage: /tip <playerName> <amount>");
          return;
        }
        const amount = parseInt(args[1], 10);
        if (isNaN(amount) || amount <= 0) {
          replyError("Invalid amount.");
          return;
        }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
        if (!target) {
          replyError("Player not online.");
          return;
        }
        if (!ctx.permissions.has(target, "bard")) {
          replyError(`${target.name} is not a licensed Bard.`);
          return;
        }
        if (caller.septims < amount) {
          replyError("Insufficient funds.");
          return;
        }
        ctx.store.update(caller.id, { septims: caller.septims - amount });
        ctx.store.update(target.id, { septims: target.septims + amount });
        reply(`Tipped ${target.name} ${amount} septims.`);
        ctx.sync.notify(target.id, `${caller.name} tipped you ${amount} septims!`);
      }, "handler")
    });
  }
};
__name(_JobsModule, "JobsModule");
var JobsModule = _JobsModule;

// gamemode/util.ts
function randomUUID() {
  const hex = /* @__PURE__ */ __name((n) => n.toString(16).padStart(2, "0"), "hex");
  const bytes = Array.from({ length: 16 }, () => Math.random() * 256 | 0);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return hex(bytes[0]) + hex(bytes[1]) + hex(bytes[2]) + hex(bytes[3]) + "-" + hex(bytes[4]) + hex(bytes[5]) + "-" + hex(bytes[6]) + hex(bytes[7]) + "-" + hex(bytes[8]) + hex(bytes[9]) + "-" + hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15]);
}
__name(randomUUID, "randomUUID");

// gamemode/modules/merchants/MerchantsModule.ts
var WK_STALLS = "ff_world_stalls";
var WK_LISTINGS = "ff_world_listings";
var RENT_INTERVAL = 24 * 60 * 60 * 1e3;
var DEFAULT_STALLS = [
  { id: "wrun-1", holdId: "whiterun", name: "Whiterun Market A", description: "By the Gildergreen", rentPerDay: 50 },
  { id: "wrun-2", holdId: "whiterun", name: "Whiterun Market B", description: "Near the well", rentPerDay: 50 },
  { id: "whem-1", holdId: "eastmarch", name: "Windhelm Market A", description: "Grey Quarter side", rentPerDay: 45 },
  { id: "rift-1", holdId: "rift", name: "Riften Market A", description: "Canal level", rentPerDay: 40 },
  { id: "mark-1", holdId: "reach", name: "Markarth Market A", description: "Near the inn", rentPerDay: 45 },
  { id: "sol-1", holdId: "haafingar", name: "Solitude Market A", description: "Castle Dour road", rentPerDay: 60 },
  { id: "sol-2", holdId: "haafingar", name: "Solitude Market B", description: "Main street", rentPerDay: 55 },
  { id: "dawn-1", holdId: "pale", name: "Dawnstar Market A", description: "Near the inn", rentPerDay: 30 },
  { id: "falk-1", holdId: "falkreath", name: "Falkreath Market A", description: "Town square", rentPerDay: 30 },
  { id: "mort-1", holdId: "hjaalmarch", name: "Morthal Market A", description: "Longhouse side", rentPerDay: 25 },
  { id: "wint-1", holdId: "winterhold", name: "Winterhold Market A", description: "College road", rentPerDay: 20 }
];
var _MerchantsModule = class _MerchantsModule {
  id = "merchants";
  name = "Merchants & Market";
  version = "1.0.0";
  dependsOn = ["governance", "jobs", "taxation"];
  stalls = [];
  listings = [];
  onInit(ctx) {
    this.stalls = ctx.world.get(WK_STALLS, []);
    this.listings = ctx.world.get(WK_LISTINGS, []);
    if (this.stalls.length === 0) {
      this.stalls = DEFAULT_STALLS.map((s) => ({ ...s, merchantId: null, lastRentPaidAt: null }));
      this.persist(ctx);
    }
    this.registerCommands(ctx);
    console.log("[Merchants] Module initialized");
  }
  onTick(ctx, now) {
    for (const stall of this.stalls) {
      if (!stall.merchantId) continue;
      const lastPaid = stall.lastRentPaidAt ?? now;
      if (now - lastPaid < RENT_INTERVAL) continue;
      const m = ctx.store.get(stall.merchantId);
      if (m && m.septims >= stall.rentPerDay) {
        ctx.store.update(m.id, { septims: m.septims - stall.rentPerDay });
        stall.lastRentPaidAt = now;
        ctx.sync.notify(m.id, `${stall.rentPerDay} septims stall rent collected for "${stall.name}".`);
      } else {
        if (m) ctx.sync.notify(m.id, `Evicted from "${stall.name}" \u2014 could not pay rent.`);
        this.vacate(stall.id, ctx);
      }
    }
    this.persist(ctx);
  }
  onPlayerJoin(ctx, player) {
    ctx.sync.send(player.id, "marketSync", {
      stalls: player.holdId ? this.stalls.filter((s) => s.holdId === player.holdId) : this.stalls,
      listings: player.holdId ? this.listings.filter((l) => l.holdId === player.holdId) : this.listings
    });
  }
  vacate(stallId, ctx) {
    const s = this.stalls.find((x) => x.id === stallId);
    if (!s) return;
    this.listings = this.listings.filter((l) => l.stallId !== stallId);
    s.merchantId = null;
    s.lastRentPaidAt = null;
    this.persist(ctx);
    ctx.bus.dispatch({ type: "stallVacated", payload: { stallId, holdId: s.holdId }, timestamp: Date.now() });
  }
  persist(ctx) {
    ctx.world.set(WK_STALLS, this.stalls);
    ctx.world.set(WK_LISTINGS, this.listings);
  }
  registerCommands(ctx) {
    ctx.commands.register({
      name: "shop",
      description: "Market and merchant commands",
      subcommands: {
        browse: {
          description: "Browse listings in a hold",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ caller, args, reply }) => {
            const holdId = args[0] ?? caller.holdId;
            if (!holdId) {
              reply("Specify a hold: /shop browse <holdId>");
              return;
            }
            const ls = this.listings.filter((l) => l.holdId === holdId);
            if (!ls.length) {
              reply(`No listings in ${HOLD_NAMES[holdId]}.`);
              return;
            }
            reply(`Listings in ${HOLD_NAMES[holdId]}:
${ls.map(
              (l) => `  [${l.id}] 0x${l.baseId.toString(16)} x${l.count} @ ${l.pricePerUnit} sep`
            ).join("\n")}`);
          }, "handler")
        },
        buy: {
          description: "Buy from a listing",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const l = this.listings.find((x) => x.id === args[0]);
            if (!l) {
              replyError("Listing not found.");
              return;
            }
            if (l.merchantId === caller.id) {
              replyError("Can't buy your own listings.");
              return;
            }
            const count = Math.min(parseInt(args[1] ?? "1", 10), l.count);
            const total = count * l.pricePerUnit;
            if (caller.septims < total) {
              replyError(`Need ${total}, have ${caller.septims}.`);
              return;
            }
            const m = ctx.store.get(l.merchantId);
            if (!m) {
              replyError("Merchant is offline.");
              return;
            }
            ctx.store.update(caller.id, { septims: caller.septims - total });
            ctx.store.update(m.id, { septims: m.septims + total });
            l.count -= count;
            if (l.count <= 0) this.listings = this.listings.filter((x) => x.id !== l.id);
            this.persist(ctx);
            reply(`Bought x${count} for ${total} septims.`);
            ctx.sync.notify(m.id, `${caller.name} bought x${count} for ${total} septims.`);
            ctx.bus.dispatch({
              type: "shopPurchased",
              payload: { listingId: l.id, buyerId: caller.id, sellerId: m.id, count, totalPrice: total },
              timestamp: Date.now()
            });
          }, "handler")
        },
        sell: {
          description: "List an item for sale",
          permission: "merchant",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            if (args.length < 3) {
              reply("Usage: /shop sell <baseId_hex> <count> <priceEach>");
              return;
            }
            const baseId = parseInt(args[0], 16), count = parseInt(args[1], 10), price = parseInt(args[2], 10);
            if (isNaN(baseId) || isNaN(count) || isNaN(price) || count <= 0 || price <= 0) {
              replyError("Invalid args.");
              return;
            }
            const stall = this.stalls.find((s) => s.merchantId === caller.id);
            if (!stall) {
              replyError("No rented stall. Use /shop rent <stallId> first.");
              return;
            }
            const listing = { id: randomUUID(), stallId: stall.id, merchantId: caller.id, holdId: stall.holdId, baseId, count, pricePerUnit: price, listedAt: Date.now() };
            this.listings.push(listing);
            this.persist(ctx);
            reply(`Listed x${count} of 0x${baseId.toString(16)} @ ${price} sep [ID: ${listing.id}]`);
          }, "handler")
        },
        remove: {
          description: "Remove a listing",
          permission: "merchant",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            const l = this.listings.find((x) => x.id === args[0] && x.merchantId === caller.id);
            if (!l) {
              replyError("Not found or not yours.");
              return;
            }
            this.listings = this.listings.filter((x) => x.id !== args[0]);
            this.persist(ctx);
            reply("Listing removed.");
          }, "handler")
        },
        rent: {
          description: "Rent a market stall",
          permission: "merchant",
          handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
            if (!args[0]) {
              reply("Usage: /shop rent <stallId>");
              return;
            }
            if (this.stalls.some((s) => s.merchantId === caller.id)) {
              replyError("Already have a stall. /shop vacate first.");
              return;
            }
            const stall = this.stalls.find((s) => s.id === args[0]);
            if (!stall) {
              replyError("Stall not found.");
              return;
            }
            if (stall.merchantId) {
              replyError("Stall is occupied.");
              return;
            }
            if (caller.septims < stall.rentPerDay) {
              replyError(`Need ${stall.rentPerDay} septims for first day.`);
              return;
            }
            ctx.store.update(caller.id, { septims: caller.septims - stall.rentPerDay });
            stall.merchantId = caller.id;
            stall.lastRentPaidAt = Date.now();
            this.persist(ctx);
            reply(`Rented "${stall.name}" for ${stall.rentPerDay} septims/day.`);
            ctx.bus.dispatch({ type: "stallRented", payload: { stallId: stall.id, merchantId: caller.id, holdId: stall.holdId }, timestamp: Date.now() });
          }, "handler")
        },
        vacate: {
          description: "Leave your stall",
          permission: "merchant",
          handler: /* @__PURE__ */ __name(({ caller, reply, replyError }) => {
            const stall = this.stalls.find((s) => s.merchantId === caller.id);
            if (!stall) {
              replyError("No rented stall.");
              return;
            }
            const name = stall.name;
            this.vacate(stall.id, ctx);
            reply(`Vacated "${name}". Your listings have been removed.`);
          }, "handler")
        },
        listings: {
          description: "Your active listings",
          permission: "merchant",
          handler: /* @__PURE__ */ __name(({ caller, reply }) => {
            const ls = this.listings.filter((l) => l.merchantId === caller.id);
            if (!ls.length) {
              reply("No active listings.");
              return;
            }
            reply(`Your listings:
${ls.map((l) => `  [${l.id}] 0x${l.baseId.toString(16)} x${l.count} @ ${l.pricePerUnit}`).join("\n")}`);
          }, "handler")
        }
      }
    });
    ctx.commands.register({
      name: "stall",
      description: "Manage market stalls",
      subcommands: {
        create: {
          description: "Create a new stall",
          permission: "steward",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            if (args.length < 3) {
              reply("Usage: /stall create <holdId> <dailyRent> <name...>");
              return;
            }
            const holdId = args[0], rent = parseInt(args[1], 10), name = args.slice(2).join(" ");
            if (isNaN(rent) || rent < 0) {
              replyError("Invalid rent.");
              return;
            }
            const s = { id: randomUUID(), holdId, name, description: "", merchantId: null, rentPerDay: rent, lastRentPaidAt: null };
            this.stalls.push(s);
            this.persist(ctx);
            reply(`Stall "${name}" created in ${HOLD_NAMES[holdId]} [ID: ${s.id}]`);
          }, "handler")
        },
        list: {
          description: "List stalls",
          permission: "any",
          handler: /* @__PURE__ */ __name(({ args, reply }) => {
            const hs = args[0];
            const ss = hs ? this.stalls.filter((s) => s.holdId === hs) : this.stalls;
            if (!ss.length) {
              reply("No stalls.");
              return;
            }
            reply(`Stalls:
${ss.map((s) => {
              var _a;
              const tenant = s.merchantId ? ((_a = ctx.store.get(s.merchantId)) == null ? void 0 : _a.name) ?? "(offline)" : "Available";
              return `  [${s.id}] ${s.name} \u2014 ${s.rentPerDay}/day \u2014 ${tenant}`;
            }).join("\n")}`);
          }, "handler")
        },
        evict: {
          description: "Evict a merchant from a stall",
          permission: "steward",
          handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
            const stall = this.stalls.find((s) => s.id === args[0]);
            if (!stall || !stall.merchantId) {
              replyError("Not found or already vacant.");
              return;
            }
            const mid = stall.merchantId;
            this.vacate(stall.id, ctx);
            ctx.sync.notify(mid, `You have been evicted from "${stall.name}".`);
            reply("Merchant evicted.");
          }, "handler")
        }
      }
    });
  }
};
__name(_MerchantsModule, "MerchantsModule");
var MerchantsModule = _MerchantsModule;

// gamemode/modules/trading/TradingModule.ts
var TRADE_TTL = 5 * 60 * 1e3;
var REQUEST_TTL = 60 * 1e3;
var _TradingModule = class _TradingModule {
  id = "trading";
  name = "Trading";
  version = "1.0.0";
  sessions = /* @__PURE__ */ new Map();
  requests = /* @__PURE__ */ new Map();
  onInit(ctx) {
    this.registerCommands(ctx);
    console.log("[Trading] Module initialized");
  }
  onTick(ctx, now) {
    for (const [id, req] of this.requests) {
      if (now > req.expiresAt) {
        this.requests.delete(id);
        ctx.sync.notify(req.initiatorId, "Trade request expired.");
      }
    }
    for (const s of this.sessions.values()) {
      if (now > s.expiresAt && s.status === "active") {
        s.status = "cancelled";
        this.cleanup(s, ctx, "Trade timed out.");
      }
    }
  }
  onPlayerLeave(ctx, player) {
    const s = this.findSession(player.id);
    if (s) this.cleanup(s, ctx, `${player.name} disconnected \u2014 trade cancelled.`);
    this.requests.delete(player.id);
  }
  findSession(pid) {
    for (const s of this.sessions.values()) {
      if ((s.initiatorId === pid || s.responderId === pid) && s.status === "active") return s;
    }
  }
  cleanup(s, ctx, msg) {
    this.sessions.delete(s.id);
    ctx.sync.notify(s.initiatorId, msg);
    ctx.sync.notify(s.responderId, msg);
  }
  syncSession(s, ctx) {
    ctx.sync.send(s.initiatorId, "tradeUpdate", { session: s });
    ctx.sync.send(s.responderId, "tradeUpdate", { session: s });
  }
  emptyOffer() {
    return { items: [], septims: 0 };
  }
  execute(s, ctx) {
    const a = ctx.store.get(s.initiatorId), b = ctx.store.get(s.responderId);
    if (a.septims < s.initiatorOffer.septims || b.septims < s.responderOffer.septims) {
      this.cleanup(s, ctx, "Trade cancelled: insufficient funds.");
      return;
    }
    ctx.store.update(a.id, { septims: a.septims - s.initiatorOffer.septims + s.responderOffer.septims });
    ctx.store.update(b.id, { septims: b.septims - s.responderOffer.septims + s.initiatorOffer.septims });
    s.status = "completed";
    this.sessions.delete(s.id);
    ctx.sync.send(s.initiatorId, "tradeUpdate", { session: s });
    ctx.sync.send(s.responderId, "tradeUpdate", { session: s });
    ctx.sync.notify(s.initiatorId, `Trade completed with ${b.name}.`);
    ctx.sync.notify(s.responderId, `Trade completed with ${a.name}.`);
    ctx.bus.dispatch({ type: "tradeCompleted", payload: { tradeId: s.id, initiatorId: s.initiatorId, responderId: s.responderId }, timestamp: Date.now() });
  }
  registerCommands(ctx) {
    ctx.commands.register({
      name: "trade",
      description: "Player-to-player trading",
      permission: "any",
      handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        var _a, _b;
        if (!args.length) {
          reply("/trade <name|accept|decline|offer|remove|confirm|cancel|status>");
          return;
        }
        const sub = args[0].toLowerCase();
        if (!["accept", "decline", "offer", "remove", "confirm", "cancel", "status"].includes(sub)) {
          const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
          if (!target) {
            replyError("Player not online.");
            return;
          }
          if (target.id === caller.id) {
            replyError("Can't trade with yourself.");
            return;
          }
          if (this.findSession(caller.id)) {
            replyError("Already in a trade.");
            return;
          }
          this.requests.set(target.id, { initiatorId: caller.id, responderId: target.id, expiresAt: Date.now() + REQUEST_TTL });
          ctx.sync.notify(target.id, `${caller.name} wants to trade. /trade accept or /trade decline`);
          reply(`Trade request sent to ${target.name}.`);
          return;
        }
        if (sub === "accept") {
          const req = this.requests.get(caller.id);
          if (!req) {
            replyError("No pending request.");
            return;
          }
          if (this.findSession(caller.id)) {
            replyError("Already in trade.");
            return;
          }
          this.requests.delete(caller.id);
          const session2 = { id: randomUUID(), initiatorId: req.initiatorId, responderId: caller.id, initiatorOffer: this.emptyOffer(), responderOffer: this.emptyOffer(), initiatorConfirmed: false, responderConfirmed: false, status: "active", createdAt: Date.now(), expiresAt: Date.now() + TRADE_TTL };
          this.sessions.set(session2.id, session2);
          this.syncSession(session2, ctx);
          ctx.sync.notify(req.initiatorId, `${caller.name} accepted. /trade offer to add items, /trade confirm when ready.`);
          reply("Trade started! /trade offer then /trade confirm.");
          return;
        }
        if (sub === "decline") {
          const req = this.requests.get(caller.id);
          if (!req) {
            replyError("No request.");
            return;
          }
          this.requests.delete(caller.id);
          ctx.sync.notify(req.initiatorId, `${caller.name} declined.`);
          reply("Declined.");
          return;
        }
        const session = this.findSession(caller.id);
        if (!session) {
          replyError("No active trade.");
          return;
        }
        const isInit = session.initiatorId === caller.id;
        const myOffer = isInit ? session.initiatorOffer : session.responderOffer;
        if (sub === "offer") {
          const type = (_a = args[1]) == null ? void 0 : _a.toLowerCase();
          if (type === "gold") {
            const amount = parseInt(args[2] ?? "", 10);
            if (isNaN(amount) || amount < 0) {
              replyError("Invalid.");
              return;
            }
            if (caller.septims < amount) {
              replyError(`Only have ${caller.septims}.`);
              return;
            }
            myOffer.septims = amount;
          } else if (type === "item") {
            const baseId = parseInt(args[2] ?? "", 16), count = parseInt(args[3] ?? "1", 10);
            if (isNaN(baseId) || isNaN(count) || count <= 0) {
              replyError("Usage: /trade offer item <hex> [count]");
              return;
            }
            const ex = myOffer.items.find((i) => i.baseId === baseId);
            if (ex) ex.count += count;
            else myOffer.items.push({ baseId, count });
          } else {
            reply("/trade offer gold <amt>  |  /trade offer item <hex> [count]");
            return;
          }
          session.initiatorConfirmed = false;
          session.responderConfirmed = false;
          session.expiresAt = Date.now() + TRADE_TTL;
          this.syncSession(session, ctx);
          reply("Offer updated.");
          return;
        }
        if (sub === "remove") {
          const type = (_b = args[1]) == null ? void 0 : _b.toLowerCase();
          if (type === "gold") myOffer.septims = 0;
          else if (type === "item") {
            const b = parseInt(args[2] ?? "", 16);
            myOffer.items = myOffer.items.filter((i) => i.baseId !== b);
          } else {
            reply("/trade remove gold | item <hex>");
            return;
          }
          session.initiatorConfirmed = false;
          session.responderConfirmed = false;
          this.syncSession(session, ctx);
          reply("Updated.");
          return;
        }
        if (sub === "confirm") {
          if (isInit) session.initiatorConfirmed = true;
          else session.responderConfirmed = true;
          this.syncSession(session, ctx);
          const other = isInit ? session.responderId : session.initiatorId;
          ctx.sync.notify(other, `${caller.name} confirmed. /trade confirm to complete.`);
          reply("Confirmed. Waiting\u2026");
          if (session.initiatorConfirmed && session.responderConfirmed) this.execute(session, ctx);
          return;
        }
        if (sub === "cancel") {
          session.status = "cancelled";
          this.cleanup(session, ctx, `${caller.name} cancelled.`);
          return;
        }
        if (sub === "status") {
          const their = isInit ? session.responderOffer : session.initiatorOffer;
          const other = ctx.store.get(isInit ? session.responderId : session.initiatorId);
          reply(`Trade with ${(other == null ? void 0 : other.name) ?? "?"}
Your offer: ${myOffer.septims}g ${myOffer.items.map((i) => `0x${i.baseId.toString(16)}x${i.count}`).join(",")}
Their offer: ${their.septims}g ${their.items.map((i) => `0x${i.baseId.toString(16)}x${i.count}`).join(",")}`);
        }
      }, "handler")
    });
  }
};
__name(_TradingModule, "TradingModule");
var TradingModule = _TradingModule;

// gamemode/modules/admin/AdminModule.ts
var WK_AUDIT = "ff_world_audit";
var WK_BANS = "ff_world_bans";
var MAX_AUDIT = 1e3;
var _AdminModule = class _AdminModule {
  id = "admin";
  name = "Admin & Staff Tools";
  version = "1.0.0";
  frozen = /* @__PURE__ */ new Set();
  onInit(ctx) {
    this.registerCommands(ctx);
    console.log("[Admin] Module initialized");
  }
  onPlayerJoin(ctx, player) {
    const bans = ctx.world.get(WK_BANS, []);
    if (bans.some((b) => b.playerId === player.id)) {
      ctx.mp.kick(player.id);
      return;
    }
    const staff = ctx.store.getAll().filter((p) => ctx.permissions.isStaff(p.id) && p.id !== player.id);
    for (const s of staff) ctx.sync.notify(s.id, `[Staff] ${player.name} connected.`);
  }
  onPlayerLeave(_ctx, player) {
    this.frozen.delete(player.id);
  }
  audit(ctx, action, actorId, targetId, details = {}) {
    const entry = { id: randomUUID(), action, actorId, targetId, details, timestamp: Date.now() };
    ctx.world.mutate(WK_AUDIT, (log) => {
      const n = [...log, entry];
      return n.length > MAX_AUDIT ? n.slice(n.length - MAX_AUDIT) : n;
    }, []);
  }
  registerCommands(ctx) {
    ctx.commands.register({ name: "staff", description: "Manage staff ranks", subcommands: {
      grant: { description: "Grant staff rank", permission: "admin", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        if (args.length < 2) {
          reply("Usage: /staff grant <player> <staff|moderator|admin|owner>");
          return;
        }
        const rank = args[1].toLowerCase();
        if (!["staff", "moderator", "admin", "owner"].includes(rank)) {
          replyError("Invalid rank.");
          return;
        }
        if ((rank === "admin" || rank === "owner") && !ctx.permissions.has(caller, "owner")) {
          replyError("Only owners can grant admin/owner.");
          return;
        }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
        if (!target) {
          replyError("Player not online.");
          return;
        }
        ctx.permissions.grantStaff(target.id, rank, caller.id);
        ctx.world.set("ff_world_permissions", ctx.permissions.serialize());
        reply(`${target.name} granted ${rank}.`);
        ctx.sync.notify(target.id, `You were granted ${rank} by ${caller.name}.`);
        this.audit(ctx, "staffGrant", caller.id, target.id, { rank });
      }, "handler") },
      revoke: { description: "Revoke staff rank", permission: "admin", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
        const target = ctx.store.getAll().find((p) => {
          var _a;
          return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
        });
        if (!target) {
          replyError("Player not online.");
          return;
        }
        if (!ctx.permissions.revokeStaff(target.id)) {
          replyError("No rank found.");
          return;
        }
        ctx.world.set("ff_world_permissions", ctx.permissions.serialize());
        reply(`${target.name} rank revoked.`);
        ctx.sync.notify(target.id, "Your staff rank was revoked.");
        this.audit(ctx, "staffRevoke", caller.id, target.id, {});
      }, "handler") },
      list: { description: "List staff", permission: "any", handler: /* @__PURE__ */ __name(({ reply }) => {
        const staff = ctx.permissions.getAllStaff();
        if (!staff.length) {
          reply("No staff.");
          return;
        }
        reply(`Staff:
${staff.map((s) => {
          var _a;
          return `  ${s.rank.padEnd(10)} ${((_a = ctx.store.getAll().find((p) => p.id === s.playerId)) == null ? void 0 : _a.name) ?? `(offline:${s.playerId})`}`;
        }).join("\n")}`);
      }, "handler") }
    } });
    ctx.commands.register({ name: "kick", description: "Kick a player", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => {
        var _a;
        return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
      });
      if (!target) {
        replyError("Player not online.");
        return;
      }
      const reason = args.slice(1).join(" ") || "No reason given";
      ctx.sync.notify(target.id, `Kicked: ${reason}`);
      setTimeout(() => ctx.mp.kick(target.id), 1e3);
      reply(`${target.name} kicked.`);
      this.audit(ctx, "kick", caller.id, target.id, { reason });
      ctx.bus.dispatch({ type: "playerKicked", payload: { playerId: target.id, reason }, timestamp: Date.now() });
    }, "handler") });
    ctx.commands.register({ name: "ban", description: "Ban a player", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => {
        var _a;
        return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
      });
      if (!target) {
        replyError("Player not online.");
        return;
      }
      const reason = args.slice(1).join(" ") || "No reason";
      const ban = { playerId: target.id, name: target.name, reason, bannedBy: caller.id, bannedAt: Date.now() };
      ctx.world.mutate(WK_BANS, (b) => [...b.filter((x) => x.playerId !== target.id), ban], []);
      ctx.sync.notify(target.id, `Banned: ${reason}`);
      setTimeout(() => ctx.mp.kick(target.id), 1500);
      reply(`${target.name} banned.`);
      this.audit(ctx, "ban", caller.id, target.id, { reason });
      ctx.bus.dispatch({ type: "playerBanned", payload: { playerId: target.id, reason }, timestamp: Date.now() });
    }, "handler") });
    ctx.commands.register({ name: "unban", description: "Unban a player", permission: "moderator", handler: /* @__PURE__ */ __name(({ args, reply }) => {
      const name = args.join(" ");
      ctx.world.mutate(WK_BANS, (b) => {
        const a = b.filter((x) => x.name.toLowerCase() !== name.toLowerCase());
        if (a.length < b.length) reply(`${name} unbanned.`);
        else reply("No ban found.");
        return a;
      }, []);
    }, "handler") });
    ctx.commands.register({ name: "warn", description: "Warn a player", permission: "staff", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => {
        var _a;
        return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
      });
      const reason = args.slice(1).join(" ");
      if (!target || !reason) {
        reply("Usage: /warn <player> <reason>");
        return;
      }
      ctx.sync.notify(target.id, `[Warning from ${caller.name}]: ${reason}`);
      reply(`Warning sent to ${target.name}.`);
      this.audit(ctx, "warn", caller.id, target.id, { reason });
    }, "handler") });
    ctx.commands.register({ name: "tp", description: "Teleport to player", permission: "staff", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      ctx.mp.set(caller.actorId, "pos", ctx.mp.getActorPos(target.actorId));
      reply(`Teleported to ${target.name}.`);
      this.audit(ctx, "tp", caller.id, target.id, {});
    }, "handler") });
    ctx.commands.register({ name: "tphere", description: "Teleport player to you", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      ctx.mp.set(target.actorId, "pos", ctx.mp.getActorPos(caller.actorId));
      ctx.sync.notify(target.id, `Teleported to ${caller.name}.`);
      reply(`${target.name} teleported to you.`);
      this.audit(ctx, "tphere", caller.id, target.id, {});
    }, "handler") });
    ctx.commands.register({ name: "givegold", description: "Give septims to a player", permission: "admin", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      if (args.length < 2) {
        reply("Usage: /givegold <player> <amount>");
        return;
      }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      const amount = parseInt(args[1], 10);
      if (!target || isNaN(amount) || amount <= 0) {
        replyError("Invalid.");
        return;
      }
      ctx.store.update(target.id, { septims: target.septims + amount });
      reply(`Gave ${amount} to ${target.name}.`);
      ctx.sync.notify(target.id, `Received ${amount} septims from staff.`);
      this.audit(ctx, "givegold", caller.id, target.id, { amount });
    }, "handler") });
    ctx.commands.register({ name: "setgold", description: "Set player septims", permission: "admin", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => {
        var _a;
        return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
      });
      const amount = parseInt(args[1] ?? "", 10);
      if (!target || isNaN(amount) || amount < 0) {
        replyError("Usage: /setgold <player> <amount>");
        return;
      }
      ctx.store.update(target.id, { septims: amount });
      reply(`${target.name} septims set to ${amount}.`);
      this.audit(ctx, "setgold", caller.id, target.id, { amount });
    }, "handler") });
    ctx.commands.register({ name: "clearbounty", description: "Clear bounty", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => {
        var _a;
        return p.name.toLowerCase() === ((_a = args[0]) == null ? void 0 : _a.toLowerCase());
      });
      if (!target) {
        replyError("Player not online.");
        return;
      }
      const holdId = args[1];
      if (holdId) ctx.store.update(target.id, { bounty: { ...target.bounty, [holdId]: 0 } });
      else ctx.store.update(target.id, { bounty: {} });
      reply(`Cleared ${target.name}'s bounty${holdId ? ` in ${HOLD_NAMES[holdId]}` : ""}.`);
      this.audit(ctx, "clearbounty", caller.id, target.id, { holdId: holdId ?? "all" });
    }, "handler") });
    ctx.commands.register({ name: "setbounty", description: "Set player bounty", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      if (args.length < 3) {
        reply("Usage: /setbounty <player> <holdId> <amount>");
        return;
      }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      const holdId = args[1];
      const amount = parseInt(args[2], 10);
      if (!target || !ALL_HOLDS.includes(holdId) || isNaN(amount) || amount < 0) {
        replyError("Invalid args.");
        return;
      }
      ctx.store.update(target.id, { bounty: { ...target.bounty, [holdId]: amount } });
      reply(`${target.name} bounty in ${HOLD_NAMES[holdId]}: ${amount}.`);
      this.audit(ctx, "setbounty", caller.id, target.id, { holdId, amount });
    }, "handler") });
    ctx.commands.register({ name: "freeze", description: "Freeze a player", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      this.frozen.add(target.id);
      ctx.sync.notify(target.id, "You have been frozen.");
      reply(`${target.name} frozen.`);
      this.audit(ctx, "freeze", caller.id, target.id, {});
    }, "handler") });
    ctx.commands.register({ name: "unfreeze", description: "Unfreeze a player", permission: "moderator", handler: /* @__PURE__ */ __name(({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      this.frozen.delete(target.id);
      ctx.sync.notify(target.id, "You have been unfrozen.");
      reply(`${target.name} unfrozen.`);
      this.audit(ctx, "unfreeze", caller.id, target.id, {});
    }, "handler") });
    ctx.commands.register({ name: "online", description: "List online players", permission: "any", handler: /* @__PURE__ */ __name(({ reply }) => {
      const players = ctx.store.getAll();
      if (!players.length) {
        reply("No players online.");
        return;
      }
      reply(`Online (${players.length}):
${players.map((p) => {
        const rank = ctx.permissions.getStaffRank(p.id);
        const roles = ctx.permissions.getGovernmentPositions(p.id).map((g) => g.role).join(",");
        return `  ${rank ? `[${rank}]` : roles ? `(${roles})` : ""}${p.name} \u2014 ${p.holdId ?? "no hold"}`;
      }).join("\n")}`);
    }, "handler") });
    ctx.commands.register({ name: "info", description: "Detailed player info", permission: "staff", handler: /* @__PURE__ */ __name(({ args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      const rank = ctx.permissions.getStaffRank(target.id) ?? "none";
      const govt = ctx.permissions.getGovernmentPositions(target.id).map((g) => `${g.role}@${g.holdId}`).join(", ") || "none";
      const jobs = ctx.permissions.getPlayerJobs(target.id).map((j) => `${j.jobId}@${j.holdId}`).join(", ") || "none";
      const bounties = Object.entries(target.bounty).filter(([, v]) => v > 0).map(([h, v]) => `${h}:${v}`).join(", ") || "none";
      reply(`${target.name} | userId=${target.id}
Hold: ${target.holdId ?? "none"}  Gold: ${target.septims}
Staff: ${rank}  Govt: ${govt}
Jobs: ${jobs}
Bounties: ${bounties}
Hunger: ${target.hungerLevel}  Drunk: ${target.drunkLevel}
Frozen: ${this.frozen.has(target.id)}`);
    }, "handler") });
    ctx.commands.register({ name: "audit", description: "View audit log", permission: "admin", handler: /* @__PURE__ */ __name(({ args, reply }) => {
      const log = ctx.world.get(WK_AUDIT, []);
      const recent = log.slice(-10);
      if (!recent.length) {
        reply("No entries.");
        return;
      }
      reply(`Last ${recent.length} entries:
${recent.map((e) => {
        var _a, _b;
        const ts = new Date(e.timestamp).toISOString().substr(11, 8);
        const by = ((_a = ctx.store.getAll().find((p) => p.id === e.actorId)) == null ? void 0 : _a.name) ?? String(e.actorId);
        const tgt = e.targetId ? ((_b = ctx.store.getAll().find((p) => p.id === e.targetId)) == null ? void 0 : _b.name) ?? String(e.targetId) : "";
        return `  ${ts} ${e.action} by=${by}${tgt ? ` on=${tgt}` : ""}`;
      }).join("\n")}`);
    }, "handler") });
    ctx.commands.register({ name: "help", description: "List commands", permission: "any", handler: /* @__PURE__ */ __name(({ caller, reply }) => {
      const cmds = ctx.commands.list().filter((c) => !c.permission || ctx.permissions.has(caller, c.permission ?? "any"));
      reply(`Commands:
${cmds.map((c) => `  /${c.name} \u2014 ${c.description}`).join("\n")}`);
    }, "handler") });
  }
};
__name(_AdminModule, "AdminModule");
var AdminModule = _AdminModule;

// gamemode/modules/chat/ChatModule.ts
var LOCAL_RANGE = 3e3;
var SHOUT_RANGE = 1e4;
var _ChatModule = class _ChatModule {
  id = "chat";
  name = "Chat";
  version = "1.0.0";
  lastPMFrom = /* @__PURE__ */ new Map();
  onInit(ctx) {
    this.registerCommands(ctx);
    console.log("[Chat] Module initialized");
  }
  nearby(ctx, sender, range) {
    const spos = ctx.mp.getActorPos(sender.actorId);
    return ctx.store.getAll().filter((p) => {
      if (p.id === sender.id) return true;
      const pos = ctx.mp.getActorPos(p.actorId);
      const dx = spos[0] - pos[0], dy = spos[1] - pos[1], dz = spos[2] - pos[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= range;
    }).map((p) => p.id);
  }
  send(ctx, msg, recipients) {
    for (const uid of recipients) ctx.sync.send(uid, "chatMessage", { message: msg });
    ctx.bus.dispatch({ type: "chatMessage", payload: { message: msg }, timestamp: msg.timestamp });
  }
  mkid() {
    return randomUUID();
  }
  registerCommands(ctx) {
    ctx.commands.register({ name: "say", description: "IC local speech", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: "ic", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }, "handler") });
    ctx.commands.register({ name: "shout", description: "IC shout (extended range)", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: "ic", senderId: caller.id, senderName: caller.name, content: `*shouts* ${content}`, timestamp: Date.now() }, this.nearby(ctx, caller, SHOUT_RANGE));
    }, "handler") });
    ctx.commands.register({ name: "ooc", description: "OOC global chat", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: "ooc", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, ctx.store.getAll().map((p) => p.id));
    }, "handler") });
    ctx.commands.register({ name: "w", description: "Private message", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args, replyError }) => {
      if (args.length < 2) {
        replyError("Usage: /w <player> <message>");
        return;
      }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      if (!target) {
        replyError("Player not online.");
        return;
      }
      const content = args.slice(1).join(" ").trim();
      const msg = { id: this.mkid(), channel: "pm", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), targetId: target.id };
      this.send(ctx, msg, [caller.id, target.id]);
      this.lastPMFrom.set(target.id, caller.id);
    }, "handler") });
    ctx.commands.register({ name: "r", description: "Reply to last PM", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args, replyError }) => {
      const lastId = this.lastPMFrom.get(caller.id);
      if (!lastId) {
        replyError("No PM to reply to.");
        return;
      }
      const target = ctx.store.get(lastId);
      if (!target) {
        replyError("That player left.");
        return;
      }
      const content = args.join(" ").trim();
      if (!content) return;
      const msg = { id: this.mkid(), channel: "pm", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), targetId: lastId };
      this.send(ctx, msg, [caller.id, lastId]);
      this.lastPMFrom.set(lastId, caller.id);
    }, "handler") });
    ctx.commands.register({ name: "f", description: "Faction chat", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args, replyError }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      if (!caller.factions.length) {
        replyError("Not in a faction.");
        return;
      }
      const factionId = caller.factions[0];
      const recipients = ctx.store.getAll().filter((p) => p.factions.includes(factionId)).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: "faction", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), factionId }, recipients);
    }, "handler") });
    ctx.commands.register({ name: "hold", description: "Hold-wide broadcast", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args, replyError }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      if (!caller.holdId) {
        replyError("Not in a hold.");
        return;
      }
      const recipients = ctx.store.getAll().filter((p) => p.holdId === caller.holdId).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: "hold", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), holdId: caller.holdId }, recipients);
    }, "handler") });
    ctx.commands.register({ name: "s", description: "Staff channel", permission: "staff", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      const recipients = ctx.store.getAll().filter((p) => ctx.permissions.isStaff(p.id)).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: "staff", senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, recipients);
    }, "handler") });
    ctx.commands.register({ name: "me", description: "RP action emote", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: "ic", senderId: caller.id, senderName: `** ${caller.name}`, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }, "handler") });
    ctx.commands.register({ name: "do", description: "RP environmental description", permission: "any", handler: /* @__PURE__ */ __name(({ caller, args }) => {
      const content = args.join(" ").trim();
      if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: "ic", senderId: caller.id, senderName: `>> ${caller.name}`, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }, "handler") });
    ctx.commands.register({ name: "announce", description: "Staff: global announcement", permission: "staff", handler: /* @__PURE__ */ __name(({ caller, args, reply }) => {
      const content = args.join(" ").trim();
      if (!content) {
        reply("Usage: /announce <message>");
        return;
      }
      this.send(ctx, { id: this.mkid(), channel: "ooc", senderId: caller.id, senderName: "[ANNOUNCEMENT]", content, timestamp: Date.now() }, ctx.store.getAll().map((p) => p.id));
      reply("Announced.");
    }, "handler") });
  }
};
__name(_ChatModule, "ChatModule");
var ChatModule = _ChatModule;

// gamemode/index.ts
var registry = new ModuleRegistry(mp);
registry.register(new HungerModule()).register(new DrunkBarModule()).register(new EconomyModule()).register(new BountyModule()).register(new HousingModule()).register(new CourierModule()).register(new FactionsModule()).register(new CollegeModule()).register(new GovernanceModule()).register(new TaxationModule()).register(new JobsModule()).register(new MerchantsModule()).register(new TradingModule()).register(new AdminModule()).register(new ChatModule());
registry.start().then(() => {
  console.log("[Frostfall] === Game mode fully loaded ===");
}).catch((err) => {
  console.error("[Frostfall] Fatal: module initialization failed:", err);
});
