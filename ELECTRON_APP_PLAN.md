# PlanCoDE Desktop — 可视化 Electron 桌面应用设计实现方案

> 为 PlanCoDE Python Agent 框架提供可视化前端。实时监控 Agent 运行、交互式对话、Pipeline 三阶段管理、多 Agent 协调可视化。
>
> 本文档用于 PlanCoDE Desktop 的设计与实现。

---

## 一、PlanCoDE 架构速览

### 1.1 五种 Agent 类型

| Agent | 文件 | 职责 | 关键方法 | 输入 | 输出 |
|-------|------|------|---------|------|------|
| **PlanAgent** | `main/plan_agent.py` | 理解需求 → 生成 plan.md | `run(goal)` | 用户需求 | plan.md |
| **DesignAgent** | `main/design_agent.py` | 读 plan.md → 生成 design.md | `run(plan, plan_path)` | plan 内容/路径 | design.md |
| **ExecuteAgent** | `main/execute_agent.py` | 按 plan+design 编码 | `run(plan_path, design_path)` | plan.md + design.md | 代码 + report.md |
| **GeneralAgent** | `main/general_agent.py` | 自由 REPL，可做任何事 | `run(prompt)` / `run_repl()` | 用户命令 | 执行结果 |
| **Teammate** | `agent/teammate_loop.py` | 持久化自治子 Agent | TeammateManager.spawn() | 初始任务 | 通过消息总线汇报 |

### 1.2 三种同步子 Agent（task 工具派发）

| 类型 | 工具 | 特点 |
|------|------|------|
| **Explore** | bash + read_file + glob + web_fetch + summarize | 只读，最多 10 轮，探索/调研 |
| **General-Purpose** | 全部文件工具 + web_fetch + summarize | 读写 + 安全检测，明确范围开发 |
| **Teammate** | 同 GP + idle + claim_task | Work/Idle 双阶段，后台轮询 |

### 1.3 完整工具接口（22 个）

**文件层（7 个）**：`bash` `powershell` `read_file` `write_file` `edit_file` `glob` `web_fetch`

**管理层（15 个）**：
- 任务规划：`TodoWrite` `task_create` `task_get` `task_update` `task_list`
- 子 Agent：`task`(Explore/general-purpose) `spawn_teammate` `list_teammates`
- 通信：`send_message` `read_inbox` `broadcast` `shutdown_request`
- 后台：`background_run` `check_background`
- 上下文：`summarize` `load_skill`

### 1.4 事件回调接口（EventCallback → UI 数据源）

| Python 方法 | UI 事件 | 说明 |
|------------|---------|------|
| `on_thinking(content)` | thinking | LLM 思考/回复文本 |
| `on_tool_call(name, input)` | tool_call | 工具调用开始 |
| `on_tool_result(name, output)` | tool_result | 工具返回结果 |
| `on_compact()` | compact | 上下文压缩触发 |
| `on_inbox(messages)` | inbox | 收到 teammate 消息 |
| `on_bg_result(results)` | bg_result | 后台任务完成 |
| `on_loop_end(final_content)` | end | 循环结束 + 最终结果 |

### 1.5 返回值（RunResult）

```typescript
interface RunResult {
  content: string;           // 最终文本
  events: AgentEvent[];      // 所有事件列表（可回放）
  tool_calls: ToolCall[];    // 工具调用历史
  final_content: string;     // 最终响应
  compact_count: number;     // 压缩次数
  round_count: number;       // 总轮次
  summary(): object;         // 摘要
}
```

---

## 二、技术栈

```
Electron 28+
├── 前端：React 18 + TypeScript
├── 状态管理：Zustand（轻量、TypeScript 友好）
├── 通信协议：JSON over stdin/stdout（PlanCoDE Python 子进程）
├── UI 组件：Radix UI + TailwindCSS + shadcn/ui
├── 图形渲染：
│   ├── 工作流图：React Flow（节点+边动态可视化）
│   ├── 事件时间线：自定义 Timeline 组件
│   └── 文档预览：Monaco Editor（plan/design 只读 + 高亮）
├── Markdown 渲染：react-markdown + rehype-highlight
├── 进程管理：child_process.spawn()
├── 日志：electron-log
└── 构建：electron-builder
```

