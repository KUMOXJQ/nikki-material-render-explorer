(() => {
  'use strict';

  const diagrams = new Map();
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const shortName = path => String(path ?? '').split('.').at(-1).split('/').at(-1);
  const propertiesOf = node => node.properties ?? {};
  const entries = value => Object.entries(value ?? {});

  const outputLabels = {
    BASE_COLOR: '基础色', METALLIC: '金属度', SPECULAR: '高光', ROUGHNESS: '粗糙度',
    ANISOTROPY: '各向异性', EMISSIVE_COLOR: '自发光', OPACITY: '不透明度',
    OPACITY_MASK: '不透明度遮罩', NORMAL: '法线', TANGENT: '切线',
    WORLD_POSITION_OFFSET: '世界位置偏移', SUBSURFACE_COLOR: '次表面色',
    AMBIENT_OCCLUSION: '环境遮蔽', MATERIAL_ATTRIBUTES: '材质属性集合',
    REFRACTION: '折射', SHADING_MODEL: '着色模型'
  };

  const kinds = [
    ['output', '输出和属性'], ['texture', '纹理'], ['function', '函数'],
    ['switch', '静态分支'], ['parameter', '参数'], ['reroute', '重路由'], ['math', '运算及其他']
  ];

  const kindLabels = Object.fromEntries(kinds);

  function kind(node) {
    const type = node.type;
    if (/Attributes|FunctionOutput/.test(type)) return 'output';
    if (/^Texture(Sample|Object)/.test(type)) return 'texture';
    if (type === 'MaterialFunctionCall') return 'function';
    if (/StaticSwitch|StaticBool/.test(type)) return 'switch';
    if (/Reroute/.test(type)) return 'reroute';
    if (/Parameter|FunctionInput/.test(type)) return 'parameter';
    return 'math';
  }

  function title(node) {
    const p = propertiesOf(node);
    return p.parameter_name || shortName(p.material_function) || p.input_name ||
      p.output_name || shortName(p.texture) || node.type;
  }

  function labelForOutput(property) {
    const key = property.replace(/^MP_/, '');
    return outputLabels[key] ? outputLabels[key] + ' · ' + key : property;
  }

  function graphModel(graph, key) {
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const downstream = new Map();
    for (const node of nodes.values()) {
      for (const link of node.inputs ?? []) {
        const consumers = downstream.get(link.source) ?? [];
        consumers.push({...link, target: node.id});
        downstream.set(link.source, consumers);
      }
    }

    const anchors = entries(graph.outputs).map(([property, target]) => ({
      id: target.node, name: labelForOutput(property), pin: target.pin,
      group: '材质输出'
    }));

    for (const node of nodes.values()) {
      if (node.type === 'FunctionOutput') {
        anchors.push({id: node.id, name: title(node), group: '函数输出'});
      }

      if (!/^(Make|Set)MaterialAttributes$/.test(node.type)) continue;
      for (const link of node.inputs ?? []) {
        if (!nodes.has(link.source)) continue;
        anchors.push({
          id: link.source, name: (outputLabels[link.pin.replace(/(?<=[a-z])(?=[A-Z])/g, ' ').replace(/ /g, '_').toUpperCase()] ?? link.pin) + ' · ' + link.pin + ' → #' + node.id, pin: link.output,
          group: '材质属性分支（母材质图）'
        });
      }
    }

    const materialAssets = window.NIKKI?.materials ?? {};
    const instances = entries(materialAssets)
      .filter(([, asset]) => asset.parent === key)
      .map(([path]) => path).sort((a, b) => shortName(a).localeCompare(shortName(b), 'zh'));

    return {
      key, nodes, downstream, instances,
      anchors: anchors.filter(anchor => nodes.has(anchor.id)),
      filters: [...new Set([...nodes.values()].map(kind))]
    };
  }

  function render(graph, key, options = {}) {
    if (!graph?.nodes?.length) return '<p>当前资产没有可查看的表达式节点。</p>';
    const model = graphModel(graph, key);
    diagrams.set(key, model);
    return '<details class="nikki-graph" data-ng-key="' + escapeHtml(key) + '"' +
      (options.open ? ' open' : '') + '><summary><strong>材质接线图</strong>' +
      '<span class="ng-summary-count">' + model.nodes.size + ' 个节点</span></summary>' +
      '<div data-ng-content></div></details>';
  }

  const graphStates = new WeakMap();

  function mount(root) {
    if (graphStates.has(root)) return;
    const model = diagrams.get(root.dataset.ngKey);
    if (!model) return;
    const preferred = model.anchors.findIndex(anchor => anchor.name.startsWith('材质属性集合'));
    const index = Math.max(preferred, 0);
    const first = model.anchors[index] ?? {id:model.nodes.keys().next().value,name:'首个表达式'};

    const state = {anchor:first, node:first.id, depth:2, filter:'all', text:'', instance:''};
    graphStates.set(root, state);
    const groups = [...new Set(model.anchors.map(anchor => anchor.group))];
    const options = model.anchors.length ? groups.map(group =>
      '<optgroup label="' + escapeHtml(group) + '">' + model.anchors.map((anchor, i) => {
        if (anchor.group !== group) return '';
        return '<option value="' + i + '"' + (index === i ? ' selected' : '') + '>' +
          escapeHtml(anchor.name) + '</option>';
      }).join('') + '</optgroup>').join('') : '<option value="">首个表达式</option>';

    root.querySelector('[data-ng-content]').innerHTML =
      '<p class="ng-help">由右侧输出向左追溯。点节点查看实接输入、输出通道和纹理。材质属性分支列表可直接跳到具体属性。</p>' +
      '<div class="ng-toolbar">' +
        '<label>从输出追溯<select data-ng-anchor>' + options + '</select></label>' +
        '<label>追溯深度<select data-ng-depth>' +
          [1, 2, 3, 4, 5, 6].map(depth =>
            '<option' + (depth === state.depth ? ' selected' : '') + '>' + depth + '</option>').join('') +
        '</select></label>' +
        (model.instances.length ?
          '<label>参数取值<select data-ng-instance><option value="">母材质默认值</option>' +
            model.instances.map(path => '<option value="' + escapeHtml(path) + '">' +
              escapeHtml(shortName(path)) + '</option>').join('') + '</select></label>' : '') +
      '</div>' +
      '<div class="ng-chart-scroll" tabindex="0" role="region" aria-label="可横向滚动的材质接线图">' +
        '<div data-ng-chart></div>' +
      '</div>' +
      '<div class="ng-chart-caption"><span data-ng-chart-count></span><span data-ng-branch-note></span></div>' +
      '<div class="ng-inspect" data-ng-inspect aria-live="polite"></div>' +
      '<details class="ng-node-index"><summary>完整节点索引与筛选</summary>' +
        '<div class="ng-toolbar">' +
          '<label>搜索表达式<input type="search" data-ng-query placeholder="节点号、类型、参数或纹理名"></label>' +
          '<label>节点类别<select data-ng-filter><option value="all">所有类别</option>' +
            kinds.filter(([key])=>model.filters.includes(key)).map(([key, label]) =>
              '<option value="' + key + '">' + label + '</option>').join('') +
          '</select></label>' +
        '</div>' +
        '<p class="ng-help" data-ng-result-count></p><div class="ng-index-list" data-ng-list></div>' +
      '</details>';
    updateDiagram(root, model, state);
    updateInspector(root, model, state);
    updateIndex(root, model, state);
  }

  function materialParameter(model, state, type, name) {
    const material = window.NIKKI?.materials?.[state.instance || model.key];
    return material?.parameters?.[type]?.find(parameter => parameter.name === name)?.value;
  }

  function switchValue(node, model, state) {
    if (node.type !== 'StaticSwitchParameter') return undefined;
    const p = propertiesOf(node);
    const effective = materialParameter(model, state, 'static_switch', p.parameter_name);
    if (typeof effective === 'boolean') return effective;
    return state.instance ? undefined : p.default_value;
  }

  function bypassed(node, link, model, state) {
    if (!['True','False'].includes(link.pin)) return false;
    const value = switchValue(node, model, state);
    return typeof value === 'boolean' && value !== (link.pin === 'True');
  }

  function layout(model, state) {
    const columns = [[state.anchor.id]];
    const visited = new Set(columns[0]);
    let clipped = false;
    for (let step = 1; step <= state.depth; step++) {
      const current = new Set();
      for (const id of columns.at(-1)) {
        for (const input of model.nodes.get(id).inputs ?? []) {
          if (!visited.has(input.source) && model.nodes.has(input.source)) current.add(input.source);
        }
      }
      if (!current.size) break;
      const full = [...current];
      const visible = full.slice(0, 9);
      if (full.length !== visible.length) clipped = true;
      columns.push(visible);
      visible.forEach(id => visited.add(id));
    }
    if (columns.at(-1).some(id =>
      model.nodes.get(id).inputs?.some(link => model.nodes.has(link.source) && !visited.has(link.source)))) {
      clipped = true;
    }

    const columnWidth = 216, cardWidth = 174, cardHeight = 60, cardSpace = 76;
    const maxRows = Math.max(...columns.map(col => col.length));
    const height = Math.max(152, maxRows * cardSpace + 38);
    const width = Math.max(236, columns.length * columnWidth - columnWidth + cardWidth + 62);
    const coords = new Map();
    for (let col = 0; col < columns.length; col++) {
      const items = columns[col];
      items.forEach((id, row) => coords.set(id, {
        x:width - 28 - cardWidth - col * columnWidth,
        y:49 + row * cardSpace + (maxRows - items.length) * cardSpace / 2,
        w:cardWidth, h:cardHeight, col
      }));
    }
    return {width, height, coords, clipped};
  }

  function effectiveTexture(node, model, state) {
    const p = propertiesOf(node);
    return materialParameter(model, state, 'texture', p.parameter_name) || p.texture;
  }

  function updateDiagram(root, model, state) {
    const graph = layout(model, state);
    const chart = root.querySelector('[data-ng-chart]');
    state.layout = graph;
    const columns = new Map();
    for (const position of graph.coords.values()) columns.set(position.col, position.x);
    chart.innerHTML =
      '<div class="ng-board" style="width:' + graph.width + 'px;height:' + graph.height + 'px">' +
      '<canvas class="ng-wires" aria-hidden="true"></canvas>' +
      [...columns].map(([col, x]) => '<span aria-hidden="true" class="ng-level" style="left:' + x +
        'px">' + (col ? '上游 ' + col : '追溯起点') + '</span>').join('') +
      [...graph.coords].map(([id, pos]) => {
        const node = model.nodes.get(id);
        const type = kind(node);
        const selected = id === state.node;
        const activeSwitch = switchValue(node, model, state);
        const subtitle = typeof activeSwitch === 'boolean' ?
          '参数分支 · ' + (activeSwitch ? 'True' : 'False') : node.type;
        return '<button type="button" class="ng-tile" data-ng-select="' + id + '" data-kind="' + type +
          '" aria-pressed="' + selected + '" title="' + escapeHtml(title(node)) + '" style="left:' +
          pos.x + 'px;top:' + pos.y + 'px;width:' + pos.w + 'px;height:' + pos.h + 'px">' +
          '<span class="ng-tile-top"><span>#' + id + '</span><span>' + kindLabels[type] + '</span></span>' +
          '<strong>' + escapeHtml(title(node)) + '</strong><small>' + escapeHtml(subtitle) + '</small></button>';
      }).join('') + '</div>';

    root.querySelector('[data-ng-chart-count]').textContent = graph.coords.size + ' / ' + model.nodes.size +
      ' 个节点' + (graph.clipped ? ' · 其余接线可增加深度或从节点继续追溯' : '');
    root.querySelector('[data-ng-branch-note]').textContent =
      '虚线表示静态开关的另一侧。';
    chart.parentElement.scrollLeft = chart.parentElement.scrollWidth;
  }

  function paint(canvas, graph, model, state) {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.ceil(graph.width * ratio);
    canvas.height = Math.ceil(graph.height * ratio);
    canvas.style.width = graph.width + 'px';
    canvas.style.height = graph.height + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    for (const [id, to] of graph.coords) {
      const node = model.nodes.get(id);
      const links = (node.inputs ?? []).filter(link => graph.coords.has(link.source));
      links.forEach((link, i) => {
        const from = graph.coords.get(link.source);
        const dim = bypassed(node, link, model, state);
        const y1 = from.y + from.h / 2;
        const y2 = to.y + 12 + (i + 1) * (to.h - 24) / (links.length + 1);
        const x1 = from.x + from.w;
        const x2 = to.x - 2;
        const dx = Math.max(14, Math.abs(x2 - x1) / 2);
        const highlighted = id === state.node || link.source === state.node;
        ctx.strokeStyle = dim ? '#847591' : (highlighted ? '#f4bddc' : '#9987b7');
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = highlighted && !dim ? 2 : 1.35;
        ctx.setLineDash(dim ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 5, y2 - 3);
        ctx.lineTo(x2 - 5, y2 + 3);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  function nodeButton(node, label) {
    return '<button type="button" class="ng-link" data-ng-select="' + node.id + '">' +
      escapeHtml(label || ('#' + node.id + ' ' + title(node))) + '</button>';
  }

  function format(value) {
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value ?? '—').replace(/^<\w+\.|: \d+>$/g, '');
  }

  function assetLink(tab, path, label) {
    return '<button type="button" class="ng-link" data-tab="' + tab +
      '" data-key="' + escapeHtml(path) + '">' + escapeHtml(label) + '</button>';
  }

  function linkRows(node, model, state, isInput) {
    const links = isInput ? node.inputs : model.downstream.get(node.id);
    if (!links?.length) {
      return '<p class="ng-help">' + (node.type === 'NamedRerouteUsage' && isInput ?
        '命名重路由的声明绑定未在当前采集数据中展开。' : '该方向无已采集的接线。') + '</p>';
    }

    return '<ul class="ng-pin-list">' + links.map(link => {
      const neighbor = model.nodes.get(isInput ? link.source : link.target);
      const switchNode = isInput ? node : neighbor;
      const inactive = switchNode && bypassed(switchNode, link, model, state);
      return '<li' + (inactive ? ' class="ng-inactive"' : '') + '><code>' +
        escapeHtml(link.pin || '未命名输入') + '</code><span aria-hidden="true">←</span><code>' +
        escapeHtml(link.output || '默认输出') + '</code>' +
        (neighbor ? nodeButton(neighbor) : '<span>节点未记录</span>') +
        (inactive ? '<small>该开关的另一侧</small>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function textureEvidence(path, heading) {
    if (!path) return '';
    const data = window.NIKKI;
    const img = data?.images?.[path]?.file;
    const item = data?.textures?.[path];
    return '<div class="ng-asset">' +
      (img ? '<img loading="lazy" data-zoom src="' + escapeHtml(img) + '" alt="' +
        escapeHtml(shortName(path)) + '">' : '') +
      '<div><small>' + escapeHtml(heading) + '</small><p>' + escapeHtml(shortName(path)) + '</p>' +
      (item ? '<small>' + escapeHtml(item.width + ' × ' + item.height +
        ' · ' + (item.settings?.srgb ? 'sRGB' : '线性')) + '</small>' : '') +
      (item ? assetLink('textures', path, '查看 RGBA 与反向引用') : '') + '</div></div>';
  }

  function updateInspector(root, model, state) {
    const node = model.nodes.get(state.node);
    if (!node) return;
    const p = propertiesOf(node);
    const chosen = effectiveTexture(node, model, state);
    const branch = switchValue(node, model, state);
    const position = Array.isArray(node.position) ? node.position.join(', ') : '';
    const functionPath = p.material_function;

    paint(root.querySelector('.ng-wires'), state.layout, model, state);
    root.querySelectorAll('.ng-tile').forEach(button =>
      button.setAttribute('aria-pressed', String(Number(button.dataset.ngSelect) === state.node)));

    root.querySelector('[data-ng-inspect]').innerHTML =
      '<div class="ng-inspect-head"><div><small class="ng-node-type">#' + node.id + ' · ' +
        escapeHtml(kindLabels[kind(node)]) + '</small><h4>' + escapeHtml(title(node)) +
        '</h4><code>' + escapeHtml(node.type) + '</code></div>' +
        '<button type="button" data-ng-focus="' + node.id + '">从此节点继续追溯</button></div>' +
      (typeof branch === 'boolean' ?
        '<p class="ng-branch-value">' + (state.instance ? '当前实例' : '母材质') +
        '读取的静态开关值为 <strong>' + (branch ? 'True' : 'False') + '</strong>。</p>' : '') +
      (chosen ? textureEvidence(chosen, state.instance ? '当前实例取值' : '节点纹理') : '') +
      (chosen && chosen !== p.texture ? textureEvidence(p.texture, '母材质节点默认纹理') : '') +
      (functionPath && window.NIKKI?.graphs?.[functionPath] ?
        '<div class="ng-function-link">' + assetLink('materials', functionPath,
          '打开函数 ' + shortName(functionPath)) + '</div>' : '') +
      '<div class="ng-pin-grid">' +
        '<section aria-label="输入接线"><h5>输入接线</h5>' + linkRows(node, model, state, true) + '</section>' +
        '<section aria-label="下游去向"><h5>下游去向</h5>' + linkRows(node, model, state, false) + '</section>' +
      '</div>' +
      '<details class="ng-props"><summary>UE 表达式属性与原图坐标</summary><dl>' +
      (position ? '<dt>编辑器坐标</dt><dd>' + escapeHtml(position) + '</dd>' : '') +
      '<dt>对象名</dt><dd>' + escapeHtml(node.name) + '</dd>' +
      entries(p).filter(([,value])=>value !== '').map(([key,value]) =>
        '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(format(value)) + '</dd>').join('') + '</dl></details>';
  }

  function updateIndex(root, model, state) {
    const term = state.text.toLocaleLowerCase().trim();
    const nodes = [...model.nodes.values()].filter(node => {
      if (state.filter !== 'all' && kind(node) !== state.filter) return false;
      return !term || ['#' + node.id, node.type, node.name, title(node), effectiveTexture(node, model, state)]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(term));
    });
    root.querySelector('[data-ng-result-count]').textContent = nodes.length + ' / ' + model.nodes.size + ' 个节点';
    root.querySelector('[data-ng-list]').innerHTML = nodes.map(node =>
      nodeButton(node, '#' + node.id + ' ' + title(node))).join('');
  }

  function onGraphEvent(event) {
    const target = event.target;
    const root = target.closest?.('.nikki-graph');
    const model = root && diagrams.get(root.dataset.ngKey);
    const state = root && graphStates.get(root);
    if (!state || !model) return;
    if (event.type === 'input' && target.matches('[data-ng-query]')) {
      state.text = target.value;
      updateIndex(root, model, state);
    }
    if (event.type === 'change' && target.matches('[data-ng-filter]')) {
      state.filter = target.value;
      updateIndex(root, model, state);
    }
    if (event.type === 'change' && target.matches('[data-ng-anchor],[data-ng-depth],[data-ng-instance]')) {
      if (target.matches('[data-ng-anchor]')) {
        state.anchor = model.anchors[Number(target.value)];
        state.node = state.anchor.id;
      } else if (target.matches('[data-ng-depth]')) {
        state.depth = Number(target.value);
      } else {
        state.instance = target.value;
        updateIndex(root, model, state);
      }
      updateDiagram(root, model, state);
      updateInspector(root, model, state);
    }
    if (event.type === 'click') {
      const button = target.closest('[data-ng-select],[data-ng-focus]');
      if (!button) return;
      state.node = Number(button.dataset.ngSelect ?? button.dataset.ngFocus);
      if (button.hasAttribute('data-ng-focus')) {
        state.anchor = {id:state.node, name:title(model.nodes.get(state.node))};
        root.querySelector('[data-ng-anchor]').selectedIndex = -1;
        updateDiagram(root, model, state);
        root.querySelector('.ng-chart-scroll').focus({preventScroll:true});
        root.querySelector('.ng-chart-scroll').scrollIntoView({block:'nearest'});
      }
      const restoreInspectorFocus = !button.isConnected || Boolean(button.closest('[data-ng-inspect]'));
      updateInspector(root, model, state);
      if (restoreInspectorFocus && !button.hasAttribute('data-ng-focus')) {
        root.querySelector('[data-ng-focus]').focus({preventScroll:true});
      }
      if (button.closest('.ng-node-index')) {
        root.querySelector('[data-ng-inspect]').scrollIntoView({block:'nearest'});
      }
    }
  }

  document.addEventListener('toggle', event => {
    if (event.target.matches?.('.nikki-graph[open]')) mount(event.target);
  }, true);
  document.addEventListener('change', onGraphEvent);
  document.addEventListener('input', onGraphEvent);
  document.addEventListener('click', onGraphEvent);
  function openNode(root, id) {
    if (!root) return;
    root.open = true;
    mount(root);
    const state = graphStates.get(root), model = diagrams.get(root.dataset.ngKey);
    if (!state || !model.nodes.has(id)) return;
    state.node = id;
    state.anchor = {id, name:title(model.nodes.get(id))};
    root.querySelector('[data-ng-anchor]').selectedIndex = -1;
    updateDiagram(root, model, state);
    updateInspector(root, model, state);
    root.querySelector('.ng-chart-scroll').focus({preventScroll:true});
    root.scrollIntoView({block:'start',behavior:'smooth'});
  }

  window.NikkiGraph = {render, mount, openNode};
})();

