/* ═══════════════════════════════════════════════════════════════
   PERT / CPM  —  app.js
   Cada actividad tiene:
     · num          → número correlativo (1, 2, 3…) — clave única
     · name         → nombre descriptivo libre
     · duration     → duración numérica
     · predecessors → array de números (int) de tareas predecesoras
   ═══════════════════════════════════════════════════════════════ */

// ─── Estado ─────────────────────────────────────────────────────
let activities    = [];   // { num, name, duration, predecessors[] }
let editingNum    = null; // número de la tarea que se está editando
let nodePositions = {};   // num → { x, y }
let nextNum       = 1;    // contador autoincremental

// ─── DOM refs ───────────────────────────────────────────────────
const activityBody    = document.getElementById('activity-body');
const btnAdd          = document.getElementById('btn-add');
const btnGenerate     = document.getElementById('btn-generate');
const btnClear        = document.getElementById('btn-clear');
const cpmResults      = document.getElementById('cpm-results');
const cpmTableWrap    = document.getElementById('cpm-table-wrapper');
const totalDuration   = document.getElementById('total-duration');
const emptyState      = document.getElementById('empty-state');
const svg             = document.getElementById('diagram-svg');
const diagramGroup    = document.getElementById('diagram-group');
const canvasContainer = document.getElementById('canvas-container');

// Modal
const modalOverlay  = document.getElementById('modal-overlay');
const modalTitle    = document.getElementById('modal-title');
const modalNumBadge = document.getElementById('modal-num-badge');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalSave     = document.getElementById('modal-save');
const inputName     = document.getElementById('input-name');
const inputDuration = document.getElementById('input-duration');
const inputPred     = document.getElementById('input-predecessors');

// Zoom / pan
const btnZoomIn    = document.getElementById('btn-zoom-in');
const btnZoomOut   = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// ─── Zoom / Pan ──────────────────────────────────────────────────
let scale     = 1;
let panX      = 0;
let panY      = 0;
let isPanning = false;
let panStart  = { x: 0, y: 0 };

function applyTransform() {
  diagramGroup.setAttribute('transform', `translate(${panX},${panY}) scale(${scale})`);
}

btnZoomIn.addEventListener('click',    () => { scale = Math.min(scale * 1.2, 4);   applyTransform(); });
btnZoomOut.addEventListener('click',   () => { scale = Math.max(scale / 1.2, 0.2); applyTransform(); });
btnZoomReset.addEventListener('click', () => { scale = 1; panX = 0; panY = 0;      applyTransform(); });

canvasContainer.addEventListener('wheel', e => {
  e.preventDefault();
  scale = Math.min(Math.max(scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.2), 4);
  applyTransform();
}, { passive: false });

