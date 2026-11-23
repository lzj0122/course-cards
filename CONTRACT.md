# CONTRACT.md — 接口契约 v1.4

> 状态：M1 + 第四/五步全闭环（PR #1–#9，main 88758af）；第六步 M2 自测切片进行中（A feat/m2-quiz-A；B feat/step6-quiz-B PR #10 提案 v0.1 待收敛 rebase）。**字段歧义先提异议、双方确认后才改**，变更记录进 DECISIONS.md。
> 并行分工：A = `feat/m1-api-A`（js/api.js、js/storage.js、data/mock-points.js、tools/contract-check.mjs、dev/api-test.html）；B = `feat/m1-list-B`（index.html、js/list.js、css/list.css、上传区与清单 UI、样式、大字持久化）。B **不得修改** js/api.js / js/storage.js / data/mock-points.js。
> 技术形态：纯静态 HTML + CSS + ES Modules，无构建步骤；pdf.js 以 vendor 本地文件引入（D012）。

## 1. 数据 schema：studyDeck 与 studyDeck.points

```ts
type Point = {
  id: string;        // 非空、deck 内唯一；格式 "p" + 两位序号（p01…p99）；生成后稳定不变，是 progress 的外键
  question: string;  // 卡片正面；纯文本（禁 HTML）；trim 后 1–200 字符
  answer: string;    // 卡片背面；纯文本（禁 HTML）；trim 后 1–2000 字符
  page?: number;     // v1.1 可选（D015）：来源课件页码，≥1 整数（1-based）；缺省 = 未标注页
};

type StudyDeck = {
  schemaVersion: 1;                      // 固定字面量 1；升版必须走 DECISIONS 迁移讨论
  deckId: string;                        // "d" + Date.now().toString(36)；mock 固定 "d-mock"
  title: string;                         // 默认 "课件闪卡 · " + sourceType 中文名
  sourceType: 'image' | 'pdf-text' | 'pdf-scan' | 'mock';
  createdAt: string;                     // ISO 8601；mock 固定 "2026-11-18T00:00:00.000Z"
  points: Point[];                       // 即 studyDeck.points；长度 1–99；顺序即清单顺序
};
```

- 所有模块间只交换上述形状；`extractPoints` 产出、`renderPoints` 消费、storage 持久化。
- 混合 PDF 的 sourceType 取**多数页**类型；warnings 中注明混合。
- 分组规则（v1.1，D015）：清单中任一点有 page → 按 page 升序分组，组头「第 N 页」+ 该组条数；无 page 的点归入「未标注页」组置末；全部无 page → 扁平、无组头。行序号跨组连续。
- 学习进度**不放进 points**，独立 ProgressMap（§4），保证换 deck 不串进度、重置进度不丢卡。

```ts
type ProgressEntry = {
  streak: number;      // 连续答对次数 0–2
  mastered: boolean;   // streak >= 2 时 true
  inBook: boolean;     // 在错题本中（未掌握且曾答错）
  attempts: number;    // 自评总次数
  correct: number;     // 自评"记住了"次数
};
type ProgressMap = { [pointId: string]: ProgressEntry };  // 缺省条目视为 {streak:0,mastered:false,inBook:false,attempts:0,correct:0}
```

自评状态机（M2 实现，此处定死规则）：
- 「记住了」：attempts+1、correct+1、streak=min(streak+1,2)；streak==2 → mastered=true、inBook=false。
- 「没记住」：attempts+1、streak=0、mastered=false、inBook=true。
- 统计：正确率 = Σcorrect / Σattempts（attempts=0 时显示 "—"）；已掌握数 = count(mastered)。

## 2. 函数签名

