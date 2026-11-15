/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Offline acceptance test for orphan header borders after mobile keyboard resize.
 * Run after building dist/cli.js:
 * npx vitest run --root integration-tests interactive/tui-header-repaint.test.ts --maxWorkers=1 --minWorkers=1 --retry=0
 * TUI_FIDELITY_BUNDLE overrides the candidate; TUI_FIDELITY_OUT keeps evidence.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { InteractiveSession } from './interactive-session.js';
import {
  startFakeOpenAIServer,
  type FakeOpenAIServer,
} from '../fake-openai-server.js';
import { createUntil } from './wait.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const guard = join(here, 'fixtures/tui-local-only-network.cjs');
const proof = join(here, 'fixtures/tui-network-guard-proof.mjs');
const phrase = 'Defragmenting memories... both RAM and personal...';
const until = createUntil(20_000);
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const json = (file: string, value: unknown) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
type Frame = {
  label: string;
  columns: number;
  rows: number;
  viewport: string;
  screen: string;
  topBorders: number;
};

function lastUser(server: FakeOpenAIServer): string {
  const messages = server.requests.at(-1)?.body['messages'];
  if (!Array.isArray(messages)) throw new Error('mock request has no messages');
  const message = messages.findLast(
    (value: { role?: string }) => value.role === 'user',
  );
  if (typeof message?.content === 'string') return message.content;
  return (message?.content ?? [])
    .filter(
      (part: { type?: string; text?: string }) =>
        part.type === 'text' && !/^<system-reminder>/.test(part.text ?? ''),
    )
    .map((part: { text?: string }) => part.text ?? '')
    .join('');
}

