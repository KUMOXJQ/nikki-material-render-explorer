(() => {
  'use strict';

  const selections = new Map();
  const names = {
    connected: '当前接通',
    inactive: '当前未生效',
    absent: '未发现对应层',
    conditional: '受渲染条件影响'
  };
  const modes = {
    switch: '静态开关',
    toggle: '参数开关',
    parameter: '参数证据',
    override: '参数对照',
    compare: '前后对照',
    diagnostic: 'UE 诊断视图',
    graph: '材质图证据',
    texture: '纹理引用',
    none: '材质图与参数',
    Lit: 'UE Lit 完整光照',
    BaseColor: 'UE 基础色缓冲',
    Specular: 'UE 高光输入缓冲',
    Roughness: 'UE 粗糙度缓冲',
    Metallic: 'UE 金属度缓冲',
    Normal: 'UE 法线缓冲',
    SeparateTranslucencyRGB: 'UE 单独半透明缓冲',
    SubsurfaceColor: 'UE 次表面颜色缓冲',
    ShadingModel: 'UE 着色模型缓冲',
    AmbientOcclusion: 'UE 环境遮蔽缓冲'
  };

  const escape = value => String(value ?? '').replace(/[&<>"']/g,
    char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const assetName = value => String(value ?? '').split('/').at(-1).split('.').at(-1);
  const entries = key => window.NIKKI?.effects?.[key]?.effects ?? [];
  const imagesOf = effect => (effect.images ?? []).filter(image => image?.file);
  const statusOf = effect => Object.hasOwn(names,effect.status) ? effect.status : 'other';
  const statusLabel = effect => names[statusOf(effect)] ?? (effect.status || '状态未标注');
  const size = image => image.width && image.height ? image.width + ' × ' + image.height : '';

  function selection(key, effects) {
    let chosen = selections.get(key);
    if (!chosen || !effects.some(effect => effect.id === chosen.id)) {
      chosen = {id:effects[0].id, layout:'pair', split:50};
      selections.set(key,chosen);
    }
    return chosen;
  }

  function badge(effect) {
    return '<span class="ne-status ne-' + statusOf(effect) + '">' + escape(statusLabel(effect)) + '</span>';
  }

  function nav(effects, selected) {
    return '<div class="ne-effects-list" role="group" aria-label="选择材质表现层">' +
      effects.map(effect => '<button type="button" class="ne-effect" data-ne-effect="' + escape(effect.id) +
        '" aria-pressed="' + (effect.id === selected.id) + '"><strong>' + escape(effect.title || effect.id) +
        '</strong>' + badge(effect) + '</button>').join('') +
      '</div>';
  }

  function graphLink(key, effect) {
    const graphKey = effect.graphKey ?? window.NIKKI?.materials?.[key]?.parent;
    const node = effect.node == null || effect.node === '' ? null : Number(effect.node);
    const graphNodes = window.NIKKI?.graphs?.[graphKey]?.nodes;
    if (Number.isFinite(node) && graphNodes?.some(entry => entry.id === node)) {
      return '<button type="button" class="ne-small-button" data-lesson-node="' + node +
        '" data-key="' + escape(graphKey) + '">定位材质节点 #' + node + '</button>';
    }
    return graphNodes ? '<button type="button" class="ne-small-button" data-tab="materials" data-key="' +
      escape(graphKey) + '">查看母材质图</button>' : '';
  }

  function parameterValue(value) {
    if (typeof value === 'boolean') return value ? '开启' : '关闭';
    if (value == null || value === '') return '—';
    if (typeof value !== 'object') return String(value);
    return Array.isArray(value) ? value.map(parameterValue).join(' · ') : JSON.stringify(value);
  }

  function parameterTable(parameters) {
    if (!parameters?.length) return '';
    return '<div class="ne-param-wrap" tabindex="0" aria-label="涉及参数">' +
      '<table class="ne-params"><thead><tr><th scope="col">涉及参数</th><th scope="col">当前值</th></tr></thead>' +
      '<tbody>' + parameters.map(({name,value}) => {
        const textureKey = typeof value === 'string' && window.NIKKI?.images?.[value] ? value : null;
        const thumb = textureKey ? window.NIKKI.images[textureKey]?.file : null;
        return '<tr><th scope="row">' + escape(name) + '</th><td>' +
          (textureKey ? '<button type="button" class="ne-texture" data-tab="textures" data-key="' +
            escape(textureKey) + '" title="' + escape(textureKey) + '">' +
            (thumb ? '<img src="' + escape(thumb) + '" loading="lazy" decoding="async" alt="">' : '') +
            '<span>' + escape(assetName(textureKey)) + ' ↗</span></button>' :
            '<code>' + escape(parameterValue(value)) + '</code>') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderImage(image, title, className = '') {
    return '<img class="' + className + '" src="' + escape(image.preview || image.file) +
      '" alt="' + escape(title) + '" decoding="async" loading="lazy" tabindex="0" role="button"' +
      ' data-zoom data-full="' + escape(image.file) + '" data-size="' + escape(size(image)) + '">';
  }

  function caption(image, index) {
    const title = image.title || '画面 ' + (index + 1);
    return '<figcaption><strong>' + escape(title) + '</strong>' +
      (image.method ? '<p>' + escape(image.method) + '</p>' : '') +
      '<span>' + escape(size(image)) + '</span><a href="' + escape(image.file) +
      '" target="_blank" rel="noopener">原始图 ↗</a></figcaption>';
  }

  function aligns(a,b) {
    if (!a.width || !a.height || !b.width || !b.height) return false;
    if (Math.abs(a.width/a.height - b.width/b.height) > 0.004) return false;
    if (a.framing && b.framing && a.framing !== b.framing) return false;
    if (a.camera && b.camera) return JSON.stringify(a.camera) === JSON.stringify(b.camera);
    return Boolean(a.framing && a.framing === b.framing);
  }

  function imagePanel(effect, selected) {
    const images = imagesOf(effect);
    if (!images.length) {
      return '<p class="ne-text-only">本项暂未附独立的 UE 对照图。可查看材质状态、接线与参数。</p>';
    }

    const bufferKinds = new Set(images.map(image => image.mode).filter(Boolean));
    const captureNote = bufferKinds.size > 1 ? '<p class="ne-mode">这些图来自不同 UE 显示模式。各自的缓冲含义见图注。</p>' : '';
    const canWipe = images.length === 2 && aligns(...images);
    const wipe = canWipe && selected.layout === 'wipe';
    const switcher = canWipe ? '<div class="ne-layouts" role="group" aria-label="图像对照布局">' +
      '<button type="button" data-ne-layout="pair" aria-pressed="' + !wipe + '">并排对照</button>' +
      '<button type="button" data-ne-layout="wipe" aria-pressed="' + wipe + '">滑动对照</button></div>' : '';

    if (wipe) {
      const [a,b] = images;
      return captureNote + switcher + '<div class="ne-wipe" style="--ne-split:' + selected.split + '%">' +
        renderImage(a,a.title || '对照 A','ne-before') + renderImage(b,b.title || '对照 B','ne-after') +
        '<i aria-hidden="true"></i></div><label class="ne-split-label">分界线 <input type="range" min="0" max="100" value="' +
        selected.split + '" data-ne-split aria-label="调节材质表现对照分界线"></label><div class="ne-renders">' +
        images.map((image,index) => '<figure class="ne-render">' + caption(image,index) + '</figure>').join('') + '</div>';
    }

    return captureNote + switcher + '<div class="ne-renders">' + images.map((image,index) =>
      '<figure class="ne-render">' + renderImage(image,image.title || '画面 ' + (index + 1)) +
      caption(image,index) + '</figure>').join('') + '</div>';
  }

  function panel(key,effect,selected) {
    return '<section class="ne-panel" data-ne-active-effect="' + escape(effect.id) + '" data-ne-status="' + statusOf(effect) + '" aria-live="polite">' +
      '<div class="ne-heading"><div><h4>' + escape(effect.title || effect.id) + '</h4>' + badge(effect) + '</div>' +
      graphLink(key,effect) + '</div>' +
      (effect.body ? '<p class="ne-description">' + escape(effect.body) + '</p>' : '') +
      (effect.detail ? '<p class="ne-detail">' + escape(effect.detail) + '</p>' : '') +
      parameterTable(effect.parameters) +
      (effect.mode ? '<p class="ne-mode">核对方式 · ' + escape(modes[effect.mode] ?? effect.mode) + '</p>' : '') +
      imagePanel(effect,selected) + '</section>';
  }

  function body(key, effects) {
    const selected = selection(key,effects);
    const active = effects.find(effect => effect.id === selected.id);
    return '<header><h4>实际材质效果</h4><p>检查每一层是否生效，以及它在 UE 中怎样影响当前网格。</p></header>' +
      nav(effects,selected) + panel(key,active,selected);
  }

  function render(key) {
    const effects = entries(key);
    if (!effects.length) return '';
    return '<section class="nikki-effects" data-ne-key="' + escape(key) + '" aria-label="实际材质效果">' +
      body(key,effects) + '</section>';
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-ne-effect],[data-ne-layout]');
    if (!button) return;
    const root = button.closest('[data-ne-key]');
    const key = root.dataset.neKey;
    const effects = entries(key);
    const selected = selection(key,effects);
    if (button.dataset.neEffect) {
      selected.id = button.dataset.neEffect;
      selected.split = 50;
      root.innerHTML = body(key,effects);
      root.querySelector('[data-ne-effect][aria-pressed="true"]')?.focus({preventScroll:true});
    } else {
      selected.layout = button.dataset.neLayout;
      root.innerHTML = body(key,effects);
      root.querySelector('[data-ne-layout][aria-pressed="true"]')?.focus({preventScroll:true});
    }
  });

  document.addEventListener('input', event => {
    if (!event.target.matches('[data-ne-split]')) return;
    const root = event.target.closest('[data-ne-key]');
    const selected = selections.get(root.dataset.neKey);
    selected.split = Number(event.target.value);
    root.querySelector('.ne-wipe').style.setProperty('--ne-split',selected.split + '%');
  });

  window.NikkiEffects = {render};
})();
