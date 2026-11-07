'use strict';
/* Дорожные карты — интерфейс. Данные живут в roadmaps/*.json (через Python API). */

// ---------------------------------------------------------------- иконки
const ICONS = {
  // Все значки нарисованы для этого проекта (сетка 24×24, линии).
  search: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  minus: '<path d="M6 12h12"/>',
  folder: '<path d="M3 6.5h6l2 2h10V19H3z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M5 8h2M5 11h2"/>',
  export: '<path d="M12 3.5V15M8 7.5l4-4 4 4M4 14v6h16v-6"/>',
  hand: '<path d="M8 13V8a1.5 1.5 0 0 1 3 0v4M11 11.5V6a1.5 1.5 0 0 1 3 0v5.5M14 11.5V7.5a1.5 1.5 0 0 1 3 0V15c0 3.3-2.7 6-6 6h-.5c-1.9 0-3.4-.8-4.6-2.3L4 16a1.4 1.4 0 0 1 2.1-1.8L8 16"/>',
  pointer: '<path d="M6 3.5 18.5 12l-5.5 1-3 5.5z"/>',
  square: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>',
  diamond: '<path d="M12 3 21 12 12 21 3 12z"/>',
  arrow: '<circle cx="5.5" cy="18.5" r="1.6"/><path d="M7 17 18.5 5.5M11 5h8v8"/>',
  type: '<path d="M5 6.5V4h14v2.5M12 4v16M9 20h6"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5M13.5 11v5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  undo: '<path d="M9 15 4 10l5-5M4 10h10a6 6 0 0 1 6 6v2"/>',
  redo: '<path d="m15 15 5-5-5-5M20 10H10a6 6 0 0 0-6 6v2"/>',
  map: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="12" width="6" height="5" rx="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  todo: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11"/><circle cx="5" cy="18" r="1.2"/>',
  route: '<circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 17c5-1 3-9 10-10"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.8M12 16.8v.2"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

// ---------------------------------------------------------------- состояние
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAGE_W = 300, MS_W = 160, COL_W = 380, GAP_Y = 40;

const S = {
  maps: [], id: null, doc: null, mtime: 0,
  view: { x: 80, y: 80, z: 1 },
  sel: new Set(),          // 's:<id>' или 'n:<id>'
  selEdge: null,           // {from, to}
  tool: 'select', filter: 'all', search: '',
  undo: [], redo: [],
  connectFrom: null,
  size: {},                // id -> {w,h}
  editing: null,           // id этапа в редакторе
  lastMtimes: '',
  flash: {},               // id -> время: карточка изменилась в файле
  celebrate: {},           // id -> время: этап только что закрыт
  enterAnim: false,        // плавное появление карточек при открытии карты
  hoverId: null,
  locked: false,           // замок: карточки не двигаются и не редактируются
  critOn: false,           // показан критический путь
  crit: null,
};
let api = null;

// ---------------------------------------------------------------- модель
function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 8); }

function normalize(doc) {
  doc.title ??= 'Без названия';
  doc.stages = Array.isArray(doc.stages) ? doc.stages : [];
  doc.notes = Array.isArray(doc.notes) ? doc.notes : [];
  const ids = new Set();
  for (const s of doc.stages) {
    if (!s.id || ids.has(s.id)) s.id = uid('s');
    ids.add(s.id);
    s.title ??= 'Этап';
    s.type = s.type === 'milestone' ? 'milestone' : 'stage';
    s.tasks = (Array.isArray(s.tasks) ? s.tasks : []).map(t =>
      typeof t === 'string' ? { text: t.replace(/^\s*\[[xXхХ ]?\]\s*/, ''), done: /^\s*\[[xXхХ]\]/.test(t) } : { text: String(t?.text ?? ''), done: !!t?.done });
    s.after = (Array.isArray(s.after) ? s.after : s.after ? [s.after] : []).filter(a => a !== s.id);
  }
  for (const n of doc.notes) { n.id ||= uid('n'); n.text ??= ''; n.x ??= 0; n.y ??= 0; }
  return doc;
}

function status(s, seen = new Set()) {
  if (['todo', 'active', 'done'].includes(s.status)) return s.status;
  if (s.type === 'milestone' && !s.tasks.length) {
    // веха пройдена, когда закрыты все этапы перед ней (seen — защита от циклов)
    if (!s.after.length || seen.has(s.id)) return 'todo';
    seen.add(s.id);
    const prev = livePreds(s);
    return prev.length && prev.every(p => status(p, seen) === 'done') ? 'done' : 'todo';
  }
  const t = s.tasks;
  if (!t.length) return 'todo';
  const d = t.filter(x => x.done).length;
  return d === t.length ? 'done' : d > 0 ? 'active' : 'todo';
}
const stageById = id => S.doc?.stages.find(s => s.id === id);
const noteById = id => S.doc?.notes.find(n => n.id === id);

function estH(s) {
  if (s.type === 'milestone') return 100;
  return 62 + (s.description ? Math.ceil(s.description.length / 42) * 17 : 0)
    + s.tasks.reduce((a, t) => a + 17 * Math.max(1, Math.ceil(t.text.length / 40)) + 3, 0) + (s.tag ? 26 : 0);
}

// Раскладка для этапов без координат: колонка = глубина по зависимостям
function autoLayout(doc) {
  const by = Object.fromEntries(doc.stages.map(s => [s.id, s]));
  const depth = {}, visiting = new Set();
  const d = s => {
    if (depth[s.id] != null) return depth[s.id];
    if (visiting.has(s.id)) return 0;
    visiting.add(s.id);
    let v = 0;
    for (const a of s.after) if (by[a]) v = Math.max(v, d(by[a]) + 1);
    visiting.delete(s.id);
    return (depth[s.id] = v);
  };
  doc.stages.forEach(d);
  const colY = {};
  let changed = false;
  for (const s of doc.stages) {
    if (typeof s.x === 'number' && typeof s.y === 'number') continue;
    const c = depth[s.id];
    if (colY[c] == null) {
      colY[c] = 0;
      for (const o of doc.stages)
        if (typeof o.x === 'number' && typeof o.y === 'number' && Math.abs(o.x - c * COL_W) < STAGE_W)
          colY[c] = Math.max(colY[c], o.y + estH(o) + GAP_Y);
    }
    s.x = c * COL_W + (s.type === 'milestone' ? (STAGE_W - MS_W) / 2 : 0);
    s.y = colY[c];
    colY[c] += estH(s) + GAP_Y;
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- undo / сохранение
function pushUndo() {
  S.undo.push(JSON.stringify(S.doc));
  if (S.undo.length > 200) S.undo.shift();
  S.redo = [];
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.doc));
  S.doc = normalize(JSON.parse(S.undo.pop()));
  afterChange();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.doc));
  S.doc = normalize(JSON.parse(S.redo.pop()));
  afterChange();
}

let saveTimer = null, pendingSave = false;
function scheduleSave() {
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 350);
}
async function doSave() {
  if (!S.id || !S.doc) return;
  const id = S.id;
  const data = JSON.parse(JSON.stringify(S.doc));
  for (const s of data.stages) { s.x = Math.round(s.x); s.y = Math.round(s.y); if (!s.after.length) delete s.after; }
  for (const n of data.notes) { n.x = Math.round(n.x); n.y = Math.round(n.y); }
  if (!data.notes.length) delete data.notes;
  try {
    const m = await api.save_map(id, data);
    if (id === S.id) S.mtime = m;
  } catch (e) { toast('Не удалось сохранить: ' + e); }
  pendingSave = false;
  refreshMaps();
}
function afterChange() {
  renderAll();
  scheduleSave();
}

// ---------------------------------------------------------------- загрузка
async function refreshMaps() {
  S.maps = await api.list_maps();
  renderMaps();
}

async function openMap(id, { keepView = false } = {}) {
  const res = await api.load_map(id);
  if (!res) return;
  if (res.error) { toast(res.error); return; }
  const switching = id !== S.id;
  S.id = id;
  S.doc = normalize(res.data);
  S.mtime = res.mtime;
  if (switching) { S.undo = []; S.redo = []; S.sel.clear(); S.selEdge = null; S.connectFrom = null; S.editing = null;
    S.flash = {}; S.celebrate = {}; S.enterAnim = true; S.critOn = false;
    $('#btn-crit').classList.remove('on'); $('#todo').classList.add('hidden'); }
  if (S.editing && !stageById(S.editing)) S.editing = null;
  try { localStorage.setItem('lastMap', id); } catch {}
  const laid = autoLayout(S.doc);
  renderAll();
  if (switching && !keepView) {
    const v = loadView(id);
    if (v) { S.view = v; applyView(); } else fit(false);
  }
  if (laid) scheduleSave();
}

function saveView() { try { localStorage.setItem('view:' + S.id, JSON.stringify(S.view)); } catch {} }
function loadView(id) { try { return JSON.parse(localStorage.getItem('view:' + id)); } catch { return null; } }

