# DeepSeek Harness 版本支持说明

本插件能在哪些 DeepSeek Harness（`dsh`）版本上运行、Harness 自己是怎么判断这件事的、插件真正依赖的是什么，以及遇到未列出的版本线时该怎么办。

English: [COMPATIBILITY.md](COMPATIBILITY.md)

---

## 一、声明的版本范围

`package.json` 里写了两处，因为有两个不同的读取方。两处的内容完全一致：

```jsonc
{
  "dsh": {
    "engines": {
      // dsh-market 市场前端读这里，并和下面的 peer 一起做联合判断。
      "dsh": ">=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.2.1-0 || >=0.2.1-alpha.1 <0.3.0-0"
    }
  },
  "peerDependencies": {
    // Harness 自己在导入插件之前读这里。
    "@deepseek-ai/dsh": ">=0.1.5-rc.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.2.1-0 || >=0.2.1-alpha.1 <0.3.0-0"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh": { "optional": true }
  }
}
```

直白地说：**0.1.5-rc.1 及以后，直到 0.3.0 之前**。0.1.0–0.1.4 是刻意排除的，第四节列出的那些契约在 0.1.5 这条线之前并不齐全。

### 为什么写成 `||` 分支，而不是一句 `>= … < …`

因为在普通 semver 语义下，一个预发布版本要落在某个范围里，范围中必须有**某个**比较符与它 `major.minor.patch` 完全相同、且自己带预发布标签。于是这样一句看起来没问题的范围——

```
>=0.1.5-rc.1 <0.3.0-0        // ❌ 排除 0.1.6-*、0.1.7-*、0.2.*-*
```

——对 `0.1.7-rc.2` 在普通 semver 求值器（也就是 pnpm 面对 registry 包时用的那个）下会返回 `false`，而 Harness 自己的检查却放行。一条发布线一个分支、每个分支自带预发布标签，两个求值器才会给出一致的答案：

| 运行时版本 | Harness 闸门¹ | 市场前端² | 普通 semver³ |
| --- | --- | --- | --- |
| `0.1.4-rc.1` | 不兼容 | 不兼容 | `false` |
| `0.1.5-alpha.2` | 不兼容 | 不兼容 | `false` |
| `0.1.5-rc.1` | 兼容 | 兼容 | `true` |
| `0.1.5-rc.3` | 兼容 | 兼容 | `true` |
| `0.1.6-alpha.1` | 兼容 | 兼容 | `true` |
| `0.1.7-alpha.2` | 兼容 | 兼容 | `true` |
| `0.1.7-rc.1` | 兼容 | 兼容 | `true` |
| `0.1.7-rc.2` | 兼容 | 兼容 | `true` |
| `0.2.0-rc.1` | 兼容 | 兼容 | `true` |
| `0.2.0-rc.2` | 兼容 | 兼容 | `true` |
| `0.2.1-alpha.1` | 兼容 | 兼容 | `true` |
| `0.2.1-alpha.2` | 兼容 | 兼容 | `true` |
| `0.3.0-rc.1` | 不兼容 | 不兼容 | `false` |

¹ 调用 `@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility()`，豁免表传空，运行时版本取第一列。
² 调用 `dshmarket/lib/discovery-compatibility.js` 的 `deriveHostCompatibility()`，传入解析出的 manifest 事实和含 `@deepseek-ai/dsh` 的宿主包集合。
³ `semver.satisfies(version, range)`，默认选项——也就是 pnpm 对 registry 安装求的那个值。

¹ 与 ³ 仍可能分歧的一种情况：已列出的次版本线里**将来**新增的补丁线（比如假想的 `0.2.2-rc.1`）。Harness 会放行，普通 semver 不会，因为还没有任何比较符带上那个三元组。决定插件能否加载的是 Harness 的判定；普通 semver 的判定最坏只是在 registry 安装时打印一条 peer 警告。

## 二、已发布的版本

`@deepseek-ai/dsh` 到目前为止**没有发布过任何稳定版**，31 个版本全部带预发布标签。2026-10-11 实测的 dist-tags：`latest` 与 `next` 都指向 `0.2.0-rc.2`，`alpha` 指向 `0.2.1-alpha.2`。

