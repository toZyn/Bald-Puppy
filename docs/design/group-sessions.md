# Group sessions

[中文](group-sessions.zh-CN.md)

Reuse the opt-in Agent Team runtime and Agent View conversations. `/group create`
submits a bounded coordination request to the main agent; the main agent creates,
names and assigns teammates with existing tools. Explicit model choices must reach
the TeamManager. Model overrides stay on the current configured provider endpoint;
cross-provider group routing is not introduced. Preserve permission checks and existing worktree isolation.

Show a bounded roster of rounded cards under the main composer. Each card shows
one name, model, status and current task title. Existing keyboard tabs and optional
alternate-screen mouse selection open the full conversation and approvals. Keep
messages in conversations; never duplicate each tool event in the main history.
Short terminals use compact cards and an overflow count. Re-measure controls on
roster changes. Idle agents can receive messages and resume through existing queues.

Validate command parsing, disabled feature guidance, model propagation, bounded
rendering at narrow widths and short heights, task events and selection. Use mock
runtimes only during automated verification. Group work can multiply token costs.
