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

  // 渲染选中元件→文本的蓝色虚线指示
  if (selected.size === 1 && !selectedWire) {
    const c = byId([...selected][0]);
    if (c) drawSelectionLines(c);
  }
  // 渲染选中文本→元件的蓝色虚线指示
  if (selectedText) {
    const c = byId(selectedText.cid);
    if (c) drawSelectionLines(c, selectedText);
  }

  // 渲染导线
  state.wires.forEach((w) => {
    const net = g.find(key(w.a));
    const wPath = el('path', {
      d: path(route(w)),
      class: 'wire ' + (net === active ? 'net ' : '') + (w.id === selectedWire ? 'selected' : ''),
    });
    wPath.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedWire = w.id;
      selected.clear();
      selectedText = null;
      selectedPin = null;
      render();
      showProps();
    });
    // 按段拖动导线
    wPath.addEventListener('mousedown', (e) => {
      if (tool === 'select' && e.button === 0 && !e.target.classList.contains('wire-handle')) {
        startWireSegDrag(e, w);
      }
    });
    svg.append(wPath);
    if (w.id === selectedWire) drawWireHandles(w);
  });

  // 渲染导线预览
  if (wireStart) {
    // 导线沿网格线追踪鼠标移动轨迹
    const sp = pos(wireStart);
    const ep = wireStart.preview || { x: 0, y: 0 };
    const pts = traceWire(sp, ep);
    svg.append(el('path', { d: path(pts), class: 'wire preview' }));
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

/* ---------- 选中指示线（蓝色虚线） ---------- */
function drawSelectionLines(c, txt) {
  // 计算元件中心或单引脚位置
  const { w, h } = wh(c);
  const rot = c.rot || 0;
  const boxW = (rot === 0 || rot === 2) ? w : h;
  const boxH = (rot === 0 || rot === 2) ? h : w;
  const centerX = c.x + boxW / 2;
  const centerY = c.y + boxH / 2;

  // 如果只有一个引脚的元件（gnd, vcc, label, remote, cross），用引脚位置
  let source = { x: centerX, y: centerY };
  if (c.pins && c.pins.length === 1) {
    source = pinPos(c, 0);
  }

  // 如果是选中元件→画到 ref 文本和 name 文本
  if (!txt) {
    // ref 文本位置
    const refOff = c.refOffset || { x: 0, y: 0 };
    const refLocal = getRefLocal(c);
    const refRp = rotPoint(refLocal.x + refOff.x, refLocal.y + refOff.y, { w, h }, rot);
    const refCanvas = { x: c.x + refRp.x, y: c.y + refRp.y };
    drawDashedLine(source, refCanvas);
    // name/value 文本位置
    const nameOff = c.nameOffset || { x: 0, y: 0 };
    const nameLocal = getNameLocal(c);
    if (nameLocal) {
      const nameRp = rotPoint(nameLocal.x + nameOff.x, nameLocal.y + nameOff.y, { w, h }, rot);
      const nameCanvas = { x: c.x + nameRp.x, y: c.y + nameRp.y };
      drawDashedLine(source, nameCanvas);
    }
  } else {
    // 选中文本→画到元件中心/引脚
    const off = txt.type === 'ref' ? (c.refOffset || { x: 0, y: 0 }) : (c.nameOffset || { x: 0, y: 0 });
    const local = txt.type === 'ref' ? getRefLocal(c) : getNameLocal(c);
    if (local) {
      const rp = rotPoint(local.x + off.x, local.y + off.y, { w, h }, rot);
      const txtCanvas = { x: c.x + rp.x, y: c.y + rp.y };
      drawDashedLine(source, txtCanvas);
    }
  }
}

function drawDashedLine(a, b) {
  svg.append(el('line', {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    stroke: '#4fc1ff', 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
    'pointer-events': 'none',
  }));
}

/** 获取 ref 文本的默认本地坐标（旋转前元件坐标系） */
function getRefLocal(c) {
  const { w, h } = wh(c);
  if (c.type === 'chip') return { x: w / 2, y: -10 };   // 芯片外上方
  return { x: 35, y: -8 };                                 // 元件外上方
}

/** 获取 name/value 文本的默认本地坐标 */
function getNameLocal(c) {
  const { w, h } = wh(c);
  if (c.type === 'chip') return { x: w / 2, y: h + 14 };   // 芯片外下方
  if (['gnd', 'vcc', 'label', 'remote', 'cross', 'junction'].includes(c.type)) return null; // 无 name 文本
  return { x: 35, y: 74 };  // 元件外下方
}

/* ---------- 悬浮元件预览 ---------- */
function drawPendingPreview() {
  const p = mouseSvg;
  let c;
  if (typeof pendingComponent === 'object' && pendingComponent.chipTemplate) {
    const t = pendingComponent.chipTemplate;
    c = { id: '__preview__', type: 'chip', x: snap(p.x), y: snap(p.y), width: Number(t.width) || 180, height: Number(t.height) || 140, ref: '', name: t.name, value: t.value || '', pins: t.pins, rot: 0 };
  } else if (typeof pendingComponent === 'object' && pendingComponent.partTemplate) {
    const t = pendingComponent.partTemplate;
    c = { id: '__preview__', type: t.type, x: snap(p.x), y: snap(p.y), ref: '', name: t.name || DEFS[t.type] || t.type, value: t.value || '', pins: t.pins || pins(t.type), rot: 0, width: t.width, height: t.height };
  } else {
    c = { id: '__preview__', type: pendingComponent, x: snap(p.x), y: snap(p.y), ref: '', name: DEFS[pendingComponent] || pendingComponent, value: '', pins: pins(pendingComponent), rot: 0 };
  }
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
  drawComponentShapes(c, group, w, h);
  // 引脚预览
  (c.pins || []).forEach((pin, i) => {
    const lp = pinLocal(c, i);
    group.append(el('circle', { cx: lp.x, cy: lp.y, r: 5, class: 'pin' }));
  });
  return group;
}

/* ---------- 导线拐点手柄 ---------- */
function drawWireHandles(w) {
  (w.points || []).forEach((p, i) => {
    const q = el('rect', {
      x: p.x - 6, y: p.y - 6, width: 12, height: 12,
      fill: '#ffd166', stroke: '#fff', 'stroke-width': 1, cursor: 'move',
    });
    q.addEventListener('mousedown', (e) => startPointDrag(e, w, i));
    svg.append(q);
  });
}

/* ---------- 绘制元件图形（不含文本和引脚，可复用） ---------- */
function drawComponentShapes(c, group, w, h) {
  if (c.type === 'chip') {
    group.append(el('rect', { x: 0, y: 0, width: w, height: h, rx: 4, class: 'body' }));
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
  } else if (c.type === 'vcc') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M35 55V18 M23 30L35 18 47 30', class: 'line' }));
  } else if (c.type === 'label') {
    group.append(el('rect', { x: 0, y: 8, width: 92, height: 27, rx: 3, class: 'labelbox' }));
  } else if (c.type === 'cross') {
    group.append(el('rect', { x: 0, y: 0, width: 70, height: 55, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M20 18L50 48 M50 18L20 48', class: 'cross' }));
  } else if (c.type === 'remote') {
    group.append(el('rect', { x: -10, y: 0, width: 58, height: 50, fill: 'transparent', class: 'hitbox' }));
    group.append(el('path', { d: 'M0 28H22 M22 16L38 28 22 40Z', class: 'line' }));
    group.append(el('circle', { cx: 0, cy: 28, r: 5, class: 'remote-node' }));
  }
}

/* ---------- 绘制单个元件 ---------- */
function drawComponent(c, g, active) {
  // ---- 连接点（不能独立移动，只能随导线移动） ----
  if (c.type === 'junction') {
    const q = el('circle', {
      cx: c.x, cy: c.y, r: 6,
      class: 'junction ' + (g.find('j' + c.id) === active ? 'selected' : ''),
    });
    q.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (tool === 'wire') {
        endpoint({ kind: 'junction', jid: c.id });
      }
      // select 模式下连接点不可独立拖动
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
    const { w, h } = wh(c);
    const group = el('g', {
      transform: `translate(${c.x} ${c.y})` + (rotDeg ? ` rotate(${rotDeg} ${w / 2} ${h / 2})` : ''),
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
    drawComponentShapes(c, group, w, h);
    // 引脚
    const pin = el('circle', { cx: 0, cy: 28, r: 5, class: 'remote-node' });
    pin.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: 0 });
    });
    group.append(pin);
    // 远程名称文本（保持水平，可拖动）
    const mates = remoteMates(c);
    const off = c.nameOffset || { x: 0, y: 0 };
    drawUprightText(group, 44 + off.x, 32 + off.y, c.name + (mates.length ? '  ⇄' + mates.length : ''), 'start', 'remote-label', c, 'name', rotDeg);
    svg.append(group);
    return;
  }

  // ---- 普通元件 ----
  const { w, h } = wh(c);
  const isSel = selected.has(c.id);
  const net = c.pins.some((_, i) => g.find('p' + c.id + '.' + i) === active);
  const rot = c.rot || 0;
  const rotDeg = rot * 90;
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

  // 绘制图形
  drawComponentShapes(c, group, w, h);

  // GND/VCC 文本（跟随旋转）
  if (c.type === 'gnd') {
    const off = c.nameOffset || { x: 0, y: 0 };
    drawRotatedText(group, 35 + off.x, 51 + off.y, 'GND', 'middle', 'powertext', c, 'name', rotDeg);
  } else if (c.type === 'vcc') {
    const off = c.nameOffset || { x: 0, y: 0 };
    drawRotatedText(group, 35 + off.x, 14 + off.y, 'VCC', 'middle', 'powertext', c, 'name', rotDeg);
  } else if (c.type === 'label') {
    const off = c.nameOffset || { x: 0, y: 0 };
    drawRotatedText(group, 46 + off.x, 27 + off.y, c.name, 'middle', '', c, 'name', rotDeg);
  }

  // 位号文本（芯片外部，跟随芯片旋转；非芯片保持水平）
  const refOff = c.refOffset || { x: 0, y: 0 };
  const refLocal = getRefLocal(c);
  const refStr = c.ref || '';
  if (c.type === 'chip') {
    // 芯片位号跟随旋转
    drawRotatedText(group, refLocal.x + refOff.x, refLocal.y + refOff.y, refStr, 'middle', 'ref', c, 'ref', rotDeg);
  } else if (!['gnd', 'vcc', 'label', 'cross', 'junction'].includes(c.type)) {
    // 非芯片元件位号保持水平
    drawUprightText(group, refLocal.x + refOff.x, refLocal.y + refOff.y, refStr, 'middle', 'ref', c, 'ref', rotDeg);
  }

  // 名称/数值文本（芯片外部，跟随芯片旋转；非芯片保持水平）
  const nameOff = c.nameOffset || { x: 0, y: 0 };
  const nameLocal = getNameLocal(c);
  if (nameLocal) {
    const nameStr = c.type === 'chip' ? c.name : (c.value || '');
    if (c.type === 'chip') {
      drawRotatedText(group, nameLocal.x + nameOff.x, nameLocal.y + nameOff.y, nameStr, 'middle', '', c, 'name', rotDeg);
    } else {
      drawUprightText(group, nameLocal.x + nameOff.x, nameLocal.y + nameOff.y, nameStr, 'middle', 'ref', c, 'name', rotDeg);
    }
  }

  // 引脚
  c.pins.forEach((p, i) => {
    const lp = pinLocal(c, i);
    const onNet = g.find('p' + c.id + '.' + i) === active;
    const cc = el('circle', { cx: lp.x, cy: lp.y, r: onNet ? 6 : 5, class: 'pin' + (onNet ? ' net' : '') });
    cc.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      endpoint({ kind: 'pin', cid: c.id, pi: i });
    });
    cc.addEventListener('click', (e) => e.stopPropagation());
    group.append(cc);
    // 引脚标签：保持水平
    const labelOffset = 9;
    let tx, ty, anchor;
    if (p.side === 'right') {
      tx = lp.x - labelOffset; ty = lp.y + 4; anchor = 'end';
    } else if (p.side === 'left') {
      tx = lp.x + labelOffset; ty = lp.y + 4; anchor = 'start';
    } else if (p.side === 'top') {
      tx = lp.x; ty = lp.y - labelOffset; anchor = 'middle';
    } else {
      tx = lp.x; ty = lp.y + labelOffset + 8; anchor = 'middle';
    }
    drawUprightText(group, tx, ty, p.name, anchor, 'pintext', null, null, rotDeg);
  });

  svg.append(group);
}

