# Security policy

## Bald Puppy reports

This repository is maintained by toZyn. OpenAI's Bugcrowd program does not serve as a reporting channel for Bald Puppy-specific changes.

Do not include credentials, private data, or exploit details in public issues. If GitHub private vulnerability reporting is enabled, use the repository's Security tab to submit a private report. Otherwise, ask the maintainer to establish a private reporting channel before sharing sensitive details.

## Upstream Codex reports

For vulnerabilities in the official OpenAI Codex distribution, follow the [upstream security policy](https://github.com/openai/codex/security/policy).

## Runtime security

The inherited implementation includes sandboxing, approvals, and network controls. See the [upstream security documentation](https://developers.openai.com/codex/agent-approvals-security) and review the local configuration before running the agent.
