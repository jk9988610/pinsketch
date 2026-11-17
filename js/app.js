/* ============================================================
   PinSketch — app.js
   主入口：初始化、事件绑定、拖动/缩放/平移、快捷键
   蓝图框选工具、文件操作
   ============================================================ */

/* ---------- 全屏切换 ---------- */
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  document.documentElement.requestFullscreen?.().catch(() => document.body.classList.toggle('pseudo-fullscreen'));
}

titlebar.addEventListener('dblclick', (e) => {
  if (e.target.closest('button,.top-actions')) return;
  toggleFullscreen();
});

/* ---------- 缩放 ---------- */
function setZoom(z) {
  zoom = Math.max(0.4, Math.min(2.5, z));
  svg.style.transformOrigin = '0 0';
  svg.style.transform = `scale(${zoom})`;
  svg.style.marginRight = Math.max(0, 3000 * (zoom - 1)) + 'px';
  svg.style.marginBottom = Math.max(0, 2000 * (zoom - 1)) + 'px';
  // 更新右侧栏缩放显示
  const zr = document.querySelector('#zoomDisplay');
  if (zr) zr.textContent = Math.round(zoom * 100) + '%';
}

/* ---------- 工具栏切换 + 光标更新 ---------- */
function setTool() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  const placing = pendingBlueprint || pendingComponent || tool !== 'select';
  svg.className.baseVal = 'canvas tool-' + tool + (placing ? ' placing-mode' : '');
}

/* ---------- 导线按段拖动 ---------- */
function startWireSegDrag(e, w) {
  if (tool !== 'select') return;
  e.stopPropagation();
  e.preventDefault();
  selectedWire = w.id;
  selected.clear();
  render();
  showProps();
  const p = client(e);
  // 找到最近的导线段
  const pts = route(w);
  let segIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(p, pts[i], pts[i + 1]);
    if (d < minDist) { minDist = d; segIdx = i; }
  }
  drag = {
    wireSeg: true, w, segIdx,
    start: p,
    moved: false,
    orig: JSON.parse(JSON.stringify({ points: w.points || [] })),
  };
  window.addEventListener('mousemove', moveWireSegDrag);
  window.addEventListener('mouseup', endWireSegDrag, { once: true });
}

function moveWireSegDrag(e) {
  if (!drag?.wireSeg) return;
  const p = client(e);
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !drag.moved) return;
  if (!drag.moved) {
    drag.moved = true;
    snapshot();
  }
  // 拖动导线段：移动该段两端的拐点
  const w = drag.w;
  const pts = route(w);
  const segIdx = drag.segIdx;
  // 判断该段是水平还是垂直
  const seg = { a: pts[segIdx], b: pts[segIdx + 1] };
  const isHorizontal = seg.a.y === seg.b.y;
  if (isHorizontal) {
    // 水平段：上下移动，调整该段 y 坐标
    // 如果是中间段，移动拐点 y；如果是首段/尾段，不移动端点
    // 对于有拐点的导线，移动对应拐点
    // segIdx 对应的拐点在 points 数组中
    const origPts = drag.orig.points;
    // 水平段上下移动 = 调整该段的 y 和相邻段的拐点
    // 简化：直接在 points 中添加/修改拐点
    const newPoints = origPts.map((pt) => ({ x: pt.x, y: pt.y }));
    // 找到该段附近的拐点
    w.points = newPoints.map((pt, i) => {
      if (Math.abs(pt.y - seg.a.y) < GRID) return { x: pt.x, y: snap(seg.a.y + dy) };
      return pt;
    });
  } else {
    // 垂直段：左右移动
    const newPoints = drag.orig.points.map((pt) => ({ x: pt.x, y: pt.y }));
    w.points = newPoints.map((pt) => {
      if (Math.abs(pt.x - seg.a.x) < GRID) return { x: snap(seg.a.x + dx), y: pt.y };
      return pt;
    });
  }
  render();
}

function endWireSegDrag() {
  if (drag?.wireSeg && drag.moved) {
    commit();
  }
  drag = null;
  window.removeEventListener('mousemove', moveWireSegDrag);
}

