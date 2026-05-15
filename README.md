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

### 不用 API Key 体验

1. 点击 **LOAD BASELINE** 加载内置基线机器人
2. 点击 **RUN TRIAL** 运行模拟
3. 点击 **PLAY** 观看回放

### 用 LLM 生成机器人

1. 选择 Provider：
   - **OpenRouter** — 支持所有主流模型
   - **Anthropic** — 直接调用 Claude
   - **OpenAI** — 直接调用 GPT
   - **DeepSeek** — 直接调用 DeepSeek（`deepseek-chat`、`deepseek-v4-flash`、`deepseek-v4-pro` 等）
2. 填入对应的 API Key
3. 填写模型名称（如 `anthropic/claude-sonnet-4`、`deepseek-v4-flash`）
4. 点击 **GENERATE BOT** 一次性生成代码，或点击 **ITERATE** 启动多轮迭代学习
5. 点击 **RUN TRIAL** 运行
6. 点击 **PLAY** 观看 AI 驾驶飞船

### 多轮迭代学习

1. 配置好 API Key 和模型
2. 选择轮数（3 / 5 / 10 轮）
3. 点击 **ITERATE** — 引擎自动循环：生成 → 运行 → 诊断 → 改进
4. 实时查看每轮得分变化：`Round 2/5  |  34 → 67 → ...`
5. 完成后最佳代码自动加载到编辑器

## LLM 如何控制飞船

LLM 编写一个 `decide(ctx)` 函数，每个 tick 对每艘存活飞船调用一次：

```javascript
function decide(ctx) {
  // ctx.ship     — 当前飞船 {x, y, vx, vy, fuel, alive, ...}
  // ctx.zone     — 得分区域 {x, y, radius}
  // ctx.prediction — 未来 20 个 tick 的区域位置
  // ctx.suns     — 恒星数组 {x, y, mass, radius}
  // ctx.tick     — 当前 tick (0-199)

  // 返回推力矢量
  return { x: 0.3, y: -0.2 };
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
├── llm/         # LLM API 集成 + 迭代学习引擎
├── ui/          # 模块化 UI 层
│   ├── app.ts                 # AppState + App 类（tab 路由）
│   ├── tabs/                  # 标签页：Simulator / LLM Materials / Full Runs
│   └── components/            # UI 组件：API 配置 / 代码编辑器 / 迭代面板 / 回放控制
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
- [x] 多轮迭代学习系统（ITERATE 按钮 + 实时进度 + 自动加载最佳代码）
- [x] UI 模块化重构（main.ts 620→12 行，拆分为组件 + 标签页）
- [x] LLM Materials 标签页（完整 prompt/response/diagnostic 查看器）
- [x] Full Runs 标签页（多种子批量运行 + 统计 + 柱状图）
- [ ] 4 人大逃杀模式
- [ ] PVP 模式 + Elo 排名
- [ ] 排行榜 + 100 种子平均
- [ ] 数据库持久化

## 灵感来源

基于 [Gravwell GPT](https://www.youtube.com/watch?v=bFO0uAMPx1g) 的设计理念，一个通过太空物理模拟来测试 LLM 代码能力的基准测试。

## License

MIT
