import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { PlayerState, HoldId, MarketStall, ShopListing, ShopPurchasedPayload } from '../../types';
import { HOLD_NAMES } from '../../types';
import { randomUUID } from '../../util';

const WK_STALLS    = 'ff_world_stalls';
const WK_LISTINGS  = 'ff_world_listings';
const RENT_INTERVAL = 24 * 60 * 60 * 1000;

const DEFAULT_STALLS: Omit<MarketStall, 'merchantId' | 'lastRentPaidAt'>[] = [
  { id: 'wrun-1', holdId: 'whiterun',   name: 'Whiterun Market A',  description: 'By the Gildergreen',  rentPerDay: 50 },
  { id: 'wrun-2', holdId: 'whiterun',   name: 'Whiterun Market B',  description: 'Near the well',        rentPerDay: 50 },
  { id: 'whem-1', holdId: 'eastmarch',  name: 'Windhelm Market A',  description: 'Grey Quarter side',    rentPerDay: 45 },
  { id: 'rift-1', holdId: 'rift',       name: 'Riften Market A',    description: 'Canal level',          rentPerDay: 40 },
  { id: 'mark-1', holdId: 'reach',      name: 'Markarth Market A',  description: 'Near the inn',         rentPerDay: 45 },
  { id: 'sol-1',  holdId: 'haafingar',  name: 'Solitude Market A',  description: 'Castle Dour road',     rentPerDay: 60 },
  { id: 'sol-2',  holdId: 'haafingar',  name: 'Solitude Market B',  description: 'Main street',          rentPerDay: 55 },
  { id: 'dawn-1', holdId: 'pale',       name: 'Dawnstar Market A',  description: 'Near the inn',         rentPerDay: 30 },
  { id: 'falk-1', holdId: 'falkreath',  name: 'Falkreath Market A', description: 'Town square',          rentPerDay: 30 },
  { id: 'mort-1', holdId: 'hjaalmarch', name: 'Morthal Market A',   description: 'Longhouse side',       rentPerDay: 25 },
  { id: 'wint-1', holdId: 'winterhold', name: 'Winterhold Market A',description: 'College road',         rentPerDay: 20 },
];

export class MerchantsModule implements FrostfallModule {
  readonly id = 'merchants';
  readonly name = 'Merchants & Market';
  readonly version = '1.0.0';
  readonly dependsOn = ['governance', 'jobs', 'taxation'] as const;

  private stalls: MarketStall[]   = [];
  private listings: ShopListing[] = [];

  onInit(ctx: ModuleContext): void {
    this.stalls   = ctx.world.get<MarketStall[]>(WK_STALLS, []);
    this.listings = ctx.world.get<ShopListing[]>(WK_LISTINGS, []);
    if (this.stalls.length === 0) {
      this.stalls = DEFAULT_STALLS.map((s) => ({ ...s, merchantId: null, lastRentPaidAt: null }));
      this.persist(ctx);
    }
    this.registerCommands(ctx);
    console.log('[Merchants] Module initialized');
  }

  onTick(ctx: ModuleContext, now: number): void {
    for (const stall of this.stalls) {
      if (!stall.merchantId) continue;
      const lastPaid = stall.lastRentPaidAt ?? now;
      if (now - lastPaid < RENT_INTERVAL) continue;
      const m = ctx.store.get(stall.merchantId);
      if (m && m.septims >= stall.rentPerDay) {
        ctx.store.update(m.id, { septims: m.septims - stall.rentPerDay });
        stall.lastRentPaidAt = now;
        ctx.sync.notify(m.id, `${stall.rentPerDay} septims stall rent collected for "${stall.name}".`);
      } else {
        if (m) ctx.sync.notify(m.id, `Evicted from "${stall.name}" — could not pay rent.`);
        this.vacate(stall.id, ctx);
      }
    }
    this.persist(ctx);
  }

  onPlayerJoin(ctx: ModuleContext, player: PlayerState): void {
    ctx.sync.send(player.id, 'marketSync', {
      stalls:   player.holdId ? this.stalls.filter((s) => s.holdId === player.holdId) : this.stalls,
      listings: player.holdId ? this.listings.filter((l) => l.holdId === player.holdId) : this.listings,
    });
  }