// ---------------------------------------------------------------- рендер: сайдбар
function ring(done, total) {
  const r = 5, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<svg class="ring ${total && done === total ? 'full' : ''}" viewBox="0 0 14 14"><circle class="bg" cx="7" cy="7" r="${r}"/>
    <circle class="fg" cx="7" cy="7" r="${r}" stroke-dasharray="${c * p} ${c}"/></svg>`;
}

function renderMaps() {
  const q = S.search.toLowerCase();
  const list = S.maps.filter(m => !q || m.title.toLowerCase().includes(q) || m.id === S.id);
  $('#maps').innerHTML = list.map(m => `
    <div class="map-row ${m.id === S.id ? 'on' : ''}" data-id="${esc(m.id)}" title="${esc(m.title)} — задач ${m.done}/${m.total}">
      ${ring(m.done, m.total)}<span class="t">${esc(m.title)}</span>
      ${m.error ? '<span class="err">ошибка</span>' : ''}
      <button class="ibtn del" data-del="${esc(m.id)}" title="Удалить карту">${icon('x')}</button>
    </div>`).join('') || '<div class="hint" style="padding:6px">Карт пока нет</div>';
  const n = S.maps.length;
  $('#maps-count').textContent = `${n} ${plural(n, 'карта', 'карты', 'карт')}`;
}
function plural(n, a, b, c) { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; }

function matches(s) {
  const q = S.search.toLowerCase();
  if (!q) return true;
  return s.title.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q) || s.tasks.some(t => t.text.toLowerCase().includes(q));
}

function stageIcon(s, st) {
  if (s.type === 'milestone') return '<span class="ms-mark"></span>';
  const t = s.tasks.length, d = s.tasks.filter(x => x.done).length;
  return `<span class="sicon" style="--p:${t ? Math.round(d / t * 100) : 0}%">${st === 'done' ? icon('check') : ''}</span>`;
}

function renderStages() {
  if (!S.doc) { $('#stages').innerHTML = ''; return; }
  const rows = [...S.doc.stages].sort((a, b) => a.x - b.x || a.y - b.y).filter(s => {
    const st = status(s);
    if (S.filter === 'active' && st === 'done') return false;
    if (S.filter === 'done' && st !== 'done') return false;
    return matches(s);
  });
  $('#stages').innerHTML = rows.map(s => {
    const st = status(s), t = s.tasks.length, d = s.tasks.filter(x => x.done).length;
    return `<div class="stage-row st-${st} ${S.sel.has('s:' + s.id) ? 'on' : ''}" data-id="${esc(s.id)}" title="${esc(s.title)}">
      ${stageIcon(s, st)}<span class="t">${esc(s.title)}</span>${isBlocked(s) ? `<span class="lock" title="Ждёт предыдущие этапы">${icon('lock')}</span>` : ''}
      ${s.flag ? `<span class="flag">${icon('flag')}</span>` : ''}
      ${t ? `<span class="n">${d}/${t}</span>` : ''}</div>`;
  }).join('') || '<div class="hint" style="padding:6px">Нет этапов</div>';
}

function renderTop() {
  renderProjectBtn();
  renderCycleWarn();
  $('#map-title').textContent = S.doc ? S.doc.title : '—';
  if (!S.doc) { $('#top-progress').innerHTML = ''; return; }
  const all = S.doc.stages, done = all.filter(s => status(s) === 'done').length;
  const tasks = all.flatMap(s => s.tasks), td = tasks.filter(x => x.done).length;
  const pct = tasks.length ? ` · ${Math.round(td / tasks.length * 100)}% задач` : '';
  $('#top-progress').innerHTML = all.length ? `${ring(done, all.length)}${done} из ${all.length} ${plural(all.length, 'этапа', 'этапов', 'этапов')}${pct}` : '';
}

// ---------------------------------------------------------------- рендер: холст
// Анимация, начатая в момент t0, при перерисовке продолжается с того же места (отрицательная задержка),
// поэтому частые перерисовки не запускают её заново.
function fxAnim(map, id, dur) {
  const t0 = map[id];
  if (t0 == null) return null;
  const el = (performance.now() - t0) / 1000;
  if (el > dur) { delete map[id]; return null; }
  return -el;
}
let enterIndex = 0;
function fxAttrs(s) {
  let cls = '', style = '';
  if (S.enterAnim) { cls += ' enter'; style += `--d:${Math.min(0.5, enterIndex++ * 0.03)}s;`; }
  const ch = fxAnim(S.flash, s.id, 2.2), ce = fxAnim(S.celebrate, s.id, 1.6);
  if (ce != null) { cls += ' celebrate'; style += `animation-delay:${ce}s;`; }
  else if (ch != null) { cls += ' changed'; style += `animation-delay:${ch}s;`; }
  return { cls, style };
}
function cardHTML(s) {
  const st = status(s), sel = S.sel.has('s:' + s.id) ? 'sel' : '', dim = matches(s) ? '' : 'dim';
  const cf = S.connectFrom === s.id ? 'connect-from' : '';
  const color = s.color ? `--c:${esc(s.color)};` : '';
  const fx = fxAttrs(s);
  const blocked = isBlocked(s);
  const lock = blocked ? `<span class="lock" title="Ждёт: ${esc(livePreds(s).filter(p => status(p) !== 'done').map(p => p.title).join(', '))}">${icon('lock')}</span>` : '';
  if (S.critOn && S.crit) fx.cls += S.crit.ids.includes(s.id) ? ' crit' : ' notcrit';
  if (blocked) fx.cls += ' blocked';
  if (s.type === 'milestone')
    return `<div class="card milestone st-${st} ${sel} ${dim} ${cf}${fx.cls}" data-kind="s" data-id="${esc(s.id)}" style="left:${s.x}px;top:${s.y}px;${fx.style}">
      <div class="dia"></div><div class="mlabel">${lock}${esc(s.title)}</div></div>`;
  const t = s.tasks.length, d = s.tasks.filter(x => x.done).length;
  return `<div class="card stage st-${st} ${sel} ${dim} ${cf}${fx.cls}" data-kind="s" data-id="${esc(s.id)}" style="left:${s.x}px;top:${s.y}px;${s.w ? `width:${s.w}px;` : ''}${color}${fx.style}">
    <div class="card-head">${lock}<div class="ctitle">${esc(s.title)}</div>${s.flag ? `<span class="cflag">${icon('flag')}</span>` : ''}${t ? `<span class="cnt">${d}/${t}</span>` : ''}</div>
    ${t ? `<div class="bar"><i style="width:${d / t * 100}%"></i></div>` : ''}
    ${s.description ? `<div class="cdesc">${linkify(s.description)}</div>` : ''}
    ${t ? `<ul class="tasks">${s.tasks.map((x, i) => `<li class="${x.done ? 'done' : ''}"><span class="task-check" data-i="${i}">${x.done ? icon('check') : ''}</span><span>${linkify(x.text)}</span></li>`).join('')}</ul>` : ''}
    ${s.tag ? `<span class="ctag">${esc(s.tag)}</span>` : ''}
    <button class="add-task" title="Быстро добавить задачу">+</button>
  </div>`;
}

function renderCanvas() {
  const items = $('#items');
  if (!S.doc) { items.innerHTML = ''; $('#edge-g').innerHTML = ''; return; }
  enterIndex = 0;
  S.crit = S.critOn ? criticalPath() : null;
  const order = [...S.doc.stages].sort((a, b) => a.x - b.x || a.y - b.y);
  items.innerHTML = order.map(cardHTML).join('') + S.doc.notes.map(n =>
    `<div class="note${S.enterAnim ? ' enter' : ''} ${S.sel.has('n:' + n.id) ? 'sel' : ''} ${S.search && !n.text.toLowerCase().includes(S.search.toLowerCase()) ? 'dim' : ''}" data-kind="n" data-id="${esc(n.id)}"
      style="left:${n.x}px;top:${n.y}px;font-size:${n.size || 18}px;${n.color ? `color:${esc(n.color)}` : ''}">${esc(n.text)}</div>`).join('');
  S.size = {};
  items.querySelectorAll('.card').forEach(el => { S.size[el.dataset.id] = { w: el.offsetWidth, h: el.offsetHeight }; });
  $('#empty').classList.toggle('hidden', S.doc.stages.length + S.doc.notes.length > 0);
  S.enterAnim = false;
  renderEdges();
}

function anchors(s) {
  const sz = S.size[s.id] || { w: STAGE_W, h: 80 };
  if (s.type === 'milestone') {
    const cx = s.x + sz.w / 2, cy = s.y + 8 + 18;
    return { l: [cx - 27, cy], r: [cx + 27, cy] };
  }
  const y = s.y + Math.min(sz.h / 2, 26);
  return { l: [s.x, y], r: [s.x + sz.w, y] };
}
function edgePath(a, b) {
  const [x1, y1] = anchors(a).r, [x2, y2] = anchors(b).l;
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function renderEdges() {
  if (!S.doc) return;
  let h = '';
  for (const b of S.doc.stages) for (const fid of b.after) {
    const a = stageById(fid);
    if (!a) continue;
    const d = edgePath(a, b);
    const hl = S.selEdge && S.selEdge.from === fid && S.selEdge.to === b.id;
    const touch = S.sel.has('s:' + a.id) || S.sel.has('s:' + b.id);
    const sa = status(a), sb = status(b);
    const flow = sb === 'active' || (sa === 'done' && sb !== 'done');   // «энергия» течёт к текущим этапам
    const hov = S.hoverId && (S.hoverId === a.id || S.hoverId === b.id);
    const ci = S.critOn && S.crit ? S.crit.ids.indexOf(b.id) : -1;
    const crit = ci > 0 && S.crit.ids[ci - 1] === a.id;
    const cyc = cycleEdges().has(fid + '>' + b.id);
    h += `<path class="edge ${sa === 'done' ? 'done' : ''} ${hl || touch ? 'hl' : ''} ${flow ? 'flow' : ''} ${hov ? 'hov' : ''} ${crit ? 'crit' : ''} ${cyc ? 'cycle' : ''}" data-from="${esc(fid)}" data-to="${esc(b.id)}" d="${d}"/>
          <path class="hit" data-from="${esc(fid)}" data-to="${esc(b.id)}" d="${d}"/>`;
  }
  $('#edge-g').innerHTML = h;
}

function applyView() {
  const { x, y, z } = S.view;
  $('#viewport').style.transform = `translate(${x}px,${y}px) scale(${z})`;
  const c = $('#canvas');
  const g = 22 * z;
  c.style.backgroundSize = `${g}px ${g}px`;
  c.style.backgroundPosition = `${x}px ${y}px`;
  $('#z-val').textContent = Math.round(z * 100) + '%';
  renderMinimap();
}

function renderTimeline() {
  const tr = $('#tl-track');
  if (!S.doc || !S.doc.stages.length) { tr.innerHTML = ''; return; }
  const st = [...S.doc.stages].sort((a, b) => a.x - b.x);
  const min = st[0].x, max = st[st.length - 1].x, span = Math.max(1, max - min);
  tr.innerHTML = st.map(s => `<span class="tl-tick st-${status(s)} ${s.type === 'milestone' ? 'ms' : ''} ${S.sel.has('s:' + s.id) ? 'on' : ''}"
    data-id="${esc(s.id)}" style="left:${((s.x - min) / span) * 100}%" title="${esc(s.title)}"></span>`).join('');
}

function bounds() {
  const r = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const s of S.doc?.stages || []) {
    const sz = S.size[s.id] || { w: STAGE_W, h: estH(s) };
    r.x1 = Math.min(r.x1, s.x); r.y1 = Math.min(r.y1, s.y); r.x2 = Math.max(r.x2, s.x + sz.w); r.y2 = Math.max(r.y2, s.y + sz.h);
  }
  for (const n of S.doc?.notes || []) {
    r.x1 = Math.min(r.x1, n.x); r.y1 = Math.min(r.y1, n.y); r.x2 = Math.max(r.x2, n.x + 200); r.y2 = Math.max(r.y2, n.y + 30);
  }
  return r.x1 === Infinity ? null : r;
}

let mmMap = null;
function renderMinimap() {
  const cv = $('#mm'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  mmMap = null;
  const b = bounds();
  if (!b) return;
  const c = $('#canvas').getBoundingClientRect(), { x, y, z } = S.view;
  const vw = { x1: -x / z, y1: -y / z, x2: (c.width - x) / z, y2: (c.height - y) / z };
  const u = { x1: Math.min(b.x1, vw.x1), y1: Math.min(b.y1, vw.y1), x2: Math.max(b.x2, vw.x2), y2: Math.max(b.y2, vw.y2) };
  const pad = 6, k = Math.min((cv.width - pad * 2) / (u.x2 - u.x1), (cv.height - pad * 2) / (u.y2 - u.y1));
  const ox = pad + ((cv.width - pad * 2) - (u.x2 - u.x1) * k) / 2 - u.x1 * k;
  const oy = pad + ((cv.height - pad * 2) - (u.y2 - u.y1) * k) / 2 - u.y1 * k;
  mmMap = { k, ox, oy };
  for (const s of S.doc.stages) {
    const sz = S.size[s.id] || { w: STAGE_W, h: 80 }, st = status(s);
    ctx.fillStyle = s.type === 'milestone' ? '#eab308' : st === 'done' ? '#22c55e' : st === 'active' ? '#3b82f6' : '#3d4a63';
    ctx.globalAlpha = S.sel.has('s:' + s.id) ? 1 : 0.75;
    ctx.fillRect(ox + s.x * k, oy + s.y * k, Math.max(2, sz.w * k), Math.max(2, sz.h * k));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + vw.x1 * k, oy + vw.y1 * k, (vw.x2 - vw.x1) * k, (vw.y2 - vw.y1) * k);
}

function renderAll() {
  renderTop(); renderStages(); renderCanvas(); renderTimeline(); applyView(); renderEditor(); renderMaps();
  document.querySelectorAll('#toolbar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  $('#canvas').className = 'tool-' + S.tool;
}

// ---------------------------------------------------------------- вид: зум/фокус
function zoomAt(f, cx, cy) {
  const z = Math.min(2.5, Math.max(0.08, S.view.z * f));
  const k = z / S.view.z;
  S.view.x = cx - (cx - S.view.x) * k;
  S.view.y = cy - (cy - S.view.y) * k;
  S.view.z = z;
  applyView(); saveViewSoon();
}
let svT = null; const saveViewSoon = () => { clearTimeout(svT); svT = setTimeout(saveView, 300); };

function animateView(target) {
  const from = { ...S.view }, t0 = performance.now(), dur = 280;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    S.view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e };
    applyView();
    if (p < 1) requestAnimationFrame(step); else saveView();
  };
  requestAnimationFrame(step);
}
function fit(anim = true) {
  const b = bounds(), c = $('#canvas').getBoundingClientRect();
  if (!b) { S.view = { x: 80, y: 80, z: 1 }; applyView(); return; }
  const pad = 70;
  const z = Math.min(1.2, Math.max(0.08, Math.min((c.width - pad * 2) / (b.x2 - b.x1), (c.height - pad * 2 - 40) / (b.y2 - b.y1))));
  const t = { z, x: (c.width - (b.x2 - b.x1) * z) / 2 - b.x1 * z, y: (c.height - 40 - (b.y2 - b.y1) * z) / 2 - b.y1 * z };
  anim ? animateView(t) : (S.view = t, applyView(), saveView());
}
function focusStage(id) {
  const s = stageById(id);
  if (!s) return;
  S.sel = new Set(['s:' + id]); S.selEdge = null;
  renderAll();
  const sz = S.size[id] || { w: STAGE_W, h: 100 }, c = $('#canvas').getBoundingClientRect();
  const z = Math.max(S.view.z, 0.85);
  animateView({ z, x: c.width / 2 - (s.x + sz.w / 2) * z, y: Math.min(c.height / 2 - (s.y + sz.h / 2) * z, 90 - s.y * z) });
}
function toWorld(cx, cy) {
  const r = $('#canvas').getBoundingClientRect();
  return { x: (cx - r.left - S.view.x) / S.view.z, y: (cy - r.top - S.view.y) / S.view.z };
}

// ---------------------------------------------------------------- редактор этапа
function renderEditor() {
  const ed = $('#editor');
  const s = S.editing && stageById(S.editing);
  if (!s) { ed.classList.add('hidden'); ed.dataset.id = ''; return; }
  // не перерисовываем, если пользователь сейчас печатает в этом же редакторе
  if (ed.dataset.id === s.id && ed.contains(document.activeElement)) return;
  ed.dataset.id = s.id;
  ed.classList.remove('hidden');
  const others = S.doc.stages.filter(o => o.id !== s.id).sort((a, b) => a.x - b.x || a.y - b.y);
  ed.innerHTML = `
    <div class="ed-head">${s.type === 'milestone' ? '<span class="ms-mark"></span>' : ''}<span class="grow">Этап</span>
      <button class="ibtn" data-ed="close" title="Закрыть (Esc)">${icon('x')}</button></div>
    <div class="ed-body">
      <label>Название<input type="text" data-f="title" value="${esc(s.title)}"></label>
      <div class="ed-row">
        <label>Тип<select data-f="type"><option value="stage" ${s.type === 'stage' ? 'selected' : ''}>Этап (карточка)</option><option value="milestone" ${s.type === 'milestone' ? 'selected' : ''}>Веха (ромб)</option></select></label>
        <label>Статус<select data-f="status">
          <option value="" ${!s.status ? 'selected' : ''}>Авто (по задачам)</option>
          <option value="todo" ${s.status === 'todo' ? 'selected' : ''}>Не начат</option>
          <option value="active" ${s.status === 'active' ? 'selected' : ''}>В работе</option>
          <option value="done" ${s.status === 'done' ? 'selected' : ''}>Готов</option></select></label>
      </div>
      <label class="chk"><input type="checkbox" data-f="flag" ${s.flag ? 'checked' : ''}> Важный (флажок)</label>
      <label>Описание<textarea data-f="description" rows="3">${esc(s.description || '')}</textarea></label>
      <label>Задачи — по одной на строку, «[x] » в начале = готово<textarea class="tasks-ta" data-f="tasks">${esc(s.tasks.map(t => (t.done ? '[x] ' : '') + t.text).join('\n'))}</textarea></label>
      <label>Метка внизу карточки<input type="text" data-f="tag" value="${esc(s.tag || '')}"></label>
      <label>Идёт после этапов (стрелки)</label>
      <div class="deps">${others.map(o => `<label><input type="checkbox" data-dep="${esc(o.id)}" ${s.after.includes(o.id) ? 'checked' : ''}>${esc(o.title)}</label>`).join('') || '<span class="hint">Других этапов нет</span>'}</div>
      <span class="hint">id: ${esc(s.id)}</span>
    </div>
    <div class="ed-foot"><button class="btn danger" data-ed="delete">${icon('trash')}Удалить этап</button><button class="btn" data-ed="close">Готово</button></div>`;
}

let edUndoPushed = false;
$('#editor').addEventListener('focusin', () => { if (!edUndoPushed) { pushUndo(); edUndoPushed = true; } });
$('#editor').addEventListener('focusout', () => { edUndoPushed = false; });
$('#editor').addEventListener('input', e => {
  const s = stageById(S.editing); if (!s) return;
  const f = e.target.dataset.f, dep = e.target.dataset.dep;
  if (dep) {
    s.after = e.target.checked ? [...new Set([...s.after, dep])] : s.after.filter(a => a !== dep);
  } else if (f === 'tasks') {
    s.tasks = e.target.value.split('\n').map(l => l.trimEnd()).filter(l => l.trim())
      .map(l => ({ text: l.replace(/^\s*\[[xX ]?\]\s*/, ''), done: /^\s*\[[xXхХ]\]/.test(l) }));
  } else if (f === 'flag') {
    s.flag = e.target.checked || undefined;
  } else if (f === 'status' || f === 'tag' || f === 'description') {
    s[f] = e.target.value || undefined;
  } else if (f === 'type') {
    s.type = e.target.value;
  } else if (f) {
    s[f] = e.target.value;
  }
  renderTop(); renderStages(); renderCanvas(); renderTimeline(); renderMinimap();
  scheduleSave();
});
$('#editor').addEventListener('click', e => {
  const a = e.target.closest('[data-ed]')?.dataset.ed;
  if (a === 'close') { S.editing = null; renderEditor(); }
  if (a === 'delete') deleteStages([S.editing]);
});

// ---------------------------------------------------------------- действия
function createStage(type, x, y) {
  pushUndo();
  const s = { id: uid('s'), title: type === 'milestone' ? 'Веха' : 'Новый этап', type, x, y, tasks: [], after: [] };
  S.doc.stages.push(s);
  S.sel = new Set(['s:' + s.id]);
  S.editing = s.id;
  S.tool = 'select';
  afterChange();
  setTimeout(() => { const i = $('#editor [data-f=title]'); i?.focus(); i?.select(); }, 30);
}
function createNote(x, y) {
  pushUndo();
  const n = { id: uid('n'), text: 'Текст', x, y };
  S.doc.notes.push(n);
  S.sel = new Set(['n:' + n.id]);
  S.tool = 'select';
  afterChange();
  editNote(n.id);
}
function editNote(id) {
  if (S.locked) return;
  const el = document.querySelector(`.note[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.contentEditable = 'true';
  el.focus();
  document.getSelection().selectAllChildren(el);
  const n = noteById(id), before = JSON.stringify(S.doc);
  el.addEventListener('blur', () => {
    el.contentEditable = 'false';
    const text = el.innerText.replace(/\n$/, '');
    if (text !== n.text) {
      S.undo.push(before); S.redo = [];
      if (text.trim()) n.text = text; else S.doc.notes = S.doc.notes.filter(x => x.id !== id);
      afterChange();
    }
  }, { once: true });
}
function deleteStages(ids) {
  if (!ids.length) return;
  pushUndo();
  const set = new Set(ids);
  S.doc.stages = S.doc.stages.filter(s => !set.has(s.id));
  for (const s of S.doc.stages) s.after = s.after.filter(a => !set.has(a));
  if (set.has(S.editing)) S.editing = null;
  S.sel.clear();
  afterChange();
}
function deleteSelection() {
  if (S.selEdge) {
    pushUndo();
    const b = stageById(S.selEdge.to);
    if (b) b.after = b.after.filter(a => a !== S.selEdge.from);
    S.selEdge = null;
    afterChange();
    return;
  }
  const st = [...S.sel].filter(k => k.startsWith('s:')).map(k => k.slice(2));
  const nt = new Set([...S.sel].filter(k => k.startsWith('n:')).map(k => k.slice(2)));
  if (!st.length && !nt.size) return;
  if (nt.size) { pushUndo(); S.doc.notes = S.doc.notes.filter(n => !nt.has(n.id)); if (!st.length) { S.sel.clear(); afterChange(); return; } S.undo.pop(); }
  deleteStages(st);
}
function connect(fromId, toId) {
  if (fromId === toId) return;
  const b = stageById(toId);
  if (!b || b.after.includes(fromId)) return;
  const loop = wouldCycle(fromId, toId);
  pushUndo();
  b.after.push(fromId);
  afterChange();
  if (loop) toast('Эта стрелка замыкает круг: этапы будут ждать друг друга. Ctrl+Z — отменить');
}
function toggleTask(id, i) {
  const s = stageById(id);
  if (!s || !s.tasks[i]) return;
  pushUndo();
  const wasDone = status(s) === 'done';
  const mapWasDone = mapDone();
  s.tasks[i].done = !s.tasks[i].done;
  const nowDone = status(s) === 'done';
  if (nowDone && !wasDone) S.celebrate[id] = performance.now();
  afterChange();
  if (!s.tasks[i].done) return;
  const box = document.querySelector(`.card[data-id="${CSS.escape(id)}"] .task-check[data-i="${i}"]`);
  if (box) { box.classList.add('pop'); confettiAt(box, 14, 0.6); }
  if (nowDone && !wasDone) {
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) confettiAt(card, 70, 1.1, 'top');
    if (mapDone() && !mapWasDone) setTimeout(() => { confettiRain(); toast('Карта пройдена целиком — поздравляю!'); }, 350);
    else toast(`Этап «${s.title}» завершён`);
  }
}
function mapDone() {
  return !!S.doc && S.doc.stages.some(s => s.type !== 'milestone') &&
    S.doc.stages.every(s => s.type === 'milestone' || status(s) === 'done');
}