| 发布日期 | 版本 | | 发布日期 | 版本 |
| --- | --- | --- | --- | --- |
| 2026-08-10 | `0.0.1-rc.1` | | 2026-09-10 | `0.1.5-rc.1` |
| 2026-08-11 | `0.0.1-rc.2` | | 2026-09-10 | `0.1.5-rc.2` |
| 2026-08-12 | `0.0.1-rc.5` | | 2026-09-15 | `0.1.6-alpha.1` |
| 2026-08-13 | `0.1.0-rc.2` | | 2026-09-17 | `0.1.6-alpha.2` |
| 2026-08-13 | `0.1.0-rc.3` | | 2026-09-22 | `0.1.5-rc.3` |
| 2026-08-13 | `0.1.0-rc.6` | | 2026-09-22 | `0.1.7-alpha.1` |
| 2026-08-17 | `0.1.0-rc.7` | | 2026-09-22 | `0.1.7-alpha.2` |
| 2026-08-19 | `0.1.0-rc.8` | | 2026-09-23 | `0.1.7-rc.1` |
| 2026-08-21 | `0.1.1-rc.1` | | 2026-09-24 | `0.1.7-rc.2` |
| 2026-08-21 | `0.1.1-rc.2` | | 2026-09-28 | `0.2.0-rc.1` |
| 2026-08-30 | `0.1.2-alpha.2` | | 2026-09-29 | `0.2.0-rc.2` |
| 2026-08-31 | `0.1.2-alpha.3` | | 2026-10-03 | `0.2.1-alpha.1` |
| 2026-09-01 | `0.1.2-alpha.4` | | 2026-10-09 | `0.2.1-alpha.2` |
| 2026-09-02 | `0.1.2-alpha.5` | | | |
| 2026-09-03 | `0.1.2-rc.1` | | | |
| 2026-09-07 | `0.1.3-alpha.2` | | | |
| 2026-09-08 | `0.1.5-alpha.1` | | | |
| 2026-09-09 | `0.1.5-alpha.2` | | | |

（共 31 个版本；数据源：`@deepseek-ai/dsh` 的 npm packument。）

看这张表之前，有四件事值得知道：

- **没有稳定版。** 31 个版本全带预发布标签，这也是第一节那串 `||` 分支的根源：不带预发布比较符的范围连一个版本都匹配不到——连 `*` 都是空集。
- **`0.1.4` 从未发布**，`0.1.3` 只有 alpha。版本号不等于发布的次数。
- **发布日期顺序不等于版本顺序。** `0.1.5-rc.3` 发布于 2026-09-22，比 `0.1.6-alpha.2`（09-17）还晚五天，属于回填。别把"最后发布"当成"最新版本"。
- **插件面对的那个版本号是正在运行的 `@deepseek-ai/dsh-app-boot`**，不是任何 `@deepseek-ai/dsh-client-ui-*` 子包。那些子包有自己的、而且常常陈旧的 npm dist-tag——`@deepseek-ai/dsh-client-ui-workspace` 的 `latest` 至今还是 `0.0.1-rc.1`，而当前线只在 `next` 上——所以客户端子包绝不能用 `*` 或 `latest` 去钉。

Harness 从 **`0.1.7-rc.1`** 起才真正**强制**校验 peer 声明：实现该校验的包在 `0.1.5-rc.3` 与 `0.1.6-alpha.2` 里完全搜不到 `evaluatePluginCompatibility`，从 `0.1.7-rc.1` 开始才有。在这条线之前，声明的范围只是意向，不是闸门——给它什么它就加载什么。

## 三、Harness 是怎么判断的

DeepSeek Harness 自己会给插件设闸。机制在 `@deepseek-ai/dsh-app-boot` 里，具体是：

