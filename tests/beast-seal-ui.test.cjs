const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../beast-seal-core.js');
const data = require('../api/beast-seal.json');

// Minimal DOM/WAAPI doubles exercise the real UI controller, not browser layout.
async function setup({saved, reduced=false, unsupported=false, animationError=false, random=()=>0.1}={}) {
  const animations=[], windowEvents={}, documentEvents={}, storage=new Map();
  let randomCalls=0;
  if(saved)storage.set(C.STORAGE_KEY,JSON.stringify(saved));
  class Element {
    constructor(id='') {
      this.attributes={};this.children=[];this.events={};this.style={};this.dataset={};
      this.textContent='';this.value='';this.hidden=false;this.offsetHeight=182;
      if(id)this.attributes.id=id;
      const classes=new Set();
      this.classList={add:(...items)=>items.forEach(x=>classes.add(x)),remove:(...items)=>items.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on;}};
      Object.defineProperty(this,'className',{get:()=>[...classes].join(' '),set:value=>{classes.clear();value.split(/\s+/).filter(Boolean).forEach(x=>classes.add(x));}});
      if(unsupported)this.animate=undefined;
    }
    setAttribute(key,value){this.attributes[key]=String(value);}
    getAttribute(key){return this.attributes[key]??null;}
    removeAttribute(key){delete this.attributes[key];}
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
    querySelectorAll(selector){return this.children.flatMap(x=>[...(selector==='[id]'&&x.getAttribute('id')?[x]:[]),...x.querySelectorAll(selector)]);}
    cloneNode(deep){const clone=new Element();clone.attributes={...this.attributes};clone.className=this.className;clone.textContent=this.textContent;if(deep)clone.append(...this.children.map(x=>x.cloneNode(true)));return clone;}
    addEventListener(name,handler){this.events[name]=handler;}
    click(){if(!this.disabled)return this.events.click?.({target:this});}
    animate(keyframes,options){
      if(animationError)throw new Error('animation unavailable');
      let resolve,reject,settled=false;
      const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const animation={element:this,keyframes,options,finished,finish(){settled=true;resolve();},cancel(){if(!settled){settled=true;reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));}}};
      animations.push(animation);return animation;
    }
  }
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const ids=new Map([...html.matchAll(/id="(seal-[^"]+)"/g)].map(x=>[x[1],new Element(x[1])]));
  const node=id=>ids.get('seal-'+id);
  const qualities=[6,7,8].map(quality=>{const el=new Element();el.dataset.sealQuality=String(quality);return el;});
  node('history-filter').value='all';node('batch-count').value='10';
  node('result').className='seal-result';
  node('neighbor-before').className=node('neighbor-after').className='seal-reel-neighbor';
  node('result').append(node('result-label'),node('result-text'),node('result-id'));
  node('reel').append(node('neighbor-before'),node('result'),node('neighbor-after'));
  const document={hidden:false,getElementById:id=>ids.get(id),createElement:()=>new Element(),addEventListener:(key,fn)=>documentEvents[key]=fn,querySelectorAll:selector=>selector==='[data-seal-close]'?[]:selector==='[data-seal-quality]'?qualities:[...qualities,...[...ids.values()].filter(el=>selector.split(',').map(x=>x.trim()).includes('#'+el.getAttribute('id')))]};
  const sandbox={document,BeastSeal:C,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},fetch:async()=>({ok:true,json:async()=>data}),setTimeout,matchMedia:()=>({matches:reduced}),confirm:()=>true,addEventListener:(key,fn)=>windowEvents[key]=fn,Math:Object.assign(Object.create(Math),{random:()=>{randomCalls++;return random();}})};
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../beast-seal-core.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../beast-seal.js'),'utf8'),sandbox);
  await sandbox.BeastSealUI.init();
  return {node,animations,windowEvents,documentEvents,document,ui:sandbox.BeastSealUI,saved:()=>JSON.parse(storage.get(C.STORAGE_KEY)||'null'),randomCalls:()=>randomCalls};
}