// ---------------------------------------------------------------- конфетти (лёгкий canvas поверх холста)
const confetti = { parts: [], running: false };
const CONF_COLORS = ['#60a5fa', '#3b82f6', '#22c55e', '#eab308', '#f43f5e', '#e4eaf5'];
function animOn() {
  return !document.body.classList.contains('noanim') &&
    (document.body.classList.contains('anim-forced') || !matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function confettiAt(el, n, power = 1, from = 'center') {
  if (!animOn()) return;
  const c = $('#canvas').getBoundingClientRect(), r = el.getBoundingClientRect();
  const x = r.left - c.left + r.width / 2, y = (from === 'top' ? r.top : r.top + r.height / 2) - c.top;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (from === 'top' ? 2.2 : 6.3);
    const v = (120 + Math.random() * 260) * power;
    confetti.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random() * 0.6,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, s: 3 + Math.random() * 4, col: CONF_COLORS[k % CONF_COLORS.length] });
  }
  runConfetti();
}
function confettiRain() {
  if (!animOn()) return;
  const c = $('#canvas').getBoundingClientRect();
  for (let k = 0; k < 160; k++)
    confetti.parts.push({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 60,
      vy: 60 + Math.random() * 120, life: 2.6 + Math.random(), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
      s: 4 + Math.random() * 4, col: CONF_COLORS[k % CONF_COLORS.length] });
  runConfetti();
}
function runConfetti() {
  if (confetti.running) return;
  confetti.running = true;
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const p of confetti.parts) {
      p.vy += 520 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    confetti.parts = confetti.parts.filter(p => p.life > 0 && p.y < h + 40);
    if (confetti.parts.length) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, w, h); confetti.running = false; }
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- быстрая задача (кнопка «+» на карточке)
function quickTask(id) {
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (!card || card.querySelector('.quick-task')) return;
  const inp = document.createElement('input');
  inp.className = 'quick-task';
  inp.placeholder = 'Новая задача, Enter';
  card.querySelector('.add-task').before(inp);
  inp.focus();
  setTimeout(() => inp.focus(), 0);   // на случай, если фокус перехватил клик
  let done = false;
  const finish = (save, again) => {
    if (done) return;
    done = true;
    const text = inp.value.trim();
    const s = stageById(id);
    if (save && text && s) { pushUndo(); s.tasks.push({ text, done: false }); afterChange(); }
    else renderCanvas();
    if (again && text) quickTask(id);   // Enter — можно сразу вводить следующую
  };
  inp.addEventListener('keydown', k => {
    if (k.key === 'Enter') { k.preventDefault(); finish(true, true); }
    if (k.key === 'Escape') { k.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}

// ---------------------------------------------------------------- замок карты
function applyLock(on, quiet) {
  S.locked = on;
  document.body.classList.toggle('locked', on);
  const b = $('#btn-lock');
  b.classList.toggle('on', on);
  b.innerHTML = icon(on ? 'lock' : 'unlock') + '<sub>L</sub>';
  b.title = on ? 'Карта закреплена: карточки не двигаются, можно только отмечать задачи. Нажмите, чтобы снять (L)'
               : 'Закрепить карту: карточки перестанут двигаться и редактироваться (L)';
  if (on) {
    if (S.tool !== 'select' && S.tool !== 'hand') { S.tool = 'select'; S.connectFrom = null; }
    S.editing = null;
    renderAll();
  }
  if (!quiet) toast(on ? 'Карта закреплена — карточки не двигаются, задачи отмечаются кликом' : 'Замок снят — карту снова можно редактировать');
}
function toggleLock() {
  applyLock(!S.locked);
  try { localStorage.setItem('locked', S.locked ? '1' : '0'); } catch {}
}

// ---------------------------------------------------------------- круговые связи
// Стрелка a → b «круговая», если от b по стрелкам можно снова прийти к a: тогда этапы ждут друг друга вечно.
// Такие стрелки рисуются красным и не учитываются в блокировках, вехах и критическом пути.
let cycleCache = { key: null, edges: new Set() };
function cycleEdges() {
  if (!S.doc) return new Set();
  const key = S.doc.stages.map(s => s.id + ':' + s.after.join(',')).join('|');
  if (cycleCache.key === key) return cycleCache.edges;
  const next = {};
  for (const s of S.doc.stages) for (const a of s.after) (next[a] ||= []).push(s.id);
  const reach = (from, target) => {
    const seen = new Set([from]), stack = [from];
    while (stack.length) {
      const x = stack.pop();
      if (x === target) return true;
      for (const y of next[x] || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return false;
  };
  const edges = new Set();
  for (const s of S.doc.stages) for (const a of s.after) if (stageById(a) && reach(s.id, a)) edges.add(a + '>' + s.id);
  cycleCache = { key, edges };
  return edges;
}
function livePreds(s) {
  const cyc = cycleEdges();
  return s.after.filter(a => !cyc.has(a + '>' + s.id)).map(stageById).filter(Boolean);
}
function wouldCycle(fromId, toId) {
  // появится ли круг, если добавить стрелку from → to: можно ли уже дойти от to до from
  const next = {};
  for (const s of S.doc.stages) for (const a of s.after) (next[a] ||= []).push(s.id);
  const seen = new Set([toId]), stack = [toId];
  while (stack.length) {
    const x = stack.pop();
    if (x === fromId) return true;
    for (const y of next[x] || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  }
  return false;
}
function renderCycleWarn() {
  const n = cycleEdges().size, b = $('#cycle-warn');
  if (!b) return;
  b.classList.toggle('hidden', !n);
  b.querySelector('.lbl').textContent = `Круговые связи: ${n}`;
}
function showCycle() {
  const first = [...cycleEdges()][0];
  if (!first) return;
  const [from, to] = first.split('>');
  S.sel.clear();
  S.selEdge = { from, to };
  focusStage(to);
  S.sel.clear();
  S.selEdge = { from, to };
  renderAll();
  toast('Красные стрелки замыкают круг — этапы ждут друг друга. Выделена одна: нажмите Delete, чтобы удалить');
}

// ---------------------------------------------------------------- для программистов
// Ссылки в задачах: https://… и пути к файлам вида src/app.py:120 (относительно папки проекта карты).
const CODE_EXT_RE = 'py|pyw|js|jsx|ts|tsx|mjs|cjs|vue|svelte|html|css|scss|json|md|cs|cpp|cc|c|h|hpp|java|kt|go|rs|rb|php|swift|lua|gd|dart|sql|sh|ps1|bat|yml|yaml|toml|txt|ini|cfg|xml';
const LINK_RE = new RegExp(`(https?:\\/\\/[^\\s<>"']+[^\\s<>"'.,;:!?)\\]])|(?<![\\w.\\-\\\\/:])((?:[A-Za-z]:[\\\\/])?(?:[\\w.\\-]+[\\\\/])*[\\w\\-.]*[\\w\\-]\\.(?:${CODE_EXT_RE})(?::\\d+){0,2})(?!\\w|\\.\\w)`, 'g');
function linkify(text) {
  let out = '', last = 0;
  for (const m of String(text).matchAll(LINK_RE)) {
    out += esc(text.slice(last, m.index));
    const target = m[0];
    let label = m[1] ? target.replace(/^https?:\/\/(www\.)?/, '') : target;
    if (label.length > 42) label = '…' + label.slice(-40);
    out += `<a class="lnk ${m[1] ? 'url' : 'file'}" data-link="${esc(target)}" title="${m[1] ? 'Открыть в браузере' : 'Открыть в редакторе'}: ${esc(target)}">${esc(label)}</a>`;
    last = m.index + target.length;
  }
  return out + esc(String(text).slice(last));
}
async function openLink(target) {
  try {
    const d = await api.open_link(target, S.doc?.project || null);
    if (d.kind === 'error') toast(d.error);
    else if (d.kind === 'url') toast('Открываю в браузере');
    else if (d.kind === 'editor') toast(`Открываю в ${d.editor_name}: ${d.path.split(/[\\/]/).pop()}${d.style === 'plain' ? '' : ':' + d.line}`);
    else if (d.kind === 'reveal') toast('Показываю файл в проводнике');
    else toast('Открываю файл');
  } catch (e) { toast('Не удалось открыть: ' + e); }
}

// Папка проекта карты
function projectName() {
  return S.doc?.project ? S.doc.project.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '';
}
function renderProjectBtn() {
  const b = $('#btn-project');
  if (!b) return;
  const n = projectName();
  b.querySelector('.lbl').textContent = n || 'Проект';
  b.classList.toggle('set', !!n);
  b.title = n ? `Папка проекта: ${S.doc.project}\nНажмите, чтобы выбрать другую` : 'Выбрать папку проекта: от неё считаются пути в задачах и ищутся TODO';
}
async function pickProject() {
  if (!S.doc) return null;
  const p = await api.pick_folder();
  if (!p) return null;
  pushUndo();
  S.doc.project = p;
  afterChange();
  toast(`Папка проекта: ${projectName()}`);
  return p;
}

// Блокировки: этап не закрыт, а этапы перед ним ещё не готовы
function isBlocked(s) {
  if (status(s) === 'done') return false;
  return livePreds(s).some(p => status(p) !== 'done');
}

// Критический путь: самая «тяжёлая» цепочка по оставшимся задачам
function criticalPath() {
  const memo = {}, from = {}, visiting = new Set();
  const w = s => status(s) === 'done' ? 0 : (s.type === 'milestone' ? 0 : Math.max(1, s.tasks.filter(t => !t.done).length));
  const dist = s => {
    if (memo[s.id] != null) return memo[s.id];
    if (visiting.has(s.id)) return 0;
    visiting.add(s.id);
    let best = 0, arg = null;
    for (const p of livePreds(s)) {
      const id = p.id;
      const d = dist(p);
      if (d > best) { best = d; arg = id; }
    }
    visiting.delete(s.id);
    from[s.id] = arg;
    return (memo[s.id] = best + w(s));
  };
  let end = null, max = 0;
  for (const s of S.doc.stages) { const d = dist(s); if (d > max) { max = d; end = s.id; } }
  if (!end) return null;
  const path = [];
  for (let id = end; id; id = from[id]) path.unshift(id);
  // хвост: вехи сразу после конца цепочки (обычно «Релиз»)
  let tail = true;
  while (tail) {
    tail = false;
    const next = S.doc.stages.find(s => s.type === 'milestone' && s.after.includes(path[path.length - 1]) && !path.includes(s.id));
    if (next) { path.push(next.id); tail = true; }
  }
  return { ids: path, tasks: max };
}
function toggleCritical(force) {
  if (!S.doc) return;
  S.critOn = force === undefined ? !S.critOn : force;
  $('#btn-crit').classList.toggle('on', S.critOn);
  renderCanvas();
  if (S.critOn) {
    const cp = S.crit;
    if (!cp) toast('Все этапы готовы — критического пути нет');
    else toast(`Критический путь: ${cp.ids.length} ${plural(cp.ids.length, 'этап', 'этапа', 'этапов')}, осталось задач: ${cp.tasks}`);
  }
}

// Сбор TODO из кода проекта
let todoFound = [];
async function openTodo() {
  if (!S.doc) return;
  let project = S.doc.project;
  if (!project) { project = await pickProject(); if (!project) return; }
  const panel = $('#todo');
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="ed-head"><span class="grow">TODO из кода</span><button class="ibtn" data-todo="close">${icon('x')}</button></div>
    <div class="ed-body"><span class="hint">Ищу TODO, FIXME, HACK в «${esc(projectName())}»…</span></div>`;
  const res = await api.scan_todos(project);
  if (res.error) { panel.querySelector('.ed-body').innerHTML = `<span class="hint">${esc(res.error)}</span>`; return; }
  const existing = S.doc.stages.flatMap(s => s.tasks.map(t => t.text)).join('\n');
  todoFound = res.map(t => ({ ...t, ref: `${t.file}:${t.line}`, have: existing.includes(`${t.file}:${t.line}`) }));
  const fresh = todoFound.filter(t => !t.have).length;
  const stages = [...S.doc.stages].filter(s => s.type !== 'milestone').sort((a, b) => a.x - b.x || a.y - b.y);
  panel.innerHTML = `<div class="ed-head"><span class="grow">TODO из кода · ${esc(projectName())}</span><button class="ibtn" data-todo="close" title="Закрыть">${icon('x')}</button></div>
    <div class="ed-body">
      ${todoFound.length ? `<span class="hint">Найдено: ${todoFound.length}, новых: ${fresh}. Уже добавленные отмечены серым.</span>
      <label class="chk"><input type="checkbox" data-todo="all" ${fresh ? 'checked' : ''}> Выбрать все новые</label>
      <div class="todo-list">${todoFound.map((t, i) => `<label class="todo-item ${t.have ? 'have' : ''}">
        <input type="checkbox" data-ti="${i}" ${t.have ? 'disabled' : 'checked'}>
        <span class="todo-tag t-${t.tag.toLowerCase()}">${t.tag}</span>
        <span class="todo-text">${esc(t.text)}<small>${esc(t.ref)}</small></span></label>`).join('')}</div>
      <label>Куда добавить<select data-todo="target">
        <option value="__new">Новый этап «TODO из кода»</option>
        ${stages.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label>`
      : `<span class="hint">В папке «${esc(projectName())}» не нашлось комментариев TODO / FIXME / HACK / XXX.</span>`}
    </div>
    <div class="ed-foot"><button class="btn" data-todo="rescan">Искать заново</button>
      ${todoFound.length ? `<button class="btn primary" data-todo="add">Добавить</button>` : ''}</div>`;
}
function addTodos() {
  const panel = $('#todo');
  const picked = [...panel.querySelectorAll('input[data-ti]:checked')].map(i => todoFound[+i.dataset.ti]);
  if (!picked.length) { toast('Ничего не выбрано'); return; }
  pushUndo();
  let target = panel.querySelector('[data-todo="target"]').value;
  let stage = stageById(target);
  if (!stage) {
    stage = { id: uid('s'), title: 'TODO из кода', type: 'stage', tasks: [], after: [], tag: 'из кода' };
    const b = bounds();
    stage.x = b ? b.x1 : 0;
    stage.y = b ? b.y2 + 60 : 0;
    S.doc.stages.push(stage);
  }
  for (const t of picked) stage.tasks.push({ text: `${t.tag}: ${t.text} — ${t.ref}`, done: false });
  panel.classList.add('hidden');
  afterChange();
  focusStage(stage.id);
  S.flash[stage.id] = performance.now();
  toast(`Добавлено задач: ${picked.length} → «${stage.title}»`);
}

// ---------------------------------------------------------------- подсветка связей при наведении
function setHover(id) {
  if (S.hoverId === id) return;
  S.hoverId = id;
  document.querySelectorAll('#edge-g path.edge').forEach(p =>
    p.classList.toggle('hov', !!id && (p.dataset.from === id || p.dataset.to === id)));
}

// ---------------------------------------------------------------- справка и выключатель анимаций
function toggleHelp(show) {
  const h = $('#help');
  h.classList.toggle('hidden', show === undefined ? !h.classList.contains('hidden') : !show);
}
function applyAnim(on) {
  document.body.classList.toggle('noanim', !on);
  document.body.classList.toggle('anim-forced', on);
  $('#btn-anim').classList.toggle('on', on);
  $('#btn-anim').title = on ? 'Анимации включены — нажмите, чтобы выключить' : 'Анимации выключены — нажмите, чтобы включить';
}
function setTool(t) {
  if (S.locked && t !== 'select' && t !== 'hand') { toast('Карта закреплена — можно только отмечать задачи. Снять замок: кнопка с замком или L'); t = 'select'; }
  S.tool = t;
  S.connectFrom = null;
  $('#edge-ghost').classList.add('hidden');
  renderAll();
}

let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------------------------------------------------------------- мышь на холсте
const canvas = $('#canvas');
let drag = null, spaceDown = false;

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  if (e.ctrlKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  else { S.view.x -= e.deltaY; applyView(); saveViewSoon(); }
}, { passive: false });

canvas.addEventListener('pointerdown', e => {
  if (e.target.closest('.panel, #toolbar, #editor, .menu, #help, #todo')) return;
  if (!S.doc) return;
  $('#export-menu').classList.add('hidden');
  const r = canvas.getBoundingClientRect();
  const panStart = () => { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; canvas.classList.add('panning'); };
  if (e.button === 1 || e.button === 2 || S.tool === 'hand' || spaceDown) { e.preventDefault(); panStart(); canvas.setPointerCapture(e.pointerId); return; }
  if (e.button !== 0) return;

  const w = toWorld(e.clientX, e.clientY);
  const item = e.target.closest('[data-kind]');
  const hit = e.target.closest('path.hit');

  if (e.target.closest('.quick-task')) return;
  const lnk = e.target.closest('.lnk');
  if (lnk && S.tool === 'select') { e.preventDefault(); e.stopPropagation(); openLink(lnk.dataset.link); return; }
  if (e.target.closest('.add-task') && item) { e.preventDefault(); if (!S.locked) quickTask(item.dataset.id); return; }
  if (e.target.closest('.task-check') && item && S.tool === 'select') {
    toggleTask(item.dataset.id, +e.target.closest('.task-check').dataset.i);
    return;
  }
  if (item?.isContentEditable) return;
  if (S.locked) {
    // закреплено: клик по карточке только выделяет её, перетаскивание двигает холст, а не карточку
    if (item && item.dataset.kind === 's') { S.sel = new Set(['s:' + item.dataset.id]); S.selEdge = null; renderStages(); renderTimeline();
      document.querySelectorAll('#items [data-kind]').forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.kind + ':' + el.dataset.id))); renderEdges(); }
    else if (!item && (S.sel.size || S.selEdge)) { S.sel.clear(); S.selEdge = null; renderAll(); }
    panStart(); canvas.setPointerCapture(e.pointerId);
    return;
  }

  if (S.tool === 'connect') {
    if (item?.dataset.kind === 's') {
      if (!S.connectFrom) { S.connectFrom = item.dataset.id; renderCanvas(); }
      else { const f = S.connectFrom; S.connectFrom = null; $('#edge-ghost').classList.add('hidden'); connect(f, item.dataset.id); }
    } else { S.connectFrom = null; $('#edge-ghost').classList.add('hidden'); renderCanvas(); }
    return;
  }
  if (S.tool === 'stage' || S.tool === 'milestone') { createStage(S.tool, w.x - (S.tool === 'stage' ? 40 : MS_W / 2), w.y - 20); return; }
  if (S.tool === 'note') { createNote(w.x, w.y - 12); return; }

  if (hit) {
    S.selEdge = { from: hit.dataset.from, to: hit.dataset.to }; S.sel.clear();
    renderAll(); return;
  }
  if (item) {
    const key = item.dataset.kind + ':' + item.dataset.id;
    if (e.shiftKey) { S.sel.has(key) ? S.sel.delete(key) : S.sel.add(key); }
    else if (!S.sel.has(key)) S.sel = new Set([key]);
    S.selEdge = null;
    const start = {};
    for (const k of S.sel) { const o = k.startsWith('s:') ? stageById(k.slice(2)) : noteById(k.slice(2)); if (o) start[k] = { x: o.x, y: o.y }; }
    drag = { type: 'move', sx: w.x, sy: w.y, start, moved: false, snapshot: JSON.stringify(S.doc) };
    canvas.setPointerCapture(e.pointerId);
    renderStages(); renderTimeline();
    document.querySelectorAll('#items [data-kind]').forEach(el => el.classList.toggle('sel', S.sel.has(el.dataset.kind + ':' + el.dataset.id)));
    renderEdges(); renderMinimap();
    return;
  }
  // пустое место
  if (S.sel.size || S.selEdge) { S.sel.clear(); S.selEdge = null; renderAll(); }
  panStart(); canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (S.tool === 'connect' && S.connectFrom) {
    const a = stageById(S.connectFrom), w = toWorld(e.clientX, e.clientY);
    if (a) {
      const [x1, y1] = anchors(a).r, g = $('#edge-ghost');
      g.setAttribute('d', `M${x1} ${y1} C${x1 + 60} ${y1}, ${w.x - 60} ${w.y}, ${w.x} ${w.y}`);
      g.classList.remove('hidden');
    }
  }
  if (!drag) return;
  if (drag.type === 'pan') {
    S.view.x = drag.vx + e.clientX - drag.sx; S.view.y = drag.vy + e.clientY - drag.sy;
    applyView();
  } else if (drag.type === 'move') {
    const w = toWorld(e.clientX, e.clientY), dx = w.x - drag.sx, dy = w.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) * S.view.z < 3) return;
    drag.moved = true;
    for (const [k, p] of Object.entries(drag.start)) {
      const o = k.startsWith('s:') ? stageById(k.slice(2)) : noteById(k.slice(2));
      o.x = p.x + dx; o.y = p.y + dy;
      const el = document.querySelector(`#items [data-kind="${k[0]}"][data-id="${CSS.escape(k.slice(2))}"]`);
      if (el) { el.style.left = o.x + 'px'; el.style.top = o.y + 'px'; }
    }
    renderEdges(); renderMinimap();
  }
});

const endDrag = () => {
  if (!drag) return;
  if (drag.type === 'pan') { canvas.classList.remove('panning'); saveView(); }
  if (drag.type === 'move' && drag.moved) {
    S.undo.push(drag.snapshot); S.redo = [];
    renderTimeline(); renderStages(); scheduleSave();
  }
  drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('dblclick', e => {
  // из-за захвата указателя target = сам холст, поэтому ищем элемент под курсором
  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (under?.closest('.panel, #toolbar, #editor, .menu, #help, #todo')) return;
  const item = under?.closest('[data-kind]');
  if (S.locked) { if (item) toast('Карта закреплена — можно только отмечать задачи. Снять замок: кнопка с замком или L'); return; }
  if (!item) { if (S.tool === 'select' && S.doc) { const w = toWorld(e.clientX, e.clientY); createStage('stage', w.x - 40, w.y - 20); } return; }
  if (item.dataset.kind === 's') { S.editing = item.dataset.id; $('#editor').dataset.id = ''; renderEditor(); }
  else editNote(item.dataset.id);
});

// ---------------------------------------------------------------- миникарта / таймлайн
let mmDrag = false;
const mmGo = e => {
  if (!mmMap) return;
  const r = $('#mm').getBoundingClientRect(), c = canvas.getBoundingClientRect();
  const wx = (e.clientX - r.left - mmMap.ox) / mmMap.k, wy = (e.clientY - r.top - mmMap.oy) / mmMap.k;
  S.view.x = c.width / 2 - wx * S.view.z; S.view.y = c.height / 2 - wy * S.view.z;
  applyView();
};
$('#mm').addEventListener('pointerdown', e => { mmDrag = true; $('#mm').setPointerCapture(e.pointerId); mmGo(e); });
$('#mm').addEventListener('pointermove', e => mmDrag && mmGo(e));
$('#mm').addEventListener('pointerup', () => { mmDrag = false; saveView(); });
$('#mm-toggle').addEventListener('click', () => $('#minimap').classList.toggle('collapsed'));
$('#tl-track').addEventListener('click', e => { const t = e.target.closest('.tl-tick'); if (t) focusStage(t.dataset.id); });

// ---------------------------------------------------------------- сайдбар / верх
$('#maps').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const m = S.maps.find(x => x.id === del.dataset.del);
    if (confirm(`Удалить карту «${m?.title}»?\n(Файл переместится в roadmaps/.trash)`)) {
      await api.delete_map(del.dataset.del);
      if (S.id === del.dataset.del) { S.id = null; S.doc = null; }
      await refreshMaps();
      if (!S.id && S.maps[0]) openMap(S.maps[0].id); else renderAll();
    }
    return;
  }
  const row = e.target.closest('.map-row');
  if (row && row.dataset.id !== S.id) openMap(row.dataset.id);
});
$('#stages').addEventListener('click', e => { const r = e.target.closest('.stage-row'); if (r) focusStage(r.dataset.id); });
$('#stages').addEventListener('dblclick', e => { const r = e.target.closest('.stage-row'); if (S.locked) { if (r) focusStage(r.dataset.id); return; } if (r) { S.editing = r.dataset.id; $('#editor').dataset.id = ''; renderEditor(); } });
$('#filter').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.filter = b.dataset.f;
  document.querySelectorAll('#filter button').forEach(x => x.classList.toggle('on', x === b));
  renderStages();
});
$('#search').addEventListener('input', e => { S.search = e.target.value.trim(); renderMaps(); renderStages(); renderCanvas(); });
$('#btn-new-map').addEventListener('click', () => { $('#new-map').classList.toggle('hidden'); $('#new-map-input').focus(); });
$('#new-map-input').addEventListener('keydown', async e => {
  if (e.key === 'Escape') { $('#new-map').classList.add('hidden'); return; }
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const id = await api.create_map(e.target.value.trim());
  e.target.value = ''; $('#new-map').classList.add('hidden');
  await refreshMaps(); openMap(id);
});
$('#btn-folder').addEventListener('click', () => api.open_folder());
$('#btn-side').addEventListener('click', () => { $('#app').classList.toggle('noside'); setTimeout(renderMinimap, 0); });
$('#map-title').addEventListener('dblclick', e => {
  if (S.locked) { toast('Карта закреплена — можно только отмечать задачи. Снять замок: кнопка с замком или L'); return; }
  if (!S.doc) return;
  const el = e.target, before = JSON.stringify(S.doc);
  el.contentEditable = 'true'; el.focus(); document.getSelection().selectAllChildren(el);
  const finish = () => {
    el.contentEditable = 'false';
    const t = el.textContent.trim();
    if (t && t !== S.doc.title) { S.undo.push(before); S.doc.title = t; afterChange(); } else renderTop();
  };
  el.addEventListener('blur', finish, { once: true });
  el.onkeydown = k => { if (k.key === 'Enter' || k.key === 'Escape') { k.preventDefault(); el.blur(); } };
});

