# dsh-timeline

<p align="center">
  <strong>简体中文</strong> | <a href="README.md">English</a>
</p>

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的极简**提问时间线**插件：每条提问一个圆点，挂在界面右侧。点击圆点瞬间跳转到那条提问；悬停查看你当时说了什么、什么时候说的。

![提问时间线效果](ScreenShot.png)

零配置、无 host 依赖、不查数据库——数据全部来自浏览器里已有的会话快照。

## 功能

- 🎯 **每条提问一个圆点** —— 所有用户提问在右侧细条上各有一个圆点
- ⚡ **点击跳转** —— 平滑滚动到对应消息，长对话不用再手动翻几百行
- 👁 **悬停预览** —— 显示提问序号、提问时间、前 80 字内容
- 🕐 **绝对时间** —— 今天的提问显示 `HH:MM`，昨天及更早显示 `MM/DD HH:MM`
- 🎨 **Git 提交图渐变** —— 最新最深、最早最浅，先后顺序一眼可见
- 🖱 **点击穿透** —— 时间条本身不挡对话，只有圆点响应点击
- 📦 **零足迹 host** —— node 半端是空 `apply`，服务端零开销
- 🔤 **无 i18n 负担** —— 文案仅中文，保持精简

## 安装

```sh
dsh plugin --profile web add github:zhangzheng25/dsh-timeline
```

重启 DSH，打开任意有提问的会话，右侧即出现时间线。

本地开发安装：

```sh
dsh plugin --profile web add E:\path\to\dsh-timeline   # junction 链接，改代码重建 + 重启即生效
```

## 原理

```
shell.overlay（root 作用域，附加式，点击穿透）
  └─ timeline.rail（自声明子槽，session 作用域）
       └─ useSession 快照 → chat.order + chat.nodes（kind === 'user'）
            → 圆点 → data-chat-anchor-key 行 → scrollIntoView
```

- **注入点**：全局 `shell.overlay` 席位，自声明会话级子槽 `timeline.rail`，Overlay 通过框架 `SessionProvider` 桥接到当前会话。
- **数据**：用户消息来自 `useSession` 快照（`chat.order` / `chat.nodes`），提问时间在 `data.time`（epoch 毫秒）——不读会话日志、不查数据库。
- **跳转**：每条对话行带 `data-chat-anchor-key` 属性（值即节点 key），点圆点找到该行后 `scrollIntoView`。
- **UI**：时间条 `position: fixed` + `pointer-events: none`，只有圆点参与点击，对话区完全不受影响。

## 开发

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsdown → lib/index.js（host）+ lib/client.js（浏览器）
```

构建产物（`lib/`）已提交，最终用户无需构建。改源码后：`pnpm run build`，重启 DSH（纯 client 改动刷新页面即可）。

## 技术要点

- TypeScript + [tsdown](https://github.com/rolldown/tsdown)，对齐官方 `clientBundle` 预设
- 槽位声明通过类型导入合并（`@deepseek-ai/dsh-client-ui-layout/client`、`@deepseek-ai/dsh-client-ui-conversation/client`）
- `dsh.client.inject` 声明 web loader 需要提供的运行时包
- tooltip 显式左对齐（button 的 UA 样式默认居中），并用 `width: max-content` 撑开宽度，避免绝对定位把文字挤成每字一行

## 致谢

由 [dsh-milestone](https://github.com/SnowCrescenter-tech/dsh-milestone)（SnowCrescenter-tech）大幅精简而来——只保留圆点、跳转与悬停预览三件套。

## 许可

MIT