**为什么用 stdin/stdout 而非 WebSocket？**
- 不需要额外的 FastAPI 服务，减少依赖
- 天然隔离，每个 Agent 一个子进程
- PlanCoDE 的 EventCallback 已设计好，只需写 IpcCallback 适配器
- 简单直接，桌面应用最佳实践

---

## 三、主题设计

```css
/* globals.css — CSS Variables */
:root {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-tertiary: #242424;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --accent-plan: #3b82f6;        /* 蓝色：PlanAgent */
  --accent-design: #a855f7;      /* 紫色：DesignAgent */
  --accent-execute: #f97316;     /* 橙色：ExecuteAgent */
  --accent-explorer: #22c55e;    /* 绿色：Explorer */
  --accent-developer: #eab308;   /* 黄色：Developer */
  --accent-danger: #ef4444;      /* 红色：压缩/危险 */
  --accent-teammate: #06b6d4;    /* 青色：Teammate */
  --border: #27272a;
  --radius: 8px;
}
```

---

## 四、窗口与布局

### 4.1 主窗口（1200×800 最小）

```
┌─────────────────────────────────────────────────────────────────────┐
│  [≡] PlanCoDE Desktop          [Model: claude-sonnet-4]  [─][□][×] │
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  SIDEBAR     │  MAIN CONTENT                                        │
│  (240px)     │                                                      │
│              │  ┌──────────────────────────────────────────────────┐ │
│  ◉ Dashboard │  │                                                  │ │
│  ○ Pipeline  │  │   工作流画布（React Flow）                        │ │
│  ○ General   │  │   PlanAgent ──→ DesignAgent ──→ Sub-agents      │ │
│  ○ History   │  │                                                  │ │
│  ○ Settings  │  └──────────────────────────────────────────────────┘ │
│              │                                                      │
│  ──────────  │  ┌──────────────────────────────────────────────────┐ │
│  🟢 Idle     │  │  详情面板（Tab 切换）                             │ │
│  ⚙ 模型      │  │  ┌────────┬────────┬───────┬───────┐           │ │
│  📁 workdir  │  │  │对话流  │工具调用│团队   │任务板  │           │ │
│              │  │  │Timeline│结果    │消息   │.tasks/ │           │ │
│              │  │  └────────┴────────┴───────┴───────┘           │ │
└──────────────┴──────────────────────────────────────────────────────┘
│  STATUS BAR                                                        │
│  🟢 Idle  │  Round 0  │  Compress 0  │  Tokens: 0/100,000  │  Plan  │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 弹出窗口

| 窗口 | 说明 |
|------|------|
| **危险命令确认弹窗** | Modal，3 按钮（拒绝 / 允许本次 / 允许全部），等待用户手动确认 |
| **设置弹窗** | 模型配置、API Key、Base URL、工作目录 |
| **Teammate 消息通知** | Toast 通知，显示 teammate 发来的消息 |

---

## 五、页面设计（5 个页面）

### 5.1 Dashboard 总览页

```
┌─────────────────────────────────────────────────┐
│ PlanCoDE Dashboard                              │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ 📋 Plan  │  │ 🎨 Design│  │ ⚡ Execute│      │
│  │ 空闲     │  │ 空闲      │  │ 空闲      │      │
│  │ [启动]   │  │ [启动]   │  │ [启动]   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                   │
│  ┌──────────────────────────┐                    │
│  │ 🤖 General（自由模式）    │                    │
│  │ 空闲                     │   [进入 REPL]      │
│  └──────────────────────────┘                    │
│                                                   │
│  ┌─ 最近运行 ────────────────────────────────┐   │
│  │ 2026-04-05 20:10  Plan  │  22轮 8工具  ✅  │   │
│  │ 2026-04-05 19:30  General │ 15轮 5工具  ✅  │   │
│  │ 2026-04-05 18:15  Pipeline │ 35轮  ✅      │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 5.2 Pipeline 页面（三阶段流水线：Plan → Design → Execute）

