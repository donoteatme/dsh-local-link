# dsh-local-link

[English](README.md) | **中文**

[![CI](https://github.com/donoteatme/dsh-local-link/actions/workflows/ci.yml/badge.svg)](https://github.com/donoteatme/dsh-local-link/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-local-link.svg)](https://www.npmjs.com/package/dsh-local-link)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

在可信私有网络中，通过手机、平板或另一台电脑使用同一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 会话。`dsh-local-link` 为原生 DSH 客户端增加一次性二维码配对和响应式移动视图；它不使用托管中继、云账户、原生应用、替代聊天界面或第二套工作区选择器。

打开 `Local access` 并扫描二维码后，已配对的浏览器会进入桌面端当前选中的 Harness 会话，并继续使用相同的实时对话、权限、工作区和插件界面。

`1.2.x` 系列支持 DeepSeek Harness `0.1.5-rc.2`，并让原生 Web 客户端可以在窄屏触控设备上使用。移动视图只调整界面布局，不接管 Harness 的会话、权限或业务逻辑。

> **安全边界：** 网关使用明文 HTTP，仅适用于可信私有网络。不要将端口暴露到互联网，也不要在公共 Wi-Fi 上使用。

<p align="center">
  <img src="docs/images/local-access-qr.jpg" width="960" alt="DeepSeek Harness 中的 dsh-local-link 一次性二维码配对界面">
</p>

<p align="center"><sub>通过可信局域网直接打开同一个 Harness 会话。</sub></p>

## 产品范围

Local Link 是现有 Harness Web 客户端的小型局域网配套插件，不是通用远程访问平台。它专注于一条可靠路径：在同一私有网络中的另一台设备上打开电脑中已经运行的 Harness，并继续使用相同的会话和界面。

项目重点包括：

- 可靠访问当前 Harness Host；
- 短时一次性邀请和清晰的已配对设备生命周期；
- 在不复制 Harness 业务逻辑的前提下提供响应式布局；
- 兼容已注册的视图、插槽、权限、主题和会话状态；
- 在可信局域网范围内完善无障碍、本地化、诊断和安全加固。

以下内容明确不在范围内：

- 公网暴露、托管中继、托管隧道或云账户；
- 独立的手机或桌面原生应用；
- 替代聊天客户端或 Harness 界面分支；
- 独立于 Harness 的工作区、文件或会话同步；
- 与当前 Web UI 无关的通用远程扩展运行时。

## 安装

### npm（推荐）

停止正在运行的 `dsh web`，将插件安装到 Web profile，然后重新启动 Harness：

```shell
dsh plugin --profile web add dsh-local-link
dsh web
```

### Git checkout（开发）

需要 Git、Node.js 22.19+ 或 24+、Corepack，以及全局安装的、版本已验证的 `dsh`。

```shell
git clone https://github.com/donoteatme/dsh-local-link.git
cd dsh-local-link
corepack pnpm install --frozen-lockfile
npm run verify
dsh plugin --profile web add .
dsh web
```

profile 会指向当前 checkout。修改客户端代码后需要重新构建；修改 Host 侧代码后需要重启 `dsh web`。

## 兼容性

兼容性按 DeepSeek Harness 的精确版本验证，不会因为“能够安装”就推断为兼容。

| DeepSeek Harness | Local Link 状态 |
| --- | --- |
| `0.1.5-rc.2` | **支持的发布版本** |
| `0.1.5-rc.1` | **已验证** |
| `0.1.2-rc.1` | **已验证** |
| `0.1.1-rc.2` | **已验证** |
| `0.1.1-rc.1` | **已验证** |
| `0.1.0-rc.8` | **已验证** |

以上六个版本都使用打包后的 `1.1.1` 源码通过了已安装运行时的网关和撤销测试。对于 `1.2.0`，当前发布版本 `0.1.5-rc.2` 还使用精确依赖重新构建，并在真实浏览器客户端中完成了 `430 × 932` 与 `320 × 568` 检查。历史 RC 的验证证据继续保留；移动的 `next` 标签本身不代表兼容性承诺。

只有表格中的精确版本包含兼容性承诺。已移除的 alpha 版本、早于 `0.1.0-rc.8` 的版本，以及未来移动的 `next` 标签都必须单独验证。完整证据与边界见[兼容性说明](docs/COMPATIBILITY.md)。

## 使用方法

1. 在电脑上打开需要使用的会话。
2. 点击 Harness 侧边栏底部的 `Local access`。
3. 在同一网络的另一台设备上扫描二维码或打开一次性链接。
4. 第一个使用邀请的浏览器会打开原生 Harness 客户端并进入当前会话。

邀请只能使用一次，默认五分钟后过期。选择 `Generate another code` 会立即替换旧邀请。Harness 仅允许 loopback 执行的 Host 管理操作在远程浏览器中仍然不可用。

宽度不超过 834 CSS px 的手机和平板会自动启用移动视图。不需要 URL 参数、User-Agent 开关或第二套客户端。

## 移动视图

移动视图会重新组织原生 Harness Web 界面，但保留同一个 Host、会话、插件插槽、权限和实时智能体输出。

- 工作区和会话导航变成可关闭的左侧抽屉；
- 当前会话的上下文、模型、权限、预设、活动和日志下载进入右侧抽屉；
- Chat、Trajectory、输入区、覆盖层和第三方插件视图保持动态加载；
- 会话和工作区操作在触控屏上保持可见；
- 切换会话不会自动唤起软键盘，主动点击输入区仍会正常聚焦；
- 深色/浅色主题继续由 Harness 主题服务管理；
- 远程手机上隐藏容易误导的 `Add workspace` 目录选择器；
- 顶栏、消息操作、输入工具、安全区域和虚拟键盘行为适配窄屏。

以下深色主题截图来自真实的 Harness 浏览器会话，使用 `430 × 932` 模拟视口。独立截图配置只包含虚构的产品演示数据，不包含本地工作区、对话、路径、提示词、模型或用量数据。

| 导航 | 当前会话 | 子智能体 | 对话 |
| :---: | :---: | :---: | :---: |
| <img src="docs/images/mobile-navigation.png" width="210" alt="包含虚构工作区与会话的深色移动导航抽屉"> | <img src="docs/images/mobile-session-info.png" width="210" alt="包含虚构模型、工作区权限、统计和会话日志数据的深色当前会话抽屉"> | <img src="docs/images/mobile-subagents.png" width="210" alt="包含两个虚构子智能体的深色底部面板"> | <img src="docs/images/mobile-chat.png" width="210" alt="包含原生消息操作和单行输入工具的深色 Harness 移动对话"> |

### 权限

远程浏览器继承当前 Harness 会话的 **Read only**、**Workspace write** 或 **Full access** 权限。移动视图只显示该值，不会创建或削弱权限边界。隐藏 `Add workspace` 是可用性限制，不是安全边界。

响应式增强支持 **360 到 834 CSS px**。发布矩阵检查 `360 × 800`、`390 × 844`、`430 × 932` 和 `768 × 1024`，并要求在真实手机上完成横屏与竖屏验收。详见[移动视图说明](docs/MOBILE_VIEW.md)。

## 管理可信浏览器

在 Harness 电脑上打开二维码面板中的 `Paired devices`，或进入 `Settings → Local access`。

- `Rename` 只修改显示名称；
- `Revoke` 会使浏览器凭据失效，并立即关闭该设备当前打开的 Local Link WebSocket；
- 清除 Cookie、使用无痕窗口、新建浏览器 profile 或撤销设备后，都需要重新配对。

浏览器无法可靠区分笔记本与台式机，因此两者统一显示为 `Computer`。

<p align="center">
  <img src="docs/images/local-access-devices.jpg" width="960" alt="DeepSeek Harness Local access 已配对设备列表">
</p>

## 工作原理

```text
电脑浏览器 127.0.0.1:3080
  └─ Local access → 一次性邀请
                         │
同一私有网络中的手机 / 平板 / 电脑
  └─ 192.168.x.x:3088 → 网络与 Host 校验
                       → 配对或设备 Cookie 校验
                       → HTTP / WebSocket 代理
                       → 127.0.0.1:3080（同一个 Harness Host）
```

网关不会创建第二个 Harness 会话。首次连接时，它只把桌面浏览器当前选择的会话传递到新浏览器 origin；会话数据和实时事件仍来自同一个 Host。

授权使用随机生成的 256 位浏览器凭据，磁盘中只保存 SHA-256 哈希。设备名称和浏览器描述只是显示信息，不授予权限。

## 配置

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `listenHost` | `0.0.0.0` | 监听本地接口；请求仍只允许来自私有或 loopback 地址。 |
| `listenPort` | `3088` | 局域网网关端口。 |
| `upstreamOrigin` | `http://127.0.0.1:3080` | 已有的 Harness Web 服务。 |
| `accessMode` | `pairing` | 要求一次性邀请和设备 Cookie。 |
| `pairingTtlSeconds` | `300` | 邀请有效时间。 |
| `deviceTtlDays` | `90` | 已记住浏览器的有效时间。 |
| `diagnosticsEnabled` | `true` | 保存受限的本地诊断历史。 |
| `diagnosticsMaxEntries` | `15` | 最多保留的事件数量。 |

`listenHost` 只接受 `0.0.0.0` 或明确的私有/loopback IP。插件不会创建防火墙规则；Windows 请求网络权限时只允许 **Private** profile，并且不要在路由器上转发 `3088` 端口。

`trusted-lan` 会关闭逐设备授权，只适用于隔离的开发网络。正式使用应保留默认的 `pairing`，因为已连接的 Harness 浏览器可以读取文件、提交提示、批准操作并触发命令。

## 诊断

`Settings → Local access → Diagnostics` 保存的是本地、受限且经过脱敏的失败事件，不是请求日志。报告不会包含配对令牌、Cookie、IP 地址、设备或会话 ID、设备名称、URL、路径、提示词、对话或项目文件，也不会自动上传。

排查时请复现一次问题，刷新诊断面板，查看最新稳定事件代码，并在分享前检查 `Copy report` 生成的 JSON。所有事件代码见[诊断参考](docs/DIAGNOSTICS.md)。

## 本地化

插件跟随 Harness 当前语言，不提供独立语言开关。配对页会根据浏览器语言选择英文或简体中文，默认回退到英文。

| 语言 | 字典 | 状态 |
| --- | --- | --- |
| English | `src/locales/en.json` | 已包含 |
| 简体中文 | `src/locales/zh.json` | 已包含 |

测试会检查两个字典的 key 是否一致。

## 开发

```shell
corepack pnpm install --frozen-lockfile
npm run typecheck
npm test
npm run build
npm run verify
```

项目文档：

- [架构与兼容性边界](docs/ARCHITECTURE.md)
- [已验证的 Harness 兼容性](docs/COMPATIBILITY.md)
- [移动视图行为与发布矩阵](docs/MOBILE_VIEW.md)
- [本地诊断与事件代码](docs/DIAGNOSTICS.md)
- [安全模型](docs/SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
- [安全问题报告](SECURITY.md)

## 已知限制

- 局域网流量未加密，当前网关使用明文 HTTP；
- 远程浏览器切换深色/浅色主题时，该选择在已支持的 Harness 版本中只对当前页面有效；
- 启动时会使用优先级最高的私有 IPv4 接口，暂不提供多接口选择；
- 移动视图支持从 360 CSS px 开始的视口，但第三方固定宽度视图、虚拟键盘、旋转、分屏和系统文字缩放仍需要真实设备验收；
- `0.1.5-rc.2` 尚未公开完整的响应式 shell、间距、圆角和全部图标契约，因此每个受支持版本都必须重新验证相关界面适配。

## 开发说明

初始实现与文档由维护者和 OpenAI Codex 协作完成。所有修改仍需经过维护者审查、自动化测试、安全审查和正常贡献流程。运行时不包含 AI 服务、遥测或生成代码依赖。

## 许可证

[MIT](LICENSE) © 2026 dsh-local-link contributors.