/** 点到线段的距离 */
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx, py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/* ---------- 导线拖动（整条位移） ---------- */
function startWireDrag(e, w) {
  if (tool !== 'select') return;
  e.stopPropagation();
  e.preventDefault();
  selectedWire = w.id;
  selected.clear();
  render();
  showProps();
  const p = client(e);
  drag = { wire: true, w, dx: p.x, dy: p.y, moved: false, orig: { points: JSON.parse(JSON.stringify(w.points || [])) } };
  window.addEventListener('mousemove', moveWireDrag);
  window.addEventListener('mouseup', endWireDrag, { once: true });
}

function moveWireDrag(e) {
  if (!drag?.wire) return;
  const p = client(e);
  const dx = p.x - drag.dx;
  const dy = p.y - drag.dy;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !drag.moved) return;
  if (!drag.moved) {
    drag.moved = true;
    snapshot();
  }
  const w = drag.w;
  w.points = drag.orig.points.map((pt) => ({ x: snap(pt.x + dx), y: snap(pt.y + dy) }));
  render();
}

function endWireDrag() {
  if (drag?.wire && drag.moved) {
    commit();
  }
  drag = null;
  window.removeEventListener('mousemove', moveWireDrag);
}

/* ---------- 拖动元件文本（位号/名称） ---------- */
function startTextDrag(e, c, txtType) {
  if (tool !== 'select' || pendingBlueprint || pendingComponent) return;
  e.stopPropagation();
  e.preventDefault();
  selectComponent(c.id);
  selectedText = { cid: c.id, type: txtType };
  render();
  const p = client(e);
  const offKey = txtType === 'ref' ? 'refOffset' : 'nameOffset';
  const off = c[offKey] || { x: 0, y: 0 };
  drag = {
    text: true, c, txtType, offKey,
    start: p,
    origOffset: { x: off.x, y: off.y },
    rot: c.rot || 0,
    moved: false,
  };
  window.addEventListener('mousemove', moveTextDrag);
  window.addEventListener('mouseup', endTextDrag, { once: true });
}

function moveTextDrag(e) {
  if (!drag?.text) return;
  const p = client(e);
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !drag.moved) return;
  if (!drag.moved) {
    drag.moved = true;
    snapshot();
  }
  let ldx = dx, ldy = dy;
  const rot = drag.rot;
  if (rot === 1) { ldx = dy; ldy = -dx; }
  else if (rot === 2) { ldx = -dx; ldy = -dy; }
  else if (rot === 3) { ldx = -dy; ldy = dx; }
  drag.c[drag.offKey] = {
    x: snap(drag.origOffset.x + ldx),
    y: snap(drag.origOffset.y + ldy),
  };
  render();
}

function endTextDrag() {
  if (drag?.text && drag.moved) {
    commit();
  }
  drag = null;
  window.removeEventListener('mousemove', moveTextDrag);
}

/* ---------- 拖动元件 ---------- */
function startDrag(e, c) {
  if (tool !== 'select' || e.target.classList.contains('pin') || e.target.classList.contains('remote-node') || pendingBlueprint || pendingComponent) return;
  if (!selected.has(c.id)) {
    selectComponent(c.id, e);
  }
  selectedText = null;
  const p = client(e);
  const ids = [...selected];
  if (!ids.length) return;
  drag = {
    ids,
    start: p,
    moved: false,
    orig: ids.map((id) => {
      const x = byId(id);
      return { id, x: x.x, y: x.y };
    }),
  };
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag, { once: true });
  e.preventDefault();
}

function moveDrag(e) {
  if (!drag) return;
  const p = client(e);
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !drag.moved) return;
  if (!drag.moved) {
    drag.moved = true;
    snapshot();
    svg.classList.add('dragging');
  }
  drag.orig.forEach((o) => {
    const c = byId(o.id);
    c.x = snap(o.x + dx);
    c.y = snap(o.y + dy);
  });
  render();
}

function endDrag() {
  if (drag && drag.moved) {
    commit();
  }
  svg.classList.remove('dragging');
  drag = null;
  window.removeEventListener('mousemove', moveDrag);
}

