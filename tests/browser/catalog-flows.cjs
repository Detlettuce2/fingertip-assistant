const inspectCatalogLayout = require('./catalog-layout.cjs');

module.exports=async(page,baseURL)=>{
  const checks=[],errors=[],requests=[];
  const ok=(condition,name)=>{if(!condition)throw new Error(name);checks.push(name);};
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.goto(baseURL+'/?view=encyclopedia&catalog=items');
  await page.locator('.item-card').first().waitFor();
  ok(await page.locator('[data-catalog]').count()===6,'百科有六个图鉴子选项');
  const itemCount=(await(await page.request.get(baseURL+'/api/items.json')).json()).items.length;
  ok((await page.locator('#item-summary').innerText()).includes(itemCount.toLocaleString('zh-CN')),'物品图鉴保留已有全部公开资料');
  await page.locator('#item-search').fill('守护圣盾');
  await page.waitForFunction(()=>{const image=document.querySelector('#item-detail .item-icon');return image?.complete&&image.naturalWidth>0;});
  ok(await page.locator('#item-detail .item-icon').getAttribute('src')==='assets/item-assets/icon_150110638.png','守护圣盾碎片使用已有贴图而非占位');
  await page.locator('#item-search').fill('');
  await page.getByRole('tab',{name:'角色图鉴',exact:true}).click();
  await page.locator('.catalog-card').first().waitFor();
  ok((await page.locator('#catalog-summary').innerText()).includes('87 个角色'),'角色静态资料已加载');
  await page.locator('#catalog-faction').selectOption('虚空');
  await page.locator('#catalog-career').selectOption('术士');
  ok(await page.locator('.catalog-card').count()>0,'阵营与定位组合筛选有效');
  await page.locator('#catalog-clear').click();
  await page.locator('#catalog-search').fill('诺伦 时间裂隙');
  ok(await page.locator('.catalog-card').count()===1,'搜索同时匹配角色和技能');
  ok((await page.locator('#catalog-detail').innerText()).includes('时间裂隙'),'角色详情展示基础技能');
  const stages=await page.locator('#catalog-stage option').count();
  await page.locator('#catalog-stage').selectOption(String(stages-1));
  ok((await page.locator('#catalog-stage-description').innerText()).length>0,'成长阶段可切换');
  await page.getByRole('tab',{name:'符文图鉴',exact:true}).click();
  ok((await page.locator('#catalog-summary').innerText()).includes('60 个符文'),'符文列表排除隐藏条目');
  await page.locator('#catalog-category').selectOption('防御符文');
  await page.locator('#catalog-quality').selectOption('7');
  ok(await page.locator('.catalog-card').count()>0,'符文按类型与品质组合筛选');
  await page.locator('#catalog-stage').selectOption('5');
  ok(await page.locator('#catalog-stage option').count()===6,'符文初始及五档星级齐全');
  await page.getByRole('tab',{name:'魔宠图鉴',exact:true}).click();
  await page.locator('#catalog-search').fill('九尾狐');
  ok(await page.locator('.catalog-card').count()===1 && (await page.locator('#catalog-detail').innerText()).includes('流放'),'九尾狐技能和成长说明可查');
  await page.getByRole('tab',{name:'圣物图鉴',exact:true}).click();
  await page.locator('#catalog-search').fill('守护圣盾');
  await page.waitForFunction(()=>{const image=document.querySelector('#catalog-detail .item-icon');return image?.complete&&image.naturalWidth>0;});
  ok(await page.locator('.catalog-card').count()===1,'新增圣物静态贴图完整加载');
  await page.getByRole('tab',{name:'兽印图鉴',exact:true}).click();
  await page.locator('#catalog-search').fill('九尾狐');
  await page.locator('#catalog-rare').check();
  const skills=await page.locator('.catalog-skill').allTextContents();
  ok(skills.length>0&&skills.every(text=>text.includes('稀有')&&text.includes('九尾狐')),'兽印详情只展示匹配的稀有词条');
  await page.getByRole('tab',{name:'角色图鉴',exact:true}).click();
  ok(await page.locator('#catalog-search').inputValue()==='诺伦 时间裂隙','各图鉴分别保留筛选条件');
  await page.locator('#catalog-clear').click();await page.locator('#catalog-next').click();
  const entry=page.locator('.catalog-card').last();
  const id=await entry.getAttribute('data-catalog-entry');await entry.click();
  const shared=page.url();await page.reload();await page.locator('.catalog-card').first().waitFor();
  ok(page.url()===shared&&await page.locator(`[data-catalog-entry="${id}"]`).getAttribute('aria-pressed')==='true','第二页条目链接刷新后直接定位');
  await page.locator('#catalog-clear').click();
  await page.locator('#catalog-search').fill('不存在的角色');
  ok(await page.locator('.catalog-card').count()===0 && await page.locator('#catalog-next').isDisabled(),'空搜索结果有提示且无法翻页');
  await page.locator('#catalog-clear').click();
  for(const width of [320,390,540,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const catalog of ['heroes','runes','pets','artifacts','seals']){
      await page.locator(`[data-catalog="${catalog}"]`).click();
      await page.locator('#catalog-clear').click();
      const layout=await page.evaluate(inspectCatalogLayout);
      ok(layout.issues.length===0,`${width}px ${catalog}：图标、文字、分页及页脚不遮挡；${layout.issues.join('；')}`);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('tab',{name:'角色图鉴',exact:true}).click();
  await page.screenshot({path:'output/playwright/catalog-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1050});
  await page.screenshot({path:'output/playwright/catalog-desktop.png',fullPage:true});
  const failedContext=await page.context().browser().newContext();
  try{
    const failed=await failedContext.newPage();
    await failed.route('**/api/catalogs.json',route=>route.abort());
    await failed.goto(baseURL+'/?view=encyclopedia&catalog=runes');
    await failed.locator('#catalog-retry').waitFor({state:'visible'});
    ok(await failed.locator('#catalog-search').isDisabled(),'数据失败禁用未就绪筛选');
    await failed.unroute('**/api/catalogs.json');await failed.locator('#catalog-retry').click();
    await failed.locator('.catalog-card').first().waitFor();
    ok(await failed.locator('#catalog-search').isEnabled(),'重试成功后恢复筛选');
  }finally{await failedContext.close();}
  // The host antivirus injects its own browser agent; it is absent from the shipped page.
  const hostAgent='gc.kis.v2.scr.kaspersky-labs.com';
  const external=requests.filter(url=>!url.startsWith(baseURL+'/')&&new URL(url).hostname!==hostAgent);
  ok(external.length===0,'页面代码只读取本站公开资源；异常来源：'+[...new Set(external.map(url=>new URL(url).origin))].join(', '));
  ok(errors.length===0,'图鉴流程无脚本错误');
  return {passed:checks.length,checks,errors};
};
