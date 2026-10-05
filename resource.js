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
  const heroes = new Map();
  let drag;

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
    $('building-controls-heading').textContent = '建筑等级 / 实际加成';
    C.buildingIndices(data, {...settings, scope: 'all'}).forEach(i => $('building-controls').append($('building-control-' + i)));
    $('scope-note').textContent = highBattle
      ? '高战：5 座收益建筑，金币 / 经验副本。'
      : '全部：9 座建筑，4 种副本。';
    $('lifetime-benefits').textContent = '终身卡：每日 100 星钻，金色点金 +3次/轮' + (highBattle ? '' : '，装备扫荡 +1次/天');
    $('dungeon-paid-note').textContent = '次数随 VIP 与特权变化，费用计入支出';
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
    endDrag(false);
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
  function filterHeroes() {
    const term = $('hero-search').value.trim().toLocaleLowerCase();
    let count = 0;
    for (const label of $('heroes').children) {
      label.hidden = !label.dataset.heroName.toLocaleLowerCase().includes(term);
      if (!label.hidden) count++;
    }
    $('hero-empty').hidden = count > 0;
  }
  function renderRoster() {
    const owned = new Set(settings.ownedHeroes);
    $('roster-summary').textContent = `我的角色 · 已选 ${owned.size} / ${heroes.size}`;
    for (const input of $('heroes').querySelectorAll('input')) {
      input.checked = owned.has(input.dataset.owner);
      input.closest('label').classList.toggle('resource-unowned', !input.checked);
    }
    filterHeroes();
  }
  function renderPriorities() {
    const indices = C.buildingIndices(data, settings);
    $('priority-cards').innerHTML = indices.map((index, rank) => {
      const name = data.buildings[index].name, building = result.buildings.find(building => building.name === name);
      const team = building?.team || [];
      const first = building?.natural[0], count = first ? first.count + (building.quick.find(item => item.id === first.id)?.count || 0) : 0;
      const members = team.length ? team.map(hero => `<span class="resource-assigned-hero"><img src="assets/item-assets/${encodeURIComponent(heroes.get(hero.name).asset_token)}.png" alt="" loading="lazy">${escape(hero.name)}</span>`).join('')
        : `<span class="resource-muted">${settings.station === 'maximum' ? '暂无可用角色' : '按所选进驻方式计算'}</span>`;
      return `<li class="resource-priority-card" data-building="${escape(name)}"><button type="button" class="resource-drag-handle" aria-label="拖动${escape(name)}排序，方向键调整"><span aria-hidden="true">⠿</span><small class="resource-priority-rank">${rank + 1}</small></button><div class="resource-priority-main"><div class="resource-priority-title"><span class="resource-priority-name">${escape(name)}</span><strong class="resource-plan-percent">${building ? '+' + number(building.stationPercent) + '%' : '未建造'}</strong></div><div class="resource-plan-team">${members}</div><small class="resource-priority-yield">${first ? escape(names.get(first.id)) + ' ' + short(count) + ' / 天' : '未计入收益'}${building && settings.station === 'maximum' && team.length < 3 ? ' · ' + team.length + '/3 人' : ''}</small></div><div class="resource-order-buttons"><button type="button" data-move-building="${escape(name)}" data-direction="-1" aria-label="上移${escape(name)}" ${rank === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move-building="${escape(name)}" data-direction="1" aria-label="下移${escape(name)}" ${rank === indices.length - 1 ? 'disabled' : ''}>↓</button></div></li>`;
    }).join('');
    const used = result.buildings.reduce((sum, building) => sum + building.team.length, 0);
    $('planner-status').textContent = settings.station === 'maximum' ? `已分配 ${used} 名角色，每人只用一次。`
      : '调整排序或角色后，自动生成搭配。';
  }
  function commitOrder(visible, focusName) {
    clearTimeout(timer);
    const included = new Set(visible); let index = 0;
    const priority = settings.priority.map(name => included.has(name) ? visible[index++] : name);
    settings = C.normalize(data, {...settings, priority, station: 'maximum'});
    setControls(); persist(); render();
    if (focusName) [...$('priority-cards').children].find(row => row.dataset.building === focusName)?.querySelector('.resource-drag-handle').focus({preventScroll: true});
  }
  function moveBuilding(name, direction) {
    const visible = [...$('priority-cards').children].map(row => row.dataset.building), index = visible.indexOf(name), target = index + direction;
    if (index < 0 || target < 0 || target >= visible.length) return;
    [visible[index], visible[target]] = [visible[target], visible[index]];
    commitOrder(visible, name);
  }
  function rankRows() {
    const rows = drag?.order || [...$('priority-cards').children];
    rows.forEach((row, i) => {
      row.querySelector('.resource-priority-rank').textContent = i + 1;
      row.querySelector('[data-direction="-1"]').disabled = i === 0;
      row.querySelector('[data-direction="1"]').disabled = i === rows.length - 1;
    });
  }
  function placeDraggingRow() {
    if (!drag?.moved) return;
    const others = drag.order.filter(row => row !== drag.row);
    const target = others.find(row => {
      const rect = row.getBoundingClientRect(); return drag.y < rect.top + rect.height / 2;
    });
    others.splice(target ? others.indexOf(target) : others.length, 0, drag.row);
    drag.order = others;
    drag.order.forEach((row, i) => {row.style.order = i;}); rankRows();
  }
  function dragScroll() {
    if (!drag) return;
    if (drag.moved) {
      const delta = drag.y < 70 ? -12 : drag.y > innerHeight - 70 ? 12 : 0;
      if (delta) {window.scrollBy(0, delta); placeDraggingRow();}
    }
    drag.frame = requestAnimationFrame(dragScroll);
  }
  function endDrag(commit) {
    if (!drag) return;
    const state = drag; drag = null; cancelAnimationFrame(state.frame);
    state.row.classList.remove('resource-dragging');
    state.original.forEach(row => {row.style.order = '';});
    if (state.handle.hasPointerCapture(state.pointerId)) state.handle.releasePointerCapture(state.pointerId);
    if (commit && state.moved) commitOrder(state.order.map(row => row.dataset.building), state.row.dataset.building);
    else {$('priority-cards').replaceChildren(...state.original); rankRows();}
  }
  function setOwned(ownedHeroes) {
    clearTimeout(timer); endDrag(false);
    settings = C.normalize(data, {...settings, ownedHeroes, station: 'maximum'});
    setControls(); persist(); render();
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
    endDrag(false);
    result = C.calculate(data, settings); comparison = C.compare(data, settings);
    $('summary').textContent = `VIP${settings.vip} · 24 小时 · ${result.buildings.length} 座建筑`;
    $('version').textContent = '资料日期 ' + data.updated_on;
    $('star-net').textContent = (result.stars.net > 0 ? '+' : '') + number(result.stars.net);
    $('star-net').classList.toggle('resource-negative', result.stars.net < 0);
    $('star-income').textContent = number(result.stars.income);
    $('star-cost').textContent = number(result.stars.spent);
    $('quick-summary').textContent = `${result.quick.free} 次免费 + ${result.quick.paid} 次付费 · ${result.quick.hours} 小时 · ${number(result.quick.cost)} 星钻`;
    $('benefits').textContent = `全建筑 +${result.globalPercent}% · 传送阵金币 / 经验另加 VIP ${result.vip.portal_gold_percent}%`;
    $('gold-summary').textContent = `${result.gold.cycles} 轮 · ${result.gold.count} 次 · ${number(result.gold.cost)} 星钻 · VIP +${result.vip.gold_percent}%`;
    $('task-note').textContent = settings.tasks ? `任务活跃度 ${result.activity}。${result.quick.free + result.quick.paid < 3 ? '快速生产未满 3 次，对应任务奖励未计入。' : ''}` : '';
    const lost = result.buildings.filter(building => building.lostHours > 0);
    $('storage-note').textContent = lost.length ? `${lost.map(b => b.name).join('、')}存满后会停产，已扣除损失。` : '按当前频率可持续生产 24 小时。';
    $('totals').innerHTML = result.totals.map(item => `<article class="resource-total"><span>${escape(item.name)}</span><strong data-resource-id="${item.id}" data-income="${item.income}" title="${number(item.income)}">${short(item.income)}</strong><small>每日收入${item.spent ? ` · 支出 ${number(item.spent)}` : ''}</small></article>`).join('') || '<p class="resource-muted">当前条件没有资源产出，请开启生产建筑或每日收益。</p>';
    $('building-results').innerHTML = result.buildings.map(building => `<article class="resource-building-result"><div class="resource-building-title"><h4>${escape(building.name)} <small>Lv.${building.level}</small></h4><strong>进驻 +${number(building.stationPercent)}%</strong></div><p class="resource-muted">${escape(building.skill)} · 存储 ${number(building.storageHours)} 小时 · 有效生产 ${number(building.naturalHours)} 小时</p>${building.team.length ? `<p class="resource-team">${building.team.map(hero => escape(hero.name) + ` +${hero.percent}%`).join(' · ')}</p>` : ''}<dl><div><dt>自然生产</dt><dd class="resource-materials">${materials(building.natural)}</dd></div><div><dt>快速生产</dt><dd class="resource-materials">${materials(building.quick)}</dd></div></dl></article>`).join('') || '<p class="resource-muted">尚未启用生产建筑。</p>';
    $('source-rows').innerHTML = result.sources.map(source => `<tr><th scope="row">${escape(source.name)}</th><td><div class="resource-materials">${materials(source.materials)}</div></td><td><div class="resource-materials">${materials(source.costs)}</div></td></tr>`).join('');
    $('dungeon-summary').innerHTML = result.dungeons.map(dungeon => `<li><strong>${escape(dungeon.name)} · 第${dungeon.level}关</strong><span>${dungeon.free} 次免费 + ${dungeon.paid} 次付费（付费上限 ${dungeon.maxPaid}） · ${dungeon.cost} 星钻</span></li>`).join('') || '<li class="resource-muted">副本均未计入；选择已通关的关卡后计入每日扫荡。</li>';
    renderPriorities(); renderRoster(); renderExtra(); renderComparison();
  }
  function initializeControls() {
    options($('vip'), data.vip_levels.map(tier => [tier.level, 'VIP' + tier.level]));
    options($('adventure'), data.adventure.map((stage, i) => [i, stage.label]));
    options($('prosperity'), Array.from({length: data.prosperity_max_level + 1}, (_, i) => [i, `Lv.${i} · +${i * data.prosperity_percent_per_level}%`]));
    $('cards').innerHTML = data.cards.slice(1).map((card, i) => `<label class="resource-check"><input id="resource-card-${i}" type="checkbox"><span>${escape(card.name)}<small>${card.daily.map(item => escape(names.get(item.id)) + ' ' + number(item.count)).join('、')} / 天</small></span></label>`).join('');
    $('heroes').innerHTML = data.stationing_heroes.map(hero => `<label class="resource-hero" data-hero-name="${escape(hero.name)}"><input type="checkbox" data-owner="${escape(hero.name)}" aria-label="拥有${escape(hero.name)}"><img src="assets/item-assets/${encodeURIComponent(hero.asset_token)}.png" alt="" loading="lazy"><span>${escape(hero.name)}</span></label>`).join('');
    $('hero-search').addEventListener('input', filterHeroes);
    $('heroes-all').addEventListener('click', () => setOwned(data.stationing_heroes.map(hero => hero.name)));
    $('heroes-none').addEventListener('click', () => setOwned([]));
    $('reset-priority').addEventListener('click', () => {
      endDrag(false);
      settings = C.normalize(data, {...settings, priority: undefined, station: 'maximum'});
      setControls(); persist(); render();
    });
    $('priority-cards').addEventListener('click', event => {
      const button = event.target.closest('[data-move-building]');
      if (button) moveBuilding(button.dataset.moveBuilding, Number(button.dataset.direction));
    });
    $('priority-cards').addEventListener('keydown', event => {
      const handle = event.target.closest('.resource-drag-handle');
      if (event.key === 'Escape' && drag) {event.preventDefault(); endDrag(false);}
      if (!handle || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); moveBuilding(handle.closest('li').dataset.building, event.key === 'ArrowUp' ? -1 : 1);
    });
    $('priority-cards').addEventListener('pointerdown', event => {
      const handle = event.target.closest('.resource-drag-handle');
      if (!handle || event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); endDrag(false);
      drag = {handle, row: handle.closest('li'), pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
        moved: false, original: [...$('priority-cards').children], order: [...$('priority-cards').children]};
      drag.row.classList.add('resource-dragging'); handle.setPointerCapture(event.pointerId);
      drag.frame = requestAnimationFrame(dragScroll);
    });
    $('priority-cards').addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.y = event.clientY;
      if (Math.abs(drag.y - drag.startY) > 4) drag.moved = true;
      placeDraggingRow();
    });
    $('priority-cards').addEventListener('pointerup', event => {if (drag?.pointerId === event.pointerId) endDrag(true);});
    $('priority-cards').addEventListener('pointercancel', () => endDrag(false));
    $('priority-cards').addEventListener('lostpointercapture', () => endDrag(false));
    window.addEventListener('resize', () => endDrag(false));
    document.addEventListener('visibilitychange', () => {if (document.hidden) endDrag(false);});
    $('dungeon-controls').innerHTML = data.dungeons.map((dungeon, i) => `<label id="resource-dungeon-field-${i}" class="resource-field"><span>${escape(dungeon.name)} · 已通关关卡</span><select id="resource-dungeon-${i}"></select></label>`).join('');
    data.dungeons.forEach((dungeon, i) => options($('dungeon-' + i), [[0, '未开放 / 不计入'], ...dungeon.levels.map(level => [level.level, '第' + level.level + '关'])]));
    $('building-controls').innerHTML = C.buildingIndices(data, {scope: 'all'}).map(i => {
      const building = data.buildings[i];
      return `<div id="resource-building-control-${i}" class="resource-building-control"><label class="resource-field"><span>${escape(building.name)} · ${escape(building.skill)}</span><select id="resource-building-${i}"></select></label><label id="resource-station-field-${i}" class="resource-field" hidden><span>进驻总加成（含天赋）%</span><input id="resource-station-${i}" type="number" min="-100" max="1000" step="1" inputmode="decimal"></label></div>`;
    }).join('');
    data.buildings.forEach((building, i) => options($('building-' + i), [[0, '未建造 / 不计入'], ...building.levels.map(level => [level.level, 'Lv.' + level.level])]));
    setControls();
    $('controls').addEventListener('change', event => {
      if (event.target.dataset.owner) {
        const owned = new Set(settings.ownedHeroes);
        if (event.target.checked) owned.add(event.target.dataset.owner); else owned.delete(event.target.dataset.owner);
        setOwned([...owned]); return;
      }
      if (event.target.id === 'resource-hero-search') return;
      clearTimeout(timer); readControls();
    });
    $('controls').addEventListener('input', event => {
      if (event.target.type !== 'number' || event.target.value === '') return;
      clearTimeout(timer); timer = setTimeout(readControls, 180);
    });
    $('maximum-free').addEventListener('click', () => {clearTimeout(timer); settings = C.maximum(data, settings, false); setControls(); persist(); render();});
    $('maximum-paid').addEventListener('click', () => {clearTimeout(timer); settings = C.maximum(data, settings, true); setControls(); persist(); render();});
    $('reset').addEventListener('click', () => {clearTimeout(timer); endDrag(false); settings = C.maximum(data); setControls(); persist(); render();});
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
        const response = await fetch('api/resources.json?v=planner-20261005');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const value = await response.json();
        if (value.vip_levels?.length !== 21 || value.buildings?.length !== 9 || value.stationing_heroes?.length !== 87 || !value.resources?.length || !value.adventure?.length) throw new Error('资料不完整');
        data = value; for (const resource of data.resources) names.set(resource.id, resource.name);
        for (const hero of data.stationing_heroes) heroes.set(hero.name, hero);
        let stored; try {stored = JSON.parse(localStorage.getItem(key));} catch (_) {stored = null;}
        settings = stored ? C.normalize(data, stored) : C.maximum(data); initializeControls(); render();
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
