(function () {
  "use strict";
  const C = window.Encyclopedia;
  const $ = id => document.getElementById("catalog-" + id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);
  const tabs = [...document.querySelectorAll("[data-catalog]")];
  const views = new Map();
  let data = null, loading = false, bound = false, showItems;
  let tab = "items", pageSize = window.innerWidth < 700 ? 6 : 12;
  function preference(value) {
    try {
      if (value !== undefined) localStorage.setItem("assistantCatalog", value);
      return localStorage.getItem("assistantCatalog");
    } catch (_) { return null; }
  }
  function view() {
    if (!views.has(tab)) views.set(tab, {filters: C.freshFilters(), page: 1, selected: null});
    return views.get(tab);
  }
  function updateURL(entry) {
    const url = new URL(location.href);
    url.searchParams.set("catalog", tab);
    if (entry) url.searchParams.set("entry", entry.id);
    else url.searchParams.delete("entry");
    history.replaceState(null, "", url);
  }
  function selectSharedEntry() {
    const url = new URL(location.href);
    if (!data || C.normalizeTab(url.searchParams.get("catalog")) !== tab) return;
    const entryId = Number(url.searchParams.get("entry"));
    const index = C.filter(data[tab], view().filters).findIndex(entry => entry.id === entryId);
    if (index >= 0) { view().page = Math.floor(index / pageSize) + 1; view().selected = entryId; }
  }
  function enableFilters(enabled) {
    $("filters").querySelectorAll("input, select, button").forEach(control => { control.disabled = !enabled; });
  }
  function visual(entry, large = false) {
    const realms = {"自然": 1, "霜寒": 2, "熔火": 3, "奥术": 4, "虚空": 5};
    const realm = realms[entry.faction] || 0;
    return window.itemCardVisual({...entry,
      hero_realm: realm + (entry.tags.includes("SP") ? 6 : 0),
      hero_strength: {B: 1, A: 2, S: 3, "S+": 4}[entry.rank] || 0,
    }, large);
  }
  function badges(entry) {
    return [C.QUALITY[entry.quality], entry.faction, entry.career, entry.rank, ...entry.tags]
      .filter(Boolean).map(value => `<span>${escape(value)}</span>`).join("");
  }
  function populateFilters() {
    const state = view(), entries = data[tab];
    for (const [field, label] of [["faction", "阵营"], ["career", "定位"], ["category", "类型"], ["quality", "品质"]]) {
      const values = C.facets(entries, field);
      $(field).innerHTML = `<option value="all">全部${label}</option>` + values.map(value =>
        `<option value="${escape(value)}">${escape(field === "quality" ? C.QUALITY[value] || value : value)}</option>`).join("");
      $(field).value = state.filters[field];
      if (field !== "quality") $(field + "-field").hidden = values.length === 0;
    }
    $("search-label").textContent = "搜索" + C.TABS[tab].noun;
    $("search").value = state.filters.query;
    $("rare-field").hidden = tab !== "seals";
    $("rare").checked = state.filters.rareOnly;
  }
  function renderDetail() {
    const entry = data[tab].find(candidate => candidate.id === view().selected);
    if (!entry) {
      $("detail").innerHTML = '<div class="empty-state">没有匹配条目，可清除筛选后重新选择。</div>';
      return;
    }
    const skills = C.visibleSkills(entry, view().filters, tab === "seals");
    $("detail").innerHTML = `<div class="catalog-detail-header">
      ${visual(entry, true)}<div><span class="eyebrow">${escape(C.TABS[tab].noun)}</span><h3>${escape(entry.name)}</h3>
      <div class="catalog-tags">${badges(entry)}</div><p class="catalog-id">物品编号 #${entry.id}</p></div></div>
      <p class="catalog-description">${escape(entry.description)}</p>
      ${entry.notes.length ? `<ul class="catalog-notes">${entry.notes.map(note => `<li>${escape(note)}</li>`).join("")}</ul>` : ""}
      ${skills.length ? `<section class="catalog-skills"><h4>${tab === "seals" ? `兽印词条 · ${skills.length} 条` : "技能与效果"}</h4>${skills.map(skill =>
        `<article class="catalog-skill${C.isRare(skill) ? " rare-skill" : ""}"><span>${escape(skill.type)}</span><h5>${escape(skill.name)}</h5><p>${escape(skill.description)}</p></article>`).join("")}</section>` : ""}
      ${entry.progression.length ? `<section class="catalog-progression"><h4>成长效果</h4><label class="catalog-stage-label">选择成长阶段<select id="catalog-stage">${entry.progression.map((stage, index) => `<option value="${index}">${escape(stage.label)}</option>`).join("")}</select></label><p id="catalog-stage-description">${escape(entry.progression[0].description)}</p><details><summary>查看全部成长效果（${entry.progression.length} 项）</summary><dl>${entry.progression.map(stage => `<dt>${escape(stage.label)}</dt><dd>${escape(stage.description)}</dd>`).join("")}</dl></details></section>` : ""}`;
    $("stage")?.addEventListener("change", () => {
      $("stage-description").textContent = entry.progression[Number($("stage").value)].description;
    });
  }
  function render() {
    if (!data || tab === "items") return;
    const state = view(), entries = C.filter(data[tab], state.filters);
    const page = C.page(entries, state.page, pageSize);
    state.page = page.number;
    if (!page.entries.some(entry => entry.id === state.selected)) state.selected = page.entries[0]?.id ?? null;
    $("summary").textContent = `收录 ${data[tab].length} 个${C.TABS[tab].noun} · 筛选结果 ${entries.length} 个 · 资料版本 ${data.updated_on}`;
    $("page").textContent = entries.length ? `第 ${page.number} / ${page.pages} 页` : "没有结果";
    $("prev").disabled = page.number <= 1;
    $("next").disabled = page.number >= page.pages;
    $("grid").innerHTML = page.entries.length ? page.entries.map(entry => `<button class="catalog-card${entry.id === state.selected ? " selected" : ""}" type="button" data-catalog-entry="${entry.id}" aria-pressed="${entry.id === state.selected}">
      ${visual(entry)}<strong>${escape(entry.name)}</strong><span class="catalog-card-meta">${escape([C.QUALITY[entry.quality], entry.faction, entry.career, entry.category].filter(Boolean).join(" · "))}</span><p>${escape(entry.description)}</p></button>`).join("") : '<div class="empty-state">没有找到匹配条目，可换个关键词或清除筛选。</div>';
    renderDetail();
    updateURL(page.entries.find(entry => entry.id === state.selected));
  }
  async function load() {
    if (loading) return;
    loading = true;
    $("retry").hidden = true;
    $("summary").textContent = "正在读取图鉴资料…";
    $("grid").innerHTML = '<div class="empty-state">正在读取图鉴资料…</div>';
    try {
      const response = await fetch("api/catalogs.json");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      for (const key of Object.keys(C.TABS).filter(key => key !== "items")) {
        if (!Array.isArray(payload[key])) throw new Error("图鉴资料不完整");
      }
      data = payload;
      // A tab may have changed while its shared data was loading.
      if (tab !== "items") { selectSharedEntry(); populateFilters(); render(); }
    } catch (_) {
      $("summary").textContent = "图鉴资料读取失败，请重试。";
      $("grid").innerHTML = '<div class="empty-state">暂时无法读取资料。</div>';
      $("retry").hidden = false;
    } finally { loading = false; enableFilters(Boolean(data)); }
  }
  function activate(value, updateHistory = true) {
    tab = C.normalizeTab(value);
    preference(tab);
    tabs.forEach(button => {
      const active = button.dataset.catalog === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.getElementById("encyclopedia-items").hidden = tab !== "items";
    $("panel").hidden = tab === "items";
    $("panel").setAttribute("aria-labelledby", "encyclopedia-tab-" + tab);
    if (updateHistory) updateURL();
    if (tab === "items") { showItems(); return; }
    $("title").textContent = C.TABS[tab].label;
    $("search-label").textContent = "搜索" + C.TABS[tab].noun;
    enableFilters(Boolean(data));
    if (data) { selectSharedEntry(); populateFilters(); render(); }
    else load();
  }
  function bind() {
    if (bound) return;
    bound = true;
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => activate(button.dataset.catalog));
      button.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault(); tabs[next].focus(); activate(tabs[next].dataset.catalog);
      });
    });
    $("filters").addEventListener("submit", event => event.preventDefault());
    $("search").addEventListener("input", () => { view().filters.query = $("search").value; view().page = 1; render(); });
    for (const field of ["faction", "career", "category", "quality"]) {
      $(field).addEventListener("change", () => { view().filters[field] = $(field).value; view().page = 1; render(); });
    }
    $("rare").addEventListener("change", () => { view().filters.rareOnly = $("rare").checked; view().page = 1; render(); });
    $("clear").addEventListener("click", () => { view().filters = C.freshFilters(); view().page = 1; populateFilters(); render(); });
    $("retry").addEventListener("click", load);
    for (const [id, delta] of [["prev", -1], ["next", 1]]) $(id).addEventListener("click", () => { view().page += delta; render(); });
    $("grid").addEventListener("click", event => {
      const button = event.target.closest("[data-catalog-entry]");
      if (!button || !data) return;
      view().selected = Number(button.dataset.catalogEntry);
      const entry = data[tab].find(candidate => candidate.id === view().selected);
      render(); updateURL(entry);
      if (window.innerWidth < 920) $("detail").scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
    });
    window.addEventListener("resize", () => {
      const next = window.innerWidth < 700 ? 6 : 12;
      if (next !== pageSize) { pageSize = next; render(); }
    });
  }
  function init(itemsCallback) {
    showItems = itemsCallback;
    bind();
    const url = new URL(location.href), requested = C.normalizeTab(url.searchParams.get("catalog") || preference() || "items");
    const entryId = Number(url.searchParams.get("entry"));
    if (requested !== "items" && entryId) {
      if (!views.has(requested)) views.set(requested, {filters: C.freshFilters(), page: 1, selected: entryId});
    }
    activate(requested, false);
  }
  window.EncyclopediaUI = {init};
})();
