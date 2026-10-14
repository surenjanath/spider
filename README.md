# Prompt Spider

A local-first prompt intelligence workspace built with React, Vite, WebGL, and Canvas 2D. Explore a prompt as a living graph, inspect its evidence, and clarify missing context without rewriting the original words.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

The development server binds to `0.0.0.0:5173`. Arena's `.e2b.app` preview hosts are allowed in `vite.config.js`.

```sh
npm test        # deterministic analysis tests
npm run build  # production bundle in dist/
```

## Explore the workspace

The app starts crawling from the first word automatically, so the spider is visibly live on arrival. Use **Pause crawl** to inspect a word, or reset to start over. With reduced motion enabled, the app starts paused; playback still advances the analysis without spatial animation.

- **Prompt editor:** edit the sample or start a new prompt. `# Heading` and `1. Heading` lines create sections. Unstructured text works too.
- **Knowledge graph:** a seeded, layered neural galaxy with wispy star clusters, fine dust, tidal bridges, a walking articulated spider, live word labels, and independent feelers and reading probes. The ambient mesh is illustrative; named nodes and findings come from the current analysis.
- **Playback:** pause/resume, scrub to any word, select a section, or change speed from 1× to 4×. A single animation clock commits each word after the probe finishes reaching, reading, and classifying it. The body and gait persist across section changes.
- **Camera:** the crosshair button switches between a close-following journey camera and an atlas view. Drag the map (or focus the canvas and use the arrow keys) to orbit its 3D volume. Zoom focuses on the spider, and Reset view restores the camera and orbit. Pause and reduced-motion settings stop automatic spatial movement.
- **Dive in:** start a crawl inside the selected section using the orbit-shaped **Dive in** button, or double-click a section label. The spider crosses the outer shell, descends through the core, and emerges. The depth meter shows its actual normalized immersion, not a separate animation timer.
- **Expanded live view:** use the expand icon in the graph’s upper-right corner for a large, portrait-friendly crawl view. It includes its own playback, timeline, and speed controls; Escape returns to the workspace.
- **Inspection:** click a prompt word, graph label, heatmap cell, finding, or crawl-log entry to see its classification and evidence.
- **Second brain:** search and inspect the sample sources; add explicit source content and comma-separated match aliases; import `.txt` or `.md` files up to 1 MB. New sources are immediately re-evaluated.
- **Clarifications:** answer a flagged question. The answer becomes explicit context and never replaces the original prompt.
- **Exports:** download the current context as JSON or Markdown, including the original prompt, score, evidence, questions, and completion state. Partial crawls are identified as partial.
- **Persistence:** prompts, sources, clarifications, and completed crawl summaries are saved in this browser's localStorage. Workspace settings can restore the sample after confirmation.

## What the analysis does—and doesn't do

This is a **functional, deterministic visualization prototype**, not an LLM or a comprehensive semantic-analysis service.

1. Parse sections and index whitespace-delimited words.
2. Resolve the longest exact source alias first, case-insensitively and at word boundaries.
3. Apply explicit ambiguity/reference rules to phrases without a source match. Recognize common unresolved file and owner syntax.
4. Classify other words as statement/connective tokens; this is **not verification that a claim is true**.
5. Count evidence and questions only after the crawl reaches their words.

Resolved findings always include their exact source or a user-supplied clarification. No embeddings, external APIs, guessing, automatic rewriting, or agent execution are involved. The bundled studio sources are clearly labeled as illustrative demo content.

### Scoring

The visible score is a transparent heuristic:

```text
37 + 18 × read coverage + 45 × resolved findings / total findings
```

Empty input scores 0. With no identified findings, the resolution contribution is 0. Coverage measures the proportion read, not factual completeness. The score's chart is calculated from actual crawl positions, not a fixed demo curve. A score is not a guarantee of prompt quality or future model performance.

The sample has 181 prompt words, 23 source links, and 12 open questions at completion, scoring 85 before user clarifications. These are derived results; the observed PRD's 45 links and score of 82 are not artificially reproduced.

### Visualization and accessibility

The sample’s procedural galaxy contains 14,000 filament vertices, 56,000 dust specks, and 900 distant stars. The field now uses perspective-projected WebGL geometry with actual per-point depth, much larger and rounder clusters, and separate behind/in-front-of-the-spider passes. Foreground dust and fibers visibly occlude the creature as it descends. The spider’s articulated anatomy is drawn on a perspective-projected Canvas plane at its scene depth (not a rigged polygon mesh). Word targets, probe endpoints, labels, and GPU particles share the same camera math. This ambient field is illustrative, not additional source evidence. Local cluster proportions are preserved on landscape and portrait screens. Geometry is uploaded only when the field or viewport changes, not every word.

If WebGL is unavailable, shader initialization fails, or the graphics context is lost, a cached three-layer Canvas fallback keeps the crawl usable. This fallback has reduced visual depth. An orbit/perspective test and explicit context-loss/no-WebGL browser checks cover both paths.

The spider has acceleration and turning limits, a shaded two-part carapace, subtle breathing and weight transfer, and eight tapered, three-segment legs. A foot stays planted until it needs a useful next position; new foot placements can snap to nearby real vertices in the illustrative web. Twelve spring-damped feelers react toward the current word, while two reading probes extend, latch and fully retract on the word clock. The same persistent frame loop advances the actual word cursor, so motion and counters cannot drift between separate timers. Pause freezes the visual state, scrubbing repositions the spider, and background tabs do not keep advancing the crawl. FPS and words/second are measured, not randomized. The renderer honors reduced-motion preferences and adapts to device pixel ratio. Frame rate depends on the device; 60 FPS is a target, not a guarantee. The responsive workspace supports desktop, tablet, and portrait mobile. Dialogs have focus trapping, Escape dismissal, and focus restoration. Data can also be inspected through the DOM-based prompt and findings panels.

## Tests

`src/engine.test.js` covers section parsing, sequential word indexing, the 181-word sample, exact alias matching, regex escaping, explicit evidence, missing reference detection, clarification, live source injection, empty input, and progressive telemetry.

`src/spider-motion.test.js` adds tests for continuous section travel, articulated leg poses, planted feet, pause stability, deterministic word anchors, mobile bounds, and bounded/seeded web generation. The motion tests also check acceleration limits and stationary feet. `src/galaxy.test.js` covers seeded filament/dust geometry, bounded particle counts, aspect-preserving projection, and real-vertex foot placement. `src/volume-scene.test.js` checks cluster enlargement, shell/core/emergence paths, perspective and orbit, projection round-trips for probe endpoints, and deterministic word depths. There are 30 unit tests in total.

The volume upgrade was additionally browser-checked for successful GPU shader initialization, front-to-back traversal, core indicators, drag orbit, selected-cluster entry, context-loss recovery, and no-WebGL playback. The crawl clock carries fractional elapsed time across word commits so slow frames do not silently halve the reading rate.

The updated renderer was browser-checked for visible canvas changes while playing, pixel-stable pausing, body movement across sections without resetting its clock, 4× speed, expanded-view controls and Escape, reduced-motion playback, and mobile sizing.

The implementation was also browser-checked for playback, timeline scrubbing, flag resolution, source creation/import, JSON download contents, custom prompts, crawl history, graph controls, sample restoration, and overflow at 390, 768, 1024, and 1440-pixel viewport widths.

## Scope

No backend, accounts, collaboration, external knowledge connectors, vector search, or production-grade semantic reasoning. Files and context stay in the browser unless explicitly exported. Clearing browser storage removes locally saved work; exports are the portable backup.
