import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initDrunkBar } from '../drunkBar';

export class DrunkBarModule implements FrostfallModule {
  readonly id = 'drunkBar';
  readonly name = 'Drunk Bar';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initDrunkBar(ctx.mp, ctx.store, ctx.bus);
  }
}
