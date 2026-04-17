// ============================================================
// Frostfall Roleplay — Shared Types
// All systems import from here. Never define domain types inline.
// ============================================================

export type PlayerId = number; // SkyMP userId (not actorId)
export type ActorId = number;  // SkyMP actorFormId

// -----------------------------------------------------------
// World geography
// -----------------------------------------------------------

export type HoldId =
  | 'whiterun'
  | 'eastmarch'
  | 'rift'
  | 'reach'
  | 'haafingar'
  | 'pale'
  | 'falkreath'
  | 'hjaalmarch'
  | 'winterhold';

export const ALL_HOLDS: HoldId[] = [
  'whiterun', 'eastmarch', 'rift', 'reach', 'haafingar',
  'pale', 'falkreath', 'hjaalmarch', 'winterhold',
];

/** Human-readable hold names */
export const HOLD_NAMES: Record<HoldId, string> = {
  whiterun: 'Whiterun',
  eastmarch: 'Eastmarch',
  rift: 'The Rift',
  reach: 'The Reach',
  haafingar: 'Haafingar',
  pale: 'The Pale',
  falkreath: 'Falkreath',
  hjaalmarch: 'Hjaalmarch',
  winterhold: 'Winterhold',
};

/** Capital city per hold */
export const HOLD_CAPITALS: Record<HoldId, string> = {
  whiterun: 'Whiterun',
  eastmarch: 'Windhelm',
  rift: 'Riften',
  reach: 'Markarth',
  haafingar: 'Solitude',
  pale: 'Dawnstar',
  falkreath: 'Falkreath',
  hjaalmarch: 'Morthal',
  winterhold: 'Winterhold',
};

// -----------------------------------------------------------
// Factions — Lore + Non-Lore
// -----------------------------------------------------------

/** Lore-accurate factions */
export type LoreFactionId =
  | 'imperialGarrison'
  | 'fourthLegionAuxiliary'
  | 'thalmor'
  | 'companions'
  | 'collegeOfWinterhold'
  | 'thievesGuild'
  | 'darkBrotherhood'
  | 'bardsCollege'
  | 'vigilants'
  | 'forsworn'
  | 'stormcloakUnderground'
  | 'eastEmpireCompany'
  | 'confederationOfTemples'
  | 'silverHand'
  | 'dawnguard'
  | 'volkihar';

/** Non-lore (community / server-original) factions */
export type CustomFactionId =
  | 'blackRavenTraders'      // Merchant guild, trade routes
  | 'penitentOrder'          // Religious ascetics
  | 'wanderingBards'         // Traveling entertainers
  | 'archaeologistsSociety'  // Ruin explorers, scholars
  | 'silverMercenaries'      // Neutral sell-swords
  | 'harborWatchmen'         // Port/harbor militia (Solitude)
  | 'mineOwners'             // Mining guild
  | 'huntingCo'              // Hunting & fur trading
  | 'alchemistsLeague';      // Potion brewers guild

export type FactionId = LoreFactionId | CustomFactionId;

export interface FactionMembership {
  factionId: FactionId;
  rank: number;       // 0 = initiate/lowest, higher = senior
  joinedAt: number;   // Unix ms
}

export interface FactionDocument {
  factionId: FactionId;
  benefits: string;
  burdens: string;
  bylaws: string;
  updatedAt: number;
  updatedBy: PlayerId | 'console';
}

// -----------------------------------------------------------
// Inventory (matches SkyMP's built-in inventory property)
// -----------------------------------------------------------

export interface InventoryEntry {
  baseId: number;
  count: number;
  health?: number;
  enchantmentId?: number;
  name?: string;
  worn?: boolean;
  wornLeft?: boolean;
}

export interface Inventory {
  entries: InventoryEntry[];
}

/** Skyrim form ID for gold (Septims) */
export const GOLD_BASE_ID = 0x0000000f;

// -----------------------------------------------------------
// Player state
// -----------------------------------------------------------

export type PropertyType = 'home' | 'business';
export type PropertyId = string;

export interface PlayerState {
  id: PlayerId;
  actorId: ActorId;
  name: string;
  holdId: HoldId | null;
  factions: FactionId[];
  /** Bounty per hold. Missing key = 0 septims. */
  bounty: Partial<Record<HoldId, number>>;
  isDown: boolean;
  isCaptive: boolean;
  downedAt: number | null;
  captiveAt: number | null;
  properties: PropertyId[];
  hungerLevel: number;
  drunkLevel: number;
  septims: number;
  stipendPaidHours: number;
  minutesOnline: number;
}

// -----------------------------------------------------------
// Properties (housing)
// -----------------------------------------------------------

export interface Property {
  id: PropertyId;
  holdId: HoldId;
  ownerId: PlayerId | null;
  type: PropertyType;
  /** Monthly rent in septims (0 = owned outright, no rent) */
  rentPerDay: number;
  lastRentPaidAt: number | null;
  pendingRequestBy: PlayerId | null;
  pendingRequestAt: number | null;
}

// -----------------------------------------------------------
// Economy
// -----------------------------------------------------------

/** Hold treasury — controlled by Jarl */
export interface HoldTreasury {
  holdId: HoldId;
  septims: number;
  /** 0–100 — percent of income sent to treasury on each transaction */
  taxRate: number;
  /** 0–100 — flat daily septim fee for licensed businesses */
  businessTaxRate: number;
  lastCollectedAt: number;
}

