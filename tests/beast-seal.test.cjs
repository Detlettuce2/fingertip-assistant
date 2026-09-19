const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../api/beast-seal.json');
const C = require('../beast-seal-core.js');

test('Config 提取完整，按兽印品质筛选词条并使用真实消耗', () => {
  assert.equal(Object.keys(config[6]).length, 429);
  for (const [quality, count, cost] of [[6,72,6],[7,99,12],[8,111,20]]) {
    assert.equal(C.pool(config, quality).length, count);
    assert.equal(C.cost(config, quality), cost);
    assert.ok(C.pool(config, quality).every(x => x.c2o3lor === quality));
  }
  assert.throws(() => C.pool(config, 5));
});
test('归一化权重和分组概率边界正确，零权重组不会抽中', () => {
  const groups = C.distribution(config, 8);
  assert.ok(Math.abs(groups.reduce((sum,g)=>sum+g.probability,0)-1)<1e-12);
  assert.deepEqual(groups.map(g=>g.entries.length), [6,28,44,33]);
  for (const [value, expected] of [[0,'generalRare'],[0.002499,'generalRare'],[0.0025,'general'],[0.4082,'exclusiveRare'],[0.4287,'exclusive'],[0.999999,'exclusive']]) {
    let first = true;
    const skill = C.roll(config,8,C.SPECS[8].weights,()=>first?(first=false,value):0);
    assert.equal(C.category(skill,8),expected);
  }
  assert.equal(C.category(C.roll(config,8,{generalRare:0,general:0,exclusiveRare:0,exclusive:100},()=>0),8),'exclusive');
});
test('无效权重和随机数不能产生结果', () => {
  for(const weights of [{}, {general:0,exclusive:0}, {general:-1,exclusive:100}, {general:NaN,exclusive:10}, {general:Infinity,exclusive:1}]) assert.throws(()=>C.validateWeights(6,weights));
  for(const value of [-1,1,NaN,Infinity]) assert.throws(()=>C.roll(config,8,C.SPECS[8].weights,()=>value));
});
test('一次洗炼只产生一个词条，跨品质统计、出货及材料准确', () => {
  const s=C.freshSession();
  C.appendRoll(s,config,()=>0,1000);
  s.quality=6;
  C.appendRoll(s,config,()=>0,2000);
  s.quality=7;
  C.appendRoll(s,config,()=>0.99,3000);
  assert.equal(C.current(s).n,3);
  assert.equal(C.current(s,8).n,1);
  assert.deepEqual(C.stats(s,config),{total:3,spent:38,rare:2,sinceRare:1,byQuality:{6:1,7:1,8:1}});
  assert.equal(s.draws.length,3);
});
test('锁定和容量上限不增加次数或消耗',()=>{
  const s=C.freshSession();s.locked[8]=true;
  assert.throws(()=>C.appendRoll(s,config));assert.equal(s.draws.length,0);
  s.locked[8]=false;s.draws.length=C.LIMIT;
  assert.throws(()=>C.appendRoll(s,config));assert.equal(s.draws.length,C.LIMIT);
});
test('刷新还原、历史概率快照与 CSV 导出完整',()=>{
  const s=C.freshSession(); C.appendRoll(s,config,()=>0,1000);
  s.weights[8]={generalRare:0,general:100,exclusiveRare:0,exclusive:0};
  C.appendRoll(s,config,()=>0,2000);
  const restored=C.restore(JSON.stringify(s),config);
  assert.deepEqual(restored,s);
  assert.equal(restored.profiles[restored.draws[0].profile].weights.generalRare,0.25);
  assert.equal(restored.profiles[restored.draws[1].profile].weights.generalRare,0);
  const csv=C.csv(restored,config);assert.equal(csv.split('\r\n').length,3);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes(config[6][1018].d2e3sc));
});
test('损坏、伪造或版本不兼容的存档明确报错',()=>{
  assert.throws(()=>C.restore('{broken',config));
  for(const mutate of [s=>s.version=2,s=>s.quality=5,s=>s.quality='8',s=>s.draws[0].skillId=999999,s=>s.draws[0].cost=0,s=>s.draws[0].n=3,s=>s.target=1017,s=>s.profiles={}]){
    const s=C.freshSession();C.appendRoll(s,config,()=>0);mutate(s);
    assert.throws(()=>C.restore(JSON.stringify(s),config));
  }
});
test('固定种子十万次抽样符合模拟分组权重且所有结果均来自词条池',()=>{
  let seed=123456789;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Fixed seed keeps the distribution check reproducible across test runs.
  const counts={};const allowed=new Set(C.pool(config,8).map(s=>s.s2k3ill_id));
  for(let i=0;i<100000;i++){const skill=C.roll(config,8,C.SPECS[8].weights,random);assert.ok(allowed.has(skill.s2k3ill_id));const key=C.category(skill,8);counts[key]=(counts[key]||0)+1;}
  for(const g of C.distribution(config,8)){const sigma=Math.sqrt(100000*g.probability*(1-g.probability));assert.ok(Math.abs(counts[g.key]-100000*g.probability)<6*sigma, g.key);}
});
