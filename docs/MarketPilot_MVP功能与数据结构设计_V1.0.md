# MarketPilot MVP功能与数据结构设计 V1.0

> 对应项目：《AI应用创新大赛项目技术路线 V1.0》  
> 产品：MarketPilot 智策  
> 目标：在比赛前形成可运行、可演示、可复用的最小闭环  
> 版本：V1.0  
> 日期：2026-10-03

---

## 1. MVP 定义

MarketPilot MVP 不追求完整企业平台，而验证以下核心假设：

> 能否把一个真实市场技术项目从“原始需求”稳定推进到“需求基线—证据—竞品—技术路线—方案—投标检查”，并保持全过程可回溯。

MVP 成功标准：

1. 可创建独立项目；
2. 可导入 Markdown/TXT，预留 PDF/DOCX；
3. 可从资料生成结构化 Requirement；
4. 可记录 FACT/SOURCE/ASSUMPTION/INFERENCE/DECISION/UNKNOWN；
5. 可形成 Competitor 结构化记录；
6. 可形成 2—3 个 Alternative 并人工选定 Decision；
7. 可按模板生成 Markdown 技术方案；
8. 可将招标条款拆为 TenderItem 并生成 Compliance Matrix；
9. CALM Golden Case 可稳定演示；
10. 所有核心输出可保存和再次读取。

---

## 2. MVP 用户角色

### 2.1 MarketEngineer

市场/方案工程师，主要操作：

- 创建项目；
- 上传资料；
- 启动工作流；
- 校核 Requirement；
- 校核 Evidence；
- 选择技术路线；
- 导出成果。

### 2.2 Reviewer

主管设计师/项目负责人：

- 审核 Requirement；
- 审核关键技术判断；
- 确认 Decision；
- 审核正式成果。

MVP 可以暂不实现复杂账号权限，角色作为逻辑状态保留。

---

## 3. MVP 页面/入口

如果 DeepSeek Harness 当前 Web UI 插件扩展成本较高，比赛版本允许先使用“工具 + 会话 + Markdown 结果”的轻 UI 方案；如果现有 Web 扩展点成熟，再增加专用页面。

### 3.1 Project Home

展示：

```text
项目名称
客户/行业
当前阶段
资料数量
Requirement 数量
Evidence 数量
Competitor 数量
Unknown 数量
当前 Decision
最近 Workflow
```

主要操作：

- 新建项目；
- 打开项目；
- 导入资料；
- 启动需求分析；
- 启动竞品分析；
- 生成方案；
- 投标检查。

### 3.2 Requirement Review

列表字段：

```text
ID
原文
标准化需求
类型
Must/Should/Could
状态
来源
风险
```

操作：

- 确认；
- 编辑；
- 标记 UNKNOWN；
- 驳回；
- 添加备注。

### 3.3 Evidence Ledger

按类型筛选：

```text
FACT
SOURCE
ASSUMPTION
INFERENCE
DECISION
UNKNOWN
```

每条可查看：

- statement；
- source；
- confidence；
- 关联 Requirement；
- 关联 Competitor；
- 关联 Decision。

### 3.4 Competitor Matrix

展示：

```text
厂商
产品
技术路线
关键参数
应用场景
认证
案例
优点
限制
来源
```

### 3.5 Alternative Review

展示 A/B/C 候选技术路线。

每条：

```text
方案名称
组成
适用场景
优势
限制
主要证据
风险
待确认事项
```

用户执行 Human Gate #2：

```text
选择方案
确认理由
补充约束
```

### 3.6 Solution Preview

输出 Markdown：

- 项目背景；
- 需求分析；
- 设计边界；
- 技术路线；
- 系统组成；
- 工作流程；
- 主要功能；
- 实施建议；
- 测试验证；
- 风险与 UNKNOWN。

### 3.7 Tender Review

展示 Compliance Matrix：

```text
条款
要求
响应
Evidence
状态
风险
```

---

## 4. 数据持久化策略

MVP 优先选择简单、可检查、可迁移的持久化方式。

建议优先级：

### 方案 A：SQLite

推荐。

优势：

- 可查询；
- 事务清晰；
- 便于演示；
- 单机部署；
- 后续迁移方便。

### 方案 B：JSON 文件

若插件阶段无法稳定接入 SQLite，可先使用：

```text
.marketpilot/
projects/{projectId}/project.json
projects/{projectId}/requirements.json
projects/{projectId}/evidence.json
...
```

但 Service API 不变，后续替换存储实现。

原则：

