import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { StaffRank } from '../../core/Permissions';
import type { PlayerState, PlayerId, HoldId, AuditEntry } from '../../types';
import { HOLD_NAMES, ALL_HOLDS } from '../../types';
import { randomUUID } from '../../util';

const WK_AUDIT = 'ff_world_audit';
const WK_BANS  = 'ff_world_bans';
const MAX_AUDIT = 1000;

interface BanRecord { playerId: PlayerId; name: string; reason: string; bannedBy: PlayerId | 'console'; bannedAt: number; }

export class AdminModule implements FrostfallModule {
  readonly id = 'admin';
  readonly name = 'Admin & Staff Tools';
  readonly version = '1.0.0';

  private frozen = new Set<PlayerId>();

  onInit(ctx: ModuleContext): void { this.registerCommands(ctx); console.log('[Admin] Module initialized'); }

  onPlayerJoin(ctx: ModuleContext, player: PlayerState): void {
    const bans = ctx.world.get<BanRecord[]>(WK_BANS, []);
    if (bans.some((b) => b.playerId === player.id)) { ctx.mp.kick(player.id); return; }
    const staff = ctx.store.getAll().filter((p) => ctx.permissions.isStaff(p.id) && p.id !== player.id);
    for (const s of staff) ctx.sync.notify(s.id, `[Staff] ${player.name} connected.`);
  }

  onPlayerLeave(_ctx: ModuleContext, player: PlayerState): void { this.frozen.delete(player.id); }

  audit(ctx: ModuleContext, action: string, actorId: PlayerId | 'system' | 'console', targetId?: PlayerId, details: Record<string, unknown> = {}): void {
    const entry: AuditEntry = { id: randomUUID(), action, actorId, targetId, details, timestamp: Date.now() };
    ctx.world.mutate<AuditEntry[]>(WK_AUDIT, (log) => { const n = [...log, entry]; return n.length > MAX_AUDIT ? n.slice(n.length - MAX_AUDIT) : n; }, []);
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({ name: 'staff', description: 'Manage staff ranks', subcommands: {
      grant: { description: 'Grant staff rank', permission: 'admin', handler: ({ caller, args, reply, replyError }) => {
        if (args.length < 2) { reply('Usage: /staff grant <player> <staff|moderator|admin|owner>'); return; }
        const rank = args[1].toLowerCase() as StaffRank;
        if (!(['staff','moderator','admin','owner'] as StaffRank[]).includes(rank)) { replyError('Invalid rank.'); return; }
        if ((rank === 'admin' || rank === 'owner') && !ctx.permissions.has(caller, 'owner')) { replyError('Only owners can grant admin/owner.'); return; }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
        if (!target) { replyError('Player not online.'); return; }
        ctx.permissions.grantStaff(target.id, rank, caller.id);
        ctx.world.set('ff_world_permissions', ctx.permissions.serialize());
        reply(`${target.name} granted ${rank}.`);
        ctx.sync.notify(target.id, `You were granted ${rank} by ${caller.name}.`);
        this.audit(ctx, 'staffGrant', caller.id, target.id, { rank });
      }},
      revoke: { description: 'Revoke staff rank', permission: 'admin', handler: ({ caller, args, reply, replyError }) => {
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
        if (!target) { replyError('Player not online.'); return; }
        if (!ctx.permissions.revokeStaff(target.id)) { replyError('No rank found.'); return; }
        ctx.world.set('ff_world_permissions', ctx.permissions.serialize());
        reply(`${target.name} rank revoked.`); ctx.sync.notify(target.id, 'Your staff rank was revoked.');
        this.audit(ctx, 'staffRevoke', caller.id, target.id, {});
      }},
      list: { description: 'List staff', permission: 'any', handler: ({ reply }) => {
        const staff = ctx.permissions.getAllStaff();
        if (!staff.length) { reply('No staff.'); return; }
        reply(`Staff:\n${staff.map((s) => `  ${s.rank.padEnd(10)} ${ctx.store.getAll().find((p)=>p.id===s.playerId)?.name??`(offline:${s.playerId})`}`).join('\n')}`);
      }},
    }});

    ctx.commands.register({ name: 'kick', description: 'Kick a player', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      const reason = args.slice(1).join(' ') || 'No reason given';
      ctx.sync.notify(target.id, `Kicked: ${reason}`); setTimeout(() => ctx.mp.kick(target.id), 1000);
      reply(`${target.name} kicked.`); this.audit(ctx, 'kick', caller.id, target.id, { reason });
      ctx.bus.dispatch({ type: 'playerKicked', payload: { playerId: target.id, reason }, timestamp: Date.now() });
    }});

