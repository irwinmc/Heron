# Changelog

All notable changes to `@blakron/core` are documented here.

---

## [0.6.2] — 2026-07-24

### Fixed

- **WebGLRenderer**: Ancestor container transform/alpha/tint changes now refresh descendant leaf instructions. Previously, changing a plain container's transform had no effect on WebGL output until a full structural rebuild, since containers never own a leaf instruction of their own.
- **ResourceLoader**: Fixed `activeCount` queue-counting bugs that could hang `start()` indefinitely — the retry path double-decremented the active count, and items with no registered analyzer never decremented it at all. All completion paths (success, failure, synchronous throw, missing analyzer) now retire through a single `finishItem()` entry point.
- **ResourceLoader**: A synchronously-thrown (rather than rejected) analyzer `loadFile()` call no longer wedges the loader — it's now caught and routed through `finishItem()` like any other failure.
- **Resource**: Concurrent `loadGroup()` calls no longer overwrite each other's queue/callbacks on the shared `ResourceLoader` instance. Calls are now serialized through a persistent promise chain (`groupLoadQueue`), each still resolving/rejecting independently.
- **ByteArray**: `bytesAvailable`, `validate()`, and the internal `_validate()` bounds check now use the logical write position instead of physical buffer capacity, preventing reads of unwritten, zero-filled memory when `bufferExtSize` pre-allocates extra capacity ahead of writes.
- **EventDispatcher**: `once()` listeners could fire more than once when a nested/reentrant `dispatch()` on a different dispatcher drained the shared once-listener queue. The queue now tracks each listener's owning dispatcher and only pops entries belonging to the dispatcher currently draining.

### Removed

- **ByteArray**: Removed the redundant `readAvailable` getter, which duplicated `bytesAvailable` once both were redefined against the logical write position.
- **Resource**: Removed the unused `isConfigLoaded` field (written by `loadConfig()` but never read anywhere).

### Changed

- **Docs**: Added JSDoc coverage across `WebGLRenderer`'s build/execute pipeline (`render`, `_releaseInstructions`, `_buildLeaf`, `_buildFilter`, `_buildClip`, `_buildScrollRect`, `_makeCacheInstruction`, `_executeInstructions`, `_applyTransform`, `_executeDisplayListCache`, `_directDraw`) and consolidated scattered inline comments into method-level doc comments in `Resource.loadGroup`, `ResourceLoader.loadItem`, and `WebGLRenderer._updateDirtyRenderables` / `_buildInstructions`.

### Tests

- Added coverage for `ResourceLoader` (concurrent requests, retry exhaustion, missing analyzers, promise rejection, thread-count limits).
- Added coverage for `Resource` concurrent group loads and failure scenarios.
- Added coverage for `ByteArray`'s logical-vs-physical read boundary with `bufferExtSize`.
- Added coverage for `EventDispatcher.once()` behavior across nested/reentrant dispatch.

---

## [0.6.1] — 2026-07-22

### Added

- **HttpRequest**: `status` getter exposing the HTTP response status code. Dispatches `HTTPStatusEvent` before `COMPLETE`/`IO_ERROR`, and now treats 4xx/5xx responses and status `0` (CORS/blocked preflight) as `IO_ERROR` failures instead of silently completing, matching `fetch()` error semantics.
- **HttpRequest**: `setRequestHeader()` with a `_pendingHeaders` queue — headers set before `open()` are queued and applied during `send()`.
- **Sound**: Generation-based cancellation so a pending async load callback can't update state after `close()`.

### Tests

- Added test coverage for `HttpRequest` (2xx/4xx/5xx responses, network failures, status exposure) and `ImageLoader`.

---

## [0.6.0] — 2026-05-07

### Changed

- **Breaking**: Renamed internal fields across `DisplayObject`, `DisplayObjectContainer`, `Bitmap`, `Graphics`, `Mesh`, `Shape`, `Sprite`, `Stage`, `BitmapData`, `RenderTexture`, `TouchEvent`, `ColorMatrixFilter`, and related modules to use a `$` prefix, distinguishing internal/engine-owned state from public API surface.
- Moved stage event lists from `DisplayObjectContainer` to `DisplayObject`.
- `EventDispatcher` now invokes listeners with an explicit `this` context.

---

## [0.5.17] — 2026-05-06

### Changed

- **Text rendering**: Switched to Egret-style `textBaseline='middle'` rendering (advancing `drawY` by half the line height before drawing) instead of manual baseline offset calculation, simplifying both rendering and hit-testing. Later switched to `textBaseline='alphabetic'` so positioning relies on stable `actualBoundingBox` metrics across OS font substitution (e.g. Arial → SF Pro on iOS).

---