/* ---------- 拖动导线拐点 ---------- */
function startPointDrag(e, w, i) {
  snapshot();
  const p = client(e);
  drag = { point: true, w, i, dx: p.x - w.points[i].x, dy: p.y - w.points[i].y };
  window.addEventListener('mousemove', movePoint);
  window.addEventListener('mouseup', endPoint, { once: true });
  e.preventDefault();
  e.stopPropagation();
}

function movePoint(e) {
  if (!drag?.point) return;
  const p = client(e);
  drag.w.points[drag.i] = { x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) };
  render();
}

function endPoint() {
  if (drag?.point) {
    commit();
    drag = null;
  }
  window.removeEventListener('mousemove', movePoint);
}

/* ---------- 平移 ---------- */
function movePan(e) {
  if (pan) {
    work.scrollLeft = pan.l - (e.clientX - pan.x);
    work.scrollTop = pan.t - (e.clientY - pan.y);
  }
}

function endPan() {
  pan = null;
  window.removeEventListener('mousemove', movePan);
}

/* ---------- 框选结束 ---------- */
function endBox() {
  if (!box) return;
  const r = normRect(box.a, box.b);

  if (tool === 'blueprint') {
    box = null;
    window.removeEventListener('mouseup', endBox);
    finishBlueprintCapture(r);
    return;
  }

  const ids = state.components.filter((c) => inside(c, r)).map((c) => c.id);
  selected = box.add ? new Set([...selected, ...ids]) : new Set(ids);
  selectedText = null;
  box = null;
  render();
  showProps();
  window.removeEventListener('mouseup', endBox);
}

/* ---------- 画布事件：鼠标移动 ---------- */
svg.addEventListener('mousemove', (e) => {
  const rp = rawClient(e);
  mouseSvg = { x: rp.x, y: rp.y };

  // 更新右侧栏鼠标坐标显示
  const coordEl = document.querySelector('#mouseCoord');
  if (coordEl) coordEl.textContent = 'X: ' + snap(rp.x) + '  Y: ' + snap(rp.y);

  if (wireStart) {
    // 导线跟随鼠标轨迹沿网格线移动
    wireStart.preview = { x: snap(rp.x), y: snap(rp.y) };
    wireStart.previewRaw = { x: rp.x, y: rp.y };
    render();
  }
  if (box) {
    box.b = rawClient(e);
    render();
  }
  if (pendingComponent) {
    render();
  }
});

/* ---------- 画布事件：鼠标按下（框选） ---------- */
svg.addEventListener('mousedown', (e) => {
  if (pendingComponent || pendingBlueprint) return;
  if (tool === 'blueprint' && e.button === 0) {
    box = { a: rawClient(e), b: rawClient(e), add: false };
    window.addEventListener('mouseup', endBox, { once: true });
    return;
  }
  if (tool === 'select' && e.button === 0) {
    const isEmpty = e.target === svg || e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'transparent';
    if (isEmpty) {
      box = { a: rawClient(e), b: rawClient(e), add: e.shiftKey || e.ctrlKey };
      window.addEventListener('mouseup', endBox, { once: true });
    }
  }
});

/* ---------- 画布事件：双击（导线添加拐点） ---------- */
svg.addEventListener('dblclick', (e) => {
  const target = e.target;
  if (target.classList.contains('wire')) {
    const id = state.wires.find((w) => path(route(w)) === target.getAttribute('d'))?.id;
    if (id) {
      snapshot();
      const q = client(e);
      const wire = state.wires.find((x) => x.id === id);
      wire.points.push(q);
      selectedWire = id;
      commit();
      msg('已添加导线拐点');
    }
  }
});

