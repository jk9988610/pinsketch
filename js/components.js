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
  if (['gnd', 'vcc', 'label', 'remote'].includes(type))
    return [{ side: 'left', name: 'NET' }];
  if (['button', 'switch', 'resistor', 'capacitor', 'diode', 'led'].includes(type))
    return [{ side: 'left', name: '1' }, { side: 'right', name: '2' }];
  return [];
}

/* ---------- 放置元件 ---------- */
/**
 * 进入元件悬浮放置模式：元件跟随鼠标移动，左键点击放置
 * @param {string} type 元件类型
 * @param {number} [x] 指定坐标（可选，用于粘贴/蓝图等）
 * @param {number} [y]
 */
function add(type, x, y) {
  // 如果指定了坐标，直接放置（粘贴/蓝图等场景）
  if (x != null && y != null) {
    placeComponent(type, x, y);
    return;
  }
  // 否则进入悬浮放置模式
  pendingComponent = type;
  tool = 'select';
  setTool();
  msg('元件跟随鼠标移动，左键点击放置，Esc 取消。');
}

/** 实际放置元件到指定坐标 */
function placeComponent(type, x, y) {
  snapshot();
  const n = state.components.filter((c) => c.type === type).length + 1;
  const c = {
    id: uid(),
    type,
    x: snap(x),
    y: snap(y),
    width: type === 'chip' ? 180 : undefined,
    height: type === 'chip' ? 140 : undefined,
    ref:
      type === 'chip' ? 'U' + n :
      type === 'resistor' ? 'R' + n :
      type === 'capacitor' ? 'C' + n :
      type === 'diode' ? 'D' + n :
      type === 'led' ? 'LED' + n :
      ['button', 'switch'].includes(type) ? 'SW' + n :
      type === 'label' ? 'NET' + n : '',
    name:
      type === 'chip' ? 'Custom IC' :
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
/**
 * 进入芯片悬浮放置模式：从芯片库选择后跟随鼠标
 */
function addFromLibrary(id) {
  const t = chipLibrary.find((x) => x.id === id);
  if (!t) return;
  // 存储芯片模板，进入悬浮模式
  pendingComponent = { chipTemplate: t };
  tool = 'select';
  setTool();
  msg('芯片跟随鼠标移动，左键点击放置，Esc 取消。');
}

/** 实际放置芯片库元件 */
function placeLibraryChip(t, x, y) {
  snapshot();
  const n = state.components.filter((c) => c.type === 'chip').length + 1;
  const c = {
    id: uid(),
    type: 'chip',
    x: snap(x),
    y: snap(y),
    width: Number(t.width) || 180,
    height: Number(t.height) || 140,
    ref: 'U' + n,
    name: t.name,
    value: t.value || '',
    pins: JSON.parse(JSON.stringify(t.pins)),
  };
  state.components.push(c);
  selected = new Set([c.id]);
  selectedWire = null;
  commit();
  msg('已从芯片库放置 ' + t.name);
}

/* ---------- 保存元件到芯片库 ---------- */
function saveChipToLibrary(c) {
  if (!c || c.type !== 'chip') return;
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
  saveChipToDB(item).catch(() => {}); // 异步同步到 IndexedDB
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

/* ---------- 复制 / 粘贴（含导线） ---------- */
function copySelection() {
  if (!selected.size) return;
  const ids = new Set(selected);
  const comps = state.components
    .filter((c) => ids.has(c.id))
    .map((c) => JSON.parse(JSON.stringify(c)));
  // 收集两端都在选中元件内的导线
  const wires = state.wires
    .filter((w) => {
      const aOk = (w.a.cid != null && ids.has(w.a.cid)) || (w.a.jid != null && ids.has(w.a.jid));
      const bOk = (w.b.cid != null && ids.has(w.b.cid)) || (w.b.jid != null && ids.has(w.b.jid));
      return aOk && bOk;
    })
    .map((w) => JSON.parse(JSON.stringify(w)));
  clipboard = { components: comps, wires };
  msg('已复制 ' + comps.length + ' 个元件' + (wires.length ? '，' + wires.length + ' 条导线' : ''));
}

function paste() {
  if (!clipboard?.components?.length) return;
  // 使用鼠标位置作为粘贴中心，如果鼠标不在画布上则用可见区域中心
  const center = (mouseSvg.x || mouseSvg.y) ? mouseSvg : visibleCenter();
  const minX = Math.min(...clipboard.components.map((c) => c.x));
  const minY = Math.min(...clipboard.components.map((c) => c.y));
  snapshot();

  // ID 映射：旧 ID → 新 ID
  const idMap = {};
  const newComps = clipboard.components.map((c) => {
    const newId = uid();
    idMap[c.id] = newId;
    const n = JSON.parse(JSON.stringify(c));
    n.id = newId;
    n.x = snap(center.x + c.x - minX);
    n.y = snap(center.y + c.y - minY);
    return n;
  });

  // 复制导线并映射 ID
  const newWires = (clipboard.wires || []).map((w) => {
    const nw = JSON.parse(JSON.stringify(w));
    nw.id = uid();
    // 映射 cid 和 jid
    if (nw.a.cid != null && idMap[nw.a.cid] != null) nw.a.cid = idMap[nw.a.cid];
    if (nw.a.jid != null && idMap[nw.a.jid] != null) nw.a.jid = idMap[nw.a.jid];
    if (nw.b.cid != null && idMap[nw.b.cid] != null) nw.b.cid = idMap[nw.b.cid];
    if (nw.b.jid != null && idMap[nw.b.jid] != null) nw.b.jid = idMap[nw.b.jid];
    // 位移拐点
    const dx = snap(center.x - minX);
    const dy = snap(center.y - minY);
    nw.points = (w.points || []).map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) }));
    return nw;
  });

  state.components.push(...newComps);
  state.wires.push(...newWires);
  selected = new Set(newComps.map((c) => c.id));
  selectedWire = null;
  commit();
  msg('已粘贴 ' + newComps.length + ' 个元件' + (newWires.length ? '，' + newWires.length + ' 条导线' : ''));
}

