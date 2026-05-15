# Changelog

## [0.4.0] - 2026-05-15

### Added
- **UI 模块化重构** — `main.ts` 从 620 行精简为 12 行 bootstrap。业务逻辑拆分到 `src/ui/tabs/simulator-tab.ts`，UI 组件拆分到 `src/ui/components/`（api-config、code-editor、iteration-panel、replay-controls）
- **App 框架** (`src/ui/app.ts`) — `AppState` 集中状态管理 + `App` 类实现 tab 路由和 `onActivate()`/`onDeactivate()` 生命周期
- **LLM Materials 标签页** (`src/ui/tabs/llm-materials-tab.ts`) — 完整展示每轮 LLM 交互：system prompt、user prompt、原始回复、提取后代码、DiagnosticReport（含逐船统计表格）。支持单次生成和多轮迭代两种模式
- **Full Runs 标签页** (`src/ui/tabs/full-runs-tab.ts`) — 多种子批量运行，支持范围格式（`1-20`）和逗号格式（`1,5,10`）。包含结果表格、统计摘要（平均/中位/标准差/最低/最高）、颜色编码柱状图
- **MultiSeedRunner** (`src/modes/multi-seed-runner.ts`) — 纯逻辑批量执行引擎，每 5 个种子 yield 到 UI 线程，支持中止
- **IterationRecord 扩展** — 新增 `systemPrompt`、`userPrompt`、`rawResponse` 字段，为 LLM Materials 提供完整数据

### Changed
- 组件模式：构造函数创建 DOM → 添加到父元素 → 回调模式连接事件
- Tab 模式：每个标签页实现 `Tab` 接口，通过 `App.registerTab()` 注册

## [0.3.0] - 2026-05-15

### Added
- **迭代学习引擎** (`src/llm/iteration-engine.ts`) — `IterationEngine` 类实现 generate → run → diagnose → improve 循环，支持最大轮数、得分阈值、连续无改进停止等配置
- **改进 prompt 构建器** (`src/llm/improvement-prompt.ts`) — 将上轮代码 + DiagnosticReport 格式化为针对性改进指令，提示 LLM 修复具体失败船只并利用引力辅助节省燃料
- **ITERATE 按钮** — Simulator 面板新增迭代控制区：ITERATE 按钮、轮数选择器（3/5/10 轮）、STOP 中止按钮
- **实时进度显示** — 迭代过程中展示 `Round 2/5  |  34 → 67 → ...` 分数变化，完成后保留最终摘要
- **爆炸粒子效果** — 飞船坠毁时在坠毁位置触发粒子爆炸动画，接入已有 `ParticleSystem`

### Changed
- **难度调整**：`fuelStart` 从 30 降至 **20**，强制真正的燃料规划而非无脑追区域
- **难度调整**：得分区域最终半径从基准的 60% 收紧至 **40%**（r≈4 而非 r≈6），精度要求更高
- 每轮迭代结束后自动将当前最高分代码加载到编辑器，方便随时 RUN TRIAL 验证

## [0.2.0] - 2026-05-15

### Added
- DeepSeek API 支持（`deepseek-chat`、`deepseek-v4-flash`、`deepseek-v4-pro` 等）
- Model 输入框移至 API Configuration 区块，支持自由指定模型名

### Changed
- UI 布局重构：按操作流程重新分组（BOT CODE → RUN & REPLAY → RESULTS）
- API Configuration 字段顺序调整为 Provider → API Key → Model
- 移除粘贴 API Key 时自动切换 Provider 的行为，避免 DeepSeek 等 `sk-` 前缀被误判为 OpenAI
- 按钮精简：GENERATE BOT / LOAD BASELINE / APPLY EDIT 归入 BOT CODE 区块
- RUN TRIAL / PLAY / STOP 归入运行区块，COPY REPORT 归入结果区块
- max_tokens 从 4096 提升至 16384，避免复杂策略代码被截断
- Canvas 游戏区域居中渲染，修复宽屏下底部恒星被裁切的问题
- Model 设置随 SAVE 按钮持久化到 localStorage

## [0.1.0] - 2026-05-15

首个可玩 MVP 版本。

### Added

**物理引擎 (`src/core/`)**
- Verlet 积分运动系统（`next = current + velocity + gravity + thrust`）
- 引力计算：4 颗恒星，`accel = G × mass / (dist + softening)²`
- 恒星碰撞检测（进入杀伤半径 = 飞船销毁）
- 得分区域碰撞检测
- Mulberry32 种子随机数生成器，确保确定性
- 竞技场生成：从种子生成恒星位置/质量、飞船起始位置
- 得分区域路径：基于 Lissajous 曲线的确定性闭合路径
- 区域半径随时间缩小，增加难度
- 未来 20 tick 区域位置预测

**Canvas 渲染 (`src/renderer/`)**
- 随机星空背景（OffscreenCanvas 缓存）
- 恒星多层光晕效果（shadowBlur + 径向渐变）
- 飞船彩色圆点 + Alpha 衰减轨迹线
- 得分区域白色圆圈
- 粒子系统（爆炸效果）
- 60fps 回放系统，支持 0.25x-5x 速度

**LLM 集成 (`src/llm/`)**
- OpenRouter API 支持
- Anthropic 直连 API 支持
- OpenAI 直连 API 支持
- DeepSeek 直连 API 支持
- Prompt 构建器：包含完整游戏规则 + 种子特定竞技场数据
- 代码解析器：从 LLM 回复中提取 `decide()` 函数（支持 markdown、裸函数、箭头函数）
- `new Function()` 沙箱执行，错误捕获
- 运行后诊断报告生成

**用户界面**
- 6 标签页框架（Simulator 已完成，其余占位）
- 金色/深色复古终端主题
- API key 管理（localStorage 持久化）
- 种子、模式、模型配置
- GENERATE BOT / RUN SCORE TRIAL 按钮
- 回放控制 + 速度滑块
- 玩家统计面板（存活/坠毁/燃料/得分）
- Bot 代码编辑器 + 基线机器人加载

**内置基线机器人**
- Zone Seeker：朝得分区域飞行 + 恒星规避 + 使用预测 + 区域内速度阻尼
