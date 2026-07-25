# Changelog

All notable changes to `@blakron/core` are documented here.

---

## [1.0.0] — 2026-07-26

First stable release. From this version forward the public API surface (exports from `src/index.ts`) is committed to backward-compatible evolution per semver.

### Fixed

- **StageText**: Removed 6 development-time `console.log` debug statements (in `resetStageText`, the focus/blur listeners, `initElementPosition`, `executeShow`, and the deferred-focus path) that would spam the console of any production app using text inputs. These were not routed through `Logger` and could not be silenced.
- **WebGLRenderer**: Documented and preserved the per-frame root-buffer projection reset at the end of `render()`. The call `WebGLRenderBuffer.release(WebGLRenderBuffer.create(buffer.context, 0, 0))` looks like a no-op pool cycle but its real effect is the `pushBuffer` / `popBuffer` pair inside `WebGLRenderBuffer.resize()`, which queues an `activateBuffer` command; when `flush()` runs it, `_activateBuffer()` calls `onResize()` and restores the GL projection / viewport to the root canvas size. Without it, any in-frame activation of an offscreen buffer (filters / masks / cacheAsBitmap) leaves the projection set to the offscreen size and the next frame is vertically offset (observed as text and mesh content rendering halfway down the canvas instead of at its set position). The `_nestLevel` guard around it is also preserved with a `DO NOT remove` comment: although `render()` never recurses today, the guard ensures a future WebGL cacheAsBitmap / drawToTexture will only reset the projection on the outermost call. Both pieces were briefly deleted as "dead code" during the 1.0.0 cleanup and immediately reverted after the regression was caught.

### Removed

- **HashObject / IHashObject / `.hashCode`**: Removed entirely. This was a 2014-era port of Java's `Object.hashCode()` identity-comparison pattern, introduced because ES5 had no `Map`/`WeakMap`. With modern JS, object identity comparison is done with `===` and object-keyed lookups with `WeakMap`/`WeakSet` — neither needs an int ID. The last engine-internal consumer (BitmapData's `Map<number, DisplayObject[]>`) was already migrated to a `WeakMap` in 0.6.3, and a full audit found zero remaining reads of `.hashCode` across `src/`, `test/`, and `examples/`. Removing it drops a per-instance field + global counter increment from every `Point`/`Matrix`/`Rectangle`/`Texture`/`BitmapData`/`SpriteSheet`/`Graphics`/`Event`/`EventDispatcher`/`Filter`. **Breaking for any user code that read `.hashCode`** — replace with `WeakMap`-keyed or `===`-based identity.

### Changed

- **WebGL**: Removed the `experimental-webgl` context fallback in `WebGLRenderContext` and `checkWebGLSupport()`. The `experimental-webgl` name was the IE11 / early-Safari / old-Android-Chrome alias; every modern browser that supports WebGL returns the standard `'webgl'` context (Safari 8+ since 2014). Also dropped the redundant `window.WebGL2RenderingContext` / `window.WebGLRenderingContext` feature-detects — `getContext('webgl2')` / `getContext('webgl')` already return `null` when unsupported.
- **Sound**: Removed the `webkitAudioContext` fallback. Prefixed `AudioContext` was last used by Safari <14.1 (2021); standard `AudioContext` is universally supported now.
- **Video**: Replaced the `requestFullscreen` / `exitFullscreen` vendor-prefix dispatchers (`webkitRequestFullscreen`, `mozRequestFullScreen`, `webkitExitFullscreen`, `mozCancelFullScreen`) with native `requestFullscreen()` / `exitFullscreen()`. The unprefixed API has been standard in every browser since 2018.
- **Base64Util**: Replaced the hand-rolled base64 bit-twiddling with native `btoa` / `atob`. The custom implementation was an ES5-era workaround for old IE; `btoa`/`atob` are universally supported since 2014. The chunked `String.fromCharCode` loop preserves performance on large buffers.

### Build

- **package.json**: Added a `prepublishOnly` hook (`npm run clean && npm run build`) so `npm publish` always ships a freshly built `dist/`. `dist/` is gitignored, so without this hook publishing from a fresh clone or CI would emit an empty package.

### Docs

