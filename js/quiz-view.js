// js/quiz-view.js — M2 step-6 自测/结果/错题本/消灭战视图（B 侧；CONTRACT v1.4 收敛，D031）
// 契约：CONTRACT v1.4 §2（A PR #11 确认，main 0c388fa）；语义底稿 = §1 ProgressMap 状态机（已定死）：
//   「记住了」attempts+1/correct+1/streak=min(streak+1,2)，streak==2 → mastered=true、inBook=false；
//   「没记住」attempts+1/streak=0/mastered=false/inBook=true；正确率 = Σcorrect/Σattempts（0 → 「—」）。
//   startQuiz(points, opts?:{mode?:'study'|'battle', progress?:ProgressMap, random?:()=>number}): QuizSession
//     - mode study = 全量随机打乱单轮；battle = 消灭战**快照一轮制**（D030 用户裁决）：开局取 inBook 快照打乱，
//       队列走完即 done 进结果页、不中途续轮；移出实时写全局 ProgressMap（持久化归属 A quiz.js）。
//     - 打乱作用于内部队列副本，不改 points 原序；空 points / battle 空书 → E_EMPTY_POINTS；
//       grade 未翻面 → E_NOT_FLIPPED；id 不符 / result 非法 / 重复评分 / done → E_INVALID_PAYLOAD（E_CARD_MISMATCH 不采纳）。
//     grade(cardId,result) 返回 {entry,removed,mastered}（记录+落盘）；next() 才推进（240ms 滑出窗口内 current() 不变）。
//   本文件实现 renderQuiz(quiz, root = #quiz-stage)：自测页（翻面卡 #quiz-card + 自评双钮）／done → 结果页（环图 + 统计 + 错题本 + 消灭战入口）。
//   视图自管理 DOM（就地翻面保 560ms，不订阅 subscribe 全量重渲染）；**视图零 storage 写入**（持久化属状态层）。
//   未翻面不能评分：#rate-remembered/#rate-forgot disabled=!flipped（视图层门控）+ 状态层 E_NOT_FLIPPED 双保险。
//   加性事件（B 提案、A v1.4 确认）：root 派发 quiz-flip{index,flipped} / quiz-grade{id,result,streak,inBook,mastered} /
//     quiz-done{stats} / quiz-battle{bookCount} / quiz-restart{}（消灭战/再测一轮由外部接线调 startQuiz，视图不自启）。
//   接线本步含（D030①）：index.html + js/list.js（B 所有权）#start-quiz-btn / #quiz-back-btn / quiz-battle / quiz-restart。
// 视觉：DESIGN §5.2（560ms 翻面 + 自评后左/右滑出 240ms 描边一闪）、§5.5 徽标、§1.2/§1.4 双钮语义色、§1.3 环图、§5.8（D031 加性）。
// 边界：不改 js/quiz.js / js/api.js / js/storage.js / data/mock-points.js / CONTRACT（A 所有权）。

const TROPHY_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M38 26h44v18c0 14-9 24-22 24S38 58 38 44V26z" fill="#ECFCCB" stroke="#84CC16" stroke-width="2.5"/><path d="M38 32H26c0 12 6 18 14 18M82 32h12c0 12-6 18-14 18" fill="none" stroke="#84CC16" stroke-width="2.5"/><path d="M60 68v12M46 92h28M52 80h16v12H52z" fill="none" stroke="#2E3560" stroke-width="2.5" stroke-linecap="round"/><path d="M24 100c16-6 56-6 72 0" stroke="#F59E0B" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';

const pct = (s) => (s.answered === 0 ? '—' : `${Math.round((s.correct / s.answered) * 1000) / 10}%`);

function badgeOf(entry) {
  const b = document.createElement('span');
  if (entry.mastered) { b.className = 'badge badge-mastered'; b.textContent = '已掌握'; }
  else if (entry.inBook) { b.className = 'badge badge-book'; b.textContent = '错题本'; }
  else if (entry.streak === 1) { b.className = 'badge badge-half'; b.textContent = '1/2'; }
  else { b.className = 'badge badge-new'; b.textContent = '新卡'; }
  return b;
}

