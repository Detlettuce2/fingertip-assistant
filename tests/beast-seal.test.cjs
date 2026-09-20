const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../api/beast-seal.json');
const C = require('../beast-seal-core.js');

test('官方数据完整，按兽印品质筛选词条并使用对应消耗', () => {
  assert.equal(Object.keys(data[6]).length, 429);
  for (const [quality, count, cost] of [[6,72,6],[7,99,12],[8,111,20]]) {
    assert.equal(C.pool(data, quality).length, count);
    assert.equal(C.cost(data, quality), cost);
    assert.ok(C.pool(data, quality).every(x => x.c2o3lor === quality));
  }
  assert.throws(() => C.pool(data, 5));
});

test('官方分类概率和分组边界正确', () => {
  const groups = C.distribution(data, 8);
  assert.ok(Math.abs(groups.reduce((sum,g)=>sum+g.probability,0)-1)<1e-12);
  assert.deepEqual(groups.map(g=>g.entries.length), [6,28,44,33]);
  for (const [value, expected] of [[0,'generalRare'],[0.002499,'generalRare'],[0.0025,'general'],[0.4082,'exclusiveRare'],[0.4287,'exclusive'],[0.999999,'exclusive']]) {
    let first = true;
    const skill = C.roll(data,8,C.SPECS[8].weights,()=>first?(first=false,value):0);
    assert.equal(C.category(skill,8),expected);
  }
});

test('无效概率数据和随机数不能产生结果', () => {
  for(const weights of [{}, {general:0,exclusive:0}, {general:-1,exclusive:100}, {general:NaN,exclusive:10}, {general:Infinity,exclusive:1}]) assert.throws(()=>C.validateWeights(6,weights));
  for(const value of [-1,1,NaN,Infinity]) assert.throws(()=>C.roll(data,8,C.SPECS[8].weights,()=>value));
});

test('一次洗炼只产生一个词条，跨品质统计、出货及材料准确', () => {
  const s=C.freshSession();
  C.appendRoll(s,data,()=>0,1000);
  s.quality=6;
  C.appendRoll(s,data,()=>0,2000);
  s.quality=7;
  C.appendRoll(s,data,()=>0.99,3000);
  assert.equal(C.current(s).n,3);
  assert.equal(C.current(s,8).n,1);
  assert.deepEqual(C.stats(s,data),{total:3,spent:38,rare:2,sinceRare:1,byQuality:{6:1,7:1,8:1},dryByQuality:{6:0,7:1,8:0}});
  assert.equal(s.draws.length,3);
});

test('彩色约20次、绿色约42次的软保底曲线正确', () => {
  assert.equal(C.pityBoost(6,100),0);
  assert.equal(C.pityBoost(7,17),0);
  assert.equal(C.pityBoost(7,18),1/6);
  assert.equal(C.pityBoost(7,20),1/2);
  assert.equal(C.pityBoost(7,22),5/6);
  assert.equal(C.pityBoost(7,23),1);
  assert.equal(C.pityBoost(8,39),0);
  assert.equal(C.pityBoost(8,40),1/6);
  assert.equal(C.pityBoost(8,42),1/2);
  assert.equal(C.pityBoost(8,44),5/6);
  assert.equal(C.pityBoost(8,45),1);
});

test('软保底触发会产出稀有并按兽印分别重置计数', () => {
  const s=C.freshSession();
  s.quality=7;
  for(let i=0;i<17;i++) assert.equal(C.appendRoll(s,data,()=>0.1).skill.r2a3re,0);
  assert.equal(C.pityStreak(s,data,7),17);
  const pity=C.appendRoll(s,data,()=>0,18000);
  assert.equal(pity.skill.r2a3re,1);
  assert.equal(pity.pityTriggered,true);
  assert.equal(pity.draw.pityAttempt,18);
  assert.equal(C.pityStreak(s,data,7),0);
  s.quality=8;
  for(let i=0;i<10;i++) C.appendRoll(s,data,()=>0.1);
  s.quality=7;
  for(let i=0;i<5;i++) C.appendRoll(s,data,()=>0.1);
  assert.equal(C.pityStreak(s,data,7),5);
  assert.equal(C.pityStreak(s,data,8),10);
  const natural=C.appendRoll(s,data,()=>0);
  assert.equal(natural.skill.r2a3re,1);
  assert.equal(natural.pityTriggered,false);
  assert.equal(C.pityStreak(s,data,7),0);
  assert.equal(C.pityStreak(s,data,8),10);
});

