# GRAVWELL GPT 分阶段开发路线图

项目目前完成了核心引擎、渲染、LLM 集成和单人模拟器（v0.2.0），但缺少迭代学习、数据持久化、排行榜、多人模式等高级功能。

---

## Phase 0: 物理引擎 + 核心模拟 ✅ 已完成

**目标**: 建立确定性物理模拟内核，零 DOM/Canvas 依赖。

- Verlet 积分 + 四恒星引力 + 碰撞检测
- Mulberry32 种子 PRNG（同种子 = 同结果）
- 竞技场生成器：种子 → 恒星/飞船/区域路径
- Lissajous 得分区域 + 半径渐缩 + 20 tick 预测
- `Simulation.runToCompletion()` → `TickRecord[]`
- Vec2 数学工具库

**文件**: `src/core/` 全部 + `src/types.ts` + `src/constants.ts` + `src/utils/math.ts`

---

## Phase 1: Canvas 渲染 + 回放系统 ✅ 已完成

**目标**: 将 `TickRecord[]` 可视化，支持变速回放。

- 恒星多层光晕 + 飞船轨迹线 + 区域圆 + 星空背景
- 60fps 回放 + 0.25x-5x 速度控制 + HiDPI 适配
- ParticleSystem 已定义但**未接入渲染管线**

**文件**: `src/renderer/` 全部

---

## Phase 2: LLM 集成 + 单人模拟器 ✅ 已完成 (v0.2.0)

**目标**: 端到端单人流程：选 Provider → 生成 bot → 运行 → 回放 → 诊断。

- 4 个 Provider（OpenRouter / Anthropic / OpenAI / DeepSeek）
- Prompt Builder + Code Parser + `new Function()` 沙箱
- Baseline Zone Seeker 机器人
- DiagnosticReport 生成
- 6 标签页 UI 框架（Simulator 已完成，其余占位）
- localStorage 持久化 API 配置

**文件**: `src/llm/` 全部 + `src/main.ts`

---

## Phase 3: 多轮迭代学习系统 ✅ 已完成 (v0.3.0)

**目标**: LLM 生成 bot → 运行 → 诊断反馈 → 改进代码，循环 N 轮。**核心创新点**。

**依赖**: Phase 2

### 交付物

1. **迭代引擎** (`src/llm/iteration-engine.ts` ✅)
   - `IterationEngine` 类：generate → run → diagnose → improve 循环
   - 配置：最大轮数（默认 5）、停止条件（得分阈值 / 无改善 N 轮）
   - 每轮记录 `IterationRecord { round, code, score, diagnostic, tokensUsed }`
   - 事件回调：`onRoundStart`, `onRoundComplete`, `onIterationDone`, `onError`

2. **改进提示词** (`src/llm/improvement-prompt.ts` ✅)
   - 将上轮代码 + DiagnosticReport 格式化为改进指令
   - 指导 LLM 保留有效策略、修复具体失败

3. **Simulator 面板扩展** (`src/main.ts` ✅)
   - ITERATE 按钮 + 轮数选择器（3 / 5 / 10 轮）+ STOP 按钮
   - 实时进度：`Round 2/5 | 45 → 78 → ...`
   - 最佳代码自动加载到编辑器

4. **粒子效果接入** (`src/renderer/game-renderer.ts` ✅)
   - 飞船坠毁时触发 `explode()` 爆炸

5. **难度调整** ✅
   - `fuelStart` 30 → 20，逼迫真正的燃料规划
   - Zone 最终半径 40%（原 60%），精度要求更高

**版本**: 0.3.0

---

## Phase 4: UI 模块化 + LLM Materials + Full Runs ✅ 已完成 (v0.4.0)

**目标**: 拆分膨胀的 `main.ts`，实现 LLM Materials 和 Full Runs 标签页。

**依赖**: Phase 3

### 交付物

