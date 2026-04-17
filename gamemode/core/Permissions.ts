/**
 * Frostfall Framework — Permission System
 *
 * Permissions combine three orthogonal axes:
 *   1. Staff rank  — server-assigned (owner > admin > moderator > staff)
 *   2. Government  — hold-specific political role (jarl, steward, housecarl, …)
 *   3. Job         — economic role (guard, merchant, blacksmith, …)
 *
 * Permission strings follow the format:
 *   'admin'           — any admin or higher
 *   'staff'           — any staff or higher
 *   'jarl'            — jarl of any hold
 *   'jarl:whiterun'   — jarl of Whiterun specifically
 *   'steward'         — steward of any hold
 *   'steward:rift'    — steward of The Rift
 *   'guard'           — any player with guard job in any hold
 *   'guard:haafingar' — guard in Haafingar specifically
 *   'merchant'        — player with merchant job
 *   'any'             — always passes
 *
 * Usage:
 *   ctx.permissions.has(player, 'jarl:whiterun')  → boolean
 *   ctx.permissions.grant(playerId, 'staff')
 *   ctx.permissions.revoke(playerId, 'staff')
 */

import type { PlayerId, HoldId } from '../types';
import type { PlayerStore } from '../store';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaffRank = 'owner' | 'admin' | 'moderator' | 'staff';

/** Hierarchy: owner > admin > moderator > staff */
export const STAFF_RANKS: StaffRank[] = ['owner', 'admin', 'moderator', 'staff'];

export type GovernmentRole =
  | 'jarl'
  | 'housecarl'
  | 'steward'
  | 'thane'
  | 'courtWizard'
  | 'captain';   // Captain of the Guard

export type JobId =
  | 'guard'
  | 'merchant'
  | 'blacksmith'
  | 'innkeeper'
  | 'farmer'
  | 'miner'
  | 'woodcutter'
  | 'hunter'
  | 'alchemist'
  | 'bard'
  | 'healer'
  | 'courier'
  | 'fisherman'
  | 'lumberjack';

/**
 * A permission string. Examples:
 *   'any', 'staff', 'admin', 'owner'
 *   'jarl', 'jarl:whiterun'
 *   'steward', 'steward:rift'
 *   'guard', 'guard:pale'
 *   'merchant', 'blacksmith'
 */
export type Permission = string;

// ── Records stored per-player in World ───────────────────────────────────────

export interface StaffRecord {
  playerId: PlayerId;
  rank: StaffRank;
  grantedBy: PlayerId | 'console';
  grantedAt: number;
  notes?: string;
}

export interface GovernmentPosition {
  playerId: PlayerId;
  role: GovernmentRole;
  holdId: HoldId;
  appointedBy: PlayerId | 'console';
  appointedAt: number;
  customTitle?: string;
}

export interface JobAssignment {
  playerId: PlayerId;
  jobId: JobId;
  holdId: HoldId;
  assignedBy: PlayerId | 'system' | 'console';
  assignedAt: number;
  licenseExpiry: number | null;
}

// ── Persistence keys ──────────────────────────────────────────────────────────

const KEY_STAFF = 'ff_perm_staff';           // world-level: StaffRecord[]
const KEY_GOVT  = 'ff_perm_government';       // world-level: GovernmentPosition[]
const KEY_JOBS  = 'ff_perm_jobs';             // world-level: JobAssignment[]

// ── Permissions class ─────────────────────────────────────────────────────────

export class Permissions {
  private staffList: StaffRecord[] = [];
  private govtList: GovernmentPosition[] = [];
  private jobList: JobAssignment[] = [];

  /** Load persisted permissions from world store on startup */
  load(
    staffList: StaffRecord[],
    govtList: GovernmentPosition[],
    jobList: JobAssignment[]
  ): void {
    this.staffList = staffList;
    this.govtList  = govtList;
    this.jobList   = jobList;
  }

  /** Test whether a player satisfies a permission string */
  has(player: { id: PlayerId }, permission: Permission): boolean {
    if (permission === 'any') return true;

    const [base, qualifier] = permission.split(':') as [string, string | undefined];

    // Staff hierarchy
    const staffRanks: Permission[] = ['owner', 'admin', 'moderator', 'staff'];
    if (staffRanks.includes(base)) {
      const rank = this.getStaffRank(player.id);
      if (!rank) return false;
      const required = STAFF_RANKS.indexOf(base as StaffRank);
      const actual   = STAFF_RANKS.indexOf(rank);
      return actual <= required; // lower index = higher rank
    }

    // Government roles
    const govtRoles: Permission[] = ['jarl', 'housecarl', 'steward', 'thane', 'courtWizard', 'captain'];
    if (govtRoles.includes(base)) {
      return this.govtList.some(
        (g) =>
          g.playerId === player.id &&
          g.role === base &&
          (qualifier == null || g.holdId === qualifier)
      );
    }

    // Job roles
    const jobRoles: Permission[] = [
      'guard', 'merchant', 'blacksmith', 'innkeeper', 'farmer',
      'miner', 'woodcutter', 'hunter', 'alchemist', 'bard',
      'healer', 'courier', 'fisherman', 'lumberjack',
    ];
    if (jobRoles.includes(base)) {
      const now = Date.now();
      return this.jobList.some(
        (j) =>
          j.playerId === player.id &&
          j.jobId === base &&
          (qualifier == null || j.holdId === qualifier) &&
          (j.licenseExpiry == null || j.licenseExpiry > now)
      );
    }

    return false;
  }

