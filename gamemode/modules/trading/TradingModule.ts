import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { PlayerState, PlayerId, TradeSession, TradeOffer, TradeCompletedPayload } from '../../types';
import { randomUUID } from '../../util';

const TRADE_TTL   = 5 * 60 * 1000;
const REQUEST_TTL = 60 * 1000;

interface PendingRequest { initiatorId: PlayerId; responderId: PlayerId; expiresAt: number; }

export class TradingModule implements FrostfallModule {
  readonly id = 'trading';
  readonly name = 'Trading';
  readonly version = '1.0.0';

  private sessions = new Map<string, TradeSession>();
  private requests = new Map<PlayerId, PendingRequest>();

  onInit(ctx: ModuleContext): void { this.registerCommands(ctx); console.log('[Trading] Module initialized'); }

  onTick(ctx: ModuleContext, now: number): void {
    for (const [id, req] of this.requests) { if (now > req.expiresAt) { this.requests.delete(id); ctx.sync.notify(req.initiatorId, 'Trade request expired.'); } }
    for (const s of this.sessions.values()) { if (now > s.expiresAt && s.status === 'active') { s.status = 'cancelled'; this.cleanup(s, ctx, 'Trade timed out.'); } }
  }

  onPlayerLeave(ctx: ModuleContext, player: PlayerState): void {
    const s = this.findSession(player.id); if (s) this.cleanup(s, ctx, `${player.name} disconnected — trade cancelled.`);
    this.requests.delete(player.id);
  }

  private findSession(pid: PlayerId): TradeSession | undefined {
    for (const s of this.sessions.values()) { if ((s.initiatorId === pid || s.responderId === pid) && s.status === 'active') return s; }
  }
  private cleanup(s: TradeSession, ctx: ModuleContext, msg: string): void { this.sessions.delete(s.id); ctx.sync.notify(s.initiatorId, msg); ctx.sync.notify(s.responderId, msg); }
  private syncSession(s: TradeSession, ctx: ModuleContext): void { ctx.sync.send(s.initiatorId, 'tradeUpdate', { session: s }); ctx.sync.send(s.responderId, 'tradeUpdate', { session: s }); }
  private emptyOffer(): TradeOffer { return { items: [], septims: 0 }; }