```ts
// js/api.js —— A 实现
extractPoints(file: File): Promise<{ deck: StudyDeck; warnings: string[] }>
```
- 校验顺序：类型白名单（image/png、image/jpeg、application/pdf）→ 大小 ≤ 20MB → PDF 页数 ≤ 30；违反抛 ContractError（§5）。
- 管线按 SAMPLE_REVIEW.md §2 / D006：逐页 getTextContent 去空白 < 50 判扫描页；文字页用 item.hasEOL 重建行；扫描页 canvas scale=2 → JPEG 0.8 dataURL；**多数页**决定通道（文字页≥扫描页→text，否则→images），混合时 warnings 注明（v1.2）。
- 上传截图客户端压缩（v1.2，第四步加性）：最长边 ≤1600px、JPEG 0.8 dataURL 后送 images 通道。
- 失败自动重试 1 次（v1.2，第四步加性）：仅 E_NETWORK / E_UPSTREAM 瞬态错误重试一次；其余错误码不重试直接抛。
- mock 路径（§6）：不读文件内容，直接返回 mockDeck()，warnings 含 "mock"；node 自检无 location 时默认 mock 以保证可复跑（v1.2）。
- Function 返回 E_SERVICE_NOT_CONFIGURED 时**自动降级 mock**，warnings 含 "service_not_configured"。
- points 的 id 由前端按返回顺序赋 p01…；服务端不传 id。
- deck 持久化（v1.2，第四步提前自 M2，D020）：B 在 list.js 接 `saveDeck`（提取/编辑/删除/撤销后）+ 启动 `loadDeck()` 恢复清单，保证刷新后数据仍在；M2 第五步接卡片状态机（v1.3 §2 deck.js），自评 ProgressMap/错题本/统计后续切片。A 不改 B 文件。
- clearAll 验收入口 = B 的 `dev/list-test.html`（v1.2，D020/D021）：**产品 UI 不加清空按钮、§3 id 零新增**；断言清三 key、不动他站数据、清空后刷新回 idle。

```ts
// js/list.js —— B 实现
renderPoints(points: Point[], root: HTMLElement): void
```
- 全量替换 root 子节点；root 固定为 `#point-list`；行 UI 按 DESIGN.md §5.3（序号胶囊 + 问题文本 + 编辑/删除 ≥44px 热区）。
- 分组按 §1 分组规则渲染（v1.1）；B 已兼容实现：有 page 自动分组、无 page 扁平降级。
- 编辑/删除只发事件、不改 storage：root 上派发 `CustomEvent('point-edit', {detail:{id,question,answer}})`、`CustomEvent('point-delete', {detail:{id}})`；删除带 5s 撤销 toast（B 内部实现）。A 不监听这两个事件；编辑/删除后的落盘自第四步由 B 接 `storage.saveDeck`（D020，见本节 deck 持久化条）。
- 空数组：渲染 DESIGN §5.6 空状态，不裸"暂无数据"。

```ts
// js/storage.js —— A 实现（B 只调用）
loadDeck(): StudyDeck | null
saveDeck(deck: StudyDeck): void
loadProgress(): ProgressMap
saveProgress(map: ProgressMap): void
loadPrefs(): { largeText: boolean }
savePrefs(p: { largeText: boolean }): void
clearAll(): void   // 清三个 key，不动其他站点数据
```
- 读写均 JSON；损坏 JSON 视为 null/{} 并 console.warn，不抛错（边界防御仅此一处）。
- loadDeck 形状校验（v1.3，第五步，D027）：schemaVersion=1、deckId/title/createdAt 字符串、sourceType 四值、points 1–99 且 id 非空唯一、question/answer 非空字符串、page 若存在为 ≥1 整数；不合 → null + console.warn（不抛错、不毁数据；200/2000 长度上限仅在提取/编辑时约束，load 不复核以免误毁旧数据）。
- 写失败（QuotaExceededError 等）抛 ContractError E_STORAGE_QUOTA。
- saveDeck 换 deck 清零（v1.4，D030 用户裁决）：写入 deck 后若旧 deck 存在且 deckId 不同 → 同时清零 progress key（p01… 序号 id 跨 deck 复用会串进度）；同 deckId 的编辑/删除/撤销不受影响；mock deckId 固定不受影响。三 key 不变、schemaVersion 仍 1。
- largeText 生效方式：`document.documentElement.classList.toggle('large-text', p.largeText)`（DESIGN §2.3，根字号 16→20px）。

