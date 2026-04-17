/**
 * Frostfall Framework — World Store
 *
 * File-backed key-value store for WORLD-LEVEL persistent data.
 *
 * SkyMP has no concept of "form 0" — mp.get(0, key) throws at runtime.
 * We therefore persist world data to a JSON file on disk and keep it
 * in a Map<string, unknown> in memory between reads.
 *
 * The file is written on every set() call (and flushed explicitly by the
 * Registry tick). For high-frequency writes, batch with mutate() instead
 * of calling set() in a loop.
 *
 * File location: <server cwd>/frostfall-world.json
 *
 * Usage:
 *   const treasury = world.get<HoldTreasury[]>('ff_world_treasury', []);
 *   world.set('ff_world_treasury', [...treasury, newEntry]);
 *   world.mutate('ff_world_treasury', (t) => [...t, newEntry], []);
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_FILE = join(process.cwd(), 'frostfall-world.json');

export class WorldStore {
  private cache = new Map<string, unknown>();
  private dirty = false;

  constructor() {
    this.load();
  }

  /** Read a key; returns `defaultValue` if missing. */
  get<T>(key: string, defaultValue: T): T {
    const v = this.cache.get(key);
    return v !== undefined ? (v as T) : defaultValue;
  }

  /** Write a key and mark the store dirty (will be flushed on next tick). */
  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
    this.dirty = true;
    // Eager flush for critical writes (permissions, bans).
    // Comment this out and call flush() manually in performance-sensitive paths.
    this.flush();
  }

  /**
   * Atomically read-modify-write.
   * The mutator receives the current value (or defaultValue) and must return the new value.
   */
  mutate<T>(key: string, mutator: (current: T) => T, defaultValue: T): T {
    const current = this.get<T>(key, defaultValue);
    const next = mutator(current);
    this.set(key, next);
    return next;
  }

  /** Remove a key from the store. */
  delete(key: string): void {
    this.cache.delete(key);
    this.dirty = true;
    this.flush();
  }

  /** Write the cache to disk if dirty. Called by the Registry every tick. */
  flush(): void {
    if (!this.dirty) return;
    try {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of this.cache) obj[k] = v;
      writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
      this.dirty = false;
    } catch (e) {
      console.error('[WorldStore] Failed to flush to disk:', e);
    }
  }

  private load(): void {
    if (!existsSync(DATA_FILE)) return;
    try {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        this.cache.set(k, v);
      }
      console.log(`[WorldStore] Loaded ${this.cache.size} keys from ${DATA_FILE}`);
    } catch (e) {
      console.error('[WorldStore] Failed to load world data — starting fresh:', e);
    }
  }
}