> Workflow 层不得直接操作文件或 SQL，只通过 Service Repository 接口读写。

---

## 5. 核心数据模型

建议使用 TypeScript 类型 + 运行时校验。具体 Schema 库服从 DeepSeek Harness 当前依赖，不为引入新库而增加不必要依赖。

---

## 5.1 Project

```ts
type ProjectStatus =
  | 'draft'
  | 'requirements_ready'
  | 'researching'
  | 'alternatives_ready'
  | 'decision_confirmed'
  | 'solution_ready'
  | 'tender_review'
  | 'archived'

interface Project {
  id: string
  name: string
  description?: string
  customer?: string
  industry?: string
  scenario?: string
  status: ProjectStatus

  createdAt: string
  updatedAt: string

  activeDecisionId?: string
  metadata?: Record<string, unknown>
}
```

---

## 5.2 SourceDocument

```ts
type SourceDocumentKind =
  | 'customer_requirement'
  | 'tender'
  | 'meeting_note'
  | 'internal_reference'
  | 'competitor_datasheet'
  | 'standard'
  | 'report'
  | 'other'

interface SourceDocument {
  id: string
  projectId: string
  name: string
  kind: SourceDocumentKind
  mimeType?: string

  originalPath?: string
  importedAt: string

  textContent?: string
  checksum?: string
  metadata?: Record<string, unknown>
}
```

MVP 原则：

- Markdown/TXT 必须支持；
- DOCX/PDF 可先调用 Harness/已有解析能力；若没有，则使用可替换适配层；
- 不在 Workflow 内硬编码解析库。

---

## 5.3 Requirement

```ts
type RequirementType =
  | 'functional'
  | 'performance'
  | 'interface'
  | 'environment'
  | 'safety'
  | 'compliance'
  | 'installation'
  | 'maintenance'
  | 'commercial'
  | 'constraint'
  | 'other'

type RequirementPriority = 'must' | 'should' | 'could'

type RequirementStatus =
  | 'proposed'
  | 'confirmed'
  | 'unknown'
  | 'conflict'
  | 'superseded'

interface Requirement {
  id: string
  projectId: string

  originalText: string
  normalizedText: string

  type: RequirementType
  priority: RequirementPriority
  status: RequirementStatus

  sourceDocumentId?: string
  sourceLocator?: string

  rationale?: string
  risk?: string
  clarificationQuestion?: string

  createdAt: string
  updatedAt: string
}
```

---

## 5.4 Evidence

```ts
type EvidenceKind =
  | 'FACT'
  | 'SOURCE'
  | 'ASSUMPTION'
  | 'INFERENCE'
  | 'DECISION'
  | 'UNKNOWN'

type EvidenceStatus =
  | 'draft'
  | 'verified'
  | 'rejected'
  | 'superseded'

type EvidenceSourceType =
  | 'customer'
  | 'internal'
  | 'official'
  | 'vendor'
  | 'standard'
  | 'paper'
  | 'web'
  | 'model'
  | 'human'
  | 'unknown'

interface Evidence {
  id: string
  projectId: string

  kind: EvidenceKind
  title: string
  statement: string

  sourceType: EvidenceSourceType
  sourceName?: string
  sourceDocumentId?: string
  sourceLocator?: string
  sourceUrl?: string

  confidence?: number
  status: EvidenceStatus

  relatedRequirementIds: string[]
  relatedCompetitorIds: string[]
  relatedAlternativeIds: string[]

  createdAt: string
  updatedAt: string
}
```

约束：

- `FACT` 推荐至少有 customer/internal/official/vendor/standard/paper 来源；
- `INFERENCE` 必须允许关联支撑 Evidence；
- `DECISION` 必须记录 Human Gate 信息；
- `UNKNOWN` 不应自动转为 FACT。

---

## 5.5 Competitor

```ts
interface Competitor {
  id: string
  projectId: string

  company: string
  product?: string
  technology?: string
  targetScenario?: string

  performance: Record<string, string | number | boolean | null>
  interfaces: string[]
  certifications: string[]
  cases: string[]

  strengths: string[]
  limitations: string[]

  evidenceIds: string[]

  createdAt: string
  updatedAt: string
}
```

MVP 不要求统一所有行业参数。`performance` 使用 KV，后续再做行业模板。

---

## 5.6 PolicyOrStandard

