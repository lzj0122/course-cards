// js/deck-view.js — M2 step-5 3D 翻转闪卡视图（B 侧）
// 契约：CONTRACT v1.3 §2（A 以 PR #8 发布并确认；B 提案 v0.1 经 D008 双方确认收敛至 v1.3，随 PR #9 留痕）。
//   js/deck.js（A 实现）createDeck(points: Point[]): DeckState
//   DeckState = { total, index, flipped, progress:{current,total}(只读 getter), current():Point, flip(), next(), subscribe(fn):退订 }
//     - 卡片派生自 points[index]（current() 同引用），仅内存状态、不另存第二份；视图零 storage 写入。
//     - flip() 切换正背；next() 推进、末张循环回 0、翻面复位 false（v1.3 无 done 终态，采纳 A 循环语义）。
//   本文件实现 renderDeck(deck, root = #card-stage)：全量渲染 + 就地翻面（保 560ms 过渡）。
//   视图自管理 DOM（不订阅 subscribe 做全量重渲染，以免破坏 560ms 就地过渡）；subscribe 供外部（M2 自评/统计）监听。
//   加性事件（B 提案 extras，A 可忽略）：root 派发 CustomEvent('card-flip',{detail:{index,flipped}}) / ('card-next',{detail:{index}})。
//   先想后看：next 翻面前禁用（视图层行为，DESIGN §5.2 精神；自评按钮 #rate-* 仍门控、不在本步）。
// 视觉：DESIGN §5.2（560ms 依 D028 修订，A #8 v1.3 确认）；键盘 Enter/Space；prefers-reduced-motion 150ms 淡入淡出（css/cards.css）。
// 边界：不改 js/deck.js / js/api.js / js/storage.js / data/mock-points.js；不实现 #rate-remembered/#rate-forgot/#stats-*/#mistake-book（步进门控）；
//       产品 index.html 接线不在本步（A 集成步另行授权）。

const EMPTY_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="18" y="30" width="52" height="38" rx="8" fill="none" stroke="#2E3560" stroke-width="2.5" transform="rotate(-6 44 49)"/><rect x="46" y="46" width="52" height="38" rx="8" fill="#E4E4FB" stroke="#4338CA" stroke-width="2.5" transform="rotate(4 72 65)"/><path d="M56 60h30M56 68h20" stroke="#4338CA" stroke-width="2.5" stroke-linecap="round"/><path d="M22 96c14-6 62-6 76 0" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

export function renderDeck(deck, root = document.getElementById('card-stage')) {
  if (!root) return;
  root.replaceChildren();
  root.classList.add('card-stage');

  /* 空态防御（A createDeck 对空数组抛 E_EMPTY_POINTS，产品路径不会到此；dev/边界保留） */
  if (!deck || deck.total === 0) {
    const box = document.createElement('div');
    box.className = 'card-empty';
    box.innerHTML = EMPTY_SVG; // 静态插图，非用户数据
    const h = document.createElement('h3');
    h.textContent = '还没有闪卡';
    const p = document.createElement('p');
    p.textContent = '先在清单页提取考点，再生成闪卡开始自测。';
    box.append(h, p);
    root.append(box);
    return;
  }

  const pt = deck.current();          // 派生同引用，不另存第二份（v1.3 §2）
  const cur = deck.progress.current;  // 1-based 位置进度
  const total = deck.progress.total;

  /* 进度行 #card-progress（位置进度；自评统计属 #stats-*，门控不实现） */
  const prog = document.createElement('div');
  prog.className = 'card-progress';
  prog.id = 'card-progress';
  const label = document.createElement('span');
  label.setAttribute('aria-live', 'polite');
  label.textContent = `第 ${cur} / ${total} 张`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = `${(cur / total) * 100}%`;
  bar.append(fill);
  prog.append(label, bar);

  /* 3D 卡片 #flip-card */
  const scene = document.createElement('div');
  scene.className = 'card-scene';
  const card = document.createElement('article');
  card.id = 'flip-card';
  card.className = 'card' + (deck.flipped ? ' flipped' : '');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-pressed', String(deck.flipped));
  card.setAttribute('aria-label', `闪卡 ${cur}，点击或按 Enter/空格翻面`);

  const front = document.createElement('div');
  front.className = 'card-face front';
  const ft = document.createElement('span');
  ft.className = 'card-tag';
  ft.textContent = `问题 Q${cur}`;
  const fq = document.createElement('p');
  fq.className = 'card-question';
  fq.textContent = pt.question; // 纯文本，禁 HTML（契约 §1）
  const fh = document.createElement('div');
  fh.className = 'flip-hint';
  fh.textContent = '点击翻面 · Enter / Space';
  front.append(ft, fq, fh);

  const back = document.createElement('div');
  back.className = 'card-face back';
  const bt = document.createElement('span');
  bt.className = 'card-tag';
  bt.textContent = '答案';
  const ba = document.createElement('p');
  ba.className = 'card-answer';
  ba.textContent = pt.answer;
  const bh = document.createElement('div');
  bh.className = 'flip-hint';
  bh.textContent = '点击翻回';
  back.append(bt, ba, bh);

  card.append(front, back);
  scene.append(card);

  /* 下一张 #card-next-btn：先想后看——翻面前禁用（DESIGN §5.2 产品逻辑）；末张循环回 0（v1.3） */
  const next = document.createElement('button');
  next.type = 'button';
  next.id = 'card-next-btn';
  next.className = 'card-next';
  next.textContent = '下一张';
  next.disabled = !deck.flipped;

  root.append(prog, scene, next);

  /* 就地翻面：不重渲染，保 560ms 过渡 */
  let popTimer = 0;
  const doFlip = () => {
    deck.flip();
    card.classList.toggle('flipped', deck.flipped);
    card.setAttribute('aria-pressed', String(deck.flipped));
    next.disabled = !deck.flipped;
    card.classList.add('flipping');
    clearTimeout(popTimer);
    const donePop = () => card.classList.remove('flipping');
    card.addEventListener('transitionend', donePop, { once: true });
    popTimer = setTimeout(donePop, 650); // reduced-motion 无 transitionend 的兜底
    root.dispatchEvent(new CustomEvent('card-flip', { bubbles: true, detail: { index: deck.index, flipped: deck.flipped } }));
  };
  card.addEventListener('click', doFlip);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); doFlip(); }
  });
  next.addEventListener('click', () => {
    const from = deck.index;
    deck.next(); // 末张循环回 0、翻面复位（v1.3）
    root.dispatchEvent(new CustomEvent('card-next', { bubbles: true, detail: { index: from } }));
    renderDeck(deck, root);
    const sc = root.querySelector('.card-scene');
    if (sc) sc.classList.add('enter');
  });
}