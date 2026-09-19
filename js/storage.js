/* ============================================================
   PinSketch — storage.js
   统一持久化存储：
   - IndexedDB 三仓库：files（正在编辑的文件）、blueprints（蓝图库）、chips（芯片库）
   - localStorage 兜底：自动恢复、UI 记忆、芯片库缓存
   ============================================================ */

const DB_NAME = 'pinsketch-db';
const DB_VERSION = 2;
let dbReady = null;

/* ============================================================
   IndexedDB 初始化
   ============================================================ */
function initDB() {
  if (dbReady) return dbReady;
  dbReady = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('blueprints')) db.createObjectStore('blueprints', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('chips')) db.createObjectStore('chips', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbReady;
}

/** 通用 IndexedDB 操作 */
function dbAction(storeName, mode, action) {
  return initDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let req;
        if (action.type === 'getAll') req = store.getAll();
        else if (action.type === 'get') req = store.get(action.key);
        else if (action.type === 'put') req = store.put(action.value);
        else if (action.type === 'delete') req = store.delete(action.key);
        req.onsuccess = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

/* ============================================================
   localStorage：自动恢复 + UI 记忆 + 芯片库缓存
   ============================================================ */

/** 从 localStorage 读取自动保存的工程 */
function loadAuto() {
  try {
    return migrate(JSON.parse(localStorage.getItem('pinsketch-autosave')));
  } catch {
    return blank();
  }
}

/** 从 localStorage 读取芯片库和 UI 记忆 */
function loadMemory() {
  try {
    chipLibrary = JSON.parse(localStorage.getItem('pinsketch-chip-library') || '[]');
    blueprintLibrary = JSON.parse(localStorage.getItem('pinsketch-blueprint-library') || '[]');
    uiMemory = JSON.parse(localStorage.getItem('pinsketch-ui-memory') || '{}');
    currentFileName = localStorage.getItem('pinsketch-current-file') || '';
  } catch {
    chipLibrary = [];
    blueprintLibrary = [];
    uiMemory = {};
    currentFileName = '';
  }
}

/** 保存芯片库、蓝图库缓存和 UI 记忆到 localStorage */
function saveMemory() {
  localStorage.setItem('pinsketch-chip-library', JSON.stringify(chipLibrary));
  localStorage.setItem('pinsketch-blueprint-library', JSON.stringify(blueprintLibrary));
  localStorage.setItem('pinsketch-current-file', currentFileName);
  localStorage.setItem(
    'pinsketch-ui-memory',
    JSON.stringify({ ...uiMemory, zoom, scrollLeft: work.scrollLeft, scrollTop: work.scrollTop, tool })
  );
}

/* ============================================================
   文件操作（IndexedDB files 仓库）
   ============================================================ */

/** 列出所有已保存文件 */
async function listFiles() {
  const all = await dbAction('files', 'readonly', { type: 'getAll' });
  return (all || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** 保存当前工程为文件 */
async function saveFile(name) {
  const file = {
    name,
    data: JSON.parse(JSON.stringify(state)),
    componentCount: state.components.length,
    wireCount: state.wires.length,
    updatedAt: new Date().toISOString(),
    createdAt: Date.now(),
  };
  // 保留原 createdAt
  try {
    const existing = await dbAction('files', 'readonly', { type: 'get', key: name });
    if (existing) file.createdAt = existing.createdAt;
  } catch {}
  await dbAction('files', 'readwrite', { type: 'put', value: file });
  return file;
}

/** 另存为 */
async function saveFileAs(name) {
  const file = await saveFile(name);
  currentFileName = name;
  saved = JSON.stringify(state);
  mark(false);
  saveMemory();
  updateStatusbar();
  return file;
}

/** 打开文件 */
async function loadFileByName(name) {
  const file = await dbAction('files', 'readonly', { type: 'get', key: name });
  if (!file) {
    msg('未找到文件"' + name + '"');
    return;
  }
  snapshot();
  state = migrate(JSON.parse(JSON.stringify(file.data)));
  saved = JSON.stringify(state);
  localStorage.setItem('pinsketch-autosave', saved);
  selected.clear();
  selectedWire = null;
  currentFileName = name;
  commit();
  mark(false);
  saveMemory();
  msg('已打开文件"' + name + '"');
}

/** 删除文件 */
async function deleteFile(name) {
  await dbAction('files', 'readwrite', { type: 'delete', key: name });
  if (currentFileName === name) {
    currentFileName = '';
    saveMemory();
  }
}

/** 重命名文件 */
async function renameFile(oldName, newName) {
  const f = await dbAction('files', 'readonly', { type: 'get', key: oldName });
  if (!f) return;
  f.name = newName;
  f.updatedAt = new Date().toISOString();
  await dbAction('files', 'readwrite', { type: 'put', value: f });
  await dbAction('files', 'readwrite', { type: 'delete', key: oldName });
  if (currentFileName === oldName) {
    currentFileName = newName;
    saveMemory();
  }
}

/* ============================================================
   蓝图库操作（IndexedDB blueprints 仓库）
   ============================================================ */

/** 列出所有蓝图 */
async function listBlueprints() {
  const all = await dbAction('blueprints', 'readonly', { type: 'getAll' });
  blueprintLibrary = all || [];
  return blueprintLibrary;
}

/** 保存蓝图到蓝图库 */
async function saveBlueprint(name, bp) {
  const item = {
    name,
    components: bp.components,
    wires: bp.wires,
    componentCount: bp.components.length,
    updatedAt: new Date().toISOString(),
    createdAt: Date.now(),
  };
  try {
    const existing = await dbAction('blueprints', 'readonly', { type: 'get', key: name });
    if (existing) item.createdAt = existing.createdAt;
  } catch {}
  await dbAction('blueprints', 'readwrite', { type: 'put', value: item });
  // 更新缓存
  const idx = blueprintLibrary.findIndex((b) => b.name === name);
  if (idx >= 0) blueprintLibrary[idx] = item;
  else blueprintLibrary.push(item);
  saveMemory();
  return item;
}

/** 读取单个蓝图 */
async function getBlueprint(name) {
  return dbAction('blueprints', 'readonly', { type: 'get', key: name });
}

/** 删除蓝图 */
async function deleteBlueprint(name) {
  await dbAction('blueprints', 'readwrite', { type: 'delete', key: name });
  blueprintLibrary = blueprintLibrary.filter((b) => b.name !== name);
  saveMemory();
}

/** 重命名蓝图 */
async function renameBlueprint(oldName, newName) {
  const bp = await dbAction('blueprints', 'readonly', { type: 'get', key: oldName });
  if (!bp) return;
  bp.name = newName;
  bp.updatedAt = new Date().toISOString();
  await dbAction('blueprints', 'readwrite', { type: 'put', value: bp });
  await dbAction('blueprints', 'readwrite', { type: 'delete', key: oldName });
  const idx = blueprintLibrary.findIndex((b) => b.name === oldName);
  if (idx >= 0) blueprintLibrary[idx] = bp;
  saveMemory();
}

/* ============================================================
   芯片库 IndexedDB 同步
   ============================================================ */

/** 从 IndexedDB 加载芯片库 */
async function loadChipLibraryFromDB() {
  const all = await dbAction('chips', 'readonly', { type: 'getAll' });
  if (all && all.length > 0) chipLibrary = all;
}

/** 保存芯片到 IndexedDB */
async function saveChipToDB(chip) {
  await dbAction('chips', 'readwrite', { type: 'put', value: chip });
  const idx = chipLibrary.findIndex((c) => c.id === chip.id);
  if (idx >= 0) chipLibrary[idx] = chip;
  else chipLibrary.push(chip);
  saveMemory();
}

/** 从 IndexedDB 删除芯片 */
async function deleteChipFromDB(id) {
  await dbAction('chips', 'readwrite', { type: 'delete', key: id });
  chipLibrary = chipLibrary.filter((c) => c.id !== id);
  saveMemory();
}

/* ============================================================
   文件下载 / 打开外部文件
   ============================================================ */

function download(name, data, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

/** 保存为 .pins.json 下载文件 + 更新 IndexedDB */
function save() {
  const fname = currentFileName || 'pinsketch.pins.json';
  download(fname.endsWith('.json') ? fname : fname + '.pins.json', JSON.stringify(state, null, 2), 'application/json');
  saved = JSON.stringify(state);
  mark(false);
  msg('已下载工程文件');
}

/** 另存为：保存到 IndexedDB */
async function saveAs() {
  const name = prompt('请输入文件名称：', currentFileName || '未命名工程');
  if (!name?.trim()) return;
  await saveFileAs(name.trim());
  msg('已另存为"' + name.trim() + '"');
}

/** 打开外部 .pins.json 文件 */
function loadFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      snapshot();
      state = migrate(JSON.parse(r.result));
      saved = JSON.stringify(state);
      localStorage.setItem('pinsketch-autosave', saved);
      selected.clear();
      selectedWire = null;
      currentFileName = '';
      commit();
      mark(false);
      saveMemory();
      msg('已从文件打开 ' + file.name);
    } catch {
      alert('不是有效的 PinSketch 工程。');
    }
  };
  r.readAsText(file);
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  initDB, dbAction,
  loadAuto, loadMemory, saveMemory,
  listFiles, saveFile, saveFileAs, loadFileByName, deleteFile, renameFile,
  listBlueprints, saveBlueprint, getBlueprint, deleteBlueprint, renameBlueprint,
  loadChipLibraryFromDB, saveChipToDB, deleteChipFromDB,
  download, save, saveAs, loadFile,
});