/* ---------- 导线端点处理 ---------- */
function endpoint(e) {
  if (tool !== 'wire') {
    selectComponent(e.kind === 'pin' ? e.cid : e.jid);
    selectedPin = e.kind === 'pin' ? { cid: e.cid, pi: e.pi } : null;
    render();
    showProps();
    return;
  }
  if (!wireStart) {
    wireStart = e;
    wireStart.preview = pos(e);
    msg('起点已选择；点击引脚、连接点或远程连接点完成，Esc / 右键取消。');
    return;
  }
  if (key(wireStart) === key(e)) return;
  snapshot();
  state.wires.push({ id: uid(), a: { ...wireStart, preview: undefined }, b: e, points: [] });
  wireStart = null;
  commit();
  msg('导线已连接');
}

/* ---------- 旋转选中元件 ---------- */
/**
 * 顺时针旋转选中元件 90°
 * 旋转时需要调整元件坐标，使旋转后的边界框中心保持不变
 */
function rotateSelected() {
  if (!selected.size) return;
  snapshot();
  selected.forEach((id) => {
    const c = byId(id);
    if (!c) return;
    // junction / cross / label 不旋转
    if (['junction', 'cross', 'label'].includes(c.type)) return;
    const dims = wh(c);
    const { w, h } = dims;
    const oldRot = c.rot || 0;
    const newRot = (oldRot + 1) % 4;
    // 旋转前后边界框尺寸变化
    // rot 0: 宽w 高h, rot 1: 宽h 高w, rot 2: 宽w 高h, rot 3: 宽h 高w
    const oldBoxW = (oldRot === 0 || oldRot === 2) ? w : h;
    const oldBoxH = (oldRot === 0 || oldRot === 2) ? h : w;
    const newBoxW = (newRot === 0 || newRot === 2) ? w : h;
    const newBoxH = (newRot === 0 || newRot === 2) ? h : w;
    // 保持中心不变
    const cx = c.x + oldBoxW / 2;
    const cy = c.y + oldBoxH / 2;
    c.rot = newRot;
    c.x = snap(cx - newBoxW / 2);
    c.y = snap(cy - newBoxH / 2);
  });
  commit();
  msg('已旋转选中元件');
}