## [0.5.16] — 2026-05-05

### Added

- **Particle system**: Rendering support for both the canvas and WebGL renderers, including a new `ParticlePipe`.
- **Test coverage**: Added suites for `BlendMode`, `CustomFilter`, `Shape`, `Sprite`, `Stage`, spatial operations, `Bitmap`, `BitmapData`, `Mesh`, `Texture`, `TouchEvent`, `SpriteSheet`, `DebugLog`, `Filter`, `HTTPStatusEvent`, `ProgressEvent`, and `Sound`/`SoundChannel` (with an `Audio` mock and isolated module state via dynamic imports).

### Fixed

- Particle offset calculation and missing per-particle alpha.
- `Bitmap` reference counting when its texture changes while already on stage.
- `BitmapText` layout not invalidating on width/height change (affects line-breaking); `TextField` not invalidating on size change.

### Changed

- **Word wrapping**: Replaced regex-based tokenization with `Intl.Segmenter` for locale-aware word/grapheme segmentation, correctly handling Latin, CJK, Thai/Khmer, and mixed-script text.
- Pruned trivial property/constructor tests in favor of P1 edge-case coverage (boundary conditions, sorting).

---

## [0.5.9] — 2026-05-05

### Added

- **WebGL2**: Uniform Buffer Object (`UBOManager`) support for frame-level projection uniforms, later reverted in favor of direct `gl.uniform*()` uploads after it caused stale projection state when switching render buffers (fixed once via `updateProjection()`, then removed entirely for simplicity — see 0.5.10).
- Dedicated `fullscreen_vert` shader for filter blur passes so each pass sets its own projection uniform independently.

### Fixed

- `projectionVector` uniform not updating correctly for fullscreen quad draw calls.
- GLSL uniform block binding syntax causing compilation issues on some WebGL implementations; removed unused `uTextureSize` uniform (briefly re-added, then dropped again).

---

## [0.5.10] — 2026-05-05

### Changed

- **WebGL2**: Removed `UBOManager` — reverted to direct `gl.uniform*()` uploads for `projectionVector` on both WebGL1 and WebGL2 paths. Multi-texture fragment shader simplified to constant (rather than dynamic) sampler indexing for GLSL ES 3.00 compatibility.

---

## [0.5.2] — 2026-05-04

### Added

- **WebGL2 support**: Prefers a WebGL2 context at initialization with WebGL1 fallback for older devices, via a unified GL type alias. All GLSL shaders received an explicit `#version 100` directive for WebGL1.
- **Graphics**: `FinalizationRegistry`-based texture cleanup to prevent GPU memory leaks when `Graphics` objects are garbage-collected.

### Fixed

- `MaskPipe` scissor rect calculation for scroll offsets — content scroll offsets were incorrectly included in the scissor rect instead of only screen offsets.
- Shape graphics commands were cleared on stage removal, preventing shapes from re-rendering when re-added to the display list.

### Changed

- Reorganized the player module: canvas rendering into `player/canvas/`, WebGL pipes into `player/webgl/pipes/`, shaders into `player/webgl/shaders/`, each with a barrel `index.ts`.

---

## [0.3.11] — 2026-05-03 to 2026-05-04

### Fixed

- **Text rendering**: Corrected vertical-centering math for middle-aligned text under `textBaseline='top'` (the em-square was being centered instead of the actual glyphs) — measures font metrics to compute a correction offset, then fixes a sign error in that correction.
- `Event.setDispatchContext()` now preserves the original dispatch target during bubble/capture phases, only assigning `_target` at the `AT_TARGET` phase or on initial assignment.
- Renderables with empty graphics commands at build time (e.g. UI components whose `Validator` fills commands a frame later) now trigger a full instruction rebuild once content becomes available, instead of never rendering.
- `MaskPipe` scissor rect calculation corrected to avoid double-applying offsets already baked into the matrix via scroll-rect handling.

### Changed

- Added `willReadFrequently` hints to canvas 2D contexts used for pixel readback (`RenderTexture.getPixel32`, hit testing), avoiding repeated browser warnings.
- Removed debug logging that had been added for touch hit-testing (`CheckBox`/`RadioButton`/`Button`, `TouchHandler`).

---

## [0.3.3] — 2026-05-03

### Fixed

- **FilterPipe / MaskPipe**: Correct GL state management to prevent stale blend state leaking between filter and mask passes.

### Changed

- Replace explicit `undefined` assignments with optional property syntax across the codebase.
- Declare `children` field explicitly in `DisplayObjectContainer` and remove non-null assertions.

---

## [0.3.2] — 2026-05-02

### Added