// инструменты и кнопки
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tool) setTool(b.dataset.tool);
  if (b.id === 'btn-del') { if (S.locked) toast('Карта закреплена — можно только отмечать задачи. Снять замок: кнопка с замком или L'); else deleteSelection(); }
  if (b.id === 'btn-lock') toggleLock();
});
$('#z-in').addEventListener('click', () => { const r = canvas.getBoundingClientRect(); zoomAt(1.2, r.width / 2, r.height / 2); });
$('#z-out').addEventListener('click', () => { const r = canvas.getBoundingClientRect(); zoomAt(1 / 1.2, r.width / 2, r.height / 2); });
$('#z-fit').addEventListener('click', () => fit());
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);

// экспорт
$('#btn-export').addEventListener('click', e => { e.stopPropagation(); $('#export-menu').classList.toggle('hidden'); });
$('#export-menu').addEventListener('click', async e => {
  const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
  $('#export-menu').classList.add('hidden');
  if (!S.id) return;
  if (a === 'folder') return api.open_folder();
  if (a === 'md') { await doSave(); if (await api.export_markdown(S.id)) toast('Markdown сохранён'); }
  if (a === 'png') { const url = renderPNG(); if (url && await api.save_png(S.id, url)) toast('Картинка сохранена'); }
});
document.addEventListener('click', e => { if (!e.target.closest('#export-menu, #btn-export')) $('#export-menu').classList.add('hidden'); });