export function renderQuiz(quiz, root = document.getElementById('quiz-stage')) {
  if (!root) return;
  root.replaceChildren();
  root.classList.add('quiz-stage');
  if (!quiz) return;
  if (quiz.done) { renderResult(quiz, root); return; }

  /* 空态防御（startQuiz 对空抛 E_EMPTY_POINTS，产品路径不会到此；dev/边界保留） */
  if (quiz.total === 0) {
    const box = document.createElement('div');
    box.className = 'card-empty';
    box.innerHTML = TROPHY_SVG; // 静态插图，非用户数据
    const h = document.createElement('h3');
    h.textContent = '没有可自测的闪卡';
    const p = document.createElement('p');
    p.textContent = '先在清单页提取考点，再生成闪卡开始自测。';
    box.append(h, p);
    root.append(box);
    return;
  }

  const pt = quiz.current();          // 派生同引用，不另存第二份
  const cur = quiz.progress.current;
  const total = quiz.progress.total;
  const entry = quiz.entry(pt.id);

  /* 进度行 #quiz-progress（位置进度 + 消灭战标记；统计属结果页 #stats-*） */
  const prog = document.createElement('div');
  prog.className = 'card-progress';
  prog.id = 'quiz-progress';
  const label = document.createElement('span');
  label.setAttribute('aria-live', 'polite');
  label.textContent = `第 ${cur} / ${total} 张`;
  prog.append(label);
  if (quiz.mode === 'battle') {
    const tag = document.createElement('span');
    tag.className = 'badge badge-book';
    tag.textContent = '消灭战';
    prog.append(tag);
  }
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  fill.style.width = `${(cur / total) * 100}%`;
  bar.append(fill);
  prog.append(bar);

  /* 翻面卡 #quiz-card（不复用 #flip-card，§3 全局唯一；结构复用 cards.css §5.2：560ms 就地翻面） */
  const scene = document.createElement('div');
  scene.className = 'card-scene';
  const card = document.createElement('article');
  card.id = 'quiz-card';
  card.className = 'card' + (quiz.flipped ? ' flipped' : '');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-pressed', String(quiz.flipped));
  card.setAttribute('aria-label', `自测卡 ${cur}，点击或按 Enter/空格翻面看答案`);

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
  front.append(badgeOf(entry), ft, fq, fh);

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
  bh.textContent = '点击翻回 · 翻面后在下方评分';
  back.append(bt, ba, bh);

  card.append(front, back);
  scene.append(card);

  /* 自评双钮：未翻面不能评分（先想后看）；语义色 DESIGN §1.2/§1.4 */
  const rate = document.createElement('div');
  rate.className = 'quiz-rate';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.id = 'rate-remembered';
  yes.className = 'rate-btn';
  yes.textContent = '记住了';
  const no = document.createElement('button');
  no.type = 'button';
  no.id = 'rate-forgot';
  no.className = 'rate-btn';
  no.textContent = '没记住';
  yes.disabled = no.disabled = !quiz.flipped;
  rate.append(yes, no);
  const hint = document.createElement('div');
  hint.className = 'rate-hint';
  const setHint = () => {
    hint.textContent = quiz.flipped
      ? '连续答对 2 次即掌握并移出错题本'
      : '先翻面看答案，再评分（先想后看）';
  };
  setHint();

  root.append(prog, scene, rate, hint);

  /* 就地翻面：不重渲染，保 560ms 过渡 */
  let popTimer = 0;
  let leaving = false;
  const doFlip = () => {
    if (leaving) return;
    quiz.flip();
    card.classList.toggle('flipped', quiz.flipped);
    card.setAttribute('aria-pressed', String(quiz.flipped));
    yes.disabled = no.disabled = !quiz.flipped;
    setHint();
    card.classList.add('flipping');
    clearTimeout(popTimer);
    const donePop = () => card.classList.remove('flipping');
    card.addEventListener('transitionend', donePop, { once: true });
    popTimer = setTimeout(donePop, 650); // reduced-motion 无 transitionend 的兜底
    root.dispatchEvent(new CustomEvent('quiz-flip', { bubbles: true, detail: { index: quiz.index, flipped: quiz.flipped } }));
  };
  card.addEventListener('click', doFlip);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); doFlip(); }
  });

  /* 评分 → §5.2 滑出 240ms（没记住左/coral、记住了右/acid）→ next → 重渲染或结果页 */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doGrade = (result) => {
    if (leaving || !quiz.flipped) return;
    leaving = true;
    yes.disabled = no.disabled = true;
    const id = pt.id;
    const ret = quiz.grade(id, result); // v1.4：grade 记录+落盘，返回 {entry,removed,mastered}
    const e = ret.entry;
    root.dispatchEvent(new CustomEvent('quiz-grade', { bubbles: true, detail: { id, result, streak: e.streak, inBook: e.inBook, mastered: e.mastered } }));
    card.classList.add(result === 'forgot' ? 'out-left' : 'out-right');
    setTimeout(() => {
      quiz.next(); // 轮末即 done（study 全量单轮 / battle 快照一轮制，不中途续轮）
      if (quiz.done) root.dispatchEvent(new CustomEvent('quiz-done', { bubbles: true, detail: { stats: quiz.stats } }));
      renderQuiz(quiz, root);
      if (!quiz.done) root.querySelector('.card-scene')?.classList.add('enter');
    }, reduced ? 0 : 240);
  };
  yes.addEventListener('click', () => doGrade('remembered'));
  no.addEventListener('click', () => doGrade('forgot'));
}

