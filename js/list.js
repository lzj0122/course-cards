// js/list.js — M1 清单视图（B 侧，feat/m1-list-B）
// 契约：CONTRACT.md v1.0 §2/§3/§6；视觉：DESIGN.md v1.0
// 边界（D013）：不改 js/api.js / js/storage.js / data/mock-points.js；本步只消费 mock，不接 API。
import { mockDeck } from '../data/mock-points.js';
import { loadPrefs, savePrefs } from './storage.js'; // A 侧 storage.js（b37deb2）已就位，按契约 §2 只调用不修改

const $ = (id) => document.getElementById(id);
const root = $('point-list');
const listSection = document.querySelector('.list-section');
const uploadZone = $('upload-zone');
const fileInput = $('file-input');
const useMockBtn = $('use-mock-btn');
const mockBanner = $('mock-banner');
const extractStatus = $('extract-status');
const stageText = extractStatus.querySelector('.stage-text');
const progressEl = extractStatus.querySelector('.progress');
const progressFill = extractStatus.querySelector('.progress-fill');
const uploadError = $('upload-error');
const errorReason = uploadError.querySelector('.error-reason');
const retryBtn = $('retry-btn');
const pointCount = $('point-count');
const selectAll = $('select-all');
const generateBtn = $('generate-deck-btn');
const toastRegion = $('toast-region');
const aaToggle = $('large-text-toggle');

const mockMode = new URLSearchParams(location.search).get('mock') === '1';

let working = [];          // 内存工作副本（编辑/删除/撤销），不写 storage（M2 接 saveDeck）
let selected = new Set();
let editingId = null;
let lastFile = null;
let busy = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const numOf = (id) => pad2(working.findIndex((p) => p.id === id) + 1);

const ICON_EDIT = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16l.8-3.2L13.6 4a1.6 1.6 0 0 1 2.3 0l.1.1a1.6 1.6 0 0 1 0 2.3L7.2 15.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12.4 5.2l2.4 2.4" stroke="currentColor" stroke-width="1.7"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.6A1.1 1.1 0 0 1 9.1 3.5h1.8A1.1 1.1 0 0 1 12 4.6V6m-6.4 0 .7 9.4a1.4 1.4 0 0 0 1.4 1.3h4.6a1.4 1.4 0 0 0 1.4-1.3l.7-9.4M8.3 9v5M11.7 9v5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const EMPTY_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="18" y="30" width="52" height="38" rx="8" fill="none" stroke="#2E3560" stroke-width="2.5" transform="rotate(-6 44 49)"/><rect x="46" y="46" width="52" height="38" rx="8" fill="#E4E4FB" stroke="#4338CA" stroke-width="2.5" transform="rotate(4 72 65)"/><path d="M56 60h30M56 68h20" stroke="#4338CA" stroke-width="2.5" stroke-linecap="round"/><path d="M22 96c14-6 62-6 76 0" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="94" cy="26" r="5" fill="#F59E0B"/><path d="M20 20l4 4M28 16l1 5" stroke="#84CC16" stroke-width="2.5" stroke-linecap="round"/></svg>';

/* ---------------- 契约 §2：renderPoints(points, root) ----------------
   全量替换 root 子节点；纯文本渲染（禁 HTML）；有 page 按页分组、无 page 扁平降级
   （page 为契约 v1.1 待 A 落地的可选字段，见 PR #2 评审异议 1）。 */
export function renderPoints(points, target) {
  target.replaceChildren();
  pointCount.textContent = `共 ${points.length} 个考点`;

  if (points.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = EMPTY_SVG; // 静态插图，非用户数据
    const h = document.createElement('h3');
    h.textContent = '清单还是空的';
    const p = document.createElement('p');
    p.textContent = '上传一张课件截图或一份 PDF，AI 会把独立考点列在这里；也可以先用示例课件看看效果。';
    empty.append(h, p);
    target.append(empty);
    syncSelection();
    return;
  }

  const hasPage = points.some((pt) => Number.isFinite(pt.page));
  const groups = new Map();
  if (hasPage) {
    for (const pt of points) {
      const key = Number.isFinite(pt.page) ? pt.page : Infinity;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pt);
    }
  } else {
    groups.set(null, points);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);

  let i = 0;
  for (const key of keys) {
    const items = groups.get(key);
    const section = document.createElement('section');
    section.className = 'page-group';
    if (key !== null) {
      const head = document.createElement('h3');
      head.className = 'group-head';
      const t = document.createElement('span');
      t.textContent = key === Infinity ? '未标注页' : `第 ${key} 页`;
      const n = document.createElement('span');
      n.className = 'group-n';
      n.textContent = `${items.length} 个考点`;
      head.append(t, n);
      section.append(head);
    }
    const ul = document.createElement('ul');
    ul.className = 'group-rows';
    for (const pt of items) {
      ul.append(buildRow(pt, i));
      i++;
    }
    section.append(ul);
    target.append(section);
  }
  syncSelection();
}