test('连续未出时彩色最迟第23次、绿色最迟第45次必出稀有', () => {
  for(const [quality, hard] of [[7,23],[8,45]]) {
    const s=C.freshSession();s.quality=quality;
    for(let attempt=1;attempt<hard;attempt++) {
      const result=C.appendRoll(s,data,()=>0.999999,attempt);
      assert.equal(result.skill.r2a3re,0,`${quality} 品质第 ${attempt} 次应继续未出`);
    }
    const result=C.appendRoll(s,data,()=>0.999999,hard);
    assert.equal(result.skill.r2a3re,1);
    assert.equal(result.pityTriggered,true);
    assert.equal(result.draw.pityAttempt,hard);
  }
});

test('锁定和容量上限不增加次数或消耗',()=>{
  const s=C.freshSession();s.locked[8]=true;
  assert.throws(()=>C.appendRoll(s,data));assert.equal(s.draws.length,0);
  s.locked[8]=false;s.draws.length=C.LIMIT;
  assert.throws(()=>C.appendRoll(s,data));assert.equal(s.draws.length,C.LIMIT);
});

test('刷新还原时恢复官方概率，CSV 保留软保底标记',()=>{
  const s=C.freshSession(); C.appendRoll(s,data,()=>0,1000);
  s.weights[8]={generalRare:0,general:100,exclusiveRare:0,exclusive:0};
  const restored=C.restore(JSON.stringify(s),data);
  assert.deepEqual(restored.weights[8],C.SPECS[8].weights);
  restored.quality=7;
  for(let i=0;i<17;i++) C.appendRoll(restored,data,()=>0.1,2000+i);
  C.appendRoll(restored,data,()=>0,3000);
  const again=C.restore(JSON.stringify(restored),data);
  assert.equal(again.draws.at(-1).pity,true);
  assert.equal(again.draws.at(-1).pityAttempt,18);
  const csv=C.csv(again,data);
  assert.equal(csv.split('\r\n').length,20);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('软保底触发'));
  assert.ok(csv.includes('是（连续第 18 次）'));
});

test('损坏、伪造或版本不兼容的存档明确报错',()=>{
  assert.throws(()=>C.restore('{broken',data));
  for(const mutate of [s=>s.version=2,s=>s.quality=5,s=>s.quality='8',s=>s.draws[0].skillId=999999,s=>s.draws[0].cost=0,s=>s.draws[0].n=3,s=>s.target=1017,s=>s.profiles={},s=>s.draws[0].pity=false,s=>{s.draws[0].pity=true;s.draws[0].pityAttempt=1;}]){
    const s=C.freshSession();C.appendRoll(s,data,()=>0);mutate(s);
    assert.throws(()=>C.restore(JSON.stringify(s),data));
  }
});

test('固定种子十万次抽样符合官方分类概率且所有结果均来自词条池',()=>{
  let seed=123456789;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const counts={};const allowed=new Set(C.pool(data,8).map(s=>s.s2k3ill_id));
  for(let i=0;i<100000;i++){const skill=C.roll(data,8,C.SPECS[8].weights,random);assert.ok(allowed.has(skill.s2k3ill_id));const key=C.category(skill,8);counts[key]=(counts[key]||0)+1;}
  for(const g of C.distribution(data,8)){const sigma=Math.sqrt(100000*g.probability*(1-g.probability));assert.ok(Math.abs(counts[g.key]-100000*g.probability)<6*sigma, g.key);}
});
