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
- 3D 翻转卡（DESIGN §5.2：520ms、翻面前禁自评、reduced-motion 退化）— B
- 自评状态机 + ProgressMap 持久化（CONTRACT §1）— A
- 错题本视图（inBook 过滤、连对 2 次移出、半掌握 1/2 徽标）— B
- 统计页（正确率环图 + 已掌握数，直接数值标签）— B
- 清单编辑/删除持久化接 saveDeck（point-edit/point-delete 事件）— A

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

## 当前状态（2026-11-19）
- PR #1/#2/#3 均已 squash 合并（main = acc59b0）：设计/鉴定、契约 v1.1 + A 侧 api/storage/fixture/自检、B 侧清单 UI。M1-0…M1-3 完成。
- M1-4 进行中：feat/m1-integrate（PR #4）。用户 11-19 授权 A 代闭环（D017）：文档走查 + list.js 接 extractPoints + ContractError→#upload-error（§5）+ ?mock=1 全链路 + 360/375 模拟器走查；待搭档评审 approve 后 squash。
- 在册承诺：M2 loadDeck 形状校验；M4 删除动画（D016）；M3 pdf.js vendor + 真实管线 + Function/Secret + 部署（≤11-27）。