```ts
// js/deck.js —— A 实现（v1.3，第五步）
createDeck(points: Point[]): DeckState
```
- 卡片从 studyDeck.points 派生（`current()` 返回 points[index] 同引用），**仅内存状态、不另存第二份**（不写 storage）。
- 空/非数组 points 抛 ContractError E_EMPTY_POINTS。
- DeckState：`total`、`index`（0-based）、`flipped`、`progress:{current:index+1,total}`（只读 getter）；`current(): Point`；`flip(): void` 切换翻面；`next(): void` 推进、末张循环回 0、翻面复位 false；`subscribe(fn): ()=>void` 任何变更通知 fn(deck)，返回退订函数。
- 自评/掌握状态不在此（ProgressMap §1，后续切片）。

```ts
// js/deck-view.js —— B 实现（v1.3，第五步；A 只定契约）
renderDeck(deck: DeckState): void
```
- 入口：`#generate-deck-btn` 点击 → 以当前清单 points 调 createDeck 并 renderDeck；清单/卡片区切换由 B 在 index.html 组织。
- `#card-stage` 内 `#flip-card`：正面 question、背面 answer（纯文本禁 HTML）；3D 翻转 perspective + preserve-3d + backface-visibility + rotateY(180deg)，**560ms** cubic-bezier(.2,.7,.2,1)（用户第五步明确，D027 覆盖 DESIGN §5.2 520ms，B 同步 DESIGN）；翻面中 scale 1.02 + shadow-2 落定回弹沿用 DESIGN。
- 键盘：`#flip-card` 可聚焦（role=button/tabindex=0），Enter/Space 触发 deck.flip()；`#card-next-btn` → deck.next()；`#card-progress` 显示「current / total」。
- 视图自管 DOM（就地翻面保 560ms 过渡），deck.subscribe 可选、供外部/dev 订阅（#9 评审收敛，v1.4 措辞）；自评双钮在自测页（quiz-view，v1.4），卡片区不含自评。
- `prefers-reduced-motion`：翻转退化为 150ms 淡入淡出（DESIGN §5.2）。
- 375px 零横向溢出；大字随根字号；**不写 storage**（派生原则）。

```ts
// js/quiz.js —— A 实现（v1.4，第六步）
startQuiz(points: Point[], opts?: { mode?: 'study' | 'battle'; progress?: ProgressMap; random?: () => number }): QuizSession
getBook(points: Point[], progress?: ProgressMap): Point[]
getStats(points: Point[], progress?: ProgressMap): { answered, correct, accuracy: number | null, mastered, bookCount }
```
- 打乱 Fisher-Yates 作用于内部队列副本，**不改 studyDeck.points 原序**；random 可注入（自检可复跑）。
- mode study = 传入 points 全量单轮；battle = 消灭战**快照一轮制**（D030 用户裁决）：开局取 inBook 快照打乱，队列走完即 done 进结果页、不中途续轮；移出（连对 2 次）实时写全局 ProgressMap。
- 空/非数组 points、battle 空快照 → ContractError E_EMPTY_POINTS（battle 中文 message「错题本为空…」）；mode 非法 → E_INVALID_PAYLOAD。
- progress 缺省 storage.loadProgress() 并按 §1 归一化（缺省/损坏字段 → 缺省 entry）；opts.progress 可注入（dev/自检）。
- QuizSession getter：`mode`/`pointCount`（源 points 数，环图分母）/`total`（队列长）/`index`/`flipped`/`done`/`progress:{current,total}`（current 夹到 total）/`round:{answered,correct,removed,accuracy}`（**本轮**，0 作答 accuracy=null）/`stats:{answered,correct,accuracy,mastered,bookCount}`（**全局**口径 = 源 points 范围内 Σattempts/Σcorrect，结果页环图与 #stats-* 用此）。
- 方法：`current(): Point|null`（同引用，done 时 null）；`entry(id): ProgressEntry` 快照副本；`map(): ProgressMap` 快照副本；`book(): Point[]` inBook 活视图；`flip()` 切换（done no-op）；`grade(cardId, result)`；`next()` 推进+翻面复位+graded 复位、队列走完 done（done no-op）、**可跳过未评分卡**；`subscribe(fn)` 同 deck.js。
- grade(cardId, result)：result 仅 'remembered'|'forgot'；校验序 done → result → flipped → cardId → graded：未翻面 → **E_NOT_FLIPPED**，其余非法 → E_INVALID_PAYLOAD（中文 message 区分）；按 §1 状态机更新 entry 并**立即 storage.saveProgress**；只记录不推进（推进归 next，deck.js 族风格；视图 240ms 滑出窗口内 current() 不变）；返回 {entry, removed, mastered}。
- 持久化归属 quiz.js（A）；视图层零 storage 写入；换 deck 清零见 storage 条（D030）。
- getBook/getStats 与 session.book/stats 同规则共享（B 接线与 dev 复用，不得复制第二份状态机）。