function buildRow(pt, i) {
  const li = document.createElement('li');
  li.className = 'point-row';
  li.dataset.id = pt.id;
  li.style.setProperty('--d', `${Math.min(i * 60, 600)}ms`);

  const check = document.createElement('label');
  check.className = 'row-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'row-select';
  cb.setAttribute('aria-label', `选择考点 ${pad2(i + 1)}`);
  check.append(cb);

  const idx = document.createElement('span');
  idx.className = 'row-index';
  idx.textContent = pad2(i + 1);

  const body = document.createElement('div');
  body.className = 'row-body';
  const q = document.createElement('p');
  q.className = 'row-question';
  q.textContent = pt.question; // 纯文本，禁 HTML（契约 §1）
  body.append(q);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'icon-btn row-edit';
  edit.setAttribute('aria-label', `编辑考点 ${pad2(i + 1)}`);
  edit.innerHTML = ICON_EDIT;
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon-btn row-delete';
  del.setAttribute('aria-label', `删除考点 ${pad2(i + 1)}`);
  del.innerHTML = ICON_DELETE;
  actions.append(edit, del);

  li.append(check, idx, body, actions);
  return li;
}

/* ---------------- 五态控制器：idle / loading / success / error / empty ---------------- */
function setState(s) {
  extractStatus.hidden = s !== 'loading';
  uploadError.hidden = s !== 'error';
  listSection.hidden = !(s === 'success' || s === 'empty');
  uploadZone.setAttribute('aria-busy', String(s === 'loading'));
}

async function runMock() {
  if (busy) return;
  busy = true;
  setState('loading');
  const stages = [['读取课件…', 20], ['识别内容…', 55], ['提取考点…', 85]];
  for (const [text, p] of stages) {
    stageText.textContent = text;
    progressFill.style.width = `${p}%`;
    progressEl.setAttribute('aria-valuenow', String(p));
    await sleep(320);
  }
  progressFill.style.width = '100%';
  progressEl.setAttribute('aria-valuenow', '100');
  await sleep(200);
  const deck = mockDeck(); // 唯一 fixture 来源（契约 §6，D013）
  working = deck.points;
  selected.clear();
  editingId = null;
  renderPoints(working, root);
  setState(working.length ? 'success' : 'empty');
  toast(`已加载示例课件：${working.length} 个考点`, 'success');
  busy = false;
}

function handleFile(file) {
  if (!file) return;
  lastFile = file;
  if (mockMode) {
    runMock(); // mock 路径忽略文件内容（契约 §6）
  } else {
    // B 侧本步不接 API（用户第三步指令）；真实识别 M1-4 集成接通。
    errorReason.textContent = `「${file.name}」已收到。真实识别将在集成阶段（M1-4）接通，当前分支仅消费示例数据：请改用 ?mock=1 打开本页，或点击「使用示例课件」。`;
    setState('error');
  }
}

/* ---------------- toast（§5.6，删除撤销 5s） ---------------- */
function toast(msg, type = 'info', action = null) {
  while (toastRegion.children.length >= 3) toastRegion.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  const m = document.createElement('span');
  m.className = 'toast-msg';
  m.textContent = msg;
  el.append(m);
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismiss(); action.onAction(); });
    el.append(btn);
  }
  toastRegion.append(el);
  timer = setTimeout(dismiss, action ? 5000 : 3500);
}

/* ---------------- 选择 / 全选 ---------------- */
function syncSelection() {
  for (const row of root.querySelectorAll('.point-row')) {
    const on = selected.has(row.dataset.id);
    row.querySelector('.row-select').checked = on;
    row.classList.toggle('selected', on);
  }
  selectAll.checked = working.length > 0 && selected.size === working.length;
  selectAll.indeterminate = selected.size > 0 && !selectAll.checked;
}

selectAll.addEventListener('change', () => {
  selected = selectAll.checked ? new Set(working.map((p) => p.id)) : new Set();
  syncSelection();
});

