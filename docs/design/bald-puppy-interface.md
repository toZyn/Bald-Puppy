# Bald Puppy terminal interface

[English](bald-puppy-interface.md) | [简体中文](bald-puppy-interface.zh-CN.md)

## Intent and scope

Keep Qwen Code 0.27.3 (base 038b60e3099a174395f26ed0d1b501eb04d2302d) as the agent engine and reproduce the terminal composition of toZyn/Zyn-Old. Preserve upstream licenses, providers, tools, permission choices, sessions and keyboard commands. The reference is the interactive app in `src/tui/app.mjs`, including its transcript, composer, events, selection lists and status bar.

## Presentation decisions

- Compact single-border banner, capped at 72 columns, with brand, account/model and `cwd:`. Explicit custom banner art/title/subtitle remain supported. Startup tips appear only when explicitly enabled.
- User turns have a separate `> You` heading; assistant turns have `◉ Bald Puppy`. Headings start at column 3 and bodies at column 5 in the main transcript. Continuation chunks keep their body gutter without repeating the heading.
- Preserve Markdown, images and source-copy indexes. Pending responses reserve rows for role heading and live cursor: zero available rows shows no output, one shows body, two show heading/body, three or more can include the live cursor.
- Main input uses an unboxed `❯` with three-column side gutters. Shared editors keep their existing framed variant. Buffer width, suggestion width and physical IME cursor geometry use the actual variant; paste, editing, history and submit/cancel behavior stay unchanged.
- Footer places a bounded subtle rule after input, then model, turn count, used/available context and `/help`. Explicit custom status lines and transient approval, shell, initialization and queue indicators remain available. The footer never advertises an exit shortcut that Qwen does not implement.
- Tool/status events use compact semantic glyphs. Selection uses amber `▸`; existing numbering, categories and mouse actions remain. Loading labels use a five-column gutter with real width constraints, fixed spinner/cancel areas and a shrinkable label.
- Default dark colors use the reference hierarchy: white body, #cccccc labels, #999999 muted text, #888888 ghost text, #d4a054 accent, #383838 border and #aa88cc tool events. Other themes use their semantic colors.

## Repaint defect and correction

The previous last-frame component assertions did not exercise the complete terminal output pipeline. A full Ink → PTY → xterm test reproduces five orphan banner top borders above one title while a long shipped loading phrase is active and the terminal changes 100×30 → 40×12 → 40×30.

Viewport mode previously treated width shrink as the only erase-coordinate invalidation. The viewport is now cleared while layout settles after either dimension changes. Frame replay also requires matching width and height. One-shot Static content is remounted immediately and once the clear window closes, so agent-tab history survives keyboard height changes without clearing native scrollback in normal mode. The loading row separately constrains its own width so long labels do not create unexpected physical wraps.

## Validation

Run focused tests for all changed components and downstream transcript/menu consumers, plus the maintained `integration-tests/interactive/tui-header-repaint.test.ts`. This full-CLI acceptance test uses a deterministic loopback model and verifies the actual submitted Unicode text after paste and editing, two responses, slash completion, the model dialog, streaming, repeated width/height changes and a one-shot Static fixture.

The acceptance process isolates configuration with `QWEN_HOME`, disables usage/operator telemetry and blocks all non-loopback networking before CLI bootstrap. Its guard proof rejects external HTTP, HTTPS, TLS, DNS, socket and fetch calls. Mock credentials and temporary runtime/evidence directories are used. Capture processed frames and raw ANSI for inspection; a terminal preview must come from a real captured frame.

Acceptance requires successful build/typecheck/lint, relevant regression suites and full-CLI terminal checks, with no duplicated banner top borders or missing input/footer. Review normal and narrow widths (20, 40, 80, 120), long Unicode labels, role/body alignment and tiny-height degradation.

## Limits

Native Android hardware and live model accounts are not available in this environment. Node 22+ is required; native optional dependencies remain platform-dependent. The model picker uses a compact height budget on a 40×10 terminal so its selected row and navigation remain visible; full metadata returns on enlargement. See [the pinned reference audit](zyn-tui-reference-audit.md) for fidelity decisions and original defects. No universal absence-of-bugs claim is made.
