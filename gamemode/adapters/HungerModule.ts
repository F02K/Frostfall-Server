/**
 * Adapter: wraps the existing hunger.ts system as a FrostfallModule.
 * The original system logic is unchanged — this is just the lifecycle bridge.
 */
import type { FrostfallModule, ModuleContext } from '../core/Module';
import type { PlayerState } from '../types';
import { initHunger } from '../hunger';

export class HungerModule implements FrostfallModule {
  readonly id = 'hunger';
  readonly name = 'Hunger';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initHunger(ctx.mp, ctx.store, ctx.bus);
  }
}
