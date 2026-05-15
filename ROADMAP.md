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

**目标**: 将游戏从单玩家工具重构为多玩家 LLM 学习能力基准测试。核心流程：添加模型 → 20 轮迭代竞技 → 观察学习曲线。

**依赖**: Phase 4

### 交付物

1. **多玩家管理系统** (`src/ui/components/api-config.ts` 重写)
   - ADD PLAYER 按钮替代 SAVE，注册模型为玩家并分配颜色
   - 最多 4 个玩家（蓝/红/绿/黄），防重复机制（provider + model 去重）
   - 玩家名册持久化到 localStorage，页面刷新后自动恢复
   - 旧格式自动迁移（单用户 → 多玩家）
   - LOAD BASELINE 添加内置基线机器人作为参照

2. **多玩家迭代引擎** (`src/llm/multi-player-iteration-engine.ts` 新建)
   - 固定 20 轮，无提前停止（学习曲线才是核心指标）
   - 每轮：所有玩家并行调用 LLM → 共享模拟 → 逐玩家诊断
   - 基线玩家跳过 LLM 调用，使用静态代码
   - 逐玩家错误处理：LLM 失败时回退到上一轮代码
   - 完整存储每轮 `TickRecord[]`（~4.4MB/20 轮/4 玩家，内存可承受）

3. **UI 流程重设计**
   - 删除 GENERATE BOT、ITERATE、RUN TRIAL 按钮
   - 新增 PLAY 按钮启动 20 轮基准测试
   - 代码框变为只读查看器，通过玩家+轮次选择器浏览
   - 轮次滑块（1-20）+ 速度滑块实现逐轮回放
   - 分数折线图（Canvas）实时展示各玩家学习曲线

4. **逐玩家诊断** (`src/llm/diagnostic.ts` 扩展)
   - `generatePlayerDiagnostic()` 按 playerId 过滤船只统计
   - 改进提示词增加多玩家竞争意识

5. **LLM Materials 标签页更新**
   - 新增玩家选择器 + 轮次选择器
   - 支持按玩家 × 轮次浏览完整 prompt/response/diagnostic

**版本**: 0.5.0

---

## Phase 6: 数据持久化 ⬜

**目标**: IndexedDB 持久化全部运行数据。

**依赖**: Phase 5

### 交付物

1. **存储层** (`src/storage/` 新建)
   - `db.ts` — IndexedDB 初始化 + 版本迁移
   - `bot-store.ts` — Bot 代码存储（模型名、代码、来源）
   - `run-store.ts` — 运行记录（种子、得分、诊断、迭代历史）
   - Schema: `bots`, `runs`, `iterations` object stores
   - TickRecord[] 按需存储（仅最佳 run），避免数据膨胀
   - Database 标签页：浏览历史 bot + run，加载历史 bot

**版本**: 0.6.0

---

## Phase 7: 排行榜 + 100 种子基准测试 ⬜

**目标**: 正式基准测试 —— 100 固定种子跑分取平均，产出可比较的 LLM 排行榜。

**依赖**: Phase 6

### 交付物

1. **100 种子基准引擎** (`src/modes/benchmark.ts` 新建)
   - `BENCHMARK_SEEDS = [1..100]` 硬编码
   - 进度条 + 实时平均分 + 可中断
   - 结果聚合：平均/中位/标准差/最高最低种子

2. **排行榜标签页** (`src/ui/tabs/leaderboard-tab.ts` 新建)
   - 排名表：模型名 | 平均分 | 标准差 | 测试时间
   - 展开查看 100 种子分数分布
   - 两 bot 对比功能
   - CSV/JSON 导出

3. **Full Runs 增强** — 支持 100 种子 + 分布直方图

**版本**: 0.7.0

---

## Phase 8: PVP 模式 + Elo 排名 ⬜

**目标**: Bot 间 1v1 对战 + Elo rating。项目"终极形态"。

**依赖**: Phase 6（持久化）

### 交付物

1. **PVP 引擎**
   - `src/modes/pvp.ts` — 2 人对战编排
   - `src/modes/elo.ts` — Elo 计算（初始 1500, K=32）
   - `src/modes/matchmaker.ts` — Round-robin / Swiss 配对

2. **PVP 标签页** (`src/ui/tabs/pvp-tab.ts`)
   - 手动对战 + 自动锦标赛模式
   - Elo 排名表 + 对战历史

3. **Web Worker 沙箱升级** (`src/llm/worker-sandbox.ts` 新建)
   - `new Function()` → Web Worker，防阻塞主线程
   - 单次 `decide()` 超时 5ms
   - 对 PVP 公平性至关重要

**版本**: 1.0.0 🎉

---

## 阶段依赖图

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
 (核心)    (渲染)    (LLM)    (迭代)    (模块化)  (多玩家)   (持久化)  (排行榜)
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
| 6 | 0.6.0 | 数据持久化 |
| 7 | 0.7.0 | 排行榜 + 100 种子 |
| 8 | 1.0.0 | PVP + Elo = 功能完整 |

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
