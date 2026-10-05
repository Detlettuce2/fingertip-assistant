const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../resource-core.js');
const data = require('../api/resources.json');
const catalogs = require('../api/catalogs.json');

function isolated(overrides = {}) {
  return {...C.normalize(data), buildings: data.buildings.map(() => ({level: 0, percent: 60})),
    freeQuick: false, dailyGift: false, gold: 'off', ...overrides};
}
const amount = (result, id) => result.totals.find(item => item.id === id)?.income || 0;

test('VIP0–20 use the published portal, storage, gold and sweep thresholds', () => {
  assert.deepEqual(data.vip_levels.map(row => row.portal_gold_percent), [0,0,0,0,0,0,10,20,25,30,35,40,50,60,70,80,90,100,110,120,130]);
  assert.deepEqual(data.vip_levels.map(row => row.portal_experience_percent), data.vip_levels.map(row => row.portal_gold_percent));
  assert(data.vip_levels.every(row => row.quick_paid_count === 3));
  assert.equal(data.vip_levels[0].portal_storage_hours, 12);
  assert.equal(data.vip_levels[20].portal_storage_hours, 42);
  assert.equal(data.vip_levels[0].dungeon_paid['金币副本'], 1);
  assert.equal(data.vip_levels[1].dungeon_paid['金币副本'], 3);
  assert.equal(data.vip_levels[4].dungeon_paid['经验副本'], 1);
  assert.equal(data.vip_levels[5].dungeon_paid['经验副本'], 3);
  assert.equal(data.vip_levels[20].gold_percent, 150);
});

test('adventure progress changes only portal base production; resource 34 is 魔王币', () => {
  const settings = isolated({buildings: [{level: 1}, ...data.buildings.slice(1).map(() => ({level: 0}))]});
  let result = C.calculate(data, settings);
  assert.equal(amount(result, 2), 14400);
  assert.equal(amount(result, 3), 72000);
  assert.equal(amount(result, 4), 72000);
  result = C.calculate(data, {...settings, adventure: data.adventure.length - 1});
  assert.equal(amount(result, 2), 2045 * 1440);
  assert.equal(amount(result, 3), 2400 * 1440);
  assert.equal(amount(result, 4), 9150 * 1440);
  assert.equal(data.resources.find(resource => resource.id === 34).name, '魔王币');
});

test('production percentages add; VIP never boosts 魔王经验 or other buildings', () => {
  const settings = isolated({vip: 20, prosperity: 50, speed: true, lifetime: true, station: 'maximum',
    buildings: [{level: 1}, {level: 1}, ...data.buildings.slice(2).map(() => ({level: 0}))]});
  const result = C.calculate(data, settings);
  assert.equal(result.globalPercent, 160);
  assert.equal(amount(result, 2), 65664);
  assert.equal(amount(result, 3), 328320);
  assert.equal(amount(result, 4), 234720);
  assert.equal(amount(result, 1), 256.48); // Tower 156.48 + daily lifetime 100.
  const lower = C.calculate(data, {...settings, vip: 0});
  assert.equal(amount(lower, 4), amount(result, 4));
  assert.equal(amount(lower, 1), amount(result, 1));
});

test('quick production uses two hours for all built resource buildings and exact incremental costs', () => {
  const settings = isolated({freeQuick: true, quickPaid: 'all', buildings: [{level: 1}, ...data.buildings.slice(1).map(() => ({level: 0}))]});
  let result = C.calculate(data, settings);
  assert.deepEqual(result.quick, {free: 1, paid: 3, maxPaid: 3, hours: 8, cost: 350});
  assert.equal(amount(result, 2), 600 * 32);
  result = C.calculate(data, {...settings, speed: true});
  assert.deepEqual(result.quick, {free: 1, paid: 5, maxPaid: 5, hours: 12, cost: 950});
  assert.equal(amount(result, 2), 600 * 1.5 * 36);
  assert.equal(C.calculate(data, {...settings, quickPaid: 'custom', quickCount: 5}).quick.paid, 3);
  assert.equal(C.calculate(data, {...settings, quickPaid: 'none'}).stars.spent, 0);
});

test('collection frequency loses capped natural hours but keeps quick production', () => {
  const settings = isolated({collectHours: 24, freeQuick: true,
    buildings: [{level: 1}, {level: 1}, ...data.buildings.slice(2).map(() => ({level: 0}))]});
  const low = C.calculate(data, settings);
  assert.equal(low.buildings[0].naturalHours, 12);
  assert.equal(low.buildings[1].naturalHours, 12);
  assert.equal(amount(low, 1), 28);
  const high = C.calculate(data, {...settings, vip: 20});
  assert.equal(high.buildings[0].naturalHours, 24);
  assert.equal(high.buildings[1].naturalHours, 12);
  assert.equal(high.quick.hours, 2);
});

test('lifetime benefits add production, paid equipment attempts and gold attempts, not free attempts', () => {
  const settings = isolated({dungeons: [0, 0, 0, 60], dungeonPaid: true});
  const regular = C.calculate(data, settings), card = C.calculate(data, {...settings, lifetime: true});
  assert.equal(regular.dungeons[0].paid, 3);
  assert.equal(card.dungeons[0].paid, 4);
  assert.equal(card.dungeons[0].free, 2);
  assert.equal(regular.stars.spent, 100);
  assert.equal(card.stars.spent, 200);
  assert.equal(amount(card, 20110201), 628 * 6);
  assert.equal(amount(card, 30420120), 2 * 6);
});

