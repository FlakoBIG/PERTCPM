/* ═══════════════════════════════════════════════════════════════
   PERT / CPM  —  app.js
   ═══════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────
let activities = [];   // { id, name, duration, predecessors[] }
let editingId  = null;
let nodePositions = {}; // id → { x, y }

// ─── DOM refs ───────────────────────────────────────────────────
const activityBody   = document.getElementById('activity-body');
const btnAdd         = document.getElementById('btn-add');
const btnGenerate    = document.getElementById('btn-generate');
const btnClear       = document.getElementById('btn-clear');
const cpmResults     = document.getElementById('cpm-results');
const cpmTableWrap   = document.getElementById('cpm-table-wrapper');
const totalDuration  = document.getElementById('total-duration');
const emptyState     = document.getElementById('empty-state');
const svg            = document.getElementById('diagram-svg');
const diagramGroup   = document.getElementById('diagram-group');
const canvasContainer = document.getElementById('canvas-container');

// Modal
const modalOverlay   = document.getElementById('modal-overlay');
const modalTitle     = document.getElementById('modal-title');
const modalClose     = document.getElementById('modal-close');
const modalCancel    = document.getElementById('modal-cancel');
const modalSave      = document.getElementById('modal-save');
const inputName      = document.getElementById('input-name');
const inputDuration  = document.getElementById('input-duration');
const inputPred      = document.getElementById('input-predecessors');

// Zoom / pan
const btnZoomIn    = document.getElementById('btn-zoom-in');
const btnZoomOut   = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// ─── Zoom / Pan state ────────────────────────────────────────────
let scale = 1;
let panX  = 0;
let panY  = 0;
let isPanning = false;
let panStart  = { x: 0, y: 0 };

function applyTransform() {
  diagramGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
}

btnZoomIn.addEventListener('click', () => { scale = Math.min(scale * 1.2, 4); applyTransform(); });
btnZoomOut.addEventListener('click', () => { scale = Math.max(scale / 1.2, 0.2); applyTransform(); });
btnZoomReset.addEventListener('click', () => { scale = 1; panX = 0; panY = 0; applyTransform(); });

canvasContainer.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale = Math.min(Math.max(scale * delta, 0.2), 4);
  applyTransform();
}, { passive: false });

canvasContainer.addEventListener('mousedown', e => {
  if (e.target === svg || e.target === diagramGroup) {
    isPanning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
    canvasContainer.style.cursor = 'grabbing';
  }
});

window.addEventListener('mousemove', e => {
  if (!isPanning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  applyTransform();
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  canvasContainer.style.cursor = '';
});

// ─── Unique ID ───────────────────────────────────────────────────
let _id = 0;
const uid = () => ++_id;

// ─── Modal helpers ───────────────────────────────────────────────
function openModal(title, name = '', duration = '', pred = '') {
  modalTitle.textContent = title;
  inputName.value        = name;
  inputDuration.value    = duration;
  inputPred.value        = pred;
  modalOverlay.classList.remove('hidden');
  inputName.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingId = null;
}

modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ─── Save activity ───────────────────────────────────────────────
modalSave.addEventListener('click', () => {
  const name     = inputName.value.trim();
  const duration = parseFloat(inputDuration.value);
  const predRaw  = inputPred.value.trim();

  if (!name)           return shake(inputName);
  if (isNaN(duration) || duration < 0) return shake(inputDuration);

  const predecessors = predRaw
    ? predRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [];

  if (editingId !== null) {
    const act = activities.find(a => a.id === editingId);
    if (act) { act.name = name.toUpperCase(); act.duration = duration; act.predecessors = predecessors; }
  } else {
    activities.push({ id: uid(), name: name.toUpperCase(), duration, predecessors });
  }

  renderTable();
  closeModal();
});

// Enter key in modal
[inputName, inputDuration, inputPred].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') modalSave.click(); })
);

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake .3s ease';
  el.focus();
}

// ─── Add / Edit / Delete ─────────────────────────────────────────
btnAdd.addEventListener('click', () => {
  editingId = null;
  openModal('Nueva actividad');
});

function editActivity(id) {
  const act = activities.find(a => a.id === id);
  if (!act) return;
  editingId = id;
  openModal('Editar actividad', act.name, act.duration, act.predecessors.join(', '));
}

function deleteActivity(id) {
  activities = activities.filter(a => a.id !== id);
  // Remove references
  activities.forEach(a => {
    const act = activities.find(x => x.id === id);
    // already removed, clean predecessors referencing deleted name
  });
  renderTable();
}

// ─── Render table ────────────────────────────────────────────────
function renderTable() {
  activityBody.innerHTML = '';
  if (activities.length === 0) {
    activityBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">Sin actividades registradas</td></tr>`;
    return;
  }
  activities.forEach(act => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge-name">${act.name}</span></td>
      <td class="cell-duration">${act.duration}</td>
      <td class="cell-pred">${act.predecessors.join(', ') || '—'}</td>
      <td style="display:flex;gap:4px;justify-content:flex-end">
        <button class="btn-row-edit"  data-id="${act.id}" title="Editar actividad">✎</button>
        <button class="btn-row-delete" data-id="${act.id}" title="Eliminar actividad">✕</button>
      </td>`;
    activityBody.appendChild(tr);
  });

  activityBody.querySelectorAll('.btn-row-edit').forEach(b =>
    b.addEventListener('click', () => editActivity(+b.dataset.id)));
  activityBody.querySelectorAll('.btn-row-delete').forEach(b =>
    b.addEventListener('click', () => deleteActivity(+b.dataset.id)));
}

// ─── Clear ───────────────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  activities = [];
  nodePositions = {};
  renderTable();
  diagramGroup.innerHTML = '';
  emptyState.classList.remove('hidden');
  cpmResults.classList.add('hidden');
  scale = 1; panX = 0; panY = 0;
  applyTransform();
});

// ─── CPM Calculation ─────────────────────────────────────────────
function computeCPM(acts) {
  const map = {};
  acts.forEach(a => { map[a.name] = { ...a, ES: 0, EF: 0, LS: Infinity, LF: Infinity, slack: 0 }; });

  // Topological sort
  const sorted = topoSort(acts);
  if (!sorted) return null; // cycle detected

  // Forward pass
  sorted.forEach(name => {
    const node = map[name];
    node.ES = node.predecessors.length === 0
      ? 0
      : Math.max(...node.predecessors.map(p => map[p] ? map[p].EF : 0));
    node.EF = node.ES + node.duration;
  });

  const projectEnd = Math.max(...Object.values(map).map(n => n.EF));

  // Backward pass
  [...sorted].reverse().forEach(name => {
    const node = map[name];
    const successors = acts.filter(a => a.predecessors.includes(name));
    node.LF = successors.length === 0
      ? projectEnd
      : Math.min(...successors.map(s => map[s.name].LS));
    node.LS = node.LF - node.duration;
    node.slack = node.LF - node.EF;
  });

  return { map, sorted, projectEnd };
}

function topoSort(acts) {
  const inDeg = {};
  const adj   = {};
  acts.forEach(a => { inDeg[a.name] = 0; adj[a.name] = []; });
  acts.forEach(a => a.predecessors.forEach(p => {
    if (adj[p]) { adj[p].push(a.name); inDeg[a.name]++; }
  }));

  const queue  = acts.filter(a => inDeg[a.name] === 0).map(a => a.name);
  const result = [];
  while (queue.length) {
    const n = queue.shift();
    result.push(n);
    (adj[n] || []).forEach(m => { if (--inDeg[m] === 0) queue.push(m); });
  }
  return result.length === acts.length ? result : null;
}

// ─── Generate diagram ────────────────────────────────────────────
btnGenerate.addEventListener('click', () => {
  if (activities.length === 0) return;

  const cpm = computeCPM(activities);
  if (!cpm) {
    alert('Se detectó un ciclo en las dependencias. Por favor revisa los predecesores de cada actividad.');
    return;
  }

  renderCPMTable(cpm);
  renderDiagram(cpm);
  emptyState.classList.add('hidden');
});

// ─── CPM results table ───────────────────────────────────────────
function renderCPMTable({ map, projectEnd }) {
  totalDuration.textContent = projectEnd;
  const rows = Object.values(map).map(n => {
    const isCrit = n.slack === 0;
    return `<tr class="${isCrit ? 'critical-row' : ''}">
      <td>${n.name}</td>
      <td>${n.duration}</td>
      <td>${n.ES}</td>
      <td>${n.EF}</td>
      <td>${n.LS}</td>
      <td>${n.LF}</td>
      <td>${n.slack}</td>
    </tr>`;
  }).join('');

  cpmTableWrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Act.</th><th>Dur.</th>
        <th>IC</th><th>TC</th>
        <th>IT</th><th>TT</th>
        <th>Holgura</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  cpmResults.classList.remove('hidden');
}

// ─── Diagram rendering ───────────────────────────────────────────
const NODE_W  = 120;
const NODE_H  = 70;
const H_GAP   = 80;
const V_GAP   = 60;

function computeLayout(sorted, map) {
  // Assign levels (longest path from start)
  const level = {};
  sorted.forEach(name => {
    const preds = map[name].predecessors;
    level[name] = preds.length === 0
      ? 0
      : Math.max(...preds.map(p => (level[p] ?? 0) + 1));
  });

  // Group by level
  const cols = {};
  sorted.forEach(name => {
    const l = level[name];
    if (!cols[l]) cols[l] = [];
    cols[l].push(name);
  });

  const positions = {};
  Object.entries(cols).forEach(([col, names]) => {
    const x = +col * (NODE_W + H_GAP) + 60;
    names.forEach((name, row) => {
      const y = row * (NODE_H + V_GAP) + 60;
      positions[name] = { x, y };
    });
  });

  return positions;
}

function renderDiagram({ map, sorted, projectEnd }) {
  diagramGroup.innerHTML = '';

  // Compute layout (keep existing positions if available)
  const layout = computeLayout(sorted, map);
  sorted.forEach(name => {
    if (!nodePositions[name]) nodePositions[name] = layout[name];
  });
  // Remove stale positions
  Object.keys(nodePositions).forEach(k => {
    if (!map[k]) delete nodePositions[k];
  });

  // Draw edges first (behind nodes)
  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeGroup.id = 'edge-group';
  diagramGroup.appendChild(edgeGroup);

  // Draw nodes
  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.id = 'node-group';
  diagramGroup.appendChild(nodeGroup);

  // Identify critical path edges
  const criticalEdges = new Set();
  sorted.forEach(name => {
    const node = map[name];
    if (node.slack === 0) {
      node.predecessors.forEach(p => {
        if (map[p] && map[p].slack === 0) criticalEdges.add(`${p}->${name}`);
      });
    }
  });

  // Draw edges
  activities.forEach(act => {
    act.predecessors.forEach(pred => {
      if (!map[pred]) return;
      const key = `${pred}->${act.name}`;
      const isCrit = criticalEdges.has(key);
      drawEdge(edgeGroup, pred, act.name, isCrit, map);
    });
  });

  // Draw nodes
  sorted.forEach(name => {
    drawNode(nodeGroup, map[name], edgeGroup, map);
  });

  // Fit view
  fitView(sorted);
}

function drawEdge(group, fromName, toName, isCritical, map) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.id = `edge-${fromName}-${toName}`;
  path.classList.add('edge-line');
  if (isCritical) path.classList.add('critical');
  group.appendChild(path);
  updateEdge(path, fromName, toName);
}

function updateEdge(path, fromName, toName) {
  const fp = nodePositions[fromName];
  const tp = nodePositions[toName];
  if (!fp || !tp) return;

  const x1 = fp.x + NODE_W;
  const y1 = fp.y + NODE_H / 2;
  const x2 = tp.x;
  const y2 = tp.y + NODE_H / 2;

  const cx1 = x1 + (x2 - x1) * 0.5;
  const cy1 = y1;
  const cx2 = x1 + (x2 - x1) * 0.5;
  const cy2 = y2;

  path.setAttribute('d', `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`);
}

function drawNode(group, node, edgeGroup, map) {
  const { name } = node;
  const pos = nodePositions[name];
  const isCrit = node.slack === 0;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('node-group');
  g.id = `node-${name}`;

  // Background rect
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width',  NODE_W);
  rect.setAttribute('height', NODE_H);
  rect.setAttribute('rx', 10);
  rect.setAttribute('ry', 10);
  rect.classList.add('node-box');
  if (isCrit) rect.classList.add('critical');
  g.appendChild(rect);

  // Divider lines
  const divH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  divH.setAttribute('x1', 0);   divH.setAttribute('y1', NODE_H / 2);
  divH.setAttribute('x2', NODE_W); divH.setAttribute('y2', NODE_H / 2);
  divH.setAttribute('stroke', isCrit ? 'var(--critical)' : 'var(--border)');
  divH.setAttribute('stroke-width', '1');
  g.appendChild(divH);

  const divV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  divV.setAttribute('x1', NODE_W / 2); divV.setAttribute('y1', 0);
  divV.setAttribute('x2', NODE_W / 2); divV.setAttribute('y2', NODE_H / 2);
  divV.setAttribute('stroke', isCrit ? 'var(--critical)' : 'var(--border)');
  divV.setAttribute('stroke-width', '1');
  g.appendChild(divV);

  // Name label (top-left quadrant)
  const lblName = makeSVGText(name, NODE_W / 4, NODE_H / 4, 'node-label');
  if (isCrit) lblName.style.fill = 'var(--critical)';
  g.appendChild(lblName);

  // Duration (top-right quadrant)
  const lblDur = makeSVGText(node.duration, NODE_W * 3/4, NODE_H / 4, 'node-duration');
  g.appendChild(lblDur);

  // ES / EF / LS / LF in bottom half
  const lblES = makeSVGText(`IC:${node.ES}`,  NODE_W * 1/4, NODE_H * 3/4 - 8, 'node-es');
  const lblEF = makeSVGText(`TC:${node.EF}`,  NODE_W * 3/4, NODE_H * 3/4 - 8, 'node-ef');
  const lblLS = makeSVGText(`IT:${node.LS}`,  NODE_W * 1/4, NODE_H * 3/4 + 8, 'node-ls');
  const lblLF = makeSVGText(`TT:${node.LF}`,  NODE_W * 3/4, NODE_H * 3/4 + 8, 'node-lf');
  [lblES, lblEF, lblLS, lblLF].forEach(l => g.appendChild(l));

  g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
  group.appendChild(g);

  // ── Drag ──────────────────────────────────────────────────────
  makeDraggable(g, name, edgeGroup, map);
}

function makeSVGText(content, x, y, cls) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.classList.add(cls);
  t.textContent = content;
  return t;
}

// ─── Drag logic ───────────────────────────────────────────────────
function makeDraggable(el, name, edgeGroup, map) {
  let dragging = false;
  let startMouse = { x: 0, y: 0 };
  let startPos   = { x: 0, y: 0 };

  el.addEventListener('mousedown', e => {
    if (isPanning) return;
    e.stopPropagation();
    dragging  = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startPos   = { ...nodePositions[name] };
    el.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = (e.clientX - startMouse.x) / scale;
    const dy = (e.clientY - startMouse.y) / scale;
    nodePositions[name] = { x: startPos.x + dx, y: startPos.y + dy };
    el.setAttribute('transform', `translate(${nodePositions[name].x},${nodePositions[name].y})`);

    // Update connected edges
    activities.forEach(act => {
      act.predecessors.forEach(pred => {
        if (pred === name || act.name === name) {
          const path = document.getElementById(`edge-${pred}-${act.name}`);
          if (path) updateEdge(path, pred, act.name);
        }
      });
    });
  });

  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; el.style.cursor = 'grab'; }
  });
}

// ─── Fit view ─────────────────────────────────────────────────────
function fitView(sorted) {
  if (sorted.length === 0) return;
  const xs = sorted.map(n => nodePositions[n].x);
  const ys = sorted.map(n => nodePositions[n].y);
  const minX = Math.min(...xs) - 20;
  const minY = Math.min(...ys) - 20;
  const maxX = Math.max(...xs) + NODE_W + 20;
  const maxY = Math.max(...ys) + NODE_H + 20;

  const svgW = canvasContainer.clientWidth;
  const svgH = canvasContainer.clientHeight;
  const contentW = maxX - minX;
  const contentH = maxY - minY;

  scale = Math.min(svgW / contentW, svgH / contentH, 1.2) * 0.85;
  panX  = (svgW - contentW * scale) / 2 - minX * scale;
  panY  = (svgH - contentH * scale) / 2 - minY * scale;
  applyTransform();
}

// ─── Shake animation (CSS) ────────────────────────────────────────
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}
  60%{transform:translateX(-4px)}
  80%{transform:translateX(4px)}
}`;
document.head.appendChild(shakeStyle);

// ─── Init ─────────────────────────────────────────────────────────
renderTable();
