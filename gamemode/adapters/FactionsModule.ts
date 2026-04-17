import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initFactions } from '../factions';

export class FactionsModule implements FrostfallModule {
  readonly id = 'factions';
  readonly name = 'Factions';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initFactions(ctx.mp, ctx.store, ctx.bus);
  }
}
