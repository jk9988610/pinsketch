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
          <button data-bp-rename="${esc(bp.name)}">重命名</button>
          <button data-bp-delete="${esc(bp.name)}" class="danger">删除</button>
        </div>
      </div>`
        )
        .join('')
    : '<div class="project-empty">蓝图库为空。<br>点击顶部"框选蓝图"按钮，在画布上框选区域以创建蓝图。</div>';

  const body = `
    <div style="margin-bottom:10px"><button id="captureBlueprintBtn" style="border:1px solid #007acc;background:#094771;color:#fff;padding:7px 16px;border-radius:3px;cursor:pointer">📐 框选蓝图</button></div>
    <div class="project-grid">${listHTML}</div>
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

  // 放置按钮
  document.querySelectorAll('[data-bp-place]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.bpPlace;
      document.querySelector('#modal').style.display = 'none';
      await preparePlaceBlueprint(name);
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

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  enterBlueprintMode, finishBlueprintCapture, preparePlaceBlueprint,
  handleBlueprintPlace, openBlueprintLibrary,
});
