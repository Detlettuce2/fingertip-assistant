const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../resource-stationing.js');
const C = require('../resource-core.js');
const data = require('../api/resources.json');
const rates = plan => plan.buildings.map(building => building.percent);

function brute(heroes, buildings) {
  let best = buildings.map(() => -Infinity);
  const better = (a, b) => {for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false;};
  function visit(group, available, scores) {
    if (group === buildings.length) {if (better(scores, best)) best = scores; return;}
    const eligible = available.filter(hero => hero.buildings.includes(buildings[group]));
    const teams = [[]];
    function pick(start, selected) {
      if (selected.length === 3) return;
      for (let i = start; i < eligible.length; i++) {
        const team = [...selected, eligible[i]]; teams.push(team); pick(i + 1, team);
      }
    }
    pick(0, []);
    for (const team of teams) visit(group + 1, available.filter(hero => !team.includes(hero)),
      [...scores, S.contributions(team).reduce((sum, hero) => sum + hero.percent, 0)]);
  }
  visit(0, heroes, []); return best;
}

test('exact assignment agrees with exhaustive search under scarce roles and teammate effects', () => {
  let seed = 19;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let scenario = 0; scenario < 30; scenario++) {
    const buildings = scenario % 2 ? ['A','B','C'] : ['C','A','B'];
    const heroes = Array.from({length: 6}, (_, i) => ({name: 'H' + i,
      buildings: buildings.filter(() => random() > .3), skill_percent: 17 + Math.floor(random() * 4),
      production_percent: Math.floor(random() * 5) - 2, teammate_skill_bonus: Number(random() > .65), storage_percent: 0}));
    const result = S.optimize(heroes, buildings, heroes.map(hero => hero.name));
    assert.deepEqual(rates(result), brute(heroes, buildings), 'scenario ' + scenario);
    const names = result.buildings.flatMap(building => building.team.map(hero => hero.name));
    assert.equal(new Set(names).size, names.length);
  }
});

test('reordering priorities can give the tower 67% and moves the shared hero exactly once', () => {
  const base = C.maximum(data), normal = C.stationing(data, base);
  assert.deepEqual(rates(normal), [67,67,66,64,66]);
  const preferredTower = {...base, priority: ['星辰之塔','传送阵','远古遗迹','冒险者公会','空港']};
  const plan = C.stationing(data, preferredTower);
  assert.deepEqual(plan.buildings.map(building => building.name), preferredTower.priority);
  assert.deepEqual(rates(plan), [67,66,67,64,66]);
  assert(plan.buildings[0].team.some(hero => hero.name === '蔷薇丝塔'));
  assert(!plan.buildings[1].team.some(hero => hero.name === '蔷薇丝塔'));
  assert(C.calculate(data, preferredTower).stars.income > C.calculate(data, base).stars.income);
});

test('missing heroes are replaced automatically and empty or partial rosters never fabricate roles', () => {
  const base = C.maximum(data);
  const ownedHeroes = base.ownedHeroes.filter(name => name !== '蔷薇丝塔');
  const result = C.stationing(data, {...base, ownedHeroes});
  assert.equal(result.buildings[0].percent, 66);
  assert(result.buildings.every(building => building.team.every(hero => ownedHeroes.includes(hero.name))));
  assert(C.stationing(data, {...base, ownedHeroes: []}).buildings.every(building => building.percent === 0 && !building.team.length));
  const partial = C.stationing(data, {...base, ownedHeroes: ['蔷薇丝塔','雅典娜']});
  assert.equal(partial.buildings[0].percent, 45);
  assert.equal(partial.buildings.flatMap(building => building.team).length, 2);
});

test('unbuilt buildings release heroes and saved order and ownership are bounded', () => {
  const base = C.maximum(data);
  base.buildings[0].level = 0;
  const plan = C.stationing(data, base);
  assert(!plan.buildings.some(building => building.name === '传送阵'));
  assert.equal(plan.buildings.find(building => building.name === '星辰之塔').percent, 67);
  const settings = C.normalize(data, {priority: ['空港','空港','secret'], ownedHeroes: ['蔷薇丝塔','private-id','蔷薇丝塔']});
  assert.equal(settings.priority.length, 9); assert.equal(settings.priority[0], '空港');
  assert.equal(new Set(settings.priority).size, 9);
  assert.deepEqual(settings.ownedHeroes, ['蔷薇丝塔']);
  assert.equal(C.normalize(data, {ownedHeroes: 'broken', priority: null}).ownedHeroes.length, 87);
});