```ts
// js/quiz-view.js —— B 实现（v1.4，第六步；A 只定契约）
renderQuiz(quiz: QuizSession, root?: HTMLElement): void
```
- root 缺省 `#quiz-stage`；视图自管 DOM（就地翻面保 560ms，subscribe 可选供外部）；done → 同 root 渲染结果页。
- 自测页：翻转卡 `#quiz-card`（role=button/tabindex=0，Enter/Space → quiz.flip()；**不复用 #flip-card**，§3 全局唯一）；`#quiz-progress`「N / M」+ 消灭战标记；`#rate-remembered`/`#rate-forgot` **未翻面 disabled**（视图门控）+ 状态层 E_NOT_FLIPPED 双保险；评分后左/右滑出 240ms（DESIGN §5.2/§5.8）→ quiz.next() → 重渲染或结果页。
- 结果页 `#quiz-result`：环图三段 + 中心直接数值标签（全局 stats.accuracy，0 → 「—」）+ `#stats-accuracy`（读屏文本）/`#stats-mastered`；错题本 `#mistake-book`（quiz.book() 活视图 + DESIGN §5.5 徽标：半掌握 amber 1/2／已掌握 acid／错题 coral；空书奖杯插图态，禁裸「暂无数据」）；`#battle-btn`（空书 disabled，点击派发 quiz-battle）/`#quiz-restart-btn`（派发 quiz-restart）；**消灭战/再测启动归外部接线**（视图不自启）。
- 接线（**本步含**，D030 用户裁决；index.html 归 B）：`#start-quiz-btn`（清单/卡片区入口 → startQuiz(当前清单 points) → renderQuiz）；quiz-battle → startQuiz(points,{mode:'battle'})；quiz-restart → startQuiz(points) 重洗；`#quiz-back-btn` 回清单；空书时消灭战入口 disabled，产品路径不触 E_EMPTY_POINTS。
- 加性事件（B 提案、A 确认留痕）：root 派发 quiz-flip{index,flipped}/quiz-grade{id,result,streak,inBook,mastered}/quiz-done{stats}/quiz-battle{bookCount}/quiz-restart{}。
- 375px/360px 零横向溢出；大字随根字号（自评钮 52/64px）；prefers-reduced-motion 滑出退化 150ms 淡出；正反面 textContent 禁 HTML；**不写 storage**。

## 3. DOM id（全局唯一；括号内为 owner）

M1 必须存在（index.html 由 B 提供与维护，D014；DOM id 表与 v1.0 一致）：
| id | 用途 |
|---|---|
| `#app` | 页面根容器 (B) |
| `#topbar` | 顶栏 (B) |
| `#large-text-toggle` | 顶栏 "Aa" 大字开关，aria-pressed (B) |
| `#mock-banner` | 示例模式横幅，mock 时可见，文案固定「示例模式：演示数据，非真实识别结果」 (B) |
| `#upload-zone` | 上传区（拖拽 + 点选） (B) |
| `#file-input` | `<input type=file accept=".png,.jpg,.jpeg,application/pdf,image/png,image/jpeg">` (B) |
| `#use-mock-btn` | 「使用示例课件」按钮，仅 ?mock=1 时可见 (B) |
| `#extract-status` | 解析阶段文案 + 进度条（读取→识别→提取考点） (B) |
| `#upload-error` | 失败态容器：人话原因 + `#retry-btn` (B) |
| `#point-list` | renderPoints 的 root (B) |
| `#point-count` | 清单计数「共 N 个考点」 (B) |
| `#select-all` | 全选复选框 (B) |
| `#generate-deck-btn` | 底部吸附栏「生成闪卡」主按钮 (B) |
| `#toast-region` | toast 容器，aria-live=polite (B) |

