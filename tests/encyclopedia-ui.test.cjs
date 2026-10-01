const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const data=require('../api/catalogs.json');
const C=require('../encyclopedia-core.js');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

// DOM doubles cover asynchronous UI behaviour; browser tests cover layout.
function setup({url='http://localhost/?view=encyclopedia',fetcher=async()=>({ok:true,json:async()=>data}),blockedStorage=false}={}){
  const nodes=new Map(),storage=new Map();let requests=0,itemCalls=0;
  class Element{
    constructor(id=''){this.id=id;this.events={};this.dataset={};this.attributes={};this.value='';this.hidden=false;this.children=[];this._html='';this.textContent='';
      const classes=new Set();this.classList={toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)};}
    set innerHTML(value){this._html=value;for(const child of this.children)if(child.id)nodes.delete(child.id);this.children=[];for(const match of value.matchAll(/id="([^"]+)"/g)){const child=new Element(match[1]);nodes.set(child.id,child);this.children.push(child);}}
    get innerHTML(){return this._html;}
    setAttribute(key,value){this.attributes[key]=String(value);}
    addEventListener(name,handler){this.events[name]=handler;}
    click(){if(!this.disabled)return this.events.click?.({target:this});}
    focus(){document.activeElement=this;}
    closest(){return this;}
    scrollIntoView(){this.scrolled=true;}
    querySelectorAll(){return ['search','faction','career','category','quality','rare','clear'].map(id=>nodes.get('catalog-'+id));}
  }
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const match of html.matchAll(/id="((?:catalog-|encyclopedia-)[^"]+)"/g))nodes.set(match[1],new Element(match[1]));
  const tabs=Object.keys(C.TABS).map(key=>{const node=nodes.get('encyclopedia-tab-'+key);node.dataset.catalog=key;return node;});
  const document={getElementById:id=>nodes.get(id),querySelectorAll:()=>tabs};
  const location={href:url};
  const sandbox={document,location,URL,history:{replaceState:(_,__,value)=>location.href=String(value)},Encyclopedia:C,innerWidth:1280,addEventListener:()=>{},matchMedia:()=>({matches:true}),
    itemCardVisual:entry=>`<span class="item-card-visual">${entry.asset_token}</span>`,
    localStorage:{getItem:key=>{if(blockedStorage)throw new Error('blocked');return storage.get(key)||null;},setItem:(key,value)=>{if(blockedStorage)throw new Error('blocked');storage.set(key,value);}},
    fetch:async path=>{requests++;assert.equal(path,'api/catalogs.json');return fetcher();}};
  sandbox.window=sandbox;
  vm.runInNewContext(fs.readFileSync(require.resolve('../encyclopedia.js'),'utf8'),sandbox);
  return {node:id=>nodes.get('catalog-'+id),tabs,location,init:()=>sandbox.EncyclopediaUI.init(()=>itemCalls++),requests:()=>requests,itemCalls:()=>itemCalls};
}

test('物品图鉴复用原入口，其他图鉴共享一次静态读取并保留各自筛选',async()=>{
  const env=setup();env.init();assert.equal(env.itemCalls(),1);assert.equal(env.requests(),0);
  env.tabs[1].click();await flush();assert.equal(env.node('title').textContent,'角色图鉴');
  env.node('search').value='诺伦';env.node('search').events.input();
  assert.match(env.node('summary').textContent,/筛选结果 1 个/);assert.match(env.node('detail').innerHTML,/时间裂隙/);
  env.tabs[2].click();assert.match(env.node('summary').textContent,/收录 60 个符文/);
  env.tabs[1].click();assert.equal(env.node('search').value,'诺伦');
  env.tabs[0].click();assert.equal(env.itemCalls(),2);assert.equal(env.requests(),1);
});

test('条目分享链接第一次异步载入时直接定位到最后一页',async()=>{
  const last=data.heroes.at(-1);
  const env=setup({url:`http://localhost/?view=encyclopedia&catalog=heroes&entry=${last.id}`});env.init();await flush();
  assert.equal(env.node('page').textContent,'第 8 / 8 页');
  assert.match(env.node('detail').innerHTML,new RegExp(last.name));
  assert.equal(new URL(env.location.href).searchParams.get('entry'),String(last.id));
});

test('快速切换分类不会被较早的异步请求覆盖',async()=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);
  const env=setup({fetcher:()=>pending});env.init();env.tabs[1].click();env.tabs[3].click();
  assert.equal(env.node('search').disabled,true);
  finish({ok:true,json:async()=>data});await flush();
  assert.equal(env.requests(),1);assert.equal(env.node('title').textContent,'魔宠图鉴');
  assert.match(env.node('summary').textContent,/收录 16 个魔宠/);assert.equal(env.node('search').disabled,false);
});

test('读取失败可重试，存储被禁用也能使用图鉴',async()=>{
  let fail=true;
  const env=setup({blockedStorage:true,url:'http://localhost/?view=encyclopedia&catalog=runes',fetcher:async()=>{if(fail)throw new Error('offline');return {ok:true,json:async()=>data};}});
  env.init();await flush();assert.equal(env.node('retry').hidden,false);assert.equal(env.node('search').disabled,true);
  fail=false;await env.node('retry').click();assert.equal(env.node('retry').hidden,true);
  assert.equal(env.node('search').disabled,false);assert.match(env.node('summary').textContent,/收录 60 个符文/);
});

test('兽印详情联动关键词与稀有筛选，并可清除',async()=>{
  const env=setup({url:'http://localhost/?view=encyclopedia&catalog=seals'});env.init();await flush();
  env.node('rare').checked=true;env.node('rare').events.change();
  env.node('search').value='九尾狐';env.node('search').events.input();
  assert.ok(!env.node('detail').innerHTML.includes('梦魇'));
  assert.match(env.node('detail').innerHTML,/稀有 · 专属/);
  env.node('clear').click();assert.equal(env.node('search').value,'');assert.equal(env.node('rare').checked,false);
});

test('图鉴文字先转义，键盘方向键可切换子选项',async()=>{
  const payload=structuredClone(data);payload.heroes[0].name='<script>alert(1)</script>';
  const env=setup({fetcher:async()=>({ok:true,json:async()=>payload})});env.init();
  let prevented=false;env.tabs[0].events.keydown({key:'ArrowRight',preventDefault:()=>prevented=true});await flush();
  assert.equal(prevented,true);assert.equal(env.node('title').textContent,'角色图鉴');
  assert.ok(env.node('grid').innerHTML.includes('&lt;script&gt;'));
  assert.ok(!env.node('grid').innerHTML.includes('<script>'));
  assert.ok(!env.node('detail').innerHTML.includes('<script>'));
});
