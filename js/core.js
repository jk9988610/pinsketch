/* ============================================================
   PinSketch — core.js
   全局状态管理、几何运算、网络图（并查集）、Undo/Redo
   ============================================================ */
const PinSketch = (window.PinSketch = {});

/* ---------- 全局 DOM 引用 ---------- */
const svg = document.querySelector('#canvas');
const work = document.querySelector('#work');
const prop = document.querySelector('#property');
const status = document.querySelector('#status');
const titlebar = document.querySelector('#titlebar');

/* ---------- 常量 ---------- */
const NS = 'http://www.w3.org/2000/svg';
const GRID = 20;

/* ---------- 元件类型显示名 ---------- */
const DEFS = {
  chip: '自定义芯片',
  connector: '连接器',
  resistor: '电阻',
  capacitor: '电容',
  diode: '二极管',
  led: '发光二极管',
  gnd: 'GND',
  vcc: 'VCC',
  button: '按键',
  switch: '拨杆开关',
  label: '网络标签',
  remote: '远程连接点',
  junction: '连接点',
  cross: '打 × / NC',
};

/* ---------- 全局状态 ---------- */
let state,                    // 当前工程数据 {version, components, wires, nextId}
  tool = 'select',            // 当前工具
  selected = new Set(),       // 选中元件 id
  selectedWire = null,        // 选中导线 id
  wireStart = null,           // 导线起点
  drag = null,                // 拖动状态
  box = null,                 // 框选状态
  history = [],               // 撤销栈
  future = [],                // 重做栈
  saved = '',                 // 已保存的快照
  autoTimer,                  // 自动保存定时器
  clipboard = null,           // 剪贴板（内存，用于复制粘贴）
  zoom = 1,                   // 缩放比例
  pan = null,                 // 平移状态
  chipLibrary = [],           // 本机芯片库（localStorage 兜底缓存）
  uiMemory = {},              // UI 记忆（缩放、滚动等）
  currentFileName = '',       // ★当前正在编辑的文件名
  blueprintLibrary = [],     // ★蓝图库缓存
  pendingBlueprint = null;    // ★正在放置的蓝图（从蓝图库选择后待放置到画布）

/* ---------- 工具函数 ---------- */
/** 创建 SVG 元素 */
const el = (n, a = {}) => {
  const x = document.createElementNS(NS, n);
  Object.entries(a).forEach(([k, v]) => x.setAttribute(k, v));
  return x;
};

/** 吸附到网格 */
const snap = (n) => Math.round(n / GRID) * GRID;

/** 生成唯一 ID */
const uid = () => state.nextId++;

/** 按 ID 查找元件 */
const byId = (id) => state.components.find((c) => c.id === id);

/** 状态栏消息 */
const msg = (t) => (status.textContent = t);

/** HTML 转义 */
function esc(s) {
  return String(s || '').replace(
    /[&<>"']/g,
    (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])
  );
}

/* ---------- 工程数据：创建 / 迁移 ---------- */
/** 创建空工程 */
function blank() {
  return { version: 6, components: [], wires: [], nextId: 1 };
}

/**
 * 迁移 / 校验工程数据，保证结构完整
 * @param {object} d
 * @returns {object} 合法工程数据
 */
function migrate(d) {
  if (!d || !Array.isArray(d.components) || !Array.isArray(d.wires))
    throw Error('invalid');
  d.version = 6;
  let max = Math.max(
    d.nextId || 1,
    ...d.components.map((c) => c.id || 0),
    ...d.wires.map((w) => w.id || 0)
  );
  d.components.forEach((c) => {
    if (['chip', 'connector'].includes(c.type)) {
      c.width = Number(c.width) || 180;
      c.height = Number(c.height) || 140;
    }
    if (c.type === 'remote') {
      c.name = String(c.name || 'REMOTE').trim() || 'REMOTE';
      c.pins = [{ side: 'left', name: 'NET' }];
    }
  });
  d.wires = d.wires.map((w) => ({
    ...w,
    id: w.id || ++max,
    points: Array.isArray(w.points) ? w.points : [],
  }));
  d.nextId = Math.max(max, ...d.wires.map((w) => w.id || 0)) + 1;
  return d;
}

/* ---------- 几何运算 ---------- */
/** 元件宽高 */
function wh(c) {
  return ['chip', 'connector'].includes(c.type)
    ? { w: Math.max(100, Number(c.width) || 180), h: Math.max(80, Number(c.height) || 140) }
    : { w: 70, h: 55 };
}

/** 计算元件某引脚在画布上的坐标 */
function pinPos(c, i) {
  const p = c.pins[i];
  const { w, h } = wh(c);
  if (p.side === 'top') return { x: c.x + w / 2, y: c.y };
  if (p.side === 'bottom') return { x: c.x + w / 2, y: c.y + h };
  const sameSide = c.pins.map((q, n) => (q.side === p.side ? n : null)).filter((n) => n !== null);
  const o = sameSide.indexOf(i);
  return { x: p.side === 'right' ? c.x + w : c.x, y: c.y + 32 + o * 22 };
}

/** 生成端点的唯一键 */
function key(e) {
  return e.kind === 'pin' ? 'p' + e.cid + '.' + e.pi : 'j' + e.jid;
}

/** 端点坐标 */
function pos(e) {
  if (e.kind === 'pin') {
    const c = byId(e.cid);
    return c ? pinPos(c, e.pi) : { x: 0, y: 0 };
  }
  const j = byId(e.jid);
  return j ? { x: j.x, y: j.y } : { x: 0, y: 0 };
}

/* ---------- 坐标转换 ---------- */
/** 将鼠标事件坐标转为吸附后的 SVG 坐标 */
function client(e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse());
  return { x: snap(q.x), y: snap(q.y) };
}

