(function(){
  'use strict';
  const C=window.CatalogGrowth;
  const panel=document.getElementById('catalog-growth');
  const $=id=>document.getElementById('growth-'+id);
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const number=value=>Number(value).toLocaleString('zh-CN');
  const materialNames={2:'金币',3:'英雄经验',20110101:'升阶棱晶',20110401:'圣物之晶',20110501:'圣物觉醒石'};
  const materialUnits={2:{divisor:1e8,label:'亿',decimals:8},3:{divisor:1e8,label:'亿',decimals:8},20110401:{divisor:1e4,label:'万',decimals:4}};
  const materialUnit=id=>materialUnits[id]?.label||'个';
  const materialAmount=(id,value)=>{const unit=materialUnits[id];return unit?(value/unit.divisor).toLocaleString('zh-CN',{maximumFractionDigits:unit.decimals}):number(value);};
  const materialText=(id,value)=>materialAmount(id,value)+' '+materialUnit(id);
  const colors=['#0e766e','#4c78b5','#ac6740','#8764a8'];
  const states=new Map();
  let data=null,pending=null,entry=null,kind=null,result=null,tablePage=1;
  function preference(){
    const key=kind+':'+entry.id;
    const late=kind==='heroes'&&entry.growth.max_level>1000;
    if(!states.has(key))states.set(key,{from:late?1000:1,to:late?entry.growth.max_level:Math.min(100,entry.growth.max_level),stage:'auto',attribute:0,compare:false,star:0,cursor:0});
    return states.get(key);
  }
  async function load(){
    if(data)return data;
    if(pending)return pending;
    pending=(async()=>{
      const response=await fetch('api/growth.json');
      if(!response.ok)throw new Error('HTTP '+response.status);
      const value=await response.json();
      if(value.attributes?.length!==4||value.hero_careers?.length!==4||value.artifact_qualities?.length!==3)throw new Error('成长资料不完整');
      data=value;return value;
    })();
    try{return await pending;}finally{pending=null;}
  }
  function costs(values){
    const order=kind==='heroes'?[3,2,20110101]:[20110401,20110501];
    return order.map(id=>{const count=values.find(value=>value.id===id)?.count||0;return `<div data-growth-material="${id}"><span>${materialNames[id]}</span><strong data-raw-count="${count}" title="原始数量：${number(count)}">${materialAmount(id,count)}</strong><small>${materialUnit(id)}</small></div>`;}).join('');
  }
  function calculate(){
    const state=preference();
    try{
      result=kind==='heroes'?C.hero(data,entry,state.from,state.to,state.stage==='auto'?null:Number(state.stage)):C.artifact(data,entry,state.from,state.to);
      tablePage=1;state.cursor=Math.min(state.cursor,result.points.length-1);
      $('error').textContent='';$('results').hidden=false;
      $('export').disabled=false;
      $('materials').innerHTML=costs(result.costs);
      $('range-summary').textContent=`${entry.name} · ${state.from} → ${state.to} 级 · 升级 ${state.to-state.from} 次`;
      $('attributes').innerHTML=`<thead><tr><th>属性</th><th>起始</th><th>目标</th><th>提升</th></tr></thead><tbody>${data.attributes.map((name,i)=>`<tr><th>${name}</th><td>${number(result.start[i])}</td><td>${number(result.end[i])}</td><td class="growth-positive">+${number(result.delta[i])}</td></tr>`).join('')}</tbody>`;
      if(kind==='heroes'){
        $('stage-summary').textContent=`进阶：${result.startStage} → ${result.endStage} 阶。达到目标至少需要资料内 ${result.neededStar} 星档位；升星消耗另计。`;
        $('crossings').innerHTML=result.crossings.length?`<summary>进阶节点与材料（${result.crossings.length} 次）</summary><ul>${result.crossings.map(stage=>`<li>${stage.level_limit} 级节点：${stage.stage} → ${stage.stage+1} 阶 · ${stage.materials.map(value=>`${materialNames[value.id]} ${materialText(value.id,value.count)}`).join('、')}</li>`).join('')}</ul>`:'<summary>本区间无需追加进阶</summary>';
        $('cost-breakdown').textContent=`金币拆分：等级升级 ${materialText(2,result.levelCosts.find(value=>value.id===2)?.count||0)} + 进阶 ${materialText(2,result.stageCosts.find(value=>value.id===2)?.count||0)}。`;
        const lateStart=Math.max(1000,result.from),steps=[];
        for(let level=lateStart;level<result.to;level+=100){const end=Math.min(level+100,result.to),a=result.points[level-result.from].attributes,b=result.points[end-result.from].attributes;steps.push(`<li><strong>${level} → ${end} 级</strong><span>生命 +${number(b[0]-a[0])} · 攻击 +${number(b[1]-a[1])}</span></li>`);}
        $('late-steps').innerHTML=steps.length?'<h4>1000级后分段增量</h4><ul>'+steps.join('')+'</ul>':'';
      }
      $('cursor').max=result.points.length-1;$('cursor').value=state.cursor;
      renderChart();renderTable();renderStar();
    }catch(error){
      result=null;$('error').textContent=error.message;$('results').hidden=true;$('export').disabled=true;
    }
  }
  function short(value){return value>=1e8?(value/1e8).toFixed(1)+'亿':value>=1e4?(value/1e4).toFixed(1)+'万':number(Math.round(value));}
  function series(){
    const state=preference();
    return kind==='heroes'&&state.compare?C.comparisons(data,state.from,state.to,state.stage==='auto'?null:Number(state.stage)):[{name:entry.name,points:result.points}];
  }
  function renderChart(){
    if(!result||panel.hidden)return;
    const state=preference(),lines=series(),width=Math.max(320,$('chart').clientWidth||640),height=265;
    const left=68,right=20,top=22,bottom=44,plotWidth=width-left-right,plotHeight=height-top-bottom;
    const maximum=Math.max(1,...lines.flatMap(line=>line.points.map(point=>point.attributes[state.attribute])));
    const x=level=>left+(result.to===result.from?plotWidth/2:(level-result.from)/(result.to-result.from)*plotWidth);
    const y=value=>top+(1-value/maximum)*plotHeight;
    let elements='';
    for(let i=0;i<=4;i++){
      const value=maximum*i/4,position=y(value);
      elements+=`<line x1="${left}" y1="${position}" x2="${width-right}" y2="${position}" stroke="#e5edf5"/><text x="${left-10}" y="${position+4}" text-anchor="end">${short(value)}</text>`;
    }
    const levels=[...new Set(Array.from({length:5},(_,i)=>Math.round(result.from+(result.to-result.from)*i/4)))];
    for(const level of levels)elements+=`<text x="${x(level)}" y="${height-15}" text-anchor="middle">${level}级</text>`;
    lines.forEach((line,i)=>{
      const points=line.points.map(point=>x(point.level).toFixed(2)+','+y(point.attributes[state.attribute]).toFixed(2)).join(' ');
      elements+=`<polyline points="${points}" fill="none" stroke="${colors[i]}" stroke-width="2.5" stroke-linejoin="round"/>`;
      const point=line.points[state.cursor];
      elements+=`<circle cx="${x(point.level)}" cy="${y(point.attributes[state.attribute])}" r="4" fill="${colors[i]}"/>`;
    });
    const cursor=result.from+state.cursor;
    elements+=`<line x1="${x(cursor)}" y1="${top}" x2="${x(cursor)}" y2="${height-bottom}" stroke="#93a6bc" stroke-dasharray="4 4"/>`;
    $('chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(data.attributes[state.attribute])}随等级成长曲线"><g font-family="Microsoft YaHei, sans-serif" font-size="12" fill="#657b96">${elements}</g></svg>`;
    $('legend').innerHTML=lines.map((line,i)=>`<span><i style="background:${colors[i]}"></i>${escape(line.name)}：${number(line.points[state.cursor].attributes[state.attribute])}</span>`).join('');
    $('cursor-label').textContent=`查看 ${cursor} 级${kind==='heroes'?' · '+result.points[state.cursor].stage+' 阶':''}`;
    $('chart-note').textContent=kind==='heroes'?(state.compare?'四职业对比仅展示等级与进阶基础属性，不含各角色初值、星级和星痕天赋加成。':'曲线包含角色初值、等级和当前／所需进阶基础属性；不含星级倍率、星痕天赋、被动、装备或阵营加成。'):'曲线展示该品质圣物的等级基础属性；星级属性独立列示，不与角色面板叠算。';
  }
  function renderStar(){
    if(kind!=='artifacts'||!result)return;
    const star=entry.growth.stars.find(value=>value.star===preference().star);
    $('star-attributes').textContent=star?data.attributes.map((name,i)=>`${name} ${number(star.attributes[i])}`).join(' · ')+` · 星级全属性加成 ${star.all_attributes_percent}%`:'没有该星级资料。';
  }
  function renderTable(){
    if(!result)return;
    const start=(tablePage-1)*20,rows=result.points.slice(start,start+20),pages=Math.ceil(result.points.length/20);
    $('level-table').innerHTML=`<thead><tr><th>等级</th>${kind==='heroes'?'<th>进阶</th>':''}${data.attributes.map(name=>`<th>${name}</th>`).join('')}</tr></thead><tbody>${rows.map(point=>`<tr><td>${point.level}</td>${kind==='heroes'?`<td>${point.stage}</td>`:''}${point.attributes.map(value=>`<td>${number(value)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('table-page').textContent=`第 ${tablePage} / ${pages} 页`;
    $('table-prev').disabled=tablePage<=1;$('table-next').disabled=tablePage>=pages;
  }
  function exportCSV(){
    if(!result)return;
    const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
    const scope=kind==='heroes'?'角色初值、等级及进阶基础属性；不含星级、星痕和其他加成。'+(entry.star_traces?.length?'虚空等级通过链接同步，材料为同等级培养参考。':''):'圣物等级基础属性，不含星级和角色面板加成。';
    const rows=[['条目',entry.name],['升级区间',`${result.from} → ${result.to} 级`],['属性口径',scope],['材料','原始数量','显示数量','单位'],...result.costs.map(value=>[materialNames[value.id],value.count,materialAmount(value.id,value.count),materialUnit(value.id)]),[],['等级',...(kind==='heroes'?['进阶']:[]),...data.attributes],...result.points.map(point=>[point.level,...(kind==='heroes'?[point.stage]:[]),...point.attributes])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`${entry.name}-${result.from}至${result.to}级成长.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function form(){
    const state=preference(),hero=kind==='heroes';
    const ranges=hero&&entry.growth.max_level>1000?[[1000,Math.min(1200,entry.growth.max_level)],[1200,entry.growth.max_level],[1000,entry.growth.max_level],[1,100]].filter(([from,to])=>from<to):[[1,Math.min(100,entry.growth.max_level)]];
    panel.innerHTML=`<div class="growth-heading"><div><span class="eyebrow">成长规划</span><h3 id="growth-title">${escape(entry.name)} · ${hero?'角色升级':'圣物成长'}查询</h3><p>指定等级区间，查询材料投入与属性变化。</p></div><button id="growth-export" type="button" class="secondary-button">导出 CSV</button></div>
      <form id="growth-form" class="growth-form"><label>起始等级<input id="growth-from" type="number" min="1" max="${entry.growth.max_level}" step="1" value="${state.from}" required></label><label>目标等级<input id="growth-to" type="number" min="1" max="${entry.growth.max_level}" step="1" value="${state.to}" required></label>${hero?`<label>当前进阶<select id="growth-stage"><option value="auto">按起始等级最低进阶</option>${Array.from({length:6},(_,i)=>`<option value="${i}">${i} 阶</option>`).join('')}</select></label>`:''}<button type="submit" class="primary-button">计算区间</button></form>
      <div class="growth-presets" role="group" aria-label="快捷升级区间">${ranges.map(([from,to])=>`<button type="button" class="secondary-button" data-growth-range="${from},${to}">${from} → ${to} 级</button>`).join('')}${hero&&entry.growth.max_level<=1000?'<button id="growth-show-late" class="text-button" type="button">查看支持1000级后成长的角色</button>':''}</div>
      <p class="growth-scope">${hero?`职业：${escape(entry.career)}。此角色资料上限 ${entry.growth.max_level} 级；超过进阶节点时计入升阶棱晶与金币。${entry.star_traces?.length?'虚空角色通过链接同步等级与星级，材料为同等级培养参考，星痕升阶另计。':''}`:'升级材料使用资料中的「圣物之晶」和「圣物觉醒石」，并非角色经验或通用进阶石。'}从 N 级升到 M 级，计入 N 至 M−1 级的升级消耗。</p><p id="growth-error" role="alert"></p>
      <div id="growth-results"><p id="growth-range-summary" class="growth-range-summary"></p><div id="growth-materials" class="growth-materials"></div>${hero?'<p id="growth-stage-summary" class="growth-scope"></p><p id="growth-cost-breakdown" class="growth-scope"></p><details id="growth-crossings" class="growth-crossings"></details>':''}
      <p class="growth-attributes-hint">左右滑动可查看完整属性数值</p><div class="growth-attributes-wrap"><table id="growth-attributes" class="growth-table"></table></div>
      <div class="growth-chart-controls"><label>成长曲线<select id="growth-attribute">${data.attributes.map((name,i)=>`<option value="${i}">${name}</option>`).join('')}</select></label>${hero?'<label class="growth-checkbox"><input id="growth-compare" type="checkbox"> 对比四种职业</label>':''}</div>
      <div id="growth-chart" class="growth-chart"></div><div id="growth-legend" class="growth-legend"></div><label class="growth-cursor"><span id="growth-cursor-label"></span><input id="growth-cursor" type="range" min="0" max="99" value="0" step="1"></label><p id="growth-chart-note" class="growth-scope"></p>
      ${hero?'':`<div class="growth-star"><label>星级基础属性<select id="growth-star">${entry.growth.stars.map(value=>`<option value="${value.star}">${value.star} 星</option>`).join('')}</select></label><p id="growth-star-attributes"></p><small>星级固定，升级材料不包含升星消耗；等级与星级效果分别展示。</small></div>`}
      ${hero?'<section id="growth-late-steps" class="growth-late-steps"></section>':''}<details class="growth-details"><summary>逐级属性明细</summary><div class="growth-table-scroll"><table id="growth-level-table" class="growth-table"></table></div><div class="growth-pagination"><button id="growth-table-prev" type="button" class="secondary-button">上一页</button><span id="growth-table-page"></span><button id="growth-table-next" type="button" class="secondary-button">下一页</button></div></details></div>`;
    if(hero){$('stage').value=state.stage;$('compare').checked=state.compare;}
    else $('star').value=state.star;
    $('attribute').value=state.attribute;
    $('form').addEventListener('submit',event=>{event.preventDefault();state.from=Number($('from').value);state.to=Number($('to').value);if(hero)state.stage=$('stage').value;state.cursor=0;calculate();});
    $('form').addEventListener('input',()=>{$('results').hidden=true;$('export').disabled=true;});
    panel.querySelectorAll('[data-growth-range]').forEach(button=>button.addEventListener('click',()=>{const[from,to]=button.dataset.growthRange.split(',').map(Number);state.from=from;state.to=to;state.stage='auto';state.cursor=0;$('from').value=from;$('to').value=to;if(hero)$('stage').value='auto';calculate();}));
    $('show-late')?.addEventListener('click',()=>window.EncyclopediaUI.showLateGrowth());
    $('attribute').addEventListener('change',()=>{state.attribute=Number($('attribute').value);renderChart();});
    $('compare')?.addEventListener('change',()=>{state.compare=$('compare').checked;renderChart();});
    $('star')?.addEventListener('change',()=>{state.star=Number($('star').value);renderStar();});
    $('cursor').addEventListener('input',()=>{state.cursor=Number($('cursor').value);renderChart();});
    $('export').addEventListener('click',exportCSV);
    $('table-prev').addEventListener('click',()=>{tablePage--;renderTable();});
    $('table-next').addEventListener('click',()=>{tablePage++;renderTable();});
    calculate();
  }
  function mount(value,tab){
    const previous=entry?.id,previousKind=kind;entry=value;kind=tab;
    panel.hidden=!value?.growth||!['heroes','artifacts'].includes(tab);
    if(panel.hidden){result=null;return;}
    if(data){if(previous!==entry.id||previousKind!==kind||!$('form'))form();return;}
    panel.innerHTML='<h3 id="growth-title">成长查询</h3><p role="status">正在读取成长资料…</p>';
    load().then(()=>{if(!panel.hidden)form();}).catch(()=>{
      if(panel.hidden)return;
      panel.innerHTML='<h3 id="growth-title">成长查询</h3><p role="status">成长资料读取失败，请重试。</p><button id="growth-retry" type="button" class="secondary-button">重新加载成长资料</button>';
      $('retry').addEventListener('click',()=>mount(entry,kind));
    });
  }
  window.addEventListener('resize',()=>{if(result&&!panel.hidden)renderChart();});
  window.CatalogGrowthUI={mount};
})();