- **比什么。** `peerDependencies` 里名字为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的每一项。没声明这类 peer 的插件**完全不被检查**——"缺少 DSH peer 不构成约束"——这也正是很多插件在从未适配过的 Harness 上照样静默加载的原因。声明一个 peer，才是把愿望变成检查。
- **跟什么比。** `getDshRuntimeVersion()`，即正在运行的 `@deepseek-ai/dsh-app-boot` 包的版本。整个进程只有一个运行时版本，不是每个包各算各的。
- **用什么语义。** `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`。预发布版本参与范围匹配；空范围或非法范围算**不兼容**。
- **`engines.dsh` 不被 Harness 读取。** Harness 只看 peer 声明。（`dsh-market` 的市场前端会读 `engines.dsh`——顶层字段和 `dsh.engines.dsh` 都读——并把找到的所有声明按"与"合并。所以这里两处填的是同一个范围，而不是留一个日后各自漂移。）
- **拒绝时的表现。** 该 bundle 会像"读不出来"一样被跳过，并记进 profile 的 `skippedBundles`；启动器会打印包名、版本与风险。你的 profile 不会被改写。
- **留的口子。** 可以把某个确切的 `包@版本` 针对某个确切的运行时版本放行，记录在 profile 的 `compatibility.json`：

  ```sh
  dsh plugin --profile web allow-version dsh-plugin-busy-workspace@1.1.0 \
    --dsh-version 0.2.0-rc.2 --accept-risk
  dsh plugin --profile web version-exemptions   # 查看已放行的记录
  ```

  放行不会随插件升级或 Harness 升级继承，保存前 DSH 会警告：不兼容的插件可能导致崩溃或数据损坏。本插件是只读加装饰的观察者（见第六节），所以在未列出的版本线上，现实中的失败形态是"标记不再出现"——但 Harness 无从知道这一点，把警告作为默认是正确的。

## 四、插件实际依赖的东西

下面每一条都是与 Harness 之间的契约。任何一条变了，对应功能会退化成"不画标记"，而不是抛错——这里没有任何一处会改动会话数据、会话顺序，或别的插件的节点。

| 契约 | 用途 | 敏感度 |
| --- | --- | --- |
| 会话行状态点上的 `data-state`，取值 `warning` / `ongoing` / `done` / `idle` | 整个注意力模型 | **高**——名字变了就什么都不标。查找还要求该原语自身的 `aria-hidden="true"`，并把取值限制在上面四个，所以同一格子里别的插件塞进来的 `data-state` 不会被误读 |
| `[class*="_sessionRow"]`、`[class*="_groupSection"]`、`[class*="_projectRow"]`、`[class*="_title"]`、`[class*="_slot"]`、`[class*="_visuallyHidden"]`、`[class*="_time"]` | 定位行、分组与标签 | **高**——按构建期哈希类名的稳定后缀匹配，两边任一侧改名都会失配 |
| 会话行上的 `aria-selected` | 判断"你正在读这一行"，这是 `seen` 阶段仍被置顶的依据 | 中——没有它，`seen` 行会退化为按 `seenHoldMinutes` 计时，而不是"只要你停在上面就一直在" |
| 工作区标题行上的 `data-row-key="workspace:<id>"` | 工作区"记住的阶段"存在哪个键下 | 中——没有它就不保留组级记忆，被收起行的那些工作区只能报告仍在屏上的行 |
| `data-row-key^="overflow:"` 及它自身的 `aria-expanded` | 判断某个工作区的列表正在藏行，据此把文件夹行抬到会话行同级、并让记忆里的阶段顶上来 | 低——没有它文件夹行仍是"摘要"，被收起的完成在行离屏后不再被报出 |
| 工作区标题行自身的 `aria-expanded` | 折叠的子工作区树，此时文件夹行是屏上唯一的东西 | 低——没有它，折叠的树沿用普通文件夹行权重 |
| 行内作为直接子节点的相对时间标签，按已发布语言 | 所有按时间做的判断（`unreadHoldMinutes`、`seenHoldMinutes`、`staleRunMinutes`） | 中——标签解析不出来时，时间判定退化为"没有时间"，于是 `warning` 与 `unread` 继续置顶，且永远不会凭空判出 `interrupted` |
| 行首单元格里的隐藏状态标签（`子智能体` / `subagent(s)`、`待审批` / `Approval` 等） | 子智能体计数 chip 与工作区徽标的措辞 | 低——读不到就不画 chip、不写那个词 |
| `window.__ModuleLoader__.load({ id, factory })` + `dsh.client.platform: "web"` | 客户端半边能否加载 | **高**——这是官方客户端 bundle 契约；它变了，bundle 根本不会执行 |
| `ctx.get("webServer").route(path, handler)` | 提供 `GET/POST /busy-workspace/api/settings` | 低——这条路由本来就是可选的；没有它，客户端半边用自己的默认值 |
| `--dsw-alias-*` / `--dsw-static-*` 主题变量 | 全部颜色，且每一项都带字面量兜底 | 低——变量更少的主题靠兜底仍然可读 |