canvasContainer.addEventListener('mousedown', e => {
  if (e.target === svg || e.target === diagramGroup) {
    isPanning = true;
    panStart  = { x: e.clientX - panX, y: e.clientY - panY };
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

// ─── Modal ───────────────────────────────────────────────────────
function openModal(title, num, name = '', duration = '', pred = '') {
  modalTitle.textContent    = title;
  modalNumBadge.textContent = `#${num}`;
  inputName.value           = name;
  inputDuration.value       = duration;
  inputPred.value           = pred;
  modalOverlay.classList.remove('hidden');
  inputName.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingNum = null;
}

modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ─── Guardar actividad ───────────────────────────────────────────
modalSave.addEventListener('click', () => {
  const name     = inputName.value.trim();
  const duration = parseFloat(inputDuration.value);
  const predRaw  = inputPred.value.trim();

  if (!name)                           return shake(inputName);
  if (isNaN(duration) || duration < 0) return shake(inputDuration);

  // Parsear predecesores como números enteros
  const predecessors = predRaw
    ? predRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    : [];

  // Validar que los predecesores existan
  const existingNums = activities.map(a => a.num);
  const invalid = predecessors.filter(p => {
    // Al editar, el propio número es válido solo si no es él mismo
    if (editingNum !== null) return p === editingNum || !existingNums.includes(p);
    return !existingNums.includes(p);
  });
  if (invalid.length > 0) {
    shake(inputPred);
    inputPred.placeholder = `Números inválidos: ${invalid.join(', ')}`;
    return;
  }

  if (editingNum !== null) {
    const act = activities.find(a => a.num === editingNum);
    if (act) { act.name = name; act.duration = duration; act.predecessors = predecessors; }
  } else {
    activities.push({ num: nextNum++, name, duration, predecessors });
  }

  renderTable();
  closeModal();
});

[inputName, inputDuration, inputPred].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') modalSave.click(); })
);

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake .3s ease';
  el.focus();
}

// ─── Agregar / Editar / Eliminar ─────────────────────────────────
btnAdd.addEventListener('click', () => {
  editingNum = null;
  openModal('Nueva actividad', nextNum);
});

function editActivity(num) {
  const act = activities.find(a => a.num === num);
  if (!act) return;
  editingNum = num;
  openModal('Editar actividad', num, act.name, act.duration, act.predecessors.join(', '));
}

function deleteActivity(num) {
  activities = activities.filter(a => a.num !== num);
  // Limpiar referencias a la tarea eliminada en otros predecesores
  activities.forEach(a => {
    a.predecessors = a.predecessors.filter(p => p !== num);
  });
  renderTable();
}

// ─── Render tabla ────────────────────────────────────────────────
function renderTable() {
  activityBody.innerHTML = '';
  if (activities.length === 0) {
    activityBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px 8px">
          Sin actividades registradas
        </td>
      </tr>`;
    return;
  }

  activities.forEach(act => {
    const predText = act.predecessors.length
      ? act.predecessors.map(p => `<span class="pred-chip">${p}</span>`).join('')
      : '<span style="color:var(--text-muted)">—</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge-num">${act.num}</span></td>
      <td class="cell-name">${act.name}</td>
      <td class="cell-duration">${act.duration}</td>
      <td class="cell-pred">${predText}</td>
      <td style="display:flex;gap:4px;justify-content:flex-end">
        <button class="btn-row-edit"   data-num="${act.num}" title="Editar actividad">✎</button>
        <button class="btn-row-delete" data-num="${act.num}" title="Eliminar actividad">✕</button>
      </td>`;
    activityBody.appendChild(tr);
  });

  activityBody.querySelectorAll('.btn-row-edit').forEach(b =>
    b.addEventListener('click', () => editActivity(+b.dataset.num)));
  activityBody.querySelectorAll('.btn-row-delete').forEach(b =>
    b.addEventListener('click', () => deleteActivity(+b.dataset.num)));
}

// ─── Limpiar todo ────────────────────────────────────────────────
btnClear.addEventListener('click', () => {
  activities    = [];
  nodePositions = {};
  nextNum       = 1;
  renderTable();
  diagramGroup.innerHTML = '';
  emptyState.classList.remove('hidden');
  cpmResults.classList.add('hidden');
  scale = 1; panX = 0; panY = 0;
  applyTransform();
});

// ─── Cálculo CPM ─────────────────────────────────────────────────
// Internamente usamos el número (num) como clave del mapa
function computeCPM(acts) {
  const map = {};
  acts.forEach(a => {
    map[a.num] = { ...a, ES: 0, EF: 0, LS: Infinity, LF: Infinity, slack: 0 };
  });

  const sorted = topoSort(acts);
  if (!sorted) return null; // ciclo detectado

  // Pasada hacia adelante
  sorted.forEach(num => {
    const node = map[num];
    node.ES = node.predecessors.length === 0
      ? 0
      : Math.max(...node.predecessors.map(p => map[p] ? map[p].EF : 0));
    node.EF = node.ES + node.duration;
  });

  const projectEnd = Math.max(...Object.values(map).map(n => n.EF));

  // Pasada hacia atrás
  [...sorted].reverse().forEach(num => {
    const node       = map[num];
    const successors = acts.filter(a => a.predecessors.includes(num));
    node.LF = successors.length === 0
      ? projectEnd
      : Math.min(...successors.map(s => map[s.num].LS));
    node.LS    = node.LF - node.duration;
    node.slack = node.LF - node.EF;
  });

  return { map, sorted, projectEnd };
}

function topoSort(acts) {
  const inDeg = {};
  const adj   = {};
  acts.forEach(a => { inDeg[a.num] = 0; adj[a.num] = []; });
  acts.forEach(a => a.predecessors.forEach(p => {
    if (adj[p] !== undefined) { adj[p].push(a.num); inDeg[a.num]++; }
  }));

  const queue  = acts.filter(a => inDeg[a.num] === 0).map(a => a.num);
  const result = [];
  while (queue.length) {
    const n = queue.shift();
    result.push(n);
    (adj[n] || []).forEach(m => { if (--inDeg[m] === 0) queue.push(m); });
  }
  return result.length === acts.length ? result : null;
}

