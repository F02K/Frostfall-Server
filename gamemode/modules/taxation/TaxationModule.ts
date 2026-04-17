/**
 * Frostfall Module — Taxation
 * (see governance module for dependency)
 */
import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { PlayerState, HoldId, HoldTreasury, TaxCollectedPayload, GoldTransferredPayload } from '../../types';
import { ALL_HOLDS, HOLD_NAMES } from '../../types';

const WORLD_KEY = 'ff_world_treasury';
const BUSINESS_TAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TAX_RATE = 5;
const DEFAULT_BUSINESS_TAX = 100;
const MAX_TAX_RATE = 30;
const MAX_BUSINESS_TAX = 500;

export class TaxationModule implements FrostfallModule {
  readonly id = 'taxation';
  readonly name = 'Taxation';
  readonly version = '1.0.0';
  readonly dependsOn = ['governance'] as const;

  private treasuries: HoldTreasury[] = [];

  onInit(ctx: ModuleContext): void {
    this.treasuries = ctx.world.get<HoldTreasury[]>(WORLD_KEY, []);
    for (const holdId of ALL_HOLDS) {
      if (!this.treasuries.find((t) => t.holdId === holdId)) {
        this.treasuries.push({
          holdId, septims: 0,
          taxRate: DEFAULT_TAX_RATE,
          businessTaxRate: DEFAULT_BUSINESS_TAX,
          lastCollectedAt: Date.now(),
        });
      }
    }
    this.persist(ctx);

    ctx.bus.on<GoldTransferredPayload>('goldTransferred', (event) => {
      const { fromId, toId, amount, reason } = event.payload;
      if (reason === 'tax') return;
      const fromState = ctx.store.get(fromId);
      const toState   = ctx.store.get(toId);
      if (!fromState || !toState) return;
      if (fromState.holdId !== toState.holdId || !fromState.holdId) return;
      const treasury = this.getTreasury(fromState.holdId);
      if (treasury.taxRate === 0) return;
      const taxAmount = Math.floor(amount * treasury.taxRate / 100);
      if (taxAmount <= 0) return;
      this.addToTreasury(fromState.holdId, taxAmount, ctx);
      ctx.sync.notify(fromId, `${taxAmount} septim tax collected by ${HOLD_NAMES[fromState.holdId]} (${treasury.taxRate}%).`);
    });

    this.registerCommands(ctx);
    console.log('[Taxation] Module initialized');
  }

  onTick(ctx: ModuleContext, now: number): void {
    for (const treasury of this.treasuries) {
      const elapsed = now - treasury.lastCollectedAt;
      if (elapsed < BUSINESS_TAX_INTERVAL_MS) continue;
      const merchants = ctx.permissions.getJobHolders('merchant', treasury.holdId);
      let collected = 0;
      for (const job of merchants) {
        const player = ctx.store.get(job.playerId);
        if (!player) continue;
        const fee = treasury.businessTaxRate;
        if (player.septims >= fee) {
          ctx.store.update(job.playerId, { septims: player.septims - fee });
          collected += fee;
          ctx.sync.notify(job.playerId, `${fee} septims business tax collected for ${HOLD_NAMES[treasury.holdId]}.`);
        } else {
          const jarl = ctx.permissions.getJarl(treasury.holdId);
          if (jarl) ctx.sync.notify(jarl.playerId, `Merchant ${player.name} cannot pay business tax in ${HOLD_NAMES[treasury.holdId]}.`);
        }
      }
      if (collected > 0) this.addToTreasury(treasury.holdId, collected, ctx);
      treasury.lastCollectedAt = now;
    }
    this.persist(ctx);
  }

  onPlayerJoin(ctx: ModuleContext, player: PlayerState): void {
    if (!player.holdId) return;
    ctx.sync.send(player.id, 'treasurySync', this.getTreasury(player.holdId));
  }

  getTreasury(holdId: HoldId): HoldTreasury {
    return this.treasuries.find((t) => t.holdId === holdId)!;
  }

  applyTransactionTax(holdId: HoldId, transferAmount: number, ctx: ModuleContext): number {
    const treasury = this.getTreasury(holdId);
    const tax = Math.floor(transferAmount * treasury.taxRate / 100);
    if (tax > 0) this.addToTreasury(holdId, tax, ctx);
    return tax;
  }