```ts
interface PolicyOrStandard {
  id: string
  projectId: string

  title: string
  issuer?: string
  documentNumber?: string
  version?: string

  scope?: string
  mandatoryLevel?: 'mandatory' | 'recommended' | 'unknown'

  keyRequirements: string[]
  impact?: string
  gap?: string

  evidenceIds: string[]
}
```

---

## 5.7 Alternative

```ts
interface Alternative {
  id: string
  projectId: string

  name: string
  summary: string

  components: string[]
  strengths: string[]
  limitations: string[]
  risks: string[]
  unknowns: string[]

  requirementCoverage: Record<string, 'full' | 'partial' | 'none' | 'unknown'>
  evidenceIds: string[]

  status: 'draft' | 'candidate' | 'selected' | 'rejected'
}
```

---

## 5.8 Decision

```ts
interface Decision {
  id: string
  projectId: string
  alternativeId: string

  decision: string
  rationale: string

  confirmedBy: string
  confirmedAt: string

  evidenceIds: string[]
  requirementIds: string[]
}
```

要求：

- 方案最终生成优先读取 Decision；
- 不允许模型静默替换已确认 Decision。

---

## 5.9 TenderItem

```ts
type ComplianceStatus =
  | 'compliant'
  | 'partially_compliant'
  | 'non_compliant'
  | 'unknown'
  | 'not_applicable'

interface TenderItem {
  id: string
  projectId: string

  clauseId?: string
  originalText: string
  normalizedRequirement: string

  responseDraft?: string
  status: ComplianceStatus

  requirementIds: string[]
  evidenceIds: string[]

  risk?: string
  action?: string
}
```

硬规则：

```text
当 evidenceIds 为空且响应涉及具体技术参数/认证时，
不得自动把 status 设置为 compliant。
```

---

## 5.10 Artifact

```ts
type ArtifactType =
  | 'requirement_baseline'
  | 'competitor_matrix'
  | 'research_report'
  | 'alternative_comparison'
  | 'solution'
  | 'compliance_matrix'
  | 'product_gap'
  | 'other'

interface Artifact {
  id: string
  projectId: string
  type: ArtifactType

  name: string
  content: string
  format: 'markdown' | 'json' | 'csv'

  generatedAt: string
  workflowRunId?: string
}
```

---

## 5.11 WorkflowRun

```ts
type WorkflowType =
  | 'requirement_analysis'
  | 'competitor_analysis'
  | 'policy_analysis'
  | 'solution_generation'
  | 'tender_review'
  | 'product_gap'

type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_human'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface WorkflowRun {
  id: string
  projectId: string
  type: WorkflowType
  status: WorkflowRunStatus

  currentStep?: string
  startedAt?: string
  completedAt?: string

  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
}
```

---

## 6. Service 设计

具体实现方式必须服从当前 DeepSeek Harness/Cordis Service API。

逻辑接口建议如下。

### 6.1 ProjectService

```ts
interface ProjectService {
  create(input: CreateProjectInput): Promise<Project>
  get(projectId: string): Promise<Project | null>
  list(): Promise<Project[]>
  update(projectId: string, patch: Partial<Project>): Promise<Project>
  getContext(projectId: string): Promise<ProjectContext>
}
```

### 6.2 RequirementService

```ts
interface RequirementService {
  addMany(projectId: string, items: Requirement[]): Promise<void>
  list(projectId: string): Promise<Requirement[]>
  update(id: string, patch: Partial<Requirement>): Promise<Requirement>
}
```

### 6.3 EvidenceService

```ts
interface EvidenceService {
  add(input: Evidence): Promise<Evidence>
  addMany(items: Evidence[]): Promise<void>
  list(projectId: string): Promise<Evidence[]>
  verify(id: string): Promise<Evidence>
  link(id: string, links: EvidenceLinks): Promise<Evidence>
}
```

### 6.4 CompetitorService

```ts
interface CompetitorService {
  upsert(input: Competitor): Promise<Competitor>
  list(projectId: string): Promise<Competitor[]>
}
```

### 6.5 WorkflowService

```ts
interface WorkflowService {
  start(type: WorkflowType, input: WorkflowInput): Promise<WorkflowRun>
  get(runId: string): Promise<WorkflowRun | null>
  resume(runId: string, humanInput: unknown): Promise<WorkflowRun>
  cancel(runId: string): Promise<void>
}
```

### 6.6 ArtifactService

```ts
interface ArtifactService {
  save(input: Artifact): Promise<Artifact>
  list(projectId: string): Promise<Artifact[]>
  get(id: string): Promise<Artifact | null>
}
```

---

## 7. Harness Tool 设计

