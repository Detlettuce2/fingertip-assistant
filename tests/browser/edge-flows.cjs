module.exports = async (page, baseURL) => {
  const checks=[]; const ok=(condition,name)=>{if(!condition)throw new Error(name);checks.push(name);};
  const ready=()=>page.locator('#seal-workspace').waitFor({state:'visible'});
  await ready();
  await page.locator('#seal-rules-open').click();
  for(const name of ['generalRare','general','exclusiveRare','exclusive']) await page.locator(`[name="${name}"]`).fill('0');
  await page.getByRole('button',{name:'应用权重',exact:true}).click();
  ok((await page.locator('#seal-weight-error').innerText()).includes('大于 0'),'全零权重被拒绝');
  await page.locator('#seal-weights-default').click();
  ok(await page.locator('[name="generalRare"]').inputValue()==='0.25','恢复配置权重');
  await page.keyboard.press('Escape');
  await page.route('**/api/beast-seal.json',route=>route.abort());
  await page.reload(); await page.locator('#seal-retry').waitFor({state:'visible'});
  ok((await page.locator('#seal-load-state').innerText()).includes('失败'),'配置加载失败有可恢复提示');
  await page.unroute('**/api/beast-seal.json');await page.locator('#seal-retry').click();await ready();
  ok(await page.locator('#seal-wash').isEnabled(),'重试后可洗炼');
  await page.evaluate(()=>localStorage.setItem('fingertip.beast-seal.v1','{broken'));
  await page.reload();await ready();
  ok(await page.locator('#seal-wash').isDisabled(),'损坏存档暂停洗炼');
  ok(await page.evaluate(()=>localStorage.getItem('fingertip.beast-seal.v1'))==='{broken','损坏存档不会被静默覆盖');
  const event=page.waitForEvent('download');await page.locator('#seal-export').click();await (await event).saveAs('output/playwright/corrupt-backup.json');
  page.once('dialog',d=>d.dismiss());await page.locator('#seal-reset').click();
  ok(await page.locator('#seal-wash').isDisabled(),'取消清空保留异常存档');
  page.once('dialog',d=>d.accept());await page.locator('#seal-reset').click();
  ok(await page.locator('#seal-wash').isEnabled(),'确认新一轮后恢复');
  const peer=await page.context().newPage();await peer.goto(baseURL + '/?view=seal');await peer.locator('#seal-workspace').waitFor({state:'visible'});
  await page.bringToFront();await page.locator('#seal-skip').check();await page.locator('#seal-wash').click();
  await peer.waitForFunction(()=>document.querySelector('#seal-total').textContent==='1');
  ok(await peer.locator('#seal-total').innerText()==='1','同浏览器另一页面同步记录');await peer.close();
  await page.evaluate(async()=>{
    const config=await (await fetch('api/beast-seal.json')).json();const s=BeastSeal.freshSession();s.skip=true;s.stopOnRare=false;
    for(let i=0;i<9999;i++)BeastSeal.appendRoll(s,config,()=>0.99999);
    localStorage.setItem(BeastSeal.STORAGE_KEY,JSON.stringify(s));
  });
  await page.reload();await ready();await page.locator('#seal-wash').click();
  await page.waitForFunction(()=>document.querySelector('#seal-stop').hidden);
  ok(await page.locator('#seal-total').innerText()==='10,000' && await page.locator('#seal-spent').innerText()==='200,000','一万次边界计数和材料准确');
  ok(await page.locator('#seal-wash').isDisabled() && await page.locator('#seal-batch-start').isDisabled(),'容量上限阻止继续写入');
  await page.reload();await ready();ok(await page.locator('#seal-total').innerText()==='10,000','一万条记录成功持久化');
  page.once('dialog',d=>d.accept());await page.locator('#seal-reset').click();
  ok(await page.locator('#seal-total').innerText()==='0','新一轮正确清零');
  const context=await page.context().browser().newContext();
  await context.addInitScript(()=>{Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError');};Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  const restricted=await context.newPage();await restricted.goto(baseURL + '/?view=seal');await restricted.locator('#seal-workspace').waitFor({state:'visible'});
  ok((await restricted.locator('#seal-status').innerText()).includes('不允许本地存储'),'禁止存储时页面仍可用且明确提醒');
  await restricted.locator('#seal-wash').click();await restricted.waitForFunction(()=>document.querySelector('#seal-stop').hidden);
  ok(await restricted.locator('#seal-total').innerText()==='1' && (await restricted.locator('#seal-save-state').innerText()).includes('保存失败'),'保存失败不伪称成功');await context.close();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    const fits=await page.evaluate(()=>{
      const elements=[...document.querySelectorAll('[data-seal-quality],#seal-wash,.primary-navigation .navigation-tab,#seal-result-text')];
      return document.documentElement.scrollWidth<=window.innerWidth && elements.every(e=>e.scrollHeight<=e.clientHeight+1 && e.scrollWidth<=e.clientWidth+1);
    });ok(fits,`${width}px关键文字不溢出`);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/seal-mobile-final.png',fullPage:true});
  return {passed:checks.length,checks};
}
