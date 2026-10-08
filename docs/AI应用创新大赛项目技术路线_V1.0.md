# AI应用创新大赛项目技术路线 V1.0

> 项目暂定名称：面向智能船舶与无人系统市场工作的 AI 调研与方案生成助手  
> 产品名称：MarketPilot 智策  
> 技术底座：DeepSeek Harness + MarketPilot 业务插件 + 大模型 + 检索工具 + 项目知识空间  
> 参赛赛道：市场与综合管理创新赛道——市场工作方向  
> 版本：V1.0  
> 日期：2026-10-03

---

## 1. 项目定位

本项目面向智能系统部真实市场技术工作，将“客户需求理解—外部调研—竞品分析—行业政策/标准研判—技术路线比选—方案生成—招投标响应—产品场景迭代”固化为一套可复用、可追溯、可人工复核的 AI 工作流。

本项目不以训练新模型为主要目标，也不定位为通用聊天机器人，而是以 **DeepSeek Harness 的插件化 Agent Harness 能力为底座**，构建专门服务于部门市场与技术方案工作的业务插件。

### 1.1 大赛适配性

依据《智能系统部2026年AI应用创新大赛》：

- 市场工作方向明确包括市场拓客、竞品分析、行业政策研判、方案智能生成、客户需求挖掘、产品场景迭代、招投标材料智能优化等商业化创新；
- 作品需具备演示、展示条件；
- 项目说明书需包括场景说明、对比增效数据、复用价值说明；
- 评分侧重场景真实性、落地实用性与成果完整性。

因此本项目的实现目标应优先满足：

1. **有真实业务场景**：以 CALM 单点系泊漏油监测方案为 Golden Case；
2. **有可运行成果**：至少打通需求提取、竞品调研、证据管理、方案生成、投标检查；
3. **有真实增效数据**：记录人工基线与 AI 工作流耗时；
4. **有可复用性**：可迁移到无人船、智能机舱、船舶智能运维等项目。

---

## 2. 当前业务痛点

### 2.1 信息获取高度依赖人工

新市场项目通常需要分别查找行业政策、标准规范、竞品、厂家 Datasheet、应用案例、论文、历史项目与内部产品资料。资料来源分散，不同人员检索深度差异明显。

### 2.2 调研、判断与方案编写相互割裂

传统流程常表现为：

```text
搜索资料
→ Word/Excel 手工整理
→ 重复查参数
→ 技术路线比选
→ 编写方案
→ 再回头补证据
```

信息在多个文件间重复搬运，且项目事实、推断、假设和最终决策没有统一的数据结构。

### 2.3 AI 使用停留在单轮 Prompt

现有 AI 工具能搜索、总结、写方案，但通常缺少跨步骤的结构化状态。前一步调研得出的结论不会自动成为后续竞品比较、技术路线比选和投标响应的受控输入。

### 2.4 工程结论缺乏证据链

技术方案中容易出现：

- 将 AI 推断写成已确认事实；
- 将厂商宣传值直接变成项目验收指标；
- 将科研试验能力直接等同于工业成熟能力；
- 技术参数前后不一致；
- 有结论但无法回溯原始来源。

### 2.5 客户需求未形成统一基线

客户需求通常来自需求书、会议纪要、邮件、PPT、招标文件和口头交流。真正需要识别的是：

- 显性需求；
- 隐含需求；
- 强制约束；
- 商业关注点；
- 未知条件；
- 冲突项；
- 待澄清问题。

### 2.6 项目经验难以反哺产品

多个项目中反复出现的“断网续传、边缘自治、防爆、海工防腐、多源融合、数据留存”等要求没有被结构化汇总为产品能力缺口和产品迭代建议。

---

## 3. 建设目标

建设一个基于 DeepSeek Harness 的 MarketPilot 业务插件，实现六项业务能力：

1. 竞品分析；
2. 行业政策与标准研判；
3. 客户需求挖掘；
4. 技术方案智能生成；
5. 产品场景与能力迭代；
6. 招投标材料智能优化。

系统不建设六套彼此独立的 Agent，而采用：

> **统一 Project + 统一 Evidence Ledger + Workflow 编排 + 业务 Skill + Human-in-the-loop**

的实现方式。

---

## 4. 总体架构