/* ---------- 画布事件：点击（放置 / 选择 / 蓝图放置 / 元件放置） ---------- */
svg.addEventListener('click', (e) => {
  const p = client(e);

  // 悬浮元件放置
  if (pendingComponent) {
    if (typeof pendingComponent === 'object' && pendingComponent.chipTemplate) {
      placeLibraryChip(pendingComponent.chipTemplate, p.x, p.y);
    } else if (typeof pendingComponent === 'object' && pendingComponent.partTemplate) {
      placePartFromLibrary(pendingComponent.partTemplate, p.x, p.y);
    } else {
      placeComponent(pendingComponent, p.x, p.y);
    }
    pendingComponent = null;
    setTool();
    return;
  }

  // 蓝图放置
  if (pendingBlueprint) {
    handleBlueprintPlace(p.x, p.y);
    setTool();
    return;
  }

  if (tool === 'blueprint' && !box) {
    return;
  }

  if (tool === 'label') {
    placeComponent('label', p.x, p.y);
    // 保持工具，可连续放置
  } else if (tool === 'cross') {
    snapshot();
    state.components.push({ id: uid(), type: 'cross', x: p.x, y: p.y, ref: 'NC', name: 'NC', value: 'Not connected', pins: [] });
    commit();
    // 保持工具，可连续放置
  } else if (tool === 'remote') {
    placeComponent('remote', p.x, p.y);
    // 保持工具，可连续放置
  } else if (tool === 'select' && (e.target === svg || (e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'transparent'))) {
    selected.clear();
    selectedPin = null;
    selectedWire = null;
    selectedText = null;
    render();
    showProps();
  } else if (tool === 'wire' && wireStart) {
    msg('请选择蓝色引脚、青色连接点或紫色远程点作为终点。');
  }
});

/* ---------- 工作区事件：滚轮（缩放，以鼠标位置为中心） ---------- */
work.addEventListener('wheel', (e) => {
  e.preventDefault();
  const oldZoom = zoom;
  const newZoom = Math.max(0.4, Math.min(2.5, oldZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  if (newZoom === oldZoom) return;
  const rect = work.getBoundingClientRect();
  const mx = e.clientX - rect.left + work.scrollLeft;
  const my = e.clientY - rect.top + work.scrollTop;
  setZoom(newZoom);
  work.scrollLeft = mx * (newZoom / oldZoom) - (e.clientX - rect.left);
  work.scrollTop = my * (newZoom / oldZoom) - (e.clientY - rect.top);
}, { passive: false });

/* ---------- 工作区事件：平移 ---------- */
work.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.shiftKey && e.button === 0)) {
    pan = { x: e.clientX, y: e.clientY, l: work.scrollLeft, t: work.scrollTop };
    window.addEventListener('mousemove', movePan);
    window.addEventListener('mouseup', endPan, { once: true });
    e.preventDefault();
  }
});

work.addEventListener('scroll', () => {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(saveMemory, 300);
});

/* ---------- 右键菜单 ---------- */
document.addEventListener('click', hideMenu);
document.addEventListener('contextmenu', (e) => {
  if (wireStart) {
    e.preventDefault();
    wireStart = null;
    hideMenu();
    render();
    msg('已取消导线');
    return;
  }
  // 右键：如果在工具模式中，直接取消回到选择模式
  if (tool !== 'select' || wireStart) {
    e.preventDefault();
    tool = 'select';
    wireStart = null;
    setTool();
    hideMenu();
    render();
    msg('已退出工具，回到选择模式');
    return;
  }
  if (pendingBlueprint) {
    e.preventDefault();
    pendingBlueprint = null;
    setTool();
    hideMenu();
    msg('已取消蓝图放置');
    return;
  }
  if (pendingComponent) {
    e.preventDefault();
    pendingComponent = null;
    setTool();
    hideMenu();
    msg('已取消元件放置');
    return;
  }
  if (!e.target.closest('#canvas,.work,.component,.wire,.junction')) return;
  const isObject = !!e.target.closest('.component,.wire,.junction');
  showMenu(
    e,
    isObject
      ? [
          { id: 'copy', label: '复制  Ctrl+C' },
          { id: 'delete', label: '删除  Delete' },
          '-',
          { id: 'wire', label: '从此处开始导线' },
          { id: 'blueprint', label: '框选为蓝图  B' },
          '-',
          { id: 'undo', label: '撤销' },
          { id: 'redo', label: '重做' },
        ]
      : [
          { id: 'paste', label: '粘贴  Ctrl+V' },
          '-',
          { id: 'wire', label: '正交导线  W' },
          { id: 'remote', label: '放置远程连接点  M' },
          '-',
          { id: 'blueprint', label: '框选蓝图  B' },
          { id: 'library', label: '芯片库' },
          { id: 'partsLib', label: '元件库' },
          { id: 'blueprints', label: '蓝图库' },
          { id: 'files', label: '文件库' },
          { id: 'saveAs', label: '另存为…' },
          '-',
          { id: 'erc', label: 'ERC 检查' },
        ]
  );
});

