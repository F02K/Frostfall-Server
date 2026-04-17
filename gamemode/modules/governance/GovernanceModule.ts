/**
 * Frostfall Module — Governance
 *
 * Manages the political structure of each hold:
 *   Jarl → Steward → Housecarl → Captain → Thane → Court Wizard
 *
 * Commands:
 *   /appoint <role> <player>           — Jarl: appoint to a role in their hold
 *   /dismiss <role> <player>           — Jarl: remove from role
 *   /resign                            — Leave your government role
 *   /government [hold]                 — List hold government
 *   /jarl appoint <hold> <player>      — Admin: appoint a Jarl
 *   /jarl remove <hold>                — Admin: remove a Jarl
 *   /jarl list                         — List all Jarls
 *
 * Packets sent to client:
 *   ff:governanceSync  — { positions: GovernmentPosition[] }
 */

import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { GovernmentPosition, GovernmentRole } from '../../core/Permissions';
import type { PlayerState, HoldId, JarlAppointedPayload } from '../../types';
import { HOLD_NAMES } from '../../types';

const APPOINTABLE_BY_JARL: GovernmentRole[] = [
  'housecarl', 'steward', 'thane', 'courtWizard', 'captain',
];

export class GovernanceModule implements FrostfallModule {
  readonly id = 'governance';
  readonly name = 'Governance';
  readonly version = '1.0.0';

  onInit(ctx: ModuleContext): void {
    this.registerCommands(ctx);
    console.log('[Governance] Module initialized');
  }

  onPlayerJoin(ctx: ModuleContext, player: PlayerState): void {
    const positions = ctx.permissions.getGovernmentPositions();
    ctx.sync.send(player.id, 'governanceSync', { positions });
  }

