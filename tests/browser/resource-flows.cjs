const fs = require('node:fs');

module.exports = async (page, baseURL) => {
  const checks = [], errors = [], requests = [];
  const ok = (condition, label) => {if (!condition) throw new Error(label); checks.push(label);};
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(baseURL + '/?view=server');
  await page.getByRole('tab', {name: '资源统计器', exact: true}).click();
  await page.locator('#resource-content').waitFor({state: 'visible'});
  ok(await page.locator('#resource-comparison tr').count() === 21, '资源统计器显示全部 VIP0～20');
  ok(new URL(page.url()).searchParams.get('view') === 'resources', '新栏目更新可分享入口');
  ok(await page.title() === '指尖小助手 · 资源统计器', '新栏目有正确页面标题');
  ok(!await page.locator('#resource-advanced').evaluate(el => el.open) && !await page.locator('#resource-roster').evaluate(el => el.open), '详细设置和角色列表默认折叠，首页突出收益与排序');
  await page.locator('#resource-advanced').evaluate(el => {el.open = true;});
  await page.locator('#resource-comparison').evaluate(el => {el.closest('details').open = true;});
  await page.locator('#resource-vip').selectOption('20');
  await page.locator('#resource-maximum-paid').click();
  ok((await page.locator('#resource-quick-summary').innerText()).includes('1 次免费 + 5 次付费'), '满配采用加速后的快速生产次数');
  ok(await page.locator('#resource-star-cost').innerText() === '1,810', '高战付费星钻支出只含金币和经验扫荡');
  ok(await page.locator('#resource-scope').inputValue() === 'highBattle', '满配按钮采用高战口径');
  ok(await page.locator('#resource-dungeon-field-2').isHidden() && await page.locator('#resource-dungeon-field-3').isHidden(), '高战副本只显示金币和经验');
  ok(await page.locator('#resource-totals [data-resource-id="34"]').count() === 0 && await page.locator('#resource-metric option[value="34"]').count() === 0, '高战汇总和比较选项均排除魔王币');
  ok(JSON.stringify(await page.locator('.resource-plan-percent').allTextContents()) === JSON.stringify(['+67%', '+67%', '+66%', '+64%', '+66%'])
    && JSON.stringify(await page.locator('.resource-priority-name').allTextContents()) === JSON.stringify(['传送阵','远古遗迹','星辰之塔','冒险者公会','空港']), '默认保留星辰之塔第三、空港第五的优先级');
  ok((await page.locator('.resource-priority-card').first().innerText()).includes('雅典娜') && (await page.locator('.resource-priority-card').first().innerText()).includes('蔷薇丝塔'), '传送阵67%的队友配合名单可直接查看');
  const names = () => page.locator('.resource-priority-name').allTextContents();
  await page.locator('#resource-priority-cards').scrollIntoViewIfNeeded();
  const source = await page.locator('[data-building="星辰之塔"] .resource-drag-handle').boundingBox();
  const target = await page.locator('[data-building="传送阵"] .resource-drag-handle').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 5, {steps: 12}); await page.mouse.up();
  ok((await names())[0] === '星辰之塔' && await page.locator('.resource-plan-percent').first().innerText() === '+67%', '鼠标拖动后星辰之塔自动获得67%');
  const assigned = await page.locator('.resource-assigned-hero').allTextContents();
  ok(assigned.length === 15 && new Set(assigned).size === 15, '动态推荐每名角色只使用一次');
  await page.locator('#resource-roster').evaluate(el => {el.open = true;});
  await page.locator('#resource-hero-search').fill('蔷薇丝塔');
  await page.getByRole('checkbox', {name: '拥有蔷薇丝塔', exact: true}).uncheck();
  ok(await page.locator('.resource-plan-percent').first().innerText() === '+66%' && !(await page.locator('.resource-assigned-hero').allTextContents()).includes('蔷薇丝塔'), '取消未拥有的角色后自动替换并重新计收益');
  await page.locator('#resource-heroes-none').click();
  ok(await page.locator('.resource-assigned-hero').count() === 0 && (await page.locator('#resource-planner-status').innerText()).includes('0 名'), '清空角色时不生成虚构搭配');
  await page.locator('#resource-hero-search').fill('雅典娜'); await page.getByRole('checkbox', {name: '拥有雅典娜', exact: true}).check();
  await page.locator('#resource-hero-search').fill('蔷薇丝塔'); await page.getByRole('checkbox', {name: '拥有蔷薇丝塔', exact: true}).check();
  ok(await page.locator('.resource-assigned-hero').count() === 2
    && JSON.stringify(await page.locator('.resource-plan-percent').allTextContents()) === JSON.stringify(['+22%','+22%','+0%','+0%','+0%']), '仅有两名角色时遵守建筑适用性，分别分配且保留空位');
  await page.locator('#resource-heroes-all').click(); await page.locator('#resource-hero-search').fill('');
  await page.locator('#resource-reset-priority').click();
  const handle = page.locator('[data-building="星辰之塔"] .resource-drag-handle');
  await handle.focus(); await handle.press('ArrowUp'); await page.locator('[data-building="星辰之塔"] .resource-drag-handle').press('ArrowUp');
  ok((await names())[0] === '星辰之塔', '键盘方向键也能调整优先级');
  await page.locator('#resource-reset-priority').click();
  await page.getByRole('button', {name: '上移空港', exact: true}).click();
  ok((await names())[3] === '空港', '手机箭头可精确移动建筑');
  await page.locator('#resource-reset-priority').click();
  await page.locator('#resource-scope').selectOption('all');
  ok(await page.locator('#resource-dungeon-field-2').isVisible() && await page.locator('#resource-dungeon-field-3').isVisible(), '全部资源口径仍可显示符文和装备副本');
  await page.locator('#resource-dungeon-2').selectOption('40');
  await page.locator('#resource-dungeon-3').selectOption('60');
  ok(await page.locator('#resource-star-cost').innerText() === '2,110' && await page.locator('#resource-totals [data-resource-id="34"]').count() === 1, '全资源模式恢复其他副本与魔王币收益');
  await page.locator('#resource-scope').selectOption('highBattle');
  ok(await page.locator('#resource-star-cost').innerText() === '1,810' && await page.locator('#resource-dungeon-2').inputValue() === '0' && await page.locator('#resource-dungeon-3').inputValue() === '0', '切回高战口径清除其他副本的收入和费用');
  ok(await page.locator('#resource-comparison tr.selected').getAttribute('data-resource-vip') === '20', '当前VIP在对比表中高亮');
  await page.locator('#resource-metric').selectOption('30450302');
  ok(await page.locator('#resource-metric-heading').innerText() === '魔石原矿', '对比表可切换全部产出资源');
  await page.locator('[data-select-vip="6"]').click();
  ok(await page.locator('#resource-vip').inputValue() === '6', '点击对比行切换VIP条件');
  await page.locator('#resource-maximum-free').click();
  ok(await page.locator('#resource-star-cost').innerText() === '0', '满配免费方案不支出星钻');
  await page.locator('#resource-station').selectOption('custom');
  await page.locator('#resource-building-controls').evaluate(el => {el.closest('details').open = true;});
  await page.locator('#resource-station-0').fill('35');
  await page.locator('#resource-station-0').blur();
  await page.locator('#resource-building-results').evaluate(el => {el.closest('details').open = true;});
  ok((await page.locator('.resource-building-result').first().innerText()).includes('进驻 +35%'), '自定义进驻率更新明细');
  await page.locator('#resource-station').selectOption('maximum');
  const teams = await page.locator('.resource-team').allTextContents();
  ok(teams.length === 5, '高战满配显示五座收益建筑的公开角色名单');
  ok(await page.locator('#resource-building-control-3').isHidden() && await page.locator('#resource-building-control-4').isHidden()
    && await page.locator('#resource-building-control-5').isHidden() && await page.locator('#resource-building-control-6').isHidden(), '高战配置隐藏四座只产魔王币的建筑');
  await page.locator('#resource-collectHours').selectOption('24');
  ok((await page.locator('#resource-storage-note').innerText()).includes('会停产'), '单日领取可见存满停产影响');
  await page.locator('#resource-collectHours').selectOption('12');
  await page.getByRole('button', {name: '上移星辰之塔', exact: true}).click();
  await page.getByRole('button', {name: '上移星辰之塔', exact: true}).click();
  await page.locator('#resource-hero-search').fill('蔷薇丝塔'); await page.getByRole('checkbox', {name: '拥有蔷薇丝塔', exact: true}).uncheck();
  await page.locator('#resource-hero-search').fill('');
  await page.locator('#resource-extra-list').evaluate(el => {el.closest('details').open = true;});
  await page.locator('#resource-extra-kind').selectOption('1');
  await page.locator('#resource-extra-count').fill('125');
  const starsBefore = Number((await page.locator('#resource-star-income').innerText()).replaceAll(',', ''));
  await page.locator('#resource-extra-add').click();
  ok(Number((await page.locator('#resource-star-income').innerText()).replaceAll(',', '')) === starsBefore + 125, '手动补充每日资源计入总收入');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#resource-export').click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/resources.csv');
  const csv = fs.readFileSync('output/playwright/resources.csv', 'utf8');
  ok(csv.charCodeAt(0) === 65279 && csv.trimEnd().split('\r\n').length === 23, 'CSV包含条件、表头和21个VIP');
  ok(csv.split('\r\n')[0].includes('高战收菜') && csv.split('\r\n')[0].includes('星辰之塔 > 传送阵 > 远古遗迹 > 冒险者公会 > 空港')
    && !csv.split('\r\n')[0].split('已拥有角色 ')[1].split('"')[0].includes('蔷薇丝塔')
    && !csv.split('\r\n')[1].includes('魔王币'), '导出遵循自定义顺序、角色选择与统计口径');
  await page.reload(); await page.locator('#resource-content').waitFor({state: 'visible'});
  const restoredVip = await page.locator('#resource-vip').inputValue();
  const restoredExtra = await page.locator('#resource-extra-list').textContent();
  const restoredIncome = Number((await page.locator('#resource-star-income').innerText()).replaceAll(',', ''));
  ok(restoredVip === '6' && await page.locator('#resource-scope').inputValue() === 'highBattle' && restoredExtra.includes('125') && Math.abs(restoredIncome - starsBefore - 125) < 0.001,
    `刷新保留VIP和额外收益：VIP=${restoredVip}，收入=${restoredIncome}，额外收益=${restoredExtra}`);
  ok((await names())[0] === '星辰之塔' && !await page.locator('#resource-heroes input[data-owner="蔷薇丝塔"]').isChecked(), '刷新保留排序与未拥有角色选择');
  for (const width of [320,390,540,768,1440]) {
    await page.setViewportSize({width, height: 950});
    await page.locator('#resource-content details').evaluateAll(els => els.forEach(el => {el.open = true;}));
    const issues = await page.evaluate(() => {
      const problems = [], rect = el => el.getBoundingClientRect();
      const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      if (document.documentElement.scrollWidth * zoom > window.innerWidth + 1) problems.push('页面横向溢出');
      for (const el of document.querySelectorAll('.resource-total, .resource-check, .resource-field, .resource-building-control, .resource-building-result, .resource-priority-card, .resource-hero')) {
        if (!el.getClientRects().length) continue;
        if (el.scrollWidth > el.clientWidth + 1) problems.push('控件或卡片横向溢出');
        if ([...el.children].filter(child => child.getClientRects().length).some(child => !contains(rect(el), rect(child)))) problems.push('控件或卡片内容遮挡');
      }
      const cards = [...document.querySelectorAll('.resource-total')];
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const a = rect(cards[i]), b = rect(cards[j]);
        if (Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1) problems.push('资源卡片重叠');
      }
      if (window.innerWidth <= 920 && rect(document.querySelector('.site-credit')).top < rect(document.querySelector('main')).bottom - 1) problems.push('署名遮挡正文');
      return [...new Set(problems)];
    });
    ok(!issues.length, width + 'px 资源页面布局正常：' + issues.join('；'));
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.locator('#resource-content details').evaluateAll(els => els.forEach(el => {el.open = false;}));
  await page.screenshot({path: 'output/playwright/resources-mobile.png', fullPage: true});
  await page.setViewportSize({width: 1440, height: 1050});
  await page.screenshot({path: 'output/playwright/resources-desktop.png', fullPage: true});
  const touchContext = await page.context().browser().newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const mobile = await touchContext.newPage();
  try {
    mobile.on('pageerror', error => errors.push(error.message));
    mobile.on('request', request => requests.push(request.url()));
    await mobile.goto(baseURL + '/?view=resources');
    await mobile.locator('#resource-content').waitFor({state: 'visible'});
    await mobile.locator('#resource-priority-cards').evaluate(el => el.scrollIntoView({block: 'center'}));
    const cdp = await touchContext.newCDPSession(mobile);
    const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: point ? [{...point, id: 1}] : []});
    const center = async selector => {
      const box = await mobile.locator(selector).boundingBox();
      return {x: box.x + box.width / 2, y: box.y + box.height / 2};
    };
    const slide = async (from, to, finish = 'touchEnd') => {
      await touch('touchStart', from);
      for (let i = 1; i <= 12; i++) await touch('touchMove', {x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12});
      await touch(finish);
    };
    const tower = await center('[data-building="星辰之塔"] .resource-drag-handle');
    const portal = await center('[data-building="传送阵"] .resource-drag-handle');
    await slide(tower, {x: portal.x, y: portal.y - 15});
    ok((await mobile.locator('.resource-priority-name').allTextContents())[0] === '星辰之塔'
      && await mobile.locator('.resource-plan-percent').first().innerText() === '+67%', '手机真实触摸拖动后立即重排并优化搭配');
    await slide(await center('[data-building="星辰之塔"] .resource-drag-handle'), await center('[data-building="冒险者公会"] .resource-drag-handle'), 'touchCancel');
    ok((await mobile.locator('.resource-priority-name').allTextContents())[0] === '星辰之塔' && await mobile.locator('.resource-dragging').count() === 0
      && await mobile.evaluate(() => JSON.parse(localStorage.getItem('fingertipResourceSettings:v1')).priority[0]) === '星辰之塔', '触摸取消恢复原顺序，不保存中途位置');
    const beforeScroll = await mobile.evaluate(() => window.scrollY);
    await touch('touchStart', await center('[data-building="星辰之塔"] .resource-drag-handle'));
    await touch('touchMove', {x: tower.x, y: 839});
    await mobile.waitForFunction(before => window.scrollY > before + 20, beforeScroll);
    await touch('touchCancel');
    ok((await mobile.locator('.resource-priority-name').allTextContents())[0] === '星辰之塔', '手机拖到屏幕边缘会滚动，取消后仍保留顺序');
    await mobile.locator('[data-building="星辰之塔"]').scrollIntoViewIfNeeded();
    const mainPoint = await center('[data-building="星辰之塔"] .resource-priority-main');
    const beforeSwipe = await mobile.evaluate(() => window.scrollY);
    await slide(mainPoint, {x: mainPoint.x, y: mainPoint.y - 120});
    await mobile.waitForFunction(before => window.scrollY > before + 20, beforeSwipe);
    ok(await mobile.locator('.resource-dragging').count() === 0, '建筑正文可正常滑动页面，拖动手柄不干扰阅读');
    await mobile.locator('#resource-roster > summary').tap();
    await mobile.locator('#resource-hero-search').fill('蔷薇丝塔');
    await mobile.getByRole('checkbox', {name: '拥有蔷薇丝塔', exact: true}).uncheck();
    ok(await mobile.locator('.resource-plan-percent').first().innerText() === '+66%', '手机取消角色后自动生成替代方案');
    await mobile.locator('#resource-roster > summary').tap();
    await mobile.screenshot({path: 'output/playwright/resources-touch.png', fullPage: true});
  } catch (error) {
    await mobile.screenshot({path: 'output/playwright/resources-touch-failure.png', fullPage: true}); throw error;
  } finally {await touchContext.close();}
  const context = await page.context().browser().newContext();
  try {
    const failed = await context.newPage();
    await failed.route('**/api/resources.json*', route => route.abort());
    await failed.goto(baseURL + '/?view=resources');
    await failed.locator('#resource-retry').waitFor({state: 'visible'});
    ok(await failed.locator('#resource-content').isHidden(), '读取失败不会显示未就绪的控件');
    await failed.unroute('**/api/resources.json*'); await failed.locator('#resource-retry').click();
    await failed.locator('#resource-content').waitFor({state: 'visible'});
    ok(await failed.locator('#resource-comparison tr').count() === 21, '重试后成功恢复计算');
    await failed.evaluate(() => localStorage.setItem('fingertipResourceSettings:v1', '{broken'));
    await failed.reload(); await failed.locator('#resource-content').waitFor({state: 'visible'});
    ok(await failed.locator('#resource-vip').inputValue() === '0', '损坏偏好不会阻塞栏目');
  } finally {await context.close();}
  await page.getByRole('tab', {name: '指尖百科', exact: true}).click();
  await page.locator('.item-card').first().waitFor();
  ok(await page.locator('#resources-view').isHidden(), '其他栏目正常切换并隐藏统计器');
  const external = requests.filter(url => !url.startsWith(baseURL + '/') && new URL(url).hostname !== 'gc.kis.v2.scr.kaspersky-labs.com');
  ok(!external.length, '资源统计只读取本站脱敏静态数据');
  ok(!errors.length, '资源统计器流程无脚本错误');
  return {passed: checks.length, checks, errors};
};
