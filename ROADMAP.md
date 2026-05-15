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

## Phase 4: UI 模块化 + LLM Materials + Full Runs ⬜ 下一步

**目标**: 拆分膨胀的 `main.ts`，实现 LLM Materials 和 Full Runs 标签页。

**依赖**: Phase 3

### 交付物

1. **UI 模块化重构**
   - `src/ui/app.ts` — 应用状态 + tab 路由
   - `src/ui/tabs/simulator-tab.ts` — Simulator 面板
   - `src/ui/tabs/llm-materials-tab.ts` — LLM Materials
   - `src/ui/tabs/full-runs-tab.ts` — Full Runs
   - `src/ui/components/` — api-config, code-editor, replay-controls, iteration-panel
   - `main.ts` 精简为 bootstrap

2. **LLM Materials 标签页**
   - 展示完整 prompt、LLM 原始回复、每轮 DiagnosticReport
   - 代码解析对比（原始 vs 提取后）

3. **Full Runs（多种子批量运行）**
   - `src/modes/multi-seed-runner.ts` 新建
   - 输入种子范围（如 1-20），批量运行同一 bot
   - 结果表格 + 统计摘要（平均/中位/标准差）+ 迷你柱状图

**版本**: 0.4.0

---

## Phase 5: 数据持久化 + 4 人大逃杀 ⬜

**目标**: IndexedDB 持久化全部运行数据，实现 4 人同屏对抗。

**依赖**: Phase 4

### 交付物

1. **存储层** (`src/storage/` 新建)
   - `db.ts` — IndexedDB 初始化 + 版本迁移
   - `bot-store.ts` — Bot 代码存储（模型名、代码、来源）
   - `run-store.ts` — 运行记录（种子、得分、诊断、迭代历史）
   - Schema: `bots`, `runs`, `iterations` object stores
   - TickRecord[] 按需存储（仅最佳 run），避免数据膨胀
   - Database 标签页：浏览历史 bot + run，加载历史 bot

2. **4 人大逃杀** (`src/modes/battle-royale.ts` 新建)
   - 4 bot 槽位（LLM / baseline / 历史 bot / 手动粘贴）
   - `config.playerCount = 4`，12 艘飞船同屏
   - 结果面板显示 4 人排名

**版本**: 0.5.0

---

## Phase 6: 排行榜 + 100 种子基准测试 ⬜

**目标**: 正式基准测试 —— 100 固定种子跑分取平均，产出可比较的 LLM 排行榜。

**依赖**: Phase 5

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

**版本**: 0.6.0

---

## Phase 7: PVP 模式 + Elo 排名 ⬜

**目标**: Bot 间 1v1 对战 + Elo rating。项目"终极形态"。

**依赖**: Phase 5（多人验证 + 持久化）

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
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
 (核心)    (渲染)    (LLM)    (迭代)    (模块化)   (存储+BR)  (排行榜)
                                                       ↓
                                                    Phase 7
                                                    (PVP+Elo)
```

## 版本号规划

| Phase | 版本 | 里程碑 |
|-------|------|--------|
| 0-2 | 0.1.0 - 0.2.0 | ✅ 已发布 |
| 3 | 0.3.0 | ✅ 迭代学习系统 |
| 4 | 0.4.0 | UI 重构 + 新标签页 |
| 5 | 0.5.0 | 持久化 + 大逃杀 |
| 6 | 0.6.0 | 排行榜 + 100 种子 |
| 7 | 1.0.0 | PVP + Elo = 功能完整 |

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
