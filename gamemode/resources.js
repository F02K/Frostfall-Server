'use strict'

// ── Hold Resources ────────────────────────────────────────────────────────────
// 18 items across 9 holds, 2 per hold.
// FormIDs verified against skyrim-esm-references/*.json

const RESOURCES = [
  // Whiterun
  { baseId: 0x0004B0BA, name: 'Wheat',          holdId: 'whiterun',   source: 'farm' },    // Wheat          [ingredients] edid: Wheat
  { baseId: 0x00064B3F, name: 'Cabbage',         holdId: 'whiterun',   source: 'farm' },    // Cabbage         [potions]     edid: FoodCabbage
  // Eastmarch
  { baseId: 0x00071CF3, name: 'Iron Ore',        holdId: 'eastmarch',  source: 'mine' },    // Iron Ore        [misc]        edid: OreIron
  { baseId: 0x0005ACDB, name: 'Corundum Ore',    holdId: 'eastmarch',  source: 'mine' },    // Corundum Ore    [misc]        edid: OreCorundum
  // Rift
  { baseId: 0x00065C9F, name: 'Salmon',          holdId: 'rift',       source: 'fishery' }, // Salmon Meat     [potions]     edid: FoodSalmon
  { baseId: 0x0010394D, name: 'Honey',           holdId: 'rift',       source: 'apiary' },  // Honey           [potions]     edid: FoodHoney
  // Reach
  { baseId: 0x0005ACDF, name: 'Silver Ore',      holdId: 'reach',      source: 'mine' },    // Silver Ore      [misc]        edid: OreSilver
  { baseId: 0x0005ACDD, name: 'Orichalcum Ore',  holdId: 'reach',      source: 'mine' },    // Orichalcum Ore  [misc]        edid: OreOrichalcum
  // Haafingar
  { baseId: 0x000EBA03, name: 'Clam',            holdId: 'haafingar',  source: 'fishery' }, // Clam Meat       [potions]     edid: FoodClamMeat
  { baseId: 0x0005076E, name: 'Juniper Berries', holdId: 'haafingar',  source: 'farm' },    // Juniper Berries [ingredients] edid: JuniperBerries
  // Pale
  { baseId: 0x0005ACDC, name: 'Ebony Ore',       holdId: 'pale',       source: 'mine' },    // Ebony Ore       [misc]        edid: OreEbony
  { baseId: 0x0003AD6C, name: 'Mammoth Tusk',    holdId: 'pale',       source: 'hunt' },    // Mammoth Tusk    [misc]        edid: MammothTusk
  // Falkreath
  { baseId: 0x0006F993, name: 'Firewood',        holdId: 'falkreath',  source: 'lumber' },  // Firewood        [misc]        edid: Firewood01
  { baseId: 0x000669A2, name: 'Venison',         holdId: 'falkreath',  source: 'hunt' },    // Venison         [potions]     edid: FoodVenison
  // Hjaalmarch
  { baseId: 0x0006BC00, name: 'Mudcrab Chitin',  holdId: 'hjaalmarch', source: 'fishery' }, // Mudcrab Chitin  [ingredients] edid: MudcrabChitin
  { baseId: 0x000134AA, name: 'Thistle Branch',  holdId: 'hjaalmarch', source: 'farm' },    // Thistle Branch  [ingredients] edid: Thistle01
  // Winterhold
  { baseId: 0x0003AD5F, name: 'Frost Salts',     holdId: 'winterhold', source: 'gather' },  // Frost Salts     [ingredients] edid: FrostSalts
  { baseId: 0x0003AD60, name: 'Void Salts',      holdId: 'winterhold', source: 'gather' },  // Void Salts      [ingredients] edid: VoidSalts
]

function getHoldResources(holdId) {
  return RESOURCES.filter(r => r.holdId === holdId)
}

function getResourceHold(baseId) {
  const r = RESOURCES.find(r => r.baseId === baseId)
  return r ? r.holdId : null
}

function isHoldExclusive(baseId) {
  return RESOURCES.some(r => r.baseId === baseId)
}

module.exports = { RESOURCES, getHoldResources, getResourceHold, isHoldExclusive }
