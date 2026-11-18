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

export function loadDeck() {
  return read(KEYS.deck, null);
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