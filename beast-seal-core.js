/* Pure simulation model; shared by the browser and node:test. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeastSeal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const LIMIT = 10000;
  const STORAGE_KEY = "fingertip.beast-seal.v1";
  const SPECS = {
    6: {name: "雷霆虎", color: "红色", icon: "310105010", weights: {general: 36, exclusive: 64}, raw: "通用 0.36%；专属 0.64%"},
    7: {name: "圣角兽", color: "彩色", icon: "310106010", weights: {generalRare: 0.34, general: 35.50, exclusiveRare: 2.72, exclusive: 61.44}, raw: "通用稀有 0.0034%；通用 0.3550%；专属稀有 0.0272%；专属 0.6144%"},
    8: {name: "焚焰凤", color: "幻彩", icon: "310107010", weights: {generalRare: 0.25, general: 40.57, exclusiveRare: 2.05, exclusive: 57.13}, raw: "通用稀有 0.0025%；通用 0.4057%；专属稀有 0.0205%；专属 0.5713%"},
  };
  const LABELS = {generalRare: "通用稀有", general: "通用", exclusiveRare: "专属稀有", exclusive: "专属"};
  function qualityCheck(quality) {
    if (!Number.isInteger(quality) || !Object.hasOwn(SPECS, quality)) throw new Error("请选择可洗炼的兽印品质。");
  }
  function pool(config, quality) {
    qualityCheck(quality);
    return Object.values(config["6"]).filter(skill => skill.c2o3lor === Number(quality));
  }
  function category(skill, quality) {
    const group = skill.skill_type < 1000 ? "general" : "exclusive";
    return Number(quality) >= 7 && skill.r2a3re === 1 ? group + "Rare" : group;
  }
  function validateWeights(quality, weights) {
    qualityCheck(quality);
    const keys = Object.keys(SPECS[quality].weights);
    if (!weights || Object.keys(weights).length !== keys.length || keys.some(key => !Number.isFinite(weights[key]) || weights[key] < 0 || weights[key] > 100)) {
      throw new Error("每项权重请输入 0 到 100 之间的数字。");
    }
    const total = keys.reduce((sum, key) => sum + weights[key], 0);
    if (total <= 0) throw new Error("至少有一项权重必须大于 0。");
    return total;
  }
  function cost(config, quality) {
    qualityCheck(quality);
    const match = /^\{250210501,(\d+)\}$/.exec(config["2"][quality].wash_cost);
    if (!match) throw new Error("兽印消耗配置不完整。");
    return Number(match[1]);
  }
  function distribution(config, quality, weights = SPECS[quality].weights) {
    const total = validateWeights(quality, weights);
    const skills = pool(config, quality);
    return Object.entries(weights).map(([key, weight]) => {
      const entries = skills.filter(skill => category(skill, quality) === key);
      if (!entries.length && weight > 0) throw new Error("所选分组没有可用词条。");
      return {key, weight, probability: weight / total, entries};
    });
  }
  function roll(config, quality, weights, random = Math.random) {
    const groups = distribution(config, quality, weights).filter(group => group.weight > 0);
    function unit() {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数须在 [0, 1) 内。");
      return value;
    }
    const draw = unit();
    let cumulative = 0;
    let chosen = groups[groups.length - 1];
    for (const group of groups) {
      cumulative += group.probability;
      if (draw < cumulative) { chosen = group; break; }
    }
    return chosen.entries[Math.floor(unit() * chosen.entries.length)];
  }
  function freshSession() {
    return {version: 1, quality: 8, draws: [], profiles: {}, weights: Object.fromEntries(Object.entries(SPECS).map(([quality, spec]) => [quality, {...spec.weights}])), locked: {6: false, 7: false, 8: false}, skip: false, stopOnRare: true, target: null};
  }
  function current(session, quality = session.quality) {
    return session.draws.findLast(draw => draw.quality === Number(quality)) || null;
  }
  function appendRoll(session, config, random = Math.random, now = Date.now()) {
    const quality = session.quality;
    if (session.locked[quality]) throw new Error("当前兽印已锁定，请先解锁。");
    if (session.draws.length >= LIMIT) throw new Error("本轮已达 10,000 次，请导出记录后开启新一轮。");
    const skill = roll(config, quality, session.weights[quality], random);
    const profile = quality + ":" + Object.keys(SPECS[quality].weights).map(key => session.weights[quality][key]).join(",");
    session.profiles[profile] = {quality, weights: {...session.weights[quality]}};
    const draw = {n: session.draws.length + 1, quality, skillId: skill.s2k3ill_id, cost: cost(config, quality), time: now, profile};
    session.draws.push(draw);
    return {draw, skill};
  }
  function stats(session, config) {
    let rare = 0, spent = 0, lastRare = 0;
    const byQuality = {6: 0, 7: 0, 8: 0};
    for (const draw of session.draws) {
      spent += draw.cost;
      byQuality[draw.quality]++;
      if (config["6"][draw.skillId].r2a3re === 1) { rare++; lastRare = draw.n; }
    }
    return {total: session.draws.length, spent, rare, sinceRare: session.draws.length - lastRare, byQuality};
  }
  function restore(text, config) {
    if (!text) return freshSession();
    const s = JSON.parse(text);
    if (!s || s.version !== 1 || !Array.isArray(s.draws) || s.draws.length > LIMIT || !s.profiles || typeof s.profiles !== "object") throw new Error("本地记录格式不正确。");
    qualityCheck(s.quality);
    for (const quality of [6, 7, 8]) {
      validateWeights(quality, s.weights?.[quality]);
      if (typeof s.locked?.[quality] !== "boolean") throw new Error("锁定状态不正确。");
    }
    if (typeof s.skip !== "boolean" || typeof s.stopOnRare !== "boolean") throw new Error("偏好设置不正确。");
    if (s.target !== null && (!Number.isInteger(s.target) || !config["6"][s.target] || config["6"][s.target].c2o3lor !== s.quality)) throw new Error("目标词条不正确。");
    s.draws.forEach((draw, index) => {
      const skill = config["6"][draw.skillId];
      if (!skill || !Object.hasOwn(SPECS, draw.quality) || skill.c2o3lor !== draw.quality || draw.n !== index + 1 || draw.cost !== cost(config, draw.quality) || !Number.isSafeInteger(draw.time) || draw.time < 0) throw new Error("洗炼记录校验失败。");
      const profile = s.profiles[draw.profile];
      if (!profile || profile.quality !== draw.quality) throw new Error("记录缺少概率方案。");
      validateWeights(draw.quality, profile.weights);
    });
    return s;
  }
  function csv(session, config) {
    const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
    const rows = [["次数", "时间", "兽印", "词条ID", "词条", "稀有出货", "精魄消耗", "概率权重（模拟）"]];
    session.draws.forEach(draw => {
      const skill = config["6"][draw.skillId];
      rows.push([draw.n, new Date(draw.time).toISOString(), SPECS[draw.quality].name, draw.skillId, skill.d2e3sc, skill.r2a3re ? "是" : "否", draw.cost, JSON.stringify(session.profiles[draw.profile].weights)]);
    });
    return "\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n");
  }
  return {LIMIT, STORAGE_KEY, SPECS, LABELS, pool, category, validateWeights, cost, distribution, roll, freshSession, current, appendRoll, stats, restore, csv};
});
