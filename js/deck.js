// js/deck.js — M2 第五步卡片状态机（A 实现；契约 CONTRACT v1.3 §2）。
// 卡片从 studyDeck.points 派生，仅内存状态，不另存第二份（用户第五步）。
import { ContractError } from './api.js';

export function createDeck(points) {
  if (!Array.isArray(points) || points.length === 0) throw new ContractError('E_EMPTY_POINTS');
  let index = 0;
  let flipped = false;
  const listeners = new Set();
  const notify = () => { for (const fn of [...listeners]) fn(deck); };
  const deck = {
    get total() { return points.length; },
    get index() { return index; },
    get flipped() { return flipped; },
    get progress() { return { current: index + 1, total: points.length }; },
    current() { return points[index]; },
    flip() { flipped = !flipped; notify(); },
    next() { index = (index + 1) % points.length; flipped = false; notify(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return deck;
}