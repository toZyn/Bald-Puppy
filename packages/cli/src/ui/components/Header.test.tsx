/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Header, AuthDisplayType } from './Header.js';
import { getCachedStringWidth } from '../utils/textUtils.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';

vi.mock('../hooks/useTerminalSize.js');
const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

const defaultProps = {
  version: '1.0.0',
  authDisplayType: AuthDisplayType.QWEN_OAUTH,
  model: 'qwen-coder-plus',
  workingDirectory: '/home/user/projects/test',
};

describe('<Header />', () => {
  const originalNoColor = process.env['NO_COLOR'];

  beforeEach(() => {
    delete process.env['NO_COLOR'];
    useTerminalSizeMock.mockReturnValue({ columns: 120, rows: 24 });
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = originalNoColor;
    }
  });

  it('renders a compact brand panel on wide terminals', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).not.toContain('██╔═══██╗');
    expect(lastFrame()).toContain('> Bald Puppy');
  });

  it('hides the ASCII logo on narrow terminal', () => {
    useTerminalSizeMock.mockReturnValue({ columns: 60, rows: 24 });
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).not.toContain('██╔═══██╗');
    expect(lastFrame()).toContain('> Bald Puppy');
  });

  it.each([20, 40, 80, 120])(
    'fits Unicode metadata within %i columns after resize',
    (columns) => {
      useTerminalSizeMock.mockReturnValue({ columns, rows: 24 });
      const ui = render(
        <Header
          {...defaultProps}
          model={'very-long-model-'.repeat(12)}
          workingDirectory={'/' + '🎵'.repeat(60)}
        />,
      );
      for (const line of (ui.lastFrame() ?? '').split('\n')) {
        expect(getCachedStringWidth(line)).toBeLessThanOrEqual(columns);
        expect(line).not.toMatch(/[\uD800-\uDFFF]/u);
        expect(line).not.toContain('�');
      }
      useTerminalSizeMock.mockReturnValue({ columns: 20, rows: 24 });
      ui.rerender(<Header {...defaultProps} model="next-model" />);
      for (const line of (ui.lastFrame() ?? '').split('\n'))
        expect(getCachedStringWidth(line)).toBeLessThanOrEqual(20);
      ui.unmount();
    },
  );

  it('keeps cwd metadata and removes the Qwen model-change hint from the compact banner', () => {
    const ui = render(<Header {...defaultProps} />);
    expect(ui.lastFrame()).toContain('cwd: /home/user/projects/test');
    expect(ui.lastFrame()).not.toContain('/model to change');
    ui.unmount();
  });

  it('displays the version number', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).toContain('v1.0.0');
  });

  it('shows a non-semver fallback like "unknown" without a bogus "v" prefix', () => {
    const { lastFrame } = render(
      <Header {...defaultProps} version="unknown" />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('(unknown)');
    expect(frame).not.toContain('vunknown');
  });

  it('displays auth type and model', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).toContain('Qwen OAuth');
    expect(lastFrame()).toContain('qwen-coder-plus');
  });

  it('displays Coding Plan auth type', () => {
    const { lastFrame } = render(
      <Header
        {...defaultProps}
        authDisplayType={AuthDisplayType.CODING_PLAN}
      />,
    );
    expect(lastFrame()).toContain('Coding Plan');
  });

  it('displays API Key auth type', () => {
    const { lastFrame } = render(
      <Header {...defaultProps} authDisplayType={AuthDisplayType.API_KEY} />,
    );
    expect(lastFrame()).toContain('API Key');
  });

  it.each(['plus', 'pro'] as const)(
    'shows the confirmed %s subscription plan and provider',
    (subscriptionPlan) => {
      const ui = render(
        <Header
          {...defaultProps}
          authDisplayType="Qwen Subscription"
          subscriptionPlan={subscriptionPlan}
          model="qwen3.8-max"
        />,
      );
      expect(ui.lastFrame()).toContain(
        `Qwen ${subscriptionPlan === 'pro' ? 'Pro' : 'Plus'} | [Qwen Subscription] qwen3.8-max`,
      );
      ui.unmount();
    },
  );

  it('does not invent a plan when subscription membership is unconfirmed', () => {
    const ui = render(
      <Header
        {...defaultProps}
        authDisplayType="Qwen Subscription"
        model="qwen3.8-max"
      />,
    );
    expect(ui.lastFrame()).toContain('[Qwen Subscription] qwen3.8-max');
    expect(ui.lastFrame()).not.toContain('Qwen Pro');
    expect(ui.lastFrame()).not.toContain('Qwen Plus');
    ui.unmount();
  });

  it('displays custom provider auth labels as-is', () => {
    const { lastFrame } = render(
      <Header {...defaultProps} authDisplayType="OpenRouter" />,
    );
    expect(lastFrame()).toContain('OpenRouter');
    expect(lastFrame()).not.toContain('Unknown');
  });

  it('displays Unknown when auth type is not set', () => {
    const { lastFrame } = render(
      <Header {...defaultProps} authDisplayType={undefined} />,
    );
    expect(lastFrame()).toContain('Unknown');
  });

  it('displays working directory', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).toContain('/home/user/projects/test');
  });

  it('renders with border around info panel', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).toContain('┌');
    expect(lastFrame()).toContain('┐');
  });

  it('renders plain text when NO_COLOR disables gradient colors', () => {
    process.env['NO_COLOR'] = '1';

    const { lastFrame } = render(<Header {...defaultProps} />);

    expect(lastFrame()).not.toContain('██╔═══██╗');
    expect(lastFrame()).toContain('> Bald Puppy');
  });

  it('renders the custom subtitle in place of the blank spacer row', () => {
    const { lastFrame } = render(
      <Header
        {...defaultProps}
        customBannerSubtitle="Built-in DataWorks Official Skills"
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Built-in DataWorks Official Skills');
    // Subtitle sits between the title and the auth line.
    const titleIdx = frame.indexOf('> Bald Puppy');
    const subtitleIdx = frame.indexOf('Built-in DataWorks Official Skills');
    const authIdx = frame.indexOf('Qwen OAuth');
    expect(titleIdx).toBeLessThan(subtitleIdx);
    expect(subtitleIdx).toBeLessThan(authIdx);
  });

  it.each([undefined, 'Custom subtitle'])(
    'removes only the default subscription spacer and preserves subtitle %s',
    (customBannerSubtitle) => {
      useTerminalSizeMock.mockReturnValue({ columns: 60, rows: 24 });
      const ui = render(
        <Header
          {...defaultProps}
          authDisplayType="Qwen Subscription"
          subscriptionPlan="pro"
          model="qwen3.8-max"
          customBannerSubtitle={customBannerSubtitle}
        />,
      );
      const lines = (ui.lastFrame() ?? '').split('\n');
      const title = lines.findIndex((line) => line.includes('> Bald Puppy'));
      const plan = lines.findIndex((line) =>
        line.includes('Qwen Pro | [Qwen Subscription]'),
      );
      expect(plan - title).toBe(customBannerSubtitle ? 2 : 1);
      if (customBannerSubtitle)
        expect(lines[title + 1]).toContain(customBannerSubtitle);
      ui.unmount();
    },
  );

  it('renders compact account metadata without a subtitle', () => {
    const { lastFrame } = render(<Header {...defaultProps} />);
    const frame = lastFrame() ?? '';
    // Title and auth still both render at their usual positions; the
    // spacer between them is just whitespace-padding, so we assert the
    // visible chrome the user sees.
    expect(frame).toContain('> Bald Puppy');
    expect(frame).toContain('Qwen OAuth');
  });

  it('renders the custom banner title in place of the default brand', () => {
    const { lastFrame } = render(
      <Header {...defaultProps} customBannerTitle="Acme CLI" />,
    );
    expect(lastFrame()).toContain('Acme CLI');
    expect(lastFrame()).not.toContain('> Bald Puppy');
    // version suffix is still appended
    expect(lastFrame()).toContain('v1.0.0');
  });

  it('renders the custom large tier when it fits', () => {
    const { lastFrame } = render(
      <Header
        {...defaultProps}
        customAsciiArt={{ small: 'SMALL', large: 'LARGE_LOGO' }}
      />,
    );
    expect(lastFrame()).toContain('LARGE_LOGO');
    expect(lastFrame()).not.toContain('██╔═══██╗');
  });

  it('falls back to the small tier when the large one does not fit', () => {
    useTerminalSizeMock.mockReturnValue({ columns: 70, rows: 24 });
    const { lastFrame } = render(
      <Header
        {...defaultProps}
        customAsciiArt={{
          small: 'sm',
          large: 'X'.repeat(60),
        }}
      />,
    );
    expect(lastFrame()).toContain('sm');
    expect(lastFrame()).not.toContain('X'.repeat(60));
  });

  it('hides the logo column when neither custom tier fits — does NOT fall back to the default Qwen logo (preserves white-label intent)', () => {
    const { lastFrame } = render(
      <Header
        {...defaultProps}
        customAsciiArt={{ small: 'X'.repeat(150), large: 'Y'.repeat(150) }}
      />,
    );
    expect(lastFrame()).not.toContain('██╔═══██╗');
    expect(lastFrame()).not.toContain('X'.repeat(150));
    expect(lastFrame()).not.toContain('Y'.repeat(150));
    // Info panel still renders.
    expect(lastFrame()).toContain('Qwen OAuth');
  });

  it('keeps the compact default panel without custom art', () => {
    useTerminalSizeMock.mockReturnValue({ columns: 60, rows: 24 });
    const { lastFrame } = render(<Header {...defaultProps} />);
    expect(lastFrame()).toContain('> Bald Puppy');
  });
});
