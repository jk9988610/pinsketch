/* ============================================================
   PinSketch — components.js
   元件类型定义、放置/删除/复制/粘贴、芯片库
   ============================================================ */

/* ---------- 各类型元件的默认引脚 ---------- */
function pins(type) {
  if (type === 'chip')
    return [
      { side: 'left', name: 'PIN1' },
      { side: 'left', name: 'PIN2' },
      { side: 'right', name: 'PIN3' },
      { side: 'right', name: 'PIN4' },
    ];
  if (type === 'connector')
    return [{ side: 'left', name: '1' }, { side: 'left', name: '2' }, { side: 'left', name: '3' }];
  if (['gnd', 'vcc', 'label', 'remote'].includes(type))
    return [{ side: 'left', name: 'NET' }];
  if (['button', 'switch', 'resistor', 'capacitor', 'diode', 'led'].includes(type))
    return [{ side: 'left', name: '1' }, { side: 'right', name: '2' }];
  return [];
}

/* ---------- 放置元件 ---------- */
function add(type, x = visibleCenter().x, y = visibleCenter().y) {
  snapshot();
  const n = state.components.filter((c) => c.type === type).length + 1;
  const c = {
    id: uid(),
    type,
    x: snap(x),
    y: snap(y),
    width: ['chip', 'connector'].includes(type) ? 180 : undefined,
    height: ['chip', 'connector'].includes(type) ? 140 : undefined,
    ref:
      type === 'chip' ? 'U' + n :
      type === 'connector' ? 'J' + n :
      type === 'resistor' ? 'R' + n :
      type === 'capacitor' ? 'C' + n :
      type === 'diode' ? 'D' + n :
      type === 'led' ? 'LED' + n :
      ['button', 'switch'].includes(type) ? 'SW' + n :
      type === 'label' ? 'NET' + n : '',
    name:
      type === 'chip' ? 'Custom IC' :
      type === 'connector' ? 'Connector' :
      type === 'remote' ? 'REMOTE_' + n :
      DEFS[type] || type,
    value: type === 'resistor' ? '0R' : type === 'capacitor' ? '100nF' : '',
    pins: pins(type),
  };
  state.components.push(c);
  selected = new Set([c.id]);
  selectedWire = null;
  commit();
  msg('已放置 ' + (type === 'remote' ? '远程连接点' : DEFS[type] || type));
}

/* ---------- 从芯片库放置 ---------- */
function addFromLibrary(id) {
  const t = chipLibrary.find((x) => x.id === id);
  if (!t) return;
  add('chip');
  const c = byId([...selected][0]);
  c.name = t.name;
  c.value = t.value || '';
  c.width = Number(t.width) || 180;
  c.height = Number(t.height) || 140;
  c.pins = JSON.parse(JSON.stringify(t.pins));
  commit();
  msg('已从芯片库放置 ' + t.name);
}

/* ---------- 保存元件到芯片库 ---------- */
function saveChipToLibrary(c) {
  if (!c || !['chip', 'connector'].includes(c.type)) return;
  const name = prompt('保存到芯片库的名称：', c.name);
  if (!name?.trim()) return;
  const item = {
    id: 'chip-' + Date.now(),
    name: name.trim(),
    value: c.value || '',
    width: Number(c.width) || 180,
    height: Number(c.height) || 140,
    pins: JSON.parse(JSON.stringify(c.pins)),
    createdAt: new Date().toISOString(),
  };
  chipLibrary.push(item);
  saveMemory();
  msg('已保存"' + item.name + '"到芯片库');
}

/* ---------- 解析引脚文本（多行 left:/right:） ---------- */
function parsePins(raw) {
  let auto = 0;
  return raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(left|right|top|bottom)\s*:\s*(.+)$/i);
      return m
        ? { side: m[1].toLowerCase(), name: m[2].trim() }
        : { side: auto++ % 2 ? 'right' : 'left', name: x };
    });
}

/* ---------- 删除选中 ---------- */
function deleteSelected() {
  if (!selected.size) return;
  snapshot();
  const ids = selected;
  state.wires = state.wires.filter(
    (w) => !ids.has(w.a.cid) && !ids.has(w.b.cid) && !ids.has(w.a.jid) && !ids.has(w.b.jid)
  );
  state.components = state.components.filter((c) => !ids.has(c.id));
  selected.clear();
  commit();
}

/* ---------- 对齐 / 等距 ---------- */
function alignLeft() {
  if (selected.size < 2) return;
  snapshot();
  const x = Math.min(...[...selected].map((id) => byId(id).x));
  selected.forEach((id) => (byId(id).x = x));
  commit();
}

function distribute() {
  if (selected.size < 3) return;
  const a = [...selected].map(byId).sort((a, b) => a.x - b.x);
  const start = a[0].x;
  const end = a[a.length - 1].x;
  const step = (end - start) / (a.length - 1);
  snapshot();
  a.forEach((c, i) => (c.x = snap(start + i * step)));
  commit();
}

function alignMenu() {
  if (selected.size < 2) {
    msg('请先选择至少两个元件。');
    return;
  }
  alignLeft();
}

/* ---------- 复制 / 粘贴 ---------- */
function copySelection() {
  if (!selected.size) return;
  clipboard = state.components
    .filter((c) => selected.has(c.id))
    .map((c) => JSON.parse(JSON.stringify(c)));
  msg('已复制 ' + clipboard.length + ' 个元件');
}

