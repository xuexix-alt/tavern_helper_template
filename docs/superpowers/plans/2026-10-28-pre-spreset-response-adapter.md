# PRE SPreset response compatibility

Goal: keep Tavern Helper `generate()` and preserve the final request body while applying the active SPreset output semantics to the PRE response only.

Constraints: do not change Tavern Helper, SPreset, preset files, or native send behavior. No preview APIs, hardcoded tool names, reconstructed tool lists, or inferred tool execution. Leave unrelated dirty state alone.

- [x] Replace preview-based compatibility with a request-scoped response adapter. Correlate helper generation events and the final settings object; reject ambiguous overlapping preparation rather than capture another request.
- [x] Use the loaded SPreset runtime formatter and preprocessing session with real stream/channel/final/state values. Feature-detect internal interfaces and fail visibly if unavailable.
- [x] Keep existing response hooks first, so already-consumed tool calls are not formatted again. Bypass the adapter when SPreset output processing is disabled (including the supplied Kunlun preset).
- [x] Preserve raw response data for downloadable recovery on format/parse failure; do not write empty assistant floors.
- [x] Replay the supplied real tool arguments and both preset configurations against isolated SPreset processing functions. Validate streaming, non-streaming, ordinary text, failures, concurrent requests, cancellation and cleanup. Clearly distinguish constructed wire envelopes from captured responses.
- [x] Run focused tests and build. Live provider verification remains separate from replay.

Initial wire support is OpenAI-compatible chat-completion JSON/SSE, matching the observed request. Unsupported wire shapes fail with recoverable raw output instead of silently consuming data. Streamed tool parameters are formatted at the semantic end of the stream, matching SPreset's native behavior.

Validation (2026-10-28): 73 PRE tests passed with real supplied argument replay enabled; focused ESLint and PRE development build passed. The parent source suite has 64 passing tests and one existing unrelated import-path assertion failure at sameLayerPreSource.test.js:1531. No fresh live provider generation was performed. The replay uses real supplied arguments inside constructed OpenAI JSON/SSE envelopes, not captured wire responses. Kunlun bypass is covered by its disabled output-processing configuration, not execution of its entire injected fetch script. The adapter depends on feature-detected SPreset internal runtime functions. Failure recovery contains received response data; an interrupted stream may only contain a prefix. Build output was copied to the local temporary pre-spreset-validation/index.html; tracked dist artifacts were restored.