1. **UI 模块化重构** ✅
   - `src/ui/app.ts` — AppState 接口 + App 类（tab 路由、状态管理）
   - `src/ui/tabs/simulator-tab.ts` — Simulator 面板（全部业务逻辑）
   - `src/ui/tabs/llm-materials-tab.ts` — LLM Materials
   - `src/ui/tabs/full-runs-tab.ts` — Full Runs
   - `src/ui/components/api-config.ts` — API 配置组件
   - `src/ui/components/code-editor.ts` — 代码编辑器组件
   - `src/ui/components/iteration-panel.ts` — 迭代面板组件
   - `src/ui/components/replay-controls.ts` — 回放控制组件
   - `main.ts` 从 620 行精简为 12 行 bootstrap

2. **LLM Materials 标签页** ✅
   - 展示完整 system prompt、user prompt、LLM 原始回复
   - 提取后代码展示
   - 每轮 DiagnosticReport（含逐船统计表格）
   - 支持单次生成和多轮迭代两种模式

3. **Full Runs（多种子批量运行）** ✅
   - `src/modes/multi-seed-runner.ts` — 批量执行引擎
   - 支持范围格式（`1-20`）和逗号格式（`1,5,10`）
   - 结果表格（种子/分数/存活/坠毁/燃料/区域 tick）
   - 统计摘要（平均/中位/标准差/最低/最高 + 对应种子号）
   - 颜色编码柱状图（绿 ≥ 中位数，红 < 中位数）+ 中位数虚线

4. **IterationRecord 扩展** ✅
   - 新增 `systemPrompt`、`userPrompt`、`rawResponse` 字段
   - 为 LLM Materials 标签页提供完整交互数据

**版本**: 0.4.0

---

## Phase 5: 多玩家基准测试重构 ✅ 已完成 (v0.5.0)

**目标**: 将游戏从单玩家工具重构为多玩家 LLM 学习能力基准测试。核心流程：添加模型 → 5 轮迭代竞技 → 观察学习曲线。

**依赖**: Phase 4

### 交付物

1. **多玩家管理系统** (`src/ui/components/api-config.ts` 重写)
   - ADD PLAYER 按钮替代 SAVE，注册模型为玩家并分配颜色
   - 最多 4 个玩家（蓝/红/绿/黄），防重复机制（provider + model 去重）
   - 玩家名册持久化到 localStorage，页面刷新后自动恢复
   - 旧格式自动迁移（单用户 → 多玩家）
   - LOAD BASELINE 添加内置基线机器人作为参照

2. **多玩家迭代引擎** (`src/llm/multi-player-iteration-engine.ts` 新建)
   - 固定 5 轮，每轮提供**完整进化历史**（非仅上一轮）
   - 每轮：所有玩家并行调用 LLM → 共享模拟 → 逐玩家诊断
   - 改进提示包含：分数趋势表、逐船详情、趋势检测（IMPROVING/FLAT/REGRESSING）、最佳代码 + 最新代码
   - 基线玩家跳过 LLM 调用，使用静态代码
   - 逐玩家错误处理：LLM 失败时回退到**历史最佳代码**（非仅上一轮）
   - 完整存储每轮 `TickRecord[]`

3. **UI 流程重设计**
   - 删除 GENERATE BOT、ITERATE、RUN TRIAL 按钮
   - 新增 PLAY 按钮启动 5 轮基准测试
   - 代码框变为只读查看器，通过玩家+轮次选择器浏览
   - 轮次滑块（1-5）+ 速度滑块实现逐轮回放
   - 分数折线图（Canvas）实时展示各玩家学习曲线

4. **逐玩家诊断** (`src/llm/diagnostic.ts` 扩展)
   - `generatePlayerDiagnostic()` 按 playerId 过滤船只统计
   - 改进提示词增加多玩家竞争意识

5. **LLM Materials 标签页更新**
   - 新增玩家选择器 + 轮次选择器
   - 支持按玩家 × 轮次浏览完整 prompt/response/diagnostic

**版本**: 0.5.0 → 0.5.1（迭代逻辑重构）

