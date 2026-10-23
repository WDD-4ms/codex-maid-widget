# Waiting-interaction reminders (Windows fork)

Based on [Feeesack/codex-maid-widget](https://github.com/Feeesack/codex-maid-widget) 0.3.51.
The upstream attribution, MIT code license, artwork licenses, and third-party notices are retained.
Event mapping references [lokicorvus/CrossPet](https://github.com/lokicorvus/CrossPet);
see [CROSSPET-LICENSE.txt](../licenses/CROSSPET-LICENSE.txt).

Reminder previews rendered with synthetic demo data:

![Question reminder](images/attention-question.png)
![Approval reminder](images/attention-approval.png)

## Behavior

- Shows “Your answer” for pending structured questions and “Your approval” for pending permission requests.
- Reuses the original thought bubble, character theme, typography, and window scaling.
- Closes directly when an answer arrives or the permission call returns, without showing the quota page during dismissal.
- “Dismiss reminder” hides the current reminder; a new request can show again. Respects the Show bubble setting.
- Preserves the original completion behavior and quota/token refresh interval.

## Build and run

Follow the [build guide](BUILDING.md) to install dependencies and build the Windows application:

```powershell
npm ci
npm test
npm run build
```

Run the built application. Structured questions and standalone `request_permissions` calls are detected in local Codex session logs.
Code mode also supports dedicated `exec` input beginning with `await tools.request_permissions(...)`
or `text(await tools.request_permissions(...))`.

## Optional approval hooks

Hooks supplement detection for regular tool execution approvals. Explicitly run:

```powershell
node scripts/install-attention-hooks.cjs --executable "C:\path\to\Codex-Maid-Widget.exe"
```

The script merges the feature's hooks into the Codex user `hooks.json`, preserving other hooks and backing up
the existing configuration in the widget data directory. It is safe to run again.
Defaults: `CODEX_HOME` or `~/.codex`, and `CODEX_MAID_HOME` or `~/.codex-maid-widget`.
Use `--codex-home` and `--data-dir` for custom locations matching the running application.

Review and trust the generated `attention-hook.cmd` in Codex `/hooks` or settings.
Start a new chat or restart Codex if hooks have not reloaded.
The installer does not alter hook trust. Hooks record local waiting state without answering questions or granting permissions.
`Interrupt` and `SessionEnd` use a three-second timeout; other events use five seconds.

## Validation and limits

- Manually verified on Windows: pending questions, real `request_permissions` approval, and direct dismissal after resolution.
- Native Skip did not appear in the observed session logs. Use Dismiss reminder or send the next message to clear that chat's old async questions.
- Plain-text questions, delayed permission calls inside arbitrary scripts, and unsupported event formats may not be detected.
- Async `accepted: true` means the question was submitted, not answered.
- Approval hooks correlate tool inputs; identical concurrent inputs in the same session and turn cannot be distinguished.
- This feature has not been ported to macOS. Codex log format changes may require updates.
- Initial discovery covers the latest 128 session files, reading at most the last 2 MiB of each before following incremental changes. Older requests outside that range may not be recovered.

Detection uses relevant local records and sends counts and a request-set digest to the renderer. It does not upload conversations or credentials.
Run isolated regression tests with `npm test`.
