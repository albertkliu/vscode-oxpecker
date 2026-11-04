/**
 * Oxpecker: Rhino MCP Runner for VS Code
 * 
 * Generated and architected with the assistance of Gemini 3.8 Flash (gemini-3.8-flash).
 * Connects VS Code to Rhino 8 via Model Context Protocol (MCP) and manages Pylance type stubs.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let rpcRequestId = 1;

// ==========================================
// 1. Python 环境检测与 Pylance 深度路径注入
// ==========================================

function scanRhinoPythonEnvironments(): string[] {
    const homeDir = os.homedir();
    const rhinocodeDir = path.join(homeDir, '.rhinocode');
    const detectedEnvs: string[] = [];

    if (fs.existsSync(rhinocodeDir)) {
        try {
            const items = fs.readdirSync(rhinocodeDir);
            for (const item of items) {
                const fullItemPath = path.join(rhinocodeDir, item);
                if (fs.statSync(fullItemPath).isDirectory() && (item.startsWith('py') || item.startsWith('python'))) {
                    detectedEnvs.push(fullItemPath);
                }
            }
        } catch (e: any) {
            outputChannel.appendLine(`[Oxpecker Env] 扫描 ~/.rhinocode 出错: ${e.message}`);
        }
    }

    detectedEnvs.sort((a, b) => {
        const nameA = path.basename(a).toLowerCase();
        const nameB = path.basename(b).toLowerCase();

        if (nameA.includes('py39') && !nameB.includes('py39')) { return -1; }
        if (!nameA.includes('py39') && nameB.includes('py39')) { return 1; }

        const isA3 = nameA.includes('py3');
        const isB3 = nameB.includes('py3');
        if (isA3 && !isB3) { return -1; }
        if (!isA3 && isB3) { return 1; }

        return nameA.localeCompare(nameB);
    });

    return detectedEnvs;
}

function getRhinoPythonLibPaths(envPath: string): string[] {
    const homeDir = os.homedir();
    const rhinocodeDir = path.join(homeDir, '.rhinocode');
    const sitePackages = path.join(envPath, 'Lib', 'site-packages');

    const candidates: string[] = [
        envPath,
        sitePackages,
        path.join(envPath, 'site-packages'),
        path.join(envPath, 'Lib'),
        // Rhino 8 核心注入目录
        path.join(envPath, 'site-rhinopython'),
        path.join(envPath, 'site-interop'),
        path.join(envPath, 'site-envs'),
        path.join(rhinocodeDir, 'stubs'),
        path.join(rhinocodeDir, 'py39-rh8', 'site-rhinopython'),
        // 关键：针对 Rhino-stubs 等专门类型提示包
        path.join(sitePackages, 'Rhino'),
        path.join(sitePackages, 'Rhino-stubs'),
        path.join(sitePackages, 'rhinoscriptsyntax-stubs'),
        path.join(sitePackages, 'Grasshopper-stubs'),
        // Windows Rhino 8 目录
        'C:\\Program Files\\Rhino 8\\Plug-ins\\IronPython\\Lib',
        'C:\\Program Files\\Rhino 8\\System',
        // macOS Rhino 8 目录
        '/Applications/Rhino 8.app/Contents/Frameworks/RhCore.framework/Versions/Current/Resources/Managed'
    ];

    if (fs.existsSync(sitePackages)) {
        try {
            const items = fs.readdirSync(sitePackages);
            for (const item of items) {
                if (item.toLowerCase().endsWith('-stubs')) {
                    candidates.push(path.join(sitePackages, item));
                }
            }
        } catch {}
    }

    const validPaths: string[] = [];
    for (const p of candidates) {
        if (fs.existsSync(p) && !validPaths.includes(p)) {
            validPaths.push(p);
        }
    }
    return validPaths;
}

async function syncToPythonExtension(envPath: string) {
    const pythonExe = process.platform === 'win32'
        ? path.join(envPath, 'python.exe')
        : path.join(envPath, 'bin', 'python');

    outputChannel.appendLine(`[Oxpecker Env] 正在同步 Rhino Python 环境: ${envPath}`);

    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
    const targetConfig = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

    if (fs.existsSync(pythonExe)) {
        const pyConfig = vscode.workspace.getConfiguration('python');
        await pyConfig.update('defaultInterpreterPath', pythonExe, targetConfig);
        outputChannel.appendLine(`[Oxpecker Env] 已更新 python.defaultInterpreterPath: ${pythonExe}`);
    }

    try {
        const pythonExt = vscode.extensions.getExtension('ms-python.python');
        if (pythonExt) {
            if (!pythonExt.isActive) {
                await pythonExt.activate();
            }
            if (pythonExt.exports?.environments?.updateActiveEnvironmentPath) {
                await pythonExt.exports.environments.updateActiveEnvironmentPath(pythonExe);
                outputChannel.appendLine(`[Oxpecker Env] 已通过官方 Python 扩展 API 激活解释器: ${pythonExe}`);
            }
        }
    } catch (e: any) {
        outputChannel.appendLine(`[Oxpecker Warn] Python 扩展 API 调用: ${e.message}`);
    }

    try {
        const rhinoLibPaths = getRhinoPythonLibPaths(envPath);

        const pyAnalysisConfig = vscode.workspace.getConfiguration('python.analysis');
        const currentExtraPaths: string[] = pyAnalysisConfig.get<string[]>('extraPaths') || [];
        const updatedPaths = Array.from(new Set([...currentExtraPaths, ...rhinoLibPaths]));
        await pyAnalysisConfig.update('extraPaths', updatedPaths, targetConfig);

        const pyAutoConfig = vscode.workspace.getConfiguration('python.autoComplete');
        const currentAutoPaths: string[] = pyAutoConfig.get<string[]>('extraPaths') || [];
        const updatedAutoPaths = Array.from(new Set([...currentAutoPaths, ...rhinoLibPaths]));
        await pyAutoConfig.update('extraPaths', updatedAutoPaths, targetConfig);

        outputChannel.appendLine(`[Oxpecker Env] 已注入 ${rhinoLibPaths.length} 个库与 Stubs 路径到 Pylance:`);
        rhinoLibPaths.forEach(p => outputChannel.appendLine(`      + ${p}`));

        vscode.commands.executeCommand('python.analysis.restartLanguageServer').then(
            () => outputChannel.appendLine('[Oxpecker Env] 已成功触发 Pylance 重新加载索引'),
            () => {}
        );
    } catch (e: any) {
        outputChannel.appendLine(`[Oxpecker Warn] 注入 extraPaths 失败: ${e.message}`);
    }
}

async function setPythonEnvironment(envPath: string) {
    const config = vscode.workspace.getConfiguration('oxpecker');
    await config.update('selectedPythonEnv', envPath, vscode.ConfigurationTarget.Global);
    await syncToPythonExtension(envPath);
    updateStatusBar(true);
    vscode.window.showInformationMessage(`Oxpecker: 已切换环境为 [${path.basename(envPath)}] 并同步补全索引`);
}

/**
 * 递归复制目录辅助函数
 */