第五步激活（v1.3，B 实现）：`#card-stage`（卡片区根） `#flip-card`（翻转卡，可聚焦） `#card-next-btn`（下一张） `#card-progress`（「N / M」位置进度）。
第六步激活（v1.4，B 实现）：预留五 id 激活 —— `#rate-remembered`/`#rate-forgot`（自测页评分双钮）、`#stats-accuracy`/`#stats-mastered`（结果页）、`#mistake-book`（结果页错题本列表）；新增 `#quiz-stage`（自测/结果页根） `#quiz-card`（自测翻转卡，可聚焦） `#quiz-progress` `#quiz-result` `#battle-btn` `#quiz-restart-btn` `#start-quiz-btn`（产品入口） `#quiz-back-btn`（回清单）。B 可在 PR 加性提议补充 id，A review 确认。

## 4. storage key（localStorage，前缀 studyDeck.）

| key | 内容 |
|---|---|
| `studyDeck.deck.v1` | StudyDeck JSON |
| `studyDeck.progress.v1` | ProgressMap JSON |
| `studyDeck.prefs.v1` | `{largeText:boolean}` JSON |

版本后缀 `.v1` 与 schemaVersion 联动；改 schema 必须升 key 版本并在 DECISIONS 写迁移策略。

## 5. 错误码（ContractError extends Error，含 .code 与中文 .message）

| code | 触发 | UI 行为 |
|---|---|---|
| E_UNSUPPORTED_TYPE | 非 png/jpeg/pdf | 上传区失败态，提示支持格式 |
| E_FILE_TOO_LARGE | > 20MB | 失败态，提示压缩或拆分 |
| E_TOO_MANY_PAGES | PDF > 30 页 | 失败态，提示截取前 30 页 |
| E_PDF_PARSE | pdf.js 加载/损坏 | 失败态 + 重试 |
| E_EMPTY_POINTS | 提取结果 0 条 | 失败态，提示换文件或重试 |
| E_SERVICE_NOT_CONFIGURED | Function 未配密钥 | **自动降级 mock** + 横幅 |
| E_NETWORK | 断网/超时 | 失败态 + 重试 |
| E_UPSTREAM | 模型服务报错 | 失败态 + 重试 |
| E_INVALID_PAYLOAD | Function 响应不合 §7 schema；quiz grade 参数非法（result/cardId/重复评分/done，v1.4） | 失败态 + 重试（quiz 参数非法为程序错误，视图门控兜底） |
| E_STORAGE_QUOTA | localStorage 写失败 | toast 提示清理空间 |
| E_NOT_FLIPPED | 翻面前评分（v1.4） | 视图禁用评分按钮，状态层抛错兜底 |

Function 业务错误体：`{ok:false, code, message}`；前端原样映射为 ContractError(code)。

## 6. ?mock=1 开关

- URL 含 `mock=1` → 进入示例模式：`#use-mock-btn` 可见；`extractPoints(file)` 忽略文件内容返回 mockDeck()；`#mock-banner` 常驻。
- 非 mock 模式下收到 E_SERVICE_NOT_CONFIGURED 也降级 mock（横幅同上），保证评委零配置可演示。
- mock 数据唯一来源 `data/mock-points.js`（12 条共享 fixture，取自 SAMPLE_REVIEW 16 考点的前 12 条；v1.1 带页码 p01–p07→1、p08→2、p09–p12→3，与 sample-text.pdf 原页一致）；**任何人不得在别处复制第二份 fixture**。

```js
// data/mock-points.js —— A 实现，ES module
export const MOCK_POINTS = [ /* 12 个 Point，id p01…p12 */ ];
export function mockDeck() { /* StudyDeck，deckId "d-mock"，sourceType 'mock'，createdAt 固定 */ }
```

## 7. Function 端点（方案 a；服务端实现属 M3，M1 仅客户端 + mock）

