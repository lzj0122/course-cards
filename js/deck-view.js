// js/deck-view.js — M2 step-5 3D 翻转闪卡视图（B 侧）
// 契约提案 v0.1（随 PR #8 留痕待 A 确认，D027/D008 流程）：
//   js/deck.js（A 实现）createDeck(points: Point[]): Deck
//   Deck = { total, index, flipped, card, done, flip(), next() }
//     - card 派生自 points[index]，不另存第二份；视图零 storage 写入。
//     - flip() 切换正背；next() 进下一张并复位 flipped；index>=total 时 done=true。
//   本文件实现 renderDeck(deck, root = #card-stage)：全量渲染 + 就地翻面（保 560ms 过渡）。
//   事件提案：root 派发 CustomEvent('card-flip', {detail:{index,flipped}}) / ('card-next', {detail:{index}})，供 M2 A 侧监听。
// 视觉：DESIGN §5.2（560ms 依 D027 修订）；键盘 Enter/Space；prefers-reduced-motion 150ms 淡入淡出（css/cards.css）。
// 边界：不改 js/deck.js / js/api.js / js/storage.js / data/mock-points.js；不实现 #rate-remembered/#rate-forgot/#stats-*/#mistake-book（步进门控）；
//       产品 index.html 接线不在本步（A 集成步另行授权）。

const EMPTY_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="18" y="30" width="52" height="38" rx="8" fill="none" stroke="#2E3560" stroke-width="2.5" transform="rotate(-6 44 49)"/><rect x="46" y="46" width="52" height="38" rx="8" fill="#E4E4FB" stroke="#4338CA" stroke-width="2.5" transform="rotate(4 72 65)"/><path d="M56 60h30M56 68h20" stroke="#4338CA" stroke-width="2.5" stroke-linecap="round"/><path d="M22 96c14-6 62-6 76 0" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';
const DONE_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M38 26h44v14a22 22 0 0 1-44 0Z" fill="#ECFCCB" stroke="#84CC16" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 30H26a12 12 0 0 0 12 16M82 30h12a12 12 0 0 1-12 16" fill="none" stroke="#84CC16" stroke-width="2.5"/><path d="M60 62v14M48 90h24l-4-14H52Z" fill="none" stroke="#2E3560" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 98c16-6 56-6 72 0" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="94" cy="22" r="5" fill="#F43F5E"/></svg>';

export function renderDeck(deck, root = document.getElementById('card-stage')) {
  if (!root) return;
  root.replaceChildren();
  root.classList.add('card-stage');

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

  if (deck.done) {
    const box = document.createElement('div');
    box.className = 'card-done';
    box.innerHTML = DONE_SVG;
    const h = document.createElement('h3');
    h.textContent = `本轮 ${deck.total} 张已完成`;
    const p = document.createElement('p');
    p.textContent = '回清单页可调整考点或重新生成；自评与错题本将在后续步骤开放。';
    box.append(h, p);
    root.append(box);
    return;
  }

  /* 进度行（位置进度；自评统计属 #stats-*，门控不实现） */
  const prog = document.createElement('div');
  prog.className = 'card-progress';
  const label = document.createElement('span');
  label.setAttribute('aria-live', 'polite');
  label.textContent = `第 ${deck.index + 1} / ${deck.total} 张`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = `${((deck.index + 1) / deck.total) * 100}%`;
  bar.append(fill);
  prog.append(label, bar);

  /* 3D 卡片 */
  const scene = document.createElement('div');
  scene.className = 'card-scene';
  const card = document.createElement('article');
  card.id = 'flip-card';
  card.className = 'card' + (deck.flipped ? ' flipped' : '');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-pressed', String(deck.flipped));
  card.setAttribute('aria-label', `闪卡 ${deck.index + 1}，点击或按 Enter/空格翻面`);

  const front = document.createElement('div');
  front.className = 'card-face front';
  const ft = document.createElement('span');
  ft.className = 'card-tag';
  ft.textContent = `问题 Q${deck.index + 1}`;
  const fq = document.createElement('p');
  fq.className = 'card-question';
  fq.textContent = deck.card.question; // 纯文本，禁 HTML（契约 §1）
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
  ba.textContent = deck.card.answer;
  const bh = document.createElement('div');
  bh.className = 'flip-hint';
  bh.textContent = '点击翻回';
  back.append(bt, ba, bh);

  card.append(front, back);
  scene.append(card);

  /* 下一张：先想后看——翻面前禁用（DESIGN §5.2 产品逻辑） */
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'card-next';
  next.textContent = deck.index === deck.total - 1 ? '完成本轮' : '下一张';
  next.disabled = !deck.flipped;

  root.append(prog, scene, next);

  /* 就地翻面：不重渲染，保 560ms 过渡 */
  let popTimer = 0;
  const doFlip = () => {
    if (deck.done) return;
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
    deck.next();
    root.dispatchEvent(new CustomEvent('card-next', { bubbles: true, detail: { index: from } }));
    renderDeck(deck, root);
    const sc = root.querySelector('.card-scene');
    if (sc) sc.classList.add('enter');
  });
}