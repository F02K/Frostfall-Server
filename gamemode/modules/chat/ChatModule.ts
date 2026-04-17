import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { PlayerState, PlayerId, HoldId, FactionId, ChatMessage, ChatMessagePayload } from '../../types';
import { randomUUID } from '../../util';

const LOCAL_RANGE = 3000;
const SHOUT_RANGE = 10000;

export class ChatModule implements FrostfallModule {
  readonly id = 'chat';
  readonly name = 'Chat';
  readonly version = '1.0.0';

  private lastPMFrom = new Map<PlayerId, PlayerId>();

  onInit(ctx: ModuleContext): void { this.registerCommands(ctx); console.log('[Chat] Module initialized'); }

  private nearby(ctx: ModuleContext, sender: PlayerState, range: number): PlayerId[] {
    const spos = ctx.mp.getActorPos(sender.actorId);
    return ctx.store.getAll().filter((p) => {
      if (p.id === sender.id) return true;
      const pos = ctx.mp.getActorPos(p.actorId);
      const dx = spos[0]-pos[0], dy = spos[1]-pos[1], dz = spos[2]-pos[2];
      return Math.sqrt(dx*dx+dy*dy+dz*dz) <= range;
    }).map((p) => p.id);
  }

  private send(ctx: ModuleContext, msg: ChatMessage, recipients: PlayerId[]): void {
    for (const uid of recipients) ctx.sync.send(uid, 'chatMessage', { message: msg });
    ctx.bus.dispatch<ChatMessagePayload>({ type: 'chatMessage', payload: { message: msg }, timestamp: msg.timestamp });
  }

  private mkid(): string { return randomUUID(); }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({ name: 'say', description: 'IC local speech', permission: 'any', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: 'ic', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }});

    ctx.commands.register({ name: 'shout', description: 'IC shout (extended range)', permission: 'any', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: 'ic', senderId: caller.id, senderName: caller.name, content: `*shouts* ${content}`, timestamp: Date.now() }, this.nearby(ctx, caller, SHOUT_RANGE));
    }});

    ctx.commands.register({ name: 'ooc', description: 'OOC global chat', permission: 'any', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: 'ooc', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, ctx.store.getAll().map((p) => p.id));
    }});

    ctx.commands.register({ name: 'w', description: 'Private message', permission: 'any', handler: ({ caller, args, replyError }) => {
      if (args.length < 2) { replyError('Usage: /w <player> <message>'); return; }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      const content = args.slice(1).join(' ').trim();
      const msg: ChatMessage = { id: this.mkid(), channel: 'pm', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), targetId: target.id };
      this.send(ctx, msg, [caller.id, target.id]);
      this.lastPMFrom.set(target.id, caller.id);
    }});

    ctx.commands.register({ name: 'r', description: 'Reply to last PM', permission: 'any', handler: ({ caller, args, replyError }) => {
      const lastId = this.lastPMFrom.get(caller.id); if (!lastId) { replyError('No PM to reply to.'); return; }
      const target = ctx.store.get(lastId); if (!target) { replyError('That player left.'); return; }
      const content = args.join(' ').trim(); if (!content) return;
      const msg: ChatMessage = { id: this.mkid(), channel: 'pm', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), targetId: lastId };
      this.send(ctx, msg, [caller.id, lastId]);
      this.lastPMFrom.set(lastId, caller.id);
    }});

    ctx.commands.register({ name: 'f', description: 'Faction chat', permission: 'any', handler: ({ caller, args, replyError }) => {
      const content = args.join(' ').trim(); if (!content) return;
      if (!caller.factions.length) { replyError('Not in a faction.'); return; }
      const factionId = caller.factions[0];
      const recipients = ctx.store.getAll().filter((p) => p.factions.includes(factionId)).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: 'faction', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), factionId }, recipients);
    }});

    ctx.commands.register({ name: 'hold', description: 'Hold-wide broadcast', permission: 'any', handler: ({ caller, args, replyError }) => {
      const content = args.join(' ').trim(); if (!content) return;
      if (!caller.holdId) { replyError('Not in a hold.'); return; }
      const recipients = ctx.store.getAll().filter((p) => p.holdId === caller.holdId).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: 'hold', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now(), holdId: caller.holdId as HoldId }, recipients);
    }});

    ctx.commands.register({ name: 's', description: 'Staff channel', permission: 'staff', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      const recipients = ctx.store.getAll().filter((p) => ctx.permissions.isStaff(p.id)).map((p) => p.id);
      this.send(ctx, { id: this.mkid(), channel: 'staff', senderId: caller.id, senderName: caller.name, content, timestamp: Date.now() }, recipients);
    }});

    ctx.commands.register({ name: 'me', description: 'RP action emote', permission: 'any', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: 'ic', senderId: caller.id, senderName: `** ${caller.name}`, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }});

    ctx.commands.register({ name: 'do', description: 'RP environmental description', permission: 'any', handler: ({ caller, args }) => {
      const content = args.join(' ').trim(); if (!content) return;
      this.send(ctx, { id: this.mkid(), channel: 'ic', senderId: caller.id, senderName: `>> ${caller.name}`, content, timestamp: Date.now() }, this.nearby(ctx, caller, LOCAL_RANGE));
    }});

    ctx.commands.register({ name: 'announce', description: 'Staff: global announcement', permission: 'staff', handler: ({ caller, args, reply }) => {
      const content = args.join(' ').trim(); if (!content) { reply('Usage: /announce <message>'); return; }
      this.send(ctx, { id: this.mkid(), channel: 'ooc', senderId: caller.id, senderName: '[ANNOUNCEMENT]', content, timestamp: Date.now() }, ctx.store.getAll().map((p) => p.id));
      reply('Announced.');
    }});
  }
}
