import type { FrostfallModule, ModuleContext } from '../../core/Module';
import type { JobId, GovernmentRole } from '../../core/Permissions';
import type { PlayerState, HoldId, JobAssignedPayload } from '../../types';
import { HOLD_NAMES } from '../../types';

interface JobDef {
  id: JobId; name: string; description: string;
  perks: string[]; requiresApproval: boolean; grantedBy: (GovernmentRole | 'admin')[];
}

const JOBS: JobDef[] = [
  { id: 'guard',      name: 'Hold Guard',   description: 'Law enforcement.', perks: ['Can arrest players', '/arrest command'], requiresApproval: true,  grantedBy: ['captain','jarl','admin'] },
  { id: 'merchant',   name: 'Merchant',     description: 'Licensed trader.', perks: ['Market stall access', '/shop commands'], requiresApproval: true,  grantedBy: ['steward','jarl','admin'] },
  { id: 'blacksmith', name: 'Blacksmith',   description: 'Crafts and repairs arms.', perks: ['Repair services', 'Ore tax discount'], requiresApproval: true,  grantedBy: ['steward','jarl','admin'] },
  { id: 'innkeeper',  name: 'Innkeeper',    description: 'Runs an inn.',     perks: ['Sell food/drink', 'Rent rooms'], requiresApproval: true,  grantedBy: ['steward','jarl','admin'] },
  { id: 'farmer',     name: 'Farmer',       description: 'Crops and flora.', perks: ['Farm plots access', 'Reduced crop tax'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'miner',      name: 'Miner',        description: 'Extracts ore.',    perks: ['Mine access', 'Reduced ore tax'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'woodcutter', name: 'Woodcutter',   description: 'Chops lumber.',    perks: ['Lumber camp access'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'hunter',     name: 'Hunter',       description: 'Hunts wildlife.',  perks: ['Hunting license', 'Tax-free market day'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'alchemist',  name: 'Alchemist',    description: 'Brews potions.',   perks: ['Sell potions at stall', 'Lab access'], requiresApproval: true,  grantedBy: ['courtWizard','steward','jarl','admin'] },
  { id: 'bard',       name: 'Bard',         description: 'Entertains.',      perks: ['Tip system via /tip'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'healer',     name: 'Healer',       description: 'Restoration.',     perks: ['Charge for healing', 'Apothecary access'], requiresApproval: false, grantedBy: ['courtWizard','steward','jarl','admin'] },
  { id: 'courier',    name: 'Courier',      description: 'Message delivery.', perks: ['Package delivery', 'Reduced tolls'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'fisherman',  name: 'Fisherman',    description: 'Catches fish.',    perks: ['Fishing rights', 'Market selling'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
  { id: 'lumberjack', name: 'Lumberjack',   description: 'Bulk lumber.',     perks: ['Bulk contracts', 'Supply chain role'], requiresApproval: false, grantedBy: ['steward','jarl','admin'] },
];

export class JobsModule implements FrostfallModule {
  readonly id = 'jobs';
  readonly name = 'Jobs';
  readonly version = '1.0.0';
  readonly dependsOn = ['governance'] as const;

  onInit(ctx: ModuleContext): void {
    this.registerCommands(ctx);
    console.log('[Jobs] Module initialized');
  }

  onPlayerJoin(ctx: ModuleContext, player: PlayerState): void {
    ctx.sync.send(player.id, 'jobsSync', { jobs: ctx.permissions.getPlayerJobs(player.id) });
  }

  private registerCommands(ctx: ModuleContext): void {
    ctx.commands.register({
      name: 'job',
      description: 'Job management',
      subcommands: {
        apply: {
          description: 'Apply for a job in your current hold',
          permission: 'any',
          handler: ({ caller, args, reply, replyError }) => {
            const jobId = args[0] as JobId | undefined;
            if (!jobId) { reply(`Usage: /job apply <${JOBS.map((j) => j.id).join('|')}>`); return; }
            const def = JOBS.find((j) => j.id === jobId);
            if (!def) { replyError(`Unknown job. Use /job list.`); return; }
            if (!caller.holdId) { replyError('You must be in a hold.'); return; }
            if (def.requiresApproval) {
              const govt = ctx.permissions.getHoldGovernment(caller.holdId as HoldId);
              const notifyList = govt.filter((g) => g.role === 'steward' || g.role === 'jarl');
              for (const pos of notifyList) {
                ctx.sync.notify(pos.playerId, `${caller.name} requests ${def.name} job. Use: /job assign ${caller.name} ${jobId}`);
              }
              reply(`${def.name} requires approval. A request has been sent to the Steward/Jarl.`);
              return;
            }
            ctx.permissions.assignJob(caller.id, jobId, caller.holdId as HoldId, 'system');
            ctx.sync.send(caller.id, 'jobsSync', { jobs: ctx.permissions.getPlayerJobs(caller.id) });
            reply(`You are now a ${def.name} in ${HOLD_NAMES[caller.holdId as HoldId]}.`);
            ctx.bus.dispatch<JobAssignedPayload>({ type: 'jobAssigned', payload: { playerId: caller.id, jobId, holdId: caller.holdId as HoldId }, timestamp: Date.now() });
          },
        },
        assign: {
          description: 'Assign a job to a player',
          permission: 'steward',
          handler: ({ caller, args, reply, replyError }) => {
            if (args.length < 2) { reply('Usage: /job assign <playerName> <jobId>'); return; }
            const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
            if (!target) { replyError(`Player "${args[0]}" not online.`); return; }
            const jobId = args[1] as JobId;
            if (!JOBS.find((j) => j.id === jobId)) { replyError('Unknown job.'); return; }
            const pos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === 'jarl' || g.role === 'steward');
            if (!pos) { replyError('Must be Jarl or Steward.'); return; }
            ctx.permissions.assignJob(target.id, jobId, pos.holdId, caller.id);
            ctx.sync.send(target.id, 'jobsSync', { jobs: ctx.permissions.getPlayerJobs(target.id) });
            ctx.sync.notify(target.id, `You are now a ${JOBS.find((j) => j.id === jobId)?.name ?? jobId} in ${HOLD_NAMES[pos.holdId]}, assigned by ${caller.name}.`);
            reply(`${target.name} assigned as ${jobId} in ${HOLD_NAMES[pos.holdId]}.`);
          },
        },
        revoke: {
          description: 'Revoke a job from a player',
          permission: 'steward',
          handler: ({ caller, args, reply, replyError }) => {
            if (args.length < 2) { reply('Usage: /job revoke <playerName> <jobId>'); return; }
            const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
            if (!target) { replyError('Player not online.'); return; }
            const pos = ctx.permissions.getGovernmentPositions(caller.id).find((g) => g.role === 'jarl' || g.role === 'steward');
            if (!pos) { replyError('Must be Jarl or Steward.'); return; }
            const removed = ctx.permissions.revokeJob(target.id, args[1] as JobId, pos.holdId);
            if (!removed) { replyError('Job not found for that player in this hold.'); return; }
            ctx.sync.send(target.id, 'jobsSync', { jobs: ctx.permissions.getPlayerJobs(target.id) });
            ctx.sync.notify(target.id, `Your ${args[1]} license in ${HOLD_NAMES[pos.holdId]} was revoked by ${caller.name}.`);
            reply(`Revoked ${args[1]} from ${target.name}.`);
          },
        },
        list: {
          description: 'List available jobs',
          permission: 'any',
          handler: ({ reply }) => {
            const lines = JOBS.map((j) => `  ${j.id.padEnd(12)} — ${j.name}${j.requiresApproval ? ' [approval]' : ''}`);
            reply(`Available Jobs:\n${lines.join('\n')}`);
          },
        },
        info: {
          description: 'Info about a job',
          permission: 'any',
          handler: ({ args, reply, replyError }) => {
            const def = JOBS.find((j) => j.id === args[0]);
            if (!def) { replyError('Unknown job.'); return; }
            reply(`${def.name}\n${def.description}\nPerks:\n${def.perks.map((p) => `  - ${p}`).join('\n')}`);
          },
        },
      },
    });

    ctx.commands.register({
      name: 'myjobs',
      description: 'View your current jobs',
      permission: 'any',
      handler: ({ caller, reply }) => {
        const jobs = ctx.permissions.getPlayerJobs(caller.id);
        if (jobs.length === 0) { reply('No jobs assigned.'); return; }
        const lines = jobs.map((j) => {
          const def = JOBS.find((d) => d.id === j.jobId);
          return `  ${def?.name ?? j.jobId} in ${HOLD_NAMES[j.holdId]}`;
        });
        reply(`Your jobs:\n${lines.join('\n')}`);
      },
    });

    ctx.commands.register({
      name: 'tip',
      description: 'Tip a bard',
      permission: 'any',
      handler: ({ caller, args, reply, replyError }) => {
        if (args.length < 2) { reply('Usage: /tip <playerName> <amount>'); return; }
        const amount = parseInt(args[1], 10);
        if (isNaN(amount) || amount <= 0) { replyError('Invalid amount.'); return; }
        const target = ctx.store.getAll().find((p) => p.name.toLowerCase() === args[0].toLowerCase());
        if (!target) { replyError('Player not online.'); return; }
        if (!ctx.permissions.has(target, 'bard')) { replyError(`${target.name} is not a licensed Bard.`); return; }
        if (caller.septims < amount) { replyError('Insufficient funds.'); return; }
        ctx.store.update(caller.id, { septims: caller.septims - amount });
        ctx.store.update(target.id, { septims: target.septims + amount });
        reply(`Tipped ${target.name} ${amount} septims.`);
        ctx.sync.notify(target.id, `${caller.name} tipped you ${amount} septims!`);
      },
    });
  }
}
