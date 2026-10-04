const assert = require('node:assert/strict');

module.exports = async (page, baseURL) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(baseURL + '/?view=global');
  await page.locator('[data-global-view="holyland"]').click();
  await page.waitForFunction(() => document.querySelector('#holyland-result-label').textContent === 'S15赛果');
  const targets = {xkbeta:7, xkapp:1, xkstorebeta:1, xkgdt:3, xkhw:1, xkghb:1};
  let realms = 0;
  for (const [channel, count] of Object.entries(targets)) {
    if (await page.locator('#holyland-channel').inputValue() !== channel) {
      const response = page.waitForResponse(r => r.url().includes(`/api/holyland/S15/${channel}/`));
      await page.locator('#holyland-channel').selectOption(channel);
      await response;
    }
    assert.equal(await page.locator('#holyland-realm option').count(), count);
    for (let realm = 1; realm <= count; realm++) {
      if (await page.locator('#holyland-realm').inputValue() !== String(realm)) {
        const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/api/holyland/S15/${channel}/${realm}.json`));
        await page.locator('#holyland-realm').selectOption(String(realm));
        await response;
      }
      await page.waitForFunction(realm => document.querySelector('#holyland-summary').textContent.includes(`圣域${realm}区`), realm);
      assert.equal(await page.locator('[data-lineup-id]').count(), 64);
      await page.locator('[data-lineup-id]').first().click();
      await page.waitForFunction(() => document.querySelectorAll('#lineup-panel .lineup-side').length === 2);
      await page.waitForFunction(() => [...document.querySelectorAll('#holyland-bracket img, #lineup-panel img')].every(img => img.complete && img.naturalWidth > 0));
      if (channel === 'xkbeta' && realm === 1) {
        await page.screenshot({path:'output/playwright/s15-desktop.png'});
      }
      await page.locator('.lineup-close').click();
      realms++;
    }
  }
  await page.locator('#holyland-season').selectOption('S14');
  await page.waitForFunction(() => document.querySelector('#holyland-result-label').textContent === 'S14赛果');
  assert.equal(await page.locator('#holyland-realm option').count(), 8);
  await page.locator('#holyland-channel').selectOption('xkgdt');
  await page.waitForFunction(() => document.querySelector('#holyland-summary').textContent.includes('奥术殿'));
  assert.equal(await page.locator('#holyland-realm option').count(), 2);
  await page.locator('#holyland-season').selectOption('S15');
  await page.waitForFunction(() => document.querySelector('#holyland-result-label').textContent === 'S15赛果');
  assert.equal(await page.locator('#holyland-realm option').count(), 3);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/s15-mobile.png'});
  assert.deepEqual(errors, []);
  return {realms, seasons:['S15','S14'], imageErrors:0};
};
