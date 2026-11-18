// 用法：node tools/contract-check.mjs —— CONTRACT §8 A 侧自检，仓库内可复跑（PR #2 备注 1）
import { extractPoints, ContractError } from '../js/api.js';
import * as storage from '../js/storage.js';
import { mockDeck, MOCK_POINTS } from '../data/mock-points.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
};
const codeOf = async (promise) => {
  try { await promise; return null; } catch (e) { return e.code; }
};

const { deck, warnings } = await extractPoints(new File(['x'], 'a.png', { type: 'image/png' }));
ok('extractPoints 返回 12 条 mock', deck.points.length === 12);
ok('schemaVersion/deckId/sourceType/createdAt', deck.schemaVersion === 1 && deck.deckId === 'd-mock' && deck.sourceType === 'mock' && deck.createdAt === '2026-11-18T00:00:00.000Z');
ok('warnings 含 mock', warnings.some((w) => w.includes('mock')));
ok('id 序列 p01…p12 且与 fixture 一致', deck.points.map((p) => p.id).join() === MOCK_POINTS.map((p) => p.id).join());
ok('question 1–200 / answer 1–2000', deck.points.every((p) => p.question.trim().length >= 1 && p.question.length <= 200 && p.answer.trim().length >= 1 && p.answer.length <= 2000));
ok('v1.1 页码 p01–p07→1、p08→2、p09–p12→3', deck.points.map((p) => p.page).join() === '1,1,1,1,1,1,1,2,3,3,3,3');
ok('page 为 ≥1 整数', deck.points.every((p) => Number.isInteger(p.page) && p.page >= 1));
ok('pdf 类型放行返回 mock', (await extractPoints(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))).deck.points.length === 12);
ok('E_UNSUPPORTED_TYPE（text/plain）', await codeOf(extractPoints(new File(['x'], 'a.txt', { type: 'text/plain' }))) === 'E_UNSUPPORTED_TYPE');
ok('E_UNSUPPORTED_TYPE（null）', await codeOf(extractPoints(null)) === 'E_UNSUPPORTED_TYPE');
ok('E_FILE_TOO_LARGE（21MB）', await codeOf(extractPoints(new File([new ArrayBuffer(21 * 1024 * 1024)], 'b.pdf', { type: 'application/pdf' }))) === 'E_FILE_TOO_LARGE');
ok('ContractError 是 Error 且中文 message', new ContractError('E_NETWORK') instanceof Error && /[一-龥]/.test(new ContractError('E_NETWORK').message));
ok('10 错误码文案齐备', ['E_UNSUPPORTED_TYPE', 'E_FILE_TOO_LARGE', 'E_TOO_MANY_PAGES', 'E_PDF_PARSE', 'E_EMPTY_POINTS', 'E_SERVICE_NOT_CONFIGURED', 'E_NETWORK', 'E_UPSTREAM', 'E_INVALID_PAYLOAD', 'E_STORAGE_QUOTA'].every((c) => /[一-龥]/.test(new ContractError(c).message)));

storage.saveDeck(mockDeck());
ok('deck 读写往返', JSON.stringify(storage.loadDeck()) === JSON.stringify(mockDeck()));
const map = { p01: { streak: 1, mastered: false, inBook: false, attempts: 1, correct: 1 } };
storage.saveProgress(map);
ok('progress 读写往返', JSON.stringify(storage.loadProgress()) === JSON.stringify(map));
storage.savePrefs({ largeText: true });
ok('prefs 读写往返', storage.loadPrefs().largeText === true);
localStorage.setItem('studyDeck.deck.v1', '{bad');
localStorage.setItem('studyDeck.progress.v1', '[1,2');
localStorage.setItem('studyDeck.prefs.v1', '"str"');
ok('损坏 JSON → deck null', storage.loadDeck() === null);
ok('损坏 JSON → progress {}', JSON.stringify(storage.loadProgress()) === '{}');
ok('损坏 JSON → prefs 缺省', storage.loadPrefs().largeText === false);
const orig = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
let quotaCode = null;
try { storage.saveDeck(mockDeck()); } catch (e) { quotaCode = e.code; }
localStorage.setItem = orig;
ok('写失败抛 E_STORAGE_QUOTA', quotaCode === 'E_STORAGE_QUOTA');
localStorage.setItem('studyDeck.dev.unrelated', '1');
storage.clearAll();
ok('clearAll 只清三 key', localStorage.getItem('studyDeck.deck.v1') === null && localStorage.getItem('studyDeck.progress.v1') === null && localStorage.getItem('studyDeck.prefs.v1') === null && localStorage.getItem('studyDeck.dev.unrelated') === '1');

console.log(`contract-check: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);