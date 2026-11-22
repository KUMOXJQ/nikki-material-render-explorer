(() => {
  'use strict';

  const views = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const shortName = name => String(name ?? '').split('/').at(-1).split('.').at(-1);
  const hasImage = entry => Boolean(entry?.file);
  const sizeLabel = entry => entry?.width && entry?.height ? entry.width + ' × ' + entry.height : '';
  const rowsFor = family => (window.NIKKI?.layerEvidence?.materials ?? []).filter(row => row.family === family);

  function image(entry, label, className = '', loading = 'lazy') {
    if (!hasImage(entry)) return '';
    return '<img class="' + className + '" loading="' + loading + '" decoding="async" src="' +
      escape(entry.preview || entry.file) + '" alt="' + escape(label) + '" tabindex="0" role="button"' +
      ' data-zoom data-full="' + escape(entry.file) + '" data-size="' + sizeLabel(entry) + '">';
  }

  function link(entry, label = '查看原始图 ↗') {
    if (!hasImage(entry)) return '';
    return '<a href="' + escape(entry.file) + '" target="_blank" rel="noopener">' + escape(label) + '</a>';
  }

  function choice(label, value, options, attribute) {
    return '<label class="nl-choice"><span>' + escape(label) + '</span><select ' + attribute + '>' +
      options.map(([key, text]) => '<option value="' + escape(key) + '"' +
        (key === value ? ' selected' : '') + '>' + escape(text) + '</option>').join('') + '</select></label>';
  }

  function currentView(family, rows) {
    let view = views.get(family);
    if (!view) {
      view = {
        material: rows.find(row => row.stages?.some(hasImage))?.key ?? rows[0]?.key,
        stages: new Map(),
        compare: 'current',
        split: 50
      };
      views.set(family, view);
    }
    return view;
  }

  function rowLabel(row) {
    return row.label || shortName(row.key);
  }

  function slotTable(row) {
    const slots = row.slots ?? [];
    if (!slots.length) return '<p class="nl-hint">没有记录到关卡槽位。</p>';
    return '<div class="nl-table-wrap" tabindex="0"><table class="nl-table"><thead><tr><th scope="col">网格组件</th>' +
      '<th scope="col">槽号</th><th scope="col">材质槽名</th><th scope="col">LOD0 三角面</th></tr></thead><tbody>' +
      slots.map(slot => {
        const index = slot.index ?? slot.slotIndex ?? slot.materialIndex;
        const mesh = slot.mesh || row.mesh || slot.asset;
        return '<tr><td><span>' + escape(slot.component ?? slot.componentName ?? '—') + '</span>' +
          (mesh ? '<small title="' + escape(mesh) + '">' + escape(shortName(mesh)) + '</small>' : '') +
          '</td><td>' + escape(index === undefined ? '—' : '#' + index) + '</td><td>' +
          escape(slot.slot ?? slot.name ?? slot.slotName ?? '—') + '</td><td>' + escape(slot.triangles ?? '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function isolate(row) {
    const entry = row.isolated;
    const label = rowLabel(row);
    return '<aside class="nl-isolate"><h4>单独显示绑定网格</h4>' +
      (hasImage(entry) ? '<figure class="nl-shot">' + image(entry, label + ' · 单独显示绑定网格') +
        '<figcaption><span>' + escape(sizeLabel(entry)) + '</span>' + link(entry) + '</figcaption></figure>' :
        '<p class="nl-hint">该绑定没有可渲染的 LOD0 三角面。</p>') +
      (entry?.method ? '<p class="nl-hint">' + escape(entry.method) + '</p>' : '') +
      (hasImage(row.geometry) ? '<details class="nl-geometry"><summary>查看裁切前的网格几何</summary>' +
       '<figure class="nl-shot">' + image(row.geometry, label + ' · 中性网格') +
       '<figcaption><span>' + escape(row.geometry.body) + '</span>' + link(row.geometry) + '</figcaption></figure></details>' : '') +
      (hasImage(row.angle) ? '<details class="nl-geometry"><summary>查看原材质斜前方视角</summary>' +
       '<figure class="nl-shot">' + image(row.angle, label + ' · 斜前方') +
       '<figcaption><span>' + escape(sizeLabel(row.angle)) + ' · 偏转 36°</span>' + link(row.angle) + '</figcaption></figure></details>' : '') +
      slotTable(row) + '</aside>';
  }

  function stageNavigation(stages, selected) {
    return '<div class="nl-filmstrip" role="group" aria-label="分层过程">' +
      stages.map((step, index) => {
        const source = step.preview || step.file;
        return '<button type="button" class="nl-film-item" data-nl-step="' + index + '" aria-pressed="' +
          (index === selected) + '"' + (index === selected ? ' aria-current="step"' : '') + '>' +
          (source ? '<img loading="lazy" decoding="async" src="' + escape(source) + '" alt="">' : '') +
          '<span>' + escape(step.title || step.id || ('阶段 ' + (index + 1))) + '</span></button>';
      }).join('') + '</div>';
  }

  function figure(entry, label) {
    return '<figure class="nl-shot nl-main-shot">' + image(entry, label, '', 'eager') +
      '<figcaption><span>' + escape(label) + ' · ' + escape(sizeLabel(entry)) + '</span>' + link(entry) + '</figcaption></figure>';
  }

  function sharesFrame(a, b) {
    if (!a.width || !a.height || !b.width || !b.height) return false;
    if (Math.abs(a.width / a.height - b.width / b.height) > 0.004) return false;
    if (a.framing && b.framing && a.framing !== b.framing) return false;
    return !a.camera || !b.camera || JSON.stringify(a.camera) === JSON.stringify(b.camera);
  }

  function compared(a, b, split, previousTitle, currentTitle) {
    if (!sharesFrame(a, b)) {
      return '<div class="nl-pair">' + figure(a, previousTitle) + figure(b, currentTitle) + '</div>' +
        '<p class="nl-hint">这组图的画幅或机位不同，已并排显示。</p>';
    }
    return '<div class="nl-comparison"><div class="nl-wipe" style="--nl-split:' + split + '%">' +
      image(a, previousTitle, 'nl-before', 'eager') + image(b, currentTitle, 'nl-after', 'eager') +
      '<span class="nl-wipe-label">' + escape(previousTitle) + '</span><span class="nl-wipe-label nl-wipe-right">' +
      escape(currentTitle) + '</span><i aria-hidden="true"></i></div>' +
      '<label class="nl-split"><span>拖动分界线</span><input type="range" min="0" max="100" value="' +
      split + '" data-nl-split aria-label="前一步与当前步骤的图像分界线"></label>' +
      '<div class="nl-links">' + link(a, '打开对照原图 ↗') + link(b, '打开当前原图 ↗') + '</div></div>';
  }

  function changeList(changes) {
    if (!changes || (Array.isArray(changes) && !changes.length)) return '';
    const values = Array.isArray(changes) ? changes : Object.entries(changes).map(
      ([key, val]) => key + ' → ' + (typeof val === 'object' ? JSON.stringify(val) : val));
    return '<ul class="nl-changes">' + values.map(value => '<li>' +
      escape(typeof value === 'object' ? JSON.stringify(value) : value) + '</li>').join('') + '</ul>';
  }

  function formatParam(value) {
    if (value === 'ZERO_RGBA') return 'RGBA(0, 0, 0, 0) 临时纹理';
    if (typeof value === 'number') return String(+value.toPrecision(5));
    if (Array.isArray(value)) return '(' + value.map(formatParam).join(', ') + ')';
    if (typeof value === 'string' && value.startsWith('/')) return shortName(value);
    return String(value ?? '—');
  }

  function parameterTable(values) {
    if (!values?.length) return '';
    return '<details class="nl-stage-values"><summary>逐项核对当前值和原实例值</summary><div class="nl-table-wrap" tabindex="0">' +
      '<table class="nl-table"><thead><tr><th>参数</th><th>这一步</th><th>原实例</th></tr></thead><tbody>' +
      values.map(v => '<tr><td>' + escape(v.name) + '</td><td class="' + (v.modified?'nl-modified':'') + '">' +
        escape(formatParam(v.current)) + '</td><td>' + escape(formatParam(v.authored)) + '</td></tr>').join('') +
      '</tbody></table></div></details>';
  }

  function stageExplanation(row, step, index) {
    const fallbackKey = window.NIKKI?.materials?.[row.key]?.parent;
    const graphKey = step.graphKey ?? row.graphKey ?? fallbackKey;
    const node = Number.isFinite(step.graphNode) && graphKey ? '<button type="button" class="nl-graph-link" data-lesson-node="' +
      step.graphNode + '" data-key="' + escape(graphKey) + '">定位接线 #' + step.graphNode + '</button>' : '';
    return '<div class="nl-step-details" aria-live="polite"><div class="nl-step-header"><h4>' +
      escape(step.title || ('阶段 ' + (index + 1))) + '</h4>' + node + '</div>' +
      (step.body ? '<p>' + escape(step.body) + '</p>' : '') +
      parameterTable(step.values) +
      (step.focus ? '<p class="nl-focus"><strong>画面观察</strong> ' + escape(step.focus) + '</p>' : '') +
      (step.method ? '<p class="nl-hint">' + escape(step.method) + '</p>' : '') + '</div>';
  }

  function stageViewer(row, view) {
    const stages = (row.stages ?? []).filter(hasImage);
    if (!stages.length) {
      return '<section class="nl-process"><h4>UE 分层中间图</h4><p class="nl-hint">该槽没有可拍摄的 LOD0 三角面。</p></section>';
    }
    const index = Math.min(view.stages.get(row.key) ?? 0, stages.length - 1);
    const step = stages[index];
    const current = step.title || '当前阶段';
    const compareMode = index === 0 && view.compare === 'previous' ? 'current' : view.compare;
    const options = [['current','当前步骤']];
    if (index > 0) options.push(['previous','对照前一步']);
    if (index < stages.length - 1) options.push(['final','对照最后一步']);
    const reference = compareMode === 'previous' ? stages[index - 1] :
      compareMode === 'final' && index < stages.length - 1 ? stages.at(-1) : null;
    return '<section class="nl-process"><div class="nl-process-head"><div><h4>UE 分层中间图</h4>' +
      '<p class="nl-hint">依次查看同一机位的实际渲染结果。</p></div>' +
      choice('对照', reference ? compareMode : 'current', options, 'data-nl-compare') + '</div>' +
      stageNavigation(stages, index) +
      '<div class="nl-stage">' + (reference ? compared(reference, step, view.split, reference.title, current) :
        figure(step, current)) + '</div>' +
      '<div class="nl-step-controls"><button type="button" data-nl-step="' + (index - 1) + '"' +
      (index === 0 ? ' disabled' : '') + '>← 上一步</button><span aria-live="polite">' + (index + 1) + ' / ' +
      stages.length + '</span><button type="button" data-nl-step="' + (index + 1) + '"' +
      (index === stages.length - 1 ? ' disabled' : '') + '>下一步 →</button></div>' +
      stageExplanation(row, step, index) + '</section>';
  }

  function renderSurface(row) {
    const surface = row.surface ?? {};
    const labels = [surface.blend_mode,surface.shading_model].filter(Boolean)
      .map(v => String(v).replace(/^<[^.]+\./,'').replace(/: \d+>$/,'').replace(/^(BLEND_|MSM_)/,''));
    if (typeof surface.two_sided === 'boolean') labels.push(surface.two_sided ? '双面' : '单面');
    labels.push((row.triangles ?? 0).toLocaleString('zh-CN') + ' 个 LOD0 三角面');
    return '<div class="nl-surface" aria-label="绑定材质的有效渲染属性">' + labels.map(text=>'<span>'+escape(text)+'</span>').join('')+'</div>';
  }

  function body(family, rows) {
    const view = currentView(family, rows);
    const row = rows.find(record => record.key === view.material) ?? rows[0];
    return '<header class="nl-header"><div><h3>网格隔离与渲染分层</h3>' +
      '<p>选择材质实例，检查它实际绑定的网格区域，再逐步查看输入怎样改变渲染。</p></div>' +
      choice('材质实例', row.key, rows.map(item => [item.key, rowLabel(item)]), 'data-nl-material') + '</header>' +
      '<div class="nl-instance"><code title="' + escape(row.key) + '">' + escape(row.key) + '</code>' +
      '<button type="button" data-tab="materials" data-key="' + escape(row.key) + '">查实例参数</button></div>' + renderSurface(row) +
      '<div class="nl-layout">' + isolate(row) + stageViewer(row, view) + '</div>' +
      (row.notes ? '<p class="nl-notes">' + escape(row.notes) + '</p>' : '');
  }

  function render(family) {
    const rows = rowsFor(family);
    if (!rows.length) return '';
    return '<section class="nikki-layers" data-nl-family="' + escape(family) + '" aria-label="材质网格与分层渲染">' +
      body(family, rows) + '</section>';
  }

  function refresh(root, rows, focus) {
    root.innerHTML = body(root.dataset.nlFamily, rows);
    const target = focus && root.querySelector(focus);
    target?.focus({preventScroll:true});
  }

  document.addEventListener('change', event => {
    const element = event.target;
    if (!element.matches('[data-nl-material],[data-nl-compare]')) return;
    const root = element.closest('[data-nl-family]');
    const rows = rowsFor(root.dataset.nlFamily);
    const view = currentView(root.dataset.nlFamily, rows);
    if (element.matches('[data-nl-material]')) {
      view.material = element.value;
      view.split = 50;
      refresh(root, rows, '[data-nl-material]');
    } else {
      view.compare = element.value;
      view.split = 50;
      refresh(root, rows, '[data-nl-compare]');
    }
  });

  document.addEventListener('input', event => {
    const element = event.target;
    if (!element.matches('[data-nl-split]')) return;
    const root = element.closest('[data-nl-family]');
    const view = views.get(root.dataset.nlFamily);
    view.split = Number(element.value);
    root.querySelector('.nl-wipe').style.setProperty('--nl-split', view.split + '%');
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-nl-step]');
    if (!button || button.disabled) return;
    const root = button.closest('[data-nl-family]');
    const rows = rowsFor(root.dataset.nlFamily);
    const view = currentView(root.dataset.nlFamily, rows);
    view.stages.set(view.material, Number(button.dataset.nlStep));
    refresh(root, rows, '.nl-film-item[aria-current="step"]');
  });

  window.NikkiLayers = {render, select(family,key){ currentView(family,rowsFor(family)).material=key; }};
})();