  // ── Staff management ────────────────────────────────────────────────────────

  grantStaff(targetId: PlayerId, rank: StaffRank, grantedBy: PlayerId | 'console', notes?: string): StaffRecord {
    this.staffList = this.staffList.filter((s) => s.playerId !== targetId);
    const record: StaffRecord = { playerId: targetId, rank, grantedBy, grantedAt: Date.now(), notes };
    this.staffList.push(record);
    return record;
  }

  revokeStaff(targetId: PlayerId): boolean {
    const before = this.staffList.length;
    this.staffList = this.staffList.filter((s) => s.playerId !== targetId);
    return this.staffList.length < before;
  }

  getStaffRank(playerId: PlayerId): StaffRank | null {
    return this.staffList.find((s) => s.playerId === playerId)?.rank ?? null;
  }

  isStaff(playerId: PlayerId): boolean {
    return this.staffList.some((s) => s.playerId === playerId);
  }

  getAllStaff(): StaffRecord[] {
    return [...this.staffList];
  }

  // ── Government management ───────────────────────────────────────────────────

  appoint(
    targetId: PlayerId,
    role: GovernmentRole,
    holdId: HoldId,
    appointedBy: PlayerId | 'console',
    customTitle?: string
  ): GovernmentPosition {
    // Each hold can only have one of each role
    this.govtList = this.govtList.filter(
      (g) => !(g.holdId === holdId && g.role === role)
    );
    const pos: GovernmentPosition = {
      playerId: targetId,
      role,
      holdId,
      appointedBy,
      appointedAt: Date.now(),
      customTitle,
    };
    this.govtList.push(pos);
    return pos;
  }

  removeGovernmentRole(playerId: PlayerId, role: GovernmentRole, holdId: HoldId): boolean {
    const before = this.govtList.length;
    this.govtList = this.govtList.filter(
      (g) => !(g.playerId === playerId && g.role === role && g.holdId === holdId)
    );
    return this.govtList.length < before;
  }

  getGovernmentPositions(playerId?: PlayerId): GovernmentPosition[] {
    if (playerId == null) return [...this.govtList];
    return this.govtList.filter((g) => g.playerId === playerId);
  }

  getHoldGovernment(holdId: HoldId): GovernmentPosition[] {
    return this.govtList.filter((g) => g.holdId === holdId);
  }

  getJarl(holdId: HoldId): GovernmentPosition | null {
    return this.govtList.find((g) => g.holdId === holdId && g.role === 'jarl') ?? null;
  }

  // ── Job management ──────────────────────────────────────────────────────────

  assignJob(
    targetId: PlayerId,
    jobId: JobId,
    holdId: HoldId,
    assignedBy: PlayerId | 'system' | 'console',
    licenseExpiry: number | null = null
  ): JobAssignment {
    // One job per hold (same job can exist in different holds)
    this.jobList = this.jobList.filter(
      (j) => !(j.playerId === targetId && j.jobId === jobId && j.holdId === holdId)
    );
    const job: JobAssignment = { playerId: targetId, jobId, holdId, assignedBy, assignedAt: Date.now(), licenseExpiry };
    this.jobList.push(job);
    return job;
  }

  revokeJob(targetId: PlayerId, jobId: JobId, holdId: HoldId): boolean {
    const before = this.jobList.length;
    this.jobList = this.jobList.filter(
      (j) => !(j.playerId === targetId && j.jobId === jobId && j.holdId === holdId)
    );
    return this.jobList.length < before;
  }

  revokeAllJobs(targetId: PlayerId): number {
    const before = this.jobList.length;
    this.jobList = this.jobList.filter((j) => j.playerId !== targetId);
    return before - this.jobList.length;
  }

  getPlayerJobs(playerId: PlayerId): JobAssignment[] {
    const now = Date.now();
    return this.jobList.filter(
      (j) => j.playerId === playerId && (j.licenseExpiry == null || j.licenseExpiry > now)
    );
  }

  getJobHolders(jobId: JobId, holdId?: HoldId): JobAssignment[] {
    const now = Date.now();
    return this.jobList.filter(
      (j) =>
        j.jobId === jobId &&
        (holdId == null || j.holdId === holdId) &&
        (j.licenseExpiry == null || j.licenseExpiry > now)
    );
  }

  // ── Serialization (for WorldStore) ──────────────────────────────────────────

  serialize(): { staff: StaffRecord[]; govt: GovernmentPosition[]; jobs: JobAssignment[] } {
    return { staff: this.staffList, govt: this.govtList, jobs: this.jobList };
  }
}

export { KEY_STAFF, KEY_GOVT, KEY_JOBS };