/* ---------- 工具按钮 ---------- */
document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
  // 如果点击当前已激活的工具，则取消回到选择模式
  if (tool === b.dataset.tool) {
    tool = 'select';
    wireStart = null;
    setTool();
    render();
    msg('已退出工具，回到选择模式');
    return;
  }
  tool = b.dataset.tool;
  wireStart = null;
  pendingBlueprint = null;
  pendingComponent = null;
  selectedText = null;
  setTool();
  render();
  msg('已选择：' + b.textContent + '（点击画布放置，Esc/右键取消）');
}));

/* ---------- 快捷键 ---------- */
window.addEventListener('keydown', (e) => {
  const editing = e.target.closest('input,textarea,[contenteditable="true"]');
  if (editing) return;

  if (e.key === 'Delete') {
    if (selectedText) {
      // 重置文本偏移
      const c = byId(selectedText.cid);
      if (c) {
        snapshot();
        if (selectedText.type === 'ref') c.refOffset = { x: 0, y: 0 };
        else c.nameOffset = { x: 0, y: 0 };
        commit();
      }
      return;
    }
    deleteSelected();
  }
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    rotateSelected();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copySelection();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    paste();
  }
  if (!e.ctrlKey && !e.metaKey) {
    const m = { w: 'wire', l: 'label', m: 'remote', b: 'blueprint' };
    if (m[e.key.toLowerCase()]) {
      tool = m[e.key.toLowerCase()];
      wireStart = null;
      pendingBlueprint = null;
      pendingComponent = null;
      selectedText = null;
      setTool();
      msg(m[e.key.toLowerCase()] === 'blueprint' ? '蓝图框选模式：拖动鼠标框选区域，松开后保存为蓝图。按 Esc 取消。' : m[e.key.toLowerCase()] === 'remote' ? '远程连接点：点击画布放置' : '当前工具：' + tool);
    }
  }
  // Esc 取消
  if (e.key === 'Escape') {
    hideMenu();
    if (wireStart) {
      wireStart = null;
      render();
      msg('已取消导线');
    }
    if (pendingBlueprint) {
      pendingBlueprint = null;
      setTool();
      msg('已取消蓝图放置');
    }
    if (pendingComponent) {
      pendingComponent = null;
      setTool();
      msg('已取消元件放置');
    }
    if (selectedText) {
      selectedText = null;
      render();
    }
    // 任何非 select 工具，Esc 回到选择模式
    if (tool !== 'select') {
      tool = 'select';
      wireStart = null;
      setTool();
      msg('已退出工具，回到选择模式');
    }
  }
});

/* ---------- 顶部工具栏按钮 ---------- */
document.querySelector('#undoBtn').onclick = undo;
document.querySelector('#redoBtn').onclick = redo;
document.querySelector('#snapBtn').onclick = () => {
  snapEnabled = !snapEnabled;
  document.querySelector('#snapBtn').classList.toggle('active', snapEnabled);
  msg('吸附' + (snapEnabled ? '已开启' : '已关闭'));
};
document.querySelector('#libraryBtn').onclick = openLibrary;
document.querySelector('#partsLibBtn').onclick = openPartsLibrary;
document.querySelector('#blueprintBtn').onclick = openBlueprintLibrary;
document.querySelector('#fileBtn').onclick = openFileLibrary;
document.querySelector('#exportBtn').onclick = () => {
  const x = netlist();
  modal('PinSketch 网表导出', '<textarea id="out"></textarea>', x, 'pinsketch-netlist.txt');
  document.querySelector('#out').value = x;
};
document.querySelector('#checkBtn').onclick = () => {
  const a = erc();
  const body = a.length
    ? a
        .map(
          (x, i) =>
            `<div class="issue ${x.type}" data-i="${i}"><b>${x.type === 'error' ? '错误' : '警告'}</b>　${esc(x.text)}</div>`
        )
        .join('')
    : '<div class="issue ok"><b>通过</b>　未发现基础 ERC 问题。</div>';
  modal('ERC 检查（' + a.length + ' 项）', body);
  document.querySelectorAll('.issue[data-i]').forEach(
    (x) =>
      (x.onclick = () => {
        selected = new Set(a[x.dataset.i].target ? [a[x.dataset.i].target] : []);
        selectedWire = null;
        selectedText = null;
        document.querySelector('#modal').style.display = 'none';
        render();
        showProps();
      })
  );
};