/** 在旋转组内绘制跟随旋转的文本 */
function drawRotatedText(parent, x, y, s, anchor, cls, c, txtType, rotDeg) {
  const t = el('text', { x, y, 'text-anchor': anchor || 'start', class: cls || '' });
  t.textContent = s;
  // 选中状态：红色
  if (selectedText && selectedText.cid === c.id && selectedText.type === txtType) {
    t.style.fill = '#ff4444';
  } else if (c && selected.has(c.id)) {
    t.style.fill = '#ff4444';
  }
  if (c && txtType) {
    t.style.cursor = 'move';
    t.style.pointerEvents = 'auto';
    t.addEventListener('mousedown', (e) => startTextDrag(e, c, txtType));
  }
  parent.append(t);
}

/** 在旋转组内绘制保持水平的文本（反向旋转抵消组旋转） */
function drawUprightText(parent, x, y, s, anchor, cls, c, txtType, rotDeg) {
  const t = el('text', { x, y, 'text-anchor': anchor || 'start', class: cls || '' });
  t.textContent = s;
  if (rotDeg) t.setAttribute('transform', `rotate(${-rotDeg} ${x} ${y})`);
  // 选中状态：红色
  if (c && selectedText && selectedText.cid === c.id && selectedText.type === txtType) {
    t.style.fill = '#ff4444';
  } else if (c && selected.has(c.id) && !['pintext', 'powertext'].includes(cls)) {
    t.style.fill = '#ff4444';
  }
  if (c && txtType) {
    t.style.cursor = 'move';
    t.style.pointerEvents = 'auto';
    t.addEventListener('mousedown', (e) => startTextDrag(e, c, txtType));
  }
  parent.append(t);
}

/* ---------- 文本辅助 ---------- */
function text(g, x, y, s, a = 'start', cl = '') {
  const t = el('text', { x, y, 'text-anchor': a, class: cl });
  t.textContent = s;
  g.append(t);
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, { render, drawWireHandles, drawComponent, drawComponentPreview, drawComponentShapes, text });