// ---------------------------------------------------------------- PNG (рисуем карту на canvas)
function renderPNG() {
  const b = bounds(); if (!b) return null;
  const pad = 60, scale = 2, W = b.x2 - b.x1 + pad * 2, H = b.y2 - b.y1 + pad * 2 + 50;
  const cv = document.createElement('canvas');
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#0a0e17'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e4eaf5'; ctx.font = '600 22px Segoe UI'; ctx.fillText(S.doc.title, pad, 44);
  ctx.translate(pad - b.x1, pad + 50 - b.y1);
  // стрелки
  for (const el of document.querySelectorAll('#edge-g path.edge')) {
    ctx.strokeStyle = el.classList.contains('done') ? '#2f6b47' : '#3d4a63'; ctx.lineWidth = 1.6;
    ctx.stroke(new Path2D(el.getAttribute('d')));
  }
  // карточки — копируем текущие размеры из DOM
  for (const s of S.doc.stages) {
    const sz = S.size[s.id] || { w: STAGE_W, h: 80 }, st = status(s);
    if (s.type === 'milestone') {
      const cx = s.x + sz.w / 2, cy = s.y + 26;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = st === 'done' ? '#eab308' : '#2a2210'; ctx.strokeStyle = '#eab308'; ctx.lineWidth = 2;
      ctx.fillRect(-18, -18, 36, 36); ctx.strokeRect(-18, -18, 36, 36); ctx.restore();
      ctx.fillStyle = '#f1e3b0'; ctx.font = '600 12.5px Segoe UI'; ctx.textAlign = 'center';
      wrap(ctx, s.title, sz.w).forEach((l, i) => ctx.fillText(l, cx, cy + 46 + i * 16)); ctx.textAlign = 'left';
      continue;
    }
    ctx.fillStyle = '#131a29'; ctx.strokeStyle = '#2f3d5a'; ctx.lineWidth = 1;
    rr(ctx, s.x, s.y, sz.w, sz.h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = s.color || (st === 'done' ? '#22c55e' : st === 'active' ? '#3b82f6' : '#2f3d5a');
    ctx.fillRect(s.x + 6, s.y, sz.w - 12, 3);
    // текст карточки берём из DOM, чтобы перенос строк совпадал
    const el = document.querySelector(`.card[data-id="${CSS.escape(s.id)}"]`);
    if (!el) continue;
    const base = el.getBoundingClientRect(), z = S.view.z;
    el.querySelectorAll('.ctitle, .cnt, .cdesc, .tasks li span:last-child, .ctag').forEach(t => {
      const cs = getComputedStyle(t);
      ctx.fillStyle = cs.color; ctx.font = `${cs.fontWeight} ${cs.fontSize} Segoe UI`;
      const tr = t.getBoundingClientRect();
      const lines = wrap(ctx, t.textContent, tr.width / z + 2);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
      lines.forEach((l, i) => ctx.fillText(l, s.x + (tr.left - base.left) / z, s.y + (tr.top - base.top) / z + lh * (i + 0.78)));
    });
    el.querySelectorAll('.task-check').forEach(c => {
      const tr = c.getBoundingClientRect(), x = s.x + (tr.left - base.left) / z, y = s.y + (tr.top - base.top) / z;
      const done = c.parentElement.classList.contains('done');
      ctx.strokeStyle = done ? '#22c55e' : '#2f3d5a'; ctx.fillStyle = '#22c55e'; ctx.lineWidth = 1.5;
      if (done) ctx.fillRect(x, y, 13, 13); else ctx.strokeRect(x + .75, y + .75, 11.5, 11.5);
    });
  }
  for (const n of S.doc.notes) {
    ctx.fillStyle = n.color || '#eab308'; ctx.font = `italic ${n.size || 18}px Segoe UI`;
    n.text.split('\n').forEach((l, i) => ctx.fillText(l, n.x + 4, n.y + (n.size || 18) * (i + 1)));
  }
  return cv.toDataURL('image/png');
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- клавиатура
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
  if (typing) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'я')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'н')) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && (k === 'a' || k === 'ф')) {
    e.preventDefault(); if (!S.doc) return;
    S.sel = new Set([...S.doc.stages.map(s => 's:' + s.id), ...S.doc.notes.map(n => 'n:' + n.id)]); renderAll(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === 'f' || k === 'а')) { e.preventDefault(); $('#search').focus(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?' || (e.code === 'Slash' && e.shiftKey) || e.key === 'F1') { e.preventDefault(); toggleHelp(); return; }
  if (e.key === 'Escape' && !$('#help').classList.contains('hidden')) { toggleHelp(false); return; }
  if (e.key === 'Escape' && !$('#todo').classList.contains('hidden')) { $('#todo').classList.add('hidden'); return; }
  if (e.key === ' ') { spaceDown = true; canvas.classList.add('tool-hand'); e.preventDefault(); return; }
  if (k === 'l' || k === 'д') { toggleLock(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (S.locked) toast('Карта закреплена — можно только отмечать задачи. Снять замок: кнопка с замком или L'); else deleteSelection(); return; }
  if (e.key === 'Escape') {
    if (S.editing) { S.editing = null; renderEditor(); return; }
    S.sel.clear(); S.selEdge = null; setTool('select'); return;
  }
  if (e.key === 'Enter' && S.sel.size === 1 && !S.locked) {
    const k1 = [...S.sel][0];
    if (k1.startsWith('s:')) { S.editing = k1.slice(2); $('#editor').dataset.id = ''; renderEditor(); }
    return;
  }
  const map = { '1': 'hand', h: 'hand', 'р': 'hand', '2': 'select', v: 'select', 'м': 'select', '3': 'stage', s: 'stage', 'ы': 'stage',
    '4': 'milestone', m: 'milestone', 'ь': 'milestone', '5': 'connect', c: 'connect', 'с': 'connect', '6': 'note', t: 'note', 'е': 'note' };
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'f' || k === 'а') fit();
  if (k === 'k' || k === 'л') toggleCritical();
  if (k === '+' || k === '=') $('#z-in').click();
  if (k === '-') $('#z-out').click();
});
document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; canvas.classList.remove('tool-hand'); canvas.classList.add('tool-' + S.tool); } });
window.addEventListener('resize', () => renderMinimap());