---

## Phase 5.1: 迭代逻辑重构 + 全历史进化 ✅ 已完成 (v0.5.1)

**目标**: 将迭代从"仅看上一轮"重构为"看完整进化历史"，并将轮次从 20 降至 5（减少运行时间，提高每轮信息密度）。

**依赖**: Phase 5

### 交付物

1. **全历史改进提示** (`src/llm/improvement-prompt.ts` 重写)
   - 新增 `RoundHistoryEntry` 接口，存储每轮的代码、分数、诊断
   - 压缩历史格式：分数趋势表 + 逐船单行摘要 + 趋势检测（IMPROVING/FLAT/REGRESSING）
   - 用户提示包含最佳代码 + 最新代码（若不同），回退提示在 REGRESSING 时触发
   - `TOTAL_ROUNDS = 5`，导出供其他模块使用

2. **引擎重构** (`src/llm/multi-player-iteration-engine.ts`)
   - `PlayerState.history: RoundHistoryEntry[]` 替代旧的 `previousCode` / `previousDiagnostic`
   - 每轮将完整历史传给改进提示
   - 错误回退使用历史最佳代码（非仅上一轮）

3. **数据库重置** (`src/persistence/db.ts`)
   - DB_VERSION 从 1 升至 2，清除不兼容的 20 轮缓存数据

4. **Bug 修复：分数折线图在切换标签页后消失**
   - 原因：隐藏标签页时 `canvas.clientWidth` 为 0，`renderScoreChart()` 将画布设为 0×0
   - 修复：跳过零尺寸渲染 + 缓存最新数据 + `onActivate()` 时重绘

**版本**: 0.5.1

---

## Phase 5.2: Prompt 重设计 + 并行可见性与种子缓存 ✅ 已完成 (v0.5.2 + v0.5.3)

**目标**: 提升 prompt 对 LLM 能力的区分度，同时优化多玩家并发体验与跨轮次复用效率。

**依赖**: Phase 5.1

### 交付物

1. **Prompt 重设计** (`src/llm/prompt-builder.ts` 重写) — v0.5.2
   - `predictionTicks` 从 20 降至 **5**：缩短预测窗口，强模型才能写出引力感知的轨迹规划
   - 移除 `ctx.seed`：屏蔽 Lissajous 路径全局预算能力，bot 只能利用运行时信息
   - 新增 `ctx.seek(target, power?)` helper：内置速度补偿，让 LLM 专注策略而非三角函数
   - 新增多船分工提示：用 `ctx.ship.id` 区分 S1/S2/S3 角色
   - 重写 User Prompt 为 4 个具体权衡问题

2. **并行 LLM 调用可见性** (`src/ui/tabs/simulator-tab.ts`) — v0.5.3
   - 每个玩家独立显示实时状态（`P1:gen... P2:done P3:cache`），替代单一 "calling LLMs..."

3. **Per-seed 玩家结果缓存** (`src/ui/tabs/simulator-tab.ts`, `src/ui/app.ts`, `src/types.ts`) — v0.5.3
   - `AppState.playerCache: Map<cacheKey, CachedPlayerRun>`（内存级，刷新后失效）
   - 重跑相同模型 + 种子时，命中缓存的玩家跳过 LLM 调用，0 token 消耗
   - `MultiPlayerIterationEngine.preloadedRounds` 参数承接缓存数据

**版本**: 0.5.2 + 0.5.3

---

## Phase 6: 数据持久化 ✅ 已完成 (v0.6.0)

**目标**: IndexedDB 持久化全部运行数据（排行榜已实现基础持久化）。

**依赖**: Phase 5.2

### 交付物

1. **`simulator-runs` IndexedDB store** (`src/persistence/simulator-store.ts` 新建)
   - 每次基准测试完成后，自动为每个玩家写入一条 `SimulatorRunRecord`（seed、model、provider、逐轮 code/score、bestScore/bestRound）
   - 重复运行累积历史（非覆盖），可按 timestamp 查阅所有历史

