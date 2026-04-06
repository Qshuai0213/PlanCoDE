# PlanCoDE

> PlanCoDE 是一个以 Python Agent 为核心、以 Electron 桌面端为工作台的多阶段智能开发工具。

## 核心

在开发的vibecoding中经常面临这样一个问题，即使有规划模式，**也经常最后做出的结果差强人意**，在不断的vibe中，最后越改越乱，难以为继。所以我就想到用这种方式去更好的从0开始、**也更适合vibecoding的新人**。

如果只想到我要做一个东西，只有**模糊的想法**，而**不成规划**，**我们可以帮你去规划设计**、**最后再到实现**。

项目中pipe模式有三个agent：

- **规划者**

- **设计者**

- **执行者**

从规划、再到逐步的设计、最终的执行，不断的进行完善，逐步替你完成规划。**而不是随意的开始，随意的结束。**

## 补充

那么即使有了规划、平时的一些小任务和项目的维护怎么办？我们还做了一款通用agent，generalAgent，他可以像一个阉割版的虾一样，替你去执行很多任务，文件编辑、bash、powershell命令等。

## 模式

当前项目已经围绕两条主路径整理完成：

- `General Agent`
  - 像聊天助手一样工作，适合自由提问、查改代码、执行命令、读写文件、调试问题。
- `Pipeline`
  - 按 `Plan -> Design -> Execute` 顺序推进项目。
  - 当前阶段产物生成后不会自动进入下一阶段。
  - 你可以继续补充修改要求，确认满意后再手动进入下一阶段。

## 目录说明

- [agent](D:/develop/PlanCoDE/agent)
  - Agent 循环、上下文、teammate 机制。
- [main](D:/develop/PlanCoDE/main)
  - `plan_agent.py`、`design_agent.py`、`execute_agent.py`、`general_agent.py` 等核心 Agent。
- [tool](D:/develop/PlanCoDE/tool)
  - 文件工具、任务工具、消息总线、skills、todo、压缩与过程管理。
- [bridge](D:/develop/PlanCoDE/bridge)
  - Python 侧运行入口，负责把桌面端请求转给 Agent。
- [plancode-desktop](D:/develop/PlanCoDE/plancode-desktop)
  - Electron + React 桌面端。
- [skills](D:/develop/PlanCoDE/skills)
  - 工作目录可加载的技能目录。**兼容ClaudeCode的skills。**

## 桌面端能力

- `General`
  - 左侧线程列表
  - 中间正式对话
  - 右侧实时活动面板
  - 本地持久化、删除线程、继续会话
- `Pipeline`
  - 单条 run 贯穿 `plan / design / execute`
  - 当前阶段独占可操作
  - 阶段产物可反复修改
  - `execute` 完成后优先显示 `report.md`
- `Settings`
  - 配置 provider、model、api key、base url、workdir
  - 测试连接、保存设置

## 工作目录里会生成什么

选定工作目录后，PlanCoDE 会在里面写入少量隐藏工作文件：

- `.tasks`
  - 保存任务和子任务状态
- `.team`
  - 保存多 Agent 协作消息和收件箱
- `.transcripts`
  - 保存过程转录或压缩记录
- `.todos.json`
  - 保存待办状态

这些都属于 PlanCoDE 的内部运行状态，不是你的业务源码。

## 启动方式

桌面端开发启动：

```powershell
Set-Location D:\develop\PlanCoDE\plancode-desktop
npm run electron:dev
```

仅前端开发：

```powershell
Set-Location D:\develop\PlanCoDE\plancode-desktop
npm run dev
```

类型检查：

```powershell
Set-Location D:\develop\PlanCoDE\plancode-desktop
npx tsc --noEmit
```

## 当前推荐使用方式

1. 先在设置页配置 `workdir`、模型和 API。
2. 自由任务用 `General`。
3. 完整项目推进用 `Pipeline`。
4. `Plan` 和 `Design` 阶段生成文档后，先继续修改，再手动确认进入下一阶段。
5. `Execute` 完成后查看最终 `report.md`。

## 总结

作为一名agent的初学者、在agent的开发中，我觉得我们要给足大模型足够的自由，让他足够的去自由发挥，不是教他做事情，而是让他做什么不让做什么，既然选择了调用就选择相信，我们只负责提供工具和环境。




