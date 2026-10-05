(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResourceStationing = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // A matching is an upper bound until a team's teammate bonuses are satisfied.
  // Branch only on an unsatisfied team's leader count to obtain an exact result.
  function match(weights, forbidden) {
    const rows = weights.length, columns = weights[0]?.length || 0;
    if (!rows) return [];
    const u = Array(rows + 1).fill(0n), v = Array(columns + 1).fill(0n);
    const p = Array(columns + 1).fill(0), way = Array(columns + 1).fill(0);
    const infinity = -forbidden * BigInt(rows + columns + 10);
    for (let i = 1; i <= rows; i++) {
      p[0] = i;
      let j0 = 0;
      const min = Array(columns + 1).fill(infinity), used = Array(columns + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = infinity, j1 = 0;
        for (let j = 1; j <= columns; j++) if (!used[j]) {
          const current = -weights[i0 - 1][j - 1] - u[i0] - v[j];
          if (current < min[j]) {min[j] = current; way[j] = j0;}
          if (min[j] < delta) {delta = min[j]; j1 = j;}
        }
        for (let j = 0; j <= columns; j++) {
          if (used[j]) {u[p[j]] += delta; v[j] -= delta;}
          else min[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do {const j1 = way[j0]; p[j0] = p[j1]; j0 = j1;} while (j0);
    }
    const result = Array(rows);
    for (let j = 1; j <= columns; j++) if (p[j]) result[p[j] - 1] = j - 1;
    return result.some((column, row) => weights[row][column] === forbidden) ? null : result;
  }

  function contributions(team) {
    const bonus = team.reduce((sum, hero) => sum + hero.teammate_skill_bonus, 0);
    return team.map(hero => ({name: hero.name,
      percent: Math.min(20, hero.skill_percent + bonus - hero.teammate_skill_bonus) + hero.production_percent,
      storage_percent: hero.storage_percent}));
  }

  function optimize(heroes, buildings, ownedNames, preferred = {}) {
    const owned = new Set(ownedNames), pool = heroes.filter(hero => owned.has(hero.name));
    const ranks = buildings.map((_, i) => 100n ** BigInt(buildings.length - i - 1));
    const rows = buildings.length * 3, tieScale = BigInt(rows * 10000 + 1);
    const forbidden = -(100n ** BigInt(buildings.length + 4)) * tieScale;
    let best = {value: -1n, teams: buildings.map(() => [])}, nodes = 0;

    function bound(fixed) {
      nodes++;
      const weights = [], points = [];
      buildings.forEach((building, group) => {
        for (let seat = 0; seat < 3; seat++) {
          const leaderSeat = fixed[group] !== null && seat < fixed[group];
          const candidates = pool.map((hero, column) => {
            if (!hero.buildings.includes(building) || (fixed[group] !== null && Boolean(hero.teammate_skill_bonus) !== leaderSeat)) return null;
            const allied = fixed[group] === null ? 2 : fixed[group] - Number(leaderSeat);
            const percent = Math.min(20, hero.skill_percent + allied) + hero.production_percent;
            const preference = (preferred[building] || []).includes(hero.name) ? 5000 : 0;
            return {percent, weight: BigInt(percent) * ranks[group] * tieScale + BigInt(1000 + preference + pool.length - column)};
          });
          for (let empty = 0; empty < rows; empty++) candidates.push(leaderSeat ? null : {percent: 0, weight: 0n});
          points.push(candidates.map(item => item?.percent || 0));
          weights.push(candidates.map(item => item?.weight ?? forbidden));
        }
      });
      const assignment = match(weights, forbidden);
      if (!assignment) return null;
      const teams = buildings.map(() => []), upper = buildings.map(() => 0);
      assignment.forEach((column, row) => {
        const group = Math.floor(row / 3);
        upper[group] += points[row][column];
        if (column < pool.length) teams[group].push(pool[column]);
      });
      const actual = teams.map((team, i) => contributions(team).sort((a, b) => {
        const preferredNames = preferred[buildings[i]] || [];
        const rank = name => preferredNames.includes(name) ? preferredNames.indexOf(name) : heroes.length + heroes.findIndex(hero => hero.name === name);
        return rank(a.name) - rank(b.name);
      }));
      const score = values => values.reduce((sum, value, i) => sum + BigInt(value) * ranks[i], 0n);
      const lower = actual.map(team => team.reduce((sum, hero) => sum + hero.percent, 0));
      const value = score(lower), ceiling = score(upper);
      if (value > best.value) best = {value, teams: actual};
      return {fixed, upper, lower, ceiling, value};
    }

    function visit(node) {
      if (!node || node.ceiling <= best.value || node.value === node.ceiling) return;
      const group = node.upper.findIndex((score, i) => score !== node.lower[i]);
      if (group < 0 || node.fixed[group] !== null) throw new Error('Invalid stationing bound');
      const leaderCount = pool.filter(hero => hero.teammate_skill_bonus && hero.buildings.includes(buildings[group])).length;
      const next = [];
      for (let count = 0; count <= Math.min(3, leaderCount); count++) {
        const fixed = node.fixed.slice(); fixed[group] = count;
        const candidate = bound(fixed);
        if (candidate) next.push(candidate);
      }
      next.sort((a, b) => a.ceiling > b.ceiling ? -1 : a.ceiling < b.ceiling ? 1 : 0);
      for (const candidate of next) visit(candidate);
    }
    visit(bound(buildings.map(() => null)));
    return {buildings: buildings.map((name, i) => ({name, team: best.teams[i], percent: best.teams[i].reduce((sum, hero) => sum + hero.percent, 0)})), nodes};
  }

  return {optimize, contributions};
});
