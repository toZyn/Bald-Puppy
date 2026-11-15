# Group sessions acceptance

1. With Agent Team disabled, `/group create --agents 2 build a backend` explains the opt-in and restart; no provider request or team is created.
2. With enabled mocked runtime, submit two distinct model IDs; inspect the leader request and teammate spawn arguments, including names and prompts.
3. Register teammates, send task-claimed/status/idle events, and verify short titles change without adding main history rows.
4. At 40 columns and 10 rows, ensure cards remain bounded; at 80 by 30 show rounded cards and overflow count. Keyboard tabs or enabled alternate-screen mouse open the existing conversation.
5. Send peer questions and a completion report; leader reviews evidence before accepting. Idle teammate can receive another task. Keep approval requests visible in the existing agent view.
6. Stop through graceful leader shutdown; never imply persisted chat restores running teammates. Automated checks use fake runtimes and loopback only.
