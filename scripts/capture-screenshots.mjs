/**
 * Regenerate the README screenshots from the plugin's own code.
 *
 * Why a script instead of a screenshot someone once took: the pictures in
 * `assets/` are only ever as new as the code that produced them. An earlier
 * revision of this repository shipped images from the single-state version for
 * two releases after the five-phase model landed, because a PNG cannot notice
 * that `lib/client.js` changed. This script takes the stylesheet and the
 * functions **out of `lib/client.js` itself**, injects them into a page, lets
 * the plugin's real `paint()` mark a fixture sidebar, and captures the result —
 * so re-running it after an edit is the whole update procedure.
 *
 * The fixture stands in for the list contents (a sidebar's real workspaces are
 * per-installation); everything visual — bars, tints, rings, badges, the
 * subagent chip, and the promotion order — is the plugin's own CSS and logic.
 * Workspace names in the fixture are blurred, because a published screenshot is
 * not the place to name the projects on the machine it was taken from; the
 * badges, bars and tints — the things the plugin actually contributes — are
 * left sharp. Set `REDACT_WORKSPACE_NAMES = false` to capture unredacted names
 * for a private copy.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *
 * Writes `assets/screenshot-1.png` (default light theme) and
 * `assets/screenshot-2.png` (default dark theme), and prints a JSON report of
 * the computed styles so the capture can be checked without opening the images.
 *
 * Playwright is resolved from, in order: `$PLAYWRIGHT_MODULE`, the `playwright`
 * package, `playwright-core`, and the local dev-browser install. Set
 * `$CHROME_PATH` to pin a browser binary.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const outDir = join(repo, 'assets');

// ---------------------------------------------------------------- Playwright
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'playwright-core',
  'file:///C:/Users/yangx/.npm-global/node_modules/dev-browser/node_modules/playwright/index.mjs',
].filter(Boolean);

let chromium = null;
const tried = [];
for (const candidate of PW_CANDIDATES) {
  try {
    ({ chromium } = await import(candidate));
    break;
  } catch (error) {
    tried.push(`${candidate}: ${error.message.split('\n')[0]}`);
  }
}
if (chromium === null) {
  throw new Error(`找不到 playwright，试过：\n  ${tried.join('\n  ')}`);
}

const LAUNCH_CANDIDATES = [];
if (process.env.CHROME_PATH) LAUNCH_CANDIDATES.push({ headless: true, executablePath: process.env.CHROME_PATH });
LAUNCH_CANDIDATES.push({ headless: true });
const bundledChrome = 'C:/Users/yangx/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
if (existsSync(bundledChrome)) LAUNCH_CANDIDATES.push({ headless: true, executablePath: bundledChrome });

// ---------------------------------------------------------------- 抽取真实实现
const src = readFileSync(join(repo, 'lib/client.js'), 'utf8');
const css = src.match(/const CSS = `([\s\S]*?)`;/)?.[1];
if (css === undefined) throw new Error('lib/client.js 里找不到 CSS 字面量');

/** 按花括号配平，把某个具名函数的源码原样取出来。 */
const grabFn = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
};