  private registerCommands(ctx: ModuleContext): void {
    // /appoint <role> <playerName>
    ctx.commands.register({
      name: 'appoint',
      description: 'Appoint a player to a government role in your hold',
      permission: 'jarl',
      handler: ({ caller, args, reply, replyError }) => {
        if (args.length < 2) {
          reply(`Usage: /appoint <${APPOINTABLE_BY_JARL.join('|')}> <playerName>`);
          return;
        }
        const role = args[0].toLowerCase() as GovernmentRole;
        if (!APPOINTABLE_BY_JARL.includes(role)) {
          replyError(`Invalid role. Available: ${APPOINTABLE_BY_JARL.join(', ')}`);
          return;
        }
        const targetName = args.slice(1).join(' ');
        const target = ctx.store.getAll().find(
          (p) => p.name.toLowerCase() === targetName.toLowerCase()
        );
        if (!target) { replyError(`Player "${targetName}" is not online.`); return; }

        const jarlPos = ctx.permissions.getGovernmentPositions(caller.id)
          .find((g) => g.role === 'jarl');
        if (!jarlPos) { replyError('You are not a Jarl.'); return; }

        ctx.permissions.appoint(target.id, role, jarlPos.holdId, caller.id);
        this.persistAndBroadcast(ctx);
        reply(`You appointed ${target.name} as ${role} of ${HOLD_NAMES[jarlPos.holdId]}.`);
        ctx.sync.notify(target.id, `You have been appointed as ${role} of ${HOLD_NAMES[jarlPos.holdId]} by ${caller.name}.`);
        ctx.bus.dispatch({
          type: 'positionAppointed',
          payload: { playerId: target.id, role, holdId: jarlPos.holdId, appointedBy: caller.id },
          timestamp: Date.now(),
        });
      },
    });

    // /dismiss <role> <playerName>
    ctx.commands.register({
      name: 'dismiss',
      description: 'Remove a player from a government role in your hold',
      permission: 'jarl',
      handler: ({ caller, args, reply, replyError }) => {
        if (args.length < 2) { reply('Usage: /dismiss <role> <playerName>'); return; }
        const role = args[0].toLowerCase() as GovernmentRole;
        const targetName = args.slice(1).join(' ');
        const jarlPos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === 'jarl');
        if (!jarlPos) { replyError('You are not a Jarl.'); return; }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === targetName.toLowerCase());
        if (!target) { replyError(`Player "${targetName}" is not online.`); return; }
        const removed = ctx.permissions.removeGovernmentRole(target.id, role, jarlPos.holdId);
        if (!removed) { replyError(`${target.name} does not hold that role.`); return; }
        this.persistAndBroadcast(ctx);
        reply(`You dismissed ${target.name} from ${role}.`);
        ctx.sync.notify(target.id, `You have been dismissed from ${role} by ${caller.name}.`);
      },
    });

    // /resign
    ctx.commands.register({
      name: 'resign',
      description: 'Resign from your government role',
      permission: 'any',
      handler: ({ caller, reply, replyError }) => {
        const positions = ctx.permissions.getGovernmentPositions(caller.id);
        if (positions.length === 0) { replyError('You hold no government position.'); return; }
        for (const pos of positions) {
          ctx.permissions.removeGovernmentRole(caller.id, pos.role, pos.holdId);
        }
        this.persistAndBroadcast(ctx);
        reply('You have resigned from your government role(s).');
      },
    });

    // /government [holdId]
    ctx.commands.register({
      name: 'government',
      description: 'Show the government of a hold',
      permission: 'any',
      handler: ({ caller, args, reply }) => {
        const holdId = (args[0] as HoldId | undefined) ?? caller.holdId;
        if (!holdId) { reply('Specify a hold: /government <holdId>'); return; }
        const positions = ctx.permissions.getHoldGovernment(holdId as HoldId);
        if (positions.length === 0) {
          reply(`${HOLD_NAMES[holdId as HoldId] ?? holdId} has no government appointed.`);
          return;
        }
        const lines = positions.map((p) => {
          const name = ctx.store.getAll().find((s) => s.id === p.playerId)?.name
            ?? `(offline:${p.playerId})`;
          return `  ${p.role}: ${name}${p.customTitle ? ` (${p.customTitle})` : ''}`;
        });
        reply(`Government of ${HOLD_NAMES[holdId as HoldId] ?? holdId}:\n${lines.join('\n')}`);
      },
    });

    // /jarl — admin management
    ctx.commands.register({
      name: 'jarl',
      description: 'Admin: manage Jarls of holds',
      subcommands: {
        appoint: {
          description: 'Appoint a Jarl',
          usage: '<hold> <playerName>',
          permission: 'admin',
          handler: ({ args, reply, replyError }) => {
            if (args.length < 2) { reply('Usage: /jarl appoint <hold> <playerName>'); return; }
            const holdId = args[0] as HoldId;
            const targetName = args.slice(1).join(' ');
            const target = ctx.store.getAll().find(
              (p) => p.name.toLowerCase() === targetName.toLowerCase()
            );
            if (!target) { replyError(`Player "${targetName}" is not online.`); return; }

            const existing = ctx.permissions.getJarl(holdId);
            if (existing) {
              ctx.permissions.removeGovernmentRole(existing.playerId, 'jarl', holdId);
              ctx.sync.notify(existing.playerId, `You have been replaced as Jarl of ${HOLD_NAMES[holdId]}.`);
            }

            ctx.permissions.appoint(target.id, 'jarl', holdId, 'console');
            this.persistAndBroadcast(ctx);
            reply(`${target.name} is now Jarl of ${HOLD_NAMES[holdId]}.`);
            ctx.sync.notify(target.id, `You have been appointed as Jarl of ${HOLD_NAMES[holdId]}!`);
            ctx.bus.dispatch<JarlAppointedPayload>({
              type: 'jarlAppointed',
              payload: { playerId: target.id, holdId, appointedBy: 'console' },
              timestamp: Date.now(),
            });
          },
        },
        remove: {
          description: 'Remove the Jarl of a hold',
          usage: '<hold>',
          permission: 'admin',
          handler: ({ args, reply, replyError }) => {
            const holdId = args[0] as HoldId;
            if (!holdId) { reply('Usage: /jarl remove <hold>'); return; }
            const jarl = ctx.permissions.getJarl(holdId);
            if (!jarl) { replyError(`${HOLD_NAMES[holdId]} has no Jarl.`); return; }
            ctx.permissions.removeGovernmentRole(jarl.playerId, 'jarl', holdId);
            this.persistAndBroadcast(ctx);
            ctx.sync.notify(jarl.playerId, `You have been removed as Jarl of ${HOLD_NAMES[holdId]}.`);
            reply(`The Jarl of ${HOLD_NAMES[holdId]} has been removed.`);
          },
        },
        list: {
          description: 'List all Jarls',
          permission: 'any',
          handler: ({ reply }) => {
            const lines = Object.entries(HOLD_NAMES).map(([holdId, name]) => {
              const jarl = ctx.permissions.getJarl(holdId as HoldId);
              const jarlName = jarl
                ? (ctx.store.getAll().find((p) => p.id === jarl.playerId)?.name
                    ?? `(offline:${jarl.playerId})`)
                : '(vacant)';
              return `  ${name}: ${jarlName}`;
            });
            reply(`Current Jarls:\n${lines.join('\n')}`);
          },
        },
      },
    });
  }

  private persistAndBroadcast(ctx: ModuleContext): void {
    ctx.world.set('ff_world_permissions', ctx.permissions.serialize());
    const positions = ctx.permissions.getGovernmentPositions();
    const ids = ctx.store.getAll().map((p) => p.id);
    ctx.sync.broadcast(ids, 'governanceSync', { positions });
  }
}
