# Bald Puppy terminal interface

[English](bald-puppy-interface.md) | [简体中文](bald-puppy-interface.zh-CN.md)

## Problem and scope

Replace the old Codex source with Qwen Code 0.27.3 at 038b60e3099a174395f26ed0d1b501eb04d2302d. Preserve Git history and upstream license notices. Match Zyn-Old's compact terminal visual language without reusing its input loop.

## Decisions

Keep Qwen's engine, session files, permissions, command names and theme configuration keys. Add bald-puppy as an executable alias. The default dark palette uses green-black #212823, amber #d4a054 and muted metadata. Both Ink and OpenTUI use a compact panel capped at 72 columns with no default logo or spacer. Explicit custom art remains supported. Margins disappear below 40 columns. Long labels are truncated; custom themes and accessibility modes remain available.

## Risks and validation

Dependencies require Node 22+. Native Android support is not guaranteed. Build and typecheck the CLI and run header, theme, input, footer and custom-banner regressions. Inspect widths 20, 40, 80 and 120, Unicode paths, long model names, resize, custom art, NO_COLOR and screen-reader suppression. Acceptance requires a working bundle and passing relevant tests; no claim of universal bug freedom is made.