为了让 Agent 可调用，建议注册一组粒度较小的工具，而不是单个超级工具。

工具名称可根据 Harness 当前命名规范调整。

### P0 工具

```text
marketpilot_project_create
marketpilot_project_get
marketpilot_document_import

marketpilot_requirement_extract
marketpilot_requirement_list
marketpilot_requirement_confirm

marketpilot_evidence_add
marketpilot_evidence_list
marketpilot_evidence_verify

marketpilot_competitor_extract
marketpilot_competitor_list

marketpilot_alternative_generate
marketpilot_decision_confirm

marketpilot_solution_generate

marketpilot_tender_extract
marketpilot_tender_review

marketpilot_artifact_export
```

工具返回尽量结构化 JSON，同时使用 Harness render 能力提供可读文本。

---

## 8. Workflow 状态机

## 8.1 Requirement Analysis

```text
START
  ↓
LOAD_DOCUMENTS
  ↓
EXTRACT_CANDIDATES
  ↓
NORMALIZE_REQUIREMENTS
  ↓
DETECT_UNKNOWN_AND_CONFLICTS
  ↓
SAVE_REQUIREMENTS
  ↓
WAITING_HUMAN
  ↓
CONFIRMED
  ↓
GENERATE_BASELINE_ARTIFACT
  ↓
COMPLETED
```

失败处理：

- 文档无有效文本 → failed；
- LLM 输出无法通过 Schema → 自动重试一次；
- 再失败 → 保存原始响应并 failed；
- 不能生成空 Requirement 后仍标记 completed。

---

## 8.2 Competitor Analysis

```text
START
  ↓
BUILD_RESEARCH_PLAN
  ↓
COLLECT_SOURCES
  ↓
EXTRACT_COMPETITORS
  ↓
CREATE_EVIDENCE
  ↓
DEDUPLICATE
  ↓
BUILD_MATRIX
  ↓
REVIEW_UNSUPPORTED_CLAIMS
  ↓
SAVE_ARTIFACT
  ↓
COMPLETED
```

MVP 若缺少 Web 搜索能力：

- 支持从用户导入的调研报告和 Datasheet 中抽取；
- 搜索工具设计为 adapter；
- 不让 Workflow 强依赖具体搜索供应商。

---

## 8.3 Solution Generation

前置条件：

- 至少一个 confirmed Requirement；
- 已存在 Evidence；
- 至少一个 Alternative；
- 必须有选中的 Decision。

```text
START
  ↓
VALIDATE_PREREQUISITES
  ↓
BUILD_PROJECT_CONTEXT
  ↓
GENERATE_OUTLINE
  ↓
GENERATE_SECTIONS
  ↓
TRACE_REQUIREMENTS
  ↓
TRACE_EVIDENCE
  ↓
REVIEW_UNSUPPORTED_CLAIMS
  ↓
SAVE_MARKDOWN
  ↓
COMPLETED
```

如果没有 Decision：

```text
status = waiting_human
```

不得自行选定最终方案。

---

## 8.4 Tender Review

```text
START
  ↓
PARSE_CLAUSES
  ↓
NORMALIZE_REQUIREMENTS
  ↓
MATCH_PROJECT_REQUIREMENTS
  ↓
MATCH_EVIDENCE
  ↓
DRAFT_RESPONSE
  ↓
COMPLIANCE_STATUS
  ↓
REVIEW_EVIDENCE_RULES
  ↓
SAVE_MATRIX
  ↓
COMPLETED
```

---

## 9. Prompt/Skill 设计原则

每个 Workflow Step 均采用：

```text
SYSTEM ROLE
TASK
INPUT SCHEMA
BUSINESS RULES
OUTPUT SCHEMA
DO NOT
```

禁止仅使用长自然语言 Prompt 而没有 Schema。

### 9.1 Requirement Extract Prompt 核心规则

- 只从输入资料提取或合理归纳；
- 不知道的信息输出 UNKNOWN；
- 不替客户补全性能指标；
- 保留原文；
- 对约束与性能需求分类；
- 识别冲突；
- 输出结构化 JSON。

### 9.2 Competitor Extract Prompt

- 参数必须关联来源；
- 未找到则 null/unknown；
- 不根据同系列产品推断当前型号；
- 厂商营销陈述标记为 vendor source；
- 研究案例与商业案例分开描述。

### 9.3 Alternative Prompt

- 形成 2—3 个技术路线；
- 不输出“唯一正确答案”；
- 每条路线说明条件、边界、Evidence 与 UNKNOWN；
- 最终选择由 Human Gate 完成。

