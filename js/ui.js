/* ============================================================
   PinSketch — ui.js
   属性面板、模态框、芯片库 UI、右键菜单
   ============================================================ */

/* ---------- 模态框 ---------- */
function modal(title, body, copy = '', file = '') {
  document.querySelector('#modalTitle').textContent = title;
  document.querySelector('#modalBody').innerHTML = body;
  document.querySelector('#modal').style.display = 'flex';
  document.querySelector('#copyBtn').style.display = copy ? '' : 'none';
  document.querySelector('#downloadBtn').style.display = file ? '' : 'none';
  if (copy) document.querySelector('#copyBtn').onclick = () => navigator.clipboard.writeText(copy);
  if (file)
    document.querySelector('#downloadBtn').onclick = () => download(file, copy, 'text/plain');
}

/* ---------- 属性面板 ---------- */
function showProps() {
  const c = byId([...selected][0]);

  // 多选
  if (selected.size > 1) {
    prop.innerHTML = `<h3>已选择 ${selected.size} 个元件</h3>
      <p class="note">可拖动、复制、删除，或使用顶部"对齐"按钮。</p>
      <button id="align">左对齐</button> <button id="dist">横向等距</button>`;
    document.querySelector('#align').onclick = alignLeft;
    document.querySelector('#dist').onclick = distribute;
    return;
  }

  // 导线选中
  if (selectedWire !== null) {
    const w = state.wires.find((x) => x.id === selectedWire);
    prop.innerHTML =
      '<h3>导线</h3><p class="note">双击导线可添加拐点；拖动黄色方块可调整拐点位置。</p><button id="del">删除导线</button>';
    document.querySelector('#del').onclick = () => {
      snapshot();
      state.wires = state.wires.filter((x) => x.id !== selectedWire);
      selectedWire = null;
      commit();
    };
    return;
  }

  // 空白
  if (!c) {
    prop.innerHTML =
      '<div class="empty">拖曳画布空白处可框选。Shift+点击可增减选择。<br><br>双击导线新增拐点；滚轮缩放，按住中键或空格拖动可平移画布。</div>';
    return;
  }

  // 连接点
  if (c.type === 'junction') {
    prop.innerHTML =
      '<h3>连接点</h3><p class="note">只有通过该点连接的导线才会形成电气网络。</p><button id="del">删除连接点</button>';
    document.querySelector('#del').onclick = deleteSelected;
    return;
  }

  // 打 × / NC
  if (c.type === 'cross') {
    prop.innerHTML =
      '<h3>× 标注</h3><p class="note">表示 NC、DNP 或不使用；不参与网络。</p><button id="del">删除</button>';
    document.querySelector('#del').onclick = deleteSelected;
    return;
  }

  // 远程连接点
  if (c.type === 'remote') {
    prop.innerHTML = `<h3>远程连接点</h3>
      <label>网络名称</label>
      <input id="remoteName" value="${esc(c.name)}">
      <p class="note">同名远程连接点会自动形成隐藏连接。请用一小段导线将本点连到器件引脚或连接点；隐藏连接不会在画布上绘制。</p>
      <div style="margin-top:12px;display:flex;gap:7px"><button id="applyRemote">应用</button><button id="del">删除</button></div>`;
    document.querySelector('#applyRemote').onclick = () => {
      const n = document.querySelector('#remoteName').value.trim();
      if (!n) {
        msg('远程连接点必须填写网络名称。');
        return;
      }
      snapshot();
      c.name = n;
      commit();
    };
    document.querySelector('#del').onclick = deleteSelected;
    return;
  }

  // 普通元件
  const editable = ['chip', 'connector'].includes(c.type);
  const sizeFields = editable
    ? `<div class="row"><div><label>宽度</label><input id="width" type="number" min="100" step="10" value="${Number(c.width) || 180}"></div><div><label>高度</label><input id="height" type="number" min="80" step="10" value="${Number(c.height) || 140}"></div></div>`
    : '';

  prop.innerHTML = `<h3>元件属性</h3>
    <label>类型</label>
    <input disabled value="${esc(DEFS[c.type] || c.type)}">
    <div class="row"><div><label>位号 / 标签</label><input id="ref" value="${esc(c.ref)}"></div><div><label>名称 / 型号</label><input id="name" value="${esc(c.name)}"></div></div>
    ${sizeFields}
    <label>数值 / 备注</label>
    <input id="value" value="${esc(c.value)}">
    ${editable ? `<label>引脚定义</label><textarea id="pins">${esc(c.pins.map((p) => p.side + ': ' + p.name).join('\n'))}</textarea><p class="note">修改引脚会删除此器件的既有导线。</p>` : ''}
    <div style="margin-top:12px;display:flex;gap:7px"><button id="apply">应用</button>${editable ? '<button id="saveLib">保存到芯片库</button>' : ''}<button id="del">删除</button></div>`;

  document.querySelector('#apply').onclick = () => {
    snapshot();
    c.ref = document.querySelector('#ref').value.trim();
    c.name = document.querySelector('#name').value.trim() || DEFS[c.type];
    c.value = document.querySelector('#value').value.trim();
    if (['chip', 'connector'].includes(c.type)) {
      c.width = Math.max(100, Number(document.querySelector('#width').value) || 180);
      c.height = Math.max(80, Number(document.querySelector('#height').value) || 140);
    }
    if (editable) {
      const next = parsePins(document.querySelector('#pins').value);
      if (JSON.stringify(next) !== JSON.stringify(c.pins)) {
        state.wires = state.wires.filter((w) => w.a.cid !== c.id && w.b.cid !== c.id);
        msg('引脚定义已变更，相关导线已删除。');
      }
      c.pins = next;
    }
    commit();
  };
  document.querySelector('#del').onclick = deleteSelected;
  if (editable)
    document.querySelector('#saveLib').onclick = () => saveChipToLibrary(c);
}

