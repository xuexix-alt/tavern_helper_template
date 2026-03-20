# Same-layer host mes_text double-click bridge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make same-layer transcript double-clicks resolve to the correct message id even when the user clicks `.assistant-body-wrap`, so the event can be bridged to host `mes_text`.

**Architecture:** Keep the fix minimal and local to transcript double-click resolution. Do not change placeholder/image persistence logic yet. Expand the message-carrier selector only, and verify it with a focused regression test.

**Tech Stack:** TypeScript, Node built-in test runner, Vue same-layer transcript DOM.

---

## Chunk 1: Minimal selector widening

### Task 1: Add a failing regression test for `.assistant-body-wrap`

**Files:**
- Create: `src/寒冬末日/界面同层版/界面/状态栏/__tests__/transcriptDoubleClick.test.js`
- Modify: `src/寒冬末日/界面同层版/界面/状态栏/transcriptDoubleClick.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the test to verify it fails before implementation**
- [ ] **Step 3: Widen the selector with the smallest possible code change**
- [ ] **Step 4: Run the focused test again to verify it passes**
- [ ] **Step 5: Run one adjacent existing test as a smoke check**