/* ---------- 选择元件 ---------- */
function selectComponent(id, e) {
  if (e?.shiftKey || e?.ctrlKey) {
    selected.has(id) ? selected.delete(id) : selected.add(id);
  } else {
    selected = new Set([id]);
  }
  selectedPin = null;
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
 * 捕获矩形区域内的所有元件（含 junction）及其内部导线为蓝图数据
 * @param {object} r 矩形 {x, y, w, h}
 * @param {string} name 蓝图名称
 * @returns {{components:Array, wires:Array, name:string} | null}
 */
function captureBlueprintFromRect(r, name) {
  // 收集框选矩形相交的所有元件（含 junction / cross 等所有类型）
  const allInRect = state.components.filter((c) => {
    if (c.type === 'junction') {
      // junction 是一个点，判定点是否在矩形内
      return c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h;
    }
    return inside(c, r);
  });
  if (allInRect.length === 0) {
    msg('框选区域内没有元件，蓝图未保存。');
    return null;
  }

  // 所有在框选区域内的元件 ID 集合
  const ids = new Set(allInRect.map((c) => c.id));

  // 收集内部导线：导线两端（pin→cid 或 junction→jid）引用的元件都在选中集合内
  const wires = state.wires.filter((w) => {
    const aOk = (w.a.cid != null && ids.has(w.a.cid)) || (w.a.jid != null && ids.has(w.a.jid));
    const bOk = (w.b.cid != null && ids.has(w.b.cid)) || (w.b.jid != null && ids.has(w.b.jid));
    return aOk && bOk;
  });

  return {
    components: JSON.parse(JSON.stringify(allInRect)),
    wires: JSON.parse(JSON.stringify(wires)),
    name: name || ('蓝图 ' + new Date().toLocaleString()),
  };
}

/**
 * 将蓝图放置到画布指定位置
 * 蓝图中的所有元件（含 junction）和内部导线整体复制，ID 全部重新分配
 * @param {object} bp 蓝图数据 {components, wires}
 * @param {number} x 放置中心 X
 * @param {number} y 放置中心 Y
 */
function placeBlueprint(bp, x, y) {
  if (!bp || !bp.components || bp.components.length === 0) return;

  // 计算蓝图原始边界框中心（包含 junction 点）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bp.components.forEach((c) => {
    if (c.type === 'junction') {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    } else {
      const q = wh(c);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + q.w);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y + q.h);
    }
  });
  const cx = snap((minX + maxX) / 2);
  const cy = snap((minY + maxY) / 2);
  const dx = snap(x) - cx;
  const dy = snap(y) - cy;

  snapshot();

  // ID 映射：旧 ID → 新 ID（适用于所有元件，包括 junction）
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

  // 重建导线引用：cid 和 jid 都需要映射
  const newWires = bp.wires.map((w) => {
    const nw = JSON.parse(JSON.stringify(w));
    nw.id = uid();
    // 映射 a 端
    if (nw.a.cid != null && idMap[nw.a.cid] != null) nw.a.cid = idMap[nw.a.cid];
    if (nw.a.jid != null && idMap[nw.a.jid] != null) nw.a.jid = idMap[nw.a.jid];
    // 映射 b 端
    if (nw.b.cid != null && idMap[nw.b.cid] != null) nw.b.cid = idMap[nw.b.cid];
    if (nw.b.jid != null && idMap[nw.b.jid] != null) nw.b.jid = idMap[nw.b.jid];
    // 位移拐点
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
  pins, add, addFromLibrary, placeComponent, placeLibraryChip, saveChipToLibrary, parsePins,
  deleteSelected, rotateSelected,
  copySelection, paste, endpoint, selectComponent, normRect, inside,
  captureBlueprintFromRect, placeBlueprint,
});