  private execute(s: TradeSession, ctx: ModuleContext): void {
    const a = ctx.store.get(s.initiatorId)!, b = ctx.store.get(s.responderId)!;
    if (a.septims < s.initiatorOffer.septims || b.septims < s.responderOffer.septims) { this.cleanup(s, ctx, 'Trade cancelled: insufficient funds.'); return; }
    ctx.store.update(a.id, { septims: a.septims - s.initiatorOffer.septims + s.responderOffer.septims });
    ctx.store.update(b.id, { septims: b.septims - s.responderOffer.septims + s.initiatorOffer.septims });
    s.status = 'completed'; this.sessions.delete(s.id);
    ctx.sync.send(s.initiatorId, 'tradeUpdate', { session: s }); ctx.sync.send(s.responderId, 'tradeUpdate', { session: s });
    ctx.sync.notify(s.initiatorId, `Trade completed with ${b.name}.`); ctx.sync.notify(s.responderId, `Trade completed with ${a.name}.`);
    ctx.bus.dispatch<TradeCompletedPayload>({ type: 'tradeCompleted', payload: { tradeId: s.id, initiatorId: s.initiatorId, responderId: s.responderId }, timestamp: Date.now() });
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({ name: 'trade', description: 'Player-to-player trading', permission: 'any',
      handler: ({ caller, args, reply, replyError }) => {
        if (!args.length) { reply('/trade <name|accept|decline|offer|remove|confirm|cancel|status>'); return; }
        const sub = args[0].toLowerCase();

        if (!['accept','decline','offer','remove','confirm','cancel','status'].includes(sub)) {
          const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
          if (!target) { replyError('Player not online.'); return; }
          if (target.id === caller.id) { replyError("Can't trade with yourself."); return; }
          if (this.findSession(caller.id)) { replyError('Already in a trade.'); return; }
          this.requests.set(target.id, { initiatorId: caller.id, responderId: target.id, expiresAt: Date.now() + REQUEST_TTL });
          ctx.sync.notify(target.id, `${caller.name} wants to trade. /trade accept or /trade decline`);
          reply(`Trade request sent to ${target.name}.`); return;
        }

        if (sub === 'accept') {
          const req = this.requests.get(caller.id); if (!req) { replyError('No pending request.'); return; }
          if (this.findSession(caller.id)) { replyError('Already in trade.'); return; }
          this.requests.delete(caller.id);
          const session: TradeSession = { id: randomUUID(), initiatorId: req.initiatorId, responderId: caller.id, initiatorOffer: this.emptyOffer(), responderOffer: this.emptyOffer(), initiatorConfirmed: false, responderConfirmed: false, status: 'active', createdAt: Date.now(), expiresAt: Date.now() + TRADE_TTL };
          this.sessions.set(session.id, session); this.syncSession(session, ctx);
          ctx.sync.notify(req.initiatorId, `${caller.name} accepted. /trade offer to add items, /trade confirm when ready.`);
          reply('Trade started! /trade offer then /trade confirm.'); return;
        }
        if (sub === 'decline') {
          const req = this.requests.get(caller.id); if (!req) { replyError('No request.'); return; }
          this.requests.delete(caller.id); ctx.sync.notify(req.initiatorId, `${caller.name} declined.`); reply('Declined.'); return;
        }

        const session = this.findSession(caller.id); if (!session) { replyError('No active trade.'); return; }
        const isInit = session.initiatorId === caller.id;
        const myOffer = isInit ? session.initiatorOffer : session.responderOffer;

        if (sub === 'offer') {
          const type = args[1]?.toLowerCase();
          if (type === 'gold') {
            const amount = parseInt(args[2] ?? '', 10); if (isNaN(amount)||amount<0) { replyError('Invalid.'); return; }
            if (caller.septims < amount) { replyError(`Only have ${caller.septims}.`); return; }
            myOffer.septims = amount;
          } else if (type === 'item') {
            const baseId = parseInt(args[2]??'',16), count = parseInt(args[3]??'1',10);
            if (isNaN(baseId)||isNaN(count)||count<=0) { replyError('Usage: /trade offer item <hex> [count]'); return; }
            const ex = myOffer.items.find((i) => i.baseId === baseId); if (ex) ex.count += count; else myOffer.items.push({ baseId, count });
          } else { reply('/trade offer gold <amt>  |  /trade offer item <hex> [count]'); return; }
          session.initiatorConfirmed = false; session.responderConfirmed = false; session.expiresAt = Date.now() + TRADE_TTL;
          this.syncSession(session, ctx); reply('Offer updated.'); return;
        }
        if (sub === 'remove') {
          const type = args[1]?.toLowerCase();
          if (type === 'gold') myOffer.septims = 0;
          else if (type === 'item') { const b = parseInt(args[2]??'',16); myOffer.items = myOffer.items.filter((i) => i.baseId !== b); }
          else { reply('/trade remove gold | item <hex>'); return; }
          session.initiatorConfirmed = false; session.responderConfirmed = false; this.syncSession(session, ctx); reply('Updated.'); return;
        }
        if (sub === 'confirm') {
          if (isInit) session.initiatorConfirmed = true; else session.responderConfirmed = true;
          this.syncSession(session, ctx);
          const other = isInit ? session.responderId : session.initiatorId;
          ctx.sync.notify(other, `${caller.name} confirmed. /trade confirm to complete.`);
          reply('Confirmed. Waiting…');
          if (session.initiatorConfirmed && session.responderConfirmed) this.execute(session, ctx); return;
        }
        if (sub === 'cancel') { session.status = 'cancelled'; this.cleanup(session, ctx, `${caller.name} cancelled.`); return; }
        if (sub === 'status') {
          const their = isInit ? session.responderOffer : session.initiatorOffer;
          const other = ctx.store.get(isInit ? session.responderId : session.initiatorId);
          reply(`Trade with ${other?.name??'?'}\nYour offer: ${myOffer.septims}g ${myOffer.items.map((i)=>`0x${i.baseId.toString(16)}x${i.count}`).join(',')}\nTheir offer: ${their.septims}g ${their.items.map((i)=>`0x${i.baseId.toString(16)}x${i.count}`).join(',')}`);
        }
      },
    });
  }
}
