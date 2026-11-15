/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types.js';
import { groupCommand, parseGroupRequest } from './group-command.js';

function context(enabled = true, team: unknown = null, maxTeammates = 10) {
  return {
    services: {
      config: {
        isAgentTeamEnabled: () => enabled,
        getTeamManager: () => team,
        getAgentsSettings: () => ({ team: { maxTeammates } }),
      },
    },
  } as unknown as CommandContext;
}
const run = (args: string, ctx = context()) => groupCommand.action!(ctx, args);

describe('/group', () => {
  it('explains opt-in and restart without changing settings', async () => {
    expect(await run('create build backend', context(false))).toMatchObject({
      type: 'message',
      content: expect.stringContaining('then restart'),
    });
  });
  it('keeps model IDs exact and distributes them round robin', async () => {
    const result = await run(
      'create --agents 3 --models provider/Model-A,other:model build backend',
    );
    expect(result).toMatchObject({ type: 'submit_prompt' });
    const content = (result as { content: string }).content;
    expect(content).toContain(
      '[{"slot":1,"model":"provider/Model-A"},{"slot":2,"model":"other:model"},{"slot":3,"model":"provider/Model-A"}]',
    );
    expect(content).toContain('Agent.teammate_model');
    expect(content).toContain('Review outputs');
    expect(content).toContain('existing leader-owned worktrees');
  });
  it.each([
    '--agents 0 goal',
    '--agents -1 goal',
    '--agents 2.5 goal',
    '--agents 11 goal',
    '--agents 2 --agents 3 goal',
    '--models a,,b goal',
    '--unknown x goal',
    '--models a,b',
  ])('rejects invalid create arguments: %s', async (args) => {
    expect(await run(`create ${args}`)).toMatchObject({
      type: 'message',
      messageType: 'error',
    });
  });
  it('uses the backend limit and defaults to at most three teammates', () => {
    expect(parseGroupRequest('goal', 2).count).toBe(2);
    expect(() => parseGroupRequest('--agents 3 goal', 2)).toThrow('1 to 2');
    expect(parseGroupRequest('goal --with-user-options', 10).goal).toBe(
      'goal --with-user-options',
    );
  });
  it('reports roster locally without invoking tools', async () => {
    const getTeamFile = vi.fn(() => ({
      name: 'backend',
      members: [{ name: 'tester', model: 'Model-A', isActive: false }],
    }));
    expect(
      await run(
        'status',
        context(true, {
          getTeamFile,
          getAgentFromBackend: () => ({ getStatus: () => 'idle' }),
        }),
      ),
    ).toMatchObject({
      type: 'message',
      content: 'Group: backend\ntester · Model-A · idle',
    });
    expect(getTeamFile).toHaveBeenCalledOnce();
  });
  it('sanitizes persisted roster labels before sending them to terminal history', async () => {
    const result = await run(
      'status',
      context(true, {
        getTeamFile: () => ({
          name: 'safe\u001b[2J\nteam',
          members: [
            {
              agentId: 'one',
              name: 'reader\r\nname',
              model: 'model\u001b[31m',
            },
          ],
        }),
        getAgentFromBackend: () => undefined,
      }),
    );
    const content = (result as { content: string }).content;
    expect(content).not.toContain('\u001b');
    expect(content).not.toContain('\r');
    expect(content.split('\n')).toHaveLength(2);
    expect(content).toContain('reader');
    expect(content).toContain('name');
  });

  it('prevents a second active group and routes shutdown through the leader', async () => {
    const ctx = context(true, {});
    expect(await run('create goal', ctx)).toMatchObject({
      type: 'message',
      messageType: 'error',
    });
    expect(await run('stop', ctx)).toMatchObject({
      type: 'submit_prompt',
      content: expect.stringContaining('shutdown acknowledgements'),
    });
    expect(await run('stop')).toMatchObject({
      type: 'message',
      content: 'No active group.',
    });
  });
  it('caps even an excessive configured backend limit', async () => {
    expect(
      await run('create --agents 11 goal', context(true, null, 1000000000)),
    ).toMatchObject({ messageType: 'error' });
  });
  it('reports usage for unknown operations and extra status arguments', async () => {
    expect(await run('destroy')).toMatchObject({ messageType: 'error' });
    expect(await run('status extra')).toMatchObject({ messageType: 'error' });
  });
});