/* 结果页：环图（§1.3 三段 + 直接数值标签）+ 统计 + 错题本 + 消灭战/再测入口 */
function renderResult(quiz, root) {
  const s = quiz.stats;
  const box = document.createElement('div');
  box.className = 'quiz-result';
  box.id = 'quiz-result';

  const h = document.createElement('h2');
  h.className = 'result-title';
  h.textContent = quiz.mode === 'battle' ? '消灭战结束' : '本轮自测完成';
  box.append(h);

  /* 环图三段：acid=已掌握 / coral=错题本 / indigo=其余；中心正确率直接数值（不靠颜色单独传义） */
  const total = Math.max(1, quiz.pointCount);
  const mastered = Math.min(s.mastered, total);
  const book = Math.min(s.bookCount, total - mastered);
  const rest = total - mastered - book;
  const C = 2 * Math.PI * 54;
  const seg = (n) => (n / total) * C;
  const ring = document.createElement('div');
  ring.className = 'result-ring';
  ring.innerHTML = `<svg viewBox="0 0 140 140" role="img" aria-label="掌握 ${mastered} 张、错题本 ${book} 张、其余 ${rest} 张；正确率 ${pct(s)}">
<circle cx="70" cy="70" r="54" fill="none" stroke="#E4E4FB" stroke-width="14"/>
<circle cx="70" cy="70" r="54" fill="none" stroke="#84CC16" stroke-width="14" stroke-dasharray="${seg(mastered)} ${C}" transform="rotate(-90 70 70)"/>
<circle cx="70" cy="70" r="54" fill="none" stroke="#F43F5E" stroke-width="14" stroke-dasharray="${seg(book)} ${C}" stroke-dashoffset="${-seg(mastered)}" transform="rotate(-90 70 70)"/>
<circle cx="70" cy="70" r="54" fill="none" stroke="#4338CA" stroke-width="14" stroke-dasharray="${seg(rest)} ${C}" stroke-dashoffset="${-(seg(mastered) + seg(book))}" transform="rotate(-90 70 70)"/>
<text x="70" y="66" text-anchor="middle" class="ring-num">${pct(s)}</text>
<text x="70" y="86" text-anchor="middle" class="ring-label">正确率</text></svg>`; // 仅数值插值，非用户数据
  const acc = document.createElement('span');
  acc.id = 'stats-accuracy';
  acc.className = 'sr-only';
  acc.textContent = `正确率 ${pct(s)}`;
  ring.append(acc);
  const legend = document.createElement('div');
  legend.className = 'ring-legend';
  for (const [cls, text] of [['badge-mastered', `已掌握 ${mastered}`], ['badge-book', `错题本 ${book}`], ['badge-new', `其余 ${rest}`]]) {
    const li = document.createElement('span');
    li.className = `badge ${cls}`;
    li.textContent = text;
    legend.append(li);
  }
  box.append(ring, legend);

  /* 统计盒：已掌握数 + 已作答/答对（正确率分母 = 已作答数，CONTRACT §1） */
  const stats = document.createElement('div');
  stats.className = 'result-stats';
  const b1 = document.createElement('div');
  b1.className = 'stat-box';
  const n1 = document.createElement('div');
  n1.className = 'stat-num';
  n1.id = 'stats-mastered';
  n1.textContent = String(s.mastered);
  const l1 = document.createElement('div');
  l1.className = 'stat-label';
  l1.textContent = '已掌握';
  b1.append(n1, l1);
  const b2 = document.createElement('div');
  b2.className = 'stat-box';
  const n2 = document.createElement('div');
  n2.className = 'stat-num';
  n2.textContent = String(s.answered);
  const l2 = document.createElement('div');
  l2.className = 'stat-label';
  l2.textContent = `已作答 · 答对 ${s.correct}`;
  b2.append(n2, l2);
  stats.append(b1, b2);
  box.append(stats);

  /* 错题本 #mistake-book（空态奖杯插图，禁裸「暂无数据」§5.6） */
  const bookWrap = document.createElement('section');
  bookWrap.className = 'quiz-book';
  const bh = document.createElement('h3');
  bh.textContent = `错题本（${s.bookCount}）`;
  bookWrap.append(bh);
  const list = document.createElement('ul');
  list.id = 'mistake-book';
  const bookPts = quiz.book();
  if (bookPts.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'book-empty';
    empty.innerHTML = TROPHY_SVG; // 静态插图，非用户数据
    const eh = document.createElement('h4');
    eh.textContent = '错题本已清空';
    const ep = document.createElement('p');
    ep.textContent = '全部考点连续答对 2 次，保持住！';
    empty.append(eh, ep);
    list.append(empty);
  } else {
    for (const p of bookPts) {
      const li = document.createElement('li');
      li.className = 'book-row';
      li.append(badgeOf(quiz.entry(p.id)));
      const q = document.createElement('span');
      q.className = 'book-q';
      q.textContent = p.question; // 纯文本
      li.append(q);
      list.append(li);
    }
  }
  bookWrap.append(list);
  box.append(bookWrap);

  /* 消灭战入口（空书禁用）+ 再测一轮；启动由外部接线（加性事件） */
  const actions = document.createElement('div');
  actions.className = 'quiz-actions';
  const battle = document.createElement('button');
  battle.type = 'button';
  battle.id = 'battle-btn';
  battle.textContent = s.bookCount ? `消灭战 · ${s.bookCount} 张` : '消灭战';
  battle.disabled = s.bookCount === 0;
  battle.addEventListener('click', () => root.dispatchEvent(new CustomEvent('quiz-battle', { bubbles: true, detail: { bookCount: s.bookCount } })));
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.id = 'quiz-restart-btn';
  restart.textContent = '再测一轮';
  restart.addEventListener('click', () => root.dispatchEvent(new CustomEvent('quiz-restart', { bubbles: true, detail: {} })));
  actions.append(battle, restart);
  box.append(actions);

  root.append(box);
}