# CALM Golden Case

`input/brief.md` 与 `input/technology-notes.md` 是已读业务原件的最小脱敏整理。原件为《CALM单点系泊水面漏油监测报警技术方案.docx》和《单点系泊水下漏油监测报警技术方案-V4.0.md》。后一文件与用户列出的 `V4.0(3)` 尚未确认一致；两份指定调研报告、大赛 DOCX、可选 camera PDF 未找到，未被替换或假称已读取。

移除了真实客户、现场地域、部署数量及尺寸、预算和报价。保留连续监测、水面/水下、多源融合、报警留存、海工环境、候选传感器，以及未冻结验收指标。技术摘录不是厂家性能证明，不包含已选中的最终路线。`tender.md` 是明确标注的合成负例。

`expected/acceptance.json` 描述验收主题与业务规则，不包含最终方案正文。离线模型替身会明确标为测试/演示，不能据其通过宣称真实模型抽取质量通过。业务 Workflow 与在线结构化模型使用相同 schema 和 Service 校验。

应用目前仅解析 UTF-8 Markdown/TXT；这些 Markdown 是预提取资料，不代表 DOCX/PDF parser 已实现。

`synthetic-datasheet.md` 的 DemoVendor、DEMO-A、DEMO-B 均为虚构，用来验证准确型号引用和缺失参数处理，不是真实竞争情报。`offline-model.ts` 是显式测试替身，`scenario.ts` 通过真实 guarded Tools 执行端到端流程。`pnpm marketpilot:demo` 在终端逐项询问真实确认；`pnpm marketpilot:demo:smoke` 才使用模拟人工，不能用于生产授权。
