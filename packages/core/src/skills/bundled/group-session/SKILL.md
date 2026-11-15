---
name: group-session
description: Coordinate a collaborative group session when the user requests named teammates, multiple models, peer discussion, task assignment, escalation, and leader review.
argument-hint: '<goal>'
---

# Lead a group session

Use the existing Agent Team tools and Agent View conversations. Keep one active
team per session. If tools are unavailable, explain how to enable Agent Team in
/settings and restart; do not claim a group was started.

## Establish the group

1. Analyze the user's goal and define acceptance criteria before delegating.
2. Respect the requested teammate count and configured runtime cap; default to
   three at most. Explain that additional models increase token usage and can
   increase latency. Do not duplicate independent solutions like an Arena.
3. Create one team. Create scoped tasks with dependencies, owners, completion
   conditions, and short `activeForm` titles. Never auto-assign the same write
   scope to multiple teammates.
4. Spawn named teammates yourself. For explicit model IDs use `teammate_model`;
   reserve `model` for the normal subagent grade interface. If the user has not
   selected models, inherit the current model. Use models configured on the current
   provider endpoint; do not imply cross-provider routing. Never invent credentials.
5. Give each teammate an initial prompt containing its role, objective, allowed
   scope, relevant context, acceptance criteria, evidence to return, and reporting
   rules. Persistent agent definitions supply their own system prompts; a task
   prompt is not a replacement for those definitions.

## Collaborate without noise

- Communicate through `send_message` and shared tasks. Allow teammates to ask
  relevant peers for specific evidence and contact the leader when necessary.
- Require short message summaries and short task titles. Keep detailed tool
  output and discussion in each agent conversation, not repeated in main chat.
- Report to the leader immediately on a blocker, error, conflicting ownership,
  required permission, or need for help. Report completion with changed paths,
  checks performed, results, and remaining uncertainty. Do not broadcast routine
  progress or poll task lists repeatedly while waiting for messages.
- Let idle teammates rest. A new targeted message or task can wake them; never
  describe idle as proof of successful completion. Do not busy-loop to wait.
- Handle approval requests through existing permission surfaces. Do not ask a
  teammate to evade approvals or grant itself broader permissions.

## Protect changes and review results

Start investigation teammates read-only. For implementation, use the existing
worktree-pinned writer workflow from `coordinate`: finish investigation, shut
those teammates down, create a worktree, and give one writer its exact path.
Keep the leader responsible for integration. If a worktree cannot be created,
keep teammates read-only and make changes in the leader's checkout.

Review every completion against its acceptance criteria. Inspect concrete
artifacts and run relevant checks; do not accept a teammate's claim as evidence.
Request corrections or further peer review when evidence is missing. Resolve
conflicting conclusions before presenting the result.

When finished or asked to stop, request graceful shutdown from each live
teammate, wait for acknowledgements, then delete the team. Preserve existing
conversation records. Never claim that reopening a chat automatically restores
running teammate processes. Report the final outcome, verification, and blockers
in one concise response from the leader.
