# `packages/core` — 改进建议清单

> 以下为 RC Review 中标记为「建议（B 类）」的非阻塞改进项，可在 1.0.0 之后逐步处理。

---

## B 类（建议）

| 编号 | 标题 | 说明 |
|---|---|---|
| B1 | WebGLRenderer 死代码行 | `release(create(...))` 注入即还，可删 |
| B2 | 事件子类型 dispatcher | 静态 `dispatchXxxEvent` 冗长，可选简化 |
| ~~B3~~ | ~~geom 继承 HashObject~~ | ✅ 1.0.0 已移除 HashObject/IHashObject/`.hashCode` |
| B4 | 模块级 `let` 注入点 | `bitmapPixelHitTest` 等，脆弱的全局可变 |
| B5 | callLater 异常吞掉 | 单点抛错中止整批 flush（当前 src 零调用，不可达） |
| B6 | HttpRequest headers 残留 | send 后不清空，abort 不派发事件 |
| B7 | ResourceLoader 单槽回调 | `onComplete` 等字段赋值不安全 |
| B8 | Player.render avgFps 可疑 | 公式用 renderTime 而非 wall time |
| B9 | Stage.textureScaleFactor 误导 | 和 Texture 模块同名全局不关联 |
| B10 | sortChildren no-op | DisplayObject 仅清标志，Container 才真排序 |
| ~~B11~~ | ~~HashObject 用途不明~~ | ✅ 1.0.0 已移除（与 B3 一并清理） |
| B12 | 事件 API 风格不统一 | EventDispatcher 用 `addEventListener`，Resource 用 `on/off` |