/** 取一个对象/数组字面量的源码（正则字面量经 JSON 会被改写，所以原样插值）。 */
const grabLiteral = (name, open, close) => {
  const prefix = `const ${name} = ${open}`;
  const start = src.indexOf(prefix);
  if (start < 0) throw new Error(`missing ${name}`);
  let depth = 0;
  for (let i = start + prefix.length - 1; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) { depth -= 1; if (depth === 0) return src.slice(start + prefix.length - 1, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
};

const SELECTOR = eval(`(${grabLiteral('SELECTOR', '{', '}')})`);
const PHASE = eval(`(${grabLiteral('PHASE', '{', '}')})`);
const AGE_UNITS_SOURCE = grabLiteral('AGE_UNITS', '[', ']');
const KNOWN_STATES = src.match(/const KNOWN_STATES = new Set\((\[[^\]]*\])\)/)?.[1];
if (KNOWN_STATES === undefined) throw new Error('找不到 KNOWN_STATES');
// 所有 *_ATTR 常量原样搬运，避免手抄漂移。
const attrLines = [...src.matchAll(/const ([A-Z_]+_ATTR) = ("[^"]*");/g)]
  .map(([, name, value]) => `const ${name} = ${value};`)
  .join('\n');

/** paint() 依赖的纯函数，按依赖顺序列出。 */
const PAINT_DEPS = [
  'statusStateOf', 'ageOf', 'pendingWordOf', 'isSelected', 'subagentsOf',
  'groupOf', 'rowKey', 'assess', 'markOf', 'summarise', 'paint',
];

// ---------------------------------------------------------------- 演示场景
/*
 * DOM 顺序 = 用户自己拖出来的工作区顺序，与紧急度**相反**：图里呈现的先后
 * 只可能来自插件的 `order` 排序，而不是 fixture 的书写顺序。
 *
 * 七行覆盖全部五个注意力阶段，外加"完全没有标记"的对照行；最后一组是
 * rank 0，演示"标记但不置顶"。
 *
 * 工作区名会被模糊掉（见 REDACT_WORKSPACE_NAMES）：发布出去的截图不该把
 * 取证机器上的项目名一起发出去。会话名是通用任务描述，保持清晰。
 */
const REDACT_WORKSPACE_NAMES = true;

const GROUPS = [
  { name: '陪玩单活动专区', rows: [
    { title: '断掉的运行', dot: 'ongoing', time: '2天' },
    { title: '普通空闲会话', dot: 'idle', time: '11天' },
  ] },
  { name: 'guyi电竞', rows: [
    // 官方状态是 done（已完成未读）；下面会真实地驱动一次 done → idle 转换。
    { title: '刚看过结果的会话', dot: 'done', time: '刚刚', selected: true },
  ] },
  { name: '食品包装公司官网', rows: [
    { title: '等你审批的会话', dot: 'warning', time: '待审批' },
    { title: '发布前请我确认', dot: 'warning', time: '待审批' },
  ] },
  { name: 'Wjian 官网', rows: [
    { title: '带子智能体的运行', dot: 'ongoing', time: '2分钟', sub: '3 个子智能体运行中' },
  ] },
  { name: 'Kjian 后台', rows: [
    { title: '刚完成的会话', dot: 'done', time: '刚刚' },
  ] },
];

// ---------------------------------------------------------------- 主题 token
/*
 * 插件不定义任何颜色：它只消费当前主题的 --dsw-* 变量。下面两组是默认浅色/
 * 深色主题里被引用的那七个 token；同一份 CSS 在两组值下各跑一遍，就是
 * "主题自适应"这件事本身。
 */
const THEMES = {
  light: {
    scheme: 'light',
    tokens: {
      '--dsw-static-deepseek-450': '#5686fe',
      '--dsw-alias-state-warn-primary': '#e08a1e',
      '--dsw-alias-state-success-primary': '#12b76a',
      '--dsw-alias-state-error-primary': '#d93f3f',
      '--dsw-alias-label-primary': '#1c1f23',
      '--dsw-alias-label-tertiary': '#8b9099',
      '--dsw-alias-interactive-bg-hover': 'rgba(28,31,35,.06)',
    },
    page: '#eceef1',
    surface: '#f8f9fb',
    border: 'rgba(28,31,35,.09)',
    shadow: '0 1px 2px rgba(28,31,35,.06), 0 12px 28px -18px rgba(28,31,35,.35)',
    file: 'screenshot-1.png',
  },
  dark: {
    scheme: 'dark',
    tokens: {
      '--dsw-static-deepseek-450': '#6f8cff',
      '--dsw-alias-state-warn-primary': '#e9a23b',
      '--dsw-alias-state-success-primary': '#26c281',
      '--dsw-alias-state-error-primary': '#f2555a',
      '--dsw-alias-label-primary': '#e9ebee',
      '--dsw-alias-label-tertiary': '#8b9099',
      '--dsw-alias-interactive-bg-hover': 'rgba(255,255,255,.07)',
    },
    page: '#101113',
    surface: '#17181b',
    border: 'rgba(255,255,255,.10)',
    shadow: '0 1px 2px rgba(0,0,0,.5), 0 14px 30px -18px rgba(0,0,0,.8)',
    file: 'screenshot-2.png',
  },
};

// ---------------------------------------------------------------- fixture DOM
const ROW_INDENT = '26px';

/** 状态点：13px 空心圆，边框取该状态自己的 token —— 与官方同一套颜色语义。 */
const dotColor = (state) => (state === 'ongoing'
  ? 'var(--dsw-static-deepseek-450)'
  : state === 'warning'
    ? 'var(--dsw-alias-state-warn-primary)'
    : state === 'done'
      ? 'var(--dsw-alias-state-success-primary)'
      : 'var(--dsw-alias-label-tertiary)');

const rowHtml = (r) => `
  <div class="hIlkoa_sessionRow${r.selected ? ' hIlkoa_selected' : ''}" role="treeitem"
       aria-selected="${r.selected ? 'true' : 'false'}" data-row-key="session:${r.title}">
    <span class="hIlkoa_slot">
      <span data-state="${r.dot}" aria-hidden="true" class="hIlkoa_dot"
            style="border-color:${dotColor(r.dot)}"></span>
      ${r.sub ? `<span class="hIlkoa_visuallyHidden">${r.sub}</span>` : ''}
    </span>
    <span class="hIlkoa_title">${r.title}</span>
    <span class="hIlkoa_time">${r.time}</span>
  </div>`;

const groupHtml = (g) => `
  <div class="_9lTDKa_groupSection">
    <div class="hIlkoa_projectRow">
      <span class="hIlkoa_slot"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 3.5A1.5 1.5 0 013 2h3l1.5 2H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-8z"/></svg></span>
      <div class="hIlkoa_projectText"><span class="hIlkoa_title${REDACT_WORKSPACE_NAMES ? ' is-redacted' : ''}">${g.name}</span></div>
    </div>
    ${g.rows.map(rowHtml).join('')}
  </div>`;

/**
 * 侧栏外壳的最小子集：只有这些是插件依赖的形状 —— 工作区组、会话行、行首
 * 状态点、标题、相对时间标签，以及它读色用的 token。
 */
const shellCss = (theme) => `
:root{color-scheme:${theme.scheme};${Object.entries(theme.tokens).map(([k, v]) => `${k}:${v}`).join(';')};
--ds-ease-in-out:cubic-bezier(.4,0,.2,1);--dsw-radius-md:8px;--dsh-workspace-indent:${ROW_INDENT}}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:${theme.page};font:14px/1.5 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;
color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
#stage{display:inline-block;padding:0}
.rail{width:288px;background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;
padding:10px 6px 14px;box-shadow:${theme.shadow}}
._9lTDKa_list{padding:0 2px}
.hIlkoa_projectRow,.hIlkoa_sessionRow{border-radius:var(--dsw-radius-md);cursor:pointer;user-select:none;
color:var(--dsw-alias-label-primary);align-items:center;gap:6px;display:flex;
padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px))}
.hIlkoa_projectRow{height:34px;padding-inline-start:8px}
.hIlkoa_sessionRow{gap:0;height:32px}
.hIlkoa_sessionRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.hIlkoa_projectText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}
.hIlkoa_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13.5px;line-height:20px;overflow:hidden}
.hIlkoa_projectRow .hIlkoa_title{font-weight:600}
/*
 * 工作区名脱敏：模糊掉字，但保留它占的宽度、在行里的位置和插件染给它的
 * 颜色 —— 读者失去的是"这台机器上有哪些项目"，不是"插件做了什么"。
 */
.is-redacted{filter:blur(3.4px)}
.hIlkoa_sessionRow .hIlkoa_title{margin:0 6px 0 4px}
.hIlkoa_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;
justify-content:center;display:inline-flex}
.hIlkoa_dot{display:block;width:13px;height:13px;border-radius:50%;border:1.5px solid currentColor}
.hIlkoa_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:10.5px;line-height:16px;
font-variant-numeric:tabular-nums}
.hIlkoa_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}
._9lTDKa_groupSection{position:relative}
._9lTDKa_groupSection+._9lTDKa_groupSection{margin-top:4px}
._9lTDKa_groupSection>*+*{margin-top:2px}`;

const buildHtml = (theme) => `<!doctype html><html lang="zh-CN" data-theme="${theme.scheme}"><head>
<meta charset="utf-8">
<style>${shellCss(theme)}</style>
<style id="p">${css}</style>
<style>
/* 静态图：停掉唯一那处动效（运行中竖条的呼吸），免得截图落在随机相位上。 */
[class*="_sessionRow"][data-busy-session="running"]::before{animation:none !important;opacity:1 !important}
</style>
</head><body>
<div id="stage"><div class="rail"><div class="_9lTDKa_list">${GROUPS.map(groupHtml).join('')}</div></div></div>
<script>
const SELECTOR = ${JSON.stringify(SELECTOR)};
const PHASE = ${JSON.stringify(PHASE)};
const AGE_UNITS = ${AGE_UNITS_SOURCE};
${attrLines}
const settleWatch = new Map();
const KNOWN_STATES = new Set(${KNOWN_STATES});
const setAttr=(el,a,v)=>{ if(el.getAttribute(a)!==v) el.setAttribute(a,v); };
const dropAttr=(el,a)=>{ if(el.hasAttribute(a)) el.removeAttribute(a); };
${PAINT_DEPS.map(grabFn).join('\n')}

const settings = { pinBusyWorkspaces:true, highlightRunningSessions:true,
  highlightBusyWorkspaceHeaders:true, notifyOnCompletion:true, intensity:0.6,
  unreadHoldMinutes:480, seenHoldMinutes:15, staleRunMinutes:360 };
const memory = new Map();

// 第一遍：整张图就是"用户离开一会儿再回来"看到的样子。
paint(settings, memory);

// 再真实地重演一次"点开已完成的会话去读结果"：官方清掉 completionUnread
//（done → idle），用户的选择落在这行上 —— 也就是那个以前会消失的行。
const seenRow = [...document.querySelectorAll(SELECTOR.sessionRow)]
  .find((r)=>r.getAttribute('data-row-key')==='session:刚看过结果的会话');
seenRow.querySelector('[data-state]').setAttribute('data-state','idle');
seenRow.setAttribute('aria-selected','true');
seenRow.classList.add('hIlkoa_selected');
paint(settings, memory);

window.__report = {
  order: [...document.querySelectorAll(SELECTOR.group)].map((g)=>({
    name: g.querySelector(SELECTOR.projectRow+' '+SELECTOR.title).textContent.trim(),
    rank: g.getAttribute(RANK_ATTR),
    badge: g.querySelector(SELECTOR.projectRow).getAttribute(LABEL_ATTR),
    count: g.querySelector(SELECTOR.projectRow).getAttribute(COUNT_ATTR),
    multi: g.querySelector(SELECTOR.projectRow).getAttribute(MULTI_ATTR),
    cssOrder: getComputedStyle(g).order,
  })),
  rows: [...document.querySelectorAll(SELECTOR.sessionRow)].map((r)=>{
    const bar = getComputedStyle(r, '::before');
    return {
      title: r.querySelector(SELECTOR.title).textContent.trim(),
      mark: r.getAttribute(MARK_ATTR),
      subagents: r.getAttribute(SUBAGENT_ATTR),
      selected: r.getAttribute('aria-selected') === 'true',
      titleColor: getComputedStyle(r.querySelector(SELECTOR.title)).color,
      bar: { color: bar.backgroundColor, opacity: bar.opacity, width: bar.width },
      surface: getComputedStyle(r).backgroundColor,
      ring: getComputedStyle(r).boxShadow,
      height: Math.round(r.getBoundingClientRect().height),
    };
  }),
};
</script></body></html>`;

// ---------------------------------------------------------------- 渲染与截图
let browser = null;
const launchErrors = [];
for (const options of LAUNCH_CANDIDATES) {
  try { browser = await chromium.launch(options); break; } catch (error) { launchErrors.push(error.message.split('\n')[0]); }
}
if (browser === null) throw new Error(`浏览器启动失败：\n  ${launchErrors.join('\n  ')}`);

const report = {};
for (const [key, theme] of Object.entries(THEMES)) {
  const page = await browser.newPage({ viewport: { width: 360, height: 700 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent(buildHtml(theme), { waitUntil: 'load' });
  await page.waitForTimeout(300);
  if (errors.length > 0) throw new Error(`[${key}] 页面报错: ${errors.join(' | ')}`);
  report[key] = await page.evaluate(() => window.__report);
  const target = join(outDir, theme.file);
  await page.locator('.rail').screenshot({ path: target });
  report[key].file = target;
  await page.close();
}
await browser.close();

console.log(JSON.stringify(report, null, 2));
