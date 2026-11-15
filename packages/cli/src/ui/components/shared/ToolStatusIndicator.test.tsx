import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ToolStatusIndicator } from './ToolStatusIndicator.js';
import { ToolCallStatus } from '../../types.js';

describe('Zyn tool event indicator', () => {
  it.each([
    ToolCallStatus.Pending,
    ToolCallStatus.Success,
    ToolCallStatus.Confirming,
  ])('uses a tool event arrow for %s', (status) => {
    const view = render(
      <ToolStatusIndicator status={status} name="read_file" />,
    );
    expect(view.lastFrame()).toBe(' ⤳');
    view.unmount();
  });
  it('retains a distinct failed-tool indicator', () => {
    const view = render(
      <ToolStatusIndicator status={ToolCallStatus.Error} name="read_file" />,
    );
    expect(view.lastFrame()).toBe(' x');
    view.unmount();
  });
});
