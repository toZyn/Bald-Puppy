/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import type { SemanticColors } from './semantic-tokens.js';

const qwenDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#212823',
  Foreground: '#ffffff',
  LightBlue: '#6699cc',
  AccentBlue: '#d4a054',
  AccentPurple: '#d4a054',
  AccentCyan: '#66cccc',
  AccentGreen: '#6aab6a',
  AccentYellow: '#ccaa44',
  AccentRed: '#cc5555',
  AccentYellowDim: '#6a5522',
  AccentRedDim: '#6a3333',
  DiffAdded: '#6aab6a',
  DiffRemoved: '#cc5555',
  Comment: '#999999',
  Gray: '#999999',
  GradientColors: ['#d4a054', '#c49450'],
};

const baldPuppySemanticColors: SemanticColors = {
  text: {
    primary: '#ffffff',
    secondary: '#999999',
    link: '#6699cc',
    accent: '#d4a054',
    code: '#66cccc',
  },
  background: {
    primary: '#212823',
    diff: { added: '#203520', removed: '#3b2020' },
  },
  border: { default: '#555555', focused: '#d4a054' },
  ui: {
    comment: '#999999',
    symbol: '#888888',
    gradient: ['#d4a054', '#c49450'],
  },
  status: {
    error: '#cc5555',
    success: '#6aab6a',
    warning: '#ccaa44',
    errorDim: '#6a3333',
    warningDim: '#6a5522',
  },
};

export const QwenDark: Theme = new Theme(
  'Qwen Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: qwenDarkColors.Background,
      color: qwenDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: qwenDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: qwenDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: qwenDarkColors.LightBlue,
    },
    'hljs-link': {
      color: qwenDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: qwenDarkColors.Foreground,
    },
    'hljs-string': {
      color: qwenDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: qwenDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: qwenDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: qwenDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: qwenDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: qwenDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: qwenDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: qwenDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  qwenDarkColors,
  baldPuppySemanticColors,
);