/* ---------- 芯片库 ---------- */
function openLibrary() {
  const body = chipLibrary.length
    ? `<div class="note">单击"放置"将芯片添加到当前画布。</div>${chipLibrary
        .map(
          (x) => `<div class="issue"><b>${esc(x.name)}</b><br><span class="note">${x.pins.length} 个引脚　${esc(x.value || '')}</span><div style="margin-top:6px"><button data-place="${x.id}">放置</button> <button data-remove="${x.id}">删除</button></div></div>`
        )
        .join('')}`
    : '<p class="note">芯片库为空。选中自定义芯片或连接器，在右侧点击"保存到芯片库"。</p>';
  modal('芯片库', body);
  document.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => {
    document.querySelector('#modal').style.display = 'none';
    addFromLibrary(b.dataset.place);
  }));
  document.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => {
    chipLibrary = chipLibrary.filter((x) => x.id !== b.dataset.remove);
    saveMemory();
    deleteChipFromDB(b.dataset.remove).catch(() => {});
    openLibrary();
  }));
}

/* ---------- 右键菜单 ---------- */
const contextMenu = document.querySelector('#contextMenu');

function hideMenu() {
  contextMenu.hidden = true;
}

function showMenu(e, items) {
  e.preventDefault();
  contextMenu.innerHTML = items
    .map((x) => (x === '-' ? '<hr>' : `<button data-action="${x.id}">${x.label}</button>`))
    .join('');
  contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 210) + 'px';
  contextMenu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
  contextMenu.hidden = false;
  contextMenu.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => {
    hideMenu();
    ({
      copy: copySelection,
      paste,
      delete: deleteSelected,
      undo,
      redo,
      align: alignMenu,
      library: openLibrary,
      blueprints: openBlueprintLibrary,
      files: openFileLibrary,
      saveAs,
      wire: () => {
        tool = 'wire';
        setTool();
        msg('导线工具：请选择起点');
      },
      junction: () => {
        tool = 'junction';
        setTool();
      },
      blueprint: enterBlueprintMode,
      erc: () => document.querySelector('#checkBtn').click(),
    })[b.dataset.action]?.();
  }));
}

