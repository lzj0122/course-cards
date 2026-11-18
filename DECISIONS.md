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