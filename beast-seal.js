(function () {
  "use strict";
  const C = window.BeastSeal;
  const $ = id => document.getElementById("seal-" + id);
  const escape = text => String(text).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  let config, session, loading = false, bound = false, busy = false, cancelled = false, damaged = false, rawBackup = "", historyLimit = 30;
  const format = number => number.toLocaleString("zh-CN");
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function status(message) { $("status").textContent = message; }
  function save() {
    if (damaged) return;
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(session));
      $("save-state").textContent = "已保存到当前浏览器";
    } catch (_) {
      $("save-state").textContent = "本地保存失败，请立即导出；刷新可能丢失记录。";
    }
  }
  function updateButtons() {
    const blocked = busy || damaged || session.locked[session.quality] || session.draws.length >= C.LIMIT;
    $("wash").disabled = blocked;
    $("batch-start").disabled = blocked;
    $("stop").hidden = !busy;
    $("batch-start").hidden = busy;
    $("lock").disabled = busy || damaged || !C.current(session);
    $("lock").setAttribute("aria-pressed", String(session.locked[session.quality]));
    $("lock").textContent = session.locked[session.quality] ? "已锁定 · 点击解锁" : "锁定当前兽印";
    for (const control of document.querySelectorAll("[data-seal-quality], #seal-batch-count, #seal-skip, #seal-stop-rare, #seal-rules-open, #seal-preview-open, #seal-target-clear, #seal-reset")) control.disabled = busy;
    $("skip").checked = session.skip;
    $("stop-rare").checked = session.stopOnRare;
  }
  function renderResult() {
    const quality = session.quality, spec = C.SPECS[quality], skills = C.pool(config, quality), latest = C.current(session);
    document.querySelectorAll("[data-seal-quality]").forEach(button => {
      const selected = Number(button.dataset.sealQuality) === quality;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    $("emblem").src = `assets/item-assets/icon_${spec.icon}.png`;
    $("emblem").alt = spec.name + "兽印";
    $("name").textContent = spec.name + " · 兽印";
    $("pool-count").textContent = skills.length + " 种词条";
    $("cost-value").textContent = C.cost(config, quality);
    const skill = latest ? config["6"][latest.skillId] : null;
    const index = skill ? skills.findIndex(entry => entry.s2k3ill_id === skill.s2k3ill_id) : Math.floor(skills.length / 2);
    const pityTriggered = Boolean(latest?.pity);
    let before = skills[(index + skills.length - 1) % skills.length];
    let after = skills[(index + 1) % skills.length];
    if (pityTriggered) {
      const otherRares = skills.filter(entry => entry.r2a3re === 1 && entry.s2k3ill_id !== skill.s2k3ill_id);
      const offset = latest.n % otherRares.length;
      before = otherRares[offset];
      after = otherRares[(offset + 1) % otherRares.length];
    }
    $("neighbor-before").textContent = (pityTriggered ? "稀有 · " : "") + before.d2e3sc;
    $("neighbor-after").textContent = (pityTriggered ? "稀有 · " : "") + after.d2e3sc;
    $("reel").classList.toggle("is-pity", pityTriggered);
    $("neighbor-before").classList.toggle("is-rare", pityTriggered);
    $("neighbor-after").classList.toggle("is-rare", pityTriggered);
    $("result").classList.toggle("is-rare", skill?.r2a3re === 1);
    $("result").classList.toggle("is-pity", pityTriggered);
    $("result-label").textContent = skill ? (pityTriggered ? "软保底出货" : (skill.r2a3re ? "稀有出货" : "本次词条")) : "等待洗炼";
    $("result-text").textContent = skill ? skill.d2e3sc : "点击洗炼，获得你的第一个兽印词条。";
    $("result-id").textContent = skill ? `第 ${format(latest.n)} 次 · ${skill.skill_type < 1000 ? "通用" : "专属"}${pityTriggered ? ` · 连续第 ${latest.pityAttempt} 次触发软保底` : ""} · #${skill.s2k3ill_id}` : "每次获得 1 条词条";
    const streak = C.pityStreak(session, config, quality), rule = C.PITY[quality];
    if (!rule) $("pity-note").textContent = "雷霆虎按官方基础概率模拟，不设置软保底。";
    else if (streak < rule.start) $("pity-note").textContent = `${rule.label}软保底：已连续 ${streak} 次未出稀有，第 ${rule.start} 次起逐步提升概率。`;
    else $("pity-note").textContent = `${rule.label}软保底已升温：已连续 ${streak} 次未出稀有，约第 ${rule.target} 次出货，最迟第 ${rule.hard} 次。`;
    $("target-note").textContent = session.target ? "心愿：" + config["6"][session.target].d2e3sc + "（命中即停）" : "可在词条预览中选择心愿词条，抽中自动停手。";
    $("target-clear").hidden = !session.target;
  }
  function renderHistory() {
    const filter = $("history-filter").value;
    const records = session.draws.filter(draw => filter === "all" || (filter === "rare" ? config["6"][draw.skillId].r2a3re === 1 : draw.quality === Number(filter))).slice().reverse();
    $("history").innerHTML = records.length ? records.slice(0, historyLimit).map(draw => {
      const skill = config["6"][draw.skillId];
      const time = new Date(draw.time).toLocaleString("zh-CN", {hour12: false});
      return `<li class="${skill.r2a3re ? "rare-record" : ""}"><div><strong>第 ${format(draw.n)} 次</strong><span>${C.SPECS[draw.quality].name}${skill.r2a3re ? " · 稀有" : ""}${draw.pity ? " · 软保底" : ""}</span></div><p>${escape(skill.d2e3sc)}</p><small>${escape(time)} · ${draw.cost} 精魄 · #${draw.skillId}</small></li>`;
    }).join("") : `<li class="seal-empty"><span>✦</span><strong>${filter === "rare" ? "静候下一次惊喜" : "还没有洗炼记录"}</strong><p>${filter === "rare" ? "抽到稀有词条后，这里会记下它和出货次数。" : "点击洗炼，开始记录你的每一次尝试。"}</p></li>`;
    $("history-more").hidden = records.length <= historyLimit;
  }
  function render() {
    renderResult();
    const stats = C.stats(session, config);
    $("total").textContent = format(stats.total);
    $("rares").textContent = format(stats.rare);
    $("spent").textContent = format(stats.spent);
    $("streak").textContent = format(stats.dryByQuality[session.quality]);
    $("quality-totals").textContent = Object.entries(stats.byQuality).map(([quality, total]) => C.SPECS[quality].name + " " + format(total) + " 次").join(" · ");
    renderHistory();
    updateButtons();
  }
  async function wash(count) {
    if (busy || damaged || session.locked[session.quality]) return;
    const current = C.current(session);
    if (current && config["6"][current.skillId].r2a3re === 1 && !window.confirm("当前是稀有词条，继续洗炼将替换它。出货记录会保留。继续吗？")) return;
    if (session.target) {
      const possible = C.pool(config, session.quality).some(skill => skill.s2k3ill_id === session.target);
      if (!possible) { status("当前兽印不包含所选心愿词条，请重新选择。"); return; }
    }
    busy = true; cancelled = false; updateButtons();
    let completed = 0, reason = "", rareCount = 0, pityCount = 0;
    try {
      while (completed < count && !cancelled) {
        if (!session.skip) {
          $("reel").classList.add("is-rolling");
          await delay(count === 1 ? 360 : 160);
          if (cancelled) break;
        }
        const chunk = session.skip ? Math.min(10, count - completed) : 1;
        let pityShown = false;
        for (let i = 0; i < chunk; i++) {
          const {skill, pityTriggered} = C.appendRoll(session, config);
          completed++;
          if (skill.r2a3re) rareCount++;
          if (pityTriggered) { pityCount++; pityShown = true; }
          if (session.target === skill.s2k3ill_id) { reason = "心愿达成，已自动停手。"; break; }
          if (session.stopOnRare && skill.r2a3re) { reason = "稀有出货，已自动停手。"; break; }
          if (pityShown) break;
        }
        $("reel").classList.remove("is-rolling");
        save(); render();
        status(`已洗炼 ${completed} / ${count} 次，本轮出货 ${rareCount} 次${pityCount ? `，触发软保底 ${pityCount} 次` : ""}。`);
        if (reason) break;
        await delay(pityShown ? 450 : 25);
      }
      status(`本次完成 ${completed} 次，出货 ${rareCount} 次${pityCount ? `，触发软保底 ${pityCount} 次` : ""}。${reason || (cancelled ? "已停止。" : "")}`);
    } catch (error) {
      status(`本次完成 ${completed} 次。${error.message}`);
    } finally {
      busy = false;
      $("reel").classList.remove("is-rolling");
      save(); render();
    }
  }
  function preview() {
    const quality = session.quality, query = $("preview-search").value.trim().toLowerCase(), rareOnly = $("preview-rare").checked;
    const groups = C.distribution(config, quality);
    const skills = C.pool(config, quality).filter(skill => (!rareOnly || skill.r2a3re) && (/^\d+$/.test(query) ? String(skill.s2k3ill_id) === query : (skill.d2e3sc + " " + skill.s2k3ill_id).toLowerCase().includes(query)));
    $("preview-title").textContent = C.SPECS[quality].name + " · 词条预览";
    $("preview-summary").textContent = `${skills.length} 条匹配 · 分类概率来自官方公示，软保底阶段稀有概率会提升；点击词条设为心愿。`;
    $("preview-list").innerHTML = skills.map(skill => {
      const group = groups.find(group => group.key === C.category(skill, quality));
      return `<button type="button" class="seal-preview-entry ${skill.r2a3re ? "rare-record" : ""}" data-seal-target="${skill.s2k3ill_id}" aria-pressed="${session.target === skill.s2k3ill_id}"><span>${skill.r2a3re ? "稀有 · " : ""}${skill.skill_type < 1000 ? "通用" : "专属"} · #${skill.s2k3ill_id}<b>${C.LABELS[group.key]} ${Number((group.probability * 100).toFixed(4))}%</b></span><p>${escape(skill.d2e3sc)}</p></button>`;
    }).join("") || '<p class="seal-no-match">没有匹配的词条，换个关键词试试。</p>';
  }
  function rules() {
    const spec = C.SPECS[session.quality];
    $("raw-rates").textContent = spec.raw;
    $("rates-title").textContent = spec.name + " · 官方概率公示";
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function bind() {
    if (bound) return;
    bound = true;
    document.querySelectorAll("[data-seal-quality]").forEach(button => button.addEventListener("click", () => {
      if (busy || session.quality === Number(button.dataset.sealQuality)) return;
      session.quality = Number(button.dataset.sealQuality); session.target = null; save(); render();
      status("已切换为" + C.SPECS[session.quality].name + "，累计记录继续保留。");
    }));
    $("wash").addEventListener("click", () => wash(1));
    $("batch-start").addEventListener("click", () => wash(Number($("batch-count").value)));
    $("stop").addEventListener("click", () => { cancelled = true; status("正在停止…"); });
    $("skip").addEventListener("change", () => { session.skip = $("skip").checked; save(); });
    $("stop-rare").addEventListener("change", () => { session.stopOnRare = $("stop-rare").checked; save(); });
    $("lock").addEventListener("click", () => { session.locked[session.quality] = !session.locked[session.quality]; save(); updateButtons(); status(session.locked[session.quality] ? "兽印已锁定。" : "兽印已解锁。"); });
    $("history-filter").addEventListener("change", () => { historyLimit = 30; renderHistory(); });
    $("history-more").addEventListener("click", () => { historyLimit += 30; renderHistory(); });
    $("target-clear").addEventListener("click", () => { session.target = null; save(); renderResult(); });
    $("preview-open").addEventListener("click", () => { preview(); $("preview").showModal(); });
    $("preview-search").addEventListener("input", preview);
    $("preview-rare").addEventListener("change", preview);
    $("preview-list").addEventListener("click", event => {
      const button = event.target.closest("[data-seal-target]"); if (!button) return;
      session.target = Number(button.dataset.sealTarget); save(); renderResult(); $("preview").close(); status("心愿已设置，命中后自动停止连续洗炼。");
    });
    $("rules-open").addEventListener("click", () => { if (!config) return; rules(); $("rules").showModal(); });
    document.querySelectorAll("[data-seal-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
    $("export").addEventListener("click", () => {
      const date = new Date().toISOString().slice(0, 10);
      if (damaged) download(rawBackup, `兽印存档备份-${date}.json`, "application/json;charset=utf-8");
      else download(C.csv(session, config), `兽印洗炼记录-${date}.csv`, "text/csv;charset=utf-8");
    });
    $("reset").addEventListener("click", () => {
      if (!window.confirm("开启新一轮会清空当前浏览器的全部兽印洗炼和出货记录。请先导出需要的记录。确定清空吗？")) return;
      session = C.freshSession(); damaged = false; rawBackup = ""; historyLimit = 30;
      $("export").textContent = "导出 CSV"; save(); render(); status("新一轮已开始，累计记录已清零。");
    });
    window.addEventListener("storage", event => {
      if (event.key !== C.STORAGE_KEY && event.key !== null) return;
      cancelled = true;
      try { session = C.restore(event.newValue, config); damaged = false; render(); status("已同步另一页面的记录，本页连续洗炼已停止。"); }
      catch (_) { damaged = true; rawBackup = event.newValue || ""; updateButtons(); status("另一页面的存档异常，请备份后开启新一轮。"); $("export").textContent = "备份异常存档"; }
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelled = true; });
    // Each completed chunk is saved before yielding; never overwrite a newer tab on pagehide.
  }
  async function init() {
    if (config || loading) return;
    loading = true;
    $("retry").hidden = true;
    $("load-state").textContent = "正在读取兽印数据…";
    try {
      const response = await fetch("api/beast-seal.json");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const loaded = await response.json();
      for (const quality of [6, 7, 8]) { C.distribution(loaded, quality); C.cost(loaded, quality); }
      config = loaded;
      let warning = "";
      try { rawBackup = localStorage.getItem(C.STORAGE_KEY) || ""; }
      catch (_) { warning = "浏览器不允许本地存储，请在离开前导出记录。"; }
      try { session = C.restore(rawBackup, config); }
      catch (_) { session = C.freshSession(); damaged = true; warning = "本地存档校验失败，已暂停洗炼。请先备份异常存档，再开启新一轮。"; $("export").textContent = "备份异常存档"; }
      bind(); render();
      $("load-state").hidden = true; $("workspace").hidden = false;
      if (warning) { status(warning); $("save-state").textContent = warning; }
    } catch (error) {
      config = null;
      $("load-state").textContent = "兽印数据读取失败：" + error.message;
      $("retry").hidden = false;
    } finally { loading = false; }
  }
  $("retry").addEventListener("click", init);
  window.BeastSealUI = {init, stop() { cancelled = true; }};
})();