// ---------------------------------------------------------------- слежение за файлами (карты от Claude)
async function poll() {
  try {
    const m = await api.mtimes();
    const key = JSON.stringify(m);
    if (key !== S.lastMtimes) {
      S.lastMtimes = key;
      await refreshMaps();
      if (S.id && !(S.id in m)) { S.id = null; S.doc = null; if (S.maps[0]) await openMap(S.maps[0].id); else renderAll(); }
      else if (S.id && !pendingSave && !drag && Math.abs(m[S.id] - S.mtime) > 1e-6) {
        S.undo.push(JSON.stringify(S.doc));
        const sig = s => JSON.stringify([s.title, s.type, s.tasks, s.after, s.description, s.tag, s.flag, s.status]);
        const before = Object.fromEntries(S.doc.stages.map(s => [s.id, sig(s)]));
        await openMap(S.id, { keepView: true });
        const now = performance.now();
        let n = 0;
        for (const s of S.doc.stages) if (before[s.id] !== sig(s)) { S.flash[s.id] = now; n++; }
        if (n) renderCanvas();
        toast(n ? `Карта обновлена из файла · изменено этапов: ${n}` : 'Карта обновлена из файла');
      }
      else if (!S.id && S.maps[0]) await openMap(S.maps[0].id);
    }
  } catch (e) { console.error(e); }
  setTimeout(poll, 1200);
}