```text
┌──────────────────────────────────────────┐
│                用户交互层                │
│ 项目首页 / 文件上传 / 工作流 / 结果审阅 │
└─────────────────┬────────────────────────┘
                  │
┌─────────────────▼────────────────────────┐
│              Workflow 编排层             │
│ Research / Extract / Analyse / Generate  │
│ Review / Human Gate                      │
└──────┬──────────┬──────────┬─────────────┘
       │          │          │
┌──────▼───┐ ┌────▼────┐ ┌───▼────────────┐
│竞品分析  │ │政策研判 │ │客户需求挖掘     │
├──────────┤ ├─────────┤ ├────────────────┤
│方案生成  │ │产品迭代 │ │招投标优化       │
└──────┬───┘ └────┬────┘ └───┬────────────┘
       │           │          │
┌──────▼───────────▼──────────▼────────────┐
│           Project Knowledge Space        │
│ Requirement / Evidence / Competitor      │
│ Policy / Product / Decision / Unknown    │
│ Assumption / Inference / Artifact        │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│               工具与数据层               │
│ Web / PDF / DOCX / Markdown / 内部资料   │
│ 搜索 / 文档解析 / 模板 / 文件生成        │
└──────────────────────────────────────────┘
```

---

## 5. 核心设计一：Project Knowledge Space

每个市场任务创建独立 Project，作为六类业务工作流共享的项目上下文。

```text
Project
├── ProjectProfile      项目基本信息
├── Requirements        客户需求基线
├── Constraints         工程与商务约束
├── Unknowns            待确认事项
├── Evidence            事实与证据
├── Competitors         竞品与技术路线
├── Policies            政策、标准、规范
├── InternalProducts    内部产品能力
├── Alternatives        候选技术路线
├── Decisions           人工确认后的项目决策
├── Risks               风险与边界
└── Artifacts           调研、方案、投标响应等成果
```

核心原则：

- 六项业务能力共享同一 Project；
- 不重复建立互相不一致的事实集；
- 所有技术路线与正式成果均可回溯 Requirement 与 Evidence；
- Human Gate 确认后的 Decision 优先级高于模型推断。

---

## 6. 核心设计二：Evidence Ledger

对关键信息实行强制分类：

| 类型 | 定义 |
|---|---|
| FACT | 项目内已经确认的事实 |
| SOURCE | 支撑事实或判断的外部/内部证据 |
| ASSUMPTION | 当前为了推进方案而采用的工程假设 |
| INFERENCE | 模型或人员基于证据形成的分析判断 |
| DECISION | 人工确认后的方案决策 |
| UNKNOWN | 尚未明确、不得擅自补全的信息 |

示例：

```text
FACT
输送介质为加热原油。

SOURCE
客户提供的技术资料。

INFERENCE
新鲜泄漏初期可能出现与海水的温差特征。

DECISION
红外热成像定位为复核与辅助检测手段，不作为全工况唯一主检。

UNKNOWN
全年实际油温与海表温度差范围。

ACTION
实施前获取现场年度油温和海温数据。
```

### 6.1 Evidence 最低字段

```text
id
projectId
kind
title
statement
sourceType
sourceName
sourceLocator
sourceUrl/fileRef
confidence
status
createdAt
createdBy
links[]
```

### 6.2 关键规则

- 无证据参数不得自动标记为“已确认”；
- 研究论文的实验能力不得自动转写为项目保证值；
- 厂商宣传信息需保留来源类型；
- UNKNOWN 不得由模型静默补全；
- 所有方案关键结论应能链接到至少一个 Requirement 或 Evidence。

---

## 7. 业务 Workflow

## 7.1 客户需求挖掘

### 输入

- 客户需求书；
- 招标文件；
- 技术交流纪要；
- PPT；
- 邮件文本；
- 用户直接描述。

### 流程

```text
资料导入
→ 场景识别
→ 显性需求提取
→ 约束提取
→ 隐含需求分析
→ 冲突检测
→ UNKNOWN 识别
→ Requirement Baseline
→ 客户澄清问题
→ Human Gate #1
```

### 输出

《客户需求基线表》

| ID | 原始表述 | 标准化需求 | 类型 | 强制性 | 状态 | 风险 | 来源 |
|---|---|---|---|---|---|---|---|

---

## 7.2 竞品分析

### 流程

```text
应用场景
→ 生成检索计划
→ 技术路线识别
→ 厂商/产品发现
→ 优先读取官方资料
→ 参数结构化
→ 案例与认证提取
→ 证据可信度标记
→ 竞品矩阵
→ 我方 Gap
```

### 输出