/* ---------- 文件下拉菜单 ---------- */
const fileDropdown = document.querySelector('#fileDropdown');
document.querySelector('#fileMenuBtn').onclick = (e) => {
  e.stopPropagation();
  fileDropdown.classList.toggle('open');
};
document.querySelector('#fileNewBtn').onclick = () => {
  fileDropdown.classList.remove('open');
  if (!isDirty() || confirm('当前工程未保存，仍要新建吗？')) {
    snapshot();
    state = blank();
    selected.clear();
    selectedText = null;
    selectedWire = null;
    currentFileName = '';
    commit();
    updateStatusbar();
    saveMemory();
  }
};
document.querySelector('#fileOpenBtn').onclick = () => {
  fileDropdown.classList.remove('open');
  document.querySelector('#fileInput').click();
};
document.querySelector('#fileSaveBtn').onclick = () => {
  fileDropdown.classList.remove('open');
  save();
};
document.querySelector('#fileSaveAsBtn').onclick = () => {
  fileDropdown.classList.remove('open');
  saveAs();
};
document.querySelector('#fileInput').onchange = (e) => loadFile(e.target.files[0]);
// 点击外部关闭文件下拉
document.addEventListener('click', () => fileDropdown.classList.remove('open'));

/* ---------- 帮助 / 模态框关闭 ---------- */
document.querySelector('#helpBtn').onclick = showHelp;
document.querySelector('#closeBtn').onclick = () => (document.querySelector('#modal').style.display = 'none');
document.querySelector('#modalCloseBtn').onclick = () => (document.querySelector('#modal').style.display = 'none');
document.querySelector('#modal').addEventListener('mousedown', (e) => {
  if (e.target === document.querySelector('#modal')) {
    document.querySelector('#modal').style.display = 'none';
  }
});

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ============================================================
   初始化
   ============================================================ */
loadMemory();
state = loadAuto();
saved = JSON.stringify(state);

// 左侧元件按钮（不含 chip，chip 从芯片库添加）
Object.entries(DEFS).forEach(([type, name]) => {
  if (['label', 'remote', 'junction', 'cross', 'chip'].includes(type)) return;
  const b = document.createElement('button');
  b.className = 'tool';
  b.textContent = name;
  b.onclick = () => add(type);
  document.querySelector('#parts').append(b);
});

setZoom(uiMemory.zoom || 1);
requestAnimationFrame(() => {
  work.scrollLeft = uiMemory.scrollLeft || 0;
  work.scrollTop = uiMemory.scrollTop || 0;
  if (uiMemory.tool) {
    tool = uiMemory.tool;
    setTool();
  }
});

initDB().then(async () => {
  try { await loadChipLibraryFromDB(); } catch {}
  try { await loadPartsLibraryFromDB(); } catch {}
  if (currentFileName) {
    try {
      const f = await dbAction('files', 'readonly', { type: 'get', key: currentFileName });
      if (f) {
        msg('当前文件：' + currentFileName + ' · 已自动保存');
      } else {
        currentFileName = '';
      }
    } catch {}
  }
  if (!currentFileName) {
    updateStatusbar();
  }
}).catch(() => {
  updateStatusbar();
});

setTool();
showProps();
render();
if (!currentFileName) updateStatusbar();

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  toggleFullscreen, setZoom, setTool, startDrag, moveDrag, endDrag,
  startPointDrag, movePoint, endPoint, movePan, endPan, endBox,
  startWireDrag, moveWireDrag, endWireDrag,
  startWireSegDrag, moveWireSegDrag, endWireSegDrag, distToSegment,
  startTextDrag, moveTextDrag, endTextDrag,
});