test('真实UI滚轮逐条纵向滚动，停止在结果帧且仅完成后结算一次',async()=>{
  const env=await setup();
  const done=env.node('wash').click();
  assert.equal(env.node('total').textContent,'0');
  assert.equal(env.node('reel').getAttribute('aria-busy'),'true');
  assert.equal(env.node('result').getAttribute('aria-live'),'off');
  assert.equal(env.animations.length,1);
  assert.equal(env.node('wash').click(),undefined);
  const animation=env.animations[0];
  assert.equal(animation.options.duration,1400);
  assert.match(animation.options.easing,/cubic-bezier/);
  assert.equal(animation.keyframes[1].transform,'translate3d(0, -2304px, 0)');
  assert.equal(animation.element.children.length,13);
  assert.equal(animation.element.querySelectorAll('[id]').length,0);
  assert.equal(env.randomCalls(),2,'cosmetic frames must not consume draw randomness');
  animation.finish();await done;
  assert.equal(env.saved().draws.length,1);
  assert.equal(env.node('spent').textContent,'20');
  assert.equal(env.node('reel').children.length,3);
  assert.equal(env.node('reel').getAttribute('aria-busy'),null);
  assert.equal(env.node('result').getAttribute('aria-live'),'polite');
});

test('手动停止、离开功能页、后台与尺寸变化取消未完成结果且不扣材料',async()=>{
  for(const stop of [env=>env.node('stop').click(),env=>env.ui.stop(),env=>{env.document.hidden=true;env.documentEvents.visibilitychange();},env=>env.windowEvents.resize()]){
    const env=await setup();const done=env.node('wash').click();
    stop(env);await done;
    assert.equal(env.saved().draws.length,0);
    assert.equal(env.node('spent').textContent,'0');
    assert.equal(env.node('result-label').textContent,'等待洗炼');
    assert.equal(env.node('reel').children.length,3);
    assert.equal(env.node('wash').disabled,false);
  }
});

test('动画中另一页面同步不会被待结算结果覆盖',async()=>{
  const env=await setup();const done=env.node('wash').click();
  const peer=C.freshSession();peer.quality=6;C.appendRoll(peer,data,()=>0.1,1000);
  env.windowEvents.storage({key:C.STORAGE_KEY,newValue:JSON.stringify(peer)});
  await done;
  assert.deepEqual(env.saved().draws,peer.draws);
  assert.equal(env.node('total').textContent,'1');
  assert.equal(env.node('spent').textContent,'6');
});

test('减少动态效果、跳过动画与不支持WAAPI时直接结算',async()=>{
  for(const options of [{reduced:true},{unsupported:true},{saved:Object.assign(C.freshSession(),{skip:true})}]){
    const env=await setup(options);await env.node('wash').click();
    assert.equal(env.animations.length,0);
    assert.equal(env.saved().draws.length,1);
    assert.equal(env.node('reel').getAttribute('aria-busy'),null);
  }
});

test('动画异常恢复界面且不结算未完成洗炼',async()=>{
  const env=await setup({animationError:true});await env.node('wash').click();
  assert.equal(env.saved().draws.length,0);
  assert.equal(env.node('reel').children.length,3);
  assert.equal(env.node('result').getAttribute('aria-live'),'polite');
  assert.equal(env.node('reel').getAttribute('aria-busy'),null);
  assert.match(env.node('status').textContent,/animation unavailable/);
});

test('连续动画使用短滚轮，保底结果三稀有同屏且只结算中间词条',async()=>{
  const saved=C.freshSession();saved.quality=7;
  for(let i=0;i<37;i++)C.appendRoll(saved,data,()=>0.1,1000+i);
  const env=await setup({saved,random:()=>0});
  const done=env.node('batch-start').click();
  const animation=env.animations[0];
  assert.equal(animation.options.duration,760);
  const final=animation.element.children.at(-1);
  assert.equal(final.children.length,3);
  assert.ok(final.children.every(el=>el.classList.contains('is-rare')));
  assert.notEqual(final.children[0].textContent,final.children[2].textContent);
  assert.equal(env.node('result').classList.contains('is-pity'),false);
  animation.finish();await done;
  assert.equal(env.saved().draws.length,38);
  assert.equal(env.saved().draws.at(-1).pityAttempt,38);
  assert.equal(env.node('result').classList.contains('is-pity'),true);
  assert.equal(env.node('result-label').textContent,'软保底出货');
  assert.equal(env.node('spent').textContent,'456');
});