- 技术路线图；
- 竞品清单；
- 竞品能力矩阵；
- 成熟度判断；
- 应用边界；
- 我方能力缺口；
- 原始证据列表。

---

## 7.3 行业政策与标准研判

### 流程

```text
项目场景
→ 识别标准体系
→ 搜索政策/法规/标准
→ 判断发布机构与版本
→ 判断适用范围
→ 提取关键要求
→ 转化为项目/产品要求
→ Compliance Gap
```

### 输出

| 标准/政策 | 发布机构 | 适用范围 | 核心要求 | 当前符合 | 缺口 | 来源 |
|---|---|---|---|---|---|---|

MVP 阶段以基础能力为主，不追求自动覆盖完整标准体系。

---

## 7.4 技术方案智能生成

不允许“输入一句话直接生成最终方案”，而采用受控链路：

```text
Requirement Baseline
       │
       ├── Competitor
       ├── Policy
       ├── Evidence
       ├── Internal Product
       └── Constraints
              ↓
        候选技术路线 A/B/C
              ↓
           比选矩阵
              ↓
       Human Gate #2
              ↓
          Decision
              ↓
        系统架构/设备组成
              ↓
       数据流程/报警逻辑
              ↓
       实施/测试/风险边界
              ↓
         技术方案初稿
              ↓
          Review
```

正式方案前必须至少产生：

1. 客户需求基线；
2. 事实—假设—未知条件表；
3. 竞品与技术路线矩阵；
4. 技术路线比选；
5. 方案大纲。

---

## 7.5 产品场景迭代

输入：

- 多项目 Requirement；
- 竞品能力；
- 投标失分项；
- 现场问题；
- 产品现有能力。

流程：

```text
Capability Gap
→ 跨项目归并
→ 出现频次
→ 项目特有/共性需求判断
→ 产品能力建议
```

输出字段：

```text
能力名称
需求来源
关联项目
客户价值
竞品状态
现产品状态
建议动作
优先级
证据
```

MVP 只实现单项目 Gap 与简单聚合，不做复杂知识图谱。

---

## 7.6 招投标材料智能优化

定位为“Compliance Review”，而不是语言润色。

流程：

```text
招标文件
→ 条款切分
→ Requirement 映射
→ 产品能力匹配
→ 证据关联
→ 满足/部分满足/不满足/待确认
→ 响应草稿
→ 一致性检查
→ 风险检查
```

核心输出：

| 条款 | 要求 | 响应 | 证据 | 状态 | 风险 |
|---|---|---|---|---|---|

硬规则：

> 没有证据支撑的参数不得自动填写“满足”。

---

## 8. 通用 AI 工作循环

六项 Workflow 底层复用五类动作：

```text
RESEARCH  → 搜索与资料获取
EXTRACT   → 结构化信息提取
ANALYSE   → 比较、关联与推理
GENERATE  → 成果生成
REVIEW    → 证据、一致性与风险检查
```

形成：

```text
Research
   ↓
Extract
   ↓
Analyse
   ↓
Generate
   ↓
Review
   │
   └── 发现缺口 → Research / Human Gate
```

---

## 9. DeepSeek Harness 实现原则

DeepSeek Harness 当前采用基于 Cordis 的 “Everything is a Plugin” 架构。MarketPilot 应作为独立插件或插件组合挂载，不应为了业务功能直接修改 Harness 核心。

### 9.1 实现原则

1. 优先扩展插件，不 fork 修改核心；
2. 业务数据结构与 Harness 生命周期解耦；
3. Prompt、Schema、Workflow 与模板均放在 MarketPilot 自身目录；
4. 通过 Harness 已有 `ctx.tools`、`ctx.llm`、`ctx.sessions` 等服务接入模型、工具和会话能力；
5. 实际编码前以当前仓库内 `docs/architecture.md`、`docs/cordis-primer.md`、插件教程与现有类型定义为准；
6. DeepSeek Harness 仍处于 Developer Preview，不假设接口长期稳定。

### 9.2 建议插件结构

```text
dsh-market-pilot/
├─ src/
│  ├─ index.ts
│  ├─ services/
│  │  ├─ project-service.ts
│  │  ├─ evidence-service.ts
│  │  ├─ workflow-service.ts
│  │  ├─ knowledge-service.ts
│  │  └─ artifact-service.ts
│  ├─ workflows/
│  │  ├─ requirement-analysis.ts
│  │  ├─ competitor-analysis.ts
│  │  ├─ policy-analysis.ts
│  │  ├─ solution-generation.ts
│  │  ├─ product-gap.ts
│  │  └─ tender-review.ts
│  ├─ schemas/
│  ├─ tools/
│  └─ prompts/
├─ templates/
├─ fixtures/
└─ test/
```