- `POST /functions/v1/app/extract`（同源，credentials: same-origin）
- 请求：`{kind:'text', text:string, fileName:string}` 或 `{kind:'images', images:string[]/*dataURL*/, fileName:string}`
- 成功：`{ok:true, points:[{question:string, answer:string}]}`（1–99 条；服务端不传 id）
- 失败：`{ok:false, code:string, message:string}`（code 取 §5 表）
- 密钥仅服务端 Secret（Deno.env.get），前端与仓库永不出现明文。
- 上游（v1.2，D019）：固定 DashScope OpenAI 兼容端点 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`；text 通道 qwen-plus、images 通道 qwen3-vl-plus（D022，上游公告 118177 下线 qwen-vl-max）；服务端超时 60s；不回传密钥/原始上游异常。
- 部署：`prepare_site.secretNames=['APP_API_KEY']`；Functions 就绪后由 Owner 在 Portal Settings 录密钥并确认同步，再发布依赖版本（M3/第四步部署环节）。
- 客户端降级（v1.2 修订，D023/异议 3）：ENDPOINT 返回 HTTP 404 或非 JSON 响应 → `E_SERVICE_NOT_CONFIGURED`（走既有自动降级示例+横幅，D004）；「已部署未录密钥」的服务端 `{ok:false,code:'E_SERVICE_NOT_CONFIGURED'}` JSON 路径不变；瞬态重试仍仅 E_NETWORK/E_UPSTREAM 1 次。

## 8. 验收（M1 合并门槛）

- A：mock 路径端到端（?mock=1 → 使用示例课件 → 12 行清单）；storage 三 key 读写/损坏防御/quota 抛错；错误码表全覆盖 + 真实链路 fetch-stub（解析/重试1/降级/错误映射/Function handler 逻辑）自检 `node tools/contract-check.mjs`（92 断言、可复跑；v1.3 增 deck 状态机 8 + loadDeck 形状 8；v1.4 增 quiz 34）+ dev/api-test.html 双模式浏览器断言（?mock=1 23、非 mock 24；非 mock 用 `python tools/serve.py` 修正 .mjs MIME）。
- B：清单 UI 全状态（默认/hover/编辑/删除+撤销/空态）；大字开关持久化；360px 宽无横向滚动；renderPoints 事件契约符合 §2；page 分组实测（有 page 分组／无 page 扁平／混合未标注页置末）。
- step-4（v1.2，D019/D020/D021，恢复自 42f0b42 误删）：真实截图 + 文字 PDF + 扫描 PDF 各 3 次（9/9）；刷新后清单恢复（loadDeck）；clearAll 彻底（B dev/list-test.html：只清三 key、不动他站数据、清空后回 idle）；375px 及 360px × 常规/大字四组零溢出；console 零消息。B 实测证据见 verify/step4-runtime-evidence.md（**仓库外**，摘要见 PR #7 正文/issue#5；#7 评审非阻塞收敛）；9/9 实测环境 = B 自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，public 仅供实测、非官方上线，D025）；官方站 9/9 补测随 M3 首次发布（≤11-27，M2 完成 + 合并后从 main）并更新证据（D024 兜底沿用）。
- step-5（v1.3，D027）：A = deck 状态机 + loadDeck 形状校验 16 断言（派生同引用/翻面/循环/订阅/零写入 + 形状七坏一好）；B = 3D 翻转 560ms、正反面、Enter/Space、reduced-motion 150ms 淡入淡出、375px 零溢出、loadDeck 恢复后进卡片区不丢数据；dev/list-test.html 页头 D018 误引收敛为 D020/D021（B）。
- step-6（v1.4，D030）：A = quiz 状态机 34 断言（打乱不 mutate/gating 双保险/§1 状态机/joint test 答错→答对→答对→移出 跨轮持久化/battle 快照一轮/stats 全局分母/归一化/换 deck 清零）；B = 自测页/结果页/错题本/消灭战 + **index.html 接线** + 未翻面不能评分 + 375/360×大字 + dev/quiz-test.html（rebase 后以真 quiz.js 复测，stub 预测不计共测证据）；双方产品 ?mock=1 路径共测「答错→答对→答对→移出」。
- 双方：CONTRACT 字段零私自改动；异议都在 PR 讨论留痕。

## 9. 变更记录

- v1.0（11-18）：初版（PR #2）。
- v1.1（11-18）：PR #2 评审异议 1（用户已确认）→ Point 增可选 `page?: number`、fixture 页码、分组规则（D015）；所有权表述同步 index.html 归 B（D014）；§8 自检脚本明确在仓库位置。加性可选字段：schemaVersion 仍 1、storage key .v1 不变，无 page 旧数据兼容扁平。
- v1.2（11-19，第四步，用户确认 D019/D020/D021，待 B PR 评审确认）：真实管线落地（维持 D006 逐页，不采纳「前3页」）；加性客户端压缩（≤1600px JPEG0.8）与失败自动重试 1 次（仅瞬态）；多数页通道 + 混合 warnings；deck 持久化提前自 M2（B 接 saveDeck 提取/编辑/删除/撤销 + loadDeck init）；**clearAll 验收走 B dev/list-test.html、产品不加清空按钮、§3 零新增**（D021 推翻 D019③）；§7 上游 DashScope qwen-plus/qwen-vl-max + secretNames；node 自检默认 mock、dev 双模式 + tools/serve.py。schemaVersion 仍 1、key .v1 不变（无字段删改）。
- v1.2 修订（11-20，PR #6 复评闭环，D023）：异议 3 §7 增 404/非 JSON → E_SERVICE_NOT_CONFIGURED 降级；异议 4 移除 DECISIONS D019 inline 注；异议 5 恢复 §8 step-4 验收条；异议 6 恢复 §2 编辑/删除持久化 step-4 时序；TASKS M2 移除已提前的 saveDeck 行；自检 41→42 断言、dev 非 mock 15→16（404 降级断言）。视觉模型 qwen3-vl-plus 修复随 PR #7（D022），本修订不改 handler。
- v1.2 修订 2（11-20，D024）：§8 step-4 公网验收增证据溯源与发布后补测兜底；TASKS 部署行三态加性澄清（站点从未发布、private，2026-11-20 平台复核）。不改字段/schema/key。
- v1.2 修订 3（11-20，D025）：§8 step-4 与 TASKS 归属措辞收敛——9/9 实测 = B 自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，非官方上线）；官方站从未发布，官方首次发布 = M3（M2 完成 + 合并后从 main，≤11-27）+ 官方站补测 9/9。不改字段/schema/key。
- v1.2 修订 4（11-21，#7 rebase 收敛，D022/D026）：§7 images 通道 qwen3-vl-plus（D022 修复随本 PR，handler 单行+头注释；自检视觉断言同步，用户 11-21 授权 B 改 A 所有权工具单行，D017 式）；B 侧重复 v1.3 标签与 D020 重复行收敛至 A 谱系（同决策只留一条，#6 先 #7 后用户确认）；归属措辞维持修订 3 与 D026（官方首次发布执行 = Owner/A，B 仅补测官方站 9/9、不管理官方站）。不改字段/schema/key。
- v1.3（11-21，第五步，D027）：§2 增 createDeck/renderDeck 契约（deck.js A / deck-view.js B；卡片派生不另存；560ms 覆盖 DESIGN §5.2 520ms）+ loadDeck 形状校验；§3 激活 #card-stage/#flip-card、新增 #card-next-btn/#card-progress，自评/统计 id 仍预留；§8 增 step-5 验收 + 证据指针仓库外收敛；自检 42→58。schemaVersion 仍 1、key .v1 不变（无字段删改）。
- v1.4（11-21，第六步，D030）：§2 增 startQuiz/grade/getBook/getStats + renderQuiz 契约（quiz.js A / quiz-view.js B；grade 记录+落盘、next 推进；battle 快照一轮制；stats 全局口径/round 本轮；接线本步含）；§2 saveDeck 换 deckId 清零 progress（修 §1 换 deck 不串进度与序号 id 复用矛盾）+ subscribe 措辞收敛（#9 非阻塞）；§3 激活预留五 id + 新增八 id（#quiz-card 避 #flip-card 撞）；§5 增 E_NOT_FLIPPED、E_INVALID_PAYLOAD 触发扩 quiz 参数（**E_CARD_MISMATCH 不采纳**）；§8 增 step-6 验收、自检 58→92、dev 15/16→23/24；§9 留痕。B 提案 v0.1 收敛：grade/next 分离采纳、mode study/battle、random 注入、entry/map/book/pointCount 采纳；B 同号 D030 rebase 机械改号 D031（D028 先例）。schemaVersion 仍 1、三 key .v1 不变（progress 内容仍 ProgressMap，清零为行为加性）。