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
  await page.locator('#resource-vip').selectOption('20');
  await page.locator('#resource-maximum-paid').click();
  ok((await page.locator('#resource-quick-summary').innerText()).includes('1 次免费 + 5 次付费'), '满配采用加速后的快速生产次数');
  ok(await page.locator('#resource-star-cost').innerText() === '1,810', '高战付费星钻支出只含金币和经验扫荡');
  ok(await page.locator('#resource-scope').inputValue() === 'highBattle', '满配按钮采用高战口径');
  ok(await page.locator('#resource-dungeon-field-2').isHidden() && await page.locator('#resource-dungeon-field-3').isHidden(), '高战副本只显示金币和经验');
  ok(await page.locator('#resource-totals [data-resource-id="34"]').count() === 0 && await page.locator('#resource-metric option[value="34"]').count() === 0, '高战汇总和比较选项均排除魔王币');
  ok(JSON.stringify(await page.locator('.resource-priority-card strong').allTextContents()) === JSON.stringify(['进驻 +67%', '进驻 +67%', '进驻 +66%', '进驻 +64%', '进驻 +66%'])
    && JSON.stringify(await page.locator('.resource-priority-card > span').allTextContents()) === JSON.stringify(['优先 1 · 传送阵','优先 2 · 远古遗迹','优先 3 · 星辰之塔','优先 4 · 冒险者公会','优先 5 · 空港']), '星辰之塔优先级第三，空港第五，五座建筑显示联合最大加成');
  ok(await page.locator('#resource-tower-note').isVisible() && (await page.locator('#resource-tower-note').innerText()).includes('最高为 66%'), '满配说明星辰之塔不能同时达到67%的角色冲突');
  ok((await page.locator('.resource-priority-card').first().innerText()).includes('雅典娜') && (await page.locator('.resource-priority-card').first().innerText()).includes('蔷薇丝塔'), '传送阵67%的队友配合名单可直接查看');
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
  ok(await page.locator('#resource-tower-note').isHidden(), '自定义进驻时隐藏满配角色冲突说明');
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
  ok(csv.split('\r\n')[0].includes('高战收菜') && csv.split('\r\n')[0].includes('传送阵 > 远古遗迹 > 星辰之塔 > 冒险者公会 > 空港')
    && !csv.split('\r\n')[1].includes('魔王币'), '导出遵循高战统计口径和星辰之塔第三优先级');
  await page.reload(); await page.locator('#resource-content').waitFor({state: 'visible'});
  const restoredVip = await page.locator('#resource-vip').inputValue();
  const restoredExtra = await page.locator('#resource-extra-list').textContent();
  const restoredIncome = Number((await page.locator('#resource-star-income').innerText()).replaceAll(',', ''));
  ok(restoredVip === '6' && await page.locator('#resource-scope').inputValue() === 'highBattle' && restoredExtra.includes('125') && Math.abs(restoredIncome - starsBefore - 125) < 0.001,
    `刷新保留VIP和额外收益：VIP=${restoredVip}，收入=${restoredIncome}，额外收益=${restoredExtra}`);
  for (const width of [320,390,540,768,1440]) {
    await page.setViewportSize({width, height: 950});
    await page.locator('#resource-content details').evaluateAll(els => els.forEach(el => {el.open = true;}));
    const issues = await page.evaluate(() => {
      const problems = [], rect = el => el.getBoundingClientRect();
      const contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      if (document.documentElement.scrollWidth * zoom > window.innerWidth + 1) problems.push('页面横向溢出');
      for (const el of document.querySelectorAll('.resource-total, .resource-check, .resource-field, .resource-building-control, .resource-building-result, .resource-priority-card')) {
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
