# 截图与成果文件索引

盘点日期：2026-10-12（Asia/Shanghai）。本批只读检查：M5目录有**50张图片文件**，均可读取尺寸；最终GUI事实记录列31张，全部文件存在且实际尺寸与记录一致。另有显示补修9张、原生窗口、运行、待审和导出等材料，不把50张全部视为同一次矩阵验收。

目视复核8张，下表逐项说明。其他图片仅检查存在、尺寸和哈希，尚未逐图完成敏感性审查。原始证据保持原位；`assets/`目前只有说明文件。**所有候选均待用户确认可公开范围。**

## 推荐选图与具体用途

| 推荐顺序 / 原文件 | 能说明什么 | 本批目视结果 / 公开前处理 |
|---|---|---|
| A1 [CALM概览](../gui-acceptance/v3.3-m5/m5-calm-light-1440.png)，1440×900 | 4资料、19需求 / 14confirmed、5待澄清，真实阶段、模型路由和UNKNOWN提示 | 未发现客户姓名、地址、报价或凭据；宿主侧栏有本机工作区名，建议裁去。图为导出前历史概览，不作为最终已导出证明 |
| A2 [本地研究输入](../gui-acceptance/v3.3-m5/m5-calm-research-1440.png)，1440×900 | 四份输入资料类型、本地分析路径、候选研究入口 | 可用于输入说明；保留synthetic资料名 / 图注，裁去宿主侧栏。该图不能证明实时联网抓取 |
| A3 [证据台账](../gui-acceptance/v3.3-m5/m5-calm-evidence-1366.png)，1366×768 | 28需补证、10已核验、31补证行动项，以及明确的UNKNOWN | 未发现客户识别信息；建议裁去宿主侧栏。解释10已核验为台账状态，不能说10项设备性能验证通过 |
| A4 [路线矩阵](../gui-acceptance/v3.3-m5/m5-calm-route-matrix-1024.png)，1024×768 | 三条候选路线、水面 / 水下方法和演示边界 | 顶部“合成 / 演示资料”提示应保留；矩阵图为可比较内容，不证明工程认证。宽表仅展示当前视口，不称包含全部行 |
| B1 [真实新方案阅读器](../gui-acceptance/v3.3-m5/m5-calm-live-solution-reader-1440.png)，1440×900 | 目录、方案摘要14/14、28UNKNOWN、输入版本一致与引用能力 | 有人工审核标识、输入指纹、内部短片段及侧栏；需脱敏副本。保留草稿标题及“输入一致不等于工程验收”的提示；不能把生成时截图当后续批准截图 |
| B2 [正式导出任务完成](../gui-acceptance/v3.3-m5/m5-real-export-completed-1440.png)，1440×900 | “导出成果 / 已完成”及2026-10-11 16:39:41任务记录 | 下方含其他项目 / 历史等待；建议只保留当前导出任务卡及必要品牌。需结合官方operation=create、字节 / 哈希证明写入，不只靠绿色状态 |
| B3 [原生ART-06已审核](../gui-acceptance/v3.3-m5/m5-native-export-approved-2560.jpg)，2560×1392 | 真实Desktop壳层及6份成果列表，ART-06已审核 / 输入未变 | 左侧有其他聊天标题，须裁去；此图证明批准与版本状态，实际写入要结合B2 / 导出事实。屏幕像素大，不直接缩成难读小图 |
| B4 [持久化任务历史](../gui-acceptance/v3.3-m5/m5-persisted-task-history-1440.png)，1440×900 | 方案完成的历史Run和不同历史运行状态 | 混有其他项目、旧模型项目标题、旧waiting状态；需只选主案例区域，不能将标题“GLM-5.3”当M5模型身份。UI11:42为显示格式，精确时长以Run702523ms为准 |

A类可直接作为**本地选图 / 审稿候选**；公开前仍需用户确认，推荐裁切宿主工作区侧栏。B类明确含内部信息，需脱敏后才能进入参赛附件。以上仅8张目视结论，不延伸到全部50张。

另可选用待审批次、空项目前置阻断、联网未验证、投标条款及版本对照等图，均在下方全量清单。第一批未为这些图逐一作公开合格判断。M2来源原文抽屉和M4决策摘要图可在用户确认后补充目视审查，来源目录为[需求审阅](../gui-acceptance/v3.3-m2)和[路线方案](../gui-acceptance/v3.3-m4)。

## 成果与记录文件