### 9.4 Solution Prompt

- 优先使用 confirmed Requirement 和 Decision；
- UNKNOWN 必须保留为待确认；
- 没有 Evidence 的具体参数不得擅自写入；
- 清楚区分“建议值”“已有参数”“待验证指标”。

### 9.5 Tender Prompt

- 不得把没有证据的参数声明为满足；
- 不得自行伪造证书、业绩、案例；
- `compliant` 必须能回溯 Evidence；
- 不确定时标记 `unknown` 并生成 action。

---

## 10. ProjectContext 聚合

模型不应直接加载整个项目所有原始文件。

实现 `ProjectContextBuilder`：

```ts
interface ProjectContext {
  project: Project
  confirmedRequirements: Requirement[]
  openUnknowns: Evidence[]
  verifiedFacts: Evidence[]
  assumptions: Evidence[]
  competitors: Competitor[]
  policies: PolicyOrStandard[]
  selectedDecision?: Decision
  relevantArtifacts: Artifact[]
}
```

不同 Workflow 只装载必要上下文。

---

## 11. Golden Case Fixture

建议在仓库中建立：

```text
fixtures/calm/
├─ project.json
├─ input/
│  ├─ 国内外成熟的海上单点系泊CALM装置...分析报告.md
│  ├─ 红外热成像用于CALM...评估.md
│  ├─ CALM单点系泊水面漏油监测报警技术方案.docx
│  └─ 单点系泊水下漏油监测报警技术方案-V4.0.md
├─ expected/
│  ├─ requirements.json
│  ├─ evidence.json
│  └─ baseline.md
└─ README.md
```

注意：

- 比赛现场演示资料必须脱敏；
- 不要将敏感客户信息提交进公共 Git 仓库；
- `.gitignore` 排除真实未脱敏数据目录。

---

## 12. CALM Golden Case 最低预期数据

### 12.1 示例 Requirements

至少识别：

```text
连续监测
水面漏油发现
水下漏油发现
报警与事件留存
海上环境适应
水面/水下多源互证
边缘处理
远程回传
```

### 12.2 示例 Evidence

必须体现：

```text
FACT
ASSUMPTION
INFERENCE
UNKNOWN
DECISION
```

### 12.3 示例 Alternative

例如：

- A：水面雷达 + 双光谱；
- B：近场荧光 + 双光谱；
- C：水面雷达/双光谱 + 水下声纳/油份多源体系。

实际文字不要求与上述完全一致，应以输入资料为依据。

---

## 13. MVP 目录建议

若作为独立插件仓库：

```text
marketpilot/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ src/
│  ├─ index.ts
│  ├─ domain/
│  │  ├─ project.ts
│  │  ├─ requirement.ts
│  │  ├─ evidence.ts
│  │  ├─ competitor.ts
│  │  ├─ alternative.ts
│  │  ├─ tender.ts
│  │  └─ workflow.ts
│  ├─ services/
│  ├─ storage/
│  ├─ workflows/
│  ├─ prompts/
│  ├─ tools/
│  └─ render/
├─ fixtures/
│  └─ calm/
└─ test/
```

如果必须放进 DeepSeek Harness monorepo：

- 先阅读当前仓库插件开发规范；
- 选择官方推荐的 out-of-tree plugin 或 extension 位置；
- 不要仅凭本设计文档自行猜测 package 路径。

---

## 14. 测试设计

### 14.1 Unit Test

至少覆盖：

- Schema 校验；
- Project CRUD；
- Evidence 关联；
- UNKNOWN 不被自动转 FACT；
- Tender 无 Evidence 不得 compliant；
- Human Gate 状态机。

### 14.2 Workflow Test

使用固定 LLM stub / fixture，验证：

```text
requirement_analysis
solution_generation
tender_review
```

### 14.3 Golden Case Test

输入脱敏 CALM Fixture 后至少验证：

- Requirement > 0；
- UNKNOWN > 0；
- Evidence > 0；
- Competitor/技术路线记录 > 0；
- 方案 Artifact 可生成；
- 方案包含来源/证据关联信息；
- 无 Decision 时不得直接生成正式终局方案。

---

## 15. 可观测性

每个 WorkflowRun 记录：

```text
开始时间
结束时间
step
模型调用次数
工具调用次数
失败原因
人工等待时间
```

用于比赛增效统计。

同时记录：

```text
输入文件数
Requirement 数
Evidence 数
Unknown 数
Artifact 数
```