/* ---------- 文件库（IndexedDB） ---------- */
async function openFileLibrary() {
  let files = [];
  try {
    files = await listFiles();
  } catch {
    msg('无法访问文件库（浏览器不支持 IndexedDB）。');
    return;
  }

  const listHTML = files.length
    ? files
        .map(
          (f) => `
      <div class="project-card" data-file-name="${esc(f.name)}">
        <div class="pc-info">
          <div class="pc-name">📄 ${esc(f.name)}</div>
          <div class="pc-meta">${f.componentCount} 元件 · ${f.wireCount} 导线 · ${new Date(f.updatedAt || f.createdAt).toLocaleString()}</div>
        </div>
        <div class="pc-actions">
          <button data-file-open="${esc(f.name)}">打开</button>
          <button data-file-rename="${esc(f.name)}">重命名</button>
          <button data-file-delete="${esc(f.name)}" class="danger">删除</button>
        </div>
      </div>`
        )
        .join('')
    : '<div class="project-empty">文件库为空。<br>在顶部"另存为"将当前工程保存到文件库。</div>';

  const body = `
    <div class="save-form">
      <input id="fileNameInput" placeholder="文件名称，如：传感器主板 v1.0" value="${esc(currentFileName)}">
      <button id="saveFileBtn">另存为</button>
    </div>
    <div class="project-grid">${listHTML}</div>
  `;

  modal('文件库', body);

  // 另存为按钮
  const saveBtn = document.querySelector('#saveFileBtn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const name = document.querySelector('#fileNameInput').value.trim();
      if (!name) {
        msg('请输入文件名称。');
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        await saveFileAs(name);
        msg('已另存为"' + name + '"');
        openFileLibrary();
      } catch {
        msg('保存失败，请重试。');
        saveBtn.disabled = false;
        saveBtn.textContent = '另存为';
      }
    };
  }

  // 打开按钮
  document.querySelectorAll('[data-file-open]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.fileOpen;
      document.querySelector('#modal').style.display = 'none';
      await loadFileByName(name);
    };
  });

  // 重命名按钮
  document.querySelectorAll('[data-file-rename]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const oldName = b.dataset.fileRename;
      const newName = prompt('重命名文件：', oldName);
      if (!newName?.trim() || newName.trim() === oldName) return;
      try {
        await renameFile(oldName, newName.trim());
        if (currentFileName === oldName) currentFileName = newName.trim();
        msg('已重命名为"' + newName.trim() + '"');
        openFileLibrary();
      } catch {
        msg('重命名失败。');
      }
    };
  });

  // 删除按钮
  document.querySelectorAll('[data-file-delete]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.fileDelete;
      if (!confirm('确认删除文件"' + name + '"？此操作不可撤销。')) return;
      try {
        await deleteFile(name);
        msg('已删除文件"' + name + '"');
        openFileLibrary();
      } catch {
        msg('删除失败。');
      }
    };
  });

  // 卡片点击 = 打开
  document.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const name = card.dataset.fileName;
      document.querySelector('#modal').style.display = 'none';
      loadFileByName(name);
    });
  });
}

