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
      selectedPin = null;
      render();
      showProps();
    });
    // 拖动整条导线
    p.addEventListener('mousedown', (e) => {
      if (tool === 'select' && e.button === 0 && !e.target.classList.contains('wire-handle')) {
        startWireDrag(e, w);
      }
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

  // 渲染悬浮元件预览（半透明跟随鼠标）
  if (pendingComponent) {
    drawPendingPreview();
  }
}

/* ---------- 悬浮元件预览 ---------- */
function drawPendingPreview() {
  const p = mouseSvg;
  // 构建临时元件对象用于绘制
  let c;
  if (typeof pendingComponent === 'object' && pendingComponent.chipTemplate) {
    // 芯片库元件
    const t = pendingComponent.chipTemplate;
    c = {
      id: '__preview__',
      type: 'chip',
      x: snap(p.x),
      y: snap(p.y),
      width: Number(t.width) || 180,
      height: Number(t.height) || 140,
      ref: '',
      name: t.name,
      value: t.value || '',
      pins: t.pins,
      rot: 0,
    };
  } else {
    // 普通元件
    c = {
      id: '__preview__',
      type: pendingComponent,
      x: snap(p.x),
      y: snap(p.y),
      ref: '',
      name: DEFS[pendingComponent] || pendingComponent,
      value: '',
      pins: pins(pendingComponent),
      rot: 0,
    };
  }
  // 在临时 group 中绘制（半透明，不绑定事件）
  const group = drawComponentPreview(c);
  svg.append(group);
}

/** 绘制元件预览（半透明，不绑定事件，用于悬浮放置） */
function drawComponentPreview(c) {
  const { w, h } = wh(c);
  const group = el('g', {
    transform: `translate(${c.x} ${c.y})`,
    class: 'component preview-comp',
    'pointer-events': 'none',
    opacity: '0.5',
  });
  // 复用绘制逻辑：创建临时 group 并附加子元素
  // 由于 drawComponent 会绑定事件并附加到 svg，这里手动复制关键绘制
  if (c.type === 'chip') {
    group.append(el('rect', { x: 0, y: 0, width: w, height: h, rx: 4, class: 'body' }));
    text(group, w / 2, 19, c.name, 'middle');
    text(group, w / 2, h - 8, 'Preview', 'middle', 'ref');
  } else if (c.type === 'resistor') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H12 L18 17 27 39 36 17 45 39 52 28 H70', class: 'line' }));
    group.append(el('rect', { x: 13, y: 17, width: 39, height: 22, class: 'sym' }));
  } else if (c.type === 'capacitor') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H25 M45 28H70 M26 10V46 M44 10V46', class: 'line' }));
  } else if (['diode', 'led'].includes(c.type)) {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H17 M51 28H70 M18 10V46 L50 28Z M51 10V46', class: 'sym' }));
    if (c.type === 'led') group.append(el('path', { d: 'M49 9l12-10 M54 15l12-10', class: 'line' }));
  } else if (c.type === 'button') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H17 M53 28H70 M17 28H53 M35 28V12', class: 'line' }));
  } else if (c.type === 'switch') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H18 M52 28H70 M18 28L52 12', class: 'line' }));
  } else if (c.type === 'gnd') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M35 0V18 M15 20H55 M21 27H49 M29 34H41', class: 'line' }));
    text(group, 35, 51, 'GND', 'middle', 'powertext');
  } else if (c.type === 'vcc') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M35 55V18 M23 30L35 18 47 30', class: 'line' }));
    text(group, 35, 14, 'VCC', 'middle', 'powertext');
  } else if (c.type === 'label') {
    group.append(el('rect', { x: 0, y: 8, width: 92, height: 27, rx: 3, class: 'labelbox' }));
    text(group, 46, 27, c.name, 'middle');
  } else if (c.type === 'cross') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M20 18L50 48 M50 18L20 48', class: 'cross' }));
  } else if (c.type === 'remote') {
    group.append(el('rect', { x: -10, y: 0, width: 58, height: 50, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H22 M22 16L38 28 22 40Z', class: 'line' }));
    group.append(el('circle', { cx: 0, cy: 28, r: 5, class: 'remote-node' }));
    text(group, 44, 32, c.name, 'start', 'remote-label');
  } else if (c.type === 'junction') {
    group.append(el('circle', { cx: 0, cy: 0, r: 6, class: 'junction' }));
  }

  // 引脚预览
  (c.pins || []).forEach((pin, i) => {
    const q = pinPos(c, i);
    const x = q.x - c.x;
    const y = q.y - c.y;
    group.append(el('circle', { cx: x, cy: y, r: 5, class: 'pin' }));
  });

  return group;
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
      if (tool === 'wire') {
        endpoint({ kind: 'junction', jid: c.id });
      } else if (tool === 'select') {
        // 选择并准备拖动
        if (!selected.has(c.id)) selectComponent(c.id, e);
        startDrag(e, c);
      }
    });
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tool === 'select') {
        selectComponent(c.id, e);
        render();
        showProps();
      }
    });
    svg.append(q);
    return;
  }

  // ---- 远程连接点 ----
  if (c.type === 'remote') {
    const rot = c.rot || 0;
    const rotDeg = rot * 90;
    const group = el('g', {
      transform: `translate(${c.x} ${c.y})` + (rotDeg ? ` rotate(${rotDeg})` : ''),
      class: 'component ' + (selected.has(c.id) ? 'selected ' : '') + (g.find('p' + c.id + '.0') === active ? 'net' : ''),
    });
    group.addEventListener('mousedown', (e) => startDrag(e, c));
    group.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('remote-node')) return;
      selectComponent(c.id, e);
      render();
      showProps();
    });
    group.append(el('rect', { x: -10, y: 0, width: 58, height: 50, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H22 M22 16L38 28 22 40Z', class: 'line' }));
    const pin = el('circle', { cx: 0, cy: 28, r: 5, class: 'remote-node' });
    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: 0 });
    });
    group.append(pin);
    // 远程连接点名称文本（保持水平）
    const mates = remoteMates(c);
    const labelTxt = c.name + (mates.length ? '  ⇄' + mates.length : '');
    const t = el('text', { x: 44, y: 32, class: 'remote-label', 'text-anchor': 'start' });
    t.textContent = labelTxt;
    if (rotDeg) t.setAttribute('transform', `rotate(${-rotDeg} 44 32)`);
    group.append(t);
    svg.append(group);
    return;
  }

  // ---- 普通元件 ----
  const { w, h } = wh(c);
  const isSel = selected.has(c.id);
  const net = c.pins.some((_, i) => g.find('p' + c.id + '.' + i) === active);
  const rot = c.rot || 0;
  const rotDeg = rot * 90;
  // 旋转后边界框尺寸
  const boxW = (rot === 0 || rot === 2) ? w : h;
  const boxH = (rot === 0 || rot === 2) ? h : w;
  const group = el('g', {
    transform: `translate(${c.x} ${c.y})` + (rotDeg ? ` rotate(${rotDeg} ${boxW / 2} ${boxH / 2})` : ''),
    class: 'component ' + (isSel ? 'selected ' : '') + (net ? 'net' : ''),
  });
  group.addEventListener('mousedown', (e) => startDrag(e, c));
  group.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.classList.contains('pin')) return;
    selectComponent(c.id, e);
    render();
    showProps();
  });

  // 辅助：在旋转的组内添加保持水平的文本（反向旋转抵消组旋转）
  function textUpright(parent, x, y, s, anchor, cls, isRef) {
    const t = el('text', { x, y, 'text-anchor': anchor || 'start', class: cls || '' });
    t.textContent = s;
    // 反向旋转使文本保持水平
    if (rotDeg) t.setAttribute('transform', `rotate(${-rotDeg} ${x} ${y})`);
    if (isRef) {
      t.style.cursor = 'move';
      t.style.pointerEvents = 'auto';
      t.addEventListener('mousedown', (e) => startRefDrag(e, c));
    }
    parent.append(t);
  }

  if (c.type === 'chip') {
    group.append(el('rect', { x: 0, y: 0, width: w, height: h, rx: 4, class: 'body' }));
    textUpright(group, w / 2, 19, c.name, 'middle');
    // chip 位号文本位置 = 默认位置 + refOffset（本地坐标系）
    const off = c.refOffset || { x: 0, y: 0 };
    textUpright(group, w / 2 + off.x, h - 8 + off.y, c.ref, 'middle', 'ref', true);
  } else if (c.type === 'resistor') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H12 L18 17 27 39 36 17 45 39 52 28 H70', class: 'line' }));
    group.append(el('rect', { x: 13, y: 17, width: 39, height: 22, class: 'sym' }));
  } else if (c.type === 'capacitor') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H25 M45 28H70 M26 10V46 M44 10V46', class: 'line' }));
  } else if (['diode', 'led'].includes(c.type)) {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H17 M51 28H70 M18 10V46 L50 28Z M51 10V46', class: 'sym' }));
    if (c.type === 'led') group.append(el('path', { d: 'M49 9l12-10 M54 15l12-10', class: 'line' }));
  } else if (c.type === 'button') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H17 M53 28H70 M17 28H53 M35 28V12', class: 'line' }));
  } else if (c.type === 'switch') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H18 M52 28H70 M18 28L52 12', class: 'line' }));
  } else if (c.type === 'gnd') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M35 0V18 M15 20H55 M21 27H49 M29 34H41', class: 'line' }));
    textUpright(group, 35, 51, 'GND', 'middle', 'powertext');
  } else if (c.type === 'vcc') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M35 55V18 M23 30L35 18 47 30', class: 'line' }));
    textUpright(group, 35, 14, 'VCC', 'middle', 'powertext');
  } else if (c.type === 'label') {
    group.append(el('rect', { x: 0, y: 8, width: 92, height: 27, rx: 3, class: 'labelbox' }));
    textUpright(group, 46, 27, c.name, 'middle');
  } else if (c.type === 'cross') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M20 18L50 48 M50 18L20 48', class: 'cross' }));
  }

  // 位号 + 数值（非 chip/gnd/vcc/label/cross 的元件）— 保持水平，可拖动
  if (!['chip', 'gnd', 'vcc', 'label', 'cross'].includes(c.type)) {
    const off = c.refOffset || { x: 0, y: 0 };
    textUpright(group, 35 + off.x, 72 + off.y, c.ref + (c.value ? '  ' + c.value : ''), 'middle', 'ref', true);
  }

  // 引脚
  c.pins.forEach((p, i) => {
    const q = pinPos(c, i);
    const x = q.x - c.x;
    const y = q.y - c.y;
    const onNet = g.find('p' + c.id + '.' + i) === active;
    const cc = el('circle', { cx: x, cy: y, r: onNet ? 6 : 5, class: 'pin' + (onNet ? ' net' : '') });
    cc.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: i });
    });
    group.append(cc);
    // 引脚标签：根据旋转角度调整偏移方向，使标签始终在引脚外侧且不被遮挡
    const labelOffset = 9;
    let tx, ty, anchor;
    if (rot === 0) {
      tx = p.side === 'right' ? x - labelOffset : x + labelOffset;
      ty = y + 4;
      anchor = p.side === 'right' ? 'end' : 'start';
    } else if (rot === 1) {
      tx = x;
      ty = p.side === 'right' ? y + labelOffset + 4 : y - labelOffset;
      anchor = 'middle';
    } else if (rot === 2) {
      tx = p.side === 'right' ? x + labelOffset : x - labelOffset;
      ty = y + 4;
      anchor = p.side === 'right' ? 'start' : 'end';
    } else {
      tx = x;
      ty = p.side === 'right' ? y - labelOffset : y + labelOffset + 4;
      anchor = 'middle';
    }
    // 引脚标签也保持水平（反向旋转）
    const t = el('text', { x: tx, y: ty, class: 'pintext', 'text-anchor': anchor });
    t.textContent = p.name;
    if (rotDeg) t.setAttribute('transform', `rotate(${-rotDeg} ${tx} ${ty})`);
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
Object.assign(PinSketch, { render, drawWireHandles, drawComponent, drawComponentPreview, text });