async function scenario(name: 'minimal' | 'extended' | 'markdown') {
  const evidenceRoot =
    process.env['TUI_FIDELITY_OUT'] ??
    join(tmpdir(), 'bald-puppy-tui-fidelity');
  mkdirSync(evidenceRoot, { recursive: true });
  const evidence = mkdtempSync(join(evidenceRoot, `${name}-`));
  const scratch = mkdtempSync(join(tmpdir(), 'bald-puppy-tui-session-'));
  const home = join(scratch, 'qwen-home');
  const workspace = join(scratch, 'workspace');
  const runtime = join(scratch, 'runtime');
  for (const directory of [home, workspace, runtime]) mkdirSync(directory);
  const settings = {
    security: {
      auth: { selectedType: 'openai' },
      folderTrust: { enabled: false },
    },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
    general: { enableAutoUpdate: false, showSessionRecap: false },
    ui: { enableFollowupSuggestions: false, customWittyPhrases: [phrase] },
    memory: { enableManagedAutoMemory: false, enableManagedAutoDream: false },
  };
  json(join(scratch, 'system.json'), { $version: 4 });
  json(join(scratch, 'defaults.json'), { $version: 4 });
  // This proof executes under the same pre-bootstrap guard as the CLI. The
  // synthetic external destinations are rejected synchronously before DNS/I/O.
  const guardProof = execFileSync(
    process.execPath,
    ['--require', guard, proof],
    {
      env: { PATH: process.env['PATH'], TUI_MOCK_PORT: '54321' },
      encoding: 'utf8',
    },
  );
  expect(guardProof).toContain('PASS: 7');
  writeFileSync(join(evidence, 'network-guard-proof.txt'), guardProof);
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const server = await startFakeOpenAIServer(
    ({ requestIndex }) =>
      requestIndex === 0
        ? {
            contentChunks:
              name === 'markdown'
                ? [
                    '## Informe\n\n**`hora.js`** listo.\n\n',
                    '- Hora: **08:23:08**\n- Fecha: *2026-11-15*\n\n---\n\n```\nHora actual: 08:23:08\n',
                    'Fecha actual: 2026-11-15\n```\n\nMOCK_MARKDOWN_DONE',
                  ]
                : [
                    'MOCK_TURN_1_HEAD\n',
                    'Local streaming line\n',
                    'MOCK_TURN_1_DONE',
                  ],
            holdAfterChunks: name === 'markdown' ? 2 : 1,
            holdUntil: held,
          }
        : {
            content: `MOCK_TURN_${requestIndex + 1}_DONE\nLocal mock response only.`,
          },
    { listenHost: '127.0.0.1', baseUrlHost: '127.0.0.1' },
  );
  json(join(home, 'settings.json'), {
    ...settings,
    modelProviders: {
      openai: [
        { id: 'qwen-vl-baseline', name: 'Fixture baseline' },
        { id: 'fixture-second', name: 'Fixture second' },
      ].map((model) => ({
        ...model,
        baseUrl: server.baseUrl,
        envKey: 'TUI_FIXTURE_API_KEY',
      })),
    },
  });
  let session: InteractiveSession | undefined;
  let columns = 100,
    rows = 30;
  const frames: Frame[] = [];
  let failure: string | undefined;
  const frame = async (label: string) => {
    // Keep this cadence: it crosses the resize clear window while spinner
    // updates continue. Waiting for all animation to stop misses the bug.
    await sleep(450);
    const viewport = await session!.viewport();
    frames.push({
      label,
      columns,
      rows,
      viewport,
      screen: await session!.screen(),
      topBorders: viewport
        .split('\n')
        .filter((line) => /^\s*┌─+┐\s*$/.test(line)).length,
    });
    return viewport;
  };
  const resize = async (width: number, height: number, label: string) => {
    columns = width;
    rows = height;
    session!.resize(width, height);
    return frame(label);
  };
  const type = async (text: string) => {
    for (const char of text) {
      session!.pressKey(char);
      await sleep(8);
    }
  };
  try {
    const bundle =
      process.env['TUI_FIDELITY_BUNDLE'] ?? join(root, 'dist/cli.js');
    session = await InteractiveSession.start({
      cwd: workspace,
      cols: columns,
      rows,
      inheritEnv: false,
      command: {
        bin: process.execPath,
        args: [
          '--require',
          guard,
          bundle,
          '--auth-type',
          'openai',
          '--openai-api-key',
          'fixture-not-a-real-key',
          '--openai-base-url',
          server.baseUrl,
          '--model',
          'qwen-vl-baseline',
          '--approval-mode',
          'default',
        ],
      },
      env: {
        PATH: process.env['PATH'],
        QWEN_HOME: home,
        TUI_FIXTURE_API_KEY: 'fixture-not-a-real-key',
        QWEN_RUNTIME_DIR: runtime,
        QWEN_CODE_SYSTEM_SETTINGS_PATH: join(scratch, 'system.json'),
        QWEN_CODE_SYSTEM_DEFAULTS_PATH: join(scratch, 'defaults.json'),
        QWEN_USAGE_STATISTICS_ENABLED: '0',
        QWEN_TELEMETRY_ENABLED: '0',
        QWEN_CODE_DISABLE_CRON: '1',
        QWEN_CODE_SKIP_UPDATE_CHECK_ONCE: 'true',
        QWEN_CODE_MODELS_DEV_REFRESH: 'off',
        QWEN_SANDBOX: 'false',
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8',
        QWEN_CODE_LANG: 'en',
        NO_PROXY: '127.0.0.1',
        no_proxy: '127.0.0.1',
        TUI_MOCK_PORT: new URL(server.baseUrl).port,
        TUI_NETWORK_LOG: join(evidence, 'blocked-network.jsonl'),
      },
      onStartupFailure: (raw) =>
        writeFileSync(join(evidence, 'startup-failure.ansi'), raw),
    });
    await until(
      async () => !(await session!.viewport()).includes('Initializing...'),
      'CLI initialization',
    );
    await frame('ready');
    expect(session.output()).toContain('\x1b[?1049h');
    await session.send('First local fixture turn.');
    await until(() => server.requests.length === 1, 'first loopback request');
    await frame('stream-held');
    if (name === 'markdown') {
      for (const width of [80, 40]) {
        const live = await resize(width, 30, `markdown-live-${width}`);
        expect(live).toContain('hora.js listo.');
        expect(live).toContain('• Hora: 08:23:08');
        expect(live).toContain('Hora actual: 08:23:08');
        expect(live).toContain('────────');
        expect(live).not.toMatch(/^\s+─{1,2}\s*(?:[█│])?$/m);
        expect(live).not.toContain('**');
        expect(live).not.toContain('```');
        expect(live).not.toContain('`hora.js`');
        expect(live).not.toContain('MOCK_MARKDOWN_DONE');
        json(
          join(evidence, `markdown-live-${width}-cells.json`),
          await session.viewportCells({ includeBackground: true }),
        );
      }
      release();
      await until(
        async () => (await session!.viewport()).includes('MOCK_MARKDOWN_DONE'),
        'formatted final Markdown',
      );
      const done = await frame('markdown-done');
      expect(done).toContain('Fecha actual: 2026-11-15');
      expect(done).not.toContain('```');
      expect(server.requests).toHaveLength(1);
      return;
    }
    const sequence =
      name === 'minimal'
        ? [
            [40, 12],
            [40, 30],
          ]
        : [
            [99, 30],
            [100, 30],
            [100, 12],
            [100, 30],
            [40, 12],
            [40, 30],
            [20, 10],
            [80, 30],
          ];
    for (const [width, height] of sequence)
      await resize(width!, height!, `held-${width}x${height}`);
    const narrowHeader = frames.find((value) => value.label === 'held-40x30');
    expect(
      narrowHeader?.topBorders,
      `one complete narrow header; evidence: ${evidence}`,
    ).toBe(1);
    expect(narrowHeader?.viewport.match(/│ > Bald Puppy/g)).toHaveLength(1);
    release();
    await until(
      async () => (await session!.screen()).includes('MOCK_TURN_1_DONE'),
      'first response completion',
    );
    await frame('turn-1-done');
    // Exercise printable keys, bracketed Unicode paste and grapheme-aware
    // left/right/backspace through the actual composer, then assert the wire.
    await type('Second local turn ');
    session.pressKey('\x1b[200~café 漢字 🐕\x1b[201~');
    await sleep(200);
    session.pressKey('\x1b[D');
    session.pressKey('\x1b[C');
    session.pressKey('\x7f');
    await type('Z');
    await frame('unicode-edited-input');
    session.pressKey('\r');
    await until(
      async () => (await session!.screen()).includes('MOCK_TURN_2_DONE'),
      'second response completion',
    );
    expect(server.requests).toHaveLength(2);
    expect(lastUser(server)).toBe('Second local turn café 漢字 Z');
    await frame('turn-2-done');
    if (name === 'extended') {
      session.pressKey('/');
      expect(await frame('slash-menu')).toContain('model');
      session.pressKey('\x1b');
      await sleep(150);
      session.pressKey('\x7f');
      await sleep(150);
      await session.send('/model');
      await until(
        async () => (await session!.viewport()).includes('Select Model'),
        'actual model picker',
      );
      await frame('model-dialog');
      for (const [width, height] of [
        [79, 30],
        [80, 12],
        [40, 10],
        [80, 30],
      ]) {
        const view = await resize(width!, height!, `model-${width}x${height}`);
        expect(view).toContain('Select Model');
        expect(view).toContain('▸');
        if (height === 10) {
          expect(view).toContain('↑↓');
          expect(view).toContain('Enter');
          expect(view).toContain('Esc');
          expect(view).not.toContain('Context Window');
          session.pressKey('\x1b[B');
          await session.idle();
          const navigated = await frame('model-narrow-navigate');
          const selectedBefore = view
            .split('\n')
            .find((line) => line.includes('▸'));
          const selectedAfter = navigated
            .split('\n')
            .find((line) => line.includes('▸'));
          expect(selectedAfter).toContain('Fixture second');
          expect(selectedAfter).not.toBe(selectedBefore);
          expect(navigated).toContain('Esc');
        }
        if (height === 30) expect(view).toContain('Context Window');
      }
      session.pressKey('\x1b');
      await until(
        async () => !(await session!.viewport()).includes('Select Model'),
        'model dialog close',
      );
      await frame('model-closed');
      for (const [width, height] of [
        [100, 40],
        [100, 30],
        [80, 30],
        [40, 30],
      ]) {
        const viewport = await resize(
          width!,
          height!,
          `representative-${width}x${height}`,
        );
        json(
          join(evidence, `representative-${width}x${height}-cells.json`),
          await session.viewportCells({ includeBackground: true }),
        );
        const lines = viewport.split('\n');
        const prompt = lines.findIndex((line) => /^\s*❯/.test(line));
        expect(
          prompt,
          `unboxed main composer; evidence: ${evidence}`,
        ).toBeGreaterThanOrEqual(0);
        expect(lines[prompt]).not.toMatch(/[│┃┌┐╭╮]/u);
        expect(lines[prompt - 1] ?? '').not.toMatch(/^\s*[─━]{8,}\s*$/u);
        if (width! >= 80) {
          expect(viewport).toContain('> You');
          expect(viewport).toContain('◉ Bald Puppy');
          expect(viewport).toContain('qwen-vl-baseline');
          expect(viewport).toContain('/help');
        }
      }
      expect(server.requests).toHaveLength(2);
    }
    // Check every captured frame rather than only the last: a later full
    // clear can hide the stale borders left by an earlier resize.
    expect(
      frames.filter((value) => value.topBorders > 1),
      `orphan borders; evidence: ${evidence}`,
    ).toEqual([]);
  } catch (error) {
    failure = String(error);
    throw error;
  } finally {
    release();
    if (session) {
      writeFileSync(join(evidence, 'output.ansi'), session.output());
      await session.close();
    }
    await server.close();
    json(join(evidence, 'frames.json'), frames);
    json(join(evidence, 'result.json'), {
      name,
      failure,
      requestCount: server.requests.length,
      scratch,
    });
    console.log(`TUI fidelity evidence: ${evidence}`);
  }
}

