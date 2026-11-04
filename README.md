# Oxpecker: Rhino MCP Runner
[![AI-Generated](https://img.shields.io/badge/Powered%20by-Gemini%203.8%20Flash-4285F4?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Oxpecker Logo" />
</p>

<p align="center">
  <strong>基于 Model Context Protocol (MCP) 的新一代 VS Code ⇄ Rhino 8/9 实时交互与脚本运行环境</strong>
</p>

---

## 📖 简介 (Introduction)

**Oxpecker** 是一个轻量、高效的 VS Code 扩展。它摒弃了传统低效的外部 CLI 轮询与文件写入监听方案，采用 Anthropic 主导的 **Model Context Protocol (MCP) / JSON-RPC 原生直连通信**，在 VS Code 与 Rhino 进程之间建立直接会话。

开发者可以在 VS Code 中编写 Python (CPython 3.9+) 或 C# 脚本，一键发送代码全文或局部选区到活动 Rhino 实例中即时执行，并在 VS Code 输出通道中毫秒级获取执行日志与返回值。同时，扩展深度整合了 VS Code Python/Pylance 语言服务器，提供开箱即用的 Rhino API 代码提示与自动补全。

---

## ⚙️ 架构与设计原理 (Architecture & Design Principles)

### 1. 原生直连通信 (Native MCP / JSON-RPC)
- **零进程开销**：传统 CLI 方式每次运行脚本都需要启动一个子进程调用 `rhinocode.exe`，产生数百毫秒的进程冷启动开销。
- **内存级通信**：Oxpecker 通过 HTTP POST 方式直连 Rhino 端已启动的 MCP Server（默认端口 `10501`），调用 `tools/call` 接口（`run_python` / `run_csharp` 工具）。代码以 payload 字符串形式直达 Rhino 内存空间中的执行引擎。

### 2. 运行时工作区引导与写权限隔离 (Runtime Bootstrap)
- **痛点**：在 Rhino 进程内动态 `exec()` 代码时，默认工作目录（CWD）通常指向受系统保护的 `C:\Program Files\Rhino 8\System\`，且不存在真实的 `__file__` 变量。当脚本中执行文件读写（如保存图像、输出点云数据）时，会触发系统的 `PermissionError: Access Denied`。
- **解决方案**：在向 Rhino MCP 提交 Python 脚本前，插件自动注入轻量级运行时引导头（Runtime Bootstrap）：
  - 自动绑定 `__file__` 为当前编辑器中保存的绝对文件路径。
  - 调用 `os.chdir()` 将 Rhino 进程的工作目录切换到该脚本同级目录。
  - 将当前脚本所在目录注入 `sys.path`，使同目录下的多模块 `import` 原生可用。

### 3. Pylance 深度环境注入与类型存根 (Type Stubs & IntelliSense)
- 启动时自动扫描并解析 `~/.rhinocode` 内部的虚拟环境（优先匹配 `py39-rh8`）。
- 自动提取并向 VS Code 注入环境中的核心包路径（包括 `site-rhinopython`、`site-interop` 以及各类以 `-stubs` 结尾的包）。
- 内置一键式 `rhino-stubs` 安装与类型目录对齐映射，消除 VS Code 中的黄色导入警告，提供完整的 RhinoCommon 和 Grasshopper 语法智能提示。

---

## 🚀 快速上手 (Quick Start)

### 前置要求
1. 安装 **Rhino 8** (或更新版本)。
2. 安装 VS Code 官方 **Python** 扩展 (`ms-python.python`)。
3. 在 Rhino 中开启 MCP Server 监听（默认端口：`10501`）。

### 常用快捷键与操作
| 功能 | 快捷键 (Windows/Linux) | 快捷键 (macOS) | 说明 |
| :--- | :--- | :--- | :--- |
| **运行当前文件 / 选区代码** | `Ctrl + R` | `Cmd + R` | 自动判断活动语言 (`.py` 或 `.cs`) 发送到 Rhino |
| **打开控制面板** | 点击状态栏图标 | 点击状态栏图标 | 包含环境切换、端口设置、连通测试与 Stubs 安装 |

---

## 🛠️ 项目构建与打包 (Build & Packaging)

本项目采用 **TypeScript** 开发，并使用 **esbuild** 进行高性能打包与代码压缩。

### 1. 环境准备
确保本机已安装 [Node.js](https://nodejs.org/) (推荐 Node 18+ 或 20+)。

在项目根目录下安装依赖：
```bash
npm install
```

### 2. 编译构建
```bash
# 执行 esbuild 打包，产物将生成在 out/extension.js (单文件压缩)
npm run build

# 监听模式 (源码修改后自动重新构建，适合调试)
npm run watch
```

### 3. 本地调试
1. 在 VS Code 中打开本项目根目录。
2. 按 `F5` 启动调试，VS Code 会自动打开一个全新的 **扩展开发主机** (Extension Development Host) 窗口。
3. 在新窗口中打开任意 Rhino 脚本，即可进行断点调试或快捷键测试。

### 4. 生成离线安装包 (.vsix)
运行以下命令即可完成预编译并将安装包归档输出至 `./release/` 目录：
```bash
npm run vsix
```
打包成功后，可在 VS Code 插件视图中选择 **"从 VSIX 安装..." (Install from VSIX...)**，选中 `./release/vscode-oxpecker-x.x.x.vsix` 完成安装。

---

## ⚙️ 配置项 (Settings)

可通过 VS Code `设置 (Settings)` 搜索 `oxpecker` 进行自定义：

- `oxpecker.mcpPort`: Rhino MCP Server 监听端口（默认：`10501`）。
- `oxpecker.selectedPythonEnv`: 当前选中的 Rhino Python 虚拟环境路径。

---

## 📄 开源许可 (License)

本项目遵循 [MIT License](LICENSE.txt) 开源协议。


## 🤖 AI 声明 (AI Disclosure)

本项目（包括插件核心代码架构、MCP 通信管道实现、Pylance 环境注入逻辑以及相关工程配置）由 **Gemini 3.8 Flash**（模型标识：`gemini-3.8-flash`）辅助构思、重构与生成，并由人工开发者进行系统测试与工程化验证。

This project (including core architecture, MCP communication pipeline, Pylance environment injection logic, and project tooling) was generated and engineered with the assistance of **Gemini 3.8 Flash** (technical ID: `gemini-3.8-flash`), and tested/verified for Rhino 8 environments.