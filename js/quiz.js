// js/quiz.js — M2 第六步自测状态机（A 实现；契约 CONTRACT v1.4 §2，D030）。
// 随机打乱、先看答案再评分、streak/mastered/错题本按 §1；ProgressMap 经 storage 持久化。
// grade 只记录+落盘，next 才推进（deck.js 族风格；视图 240ms 滑出窗口内 current() 不变）。
import { ContractError } from './api.js';
import * as storage from './storage.js';

const DEFAULT_ENTRY = { streak: 0, mastered: false, inBook: false, attempts: 0, correct: 0 };

function normalizeEntry(raw) {
  const e = { ...DEFAULT_ENTRY };
  if (!raw || typeof raw !== 'object') return e;
  const int = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
  e.attempts = int(raw.attempts, Infinity);
  e.correct = Math.min(int(raw.correct, Infinity), e.attempts);
  e.streak = int(raw.streak, 2);
  e.mastered = raw.mastered === true;
  e.inBook = raw.inBook === true;
  return e;
}

function normalizeMap(map) {
  const out = {};
  if (map && typeof map === 'object') {
    for (const [id, raw] of Object.entries(map)) out[id] = normalizeEntry(raw);
  }
  return out;
}

function shuffle(points, random) {
  const a = [...points];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function statsOf(points, map) {
  let attempts = 0;
  let correct = 0;
  let mastered = 0;
  let bookCount = 0;
  for (const p of points) {
    const e = map[p.id];
    if (!e) continue;
    attempts += e.attempts;
    correct += e.correct;
    if (e.mastered) mastered++;
    if (e.inBook) bookCount++;
  }
  return { answered: attempts, correct, accuracy: attempts > 0 ? correct / attempts : null, mastered, bookCount };
}

export function getBook(points, progress = storage.loadProgress()) {
  const map = normalizeMap(progress);
  return points.filter((p) => map[p.id]?.inBook === true);
}

export function getStats(points, progress = storage.loadProgress()) {
  return statsOf(points, normalizeMap(progress));
}

export function startQuiz(points, opts = {}) {
  if (!Array.isArray(points) || points.length === 0) throw new ContractError('E_EMPTY_POINTS');
  const mode = opts.mode ?? 'study';
  if (mode !== 'study' && mode !== 'battle') throw new ContractError('E_INVALID_PAYLOAD', '自测模式仅支持 study/battle。');
  const random = opts.random ?? Math.random;
  const progress = opts.progress ? normalizeMap(opts.progress) : normalizeMap(storage.loadProgress());
  // battle = 消灭战快照一轮制（D030 用户裁决）：开局取 inBook 快照，队列走完即 done；移出实时写全局 ProgressMap。
  const pool = mode === 'battle' ? points.filter((p) => progress[p.id]?.inBook === true) : points;
  const queue = shuffle(pool, random);
  if (queue.length === 0) throw new ContractError('E_EMPTY_POINTS', '错题本为空，没有可消灭的卡片。');

  let index = 0;
  let flipped = false;
  let graded = false;
  let done = false;
  let answered = 0;
  let correct = 0;
  let removed = 0;
  const listeners = new Set();
  const notify = () => { for (const fn of [...listeners]) fn(session); };

  const session = {
    get mode() { return mode; },
    get pointCount() { return points.length; },
    get total() { return queue.length; },
    get index() { return index; },
    get flipped() { return flipped; },
    get done() { return done; },
    get progress() { return { current: Math.min(index + 1, queue.length), total: queue.length }; },
    get round() { return { answered, correct, removed, accuracy: answered > 0 ? correct / answered : null }; },
    get stats() { return statsOf(points, progress); },
    current() { return done ? null : queue[index]; },
    entry(id) { return normalizeEntry(progress[id]); },
    map() { return normalizeMap(progress); },
    book() { return points.filter((p) => progress[p.id]?.inBook === true); },
    flip() {
      if (done) return;
      flipped = !flipped;
      notify();
    },
    grade(cardId, result) {
      if (done) throw new ContractError('E_INVALID_PAYLOAD', '本轮自测已结束。');
      if (result !== 'remembered' && result !== 'forgot') throw new ContractError('E_INVALID_PAYLOAD', '评分仅支持 remembered/forgot。');
      if (!flipped) throw new ContractError('E_NOT_FLIPPED');
      if (cardId !== queue[index].id) throw new ContractError('E_INVALID_PAYLOAD', '评分卡片与当前卡不一致。');
      if (graded) throw new ContractError('E_INVALID_PAYLOAD', '本卡已评分，请先 next 推进。');
      const card = queue[index];
      const entry = normalizeEntry(progress[card.id]);
      const wasInBook = entry.inBook;
      entry.attempts += 1;
      if (result === 'remembered') {
        entry.correct += 1;
        entry.streak = Math.min(entry.streak + 1, 2);
        if (entry.streak === 2) {
          entry.mastered = true;
          entry.inBook = false;
        }
      } else {
        entry.streak = 0;
        entry.mastered = false;
        entry.inBook = true;
      }
      progress[card.id] = entry;
      storage.saveProgress(progress);
      graded = true;
      answered += 1;
      if (result === 'remembered') correct += 1;
      const removedNow = wasInBook && !entry.inBook;
      if (removedNow) removed += 1;
      notify();
      return { entry: { ...entry }, removed: removedNow, mastered: entry.mastered };
    },
    next() {
      if (done) return;
      index += 1;
      flipped = false;
      graded = false;
      if (index >= queue.length) done = true;
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return session;
}