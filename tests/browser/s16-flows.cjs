const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

module.exports=async(page,baseURL)=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(baseURL+'/?view=global');
  await page.locator('[data-global-view="holyland"]').click();
  await page.waitForFunction(()=>document.querySelector('#holyland-result-label').textContent==='S16赛果');
  const folder=path.resolve(__dirname,'../../api/holyland/S16');
  let realms=0,matches=0;
  for(const channel of fs.readdirSync(folder)){
    const files=fs.readdirSync(path.join(folder,channel)).filter(f=>f.endsWith('.json'));
    await page.locator('#holyland-channel').selectOption(channel);
    assert.equal(await page.locator('#holyland-realm option').count(),files.length);
    for(const file of files){
      const realm=file.replace('.json','');
      await page.locator('#holyland-realm').selectOption(realm);
      await page.waitForFunction(({channel,realm})=>document.querySelector('#holyland-summary').textContent.includes(`圣域${realm}区`)
        &&document.querySelector('#holyland-channel').value===channel,{channel,realm});
      await page.waitForFunction(()=>document.querySelectorAll('[data-lineup-id]').length===64);
      const data=JSON.parse(fs.readFileSync(path.join(folder,channel,file),'utf8'));
      const games=data.rounds.flatMap(r=>r.matches).concat(data.bronze_match);
      assert.equal(games.length,32);
      games.forEach(m=>assert.deepEqual(m.players.map(p=>p.result).sort(),['loss','win']));
      await page.locator('[data-lineup-id]').first().click();
      await page.waitForFunction(()=>document.querySelectorAll('#lineup-panel .lineup-side').length===2);
      await page.waitForFunction(()=>[...document.querySelectorAll('#holyland-bracket img,#lineup-panel img')].every(i=>i.complete&&i.naturalWidth>0));
      if(channel==='xkbeta'&&realm==='1')await page.screenshot({path:'output/playwright/s16-desktop.png'});
      await page.locator('.lineup-close').click();
      realms++;matches+=32;
    }
  }
  for(const season of ['S15','S14','S16']){
    await page.locator('#holyland-season').selectOption(season);
    await page.waitForFunction(s=>document.querySelector('#holyland-result-label').textContent===s+'赛果',season);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/playwright/s16-mobile.png'});
  assert.deepEqual(errors,[]);
  return {realms,matches,seasons:['S16','S15','S14'],imageErrors:0};
};
