import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initCollege } from '../college';

export class CollegeModule implements FrostfallModule {
  readonly id = 'college';
  readonly name = 'College of Winterhold';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initCollege(ctx.mp, ctx.store, ctx.bus);
  }
}
