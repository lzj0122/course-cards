# TASKS.md — 里程碑与分工

> 分支约定：feature 分支 + PR + 对方 1 approval + squash merge（D008）。main 受保护，任何人不得直推。
> A = lzj0122（我）；B = wgy0523（搭档）。契约见 CONTRACT.md v1.1，视觉见 DESIGN.md v1.0（已合并）。

## M1 — 上传 → 考点清单（当前）
| # | 任务 | Owner | 分支 | 验收 |
|---|---|---|---|---|
| M1-0 | CONTRACT/TASKS/DECISIONS + mock fixture | A | feat/m1-api-A | 搭档评审无歧义 |
| M1-1 | js/storage.js（七函数三 key） | A | feat/m1-api-A | CONTRACT §8 A 项 |
| M1-2 | js/api.js：校验链 + mock 路径 + Function 客户端（真实管线接 pdf.js vendor） | A | feat/m1-api-A | mock 端到端 + 错误码自检 |
| M1-3 | index.html + js/list.js + css/list.css + 上传区/清单/大字开关/toast UI | B | feat/m1-list-B | CONTRACT §8 B 项 |
| M1-4 | 集成：?mock=1 全链路 + 360px 真机/模拟器 | A+B | 集成分支 feat/m1-integrate | 手机宽度走通上传→清单 |

## M2 — 闪卡自测 + 错题本 + 统计
- 3D 翻转卡（**560ms**，D027 覆盖 DESIGN §5.2 520ms、翻面前禁自评、reduced-motion 退化）— B（第五步）
- 第五步（M2 首切片，v1.3/D027/D028）：已闭环 —— A PR #8 + B PR #9 均 squash 合并（main 88758af）。
- 第六步（M2 自测切片，v1.4/D030）：A js/quiz.js 状态机 + saveDeck 换 deck 清零 + CONTRACT v1.4（feat/m2-quiz-A，PR 待 B review）；B js/quiz-view.js + css/quiz.css + **index.html 接线** + dev/quiz-test.html（PR #10 提案 v0.1 待收敛 rebase，A review）；双方共测「答错→答对→答对→移出」。
- 自评状态机 + ProgressMap 持久化（CONTRACT §1）— A（第六步）
- 错题本视图（inBook 过滤、连对 2 次移出、半掌握 1/2 徽标）— B（第六步）
- 统计页（正确率环图 + 已掌握数，直接数值标签）— B（**并入结果页**，D030 裁决③，第六步）

## M3 — Function + Secret + 部署
- functions/ Edge Function：/extract 文本与视觉两通道，Secret 读 APP_API_KEY，未配返回 service_not_configured — A
- prepare_site 授权 + Settings 录密钥（Owner 手动）+ 发布 Qoder Sites 公网 — A
- 真实管线对照测试：三份同源课件提取质量横比（SAMPLE_REVIEW §3）— B
- 大字模式/移动端/空态/错误态全站走查 — B

## M4 — 演示与收尾
- 评委演示脚本（mock 兜底路径零翻车）— A+B
- 导出/导入学习数据 JSON（可选兜底，待定 D003 备注）— A
- 比赛材料：README 演示说明、截图 — B
- 截止 **2026-11-30 18:00**；M3 部署不晚于 11-27，留 3 天缓冲。

## 当前状态（2026-11-21）
- M1 全闭环：PR #1–#4 均 squash 合并。第四步 A 侧 PR #6 已 squash 合并（main = 2c35adc，含 D023–D026；B 正式 APPROVE 5995379539，用户批准 D026①）。
- 第四步 B 侧 PR #7 已 squash 合并（main = 9037518；A APPROVE；step4 合并环闭环 D026）。B 侧实测证据 verify/step4-runtime-evidence.md（测试站 9/9 等，仓库外）。
- 第五步已闭环：A PR #8 + B PR #9 均 squash 合并（main = 88758af；D027/D028/D029）。
- 第六步进行中：A feat/m2-quiz-A（quiz.js + saveDeck 换 deck 清零 + CONTRACT v1.4 + D030 + 自检 92）PR 待 B review；B PR #10（feat/step6-quiz-B @ e67b337，quiz-view/quiz.css/DESIGN §5.8/dev quiz-test stub 16/16）提案 v0.1 待 A v1.4 收敛 rebase（含 index.html 接线、真 quiz.js 复测）；合并环后共测「答错→答对→答对→移出」。
- 部署/密钥：APP_API_KEY 已由 Owner 录入并 synced，descriptor 已写、canPublish=true。**官方站点 published=false / hasPublishedContent=false / private（2026-11-20 复核），从未发布**；B 的 9/9 实测在其自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，public 仅供实测、非官方上线，D025）；官方首次发布 = M3（≤11-27、M2 完成 + #6/#7 合并后从 main）+ B 补测官方站 9/9 更新证据；**发布执行 = Owner/A（用户 11-20 裁决 D026），B 仅补测、不授权管理官方站**。录密钥前真实请求自动降级 mock。
- 在册承诺：M2 剩余 = 第六步合并环（#11/#10 + 共测），合并后 M2 完成进 M3 门控；M4 删除动画（D016）；warnings 披露 UI 随 M3（PR #4 备注 1）。