const assert = require('node:assert/strict');
module.exports = async (page, baseURL) => {
  await page.clock.install({time:new Date('2026-10-01T18:00:00+08:00')});
  await page.goto(baseURL + '/?view=global');
  await page.locator('.activity-card').first().waitFor();
  const clocks = await page.locator('.activity-card').evaluateAll(cards => cards.map(card => ({
    name:card.querySelector('.activity-title-sprite')?.alt || card.querySelector('.activity-title-text')?.textContent,
    main:card.querySelector('.activity-main-clock')?.textContent,
    small:card.querySelector('.activity-small-clock')?.textContent,
    top:card.querySelector('.activity-main-clock')?.getBoundingClientRect().top,
    stageTop:card.querySelector('.activity-stage').getBoundingClientRect().top,
    smallBottom:card.querySelector('.activity-small-clock')?.getBoundingClientRect().bottom,
    barTop:card.querySelector('.activity-daily-progress')?.getBoundingClientRect().top,
  })));
  assert.match(clocks.find(x => x.name === '圣域争锋').main, /^赛季剩余 /);
  assert.match(clocks.find(x => x.name === '圣域争锋').small, /^本周剩余 /);
  for (const name of ['异界天梯','魔域战场']) {
    assert.match(clocks.find(x => x.name === name).main, /^本周剩余 /);
    assert.ok(clocks.find(x => x.name === name).small);
  }
  for (const clock of clocks) {
    if (clock.main) assert.ok(clock.top < clock.stageTop);
    if (clock.small) assert.ok(clock.smallBottom <= clock.barTop);
  }
  await page.screenshot({path:'output/playwright/calendar-clocks-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/calendar-clocks-mobile.png',fullPage:true});
  return {cards:clocks.length, separatedClocks:true};
};