```
┌─────────────────────────────────────────────────────────────────────┐
│ Pipeline: [▸ Plan] ─────────→ [○ Design] ──────→ [○ Execute]       │
├─────────┬──────────────────────────────────────┬────────────────────┤
│ 左侧    │ 中：Agent 运行区                      │ 右：产出预览       │
│         │                                      │                    │
│ Plan    │ [事件流]                              │ 📄 plan.md 实时预览│
│ ┌─────┐ │ ├─ thinking: "让我先理解需求..."      │                    │
│ │目标 │ │ ├─ tool_call: task(Explore) ── 运行中 │ 项目目标：博客系统  │
│ │输入 │ │ ├─ tool_result: [完成] 研到...      │ 1. 数据库设计...   │
│ └─────┘ │ ├─ tool_call: write_file plan.md      │ 2. 后端 API...    │
│         │                                      │ 3. 前端页面...    │
│         │ [思考] 好的，规划文档已完成...          │                    │
│         │                                      │ [✅接受] [✏️修改]  │
│         │ [$ 输入新指令...               [发送]] │ [🔄 重做]         │
└─────────┴──────────────────────────────────────┴────────────────────┘
```

**工作流**：
1. 用户输入需求 → 调用 `PlanAgent.run(goal)` → 实时展示 EventStream
2. 完成 → 展示 plan.md（Monaco Editor 只读预览）
3. 用户操作：✅ 接受进入 Design / ✏️ 修改反馈 / 🔄 重做
4. 确认后 → `DesignAgent.run(plan)` → 展示 design.md
5. 确认后 → `ExecuteAgent.run(plan_path, design_path)` → 执行代码

### 5.3 General 页面（自由 REPL）

```
┌─────────────────────────────────────────────────┐
│ General Agent — REPL 模式                        │
├─────────────────────────────────────────────────┤
│                                                   │
│ 👤 用户: "帮我找 project/src/utils/ 下所有 .py"   │
│                                                   │
│ 🤖 响应:                                          │
│   [thinking] 让我用 glob 查找...                 │
│   [⏳ tool] glob(pattern="**/*.py")               │
│   [✅ result] 找到 8 个文件...                    │
│                                                   │
│ ───────────────────────────────────────────────  │
│ 👤 用户: "阅读其中最大的那个文件"                  │
│                                                   │
│ [thinking] 让我读取...                           │
│ [⏳ tool] read_file(path="...")                   │
│ [✅ result] (文件内容)                             │
│ 这个文件包含了...                                 │
│                                                   │
│ ┌─────────────────────────────────────────────┐  │
│ │ $ 输入新指令...                          │ 📤 │
│ └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5.4 History 历史页面

```
┌─────────────────────────────────────────────────┐
│ 历史记录                                          │
├─────────────────────────────────────────────────┤
│ 2026-04-05 20:28 — General — 15轮/5工具 — ✅     │
│ 2026-04-05 19:30 — Plan — 22轮/8工具 — ✅        │
│ 2026-04-05 18:15 — Pipeline — 35轮 — ✅          │
│                                                   │
│ [展开选中会话 ↴]                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │ 14:32:05 [PlanAgent] Thinking:              │  │
│ │   "让我分解这个任务..."                       │  │
│ │ 14:32:06 [PlanAgent] ⏳ task_create         │  │
│ │ 14:32:07 [PlanAgent] ✅ Task #1 创建成功    │  │
│ │ 14:32:08 [PlanAgent] ⏳ write_file plan.md  │  │
│ │ 14:32:09 [PlanAgent] ✅ 2.3KB → plan.md    │  │
│ │ 14:32:10 [PlanAgent] 规划完成。              │  │
│ └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5.5 Settings 设置页面

```
LLM Provider:   ○ Anthropic   ○ OpenAI    ○ Ollama
Model:          [claude-sonnet-4-20250514  ] [测试连接]
API Key:        [sk-ant-xxxx...             ] [显示/隐藏]
Base URL:       [http://localhost:11434/v1  ]
工作目录:       D:\develop\PlanCoDE               [...]
Token 压缩阈值: [100,000      ]
LLM 超时(秒):   [120      ]
[保存配置]  [测试连接]  [重置默认]
```

---

## 六、工作流可视化（React Flow）

Pipeline 运行时画布动态生成节点：

