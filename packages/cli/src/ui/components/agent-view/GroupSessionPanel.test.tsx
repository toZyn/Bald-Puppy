/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import {
  GroupCards,
  groupCardLimit,
  type GroupCard,
} from './GroupSessionPanel.js';
const cards: GroupCard[] = Array.from({ length: 5 }, (_, index) => ({
  id: `agent-${index}`,
  name: `Test agent ${index}`,
  model: 'model-a',
  status: 'idle',
  activity: 'Reviewing backend tests',
}));
describe('GroupCards', () => {
  it('shows rounded cards and bounds the roster', () => {
    const { lastFrame } = render(
      <GroupCards cards={cards} width={40} height={40} onSelect={vi.fn()} />,
    );
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain('╭');
    expect(frame).toContain('Reviewing backend tests');
    expect(frame).toContain('+3 agents');
    expect(frame).not.toContain('Test agent 2');
    expect(frame.split('\n').every((line) => line.length <= 40)).toBe(true);
    expect(frame.split('\n').length).toBeLessThanOrEqual(9);
  });
  it('reserves only two rows for a short terminal', () => {
    const { lastFrame } = render(
      <GroupCards cards={cards} width={40} height={10} onSelect={vi.fn()} />,
    );
    expect(stripAnsi(lastFrame()!).split('\n')).toHaveLength(2);
    expect(lastFrame()).toContain('+4 agents');
    expect(groupCardLimit(10)).toBe(1);
  });
  it('keeps activity on one row and escapes terminal controls', () => {
    const { lastFrame } = render(
      <GroupCards
        cards={[
          {
            ...cards[0]!,
            name: 'Test\nagent',
            activity: 'hello\nworld\r\u001b[2J',
          },
        ]}
        width={40}
        height={40}
        onSelect={vi.fn()}
      />,
    );
    expect(lastFrame()).not.toContain('\u001b[2J');
    expect(lastFrame()).toContain('hello world');
    expect(stripAnsi(lastFrame()!).split('\n')).toHaveLength(4);
  });
  it('renders nothing for an empty roster', () => {
    const { lastFrame } = render(
      <GroupCards cards={[]} width={40} height={40} onSelect={vi.fn()} />,
    );
    expect(lastFrame()).toBe('');
  });
});
