/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
  type DescriptiveRadioButtonSelectProps,
} from './DescriptiveRadioButtonSelect.js';

vi.mock('./BaseSelectionList.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./BaseSelectionList.js')>();
  return {
    ...actual,
    BaseSelectionList: vi.fn(({ children, ...props }) => (
      <actual.BaseSelectionList {...props}>{children}</actual.BaseSelectionList>
    )),
  };
});

vi.mock('../../semantic-colors.js', () => ({
  theme: {
    text: {
      primary: 'COLOR_PRIMARY',
      secondary: 'COLOR_SECONDARY',
    },
    status: {
      success: 'COLOR_SUCCESS',
    },
  },
}));

describe('DescriptiveRadioButtonSelect', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();

  const ITEMS: Array<DescriptiveRadioSelectItem<string>> = [
    {
      title: 'Foo Title',
      description: 'This is Foo.',
      value: 'foo',
      key: 'foo',
    },
    {
      title: 'Bar Title',
      description: 'This is Bar.',
      value: 'bar',
      key: 'bar',
    },
    {
      title: 'Baz Title',
      description: 'This is Baz.',
      value: 'baz',
      disabled: true,
      key: 'baz',
    },
  ];

  const renderComponent = (
    props: Partial<DescriptiveRadioButtonSelectProps<string>> = {},
  ) => {
    const defaultProps: DescriptiveRadioButtonSelectProps<string> = {
      items: ITEMS,
      onSelect: mockOnSelect,
      ...props,
    };
    return renderWithProviders(
      <DescriptiveRadioButtonSelect {...defaultProps} />,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly with default props', () => {
    const { lastFrame } = renderComponent();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should render correctly with custom props', () => {
    const { lastFrame } = renderComponent({
      initialIndex: 1,
      isFocused: false,
      showScrollArrows: true,
      maxItemsToShow: 5,
      showNumbers: true,
      onHighlight: mockOnHighlight,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('uses one bounded row per option in compact mode', () => {
    const { lastFrame } = renderComponent({ compact: true });
    expect(lastFrame()).toBe('▸ Foo Title\n  Bar Title\n  Baz Title');
  });

  it('bounds explicit line breaks in compact option content', () => {
    const { lastFrame } = renderComponent({
      compact: true,
      items: [
        {
          title: <Text>{'Visible first line\nHidden second line'}</Text>,
          description: 'Optional description',
          value: 'multiline',
          key: 'multiline',
        },
      ],
    });
    expect(lastFrame()).toBe('▸ Visible first line');
  });

  it('bounds long Unicode option titles to the actual parent width', () => {
    const { lastFrame } = renderWithProviders(
      <Box width={20}>
        <DescriptiveRadioButtonSelect
          compact
          onSelect={mockOnSelect}
          items={[
            {
              title: <Text>{'漢字🙂'.repeat(20)}</Text>,
              description: 'hidden optional description',
              value: 'wide',
              key: 'wide',
            },
          ]}
        />
      </Box>,
    );
    const lines = lastFrame()!.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('▸');
    expect(stringWidth(lines[0]!)).toBeLessThanOrEqual(20);
    expect(lastFrame()).not.toContain('hidden optional description');
  });

  it('does not render empty description rows', () => {
    const { lastFrame } = renderComponent({
      items: [
        {
          title: 'Foo Title',
          description: '',
          value: 'foo',
          key: 'foo',
        },
        {
          title: 'Bar Title',
          description: '   ',
          value: 'bar',
          key: 'bar',
        },
      ],
    });

    expect(lastFrame()).toBe('▸ Foo Title\n  Bar Title');
  });

  it('renders a non-string (ReactNode) description', () => {
    const { lastFrame } = renderComponent({
      items: [
        {
          title: 'Foo Title',
          description: <Text>Custom node description</Text>,
          value: 'foo',
          key: 'foo',
        },
      ],
    });

    expect(lastFrame()).toBe('▸ Foo Title\n  Custom node description');
  });
});
