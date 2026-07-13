# Pre UI Gallery Native Gesture Alignment Implementation Plan

**Goal:** Make the pre UI gallery show image references from every supported source while sending interaction only to an exact plugin-native host target, with desktop and mobile gesture protocols matching `st-chatu8`.

**Architecture:** Discovery remains broad (`host-dom`, pre render, metadata, token, cache), but dispatch becomes strict: a display reference is not automatically an interaction target. The gallery adapts one semantic regenerate action to host `auto` dispatch (desktop double-click or mobile triple-touch). The transcript bridge independently resolves the clicked pre image to a matching host image and never falls back to the full `.mes_text` node.

**Files:** `preGalleryImageRefs.ts`, `components/PreGalleryPanel.vue`, `preHostImageGestureForwarder.ts`, and their focused Node tests.

**Verification:** Focused pre-gallery and pre-source tests, ESLint, production build, then manual desktop and touch-host verification because the plugin consumes real browser gesture events.