| 文件 / 来源 | 本批检查 | 直接用途与限制 |
|---|---|---|
| [CALM-M5-ART-06.md正式归档](../gui-acceptance/v3.3-m5/exports/CALM-M5-ART-06.md) | 存在，56486原始字节；SHA256与正式导出事实相同 | 可用于本地技术审阅、章节 / 引用核对和成果存在性证明。原文件含4处call/item审计标记及内部片段，正文保留草稿标题；公开附件需获授权的脱敏衍生副本 |
| [m5-CALM-solution-review.md审阅副本](../gui-acceptance/v3.3-m5/m5-CALM-solution-review.md) | 存在，同样56486字节，与归档逐字节哈希相同 | 方便审阅；来源为审阅副本，不以其存在代替官方正式导出证据 |
| [m5-export-facts.json](../gui-acceptance/v3.3-m5/m5-export-facts.json) | 可解析，approved、completed、operation=create；bytes / fileSha256与归档一致 | 内部证明索引；含真实路径 / 内部ID，不直接公开JSON。批准前、两次拒写和最终成功状态须分开 |
| [m5-live-facts.json](../gui-acceptance/v3.3-m5/m5-live-facts.json) | 可解析，模型、Run时长、调用、引用列表及检查项可定位 | 内部模型运行依据；不公开全部ID / 审计数据 |
| ART-01至ART-05的基线 / 竞品 / 符合性 / 路线对照 / 历史方案 | 已批准的原生成果列表截图有记录；本批未独立导出这些实体文件 | 附件候选；不能以离线同名文件替代，或声称本批已核验它们各自的正式写入 |
| [DEMO_SCRIPT.md](../DEMO_SCRIPT.md) | 完整阅读，脚本存在 | 可作为后续演示编排基础；8分30秒是预算，尚缺人类口述实测 |
| [离线验收预期](../../fixtures/calm/expected/acceptance.json) | 可解析，明确规则主题 | 可作为软件测试规则证据；不是客户验收标准、人工基准答案或在线模型结果 |

ART-06归档与审阅副本的**原始文件SHA256**均为：

`fbc55a94bf7bf2f9a36e7613299bd555ce12f1b14246cbaf2c98797824ed17ed`

现有事实中的`JSON.stringify(content)`哈希为不同编码口径，不能与此原始字节哈希混用。本批未读取当前宿主的原正式导出目标；三方一致性来自2026-10-11导出记录，本批新核验限于仓库两文件与记录值一致。

## 全部M5图片清单

下面是2026-10-12对实际文件的新检查。所有路径相对原证据目录，SHA256取原文件字节；尺寸通过图片文件读取，非从文件名猜测。“矩阵”指列入`m5-gui-facts.json.screenshots`；“目视8”只指本批已检查的8张。没有此标签的图尚未目视审核。

