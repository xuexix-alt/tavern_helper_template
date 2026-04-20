# Same-Layer Image Entity Unification Design

**Date:** 2026-04-20

**Goal**

Unify same-layer generated-image handling so transcript rendering and gallery rendering consume the same per-message image entities, while the gallery only shows ready images with a real `src` and persists its own stable catalog across reloads.

**Problem Summary**

The current image path mixes at least two partially independent identity systems:

- prompt-token and membership-based identity for gallery cards
- native artifact identity from host DOM, `extra.images`, mes tags, and cache fallback

This leads to three concrete failures:

1. Button placeholders are treated as if a native image already exists, so rendering can switch to plugin-native mode before any `img[src]` is available.
2. Gallery entries are created from prompt-token membership first and then matched to native images by exact fields or fallback index, so one logical image can become two records when identity fields arrive in different phases.
3. On UI reload or during stream / MVU / image-generation churn, prompt-only state can briefly replace a previously ready image-backed state, causing duplicate placeholders, missing gallery images, or prompt-text flashes.

**Root Cause**

We do not currently have a canonical per-message image entity model with explicit readiness. Instead:

- transcript image injection decides between prompt / plugin-native / compatibility paths using DOM heuristics
- gallery uses a separate membership-plus-fallback assignment path
- mutation refreshes are fired even when only placeholder buttons exist

As a result, readiness and identity drift apart.

**Design**

Introduce a shared per-message image collector that merges all available evidence for each logical image into one canonical entity:

- prompt token
- mes-tag merged entries
- `extra.images`
- host DOM rendered images
- cache fallback

Each canonical entity will carry:

- stable key
- message id
- prompt token and anchor metadata
- request id / image id / marker id aliases when available
- `ready` flag
- `src` and `alt` when a real image source exists

Readiness rules:

- prompt token only: not ready
- `.st-chatu8-image-button`: not ready
- host DOM `img[src]`, `extra.images`, or cache/mes-tag entry with usable `src`: ready

The collector will merge aliases onto the same entity and upgrade placeholder state into ready state instead of creating a second card.

On top of the canonical entities, introduce a gallery-owned persisted catalog:

- the image truth model remains native-first: `chat[mesId].mes + extra.images`, with cache as fallback
- the gallery keeps a separate ready-only catalog projection for already-known images
- the catalog is persisted primarily alongside chat metadata under the plugin namespace, with a local browser cache mirror for reload resilience

The persisted catalog stores only gallery-facing data:

- stable entity id and alias fields
- message id / ordering metadata
- resolved `src` / `alt` / title / character name
- timestamps such as first seen / last seen / ready at
- optional future gallery-only UI flags such as pin / favorite / hidden

This catalog is a read model, not a new runtime truth source. It must never replace `extra.images` ownership or restore removed `stream_demo.generated_images` runtime writes.

**Rendering Rules**

- Transcript can still render placeholder-oriented content where needed, but must not let a placeholder-only refresh replace an already-ready image entity.
- Gallery renders only ready entities. Prompt-only or button-only entities are excluded from gallery output.
- Native DOM presence should be split into placeholder-vs-ready checks so `.st-chatu8-image-button` no longer forces plugin-native render mode by itself.
- Gallery UI reads from `live ready entities + persisted catalog projection`, with live entities taking precedence for freshness.

**Implementation Scope**

- Keep the native-first truth model: `chat[mesId].mes + extra.images`, with cache still treated as fallback.
- Do not restore removed `stream_demo.generated_images` runtime ownership.
- Minimize architecture churn by adding focused helpers and rewiring existing call sites rather than rewriting the whole same-layer pipeline.
- Persist the gallery catalog via chat metadata plus a local browser cache mirror, with a chat-variable fallback only if metadata write APIs are unavailable at runtime.

**Testing**

Add regression tests for:

- button placeholders not counting as ready native images
- one logical image represented by prompt token plus ready native source collapsing to one gallery entry
- ready-only gallery filtering
- prompt-only first pass upgrading into the same ready entity on later data arrival
- persisted gallery catalog hydration and merge precedence
- metadata/local-cache persistence helpers normalizing and deduplicating ready-only entries

**Risks**

- The biggest risk is over-merging unrelated images when identity signals are sparse. The collector should prefer explicit ids first and only fall back to prompt/anchor-based matching when necessary.
- Mutation refresh cadence must stay selective so we do not reintroduce heavy full-gallery churn.
- Host chat-metadata write APIs may differ across runtime surfaces. Persistence helpers should probe for exported metadata functions and gracefully fall back without blocking gallery reads.