  private vacate(stallId: string, ctx: ModuleContext): void {
    const s = this.stalls.find((x) => x.id === stallId);
    if (!s) return;
    this.listings = this.listings.filter((l) => l.stallId !== stallId);
    s.merchantId = null;
    s.lastRentPaidAt = null;
    this.persist(ctx);
    ctx.bus.dispatch({ type: 'stallVacated', payload: { stallId, holdId: s.holdId }, timestamp: Date.now() });
  }

  private persist(ctx: ModuleContext): void {
    ctx.world.set(WK_STALLS, this.stalls);
    ctx.world.set(WK_LISTINGS, this.listings);
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({
      name: 'shop',
      description: 'Market and merchant commands',
      subcommands: {
        browse: {
          description: 'Browse listings in a hold',
          permission: 'any',
          handler: ({ caller, args, reply }) => {
            const holdId = (args[0] as HoldId | undefined) ?? caller.holdId;
            if (!holdId) { reply('Specify a hold: /shop browse <holdId>'); return; }
            const ls = this.listings.filter((l) => l.holdId === holdId as HoldId);
            if (!ls.length) { reply(`No listings in ${HOLD_NAMES[holdId as HoldId]}.`); return; }
            reply(`Listings in ${HOLD_NAMES[holdId as HoldId]}:\n${ls.map(
              (l) => `  [${l.id}] 0x${l.baseId.toString(16)} x${l.count} @ ${l.pricePerUnit} sep`
            ).join('\n')}`);
          },
        },
        buy: {
          description: 'Buy from a listing',
          permission: 'any',
          handler: ({ caller, args, reply, replyError }) => {
            const l = this.listings.find((x) => x.id === args[0]);
            if (!l) { replyError('Listing not found.'); return; }
            if (l.merchantId === caller.id) { replyError("Can't buy your own listings."); return; }
            const count = Math.min(parseInt(args[1] ?? '1', 10), l.count);
            const total = count * l.pricePerUnit;
            if (caller.septims < total) { replyError(`Need ${total}, have ${caller.septims}.`); return; }
            const m = ctx.store.get(l.merchantId);
            if (!m) { replyError('Merchant is offline.'); return; }
            ctx.store.update(caller.id, { septims: caller.septims - total });
            ctx.store.update(m.id, { septims: m.septims + total });
            l.count -= count;
            if (l.count <= 0) this.listings = this.listings.filter((x) => x.id !== l.id);
            this.persist(ctx);
            reply(`Bought x${count} for ${total} septims.`);
            ctx.sync.notify(m.id, `${caller.name} bought x${count} for ${total} septims.`);
            ctx.bus.dispatch<ShopPurchasedPayload>({
              type: 'shopPurchased',
              payload: { listingId: l.id, buyerId: caller.id, sellerId: m.id, count, totalPrice: total },
              timestamp: Date.now(),
            });
          },
        },
        sell: {
          description: 'List an item for sale',
          permission: 'merchant',
          handler: ({ caller, args, reply, replyError }) => {
            if (args.length < 3) { reply('Usage: /shop sell <baseId_hex> <count> <priceEach>'); return; }
            const baseId = parseInt(args[0], 16), count = parseInt(args[1], 10), price = parseInt(args[2], 10);
            if (isNaN(baseId) || isNaN(count) || isNaN(price) || count <= 0 || price <= 0) { replyError('Invalid args.'); return; }
            const stall = this.stalls.find((s) => s.merchantId === caller.id);
            if (!stall) { replyError('No rented stall. Use /shop rent <stallId> first.'); return; }
            const listing: ShopListing = { id: randomUUID(), stallId: stall.id, merchantId: caller.id, holdId: stall.holdId, baseId, count, pricePerUnit: price, listedAt: Date.now() };
            this.listings.push(listing);
            this.persist(ctx);
            reply(`Listed x${count} of 0x${baseId.toString(16)} @ ${price} sep [ID: ${listing.id}]`);
          },
        },
        remove: {
          description: 'Remove a listing',
          permission: 'merchant',
          handler: ({ caller, args, reply, replyError }) => {
            const l = this.listings.find((x) => x.id === args[0] && x.merchantId === caller.id);
            if (!l) { replyError('Not found or not yours.'); return; }
            this.listings = this.listings.filter((x) => x.id !== args[0]);
            this.persist(ctx);
            reply('Listing removed.');
          },
        },
        rent: {
          description: 'Rent a market stall',
          permission: 'merchant',
          handler: ({ caller, args, reply, replyError }) => {
            if (!args[0]) { reply('Usage: /shop rent <stallId>'); return; }
            if (this.stalls.some((s) => s.merchantId === caller.id)) { replyError('Already have a stall. /shop vacate first.'); return; }
            const stall = this.stalls.find((s) => s.id === args[0]);
            if (!stall) { replyError('Stall not found.'); return; }
            if (stall.merchantId) { replyError('Stall is occupied.'); return; }
            if (caller.septims < stall.rentPerDay) { replyError(`Need ${stall.rentPerDay} septims for first day.`); return; }
            ctx.store.update(caller.id, { septims: caller.septims - stall.rentPerDay });
            stall.merchantId = caller.id;
            stall.lastRentPaidAt = Date.now();
            this.persist(ctx);
            reply(`Rented "${stall.name}" for ${stall.rentPerDay} septims/day.`);
            ctx.bus.dispatch({ type: 'stallRented', payload: { stallId: stall.id, merchantId: caller.id, holdId: stall.holdId }, timestamp: Date.now() });
          },
        },
        vacate: {
          description: 'Leave your stall',
          permission: 'merchant',
          handler: ({ caller, reply, replyError }) => {
            const stall = this.stalls.find((s) => s.merchantId === caller.id);
            if (!stall) { replyError('No rented stall.'); return; }
            const name = stall.name;
            this.vacate(stall.id, ctx);
            reply(`Vacated "${name}". Your listings have been removed.`);
          },
        },
        listings: {
          description: 'Your active listings',
          permission: 'merchant',
          handler: ({ caller, reply }) => {
            const ls = this.listings.filter((l) => l.merchantId === caller.id);
            if (!ls.length) { reply('No active listings.'); return; }
            reply(`Your listings:\n${ls.map((l) => `  [${l.id}] 0x${l.baseId.toString(16)} x${l.count} @ ${l.pricePerUnit}`).join('\n')}`);
          },
        },
      },
    });

    ctx.commands.register({
      name: 'stall',
      description: 'Manage market stalls',
      subcommands: {
        create: {
          description: 'Create a new stall',
          permission: 'steward',
          handler: ({ args, reply, replyError }) => {
            if (args.length < 3) { reply('Usage: /stall create <holdId> <dailyRent> <name...>'); return; }
            const holdId = args[0] as HoldId, rent = parseInt(args[1], 10), name = args.slice(2).join(' ');
            if (isNaN(rent) || rent < 0) { replyError('Invalid rent.'); return; }
            const s: MarketStall = { id: randomUUID(), holdId, name, description: '', merchantId: null, rentPerDay: rent, lastRentPaidAt: null };
            this.stalls.push(s);
            this.persist(ctx);
            reply(`Stall "${name}" created in ${HOLD_NAMES[holdId]} [ID: ${s.id}]`);
          },
        },
        list: {
          description: 'List stalls',
          permission: 'any',
          handler: ({ args, reply }) => {
            const hs = args[0] as HoldId | undefined;
            const ss = hs ? this.stalls.filter((s) => s.holdId === hs) : this.stalls;
            if (!ss.length) { reply('No stalls.'); return; }
            reply(`Stalls:\n${ss.map((s) => {
              const tenant = s.merchantId ? (ctx.store.get(s.merchantId)?.name ?? '(offline)') : 'Available';
              return `  [${s.id}] ${s.name} — ${s.rentPerDay}/day — ${tenant}`;
            }).join('\n')}`);
          },
        },
        evict: {
          description: 'Evict a merchant from a stall',
          permission: 'steward',
          handler: ({ args, reply, replyError }) => {
            const stall = this.stalls.find((s) => s.id === args[0]);
            if (!stall || !stall.merchantId) { replyError('Not found or already vacant.'); return; }
            const mid = stall.merchantId;
            this.vacate(stall.id, ctx);
            ctx.sync.notify(mid, `You have been evicted from "${stall.name}".`);
            reply('Merchant evicted.');
          },
        },
      },
    });
  }
}