- **README**: Added a stable (1.0.0) badge and an explicit evergreen-browsers-only targeting note. Added a "Migrating from Egret" section listing every 1.0.0 breaking change (`.hashCode`/`HashObject` removal, `Resource.instance` removal, multi-Player listener API removal, `WebGLRenderContext` singleton removal, `$`-prefixed internal fields, vendor-prefix shim removal). Fixed the test count (569 → 565). Replaced the dead `docs/architecture.md` and `docs/resource.md` links (those files were gitignored, never committed, never published) with the in-package `CHANGELOG.md` and the public demo URL.
- **CORE_REVIEW.md → docs/core-review.md**: Moved out of the published tree (`docs/` is gitignored). This file is an internal review/backlog artifact and was never meant for public consumption.

### Notes

- This release consolidates the stabilization work shipped across 0.6.0–0.6.3, plus a final pass removing 2014-era browser-compatibility shims now that the engine targets modern browsers (ES2022 / evergreen browsers only): the internal `$`-prefixed field renames (0.6.0), the removal of the `Resource.instance` singleton, the multi-Player listener registration API, and the `WebGLRenderContext` singleton (0.6.3), the removal of the Java-era `HashObject` / `.hashCode` identity layer (1.0.0), and the removal of dead vendor-prefix fallbacks (`experimental-webgl`, `webkitAudioContext`, `webkit/moz fullscreen`, hand-rolled base64). No further breaking changes are planned for the 1.x line.
- The 1.0.0 cleanup was iterated against the local `reference/pixijs/pixijs-8.17.1` source to confirm the direction matches what a modern TypeScript game engine actually ships (no `experimental-webgl` fallback, no `webkitAudioContext`, no `HashObject` identity layer).

---

## [0.6.3] — 2026-07-25

### Changed

- **Breaking**: Removed the `Resource.instance` singleton getter (and `_instance` field). Callers should use the existing `export const resource` instance directly. The singleton held a process-wide instance that was awkward to reset between sessions/tests and hid the fact that `Resource` is constructed once at module load.
- **Breaking**: Removed the multi-Player listener registration API (`DisplayObject.addStructureChangeListener`, `DisplayObject.addRenderableDirtyListener`, `DisplayObjectContainer.addContainerStructureChangeListener`) and restored direct static-field assignment. The engine is single-Player by design — `Player` now assigns `DisplayObject.$onStructureChange` / `$onRenderableDirty` / `DisplayObjectContainer.$onContainerStructureChange` directly in its constructor and clears them in `destroy()`. The previous listener-chain registry existed only to support multiple Player instances on one page, a scenario that was never actually supported and added overhead to every dirty-marking path.
- **Breaking**: `WebGLRenderContext` is no longer a singleton. Removed `getInstance()` / `resetInstance()` and made the constructor `public`. `Player` now constructs `new WebGLRenderContext(canvas)` directly. On WebGL init failure, references are dropped so the half-constructed context can be GC'd (previously `resetInstance()` had to be called manually).

### Fixed

- **BitmapData**: Fixed a memory leak in the static `_displayList` registry. It was keyed by `bitmapData.hashCode` (a `Map<number, DisplayObject[]>`), so entries for discarded `BitmapData` objects were never removed and kept strong references to both the `BitmapData` and its dependent `DisplayObject`s alive indefinitely. Switched to a `WeakMap<BitmapData, Set<DisplayObject>>` keyed by the `BitmapData` itself, so entries are reclaimed automatically when the `BitmapData` is GC'd. The per-node membership list also moved from `Array` to `Set` for O(1) add/remove.
- **Event**: `resetForPool()` now clears `this.data` before resetting the event type/bubbles/cancelable. Pooled events previously retained the payload from their last dispatch, leaking arbitrary user data (and strong references to render objects) back into the pool and into the next unrelated dispatch.
- **TextPipe**: Added `FinalizationRegistry`-based texture cleanup for `TextField` caches. Nothing in the engine calls `destroyRenderable()` during the normal TextField lifecycle (UI relayouts and virtualized lists just drop references), so cached WebGL textures previously leaked — the GC callback is now the actual reclamation path, mirroring `GraphicsPipe`'s existing pattern. `destroyRenderable()` also now immediately unregisters and deletes the texture for use as an optional explicit entry point.

### Added

- **License**: Added an MIT `LICENSE` file at the package root with the copyright notice.

### Tests

- Added a `TextPipe` test suite covering texture caching, cache invalidation, and the destroy/GC path.

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