- **Resource manager**: Comprehensive resource management system with full documentation — supports asset loading, caching, and lifecycle management.
- **Capabilities system**: Runtime feature-detection API for querying WebGL extensions and platform capabilities.
- **TextPipe**: Complete text rendering pipeline integrated into the player.

### Changed

- **Namespace migration**: Renamed all internal namespaces from `Heron` → `Blakron` to align with the new package identity.
- Fixed main entry point path in `package.json`.
- Added comprehensive migration status and API compatibility guide (`docs/migration.md`).

---

## [0.2.4] — 2026-04-11

### Added

- **TextField rendering pipeline**: Full Canvas 2D and WebGL rendering path for `TextField`, including scroll offset, padding, clipping, and native `INPUT` mode support.
    - Prevents double-text artifact when native input is focused.
    - Fixes canvas buffer scaling and border handling in coordinate mapping.
    - Refines `StageText` padding and clipping for better vertical alignment.
- **Benchmark scenes**: `rapid-churn` and `texture-swap` scenes added to the benchmark suite with Egret comparison.
- **Example pages**: Index page, mesh test, net test, video test, and sound test HTML examples.
- **Video rendering**: Dynamic scaling and per-frame WebGL texture updates.

### Fixed

- Mesh rendering and tint color calculations corrected.
- Mesh animation angle calculation improved.
- Range input overflow in mesh test layout.
- Blend mode state restoration and WebGL context-loss handling.

### Changed

- Example UI modernized with glassmorphism design and consistent layout.
- Scale mode updated from `exactFit` to `noScale` in examples.
- Benchmark build configuration and scripts added.

---

## [0.2.3] — 2026-04-11

### Added

- **WebGL performance benchmarking suite**: Comprehensive multi-scene benchmark with detailed logging and dynamic-transform scene.
- **Bounds caching**: `DisplayObject` now caches computed bounds to avoid redundant recalculation.
- **Blend mode state management**: Explicit blend mode tracking in the render pipeline.

### Fixed

- Drop shadow padding calculation in filter pipeline.
- Blend mode state not restored after filter/pipe passes.

### Changed

- Filter compositing and blur pipeline restructured for clarity.
- `WebGLRenderContext` reorganized with section comments and `readonly` fields.
- Imports consolidated to explicit module paths across player and display modules.

---

## [0.2.0] — 2026-04-09

### Added

- **Multi-texture batching**: WebGL renderer now batches up to 8 textures per draw call, dramatically reducing GPU state changes.
- **Two-pass separable Gaussian blur**: Ping-pong FBO approach for high-quality, GPU-efficient blur filters.
- **GPU-accelerated CSS filters**: Canvas filter rendering path optimized with CSS filter fallback.
- **Mask rendering**: `DisplayObject` mask support with correct graphics state management.
- **Gradient rendering**: Refactored gradient pipeline in the filter system.
- **Render instruction pipeline**: Dirty-tracking system drives incremental display list updates.
- **Render object type tracking** and render groups for batching optimization.
- **Graphics caching**: Canvas-to-WebGL rasterization cache for static `Graphics` objects.
- **Pixel-perfect hit testing**: Accurate pointer event dispatch using rendered pixel data.
- **Comprehensive unit tests**: `vitest` configuration and test suite covering core modules.

### Changed

- `WebGLRenderContext` fully reorganized with section comments and `readonly` fields.
- Event handler naming standardized across player and WebGL modules.

---

## [0.1.0] — 2026-04-09 _(initial release)_

### Added

- **Core display hierarchy**: `DisplayObject`, `DisplayObjectContainer`, `Stage`, `Sprite`, `Bitmap`, `Mesh`, `Shape` with full Egret-compatible API.
- **Event system**: Object-pooled event dispatch, specialized event types (`TouchEvent`, `TimerEvent`, `Event`), and `EventDispatcher`.
- **WebGL rendering pipeline**: `DisplayList` caching, `SystemTicker`, `ScreenAdapter` integration.
- **Text system**: `TextField` with HTML parsing, `BitmapFont` / `BitmapText` for texture-based text.
- **Filter system**: Drop shadow, blur, color matrix, and glow filters.
- **Media**: `Sound`, `SoundChannel`, `Video` with audio decode queue.
- **Networking**: HTTP utilities (`URLLoader`, `URLRequest`).
- **Geometry**: `Point`, `Rectangle`, `Matrix` with full Egret-compatible surface.
- **Utilities**: `ByteArray`, `Timer`, `Base64Util`, `Logger`, `toColorString`.
- **External interface**: Bridge for JS ↔ game communication.
- Project initialized as `@blakron/core` (formerly `heron-core`), a modern TypeScript rewrite of the Egret game engine targeting WebGL multi-texture batching and a strict instruction-driven render pipeline.