function paste() {
  if (!clipboard?.length) return;
  const center = visibleCenter();
  const minX = Math.min(...clipboard.map((c) => c.x));
  const minY = Math.min(...clipboard.map((c) => c.y));
  snapshot();
  const next = clipboard.map((c) => {
    const n = JSON.parse(JSON.stringify(c));
    n.id = uid();
    n.x = snap(center.x + c.x - minX);
    n.y = snap(center.y + c.y - minY);
    return n;
  });
  state.components.push(...next);
  selected = new Set(next.map((c) => c.id));
  commit();
  msg('已粘贴 ' + next.length + ' 个元件');
}

/* ---------- 导线端点处理 ---------- */
function endpoint(e) {
  if (tool !== 'wire') {
    selectComponent(e.kind === 'pin' ? e.cid : e.jid);
    render();
    showProps();
    return;
  }
  if (!wireStart) {
    wireStart = e;
    wireStart.preview = pos(e);
    msg('起点已选择；点击引脚或连接点完成，Esc 取消。');
    return;
  }
  if (key(wireStart) === key(e)) return;
  snapshot();
  state.wires.push({ id: uid(), a: { ...wireStart, preview: undefined }, b: e, points: [] });
  wireStart = null;
  commit();
  msg('导线已连接');
}

/* ---------- 选择元件 ---------- */
function selectComponent(id, e) {
  if (e?.shiftKey || e?.ctrlKey) {
    selected.has(id) ? selected.delete(id) : selected.add(id);
  } else {
    selected = new Set([id]);
  }
  selectedWire = null;
}

/* ---------- 框选辅助 ---------- */
function normRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** 元件边界框是否与矩形 r 相交（交叉判定，非严格包含） */
function inside(c, r) {
  const q = wh(c);
  // 元件矩形 [c.x, c.x+q.w] × [c.y, c.y+q.h] 与 [r.x, r.x+r.w] × [r.y, r.y+r.h] 相交
  return c.x < r.x + r.w && c.x + q.w > r.x && c.y < r.y + r.h && c.y + q.h > r.y;
}

/* ---------- 蓝图：捕获 / 放置 ---------- */
/**
 * 捕获当前选中区域为蓝图数据
 * 收集所有选中元件及其内部导线
 * @returns {{components:Array, wires:Array, name:string} | null}
 */
function captureBlueprint(name) {
  if (selected.size === 0) {
    msg('请先框选元件后再捕获蓝图。');
    return null;
  }
  const ids = new Set(selected);
  const comps = state.components.filter((c) => ids.has(c.id));
  const wires = state.wires.filter(
    (w) =>
      // 导线两端都在选中元件内（内部导线）
      (w.a.cid != null && ids.has(w.a.cid) && w.b.cid != null && ids.has(w.b.cid)) ||
      (w.a.cid != null && ids.has(w.a.cid) && w.b.jid != null && ids.has(w.b.jid)) ||
      (w.a.jid != null && ids.has(w.a.jid) && w.b.cid != null && ids.has(w.b.cid)) ||
      (w.a.jid != null && ids.has(w.a.jid) && w.b.jid != null && ids.has(w.b.jid))
  );
  if (comps.length === 0) {
    msg('框选区域内没有元件。');
    return null;
  }
  return {
    components: JSON.parse(JSON.stringify(comps)),
    wires: JSON.parse(JSON.stringify(wires)),
    name: name || ('蓝图 ' + new Date().toLocaleString()),
  };
}

/**
 * 将蓝图放置到画布指定位置
 * @param {object} bp 蓝图数据 {components, wires}
 * @param {number} x 放置中心 X
 * @param {number} y 放置中心 Y
 */
function placeBlueprint(bp, x, y) {
  if (!bp || !bp.components || bp.components.length === 0) return;
  // 计算蓝图原始边界框中心
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bp.components.forEach((c) => {
    const q = wh(c);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + q.w);
    maxY = Math.max(maxY, c.y + q.h);
  });
  const cx = snap((minX + maxX) / 2);
  const cy = snap((minY + maxY) / 2);
  const dx = snap(x) - cx;
  const dy = snap(y) - cy;

  snapshot();

  // ID 映射：旧 ID → 新 ID
  const idMap = {};
  const newComps = bp.components.map((c) => {
    const newId = uid();
    idMap[c.id] = newId;
    const nc = JSON.parse(JSON.stringify(c));
    nc.id = newId;
    nc.x = snap(c.x + dx);
    nc.y = snap(c.y + dy);
    return nc;
  });

  // 重建导线引用
  const newWires = bp.wires.map((w) => {
    const nw = JSON.parse(JSON.stringify(w));
    nw.id = uid();
    nw.a = { ...w.a };
    nw.b = { ...w.b };
    if (nw.a.cid != null && idMap[nw.a.cid]) nw.a.cid = idMap[nw.a.cid];
    if (nw.b.cid != null && idMap[nw.b.cid]) nw.b.cid = idMap[nw.b.cid];
    nw.points = (w.points || []).map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) }));
    return nw;
  });

  state.components.push(...newComps);
  state.wires.push(...newWires);
  selected = new Set(newComps.map((c) => c.id));
  selectedWire = null;
  commit();
  msg('已放置蓝图（' + newComps.length + ' 个元件）');
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  pins, add, addFromLibrary, saveChipToLibrary, parsePins,
  deleteSelected, alignLeft, distribute, alignMenu,
  copySelection, paste, endpoint, selectComponent, normRect, inside,
  captureBlueprint, placeBlueprint,
});
