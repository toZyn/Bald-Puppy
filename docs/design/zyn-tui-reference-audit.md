# Zyn Agent TUI: reference audit and safe adaptation

[English](zyn-tui-reference-audit.md) | [简体中文](zyn-tui-reference-audit.zh-CN.md)

## Reference

Inspected `toZyn/Zyn-Old` at commit `bc8bd1eb2f7f96d3dfbbe601834afc3283e4230c`, specifically [src/tui/app.mjs](https://github.com/toZyn/Zyn-Old/blob/bc8bd1eb2f7f96d3dfbbe601834afc3283e4230c/src/tui/app.mjs). This audit supplements [the interface design](bald-puppy-interface.md). The reference uses React 19 and Ink 7; its terminal background is inherited, despite a background color being declared in its palette.

## How it works

`UIStore` is an EventEmitter with completed items, live thinking/answer buffers, spinner, drafts, a message queue and mutually exclusive confirmation/selection/input requests. `_emit` coalesces changes with `setImmediate`; streamed thinking and answers request updates at most every 200 ms. `useStore` subscribes and removes its listener. `useDimensions` listens for terminal resize and removes that listener on unmount.

`App` renders the completed items and current dynamic area inside a scrollable column. The status bar is outside that column. A confirmation, selector or auxiliary prompt takes ownership of input; otherwise `InputBar` handles text and slash suggestions. Each completed item has a stable ID. Completed Markdown is parsed into paragraphs, code, lists, quotes and tables; live answers render plain streaming lines and a trailing cursor.

`InputBar` holds text, cursor, history and suggestion selection, with refs to avoid stale input callbacks. It offers eight slash suggestions, Tab completion, arrows and readline shortcuts. The original queues ordinary Enter submissions during processing. Escape is handled separately by `App`: two presses within 500 ms interrupt or exit. Confirmation starts on No and requires a positive selection. These action semantics belong to the engine, not the visual skin.

## Visual contract and destination

| Reference                       | Contract                                                             | Bald Puppy destination                                        |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `Banner`                        | One compact panel, brand, model/session metadata, cwd; 72-column cap | `Header`; retain actual Qwen auth/version metadata            |
| `UserMessage`                   | `> You`, heading gutter 3, white body gutter 5                       | `ConversationMessages`                                        |
| `AnswerBlock`                   | `◉` + agent name, same body gutter, live cursor                      | `ConversationMessages`; retain source-copy and image support  |
| `ThinkingBlock` / `SpinnerLine` | Muted thinking, accent spinner, elapsed time                         | Existing thought/loading components and cancellation controls |
| `EventLine`                     | `·`, `◐`, `›`, `⤳`, `>`, `▲`, `x`; violet tools                      | Semantic status/tool components                               |
| `InputBar`                      | Unboxed `❯`, three-column side gutters, eight suggestions with `▸`   | `BaseTextInput` inline variant and existing completion engine |
| `QueuedMessage`                 | Mail glyph and muted italic preview at gutter 5                      | `QueuedMessageDisplay`; keep real Ctrl+Q/edit behavior        |
| `SelectBar`                     | Compact rounded panel, amber `>` title and `▸` selection             | Model picker with height-aware compact mode                   |
| `StatusBar`                     | Subtle rule, model/turns, context usage, help                        | `Footer`; show Qwen's actual shortcuts and approval state     |

The original presentation components were also rendered offline at [40 columns](../images/zyn-reference-40.txt) and [80 columns](../images/zyn-reference-80.txt), using simulated text and inert callbacks. Engine imports were excluded; these are component captures, not a live model session. At 40 columns the original banner title overhangs and its footer wraps.

## Why a literal copy is unsafe

Re-evaluating the original pure wrapping function offline gives `wrapText('漢'.repeat(8), 8) = ['漢漢漢漢漢漢漢漢']`: sixteen display cells in an eight-cell budget. Its backspace slices UTF-16 code units; deleting once from `😀` leaves the invalid lone surrogate `\ud83d`. The 72-column banner builds a 74-cell top including its left margin, but a 76-cell title row. Its selector determines visible rows from width alone: 40 columns requests eight entries even when only ten terminal rows exist. These are concrete source-level counterexamples, not claims that every terminal reproduces every artifact.

Keep Qwen's display-cell measurement, Unicode editor, Markdown renderer, paste framing, history, permissions and cancellation. Do not import Zyn's agent, plugin loader, session globals, console interception or signal handlers into the renderer. Use React/Ink layout for borders. Keep the input accessible during long histories rather than moving it into the original scrollable dynamic area. Preserve existing themes and explicit user customizations.

## Completing the adaptation

The queue preview gains the reference mail glyph, muted italic body and gutters without changing queue contents or dispatch. The model picker gains the reference title marker. Below 18 available rows it omits optional descriptions/details, truncates option titles to display width and uses a short accessible navigation legend. Below seven rows it drops decorative borders and vertical gaps so title, selected option and navigation still fit. Explicit line breaks are clipped inside the one-row option viewport. Errors remain visible; full detail returns when enlarged. The minimum useful inner budget is three rows (four with an error); smaller viewports cannot show title, option and instructions simultaneously. Provider selection, keys, persistence and permission handling are unchanged.

## Verification and limits

Require red/green regressions for compact descriptions, queue glyphs and short model layout. The real CLI acceptance must verify the selected row and `↑↓`, `Enter`, `Esc` at 40×10, then navigate, resize and close without contacting a model provider. Re-run the existing two-turn Unicode/paste/resize scenario with pre-bootstrap networking restricted to its loopback fixture. Run focused component tests, lint, build and typecheck. Capture the real terminal cells rather than drawing a mockup. The [40×10 model capture](../images/bald-puppy-model-40x10.txt) is from the successful loopback-only PTY run after navigating to the second model.

Native Android/Termux rendering and live provider accounts are not available here. This is an adaptation of Zyn's visual and interaction hierarchy onto Qwen, not a replacement of Qwen's engine or a promise that every original keyboard binding is identical.
