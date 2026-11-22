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

// ---- 第六步：quiz 自测状态机（v1.4 §2，D030）----
import { startQuiz, getBook, getStats } from '../js/quiz.js';
storage.clearAll();
const lcg = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const playAll = (s, result = 'remembered') => {
  const order = [];
  while (!s.done) { order.push(s.current().id); s.flip(); s.grade(s.current().id, result); s.next(); }
  return order;
};
const syncCode = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

const order1 = playAll(startQuiz(MOCK_POINTS, { random: lcg(7), progress: {} }));
ok('study 队列=12 张全排列', order1.length === 12 && [...order1].sort().join() === MOCK_POINTS.map((p) => p.id).sort().join());
ok('打乱不 mutate 源 points', MOCK_POINTS.map((p) => p.id).join() === 'p01,p02,p03,p04,p05,p06,p07,p08,p09,p10,p11,p12');
ok('同 seed 同序（random 可注入）', playAll(startQuiz(MOCK_POINTS, { random: lcg(7), progress: {} })).join() === order1.join());
ok('异 seed 异序', playAll(startQuiz(MOCK_POINTS, { random: lcg(99), progress: {} })).join() !== order1.join());
ok('current() 与源 point 同引用', MOCK_POINTS.includes(startQuiz(MOCK_POINTS, { progress: {} }).current()));

const one = () => startQuiz([MOCK_POINTS[0]], { progress: {} });
ok('未翻面评分 → E_NOT_FLIPPED', syncCode(() => one().grade('p01', 'remembered')) === 'E_NOT_FLIPPED');
ok('非法 result → E_INVALID_PAYLOAD', syncCode(() => { const s = one(); s.flip(); s.grade('p01', 'x'); }) === 'E_INVALID_PAYLOAD');
ok('cardId 非当前卡 → E_INVALID_PAYLOAD', syncCode(() => { const s = one(); s.flip(); s.grade('p02', 'remembered'); }) === 'E_INVALID_PAYLOAD');
ok('同卡重复 grade → E_INVALID_PAYLOAD', syncCode(() => { const s = one(); s.flip(); s.grade('p01', 'remembered'); s.grade('p01', 'remembered'); }) === 'E_INVALID_PAYLOAD');
ok('next 可跳过未评分卡', (() => { const s = one(); s.next(); return s.index === 1 && s.round.answered === 0 && s.done === true; })());
const doneS = one(); doneS.flip(); doneS.grade('p01', 'remembered'); doneS.next();
ok('done 后评分 → E_INVALID_PAYLOAD', syncCode(() => doneS.grade('p01', 'remembered')) === 'E_INVALID_PAYLOAD');
doneS.flip(); doneS.next();
ok('done 后 flip/next no-op', doneS.flipped === false && doneS.index === 1);

storage.clearAll();
const a = startQuiz([MOCK_POINTS[0]]); a.flip();
const ra = a.grade('p01', 'forgot'); a.next();
ok('没记住：streak0/inBook/attempts1/correct0', ra.entry.streak === 0 && ra.entry.mastered === false && ra.entry.inBook === true && ra.entry.attempts === 1 && ra.entry.correct === 0 && ra.removed === false);
const b = startQuiz([MOCK_POINTS[0]]); b.flip();
const rb = b.grade('p01', 'remembered'); b.next();
ok('答对1：streak1 仍在错题本', rb.entry.streak === 1 && rb.entry.mastered === false && rb.entry.inBook === true && rb.entry.attempts === 2 && rb.entry.correct === 1 && rb.removed === false);
const c = startQuiz([MOCK_POINTS[0]]); c.flip();
const rc = c.grade('p01', 'remembered'); c.next();
ok('答错→答对→答对→移出（joint test）', rc.entry.streak === 2 && rc.entry.mastered === true && rc.entry.inBook === false && rc.removed === true && c.done === true && getBook(MOCK_POINTS).length === 0);
ok('grade 即持久化 ProgressMap', JSON.stringify(storage.loadProgress().p01) === JSON.stringify(rc.entry));
const d = startQuiz([MOCK_POINTS[0]]); d.flip();
const rd = d.grade('p01', 'remembered'); d.next();
ok('streak 封顶 2', rd.entry.streak === 2 && rd.entry.attempts === 4 && rd.entry.correct === 3);

