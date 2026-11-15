/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import type { Config } from '@qwen-code/qwen-code-core';
import {
  TeamEventEmitter,
  TeamEventType,
} from '@qwen-code/qwen-code-core/agents/team/team-events.js';
import type { TeamManager } from '@qwen-code/qwen-code-core/agents/team/TeamManager.js';
import { ConfigContext } from '../../contexts/ConfigContext.js';
import type { RowMouseControllerProps } from '../shared/RowMouseController.js';
import {
  GroupSessionPanel,
  GroupCards,
  type GroupCard,
} from './GroupSessionPanel.js';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';

const mocks = vi.hoisted(() => ({
  agents: new Map(),
  select: vi.fn(),
  layout: vi.fn(),
  mouse: vi.fn(),
  tasks: [] as Array<{ owner: string; subject: string; activeForm?: string }>,
  taskListeners: new Set<(name: string) => void>(),
  list: vi.fn(),
}));
vi.mock('../../contexts/AgentViewContext.js', () => ({
  useAgentViewState: () => ({ agents: mocks.agents }),
  useAgentViewActions: () => ({
    switchToAgent: mocks.select,
    setGroupPanelLayoutKey: mocks.layout,
  }),
}));
vi.mock('@qwen-code/qwen-code-core/agents/team/tasks.js', () => ({
  listTasks: mocks.list,
  onTasksUpdated: (listener: (name: string) => void) => {
    mocks.taskListeners.add(listener);
    return () => mocks.taskListeners.delete(listener);
  },
}));
vi.mock('../shared/RowMouseController.js', () => ({
  RowMouseController: (props: RowMouseControllerProps) => {
    mocks.mouse(props);
    return null;
  },
}));
function team(prefix: string) {
  const events = new TeamEventEmitter();
  const on = vi.spyOn(events, 'on');
  const off = vi.spyOn(events, 'off');
  const members = [0, 1].map((index) => ({
    agentId: `${prefix}-${index}`,
    name: `${prefix} teammate ${index}`,
    model: 'fixture-model',
    prompt: 'Inspect assigned fixtures',
    joinedAt: Date.now() - 10_000,
  }));
  let status = 'running';
  for (const member of members)
    mocks.agents.set(member.agentId, {
      interactiveAgent: { getStatus: () => status },
    });
  return {
    events,
    on,
    off,
    members,
    setStatus: (next: string) => {
      status = next;
    },
    manager: {
      getEventEmitter: () => events,
      getTeamFile: () => ({ name: prefix, members }),
    } as unknown as TeamManager,
  };
}
function configWith(initial: TeamManager | null) {
  let current = initial;
  const callbacks = new Set<(manager: TeamManager | null) => void>();
  const config = {
    getTeamManager: () => current,
    onTeamManagerChange: (
      next: ((manager: TeamManager | null) => void) | null,
      previous?: (manager: TeamManager | null) => void,
    ) => {
      if (previous) callbacks.delete(previous);
      if (next) callbacks.add(next);
    },
  } as unknown as Config;
  return {
    config,
    callbacks,
    replace: (next: TeamManager | null) => {
      current = next;
      for (const callback of callbacks) callback(next);
    },
  };
}
const mounted: Array<{ unmount: () => void }> = [];
function panel(config: Config, alternateScreen = false) {
  const ui = render(
    <ConfigContext.Provider value={config}>
      <GroupSessionPanel
        width={40}
        height={40}
        alternateScreen={alternateScreen}
      />
    </ConfigContext.Provider>,
  );
  mounted.push(ui);
  return ui;
}
beforeEach(() => {
  mocks.agents.clear();
  vi.clearAllMocks();
  mocks.tasks = [];
  mocks.taskListeners.clear();
  mocks.list.mockImplementation(async () => mocks.tasks);
});
afterEach(() => {
  for (const ui of mounted.splice(0)) ui.unmount();
  vi.useRealTimers();
});

