# GRAVWELL GPT

一个测试 LLM 物理理解能力的太空基准测试游戏。

AI 模型需要编写 JavaScript 代码来控制飞船，在引力场中导航，保持在不断移动的得分区域内，同时避免撞上恒星。

![Game Screenshot](视频关键帧截图/Snipaste_2026-05-14_23-44-10.png)

## 游戏规则

- **100×100** 的连续太空竞技场，每局 **200 个 tick**
- 每个玩家控制 **3 艘飞船**，每艘飞船有 **20 单位燃料**
- **4 颗恒星** 产生引力（引力公式：`accel = 0.003 × mass / (dist + 0.002)²`）
- 飞船使用 **Verlet 积分** 运动：`next = current + velocity + gravity + thrust`
- 推力矢量大小上限为 **1.0**，消耗等量燃料；燃料耗尽后只能靠惯性滑行
- **得分区域** 沿确定性闭合曲线移动，每 tick 每艘在区域内的存活飞船得 **1 分**
- 撞入恒星的杀伤半径 = 飞船永久销毁
- 飞出竞技场边界不会死亡，但无法得分

## 为什么这个游戏有趣

1. **物理即智力测试** — 规则在 prompt 中描述，LLM 必须把理解转化为有效代码
2. **直观可看** — 任何人都能看懂飞船是否在圈里，不需要专业知识
3. **多种失败模式** — 推力太猛会飞出去；离恒星太近会被摧毁；时机不对会错过区域
4. **公平比较** — 种子(seed)确保确定性，100 种子平均消除运气因素
5. **学习能力测试** — 迭代系统展示 LLM 从反馈中学习的速度

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开 http://localhost:5173

### 快速体验（无需 API Key）

1. 点击 **LOAD BASELINE** 添加内置基线机器人作为玩家
2. 点击 **PLAY** 启动基准测试（基线玩家会跑满 5 轮）
3. 用轮次滑块切换不同轮次，点击 **PLAY** 观看回放

### 多模型基准对比

1. 选择 Provider（OpenRouter / Anthropic / OpenAI / DeepSeek）
2. 填入 API Key 和模型名称
3. 点击 **ADD PLAYER** — 该模型注册为一个玩家，显示分配的颜色
4. 重复 1-3 添加更多模型（最多 4 个玩家）
5. 点击 **PLAY** — 启动 5 轮迭代基准测试
   - 每轮：所有玩家并行调用 LLM → 在同一模拟中竞技 → 各自获取诊断反馈
   - 每轮改进提示包含**完整进化历史**（分数趋势、逐船数据、最佳代码 + 最新代码）
   - 分数折线图实时展示各模型的学习曲线
6. 用**轮次滑块**切换查看第 1 轮（初始表现）到第 5 轮（最终进化结果）
7. 点击 **PLAY** 播放选中轮次的动画回放

## LLM 如何控制飞船

LLM 编写一个 `decide(ctx)` 函数，每个 tick 对每艘存活飞船调用一次：

```javascript
function decide(ctx) {
  // ctx.ship       — 当前飞船 {x, y, vx, vy, fuel, alive, id, ...}
  // ctx.zone       — 得分区域 {x, y, radius}
  // ctx.prediction — 未来 5 个 tick 的区域位置
  // ctx.suns       — 恒星数组 {x, y, mass, radius}
  // ctx.tick       — 当前 tick (0-199)

  // Helpers:
  // ctx.seek(target, power=1) — 朝目标推力，自动补偿当前速度防过冲
  // ctx.push(from, to, str)   — 归一化方向推力
  // ctx.nearestSun(pos)       — 最近恒星

  // 返回推力矢量
  return ctx.seek(ctx.zone, 0.5);
}
```

## 技术栈

- **Vite + TypeScript** — 零运行时依赖
- **Canvas 2D** — 纯手写渲染，无游戏引擎
- **Vanilla DOM** — 无框架，无 React/Vue

## 项目结构

```
src/
├── main.ts      # 应用入口（bootstrap）
├── core/        # 纯物理模拟引擎（无 DOM）
├── renderer/    # Canvas 渲染（恒星光晕、飞船轨迹、爆炸粒子）
├── llm/         # LLM API 集成 + 多玩家迭代引擎
├── ui/          # 模块化 UI 层
│   ├── app.ts                 # AppState + App 类（tab 路由）
│   ├── tabs/                  # 标签页：Simulator / LLM Materials / Full Runs
│   └── components/            # UI 组件：玩家管理 / 代码查看器 / 回放控制
├── modes/       # 游戏模式编排器（多种子批量运行等）
└── utils/       # 向量数学工具
```

## 路线图

- [x] 物理引擎 + Verlet 积分 + 引力
- [x] Canvas 渲染 + 恒星光晕 + 飞船轨迹
- [x] Simulator 标签页 + 配置面板
- [x] LLM API 集成（OpenRouter / Anthropic / OpenAI / DeepSeek）
- [x] 代码解析 + 沙箱执行
- [x] 回放系统 + 速度控制
- [x] 内置基线机器人
- [x] 诊断报告
- [x] 多轮迭代学习系统
- [x] UI 模块化重构（main.ts 620→12 行，拆分为组件 + 标签页）
- [x] LLM Materials 标签页（完整 prompt/response/diagnostic 查看器）
- [x] Full Runs 标签页（多种子批量运行 + 统计 + 柱状图）
- [x] **多玩家基准测试**（ADD PLAYER 注册模型 → 5 轮迭代竞技 → 学习曲线对比）
- [x] 逐轮回放（轮次滑块 + 分数折线图）
- [x] 玩家管理持久化（localStorage）
- [x] **全历史迭代进化** — 每轮提供完整进化历史（分数趋势表、逐船数据、最佳+最新代码、趋势检测）
- [x] IndexedDB 排行榜持久化
- [ ] PVP 模式 + Elo 排名
- [ ] 排行榜 + 100 种子平均

## 灵感来源

基于 [Gravwell GPT](https://www.youtube.com/watch?v=bFO0uAMPx1g) 的设计理念，一个通过太空物理模拟来测试 LLM 代码能力的基准测试。

## License

MIT