/* ---------------- 行内编辑 / 删除 + 撤销（只发事件、不改 storage，契约 §2） ---------------- */
function openEditor(id) {
  editingId = id;
  renderPoints(working, root);
  const row = root.querySelector(`.point-row[data-id="${id}"]`);
  const pt = working.find((p) => p.id === id);
  row.classList.add('editing');
  row.replaceChildren();
  const form = document.createElement('div');
  form.className = 'edit-form';
  const lq = document.createElement('label');
  lq.textContent = '问题（1–200 字）';
  const iq = document.createElement('input');
  iq.className = 'edit-q';
  iq.maxLength = 200;
  iq.value = pt.question;
  lq.append(iq);
  const la = document.createElement('label');
  la.textContent = '答案（1–2000 字）';
  const ia = document.createElement('textarea');
  ia.className = 'edit-a';
  ia.maxLength = 2000;
  ia.value = pt.answer;
  la.append(ia);
  const acts = document.createElement('div');
  acts.className = 'edit-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'edit-cancel';
  cancel.textContent = '取消';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'edit-save';
  save.textContent = '保存';
  acts.append(cancel, save);
  form.append(lq, la, acts);
  row.append(form);
  iq.focus();
}

function saveEdit(id) {
  const row = root.querySelector(`.point-row[data-id="${id}"]`);
  const q = row.querySelector('.edit-q').value.trim();
  const a = row.querySelector('.edit-a').value.trim();
  if (q.length < 1 || q.length > 200 || a.length < 1 || a.length > 2000) {
    toast('长度不合契约：问题 1–200 字、答案 1–2000 字', 'error');
    return;
  }
  const pt = working.find((p) => p.id === id);
  pt.question = q;
  pt.answer = a;
  root.dispatchEvent(new CustomEvent('point-edit', { bubbles: true, detail: { id, question: q, answer: a } }));
  editingId = null;
  renderPoints(working, root);
  toast(`考点 ${numOf(id)} 已更新`, 'success');
}

function doDelete(id) {
  const row = root.querySelector(`.point-row[data-id="${id}"]`);
  const num = numOf(id);
  row.classList.add('removing');
  setTimeout(() => {
    const idx = working.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const [removed] = working.splice(idx, 1);
    selected.delete(id);
    root.dispatchEvent(new CustomEvent('point-delete', { bubbles: true, detail: { id } }));
    renderPoints(working, root);
    setState(working.length ? 'success' : 'empty');
    toast(`已删除考点 ${num}`, 'info', {
      label: '撤销',
      onAction: () => {
        working.splice(Math.min(idx, working.length), 0, removed);
        renderPoints(working, root);
        setState('success');
        toast(`考点 ${num} 已恢复`, 'success');
      }
    });
  }, 240);
}

root.addEventListener('click', (e) => {
  const row = e.target.closest('.point-row');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.row-edit')) openEditor(id);
  else if (e.target.closest('.row-delete')) doDelete(id);
  else if (e.target.closest('.edit-save')) saveEdit(id);
  else if (e.target.closest('.edit-cancel')) { editingId = null; renderPoints(working, root); }
});
root.addEventListener('change', (e) => {
  if (!e.target.classList.contains('row-select')) return;
  const id = e.target.closest('.point-row').dataset.id;
  if (e.target.checked) selected.add(id); else selected.delete(id);
  syncSelection();
});

/* ---------------- 上传区（拖拽 + 点选 + 键盘） ---------------- */
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { handleFile(fileInput.files[0]); fileInput.value = ''; });
useMockBtn.addEventListener('click', runMock);
retryBtn.addEventListener('click', () => { if (lastFile) handleFile(lastFile); else setState('idle'); });

/* ---------------- 大字开关（DESIGN §2.3） ----------------
   持久化接 A 的 storage.js loadPrefs/savePrefs（契约 §2，用户确认时序已满足）；
   写失败按 §5 E_STORAGE_QUOTA → toast 提示清理空间。 */
aaToggle.addEventListener('click', () => {
  const on = document.documentElement.classList.toggle('large-text');
  aaToggle.setAttribute('aria-pressed', String(on));
  try {
    savePrefs({ largeText: on });
  } catch (err) {
    toast(err.message || '本地存储写入失败，请清理空间后重试。', 'error');
  }
});

/* ---------------- 生成闪卡（M2 开放） ---------------- */
generateBtn.addEventListener('click', () => {
  toast(`闪卡自测将在 M2 开放${selected.size ? `（已选 ${selected.size} 个考点）` : ''}，当前为清单预览。`, 'info');
});

/* ---------------- init ---------------- */
const prefs = loadPrefs(); // 损坏 JSON 时 storage 内部缺省 + warn，不抛错（契约 §2）
document.documentElement.classList.toggle('large-text', prefs.largeText);
aaToggle.setAttribute('aria-pressed', String(prefs.largeText));
if (mockMode) {
  mockBanner.hidden = false;
  useMockBtn.hidden = false;
}
setState('idle');
renderPoints(working, root);