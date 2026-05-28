/* ═══════════════════════════════════════════════════════════════
   PERT / CPM  —  app.js
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

// ─── Estado ─────────────────────────────────────────────────────
let activities    = [];
let editingNum    = null;
// Posiciones separadas por tipo de diagrama para preservar el layout al cambiar
let nodePositions = { AON: {}, AOA: {} };
let selectedPreds = [];
let diagramType   = 'AON'; // 'AON' | 'AOA'
let lastCPM       = null;

// ─── DOM refs ───────────────────────────────────────────────────
const activityBody    = document.getElementById('activity-body');
const btnAdd          = document.getElementById('btn-add');
const btnGenerate     = document.getElementById('btn-generate');
const cpmResults      = document.getElementById('cpm-results');
const cpmTableWrap    = document.getElementById('cpm-table-wrapper');
const cpmProcedure    = document.getElementById('cpm-procedure');
const toggleProcedure = document.getElementById('toggle-procedure');
const totalDuration   = document.getElementById('total-duration');
const emptyState      = document.getElementById('empty-state');
const svgEl           = document.getElementById('diagram-svg');
const diagramGroup    = document.getElementById('diagram-group');
const canvasContainer = document.getElementById('canvas-container');
const panel           = document.getElementById('panel');
const resizeHandle    = document.getElementById('panel-resize-handle');
const btnCollapsePanel = document.getElementById('btn-collapse-panel');

// ─── Tema claro / oscuro ─────────────────────────────────────────
const btnTheme       = document.getElementById('btn-theme');
const themeIconDark  = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
let isLight = localStorage.getItem('skpj-theme') === 'light';

function applyTheme() {
  document.body.classList.toggle('light', isLight);
  themeIconDark.style.display  = isLight ? 'none'  : '';
  themeIconLight.style.display = isLight ? ''      : 'none';
  btnTheme.title = isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  localStorage.setItem('skpj-theme', isLight ? 'light' : 'dark');
}

applyTheme(); // aplicar al cargar

btnTheme.addEventListener('click', () => {
  isLight = !isLight;
  applyTheme();
});

// ─── Colapsar / expandir panel lateral (botón hamburguesa) ──────
let panelCollapsed  = false;
let panelWidthSaved = null;

btnCollapsePanel.addEventListener('click', () => {
  panelCollapsed = !panelCollapsed;
  if (panelCollapsed) {
    panelWidthSaved = panel.style.width || null;
    panel.classList.add('collapsed');
    btnCollapsePanel.classList.add('active');
    btnCollapsePanel.title = 'Expandir panel';
  } else {
    panel.classList.remove('collapsed');
    btnCollapsePanel.classList.remove('active');
    if (panelWidthSaved) panel.style.width = panelWidthSaved;
    btnCollapsePanel.title = 'Plegar panel';
  }
});

// ─── Colapsar / expandir sección de actividades (hacia arriba) ───
const activitiesSection     = document.getElementById('activities-section');
const btnCollapseActivities = document.getElementById('btn-collapse-activities');
let activitiesCollapsed = false;

btnCollapseActivities.addEventListener('click', () => {
  activitiesCollapsed = !activitiesCollapsed;
  if (activitiesCollapsed) {
    activitiesSection.classList.add('collapsed');
    btnCollapseActivities.classList.add('expanded');
    btnCollapseActivities.title = 'Expandir actividades';
  } else {
    activitiesSection.classList.remove('collapsed');
    btnCollapseActivities.classList.remove('expanded');
    btnCollapseActivities.title = 'Colapsar actividades';
  }
});

// ─── Menú Archivo ────────────────────────────────────────────────
const fileMenuBtn      = document.getElementById('btn-file-menu');
const fileMenuDropdown = document.getElementById('file-menu-dropdown');

function openFileMenu()  { fileMenuBtn.classList.add('open'); fileMenuDropdown.classList.add('open'); }
function closeFileMenu() { fileMenuBtn.classList.remove('open'); fileMenuDropdown.classList.remove('open'); }

fileMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileMenuDropdown.classList.contains('open') ? closeFileMenu() : openFileMenu();
});

document.addEventListener('click', () => closeFileMenu());
fileMenuDropdown.addEventListener('click', e => e.stopPropagation());

document.getElementById('fm-new').addEventListener('click', () => {
  closeFileMenu();
  clearOverlay.classList.remove('hidden');
});

document.getElementById('fm-import').addEventListener('click', () => {
  closeFileMenu();
  importTextarea.value = '';
  importError.classList.add('hidden');
  importOverlay.classList.remove('hidden');
  importTextarea.focus();
});

document.getElementById('fm-export').addEventListener('click', () => {
  closeFileMenu();
  if (activities.length === 0) return;
  exportTextarea.value = serializeActivities();
  exportOverlay.classList.remove('hidden');
});

document.getElementById('fm-clear').addEventListener('click', () => {
  closeFileMenu();
  clearOverlay.classList.remove('hidden');
});

// ─── Guardar proyecto .skpj ──────────────────────────────────────
document.getElementById('fm-save').addEventListener('click', () => {
  closeFileMenu();
  saveSkpj();
});

function saveSkpj() {
  // Construir el objeto completo del proyecto
  const project = {
    _format:   'SkinnyProject',
    _version:  '1.0',
    _saved:    new Date().toISOString(),
    // Actividades
    activities: activities.map(a => ({ ...a })),
    // Posiciones de nodos en ambos tipos de diagrama
    nodePositions: {
      AON: { ...nodePositions.AON },
      AOA: { ...nodePositions.AOA }
    },
    // Tipo de diagrama activo
    diagramType,
    // Zoom y pan
    view: { scale, panX, panY },
    // Resultados CPM completos (si existen)
    cpm: lastCPM ? serializeCPM(lastCPM) : null
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  // Nombre del archivo: fecha + hora
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `proyecto-cpm-${ts}.skpj`;

  const a = document.createElement('a');
  a.href     = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function serializeCPM(cpm) {
  // Serializa el mapa CPM a un objeto plano (sin referencias circulares)
  const mapPlain = {};
  Object.entries(cpm.map).forEach(([k, v]) => {
    mapPlain[k] = {
      num:          v.num,
      name:         v.name,
      duration:     v.duration,
      predecessors: [...v.predecessors],
      ES:           v.ES,
      EF:           v.EF,
      LS:           v.LS,
      LF:           v.LF,
      slack:        v.slack
    };
  });
  return {
    map:        mapPlain,
    sorted:     [...cpm.sorted],
    projectEnd: cpm.projectEnd
  };
}

// ─── Abrir proyecto .skpj ────────────────────────────────────────
const skpjInput = document.getElementById('skpj-file-input');

document.getElementById('fm-open').addEventListener('click', () => {
  closeFileMenu();
  skpjInput.value = '';   // reset para permitir abrir el mismo archivo dos veces
  skpjInput.click();
});

skpjInput.addEventListener('change', () => {
  const file = skpjInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      loadSkpj(JSON.parse(e.target.result));
    } catch (err) {
      alert('El archivo no es un proyecto .skpj válido.\n\n' + err.message);
    }
  };
  reader.readAsText(file);
});

function loadSkpj(project) {
  if (project._format !== 'SkinnyProject') {
    throw new Error('Formato de archivo no reconocido.');
  }

  // Restaurar actividades
  activities = (project.activities || []).map(a => ({ ...a }));

  // Restaurar posiciones
  nodePositions = {
    AON: { ...(project.nodePositions?.AON || {}) },
    AOA: { ...(project.nodePositions?.AOA || {}) }
  };

  // Restaurar tipo de diagrama
  if (project.diagramType) {
    diagramType = project.diagramType;
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === diagramType);
    });
  }

  // Restaurar zoom/pan
  if (project.view) {
    scale = project.view.scale ?? 1;
    panX  = project.view.panX  ?? 0;
    panY  = project.view.panY  ?? 0;
    applyTransform();
  }

  // Restaurar CPM
  if (project.cpm) {
    lastCPM = project.cpm;
    renderCPMTable(lastCPM);
    renderCPMProcedure(lastCPM);
    renderDiagram(lastCPM);
    emptyState.classList.add('hidden');
  } else {
    lastCPM = null;
    diagramGroup.innerHTML = '';
    emptyState.classList.remove('hidden');
    cpmResults.classList.add('hidden');
  }

  // Renderizar tabla de actividades
  renderTable();
}

// Modal actividad
const modalOverlay  = document.getElementById('modal-overlay');
const modalTitle    = document.getElementById('modal-title');
const modalNumBadge = document.getElementById('modal-num-badge');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalSave     = document.getElementById('modal-save');
const inputName     = document.getElementById('input-name');
const inputDuration = document.getElementById('input-duration');
const predSelected  = document.getElementById('pred-selected');
const predOptions   = document.getElementById('pred-options');

// Modal exportar
const exportOverlay  = document.getElementById('export-overlay');
const exportClose    = document.getElementById('export-close');
const exportClose2   = document.getElementById('export-close2');
const exportCopy     = document.getElementById('export-copy');
const exportTextarea = document.getElementById('export-textarea');

// Modal importar
const importOverlay  = document.getElementById('import-overlay');
const importClose    = document.getElementById('import-close');
const importCancel   = document.getElementById('import-cancel');
const importConfirm  = document.getElementById('import-confirm');
const importTextarea = document.getElementById('import-textarea');
const importError    = document.getElementById('import-error');

// Modal confirmar limpiar
const clearOverlay  = document.getElementById('clear-overlay');
const clearClose    = document.getElementById('clear-close');
const clearCancel   = document.getElementById('clear-cancel');
const clearConfirm  = document.getElementById('clear-confirm');

// Zoom / pan
const btnZoomIn    = document.getElementById('btn-zoom-in');
const btnZoomOut   = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

// Tipo de diagrama
const diagramTypeToggle = document.getElementById('diagram-type-toggle');

// ─── Panel resize ────────────────────────────────────────────────
let isResizing = false;
let resizeStartX = 0;
let resizeStartW = 0;

resizeHandle.addEventListener('mousedown', e => {
  isResizing   = true;
  resizeStartX = e.clientX;
  resizeStartW = panel.offsetWidth;
  document.body.style.cursor    = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const newW = Math.min(Math.max(resizeStartW + (e.clientX - resizeStartX), 220), 600);
  panel.style.width = newW + 'px';
});

window.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  }
});

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
  if (e.target === svgEl || e.target === diagramGroup) {
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

// ─── Tipo de diagrama ────────────────────────────────────────────
diagramTypeToggle.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    diagramTypeToggle.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    diagramType = btn.dataset.type;
    // NO se borran las posiciones — cada tipo tiene su propio objeto
    if (lastCPM) {
      renderDiagram(lastCPM);
      emptyState.classList.add('hidden');
    }
  });
});

// ─── Número siguiente disponible ────────────────────────────────
function getNextNum() {
  const used = new Set(activities.map(a => a.num));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// ─── Selector de predecesores ────────────────────────────────────
function renderPredSelector(excludeNum = null) {
  predSelected.innerHTML = '';
  selectedPreds.forEach(num => {
    const act = activities.find(a => a.num === num);
    if (!act) return;
    const chip = document.createElement('span');
    chip.className = 'pred-chip-selected';
    chip.innerHTML = `
      <span class="chip-num">#${act.num}</span>
      <span class="chip-name">${act.name}</span>
      <button class="pred-chip-remove" data-num="${act.num}" title="Quitar">✕</button>`;
    predSelected.appendChild(chip);
  });
  predSelected.querySelectorAll('.pred-chip-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedPreds = selectedPreds.filter(n => n !== +btn.dataset.num);
      renderPredSelector(excludeNum);
    });
  });

  predOptions.innerHTML = '';
  const available = activities.filter(a => a.num !== excludeNum);
  if (available.length === 0) {
    predOptions.innerHTML = `<div class="pred-empty-msg">No hay otras tareas disponibles</div>`;
    return;
  }
  available.forEach(act => {
    const isSelected = selectedPreds.includes(act.num);
    const row = document.createElement('div');
    row.className = `pred-option-row${isSelected ? ' selected' : ''}`;
    row.innerHTML = `
      <span class="pred-opt-num">${act.num}</span>
      <span class="pred-opt-name">${act.name}</span>
      <span class="pred-opt-check">✓</span>`;
    row.addEventListener('click', () => {
      selectedPreds = selectedPreds.includes(act.num)
        ? selectedPreds.filter(n => n !== act.num)
        : [...selectedPreds, act.num];
      renderPredSelector(excludeNum);
    });
    predOptions.appendChild(row);
  });
}

// ─── Modal actividad ─────────────────────────────────────────────
function openModal(title, num, name = '', duration = '', predNums = []) {
  modalTitle.textContent    = title;
  modalNumBadge.textContent = `#${num}`;
  inputName.value           = name;
  inputDuration.value       = duration;
  selectedPreds             = [...predNums];
  renderPredSelector(num);
  modalOverlay.classList.remove('hidden');
  inputName.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingNum    = null;
  selectedPreds = [];
}

modalClose.addEventListener('click',  closeModal);
modalCancel.addEventListener('click', closeModal);

modalSave.addEventListener('click', () => {
  const name     = inputName.value.trim();
  const duration = parseFloat(inputDuration.value);
  if (!name)                           return shake(inputName);
  if (isNaN(duration) || duration < 0) return shake(inputDuration);

  const predecessors = [...selectedPreds];
  if (editingNum !== null) {
    const act = activities.find(a => a.num === editingNum);
    if (act) { act.name = name; act.duration = duration; act.predecessors = predecessors; }
  } else {
    activities.push({ num: getNextNum(), name, duration, predecessors });
  }
  renderTable();
  closeModal();
});

[inputName, inputDuration].forEach(el =>
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
  openModal('Nueva actividad', getNextNum());
});

function editActivity(num) {
  const act = activities.find(a => a.num === num);
  if (!act) return;
  editingNum = num;
  openModal('Editar actividad', num, act.name, act.duration, act.predecessors);
}

function deleteActivity(num) {
  activities = activities.filter(a => a.num !== num);
  activities.forEach(a => { a.predecessors = a.predecessors.filter(p => p !== num); });
  renderTable();
}

// ─── Render tabla ────────────────────────────────────────────────
function renderTable() {
  // Habilitar/deshabilitar opciones del menú según si hay actividades
  const hasActivities = activities.length > 0;
  const fmExport = document.getElementById('fm-export');
  const fmSave   = document.getElementById('fm-save');
  fmExport.disabled = !hasActivities;
  fmSave.disabled   = !hasActivities;

  activityBody.innerHTML = '';
  if (activities.length === 0) {
    activityBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px 8px">Sin actividades registradas</td></tr>`;
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
        <button class="btn-row-edit"   data-num="${act.num}" title="Editar">✎</button>
        <button class="btn-row-delete" data-num="${act.num}" title="Eliminar">✕</button>
      </td>`;
    activityBody.appendChild(tr);
  });
  activityBody.querySelectorAll('.btn-row-edit').forEach(b =>
    b.addEventListener('click', () => editActivity(+b.dataset.num)));
  activityBody.querySelectorAll('.btn-row-delete').forEach(b =>
    b.addEventListener('click', () => deleteActivity(+b.dataset.num)));
}

// ─── Limpiar todo (con confirmación) ────────────────────────────
clearClose.addEventListener('click',  () => clearOverlay.classList.add('hidden'));
clearCancel.addEventListener('click', () => clearOverlay.classList.add('hidden'));

clearConfirm.addEventListener('click', () => {
  activities    = [];
  nodePositions = { AON: {}, AOA: {} };
  lastCPM       = null;
  renderTable();
  diagramGroup.innerHTML = '';
  emptyState.classList.remove('hidden');
  cpmResults.classList.add('hidden');
  scale = 1; panX = 0; panY = 0;
  applyTransform();
  clearOverlay.classList.add('hidden');
});

// ─── Exportar ────────────────────────────────────────────────────
function serializeActivities() {
  return activities.map(a => {
    const pred = a.predecessors.length ? a.predecessors.join(', ') : '—';
    return `#${a.num} | ${a.name} | ${a.duration} | ${pred}`;
  }).join('\n');
}

exportClose.addEventListener('click',  () => exportOverlay.classList.add('hidden'));
exportClose2.addEventListener('click', () => exportOverlay.classList.add('hidden'));

exportCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(exportTextarea.value).then(() => {
    exportCopy.textContent = '¡Copiado!';
    setTimeout(() => { exportCopy.textContent = 'Copiar al portapapeles'; }, 1800);
  });
});

// ─── Importar ────────────────────────────────────────────────────
importClose.addEventListener('click',  () => importOverlay.classList.add('hidden'));
importCancel.addEventListener('click', () => importOverlay.classList.add('hidden'));

importConfirm.addEventListener('click', () => {
  const lines = importTextarea.value.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return;

  const parsed = [];
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 3) {
      showImportError(`Línea inválida: "${line}"`);
      return;
    }
    const numStr   = parts[0].replace('#', '').trim();
    const num      = parseInt(numStr, 10);
    const name     = parts[1];
    const duration = parseFloat(parts[2]);
    const predRaw  = parts[3] || '—';
    const predecessors = predRaw === '—' || predRaw === ''
      ? []
      : predRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    if (isNaN(num) || !name || isNaN(duration)) {
      showImportError(`Línea inválida: "${line}"`);
      return;
    }
    parsed.push({ num, name, duration, predecessors });
  }

  activities    = parsed;
  nodePositions = { AON: {}, AOA: {} };
  lastCPM       = null;
  renderTable();
  diagramGroup.innerHTML = '';
  emptyState.classList.remove('hidden');
  cpmResults.classList.add('hidden');
  importOverlay.classList.add('hidden');
});

function showImportError(msg) {
  importError.textContent = msg;
  importError.classList.remove('hidden');
}

// ─── CPM ─────────────────────────────────────────────────────────
function computeCPM(acts) {
  const map = {};
  acts.forEach(a => { map[a.num] = { ...a, ES: 0, EF: 0, LS: Infinity, LF: Infinity, slack: 0 }; });

  const sorted = topoSort(acts);
  if (!sorted) return null;

  sorted.forEach(num => {
    const node = map[num];
    node.ES = node.predecessors.length === 0
      ? 0 : Math.max(...node.predecessors.map(p => map[p] ? map[p].EF : 0));
    node.EF = node.ES + node.duration;
  });

  const projectEnd = Math.max(...Object.values(map).map(n => n.EF));

  [...sorted].reverse().forEach(num => {
    const node       = map[num];
    const successors = acts.filter(a => a.predecessors.includes(num));
    node.LF = successors.length === 0
      ? projectEnd : Math.min(...successors.map(s => map[s.num].LS));
    node.LS    = node.LF - node.duration;
    node.slack = node.LF - node.EF;
  });

  return { map, sorted, projectEnd };
}

function topoSort(acts) {
  const inDeg = {}, adj = {};
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

// ─── Generar ─────────────────────────────────────────────────────
btnGenerate.addEventListener('click', () => {
  if (activities.length === 0) return;
  const cpm = computeCPM(activities);
  if (!cpm) {
    alert('Se detectó un ciclo en las dependencias. Por favor revisa los predecesores.');
    return;
  }
  lastCPM = cpm;
  renderCPMTable(cpm);
  renderCPMProcedure(cpm);
  renderDiagram(cpm);
  emptyState.classList.add('hidden');
});

// ─── Tabla CPM ───────────────────────────────────────────────────
function renderCPMTable({ map, projectEnd }) {
  totalDuration.textContent = projectEnd;
  const rows = Object.values(map).map(n => {
    const isCrit   = n.slack === 0;
    const predText = n.predecessors.length ? n.predecessors.join(', ') : '—';
    return `<tr class="${isCrit ? 'critical-row' : ''}">
      <td><span class="badge-num sm">${n.num}</span></td>
      <td class="cell-name-sm">${n.name}</td>
      <td>${n.duration}</td><td>${predText}</td>
      <td>${n.ES}</td><td>${n.EF}</td>
      <td>${n.LS}</td><td>${n.LF}</td>
      <td>${n.slack}</td>
    </tr>`;
  }).join('');
  cpmTableWrap.innerHTML = `
    <table><thead><tr>
      <th>#</th><th>Nombre</th><th>Dur.</th><th>Pred.</th>
      <th>IC</th><th>TC</th><th>IT</th><th>TT</th><th>Holgura</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  cpmResults.classList.remove('hidden');
}

// ─── Toggle procedimiento ────────────────────────────────────────
toggleProcedure.addEventListener('change', () => {
  if (toggleProcedure.checked) {
    cpmProcedure.classList.remove('hidden');
  } else {
    cpmProcedure.classList.add('hidden');
  }
});

// ─── Procedimiento matemático CPM ───────────────────────────────
function renderCPMProcedure({ map, sorted, projectEnd }) {
  const nodes = Object.values(map);

  // ── Paso 1: Pase hacia adelante (IC / TC) ──
  let forwardSteps = '';
  sorted.forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    const badgeCls = isCrit ? 'critical' : '';
    const stepCls  = isCrit ? 'is-critical' : '';
    let formula = '';
    if (n.predecessors.length === 0) {
      formula = `<span class="val-es">IC</span> <span class="op">=</span> <span class="val-dur">0</span> <span class="op">(sin predecesores → inicio del proyecto)</span><br>
                 <span class="val-ef">TC</span> <span class="op">=</span> <span class="val-es">IC</span> <span class="op">+</span> <span class="val-dur">Dur</span> <span class="op">=</span> <span class="val-es">${n.ES}</span> <span class="op">+</span> <span class="val-dur">${n.duration}</span> <span class="op">=</span> <span class="val-ef">${n.EF}</span>`;
    } else {
      const predList = n.predecessors.map(p => {
        const pn = map[p];
        return `TC(${p})=<span class="val-ef">${pn ? pn.EF : '?'}</span>`;
      }).join(', ');
      const maxExpr = n.predecessors.length > 1
        ? `máx(${predList}) = <span class="val-es">${n.ES}</span>`
        : `${predList} = <span class="val-es">${n.ES}</span>`;
      formula = `<span class="val-es">IC</span> <span class="op">=</span> ${maxExpr}<br>
                 <span class="val-ef">TC</span> <span class="op">=</span> <span class="val-es">IC</span> <span class="op">+</span> <span class="val-dur">Dur</span> <span class="op">=</span> <span class="val-es">${n.ES}</span> <span class="op">+</span> <span class="val-dur">${n.duration}</span> <span class="op">=</span> <span class="val-ef">${n.EF}</span>`;
    }
    forwardSteps += `
      <div class="proc-step ${stepCls}">
        <div class="proc-step-header">
          <span class="proc-act-badge ${badgeCls}">${n.num}</span>
          <span class="proc-act-name">${n.name}</span>
        </div>
        <div class="proc-formula">${formula}</div>
      </div>`;
  });

  // ── Paso 2: Pase hacia atrás (IT / TT) ──
  let backwardSteps = '';
  [...sorted].reverse().forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    const badgeCls = isCrit ? 'critical' : '';
    const stepCls  = isCrit ? 'is-critical' : '';
    const successors = Object.values(map).filter(s => s.predecessors.includes(num));
    let formula = '';
    if (successors.length === 0) {
      formula = `<span class="val-lf">TT</span> <span class="op">=</span> <span class="val-dur">${projectEnd}</span> <span class="op">(fin del proyecto)</span><br>
                 <span class="val-ls">IT</span> <span class="op">=</span> <span class="val-lf">TT</span> <span class="op">−</span> <span class="val-dur">Dur</span> <span class="op">=</span> <span class="val-lf">${n.LF}</span> <span class="op">−</span> <span class="val-dur">${n.duration}</span> <span class="op">=</span> <span class="val-ls">${n.LS}</span>`;
    } else {
      const sucList = successors.map(s => `IT(${s.num})=<span class="val-ls">${s.LS}</span>`).join(', ');
      const minExpr = successors.length > 1
        ? `mín(${sucList}) = <span class="val-lf">${n.LF}</span>`
        : `${sucList} = <span class="val-lf">${n.LF}</span>`;
      formula = `<span class="val-lf">TT</span> <span class="op">=</span> ${minExpr}<br>
                 <span class="val-ls">IT</span> <span class="op">=</span> <span class="val-lf">TT</span> <span class="op">−</span> <span class="val-dur">Dur</span> <span class="op">=</span> <span class="val-lf">${n.LF}</span> <span class="op">−</span> <span class="val-dur">${n.duration}</span> <span class="op">=</span> <span class="val-ls">${n.LS}</span>`;
    }
    backwardSteps += `
      <div class="proc-step ${stepCls}">
        <div class="proc-step-header">
          <span class="proc-act-badge ${badgeCls}">${n.num}</span>
          <span class="proc-act-name">${n.name}</span>
        </div>
        <div class="proc-formula">${formula}</div>
      </div>`;
  });

  // ── Paso 3: Holguras ──
  let slackSteps = '';
  sorted.forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    const badgeCls = isCrit ? 'critical' : '';
    const stepCls  = isCrit ? 'is-critical' : '';
    const slackColor = isCrit ? 'val-crit' : 'val-sl';
    slackSteps += `
      <div class="proc-step ${stepCls}">
        <div class="proc-step-header">
          <span class="proc-act-badge ${badgeCls}">${n.num}</span>
          <span class="proc-act-name">${n.name}</span>
        </div>
        <div class="proc-formula">
          <span class="val-sl">Holgura</span> <span class="op">=</span> <span class="val-lf">TT</span> <span class="op">−</span> <span class="val-ef">TC</span>
          <span class="op">=</span> <span class="val-lf">${n.LF}</span> <span class="op">−</span> <span class="val-ef">${n.EF}</span>
          <span class="op">=</span> <span class="${slackColor}">${n.slack}</span>
          ${isCrit ? '<span class="op"> → ★ Ruta crítica</span>' : ''}
        </div>
      </div>`;
  });

  // ── Paso 4: Ruta crítica ──
  const critNodes = sorted.filter(num => map[num].slack === 0);
  const critPath = critNodes.map(num =>
    `<span class="crit-act">#${num} ${map[num].name}</span>`
  ).join(' <span class="crit-path-arrow">→</span> ');

  const legend = `
    <div class="proc-legend">
      <div class="proc-legend-item"><div class="proc-legend-dot" style="background:#60a5fa"></div> IC = Inicio más temprano</div>
      <div class="proc-legend-item"><div class="proc-legend-dot" style="background:#34d399"></div> TC = Término más temprano</div>
      <div class="proc-legend-item"><div class="proc-legend-dot" style="background:#f472b6"></div> IT = Inicio más tardío</div>
      <div class="proc-legend-item"><div class="proc-legend-dot" style="background:#fb923c"></div> TT = Término más tardío</div>
      <div class="proc-legend-item"><div class="proc-legend-dot" style="background:var(--success)"></div> Holgura = TT − TC</div>
    </div>`;

  cpmProcedure.innerHTML = `
    <div class="proc-section">
      <div class="proc-section-title forward"><span class="proc-icon">→</span> Paso 1 — Pase hacia adelante (IC y TC)</div>
      <div class="proc-steps">${forwardSteps}</div>
      ${legend}
    </div>
    <div class="proc-section">
      <div class="proc-section-title backward"><span class="proc-icon">←</span> Paso 2 — Pase hacia atrás (IT y TT)</div>
      <div class="proc-steps">${backwardSteps}</div>
    </div>
    <div class="proc-section">
      <div class="proc-section-title slack"><span class="proc-icon">⊘</span> Paso 3 — Cálculo de holguras</div>
      <div class="proc-steps">${slackSteps}</div>
    </div>
    <div class="proc-section">
      <div class="proc-section-title critical"><span class="proc-icon">★</span> Paso 4 — Ruta crítica (Holgura = 0)</div>
      <div class="proc-critical-list">
        ${critPath}<br>
        <span style="font-size:.72rem;margin-top:6px;display:inline-block">
          Duración total del proyecto: <strong style="color:var(--critical)">${projectEnd}</strong>
        </span>
      </div>
    </div>`;
}

// ─── Copiar tabla CPM ────────────────────────────────────────────
document.getElementById('btn-copy-cpm').addEventListener('click', () => {
  if (!lastCPM) return;
  const { map, projectEnd, sorted } = lastCPM;
  const showProc = toggleProcedure.checked;

  // ── HTML para Word / Google Docs (se pega como tabla) ──
  const headerHtml = ['#', 'Nombre', 'Duración', 'Predecesores', 'IC', 'TC', 'IT', 'TT', 'Holgura']
    .map(h => `<th style="background:#1a1d27;color:#e2e8f0;padding:6px 10px;border:1px solid #2e3350;font-size:12px">${h}</th>`)
    .join('');

  const rowsHtml = Object.values(map).map(n => {
    const pred   = n.predecessors.length ? n.predecessors.join(', ') : '—';
    const isCrit = n.slack === 0;
    const bg     = isCrit ? '#ff9f4318' : '#22263a';
    const color  = isCrit ? '#ff9f43'   : '#e2e8f0';
    const cells  = [n.num, n.name, n.duration, pred, n.ES, n.EF, n.LS, n.LF, n.slack]
      .map(v => `<td style="padding:5px 10px;border:1px solid #2e3350;color:${color};font-size:12px">${v}</td>`)
      .join('');
    return `<tr style="background:${bg}">${cells}</tr>`;
  }).join('');

  let tableHtml = `
    <meta charset="utf-8">
    <table style="border-collapse:collapse;font-family:Segoe UI,sans-serif">
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="font-size:12px;color:#7a82a6;margin-top:8px">
      Duración total del proyecto: <strong>${projectEnd}</strong>
      &nbsp;|&nbsp; ★ = Ruta crítica
    </p>`;

  // ── Texto plano con tabs (fallback) ──
  const headerTxt = ['#', 'Nombre', 'Duración', 'Predecesores', 'IC', 'TC', 'IT', 'TT', 'Holgura'].join('\t');
  const rowsTxt   = Object.values(map).map(n => {
    const pred = n.predecessors.length ? n.predecessors.join(', ') : '—';
    const mark = n.slack === 0 ? ' ★' : '';
    return [n.num + mark, n.name, n.duration, pred, n.ES, n.EF, n.LS, n.LF, n.slack].join('\t');
  }).join('\n');
  let plainText = `${headerTxt}\n${rowsTxt}\n\nDuración total: ${projectEnd}`;

  // ── Si el procedimiento está activo, agregarlo ──
  if (showProc) {
    const procLines = [];
    procLines.push('\n\n══════════════════════════════════════');
    procLines.push('PROCEDIMIENTO MATEMÁTICO CPM');
    procLines.push('══════════════════════════════════════');

    // Paso 1: Pase hacia adelante
    procLines.push('\n── PASO 1: Pase hacia adelante (IC y TC) ──');
    procLines.push('Fórmulas: IC = máx(TC de predecesores)  |  TC = IC + Duración');
    sorted.forEach(num => {
      const n = map[num];
      const mark = n.slack === 0 ? ' ★' : '';
      if (n.predecessors.length === 0) {
        procLines.push(`  #${n.num} ${n.name}${mark}: IC = 0 (inicio)  →  TC = 0 + ${n.duration} = ${n.EF}`);
      } else {
        const predVals = n.predecessors.map(p => `TC(${p})=${map[p] ? map[p].EF : '?'}`).join(', ');
        const maxFn = n.predecessors.length > 1 ? `máx(${predVals})` : predVals;
        procLines.push(`  #${n.num} ${n.name}${mark}: IC = ${maxFn} = ${n.ES}  →  TC = ${n.ES} + ${n.duration} = ${n.EF}`);
      }
    });

    // Paso 2: Pase hacia atrás
    procLines.push('\n── PASO 2: Pase hacia atrás (IT y TT) ──');
    procLines.push('Fórmulas: TT = mín(IT de sucesores)  |  IT = TT − Duración');
    [...sorted].reverse().forEach(num => {
      const n = map[num];
      const mark = n.slack === 0 ? ' ★' : '';
      const successors = Object.values(map).filter(s => s.predecessors.includes(num));
      if (successors.length === 0) {
        procLines.push(`  #${n.num} ${n.name}${mark}: TT = ${projectEnd} (fin)  →  IT = ${n.LF} − ${n.duration} = ${n.LS}`);
      } else {
        const sucVals = successors.map(s => `IT(${s.num})=${s.LS}`).join(', ');
        const minFn = successors.length > 1 ? `mín(${sucVals})` : sucVals;
        procLines.push(`  #${n.num} ${n.name}${mark}: TT = ${minFn} = ${n.LF}  →  IT = ${n.LF} − ${n.duration} = ${n.LS}`);
      }
    });

    // Paso 3: Holguras
    procLines.push('\n── PASO 3: Cálculo de holguras ──');
    procLines.push('Fórmula: Holgura = TT − TC');
    sorted.forEach(num => {
      const n = map[num];
      const mark = n.slack === 0 ? ' ★ CRÍTICA' : '';
      procLines.push(`  #${n.num} ${n.name}: Holgura = ${n.LF} − ${n.EF} = ${n.slack}${mark}`);
    });

    // Paso 4: Ruta crítica
    const critNodes = sorted.filter(num => map[num].slack === 0);
    const critPath = critNodes.map(num => `#${num} ${map[num].name}`).join(' → ');
    procLines.push('\n── PASO 4: Ruta crítica (Holgura = 0) ──');
    procLines.push(`  ${critPath}`);
    procLines.push(`  Duración total: ${projectEnd}`);

    plainText += procLines.join('\n');

    // HTML del procedimiento
    const procHtml = buildProcedureHtml(map, sorted, projectEnd);
    tableHtml += procHtml;
  }

  const btn = document.getElementById('btn-copy-cpm');

  if (window.ClipboardItem) {
    const htmlBlob  = new Blob([tableHtml], { type: 'text/html' });
    const plainBlob = new Blob([plainText], { type: 'text/plain' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': plainBlob })])
      .then(() => {
        btn.innerHTML = '<span class="io-icon">✓</span> ¡Copiado!';
        setTimeout(() => { btn.innerHTML = '<span class="io-icon">⎘</span> Copiar'; }, 2000);
      })
      .catch(() => {
        navigator.clipboard.writeText(plainText).then(() => {
          btn.innerHTML = '<span class="io-icon">✓</span> ¡Copiado!';
          setTimeout(() => { btn.innerHTML = '<span class="io-icon">⎘</span> Copiar'; }, 2000);
        });
      });
  } else {
    navigator.clipboard.writeText(plainText).then(() => {
      btn.innerHTML = '<span class="io-icon">✓</span> ¡Copiado!';
      setTimeout(() => { btn.innerHTML = '<span class="io-icon">⎘</span> Copiar'; }, 2000);
    });
  }
});

// ─── HTML del procedimiento para copiar ─────────────────────────
function buildProcedureHtml(map, sorted, projectEnd) {
  const s = (color, text) => `<span style="color:${color};font-weight:700">${text}</span>`;
  const muted = '#7a82a6';
  const base  = 'font-family:Consolas,monospace;font-size:11px;line-height:1.8;';

  const sectionStyle = 'border-collapse:collapse;width:100%;margin-top:16px;font-family:Segoe UI,sans-serif;';
  const titleStyle   = (color) => `background:#1a1d27;color:${color};padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;border-left:3px solid ${color};border-bottom:1px solid #2e3350;`;
  const stepStyle    = (crit) => `padding:8px 12px;border-bottom:1px solid #2e3350;background:${crit ? '#ff9f4308' : '#0f1117'};`;
  const formulaStyle = `${base}background:#1a1d27;padding:5px 10px;border-radius:4px;border-left:2px solid #2e3350;display:block;margin-top:4px;`;

  let html = `<br><table style="${sectionStyle}">`;

  // Paso 1
  html += `<tr><td style="${titleStyle('#60a5fa')}">→ Paso 1 — Pase hacia adelante (IC y TC)</td></tr>`;
  sorted.forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    let formula = '';
    if (n.predecessors.length === 0) {
      formula = `${s('#60a5fa','IC')} = ${s('#e2e8f0','0')} (sin predecesores)  →  ${s('#34d399','TC')} = ${s('#60a5fa',n.ES)} + ${s('#e2e8f0',n.duration)} = ${s('#34d399',n.EF)}`;
    } else {
      const predVals = n.predecessors.map(p => `TC(${p})=${s('#34d399', map[p] ? map[p].EF : '?')}`).join(', ');
      const maxFn = n.predecessors.length > 1 ? `máx(${predVals})` : predVals;
      formula = `${s('#60a5fa','IC')} = ${maxFn} = ${s('#60a5fa',n.ES)}  →  ${s('#34d399','TC')} = ${s('#60a5fa',n.ES)} + ${s('#e2e8f0',n.duration)} = ${s('#34d399',n.EF)}`;
    }
    html += `<tr><td style="${stepStyle(isCrit)}">
      <span style="color:${isCrit ? '#ff9f43' : '#6c63ff'};font-weight:800;font-size:11px">#${n.num}</span>
      <span style="color:#e2e8f0;font-weight:600;font-size:12px;margin-left:6px">${n.name}</span>
      <span style="${formulaStyle}">${formula}</span>
    </td></tr>`;
  });

  // Paso 2
  html += `<tr><td style="${titleStyle('#f472b6')}">← Paso 2 — Pase hacia atrás (IT y TT)</td></tr>`;
  [...sorted].reverse().forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    const successors = Object.values(map).filter(s => s.predecessors.includes(num));
    let formula = '';
    if (successors.length === 0) {
      formula = `${s('#fb923c','TT')} = ${s('#e2e8f0',projectEnd)} (fin del proyecto)  →  ${s('#f472b6','IT')} = ${s('#fb923c',n.LF)} − ${s('#e2e8f0',n.duration)} = ${s('#f472b6',n.LS)}`;
    } else {
      const sucVals = successors.map(sv => `IT(${sv.num})=${s('#f472b6', sv.LS)}`).join(', ');
      const minFn = successors.length > 1 ? `mín(${sucVals})` : sucVals;
      formula = `${s('#fb923c','TT')} = ${minFn} = ${s('#fb923c',n.LF)}  →  ${s('#f472b6','IT')} = ${s('#fb923c',n.LF)} − ${s('#e2e8f0',n.duration)} = ${s('#f472b6',n.LS)}`;
    }
    html += `<tr><td style="${stepStyle(isCrit)}">
      <span style="color:${isCrit ? '#ff9f43' : '#6c63ff'};font-weight:800;font-size:11px">#${n.num}</span>
      <span style="color:#e2e8f0;font-weight:600;font-size:12px;margin-left:6px">${n.name}</span>
      <span style="${formulaStyle}">${formula}</span>
    </td></tr>`;
  });

  // Paso 3
  html += `<tr><td style="${titleStyle('#22d3a5')}">⊘ Paso 3 — Cálculo de holguras</td></tr>`;
  sorted.forEach(num => {
    const n = map[num];
    const isCrit = n.slack === 0;
    const slackColor = isCrit ? '#ff9f43' : '#22d3a5';
    const critLabel  = isCrit ? `  ${s('#ff9f43','★ Ruta crítica')}` : '';
    const formula = `${s('#22d3a5','Holgura')} = ${s('#fb923c','TT')} − ${s('#34d399','TC')} = ${s('#fb923c',n.LF)} − ${s('#34d399',n.EF)} = ${s(slackColor,n.slack)}${critLabel}`;
    html += `<tr><td style="${stepStyle(isCrit)}">
      <span style="color:${isCrit ? '#ff9f43' : '#6c63ff'};font-weight:800;font-size:11px">#${n.num}</span>
      <span style="color:#e2e8f0;font-weight:600;font-size:12px;margin-left:6px">${n.name}</span>
      <span style="${formulaStyle}">${formula}</span>
    </td></tr>`;
  });

  // Paso 4
  const critNodes = sorted.filter(num => map[num].slack === 0);
  const critPath  = critNodes.map(num =>
    `<span style="background:#ff9f4318;border:1px solid #ff9f4344;color:#ff9f43;font-weight:700;padding:1px 7px;border-radius:4px;font-size:11px">#${num} ${map[num].name}</span>`
  ).join(' <span style="color:#ff9f43;font-weight:700">→</span> ');
  html += `<tr><td style="${titleStyle('#ff9f43')}">★ Paso 4 — Ruta crítica (Holgura = 0)</td></tr>`;
  html += `<tr><td style="padding:10px 12px;background:#0f1117;font-size:12px">
    ${critPath}
    <br><span style="color:#7a82a6;font-size:11px;margin-top:6px;display:inline-block">
      Duración total: <strong style="color:#ff9f43">${projectEnd}</strong>
    </span>
  </td></tr>`;

  html += '</table>';
  return html;
}

// ═══════════════════════════════════════════════════════════════
//  DIAGRAMA AON  (Activity on Node)
// ═══════════════════════════════════════════════════════════════
const NODE_W = 130, NODE_H = 80, H_GAP = 90, V_GAP = 60;

function computeLayout(sorted, map) {
  const level = {};
  sorted.forEach(num => {
    const preds = map[num].predecessors;
    level[num] = preds.length === 0 ? 0 : Math.max(...preds.map(p => (level[p] ?? 0) + 1));
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
    nums.forEach((num, row) => { positions[num] = { x, y: row * (NODE_H + V_GAP) + 60 }; });
  });
  return positions;
}

function renderDiagram(cpm) {
  if (diagramType === 'AOA') { renderDiagramAOA(cpm); return; }
  renderDiagramAON(cpm);
}

function renderDiagramAON({ map, sorted }) {
  diagramGroup.innerHTML = '';
  const pos = nodePositions.AON;
  const layout = computeLayout(sorted, map);
  sorted.forEach(num => { if (!pos[num]) pos[num] = layout[num]; });
  Object.keys(pos).forEach(k => { if (!map[+k]) delete pos[+k]; });

  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeGroup.id = 'edge-group';
  diagramGroup.appendChild(edgeGroup);

  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.id = 'node-group';
  diagramGroup.appendChild(nodeGroup);

  const criticalEdges = new Set();
  sorted.forEach(num => {
    if (map[num].slack === 0) {
      map[num].predecessors.forEach(p => {
        if (map[p] && map[p].slack === 0) criticalEdges.add(`${p}->${num}`);
      });
    }
  });

  activities.forEach(act => {
    act.predecessors.forEach(pred => {
      if (!map[pred]) return;
      drawEdgeAON(edgeGroup, pred, act.num, criticalEdges.has(`${pred}->${act.num}`));
    });
  });

  sorted.forEach(num => drawNodeAON(nodeGroup, map[num]));
  fitView(sorted, NODE_W, NODE_H);
}

function drawEdgeAON(group, fromNum, toNum, isCritical) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.id = `edge-${fromNum}-${toNum}`;
  path.classList.add('edge-line');
  if (isCritical) path.classList.add('critical');
  group.appendChild(path);
  updateEdgeAON(path, fromNum, toNum);
}

function updateEdgeAON(path, fromNum, toNum) {
  const fp = nodePositions.AON[fromNum], tp = nodePositions.AON[toNum];
  if (!fp || !tp) return;
  const x1 = fp.x + NODE_W, y1 = fp.y + NODE_H / 2;
  const x2 = tp.x,          y2 = tp.y + NODE_H / 2;
  const cx = x1 + (x2 - x1) * 0.5;
  path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
}

function drawNodeAON(group, node) {
  const { num, name } = node;
  const pos    = nodePositions.AON[num];
  const isCrit = node.slack === 0;
  const stroke = isCrit ? 'var(--critical)' : 'var(--border)';

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('node-group');
  g.id = `node-${num}`;

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H);
  rect.setAttribute('rx', 10); rect.setAttribute('ry', 10);
  rect.classList.add('node-box');
  if (isCrit) rect.classList.add('critical');
  g.appendChild(rect);

  appendLine(g, 0, NODE_H/2, NODE_W, NODE_H/2, stroke);
  appendLine(g, 32, 0, 32, NODE_H/2, stroke);
  appendLine(g, NODE_W/2, NODE_H/2, NODE_W/2, NODE_H, stroke);

  const lblNum = makeSVGText(`${num}`, 16, NODE_H/4, 'node-num');
  if (isCrit) lblNum.style.fill = 'var(--critical)';
  g.appendChild(lblNum);
  g.appendChild(makeSVGText(truncate(name, 10), 32+(NODE_W-32)/2, NODE_H/4,      'node-label'));
  g.appendChild(makeSVGText(`${node.duration}`, NODE_W/2,         NODE_H/2,       'node-duration-badge'));
  g.appendChild(makeSVGText(`IC:${node.ES}`,    NODE_W*1/4,       NODE_H*3/4-9,   'node-es'));
  g.appendChild(makeSVGText(`TC:${node.EF}`,    NODE_W*3/4,       NODE_H*3/4-9,   'node-ef'));
  g.appendChild(makeSVGText(`IT:${node.LS}`,    NODE_W*1/4,       NODE_H*3/4+9,   'node-ls'));
  g.appendChild(makeSVGText(`TT:${node.LF}`,    NODE_W*3/4,       NODE_H*3/4+9,   'node-lf'));

  g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
  group.appendChild(g);
  makeDraggableAON(g, num);
}

function makeDraggableAON(el, num) {
  let dragging = false, startMouse = {x:0,y:0}, startPos = {x:0,y:0};
  el.addEventListener('mousedown', e => {
    if (isPanning) return;
    e.stopPropagation();
    dragging = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startPos   = { ...nodePositions.AON[num] };
    el.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    nodePositions.AON[num] = { x: startPos.x + (e.clientX-startMouse.x)/scale, y: startPos.y + (e.clientY-startMouse.y)/scale };
    el.setAttribute('transform', `translate(${nodePositions.AON[num].x},${nodePositions.AON[num].y})`);
    activities.forEach(act => {
      act.predecessors.forEach(pred => {
        if (pred === num || act.num === num) {
          const p = document.getElementById(`edge-${pred}-${act.num}`);
          if (p) updateEdgeAON(p, pred, act.num);
        }
      });
    });
  });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; el.style.cursor = 'grab'; } });
}

// ═══════════════════════════════════════════════════════════════
//  DIAGRAMA AOA  (Activity on Arrow)
// ═══════════════════════════════════════════════════════════════
const AOA_R   = 28;   // radio del nodo evento
const AOA_HG  = 160;  // gap horizontal entre eventos
const AOA_VG  = 90;   // gap vertical

// Construye el grafo de eventos (nodos) y flechas (actividades)
function buildAOAGraph(acts, map) {
  // Cada actividad va de un nodo-inicio a un nodo-fin
  // Usamos un nodo por "estado": inicio del proyecto = nodo 0
  // Cada actividad crea un nodo de llegada único
  // Nodos compartidos cuando varias actividades convergen

  // Estrategia simple: nodo por actividad (from=pred_merge, to=act_num)
  // Nodo "inicio" = 0, nodo por actividad = act.num
  const nodes = {}; // id → { x, y, label, isCrit }
  const arrows = []; // { from, to, label, duration, isCrit }

  // Nodo inicio global
  nodes[0] = { label: '0', isCrit: false };

  acts.forEach(a => {
    nodes[a.num] = { label: `${a.num}`, isCrit: map[a.num].slack === 0 };
  });

  acts.forEach(a => {
    const fromNode = a.predecessors.length === 0 ? 0 : a.predecessors[a.predecessors.length - 1];
    arrows.push({
      from:     fromNode,
      to:       a.num,
      label:    a.name,
      duration: a.duration,
      isCrit:   map[a.num].slack === 0 && (fromNode === 0 || (map[fromNode] && map[fromNode].slack === 0))
    });
    // Si tiene múltiples predecesores, agregar flechas dummy desde los demás
    if (a.predecessors.length > 1) {
      a.predecessors.slice(0, -1).forEach(p => {
        arrows.push({ from: p, to: a.num, label: '', duration: 0, isCrit: false, dummy: true });
      });
    }
  });

  return { nodes, arrows };
}

function layoutAOA(nodes, arrows, sorted) {
  // Nivel = nivel topológico del nodo
  const level = { 0: 0 };
  sorted.forEach(num => { level[num] = (level[num] ?? 0); });
  // Propagar niveles por flechas
  let changed = true;
  while (changed) {
    changed = false;
    arrows.forEach(a => {
      const newL = (level[a.from] ?? 0) + 1;
      if ((level[a.to] ?? 0) < newL) { level[a.to] = newL; changed = true; }
    });
  }

  const cols = {};
  Object.keys(nodes).forEach(id => {
    const l = level[id] ?? 0;
    if (!cols[l]) cols[l] = [];
    cols[l].push(+id);
  });

  const positions = {};
  Object.entries(cols).forEach(([col, ids]) => {
    const x = +col * AOA_HG + 60;
    ids.forEach((id, row) => { positions[id] = { x, y: row * AOA_VG + 60 }; });
  });
  return positions;
}

function renderDiagramAOA({ map, sorted }) {
  diagramGroup.innerHTML = '';
  const { nodes, arrows } = buildAOAGraph(activities, map);
  const aoaPositions = layoutAOA(nodes, arrows, sorted);
  const pos = nodePositions.AOA;

  // Merge con posiciones guardadas
  Object.keys(nodes).forEach(id => {
    const key = `aoa_${id}`;
    if (!pos[key]) pos[key] = aoaPositions[+id] || { x: 60, y: 60 };
  });

  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeGroup.id = 'edge-group';
  diagramGroup.appendChild(edgeGroup);

  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.id = 'node-group';
  diagramGroup.appendChild(nodeGroup);

  // Dibujar flechas
  arrows.forEach((arr, i) => {
    drawArrowAOA(edgeGroup, arr, i);
  });

  // Dibujar nodos evento
  Object.entries(nodes).forEach(([id, node]) => {
    drawNodeAOA(nodeGroup, +id, node, arrows);
  });

  fitView(Object.keys(nodes).map(id => `aoa_${id}`), AOA_R*2, AOA_R*2, true);
}

function drawArrowAOA(group, arr, idx) {
  const fromKey = `aoa_${arr.from}`;
  const toKey   = `aoa_${arr.to}`;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = `aoa-arrow-${idx}`;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('edge-line');
  if (arr.isCrit)  path.classList.add('critical');
  if (arr.dummy)   path.classList.add('edge-dummy');
  g.appendChild(path);

  // Etiqueta de actividad
  if (arr.label) {
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.classList.add('aoa-edge-label');
    lbl.id = `aoa-lbl-${idx}`;
    g.appendChild(lbl);

    const dur = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dur.classList.add('aoa-edge-dur');
    if (arr.isCrit) dur.classList.add('critical-text');
    dur.id = `aoa-dur-${idx}`;
    g.appendChild(dur);
  }

  group.appendChild(g);
  updateArrowAOA(g, arr, idx);
}

function updateArrowAOA(g, arr, idx) {
  const fp = nodePositions.AOA[`aoa_${arr.from}`];
  const tp = nodePositions.AOA[`aoa_${arr.to}`];
  if (!fp || !tp) return;

  const dx = tp.x - fp.x, dy = tp.y - fp.y;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/dist, uy = dy/dist;

  const x1 = fp.x + ux * AOA_R;
  const y1 = fp.y + uy * AOA_R;
  const x2 = tp.x - ux * AOA_R;
  const y2 = tp.y - uy * AOA_R;

  const path = g.querySelector('.edge-line');
  if (arr.dummy) {
    path.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
  } else {
    const cx = (x1+x2)/2 - uy*20, cy = (y1+y2)/2 + ux*20;
    path.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
  }

  const lbl = g.querySelector('.aoa-edge-label');
  const dur = g.querySelector('.aoa-edge-dur');
  if (lbl) {
    const mx = (x1+x2)/2 - uy*28, my = (y1+y2)/2 + ux*28;
    lbl.setAttribute('x', mx); lbl.setAttribute('y', my - 7);
    lbl.textContent = arr.label;
    dur.setAttribute('x', mx); dur.setAttribute('y', my + 8);
    dur.textContent = `(${arr.duration})`;
  }
}

function drawNodeAOA(group, id, node, arrows) {
  const key = `aoa_${id}`;
  const pos = nodePositions.AOA[key];

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('node-group', 'aoa-node-group');
  g.id = `aoa-node-${id}`;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', AOA_R); circle.setAttribute('cy', AOA_R);
  circle.setAttribute('r', AOA_R);
  circle.classList.add('aoa-circle');
  if (node.isCrit) circle.classList.add('critical');
  g.appendChild(circle);

  const lbl = makeSVGText(node.label, AOA_R, AOA_R, 'aoa-node-label');
  if (node.isCrit) lbl.style.fill = 'var(--critical)';
  g.appendChild(lbl);

  g.setAttribute('transform', `translate(${pos.x - AOA_R},${pos.y - AOA_R})`);
  group.appendChild(g);

  // Drag AOA
  let dragging = false, startMouse = {x:0,y:0}, startPos = {x:0,y:0};
  g.addEventListener('mousedown', e => {
    if (isPanning) return;
    e.stopPropagation();
    dragging = true;
    startMouse = { x: e.clientX, y: e.clientY };
    startPos   = { ...nodePositions.AOA[key] };
    g.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    nodePositions.AOA[key] = {
      x: startPos.x + (e.clientX - startMouse.x) / scale,
      y: startPos.y + (e.clientY - startMouse.y) / scale
    };
    g.setAttribute('transform', `translate(${nodePositions.AOA[key].x - AOA_R},${nodePositions.AOA[key].y - AOA_R})`);
    // Actualizar flechas conectadas
    arrows.forEach((arr, idx) => {
      if (arr.from === id || arr.to === id) {
        const ag = document.getElementById(`aoa-arrow-${idx}`);
        if (ag) updateArrowAOA(ag, arr, idx);
      }
    });
  });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; g.style.cursor = 'grab'; } });
}

// ═══════════════════════════════════════════════════════════════
//  Utilidades compartidas
// ═══════════════════════════════════════════════════════════════
function fitView(keys, nw, nh, isAOA = false) {
  if (!keys.length) return;
  const posMap = isAOA ? nodePositions.AOA : nodePositions.AON;
  const xs = keys.map(k => posMap[k]?.x ?? 60);
  const ys = keys.map(k => posMap[k]?.y ?? 60);
  const minX = Math.min(...xs) - (isAOA ? AOA_R : 0) - 20;
  const minY = Math.min(...ys) - (isAOA ? AOA_R : 0) - 20;
  const maxX = Math.max(...xs) + (nw || NODE_W) + 20;
  const maxY = Math.max(...ys) + (nh || NODE_H) + 20;
  const svgW = canvasContainer.clientWidth;
  const svgH = canvasContainer.clientHeight;
  scale = Math.min(svgW / (maxX - minX), svgH / (maxY - minY), 1.2) * 0.85;
  panX  = (svgW - (maxX - minX) * scale) / 2 - minX * scale;
  panY  = (svgH - (maxY - minY) * scale) / 2 - minY * scale;
  applyTransform();
}

function appendLine(parent, x1, y1, x2, y2, stroke) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', '1');
  parent.appendChild(l);
}

function makeSVGText(content, x, y, cls) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.classList.add(cls);
  t.textContent = content;
  return t;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ─── Shake ───────────────────────────────────────────────────────
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

}); // fin DOMContentLoaded
