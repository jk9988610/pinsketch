/* ============================================================
   PinSketch — analysis.js
   ERC 电气规则检查、网表导出
   ============================================================ */

/* ---------- ERC 电气规则检查 ---------- */
/**
 * 检查项：
 * 1. 重复位号
 * 2. 悬空引脚
 * 3. 网络标签冲突
 * 4. 两端器件短接
 * @returns {Array<{type:string, text:string, target:number}>}
 */
function erc() {
  const issues = [];
  const g = graph();
  const all = [];
  state.components.forEach((c) =>
    c.pins.forEach((p, i) => all.push({ c, i, p, k: g.find('p' + c.id + '.' + i) }))
  );

  // 1. 重复位号
  const refs = {};
  state.components
    .filter((c) => c.ref && c.type !== 'label' && c.type !== 'junction')
    .forEach((c) => ((refs[c.ref] ||= []).push(c)));
  Object.entries(refs)
    .filter(([, a]) => a.length > 1)
    .forEach(([r, a]) => issues.push({ type: 'error', text: '重复位号：' + r, target: a[0].id }));

  // 2. 悬空引脚
  const wk = new Set(state.wires.flatMap((w) => [key(w.a), key(w.b)]));
  all
    .filter((x) => x.c.type !== 'label' && !wk.has('p' + x.c.id + '.' + x.i))
    .forEach((x) =>
      issues.push({ type: 'warn', text: '悬空引脚：' + (x.c.ref || x.c.name) + '.' + x.p.name, target: x.c.id })
    );

  // 3. 网络标签冲突
  const labels = {};
  state.components
    .filter((c) => c.type === 'label' && c.name.trim())
    .forEach((c) => {
      const n = g.find('p' + c.id + '.0');
      (labels[n] ||= new Set()).add(c.name.trim());
    });
  Object.entries(labels)
    .filter(([, s]) => s.size > 1)
    .forEach(([n, s]) => {
      const x = all.find((x) => x.k === n);
      issues.push({ type: 'error', text: '网络标签冲突：' + [...s].join(' / '), target: x?.c.id });
    });

  // 4. 两端器件短接
  state.components
    .filter((c) => ['resistor', 'capacitor', 'diode', 'led', 'button', 'switch'].includes(c.type) && c.pins.length === 2)
    .forEach((c) => {
      if (g.find('p' + c.id + '.0') === g.find('p' + c.id + '.1'))
        issues.push({ type: 'error', text: '器件两端短接：' + (c.ref || c.name), target: c.id });
    });

  return issues;
}

/* ---------- 网表导出 ---------- */
/**
 * 按网络列出各元件引脚连接关系的文本
 * @returns {string}
 */
function netlist() {
  const g = graph();
  const sets = {};
  state.components.forEach((c) =>
    c.pins.forEach((p, i) => {
      const k = g.find('p' + c.id + '.' + i);
      (sets[k] ||= []).push({ c, p });
    })
  );
  let n = 1;
  let out = '# PinSketch 0.3 Netlist\n# Generated: ' + new Date().toLocaleString() + '\n\n';
  for (const a of Object.values(sets)) {
    const labs = a
      .filter((x) => x.c.type === 'label')
      .map((x) => x.c.name.trim())
      .filter(Boolean);
    const name = labs[0] || 'NET_' + String(n++).padStart(3, '0');
    out += 'NET ' + name + '\n';
    a.filter((x) => x.c.type !== 'label').forEach(
      (x) =>
        (out +=
          '  - ' +
          (x.c.ref || x.c.name) +
          ' (' +
          x.c.name +
          ') . ' +
          x.p.name +
          (x.c.value ? ' [' + x.c.value + ']' : '') +
          '\n')
    );
    out += '\n';
  }
  return out;
}

/* ---------- 导出到全局命名空间 ---------- */
Object.assign(PinSketch, { erc, netlist });
