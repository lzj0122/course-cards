// 用法：node tools/contract-check.mjs —— CONTRACT §8 A 侧自检，仓库内可复跑（PR #2 备注 1）
import { extractPoints, ContractError } from '../js/api.js';
import { createDeck } from '../js/deck.js';
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

// ---- 第五步：deck 状态机（v1.3 §2，派生自 points、不另存）----
const dk = createDeck(MOCK_POINTS);
ok('createDeck 派生 current/total/progress 且同引用', dk.current() === MOCK_POINTS[0] && dk.total === 12 && dk.progress.current === 1 && dk.progress.total === 12 && dk.index === 0 && dk.flipped === false);
let notes = 0;
const unsub = dk.subscribe(() => { notes++; });
dk.flip();
ok('flip() 切换翻面并通知', dk.flipped === true && notes === 1);
dk.next();
ok('next() 推进+翻面复位+progress', dk.index === 1 && dk.flipped === false && dk.progress.current === 2 && notes === 2);
for (let i = 0; i < 11; i++) dk.next();
ok('next() 末张循环回 0', dk.index === 0 && dk.current() === MOCK_POINTS[0]);
const notesBeforeUnsub = notes;
unsub();
dk.flip();
ok('unsubscribe 后不再通知', notes === notesBeforeUnsub);
ok('空数组抛 E_EMPTY_POINTS', (() => { try { createDeck([]); return false; } catch (e) { return e.code === 'E_EMPTY_POINTS'; } })());
ok('非数组抛 E_EMPTY_POINTS', (() => { try { createDeck(null); return false; } catch (e) { return e.code === 'E_EMPTY_POINTS'; } })());
const sizeBefore = store.size;
createDeck(MOCK_POINTS).next();
ok('状态机零 storage 写入（不另存第二份）', store.size === sizeBefore);

// ---- 第五步：loadDeck 形状校验（v1.3 §2，损坏→null+warn）----
const badDeck = (mut) => { const d = structuredClone(mockDeck()); mut(d); localStorage.setItem('studyDeck.deck.v1', JSON.stringify(d)); return storage.loadDeck() === null; };
ok('schemaVersion≠1 → null', badDeck((d) => { d.schemaVersion = 2; }));
ok('points 非数组 → null', badDeck((d) => { d.points = 'x'; }));
ok('points 0 条 → null', badDeck((d) => { d.points = []; }));
ok('point 缺 answer → null', badDeck((d) => { delete d.points[0].answer; }));
ok('id 重复 → null', badDeck((d) => { d.points[1].id = d.points[0].id; }));
ok('page 非 ≥1 整数 → null', badDeck((d) => { d.points[0].page = 0; }));
ok('deckId 缺失 → null', badDeck((d) => { delete d.deckId; }));
storage.saveDeck(mockDeck());
ok('合法 deck 形状校验通过往返', JSON.stringify(storage.loadDeck()) === JSON.stringify(mockDeck()));

// ---- 第四步：真实链路客户端（fetch-stub，不依赖 DOM）----
import { requestPoints } from '../js/api.js';
import { createHandler } from '../functions/handler.mjs';

const realFetch = globalThis.fetch;
const setFetch = (fn) => { globalThis.fetch = fn; };
const okPoints = { ok: true, points: [{ question: ' q1 ', answer: ' a1 ' }, { question: 'q2', answer: 'a2' }] };

setFetch(async () => Response.json(okPoints));
const rp = await requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text', ['w']);
ok('requestPoints 解析+trim+id 赋值', rp.deck.points.map((p) => p.id).join() === 'p01,p02' && rp.deck.points[0].question === 'q1' && rp.deck.points[0].answer === 'a1');
ok('requestPoints deck 形状/sourceType/warnings', rp.deck.schemaVersion === 1 && rp.deck.sourceType === 'pdf-text' && rp.deck.deckId.startsWith('d') && rp.warnings.join() === 'w');

let calls = 0;
setFetch(async () => { calls++; if (calls === 1) throw new TypeError('net'); return Response.json(okPoints); });
const retried = await requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text');
ok('E_NETWORK 自动重试 1 次后成功', calls === 2 && retried.deck.points.length === 2);