    ctx.commands.register({ name: 'ban', description: 'Ban a player', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      const reason = args.slice(1).join(' ') || 'No reason';
      const ban: BanRecord = { playerId: target.id, name: target.name, reason, bannedBy: caller.id, bannedAt: Date.now() };
      ctx.world.mutate<BanRecord[]>(WK_BANS, (b) => [...b.filter((x) => x.playerId !== target.id), ban], []);
      ctx.sync.notify(target.id, `Banned: ${reason}`); setTimeout(() => ctx.mp.kick(target.id), 1500);
      reply(`${target.name} banned.`); this.audit(ctx, 'ban', caller.id, target.id, { reason });
      ctx.bus.dispatch({ type: 'playerBanned', payload: { playerId: target.id, reason }, timestamp: Date.now() });
    }});

    ctx.commands.register({ name: 'unban', description: 'Unban a player', permission: 'moderator', handler: ({ args, reply }) => {
      const name = args.join(' ');
      ctx.world.mutate<BanRecord[]>(WK_BANS, (b) => { const a = b.filter((x) => x.name.toLowerCase() !== name.toLowerCase()); if (a.length < b.length) reply(`${name} unbanned.`); else reply('No ban found.'); return a; }, []);
    }});

    ctx.commands.register({ name: 'warn', description: 'Warn a player', permission: 'staff', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
      const reason = args.slice(1).join(' ');
      if (!target || !reason) { reply('Usage: /warn <player> <reason>'); return; }
      ctx.sync.notify(target.id, `[Warning from ${caller.name}]: ${reason}`); reply(`Warning sent to ${target.name}.`);
      this.audit(ctx, 'warn', caller.id, target.id, { reason });
    }});

    ctx.commands.register({ name: 'tp', description: 'Teleport to player', permission: 'staff', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      ctx.mp.set(caller.actorId, 'pos', ctx.mp.getActorPos(target.actorId));
      reply(`Teleported to ${target.name}.`); this.audit(ctx, 'tp', caller.id, target.id, {});
    }});

    ctx.commands.register({ name: 'tphere', description: 'Teleport player to you', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      ctx.mp.set(target.actorId, 'pos', ctx.mp.getActorPos(caller.actorId));
      ctx.sync.notify(target.id, `Teleported to ${caller.name}.`); reply(`${target.name} teleported to you.`);
      this.audit(ctx, 'tphere', caller.id, target.id, {});
    }});

    ctx.commands.register({ name: 'givegold', description: 'Give septims to a player', permission: 'admin', handler: ({ caller, args, reply, replyError }) => {
      if (args.length < 2) { reply('Usage: /givegold <player> <amount>'); return; }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      const amount = parseInt(args[1], 10);
      if (!target || isNaN(amount) || amount <= 0) { replyError('Invalid.'); return; }
      ctx.store.update(target.id, { septims: target.septims + amount });
      reply(`Gave ${amount} to ${target.name}.`); ctx.sync.notify(target.id, `Received ${amount} septims from staff.`);
      this.audit(ctx, 'givegold', caller.id, target.id, { amount });
    }});

    ctx.commands.register({ name: 'setgold', description: 'Set player septims', permission: 'admin', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
      const amount = parseInt(args[1] ?? '', 10);
      if (!target || isNaN(amount) || amount < 0) { replyError('Usage: /setgold <player> <amount>'); return; }
      ctx.store.update(target.id, { septims: amount });
      reply(`${target.name} septims set to ${amount}.`); this.audit(ctx, 'setgold', caller.id, target.id, { amount });
    }});

    ctx.commands.register({ name: 'clearbounty', description: 'Clear bounty', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0]?.toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      const holdId = args[1] as HoldId | undefined;
      if (holdId) ctx.store.update(target.id, { bounty: { ...target.bounty, [holdId]: 0 } });
      else ctx.store.update(target.id, { bounty: {} });
      reply(`Cleared ${target.name}'s bounty${holdId ? ` in ${HOLD_NAMES[holdId]}` : ''}.`);
      this.audit(ctx, 'clearbounty', caller.id, target.id, { holdId: holdId ?? 'all' });
    }});

    ctx.commands.register({ name: 'setbounty', description: 'Set player bounty', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      if (args.length < 3) { reply('Usage: /setbounty <player> <holdId> <amount>'); return; }
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
      const holdId = args[1] as HoldId;
      const amount = parseInt(args[2], 10);
      if (!target || !ALL_HOLDS.includes(holdId) || isNaN(amount) || amount < 0) { replyError('Invalid args.'); return; }
      ctx.store.update(target.id, { bounty: { ...target.bounty, [holdId]: amount } });
      reply(`${target.name} bounty in ${HOLD_NAMES[holdId]}: ${amount}.`);
      this.audit(ctx, 'setbounty', caller.id, target.id, { holdId, amount });
    }});

    ctx.commands.register({ name: 'freeze', description: 'Freeze a player', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      this.frozen.add(target.id); ctx.sync.notify(target.id, 'You have been frozen.');
      reply(`${target.name} frozen.`); this.audit(ctx, 'freeze', caller.id, target.id, {});
    }});

    ctx.commands.register({ name: 'unfreeze', description: 'Unfreeze a player', permission: 'moderator', handler: ({ caller, args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      this.frozen.delete(target.id); ctx.sync.notify(target.id, 'You have been unfrozen.');
      reply(`${target.name} unfrozen.`); this.audit(ctx, 'unfreeze', caller.id, target.id, {});
    }});

    ctx.commands.register({ name: 'online', description: 'List online players', permission: 'any', handler: ({ reply }) => {
      const players = ctx.store.getAll(); if (!players.length) { reply('No players online.'); return; }
      reply(`Online (${players.length}):\n${players.map((p) => { const rank = ctx.permissions.getStaffRank(p.id); const roles = ctx.permissions.getGovernmentPositions(p.id).map((g) => g.role).join(','); return `  ${rank?`[${rank}]`:roles?`(${roles})`:''}${p.name} — ${p.holdId??'no hold'}`; }).join('\n')}`);
    }});

    ctx.commands.register({ name: 'info', description: 'Detailed player info', permission: 'staff', handler: ({ args, reply, replyError }) => {
      const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!target) { replyError('Player not online.'); return; }
      const rank = ctx.permissions.getStaffRank(target.id) ?? 'none';
      const govt = ctx.permissions.getGovernmentPositions(target.id).map((g) => `${g.role}@${g.holdId}`).join(', ') || 'none';
      const jobs = ctx.permissions.getPlayerJobs(target.id).map((j) => `${j.jobId}@${j.holdId}`).join(', ') || 'none';
      const bounties = Object.entries(target.bounty).filter(([,v])=>v>0).map(([h,v])=>`${h}:${v}`).join(', ')||'none';
      reply(`${target.name} | userId=${target.id}\nHold: ${target.holdId??'none'}  Gold: ${target.septims}\nStaff: ${rank}  Govt: ${govt}\nJobs: ${jobs}\nBounties: ${bounties}\nHunger: ${target.hungerLevel}  Drunk: ${target.drunkLevel}\nFrozen: ${this.frozen.has(target.id)}`);
    }});

    ctx.commands.register({ name: 'audit', description: 'View audit log', permission: 'admin', handler: ({ args, reply }) => {
      const log = ctx.world.get<AuditEntry[]>(WK_AUDIT, []);
      const recent = log.slice(-10);
      if (!recent.length) { reply('No entries.'); return; }
      reply(`Last ${recent.length} entries:\n${recent.map((e) => { const ts = new Date(e.timestamp).toISOString().substr(11,8); const by = ctx.store.getAll().find((p)=>p.id===e.actorId)?.name??String(e.actorId); const tgt = e.targetId?ctx.store.getAll().find((p)=>p.id===e.targetId)?.name??String(e.targetId):''; return `  ${ts} ${e.action} by=${by}${tgt?` on=${tgt}`:''}`; }).join('\n')}`);
    }});

    ctx.commands.register({ name: 'help', description: 'List commands', permission: 'any', handler: ({ caller, reply }) => {
      const cmds = ctx.commands.list().filter((c) => !c.permission || ctx.permissions.has(caller, c.permission ?? 'any'));
      reply(`Commands:\n${cmds.map((c) => `  /${c.name} — ${c.description}`).join('\n')}`);
    }});
  }
}
