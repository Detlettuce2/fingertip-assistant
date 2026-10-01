(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CatalogGrowth=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function range(from,to,max){
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>max)throw new Error(`请输入 1～${max} 的整数等级，目标等级不能小于起始等级。`);
  }
  function difference(a,b){return b.map((value,i)=>value-a[i]);}
  function add(a,b){return a.map((value,i)=>value+b[i]);}
  function sumCosts(rows){
    const totals=new Map();
    for(const row of rows)for(const material of row.materials){
      if(!Number.isSafeInteger(material.count)||material.count<0)throw new Error('材料数据不完整。');
      totals.set(material.id,(totals.get(material.id)||0)+material.count);
    }
    return [...totals].map(([id,count])=>({id,count}));
  }
  function career(data,name){
    const value=data.hero_careers.find(item=>item.name===name);
    if(!value)throw new Error('没有找到该职业的成长资料。');
    return value;
  }
  function minimumStage(table,level){
    const stage=table.stages.find(item=>item.level_limit>=level);
    if(!stage)throw new Error('等级超过资料范围。');
    return stage.stage;
  }
  function hero(data,entry,from,to,currentStage=null){
    const table=career(data,entry.career);
    const max=Math.min(table.levels.length,entry.growth.max_level);
    range(from,to,max);
    const requiredStart=minimumStage(table,from);
    const startStage=currentStage===null?requiredStart:currentStage;
    if(!Number.isInteger(startStage)||startStage<requiredStart||!table.stages[startStage])throw new Error('当前进阶不足以支持起始等级。');
    const endStage=Math.max(startStage,minimumStage(table,to));
    const crossings=table.stages.slice(startStage,endStage);
    const levelCosts=sumCosts(table.levels.slice(from-1,to-1));
    const stageCosts=sumCosts(crossings);
    const costs=sumCosts([{materials:levelCosts},{materials:stageCosts}]);
    // Level and stage tables are cumulative; do not sum their attribute rows.
    const point=(level)=>{
      const stage=Math.max(startStage,minimumStage(table,level));
      const attributes=add(table.levels[level-1].attributes,table.stages[stage].attributes);
      return {level,stage,attributes:add(entry.growth.initial_attributes,attributes)};
    };
    const points=Array.from({length:to-from+1},(_,i)=>point(from+i));
    const start=points[0],end=points.at(-1);
    const neededStar=data.hero_limits.find(item=>item.max_level>=to)?.star;
    return {from,to,costs,levelCosts,stageCosts,crossings,startStage,endStage,neededStar,points,start:start.attributes,end:end.attributes,delta:difference(start.attributes,end.attributes)};
  }
  function artifact(data,entry,from,to){
    const table=data.artifact_qualities.find(item=>item.quality===entry.quality);
    if(!table)throw new Error('没有找到该品质的圣物成长资料。');
    range(from,to,Math.min(table.levels.length,entry.growth.max_level));
    const points=table.levels.slice(from-1,to).map(item=>({level:item.level,attributes:item.attributes}));
    const start=points[0].attributes,end=points.at(-1).attributes;
    return {from,to,points,start,end,delta:difference(start,end),costs:sumCosts(table.levels.slice(from-1,to-1))};
  }
  function comparisons(data,from,to,currentStage=null){
    range(from,to,Math.min(...data.hero_careers.map(item=>item.levels.length)));
    return data.hero_careers.map(table=>{
      const stage=currentStage===null?minimumStage(table,from):currentStage;
      if(stage<minimumStage(table,from)||!table.stages[stage])throw new Error('当前进阶不正确。');
      return {name:table.name,points:Array.from({length:to-from+1},(_,i)=>{
        const level=from+i;
        return {level,attributes:add(table.levels[level-1].attributes,table.stages[Math.max(stage,minimumStage(table,level))].attributes)};
      })};
    });
  }
  return {range,difference,sumCosts,career,minimumStage,hero,artifact,comparisons};
});
