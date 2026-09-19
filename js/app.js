/* ============================================================
   PinSketch — app.js
   主入口：初始化、事件绑定、拖动/缩放/平移、快捷键
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
  document.querySelector('#zoomResetBtn').textContent = Math.round(zoom * 100) + '%';
}

/* ---------- 工具栏切换 ---------- */
function setTool() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
}

/* ---------- 拖动元件 ---------- */
function startDrag(e, c) {
  if (tool !== 'select' || e.target.classList.contains('pin')) return;
  selectComponent(c.id, e);
  snapshot();
  const p = client(e);
  const ids = [...selected];
  drag = {
    ids,
    start: p,
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
  drag.orig.forEach((o) => {
    const c = byId(o.id);
    c.x = snap(o.x + dx);
    c.y = snap(o.y + dy);
  });
  render();
}

function endDrag() {
  if (drag) {
    commit();
    drag = null;
  }
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
  const ids = state.components.filter((c) => inside(c, r)).map((c) => c.id);
  selected = box.add ? new Set([...selected, ...ids]) : new Set(ids);
  box = null;
  render();
  showProps();
  window.removeEventListener('mouseup', endBox);
}

/* ---------- 画布事件：鼠标移动 ---------- */
svg.addEventListener('mousemove', (e) => {
  if (wireStart) {
    wireStart.preview = client(e);
    render();
  }
  if (box) {
    box.b = rawClient(e);
    render();
  }
});

/* ---------- 画布事件：鼠标按下（框选） ---------- */
svg.addEventListener('mousedown', (e) => {
  if (tool === 'select' && e.target === svg && e.button === 0) {
    box = { a: rawClient(e), b: rawClient(e), add: e.shiftKey || e.ctrlKey };
    window.addEventListener('mouseup', endBox, { once: true });
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

/* ---------- 画布事件：点击（放置 / 选择） ---------- */
svg.addEventListener('click', (e) => {
  const p = client(e);

  if (tool === 'label') {
    add('label', p.x, p.y);
    tool = 'select';
    setTool();
  } else if (tool === 'junction') {
    snapshot();
    const c = { id: uid(), type: 'junction', x: p.x, y: p.y, ref: '', name: 'Junction', value: '', pins: [] };
    state.components.push(c);
    selected = new Set([c.id]);
    commit();
    tool = 'select';
    setTool();
  } else if (tool === 'cross') {
    snapshot();
    state.components.push({ id: uid(), type: 'cross', x: p.x, y: p.y, ref: 'NC', name: 'NC', value: 'Not connected', pins: [] });
    commit();
    tool = 'select';
    setTool();
  } else if (tool === 'remote') {
    add('remote', p.x, p.y);
    tool = 'select';
    setTool();
  } else if (tool === 'select' && e.target === svg) {
    selected.clear();
    selectedWire = null;
    render();
    showProps();
  } else if (tool === 'wire' && wireStart) {
    msg('请选择蓝色引脚或青色连接点作为终点。');
  }
});

/* ---------- 工作区事件：滚轮缩放 ---------- */
work.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
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

/* ---------- 工作区事件：滚动记忆 ---------- */
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
          { id: 'align', label: '对齐所选元件' },
          '-',
          { id: 'undo', label: '撤销' },
          { id: 'redo', label: '重做' },
        ]
      : [
          { id: 'paste', label: '粘贴  Ctrl+V' },
          '-',
          { id: 'wire', label: '正交导线  W' },
          { id: 'junction', label: '放置连接点  J' },
          '-',
          { id: 'library', label: '打开芯片库' },
          { id: 'directory', label: '设计目录' },
          { id: 'erc', label: 'ERC 检查' },
        ]
  );
});

/* ---------- 工具按钮 ---------- */
document.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => {
  tool = b.dataset.tool;
  wireStart = null;
  setTool();
  msg('当前工具：' + b.textContent);
}));

/* ---------- 快捷键 ---------- */
window.addEventListener('keydown', (e) => {
  const editing = e.target.closest('input,textarea,[contenteditable="true"]');
  if (editing) return;

  if (e.key === 'Delete') deleteSelected();
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
    const m = { v: 'select', w: 'wire', l: 'label', j: 'junction', r: 'remote' };
    if (m[e.key.toLowerCase()]) {
      tool = m[e.key.toLowerCase()];
      wireStart = null;
      setTool();
    }
  }
  if (e.key === 'Escape' && wireStart) {
    wireStart = null;
    render();
    msg('已取消导线');
  }
});

/* ---------- 顶部工具栏按钮 ---------- */
document.querySelector('#newBtn').onclick = () => {
  if (!isDirty() || confirm('当前工程未保存，仍要新建吗？')) {
    snapshot();
    state = blank();
    selected.clear();
    currentProjectName = '';
    commit();
  }
};
document.querySelector('#undoBtn').onclick = undo;
document.querySelector('#redoBtn').onclick = redo;
document.querySelector('#alignBtn').onclick = alignMenu;
document.querySelector('#zoomInBtn').onclick = () => setZoom(zoom * 1.2);
document.querySelector('#zoomOutBtn').onclick = () => setZoom(zoom / 1.2);
document.querySelector('#zoomResetBtn').onclick = () => setZoom(1);
document.querySelector('#libraryBtn').onclick = openLibrary;
document.querySelector('#directoryBtn').onclick = openDirectory;
document.querySelector('#saveBtn').onclick = save;
document.querySelector('#loadBtn').onclick = () => document.querySelector('#fileInput').click();
document.querySelector('#fileInput').onchange = (e) => loadFile(e.target.files[0]);

/* ---------- 导出网表 ---------- */
document.querySelector('#exportBtn').onclick = () => {
  const x = netlist();
  modal('PinSketch 网表导出', '<textarea id="out"></textarea>', x, 'pinsketch-netlist.txt');
  document.querySelector('#out').value = x;
};

/* ---------- ERC 检查 ---------- */
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
        document.querySelector('#modal').style.display = 'none';
        render();
        showProps();
      })
  );
};

/* ---------- 帮助 / 模态框关闭 ---------- */
document.querySelector('#helpBtn').onclick = showHelp;
document.querySelector('#closeBtn').onclick = () => (document.querySelector('#modal').style.display = 'none');

/* ---------- 离开前提示 ---------- */
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

// 左侧元件按钮
Object.entries(DEFS).forEach(([type, name]) => {
  if (['label', 'remote', 'junction', 'cross'].includes(type)) return; // 这些用工具按钮
  const b = document.createElement('button');
  b.className = 'tool';
  b.textContent = name;
  b.onclick = () => add(type);
  document.querySelector('#parts').append(b);
});

// 恢复缩放
setZoom(uiMemory.zoom || 1);
requestAnimationFrame(() => {
  work.scrollLeft = uiMemory.scrollLeft || 0;
  work.scrollTop = uiMemory.scrollTop || 0;
  if (uiMemory.tool) {
    tool = uiMemory.tool;
    setTool();
  }
});

// 初始化 IndexedDB
initDB();

// 首次渲染
showProps();
render();
msg('Ready · 自动保存已启用。');

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  toggleFullscreen, setZoom, setTool, startDrag, moveDrag, endDrag,
  startPointDrag, movePoint, endPoint, movePan, endPan, endBox,
});