/** 将鼠标事件坐标转为原始 SVG 坐标（不吸附） */
function rawClient(e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse());
  return { x: q.x, y: q.y };
}

/** 可见区域中心坐标 */
function visibleCenter() {
  return {
    x: snap((work.scrollLeft + work.clientWidth / 2) / zoom),
    y: snap((work.scrollTop + work.clientHeight / 2) / zoom),
  };
}

/* ---------- 网络图（Union-Find 并查集） ---------- */
/**
 * 构建并查集，返回 find 函数
 * - 所有引脚和连接点初始为独立节点
 * - 导线将两个端点合并
 * - 同名网络标签和远程连接点合并
 * @returns {function} find(x) — 查找节点 x 的根
 */
function graph() {
  const parent = {};
  const nodes = [];
  state.components.forEach((c) => c.pins.forEach((_, i) => nodes.push('p' + c.id + '.' + i)));
  state.components.filter((c) => c.type === 'junction').forEach((c) => nodes.push('j' + c.id));
  nodes.forEach((n) => (parent[n] = n));

  const find = (x) => {
    if (parent[x] === undefined) parent[x] = x;
    return parent[x] === x ? x : (parent[x] = find(parent[x]));
  };
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };

  state.wires.forEach((w) => join(key(w.a), key(w.b)));

  // 同名 label / remote 合并
  const named = {};
  state.components
    .filter((c) => ['label', 'remote'].includes(c.type) && c.name.trim())
    .forEach((c) => {
      const n = c.name.trim();
      if (named[n]) join('p' + named[n].id + '.0', 'p' + c.id + '.0');
      else named[n] = c;
    });

  return { find };
}

/** 正交走线路径（2 或 4 个点） */
function orth(a, b) {
  if (a.x === b.x || a.y === b.y) return [a, b];
  const mid = snap((a.x + b.x) / 2);
  return [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b];
}

/** 计算导线路径点序列 */
function route(w, preview) {
  const a = pos(w.a);
  const b = preview || pos(w.b);
  if (w.points?.length) return [a, ...w.points, b];
  return orth(a, b);
}

/** 点序列转 SVG path d 属性 */
function path(a) {
  return a.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
}

/** 获取当前高亮网络的根标识 */
function activeNetwork() {
  const g = graph();
  if (selectedWire !== null) {
    const w = state.wires.find((x) => x.id === selectedWire);
    return w ? g.find(key(w.a)) : null;
  }
  const id = [...selected][0];
  const c = byId(id);
  if (c?.pins.length) return g.find('p' + c.id + '.0');
  if (c?.type === 'junction') return g.find('j' + c.id);
  return null;
}

/* ---------- Undo / Redo ---------- */
/** 压入历史快照 */
function snapshot() {
  history.push(JSON.stringify(state));
  if (history.length > 100) history.shift();
  future = [];
  mark(true);
}

/** 提交变更：自动保存 + 重新渲染 */
function commit() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    localStorage.setItem('pinsketch-autosave', JSON.stringify(state));
    saveMemory();
    updateStatusbar();
  }, 250);
  render();
  showProps();
}

/** 标记脏/净状态 */
function mark(changed) {
  document.querySelector('#dirty').textContent = changed ? '未保存 · 自动恢复' : '已保存';
}

/** 更新底部状态栏，显示当前文件名和自动保存状态 */
function updateStatusbar() {
  const filePart = currentFileName ? '当前文件：' + currentFileName : '未命名文件';
  msg(filePart + ' · 已自动保存');
}

/** 是否有未保存改动 */
function isDirty() {
  return JSON.stringify(state) !== saved;
}

function undo() {
  if (!history.length) return;
  future.push(JSON.stringify(state));
  state = JSON.parse(history.pop());
  selected.clear();
  selectedWire = null;
  mark(isDirty());
  commit();
  msg('已撤销');
}

function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(state));
  state = JSON.parse(future.pop());
  selected.clear();
  selectedWire = null;
  mark(isDirty());
  commit();
  msg('已重做');
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  // 常量
  DEFS, NS, GRID,
  // 状态变量通过 getter 暴露（保持引用同步）
  get state() { return state; },
  set state(v) { state = v; },
  get tool() { return tool; },
  set tool(v) { tool = v; },
  get selected() { return selected; },
  set selected(v) { selected = v; },
  get selectedWire() { return selectedWire; },
  set selectedWire(v) { selectedWire = v; },
  get wireStart() { return wireStart; },
  set wireStart(v) { wireStart = v; },
  get drag() { return drag; },
  set drag(v) { drag = v; },
  get box() { return box; },
  set box(v) { box = v; },
  get history() { return history; },
  set history(v) { history = v; },
  get future() { return future; },
  set future(v) { future = v; },
  get saved() { return saved; },
  set saved(v) { saved = v; },
  get zoom() { return zoom; },
  set zoom(v) { zoom = v; },
  get clipboard() { return clipboard; },
  set clipboard(v) { clipboard = v; },
  get chipLibrary() { return chipLibrary; },
  set chipLibrary(v) { chipLibrary = v; },
  get currentFileName() { return currentFileName; },
  set currentFileName(v) { currentFileName = v; },
  get blueprintLibrary() { return blueprintLibrary; },
  set blueprintLibrary(v) { blueprintLibrary = v; },
  get pendingBlueprint() { return pendingBlueprint; },
  set pendingBlueprint(v) { pendingBlueprint = v; },
  // 函数
  el, snap, uid, byId, msg, esc, blank, migrate,
  wh, pinPos, key, pos, client, rawClient, visibleCenter,
  graph, orth, route, path, activeNetwork,
  snapshot, commit, mark, isDirty, undo, redo, updateStatusbar,
  // DOM
  svg, work, prop, status, titlebar,
});
