import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initCourier } from '../courier';

export class CourierModule implements FrostfallModule {
  readonly id = 'courier';
  readonly name = 'Courier';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initCourier(ctx.mp, ctx.store, ctx.bus);
  }
}
