/**
 * Frostfall Framework — Command Bus
 *
 * Handles all player-typed commands sent as custom packets.
 * Client sends: { customPacketType: "command", text: "/jarl appoint <name>" }
 *
 * Usage (in module's onInit):
 *   ctx.commands.register({
 *     name: 'jarl',
 *     subcommands: {
 *       appoint: { permission: 'jarl', handler: appointHandler },
 *       resign:  { permission: 'any',  handler: resignHandler },
 *     },
 *     description: 'Jarl management commands',
 *   });
 *
 * The bus is a single entry point — modules just register their slice.
 */

import type { PlayerState, PlayerId } from '../types';
import type { Permissions, Permission } from './Permissions';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CommandContext {
  caller: PlayerState;
  args: string[];
  reply: (message: string) => void;
  replyError: (message: string) => void;
}

export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

export interface SubcommandDef {
  description: string;
  usage?: string;
  permission: Permission;
  handler: CommandHandler;
}

export interface CommandDef {
  /** Primary command name (without slash), e.g. "jarl" */
  name: string;
  /** One-line description shown in /help */
  description: string;
  /** Top-level permission required to use any subcommand */
  permission?: Permission;
  /** Named subcommands, e.g. "appoint" → handler */
  subcommands?: Record<string, SubcommandDef>;
  /**
   * Handler when the command is used without a subcommand
   * (or when there are no subcommands).
   */
  handler?: CommandHandler;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class CommandBus {
  private commands = new Map<string, CommandDef>();
  private permissions!: Permissions;

  /** Called by Registry during bootstrap */
  setPermissions(p: Permissions): void {
    this.permissions = p;
  }

  register(def: CommandDef): void {
    const key = def.name.toLowerCase();
    if (this.commands.has(key)) {
      console.warn(`[CommandBus] Duplicate command "${key}" — overwriting`);
    }
    this.commands.set(key, def);
  }

  /**
   * Dispatch a raw command string (without leading slash).
   * Called by index.ts when a "command" customPacket arrives.
   * Returns true if a handler was found.
   */
  dispatch(
    caller: PlayerState,
    raw: string,
    replySender: (userId: PlayerId, msg: string) => void
  ): boolean {
    const parts = raw.trim().split(/\s+/);
    const cmdName = parts[0]?.toLowerCase();
    if (!cmdName) return false;

    const def = this.commands.get(cmdName);
    if (!def) {
      replySender(caller.id, `Unknown command "/${cmdName}". Type /help for a list.`);
      return false;
    }

    const reply = (msg: string) => replySender(caller.id, msg);
    const replyError = (msg: string) => replySender(caller.id, `[Error] ${msg}`);

    // Top-level permission check
    if (def.permission && !this.permissions.has(caller, def.permission)) {
      replyError(`You do not have permission to use /${cmdName}.`);
      return true;
    }

    // Subcommand routing
    if (def.subcommands && parts[1]) {
      const subName = parts[1].toLowerCase();
      const sub = def.subcommands[subName];
      if (!sub) {
        const available = Object.keys(def.subcommands).join(', ');
        reply(`Unknown subcommand "${subName}". Available: ${available}`);
        return true;
      }
      if (!this.permissions.has(caller, sub.permission)) {
        replyError(`You do not have permission to use /${cmdName} ${subName}.`);
        return true;
      }
      const ctx: CommandContext = { caller, args: parts.slice(2), reply, replyError };
      void Promise.resolve(sub.handler(ctx)).catch((e) =>
        console.error(`[CommandBus] Error in /${cmdName} ${subName}:`, e)
      );
      return true;
    }

    // Plain command handler
    if (def.handler) {
      const ctx: CommandContext = { caller, args: parts.slice(1), reply, replyError };
      void Promise.resolve(def.handler(ctx)).catch((e) =>
        console.error(`[CommandBus] Error in /${cmdName}:`, e)
      );
      return true;
    }

    // No handler and no subcommand matched
    if (def.subcommands) {
      const available = Object.keys(def.subcommands).join(', ');
      reply(`Usage: /${cmdName} <${available}>`);
    }
    return true;
  }

  /** Return all registered commands (for /help listing) */
  list(): CommandDef[] {
    return [...this.commands.values()];
  }
}
