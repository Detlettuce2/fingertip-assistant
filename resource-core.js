(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResourceCalculator = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const number = (value, fallback, min, max) => {
    const n = value === '' || value === null || typeof value === 'boolean' ? NaN : Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const integer = (value, fallback, min, max) => Math.floor(number(value, fallback, min, max));
  const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
  const enabled = (value, fallback = false) => value === undefined ? fallback : value === true;
  const rounded = value => Math.round(value * 1e6) / 1e6;
  const priority = ['传送阵', '远古遗迹', '星辰之塔', '冒险者公会', '空港'];
  const order = [1, 2, 3, 20110401, 30450301, 30450302, 5, 1005001, 4, 20210100, 16, 34];

  function resources(data, input = {}) {
    return data.resources.filter(resource => input?.scope === 'all' || resource.id !== 34);
  }

  function buildingIndices(data, input = {}) {
    const rank = name => priority.includes(name) ? priority.indexOf(name) : priority.length;
    return data.buildings.map((_, i) => i)
      .filter(i => input?.scope === 'all' || data.buildings[i].levels.some(level => level.per_hour.some(item => item.id !== 34)))
      .sort((a, b) => rank(data.buildings[a].name) - rank(data.buildings[b].name));
  }

  function normalize(data, input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    const scope = choice(input.scope, ['highBattle', 'all'], 'highBattle');
    const buildings = data.buildings.map((building, i) => ({
      level: integer(input.buildings?.[i]?.level, 1, 0, building.levels.length),
      percent: number(input.buildings?.[i]?.percent, 60, -100, 1000),
    }));
    const extra = {};
    for (const resource of resources(data, {scope})) {
      const count = number(input.extra?.[resource.id], 0, 0, 1e12);
      if (count > 0) extra[resource.id] = count;
    }
    return {
      scope,
      vip: integer(input.vip, 0, 0, data.vip_levels.length - 1),
      adventure: integer(input.adventure, 0, 0, data.adventure.length - 1),
      prosperity: integer(input.prosperity, 0, 0, data.prosperity_max_level),
      collectHours: choice(Number(input.collectHours), [1, 4, 8, 12, 24], 12),
      station: choice(input.station, ['none', 'skills', 'maximum', 'custom'], 'none'),
      speed: enabled(input.speed), lifetime: enabled(input.lifetime), lifetimeClaim: enabled(input.lifetimeClaim),
      cards: data.cards.slice(1).map((_, i) => enabled(input.cards?.[i])),
      freeQuick: enabled(input.freeQuick, true), quickPaid: choice(input.quickPaid, ['none', 'all', 'custom'], 'none'),
      quickCount: integer(input.quickCount, 0, 0, data.quick.paid_costs.length),
      dungeons: data.dungeons.map((dungeon, i) => scope === 'highBattle' && !['金币副本', '经验副本'].includes(dungeon.name)
        ? 0 : integer(input.dungeons?.[i], 0, 0, dungeon.levels.length)),
      dungeonPaid: enabled(input.dungeonPaid),
      gold: choice(input.gold, ['off', 'free', 'normal', 'all'], 'free'),
      goldCycles: integer(input.goldCycles, 3, 1, 24 / data.gold.refresh_hours),
      kingLevel: integer(input.kingLevel, 1, 1, data.gold.levels.length),
      dailyGift: enabled(input.dailyGift, true), tasks: enabled(input.tasks),
      buildings, extra,
    };
  }

  function maximum(data, input = {}, paid = false) {
    return normalize(data, {
      ...normalize(data, input), scope: 'highBattle', adventure: data.adventure.length - 1,
      prosperity: data.prosperity_max_level, collectHours: 12, station: 'maximum',
      speed: true, lifetime: true, freeQuick: true, quickPaid: paid ? 'all' : 'none',
      dungeonPaid: paid, gold: paid ? 'all' : 'free', goldCycles: 3,
      kingLevel: data.gold.levels.length, dailyGift: true,
      buildings: data.buildings.map(building => ({level: building.levels.length, percent: 60})),
      dungeons: data.dungeons.map(dungeon => dungeon.levels.length),
    });
  }

  function calculate(data, input = {}) {
    const settings = normalize(data, input);
    const vip = data.vip_levels[settings.vip];
    const lifetime = data.cards[0];
    const globalPercent = settings.prosperity * data.prosperity_percent_per_level
      + (settings.speed ? data.speed.production_percent : 0)
      + (settings.lifetime ? lifetime.production_percent : 0);
    const maxPaid = Math.min(data.quick.paid_costs.length, vip.quick_paid_count + (settings.speed ? data.speed.quick_paid_count : 0));
    const paidCount = settings.quickPaid === 'all' ? maxPaid
      : settings.quickPaid === 'custom' ? Math.min(settings.quickCount, maxPaid) : 0;
    const freeCount = settings.freeQuick ? data.quick.free_count : 0;
    const quickHours = (freeCount + paidCount) * data.quick.hours;
    const quickCost = data.quick.paid_costs.slice(0, paidCount).reduce((sum, cost) => sum + cost, 0);
    const sources = [], buildings = [], dungeons = [];
    const addSource = (name, materials, costs = [], kind = 'daily') => {
      const items = materials.filter(item => item.count > 0 && (settings.scope === 'all' || item.id !== 34))
        .map(item => ({id: item.id, count: rounded(item.count)}));
      if (items.length || costs.length) sources.push({name, kind, materials: items, costs});
    };

    buildingIndices(data, settings).forEach(i => {
      const building = data.buildings[i];
      const option = settings.buildings[i];
      if (!option.level) return;
      const level = building.levels[option.level - 1];
      const isPortal = building.name === '传送阵';
      const team = settings.station === 'maximum' ? building.stationed : [];
      const stationPercent = settings.station === 'maximum' ? team.reduce((sum, hero) => sum + hero.percent, 0)
        : settings.station === 'skills' ? 60 : settings.station === 'custom' ? option.percent : 0;
      const storagePercent = team.reduce((sum, hero) => sum + hero.storage_percent, 0);
      const storageHours = (isPortal ? vip.portal_storage_hours : level.storage_hours) * (1 + storagePercent / 100);
      const naturalHours = 24 * Math.min(storageHours, settings.collectHours) / settings.collectHours;
      const hourlyBase = isPortal ? data.adventure[settings.adventure].per_minute.map(item => ({id: item.id, count: item.count * 60})) : level.per_hour;
      const hourly = hourlyBase.filter(item => settings.scope === 'all' || item.id !== 34).map(item => {
        const vipPercent = isPortal ? (item.id === 2 ? vip.portal_gold_percent : item.id === 3 ? vip.portal_experience_percent : 0) : 0;
        return {id: item.id, count: Math.max(0, item.count * (1 + (globalPercent + stationPercent + vipPercent) / 100))};
      });
      const natural = hourly.map(item => ({id: item.id, count: item.count * naturalHours}));
      const quick = hourly.map(item => ({id: item.id, count: item.count * quickHours}));
      addSource(building.name + ' · 自然生产', natural, [], 'production');
      addSource(building.name + ' · 快速生产', quick, [], 'quick');
      buildings.push({name: building.name, level: option.level, skill: building.skill, stationPercent, team,
        storageHours, naturalHours, lostHours: 24 - naturalHours, hourly, natural, quick});
    });
    if (quickCost) addSource('快速生产 · 星钻支出', [], [{id: 1, count: quickCost}], 'cost');

    data.dungeons.forEach((dungeon, i) => {
      const level = settings.dungeons[i];
      if (!level) return;
      const maxPaid = (vip.dungeon_paid[dungeon.name] ?? dungeon.paid_count)
        + (settings.lifetime && dungeon.name === '装备试炼' ? lifetime.extra_equipment_count : 0);
      const paid = settings.dungeonPaid ? maxPaid : 0;
      const cost = dungeon.paid_costs.slice(0, paid).reduce((sum, cost) => sum + cost, 0);
      const count = dungeon.free_count + paid;
      const materials = dungeon.levels[level - 1].materials.map(item => ({id: item.id, count: item.count * count}));
      addSource(dungeon.name + ' · 第' + level + '关', materials, cost ? [{id: 1, count: cost}] : []);
      dungeons.push({name: dungeon.name, level, free: dungeon.free_count, paid, maxPaid, cost, materials});
    });

    let goldCount = 0, goldCost = 0;
    if (settings.gold !== 'off') {
      const level = data.gold.levels[settings.kingLevel - 1];
      const counts = [data.gold.free_count, settings.gold === 'normal' || settings.gold === 'all' ? data.gold.paid_counts[0] : 0,
        settings.gold === 'all' ? data.gold.paid_counts[1] + (settings.lifetime ? lifetime.extra_gold_count : 0) : 0];
      goldCount = counts.reduce((sum, count) => sum + count, 0) * settings.goldCycles;
      goldCost = (counts[1] * data.gold.paid_costs[0] + counts[2] * data.gold.paid_costs[1]) * settings.goldCycles;
      const total = counts.reduce((sum, count, i) => sum + count * level.counts[i], 0) * settings.goldCycles * (1 + vip.gold_percent / 100);
      addSource('点钻成金 · ' + settings.goldCycles + '轮', [{id: 2, count: total}], goldCost ? [{id: 1, count: goldCost}] : []);
    }

    if (settings.dailyGift) addSource('每日福利礼包', data.daily_gift);
    if (settings.lifetime) {
      addSource('终身卡 · 每日领取', lifetime.daily);
      if (settings.lifetimeClaim) addSource('终身卡 · 当日招募赠礼', lifetime.claim_bonus, [], 'claim');
    }
    data.cards.slice(1).forEach((card, i) => {if (settings.cards[i]) addSource(card.name + ' · 每日领取', card.daily);});
    let activity = 0;
    if (settings.tasks) {
      const materials = new Map();
      for (const task of data.tasks) {
        if (task.quick_required && freeCount + paidCount < task.quick_required) continue;
        activity += task.activity;
        for (const item of task.materials) materials.set(item.id, (materials.get(item.id) || 0) + item.count);
      }
      const boxes = Math.floor(activity / data.task_box.activity);
      for (const item of data.task_box.materials) materials.set(item.id, (materials.get(item.id) || 0) + item.count * boxes);
      addSource('每日任务 · 已勾选完成', [...materials].map(([id, count]) => ({id, count})));
    }
    addSource('其他每日收益 · 手动补充', Object.entries(settings.extra).map(([id, count]) => ({id: Number(id), count})), [], 'custom');
    const income = new Map(), spending = new Map();
    for (const source of sources) {
      for (const item of source.materials) income.set(item.id, (income.get(item.id) || 0) + item.count);
      for (const item of source.costs) spending.set(item.id, (spending.get(item.id) || 0) + item.count);
    }
    const totals = resources(data, settings).filter(resource => income.has(resource.id) || spending.has(resource.id)).map(resource => ({
      ...resource, income: rounded(income.get(resource.id) || 0), spent: rounded(spending.get(resource.id) || 0),
      net: rounded((income.get(resource.id) || 0) - (spending.get(resource.id) || 0)),
    })).sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 100 + a.id) - (order.includes(b.id) ? order.indexOf(b.id) : 100 + b.id));
    return {settings, vip, globalPercent, buildings, dungeons, sources, totals, activity,
      quick: {free: freeCount, paid: paidCount, maxPaid, hours: quickHours, cost: quickCost},
      gold: {count: goldCount, cycles: settings.gold === 'off' ? 0 : settings.goldCycles, cost: goldCost},
      stars: {income: rounded(income.get(1) || 0), spent: rounded(spending.get(1) || 0), net: rounded((income.get(1) || 0) - (spending.get(1) || 0))}};
  }

  function compare(data, settings) {
    return data.vip_levels.map(vip => calculate(data, {...settings, vip: vip.level}));
  }

  function csv(data, settings) {
    const s = normalize(data, settings);
    const included = resources(data, s).filter(resource => resource.id !== 1);
    const results = compare(data, settings);
    const names = ['VIP', '免费快速生产次数', '付费快速生产次数', '星钻收入', '星钻支出', '星钻净变化', ...included.map(r => r.name)];
    const rows = results.map(result => [result.vip.level, result.quick.free, result.quick.paid,
      result.stars.income, result.stars.spent, result.stars.net,
      ...included.map(resource => result.totals.find(item => item.id === resource.id)?.income || 0)]);
    const cell = value => '"' + String(value).replace(/"/g, '""') + '"';
    const yes = value => value ? '启用' : '关闭';
    const stationLabel = {none: '不进驻', skills: '三名满级技能', maximum: '重点建筑优先满配含天赋', custom: '自定义'};
    const quickLabel = {none: '仅免费', all: '用满付费次数', custom: '指定付费次数'};
    const goldLabel = {off: '不计入', free: '免费', normal: '免费及白银', all: '全部次数'};
    const conditions = ['条件', '资料日期 ' + data.updated_on,
      '统计口径 ' + (s.scope === 'highBattle' ? '高战收菜：金币/经验副本，忽略魔王币' : '全部资源'),
      ...(s.station === 'maximum' ? ['进驻优先顺序 ' + priority.join(' > ')] : []), data.adventure[s.adventure].label,
      '繁荣等级 ' + s.prosperity, '进驻 ' + stationLabel[s.station], '加速特权 ' + yes(s.speed), '终身卡 ' + yes(s.lifetime),
      '收取间隔 ' + s.collectHours + '小时', '快速生产 ' + quickLabel[s.quickPaid],
      '免费快速生产 ' + yes(s.freeQuick), '指定快产次数 ' + s.quickCount,
      '副本付费 ' + yes(s.dungeonPaid), '副本关卡 ' + s.dungeons.join('/'), '点金 ' + goldLabel[s.gold], '点金轮数 ' + s.goldCycles,
      '魔王等级 ' + s.kingLevel, '终身卡当日赠礼 ' + yes(s.lifetimeClaim),
      '已开通卡 ' + data.cards.slice(1).filter((_, i) => s.cards[i]).map(card => card.name).join('/'), '日常任务 ' + yes(s.tasks),
      '每日福利 ' + yes(s.dailyGift),
      '建筑等级 ' + s.buildings.map(b => b.level).join('/'),
      '自定义进驻 ' + s.buildings.map(b => b.percent).join('/'),
      '其他收入 ' + Object.entries(s.extra).map(([id, count]) => (data.resources.find(r => r.id === Number(id))?.name || id) + ':' + count).join('/')];
    return '\uFEFF' + [conditions, names, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  return {normalize, maximum, calculate, compare, csv, resources, buildingIndices, priority};
});
