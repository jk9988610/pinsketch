/* ============================================================
   PinSketch — render.js
   SVG 画布渲染：导线、元件、框选、拖动手柄
   ============================================================ */

/* ---------- 主渲染入口 ---------- */
function render() {
  svg.innerHTML = '';
  const g = graph();
  const active = activeNetwork();

  // 渲染透明背景矩形，确保 SVG 空白区域可接收鼠标事件
  svg.append(el('rect', { x: 0, y: 0, width: 3000, height: 2000, fill: 'transparent', 'pointer-events': 'all' }));

  // 渲染导线
  state.wires.forEach((w) => {
    const net = g.find(key(w.a));
    const p = el('path', {
      d: path(route(w)),
      class: 'wire ' + (net === active ? 'net ' : '') + (w.id === selectedWire ? 'selected' : ''),
    });
    p.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedWire = w.id;
      selected.clear();
      render();
      showProps();
    });
    svg.append(p);
    if (w.id === selectedWire) drawWireHandles(w);
  });

  // 渲染导线预览
  if (wireStart) {
    svg.append(el('path', { d: path(orth(pos(wireStart), wireStart.preview)), class: 'wire preview' }));
  }

  // 渲染元件
  state.components.forEach((c) => drawComponent(c, g, active));

  // 渲染框选矩形（蓝图框选模式用不同颜色）
  if (box) {
    const r = normRect(box.a, box.b);
    const isBlueprint = tool === 'blueprint';
    const fillColor = isBlueprint ? '#e5c07b33' : '#54c7ff22';
    const strokeColor = isBlueprint ? '#e5c07b' : '#54c7ff';
    svg.append(
      el('rect', {
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        fill: fillColor,
        stroke: strokeColor,
        'stroke-dasharray': isBlueprint ? '8 4' : '5 4',
        'pointer-events': 'none',
      })
    );
    // 蓝图模式：在框选矩形上方显示文字提示
    if (isBlueprint) {
      const t = el('text', { x: r.x + 10, y: r.y - 8 > 0 ? r.y - 8 : r.y + r.h + 18, class: 'bp-label', 'pointer-events': 'none' });
      t.textContent = '📐 框选蓝图区域…';
      svg.append(t);
    }
  }
}

/* ---------- 导线拐点手柄 ---------- */
function drawWireHandles(w) {
  (w.points || []).forEach((p, i) => {
    const q = el('rect', {
      x: p.x - 6,
      y: p.y - 6,
      width: 12,
      height: 12,
      fill: '#ffd166',
      stroke: '#fff',
      'stroke-width': 1,
      cursor: 'move',
    });
    q.addEventListener('mousedown', (e) => startPointDrag(e, w, i));
    svg.append(q);
  });
}