async function staticGeometryScenario() {
  const evidenceRoot =
    process.env['TUI_FIDELITY_OUT'] ??
    join(tmpdir(), 'bald-puppy-tui-fidelity');
  mkdirSync(evidenceRoot, { recursive: true });
  const evidence = mkdtempSync(join(evidenceRoot, 'static-geometry-'));
  const require = createRequire(import.meta.url);
  let session: InteractiveSession | undefined;
  const frames: Array<{ label: string; viewport: string }> = [];
  try {
    session = await InteractiveSession.start({
      cwd: root,
      cols: 80,
      rows: 30,
      inheritEnv: false,
      command: {
        bin: process.execPath,
        args: [
          '--require',
          guard,
          '--import',
          require.resolve('tsx/esm'),
          join(here, 'fixtures/tui-static-geometry.tsx'),
        ],
      },
      env: {
        PATH: process.env['PATH'],
        TERM: 'xterm-256color',
        TUI_MOCK_PORT: '54321',
        TSX_TSCONFIG_PATH: join(root, 'packages/cli/tsconfig.json'),
      },
      onStartupFailure: (raw) =>
        writeFileSync(join(evidence, 'startup-failure.ansi'), raw),
    });
    for (const [columns, rows] of [
      [80, 12],
      [80, 30],
      [40, 12],
      [40, 30],
      [80, 30],
    ]) {
      session.resize(columns!, rows!);
      await sleep(950);
      const viewport = await session.viewport();
      frames.push({ label: `${columns}x${rows}`, viewport });
      expect(
        viewport.match(/ONE_SHOT_AGENT_HISTORY/g),
        `Static history after geometry clear; evidence: ${evidence}`,
      ).toHaveLength(1);
      expect(viewport).toContain('Agent view running');
      expect(viewport).toContain('Footer ready');
    }
  } finally {
    if (session) {
      writeFileSync(join(evidence, 'output.ansi'), session.output());
      await session.close();
    }
    json(join(evidence, 'frames.json'), frames);
  }
}

describe.skipIf(process.platform === 'win32')(
  'local-only header repaint',
  () => {
    it(
      're-emits one-shot Static agent history after VP geometry clears',
      staticGeometryScenario,
      30_000,
    );
    it(
      'renders Markdown while the response and its code fence are still open',
      () => scenario('markdown'),
      90_000,
    );
    it(
      'keeps one header after the minimal keyboard-height resize regression',
      () => scenario('minimal'),
      90_000,
    );
    it(
      'preserves Unicode input, two turns and real menus through extended resizes',
      () => scenario('extended'),
      90_000,
    );
  },
);