function copyDirSync(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 为当前环境安装并配置 rhino-stubs
 */
async function installRhinoStubs() {
    const config = vscode.workspace.getConfiguration('oxpecker');
    const envPath = config.get<string>('selectedPythonEnv', '');

    if (!envPath || !fs.existsSync(envPath)) {
        vscode.window.showErrorMessage('未选择有效的 Rhino Python 环境！请先选择环境。');
        return;
    }

    const pythonExe = process.platform === 'win32'
        ? path.join(envPath, 'python.exe')
        : path.join(envPath, 'bin', 'python');

    if (!fs.existsSync(pythonExe)) {
        vscode.window.showErrorMessage(`未找到 Python 可执行文件: ${pythonExe}`);
        return;
    }

    outputChannel.show(true);
    outputChannel.appendLine(`[Oxpecker Stubs] 开始为环境安装 rhino-stubs: ${envPath}`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Oxpecker: 正在通过 pip 安装 rhino-stubs...",
        cancellable: false
    }, async () => {
        try {
            // 1. 使用 execFile 安全执行 pip，防止路径含空格异常
            outputChannel.appendLine(`[Exec] ${pythonExe} -m pip install rhino-stubs`);
            const { stdout, stderr } = await execFileAsync(pythonExe, ['-m', 'pip', 'install', 'rhino-stubs'], { encoding: 'utf8' });
            if (stdout) outputChannel.appendLine(`[Pip Out]\n${stdout}`);
            if (stderr) outputChannel.appendLine(`[Pip Err]\n${stderr}`);

            // 2. 映射 Rhino-stubs 到 Rhino 目录，消除 Pylance 无法解析模块问题
            const sitePackages = path.join(envPath, 'Lib', 'site-packages');
            const stubsSource = path.join(sitePackages, 'Rhino-stubs');
            const rhinoTarget = path.join(sitePackages, 'Rhino');

            if (fs.existsSync(stubsSource)) {
                outputChannel.appendLine(`[Oxpecker Stubs] 正在建立类型映射: Rhino-stubs -> Rhino`);
                copyDirSync(stubsSource, rhinoTarget);
            }

            // 3. 重新同步环境并通知 Pylance 重新加载
            await syncToPythonExtension(envPath);

            vscode.window.showInformationMessage('Oxpecker: rhino-stubs 安装并配置成功！Pylance 索引已重新加载。');
        } catch (error: any) {
            outputChannel.appendLine(`[Oxpecker Error] 安装 rhino-stubs 失败: ${error.message}`);
            vscode.window.showErrorMessage(`安装 rhino-stubs 失败: ${error.message}`);
        }
    });
}

