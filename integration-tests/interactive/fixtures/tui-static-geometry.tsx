/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// Synthetic AgentView controller: actual Ink Static + production VP wrapper.
// It deliberately has no model, config, AgentCore or CLI startup dependencies.
import React, { useEffect, useRef, useState } from 'react';
import { Box, Static, Text, render } from 'ink';
import { useTerminalSize } from '../../../packages/cli/src/ui/hooks/useTerminalSize.js';
import { installTerminalRedrawOptimizer } from '../../../packages/cli/src/ui/utils/terminalRedrawOptimizer.js';
import { installSynchronizedOutput } from '../../../packages/cli/src/ui/utils/synchronizedOutput.js';
import {
  CLEAR_WINDOW_MS,
  installTerminalResizeReflow,
} from '../../../packages/cli/src/ui/utils/terminal-resize-reflow.js';

// External source modules can be transformed with tsx's classic JSX fallback.
Object.assign(globalThis, { React });
installTerminalRedrawOptimizer(process.stdout);
installSynchronizedOutput(process.stdout);
installTerminalResizeReflow(process.stdout, { virtualViewport: true });

function StaticAgentController() {
  const size = useTerminalSize();
  const previous = useRef(size);
  const [epoch, setEpoch] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 80);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      size.columns === previous.current.columns &&
      size.rows === previous.current.rows
    )
      return;
    previous.current = size;
    setEpoch((value) => value + 1);
    // The clear window can erase one-shot statics emitted by the first bump.
    // Re-emit after that window; this fixture isolates that controller contract.
    const timer = setTimeout(
      () => setEpoch((value) => value + 1),
      CLEAR_WINDOW_MS + 50,
    );
    return () => clearTimeout(timer);
  }, [size]);
  return (
    <Box flexDirection="column" width={size.columns}>
      <Static key={epoch} items={['ONE_SHOT_AGENT_HISTORY']}>
        {(item) => <Text key={item}>{item}</Text>}
      </Static>
      <Box flexDirection="column">
        <Text>Type your message</Text>
        <Text>Agent view running</Text>
        <Text>Live status {tick}</Text>
        <Text>Local fixture only</Text>
        <Text>
          Viewport {size.columns}x{size.rows}
        </Text>
        <Text>Composer ready</Text>
        <Text>Footer ready</Text>
        <Text>End of live frame</Text>
      </Box>
    </Box>
  );
}
render(<StaticAgentController />, { alternateScreen: true, maxFps: 60 });
