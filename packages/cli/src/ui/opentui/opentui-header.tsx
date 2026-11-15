/* eslint-disable react/no-unknown-property */
/** @jsxImportSource @opentui/react */
/**
 * @license
 * Copyright 2026 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenTUI banner matching the compact Ink header, with optional custom art.
 *
 * Memoized on visible account, model and theme values, so streaming does not
 * rebuild the banner; resize re-renders without flicker via the erase-free
 * painter. Honours the same custom-banner resolution as ink (hideBanner /
 * customAsciiArt / customBannerTitle / customBannerSubtitle) and suppresses in
 * screen-reader mode.
 */

import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { Config } from '@qwen-code/qwen-code-core';
import { findProviderByCredentials } from '@qwen-code/qwen-code-core/providers/all-providers.js';
import { resolveMetadataKey } from '@qwen-code/qwen-code-core/providers/provider-config.js';
import {
  shortenPath,
  tildeifyPath,
} from '@qwen-code/qwen-code-core/utils/paths.js';
import type { LoadedSettings } from '../../config/settings.js';
import { formatVersionLabel } from '../../utils/version.js';
import { C, GRADIENT, THEME_REVISION } from './theme.js';
import {
  getAsciiArtWidth,
  getCachedStringWidth,
  truncateToWidth,
} from '../utils/textUtils.js';
import {
  pickAsciiArtTier,
  resolveCustomBanner,
} from '../utils/customBanner.js';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(rgb: readonly number[]): string {
  return (
    '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  );
}

/**
 * One line of the wordmark, sampled the way ink samples it. `ink-gradient`
 * wraps ink's `Transform`, which runs `gradient.multiline()` per laid-out
 * line, so each line builds its own `tinygradient.rgb(steps)`: the segments
 * between stops get `round((steps - 1) / segments)` substeps, rebalanced
 * until they sum to `steps - 1`, and each segment then steps from its own
 * start. Sharing one ramp across lines, or lerping on a plain
 * `t = i / (len - 1)`, drifts a unit or two per channel and leaves a shorter
 * line one step short of the last stop.
 */
function lineRamp(stops: string[], steps: number): string[] {
  const rgb = stops.map(hexToRgb);
  const segments = rgb.length - 1;
  const substeps = Array.from({ length: segments }, () =>
    Math.max(1, Math.round((steps - 1) / segments)),
  );
  let total = substeps.reduce((sum, n) => sum + n, 1);
  while (total !== steps) {
    const grow = total < steps;
    const target = grow ? Math.min(...substeps) : Math.max(...substeps);
    substeps[substeps.indexOf(target)] += grow ? 1 : -1;
    total += grow ? 1 : -1;
  }
  const ramp: string[] = [];
  for (let s = 0; s < segments; s++) {
    const from = rgb[s];
    const to = rgb[s + 1];
    const n = substeps[s];
    ramp.push(rgbToHex(from));
    for (let i = 1; i < n; i++) {
      ramp.push(rgbToHex(from.map((v, k) => ((to[k] - v) / n) * i + v)));
    }
  }
  ramp.push(rgbToHex(rgb[segments]));
  return ramp;
}

/** ASCII logo with the active theme's horizontal gradient (ink `ui.gradient`). */
function GradientLogo({ logo }: { logo: string }) {
  const stops = GRADIENT;
  const lines = logo.replace(/^\n/, '').split('\n');
  return (
    <box flexDirection="column" flexShrink={0}>
      {lines.map((line, li) => {
        const chars = [...line];
        const ramp =
          stops.length >= 2
            ? lineRamp(stops, Math.max(chars.length, stops.length))
            : [];
        return (
          <box key={li} flexDirection="row">
            {chars.map((ch, ci) => (
              <text key={ci} fg={ramp[ci]}>
                {ch}
              </text>
            ))}
          </box>
        );
      })}
    </box>
  );
}

/**
 * Faithful port of the ink `Header`: a single-border info panel with title,
 * optional subtitle, auth|model(+hint), and directory —
 * laid out two-column only when explicit custom art fits. Same data sources as the original, including the AppHeader
 * custom-banner resolution.
 */
function buildBanner(
  config: Config,
  settings: LoadedSettings,
  width: number,
  subscriptionPlan?: 'plus' | 'pro',
) {
  const versionLabel = formatVersionLabel(config.getCliVersion() ?? 'unknown');
  const cg = config.getContentGeneratorConfig();
  const model = config.getModelDisplayName();
  const targetDir = config.getTargetDir();
  // auth label (mirrors AppHeader.getAuthDisplayType)
  let authLabel = '';
  try {
    if (cg?.authType && cg.authType !== 'qwen-subscription') {
      const matched = findProviderByCredentials(cg.baseUrl, cg.apiKeyEnvKey);
      authLabel =
        (matched && resolveMetadataKey(matched) && matched.label) ||
        (cg.authType === 'qwen-oauth' ? 'Qwen OAuth' : 'API Key');
    }
  } catch {
    authLabel = '';
  }
  const authModelText =
    cg?.authType === 'qwen-subscription'
      ? `${subscriptionPlan ? `Qwen ${subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)} | ` : ''}[Qwen Subscription] ${model}`
      : authLabel
        ? `${authLabel} | ${model}`
        : model;
  const hint = ' (/model to change)';

  const custom = resolveCustomBanner(settings);
  const containerMarginX = width < 40 ? 0 : 2;
  const logoGap = 2;
  const infoPanelChromeWidth = 2 + 1 * 2; // border(2) + paddingX(1*2)
  const minInfoPanelWidth = 40 + infoPanelChromeWidth;
  const available = Math.max(0, width - containerMarginX * 2);
  const customTier = pickAsciiArtTier(
    custom.asciiArt.small,
    custom.asciiArt.large,
    available,
    logoGap,
    minInfoPanelWidth,
    getAsciiArtWidth,
  );
  const displayLogo = customTier ?? '';
  const logoWidth = getAsciiArtWidth(displayLogo);
  const showLogo =
    displayLogo !== '' && available >= logoWidth + logoGap + minInfoPanelWidth;
  const maxInfoPanelWidth = 72;
  const infoPanelWidth = showLogo
    ? Math.min(available - logoWidth - logoGap, maxInfoPanelWidth)
    : Math.min(available, maxInfoPanelWidth);
  const maxPathLength = Math.max(0, infoPanelWidth - infoPanelChromeWidth);
  const infoPanelContentWidth = Math.max(
    0,
    infoPanelWidth - infoPanelChromeWidth,
  );
  const showModelHint =
    infoPanelContentWidth > 0 &&
    getCachedStringWidth(authModelText + hint) <= infoPanelContentWidth;
  const shortenedPath = shortenPath(
    tildeifyPath(targetDir),
    Math.max(3, maxPathLength),
  );
  const displayPath = truncateToWidth(shortenedPath, maxPathLength);

  const title = custom.title ?? '> Bald Puppy';
  const versionSuffix = ` (${versionLabel})`;
  const titleWidth = getCachedStringWidth(title + versionSuffix);
  const infoPanel = (
    <box
      flexDirection="column"
      borderStyle="single"
      borderColor={C.borderDefault}
      paddingX={1}
      width={infoPanelWidth}
      flexShrink={0}
    >
      <box flexDirection="row">
        <text fg={C.accent} attributes={1}>
          {truncateToWidth(title, infoPanelContentWidth)}
        </text>
        {titleWidth <= infoPanelContentWidth && (
          <text fg={C.dim}>{versionSuffix}</text>
        )}
      </box>
      {custom.subtitle && (
        <text fg={C.dim}>
          {truncateToWidth(custom.subtitle, infoPanelContentWidth)}
        </text>
      )}
      <box flexDirection="row">
        <text fg={C.dim}>
          {truncateToWidth(authModelText, infoPanelContentWidth)}
        </text>
        {showModelHint && <text fg={C.dim}>{hint}</text>}
      </box>
      <text fg={C.dim}>
        {truncateToWidth(displayPath, infoPanelContentWidth)}
      </text>
    </box>
  );

  if (!showLogo) {
    return (
      <box
        marginLeft={containerMarginX}
        marginRight={containerMarginX}
        flexShrink={0}
      >
        {infoPanel}
      </box>
    );
  }
  return (
    <box
      flexDirection="row"
      alignItems="center"
      marginLeft={containerMarginX}
      marginRight={containerMarginX}
      flexShrink={0}
    >
      <GradientLogo logo={displayLogo} />
      <box width={logoGap} />
      {infoPanel}
    </box>
  );
}

export interface OpenTuiBannerProps {
  config: Config;
  settings: LoadedSettings;
}

/**
 * Renders the banner and subscription usage tip with their visibility settings.
 * Memoized on its inputs so streaming does not rebuild the banner.
 */
export function OpenTuiBanner({ config, settings }: OpenTuiBannerProps) {
  const { width } = useTerminalDimensions();
  const showBanner =
    !config.getScreenReader() && !settings.merged.ui?.hideBanner;
  const generatorConfig = config.getContentGeneratorConfig();
  const model = config.getModelDisplayName();
  const subscriptionPlan =
    generatorConfig?.authType === 'qwen-subscription'
      ? config.getSubscriptionPlan()
      : undefined;
  const banner = useMemo(
    () =>
      showBanner
        ? buildBanner(config, settings, width, subscriptionPlan)
        : null,
    // The palette is mutated in place and `settings` keeps its identity when
    // `/theme` writes it, so the revision is the only dep that sees a repaint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      showBanner,
      config,
      settings,
      width,
      THEME_REVISION,
      generatorConfig?.authType,
      generatorConfig?.baseUrl,
      generatorConfig?.apiKeyEnvKey,
      model,
      subscriptionPlan,
    ],
  );
  return banner;
}