| 节点类型 | 颜色 | 含义 |
|---------|------|------|
| `PlanAgent` | 蓝色 `#3b82f6` | 规划 |
| `DesignAgent` | 紫色 `#a855f7` | 设计 |
| `ExecuteAgent` | 橙色 `#f97316` | 执行 |
| `Explore` | 绿色 `#22c55e` | 调研子 Agent |
| `general-purpose` | 黄色 `#eab308` | 开发子 Agent |
| `Thinking` | 灰底白字 | LLM 思考输出 |
| `ToolCall` | 橙底 | 工具调用 |
| `ToolResult` | 浅橙 | 工具结果 |
| `Compact` | 红边 | 上下文压缩 |

**边的流向**：PlanAgent → DesignAgent → ExecuteAgent（主线）；PlanAgent → Explore/Developer（task 派发）

**交互**：点击节点 → 右侧面板显示详情

---

## 七、组件详细设计

### 7.1 完整文件树

```
plancode-desktop/
├── package.json
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
├── electron/
│   ├── main.ts                  # Electron 窗口入口
│   ├── preload.ts               # 安全上下文桥接
│   ├── ipc/
│   │   ├── agent-handlers.ts    # agent:start/stop
│   │   ├── dialog-handlers.ts   # 危险命令确认
│   │   └── setting-handlers.ts  # 配置读写
│   └── subprocess/
│       └── python-bridge.ts     # Python 子进程管理 + 事件解析
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # 路由 + Layout
│   ├── stores/
│   │   ├── agentStore.ts        # agent 状态/轮次/token
│   │   ├── eventStore.ts        # 事件历史 + 回放
│   │   ├── workflowStore.ts     # React Flow 节点/边
│   │   └── settingStore.ts      # 全局设置（Zustand）
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── PipelinePage.tsx     # 3阶段 Pipeline
│   │   ├── GeneralPage.tsx      # REPL 对话
│   │   ├── HistoryPage.tsx      # 历史回放
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   └── TitleBar.tsx
│   │   ├── workflow/
│   │   │   ├── WorkflowCanvas.tsx   # React Flow 画布
│   │   │   └── ToolNode.tsx         # 工具节点
│   │   ├── timeline/
│   │   │   ├── Timeline.tsx         # 事件时间线
│   │   │   ├── ThinkingBubble.tsx   # 思考气泡
│   │   │   └── ToolCallBubble.tsx   # 工具调用气泡
│   │   ├── editor/
│   │   │   └── MarkdownPreview.tsx  # plan/design 预览
│   │   ├── dialogs/
│   │   │   ├── DangerousConfirmDialog.tsx
│   │   │   └── SettingsDialog.tsx
│   │   └── shared/
│   │       ├── TokenMeter.tsx       # Token 仪表
│   │       └── RoundCounter.tsx     # 轮次计数
│   └── styles/
│       └── globals.css
├── bridge/                    # Python 桥接（新增）
│   ├── ipc_callback.py        # IpcCallback 适配器
│   └── runner.py              # Python 子进程入口
└── main/                      # PlanCoDE Python 代码（不改动）
    ├── plan_agent.py
    ├── design_agent.py
    ├── execute_agent.py
    ├── general_agent.py
    └── ...
```

### 7.2 Zustand Store 设计

```typescript
// stores/agentStore.ts
interface AgentStore {
  phase: 'idle' | 'planning' | 'designing' | 'executing' | 'running' | 'done' | 'error';
  currentAgent: 'plan' | 'design' | 'execute' | 'general' | null;
  roundCount: number;
  compactCount: number;
  estimatedTokens: number;
  tokenThreshold: number;
  finalContent: string;
  isRunning: boolean;
  startAgent: (type: 'plan' | 'design' | 'execute' | 'general', input: any) => void;
  stopAgent: () => void;
  onEvent: (event: AgentEvent) => void;
  onResult: (content: string) => void;
  reset: () => void;
}

// stores/eventStore.ts — 持久化历史 + 回放
interface EventStore {
  events: AgentEvent[];
  sessions: Session[];
  currentSession: Session | null;
  pushEvent: (e: AgentEvent) => void;
  clearEvents: () => void;
  saveSession: (summary: RunResultSummary) => void;
  loadSession: (id: string) => void;
}

// stores/workflowStore.ts — React Flow 节点管理
interface WorkflowStore {
  nodes: Node[];
  edges: Edge[];
  addAgentNode: (type: string) => void;
  addThinkingNode: (content: string, parentId: string) => void;
  addToolCallNode: (tool: string, input: any, parentId: string) => void;
  addResultNode: (output: string, parentId: string) => void;
  setActiveNode: (id: string) => void;
  clear: () => void;
}
```