// -----------------------------------------------------------
// Market / Commerce
// -----------------------------------------------------------

export interface MarketStall {
  id: string;
  holdId: HoldId;
  name: string;
  description: string;
  /** Current occupying merchant (null = available for rent) */
  merchantId: PlayerId | null;
  /** Daily rent cost for this stall */
  rentPerDay: number;
  /** When the current merchant last paid rent */
  lastRentPaidAt: number | null;
}

export interface ShopListing {
  id: string;
  stallId: string;
  merchantId: PlayerId;
  holdId: HoldId;
  baseId: number;
  count: number;
  pricePerUnit: number;
  listedAt: number;
}

// -----------------------------------------------------------
// Trade
// -----------------------------------------------------------

export type TradeStatus = 'pending' | 'active' | 'confirmed_initiator' | 'confirmed_both' | 'completed' | 'cancelled';

export interface TradeOffer {
  items: { baseId: number; count: number }[];
  septims: number;
}

export interface TradeSession {
  id: string;
  initiatorId: PlayerId;
  responderId: PlayerId;
  initiatorOffer: TradeOffer;
  responderOffer: TradeOffer;
  initiatorConfirmed: boolean;
  responderConfirmed: boolean;
  status: TradeStatus;
  createdAt: number;
  expiresAt: number;
}

// -----------------------------------------------------------
// Audit log
// -----------------------------------------------------------

export interface AuditEntry {
  id: string;
  action: string;
  actorId: PlayerId | 'system' | 'console';
  targetId?: PlayerId;
  details: Record<string, unknown>;
  timestamp: number;
}

// -----------------------------------------------------------
// Chat
// -----------------------------------------------------------

export type ChatChannel =
  | 'ic'       // In-character (local range)
  | 'ooc'      // Out-of-character (global)
  | 'faction'  // Faction members only
  | 'hold'     // Hold-wide IC
  | 'staff'    // Staff only
  | 'pm';      // Private message

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderId: PlayerId;
  senderName: string;
  content: string;
  timestamp: number;
  targetId?: PlayerId;          // for pm
  factionId?: FactionId;        // for faction channel
  holdId?: HoldId;              // for hold channel
}

// -----------------------------------------------------------
// Internal event bus — extended types
// -----------------------------------------------------------

export type GameEventType =
  // Core player lifecycle
  | 'playerJoined'
  | 'playerLeft'
  // Combat
  | 'playerDowned'
  | 'playerRisen'
  | 'playerCaptured'
  | 'playerReleased'
  | 'playerArrested'
  | 'playerSentenced'
  // Social
  | 'factionJoined'
  | 'factionLeft'
  // Education
  | 'lectureStarted'
  | 'lectureEnded'
  // Economy — existing
  | 'bountyChanged'
  | 'propertyRequested'
  | 'propertyApproved'
  | 'hungerTick'
  | 'drunkChanged'
  | 'stipendTick'
  // Economy — new
  | 'goldTransferred'
  | 'taxCollected'
  | 'rentCollected'
  | 'rentOverdue'
  | 'stallRented'
  | 'stallVacated'
  | 'shopPurchased'
  | 'listingAdded'
  | 'listingRemoved'
  // Trade
  | 'tradeInitiated'
  | 'tradeCompleted'
  | 'tradeCancelled'
  // Governance
  | 'jarlAppointed'
  | 'jarlRemoved'
  | 'positionAppointed'
  | 'positionRemoved'
  | 'treasuryChanged'
  // Jobs
  | 'jobAssigned'
  | 'jobRevoked'
  // Admin
  | 'staffAction'
  | 'playerBanned'
  | 'playerKicked'
  // Chat
  | 'chatMessage';

export interface GameEvent<T = unknown> {
  type: GameEventType;
  payload: T;
  timestamp: number;
}

// ── Payload shapes ────────────────────────────────────────────────────────────

export interface PlayerJoinedPayload  { playerId: PlayerId; actorId: ActorId; name: string; }
export interface PlayerLeftPayload    { playerId: PlayerId; }
export interface PlayerDownedPayload  { victimId: PlayerId; attackerId: PlayerId; holdId: HoldId; }
export interface BountyChangedPayload { playerId: PlayerId; holdId: HoldId; amount: number; previousAmount: number; }
export interface PropertyRequestedPayload { playerId: PlayerId; propertyId: PropertyId; }
export interface PropertyApprovedPayload  { propertyId: PropertyId; newOwnerId: PlayerId; approvedBy: PlayerId; }
export interface GoldTransferredPayload   { fromId: PlayerId; toId: PlayerId; amount: number; reason?: string; }
export interface TaxCollectedPayload      { holdId: HoldId; amount: number; fromId: PlayerId; }
export interface RentCollectedPayload     { propertyId: PropertyId; fromId: PlayerId; amount: number; }
export interface TradeCompletedPayload    { tradeId: string; initiatorId: PlayerId; responderId: PlayerId; }
export interface JarlAppointedPayload     { playerId: PlayerId; holdId: HoldId; appointedBy: PlayerId | 'console'; }
export interface JobAssignedPayload       { playerId: PlayerId; jobId: string; holdId: HoldId; }
export interface ShopPurchasedPayload     { listingId: string; buyerId: PlayerId; sellerId: PlayerId; count: number; totalPrice: number; }
export interface ChatMessagePayload       { message: ChatMessage; }
