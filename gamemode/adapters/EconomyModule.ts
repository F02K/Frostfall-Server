import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initEconomy } from '../economy';

export class EconomyModule implements FrostfallModule {
  readonly id = 'economy';
  readonly name = 'Economy';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initEconomy(ctx.mp, ctx.store, ctx.bus);
  }
}
