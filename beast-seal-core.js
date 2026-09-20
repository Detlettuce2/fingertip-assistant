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
    6: {name: "雷霆虎", color: "红色", icon: "310105010", weights: {general: 36, exclusive: 64}, raw: "通用 36%；专属 64%"},
    7: {name: "圣角兽", color: "彩色", icon: "310106010", weights: {generalRare: 0.34, general: 35.50, exclusiveRare: 2.72, exclusive: 61.44}, raw: "通用稀有 0.34%；通用 35.50%；专属稀有 2.72%；专属 61.44%"},
    8: {name: "焚焰凤", color: "绿色", icon: "310107010", weights: {generalRare: 0.25, general: 40.57, exclusiveRare: 2.05, exclusive: 57.13}, raw: "通用稀有 0.25%；通用 40.57%；专属稀有 2.05%；专属 57.13%"},
  };
  const PITY = {
    7: {label: "彩色兽印", start: 18, target: 20, hard: 23},
    8: {label: "绿色兽印", start: 40, target: 42, hard: 45},
  };
  const LABELS = {generalRare: "通用稀有", general: "通用", exclusiveRare: "专属稀有", exclusive: "专属"};
  function qualityCheck(quality) {
    if (!Number.isInteger(quality) || !Object.hasOwn(SPECS, quality)) throw new Error("请选择可洗炼的兽印品质。");
  }
  function unit(random) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数须在 [0, 1) 内。");
    return value;
  }
  function pool(data, quality) {
    qualityCheck(quality);
    return Object.values(data["6"]).filter(skill => skill.c2o3lor === Number(quality));
  }
  function category(skill, quality) {
    const group = skill.skill_type < 1000 ? "general" : "exclusive";
    return Number(quality) >= 7 && skill.r2a3re === 1 ? group + "Rare" : group;
  }
  function validateWeights(quality, weights) {
    qualityCheck(quality);
    const keys = Object.keys(SPECS[quality].weights);
    if (!weights || Object.keys(weights).length !== keys.length || keys.some(key => !Number.isFinite(weights[key]) || weights[key] < 0 || weights[key] > 100)) {
      throw new Error("概率数据不正确。");
    }
    const total = keys.reduce((sum, key) => sum + weights[key], 0);
    if (total <= 0) throw new Error("概率数据不正确。");
    return total;
  }
  function cost(data, quality) {
    qualityCheck(quality);
    const match = /^\{250210501,(\d+)\}$/.exec(data["2"][quality].wash_cost);
    if (!match) throw new Error("兽印消耗数据不完整。");
    return Number(match[1]);
  }
  function distribution(data, quality, weights = SPECS[quality].weights) {
    const total = validateWeights(quality, weights);
    const skills = pool(data, quality);
    return Object.entries(weights).map(([key, weight]) => {
      const entries = skills.filter(skill => category(skill, quality) === key);
      if (!entries.length && weight > 0) throw new Error("所选分组没有可用词条。");
      return {key, weight, probability: weight / total, entries};
    });
  }
  function pickFromGroups(groups, random) {
    const total = groups.reduce((sum, group) => sum + group.weight, 0);
    const draw = unit(random) * total;
    let cumulative = 0;
    let chosen = groups[groups.length - 1];
    for (const group of groups) {
      cumulative += group.weight;
      if (draw < cumulative) { chosen = group; break; }
    }
    return chosen.entries[Math.floor(unit(random) * chosen.entries.length)];
  }
  function roll(data, quality, weights = SPECS[quality].weights, random = Math.random) {
    const groups = distribution(data, quality, weights).filter(group => group.weight > 0);
    return pickFromGroups(groups, random);
  }
  function pityBoost(quality, attempt) {
    qualityCheck(quality);
    if (!Number.isInteger(attempt) || attempt < 1) throw new Error("连续洗炼次数不正确。");
    const rule = PITY[quality];
    if (!rule || attempt < rule.start) return 0;
    if (attempt >= rule.hard) return 1;
    return (attempt - rule.start + 1) / (rule.hard - rule.start + 1);
  }
  function pityStreak(session, data, quality = session.quality) {
    qualityCheck(Number(quality));
    let streak = 0;
    for (let index = session.draws.length - 1; index >= 0; index--) {
      const draw = session.draws[index];
      if (draw.quality !== Number(quality)) continue;
      if (data["6"][draw.skillId].r2a3re === 1) break;
      streak++;
    }
    return streak;
  }
  function rollWithPity(data, quality, weights, attempt, random = Math.random) {
    const boost = pityBoost(quality, attempt);
    if (boost > 0 && unit(random) < boost) {
      const rareGroups = distribution(data, quality, weights).filter(group => group.weight > 0 && group.key.endsWith("Rare"));
      if (!rareGroups.length) throw new Error("当前兽印没有可用的稀有词条。");
      return {skill: pickFromGroups(rareGroups, random), pityTriggered: true, boost};
    }
    return {skill: roll(data, quality, weights, random), pityTriggered: false, boost};
  }
  function freshSession() {
    return {version: 1, quality: 8, draws: [], profiles: {}, weights: Object.fromEntries(Object.entries(SPECS).map(([quality, spec]) => [quality, {...spec.weights}])), locked: {6: false, 7: false, 8: false}, skip: false, stopOnRare: true, target: null};
  }
  function current(session, quality = session.quality) {
    return session.draws.findLast(draw => draw.quality === Number(quality)) || null;
  }
  function appendRoll(session, data, random = Math.random, now = Date.now()) {
    const quality = session.quality;
    if (session.locked[quality]) throw new Error("当前兽印已锁定，请先解锁。");
    if (session.draws.length >= LIMIT) throw new Error("本轮已达 10,000 次，请导出记录后开启新一轮。");
    const weights = SPECS[quality].weights;
    const attempt = pityStreak(session, data, quality) + 1;
    const {skill, pityTriggered} = rollWithPity(data, quality, weights, attempt, random);
    const profile = quality + ":" + Object.keys(weights).map(key => weights[key]).join(",");
    session.profiles[profile] = {quality, weights: {...weights}};
    session.weights[quality] = {...weights};
    const draw = {n: session.draws.length + 1, quality, skillId: skill.s2k3ill_id, cost: cost(data, quality), time: now, profile, ...(pityTriggered ? {pity: true, pityAttempt: attempt} : {})};
    session.draws.push(draw);
    return {draw, skill, pityTriggered};
  }
  function stats(session, data) {
    let rare = 0, spent = 0, lastRare = 0;
    const byQuality = {6: 0, 7: 0, 8: 0};
    const dryByQuality = {6: 0, 7: 0, 8: 0};
    for (const draw of session.draws) {
      spent += draw.cost;
      byQuality[draw.quality]++;
      if (data["6"][draw.skillId].r2a3re === 1) {
        rare++;
        lastRare = draw.n;
        dryByQuality[draw.quality] = 0;
      } else {
        dryByQuality[draw.quality]++;
      }
    }
    return {total: session.draws.length, spent, rare, sinceRare: session.draws.length - lastRare, byQuality, dryByQuality};
  }
  function restore(text, data) {
    if (!text) return freshSession();
    const s = JSON.parse(text);
    if (!s || s.version !== 1 || !Array.isArray(s.draws) || s.draws.length > LIMIT || !s.profiles || typeof s.profiles !== "object") throw new Error("本地记录格式不正确。");
    qualityCheck(s.quality);
    for (const quality of [6, 7, 8]) {
      validateWeights(quality, s.weights?.[quality]);
      if (typeof s.locked?.[quality] !== "boolean") throw new Error("锁定状态不正确。");
    }
    if (typeof s.skip !== "boolean" || typeof s.stopOnRare !== "boolean") throw new Error("偏好设置不正确。");
    if (s.target !== null && (!Number.isInteger(s.target) || !data["6"][s.target] || data["6"][s.target].c2o3lor !== s.quality)) throw new Error("目标词条不正确。");
    const dryByQuality = {6: 0, 7: 0, 8: 0};
    s.draws.forEach((draw, index) => {
      const skill = data["6"][draw.skillId];
      if (!skill || !Object.hasOwn(SPECS, draw.quality) || skill.c2o3lor !== draw.quality || draw.n !== index + 1 || draw.cost !== cost(data, draw.quality) || !Number.isSafeInteger(draw.time) || draw.time < 0) throw new Error("洗炼记录校验失败。");
      const profile = s.profiles[draw.profile];
      if (!profile || profile.quality !== draw.quality) throw new Error("记录缺少概率方案。");
      validateWeights(draw.quality, profile.weights);
      const attempt = dryByQuality[draw.quality] + 1;
      if (draw.pity !== undefined && draw.pity !== true) throw new Error("软保底记录不正确。");
      if (!draw.pity && draw.pityAttempt !== undefined) throw new Error("软保底记录不正确。");
      if (draw.pity && (!PITY[draw.quality] || skill.r2a3re !== 1 || draw.pityAttempt !== attempt || pityBoost(draw.quality, attempt) <= 0)) throw new Error("软保底记录不正确。");
      dryByQuality[draw.quality] = skill.r2a3re === 1 ? 0 : attempt;
    });
    s.weights = Object.fromEntries(Object.entries(SPECS).map(([quality, spec]) => [quality, {...spec.weights}]));
    return s;
  }
  function csv(session, data) {
    const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
    const rows = [["次数", "时间", "兽印", "词条ID", "词条", "稀有出货", "软保底触发", "精魄消耗"]];
    session.draws.forEach(draw => {
      const skill = data["6"][draw.skillId];
      rows.push([draw.n, new Date(draw.time).toISOString(), SPECS[draw.quality].name, draw.skillId, skill.d2e3sc, skill.r2a3re ? "是" : "否", draw.pity ? `是（连续第 ${draw.pityAttempt} 次）` : "否", draw.cost]);
    });
    return "\uFEFF" + rows.map(row => row.map(quote).join(",")).join("\r\n");
  }
  return {LIMIT, STORAGE_KEY, SPECS, PITY, LABELS, pool, category, validateWeights, cost, distribution, roll, pityBoost, pityStreak, rollWithPity, freshSession, current, appendRoll, stats, restore, csv};
});