### 7.3 Timeline.tsx（事件时间线）

```tsx
export function Timeline({ events }: { events: AgentEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  return (
    <div ref={scrollRef} className="overflow-y-auto space-y-1 text-sm">
      {events.map((evt, i) => {
        const time = new Date(evt.timestamp).toLocaleTimeString();
        switch (evt.type) {
          case 'thinking':
            return <ThinkingBubble key={i} time={time} content={evt.content} />;
          case 'tool_call':
            return <ToolCallBubble key={i} time={time} name={evt.name}
                                   input={evt.input} status="running" />;
          case 'tool_result':
            return <ToolCallBubble key={i} time={time} name={evt.name}
                                   output={evt.output} status="done" />;
          case 'compact':
            return <div key={i} className="text-gray-500 italic">🔄 {time} 上下文已压缩</div>;
          case 'end':
            return <FinalResponse key={i} time={time} content={evt.content} />;
        }
      })}
      {isRunning && <RunningIndicator />}
    </div>
  );
}
```

### 7.4 ToolCallBubble.tsx

```tsx
export function ToolCallBubble({ time, name, input, output, status }: Props) {
  const [expanded, setExpanded] = useState(false);
  const icon = status === 'running' ? '⏳' : '✅';
  const color = status === 'running' ? 'border-amber-500' : 'border-green-500';

  return (
    <div className={`border-l-2 ${color} pl-3 py-0.5`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">{time}</span>
        <span>{icon}</span>
        <code className="text-xs font-mono bg-gray-100 px-1 rounded">{name}</code>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-400">
          {expanded ? '▼' : '▶'}
        </button>
      </div>
      {expanded && (
        <div className="mt-1 text-xs space-y-1">
          {input && <pre className="bg-gray-50 p-2 rounded overflow-x-auto">
            {JSON.stringify(input, null, 2)}</pre>}
          {output && <pre className="bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">{output}</pre>}
        </div>
      )}
    </div>
  );
}
```

### 7.5 DangerousConfirmDialog.tsx

```tsx
export function DangerousConfirmDialog({ command, tool, onConfirm }: Props) {
  return (
    <Dialog open><DialogContent>
      <DialogTitle>⚠️ 危险命令</DialogTitle>
      <pre className="bg-red-50 p-3 rounded text-sm">{command}</pre>
      <p className="text-xs text-gray-500">Tool: {tool}</p>
      <DialogFooter>
        <Button variant="destructive" onClick={() => onConfirm('deny')}>拒绝</Button>
        <Button onClick={() => onConfirm('allow')}>允许本次</Button>
        <Button onClick={() => onConfirm('allow_all')}>允许全部（本次会话）</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  );
}
```

### 7.6 TokenMeter.tsx

```tsx
export function TokenMeter({ current, max }: { current: number; max: number }) {
  const pct = Math.round((current / max) * 100);
  const color = pct < 50 ? 'bg-green-500' : pct < 80 ? 'bg-yellow-500' : 'bg-red-500 animate-pulse';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span>Tokens: {current.toLocaleString()}/{max.toLocaleString()}</span>
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}
```

---

## 八、通信协议（JSON over stdin/stdout）

### 8.1 Python → Electron（stdout 单行 JSON 流）

每行一个 JSON 对象，`\n` 分隔，`flush=True`，`ensure_ascii=False`：

```json
{"type": "event", "name": "on_thinking", "data": "让我先理解需求..."}
{"type": "event", "name": "on_tool_call", "data": {"name": "task_create", "input": {"subject": "..."}}}
{"type": "event", "name": "on_tool_result", "data": {"name": "task_create", "output": "Task #1 created"}}
{"type": "event", "name": "on_compact", "data": null}
{"type": "event", "name": "on_inbox", "data": []}
{"type": "event", "name": "on_bg_result", "data": []}
{"type": "event", "name": "on_loop_end", "data": "规划完成。plan.md 已创建。"}
{"type": "dangerous", "command": "rm -rf ...", "tool": "bash"}
{"type": "result", "agent": "plan", "content": "...", "round_count": 22, "tool_call_count": 8}
```

