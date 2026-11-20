# CONTRACT.md — 接口契约 v1.2

> 状态：M1 全闭环（PR #1–#4，main 38fac84）；第四步真实链路进行中（feat/m3-real-A）。**字段歧义先提异议、双方确认后才改**，变更记录进 DECISIONS.md。
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
- deck 持久化（v1.2，第四步提前自 M2，D020）：B 在 list.js 接 `saveDeck`（提取/编辑/删除/撤销后）+ 启动 `loadDeck()` 恢复清单，保证刷新后数据仍在；M2 只做 ProgressMap/错题本/统计。A 不改 B 文件。
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
- 写失败（QuotaExceededError 等）抛 ContractError E_STORAGE_QUOTA。
- largeText 生效方式：`document.documentElement.classList.toggle('large-text', p.largeText)`（DESIGN §2.3，根字号 16→20px）。

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

M2 预留（M1 不得实现、不得占用）：`#card-stage` `#flip-card` `#rate-remembered` `#rate-forgot` `#stats-accuracy` `#stats-mastered` `#mistake-book`。

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
| E_INVALID_PAYLOAD | Function 响应不合 §7 schema | 失败态 + 重试 |
| E_STORAGE_QUOTA | localStorage 写失败 | toast 提示清理空间 |

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

- A：mock 路径端到端（?mock=1 → 使用示例课件 → 12 行清单）；storage 三 key 读写/损坏防御/quota 抛错；错误码表全覆盖 + 真实链路 fetch-stub（解析/重试1/降级/错误映射/Function handler 逻辑）自检 `node tools/contract-check.mjs`（42 断言、可复跑）+ dev/api-test.html 双模式浏览器断言（?mock=1 15、非 mock 16；非 mock 用 `python tools/serve.py` 修正 .mjs MIME）。
- B：清单 UI 全状态（默认/hover/编辑/删除+撤销/空态）；大字开关持久化；360px 宽无横向滚动；renderPoints 事件契约符合 §2；page 分组实测（有 page 分组／无 page 扁平／混合未标注页置末）。
- step-4（v1.2，D019/D020/D021，恢复自 42f0b42 误删）：真实截图 + 文字 PDF + 扫描 PDF 各 3 次（9/9）；刷新后清单恢复（loadDeck）；clearAll 彻底（B dev/list-test.html：只清三 key、不动他站数据、清空后回 idle）；375px 及 360px × 常规/大字四组零溢出；console 零消息。B 实测证据见 step4-runtime-evidence.md（**仓库外、不入 git**；摘要见 PR #7 正文 / issue #5）；9/9 实测环境 = B 自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，public 仅供实测、非官方上线，D025）；官方站 9/9 补测随 M3 首次发布（≤11-27，M2 完成 + 合并后从 main）并更新证据（D024 兜底沿用）。
- 双方：CONTRACT 字段零私自改动；异议都在 PR 讨论留痕。

## 9. 变更记录

- v1.0（11-18）：初版（PR #2）。
- v1.1（11-18）：PR #2 评审异议 1（用户已确认）→ Point 增可选 `page?: number`、fixture 页码、分组规则（D015）；所有权表述同步 index.html 归 B（D014）；§8 自检脚本明确在仓库位置。加性可选字段：schemaVersion 仍 1、storage key .v1 不变，无 page 旧数据兼容扁平。
- v1.2（11-19，第四步，用户确认 D019/D020/D021，待 B PR 评审确认）：真实管线落地（维持 D006 逐页，不采纳「前3页」）；加性客户端压缩（≤1600px JPEG0.8）与失败自动重试 1 次（仅瞬态）；多数页通道 + 混合 warnings；deck 持久化提前自 M2（B 接 saveDeck 提取/编辑/删除/撤销 + loadDeck init）；**clearAll 验收走 B dev/list-test.html、产品不加清空按钮、§3 零新增**（D021 推翻 D019③）；§7 上游 DashScope qwen-plus/qwen-vl-max + secretNames；node 自检默认 mock、dev 双模式 + tools/serve.py。schemaVersion 仍 1、key .v1 不变（无字段删改）。
- v1.2 修订（11-20，PR #6 复评闭环，D023）：异议 3 §7 增 404/非 JSON → E_SERVICE_NOT_CONFIGURED 降级；异议 4 移除 DECISIONS D019 inline 注；异议 5 恢复 §8 step-4 验收条；异议 6 恢复 §2 编辑/删除持久化 step-4 时序；TASKS M2 移除已提前的 saveDeck 行；自检 41→42 断言、dev 非 mock 15→16（404 降级断言）。视觉模型 qwen3-vl-plus 修复随 PR #7（D022），本修订不改 handler。
- v1.2 修订 2（11-20，D024）：§8 step-4 公网验收增证据溯源与发布后补测兜底；TASKS 部署行三态加性澄清（站点从未发布、private，2026-11-20 平台复核）。不改字段/schema/key。
- v1.2 修订 3（11-20，D025）：§8 step-4 与 TASKS 归属措辞收敛——9/9 实测 = B 自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，非官方上线）；官方站从未发布，官方首次发布 = M3（M2 完成 + 合并后从 main，≤11-27）+ 官方站补测 9/9。不改字段/schema/key。
- v1.2 修订 4（11-21，#7 rebase 收敛，D022/D026）：§7 images 通道 qwen3-vl-plus（D022 修复随本 PR，handler 单行+头注释；自检视觉断言同步，用户 11-21 授权 B 改 A 所有权工具单行，D017 式）；B 侧重复 v1.3 标签与 D020 重复行收敛至 A 谱系（同决策只留一条，#6 先 #7 后用户确认）；归属措辞维持修订 3 与 D026（官方首次发布执行 = Owner/A，B 仅补测官方站 9/9、不管理官方站）。不改字段/schema/key。