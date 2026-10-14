# 截图索引

生成方式：`tests/v4-preview.spec.ts` 在隔离临时存储中加载真实插件与 V4 HTTP 路由，用合成样例走完 V1 → 第二批 → V2，再以仅回环（127.0.0.1）的临时服务 + 本机 Chrome 无头模式截图。每页断言无 JS 异常、无横向溢出。DSH Desktop 未在运行，故未从 Desktop 实机截图。

```bash
MARKETPILOT_PREVIEW=1 node_modules/.bin/vitest run tests/v4-preview.spec.ts
```

尺寸：`1440` = 1440×900，`1024` = 1024×768，`mobile` = 390×844（底部 6 项标签栏）。

| 页面 | 1440 | 1024 | 移动端 |
| --- | --- | --- | --- |
| 工作台 | [1440-home](screenshots/1440-home.png) | [1024-home](screenshots/1024-home.png) | [mobile-home](screenshots/mobile-home.png) |
| 我的项目 | [1440-projects](screenshots/1440-projects.png) | [1024-projects](screenshots/1024-projects.png) | [mobile-projects](screenshots/mobile-projects.png) |
| 项目总览 | [1440-overview](screenshots/1440-overview.png) | [1024-overview](screenshots/1024-overview.png) | [mobile-overview](screenshots/mobile-overview.png) |
| 资料与变更 | [1440-change](screenshots/1440-change.png) | [1024-change](screenshots/1024-change.png) | [mobile-change](screenshots/mobile-change.png) |
| 智能研究 | [1440-research](screenshots/1440-research.png) | [1024-research](screenshots/1024-research.png) | [mobile-research](screenshots/mobile-research.png) |
| 方案与决策 | [1440-solution](screenshots/1440-solution.png) | [1024-solution](screenshots/1024-solution.png) | [mobile-solution](screenshots/mobile-solution.png) |
| 成本与报价 | [1440-cost](screenshots/1440-cost.png) | [1024-cost](screenshots/1024-cost.png) | [mobile-cost](screenshots/mobile-cost.png) |
| 文档与交付 | [1440-deliver](screenshots/1440-deliver.png) | [1024-deliver](screenshots/1024-deliver.png) | [mobile-deliver](screenshots/mobile-deliver.png) |
| 研究资料库 | [1440-library](screenshots/1440-library.png) | [1024-library](screenshots/1024-library.png) | [mobile-library](screenshots/mobile-library.png) |
| 运行记录 | [1440-runs](screenshots/1440-runs.png) | [1024-runs](screenshots/1024-runs.png) | [mobile-runs](screenshots/mobile-runs.png) |
| 设置 | [1440-settings](screenshots/1440-settings.png) | [1024-settings](screenshots/1024-settings.png) | [mobile-settings](screenshots/mobile-settings.png) |

截图中的“模型不可用”“联网：不可用”是测试环境的真实能力状态（未配置模型与 Web Provider），对应按钮已禁用并显示原因，不是演示占位。