### 8.2 Electron → Python（stdin 单行 JSON）

```json
{"type": "start", "agent": "plan", "goal": "做一个博客系统", "workdir": "D:\\develop\\project"}
{"type": "start", "agent": "design", "plan": "...", "workdir": "..."}
{"type": "start", "agent": "execute", "plan_path": "...", "design_path": "...", "workdir": "..."}
{"type": "start", "agent": "general", "prompt": "...", "workdir": "..."}
{"type": "stop"}
{"type": "dangerous_confirm", "allow": true, "allow_all": false}
```

---

## 九、Python 端桥接代码（新增 bridge/ 目录）

### 9.1 bridge/ipc_callback.py — IpcCallback 适配器

```python
"""PlanCoDE IpcCallback — 将 EventCallback 映射为 stdout JSON 流"""
import json
import sys
import threading
from agent.agent_loop import EventCallback

class IpcCallback(EventCallback):
    """把 EventCallback 事件写到 stdout，供 Electron 主进程读取"""

    def __init__(self, stdin_lock: threading.Lock):
        self._stdin_lock = stdin_lock
        self._confirm_event = threading.Event()
        self._confirm_result: tuple[bool, bool] | None = None

    def _emit(self, name: str, data):
        line = json.dumps({"type": "event", "name": name, "data": data}, ensure_ascii=False)
        print(line, flush=True)

    def on_thinking(self, content: str):
        self._emit("on_thinking", content)

    def on_tool_call(self, tool_name: str, input: dict):
        self._emit("on_tool_call", {"name": tool_name, "input": input})

    def on_tool_result(self, tool_name: str, output: str):
        self._emit("on_tool_result", {"name": tool_name, "output": str(output)[:5000]})

    def on_compact(self):
        self._emit("on_compact", None)

    def on_inbox(self, messages: list):
        self._emit("on_inbox", messages)

    def on_bg_result(self, results: list):
        self._emit("on_bg_result", results)

    def on_loop_end(self, final_content: str):
        self._emit("on_loop_end", final_content)

    def on_dangerous(self, command: str, tool: str) -> tuple[bool, bool]:
        """阻塞等待 Electron 的危险命令确认"""
        self._emit("dangerous", {"command": command, "tool": tool})
        self._confirm_event.wait()
        result = self._confirm_result
        self._confirm_event.clear()
        return result  # type: ignore

    def feed_confirm(self, allow: bool, allow_all: bool):
        """由 stdin 读取线程调用，解除 on_dangerous 阻塞"""
        self._confirm_result = (allow, allow_all)
        self._confirm_event.set()
```

### 9.2 bridge/runner.py — Python 子进程入口

