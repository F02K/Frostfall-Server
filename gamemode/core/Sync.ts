/**
 * Frostfall Framework — Sync Manager
 *
 * Standardized helper for sending typed data packets to clients.
 * All client-bound packets use sendCustomPacket with a typed envelope:
 *   { customPacketType: "ff:<type>", payload: <data> }
 *
 * On the client, the plugin switches on customPacketType to update UI / state.
 *
 * Usage:
 *   ctx.sync.send(userId, 'governanceSync', { positions: [...] });
 *   ctx.sync.broadcast('serverAnnouncement', { message: 'Server restart in 5m' });
 *   ctx.sync.sendAll(onlinePlayers, 'taxCollected', { holdId, amount });
 */

import type { Mp } from '../skymp';
import type { PlayerId } from '../types';

export class SyncManager {
  constructor(private readonly mp: Mp) {}

  /** Send a typed packet to a single client. */
  send<T extends Record<string, unknown>>(
    userId: PlayerId,
    type: string,
    payload: T
  ): void {
    try {
      const packet = JSON.stringify({ customPacketType: `ff:${type}`, payload });
      this.mp.sendCustomPacket(userId, packet);
    } catch (e) {
      console.error(`[Sync] Failed to send "${type}" to userId=${userId}:`, e);
    }
  }

  /** Send to multiple specific players. */
  sendAll<T extends Record<string, unknown>>(
    userIds: PlayerId[],
    type: string,
    payload: T
  ): void {
    for (const uid of userIds) {
      this.send(uid, type, payload);
    }
  }

  /**
   * Broadcast to all connected players.
   * The mp object doesn't expose a broadcast primitive, so we iterate the user list.
   * Pass the connected userId list from the store.
   */
  broadcast<T extends Record<string, unknown>>(
    connectedUserIds: PlayerId[],
    type: string,
    payload: T
  ): void {
    this.sendAll(connectedUserIds, type, payload);
  }

  /**
   * Send a server message (notification) to a player.
   * Displayed as a chat-style notification on the client.
   */
  notify(userId: PlayerId, message: string, category: 'info' | 'warn' | 'error' = 'info'): void {
    this.send(userId, 'notification', { message, category });
  }

  notifyAll(userIds: PlayerId[], message: string, category: 'info' | 'warn' | 'error' = 'info'): void {
    for (const uid of userIds) {
      this.notify(uid, message, category);
    }
  }
}
