(function () {
  'use strict';
  const C = window.ResourceCalculator;
  const $ = name => document.getElementById('resource-' + name);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const number = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});
  const short = value => Math.abs(value) >= 1e8 ? number(value / 1e8) + '亿' : Math.abs(value) >= 1e4 ? number(value / 1e4) + '万' : number(value);
  const key = 'fingertipResourceSettings:v1';
  let data, settings, pending, result, comparison, timer, initialized = false;
  const names = new Map();

  function persist() {
    try {localStorage.setItem(key, JSON.stringify(settings));} catch (_) { /* Optional preference. */ }
  }
  function materials(items) {
    return items.length ? items.map(item => `<span>${escape(names.get(item.id))} <b title="${number(item.count)}">${short(item.count)}</b></span>`).join('') : '<span class="resource-muted">—</span>';
  }
  function options(select, entries) {
    select.replaceChildren(...entries.map(([value, label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
    }));
  }
  function setControls() {
    for (const name of ['scope', 'vip', 'adventure', 'prosperity', 'collectHours', 'station', 'quickPaid', 'quickCount', 'gold', 'goldCycles', 'kingLevel']) $(name).value = settings[name];
    for (const name of ['speed', 'lifetime', 'lifetimeClaim', 'freeQuick', 'dungeonPaid', 'dailyGift', 'tasks']) $(name).checked = settings[name];
    settings.cards.forEach((value, i) => $('card-' + i).checked = value);
    settings.dungeons.forEach((value, i) => $('dungeon-' + i).value = value);
    settings.buildings.forEach((value, i) => {
      $('building-' + i).value = value.level;
      $('station-' + i).value = value.percent;
    });
    updateDependentControls();
  }
  function updateDependentControls() {
    const highBattle = settings.scope === 'highBattle';
    const included = C.resources(data, settings);
    for (const [name, choices, fallback] of [
      ['metric', included.filter(resource => ![1, 2, 3].includes(resource.id)), 20110401],
      ['extra-kind', included, 1],
    ]) {
      const previous = Number($(name).value);
      options($(name), choices.map(resource => [resource.id, resource.name]));
      $(name).value = choices.some(resource => resource.id === previous) ? previous : fallback;
    }
    const includedBuildings = C.buildingIndices(data, settings);
    data.buildings.forEach((_, i) => { $('building-control-' + i).hidden = !includedBuildings.includes(i); });
    data.dungeons.forEach((dungeon, i) => {
      const hidden = highBattle && !['金币副本', '经验副本'].includes(dungeon.name);
      $('dungeon-field-' + i).hidden = hidden;
      $('dungeon-' + i).disabled = hidden;
    });
    $('building-controls-heading').textContent = highBattle ? '调整五座收益建筑的等级与进驻加成' : '调整九座生产建筑的等级与进驻加成';
    $('scope-note').textContent = highBattle
      ? '高战口径：每日副本只计金币与经验；建筑计入五座重点建筑，排除只产魔王币的集市、温泉、咖啡厅和魔法工坊。'
      : '全资源口径：可计入全部九座建筑与四种副本。进驻仍按五座重点建筑的顺序优先分配，其余建筑使用剩余角色。';
    $('tower-note').hidden = settings.station !== 'maximum';
    $('lifetime-benefits').textContent = '产能 +10% · 每日 100 星钻 · 金色点金 +3次/轮' + (highBattle ? '' : ' · 装备扫荡 +1次/天');
    $('dungeon-paid-note').textContent = highBattle ? '按 VIP 等级计算金币 / 经验付费次数，星钻消耗单列' : '随 VIP 等级及终身卡权益更新，星钻消耗单列';
    $('custom-quick').hidden = settings.quickPaid !== 'custom';
    $('lifetimeClaim').disabled = !settings.lifetime;
    $('goldCycles').disabled = settings.gold === 'off';
    $('kingLevel').disabled = settings.gold === 'off';
    settings.buildings.forEach((_, i) => {
      $('station-field-' + i).hidden = settings.station !== 'custom';
      $('station-' + i).disabled = settings.station !== 'custom';
    });
  }
  function readControls() {
    const next = {...settings};
    for (const name of ['scope', 'vip', 'adventure', 'prosperity', 'collectHours', 'station', 'quickPaid', 'quickCount', 'gold', 'goldCycles', 'kingLevel']) next[name] = $(name).value;
    for (const name of ['speed', 'lifetime', 'lifetimeClaim', 'freeQuick', 'dungeonPaid', 'dailyGift', 'tasks']) next[name] = $(name).checked;
    next.cards = data.cards.slice(1).map((_, i) => $('card-' + i).checked);
    next.dungeons = data.dungeons.map((_, i) => $('dungeon-' + i).value);
    next.buildings = data.buildings.map((_, i) => ({level: $('building-' + i).value, percent: $('station-' + i).value}));
    settings = C.normalize(data, next);
    if (document.activeElement?.type !== 'number') setControls();
    updateDependentControls(); persist(); render();
  }
  function renderExtra() {
    const entries = Object.entries(settings.extra);
    $('extra-list').innerHTML = entries.length ? entries.map(([id, count]) => `<li><span>${escape(names.get(Number(id)))} <strong>${number(count)}</strong> / 天</span><button type="button" class="resource-link" data-remove-extra="${id}" aria-label="移除${escape(names.get(Number(id)))}额外收益">移除</button></li>`).join('') : '<li class="resource-muted">尚未添加额外收益。</li>';
  }
  function renderComparison() {
    const resourceId = Number($('metric').value);
    $('metric-heading').textContent = names.get(resourceId);
    $('comparison').innerHTML = comparison.map(row => {
      const amount = id => row.totals.find(item => item.id === id)?.income || 0;
      return `<tr class="${row.vip.level === settings.vip ? 'selected' : ''}" data-resource-vip="${row.vip.level}"><th scope="row"><button type="button" class="resource-vip" data-select-vip="${row.vip.level}" aria-pressed="${row.vip.level === settings.vip}" aria-label="使用VIP${row.vip.level}计算">VIP${row.vip.level}</button></th><td>+${row.vip.portal_gold_percent}%</td><td>${row.quick.free} 免费 + ${row.quick.paid} 付费</td><td title="收入 ${number(row.stars.income)} − 支出 ${number(row.stars.spent)}" class="${row.stars.net < 0 ? 'resource-negative' : ''}">${number(row.stars.net)}</td><td title="${number(amount(2))}">${short(amount(2))}</td><td title="${number(amount(3))}">${short(amount(3))}</td><td title="${number(amount(resourceId))}">${short(amount(resourceId))}</td></tr>`;
    }).join('');
  }
  function render() {
    result = C.calculate(data, settings); comparison = C.compare(data, settings);
    $('summary').textContent = `${settings.scope === 'highBattle' ? '高战收菜' : '全部资源'} · VIP${settings.vip} · 每日 24 小时 · ${data.adventure[settings.adventure].label} · ${result.buildings.length} 座收益建筑`;
    $('version').textContent = '资料日期 ' + data.updated_on;
    $('star-net').textContent = (result.stars.net > 0 ? '+' : '') + number(result.stars.net);
    $('star-net').classList.toggle('resource-negative', result.stars.net < 0);
    $('star-income').textContent = number(result.stars.income);
    $('star-cost').textContent = number(result.stars.spent);
    $('quick-summary').textContent = `${result.quick.free} 次免费 + ${result.quick.paid} 次付费，额外 ${result.quick.hours} 小时产出，消耗 ${number(result.quick.cost)} 星钻。当前付费上限 ${result.quick.maxPaid} 次。`;
    $('benefits').textContent = `全建筑加成 +${result.globalPercent}%（繁荣 ${settings.prosperity * data.prosperity_percent_per_level}% + 加速 ${settings.speed ? data.speed.production_percent : 0}% + 终身卡 ${settings.lifetime ? data.cards[0].production_percent : 0}%）；传送阵金币 / 英雄经验另加 VIP ${result.vip.portal_gold_percent}%。`;
    $('gold-summary').textContent = `点金 ${result.gold.cycles} 轮、共 ${result.gold.count} 次，消耗 ${number(result.gold.cost)} 星钻；VIP 点金收益 +${result.vip.gold_percent}%。`;
    $('task-note').textContent = settings.tasks ? `已计入所勾选的日常任务，活跃度 ${result.activity}。${result.quick.free + result.quick.paid < 3 ? '快速生产不足 3 次，该项任务的 30 星钻与 20 活跃度已排除。' : ''}商店、联盟建设等任务的额外花费需自行补充。` : '勾选日常任务代表完成对应任务条件；相关玩法花费另计。';
    const lost = result.buildings.filter(building => building.lostHours > 0);
    $('storage-note').textContent = lost.length ? `按每 ${settings.collectHours} 小时收取，${lost.map(b => b.name).join('、')}会停产；已扣除存满损失。快速生产收益不受该时长限制。` : '按当前收取频率可持续生产 24 小时；请保持仓库有余量。';
    $('priority-cards').innerHTML = C.priority.map((name, i) => {
      const building = result.buildings.find(building => building.name === name);
      return `<article class="resource-priority-card"><span>优先 ${i + 1} · ${escape(name)}</span><strong>${building ? '进驻 +' + number(building.stationPercent) + '%' : '未计入'}</strong><small>${building?.team.length ? building.team.map(hero => escape(hero.name)).join('、') : '按所选进驻条件计算'}</small></article>`;
    }).join('');
    $('totals').innerHTML = result.totals.map(item => `<article class="resource-total"><span>${escape(item.name)}</span><strong data-resource-id="${item.id}" data-income="${item.income}" title="${number(item.income)}">${short(item.income)}</strong><small>每日收入${item.spent ? ` · 支出 ${number(item.spent)}` : ''}</small></article>`).join('') || '<p class="resource-muted">当前条件没有资源产出，请开启生产建筑或每日收益。</p>';
    $('building-results').innerHTML = result.buildings.map(building => `<article class="resource-building-result"><div class="resource-building-title"><h4>${escape(building.name)} <small>Lv.${building.level}</small></h4><strong>进驻 +${number(building.stationPercent)}%</strong></div><p class="resource-muted">${escape(building.skill)} · 存储 ${number(building.storageHours)} 小时 · 有效生产 ${number(building.naturalHours)} 小时</p>${building.team.length ? `<p class="resource-team">${building.team.map(hero => escape(hero.name) + ` +${hero.percent}%`).join(' · ')}</p>` : ''}<dl><div><dt>自然生产</dt><dd class="resource-materials">${materials(building.natural)}</dd></div><div><dt>快速生产</dt><dd class="resource-materials">${materials(building.quick)}</dd></div></dl></article>`).join('') || '<p class="resource-muted">尚未启用生产建筑。</p>';
    $('source-rows').innerHTML = result.sources.map(source => `<tr><th scope="row">${escape(source.name)}</th><td><div class="resource-materials">${materials(source.materials)}</div></td><td><div class="resource-materials">${materials(source.costs)}</div></td></tr>`).join('');
    $('dungeon-summary').innerHTML = result.dungeons.map(dungeon => `<li><strong>${escape(dungeon.name)} · 第${dungeon.level}关</strong><span>${dungeon.free} 次免费 + ${dungeon.paid} 次付费（付费上限 ${dungeon.maxPaid}） · ${dungeon.cost} 星钻</span></li>`).join('') || '<li class="resource-muted">副本均未计入；选择已通关的关卡后计入每日扫荡。</li>';
    renderExtra(); renderComparison();
  }
  function initializeControls() {
    options($('vip'), data.vip_levels.map(tier => [tier.level, 'VIP' + tier.level]));
    options($('adventure'), data.adventure.map((stage, i) => [i, stage.label]));
    options($('prosperity'), Array.from({length: data.prosperity_max_level + 1}, (_, i) => [i, `Lv.${i} · +${i * data.prosperity_percent_per_level}%`]));
    $('cards').innerHTML = data.cards.slice(1).map((card, i) => `<label class="resource-check"><input id="resource-card-${i}" type="checkbox"><span>${escape(card.name)}<small>${card.daily.map(item => escape(names.get(item.id)) + ' ' + number(item.count)).join('、')} / 天</small></span></label>`).join('');
    $('dungeon-controls').innerHTML = data.dungeons.map((dungeon, i) => `<label id="resource-dungeon-field-${i}" class="resource-field"><span>${escape(dungeon.name)} · 已通关关卡</span><select id="resource-dungeon-${i}"></select></label>`).join('');
    data.dungeons.forEach((dungeon, i) => options($('dungeon-' + i), [[0, '未开放 / 不计入'], ...dungeon.levels.map(level => [level.level, '第' + level.level + '关'])]));
    $('building-controls').innerHTML = C.buildingIndices(data, {scope: 'all'}).map(i => {
      const building = data.buildings[i];
      return `<div id="resource-building-control-${i}" class="resource-building-control"><label class="resource-field"><span>${escape(building.name)} · ${escape(building.skill)}</span><select id="resource-building-${i}"></select></label><label id="resource-station-field-${i}" class="resource-field" hidden><span>进驻总加成（含天赋）%</span><input id="resource-station-${i}" type="number" min="-100" max="1000" step="1" inputmode="decimal"></label></div>`;
    }).join('');
    data.buildings.forEach((building, i) => options($('building-' + i), [[0, '未建造 / 不计入'], ...building.levels.map(level => [level.level, 'Lv.' + level.level])]));
    setControls();
    $('controls').addEventListener('change', () => {clearTimeout(timer); readControls();});
    $('controls').addEventListener('input', event => {
      if (event.target.type !== 'number' || event.target.value === '') return;
      clearTimeout(timer); timer = setTimeout(readControls, 180);
    });
    $('maximum-free').addEventListener('click', () => {clearTimeout(timer); settings = C.maximum(data, settings, false); setControls(); persist(); render();});
    $('maximum-paid').addEventListener('click', () => {clearTimeout(timer); settings = C.maximum(data, settings, true); setControls(); persist(); render();});
    $('reset').addEventListener('click', () => {clearTimeout(timer); settings = C.normalize(data); setControls(); persist(); render();});
    $('metric').addEventListener('change', renderComparison);
    $('comparison').addEventListener('click', event => {
      const button = event.target.closest('[data-select-vip]'); if (!button) return;
      settings.vip = Number(button.dataset.selectVip); $('vip').value = settings.vip; persist(); render();
    });
    $('extra-add').addEventListener('click', () => {
      const id = Number($('extra-kind').value), count = Number($('extra-count').value);
      if (!Number.isFinite(count) || count < 0 || count > 1e12) {$('extra-error').textContent = '请输入 0～1 万亿之间的数量。'; return;}
      $('extra-error').textContent = ''; if (count > 0) settings.extra[id] = count; else delete settings.extra[id];
      persist(); render();
    });
    $('extra-list').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-extra]'); if (!button) return;
      delete settings.extra[button.dataset.removeExtra]; persist(); render();
    });
    $('export').addEventListener('click', () => {
      readControls();
      const url = URL.createObjectURL(new Blob([C.csv(data, settings)], {type: 'text/csv;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = '资源统计器-VIP0-20-' + data.updated_on + '.csv';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function init() {
    if (initialized) return;
    if (pending) return pending;
    $('loading').hidden = false; $('retry').hidden = true; $('loading-text').textContent = '正在读取资源资料…';
    pending = (async () => {
      try {
        const response = await fetch('api/resources.json?v=tower-priority-20261005');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const value = await response.json();
        if (value.vip_levels?.length !== 21 || value.buildings?.length !== 9 || !value.resources?.length || !value.adventure?.length) throw new Error('资料不完整');
        data = value; for (const resource of data.resources) names.set(resource.id, resource.name);
        let stored; try {stored = JSON.parse(localStorage.getItem(key));} catch (_) {stored = null;}
        settings = C.normalize(data, stored); initializeControls(); render();
        initialized = true; $('loading').hidden = true; $('content').hidden = false;
      } catch (_) {
        $('loading-text').textContent = '资源资料读取失败，请重试。'; $('retry').hidden = false;
      } finally {pending = null;}
    })();
    return pending;
  }
  $('retry').addEventListener('click', init);
  window.ResourceUI = {init};
})();
