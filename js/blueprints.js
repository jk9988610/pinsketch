/* ============================================================
   PinSketch — blueprints.js
   蓝图库：捕获框选内容、卡片化管理、放置到画布
   类似异星工厂蓝图系统：框选 → 保存为蓝图 → 重复使用
   ============================================================ */

/* ---------- 进入蓝图框选模式 ---------- */
function enterBlueprintMode() {
  tool = 'blueprint';
  wireStart = null;
  setTool();
  // 清除选择，准备框选
  selected.clear();
  selectedWire = null;
  render();
  msg('蓝图框选模式：拖动鼠标框选区域，松开后保存为蓝图。按 Esc 取消。');
}

/* ---------- 蓝图框选完成：保存框选内容 ---------- */
async function finishBlueprintCapture(r) {
  if (r.w < 10 || r.h < 10) {
    msg('框选区域太小，蓝图未保存。');
    return;
  }

  // 直接从矩形区域捕获蓝图（包含 junction 连接点）
  const bp = captureBlueprintFromRect(r, null);
  if (!bp) return;

  // 提示用户命名
  const name = prompt('请输入蓝图名称：', '蓝图 ' + new Date().toLocaleString());
  if (!name?.trim()) {
    msg('已取消保存蓝图。');
    selected.clear();
    render();
    return;
  }
  try {
    await saveBlueprint(name.trim(), bp);
    msg('已保存蓝图"' + name.trim() + '"（' + bp.components.length + ' 个元件，' + bp.wires.length + ' 条导线）');
  } catch {
    msg('蓝图保存失败。');
  }
  // 退出蓝图模式
  tool = 'select';
  setTool();
  selected.clear();
  render();
}

/* ---------- 从蓝图库选择蓝图后准备放置 ---------- */
async function preparePlaceBlueprint(name) {
  const bp = await getBlueprint(name);
  if (!bp) {
    msg('未找到蓝图"' + name + '"');
    return;
  }
  pendingBlueprint = bp;
  tool = 'select';
  setTool();
  msg('已选择蓝图"' + name + '"，在画布上点击放置位置。按 Esc 取消。');
}

/* ---------- 画布点击：放置蓝图 ---------- */
function handleBlueprintPlace(x, y) {
  if (!pendingBlueprint) return false;
  placeBlueprint(pendingBlueprint, x, y);
  pendingBlueprint = null;
  return true;
}

/* ---------- 打开蓝图库模态框 ---------- */
async function openBlueprintLibrary() {
  let blueprints = [];
  try {
    blueprints = await listBlueprints();
  } catch {
    msg('无法访问蓝图库（浏览器不支持 IndexedDB）。');
    return;
  }

  const listHTML = blueprints.length
    ? blueprints
        .map(
          (bp) => `
      <div class="project-card" data-bp-name="${esc(bp.name)}">
        <div class="pc-info">
          <div class="pc-name">📐 ${esc(bp.name)}</div>
          <div class="pc-meta">${bp.componentCount || bp.components?.length || 0} 元件 · ${bp.wires?.length || 0} 导线 · ${new Date(bp.updatedAt || bp.createdAt).toLocaleString()}</div>
        </div>
        <div class="pc-actions">
          <button data-bp-place="${esc(bp.name)}">放置</button>
          <button data-bp-edit="${esc(bp.name)}">编辑</button>
          <button data-bp-rename="${esc(bp.name)}">重命名</button>
          <button data-bp-delete="${esc(bp.name)}" class="danger">删除</button>
        </div>
      </div>`
        )
        .join('')
    : '<div class="project-empty">蓝图库为空。<br>点击顶部"框选蓝图"按钮，在画布上框选区域以创建蓝图。</div>';

  const body = `
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button id="captureBlueprintBtn" style="border:1px solid #007acc;background:#094771;color:#fff;padding:7px 16px;border-radius:3px;cursor:pointer">📐 框选蓝图</button>
      <button id="exportBlueprintsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:7px 16px;border-radius:3px;cursor:pointer">导出蓝图库</button>
      <button id="importBlueprintsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:7px 16px;border-radius:3px;cursor:pointer">导入蓝图库</button>
    </div>
    <div class="project-grid">${listHTML}</div>
    <input id="bpImportFile" type="file" accept=".json" hidden>
  `;

  modal('蓝图库', body);

  // 框选蓝图按钮
  const capBtn = document.querySelector('#captureBlueprintBtn');
  if (capBtn) {
    capBtn.onclick = () => {
      document.querySelector('#modal').style.display = 'none';
      enterBlueprintMode();
    };
  }

  // 导出蓝图库
  const expBtn = document.querySelector('#exportBlueprintsBtn');
  if (expBtn) {
    expBtn.onclick = () => {
      const data = JSON.stringify(blueprints, null, 2);
      download('pinsketch-blueprints.json', data, 'application/json');
      msg('已导出蓝图库');
    };
  }

  // 导入蓝图库
  const impBtn = document.querySelector('#importBlueprintsBtn');
  if (impBtn) {
    impBtn.onclick = () => document.querySelector('#bpImportFile').click();
    const impFile = document.querySelector('#bpImportFile');
    if (impFile) {
      impFile.onchange = (e) => {
        if (!e.target.files[0]) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const imported = JSON.parse(r.result);
            if (Array.isArray(imported)) {
              for (const bp of imported) {
                if (bp.name && bp.components) {
                  await saveBlueprint(bp.name, bp);
                }
              }
              msg('已导入 ' + imported.length + ' 个蓝图');
              openBlueprintLibrary();
            }
          } catch {
            msg('导入失败：文件格式不正确');
          }
        };
        r.readAsText(e.target.files[0]);
      };
    }
  }

  // 放置按钮
  document.querySelectorAll('[data-bp-place]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.bpPlace;
      document.querySelector('#modal').style.display = 'none';
      await preparePlaceBlueprint(name);
    };
  });

  // 编辑按钮
  document.querySelectorAll('[data-bp-edit]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.bpEdit;
      const bp = await getBlueprint(name);
      if (bp) {
        openBlueprintEditor(bp);
      }
    };
  });

  // 重命名按钮
  document.querySelectorAll('[data-bp-rename]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const oldName = b.dataset.bpRename;
      const newName = prompt('重命名蓝图：', oldName);
      if (!newName?.trim() || newName.trim() === oldName) return;
      try {
        await renameBlueprint(oldName, newName.trim());
        msg('已重命名为"' + newName.trim() + '"');
        openBlueprintLibrary();
      } catch {
        msg('重命名失败。');
      }
    };
  });

  // 删除按钮
  document.querySelectorAll('[data-bp-delete]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.bpDelete;
      if (!confirm('确认删除蓝图"' + name + '"？此操作不可撤销。')) return;
      try {
        await deleteBlueprint(name);
        msg('已删除蓝图"' + name + '"');
        openBlueprintLibrary();
      } catch {
        msg('删除失败。');
      }
    };
  });

  // 卡片点击 = 放置
  document.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const name = card.dataset.bpName;
      document.querySelector('#modal').style.display = 'none';
      preparePlaceBlueprint(name);
    });
  });
}

