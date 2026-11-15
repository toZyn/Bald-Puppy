/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { TeamEventType } from '@qwen-code/qwen-code-core/agents/team/team-events.js';
import type { TeamManager } from '@qwen-code/qwen-code-core/agents/team/TeamManager.js';
import {
  listTasks,
  onTasksUpdated,
} from '@qwen-code/qwen-code-core/agents/team/tasks.js';
import { ConfigContext } from '../../contexts/ConfigContext.js';
import {
  useAgentViewActions,
  useAgentViewState,
} from '../../contexts/AgentViewContext.js';
import { useMouseTrackingEnabled } from '../../hooks/use-mouse-tracking-enabled.js';
import { RowMouseController } from '../shared/RowMouseController.js';
import { sanitizeMultilineForDisplay } from '../../utils/textUtils.js';
import { theme } from '../../semantic-colors.js';

function oneLine(value: string): string {
  return sanitizeMultilineForDisplay(value).replace(/\s+/g, ' ').trim();
}

export interface GroupCard {
  id: string;
  name: string;
  model: string;
  status: string;
  activity: string;
}

/** Fixed row budget: updating activity never changes the composer's footprint. */
export function groupCardLimit(height: number): number {
  return height < 40 ? 1 : 2;
}

export function GroupCards({
  cards,
  width,
  height,
  mouseEnabled = false,
  onSelect,
}: {
  cards: readonly GroupCard[];
  width: number;
  height: number;
  mouseEnabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<DOMElement | null>(null);
  const itemRefs = useRef<Array<DOMElement | null>>([]);
  const visible = cards.slice(0, groupCardLimit(height)).map((card) => ({
    ...card,
    name: oneLine(card.name),
    model: oneLine(card.model),
    status: oneLine(card.status),
    activity: oneLine(card.activity),
  }));
  if (!cards.length || width < 12) return null;
  const compact = height < 24;
  return (
    <Box ref={containerRef} width={width} flexDirection="column">
      {visible.map((card, index) => (
        <Box
          key={card.id}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          flexDirection="column"
          borderStyle={compact ? undefined : 'round'}
          borderColor={theme.border.default}
          width={width}
        >
          <Text wrap="truncate-end">
            <Text bold color={theme.text.accent}>
              {card.name}
            </Text>{' '}
            · {card.status}
            {!compact && ` · ${card.model}`}
          </Text>
          {!compact && (
            <Text wrap="truncate-end" color={theme.text.secondary}>
              {card.activity}
            </Text>
          )}
        </Box>
      ))}
      {cards.length > visible.length && (
        <Text wrap="truncate-end" color={theme.text.secondary}>
          +{cards.length - visible.length} agents · ←/→ tabs
        </Text>
      )}
      {mouseEnabled && (
        <RowMouseController
          containerRef={containerRef}
          itemRefs={itemRefs}
          scrollOffset={0}
          onHoverIndex={() => {}}
          onSelectIndex={(index) => {
            const card = visible[index];
            if (card) onSelect(card.id);
          }}
        />
      )}
    </Box>
  );
}

export function GroupSessionPanel({
  width,
  height,
  alternateScreen,
}: {
  width: number;
  height: number;
  alternateScreen: boolean;
}) {
  const config = useContext(ConfigContext);
  const { agents } = useAgentViewState();
  const { switchToAgent, setGroupPanelLayoutKey } = useAgentViewActions();
  const mouseEnabled = useMouseTrackingEnabled();
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [, refresh] = useState(0);
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [manager, setManager] = useState<TeamManager | null>(
    () => config?.getTeamManager() ?? null,
  );
  useEffect(() => {
    const changed = (next: TeamManager | null) => setManager(next);
    config?.onTeamManagerChange(changed);
    setManager(config?.getTeamManager() ?? null);
    return () => config?.onTeamManagerChange(null, changed);
  }, [config]);

  useEffect(() => {
    setTaskTitles({});
    if (!manager) return;
    const teamName = manager.getTeamFile().name;
    let disposed = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      const currentRevision = ++revision;
      try {
        const tasks = await listTasks(teamName, { status: 'in_progress' });
        if (disposed || currentRevision !== revision) return;
        const titles: Record<string, string> = {};
        for (const task of tasks) {
          if (task.owner && !titles[task.owner])
            titles[task.owner] = task.activeForm || task.subject;
        }
        setTaskTitles(titles);
      } catch {
        // A deleted/inaccessible task board must not take down the terminal.
        if (!disposed && currentRevision === revision) setTaskTitles({});
      }
    };
    const unsubscribe = onTasksUpdated((changedTeam) => {
      if (changedTeam !== teamName) return;
      ++revision;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void update();
      }, 150);
    });
    void update();
    return () => {
      disposed = true;
      ++revision;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [manager]);

  useEffect(() => {
    setActivities({});
    if (!manager) return;
    const emitter = manager.getEventEmitter();
    const joined = (event: { agentId: string; name: string }) => {
      setActivities((previous) => ({
        ...previous,
        [event.agentId]: `${event.name} has joined`,
      }));
    };
    const task = (event: { agentId: string; taskSubject: string }) => {
      setActivities((previous) => ({
        ...previous,
        [event.agentId]: event.taskSubject,
      }));
    };
    emitter.on(TeamEventType.TEAMMATE_JOINED, joined);
    emitter.on(TeamEventType.TASK_AUTO_CLAIMED, task);
    // Poll status only; no file reads, provider calls or transcript append operations.
    const timer = setInterval(() => refresh((value) => value + 1), 1000);
    return () => {
      clearInterval(timer);
      emitter.off(TeamEventType.TEAMMATE_JOINED, joined);
      emitter.off(TeamEventType.TASK_AUTO_CLAIMED, task);
    };
  }, [manager]);

  const cards =
    manager?.getTeamFile().members.flatMap((member) => {
      const registered = agents.get(member.agentId);
      if (!registered) return [];
      const status = registered.interactiveAgent.getStatus();
      const recentJoin = Date.now() - member.joinedAt < 5000;
      return [
        {
          id: member.agentId,
          name: member.name,
          model: member.model ?? '',
          status,
          activity:
            taskTitles[member.name] ??
            (recentJoin
              ? `${member.name} has joined`
              : status === 'idle'
                ? 'Resting · ready for a message'
                : (activities[member.agentId] ??
                  'Open conversation for details')),
        },
      ];
    }) ?? [];
  const layoutKey =
    cards.length && width >= 12
      ? `${height < 24 ? 'compact' : 'round'}:${Math.min(cards.length, groupCardLimit(height))}:${cards.length > groupCardLimit(height)}`
      : '';
  useEffect(() => {
    setGroupPanelLayoutKey(layoutKey);
    return () => setGroupPanelLayoutKey('');
  }, [layoutKey, setGroupPanelLayoutKey]);
  return (
    <GroupCards
      cards={cards}
      width={width}
      height={height}
      mouseEnabled={alternateScreen && mouseEnabled}
      onSelect={switchToAgent}
    />
  );
}