具体目录必须根据当前 Harness 插件规范调整，不在 V1.0 阶段强行假定 API。

---

## 10. Human-in-the-loop

设置三个明确人工确认点。

### Gate #1 需求确认

AI 形成 Requirement Baseline 后由用户确认：

- 哪些是 MUST；
- 哪些是未知；
- 是否存在误解。

### Gate #2 技术路线确认

AI 输出候选路线与比选矩阵后，由工程人员确认正式技术路线。

### Gate #3 成果发布

正式方案或投标响应导出前必须经过人工 Review。

系统定位：

> AI 承担高强度资料处理、结构化和初稿工作，人承担客户理解、工程决策和最终签发责任。

---

## 11. MVP 范围

### P0：比赛前必须完成

1. Project 创建与读取；
2. 文件导入；
3. 客户需求提取；
4. Evidence Ledger；
5. 竞品信息结构化；
6. 技术路线比较；
7. 技术方案 Markdown 生成；
8. 招标 Compliance Matrix；
9. CALM Golden Case；
10. 基本 Review 与结果导出。

### P1：具备基础入口

- 政策/标准研判；
- 产品能力 Gap。

### P2：赛后扩展

- 企业历史项目库；
- 内部产品库；
- 标准规范库；
- CRM；
- 邮件；
- 商机监测；
- 行业动态监控；
- PPT/Word 高级模板；
- 多项目产品路线分析。

---

## 12. CALM Golden Case

本项目使用“CALM 单点系泊水面与水下漏油监测”作为主演示案例。

该案例具有完整业务链：

```text
模糊需求
→ 国内外技术调研
→ 竞品分析
→ 红外专项可行性分析
→ 水面方案
→ 水下方案
→ 工程边界
→ 多轮技术路线调整
→ 正式技术方案
```

### 12.1 水面现有技术路线

现有方案已经形成：

> 油污监测雷达广域扫描 + 红外/可见光双光谱复核 + 姿态环境辅助 + 边缘计算 + 岸基综合报警平台。

### 12.2 水下现有技术路线

现有方案已经形成：

> 三维成像声纳发现水下异常 + UV 荧光油份传感器提供油类证据 + 温度梯度探头辅助 + 浮筒端边缘计算机完成多源融合与分级报警。

### 12.3 Golden Case 价值

可用于验证：

- 需求提取；
- 事实、假设与未知条件区分；
- 国内外技术调研；
- 竞品结构化；
- 技术成熟度分析；
- A/B/C 技术路线比选；
- 方案生成；
- 工程边界审查；
- Evidence Ledger。

---

## 13. Demo 流程

现场示例输入：

> 某客户拟建设 CALM 单点系泊水面与水下漏油监测系统，希望实现全天候监测、泄漏报警与事件留存，请开展市场调研并形成初步技术方案。

演示流程：

```text
创建项目
↓
上传需求/背景资料
↓
需求基线
↓
UNKNOWN / Constraint
↓
竞品与行业调研
↓
Evidence Ledger
↓
技术路线 A/B/C
↓
人工确认
↓
生成技术方案
↓
导入模拟招标文件
↓
Compliance Matrix
```

演示重点不是“AI 几秒写出几十页”，而是：

> **最终方案可以从结论一路回溯到客户需求与原始证据。**

---

## 14. 对比增效指标

比赛数据不得预先虚构，应从实际试运行记录。

### 14.1 时间指标

- T1：需求整理时间；
- T2：资料检索时间；
- T3：竞品整理时间；
- T4：方案初稿时间；
- T5：招标检查时间；
- T_total：全过程耗时。

效率提升：

```text
Efficiency = (T_manual - T_AI) / T_manual
```

### 14.2 质量指标

- 关键结论证据覆盖率；
- 有来源技术参数比例；
- Requirement Coverage；
- UNKNOWN 数量；
- Unsupported Claim 数量；
- 参数前后不一致数量；
- 投标条款漏响应数量；
- 人工修改轮次。

---

## 15. 质量检查

### 15.1 Evidence Coverage

```text
有证据关键结论数 / 全部关键结论数
```

### 15.2 Requirement Coverage

```text
已响应需求数 / 总需求数
```