/* ---------- 蓝图编辑器 ---------- */
function openBlueprintEditor(bp) {
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">蓝图名称</label>
        <input id="bpEditName" value="${esc(bp.name)}" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <p class="note" style="margin:8px 0">元件数：${bp.components?.length || 0}　导线数：${bp.wires?.length || 0}</p>
        <textarea id="bpEditData" style="width:100%;height:300px;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:12px Consolas,sans-serif;resize:vertical">${esc(JSON.stringify({ components: bp.components, wires: bp.wires }, null, 2))}</textarea>
      </div>
      <div>
        <h3 style="margin:8px 0 4px">蓝图预览</h3>
        <div style="border:1px solid #3e3e42;border-radius:3px;overflow:auto;max-height:350px;background:#1e1e1e">
          <svg id="bpPreviewSvg" viewBox="0 0 800 600" style="width:100%;background-color:#1e1e1e;background-image:linear-gradient(#2a2d2e 1px,transparent 1px),linear-gradient(90deg,#2a2d2e 1px,transparent 1px);background-size:20px 20px"></svg>
        </div>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:7px">
      <button id="bpEditSave" style="border:1px solid #007acc;background:#094771;color:#fff;padding:7px 16px;border-radius:3px;cursor:pointer">保存修改</button>
      <button id="bpEditPlace" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:7px 16px;border-radius:3px;cursor:pointer">放置到画布</button>
    </div>`;
  modal('编辑蓝图：' + bp.name, body, '', '', true);

  // 渲染蓝图预览
  renderBlueprintPreview(bp);

  document.querySelector('#bpEditSave').onclick = async () => {
    try {
      const name = document.querySelector('#bpEditName').value.trim() || bp.name;
      const data = JSON.parse(document.querySelector('#bpEditData').value);
      await saveBlueprint(name, { components: data.components, wires: data.wires });
      // 如果改名了，删除旧的
      if (name !== bp.name) await deleteBlueprint(bp.name);
      msg('蓝图已保存');
      openBlueprintLibrary();
    } catch {
      msg('保存失败：JSON 格式不正确');
    }
  };
  document.querySelector('#bpEditPlace').onclick = () => {
    document.querySelector('#modal').style.display = 'none';
    pendingBlueprint = bp;
    tool = 'select';
    setTool();
    msg('蓝图跟随鼠标移动，左键点击放置，Esc 取消。');
  };
}

function renderBlueprintPreview(bp) {
  const previewSvg = document.querySelector('#bpPreviewSvg');
  if (!previewSvg) return;
  previewSvg.innerHTML = '';
  if (!bp.components || !bp.components.length) return;
  // 计算边界框
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bp.components.forEach((c) => {
    const q = wh(c);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + q.w);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y + q.h);
  });
  const pad = 40;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;
  previewSvg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${vw} ${vh}`);
  // 渲染导线
  (bp.wires || []).forEach((w) => {
    const a = pinPosPreview(bp.components, w.a);
    const b = pinPosPreview(bp.components, w.b);
    const p = el('path', { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, stroke: '#8cc08c', 'stroke-width': 2, fill: 'none' });
    previewSvg.append(p);
  });
  // 渲染元件
  bp.components.forEach((c) => {
    const g = el('g', { transform: `translate(${c.x} ${c.y})` });
    const dims = wh(c);
    drawComponentShapes(c, g, dims.w, dims.h);
    previewSvg.append(g);
  });
}

function pinPosPreview(comps, e) {
  if (e.kind === 'pin') {
    const c = comps.find((x) => x.id === e.cid);
    if (c) return pinPos(c, e.pi);
  }
  const j = comps.find((x) => x.id === e.jid);
  return j ? { x: j.x, y: j.y } : { x: 0, y: 0 };
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  enterBlueprintMode, finishBlueprintCapture, preparePlaceBlueprint,
  handleBlueprintPlace, openBlueprintLibrary, openBlueprintEditor, renderBlueprintPreview,
});