// ==========================================
// 2. Rhino MCP / JSON-RPC 原生直连通信模块
// ==========================================

function getMcpServerPort(): number {
    const config = vscode.workspace.getConfiguration('oxpecker');
    return config.get<number>('mcpPort', 10501);
}

function getMcpServerUrl(): string {
    const port = getMcpServerPort();
    return `http://127.0.0.1:${port}/`;
}

/**
 * 带有超时控制的 JSON-RPC 请求
 */
async function callJsonRpc(method: string, params: any = {}, timeoutMs = 15000): Promise<any> {
    const url = getMcpServerUrl();
    const payload = {
        jsonrpc: "2.0",
        id: rpcRequestId++,
        method: method,
        params: params
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();
        if (data.error) {
            throw new Error(`RPC 错误 [${data.error.code}]: ${data.error.message}`);
        }

        return data.result;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error(`请求超时 (${timeoutMs / 1000}s)，Rhino 未响应或正忙`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function checkRhinoConnection(): Promise<boolean> {
    const port = getMcpServerPort();
    try {
        const result = await callJsonRpc("tools/list", {}, 4000);
        const toolCount = result?.tools?.length || 0;
        outputChannel.appendLine(`[Oxpecker MCP] 成功连接至端口 ${port}，检测到 ${toolCount} 个工具。`);
        updateStatusBar(true);
        return true;
    } catch (err: any) {
        outputChannel.appendLine(`[Oxpecker MCP] 端口 ${port} 连接失败: ${err.message}`);
        updateStatusBar(false);
        return false;
    }
}

async function runCodeInRhino(code: string, fileName: string, isSelection: boolean) {
    outputChannel.show(true);
    outputChannel.appendLine(`[Oxpecker] 正在发送${isSelection ? '选区代码' : '文件'} (${path.basename(fileName)})...`);

    const isCSharp = fileName.toLowerCase().endsWith('.cs');
    const toolName = isCSharp ? 'run_csharp' : 'run_python';

    // 针对 Python 脚本注入环境 Bootstrap：
    // 1. 将工作目录切换到文件所在目录，防止写入 C:\Program Files\Rhino 8\System 导致权限拒绝
    // 2. 绑定真实的 __file__
    // 3. 将当前目录加入 sys.path 使得 import 本地文件生效
    let finalPayload = code;
    if (!isCSharp && fileName && !fileName.startsWith('Untitled')) {
        const fileDir = path.dirname(fileName).replace(/\\/g, '/');
        const normalizedFilePath = fileName.replace(/\\/g, '/');

        const bootstrap = [
            `import os, sys`,
            `__file__ = r"${normalizedFilePath}"`,
            `try:`,
            `    os.chdir(r"${fileDir}")`,
            `except Exception:`,
            `    pass`,
            `if r"${fileDir}" not in sys.path:`,
            `    sys.path.insert(0, r"${fileDir}")`,
            `# --- 用户代码执行区 ---`,
            ``
        ].join('\n');

        finalPayload = bootstrap + '\n' + code;
    }

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: isSelection ? "Oxpecker: 正在执行选区代码..." : "Oxpecker: 正在执行脚本...",
            cancellable: false
        }, async () => {
            // 修复 MCP 警告：run_python/run_csharp 仅接收 script 参数，移除 code
            const toolParams = {
                name: toolName,
                arguments: {
                    script: finalPayload
                }
            };

            // 代码执行可能耗时较长，将超时设为 120 秒
            const result = await callJsonRpc("tools/call", toolParams, 120000);

            outputChannel.appendLine(`[Rhino 输出]:`);
            if (result?.content && Array.isArray(result.content)) {
                for (const item of result.content) {
                    if (item.type === 'text') {
                        outputChannel.appendLine(item.text);
                    }
                }
            } else if (typeof result === 'string') {
                outputChannel.appendLine(result);
            } else if (result) {
                outputChannel.appendLine(JSON.stringify(result, null, 2));
            }

            vscode.window.showInformationMessage(`Oxpecker: 执行完成 (${isSelection ? '选区' : '文件'})`);
            updateStatusBar(true);
        });

    } catch (error: any) {
        outputChannel.appendLine(`[Oxpecker Error] 执行失败: ${error.message}`);
        vscode.window.showErrorMessage(`Oxpecker 执行失败: ${error.message}`);
        updateStatusBar(false);
    }
}

