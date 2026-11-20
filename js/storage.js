import { ContractError } from './api.js';

const KEYS = {
  deck: 'studyDeck.deck.v1',
  progress: 'studyDeck.progress.v1',
  prefs: 'studyDeck.prefs.v1',
};

function read(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('unexpected shape');
    }
    return value;
  } catch {
    console.warn(`[storage] ${key} 内容损坏，已按缺省值处理。`);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new ContractError('E_STORAGE_QUOTA');
  }
}

function isValidDeck(d) {
  if (d.schemaVersion !== 1) return false;
  if (typeof d.deckId !== 'string' || !d.deckId) return false;
  if (typeof d.title !== 'string' || typeof d.createdAt !== 'string') return false;
  if (!['image', 'pdf-text', 'pdf-scan', 'mock'].includes(d.sourceType)) return false;
  if (!Array.isArray(d.points) || d.points.length < 1 || d.points.length > 99) return false;
  const ids = new Set();
  for (const p of d.points) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) return false;
    if (typeof p.question !== 'string' || !p.question.trim()) return false;
    if (typeof p.answer !== 'string' || !p.answer.trim()) return false;
    if (p.page !== undefined && (!Number.isInteger(p.page) || p.page < 1)) return false;
    ids.add(p.id);
  }
  return true;
}

export function loadDeck() {
  const deck = read(KEYS.deck, null);
  if (deck !== null && !isValidDeck(deck)) {
    console.warn('[storage] studyDeck.deck.v1 形状不合契约，已按 null 处理。');
    return null;
  }
  return deck;
}

export function saveDeck(deck) {
  write(KEYS.deck, deck);
}

export function loadProgress() {
  return read(KEYS.progress, {});
}

export function saveProgress(map) {
  write(KEYS.progress, map);
}

export function loadPrefs() {
  const prefs = read(KEYS.prefs, { largeText: false });
  return { largeText: prefs.largeText === true };
}

export function savePrefs(prefs) {
  write(KEYS.prefs, prefs);
}

export function clearAll() {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}