```python
"""PlanCoDE Runner — 接收 Electron 命令，启动 Agent，通过 stdout 推送事件"""
import json
import sys
import os
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.ipc_callback import IpcCallback

def read_stdin_thread(callback: IpcCallback):
    """在独立线程中读取 stdin，处理 Electron 发来的确认消息"""
    for line in sys.stdin:
        try:
            msg = json.loads(line.strip())
            if msg.get("type") == "stop":
                os._exit(0)
            elif msg.get("type") == "dangerous_confirm":
                allow = msg.get("allow", False)
                allow_all = msg.get("allow_all", False)
                callback.feed_confirm(allow, allow_all)
        except (json.JSONDecodeError, Exception):
            pass


def run_agent(agent_type: str, workdir: str, goal: str = None,
              plan: str = None, plan_path: str = None,
              design_path: str = None, prompt: str = None):
    """启动指定的 Agent"""
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    from agent.agent_loop import EventCallback
    from main.llm_adapter import create_llm_client

    stdin_lock = threading.Lock()
    callback = IpcCallback(stdin_lock)

    # 启动 stdin 读取线程
    t = threading.Thread(target=read_stdin_thread, args=(callback,), daemon=True)
    t.start()

    wd = Path(workdir)

    if agent_type == "plan":
        from main.plan_agent import PlanAgent
        agent = PlanAgent(workdir=wd)
        result = agent.run(goal=goal or "", event_callback=callback)
    elif agent_type == "design":
        from main.design_agent import DesignAgent
        agent = DesignAgent(workdir=wd)
        result = agent.run(plan=plan, plan_path=Path(plan_path) if plan_path else None,
                           event_callback=callback)
    elif agent_type == "execute":
        from main.execute_agent import ExecuteAgent
        agent = ExecuteAgent(workdir=wd)
        p_path = Path(plan_path) if plan_path else (wd / "plan.md")
        d_path = Path(design_path) if design_path else (wd / "design.md")
        result = agent.run(plan_path=p_path, design_path=d_path, event_callback=callback)
    elif agent_type == "general":
        from main.general_agent import GeneralAgent
        agent = GeneralAgent(workdir=wd)
        result = agent.run(prompt=prompt or "", event_callback=callback)
    else:
        return

    # 发送最终结果
    print(json.dumps({
        "type": "result",
        "agent": agent_type,
        "content": result.content if hasattr(result, 'content') else str(result),
        "round_count": result.round_count if hasattr(result, 'round_count') else 0,
        "tool_call_count": len(result.tool_calls) if hasattr(result, 'tool_calls') else 0,
    }, ensure_ascii=False), flush=True)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PlanCoDE Runner — stdin/stdout IPC bridge")
    parser.add_argument("--agent", required=True, choices=["plan", "design", "execute", "general"])
    parser.add_argument("--goal", type=str, default=None)
    parser.add_argument("--plan", type=str, default=None, help="Plan content (string)")
    parser.add_argument("--plan-path", type=str, default=None)
    parser.add_argument("--design-path", type=str, default=None)
    parser.add_argument("--prompt", type=str, default=None)
    parser.add_argument("--workdir", type=str, default=".")
    args = parser.parse_args()

    run_agent(
        agent_type=args.agent,
        workdir=args.workdir,
        goal=args.goal,
        plan=args.plan,
        plan_path=args.plan_path,
        design_path=args.design_path,
        prompt=args.prompt,
    )


if __name__ == "__main__":
    main()
```

---

## 9.3 Electron 主进程 — python-bridge.ts

```typescript
// electron/subprocess/python-bridge.ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class PythonBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = '';
  private pythonExe: string;
  private bridgeDir: string;
  private workdir: string;
  private env: NodeJS.ProcessEnv;

  constructor(workdir: string, env: NodeJS.ProcessEnv) {
    super();
    this.workdir = workdir;
    this.env = env;
    this.pythonExe = process.env.PYTHON_PATH || process.platform === 'win32' ? 'python' : 'python3';
    this.bridgeDir = require('path').join(__dirname, '..', '..', '..', 'bridge');
  }

  async start(agentType: string, options: Record<string, any>): Promise<void> {
    const args = [
      require('path').join(this.bridgeDir, 'runner.py'),
      '--agent', agentType,
      '--workdir', this.workdir,
    ];
    if (options.goal) args.push('--goal', options.goal);
    if (options.plan) args.push('--plan', options.plan);
    if (options.planPath) args.push('--plan-path', options.planPath);
    if (options.designPath) args.push('--design-path', options.designPath);
    if (options.prompt) args.push('--prompt', options.prompt);

    this.process = spawn(this.pythonExe, args, {
      cwd: this.workdir,
      env: { ...this.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'event') {
            this.emit('event', msg.name, msg.data);
          } else if (msg.type === 'dangerous') {
            this.emit('dangerous', msg.data);
          } else if (msg.type === 'result') {
            this.emit('result', msg);
          }
        } catch { /* ignore parse errors */ }
      }
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.emit('stderr', data.toString());
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
      this.process = null;
    });
  }

  send(message: object): void {
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify(message, null, 2) + '\n');
    }
  }

  confirmDangerous(allow: boolean, allowAll: boolean): void {
    this.send({ type: 'dangerous_confirm', allow, allow_all: allowAll });
  }

  stop(): void {
    if (this.process) {
      this.send({ type: 'stop' });
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}
```