test('highest recurring dungeon rewards exclude first-clear and random bonus loot', () => {
  const result = C.calculate(data, isolated({vip: 20, dungeonPaid: true, dungeons: [100,100,40,0]}));
  assert.equal(amount(result, 2), 2620000 * 5);
  assert.equal(amount(result, 3), 2600000 * 5);
  assert.equal(amount(result, 16), 1800 * 5);
  assert.equal(result.stars.spent, 300);
});

test('three gold refreshes include VIP boost and twelve paid lifetime gold attempts', () => {
  const result = C.calculate(data, isolated({vip: 20, lifetime: true, gold: 'all', kingLevel: 300, goldCycles: 3}));
  assert.equal(result.gold.count, 18); // 3 free + 3 silver + 12 gold.
  assert.equal(result.gold.cost, 660);
  assert.equal(amount(result, 2), (67000 + 133000 + 333000 * 4) * 3 * 2.5);
  assert.equal(result.stars.income, 100);
  assert.equal(result.stars.net, -560);
});

test('cards and claim-day rewards do not receive production multipliers', () => {
  const result = C.calculate(data, isolated({prosperity: 50, speed: true, lifetime: true, cards: [true,true,true], lifetimeClaim: true}));
  assert.equal(amount(result, 1), 900);
  assert.equal(amount(result, 20210100), 20);
  assert.equal(amount(C.calculate(data, isolated({lifetime: false, lifetimeClaim: true})), 20210100), 0);
  assert.equal(amount(C.calculate(data, isolated({lifetime: true})), 20210100), 0);
});

test('daily quick-production task requires three attempts before its reward is counted', () => {
  const result = C.calculate(data, isolated({tasks: true, freeQuick: true}));
  assert.equal(amount(result, 1), 40);
  assert.equal(result.activity, 160);
  assert.equal(amount(result, 20210100), 1);
  const completed = C.calculate(data, isolated({tasks: true, freeQuick: true, quickPaid: 'custom', quickCount: 2}));
  assert.equal(amount(completed, 1), 70);
  assert.equal(completed.activity, 180);
});

test('maximum stationing uses 27 distinct public characters and valid skill-level percentages', () => {
  const names = data.buildings.flatMap(building => building.stationed.map(hero => hero.name));
  assert.equal(names.length, 27); assert.equal(new Set(names).size, 27);
  const publicNames = new Set(catalogs.heroes.map(hero => hero.name));
  assert(names.every(name => publicNames.has(name)));
  assert.deepEqual(data.buildings.map(building => building.stationed.reduce((sum, hero) => sum + hero.percent, 0)), [66,66,67,65,64,65,64,66,64]);
  const result = C.calculate(data, C.maximum(data, {vip: 6}, false));
  assert.equal(result.settings.vip, 6);
  assert.equal(result.quick.paid, 0);
  assert.equal(result.buildings.length, 9);
  assert(result.buildings.every(building => building.naturalHours === 24));
});

test('VIP comparison stays within one scenario and reconciles every source against totals', () => {
  const settings = C.maximum(data, {vip: 20}, true);
  settings.extra = {1: 50, 2: 100000};
  const before = JSON.stringify(settings), rows = C.compare(data, settings);
  assert.equal(rows.length, 21);
  assert.equal(JSON.stringify(settings), before);
  assert(rows.every(row => row.quick.cost === 950));
  assert.equal(amount(rows[0], 34), amount(rows[20], 34));
  assert(amount(rows[20], 2) > amount(rows[0], 2));
  for (const row of rows) for (const item of row.totals) {
    const income = row.sources.reduce((sum, source) => sum + source.materials.filter(value => value.id === item.id).reduce((sum, value) => sum + value.count, 0), 0);
    const spent = row.sources.reduce((sum, source) => sum + source.costs.filter(value => value.id === item.id).reduce((sum, value) => sum + value.count, 0), 0);
    assert(Math.abs(item.income - income) < 0.00001);
    assert(Math.abs(item.net - (income - spent)) < 0.00001);
  }
});

test('invalid saved settings are bounded and unknown resource fields cannot enter totals', () => {
  const settings = C.normalize(data, {vip: Infinity, adventure: 99999, prosperity: -1, kingLevel: 99999,
    speed: 'false', station: 'unknown', buildings: [{level: -2, percent: NaN}],
    dungeons: [999, -1, NaN, 60], extra: {'secret': 999, 1: -10, 2: 1e20}});
  assert.equal(settings.vip, 0); assert.equal(settings.adventure, 1484);
  assert.equal(settings.prosperity, 0); assert.equal(settings.kingLevel, 300);
  assert.equal(settings.speed, false); assert.equal(settings.station, 'none');
  assert.equal(settings.buildings[0].level, 0);
  assert.deepEqual(settings.dungeons, [100,0,0,60]);
  assert.deepEqual(settings.extra, {2: 1e12});
  assert.doesNotThrow(() => C.calculate(data, settings));
  assert.doesNotThrow(() => C.normalize(data, null));
});

test('CSV contains all 21 VIPs, every public resource and scenario information', () => {
  const csv = C.csv(data, C.maximum(data, {vip: 20}, true));
  assert.equal(csv.charCodeAt(0), 65279);
  const rows = csv.trimEnd().split('\r\n');
  assert.equal(rows.length, 23);
  assert(rows[0].includes(data.updated_on));
  assert(rows[1].includes('魔王币') && rows[1].includes('魔石原矿'));
  assert(rows[2].startsWith('"0"')); assert(rows[22].startsWith('"20"'));
});
