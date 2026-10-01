const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../api/catalogs.json');
const C = require('../encyclopedia-core.js');

test('百科有六个独立子选项，非法链接回到物品图鉴',()=>{
  assert.deepEqual(Object.keys(C.TABS),['items','heroes','runes','pets','artifacts','seals']);
  for(const value of [null,'','config','__proto__','../heroes'])assert.equal(C.normalizeTab(value),'items');
  assert.equal(C.normalizeTab('runes'),'runes');
});

test('角色可按阵营与定位组合筛选，关键词覆盖技能和成长描述',()=>{
  const filters={...C.freshFilters(),faction:'虚空',career:'术士'};
  const results=C.filter(data.heroes,filters);
  assert.ok(results.length>0);
  assert.ok(results.every(entry=>entry.faction==='虚空'&&entry.career==='术士'));
  const norn=C.filter(data.heroes,{...C.freshFilters(),query:'诺伦 时间裂隙'});
  assert.equal(norn.length,1);assert.equal(norn[0].name,'诺伦');
  assert.ok(C.filter(data.heroes,{...C.freshFilters(),query:'效果抵抗'}).length>0);
  assert.equal(C.filter(data.heroes,{...C.freshFilters(),query:'没有这位角色'}).length,0);
});

test('符文图鉴有初始和1至5星效果，类型和品质可组合筛选',()=>{
  const results=C.filter(data.runes,{...C.freshFilters(),category:'防御符文',quality:'7'});
  assert.ok(results.length>0);
  assert.ok(results.every(entry=>entry.category==='防御符文'&&entry.quality===7));
  for(const rune of data.runes){
    assert.equal(rune.progression.length,6,rune.name);
    assert.equal(rune.progression[0].label,'初始');
    assert.equal(rune.progression.at(-1).label,'5 星');
  }
});

test('九尾狐包含公开流放与觉醒说明，圣物包含成长效果',()=>{
  const fox=C.filter(data.pets,{...C.freshFilters(),query:'九尾狐'})[0];
  assert.match(fox.skills[0].description,/流放/);
  assert.ok(fox.progression.some(stage=>stage.label.includes('觉醒')&&stage.description.includes('灵狐印记')));
  assert.ok(data.artifacts.every(entry=>entry.skills.length>0&&entry.progression.length>0));
});

test('兽印稀有筛选只返回含稀有词条的品质，公开词条共429条',()=>{
  assert.equal(data.seals.reduce((sum,entry)=>sum+entry.skills.length,0),429);
  const results=C.filter(data.seals,{...C.freshFilters(),rareOnly:true});
  assert.ok(results.length>0);
  assert.ok(results.every(entry=>entry.skills.some(C.isRare)));
  assert.ok(C.filter(data.seals,{...C.freshFilters(),query:'九尾狐'}).length>0);
  const filters={...C.freshFilters(),query:'九尾狐',rareOnly:true};
  const phoenix=data.seals.find(entry=>entry.name==='焚焰凤·兽印');
  const skills=C.visibleSkills(phoenix,filters,true);
  assert.ok(skills.length>0);
  assert.ok(skills.every(skill=>C.isRare(skill)&&skill.description.includes('九尾狐')));
});

test('分页在无结果和越界情况下稳定，并展示最后一个条目',()=>{
  const empty=C.page([],999,0);assert.equal(empty.number,1);assert.equal(empty.pages,1);assert.deepEqual(empty.entries,[]);
  const last=C.page(data.heroes,999,12);assert.equal(last.number,last.pages);assert.ok(last.entries.includes(data.heroes.at(-1)));
  const first=C.page(data.heroes,-3,6);assert.equal(first.number,1);assert.equal(first.entries.length,6);
  assert.deepEqual(C.facets(data.heroes,'faction'),['奥术','霜寒','熔火','虚空','自然'].sort((a,b)=>a.localeCompare(b,'zh-CN')));
});
