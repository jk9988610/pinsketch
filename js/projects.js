/* ============================================================
   PinSketch — projects.js
   设计目录：使用 IndexedDB 持久化保存用户的设计内容
   每个设计包含名称、工程 JSON 数据、创建/更新时间、元件/导线计数
   ============================================================ */

const DB_NAME = 'pinsketch-projects';
const DB_STORE = 'projects';
const DB_VERSION = 1;
let dbReady = null;

/* ---------- 初始化 IndexedDB ---------- */
function initDB() {
  if (dbReady) return dbReady;
  dbReady = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbReady;
}

/* ---------- 获取所有设计列表 ---------- */
async function listProjects() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------- 保存设计到目录 ---------- */
async function saveProject(name) {
  const data = JSON.parse(JSON.stringify(state)); // 深拷贝
  const project = {
    name,
    data,
    componentCount: data.components.length,
    wireCount: data.wires.length,
    updatedAt: new Date().toISOString(),
    createdAt: Date.now(),
  };

  // 如果已存在，保留原 createdAt
  try {
    const existing = await getProject(name);
    if (existing) project.createdAt = existing.createdAt;
  } catch {}

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(project);
    tx.oncomplete = () => resolve(project);
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- 读取单个设计 ---------- */
async function getProject(name) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- 删除设计 ---------- */
async function deleteProject(name) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- 重命名设计 ---------- */
async function renameProject(oldName, newName) {
  const p = await getProject(oldName);
  if (!p) return;
  p.name = newName;
  p.updatedAt = new Date().toISOString();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(oldName);
    tx.objectStore(DB_STORE).put(p);
    tx.oncomplete = () => resolve(p);
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- 加载设计到画布 ---------- */
async function loadProject(name) {
  const p = await getProject(name);
  if (!p) {
    msg('未找到设计"' + name + '"');
    return;
  }
  snapshot();
  state = migrate(JSON.parse(JSON.stringify(p.data)));
  saved = JSON.stringify(state);
  localStorage.setItem('pinsketch-autosave', saved);
  selected.clear();
  selectedWire = null;
  currentProjectName = name;
  commit();
  mark(false);
  msg('已打开设计"' + name + '"');
}

/* ---------- 打开设计目录模态框 ---------- */
async function openDirectory() {
  let projects = [];
  try {
    projects = await listProjects();
  } catch {
    msg('无法访问设计目录（浏览器不支持 IndexedDB）。');
    return;
  }

  const listHTML = projects.length
    ? projects
        .map(
          (p) => `
      <div class="project-card" data-name="${esc(p.name)}">
        <div class="pc-info">
          <div class="pc-name">${esc(p.name)}</div>
          <div class="pc-meta">${p.componentCount} 元件 · ${p.wireCount} 导线 · ${new Date(p.updatedAt || p.createdAt).toLocaleString()}</div>
        </div>
        <div class="pc-actions">
          <button data-load="${esc(p.name)}">打开</button>
          <button data-rename="${esc(p.name)}">重命名</button>
          <button data-delete="${esc(p.name)}" class="danger">删除</button>
        </div>
      </div>`
        )
        .join('')
    : '<div class="project-empty">设计目录为空。<br>在顶部"保存到目录"以保存当前设计。</div>';

  const body = `
    <div class="save-form">
      <input id="projectNameInput" placeholder="设计名称，如：传感器主板 v1.0" value="${esc(currentProjectName)}">
      <button id="saveProjectBtn">保存到目录</button>
    </div>
    <div class="project-grid">${listHTML}</div>
  `;

  modal('设计目录', body);

  // 保存按钮
  const saveBtn = document.querySelector('#saveProjectBtn');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const name = document.querySelector('#projectNameInput').value.trim();
      if (!name) {
        msg('请输入设计名称。');
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        await saveProject(name);
        currentProjectName = name;
        saved = JSON.stringify(state);
        mark(false);
        msg('已保存设计"' + name + '"到目录');
        openDirectory(); // 刷新列表
      } catch {
        msg('保存失败，请重试。');
        saveBtn.disabled = false;
        saveBtn.textContent = '保存到目录';
      }
    };
  }

  // 打开按钮
  document.querySelectorAll('[data-load]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.load;
      document.querySelector('#modal').style.display = 'none';
      await loadProject(name);
    };
  });

  // 重命名按钮
  document.querySelectorAll('[data-rename]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const oldName = b.dataset.rename;
      const newName = prompt('重命名设计：', oldName);
      if (!newName?.trim() || newName.trim() === oldName) return;
      try {
        await renameProject(oldName, newName.trim());
        if (currentProjectName === oldName) currentProjectName = newName.trim();
        msg('已重命名为"' + newName.trim() + '"');
        openDirectory();
      } catch {
        msg('重命名失败。');
      }
    };
  });

  // 删除按钮
  document.querySelectorAll('[data-delete]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.delete;
      if (!confirm('确认删除设计"' + name + '"？此操作不可撤销。')) return;
      try {
        await deleteProject(name);
        if (currentProjectName === name) currentProjectName = '';
        msg('已删除设计"' + name + '"');
        openDirectory();
      } catch {
        msg('删除失败。');
      }
    };
  });

  // 卡片点击 = 打开
  document.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // 不拦截按钮
      const name = card.dataset.name;
      document.querySelector('#modal').style.display = 'none';
      loadProject(name);
    });
  });
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, {
  initDB, listProjects, saveProject, getProject, deleteProject, renameProject,
  loadProject, openDirectory,
});