2. **Cache 跨 session 持久化** (`src/ui/tabs/simulator-tab.ts`)
   - 启动时从 DB 读取最新记录恢复 `playerCache`，硬刷新后重跑同一种子仍显示 `[cache]`
   - 运行完成后同步写 DB（fire-and-forget，不阻塞 UI）

3. **Database 标签页** (`src/ui/tabs/database-tab.ts` 新建)
   - 表格：日期 / 模型 / Provider / 种子 / 最高分 / 最佳轮次 / 总轮数 / 操作
   - 展开行：逐轮分数 + VIEW CODE 弹窗（全代码预览）
   - REFRESH 刷新列表 / DEL 删单条（同步清 in-memory cache）/ CLEAR ALL 清全部

4. **DB 迁移至 v3** (`src/persistence/db.ts`)
   - 新增 `simulator-runs` store，v2→v3 保留 `leaderboard-runs` 数据

**版本**: 0.6.0

---

## Phase 7: 排行榜 + 100 种子基准测试 ✅ 已完成 (v0.7.0)

**目标**: 正式基准测试 —— 100 固定种子跑分取平均，产出可比较的 LLM 排行榜。

**依赖**: Phase 6

### 交付物

1. **100 种子排行榜** (`src/constants.ts`)
   - `LEADERBOARD_SEEDS = [1..100]`（从 10 扩展至 100）
   - `TOTAL_ROUNDS` 从 5 升至 10，给 LLM 更多迭代空间
   - `computeConfigHash` 纳入 `TOTAL_ROUNDS`，轮次变化时自动令旧缓存失效
   - DB 升级至 v4，自动清空不兼容的旧缓存

2. **种子热力图** (`src/ui/tabs/leaderboard-tab.ts`)
   - 取代原宽表格，每个模型展示 10×10 格子可视化
   - 颜色插值：深棕（低）→ 金色（高），待跑格灰色，运行中格显示轮次 + 脉冲动画
   - 每格可点击查看单 seed 详情（score 历程折线图）

3. **进度条 + CSV 导出**
   - 运行时显示 "X / N seeds (Y%)" 进度条
   - EXPORT CSV 导出完整排名 + 每 seed 分数

**版本**: 0.7.0

---

## Phase 8: PVP 模式 + Elo 排名 ✅ 已完成 (v1.0.0)

**目标**: Bot 间对战 + Elo rating。**核心创新：公平位置轮换**消除起始坐标偏差。

**依赖**: Phase 7（LEADERBOARD 持久化）

### 交付物

1. **公平 PVP 引擎** (`src/modes/pvp.ts` ✅)
   - `runFairMatch(bots, seed, config)` — N 个 bot 跑 N 轮位置轮换，每个 bot 在每个起始位置出场一次；最终分数取平均，消除位置偏差
   - `getBestCodePerModel()` — 扫描所有 leaderboard-runs，返回每个模型全局最高 (seed, round) 代码
   - Bot 代码仅从 LEADERBOARD 导入（需先跑过排行榜）

2. **Elo 数学** (`src/modes/elo.ts` ✅)
   - `applyMatchElo(elos, rank, avgScores)` — N 人 pairwise 更新（K=32，初始 1500）
   - `tallyRecords(avgScores)` — W/L/D 统计
   - `INITIAL_ELO` 常量从 `src/constants.ts` 导出

3. **PVP 标签页** (`src/ui/tabs/pvp-tab.ts` ✅)
   - Bot 名册：Elo 排名表（W/L/D/Matches/来源）+ DEL/RESET ELO/CLEAR ALL
   - Import 面板：一键从 LEADERBOARD 导入各模型最佳代码
   - Match Setup：2–4 bot 复选 + 种子输入 + 随机骰子
   - Match Results：逐轮分数表 + Avg + Elo Δ（含 🥇🥈🥉 标记）
   - Match History：历史列表可点击 WATCH 加载回放
   - Replay Viewer：Canvas + 轮次切换按钮 + tick 滑块 + 速度控制