### 15.3 发布前必须检查

- 未闭环 MUST 需求；
- Unsupported Claim；
- UNKNOWN 被错误写成事实；
- 参数冲突；
- 证据失效；
- 未确认的工程保证值；
- 投标条款未响应。

---

## 16. 数据与安全边界

比赛作品不得涉及敏感信息，因此 Golden Case 只使用：

- 公开互联网资料；
- 脱敏项目背景；
- 允许展示的技术资料；
- 自制模拟招标文件。

产品化阶段再逐步增加：

- 本地部署；
- 权限隔离；
- 项目空间隔离；
- 操作审计；
- 数据脱敏；
- 模型调用策略；
- 内外网知识源分层。

---

## 17. 开发计划

### 10月3—4日

- 冻结技术路线；
- 定义 Project / Requirement / Evidence / Competitor Schema；
- 建立插件骨架。

### 10月5—6日

- ProjectService；
- EvidenceService；
- 文件导入；
- Requirement Workflow。

### 10月7—8日

- Competitor Workflow；
- 结构化证据；
- CALM Fixture。

### 10月9日

- Alternative/Decision；
- Solution Generation。

### 10月10日

- Tender Review；
- Compliance Matrix。

### 10月11日

- Policy 基础功能；
- Product Gap 基础功能。

### 10月12日

- CALM Golden Case 全流程跑通。

### 10月13日

- 人工流程与 AI 流程对照测试；
- 记录增效数据。

### 10月14日

- 项目说明书；
- 汇报材料；
- Demo 数据冻结；
- 录屏备份。

### 10月15日

- 最终提交。

---

## 18. 10 分钟汇报建议

### 0:00—1:00：业务痛点

市场技术工作的主要瓶颈不是不会写材料，而是信息分散、重复检索、经验依赖和证据链缺失。

### 1:00—2:00：系统架构

展示：

```text
需求 → 情报 → 决策 → 方案 → 投标 → 产品
```

### 2:00—7:00：CALM Demo

```text
需求
→ Requirement
→ Evidence
→ Competitor
→ Alternative
→ Decision
→ Solution
→ Tender Review
```

### 7:00—8:30：增效数据

展示时间与质量两类对照数据。

### 8:30—9:30：复用价值

说明可复用于：

- 无人船；
- 无人机舱；
- 船舶智能运维；
- 智能决策；
- 感知系统；
- 其他技术型市场项目。

### 9:30—10:00：总结

> MarketPilot 不是给市场人员增加一个聊天机器人，而是把“需求—情报—决策—方案—投标—产品迭代”沉淀为一套可复用的 AI 工作流。

---

## 19. V1.0 核心创新点

1. **从聊天问答转为 Workflow 驱动**；
2. **以 Project Knowledge Space 保持跨环节一致上下文**；
3. **以 Evidence Ledger 实现工程结论可追溯**；
4. **Human-in-the-loop 保留工程人员关键决策权**；
5. **将单项目需求进一步沉淀为产品 Capability Gap**。

---

## 20. V1.0 冻结范围

### 必须完成

```text
Project
Requirement
Evidence
Competitor
Alternative
Decision
TenderItem

Requirement Workflow
Competitor Workflow
Solution Workflow
Tender Workflow

CALM Golden Case
```

### 暂不做深

```text
复杂知识图谱
模型微调
多 Agent 自主协作
CRM
邮件自动化
长期监控
企业级权限系统
```

---

## 21. 依据资料

### 大赛文件

- 《智能系统部2026年AI应用创新大赛.docx》

### Golden Case

- 《国内外成熟的海上单点系泊 CALM 装置水面与水下管系泄漏检测与报警工业化技术方案分析报告.md》
- 《红外热成像用于CALM单点系泊周边海面漏油检测的可行性与成熟度评估.md》
- 《CALM单点系泊水面漏油监测报警技术方案.docx》
- 《单点系泊水下漏油监测报警技术方案-V4.0(3).md》
- camera1(1).pdf、camera2(1).pdf 可作为后续设备资料解析测试样本，不作为 MVP 必需依赖。

### DeepSeek Harness 实现依据

编码时以当前官方仓库为准，重点先阅读：

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/cordis-primer.md`
- `docs/cordis-tutorial/`
- 当前版本插件示例及工具注册实现

> DeepSeek Harness 处于 Developer Preview。不得根据旧示例硬编码已变化 API，应先检查当前仓库类型与插件规范再实现。
