# dsh-plugin-busy-workspace

**一眼看出哪个工作区正在干活。**

DeepSeek Harness（`dsh`）Web 界面插件：高亮正在工作的会话，并把有任务在跑的工作区置顶到侧栏最前。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4d6bfe.svg)](https://github.com/topics/dsh-plugin)
[![theme aware](https://img.shields.io/badge/主题-自适应-16a34a.svg)](#配色跟随主题)

---

## 解决的痛点

同时跑多个 agent 的时候，`dsh` 侧栏会变成一堵长得一模一样的墙。每个工作区标题长得一样，每条会话行长得一样，唯一能说明"有东西在跑"的信号，是一个十个像素、还灰扑扑的小圆点。

于是就出现了这些反复发生的问题：

| 现象 | 代价 |
| --- | --- |
| 看不出哪个工作区里有 agent 正在执行 | 只能逐个点开工作区确认，或者误打断一个本来跑得好好的会话 |
| 你一动别的工作区，忙碌的那个就沉到列表下面 | 你真正关心的那个，恰恰是需要滚动才能找到的 |
| 会话跑完了没有任何提示 | 你一直在等一个早就结束的任务，或者错过了查看产出的时机 |
| 状态点又小又灰、对比度低，是唯一的线索 | 退后一步、或者屏幕小一点，就完全读不出来 |

现有的主题和皮肤会把整个界面重新配色，但没有一个回答并行工作时最关键的那个问题：**现在到底哪一个在跑？**

## 插件做了什么

三处聚焦的改动，全部在侧栏内，全部基于 Harness 已经算好的状态。

### 一、忙碌的工作区自动浮到最前

只要有会话在运行，它所属的工作区就会升到列表顶部。这个位置变化**只是视觉上的**——你手动拖拽出来的工作区顺序不会被改写，所以当最后一个会话跑完，列表会安静地恢复成你排好的样子。

### 二、正在工作的会话有真正的视觉身份

运行中的会话行会获得：强调色边框、淡色底、加重的主色标题，以及左缘一条缓慢呼吸的光条。不用读任何文字，退后一步也能认出它。

### 三、会话跑完的那一刻你看得见

会话停止运行时，那一行会播一次短促的绿色收敛脉冲，然后恢复正常。任务完成时你会知道，不必一直盯着。

## 配色跟随主题

所有颜色都取自当前主题自己的 `--dsw-alias-*` 变量，没有任何硬编码色值。这意味着同一份样式表可以同时适配内置的明暗主题，以及社区主题包（Catppuccin、Nord、Dracula、Tokyo Night、Gruvbox，以及任何定义了标准变量集的主题）。

| 用途 | 取用变量 |
| --- | --- |
| 运行中强调色 | `--dsw-alias-state-business-primary`，回退到 `--dsw-alias-brand-primary` |
| 完成提示色 | `--dsw-alias-state-success-primary` |
| 行标题 | `--dsw-alias-label-primary` |
| 悬停底色 | `--dsw-alias-interactive-bg-hover` |

插件刻意选用**语义状态色**而不是品牌色。品牌变量会随主题的品牌色变化——如果你的主题品牌色是橙色，用作"正在运行"就会读成警告而不是活动。状态语义色在任何主题下都保持含义。

透明度用 `color-mix()` 与主题自身的表面色合成，所以浅色和深色背景下色块都落在正确的位置。

## 安装

```sh
# 进入你的 dsh profile 目录
cd ~/.dsh/profiles/web
pnpm add github:yangx/dsh-plugin-busy-workspace
```

然后在该 profile 的 `package.json` 里注册 bundle：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-plugin-busy-workspace"
      ]
    }
  }
}
```

重启 Web 界面并刷新页面，侧栏即生效，无需其他配置。

## 配置

配置持久化在 `$DSH_HOME/busy-workspace/settings.json`，通过 `GET /busy-workspace/api/settings` 提供。

```json
{
  "pinBusyWorkspaces": true,
  "highlightRunningSessions": true,
  "highlightBusyWorkspaceHeaders": true,
  "notifyOnCompletion": true,
  "intensity": 0.6
}
```

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `pinBusyWorkspaces` | `true` | 把含运行中会话的工作区提到列表最前 |
| `highlightRunningSessions` | `true` | 为运行中的会话行绘制强调边框、底色与呼吸光条 |
| `highlightBusyWorkspaceHeaders` | `true` | 为忙碌工作区的标题行加上底色与强调竖条 |
| `notifyOnCompletion` | `true` | 会话停止运行时播放收敛脉冲 |
| `intensity` | `0.6` | 强调强度，`0`–`1`。只缩放透明度，色相始终来自主题 |

Host 侧是可选的。只挂载客户端 bundle 的组合会使用上述默认值，这本身就是一套完整可用的配置。

## 实现原理

插件读取 Harness 已经渲染在每条会话行上的状态点的 `data-state` 属性——`ongoing`、`warning` 或 `done`。这一个属性就是官方契约，读取它带来三个值得说明的结果：

- **没有第二个事实来源。** 插件从不自己从传输层重新推导活动状态，因此不可能和你正在看的状态点出现分歧。
- **不与渲染器抢 DOM。** 所有标记都以属性加 CSS 的形式施加。React 重渲染可以随意覆盖属性，观察器会重新贴上；DOM 顺序从不改动，因此永远不会和 reconciliation 打架。
- **不产生布局位移。** 运行中的边框用内嵌 `box-shadow` 环绘制，而不是 `border`——因为边框会改变行的盒尺寸，会话一启动，下面所有行就会跟着平移两像素。

工作区提升使用 flex 列表列上的 CSS `order`。直接重排节点会和 React 冲突；而 `order` 是纯表现层提示，渲染器从不回读。

动效遵循 `prefers-reduced-motion`：要求减少动效的用户保留全部状态提示，只去掉运动本身。

## 兼容性

| | |
| --- | --- |
| Harness 版本 | DeepSeek Harness `0.1.5-rc` 及以后 |
| 作用界面 | Web 界面侧栏（`sidebar.workspaces`） |
| 主题 | 任何定义了标准 `--dsw-alias-*` 变量的主题 |
| 已知冲突 | 无。插件只占用一个样式元素和一个配置文件，不读取其他插件的状态 |

## 常见问题

**会永久改掉我的工作区顺序吗？**
不会。提升纯粹是视觉行为，你持久化的顺序从不被写入，工作一停列表就恢复成你的排列。

**什么才算"正在工作"？**
就是状态点语义里的 `ongoing`：会话的回合正在执行。等待你批准、等待计划评审、等待回答的会话显示官方的 `warning` 点，插件不去动它——那是该你出手的信号，不是忙碌信号。

**会和我的主题冲突吗？**
不会。插件不定义任何调色板，只消费你主题的变量，因此你换主题它跟着换，始终协调。

**会拖慢侧栏吗？**
标记每个动画帧合并重算一次，且只在值真正变化时才写入。观察器不会自我驱动，因为它写入的属性不在自己观察的属性列表里形成回环。

## 关键词

DeepSeek Harness · dsh 插件 · dsh plugin · cordis 插件 · DeepSeek Web 界面 · 侧栏 · 工作区列表 · 会话列表 · 运行中指示 · 忙碌工作区 · agent 活动状态 · 并行任务监控 · 会话状态点 · 活跃工作区置顶 · 工作区排序 · 主题自适应 · `--dsw-alias` 变量 · Catppuccin · Nord · Dracula · Tokyo Night · Gruvbox · 效率工具 · 开发者工具

## 许可

MIT © 2026 baifagg
