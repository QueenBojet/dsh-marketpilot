# DSH AI 工作模式与研究 Skill

MarketPilot 是 DSH 插件，不自建模型或搜索客户端。

## 执行路径

- 工作台通过受控 `/v4/run` 入口发起 DSH Tool 执行，当前模型选择交给 DSH 会话。
- `MarketPilotService.modelFor` 使用 `HarnessStructuredModel`；后者调用 DSH `subagents.start`，使用宿主模型路由、取消信号、结构化输出和持久会话。
- 资料分析、研究计划、研究报告、研究对话、文档章节建议均经过这一适配器。`marketpilotModel` 是显式测试注入，不是生产备用 API。
- 联网由 DSH `ctx.web.search` / `ctx.web.fetch` 执行；MarketPilot 只整理结果、保存真实正文及验证摘录。没有独立厂商密钥管理或绕过 DSH 的搜索请求。
- 确认需求、路线、成本、文档和发布由 DSH Human Gate 执行；模型不能代替授权。

## Skill 注入

技能位于 `skills/marketpilot-deep-research/SKILL.md`，参考上游 Deep-Research-skills 的固定提交，保留 MIT 许可证和适配说明。没有安装或执行上游脚本。

支持 Skills 服务的 DSH 宿主通过公开 `skills.register` 得到该技能；研究计划、对话和报告还会在调用模型前显式读取文件并注入提示，因此结构化子代理不需要额外的文件读取权限。缺失或无效文件明确失败，不静默跳过。研究运行记录包含 Skill SHA-256 前12位，供追溯。

技能随 npm 包的 `skills` 目录发布，隔离准备脚本也复制它。更改 Skill 后下一次研究会读取新内容；注册目录中的内容在插件重载时更新。

## 运行约束

Skill 提供研究方法，不提供搜索后端。DSH 必须已有可用的搜索与正文抓取 Provider。不能把聊天模型供应商凭据自动用于另一家搜索服务。

“仅联网”没有本次成功抓取的网页正文时停止生成；“本地+联网”允许基于本地资料报告，但保存实际联网失败状态和原因。网页摘录必须在保存的正文中可定位。技能指纹或模型返回结果均不代表联网通过。

2026-10-13 实机：okai2/qwen3.8-flash/low 的本地研究成功，已记录注入指纹。最初公开 IMO 查询经过默认 DeepSeek 搜索，因缺少 `DEEPSEEK_API_KEY` 失败。随后按用户授权在隔离 Profile 安装 dsh-web-search-pro 0.2.1 并选为搜索、抓取 Provider；真实网页研究 completed，2 个正文成功、1 个失败。无需 DeepSeek 密钥；模型供应商与搜索 Provider 独立。

## 已验证的搜索安装

- 安装范围：隔离 Harness Profile `C:/Users/zjdzc/AppData/Local/Temp/marketpilot-v4-gui-isolated-C0MRRc/harness/profiles/web`，不是正式 Desktop Profile。
- npm 包：`dsh-web-search-pro@0.2.1`，独立安装到 `C:/Users/zjdzc/AppData/Local/Temp/marketpilot-search-pro-021`，通过目录 junction 提供给 Profile。避免在有共享依赖 junction 的 Profile 中执行 npm install。
- 宿主：Desktop 0.11.0 所带 DSH 0.2.0-rc.2；插件声明兼容 `>=0.2.0-rc.2 <0.2.1-0`。仓库里的 DSH 0.2.1-alpha.1 不在此兼容范围。
- Profile 的 package.json dependency 和 DSH bundle 列表加入插件；变更前 package.json、cordis.patch.yml 均留有 `.before-search-pro` 备份。

隔离 cordis.patch.yml 的关键配置（迁移时保留对应环境自己的 dbPath）：

```yaml
- id: web-search-pro
  config:
    registerProvider: true
    providerId: web-search-pro
    engines: [ddg, bing]
    enableCliBackends: false
    opencliEnabled: false
    agentReachEnabled: false
    provider:
      evidence: off
    evidence:
      jevMode: off
- id: web
  config:
    searchProvider: web-search-pro
    fetchProvider: web-search-pro
```

插件独立 LLM/Jev 评分未启用；报告生成继续使用 DSH subagents 和顶部所选模型。未安装可选浏览器插件。`registerProvider` 必须开启，否则只有插件工具而没有供 MarketPilot 使用的 ctx.web Provider。

浏览器证据：`desktop-gui/fixes/05-search-pro-real-research.*`。成功正文包含 IMO 官方首页和同名数学奥赛站；第三个来源失败。报告明确区分噪声与资料不足，1 条无法定位的引用被移除并标记复核。本次仅证明真实搜索、抓取、Skill 注入和 DSH 模型生成贯通，不代表 MARPOL 条文研究充分或全部搜索引擎分别通过。