calls = 0;
setFetch(async () => { calls++; throw new TypeError('net'); });
ok('重试耗尽仍 E_NETWORK（共 2 次）', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_NETWORK' && calls === 2);

calls = 0;
setFetch(async () => { calls++; return Response.json({ ok: false, code: 'E_EMPTY_POINTS', message: 'x' }); });
ok('非瞬态错误不重试', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_EMPTY_POINTS' && calls === 1);

calls = 0;
setFetch(async () => { calls++; return Response.json({ ok: false, code: 'E_SERVICE_NOT_CONFIGURED', message: 'x' }); });
ok('service_not_configured 映射且不重试', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_SERVICE_NOT_CONFIGURED' && calls === 1);

setFetch(async () => Response.json({ ok: true, points: [{ question: '', answer: 'a' }] }));
ok('空 question → E_INVALID_PAYLOAD', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_INVALID_PAYLOAD');
setFetch(async () => Response.json({ ok: true, points: [] }));
ok('0 条 → E_EMPTY_POINTS', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_EMPTY_POINTS');
setFetch(async () => new Response('<html>'));
ok('非 JSON 响应 → E_SERVICE_NOT_CONFIGURED（降级，D023）', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_SERVICE_NOT_CONFIGURED');
setFetch(async () => new Response('not found', { status: 404 }));
ok('404 → E_SERVICE_NOT_CONFIGURED（降级，D023）', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_SERVICE_NOT_CONFIGURED');
setFetch(async () => Response.json({ ok: false, code: 'WEIRD', message: 'x' }));
ok('未知 ok:false code → E_UPSTREAM', await codeOf(requestPoints({ kind: 'text', text: 't', fileName: 'f' }, 'pdf-text')) === 'E_UPSTREAM');
setFetch(realFetch);

// ---- 第四步：Function handler 逻辑（注入 getSecret/fetchImpl，无真实密钥）----
const mkReq = (body, method = 'POST', path = '/functions/v1/app/extract') =>
  new Request('http://local' + path, { method, body: method === 'POST' ? JSON.stringify(body) : undefined });
const upstreamOk = (content) => async () => Response.json({ choices: [{ message: { content } }] });

let h = createHandler({ getSecret: () => undefined, fetchImpl: upstreamOk('[]') });
let r = await (await h(mkReq({ kind: 'text', text: 't' }))).json();
ok('Function 未配密钥 → E_SERVICE_NOT_CONFIGURED', r.ok === false && r.code === 'E_SERVICE_NOT_CONFIGURED');

h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: upstreamOk('[{"question":"q","answer":"a"}]') });
r = await (await h(mkReq({ kind: 'text', text: 't', fileName: 'f' }))).json();
ok('Function 文本通道 ok:true + points', r.ok === true && r.points.length === 1 && r.points[0].question === 'q');

h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: upstreamOk('```json\n[{"question":"q","answer":"a"}]\n```') });
r = await (await h(mkReq({ kind: 'text', text: 't' }))).json();
ok('Function 剥离代码块解析', r.ok === true && r.points.length === 1);

let seenModel = null;
h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: async (url, opt) => { seenModel = JSON.parse(opt.body).model; return Response.json({ choices: [{ message: { content: '[{"question":"q","answer":"a"}]' } }] }); } });
await (await h(mkReq({ kind: 'text', text: 't' }))).json();
ok('文本通道用 qwen-plus', seenModel === 'qwen-plus');
await (await h(mkReq({ kind: 'images', images: ['data:image/jpeg;base64,x'] }))).json();
ok('视觉通道用 qwen3-vl-plus（D022）', seenModel === 'qwen3-vl-plus');

h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: upstreamOk('[]') });
r = await (await h(mkReq({ kind: 'text', text: 't' }))).json();
ok('Function 0 条 → E_EMPTY_POINTS', r.ok === false && r.code === 'E_EMPTY_POINTS');

h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: async () => new Response('err', { status: 500 }) });
r = await (await h(mkReq({ kind: 'text', text: 't' }))).json();
ok('Function 上游非 200 → E_UPSTREAM', r.ok === false && r.code === 'E_UPSTREAM');

h = createHandler({ getSecret: () => 'TEST_KEY', fetchImpl: upstreamOk('[]') });
ok('Function GET → 405', (await h(mkReq({}, 'GET'))).status === 405);
ok('Function 未知路径 → 404', (await h(mkReq({ kind: 'text', text: 't' }, 'POST', '/functions/v1/app/other'))).status === 404);
r = await (await h(mkReq({ kind: 'bogus' }))).json();
ok('Function kind 非法 → E_INVALID_PAYLOAD', r.ok === false && r.code === 'E_INVALID_PAYLOAD');

console.log(`contract-check: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);