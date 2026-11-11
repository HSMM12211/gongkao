# 申论训练闭环 Phase 2-5 实施计划

## 范围

完成 SDD 规格 `2026-05-28-shenlun-training-loop-phase2-5-sdd.md` 中 1-5 项。

## 任务

- [ ] 新增真题文本解析器 `lib/shenlun/document-parser.ts` 和测试。
- [ ] 新增 Agent 契约 `lib/shenlun/agent-contracts.ts` 和测试。
- [ ] 新增考场模式领域逻辑 `lib/shenlun/exam-mode.ts` 和测试。
- [ ] 新增评论转表达领域逻辑 `lib/shenlun/expression.ts` 和测试。
- [ ] 新增增强校准报告 `lib/shenlun/calibration-report.ts` 和测试。
- [ ] 扩展 IndexedDB stores 与 repository。
- [ ] 素材导入优先使用真题解析器入库。
- [ ] `/practice` 页面接入考场模式、评论转表达、增强校准。
- [ ] 全量验证与桌面打包。

## 非目标

- 不做联网爬虫。
- 不做自动真实 AI 批改准确性承诺。
- 不覆盖用户已有资产。