### 9.4 IPC Handlers（agent-handlers.ts）

```typescript
// electron/ipc/agent-handlers.ts
import { ipcMain, WebContents } from 'electron';
import { PythonBridge } from '../subprocess/python-bridge';
import { BrowserWindow } from 'electron';

let currentBridge: PythonBridge | null = null;

ipcMain.handle('agent:start', async (event, { agentType, options, workdir, env }) => {
  if (currentBridge) currentBridge.stop();

  currentBridge = new PythonBridge(workdir, env);

  currentBridge.on('event', (name: string, data: any) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('agent:event', { name, data });
  });

  currentBridge.on('dangerous', (data: any) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('agent:dangerous', data);
  });

  currentBridge.on('result', (data: any) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('agent:result', data);
  });

  currentBridge.on('stderr', (msg: string) => {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send('agent:stderr', msg);
  });

  await currentBridge.start(agentType, options);
  return { status: 'started' };
});

ipcMain.handle('agent:stop', async () => {
  currentBridge?.stop();
  currentBridge = null;
  return { status: 'stopped' };
});

// 危险命令确认响应
ipcMain.handle('agent:confirm-dangerous', async (event, { allow, allowAll }) => {
  currentBridge?.confirmDangerous(allow, allowAll);
  return { status: 'confirmed' };
});
```

---

## 十、实现优先级

### P0（必须，第一周）

1. **项目初始化**：Electron + Vite + React + TypeScript + TailwindCSS
2. **主窗口布局**：侧边栏 + 主内容区 + 状态栏
3. **Python 桥接**：bridge/ipc_callback.py + bridge/runner.py + python-bridge.ts
4. **Dashboard 页面**：快速启动入口 + 最近运行历史
5. **Pipeline 页面**：3阶段基本骨架 + 事件流展示
6. **Settings 页面**：模型配置 + API Key 管理

### P1（重要，第二周）

7. **General REPL 页面**：对话界面 + 事件流实时展示
8. **History 页面**：历史会话列表 + 事件回放
9. **Timeline 组件**：时间线格式的事件展示 + ThinkingBubble + ToolCallBubble
10. **MarkdownPreview 组件**：plan.md / design.md / report.md 预览
11. **危险命令弹窗**：DangerousConfirmDialog + 60s 超时

### P2（增强，第三周）

12. **React Flow 工作流图**：动态节点生成
13. **TokenMeter 组件**：上下文用量仪表盘 + 压缩历史
14. **WorkflowStore**：React Flow 状态管理
15. **Session 持久化**：SQLite 存储历史 + 回放
16. **SettingsDialog**：完整设置弹窗

---

## 十一、开发指引

### 11.1 本地开发

```bash
# 前端开发模式
cd plancode-desktop
npm install
npm run dev

# Python 桥接单独测试
cd D:\develop\PlanCoDE
python bridge/runner.py --agent plan --goal "做一个博客系统"
```

### 11.2 环境变量

Agent 运行时需要的环境变量由 Electron 注入：

| 变量 | 说明 | 示例 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-...` |
| `OPENAI_BASE_URL` | 兼容 API 地址 | `http://localhost:11434/v1` |
| `MODEL_ID` | 当前使用模型 | `claude-sonnet-4-20250514` |
| `LLM_TIMEOUT` | LLM 调用超时（秒） | `120` |
| `PYTHONUNBUFFERED` | Python 输出不缓冲 | `1` |

### 11.3 注意事项

1. **Python 进程必须 UTF-8 输出**：所有 JSON 日志必须 `ensure_ascii=False`，Windows 中文路径才不会乱码
2. **stdin 管道在 Windows 有缓冲**：必须设置 `PYTHONUNBUFFERED=1` 或 `python -u`
3. **多 Agent 并发**：当前 `agent_loop` 是同步单线程。如果同时跑 plan + design，需要两个独立 Python 子进程
4. **Token 估算误差**：`estimate_tokens` 是字符估算（CJK/2, EN/4），不做真实 tiktoken 分词，有 ±15% 误差，可接受
5. **子进程 stdin 写入**：Electron 发送 JSON 后加 `\n`，Python 逐行读取，确保 `stdio: ['pipe', 'pipe', 'pipe']`
