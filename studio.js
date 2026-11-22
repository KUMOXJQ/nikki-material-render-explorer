const CHAPTERS={
  Skin:{label:'皮肤与妆容',shot:'face-Lit',compare:'face-BaseColor',sample:['BaseColor','Normal','LightMap_Spec_Rough_3S','SSS','LipstickMask']},
  Eye:{label:'眼球与高光',shot:'face-Lit',compare:'face-Specular',sample:['EyeIris','EyePupil','EyeMask','EyeLightA','EyeLightB','EyeIrisNormal']},
  CorneaBlur:{label:'角膜与泪线',shot:'face-Lit',compare:'face-SeparateTranslucencyRGB',sample:['TearsMask']},
  Hair:{label:'发片与遮罩',shot:'face-Lit',compare:'face-ShadingModel',sample:['Hair','HairNormal','HairROA','HairColorMask']},
  Brow:{label:'眉片与透明度',shot:'face-Lit',compare:'face-BaseColor',sample:['Brow']},
  Eyelash:{label:'睫毛与裁切',shot:'face-Lit',compare:'face-Opacity',sample:['Eyelash']},
  Clothes:{label:'礼服与织纹',shot:'dress-Lit',compare:'dress-Roughness',sample:['Clothes','ClothesM','ClothesNormal','ClothesDeal','ClothesDealNormal','ClothesTileNormal','Matcap (T2d)']},
  Color:{label:'染色与 Matcap',shot:'dress-Lit',compare:'dress-Metallic',sample:['Matcap (T2d)']},
  Feather:{label:'羽毛与半透明',shot:'dress-Lit',compare:'dress-SeparateTranslucencyRGB',sample:['Feather','FeatherNormal','FeatherAddColor']}
};
const MODE_TEXT={
  Lit:'完整光照输出，包含场景光源、阴影与后期。',
  BaseColor:'查看表面的底色。位于独立半透明通道的部分需要结合对应缓冲查看。',
  Normal:'查看世界法线方向的显示编码。观察发丝与织纹时，留意细小方向变化。',
  Roughness:'查看粗糙度的显示映射。光滑区域通常形成更集中的高光。',
  Metallic:'查看金属度的显示映射，可用于定位布料和金属装饰的差异。',
  Specular:'查看 GBuffer 的 Specular 输入。成片里的眼部亮点还可能来自底色接线。',
  ShadingModel:'颜色编码着色模型。可结合母材质设置查看 Hair 与 Subsurface Profile。',
  Opacity:'引擎可视化的不透明度目标，和源纹理的 Alpha 属于不同层级。',
  SeparateTranslucencyRGB:'检查单独半透明目标中的色彩。具体覆盖取决于材质的 Translucency Pass。',
  ShaderComplexity:'用颜色观察相对复杂度，画面颜色不提供绝对 GPU 时间。'
};
const frameLabels={full:'正面全身',face:'面部特写',dress:'礼服特写',rear:'背面全身',beauty:'稳定光照'};
const lessonFor=key=>D.lessons?.[key];
const masterFor=family=>Object.keys(D.materials).find(k=>name(k)==='M_Nikki_'+family);
const instancesFor=master=>list(D.materials).filter(([,m])=>m.parent===master).map(([k])=>k);
const captureLabel=(k,v=D.captures[k])=>{
  if(v?.variant==='native')return (labels[k.replace(/-native$/,'')]??((frameLabels[v.framing]??'UE')+' · '+v.mode))+' · 单帧';
  return labels[k]??((frameLabels[v?.framing]??'UE')+' · '+v?.mode);
};
const captureOptions=()=>list(D.captures).filter(([,v])=>v.file).map(([k,v])=>`<option value="${esc(k)}">${esc(captureLabel(k,v))} · ${v.width??'—'}×${v.height??'—'}</option>`).join('');
const textureDimensions=k=>[D.textures[k]?.width,D.textures[k]?.height].filter(Boolean).join(' × ');
const displaySize=c=>c?.width?c.width+' × '+c.height:'';
function evidenceImg(key,options={}){
  const c=D.captures[key];
  if(!c?.file)return '';
  return `<img ${options.lazy?'loading="lazy"':''} ${options.overlay?'class="wipe-b"':''} tabindex="0" role="button" data-zoom data-full="${esc(c.file)}" data-size="${displaySize(c)}" src="${esc(c.preview||c.file)}" alt="${esc(captureLabel(key,c))}">`;
}
function evidenceCard(key,chapter=false){
  const c=D.captures[key];
  if(!c?.file)return '<p>该视图暂无捕捉图。</p>';
  return `<figure class="capture-shell ${chapter?'chapter-image':''}">${evidenceImg(key)}
    <figcaption class="capture-meta"><strong>${esc(captureLabel(key,c))}</strong><span>${displaySize(c)}${c.frameCount?' · '+c.frameCount+' 帧合成':''} · 点击放大</span><a href="${esc(c.file)}" target="_blank" rel="noopener">原图 PNG ↗</a></figcaption>
    ${chapter?'':`<p>${esc(MODE_TEXT[c.mode]??'')}</p>`+
    box('捕捉来源',rows({方法:c.method,机位:frameLabels[c.framing]??c.framing,分辨率:displaySize(c),关卡:c.metadata?.world?.mapPath})+
    pre({camera:c.camera,warnings:c.warnings,frameCount:c.frameCount}))}</figure>`;
}
function textureEvidence(family,instance){
  const m=D.materials[instance];
  if(!m)return '';
  const meaningful=CHAPTERS[family].sample;
  const params=m.parameters.texture.filter(p=>D.images[p.value]).sort((a,b)=>(meaningful.includes(b.name)?1:0)-(meaningful.includes(a.name)?1:0));
  return `<div class="render-texture-grid">${params.map(p=>{
    const file=D.images[p.value].file;
    return `<article class="card"><img src="${esc(file)}" class="thumb" tabindex="0" role="button" data-zoom data-full="${esc(file)}" data-size="${esc(textureDimensions(p.value))}" loading="lazy" alt="${esc(p.name)}">
      ${action(p.name,'textures',p.value)}<small>${esc(name(p.value))}</small></article>`;
  }).join('')}</div>`;
}
function pickFor(family,key,other=false){
  const keys=instancesFor(masterFor(family));
  const preferred={
    Skin:['MI_Nikki_SkinFace','MI_Nikki_SkinBody'],
    Clothes:['MI_Nikki_ClothesA','MI_Nikki_ClothesA1']
  }[family];
  return keys.includes(key)?key:keys.find(k=>name(k)===preferred?.[Number(other)])??keys[Number(other)]??keys[0]??masterFor(family);
}
function enumLabel(val){
  return String(val??'—').replace(/^<[^.]+\./,'').replace(/: \d+>$/,'').replace(/^BLEND_/,'').replace(/^MSM_/,'');
}
function renderAttrs(key){
  const item=D.instanceRender?.[key];
  if(item)return item.effective??item;
  const m=D.materials[key];
  const b=D.materials[m?.parent??key]?.settings??{};
  return {blend_mode:b.blend_mode,shading_model:b.shading_model,two_sided:b.two_sided};
}
function displayParam(kind,x){
  if(kind==='texture'&&x)return action(name(x),'textures',x);
  if(typeof x==='boolean')return x?'开':'关';
  return esc(value(x));
}
function matrix(family,a,b){
  if(!a||!b)return '';
  const ma=D.materials[a],mb=D.materials[b];
  function tr(group,k,x,y){
    const diff=JSON.stringify(x)!==JSON.stringify(y);
    if(state.onlyDiff&&!diff)return '';
    return `<tr class="${diff?'delta':''}"><td>${esc(group)}</td><td>${esc(k)}</td><td>${displayParam(group,x)}</td><td>${displayParam(group,y)}</td></tr>`;
  }
  const ar=renderAttrs(a),br=renderAttrs(b);
  const props=[...new Set([...Object.keys(ar),...Object.keys(br)])].filter(k=>typeof ar[k]!=='object'||ar[k]===null);
  const body=props.map(k=>tr('渲染属性',k,typeof ar[k]==='string'?enumLabel(ar[k]):ar[k],typeof br[k]==='string'?enumLabel(br[k]):br[k])).join('')+
    ['static_switch','texture','scalar','vector'].map(group=>{
      const pa=Object.fromEntries(ma.parameters[group].map(p=>[p.name,p.value]));
      const pb=Object.fromEntries(mb.parameters[group].map(p=>[p.name,p.value]));
      return [...new Set([...Object.keys(pa),...Object.keys(pb)])].map(k=>tr(group,k,pa[k],pb[k])).join('');
    }).join('');
  return `<div class="matrix-scroll"><table class="matrix"><thead><tr><th>类型</th><th>参数</th><th>${esc(name(a))}</th><th>${esc(name(b))}</th></tr></thead><tbody>${body||'<tr><td colspan="4">这两个实例没有采集到值差异。</td></tr>'}</tbody></table></div>`;
}
const PACKED={
  Skin:['LightMap_Spec_Rough_3S',{R:'高光系数',G:'粗糙度',B:'SSS 权重 → Opacity 输入'}],
  Hair:['HairROA',{R:'粗糙度',G:'环境遮蔽',B:'Opacity 与 Opacity Mask'}],
  Eye:['EyeMask',{R:'R 路染色',G:'G 路染色',B:'B 路染色'}],
  CorneaBlur:['TearsMask',{G:'当前有效 Opacity'}],
  Brow:['Brow',{A:'眉片 Opacity'}],
  Eyelash:['Eyelash',{A:'睫毛 Opacity Mask'}],
  Clothes:['ClothesM',{R:'金属度 · 开关启用时',G:'粗糙度 · 可反相'}],
  Feather:['Feather',{R:'基础色染色权重',G:'环境遮蔽',B:'粗糙度与高光',A:'Opacity / Opacity Mask'}]
};
function packedEvidence(family,key){
  const table=PACKED[family];
  if(!table)return '';
  const [param,channels]=table;
  const tex=D.materials[key].parameters.texture.find(t=>t.name===param)?.value;
  if(!tex||!D.images[tex]?.channels)return '';
  return `<div class="report-block"><h3>${esc(param)} · 通道接到哪里</h3><p class="lead">${esc(name(tex))} · ${textureDimensions(tex)}${family==='Clothes'?' · 实际分支请对照所选实例的 ClothesMTex_?。':''}</p>
    <div class="render-texture-grid packed">${list(channels).map(([ch,label])=>{
      const source=D.images[tex].channels[ch];
      return `<figure class="card"><img src="${esc(source)}" class="thumb" tabindex="0" role="button" data-zoom data-full="${esc(source)}" alt="${esc(param+' · '+ch)}">
        <figcaption><strong>${ch}</strong> ${esc(label)}</figcaption></figure>`;
    }).join('')}</div></div>`;
}
function instancePanel(family){
  const keys=instancesFor(masterFor(family));
  if(!keys.length)return '';
  const a=pickFor(family,state.lessonA), b=pickFor(family,state.lessonB,true);
  const select=(id,k)=>`<select id="${id}" aria-label="${id==='instance-a'?'左侧实例':'右侧实例'}">${keys.map(x=>`<option value="${esc(x)}" ${x===k?'selected':''}>${esc(name(x))}</option>`).join('')}</select>`;
  return `<div class="bar">${select('instance-a',a)}${keys.length>1?select('instance-b',b):''}
    ${keys.length>1?`<label><input id="only-diff" type="checkbox" ${state.onlyDiff?'checked':''}> 只看差异</label>`:''}
    ${action('打开实例详情','materials',a)}</div>
    ${keys.length>1?matrix(family,a,b):''}
    ${packedEvidence(family,a)}<div class="report-block"><h3>${esc(name(a))} 的有效纹理</h3>${textureEvidence(family,a)}</div>`;
}
function lessonBody(body,master){
  const nodes=D.graphs[master]?.nodes??[];
  return esc(body).replace(/#(\d+)/g,(label,id)=>nodes.some(node=>node.id===Number(id))?
     `<button class="inline-node" data-lesson-node="${id}" data-key="${esc(master)}" title="在接线图中定位节点">${label}</button>`:label);
}
function lessonsView(){
  const family=state.lesson||'Skin', cfg=CHAPTERS[family], lesson=lessonFor(family), master=masterFor(family);
  const shown=cfg.shot;
  return title('材质图解与逐层渲染','选择角色部位和实例。左侧单独看该材质的网格，右侧按步骤对照 UE 渲染，再查看接线和纹理。')+
    '<div class="chapter-launcher" aria-label="材质专题">'+list(CHAPTERS).map(([k,x])=>`<button data-lesson="${k}" aria-pressed="${family===k}" class="${family===k?'active':''}"><strong>${x.label}</strong><small>M_Nikki_${k}</small></button>`).join('')+'</div>'+
    `<section id="chapter"><header class="chapter-head"><div><h2>${esc(lesson?.title??cfg.label)}</h2><p>${esc(lesson?.summary??'')}</p></div><div class="bar">
      ${action('打开母材质','materials',master)}<button data-preset="${cfg.shot},${cfg.compare}">对照渲染层</button></div></header>
      ${window.NikkiLayers.render(family)}<div class="chapter-two">${evidenceCard(shown,true)}<div class="chapter-stack">
      ${(lesson?.steps??[]).map((x,i)=>`<details class="chapter-step" ${i<2?'open':''}><summary>${esc(x.title)}</summary><p>${lessonBody(x.body,master)}</p></details>`).join('')}
      ${lesson?.caveat?`<p class="callout">${esc(lesson.caveat)}</p>`:''}</div></div>
      <div class="report-block"><h3>材质实例与纹理对照</h3><div id="lesson-instance">${instancePanel(family)}</div></div>
    </section>`+
    box('7 个 GemBillboard 槽当前引用 WorldGridMaterial','<p>组件值与网格资产默认值一致。UE LOD0 核对确认，这 7 个槽都没有渲染节和三角面。</p><button data-grid="true">筛出这 7 个槽</button>'+window.NikkiLayers.render('Other'));
}
function renderView(){
  const options=captureOptions();
  return title('高清渲染对照','选择镜头和缓冲。点图查看原始 PNG，可按 1:1 像素检查发丝边缘、眼妆或布料细纹。')+
    `<div class="bar"><label>图 A <select id="left">${options}</select></label><label>图 B <select id="right">${options}</select></label><label>布局 <select id="view-layout"><option value="pair">双栏</option><option value="wipe">滑动对照</option><option value="single">单图</option></select></label></div>
    <div class="bar"><button data-preset="front,BaseColor">全身 · 光照 / 底色</button><button data-preset="face-Lit,face-Normal">面部 · 光照 / 法线</button><button data-preset="dress-Lit,dress-Roughness">礼服 · 光照 / 粗糙度</button><button data-preset="dress-Metallic,dress-SeparateTranslucencyRGB">礼服 · 金属度 / 半透明</button></div>
    <div id="stage"></div>`+
    box('如何读缓冲图','<p>同一机位的 Lit、Base Color、Normal、Roughness 可用于对齐读取。半透明覆盖和后期也会改变最终画面。所有缓冲均是 UE 显示编码图，像素亮度仅用于观察。</p>');
}
function renderCaptureStage(){
  const stage=$('stage');
  const a=D.captures[state.a],b=D.captures[state.b];
  const aligned=a?.framing===b?.framing&&a?.framing&&JSON.stringify(a.camera)===JSON.stringify(b.camera)&&Math.abs(a.width/a.height-b.width/b.height)<.003;
  if(state.layout==='wipe'&&aligned){
    stage.className='capture-shell';
    stage.innerHTML=`<div class="wipe" style="--split:50%">${evidenceImg(state.a)}${evidenceImg(state.b,{overlay:true})}
      <span class="wipe-label">${esc(captureLabel(state.a))}</span><span class="wipe-label right">${esc(captureLabel(state.b))}</span><i class="wipe-line"></i></div>
      <input class="wipe-input" type="range" min="0" max="100" value="50" aria-label="调节 A/B 图像分界线">
      <div class="capture-meta"><a href="${esc(a.file)}" target="_blank" rel="noopener">打开图 A 原图</a><a href="${esc(b.file)}" target="_blank" rel="noopener">打开图 B 原图</a></div>`;
    stage.querySelector('input').addEventListener('input',e=>stage.querySelector('.wipe').style.setProperty('--split',e.target.value+'%'));
    return;
  }
  stage.className='stage '+(state.layout==='single'?'single':'');
  stage.innerHTML=(state.layout==='wipe'?'<p class="callout" style="grid-column:1/-1">滑动对照需要相同机位。当前选择使用双栏展示。</p>':'')+
    (state.layout==='single'?[state.a]:[state.a,state.b]).map(k=>evidenceCard(k)).join('');
}
function zoomImage(img){
  const dialog=$('zoom'), picture=dialog.querySelector('img');
  const src=img.dataset.full||img.currentSrc||img.src;
  dialog.classList.remove('pixels');
  $('toggle-pixels').setAttribute('aria-pressed','false');
  picture.src=src;
  picture.alt=img.alt;
  $('zoom-original').href=src;
  $('zoom-caption').textContent=img.alt+(img.dataset.size?' · '+img.dataset.size:'');
  dialog.showModal();
}
function wireStudio(){
  const c=D.captures['face-Lit'];
  if(c){
    $('hero-shot').src=c.preview||c.file;
    $('hero-shot').dataset.full=c.file;
    $('hero-shot').dataset.size=displaySize(c);
    $('hero-caption').textContent=(c.frameCount?c.frameCount+' 帧同机位合成':'UE 原生捕捉')+' · '+displaySize(c);
  }
  $('toggle-pixels').addEventListener('click',e=>{
    const enabled=$('zoom').classList.toggle('pixels');
    e.target.setAttribute('aria-pressed',String(enabled));
  });
  document.addEventListener('change',e=>{
    const id=e.target.id;
    if(id==='view-layout'){
      state.layout=e.target.value;
      renderCaptureStage();
    }
    if(['instance-a','instance-b','only-diff'].includes(id)){
      if(id==='instance-a')state.lessonA=e.target.value;
      if(id==='instance-b')state.lessonB=e.target.value;
      if(id==='only-diff')state.onlyDiff=e.target.checked;
      $('lesson-instance').innerHTML=instancePanel(state.lesson||'Skin');
      $(id)?.focus({preventScroll:true});
    }
  });
}

function isolatedButton(key){
  return D.layerEvidence?.materials?.some(x=>x.key===key)
    ? `<button type="button" data-isolate="${esc(key)}">单独看网格与效果</button>` : '';
}
