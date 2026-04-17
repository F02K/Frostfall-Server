import type { FrostfallModule, ModuleContext } from '../core/Module';
import { initBounty } from '../bounty';

export class BountyModule implements FrostfallModule {
  readonly id = 'bounty';
  readonly name = 'Bounty';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    initBounty(ctx.mp, ctx.store, ctx.bus);
  }
}