| 原文件 | 实际尺寸 | 字节 | 检查标签 | 原始SHA256 |
|---|---:|---:|---|---|
| [m5-calm-dark-1024.png](../gui-acceptance/v3.3-m5/m5-calm-dark-1024.png) | 1024×768 | 89161 | 矩阵 | `385c1c1e4097d1ed9a76b6a183afde71d9a8add24f234d574eb78c84f891be22` |
| [m5-calm-dark-1366.png](../gui-acceptance/v3.3-m5/m5-calm-dark-1366.png) | 1366×768 | 106711 | 矩阵 | `2347ea076f2ef685c09e0478c773fd8d6b0085e54d04654764a958c54839d11b` |
| [m5-calm-dark-1440.png](../gui-acceptance/v3.3-m5/m5-calm-dark-1440.png) | 1440×900 | 134373 | 矩阵 | `376249aa5d33529ef57ac6b47b26b7047a6700e8e9f00ba11881900c72412519` |
| [m5-calm-evidence-1366.png](../gui-acceptance/v3.3-m5/m5-calm-evidence-1366.png) | 1366×768 | 115719 | 矩阵 / 目视8 | `4822e45c1733233e7b7b0dbc2e3bb3ba9da4dcfeb12d718a72aba5051ced23a5` |
| [m5-calm-historical-version-1440.png](../gui-acceptance/v3.3-m5/m5-calm-historical-version-1440.png) | 1440×900 | 200139 | 矩阵 | `59966df36f760bebf2001598e499352f1dfafa82e1d793298db3479f21f252c2` |
| [m5-calm-light-1024.png](../gui-acceptance/v3.3-m5/m5-calm-light-1024.png) | 1024×768 | 90104 | 矩阵 | `b8ff05df2df837c8ef14f537ca908c0ab8bffd38fa9f15ac3ca75bf6d3f2284c` |
| [m5-calm-light-1366.png](../gui-acceptance/v3.3-m5/m5-calm-light-1366.png) | 1366×768 | 107281 | 矩阵 | `988f316ea722844cc06c08de54660ff40820f4924fab5259fa0014eae192d6ee` |
| [m5-calm-light-1440.png](../gui-acceptance/v3.3-m5/m5-calm-light-1440.png) | 1440×900 | 134492 | 矩阵 / 目视8 | `5a39aa468bda1b7d418bf1a367b24bc621817d22d1bc13e98a3eea71c6250a2f` |
| [m5-calm-live-solution-reader-1440.png](../gui-acceptance/v3.3-m5/m5-calm-live-solution-reader-1440.png) | 1440×900 | 201834 | 矩阵 / 目视8 | `337b28cd26ff88eec72a09d8011af50439555ad6cd33330528480c7ac5962f8e` |
| [m5-calm-new-version-1440.png](../gui-acceptance/v3.3-m5/m5-calm-new-version-1440.png) | 1440×900 | 98383 | 矩阵 | `90ba995b7ea1cc45bb13c6c20448e0d46218c6c5b5c3879bbe2e845548793ef9` |
| [m5-calm-research-1440.png](../gui-acceptance/v3.3-m5/m5-calm-research-1440.png) | 1440×900 | 86373 | 矩阵 / 目视8 | `0cb0221d0f250f734eba4e5c05a3806d0bfb3375c3329c64cde86a5a129ad0ec` |
| [m5-calm-route-matrix-1024.png](../gui-acceptance/v3.3-m5/m5-calm-route-matrix-1024.png) | 1024×768 | 148935 | 矩阵 / 目视8 | `b57e3bc4e5593bbaeb22edcada6c24084de638f5e67fb76b9a1fdf7ba6dfb24a` |
| [m5-calm-solution-reader-dark-1024.png](../gui-acceptance/v3.3-m5/m5-calm-solution-reader-dark-1024.png) | 1024×768 | 76907 | 矩阵 | `741e2d0928b81c3237ea70e60903cdaaa2a8ab84a46fe6b871bb7e01744d1b34` |
| [m5-calm-tender-1440.png](../gui-acceptance/v3.3-m5/m5-calm-tender-1440.png) | 1440×900 | 125181 | 矩阵 | `f209f7ede3f43574e3d4b7716d032ee3625d5b511b0f78d672702621412d2bea` |
| [m5-compliance-export-entry-1440.png](../gui-acceptance/v3.3-m5/m5-compliance-export-entry-1440.png) | 1440×900 | 85396 | 矩阵 | `1e570fb38968b17279b0ade4fb28dd8d5fa9a95934a1185f4943991dc73e5159` |
| [m5-display-before-home-light-1440.png](../gui-acceptance/v3.3-m5/m5-display-before-home-light-1440.png) | 1440×900 | 124827 | 补充 | `b4ff13feb351ac28883da03d0de39afa0c3fefc4439dfc6f40a02b5be1225385` |
| [m5-display-fixed-home-dark-1024.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-dark-1024.png) | 1024×768 | 71873 | 补充 | `1480c24d07da5e6149dc14e560da031103728076974a3a56ffd297c9996ecdda` |
| [m5-display-fixed-home-dark-1366.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-dark-1366.png) | 1366×768 | 101966 | 补充 | `66ee17574519af2c27cbe7ad68b21f37873eb4db6d652b4b160afe818b2b254e` |
| [m5-display-fixed-home-dark-1440.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-dark-1440.png) | 1440×900 | 122167 | 补充 | `fd064b08f354c7f430a971e10cea9ebb79e8df5dcb196e3626b788fa84a4bbde` |
| [m5-display-fixed-home-light-1024.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-light-1024.png) | 1024×768 | 71287 | 补充 | `8c32287ba3046940aeca2f8ffb96b07ae696e52067bbadb752e1f647eee7754b` |
| [m5-display-fixed-home-light-1366.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-light-1366.png) | 1366×768 | 101802 | 补充 | `8115d76e9010958a70e08cd085cb7852c4567fc1911f948ff8c4503cbf52c6cd` |
| [m5-display-fixed-home-light-1440.png](../gui-acceptance/v3.3-m5/m5-display-fixed-home-light-1440.png) | 1440×900 | 121741 | 补充 | `db2e8e77db1c3676e34c7952cb879a6c0d77dcbf59944f68facd53089b01e9d4` |
| [m5-display-fixed-native-home-2560.jpg](../gui-acceptance/v3.3-m5/m5-display-fixed-native-home-2560.jpg) | 2560×1392 | 164635 | 补充 | `98b6f4df0b65c68931808928339b0b8084f76a1f552ddc6826fad152cf0435fc` |
| [m5-display-fixed-native-pending-gate-2560.jpg](../gui-acceptance/v3.3-m5/m5-display-fixed-native-pending-gate-2560.jpg) | 2560×1392 | 144641 | 补充 | `2cc0968fea0284fe749803aae5e88a76158747f21ef75ab52404b58c9b94fc0c` |
| [m5-display-fixed-pending-gate-light-1440.png](../gui-acceptance/v3.3-m5/m5-display-fixed-pending-gate-light-1440.png) | 1440×900 | 107701 | 补充 | `f871f47e9c622a6a66cb684193c0f8cf1b382b42ee4fb8ec5deb1256e51b5c05` |
| [m5-display-fixed-tasks-light-1024.png](../gui-acceptance/v3.3-m5/m5-display-fixed-tasks-light-1024.png) | 1024×768 | 65008 | 补充 | `bf5797b9e5783930c9a2e452e0586a73f56ec76e7e42748d83a8e474fcb06c2f` |
| [m5-display-fixed-tasks-light-1440.png](../gui-acceptance/v3.3-m5/m5-display-fixed-tasks-light-1440.png) | 1440×900 | 78452 | 补充 | `772dfabf91fbabaa5c4d0580cecab355834ca3ce88a06543a030f00d84a32c97` |
| [m5-empty-dark-1024.png](../gui-acceptance/v3.3-m5/m5-empty-dark-1024.png) | 1024×768 | 82350 | 矩阵 | `83fc9a912e973f6294b6fe50573dc03b2e18c62ee6e1f71081843b09b8917ceb` |
| [m5-empty-dark-1366.png](../gui-acceptance/v3.3-m5/m5-empty-dark-1366.png) | 1366×768 | 103231 | 矩阵 | `cd21678be0406b7c6c2d4f2a7769e8bd0e323a146bb7f8b89c98596dc9b7756c` |
| [m5-empty-dark-1440.png](../gui-acceptance/v3.3-m5/m5-empty-dark-1440.png) | 1440×900 | 127407 | 矩阵 | `5e73a3e8881c89332a67ec90a883819f3af8b26481b7cce2dae050053e3d8f3b` |
| [m5-empty-light-1024.png](../gui-acceptance/v3.3-m5/m5-empty-light-1024.png) | 1024×768 | 82862 | 矩阵 | `7c270d470f57e467d380812dc8edea1e5d215860ce958c07a9d725264814b33a` |
| [m5-empty-light-1366.png](../gui-acceptance/v3.3-m5/m5-empty-light-1366.png) | 1366×768 | 103536 | 矩阵 | `d7b5c6f8e8fabc4317d04c6dd158cd6b4775fc8ebebe853199293c67ad30fbe4` |
| [m5-empty-light-1440.png](../gui-acceptance/v3.3-m5/m5-empty-light-1440.png) | 1440×900 | 127627 | 矩阵 | `aeb605e89e4cb00f5dfe632715e9db70094eb8a22c65a25e2bcd7e5bd8c5a6fe` |
| [m5-empty-routes-blocked-1440.png](../gui-acceptance/v3.3-m5/m5-empty-routes-blocked-1440.png) | 1440×900 | 90738 | 矩阵 | `c2ab996b508b85890148bf4880eeb2fd65c9aa1689ac8cbfeb5440daff7b0fb3` |
| [m5-empty-solution-blocked-1440.png](../gui-acceptance/v3.3-m5/m5-empty-solution-blocked-1440.png) | 1440×900 | 90239 | 矩阵 | `ceb878c1d7d31047f5eaec99308b1ed61be4b52442ee8cb755fbb16e00f0fd59` |
| [m5-live-running-light-1440.png](../gui-acceptance/v3.3-m5/m5-live-running-light-1440.png) | 1440×900 | 106563 | 补充 | `64d82850730b6b7d30140191187c26c8706457a3ff429fbf429b2dfe6589350c` |
| [m5-native-export-approved-2560.jpg](../gui-acceptance/v3.3-m5/m5-native-export-approved-2560.jpg) | 2560×1392 | 165985 | 补充 / 目视8 | `916e788233448b1c77f4790c2775cd1f51ecd09b8fb15914ee1e592aad45f237` |
| [m5-native-export-awaiting-human-2560.png](../gui-acceptance/v3.3-m5/m5-native-export-awaiting-human-2560.png) | 2560×1392 | 144629 | 补充 | `e5a24e4f80746a08c00569d1919f5df323305ec6ba6b3cf4013fe6ecdfb3cff3` |
| [m5-native-overview-2560.png](../gui-acceptance/v3.3-m5/m5-native-overview-2560.png) | 2560×1392 | 173982 | 补充 | `b061001d8e90d5989be1462c4c22101ef013f2cf8947a12c0a9c0133c8eba197` |
| [m5-native-solution-2560.png](../gui-acceptance/v3.3-m5/m5-native-solution-2560.png) | 2560×1392 | 326628 | 补充 | `9e5baf73404927adc5ea01a7693e5c5ba021563e2bde23bb31ec536308ba4b23` |
| [m5-persisted-task-history-1440.png](../gui-acceptance/v3.3-m5/m5-persisted-task-history-1440.png) | 1440×900 | 77774 | 矩阵 / 目视8 | `b0fdfe98ae3ff193e58c60bb679416dc76aa3ff7547628a57b7703c7f1a0ca8f` |
| [m5-real-export-awaiting-human-1440.png](../gui-acceptance/v3.3-m5/m5-real-export-awaiting-human-1440.png) | 1440×900 | 107701 | 补充 | `f871f47e9c622a6a66cb684193c0f8cf1b382b42ee4fb8ec5deb1256e51b5c05` |
| [m5-real-export-completed-1440.png](../gui-acceptance/v3.3-m5/m5-real-export-completed-1440.png) | 1440×900 | 77765 | 补充 / 目视8 | `9d5d9bcba1b0d90f5ca243511283bbcdcf9b1f7e3a6f94549cedbefc22cfe5a7` |
| [m5-requirements-dark-1024.png](../gui-acceptance/v3.3-m5/m5-requirements-dark-1024.png) | 1024×768 | 87305 | 矩阵 | `c8537c17d116c5d03874d2bd68c0e9576ae02f87cb3ca7c2061546d3782f3ce4` |
| [m5-requirements-dark-1366.png](../gui-acceptance/v3.3-m5/m5-requirements-dark-1366.png) | 1366×768 | 106056 | 矩阵 | `0f1671fd355243c28d3b0f6ac4fdb1784da7688c084838ecc7b6a8f76b6cf211` |
| [m5-requirements-dark-1440.png](../gui-acceptance/v3.3-m5/m5-requirements-dark-1440.png) | 1440×900 | 131790 | 矩阵 | `4742acaf1c3aac3575b1bce641035587c66daf5f98bacdb9dcfc5834955574c0` |
| [m5-requirements-light-1024.png](../gui-acceptance/v3.3-m5/m5-requirements-light-1024.png) | 1024×768 | 88136 | 矩阵 | `a5ed4c8f9dd931483f0fa8c169fc40c3225718d135273eca2e912fd9d49a63f7` |
| [m5-requirements-light-1366.png](../gui-acceptance/v3.3-m5/m5-requirements-light-1366.png) | 1366×768 | 106739 | 矩阵 | `01dad5b492718d69a6c2902bad88e76e6d172bc66fdf4f28d8d585a0968e4a90` |
| [m5-requirements-light-1440.png](../gui-acceptance/v3.3-m5/m5-requirements-light-1440.png) | 1440×900 | 132041 | 矩阵 | `8e3bb327fab8db37e367b63e8df9223e02d326bb5b3e8d443c1c5d926b5fe7ef` |
| [m5-requirements-waiting-batch-1440.png](../gui-acceptance/v3.3-m5/m5-requirements-waiting-batch-1440.png) | 1440×900 | 98655 | 矩阵 | `856cc84539981a2b7cbd9fb4d39c2b8f5511f945c057aa5729ecd1c7c2ea2df1` |

## 图注与公开处理要求

- 每张图注明历史日期、所展示阶段和证明范围；旧waiting只说明历史状态，不当作当前可回答门。
- 合成型号和招标负例始终标注，UNKNOWN / draft / current提示不能被裁掉造成已验证的错觉。
- 如后续裁切、遮盖或另制公开摘要，保留本索引原文件哈希并记录衍生副本处理方法；不得改动原图数字或业务状态。
- 本批仅创建索引，公开审批未执行；不提交 / 推送原始JSON、原生聊天侧栏或未审业务正文。