// ─── Generar diagrama ────────────────────────────────────────────
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

// ─── Tabla de resultados CPM ─────────────────────────────────────
function renderCPMTable({ map, projectEnd }) {
  totalDuration.textContent = projectEnd;

  const rows = Object.values(map).map(n => {
    const isCrit = n.slack === 0;
    const predText = n.predecessors.length ? n.predecessors.join(', ') : '—';
    return `<tr class="${isCrit ? 'critical-row' : ''}">
      <td><span class="badge-num sm">${n.num}</span></td>
      <td class="cell-name-sm">${n.name}</td>
      <td>${n.duration}</td>
      <td>${predText}</td>
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
        <th>#</th>
        <th>Nombre</th>
        <th>Dur.</th>
        <th>Pred.</th>
        <th>IC</th><th>TC</th>
        <th>IT</th><th>TT</th>
        <th>Holgura</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  cpmResults.classList.remove('hidden');
}

// ─── Renderizado del diagrama ────────────────────────────────────
const NODE_W = 130;
const NODE_H = 80;
const H_GAP  = 90;
const V_GAP  = 60;

function computeLayout(sorted, map) {
  const level = {};
  sorted.forEach(num => {
    const preds = map[num].predecessors;
    level[num] = preds.length === 0
      ? 0
      : Math.max(...preds.map(p => (level[p] ?? 0) + 1));
  });

  const cols = {};
  sorted.forEach(num => {
    const l = level[num];
    if (!cols[l]) cols[l] = [];
    cols[l].push(num);
  });

  const positions = {};
  Object.entries(cols).forEach(([col, nums]) => {
    const x = +col * (NODE_W + H_GAP) + 60;
    nums.forEach((num, row) => {
      const y = row * (NODE_H + V_GAP) + 60;
      positions[num] = { x, y };
    });
  });

  return positions;
}

function renderDiagram({ map, sorted }) {
  diagramGroup.innerHTML = '';

  const layout = computeLayout(sorted, map);
  sorted.forEach(num => {
    if (!nodePositions[num]) nodePositions[num] = layout[num];
  });
  Object.keys(nodePositions).forEach(k => {
    if (!map[+k]) delete nodePositions[+k];
  });

  // Aristas primero (detrás de los nodos)
  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeGroup.id = 'edge-group';
  diagramGroup.appendChild(edgeGroup);

  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.id = 'node-group';
  diagramGroup.appendChild(nodeGroup);

  // Identificar aristas críticas
  const criticalEdges = new Set();
  sorted.forEach(num => {
    const node = map[num];
    if (node.slack === 0) {
      node.predecessors.forEach(p => {
        if (map[p] && map[p].slack === 0) criticalEdges.add(`${p}->${num}`);
      });
    }
  });

  // Dibujar aristas
  activities.forEach(act => {
    act.predecessors.forEach(pred => {
      if (!map[pred]) return;
      drawEdge(edgeGroup, pred, act.num, criticalEdges.has(`${pred}->${act.num}`));
    });
  });

  // Dibujar nodos
  sorted.forEach(num => drawNode(nodeGroup, map[num], edgeGroup));

  fitView(sorted);
}

function drawEdge(group, fromNum, toNum, isCritical) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.id = `edge-${fromNum}-${toNum}`;
  path.classList.add('edge-line');
  if (isCritical) path.classList.add('critical');
  group.appendChild(path);
  updateEdge(path, fromNum, toNum);
}

function updateEdge(path, fromNum, toNum) {
  const fp = nodePositions[fromNum];
  const tp = nodePositions[toNum];
  if (!fp || !tp) return;

  const x1 = fp.x + NODE_W;
  const y1 = fp.y + NODE_H / 2;
  const x2 = tp.x;
  const y2 = tp.y + NODE_H / 2;
  const cx  = x1 + (x2 - x1) * 0.5;

  path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
}

function drawNode(group, node, edgeGroup) {
  const { num, name } = node;
  const pos    = nodePositions[num];
  const isCrit = node.slack === 0;
  const stroke = isCrit ? 'var(--critical)' : 'var(--border)';

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('node-group');
  g.id = `node-${num}`;

  // ── Fondo ──
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width',  NODE_W);
  rect.setAttribute('height', NODE_H);
  rect.setAttribute('rx', 10);
  rect.setAttribute('ry', 10);
  rect.classList.add('node-box');
  if (isCrit) rect.classList.add('critical');
  g.appendChild(rect);

  // ── Divisor horizontal (mitad) ──
  appendLine(g, 0, NODE_H / 2, NODE_W, NODE_H / 2, stroke);

  // ── Divisor vertical en la mitad superior (separa # | nombre) ──
  appendLine(g, 32, 0, 32, NODE_H / 2, stroke);

  // ── Número de tarea (arriba izquierda) ──
  const lblNum = makeSVGText(`${num}`, 16, NODE_H / 4, 'node-num');
  if (isCrit) lblNum.style.fill = 'var(--critical)';
  g.appendChild(lblNum);

  // ── Nombre de la tarea (arriba derecha, truncado) ──
  const lblName = makeSVGText(truncate(name, 10), 32 + (NODE_W - 32) / 2, NODE_H / 4, 'node-label');
  g.appendChild(lblName);

  // ── Duración (centro del divisor horizontal) ──
  const lblDur = makeSVGText(`${node.duration}`, NODE_W / 2, NODE_H / 2, 'node-duration-badge');
  g.appendChild(lblDur);

  // ── IC / TC / IT / TT en la mitad inferior ──
  const lblIC = makeSVGText(`IC:${node.ES}`, NODE_W * 1/4,     NODE_H * 3/4 - 9, 'node-es');
  const lblTC = makeSVGText(`TC:${node.EF}`, NODE_W * 3/4,     NODE_H * 3/4 - 9, 'node-ef');
  const lblIT = makeSVGText(`IT:${node.LS}`, NODE_W * 1/4,     NODE_H * 3/4 + 9, 'node-ls');
  const lblTT = makeSVGText(`TT:${node.LF}`, NODE_W * 3/4,     NODE_H * 3/4 + 9, 'node-lf');
  [lblIC, lblTC, lblIT, lblTT].forEach(l => g.appendChild(l));

  // ── Divisor vertical en la mitad inferior ──
  appendLine(g, NODE_W / 2, NODE_H / 2, NODE_W / 2, NODE_H, stroke);

  g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
  group.appendChild(g);

  makeDraggable(g, num, edgeGroup);
}

function appendLine(parent, x1, y1, x2, y2, stroke) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('stroke', stroke);
  l.setAttribute('stroke-width', '1');
  parent.appendChild(l);
}

function makeSVGText(content, x, y, cls) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.classList.add(cls);
  t.textContent = content;
  return t;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ─── Drag ────────────────────────────────────────────────────────
function makeDraggable(el, num, edgeGroup) {
  let dragging  = false;
  let startMouse = { x: 0, y: 0 };
  let startPos   = { x: 0, y: 0 };

  el.addEventListener('mousedown', e => {
    if (isPanning) return;
    e.stopPropagation();
    dragging   = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startPos   = { ...nodePositions[num] };
    el.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = (e.clientX - startMouse.x) / scale;
    const dy = (e.clientY - startMouse.y) / scale;
    nodePositions[num] = { x: startPos.x + dx, y: startPos.y + dy };
    el.setAttribute('transform', `translate(${nodePositions[num].x},${nodePositions[num].y})`);

    // Actualizar aristas conectadas
    activities.forEach(act => {
      act.predecessors.forEach(pred => {
        if (pred === num || act.num === num) {
          const path = document.getElementById(`edge-${pred}-${act.num}`);
          if (path) updateEdge(path, pred, act.num);
        }
      });
    });
  });

  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; el.style.cursor = 'grab'; }
  });
}

// ─── Ajustar vista ───────────────────────────────────────────────
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

  scale = Math.min(svgW / (maxX - minX), svgH / (maxY - minY), 1.2) * 0.85;
  panX  = (svgW - (maxX - minX) * scale) / 2 - minX * scale;
  panY  = (svgH - (maxY - minY) * scale) / 2 - minY * scale;
  applyTransform();
}

// ─── Animación shake ─────────────────────────────────────────────
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
