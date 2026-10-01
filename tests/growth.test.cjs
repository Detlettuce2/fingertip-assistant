const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../growth-core.js');
const E=require('../encyclopedia-core.js');
const data=require('../api/growth.json');
const catalog=require('../api/catalogs.json');
const eve=catalog.heroes.find(entry=>entry.name==='伊芙');
const spear=catalog.artifacts.find(entry=>entry.name==='朗基努斯之枪');
const count=(result,id)=>result.costs.find(value=>value.id===id)?.count||0;

test('兽印所有词条关联公开魔宠名称，通用与专属可独立分组',()=>{
  const seal=catalog.seals.find(entry=>entry.quality===8);
  const skills=E.visibleSkills(seal,{...E.freshFilters(),pet:'急救鼠'},true);
  assert(skills.some(E.isCommon));assert(skills.some(skill=>!E.isCommon(skill)));
  assert(skills.every(skill=>skill.pets.length===0||skill.pets.includes('急救鼠')));
  assert(skills.filter(skill=>!E.isCommon(skill)).every(skill=>skill.description.includes('急救鼠')));
  assert(!skills.some(skill=>skill.description.includes('贪食龙')));
  const rare=E.visibleSkills(seal,{...E.freshFilters(),pet:'急救鼠',rareOnly:true},true);
  assert(rare.length>0&&rare.every(E.isRare));
});
test('兽印魔宠筛选与品质、词条搜索组合有效',()=>{
  const filters={...E.freshFilters(),pet:'急救鼠',quality:'8',query:'回复 怒气'};
  const matches=E.filter(catalog.seals,filters);assert.equal(matches.length,1);
  const skills=E.visibleSkills(matches[0],filters,true);assert(skills.length>0);
  assert(skills.every(skill=>skill.description.includes('回复')&&skill.description.includes('怒气')));
  assert(E.facets(catalog.seals,'pet').includes('急救鼠'));
});
test('角色1到2级只计当前等级成本，属性为累计值差',()=>{
  const result=C.hero(data,eve,1,2);
  assert.equal(count(result,3),10);assert.equal(count(result,2),200);assert.equal(count(result,20110101),0);
  assert.deepEqual(result.start,[1941,236,51,51]);assert.deepEqual(result.delta,[31,5,1,1]);
});
test('角色20到21级包含跨越进阶节点的金币与棱晶',()=>{
  const result=C.hero(data,eve,20,21);
  assert.equal(count(result,3),2480);assert.equal(count(result,2),11200);assert.equal(count(result,20110101),50);
  assert.equal(result.startStage,0);assert.equal(result.endStage,1);
});
test('已提前进阶的角色不重复收取节点材料',()=>{
  const result=C.hero(data,eve,20,21,1);
  assert.equal(count(result,2),1200);assert.equal(count(result,20110101),0);
  assert.throws(()=>C.hero(data,eve,41,42,1),/进阶不足/);
});
test('角色1到100级汇总五个进阶节点且包括等级40消耗',()=>{
  const result=C.hero(data,eve,1,100);
  assert.equal(count(result,3),1517150);assert.equal(count(result,2),1121000);assert.equal(count(result,20110101),1850);
  assert.equal(result.crossings.length,5);assert.equal(result.neededStar,5);
  assert.deepEqual(result.end,[16919,2607,496,496]);
  const forty=C.hero(data,eve,40,41);assert.equal(count(forty,3),8700);assert.equal(count(forty,2),24200);assert.equal(count(forty,20110101),100);
});
test('相同等级区间消耗为零且属性无变化',()=>{
  for(const result of [C.hero(data,eve,100,100),C.artifact(data,spear,1000,1000)]){assert.deepEqual(result.costs,[]);assert.deepEqual(result.delta,[0,0,0,0]);assert.equal(result.points.length,1);}
});
test('圣物999到1001级包含1000级觉醒石，目标级成本不计入',()=>{
  const result=C.artifact(data,spear,999,1001);
  assert.equal(count(result,20110401),2010);assert.equal(count(result,20110501),1);
  assert.deepEqual(result.start,[9914721,406758,101689,101689]);assert.deepEqual(result.end,[9928183,407310,101828,101828]);
  assert.equal(count(C.artifact(data,spear,999,1000),20110501),0);
  assert.equal(count(C.artifact(data,spear,1000,1001),20110501),1);
});
test('职业曲线覆盖四类职业且使用各自等级和进阶属性',()=>{
  const curves=C.comparisons(data,1,100);
  assert.deepEqual(curves.map(value=>value.name),['输出','术士','肉盾','辅助']);
  assert(curves.every(value=>value.points.length===100));
  assert(curves[0].points.at(-1).attributes[1]>curves[2].points.at(-1).attributes[1]);
  assert(curves[2].points.at(-1).attributes[2]>curves[0].points.at(-1).attributes[2]);
});
test('等级逆序、小数及超出角色或圣物资料上限均拒绝',()=>{
  for(const [from,to]of [[0,2],[10,9],[1.5,10],[1,NaN],[1,226]])assert.throws(()=>C.hero(data,eve,from,to));
  assert.throws(()=>C.artifact(data,spear,1,2001));
  assert.throws(()=>C.hero(data,eve,1,2,6));
});
test('角色及圣物最高等级均可查询，最后一行不额外收取材料',()=>{
  const maxHero=catalog.heroes.find(entry=>entry.growth.max_level===1500);
  assert.equal(C.hero(data,maxHero,1499,1500).points.at(-1).level,1500);
  assert.equal(C.artifact(data,spear,1999,2000).points.at(-1).level,2000);
  for(const table of [...data.hero_careers,...data.artifact_qualities])assert(table.levels.every((value,i)=>value.level===i+1));
});
test('圣物星级属性独立保存，不叠算为等级数值',()=>{
  assert.equal(spear.growth.stars[0].attributes[0],229580);
  assert.equal(spear.growth.stars[1].all_attributes_percent,20);
  assert.equal(spear.growth.stars.at(-1).star,15);
});
test('十八名星痕角色完整保留1至15阶效果及阶段标签',()=>{
  const heroes=catalog.heroes.filter(entry=>entry.star_traces.length);
  assert.equal(heroes.length,18);
  for(const hero of heroes){assert.equal(hero.faction,'虚空');assert.equal(hero.star_traces.length,15);assert(hero.tags.includes('星痕'));hero.star_traces.forEach((trace,i)=>assert.equal(trace.label,`星痕${i+1}阶`));}
  const norn=heroes.find(entry=>entry.name==='诺伦');
  assert.match(norn.star_traces[2].description,/时间领域/);assert.match(norn.star_traces[14].description,/时间·加速/);
  assert.equal(eve.star_traces.length,0);
});
test('后期成长和星痕筛选组合不混入低上限角色，星痕效果可搜索',()=>{
  const entries=E.filter(catalog.heroes,{...E.freshFilters(),lateOnly:true,traceOnly:true});
  assert.equal(entries.length,18);assert(entries.every(entry=>entry.growth.max_level>1000&&entry.star_traces.length===15));
  const norn=E.filter(catalog.heroes,{...E.freshFilters(),query:'诺伦 时间·加速'});assert.equal(norn.length,1);
});
test('1000级后区间覆盖真实逐级数值，1500级端点及材料完整',()=>{
  const hero=catalog.heroes.find(entry=>entry.name==='狄安娜');
  const interval=C.hero(data,hero,1000,1500);
  assert.equal(interval.points.length,501);assert.equal(interval.points[0].level,1000);assert.equal(interval.points.at(-1).level,1500);
  assert.equal(interval.crossings.length,0);assert.equal(count(interval,20110101),0);
  const parts=[C.hero(data,hero,1000,1200),C.hero(data,hero,1200,1500)];
  for(const id of [2,3])assert.equal(count(interval,id),parts.reduce((sum,result)=>sum+count(result,id),0));
  assert(interval.delta.every(value=>value>0));
});