// ---------------------------------------------------------------- старт
$('#items').addEventListener('mouseover', e => {
  const c = e.target.closest('.card');
  setHover(c ? c.dataset.id : null);
});
$('#items').addEventListener('mouseleave', () => setHover(null));
$('#btn-help').addEventListener('click', () => toggleHelp());
$('#btn-project').addEventListener('click', () => pickProject());
$('#btn-todo').addEventListener('click', () => openTodo());
$('#btn-crit').addEventListener('click', () => toggleCritical());
$('#cycle-warn').addEventListener('click', () => showCycle());
$('#todo').addEventListener('click', e => {
  const a = e.target.closest('[data-todo]')?.dataset.todo;
  if (a === 'close') $('#todo').classList.add('hidden');
  if (a === 'rescan') openTodo();
  if (a === 'add') addTodos();
});
$('#todo').addEventListener('change', e => {
  if (e.target.dataset.todo === 'all')
    $('#todo').querySelectorAll('input[data-ti]:not(:disabled)').forEach(i => { i.checked = e.target.checked; });
});
$('#help-close').addEventListener('click', () => toggleHelp(false));
$('#help').addEventListener('click', e => { if (e.target.id === 'help') toggleHelp(false); });
$('#btn-anim').addEventListener('click', () => {
  const on = document.body.classList.contains('noanim');
  applyAnim(on);
  try { localStorage.setItem('anim', on ? '1' : '0'); } catch {}
  toast(on ? 'Анимации включены' : 'Анимации выключены');
});
{
  let saved = null; try { saved = localStorage.getItem('anim'); } catch {}
  applyAnim(saved == null ? !matchMedia('(prefers-reduced-motion: reduce)').matches : saved === '1');
}

{ let l = null; try { l = localStorage.getItem('locked'); } catch {} applyLock(l === '1', true); }

async function start() {
  api = window.pywebview.api;
  await refreshMaps();
  let last = null; try { last = localStorage.getItem('lastMap'); } catch {}
  const first = S.maps.find(m => m.id === last) || S.maps[0];
  if (first) await openMap(first.id); else renderAll();
  S.lastMtimes = JSON.stringify(await api.mtimes());
  poll();
}
if (window.pywebview?.api) start(); else window.addEventListener('pywebviewready', start);
