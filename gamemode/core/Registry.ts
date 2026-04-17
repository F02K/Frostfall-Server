/**
 * Frostfall Framework — Module Registry
 *
 * Central orchestrator. Responsibilities:
 *   1. Register modules
 *   2. Topological sort by dependsOn
 *   3. Build ModuleContext and call onInit in order
 *   4. Route mp events (connect/disconnect/customPacket) to all modules
 *   5. Run periodic tick (every TICK_INTERVAL_MS)
 *   6. Provide registry.get<T>(id) for inter-module API access
 *
 * Typical bootstrap (index.ts):
 *   const registry = new ModuleRegistry(mp);
 *   registry
 *     .register(new GovernanceModule())
 *     .register(new TaxationModule())
 *     .register(new JobsModule())
 *     ...
 *   await registry.start();
 */

import type { Mp } from '../skymp';
import { PlayerStore } from '../store';
import { ExtendedEventBus } from '../events';
import { CommandBus } from './CommandBus';
import { Permissions } from './Permissions';
import { WorldStore } from './WorldStore';
import { SyncManager } from './Sync';
import type { FrostfallModule, ModuleContext } from './Module';
import { TICK_INTERVAL_MS } from './Module';
import type { PlayerId } from '../types';

export class ModuleRegistry {
  private modules: FrostfallModule[] = [];
  private ctx!: ModuleContext;

  // ── Core singletons (created on construction) ──────────────────────────────
  readonly store: PlayerStore;
  readonly bus: ExtendedEventBus;
  readonly commands: CommandBus;
  readonly permissions: Permissions;
  readonly world: WorldStore;
  readonly sync: SyncManager;

  constructor(private readonly mp: Mp) {
    this.store       = new PlayerStore();
    this.bus         = new ExtendedEventBus();
    this.commands    = new CommandBus();
    this.permissions = new Permissions();
    this.world       = new WorldStore(mp);
    this.sync        = new SyncManager(mp);

    this.commands.setPermissions(this.permissions);
  }

  /** Register a module. Returns `this` for chaining. */
  register(module: FrostfallModule): this {
    this.modules.push(module);
    return this;
  }

  /**
   * Get a registered module's public API by id.
   * Throws if not found (catches typos at startup, not runtime).
   */
  get<T extends FrostfallModule>(id: string): T {
    const m = this.modules.find((m) => m.id === id);
    if (!m) throw new Error(`[Registry] Module "${id}" is not registered`);
    return m as T;
  }

  /** Initialize all modules and wire up SkyMP events. */
  async start(): Promise<void> {
    const sorted = this.topologicalSort();

    this.ctx = {
      mp: this.mp,
      store: this.store,
      bus: this.bus,
      commands: this.commands,
      permissions: this.permissions,
      world: this.world,
      sync: this.sync,
      registry: this,
    };

    // Load permissions from world store
    const permData = this.world.get<{
      staff: Parameters<Permissions['load']>[0];
      govt:  Parameters<Permissions['load']>[1];
      jobs:  Parameters<Permissions['load']>[2];
    }>('ff_world_permissions', { staff: [], govt: [], jobs: [] });
    this.permissions.load(permData.staff, permData.govt, permData.jobs);

    // Initialize modules in dependency order
    for (const mod of sorted) {
      console.log(`[Registry] Initializing module: ${mod.name} v${mod.version}`);
      try {
        await mod.onInit(this.ctx);
      } catch (e) {
        console.error(`[Registry] Module "${mod.id}" failed to initialize:`, e);
      }
    }

    // Periodic tick
    setInterval(() => {
      const now = Date.now();
      for (const mod of sorted) {
        if (mod.onTick) {
          void Promise.resolve(mod.onTick(this.ctx, now)).catch((e) =>
            console.error(`[Registry] Tick error in "${mod.id}":`, e)
          );
        }
      }
      // Persist permissions on every tick
      this.persistPermissions();
    }, TICK_INTERVAL_MS);

    // SkyMP connect
    this.mp.on('connect', (userId: number) => {
      const actorId = this.mp.getUserActor(userId);
      const name    = this.mp.getActorName(actorId);
      const state   = this.store.registerPlayer(userId, actorId, name);

      this.bus.dispatch({ type: 'playerJoined', payload: { playerId: userId, actorId, name }, timestamp: Date.now() });

      for (const mod of sorted) {
        if (mod.onPlayerJoin) {
          void Promise.resolve(mod.onPlayerJoin(this.ctx, state)).catch((e) =>
            console.error(`[Registry] onPlayerJoin error in "${mod.id}":`, e)
          );
        }
      }

      console.log(`[Frostfall] + ${name} (userId=${userId})`);
    });

    // SkyMP disconnect
    this.mp.on('disconnect', (userId: number) => {
      const state = this.store.get(userId);
      if (!state) return;

      for (const mod of sorted) {
        if (mod.onPlayerLeave) {
          void Promise.resolve(mod.onPlayerLeave(this.ctx, state)).catch((e) =>
            console.error(`[Registry] onPlayerLeave error in "${mod.id}":`, e)
          );
        }
      }

      this.bus.dispatch({ type: 'playerLeft', payload: { playerId: userId }, timestamp: Date.now() });
      this.store.deregisterPlayer(userId);
      console.log(`[Frostfall] - ${state.name} disconnected`);
    });

    // SkyMP customPacket
    this.mp.on('customPacket', (userId: number, rawContent: string) => {
      let content: Record<string, unknown>;
      try {
        content = JSON.parse(rawContent) as Record<string, unknown>;
      } catch {
        return; // malformed
      }

      const type = content['customPacketType'];
      if (typeof type !== 'string') return;

      // Route /command packets to CommandBus
      if (type === 'ff:command') {
        const text = content['text'];
        if (typeof text === 'string') {
          const state = this.store.get(userId);
          if (state) {
            const raw = text.startsWith('/') ? text.slice(1) : text;
            this.commands.dispatch(state, raw, (uid, msg) => {
              this.sync.notify(uid, msg);
            });
          }
        }
        return;
      }

      // Route to module handlers
      const state = this.store.get(userId);
      if (!state) return;

      for (const mod of sorted) {
        if (mod.onPacket) {
          void Promise.resolve(mod.onPacket(this.ctx, userId, type, content)).catch((e) =>
            console.error(`[Registry] onPacket error in "${mod.id}" for type="${type}":`, e)
          );
        }
      }
    });

    console.log(`[Registry] All ${sorted.length} modules initialized.`);
  }

  /** Expose connected player IDs for broadcast helpers */
  getConnectedUserIds(): PlayerId[] {
    return this.store.getAll().map((p) => p.id);
  }

  private persistPermissions(): void {
    const data = this.permissions.serialize();
    this.world.set('ff_world_permissions', data);
  }

  // ── Topological sort (Kahn's algorithm) ──────────────────────────────────

  private topologicalSort(): FrostfallModule[] {
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

    const queue: FrostfallModule[] = this.modules.filter((m) => (inDegree.get(m.id) ?? 0) === 0);
    const result: FrostfallModule[] = [];

    while (queue.length > 0) {
      const mod = queue.shift()!;
      result.push(mod);
      for (const other of this.modules) {
        if (other.dependsOn?.includes(mod.id)) {
          const deg = (inDegree.get(other.id) ?? 0) - 1;
          inDegree.set(other.id, deg);
          if (deg === 0) queue.push(other);
        }
      }
    }

    if (result.length !== this.modules.length) {
      throw new Error('[Registry] Circular dependency detected in module graph');
    }

    return result;
  }
}