---

## 16. UI 最低策略

不要把比赛时间消耗在复杂前端。

优先级：

### Level 1

使用 DeepSeek Harness 原有 Web Chat/UI，通过 MarketPilot Tools 和 Markdown 输出完成演示。

### Level 2

增加简单 Project 面板：

- Project；
- Requirement；
- Evidence；
- Artifacts。

### Level 3

赛后再建设完整独立工作台。

---

## 17. 导出能力

MVP 必须至少支持：

- JSON；
- Markdown；
- CSV。

比赛前可选增加 DOCX。

优先保证：

```text
Requirement Baseline.md
Competitor Matrix.md
Solution.md
Tender Compliance.csv/md
```

---

## 18. 验收标准

### 功能验收

- [ ] 可创建/加载项目；
- [ ] 可导入至少 Markdown/TXT；
- [ ] 可生成 Requirement；
- [ ] 可人工确认 Requirement；
- [ ] 可建立 Evidence Ledger；
- [ ] 可生成竞品矩阵；
- [ ] 可生成 Alternative；
- [ ] 可人工确认 Decision；
- [ ] 可生成方案 Markdown；
- [ ] 可拆解 Tender；
- [ ] 可生成 Compliance Matrix。

### 质量验收

- [ ] UNKNOWN 不被静默补全；
- [ ] 没有 Evidence 的投标参数不能自动 compliant；
- [ ] 方案关键结论可回溯 Evidence；
- [ ] 已确认 Decision 不被模型擅自替换；
- [ ] 数据可持久化并重新打开。

### 演示验收

- [ ] CALM Case 在本机稳定运行；
- [ ] 10 分钟内能完成核心展示；
- [ ] 即使外部网络不可用，也有 Fixture/缓存用于演示；
- [ ] 准备一份录屏备份。

---

## 19. P0 开发顺序

建议严格按以下顺序，不并行铺摊子：

```text
1. Domain Types
2. Storage
3. Project/Evidence Service
4. Harness Plugin Skeleton
5. Tool Registration
6. Requirement Workflow
7. Human Gate
8. Golden Case Fixture
9. Alternative + Decision
10. Solution Workflow
11. Tender Workflow
12. Competitor Workflow
13. Policy/Product Gap 基础能力
14. UI/导出优化
```

---

## 20. 非目标

MVP 明确不实现：

- 自主无限网页爬取；
- 多 Agent 自发协作网络；
- 复杂知识图谱；
- 企业级 RBAC；
- 大模型训练/微调；
- CRM 全量接入；
- 自动商务决策；
- 自动提交投标文件；
- 无人工确认的最终工程决策。

---

## 21. 关键工程取舍

### 21.1 Workflow 优先于 Agent 自治

使用确定性步骤控制边界，在需要分析的节点调用模型。

### 21.2 Evidence 优先于长文本

先保存结构化事实和证据，再生成报告。

### 21.3 Human Gate 优先于“全自动”

工程项目中关键路线由人确认。

### 21.4 Adapter 优先于绑定

搜索、文档解析、存储、LLM 都通过适配层接入，避免与 DeepSeek Harness Developer Preview API 深度耦合。

---

## 22. 实现依据

### 必需业务文件

1. 《AI应用创新大赛项目技术路线 V1.0.md》
2. 《智能系统部2026年AI应用创新大赛.docx》
3. 《国内外成熟的海上单点系泊 CALM 装置水面与水下管系泄漏检测与报警工业化技术方案分析报告.md》
4. 《红外热成像用于CALM单点系泊周边海面漏油检测的可行性与成熟度评估.md》
5. 《CALM单点系泊水面漏油监测报警技术方案.docx》
6. 《单点系泊水下漏油监测报警技术方案-V4.0(3).md》

### 可选测试文件

- `camera1(1).pdf`
- `camera2(1).pdf`

用于验证 PDF/Datasheet 解析，但不作为 P0 阻塞项。

### DeepSeek Harness 必读文件

以当前 checkout 为准：

- `README.md`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/cordis-primer.md`
- `docs/cordis-tutorial/`
- 当前插件开发指南
- 当前 Tool/Service 的类型定义和测试

---

## 23. 下一版本

V1.1 在 MVP 跑通后再补：

- 实际 SQLite Schema；
- 当前 DeepSeek Harness 精确插件安装配置；
- UI 原型；
- Prompt 文件逐项定义；
- Golden Case expected fixture；
- E2E 测试脚本；
- 比赛说明书与 10 分钟演示脚本。