/* ---------- 绘制单个元件 ---------- */
function drawComponent(c, g, active) {
  // ---- 连接点 ----
  if (c.type === 'junction') {
    const q = el('circle', {
      cx: c.x,
      cy: c.y,
      r: 6,
      class: 'junction ' + (g.find('j' + c.id) === active ? 'selected' : ''),
    });
    q.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'junction', jid: c.id });
    });
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      selectComponent(c.id, e);
      render();
      showProps();
    });
    svg.append(q);
    return;
  }

  // ---- 远程连接点 ----
  if (c.type === 'remote') {
    const group = el('g', {
      transform: `translate(${c.x} ${c.y})`,
      class: 'component ' + (selected.has(c.id) ? 'selected ' : '') + (g.find('p' + c.id + '.0') === active ? 'net' : ''),
    });
    group.addEventListener('mousedown', (e) => startDrag(e, c));
    group.addEventListener('click', (e) => {
      e.stopPropagation();
      selectComponent(c.id, e);
      render();
      showProps();
    });
    group.append(el('path', { d: 'M0 28H22 M22 16L38 28 22 40Z', class: 'line' }));
    const pin = el('circle', { cx: 0, cy: 28, r: 5, class: 'remote-node' });
    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: 0 });
    });
    group.append(pin);
    text(group, 44, 32, c.name, 'start', 'remote-label');
    svg.append(group);
    return;
  }

  // ---- 普通元件 ----
  const { w, h } = wh(c);
  const isSel = selected.has(c.id);
  const net = c.pins[0] && g.find('p' + c.id + '.0') === active;
  const group = el('g', {
    transform: `translate(${c.x} ${c.y})`,
    class: 'component ' + (isSel ? 'selected ' : '') + (net ? 'net' : ''),
  });
  group.addEventListener('mousedown', (e) => startDrag(e, c));
  group.addEventListener('click', (e) => {
    e.stopPropagation();
    selectComponent(c.id, e);
    render();
    showProps();
  });

  if (['chip', 'connector'].includes(c.type)) {
    group.append(el('rect', { x: 0, y: 0, width: w, height: h, rx: 4, class: 'body' }));
    text(group, w / 2, 19, c.name, 'middle');
    text(group, w / 2, h - 8, c.ref, 'middle', 'ref');
  } else if (c.type === 'resistor') {
    group.append(el('path', { d: 'M0 28H12 L18 17 27 39 36 17 45 39 52 28 H70', class: 'line' }));
    group.append(el('rect', { x: 13, y: 17, width: 39, height: 22, class: 'sym' }));
  } else if (c.type === 'capacitor') {
    group.append(el('path', { d: 'M0 28H25 M45 28H70 M26 10V46 M44 10V46', class: 'line' }));
  } else if (['diode', 'led'].includes(c.type)) {
    group.append(el('path', { d: 'M0 28H17 M51 28H70 M18 10V46 L50 28Z M51 10V46', class: 'sym' }));
    if (c.type === 'led') group.append(el('path', { d: 'M49 9l12-10 M54 15l12-10', class: 'line' }));
  } else if (c.type === 'button') {
    group.append(el('path', { d: 'M0 28H17 M53 28H70 M17 28H53 M35 28V12', class: 'line' }));
  } else if (c.type === 'switch') {
    group.append(el('path', { d: 'M0 28H18 M52 28H70 M18 28L52 12', class: 'line' }));
  } else if (c.type === 'gnd') {
    group.append(el('path', { d: 'M35 0V18 M15 20H55 M21 27H49 M29 34H41', class: 'line' }));
    text(group, 35, 51, 'GND', 'middle', 'powertext');
  } else if (c.type === 'vcc') {
    group.append(el('path', { d: 'M35 55V18 M23 30L35 18 47 30', class: 'line' }));
    text(group, 35, 14, 'VCC', 'middle', 'powertext');
  } else if (c.type === 'label') {
    group.append(el('rect', { x: 0, y: 8, width: 92, height: 27, rx: 3, class: 'labelbox' }));
    text(group, 46, 27, c.name, 'middle');
  } else if (c.type === 'cross') {
    group.append(el('path', { d: 'M20 18L50 48 M50 18L20 48', class: 'cross' }));
  }

  // 位号 + 数值（非 chip/connector/gnd/vcc/label/cross 的元件）
  if (!['chip', 'connector', 'gnd', 'vcc', 'label', 'cross'].includes(c.type))
    text(group, 35, 72, c.ref + (c.value ? '  ' + c.value : ''), 'middle', 'ref');

  // 引脚
  c.pins.forEach((p, i) => {
    const q = pinPos(c, i);
    const x = q.x - c.x;
    const y = q.y - c.y;
    const cc = el('circle', { cx: x, cy: y, r: 5, class: 'pin' });
    cc.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: i });
    });
    group.append(cc);
    const t = el('text', {
      x: p.side === 'right' ? x - 9 : x + 9,
      y: y + 4,
      class: 'pintext',
      'text-anchor': p.side === 'right' ? 'end' : 'start',
    });
    t.textContent = p.name;
    group.append(t);
  });

  svg.append(group);
}

/* ---------- 文本辅助 ---------- */
function text(g, x, y, s, a = 'start', cl = '') {
  const t = el('text', { x, y, 'text-anchor': a, class: cl });
  t.textContent = s;
  g.append(t);
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, { render, drawWireHandles, drawComponent, text });