除此之外没有别的假设：不用 React 组件、不用 store、不用任何内部模块、不写完整类名，也不依赖列表容器的任何 ARIA 角色。（早先的版本把作用域写成 `[class*="_list"][role="tree"]`，而官方侧栏并不渲染 `role="tree"`，于是置顶与表头着色从未生效。现在列表容器是结构化拿到的——分组的父元素。）

### 这些契约来自哪里、从什么时候开始有

- 状态点来自 `@deepseek-ai/dsh-client-ui-primitives` 的 `StateDot`，它的 `data-state` 属性从 `0.1.5-rc.1` 起就存在（解开该版本 tarball 后，在 4 个文件里找到该属性）。
- 状态点占据的那个 16px 格子，也可能被别的插件通过 `sidebar.session.row.leading` 座位占用。该座位首次出现于 `@deepseek-ai/dsh-client-ui-workspace@0.1.7-rc.2`（在 `0.1.5-rc.1` 与 `0.1.7-rc.1` 里都不存在）；座位自己的文档写明：只有行的主状态为 `idle` 时才挂载，因此占用者永远不会和状态点并排渲染。**本插件不占用该座位**——它没有任何座位注册，只有一个 `MutationObserver`——只是读那个点。座位的出现是"邻居改了那个格子"，不是本插件的依赖。
- 表里那七个主题变量定义在 `@deepseek-ai/dsh-client-ui-theme` 的设计平台上，在 `0.1.5-rc.1` 里也全部存在。用的时候一律带字面量兜底。

## 五、各版本线的验证状态

下面说的"支持"是声明范围的结论；各条线之间真正的差别在于跑过多少东西。

| Harness 版本线 | 是否声明 | 验证方式 |
| --- | --- | --- |
| `0.0.1` – `0.1.4` | 排除 | ——（范围刻意从更晚开始） |
| `0.1.5-alpha.1`、`0.1.5-alpha.2` | 排除 | ——（早于 `rc.1`） |
| `0.1.5-rc.1` – `0.1.5-rc.3` | 支持 | 契约核查（`0.1.5-rc.1` 里状态点与主题变量已存在）+ 离线契约测试；也是 1.0.0 当初对着写的版本线，1.1.0 未在这条线上实跑。这条线上还没有 Harness 侧闸门 |
| `0.1.6-alpha.1`、`0.1.6-alpha.2` | 支持 | 契约核查 + 离线契约测试；这条线上同样还没有闸门 |
| `0.1.7-alpha.1`、`0.1.7-alpha.2` | 支持 | 契约核查 + 离线契约测试；这条线也还没有闸门 |
| `0.1.7-rc.1` | 支持 | 闸门检查 + 离线契约测试。**peer 强校验从这一版开始** |
| `0.1.7-rc.2` | 支持 | 闸门检查 + 离线契约测试；`sidebar.session.row.leading` 座位从这一版出现，但它只改变 **idle** 行的行首格子 |
| `0.2.0-rc.1`、`0.2.0-rc.2` | 支持 | **端到端**：1.1.0 已在 `0.2.0-rc.2` 的真实 Web GUI 中加载并观察，两个半边与本仓库逐字节一致 |
| `0.2.1-alpha.1`、`0.2.1-alpha.2` | 支持 | 闸门检查 + 离线契约测试 |
| `0.3.0` 及以后 | 不声明 | Harness 会拒绝该 bundle，并打印 `allow-version` 命令 |

