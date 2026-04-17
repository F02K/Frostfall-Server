/**
 * Frostfall Roleplay — Game Mode Entry Point
 *
 * SkyMP loads this file via require() after setting:
 *   globalThis.mp = server  (the ScampServer / Mp instance)
 *
 * Architecture:
 *   ModuleRegistry orchestrates all modules via a typed lifecycle.
 *   Each module registers itself and handles its own events/commands.
 *   Hot-reload is supported: SkyMP calls clear() then re-requires this file.
 *
 * Adding a new module:
 *   1. Create gamemode/modules/yourfeature/index.ts
 *   2. Implement FrostfallModule interface
 *   3. registry.register(new YourFeatureModule()) below
 */

import type { Mp } from './skymp';
import { ModuleRegistry } from './core/Registry';

// ── Core systems (wrapped as modules) ─────────────────────────────────────────
import { HungerModule }   from './adapters/HungerModule';
import { DrunkBarModule } from './adapters/DrunkBarModule';
import { EconomyModule }  from './adapters/EconomyModule';
import { BountyModule }   from './adapters/BountyModule';
import { HousingModule }  from './adapters/HousingModule';
import { CourierModule }  from './adapters/CourierModule';
import { FactionsModule } from './adapters/FactionsModule';
import { CollegeModule }  from './adapters/CollegeModule';

// ── New framework modules ──────────────────────────────────────────────────────
import { GovernanceModule } from './modules/governance';
import { TaxationModule }   from './modules/taxation';
import { JobsModule }        from './modules/jobs';
import { MerchantsModule }   from './modules/merchants';
import { TradingModule }     from './modules/trading';
import { AdminModule }       from './modules/admin';
import { ChatModule }        from './modules/chat';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

declare const mp: Mp;

const registry = new ModuleRegistry(mp);

registry
  // ── Order matters for dependsOn — register deps first ─────────────────────
  // Core systems (no deps)
  .register(new HungerModule())
  .register(new DrunkBarModule())
  .register(new EconomyModule())
  .register(new BountyModule())
  .register(new HousingModule())
  .register(new CourierModule())
  .register(new FactionsModule())
  .register(new CollegeModule())
  // Governance first — taxation, jobs, merchants depend on it
  .register(new GovernanceModule())
  .register(new TaxationModule())
  .register(new JobsModule())
  .register(new MerchantsModule())
  // Independent of economy hierarchy
  .register(new TradingModule())
  // Admin and chat have no structural deps
  .register(new AdminModule())
  .register(new ChatModule());

// Start the framework (async — resolves once all onInit() calls complete)
registry.start().then(() => {
  console.log('[Frostfall] === Game mode fully loaded ===');
}).catch((err) => {
  console.error('[Frostfall] Fatal: module initialization failed:', err);
});
