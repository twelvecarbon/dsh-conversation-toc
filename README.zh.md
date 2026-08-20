<div align="center">

# dsh-conversation-toc

**简体中文** | [English](./README.md)

[GitHub](https://github.com/twelvecarbon/dsh-conversation-toc) · [npm](https://www.npmjs.com/package/dsh-conversation-toc) · MIT License

**DeepSeek Harness 对话大纲插件** —— 在会话页右侧显示对话主题目录（类似 DeepSeek 网页版右边栏），随滚动高亮当前主题，点击即可快捷跳转到对应消息位置。

![npm](https://img.shields.io/npm/v/dsh-conversation-toc)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933)
![Platform](https://img.shields.io/badge/platform-web-4d9fff)

</div>

---

## 简介

dsh-conversation-toc 是面向 **DeepSeek Harness Web** 的**纯浏览器端**插件。安装后，会话标题栏右侧会出现 **「大纲」** 按钮，聊天区右侧会悬浮一个**对话主题面板**（空间不足时自动折叠为**胶囊指示条**），体验与 DeepSeek 网页版右边栏一致：

- **主题列表** —— 用户提问为一级主题，`steering` 追问为缩进的二级主题，助手回答中的 `##` / `###` 小标题为三级主题，长回答也能直接跳到某个小节；
- **滚动高亮（scroll-spy）** —— 随会话滚动自动定位当前阅读位置；
- **快捷跳转** —— 点击任意主题，平滑滚动到对应消息；
- **折叠胶囊条（minimap）** —— 空间不足或手动折叠时只保留右侧胶囊指示条，点击胶囊跳转、悬停预览主题文字。

> 支持 **Windows / macOS / Linux** —— 全部逻辑运行在浏览器端：无宿主服务、无设置页、无平台相关代码。

## 界面预览

### 展开的主题面板
![展开的主题面板](./docs/assets/toc-panel.png)

### 折叠的胶囊指示条
![折叠的胶囊指示条](./docs/assets/toc-rail.png)

## 功能亮点

- **三种显示形态**，由顶栏「大纲」按钮循环切换：`展开面板 → 胶囊条 → 隐藏`，选择记忆在 `localStorage`。
- **层级主题**：用户提问（一级）→ steering 追问（二级，缩进）→ 助手回答小标题 `##` / `###`（三级）。
- **滚动高亮**：对照真实聊天滚动容器跟踪当前阅读位置并蓝色高亮；滚到底部时高亮最后一个主题。
- **快捷跳转**：复用核心的 `[data-chat-anchor-key]` 锚点与 `[data-conversation-scroll]` 滚动容器，不依赖任何私有样式类，兼容 DSH 后续更新。
- **自适应布局**：展开面板悬浮在消息列右侧留白处；留白不足自动降级为胶囊条；不会压住右侧的「详情」面板。
- **主题适配**：使用 DSH 主题 token，自动跟随深色 / 浅色主题；字号随应用「显示大小」设置缩放。
- **实时更新**：主题直接来自会话 store（`chat.order` / `chat.nodes`），新消息与流式输出自动反映到大纲。
- **安全无副作用**：不调用宿主 API、不写磁盘——唯一持久化状态是 `localStorage` 里的显示形态偏好。

## 推荐安装方式

> 两种方式任选其一，效果等价。**推荐一行命令安装。**

### 方式一（推荐）：一行命令

包尚未发布到 npm，请从**本 GitHub 仓库**或**本地 tarball** 安装：

```bash
# 从 GitHub（推送本仓库后）
dsh plugin --profile web add git+https://github.com/twelvecarbon/dsh-conversation-toc.git

# 或从本地 tarball
dsh plugin --profile web add C:\path\to\dsh-conversation-toc-0.1.0.tgz
```

安装后重启 dsh web 服务即可生效。

### 方式二：手动安装

详细的手动安装 / 接线 / 卸载说明见下文。

---

## 这个包是什么

一个 npm 包 = **宿主半**（一个空的 Cordis 插件行，`lib/index.js`，功能完全在浏览器端）+ **客户端半**（大纲界面，`lib/client.js`）。

包通过两处声明接入 DSH：

| 声明 | 作用 |
| --- | --- |
| `dsh.bundle.patch`（`cordis.patch.yml`） | 让 DSH 把它识别为**标准 bundle 插件包**：`dsh plugin --profile <名称> add <包名>` 一条命令即可安装并自动接线，无需手改任何配置文件 |
| `dsh.client` + `exports["./client"]` | 让 web 客户端在 `/plugins/<包名>/client.js` 自动加载大纲界面 |

所以对使用者来说，**安装就是一条命令**——不用碰 YAML、不用手动复制文件。

## 安装（给使用者）

### 0. 前提条件

- 已安装 DeepSeek Harness（`npm install -g @deepseek-ai/dsh` 全局安装，或使用基于它的桌面应用 / `npx @deepseek-ai/dsh web`）。
- 方式一需要 **pnpm**：`npm install -g pnpm`（或 `corepack enable`）。
- 确保 `dsh` 命令在 PATH 里。

### 1. 方法 A（推荐）：一条命令安装

```bash
dsh plugin --profile web add git+https://github.com/twelvecarbon/dsh-conversation-toc.git
```

这条命令会做三件事（全部自动）：

1. 在 `~/.dsh/profiles/web` 里通过 pnpm 安装本包（首次使用会自动初始化该 profile）；
2. 检测到包的 `dsh.bundle` 声明，自动把包名写进 profile 的 `dsh.profile.bundles` 层列表；
3. 重启后，DSH 启动时会自动读取包内的 `cordis.patch.yml`，把插件行挂进应用树——**不需要**手动编辑任何配置文件。

其它 profile 同理，把 `web` 换成你的 profile 名即可（如 `dsh plugin --profile headless add ...`；`dsh web` 等价于 `dsh --profile web`）。

> 想用本地 tarball 测试：`dsh plugin --profile web add C:\path\to\dsh-conversation-toc-0.1.0.tgz`

### 2. 方法 B：手动安装（不使用 pnpm / 无 `dsh plugin`）

**B1. 安装依赖：**

```bash
cd ~/.dsh/profiles/web
pnpm add git+https://github.com/twelvecarbon/dsh-conversation-toc.git
# 或从本地目录 / tarball 安装
# pnpm add C:\path\to\dsh-conversation-toc
```

**B2. 接线（一次性，可重复执行）：** 在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 中追加包名：

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-conversation-toc"
    ]
  }
}
```

**B3. 挂载插件行：** 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加（文件不存在则创建）：

```yaml
- insert:
    - id: conversation-toc
      name: 'dsh-conversation-toc'