describe('GroupSessionPanel lifecycle', () => {
  it('replaces team subscriptions and removes all subscriptions on unmount', async () => {
    const first = team('first');
    const second = team('second');
    const config = configWith(first.manager);
    const ui = panel(config.config);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).toContain('first teammate 0');
      expect(config.callbacks.size).toBe(1);
      expect(first.on).toHaveBeenCalledWith(
        TeamEventType.TASK_AUTO_CLAIMED,
        expect.any(Function),
      );
    });
    config.replace(second.manager);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).toContain('second teammate 0');
      expect(ui.lastFrame()).not.toContain('first teammate 0');
      expect(first.off).toHaveBeenCalledWith(
        TeamEventType.TASK_AUTO_CLAIMED,
        expect.any(Function),
      );
    });
    first.events.emit(TeamEventType.TASK_AUTO_CLAIMED, {
      agentId: 'second-0',
      name: 'old',
      taskId: 'old',
      taskSubject: 'STALE TASK',
      timestamp: 0,
    });
    expect(ui.lastFrame()).not.toContain('STALE TASK');
    ui.unmount();
    await vi.waitFor(() => {
      expect(config.callbacks.size).toBe(0);
      expect(mocks.taskListeners.size).toBe(0);
      expect(mocks.layout).toHaveBeenLastCalledWith('');
      expect(second.off).toHaveBeenCalledWith(
        TeamEventType.TEAMMATE_JOINED,
        expect.any(Function),
      );
    });
  });
  it('shows the latest task without appending a new card and polls runtime status', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const current = team('active');
    const config = configWith(current.manager);
    const ui = panel(config.config);
    await vi.waitFor(() => {
      expect(current.on).toHaveBeenCalledWith(
        TeamEventType.TASK_AUTO_CLAIMED,
        expect.any(Function),
      );
      expect(mocks.taskListeners.size).toBe(1);
      expect(mocks.list).toHaveBeenCalled();
    });
    const beforeRows = ui.lastFrame()!.split('\n').length;
    current.events.emit(TeamEventType.TASK_AUTO_CLAIMED, {
      agentId: 'active-0',
      name: 'active',
      taskId: '1',
      taskSubject: 'Task one',
      timestamp: 0,
    });
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Task one'));
    current.events.emit(TeamEventType.TASK_AUTO_CLAIMED, {
      agentId: 'active-0',
      name: 'active',
      taskId: '2',
      taskSubject: 'Task two',
      timestamp: 1,
    });
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Task two'));
    current.setStatus('idle');
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).not.toContain('Task two');
      expect(ui.lastFrame()).not.toContain('Task one');
      expect(ui.lastFrame()).toContain('idle');
      expect(ui.lastFrame()).toContain('Resting');
    });
    expect(ui.lastFrame()!.split('\n').length).toBe(beforeRows);
  });
  it('routes the selected visible card id to the full agent view', async () => {
    const current = team('click');
    const config = configWith(current.manager);
    panel(config.config, true);
    await vi.waitFor(() => expect(mocks.mouse).toHaveBeenCalled());
    const props = mocks.mouse.mock.calls.at(-1)![0] as RowMouseControllerProps;
    props.onSelectIndex(1);
    expect(mocks.select).toHaveBeenCalledWith('click-1');
    props.onSelectIndex(99);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
  it('tracks manual task assignment and clears completed tasks without reflow or polling reads', async () => {
    const current = team('manual');
    const config = configWith(current.manager);
    const ui = panel(config.config);
    await vi.waitFor(() => {
      expect(current.on).toHaveBeenCalledWith(
        TeamEventType.TASK_AUTO_CLAIMED,
        expect.any(Function),
      );
      expect(mocks.taskListeners.size).toBe(1);
      expect(mocks.list).toHaveBeenCalled();
    });
    const beforeRows = ui.lastFrame()!.split('\n').length;
    const callsBefore = mocks.list.mock.calls.length;
    mocks.tasks = [
      {
        owner: 'manual teammate 0',
        subject: 'Manual task',
        activeForm: 'Reviewing assigned task',
      },
    ];
    for (const listener of mocks.taskListeners) listener('unrelated-team');
    expect(mocks.list.mock.calls.length).toBe(callsBefore);
    for (const listener of mocks.taskListeners) listener('manual');
    await vi.waitFor(() =>
      expect(ui.lastFrame()).toContain('Reviewing assigned task'),
    );
    expect(ui.lastFrame()!.split('\n').length).toBe(beforeRows);
    mocks.tasks = [];
    current.setStatus('idle');
    for (const listener of mocks.taskListeners) listener('manual');
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Resting'));
    expect(ui.lastFrame()).not.toContain('Reviewing assigned task');
    expect(ui.lastFrame()!.split('\n').length).toBe(beforeRows);
  });

  it('publishes footprint changes when a manager appears and disappears with the same agent count', async () => {
    const current = team('late');
    const config = configWith(null);
    const ui = panel(config.config);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).toBe('');
      expect(config.callbacks.size).toBe(1);
      expect(mocks.layout).toHaveBeenLastCalledWith('');
    });
    config.replace(current.manager);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).toContain('late teammate 0');
      expect(mocks.layout.mock.calls.at(-1)![0]).not.toBe('');
    });
    config.replace(null);
    await vi.waitFor(() => {
      expect(ui.lastFrame()).toBe('');
      expect(mocks.layout).toHaveBeenLastCalledWith('');
    });
  });
});

describe('GroupCards physical layout', () => {
  const cards: GroupCard[] = Array.from({ length: 5 }, (_, index) => ({
    id: `id-${index}`,
    name: `漢字🙂 teammate ${index}`,
    model: 'Long Unicode 模型🙂'.repeat(4),
    status: 'running',
    activity: 'Investigating narrow terminal output '.repeat(4),
  }));
  it.each([
    [12, 10, 2],
    [20, 23, 2],
    [40, 24, 5],
    [40, 39, 5],
    [20, 40, 9],
  ])(
    'fits width %i and terminal height %i within %i card rows',
    (width, height, maxRows) => {
      const ui = render(
        <GroupCards
          cards={cards}
          width={width!}
          height={height!}
          onSelect={vi.fn()}
        />,
      );
      mounted.push(ui);
      const lines = stripAnsi(ui.lastFrame()!).split('\n');
      expect(lines.length).toBeLessThanOrEqual(maxRows!);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((line) => stringWidth(line) <= width!)).toBe(true);
    },
  );
});