四种证据等级，如实说明：

- **端到端**：插件被真实运行的 Harness 加载，并且能在真实会话行上看到标记。只有这一级能证明第四节的 DOM 契约仍然对得上，目前覆盖 `0.2.0-rc.2`。
- **闸门检查**：用 Harness 自己的 `evaluatePluginCompatibility()` 在该运行时版本上求值，所以能确定这个版本会被**加载**而不是被拒绝。它对 DOM 一无所知。
- **契约核查**：把第四节点名的官方包在该版本上解开，直接查那个属性、变量或座位在不在。它证明契约存在，但不证明本插件在那个版本上渲染正确。
- **离线契约测试**：`npm test`，59 项。把插件自己的函数从 `lib/client.js` 里按括号配对提出来，喂给可变的合成行，再加一遍真实 DOM 的绘制。不需要 Harness、不需要浏览器，抓的是模型层面的回归，抓不到 Harness 内部的改名。

### 复现闸门检查

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
const boot = await import("@deepseek-ai/dsh-app-boot");
const manifest = JSON.parse(readFileSync("./package.json", "utf8"));
for (const v of ["0.1.4-rc.1", "0.1.5-rc.1", "0.1.7-rc.2", "0.2.0-rc.2", "0.3.0-rc.1"]) {
  const refused = boot.evaluatePluginCompatibility(manifest, {}, v);
  console.log(v, refused === undefined ? "compatible" : "REFUSED " + JSON.stringify(refused.peers));
}'
```

## 六、跑在未列出的版本线上会怎样

按构造来说，不会有灾难性后果：

- 客户端半边就是一个 `MutationObserver` 加一个注入的 `<style>`。它只在已有节点上写自己的 `data-busy-*` 属性，从不增删或重排 DOM 节点——置顶用的是 CSS `order`，因此永远不会和渲染器自己的协调逻辑打架。
- 单次绘制失败会被就地捕获（`a paint failure is contained`），配置请求也允许失败（`a settings fetch failure cannot break the host UI`）。这两条由测试断言，而不是靠文字声明。
- Host 半边只管一个 JSON 文件加一条可选路由。它不读会话状态，也不碰别的插件的存储。
- 如果侧栏压根没渲染——比如一个不带 Web 界面的组合——观察者没有东西可看，插件处于惰性状态。

所以，遇到一个不认识的 Harness，预期中的失败形态是**安静**：侧栏看起来和原生一样。这也正是要把范围声明出来、而不是留空的原因：未列出的版本线会被响亮地拒绝，并给出一条让你可以自行决定的命令；而不是一个继续加载、却什么都不做的插件。

如果你确实跑在未列出的版本线上，并希望被收录，有用的报告包含：

1. `dsh --version`（或桌面端版本），以及 profile 的 `skippedBundles` 里是否有它；
2. 会话行上是否还有带 `data-state` 的状态点，以及出现了哪些取值——官方四个是 `warning`、`ongoing`、`done`、`idle`；
3. 侧栏的分组与行元素是否仍以 `_groupSection`、`_projectRow`、`_sessionRow` 结尾；
4. 行的相对时间标签是否仍是该行的直接子节点。

## 七、新增一条版本线

对于新的一条 `0.X.Y-<tag>`：

1. 在 `package.json` 的两处范围里各追加一个分支：新增次版本/补丁线用 `|| >=0.X.Y-alpha.1 <0.X.(Y+1)-0`——分支自己必须带预发布标签，否则普通 semver 在那个三元组上什么都匹配不到。
2. 对新版本和原来的上界各跑一遍闸门检查（第五节）。
3. 跑 `npm test`；能的话在那条线上用真实 GUI 加载一次，并到第五节的表里记下你到了哪一级证据。
4. 在 `CHANGELOG.md` 的 `### Compatibility` 下记一笔。

抬高下界或删掉一条线，对落在下面的人来说都是破坏性变更，需要给本插件升主版本号。