```

**B4. 重启 dsh web 服务。**

### 3. 卸载

```bash
dsh plugin --profile web remove dsh-conversation-toc
```

或手动：移除依赖、`dsh.profile.bundles` 中的包名、`cordis.patch.yml` 中的插件行，然后重启。

## 使用说明

1. 打开任意会话，发送 / 查看消息；
2. 会话标题栏右侧出现 **「大纲」** 按钮；
3. 聊天区右侧浮出大纲面板：点击任意主题即可跳转到对应消息；滚动会话时当前主题自动蓝色高亮；
4. 空间不足时面板自动折叠为胶囊条；点「大纲」按钮可在三种形态间循环切换（展开 → 胶囊条 → 隐藏）。

## 工作原理

- **数据来源** —— 浏览器端读取会话 store（`useSession` 选择器取 `chat.order` / `chat.nodes`），新消息与流式输出自动反映到大纲；
- **DOM 锚点** —— 复用核心的 `[data-chat-anchor-key]` 锚点与 `[data-conversation-scroll]` 滚动容器，不依赖私有样式类；
- **宿主侧** —— 无需任何操作：`lib/index.js` 只是空的宿主行，作用是让包以标准 bundle 插件挂载、客户端 bundle 被 web boot 图发现加载。

## 文件结构

```
dsh-conversation-toc/
├── package.json                # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml            # 宿主插件行（挂载层）
├── lib/
│   ├── index.js                # 宿主半（空实现，无宿主服务）
│   └── client.js               # 客户端半（完整功能）
├── scripts/
│   ├── check-package.js        # 发布前契约校验（npm run check）
│   ├── smoke-test.cjs          # 纯逻辑冒烟测试（npm run test）
│   └── generate-screenshots.ps1  # 重新生成 docs/assets 示意图（Windows）
├── docs/assets/                # README 截图
├── CHANGELOG.md
├── LICENSE
├── README.md                   # English
└── README.zh.md                # 简体中文
```

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## License

[MIT](./LICENSE)