function updateStatusBar(isConnected: boolean) {
    if (!statusBarItem) return;
    const config = vscode.workspace.getConfiguration('oxpecker');
    const currentEnv = config.get<string>('selectedPythonEnv', '');
    const envLabel = currentEnv ? path.basename(currentEnv) : '未配置环境';
    const port = getMcpServerPort();

    statusBarItem.text = `$(rocket) Oxpecker [:${port} ${isConnected ? '已连' : '断开'}] | ${envLabel}`;
    statusBarItem.tooltip = `Rhino MCP 端口: ${port} (${isConnected ? '已连接' : '未连接'})\n环境: ${currentEnv}\n点击打开 Oxpecker 快捷控制面板`;
    statusBarItem.show();
}

// ==========================================
// 3. 插件生命周期与命令注册
// ==========================================

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("Oxpecker");

    // 状态栏绑定快捷菜单
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'oxpecker.showMenu';
    context.subscriptions.push(statusBarItem);

    // 监听配置变更
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('oxpecker.mcpPort')) {
                outputChannel.appendLine(`[Oxpecker] 检测到端口配置已修改，正在重新测试连接...`);
                await checkRhinoConnection();
            }
        })
    );

    // 自动扫描与配置环境
    const config = vscode.workspace.getConfiguration('oxpecker');
    let currentEnv = config.get<string>('selectedPythonEnv', '');
    const detectedEnvs = scanRhinoPythonEnvironments();

    if (!currentEnv || currentEnv.includes('py27')) {
        if (detectedEnvs.length > 0) {
            currentEnv = detectedEnvs[0];
            setPythonEnvironment(currentEnv);
        }
    } else {
        syncToPythonExtension(currentEnv);
        updateStatusBar(false);
    }

    // 启动时自动测试连通性
    checkRhinoConnection();

    // 命令 1: 运行代码/选区 (Ctrl+R / Cmd+R)
    const runCommand = vscode.commands.registerCommand('oxpecker.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的代码文件！');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const isSelection = !selection.isEmpty;
        const code = isSelection ? document.getText(selection) : document.getText();

        if (!code.trim()) {
            vscode.window.showWarningMessage('代码内容为空！');
            return;
        }

        if (!isSelection && document.isDirty) {
            await document.save();
        }

        await runCodeInRhino(code, document.fileName, isSelection);
    });

    // 命令 2: 修改端口
    const setPortCommand = vscode.commands.registerCommand('oxpecker.setPort', async () => {
        const currentPort = getMcpServerPort().toString();
        const input = await vscode.window.showInputBox({
            title: "设置 Rhino MCP Server 端口",
            prompt: "请输入 Rhino 中显示的 MCP 端口号 (如 10501)",
            value: currentPort,
            validateInput: (val) => {
                const num = parseInt(val, 10);
                if (isNaN(num) || num <= 0 || num > 65535) {
                    return "请输入有效的端口号 (1 - 65535)";
                }
                return null;
            }
        });

        if (input) {
            const newPort = parseInt(input, 10);
            const oxConfig = vscode.workspace.getConfiguration('oxpecker');
            await oxConfig.update('mcpPort', newPort, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Oxpecker: 端口已切换为 ${newPort}，正在测试连接...`);
            await checkRhinoConnection();
        }
    });

    // 命令 3: 重新连接
    const reconnectCommand = vscode.commands.registerCommand('oxpecker.reconnect', async () => {
        const ok = await checkRhinoConnection();
        if (ok) {
            vscode.window.showInformationMessage(`Oxpecker: 成功连接至端口 ${getMcpServerPort()}！`);
        } else {
            vscode.window.showErrorMessage(`Oxpecker: 无法连接至端口 ${getMcpServerPort()}，请确认 Rhino 端已运行 MCPStart`);
        }
    });

    // 命令 4: 切换 Python 环境
    const selectEnvCommand = vscode.commands.registerCommand('oxpecker.selectEnvironment', async () => {
        const envs = scanRhinoPythonEnvironments();

        const pickItems: vscode.QuickPickItem[] = envs.map(e => ({
            label: `$(folder) ${path.basename(e)}`,
            description: e,
            detail: '从 ~/.rhinocode 自动扫描到的虚拟环境'
        }));

        pickItems.push({
            label: '$(file-directory) 手动浏览指定目录...',
            description: '',
            detail: '自定义选择 Python 虚拟环境路径'
        });

        const selected = await vscode.window.showQuickPick(pickItems, {
            placeHolder: '选择要使用的 Rhino Python 环境 (推荐 py39-rh8)'
        });

        if (!selected) return;

        if (selected.description) {
            await setPythonEnvironment(selected.description);
        } else {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: '选择 Python 环境目录'
            });
            if (uri && uri[0]) {
                await setPythonEnvironment(uri[0].fsPath);
            }
        }
    });

    // 命令 5: 一键安装/配置 Rhino-stubs
    const installStubsCommand = vscode.commands.registerCommand('oxpecker.installStubs', async () => {
        await installRhinoStubs();
    });

    // 命令 6: 状态栏主菜单
    const showMenuCommand = vscode.commands.registerCommand('oxpecker.showMenu', async () => {
        const port = getMcpServerPort();
        const config = vscode.workspace.getConfiguration('oxpecker');
        const currentEnv = config.get<string>('selectedPythonEnv', '未配置');

        const items: vscode.QuickPickItem[] = [
            {
                label: '$(cloud-download) 安装/配置 Rhino 类型存根 (修复 Pylance 补全/黄线)',
                description: 'rhino-stubs',
                detail: `在当前环境 [${path.basename(currentEnv)}] 中安装并建立类型索引`
            },
            {
                label: '$(server-environment) 切换 Rhino Python 环境',
                description: path.basename(currentEnv),
                detail: `当前路径: ${currentEnv}`
            },
            {
                label: '$(plug) 设置 Rhino MCP 端口',
                description: `当前端口: ${port}`,
                detail: '修改连接到 Rhino 的 MCP Server 监听端口'
            },
            {
                label: '$(refresh) 重新测试连接',
                description: `http://127.0.0.1:${port}/`,
                detail: '测试当前端口是否可正常通信'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Oxpecker 控制面板'
        });

        if (!selected) return;

        if (selected.label.includes('安装/配置 Rhino 类型存根')) {
            vscode.commands.executeCommand('oxpecker.installStubs');
        } else if (selected.label.includes('切换 Rhino Python 环境')) {
            vscode.commands.executeCommand('oxpecker.selectEnvironment');
        } else if (selected.label.includes('设置 Rhino MCP 端口')) {
            vscode.commands.executeCommand('oxpecker.setPort');
        } else if (selected.label.includes('重新测试连接')) {
            vscode.commands.executeCommand('oxpecker.reconnect');
        }
    });

    context.subscriptions.push(runCommand, setPortCommand, reconnectCommand, selectEnvCommand, installStubsCommand, showMenuCommand);
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}