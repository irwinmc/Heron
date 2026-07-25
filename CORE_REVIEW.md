# `packages/core` — RC Review

> 审查范围：`src/blakron/`。目标：将 `packages/core` 作为独立核心引擎模块进行 Release Candidate Review。

---

## 审查结论

**A 类（必须修复）：已全部处理。** 其中 5 项代码修复，3 项降级。

共改动 6 个源文件 + 3 个测试文件，`npm run build` + `npm test`（569/569）全部通过。

---

## A 类：实际修复（5 项）

### A1 — Resource 双单例

**问题**：`Resource.instance`（懒加载 getter）和 `export const resource`（模块加载时构造）是两个**互不引用**的实例，各自持有独立的 config、loadedNames、analyzers。

**修复**：删除 `Resource.instance` getter + `_instance` 字段，只保留 `export const resource = new Resource()` 一条入口。全项目 `Resource.instance` 零使用。

**文件**：`Resource.ts`

### A2 — DisplayObject 监听器注册 API 声称支持多 Player 但失效

**问题**：`addStructureChangeListener` / `addRenderableDirtyListener` / `addContainerStructureChangeListener` 用包装器链实现「多 Player 支持」，但 unregister 只在 `=== fn` 时生效——包装器永不等于 `fn`，unregister 是空操作。

**讨论后决策**：RC 不支持多 Player（与 A3/A5 一致）。删除三个注册 API，恢复为直接赋值的静态字段，注释诚实标注「Single-Player engine」。

**文件**：`DisplayObject.ts`、`DisplayObjectContainer.ts`、`Player.ts`

### A3 — WebGLRenderContext 按类单例

**问题**：`getInstance(canvas)` 忽略 canvas 参数（仅首次用），HMR 时第二/三次 `new Player` 用错 canvas。`resetInstance()` 只清静态字段，不清 GL 资源。

**讨论后决策**：去掉单例（构造函数改 public），`Player` 直接 `new WebGLRenderContext(canvas)`。不实现 `dispose()`——Player 永不真销毁，对齐 Egret 单例哲学。catch 分支清空引用让 GC 回收。

**文件**：`WebGLRenderContext.ts`、`Player.ts`

### A6 — BitmapData 静态 Map 内存泄漏

**问题**：`Map<number, DisplayObject[]>` 以 hashCode 为键，永不清空。BitmapData 被丢弃后条目永久驻留，连带 DisplayObject 引用阻止 GC。

**修复**：改为 `WeakMap<BitmapData, Set<DisplayObject>>`。BitmapData 不可达时由 GC 自动清除。同时删除了 `addDisplayObject` 里的死代码 `if (!hashCode) return`（hashCode 从 1 起永不触发）。

**文件**：`BitmapData.ts`

### A8 — Event 池化不清 data

**问题**：`resetForPool()` 重置 type/bubbles/cancelable/flags，但不清 `data`。非 `dispatchEventWith` 路径从池里取出 Event 后若忘记设 data，会派发上一个使用者的载荷。

**修复**：`resetForPool` 内加 `this.data = undefined`（1 行）。

**文件**：`Event.ts`

---

## A 类：降级（3 项）

### A4 → C — setupLifecycle 监听器

原判断：`document` 上的 `visibilitychange` 监听器从不移除是内存泄漏。

**降级理由**：单 Player 引擎 + Player 永不 destroy，`setupLifecycle` 只被调用一次，监听器恒为 1 个，不随时间增长。与 Egret 单例行为一致——引擎生命周期 = 页面生命周期。不修。

### A5 → C — ticker 全局单例

原判断：`export const ticker = new SystemTicker()` 是模块级单例，Stage.frameRate 多 Player 下互相覆盖。

**降级理由**：单 Player 下不冲突。与 Egret `MainContext` 全局 ticker 一致。不修。

### A7 → B — DisplayObject 无 destroy

原判断：DisplayObject 丢失后 ENTER_FRAME/RENDER 静态列表引用泄漏。

**降级理由**：大多数 DisplayObject 不监听 ENTER_FRAME，移除 from parent 后直接 GC。监听了 ENTER_FRAME 的开发者必定会主动 `removeEventListener`（否则会有明显视觉 bug）。Egret 也从未提供 `DisplayObject.destroy()`，无数项目正常运行。不修。

---

## B 类（建议，RC 之后）

| 编号 | 标题 | 说明 |
|---|---|---|
| B1 | WebGLRenderer 死代码行 | `release(create(...))` 注放即还，可删 |
| B2 | 事件子类型 dispatcher | 静态 `dispatchXxxEvent` 冗长，可选简化 |
| B3 | geom 继承 HashObject | 热路径每实例 hashCode 开销 |
| B4 | 模块级 `let` 注入点 | `bitmapPixelHitTest` 等，脆弱的全局可变 |
| B5 | callLater 异常吞掉 | 单点抛错中止整批 flush |
| B6 | HttpRequest headers 残留 | send 后不清空，abort 不派发事件 |
| B7 | ResourceLoader 单槽回调 | `onComplete` 等字段赋值不安全 |
| B8 | Player.render avgFps 可疑 | 公式用 renderTime 而非 wall time |
| B9 | Stage.textureScaleFactor 误导 | 和 Texture 模块同名全局不关联 |
| B10 | sortChildren no-op | DisplayObject 仅清标志，Container 才真排序 |
| B11 | HashObject 用途不明 | 仅提供 hashCode，无 equals/toString |
| B12 | 事件 API 风格不统一 | EventDispatcher 用 `addEventListener`，Resource 用 `on/off` |

---

## C 类（可保留）

| 编号 | 标题 |
|---|---|
| C1 | EventDispatcher 突变保护 |
| C2 | RenderMode/RenderObjectType const enum |
| C3 | sharedMatrix 等单例临时变量 |
| C4 | setupLifecycle 监听器（原 A4） |
| C5 | ticker 全局单例（原 A5） |

---

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `Resource.ts` | 删除 `instance` getter + `_instance` |
| `DisplayObject.ts` | 删除 `addStructureChangeListener` / `addRenderableDirtyListener` |
| `DisplayObjectContainer.ts` | 删除 `addContainerStructureChangeListener` |
| `WebGLRenderContext.ts` | 去单例，构造函数改 public |
| `BitmapData.ts` | `Map<number, DO[]>` → `WeakMap<BitmapData, Set<DO>>` |
| `Event.ts` | `resetForPool` 加 `this.data = undefined` |
| `Player.ts` | 适配 A2/A3 改动 |
| `test/DisplayObject.test.ts` | 适配 A2 |
| `test/DisplayObjectContainer.test.ts` | 适配 A2 |
