module.exports = async (page,baseURL) => {
  const checks=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ok=(condition,name)=>{if(!condition)throw new Error(name);checks.push(name);};
  const ready=()=>page.locator('#seal-workspace').waitFor({state:'visible'});
  const settle=()=>page.waitForFunction(()=>document.querySelector('#seal-stop').hidden);
  const total=async()=>Number((await page.locator('#seal-total').innerText()).replaceAll(',',''));
  const startPaused=async()=>{
    await page.evaluate(()=>{
      document.querySelector('#seal-wash').click();
      document.querySelector('#seal-wash').click();
      document.querySelector('.seal-reel-track').getAnimations()[0].pause();
    });
  };
  const sample=async time=>page.evaluate(async time=>{
    const track=document.querySelector('.seal-reel-track');
    track.getAnimations()[0].currentTime=time;
    await new Promise(resolve=>requestAnimationFrame(resolve));
    return new DOMMatrixReadOnly(getComputedStyle(track).transform).m42;
  },time);
  await ready();
  await page.evaluate(()=>{localStorage.removeItem(BeastSeal.STORAGE_KEY);});
  await page.reload();await ready();
  await page.evaluate(()=>{Math.random=()=>0.999999;});
  await startPaused();
  ok(await total()===0,'动画结束前不扣次数');
  ok(await page.locator('.seal-reel-motion').count()===1,'快速双击只生成一个滚轮');
  ok(await page.locator('.seal-reel-track [id]').count()===0,'结果帧没有重复DOM编号');
  ok(await page.locator('.seal-reel-motion').getAttribute('aria-hidden')==='true' && await page.locator('#seal-reel').getAttribute('aria-busy')==='true','装饰滚轮不重复播报且标记忙碌');
  const positions=[];
  for(const time of [0,200,400,1000,1200,1399])positions.push(await sample(time));
  ok(positions.every((position,index)=>index===0||position<positions[index-1]),'词条持续纵向滚动');
  ok(Math.abs(positions[2]-positions[1])>Math.abs(positions[4]-positions[3])*3,'后段速度明显降低');
  const alignment=await page.evaluate(()=>{
    const original=[document.querySelector('#seal-neighbor-before'),document.querySelector('#seal-result'),document.querySelector('#seal-neighbor-after')];
    const clones=[...document.querySelector('.seal-reel-final').children];
    return clones.every((clone,index)=>{
      const a=clone.getBoundingClientRect(),b=original[index].getBoundingClientRect();
      return Math.abs(a.y-b.y)<1 && Math.abs(a.x-b.x)<1 && Math.abs(a.height-b.height)<1;
    });
  });
  ok(alignment,'滚轮最终帧与真实三格位置一致，无停靠跳位');
  await page.screenshot({path:'output/playwright/seal-reel-settling.png',fullPage:true});
  await page.evaluate(()=>document.querySelector('.seal-reel-track').getAnimations()[0].finish());
  await settle();
  ok(await total()===1 && await page.locator('#seal-spent').innerText()==='20','动画完成后仅结算一次');
  ok(await page.locator('.seal-reel-motion').count()===0 && await page.locator('#seal-result').getAttribute('aria-live')==='polite','结束后清理动画并恢复播报');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    await startPaused();
    await sample(1399);
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth && document.querySelector('.seal-reel-final .seal-result p').scrollWidth<=document.querySelector('.seal-reel-final .seal-result p').clientWidth+1),`${width}px动画无横向溢出`);
    await page.locator('#seal-stop').click();await settle();
    ok(await total()===1,`${width}px停止未完成动画不计次`);
  }
  await startPaused();
  await page.setViewportSize({width:390,height:844});await settle();
  ok(await total()===1 && await page.locator('.seal-reel-motion').count()===0,'尺寸变化安全停止并清理滚轮');
  await startPaused();
  await page.getByRole('tab',{name:'指尖百科',exact:true}).click();await settle();
  await page.getByRole('tab',{name:'兽印洗炼',exact:true}).click();
  ok(await total()===1,'切换功能页不结算未完成结果');
  await page.evaluate(async()=>{
    const data=await(await fetch('api/beast-seal.json')).json();
    const session=BeastSeal.freshSession();session.quality=7;
    for(let i=0;i<37;i++)BeastSeal.appendRoll(session,data,()=>0.1);
    localStorage.setItem(BeastSeal.STORAGE_KEY,JSON.stringify(session));
  });
  await page.reload();await ready();
  await page.evaluate(()=>{Math.random=()=>0;});
  await startPaused();await sample(1399);
  ok(await page.locator('.seal-reel-final .is-rare').count()===3,'保底停靠帧同时显示三条稀有');
  await page.evaluate(()=>document.querySelector('.seal-reel-track').getAnimations()[0].finish());await settle();
  ok(await total()===38 && await page.locator('#seal-result-label').innerText()==='软保底出货','彩色新版第38次开始软保底');
  await page.screenshot({path:'output/playwright/seal-reel-pity-mobile.png',fullPage:true});
  const context=await page.context().browser().newContext({reducedMotion:'reduce'});
  try {
    const reduced=await context.newPage();await reduced.goto(baseURL+'/?view=seal');
    await reduced.locator('#seal-workspace').waitFor({state:'visible'});
    await reduced.locator('#seal-wash').click();
    await reduced.waitForFunction(()=>document.querySelector('#seal-stop').hidden);
    ok(await reduced.locator('#seal-total').innerText()==='1' && await reduced.locator('.seal-reel-motion').count()===0,'系统减少动态效果时跳过滚轮');
  } finally {await context.close();}
  ok(errors.length===0,'动画流程无浏览器脚本错误');
  return {passed:checks.length,checks,errors};
};
