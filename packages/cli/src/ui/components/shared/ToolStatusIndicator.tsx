/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ToolCallStatus } from '../../types.js';
import { RespondingSpinner } from '../RespondingSpinner.js';
import { SHELL_COMMAND_NAME, SHELL_NAME } from '../../constants.js';
import { theme } from '../../semantic-colors.js';

// The history gutter contributes two columns; reserve one more before the
// glyph and one after it so tool titles and details align with message bodies.
export const STATUS_INDICATOR_WIDTH = 3;

type ToolStatusIndicatorProps = {
  status: ToolCallStatus;
  name: string;
};

export const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
  name,
}) => {
  const isShell = name === SHELL_COMMAND_NAME || name === SHELL_NAME;
  const statusColor = isShell ? theme.ui.symbol : theme.status.warning;
  const toolColor = theme.ui.tool ?? theme.text.link;

  return (
    // minWidth (not width) so the box can grow for wider content like the
    // tmux spinner frames or test mocks; all production glyphs are ≤2 cols.
    <Box minWidth={STATUS_INDICATOR_WIDTH} paddingLeft={1} flexShrink={0}>
      {status === ToolCallStatus.Pending && <Text color={toolColor}>⤳</Text>}
      {status === ToolCallStatus.Executing && (
        <RespondingSpinner spinnerType="toggle" nonRespondingDisplay="⤳" />
      )}
      {status === ToolCallStatus.Success && (
        <Text color={theme.status.success} aria-label={'Success:'}>
          ⤳
        </Text>
      )}
      {status === ToolCallStatus.Confirming && (
        <Text color={toolColor} aria-label={'Confirming:'}>
          ⤳
        </Text>
      )}
      {status === ToolCallStatus.Canceled && (
        <Text color={statusColor} aria-label={'Canceled:'} bold>
          ▲
        </Text>
      )}
      {status === ToolCallStatus.Error && (
        <Text color={theme.status.error} aria-label={'Error:'} bold>
          x
        </Text>
      )}
    </Box>
  );
};
