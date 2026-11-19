# DECISIONS.md — 决策记录（只增不改，推翻旧决策需新条目引用旧编号）

| # | 日期 | 决策 | 理由 / 备注 |
|---|---|---|---|
| D001 | 11-16 | AI 走方案 a：Qoder Sites Edge Function + 服务端 Secret | 已验证 Sites 支持 Function/Secret（sites-building references/functions.md）；用户零登录零配置；密钥明文不进前端/仓库/聊天 |
| D002 | 11-17 | 仓库 public + main 保护（PR + 1 approval、enforce_admins、禁 force push/删除） | GitHub Free 仅 public 支持分支保护；用户明确选定 |
| D003 | 11-16 | 学习状态存 localStorage（deck/progress/prefs 三 key，.v1 后缀） | 无数据库硬约束；换设备会丢 → 导出/导入 JSON 兜底列为 M4 可选项 |
| D004 | 11-16 | 示例模式双入口：?mock=1 显式 + E_SERVICE_NOT_CONFIGURED 自动降级 | 评委零配置可演示；横幅明示"演示数据" |
| D005 | 11-18 | 演示素材 = samples/sample-text.pdf（16 考点）；mock fixture 取其前 12 条 | 搭档 SAMPLE_REVIEW 定稿：编号显式、文本管线确定性强；截图/扫描版留作管线对照 |
| D006 | 11-18 | PDF 管线阈值：去空白 <50 字符/页判扫描；hasEOL 重建行；scale=2 JPEG 0.8；>30 页或 >20MB 前端拦截 | 搭档探针实测（pdfjs-dist 4.8.69）；写入 CONTRACT §2/§5 |
| D007 | 11-18 | DESIGN.md v1.0 三结论批准（v1 无暗色／问题 18px+360px 验收／装饰条限背面 4px）；**酸绿按钮文字色以 §1.4 为准（ink-900）**，§1.2 白字表述待搭档修订 | PR #1 评审 CHANGES_REQUESTED；白字对 #84CC16 对比度 <4.5:1 |
| D008 | 11-18 | 合并方式 squash merge；契约字段改动先 PR 异议、双方确认再改 | main 历史线性可读；并行开发防字段漂移 |
| D009 | 11-17 | 网络：gh/git 优先 Clash 7897 代理；Clash 失效时直连窗口重试；再不行浏览器 UI 兜底 | 本机 github.com TCP 间歇断、api 与 github 封锁相位错开；浏览器 QUIC 常可用 |
| D010 | 11-17 | git 提交身份暂用 Course Cards Dev <dev@course-cards.local>（提交级 -c） | 全局身份未配置；两人 clone 后自行配置，不改全局 |
| D011 | 11-18 | 搭档 push 凭据为 30 天 PAT（repo scope，12-18 过期），存 Windows 凭据管理器 | 比赛结束后手动吊销（GitHub → Settings → Developer settings → Tokens classic） |
| D012 | 11-18 | 纯静态 HTML/CSS/ES Modules，无构建；pdfjs-dist vendor 本地化（不用 CDN） | 部署体积/离线演示敏感；Sites 静态输出最简路径 |
| D013 | 11-18 | M1 并行边界：B 不改 js/api.js、js/storage.js、data/mock-points.js；fixture 唯一来源 mock-points.js | 用户第二步指令；防共享文件冲突 |
| D014 | 11-18 | index.html 所有权第三步起归 B（A 不碰）；大字持久化由 B 经 storage.js loadPrefs/savePrefs 接通 | 用户第三步指令与时序确认；纯文档留痕，DOM id 表与字段零改动（PR #2 备注 2/3） |
| D015 | 11-18 | 契约 v1.1：Point 可选 `page?: number`（≥1 整数）；mock 页码 p01–p07→1、p08→2、p09–p12→3；分组有 page 升序／无 page 扁平／混合未标注页置末 | PR #2 评审异议 1、用户已确认；加性可选字段故 schemaVersion=1 与 key .v1 不变、旧数据兼容；B 兼容式分组零改动 |
| D016 | 11-18 | 删除动画走 M4 补齐路线（coral 闪 + 240ms 高度 collapse，DESIGN §5.3，含 reduced-motion 退化），不修订 DESIGN | 搭档 PR #3 评论选定（不动已 approve 的 diff、DESIGN 保持权威）；用户 11-19 知悉 |
| D017 | 11-19 | M1-4 由 A 代闭环（含 list.js 接线：extractPoints 全链路 + ContractError→#upload-error 按 §5），规格 = 搭档 PR #3 承诺；B 以 PR #4 评审把关 | 用户 11-19 明确授权（搭档会话空闲）；D013 并行边界不变，集成分支例外仅此次授权范围 |
| D018 | 11-19 | 关闭 D007 遗留：DESIGN §1.2 酸绿按钮白字表述已由搭档修复（PR #1），以 §1.4 ink-900 为准的结论不变 | 搭档 PR #4 评审备注 4 指出关闭条目缺失；只增规则补本条 |
| D019 | 11-19 | 第四步五项确认：① 维持 D006 逐页管线（不采纳「前3页渲染」）；② deck 持久化提前自 M2（extract 后 saveDeck + 启动 loadDeck，B 接线）；③ 新增「清空学习数据」按钮 #clear-data-btn（B，接 clearAll + 二次确认）；④ 沿用方案 a，APP_API_KEY 由 Owner 在 Portal 录入；⑤ 上游 = DashScope/Qwen（qwen-plus 文本 / qwen-vl-max 视觉）。加性：客户端压缩 ≤1600px JPEG0.8、失败自动重试 1 次（仅 E_NETWORK/E_UPSTREAM） | 用户 11-19 AskUserQuestion 逐项确认；契约 v1.2 走 PR 交 B 评审确认（D008）；D013/D014 边界不变；**③ 已被 D021 推翻** |
| D020 | 11-19 | issue#5 三确认落地：维持 D006 ≤30 页；B 持久化 broader（saveDeck 提取/编辑/删除/撤销 + loadDeck init），M2 只做 ProgressMap/错题本/统计；clearAll 验收入口 = B dev/list-test.html，产品不加清空按钮、§3 零新增 | 搭档 issue#5 转达用户确认 + 用户 11-19 裁决；编号由搭档草案 D018 重编为 D020（与 A 的 D018=关闭 D007 撞车，用户裁决搭档改号） |
| D021 | 11-19 | 推翻 D019③：取消产品「清空学习数据」按钮与 #clear-data-btn，改 dev-only 验收（引用 D019、D020）；契约 v1.2 §3 移除该 id | 用户 11-19 裁决「按 issue#5 dev-only」；只增规则补本条引用旧编号 |