  private addToTreasury(holdId: HoldId, amount: number, ctx: ModuleContext): void {
    const t = this.getTreasury(holdId);
    t.septims += amount;
    ctx.bus.dispatch({ type: 'taxCollected', payload: { holdId, amount, fromId: 0 }, timestamp: Date.now() });
    ctx.bus.dispatch({ type: 'treasuryChanged', payload: { holdId, septims: t.septims }, timestamp: Date.now() });
    const jarl = ctx.permissions.getJarl(holdId);
    if (jarl) ctx.sync.send(jarl.playerId, 'treasurySync', t);
  }

  private persist(ctx: ModuleContext): void {
    ctx.world.set(WORLD_KEY, this.treasuries);
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({
      name: 'tax',
      description: 'Manage hold taxation and treasury',
      subcommands: {
        rate: {
          description: `Set transaction tax rate (0-${MAX_TAX_RATE}%)`,
          permission: 'jarl',
          handler: ({ caller, args, reply, replyError }) => {
            const rate = parseInt(args[0] ?? '', 10);
            if (isNaN(rate) || rate < 0 || rate > MAX_TAX_RATE) { replyError(`Rate must be 0-${MAX_TAX_RATE}.`); return; }
            const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === 'jarl');
            if (!jarlPos) { replyError('You are not a Jarl.'); return; }
            this.getTreasury(jarlPos.holdId).taxRate = rate;
            this.persist(ctx);
            reply(`Transaction tax in ${HOLD_NAMES[jarlPos.holdId]} set to ${rate}%.`);
          },
        },
        business: {
          description: `Set daily merchant fee (0-${MAX_BUSINESS_TAX} septims)`,
          permission: 'jarl',
          handler: ({ caller, args, reply, replyError }) => {
            const fee = parseInt(args[0] ?? '', 10);
            if (isNaN(fee) || fee < 0 || fee > MAX_BUSINESS_TAX) { replyError(`Fee must be 0-${MAX_BUSINESS_TAX}.`); return; }
            const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === 'jarl');
            if (!jarlPos) { replyError('You are not a Jarl.'); return; }
            this.getTreasury(jarlPos.holdId).businessTaxRate = fee;
            this.persist(ctx);
            reply(`Merchant fee in ${HOLD_NAMES[jarlPos.holdId]} set to ${fee} septims/day.`);
          },
        },
        treasury: {
          description: 'View a hold treasury',
          permission: 'any',
          handler: ({ caller, args, reply, replyError }) => {
            const holdId = (args[0] as HoldId | undefined) ?? caller.holdId;
            if (!holdId) { replyError('Specify a hold.'); return; }
            const t = this.getTreasury(holdId as HoldId);
            reply(`${HOLD_NAMES[holdId as HoldId]} Treasury\n  Balance: ${t.septims} septims\n  Tx tax: ${t.taxRate}%\n  Merchant fee: ${t.businessTaxRate}/day`);
          },
        },
        withdraw: {
          description: 'Admin: withdraw from treasury',
          permission: 'admin',
          handler: ({ args, reply, replyError }) => {
            if (args.length < 2) { reply('Usage: /tax withdraw <hold> <amount>'); return; }
            const t = this.getTreasury(args[0] as HoldId);
            const amount = parseInt(args[1], 10);
            if (!t || isNaN(amount) || amount <= 0) { replyError('Invalid.'); return; }
            if (t.septims < amount) { replyError(`Insufficient (${t.septims} available).`); return; }
            t.septims -= amount;
            this.persist(ctx);
            reply(`Withdrew ${amount} from ${HOLD_NAMES[t.holdId]}. Remaining: ${t.septims}`);
          },
        },
        give: {
          description: 'Admin: add septims to treasury',
          permission: 'admin',
          handler: ({ args, reply, replyError }) => {
            if (args.length < 2) { reply('Usage: /tax give <hold> <amount>'); return; }
            const holdId = args[0] as HoldId;
            const amount = parseInt(args[1], 10);
            if (isNaN(amount) || amount <= 0) { replyError('Invalid amount.'); return; }
            this.addToTreasury(holdId, amount, ctx);
            this.persist(ctx);
            reply(`Added ${amount} septims to ${HOLD_NAMES[holdId]} treasury.`);
          },
        },
      },
    });
  }
}