4. **PVP 持久化** (`src/persistence/pvp-store.ts` ✅)
   - `pvp-bots` store：getAllBots, addBot, updateBot, deleteBot, clearAllBots, resetAllElo
   - `pvp-matches` store：addMatch, getAllMatches, deleteMatch, clearAllMatches
   - DB v5 迁移：保留所有旧 store 数据不变

5. **Simulation arenaOverride** (`src/core/simulation.ts` ✅)
   - 构造函数加入可选 `arenaOverride?: ArenaData`，向后兼容
   - PVP 比赛通过注入预排列 arena 实现位置轮换

**未实现（留 Phase 8.5）**:
   - Web Worker 沙箱升级（`src/llm/worker-sandbox.ts`）
   - 多种子比赛
   - 自动锦标赛 / matchmaker

**版本**: 1.0.0 🎉

---

## 阶段依赖图

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 5.1 → Phase 5.2 → Phase 6 → Phase 7
 (核心)    (渲染)    (LLM)    (迭代)    (模块化)  (多玩家)  (全历史迭代)  (Prompt+缓存)  (持久化)  (排行榜)
                                                                                ↓
                                                                             Phase 8
                                                                             (PVP+Elo)
```

## 版本号规划

| Phase | 版本 | 里程碑 |
|-------|------|--------|
| 0-2 | 0.1.0 - 0.2.0 | ✅ 已发布 |
| 3 | 0.3.0 | ✅ 迭代学习系统 |
| 4 | 0.4.0 | ✅ UI 重构 + 新标签页 |
| 5 | 0.5.0 | ✅ 多玩家基准测试 |
| 5.1 | 0.5.1 | ✅ 全历史迭代进化 + Bug 修复 |
| 5.2 | 0.5.2 + 0.5.3 | ✅ Prompt 重设计 + 并行可见性 + per-seed 缓存 |
| 6 | 0.6.0 | ✅ 数据持久化 + Database 标签页 |
| 7 | 0.7.0 | ✅ 排行榜 + 100 种子 |
| 8 | 1.0.0 | ✅ PVP + Elo + 公平位置轮换 |

## 风险提示

1. **main.ts 膨胀** — Phase 3 会让 513 行的 main.ts 更大，Phase 4 模块化不能拖太久
2. **TickRecord 存储量** — 100 种子 × 200 tick × 12 ships = 大量数据，需按需存储策略
3. **effects.ts 用 Math.random()** — 粒子是视觉装饰，不影响确定性，可保留
4. **Worker 迁移时机** — Phase 7 才做，但如果 100 种子批量跑卡顿可提前到 Phase 6

## 验证方式

每个 Phase 完成后：
- `npm run build` 无 TypeScript 错误
- `npm run dev` 手动验证新功能
- Phase 3: 观察 LLM 在 3-5 轮内将得分从 ~20 提升到 ~80+
- Phase 4+: 各标签页可切换且功能正常
- Phase 5+: 刷新页面后数据仍在
- Phase 7: 两 bot 对战结果正确，Elo 更新合理

## 开发流程规范

### Git Commit 策略：小步快跑
- 每完成一个**特征点**（一个函数、一个组件、一个接口定义等）就立即 commit
- commit message 简明扼要，描述改动的具体内容
- 不要积攒多个特征点一起提交

### Phase 完成后的收尾清单
每个 Phase 验证无误后，必须执行以下步骤：
1. 更新 `README.md` — 同步新功能描述、路线图勾选
2. 更新 `ROADMAP.md` — 将当前 Phase 标记为 ✅ 已完成
3. 更新 `CLAUDE.md` — 同步项目结构、新文件、新命令
4. 更新 `CHANGELOG.md` — 记录版本号 + 新增/变更/修复内容
5. 提交上述 4 个文件的更新
6. 执行 `git push` 推送到远程仓库