storage.clearAll();
const s3 = startQuiz(MOCK_POINTS.slice(0, 3), { progress: {} });
ok('本轮 round.accuracy 缺省 null', s3.round.accuracy === null);
for (const r of ['remembered', 'forgot', 'remembered']) { s3.flip(); s3.grade(s3.current().id, r); s3.next(); }
ok('本轮计数/正确率分母=已作答数/done 终态', s3.round.answered === 3 && s3.round.correct === 2 && s3.round.accuracy === 2 / 3 && s3.done === true && s3.current() === null && s3.progress.current === 3 && s3.progress.total === 3);
const s2 = startQuiz(MOCK_POINTS.slice(0, 2), { progress: {} });
let qn = 0;
const qUnsub = s2.subscribe(() => { qn++; });
s2.flip(); s2.grade(s2.current().id, 'remembered');
ok('flip/grade 均通知订阅', qn === 2);
qUnsub(); s2.flip();
ok('quiz unsubscribe 后不再通知', qn === 2);

storage.clearAll();
const seed = {
  p01: { streak: 2, mastered: true, inBook: false, attempts: 2, correct: 2 },
  p02: { streak: 1, mastered: false, inBook: true, attempts: 1, correct: 1 },
  p05: { streak: 0, mastered: false, inBook: true, attempts: 1, correct: 0 },
};
const bs = startQuiz(MOCK_POINTS, { mode: 'battle', progress: seed });
const bOrder = playAll(bs);
ok('battle 快照一轮制：仅 inBook、队列固定、移出计数', bs.total === 2 && [...bOrder].sort().join() === 'p02,p05' && bs.round.removed === 1 && bs.mode === 'battle');
ok('session.stats 全局口径（结果页环图）', bs.stats.bookCount === 1 && bs.stats.mastered === 2 && bs.stats.answered === 6 && bs.pointCount === 12);
ok('entry 快照互不影响 / map / book 活视图', (() => { const e = bs.entry('p05'); e.streak = 99; return bs.entry('p05').streak === 1 && Object.keys(bs.map()).length === 3 && bs.book().map((p) => p.id).join() === 'p05'; })());
ok('battle 空错题本 → E_EMPTY_POINTS', syncCode(() => startQuiz(MOCK_POINTS, { mode: 'battle', progress: {} })) === 'E_EMPTY_POINTS');
ok('非法 mode → E_INVALID_PAYLOAD', syncCode(() => startQuiz(MOCK_POINTS, { mode: 'x' })) === 'E_INVALID_PAYLOAD');
ok('空/非数组 points → E_EMPTY_POINTS', syncCode(() => startQuiz([])) === 'E_EMPTY_POINTS' && syncCode(() => startQuiz(null)) === 'E_EMPTY_POINTS');

const st = getStats(MOCK_POINTS, { ...seed, p99: { streak: 2, mastered: true, inBook: false, attempts: 5, correct: 5 } });
ok('getStats 限定当前 points、分母=Σattempts', st.attempts === undefined && st.answered === 4 && st.correct === 3 && st.accuracy === 3 / 4 && st.mastered === 1 && st.bookCount === 2);
ok('getStats 0 作答 → accuracy null', getStats(MOCK_POINTS, {}).accuracy === null && getStats(MOCK_POINTS, {}).answered === 0);
ok('getBook = inBook 过滤', getBook(MOCK_POINTS, seed).map((p) => p.id).join() === 'p02,p05');
const nz = startQuiz([MOCK_POINTS[0]], { progress: { p01: { streak: 'x', attempts: -3, correct: 99, mastered: 'yes', inBook: 1 } } });
nz.flip();
const rz = nz.grade('p01', 'remembered');
ok('损坏 entry 归一化按缺省', rz.entry.streak === 1 && rz.entry.attempts === 1 && rz.entry.correct === 1 && rz.entry.mastered === false && rz.entry.inBook === false);

storage.clearAll();
storage.saveProgress({ p01: { streak: 1, mastered: false, inBook: true, attempts: 1, correct: 1 } });
storage.saveDeck(mockDeck());
ok('同 deckId saveDeck 保留进度', storage.loadProgress().p01?.streak === 1);
storage.saveDeck({ ...mockDeck(), deckId: 'd-other' });
ok('换 deckId saveDeck 自动清零进度（D030）', JSON.stringify(storage.loadProgress()) === '{}');
ok('E_NOT_FLIPPED 中文文案', /[一-龥]/.test(new ContractError('E_NOT_FLIPPED').message));

console.log(`contract-check: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);