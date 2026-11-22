const D=window.NIKKI;
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=x=>x?.split('.').at(-1)?.split('/').at(-1)??'—';
const list=o=>Object.entries(o??{});
const value=x=>typeof x==='number'?String(+x.toPrecision(6)):Array.isArray(x)?x.map(value).join(', '):String(x??'—').replace(/^<\w+\.|: \d+>$/g,'');
const rows=o=>list(o).map(([k,v])=>`<div class="row"><span>${esc(k)}</span><code>${esc(value(v))}</code></div>`).join('')||'<p>无记录</p>';
const badge=s=>`<span class="badge">${esc(s)}</span>`;
const box=(title,body,open=false)=>`<details ${open?'open':''}><summary>${title}</summary>${body}</details>`;
const pre=o=>`<pre>${esc(JSON.stringify(o,null,2))}</pre>`;
const action=(label,tab,key)=>`<button data-tab="${tab}" data-key="${esc(key)}">${esc(label)}</button>`;
const assetPath=k=>`<p class="path">${esc(k)}</p>`;
const assetByPkg=Object.fromEntries(list(D.assets).map(([k,v])=>[v.package,k]));
const slotRows=D.components.flatMap(c=>c.slots.map(s=>({...s,component:c.name,visible:c.visible})));
const slotsUsing=k=>slotRows.filter(s=>s.material===k);
const engineTextureRefs=k=>list(D.assets).filter(([a,o])=>a!==k&&o.dependencies.includes(D.assets[k]?.package));
const usedBy=k=>list(D.materials).flatMap(([m,o])=>o.parameters.texture.filter(t=>t.value===k).map(t=>[m,t.name]));
const categories={'材质图解':'guide','部件与槽位':'parts','材质与节点':'materials','纹理与通道':'textures','渲染对照':'render','灯光与后期':'scene','工程清单':'inventory'};
const labels={front:'正面 · Lit',reverse:'背面 · Lit',BaseColor:'基础色',Normal:'法线',Roughness:'粗糙度',Metallic:'金属度',Specular:'高光系数',ShadingModel:'着色模型',Opacity:'不透明度',SubsurfaceColor:'次表面颜色',SeparateTranslucencyRGB:'单独半透明 RGB',DetailLighting:'细节光照',Unlit:'无光照模式',SceneDepth:'场景深度',ShaderComplexity:'着色复杂度','face-Lit':'面部 · Lit','face-BaseColor':'面部 · 基础色','face-Normal':'面部 · 法线','face-Roughness':'面部 · 粗糙度'};
const families={Skin:'脸与身体共用皮肤母材质。检查 SkinFace / SkinBody 的 BaseColor、法线、LightMap_Spec_Rough_3S、SSS 与唇妆有效值，母材质使用 Subsurface Profile。',Eye:'EyeIris、EyePupil、EyeMask、EyeLightA/B 与 Matcap 组成眼球的多个输入。角膜的 TearsMask 在独立半透明材质中。',CorneaBlur:'眼表是独立半透明层，检查 TearsMask、MF_UV 与输出图。GBuffer 图只能解释该缓冲记录的内容。',Hair:'Hair 着色模型配合 Masked、双面、HairNormal、HairROA 与 HairColorMask。遮罩边缘与高光方向可对照 Lit 和 Normal。',Clothes:'服装母材质复用基础纹理、掩码、细节与平铺法线、额外染色、Matcap。各实例的纹理和静态开关决定生效分支。',Feather:'独立半透明、双面羽毛材质，直接连接多个 Material Property，包括 Opacity 和 Subsurface Color。',Color:'调色材质含 MF_Matcap 和纹理对象参数。',Brow:'眉毛为独立半透明层，含 Brow、MF_UV 与 MF_Color。',Eyelash:'睫毛为 Masked，使用 Eyelash 纹理。'};
let state={tab:'guide',query:'',filter:'all',key:'',a:'front',b:'BaseColor',channel:'RGB',lesson:'Skin',lessonA:'',lessonB:'',onlyDiff:true,layout:'pair'};
function jump(tab,key=''){
  state={...state,tab,key,query:'',filter:'all',channel:'RGB'};
  draw();
  if(key||tab==='render')$('workbench').scrollIntoView({block:'start'});
}
function controls(placeholder,options){
  return `<div class="bar"><input id="query" type="search" placeholder="${esc(placeholder)}" aria-label="搜索" value="${esc(state.query)}"><select id="filter" aria-label="筛选">${options.map(([k,v])=>`<option value="${esc(k)}" ${state.filter===k?'selected':''}>${esc(v)}</option>`).join('')}</select>${state.key?'<button data-clear="true">显示全部</button>':''}</div><div id="results"></div>`;
}
const title=(h,t)=>`<h2>${h}</h2><p class="lead">${t}</p>`;
const contains=(...parts)=>parts.some(p=>String(p??'').toLowerCase().includes(state.query.toLowerCase()));
function parts(){
  return D.components.map(c=>{
    const slots=c.slots.filter(s=>contains(c.name,s.slot,s.material,s.meshDefault)&&
      (state.filter==='all'||(state.filter==='override'&&s.differs)||(state.filter==='grid'&&name(s.material)==='WorldGridMaterial')));
    if(!slots.length)return '';
    return box(`${esc(c.name)} ${badge(slots.length+' / '+c.slots.length+' 槽')}`,assetPath(c.mesh)+box('组件渲染标记',rows({...c.settings,visible:c.visible}))+
      slots.map(s=>box(`槽 ${s.index} · ${esc(s.slot)} → ${esc(name(s.material))} ${s.differs?badge('覆盖'):''}`,`<div class="connect">${assetPath(s.material)}<p>网格默认值 · ${esc(name(s.meshDefault))}</p>${action('打开材质','materials',s.material)}${isolatedButton(s.material)}</div>`)).join(''),true);
  }).join('');
}
function linkedDeps(k){
  return (D.assets[k]?.dependencies??[]).map(pkg=>{
    const asset=assetByPkg[pkg];
    const tab=D.textures[asset]?'textures':D.materials[asset]||D.graphs[asset]?'materials':'';
    return `<div class="row"><span class="path">${esc(pkg)}</span>${tab?action('查看',tab,asset):''}</div>`;
  }).join('')||'<p>无依赖记录</p>';
}
function materialCard(k){
  const m=D.materials[k],g=D.graphs[k];
  const n=name(k);
  const actual=slotsUsing(k);
  const family=Object.keys(families).find(x=>name(m?.parent||k)==='M_Nikki_'+x);
  const parameterGroups=list(m?.parameters).map(([kind,pp])=>box(`${kind} · ${pp.length}`,pp.map(p=>{
    const explicit=m.overrides[kind]?.some(q=>q.name===p.name);
    return `<div class="row"><span>${esc(p.name)} ${explicit?badge('实例覆盖'):''}</span>${kind==='texture'&&p.value?action(name(p.value),'textures',p.value):`<code>${esc(value(p.value))}</code>`}</div>`;
  }).join('')||'<p>无参数</p>'));
  return box(`${esc(n)} ${badge(D.assets[k]?.type||'材质')}${actual.length?badge(actual.length+' 个槽引用'):''}`,
    assetPath(k)+isolatedButton(k)+(family?`<p>${esc(lessonFor(family)?.summary??families[family])}</p><button data-lesson="${family}">查看材质图解</button>`:'')+
    (m?.parent?`<div class="row"><span>父材质</span>${action(name(m.parent),'materials',m.parent)}</div>`:'')+
    (actual.length?box('关卡槽位反查',actual.map(s=>`<div class="row"><span>${esc(s.component)} · ${esc(s.slot)}</span><code>#${s.index}</code></div>`).join('')):'')+
    (m?box('渲染属性与实例基类覆盖',rows(D.instanceRender?.[k]?.effective??m.settings)+box('此资产显式覆盖',rows(D.instanceRender?.[k]?.overrides))+box('渲染属性来源',rows(D.instanceRender?.[k]?.origin)),!m.parent)+
      box('有效参数值 · 纹理 / 静态开关 / 标量 / 向量',parameterGroups.join(''),!!m.parent)+
      box('实例存储的覆盖记录',pre(m.overrides))+
      (m.usedTextures.length?box('母材质 GetUsedTextures 结果',m.usedTextures.map(t=>action(name(t),'textures',t)).join(' ')):''):'')+
    (g?.available?window.NikkiGraph.render(g,k,{open:!!state.key}):'')+box('资产注册表包依赖',linkedDeps(k)),!!state.key);
}
function materials(){
  const keys=[...new Set([...Object.keys(D.materials),...Object.keys(D.graphs)])];
  return keys.filter(k=>{
    const m=D.materials[k];
    return (!state.key||state.key===k)&&contains(k,m?.parent,JSON.stringify(m?.parameters??{}))&&
      (state.filter==='all'||(state.filter==='slot'&&slotsUsing(k).length)||(state.filter==='master'&&m&&!m.parent)||(state.filter==='instance'&&m?.parent)||(state.filter==='function'&&!m));
  }).map(materialCard).join('');
}
function textureCard(k,t){
  const file=D.images[k]?.file;
  const users=usedBy(k), refs=engineTextureRefs(k);
  return `<article class="card">${file?`<img class="thumb" loading="lazy" data-zoom src="${file}" alt="${esc(name(k))}">`:''}
    <h3>${esc(name(k))}</h3>${!state.key&&file?action("拆开 RGBA","textures",k):""}<p>${t.width??'?'} × ${t.height??'?'} · ${t.settings.srgb?'sRGB':'线性'}</p>
    ${box('引用与导入属性',assetPath(k)+rows(t.settings)+
    box(`有效参数引用 · ${users.length}`,users.map(([m,p])=>`<div class="row"><span>${esc(p)}</span>${action(name(m),'materials',m)}</div>`).join('')||'<p>无采集到的参数引用</p>')+
    box(`直接包依赖反查 · ${refs.length}`,refs.map(([m])=>`<div class="row"><span class="path">${esc(m)}</span>${D.materials[m]||D.graphs[m]?action('查看','materials',m):''}</div>`).join('')||'<p>无直接包引用</p>'),!!state.key)}
    ${state.key&&file?`<div class="bar" id="channels">${['RGB','R','G','B','A'].map(ch=>`<button data-channel="${ch}">${ch}</button>`).join('')}</div><img id="channel-view" class="thumb" data-zoom alt="纹理通道图">`:''}</article>`;
}
function textures(){
  return '<div class="grid">'+list(D.textures).filter(([k,t])=>(!state.key||state.key===k)&&contains(k,JSON.stringify(t.settings))&&
   (state.filter==='all'||(state.filter==='linear'&&!t.settings.srgb)||(state.filter==='srgb'&&t.settings.srgb)||(state.filter==='unmapped'&&!usedBy(k).length&&!engineTextureRefs(k).length)))
   .map(([k,t])=>textureCard(k,t)).join('')+'</div>';
}
function inventory(){
  return '<div>'+D.source.inventory.filter(x=>contains(x.path,x.type)&&(state.filter==='all'||x.type===state.filter)).map(x=>{
    const k=assetByPkg[x.path];
    return `<div class="row"><span class="path">${esc(x.path)}</span>${badge(x.type)}${D.materials[k]?action('查看','materials',k):D.textures[k]?action('查看','textures',k):''}</div>`;
  }).join('')+'</div>';
}
function scene(){
  return title('灯光与后期','当前 Character 关卡的灯光与后期覆盖，以及 Testitem 的项目渲染配置。')+
    D.lighting.map(a=>box(esc(a.label),rows(a.actor)+a.components.map(c=>box(esc(c.class),rows(c.properties))).join(''))).join('')+
    box('项目渲染变量 · DefaultEngine.ini',rows(D.renderer),true);
}
const views={guide:lessonsView,
  parts:()=>title('从部件打开材质槽','选择网格组件，展开槽位，再进入当前材质及父级。组件值与网格资产默认值不同的槽标为覆盖。')+controls('搜索组件、槽名或材质',[['all','全部槽'],['override','仅覆盖'],['grid','WorldGridMaterial']]),
  materials:()=>title('从实例追到节点','查看有效参数和父级关系。母材质可以按输出递归追踪，也能按节点和函数逐层打开。资产引用可包含未参与当前渲染的分支。')+controls('搜索材质、父级或参数',[['all','全部材质和函数'],['slot','关卡槽正在引用'],['master','母材质'],['instance','材质实例'],['function','材质函数']]),
  textures:()=>title('纹理、通道与反向引用','查看 UE 导出的纹理、导入属性和两种反向引用。选中单张纹理可以拆开 RGB / R / G / B / A。通道图以导出 PNG 为源。')+controls('搜索纹理、压缩或分组',[['all','全部色彩空间'],['srgb','sRGB'],['linear','线性'],['unmapped','无已采集引用']]),
  render:renderView,scene,
  inventory:()=>title('Nikki 文件夹资产清单','目录内资产按注册表类型筛选。材质和纹理可跳到详细证据。')+controls('搜索工程资产',[['all','全部类型'],...[...new Set(D.source.inventory.map(a=>a.type))].sort().map(t=>[t,t])])
};
const generators={parts,materials,textures,inventory};
function channel(){
  const item=D.images[state.key], img=$('channel-view');
  if(!item||!img)return;
  document.querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('active',b.dataset.channel===state.channel));
  img.src=state.channel==='RGB'?item.file:item.channels?.[state.channel]??item.file;
  img.alt=name(state.key)+' · '+state.channel;
}
function refresh(){
  const target=$('results');
  if(target){ const html=generators[state.tab](); target.innerHTML=html&&html!=='<div class="grid"></div>'&&html!=='<div></div>'?html:'<p>没有符合条件的结果。</p>'; channel(); target.querySelectorAll('.nikki-graph[open]').forEach(window.NikkiGraph.mount); }
}
function draw(){
  $('tabs').innerHTML=list(categories).map(([label,key])=>`<button aria-selected="${state.tab===key}" data-tab="${key}">${label}</button>`).join('');
  $('panel').innerHTML=views[state.tab]();
  $('query')?.addEventListener('input',e=>{state.query=e.target.value;refresh();});
  $('filter')?.addEventListener('change',e=>{state.filter=e.target.value;refresh();});
  if(state.tab==='render'){
    for(const [id,side] of [['left','a'],['right','b']]){
      $(id).value=state[side];
      $(id).onchange=e=>{state[side]=e.target.value;renderCaptureStage();};
    }
    $('view-layout').value=state.layout;
    renderCaptureStage();
  }
  refresh();
}
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('img[data-zoom]')){e.preventDefault();zoomImage(e.target);}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(b?.dataset.lesson){
    state.lesson=b.dataset.lesson;state.lessonA='';state.lessonB='';
    jump('guide');
    document.querySelector(`[data-lesson="${state.lesson}"]`)?.focus({preventScroll:true});
  }
  if(b?.dataset.isolate){
    const row=D.layerEvidence.materials.find(x=>x.key===b.dataset.isolate);
    if(row){
      window.NikkiLayers.select(row.family,row.key);
      state.lesson=row.family==='Other'?'Skin':row.family;state.lessonA='';state.lessonB='';jump('guide');
      const layer=document.querySelector(`.nikki-layers[data-nl-family="${row.family}"]`);
      if(row.family==='Other'&&layer?.parentElement.tagName==='DETAILS')layer.parentElement.open=true;
      layer?.scrollIntoView({block:'start'});
    }
  }
  if(b?.dataset.lessonNode){
    jump('materials',b.dataset.key);
    window.NikkiGraph.openNode(document.querySelector('.nikki-graph'),Number(b.dataset.lessonNode));
  }
  if(b?.dataset.tab)jump(b.dataset.tab,b.dataset.key);
  if(b?.dataset.clear)jump(state.tab);
  if(b?.dataset.preset){[state.a,state.b]=b.dataset.preset.split(',');jump('render');}
  if(b?.dataset.grid){jump('parts');state.filter='grid';draw();}
  if(b?.dataset.channel){state.channel=b.dataset.channel;channel();}
  if(e.target.matches('img[data-zoom]'))zoomImage(e.target);
});
$('metrics').innerHTML=[[D.components.length,'角色网格组件'],[slotRows.length,'关卡材质槽'],[Object.keys(D.materials).length,'材质与实例'],[Object.keys(D.textures).length,'纹理资产']].map(([n,l])=>`<span><strong>${n}</strong>${l}</span>`).join('');
wireStudio();
draw();



