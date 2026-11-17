/* ============================================================
   PinSketch — ui.js
   属性面板、模态框、芯片库 UI、右键菜单
   ============================================================ */

/* ---------- 模态框 ---------- */
function modal(title, body, copy = '', file = '', large = false) {
  document.querySelector('#modalTitle').textContent = title;
  document.querySelector('#modalBody').innerHTML = body;
  const dialog = document.querySelector('.dialog');
  dialog.classList.toggle('dialog-large', large);
  document.querySelector('#modal').style.display = 'flex';
  document.querySelector('#copyBtn').style.display = copy ? '' : 'none';
  document.querySelector('#downloadBtn').style.display = file ? '' : 'none';
  if (copy) document.querySelector('#copyBtn').onclick = () => navigator.clipboard.writeText(copy);
  if (file)
    document.querySelector('#downloadBtn').onclick = () => download(file, copy, 'text/plain');
}

/* ---------- 属性面板 ---------- */
const propContent = document.querySelector('#propContent');

function showProps() {
  const c = byId([...selected][0]);

  // 多选
  if (selected.size > 1) {
    propContent.innerHTML = `<h3>已选择 ${selected.size} 个元件</h3>
      <p class="note">可拖动、复制、删除。按 Ctrl+C 复制，Ctrl+V 粘贴。按 R 旋转。</p>
      <div style="margin-top:8px;display:flex;gap:7px"><button id="rotate">旋转 R</button><button id="del">删除选中</button></div>`;
    document.querySelector('#del').onclick = deleteSelected;
    document.querySelector('#rotate').onclick = rotateSelected;
    return;
  }

  // 导线选中
  if (selectedWire !== null) {
    const w = state.wires.find((x) => x.id === selectedWire);
    propContent.innerHTML =
      '<h3>导线</h3><p class="note">双击导线可添加拐点；拖动黄色方块可调整拐点位置。按段拖动导线可移动该段。</p><button id="del">删除导线</button>';
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
    propContent.innerHTML =
      '<div class="empty">拖曳画布空白处可框选。Shift+点击可增减选择。<br><br>滚轮以鼠标位置缩放；中键拖动平移画布。<br><br>选中导线后可按段拖动；双击导线新增拐点。</div>';
    return;
  }

  // 连接点
  if (c.type === 'junction') {
    propContent.innerHTML =
      '<h3>连接点</h3><p class="note">连接点不能独立移动，只能随导线拖动而移动。只有通过该点连接的导线才会形成电气网络。</p><button id="del">删除连接点</button>';
    document.querySelector('#del').onclick = deleteSelected;
    return;
  }

  // 打 × / NC
  if (c.type === 'cross') {
    propContent.innerHTML =
      '<h3>× 标注</h3><p class="note">表示 NC、DNP 或不使用；不参与网络。</p><button id="del">删除</button>';
    document.querySelector('#del').onclick = deleteSelected;
    return;
  }

  // 远程连接点
  if (c.type === 'remote') {
    const mates = remoteMates(c);
    const mateText = mates.length
      ? '已与 ' + mates.length + ' 个同名远程点隐藏连通：' + mates.map((x) => x.name).join(', ')
      : '当前还没有其他同名远程点。在另一处再放一个相同名称的远程点即可隐藏连接。';
    propContent.innerHTML = `<h3>远程连接点</h3>
      <label>网络名称</label>
      <input id="remoteName" value="${esc(c.name)}">
      <p class="note">${esc(mateText)}<br><br>用法：用一小段导线把紫色端点接到芯片/按键引脚，再在另一张图同样命名。画布上不画跨区域长线，但 ERC 与网表会把两端视为同一网络。</p>
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
  const editable = c.type === 'chip';
  const sizeFields = editable
    ? `<div class="row"><div><label>宽度</label><input id="width" type="number" min="100" step="10" value="${Number(c.width) || 180}"></div><div><label>高度</label><input id="height" type="number" min="80" step="10" value="${Number(c.height) || 140}"></div></div>`
    : '';

  propContent.innerHTML = `<h3>元件属性</h3>
    <label>类型</label>
    <input disabled value="${esc(DEFS[c.type] || c.type)}">
    <div class="row"><div><label>位号 / 标签</label><input id="ref" value="${esc(c.ref)}"></div><div><label>名称 / 型号</label><input id="name" value="${esc(c.name)}"></div></div>
    ${sizeFields}
    <label>数值 / 备注</label>
    <input id="value" value="${esc(c.value)}">
    ${editable ? `<label>引脚定义</label><textarea id="pins">${esc(c.pins.map((p) => p.side + ': ' + p.name).join('\n'))}</textarea><p class="note">修改引脚会删除此器件的既有导线。</p>` : ''}
    <div style="margin-top:12px;display:flex;gap:7px"><button id="apply">应用</button><button id="rotate">旋转 R</button>${c.type === 'chip' ? '<button id="saveLib">保存到芯片库</button>' : '<button id="savePart">保存到元件库</button>'}<button id="del">删除</button></div>`;

  document.querySelector('#apply').onclick = () => {
    snapshot();
    c.ref = document.querySelector('#ref').value.trim();
    c.name = document.querySelector('#name').value.trim() || DEFS[c.type];
    c.value = document.querySelector('#value').value.trim();
    if (c.type === 'chip') {
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
  document.querySelector('#rotate').onclick = rotateSelected;
  if (c.type === 'chip')
    document.querySelector('#saveLib').onclick = () => saveChipToLibrary(c);
  else {
    const sp = document.querySelector('#savePart');
    if (sp) sp.onclick = () => savePartToLibrary(c);
  }
}

/* ---------- 芯片库 ---------- */
function openLibrary() {
  const body = `<div class="note">单击"放置"将芯片添加到当前画布。</div>
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button id="addChipBtn" style="border:1px solid #007acc;background:#094771;color:#fff;padding:6px 12px;border-radius:3px;cursor:pointer">添加芯片</button>
      <button id="exportChipsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:6px 12px;border-radius:3px;cursor:pointer">导出芯片库</button>
      <button id="importChipsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:6px 12px;border-radius:3px;cursor:pointer">导入芯片库</button>
    </div>
    ${chipLibrary.length
      ? chipLibrary
          .map(
            (x) => `<div class="issue"><b>${esc(x.name)}</b><br><span class="note">${x.pins.length} 个引脚　${esc(x.value || '')}</span><div style="margin-top:6px"><button data-place="${x.id}">放置</button> <button data-edit="${x.id}">编辑</button> <button data-remove="${x.id}">删除</button></div></div>`
          )
          .join('')
      : '<p class="note">芯片库为空。</p>'}
    <input id="chipImportFile" type="file" accept=".json" hidden>`;
  modal('芯片库', body);
  document.querySelector('#addChipBtn').onclick = () => openChipDesigner();
  // 导出
  document.querySelector('#exportChipsBtn').onclick = () => {
    const data = JSON.stringify(chipLibrary, null, 2);
    download('pinsketch-chips.json', data, 'application/json');
    msg('已导出芯片库');
  };
  // 导入
  document.querySelector('#importChipsBtn').onclick = () => document.querySelector('#chipImportFile').click();
  document.querySelector('#chipImportFile').onchange = (e) => {
    if (!e.target.files[0]) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const imported = JSON.parse(r.result);
        if (Array.isArray(imported)) {
          for (const chip of imported) {
            if (chip.name && chip.pins) {
              chip.id = 'chip-' + Date.now() + Math.random();
              chipLibrary.push(chip);
              saveChipToDB(chip).catch(() => {});
            }
          }
          saveMemory();
          msg('已导入 ' + imported.length + ' 个芯片');
          openLibrary();
        }
      } catch {
        msg('导入失败：文件格式不正确');
      }
    };
    r.readAsText(e.target.files[0]);
  };
  document.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => {
    document.querySelector('#modal').style.display = 'none';
    addFromLibrary(b.dataset.place);
  }));
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const chip = chipLibrary.find((x) => x.id === b.dataset.edit);
    if (chip) openChipEditor(chip);
  }));
  document.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => {
    chipLibrary = chipLibrary.filter((x) => x.id !== b.dataset.remove);
    saveMemory();
    deleteChipFromDB(b.dataset.remove).catch(() => {});
    openLibrary();
  }));
}

/* ---------- 元件库 ---------- */
function openPartsLibrary() {
  const builtin = Object.entries(DEFS)
    .filter(([type]) => !['chip', 'label', 'remote', 'junction', 'cross'].includes(type))
    .map(([type, name]) => ({ id: 'builtin-' + type, type, name, builtin: true }));

  const body = `<div class="note">选择元件放置到画布。</div>
    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <button id="addPartBtn" style="border:1px solid #007acc;background:#094771;color:#fff;padding:6px 12px;border-radius:3px;cursor:pointer">添加元件</button>
      <button id="exportPartsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:6px 12px;border-radius:3px;cursor:pointer">导出元件库</button>
      <button id="importPartsBtn" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:6px 12px;border-radius:3px;cursor:pointer">导入元件库</button>
    </div>
    <h3 style="margin:8px 0 4px">内置元件</h3>
    ${builtin.map((p) => `<div class="issue"><b>${esc(p.name)}</b><div style="margin-top:6px"><button data-builtin="${p.type}">放置</button></div></div>`).join('')}
    ${partsLibrary.length ? '<h3 style="margin:8px 0 4px">自定义元件</h3>' + partsLibrary.map((p) => `<div class="issue"><b>${esc(p.name)}</b> <span class="note">(${esc(DEFS[p.type] || p.type)})</span><div style="margin-top:6px"><button data-part-place="${p.id}">放置</button> <button data-part-edit="${p.id}">编辑</button> <button data-part-remove="${p.id}">删除</button></div></div>`).join('') : ''}
    <input id="partImportFile" type="file" accept=".json" hidden>`;
  modal('元件库', body);
  document.querySelector('#addPartBtn').onclick = () => openPartDesigner();
  // 导出
  document.querySelector('#exportPartsBtn').onclick = () => {
    const data = JSON.stringify(partsLibrary, null, 2);
    download('pinsketch-parts.json', data, 'application/json');
    msg('已导出元件库');
  };
  // 导入
  document.querySelector('#importPartsBtn').onclick = () => document.querySelector('#partImportFile').click();
  document.querySelector('#partImportFile').onchange = (e) => {
    if (!e.target.files[0]) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const imported = JSON.parse(r.result);
        if (Array.isArray(imported)) {
          for (const part of imported) {
            if (part.type && part.pins) {
              part.id = 'part-' + Date.now() + Math.random();
              partsLibrary.push(part);
              savePartToDB(part).catch(() => {});
            }
          }
          saveMemory();
          msg('已导入 ' + imported.length + ' 个元件');
          openPartsLibrary();
        }
      } catch {
        msg('导入失败：文件格式不正确');
      }
    };
    r.readAsText(e.target.files[0]);
  };
  document.querySelectorAll('[data-builtin]').forEach((b) => (b.onclick = () => {
    document.querySelector('#modal').style.display = 'none';
    add(b.dataset.builtin);
  }));
  document.querySelectorAll('[data-part-place]').forEach((b) => (b.onclick = () => {
    document.querySelector('#modal').style.display = 'none';
    addPartFromLibrary(b.dataset.partPlace);
  }));
  document.querySelectorAll('[data-part-edit]').forEach((b) => (b.onclick = () => {
    const part = partsLibrary.find((x) => x.id === b.dataset.partEdit);
    if (part) openPartEditor(part);
  }));
  document.querySelectorAll('[data-part-remove]').forEach((b) => (b.onclick = () => {
    partsLibrary = partsLibrary.filter((x) => x.id !== b.dataset.partRemove);
    saveMemory();
    deletePartFromDB(b.dataset.partRemove).catch(() => {});
    openPartsLibrary();
  }));
}

/* ---------- 元件编辑器（编辑已有自定义元件） ---------- */
function openPartEditor(part) {
  openPartDesigner();
  // 填充已有数据
  document.querySelector('#pdType').value = part.type || 'resistor';
  document.querySelector('#pdName').value = part.name || '';
  document.querySelector('#pdValue').value = part.value || '';
  document.querySelector('#pdPins').value = (part.pins || []).map((p) => p.side + ': ' + p.name).join('\n');
  // 修改保存逻辑为更新
  document.querySelector('#pdSave').onclick = () => {
    part.type = document.querySelector('#pdType').value;
    part.name = document.querySelector('#pdName').value.trim() || 'Custom';
    part.value = document.querySelector('#pdValue').value.trim();
    part.pins = document.querySelector('#pdPins').value.trim() ? parsePins(document.querySelector('#pdPins').value) : pins(part.type);
    part.updatedAt = new Date().toISOString();
    savePartToDB(part).catch(() => {});
    saveMemory();
    msg('元件"' + part.name + '"已更新');
    openPartsLibrary();
  };
  document.querySelector('#pdPlace').onclick = () => {
    document.querySelector('#pdSave').click();
    document.querySelector('#modal').style.display = 'none';
    addPartFromLibrary(part.id);
  };
}

/* ---------- 芯片编辑器（编辑已有芯片） ---------- */
function openChipEditor(chip) {
  openChipDesigner();
  // 填充已有数据
  document.querySelector('#cdName').value = chip.name || '';
  document.querySelector('#cdValue').value = chip.value || '';
  document.querySelector('#cdWidth').value = chip.width || 180;
  document.querySelector('#cdHeight').value = chip.height || 140;
  document.querySelector('#cdPins').value = (chip.pins || []).map((p) => p.side + ': ' + p.name).join('\n');
  // 修改保存逻辑为更新而非新建
  document.querySelector('#cdSave').onclick = () => {
    const name = document.querySelector('#cdName').value.trim() || 'Custom IC';
    chip.name = name;
    chip.value = document.querySelector('#cdValue').value.trim();
    chip.width = Math.max(100, Number(document.querySelector('#cdWidth').value) || 180);
    chip.height = Math.max(80, Number(document.querySelector('#cdHeight').value) || 140);
    chip.pins = parsePins(document.querySelector('#cdPins').value);
    chip.updatedAt = new Date().toISOString();
    saveChipToDB(chip).catch(() => {});
    saveMemory();
    msg('芯片"' + name + '"已更新');
    openLibrary();
  };
  document.querySelector('#cdPlace').onclick = () => {
    document.querySelector('#cdSave').click();
    document.querySelector('#modal').style.display = 'none';
    addFromLibrary(chip.id);
  };
}

/* ---------- 自定义芯片设计器 ---------- */
function openChipDesigner() {
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">芯片名称</label>
        <input id="cdName" value="Custom IC" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">位号前缀（如 U）</label>
        <input id="cdRef" value="U" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">宽度</label>
        <input id="cdWidth" type="number" value="180" min="100" step="10" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">高度</label>
        <input id="cdHeight" type="number" value="140" min="80" step="10" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">数值/备注</label>
        <input id="cdValue" value="" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
      </div>
      <div>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">引脚定义（每行一个，格式：方向:名称）</label>
        <textarea id="cdPins" style="width:100%;height:200px;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:12px Consolas,sans-serif;resize:vertical">left: VCC
left: GND
left: SDA
left: SCL
right: INT
right: TX
right: RX
right: EN</textarea>
        <p class="note" style="margin:6px 0">方向可选：left, right, top, bottom</p>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:7px">
      <button id="cdSave" style="border:1px solid #007acc;background:#094771;color:#fff;padding:7px 16px;border-radius:3px;cursor:pointer">保存到芯片库</button>
      <button id="cdPlace" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:7px 16px;border-radius:3px;cursor:pointer">保存并放置</button>
    </div>`;
  modal('自定义芯片设计器', body);
  document.querySelector('#cdSave').onclick = () => {
    const name = document.querySelector('#cdName').value.trim() || 'Custom IC';
    const item = {
      id: 'chip-' + Date.now(),
      name,
      value: document.querySelector('#cdValue').value.trim(),
      width: Math.max(100, Number(document.querySelector('#cdWidth').value) || 180),
      height: Math.max(80, Number(document.querySelector('#cdHeight').value) || 140),
      pins: parsePins(document.querySelector('#cdPins').value),
      createdAt: new Date().toISOString(),
    };
    chipLibrary.push(item);
    saveMemory();
    saveChipToDB(item).catch(() => {});
    msg('已保存"' + name + '"到芯片库');
    openLibrary();
  };
  document.querySelector('#cdPlace').onclick = () => {
    document.querySelector('#cdSave').click();
    const item = chipLibrary[chipLibrary.length - 1];
    if (item) {
      document.querySelector('#modal').style.display = 'none';
      addFromLibrary(item.id);
    }
  };
}

/* ---------- 自定义元件设计器 ---------- */
function openPartDesigner() {
  const partTypes = Object.entries(DEFS)
    .filter(([type]) => !['chip', 'label', 'remote', 'junction', 'cross'].includes(type))
    .map(([type, name]) => `<option value="${type}">${esc(name)}</option>`);
  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">元件类型</label>
        <select id="pdType" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">${partTypes.join('')}</select>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">元件名称</label>
        <input id="pdName" value="Custom" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">数值/备注</label>
        <input id="pdValue" value="" style="width:100%;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:13px Consolas,sans-serif">
      </div>
      <div>
        <label style="display:block;color:#b5b5b5;font-size:12px;margin:8px 0 3px">引脚定义（可选，格式：方向:名称）</label>
        <textarea id="pdPins" style="width:100%;height:120px;background:#1e1e1e;border:1px solid #3e3e42;border-radius:3px;color:#d4d4d4;padding:6px;font:12px Consolas,sans-serif;resize:vertical" placeholder="left: 1
right: 2"></textarea>
        <p class="note" style="margin:6px 0">留空使用该类型默认引脚</p>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;gap:7px">
      <button id="pdSave" style="border:1px solid #007acc;background:#094771;color:#fff;padding:7px 16px;border-radius:3px;cursor:pointer">保存到元件库</button>
      <button id="pdPlace" style="border:1px solid #3e3e42;background:#2d2d30;color:#d4d4d4;padding:7px 16px;border-radius:3px;cursor:pointer">保存并放置</button>
    </div>`;
  modal('自定义元件设计器', body);
  document.querySelector('#pdSave').onclick = () => {
    const type = document.querySelector('#pdType').value;
    const name = document.querySelector('#pdName').value.trim() || 'Custom';
    const pinsText = document.querySelector('#pdPins').value.trim();
    const item = {
      id: 'part-' + Date.now(),
      type,
      name,
      value: document.querySelector('#pdValue').value.trim(),
      pins: pinsText ? parsePins(pinsText) : pins(type),
      createdAt: new Date().toISOString(),
    };
    partsLibrary.push(item);
    saveMemory();
    savePartToDB(item).catch(() => {});
    msg('已保存"' + name + '"到元件库');
    openPartsLibrary();
  };
  document.querySelector('#pdPlace').onclick = () => {
    document.querySelector('#pdSave').click();
    const item = partsLibrary[partsLibrary.length - 1];
    if (item) {
      document.querySelector('#modal').style.display = 'none';
      addPartFromLibrary(item.id);
    }
  };
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
      library: openLibrary,
      partsLib: openPartsLibrary,
      blueprints: openBlueprintLibrary,
      files: openFileLibrary,
      saveAs,
      wire: () => {
        tool = 'wire';
        setTool();
        msg('导线工具：请选择起点');
      },
      remote: () => {
        tool = 'remote';
        setTool();
        msg('远程连接点：点击画布放置，再填写网络名称');
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
        <li><b>组织网络</b>：按 <b>W</b> 选择导线，连接两个蓝色引脚、青色连接点或紫色远程点。跨区域信号可用网络标签，或用远程连接点（<b>R</b>）同名隐藏连通。</li>
        <li><b>检查连通性</b>：点击"ERC 检查"，处理悬空引脚、重复位号、标签冲突和器件两端短接。</li>
        <li><b>保存文件</b>：点击"另存为"将工程保存到文件库，或下载 <code>.pins.json</code> 归档。导出网表提供给评审、文档或 AI 分析。</li>
      </ol>
      <h3>2. 左侧工具说明</h3>
      <ul>
        <li><b>选择 / 移动</b>：默认模式。单击选择元件；<code>Shift + 单击</code> 增减多选；拖动元件移动；拖动画布空白区域可框选。点击位号或名称可拖动文本。</li>
        <li><b>正交导线（W）</b>：先点起点、再点终点。终点必须是蓝色引脚、青色连接点或紫色远程点。线条交叉默认不连通。选中导线后可直接拖动整条导线位移。</li>
        <li><b>网络标签（L）</b>：在画布空白处放置标签，右侧修改名称，如 <code>SDA</code>、<code>3V3</code>。同名标签自动代表同一网络。</li>
        <li><b>远程连接点（M）</b>：放置后填写网络名，如 <code>KEY_L</code>。把短线接到器件引脚；另一处同样命名即可隐藏连通，画布上不画长线。</li>
        <li><b>导线交汇</b>：导线交叉时默认不连通。连接点随导线拖动而移动，不能独立拖动。导线放置后为淡绿色，悬置时高亮。</li>
        <li><b>打 × / NC</b>：标注未使用、NC 或 DNP；它只用于说明，不参与网络连通。</li>
        <li><b>旋转（R）</b>：选中元件后按 <code>R</code> 键顺时针旋转 90°。可多次旋转。引脚位置和标签方向自动跟随旋转。</li>
      </ul>
      <h3>3. 电气连接规则</h3>
      <ul>
        <li>导线只能连接蓝色引脚、青色连接点或紫色远程点。点击空白处不会形成电气连接；请使用"连接点"显式连接导线。</li>
        <li>同名网络标签、同名远程连接点自动合并为隐藏网络。选中引脚、标签、远程点或导线可高亮整网。</li>
        <li>导线采用正交走线；使用连接点可将多条导线并接。跨区域信号用远程连接点命名，不必画长线。</li>
        <li>仅视觉上交叉的导线<b>不会</b>自动连通，必须通过连接点（J）显式汇接。</li>
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
        <li><b>复制粘贴</b>：<code>Ctrl/Cmd + C</code>、<code>Ctrl/Cmd + V</code>。复制元件和内部导线（两端都在选中集合内的导线）。粘贴时跟随鼠标位置放置。</li>
        <li><b>多选操作</b>：框选多个元件后可批量拖动、复制、删除。右侧属性面板提供删除选中按钮。</li>
        <li><b>缩放和平移</b>：滚轮以鼠标位置为中心缩放；中键拖动或 <code>Shift + 左键拖动</code> 平移画布。右侧面板也有缩放控件和鼠标坐标显示。</li>
        <li><b>导线操作</b>：单击导线选中后可直接拖动整条导线位移；双击导线增加拐点；选中后拖动黄色方块调整单个拐点位置。删除导线可重新布线。</li>
        <li><b>撤销与保存</b>：<code>Ctrl/Cmd + Z</code> 撤销，<code>Ctrl/Cmd + Y</code> 重做，<code>Ctrl/Cmd + S</code> 下载工程。浏览器同时会自动保存恢复副本。</li>
      </ul>
      <h3>6. 术语解释</h3>
      <ul>
        <li><b>元件（Component）</b>：芯片、电阻、电容、连接器等硬件对象。</li>
        <li><b>位号（Reference）</b>：元件唯一编号，如 <code>U1</code>、<code>R3</code>、<code>J1</code>。</li>
        <li><b>引脚（Pin）</b>：元件的电气连接端，例如 MCU 的 <code>SDA</code> 或电阻的 1、2 脚。</li>
        <li><b>网络（Net）</b>：电气上互相连通的一组引脚，例如 <code>GND</code>、<code>SPI_MOSI</code>。</li>
        <li><b>远程连接点（Remote）</b>：可命名的隐藏网络端点。同名远程点视为同一网络，适合 KEY_L、USB_P 这类跨区域信号。</li>
        <li><b>蓝图（Blueprint）</b>：框选区域内的元件和导线的快照，可整体保存并重复放置到画布。</li>
        <li><b>文件（File）</b>：整个工程的完整保存，包括所有元件、导线和元数据。</li>
      </ul>
      <h3>7. 界面模块作用</h3>
      <ul>
        <li><b>顶部工具栏</b>：新建、撤销/重做、保存/另存为/文件库、蓝图库、网表导出、ERC 和视图缩放。</li>
        <li><b>左侧面板</b>：选择编辑工具并放置元件。</li>
        <li><b>中央画布</b>：绘制和组织引脚—网络关系图。</li>
        <li><b>右侧属性面板</b>：编辑选中对象的位号、型号、数值、引脚；多选时提供删除按钮。</li>
        <li><b>底部状态栏</b>：显示当前操作提示、当前文件名及自动保存状态。</li>
      </ul>
      <p><b>注意：</b>PinSketch 用于记录和检查引脚—网络关系，不替代完整 PCB EDA。文件库和蓝图库使用 IndexedDB 存储，清除浏览器数据会一并删除。</p>
    </div>`
  );
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  modal, showProps, openLibrary, openPartsLibrary, openChipDesigner, openPartDesigner,
  openChipEditor, openPartEditor,
  openFileLibrary, contextMenu, hideMenu, showMenu, showHelp,
});
