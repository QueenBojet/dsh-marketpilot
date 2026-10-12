# 回退

V4 是增量改动：新增数据全部写入各项目的 `project.v4` 字段，V3 字段的结构和含义没有变化，V3 面板和工具继续可用。

## 代码回退

```powershell
git checkout main          # V3.4 baseline; feat/v4-workbench-foundation is never auto-merged
npm install; npm run build
```

然后用 DSH 重新加载插件（`pnpm dsh marketpilot --no-open`）。

## 数据回退

V4 开发开始前（M0）做过完整备份：

```
E:\PythonProjects\Work_Platform\marketpilot-backups\20261012-225649-v4-m0\
```

需要恢复时，先停止 DSH，把原存储目录整体另存一份，再用备份中的 `marketpilot.json` 覆盖当前存储。覆盖会丢失备份之后的所有改动（包括 V3 的改动），请先确认。

一般不需要恢复数据：V3.4 代码读取存储时会忽略 `project.v4` 字段。这一点没有在 main 分支上实际验证，回退后建议先用存储副本试运行一次。
