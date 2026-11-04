# Oxpecker - Rhino Script Runner for VS Code (Python & C#)
[![AI-Generated](https://img.shields.io/badge/Powered%20by-Gemini%203.8%20Flash-4285F4?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Oxpecker Logo" />
</p>

<p align="center">
  <strong>基于 Model Context Protocol (MCP) 的新一代 VS Code ⇄ Rhino 8/9 实时交互与脚本运行环境</strong>
</p>

---

## ⚡ 核心原理

本插件通过 HTTP POST 向 Rhino 官方 MCP Server 发送标准 JSON-RPC 请求，调用 `run_python` 或 `run_csharp` 工具，将代码直接注入 Rhino 内存空间运行，并在 VS Code 输出面板实时返回执行结果。

在运行 Python 脚本前，插件会自动注入路径引导（Bootstrap）：
1. 自动将当前工作目录（CWD）切换至脚本所在目录，防止写入系统保护目录导致无权限报错。
2. 自动绑定 `__file__` 变量，支持脚本同级相对路径读写与模块 `import`。

---

## 🚀 使用步骤

1. **Rhino 端**：启动 Rhino 8+，运行命令启动 MCP Server 并记录监听端口（默认推荐 `10501`）。
2. **VS Code 端**：点击左下角状态栏 `Oxpecker` 图标，在弹出的控制面板中：
   - 设置与 Rhino 一致的端口号；
   - 选择 Rhino 自带的 Python 环境（如 `py39-rh8`），插件会自动配置 Pylance 代码补全。
3. **运行代码**：
   - 打开 `.py` 或 `.cs` 脚本，点击编辑器右上角 **Oxpecker 运行图标**；
   - 或使用快捷键 `Ctrl + R` (macOS: `Cmd + R`) 运行全文或选区代码。

---

## 🛠️ 构建与打包

```bash
# 安装依赖
npm install

# 编译构建
npm run build

# 打包生成 .vsix 安装包至 release 目录
npm run vsix
```

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