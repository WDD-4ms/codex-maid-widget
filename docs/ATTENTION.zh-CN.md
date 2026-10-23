# 等待交互提醒（Windows Fork）

基于 [Feeesack/codex-maid-widget](https://github.com/Feeesack/codex-maid-widget) 0.3.51。
保留原作者署名、MIT 代码许可、素材许可与第三方声明。事件映射参考
[lokicorvus/CrossPet](https://github.com/lokicorvus/CrossPet)，许可见 [CROSSPET-LICENSE.txt](../licenses/CROSSPET-LICENSE.txt)。

使用合成演示数据渲染的提醒预览：

![Question reminder](images/attention-question.png)
![Approval reminder](images/attention-approval.png)

## 行为

- 结构化问题待回答时显示“等你回答”，权限请求待处理时显示“等你授权”。
- 使用原版思考气泡、角色主题色、字体与窗口缩放；角色保持原有姿态。
- 正常回答或授权调用返回后直接收起气泡，收起过程中不显示额度页。
- “收起提醒”只关闭本次提醒；新请求仍可触发提醒。关闭“显示气泡”设置时遵循该设置。
- 任务完成提示、额度及 token 的原版刷新频率保持不变。

## 从源码运行

按 [构建指南](BUILDING.md) 安装依赖、测试并构建 Windows 应用：

```powershell
npm ci
npm test
npm run build
```

启动构建出的 Windows 应用。结构化提问与独立 `request_permissions` 调用通过本机 Codex 会话日志识别。
代码模式还支持以 `await tools.request_permissions(...)` 或
`text(await tools.request_permissions(...))` 开头的独立 `exec` 调用。

## 可选：安装授权 hook

常规工具执行授权通过 `PermissionRequest` hook 补充识别。显式运行：

```powershell
node scripts/install-attention-hooks.cjs --executable "C:\path\to\Codex-Maid-Widget.exe"
```

脚本向 Codex 用户目录的 `hooks.json` 追加本功能的 hook，并保留其他 hook。
已有配置会备份到挂件数据目录。脚本可重复运行。
默认使用 `CODEX_HOME` 或 `~/.codex`，以及 `CODEX_MAID_HOME` 或 `~/.codex-maid-widget`；
自定义位置可传入 `--codex-home` 和 `--data-dir`，应与实际应用一致。

在 Codex 的 `/hooks` 或设置中审查并信任生成的 `attention-hook.cmd`。
如果当前会话未重新加载 hook，请新建会话或重启 Codex。
脚本不会修改信任记录；hook 不回答问题、不批准权限，只写入本地等待状态。
`Interrupt` 和 `SessionEnd` 的超时为 3 秒，其他事件为 5 秒。

## 兼容边界与验证

- Windows 上已人工验证：等待回答、真实 `request_permissions` 批准、处理后直接收起。
- 原生“跳过”没有出现在已观察到的会话日志中，无法立即自动同步；可点“收起提醒”，或发送下一条消息清除该会话旧提问提醒。
- 普通文字问题、任意脚本内部延迟触发的授权、未写入支持格式的事件，不保证识别。
- 异步问题的 `accepted: true` 只表示发出问题；不会误当作已经回答。
- 授权 hook 以工具输入关联请求，无法区分同一会话同一轮次中完全相同的并发输入。
- macOS 尚未移植该功能。Codex 日志格式变化后可能需要适配。
- 监听器在启动及文件发现时读取最近 128 个会话文件的末尾至多 2 MiB，之后增量读取；超出该范围的旧请求可能无法恢复。

监听只使用本机相关记录，向界面发送计数与请求集合摘要，不上传聊天内容或凭据。
测试使用临时会话与临时数据目录，可通过 `npm test` 运行。
