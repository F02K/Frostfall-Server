import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initHousing } from '../housing';

export class HousingModule implements FrostfallModule {
  readonly id = 'housing';
  readonly name = 'Housing';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initHousing(ctx.mp, ctx.store, ctx.bus);
  }
}