/* ---------- 帮助中心 ---------- */
function showHelp() {
  modal(
    'PinSketch 帮助中心',
    `<div class="note" style="font-size:13px;line-height:1.7">
      <h3>1. 推荐工作流程</h3>
      <ol>
        <li><b>放置元件</b>：从左侧选择芯片、连接器或基础器件，在画布中建立需要表达的硬件对象。</li>
        <li><b>填写属性与引脚</b>：选中元件，在右侧填写位号、型号、数值；芯片和连接器可编辑引脚名称与所在方向。</li>
        <li><b>组织网络</b>：按 <b>W</b> 选择导线，连接两个蓝色引脚或青色连接点；跨区域信号使用网络标签命名。</li>
        <li><b>检查连通性</b>：点击"ERC 检查"，处理悬空引脚、重复位号、标签冲突和器件两端短接。</li>
        <li><b>保存文件</b>：点击"另存为"将工程保存到文件库，或下载 <code>.pins.json</code> 归档。导出网表提供给评审、文档或 AI 分析。</li>
      </ol>
      <h3>2. 左侧工具说明</h3>
      <ul>
        <li><b>选择 / 移动（V）</b>：单击选择元件；<code>Shift + 单击</code> 增减多选；拖动元件移动；拖动画布空白区域可框选。</li>
        <li><b>正交导线（W）</b>：先点起点、再点终点。终点必须是蓝色引脚或青色连接点。线条交叉默认不连通。</li>
        <li><b>网络标签（L）</b>：在画布空白处放置标签，右侧修改名称，如 <code>SDA</code>、<code>3V3</code>。同名标签自动代表同一网络。</li>
        <li><b>连接点（J）</b>：在需要三路及以上汇接的位置放置。多条导线都接到同一个连接点，才形成电气并接。</li>
        <li><b>打 × / NC</b>：标注未使用、NC 或 DNP；它只用于说明，不参与网络连通。</li>
      </ul>
      <h3>3. 蓝图库</h3>
      <ul>
        <li><b>框选蓝图（B）</b>：点击顶部"框选蓝图"按钮或在蓝图库中点击"框选蓝图"，鼠标变为十字光标。拖动鼠标框选区域，松开后输入名称保存为蓝图。</li>
        <li><b>放置蓝图</b>：在蓝图库中点击卡片或"放置"按钮，然后在画布上点击放置位置。蓝图中的元件和内部导线会被整体复制，ID 自动重新分配。</li>
        <li><b>管理蓝图</b>：在蓝图库中可重命名和删除蓝图。蓝图保存在浏览器 IndexedDB 中，按更新时间排序。</li>
      </ul>
      <h3>4. 文件库与保存</h3>
      <ul>
        <li><b>另存为</b>：将当前工程以指定名称保存到文件库（IndexedDB），可随时重新打开。顶部"另存为"按钮或右键菜单可访问。</li>
        <li><b>文件库</b>：在文件库中管理所有已保存文件，支持打开、重命名和删除。</li>
        <li><b>保存（Ctrl+S）</b>：下载 <code>.pins.json</code> 文件到本地磁盘，作为归档备份。</li>
        <li><b>打开</b>：从本地磁盘打开 <code>.pins.json</code> 文件，或从文件库打开已保存文件。</li>
      </ul>
      <h3>5. 编辑、视图与导线</h3>
      <ul>
        <li><b>复制粘贴</b>：<code>Ctrl/Cmd + C</code>、<code>Ctrl/Cmd + V</code>。仅复制元件，不复制导线，防止意外跨网络连接。</li>
        <li><b>对齐</b>：多选至少两个元件后，点击顶部"对齐"左对齐；右侧面板还可横向等距。</li>
        <li><b>缩放和平移</b>：<code>Ctrl + 滚轮</code> 缩放；中键拖动或 <code>Shift + 左键拖动</code> 平移；顶部按钮可调整或重置为 100%。</li>
        <li><b>导线拐点</b>：双击既有导线增加拐点；选中该线后拖动黄色方块调整路径。删除导线可重新布线。</li>
        <li><b>撤销与保存</b>：<code>Ctrl/Cmd + Z</code> 撤销，<code>Ctrl/Cmd + Y</code> 重做，<code>Ctrl/Cmd + S</code> 下载工程。浏览器同时会自动保存恢复副本。</li>
      </ul>
      <h3>6. 术语解释</h3>
      <ul>
        <li><b>元件（Component）</b>：芯片、电阻、电容、连接器等硬件对象。</li>
        <li><b>位号（Reference）</b>：元件唯一编号，如 <code>U1</code>、<code>R3</code>、<code>J1</code>。</li>
        <li><b>引脚（Pin）</b>：元件的电气连接端，例如 MCU 的 <code>SDA</code> 或电阻的 1、2 脚。</li>
        <li><b>网络（Net）</b>：电气上互相连通的一组引脚，例如 <code>GND</code>、<code>SPI_MOSI</code>。</li>
        <li><b>蓝图（Blueprint）</b>：框选区域内的元件和导线的快照，可整体保存并重复放置到画布。</li>
        <li><b>文件（File）</b>：整个工程的完整保存，包括所有元件、导线和元数据。</li>
      </ul>
      <h3>7. 界面模块作用</h3>
      <ul>
        <li><b>顶部工具栏</b>：新建、撤销/重做、保存/另存为/文件库、蓝图库、网表导出、ERC、批量对齐和视图缩放。</li>
        <li><b>左侧面板</b>：选择编辑工具并放置元件。</li>
        <li><b>中央画布</b>：绘制和组织引脚—网络关系图。</li>
        <li><b>右侧属性面板</b>：编辑选中对象的位号、型号、数值、引脚；进行多选对齐操作。</li>
        <li><b>底部状态栏</b>：显示当前操作提示、当前文件名及自动保存状态。</li>
      </ul>
      <p><b>注意：</b>PinSketch 用于记录和检查引脚—网络关系，不替代完整 PCB EDA。文件库和蓝图库使用 IndexedDB 存储，清除浏览器数据会一并删除。</p>
    </div>`
  );
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  modal, showProps, openLibrary, openFileLibrary, contextMenu, hideMenu, showMenu, showHelp,
});
