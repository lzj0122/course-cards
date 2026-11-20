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

## 当前状态（2026-11-20）
- M1 全闭环：PR #1–#4 均 squash 合并（main = 38fac84）。M1-0…M1-4 完成。
- 第四步（真实链路，D019）进行中：A 侧 feat/m3-real-A = vendor pdf.js + api.js 真实管线（压缩/逐页/两通道/JSON/重试1/错误映射/降级/mock 兜底）+ functions/（DashScope-Qwen）+ 自检 42 断言 + dev 双模式（?mock=1 15、非 mock 16）。PR #6 已开，B 复评异议 3–6 已回应（D023：404/非 JSON → 降级示例+横幅；文档恢复/只增不改）；待 B 复评 + 用户指示 approve 后 squash。
- 第四步 B 侧：PR #7 已开（五态接真实请求 + deck 持久化 + D022 视觉模型 qwen3-vl-plus + 公网实测证据 step4-runtime-evidence.md，9/9）；合并顺序 #6 先、#7 后（用户 11-20 确认），B rebase 去重 D020 行后由 A review 再 squash。
- 部署/密钥：APP_API_KEY 已由 Owner 录入并 synced，descriptor 已写、canPublish=true。**官方站点 published=false / hasPublishedContent=false / private（2026-11-20 复核），从未发布**；B 的 9/9 实测在其自建测试站（siteId 01a1f442-2db5-7717-8bfc-0f51984ce1f7 / course-cards-k1u1a0c18dv.qoder.zone，public 仅供实测、非官方上线，D025）；官方首次发布 = M3（≤11-27、M2 完成 + #6/#7 合并后从 main）+ B 补测官方站 9/9 更新证据；发布执行归属待用户裁决（官方站 Owner = 用户账号，B 当前无站点访问权）。录密钥前真实请求自动降级 mock。
- 在册承诺：M2 loadDeck 形状校验 + 闪卡/错题本/统计；M4 删除动画（D016）；warnings 披露 UI 随 M3（PR #4 备注 1）。