(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Encyclopedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const TABS = {
    items: {label: "物品图鉴", noun: "物品"},
    heroes: {label: "角色图鉴", noun: "角色"},
    runes: {label: "符文图鉴", noun: "符文"},
    pets: {label: "魔宠图鉴", noun: "魔宠"},
    artifacts: {label: "圣物图鉴", noun: "圣物"},
    seals: {label: "兽印图鉴", noun: "兽印"},
  };
  const QUALITY = {1: "白色", 2: "绿色", 3: "蓝色", 4: "紫色", 5: "橙色", 6: "红色", 7: "彩色", 8: "绿色·传说"};
  const normalizeTab = value => Object.hasOwn(TABS, value) ? value : "items";
  const isRare = skill => skill.type.startsWith("稀有");
  const freshFilters = () => ({query: "", faction: "all", career: "all", category: "all", quality: "all", rareOnly: false});
  function searchText(entry, rareOnly = false) {
    return [entry.name, entry.id, entry.description, entry.faction, entry.career, entry.rank, entry.category, ...entry.tags,
      ...entry.skills.filter(skill => !rareOnly || isRare(skill)).flatMap(skill => [skill.name, skill.type, skill.description]),
      ...entry.progression.flatMap(stage => [stage.label, stage.description])].join(" ").toLowerCase();
  }
  function matches(entry, filters) {
    for (const key of ["faction", "career", "category", "quality"]) {
      if (filters[key] && filters[key] !== "all" && String(entry[key]) !== String(filters[key])) return false;
    }
    if (filters.rareOnly && !entry.skills.some(isRare)) return false;
    const terms = String(filters.query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const text = searchText(entry, filters.rareOnly);
    return terms.every(term => text.includes(term));
  }
  function visibleSkills(entry, filters, searchSkills = false) {
    const skills = entry.skills.filter(skill => !filters.rareOnly || isRare(skill));
    const terms = String(filters.query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!searchSkills || !terms.length || terms.every(term => entry.name.toLowerCase().includes(term))) return skills;
    return skills.filter(skill => terms.every(term => [skill.name, skill.type, skill.description].join(" ").toLowerCase().includes(term)));
  }
  function filter(entries, filters = freshFilters()) { return entries.filter(entry => matches(entry, filters)); }
  function facets(entries, field) {
    return [...new Set(entries.map(entry => entry[field]).filter(value => value !== ""))]
      .sort((a, b) => field === "quality" ? Number(b) - Number(a) : String(a).localeCompare(String(b), "zh-CN"));
  }
  function page(entries, number, size) {
    const pageSize = Math.max(1, Math.floor(Number(size) || 12));
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    const current = Math.max(1, Math.min(pages, Math.floor(Number(number) || 1)));
    return {number: current, pages, entries: entries.slice((current - 1) * pageSize, current * pageSize)};
  }
  return {TABS, QUALITY, normalizeTab, isRare, freshFilters, searchText, matches, visibleSkills, filter, facets, page};
});
