/**
 * Frostfall Framework — Module Interface
 *
 * Every feature of the server is a FrostfallModule. Modules are:
 *   - Self-contained (declare their own deps)
 *   - Registered with ModuleRegistry
 *   - Initialized in dependency order
 *   - Able to expose a typed public API via registry.get<T>(id)
 *
 * Creating a new module:
 *   1. Create gamemode/modules/myfeature/index.ts
 *   2. Implement FrostfallModule (only onInit is required)
 *   3. Register it in index.ts: registry.register(new MyFeatureModule())
 */

import type { Mp } from '../skymp';
import type { PlayerStore } from '../store';
import type { ExtendedEventBus } from '../events';
import type { CommandBus } from './CommandBus';
import type { Permissions } from './Permissions';
import type { WorldStore } from './WorldStore';
import type { SyncManager } from './Sync';
import type { ModuleRegistry } from './Registry';
import type { PlayerState, PlayerId } from '../types';

// ── Context passed to every module lifecycle hook ────────────────────────────

export interface ModuleContext {
  /** Raw SkyMP server interface */
  mp: Mp;
  /** In-memory player state cache */
  store: PlayerStore;
  /** Typed internal event bus */
  bus: ExtendedEventBus;
  /** Chat command router */
  commands: CommandBus;
  /** Role/rank permission checker */
  permissions: Permissions;
  /** World-level persistent key-value store */
  world: WorldStore;
  /** Client-sync packet helpers */
  sync: SyncManager;
  /** Module registry — use to get other modules' public APIs */
  registry: ModuleRegistry;
}

// ── Module interface ──────────────────────────────────────────────────────────

export interface FrostfallModule {
  /** Unique stable identifier, e.g. "governance", "taxation" */
  readonly id: string;
  /** Human-readable name for logs */
  readonly name: string;
  /** Semver string, e.g. "1.0.0" */
  readonly version: string;
  /**
   * IDs of modules that must be initialized before this one.
   * Registry will topologically sort on startup.
   */
  readonly dependsOn?: readonly string[];

  /**
   * Called once at server start (after deps are initialized).
   * Register event handlers, commands, makeProperty calls here.
   */
  onInit(ctx: ModuleContext): void | Promise<void>;

  /**
   * Called every TICK_INTERVAL_MS (default: 60 000 ms).
   * Use for periodic tasks: tax collection, hunger drain, rent checks.
   */
  onTick?(ctx: ModuleContext, now: number): void | Promise<void>;

  /**
   * Called after a player connects AND their PlayerState is ready.
   * Use to load persisted data, send initial sync packets.
   */
  onPlayerJoin?(ctx: ModuleContext, player: PlayerState): void | Promise<void>;

  /**
   * Called just before a player's state is removed from the store.
   * Use to flush any unsaved data.
   */
  onPlayerLeave?(ctx: ModuleContext, player: PlayerState): void | Promise<void>;

  /**
   * Called when a customPacket arrives from this player.
   * `type` is the `customPacketType` field in the JSON.
   */
  onPacket?(
    ctx: ModuleContext,
    userId: PlayerId,
    type: string,
    content: Record<string, unknown>
  ): void | Promise<void>;
}

/** How often onTick fires (ms) */
export const TICK_INTERVAL_MS = 60_000;
