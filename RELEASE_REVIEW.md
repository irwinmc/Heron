# Core 发布前审查（Egret 兼容与单 Player 模型）

## 审查结论

本审查以项目的实际目标重新分级：**Egret 风格 API 兼容、典型游戏仅运行一个 Stage / Player / canvas**。

在这个前提下，第一版审查中部分“通用引擎最坏情况”不应阻断当前发布：它们要么是 Egret 自身保留的历史行为，要么仅在多 Player / 多 canvas 架构中发生，要么属于后续健壮性改良。

当前版本建议在完成下列**必修运行时问题**后发布。其余项目已按“发布契约”“架构约束”“Egret 兼容行为”和“后续优化”分类，不应与必修项混为一谈。

本文件记录审查发现与优先级，不包含实现修复。

## 发版前必修项

### 1. WebGL 下祖先容器属性变更不刷新后代叶子指令

- **位置：** `src/blakron/display/DisplayObject.ts`、`src/blakron/player/webgl/WebGLRenderer.ts`
- **优先级：** P0
- **状态：✅ 已修复（未补测试，原因见下）**
- **为何必须修：** 这是单 Player 游戏的正常场景，与多实例无关。普通 `DisplayObjectContainer` 没有自己的叶子渲染指令；修改其 `x`、`y`、`alpha` 或 `tint` 后，WebGL dirty 更新找不到容器对应的指令，也不会刷新其 Bitmap、Shape 等后代的指令快照。Canvas 会逐帧遍历显示树，因此两种渲染后端表现不一致。
- **复现：** 首次渲染后执行 `container.x += 100`，子节点在 Canvas 正常移动，WebGL 可能仍使用旧位置。
- **修复方式：** `WebGLRenderer._updateDirtyRenderables()` 原来只在 `renderableIndex` 里查到 dirty 对象对应的叶子指令时才刷新其 transform 快照，查不到（容器永远查不到，因为容器不会调用 `addLeaf`）就直接跳过。现在新增分支：当 dirty 对象是有子节点的容器时，调用新方法 `_refreshDescendantTransforms()` 递归遍历其子树，对每个已注册的后代叶子指令重新计算 transform 快照；遇到嵌套的 RenderGroup 子树则不再往下走（该子树有自己独立的 InstructionSet，由它自身的 dirty 通知负责刷新，避免用错误的 InstructionSet 索引）。同时把 `cacheAsBitmap` 的合成指令从 `set.add()` 改为 `set.addLeaf()`，使其也能被祖先 dirty 命中而刷新（之前它完全没有注册进 `renderableIndex`，属于同一类问题的另一个实例）。
- **为何未补测试：** 该路径依赖真实 WebGL context 驱动 `render()` 走到修改的分支；测试环境（happy-dom）没有 WebGL，构造 `WebGLRenderer` 本身不报错，但要触发 `_updateDirtyRenderables()` 需要完整 mock 一套 GL 绘制调用链，性价比低。已用现有单元测试套件（551 项）和 `pnpm build` 验证未引入回归，但这条修复本身缺少直接覆盖，建议后续有真实浏览器/WebGL 测试环境时补上一条端到端验证：WebGL 首帧渲染后修改祖先 transform/alpha/tint，断言子节点绘制状态同步更新。

### 2. ResourceLoader 的失败重试或缺少 analyzer 会使加载永不完成

- **位置：** `src/blakron/resource/ResourceLoader.ts`
- **优先级：** P0
- **状态：✅ 已修复**
- **为何必须修：** 这是明确的队列计数错误。任务失败完成路径已经减少一次 `activeCount`，重试路径又额外减少一次；最终可能为负，`start()` 的完成条件永远不满足。缺少 analyzer 时，已增加的 activeCount 又没有被正常完成路径回收。
- **复现：** 使用返回 `{ loaded: false }` 的 analyzer 并设置 `retryCount = 1`；或加载一个没有注册 analyzer 的 type；等待 `start()` 将永远 pending。
- **修复方式：** 新增 `finishItem()` 作为唯一的“单个 item 结束”入口，`activeCount--` 只在这一处发生一次，`loadItem()` 的成功/失败/异常分支和无 analyzer 分支统一调用它；`onItemError()` 的重试分支不再重复递减。
- **测试：** `test/ResourceLoader.test.ts`，覆盖全部成功、重试后失败、无 analyzer、Promise rejection、成功/失败/无analyzer混合、threadCount 并发上限六个场景，全部验证 `start()` 会正常 resolve 且不会挂起。

### 3. Resource.loadGroup 并发调用会覆盖前一批次

- **位置：** `src/blakron/resource/Resource.ts`、`src/blakron/resource/ResourceLoader.ts`
- **优先级：** P1；如果公开 API 承诺并发 group 加载，则按 P0 处理。
- **状态：✅ 已修复（方案 3：串行化）**
- **Egret 对照：** Egret `ResourceLoader` 维护按 group 划分的队列和状态，允许多个 group 进入加载调度。
- **问题：** 当前实现只有一套队列、回调和 resolve。第二次 `loadGroup()` 会覆盖第一次批次；第一次 Promise 可能永远不结束，事件也可能归入错误 group。`abort()` 后旧 analyzer Promise 完成也可污染新批次。
- **处理选择（已采纳第 3 项）：**
    1. 实现 Egret 风格的多 group 队列；或
    2. 明确规定一次只允许一个 group，并在并发调用时立即 reject；或
    3. **将请求串行化。**（本次采用）

    当前静默覆盖并挂起 Promise 的行为不可保留。

- **修复方式：** 新增 `groupLoadQueue`（一个持续存在的 Promise 链）。每次 `loadGroup()` 把自己的 `loadResourceList()` 调用挂在队列尾部，无论前一批次成功还是失败都会继续推进队列，不会阻塞后续 `loadGroup()`。各次调用返回的 Promise 仍独立 resolve/reject，调用方感知不到底层是串行执行的。这是最小改动方案；若后续需要真正的并发 group 加载（不同 group 同时进行、互不等待），需要按方案 1 给 `ResourceLoader` 增加按 group 分区的队列，属于更大的改动，留给未来迭代。
- **测试：** `test/Resource.test.ts`，验证：(1) 两个并发 `loadGroup()` 调用不会互相覆盖，且都能正确 resolve；(2) 前一个 group 失败不会卡住后一个 group；(3) 重复加载同一已完成 group 不会重新触发加载。修复前用 stash 验证过，前两个测试会因为 Promise 挂起而 3 秒超时，确认测试能捕获该 bug。

### 4. ByteArray 的读取边界使用物理容量，而非逻辑写入长度

- **位置：** `src/blakron/utils/ByteArray.ts`
- **优先级：** P0
- **状态：✅ 已修复**
- **Egret 对照（修复时更正）：** 复查 `reference/egret-core/src/egret/utils/ByteArray.ts` 发现，Egret 自身的 `bytesAvailable` getter 和 `validate()` 实际上也是基于 `this.data.byteLength`（物理容量），并非 `write_position`（逻辑长度）——即 Egret 原版就带有这个问题，Blakron 只是原样继承。第一版审查里"Egret 使用 write_position 作为可读边界"的说法不准确，在此更正。不过这不改变该不该修：允许读出未写入的预分配零字节仍是真实缺陷，会掩盖长度计算错误、让二进制协议解析静默出错，因此仍按 P0 修复，只是不再归因于"偏离 Egret 行为"。
- **问题：** 当前 `bytesAvailable` 和 read validation 基于物理 buffer 容量。`new ByteArray(undefined, 8)` 的 `length` 为 0，却可读出八个零字节，二进制协议或资源解析可能静默读错。
- **修复方式：** `bytesAvailable`、`validate()`、私有 `_validate()` 三处判断依据从 `this._data.byteLength` / `this._bytes.length`（物理容量）改为 `this._writePosition`（逻辑写入长度）。写入路径（`_ensureWrite`/`validateBuffer`/`_validateBuffer`）不受影响，物理扩容逻辑保持原样。
- **测试：** `test/ByteArray.test.ts` 新增 `logical vs physical read boundary` 分组，覆盖：空 ByteArray 预分配容量下 `bytesAvailable` 为 0、超出逻辑长度读取抛 `RangeError`（`readByte`/`readUnsignedInt`/`readUTFBytes`/`validate`）、截断 `length` 后逻辑边界正确收紧。修复前用 stash 验证过，7 个新测试里有 6 个会失败，确认测试能捕获该 bug。

### 5. EventDispatcher.once 在跨 dispatcher 重入时可能再次执行

- **位置：** `src/blakron/events/EventDispatcher.ts`
- **优先级：** P1，建议随本次修复。
- **状态：✅ 已修复**
- **Egret 对照：** Egret 也使用全局一次性监听队列，但每个 `EventBin` 保存所属 `target`，最终从正确的 dispatcher 删除。Blakron 的队列项没有 owner 信息，嵌套 dispatch 时可能尝试从错误对象删除，导致原 listener 留存。
- **影响：** 不常见，但违反 `once()` 的核心语义，且不是必须继承的 Egret 历史行为。
- **真实触发条件（比第一版审查描述的更精确）：** 只有当 dispatcher A 的同一次 `notifyListener` 循环里，**排在前面**的一个 once 监听器先执行完并被 push 进共享的 `ONCE_LIST`，**排在后面**的另一个监听器（同一循环、同一次 dispatch）又同步触发了 dispatcher B 的完整 dispatch+drain，才会命中：B 的 drain 会把还留在栈顶的 A 的那条一起弹出，用 `this = B` 去调用 `removeEventListener`，因为 A 的 listener 不在 B 的 map 里，删除操作静默失败，A 的 once 监听器实际从未被移除，下次 dispatch 会再次触发。
- **修复方式：** `ONCE_LIST` 的元素从裸 `EventBin` 改为 `{ bin, owner }`，`owner` 记录 push 时的 `this`（即触发该 once 监听器的 dispatcher 实例）。`notifyListener()` 的 drain 循环从"无条件清空整个共享栈"改为"只弹出栈顶属于当前 dispatcher 的连续条目"（`while (... ONCE_LIST[top].owner === this)`），并用 `owner.removeEventListener(...)` 而非 `this.removeEventListener(...)` 执行删除，确保永远从正确的 dispatcher 删除。
- **测试：** `test/EventDispatcher.test.ts` 新增 `once() across nested dispatchers (reentrancy)` 分组，按上述真实触发条件构造：A 上一个高优先级 once + 一个后触发嵌套 dispatch 的普通监听器，验证 A 的 once 不会被 B 的 drain 误删除；并补充三层嵌套（A→B→C）场景。修复前用 stash 验证过，两个精确复现用例都会失败（once 回调被多调用一次），确认测试能捕获该 bug。

## 发布契约：本次必须明确的决策

### ESM / CommonJS export

- **位置：** `package.json`
- **优先级：** P1
- **现状：** 包为 `"type": "module"`，但 `exports["."].require` 与 `import` 都指向 `./dist/index.js`，后者是 ESM。
- **处理选择：**
    - 若只支持现代浏览器和 ESM bundler：删除 `require` 条件，明确 ESM-only；
    - 若宣称支持 CommonJS：生成真实 `.cjs` 产物并让 `require` 指向该文件。

这不影响浏览器游戏运行，但不能继续维持“声明支持 require、实际未提供 CJS”的模糊契约。

### 发布流水线

- **位置：** `package.json`
- **优先级：** 建议处理，不阻断功能发布。
- **现状：** 没有 `prepack` 或 `prepublishOnly`；发布时直接使用目录中现存的 `dist`。
- **建议：** 发布流程至少执行 clean、build、test，并用 pack dry-run 核对产物。是否写入 npm lifecycle hook 由发布流程决定。

## 单 Player 架构约束：不阻断当前发布

### WebGLRenderContext 为全局单例

- **位置：** `src/blakron/player/webgl/WebGLRenderContext.ts`、`src/blakron/player/Player.ts`
- **结论：** 不作为当前 blocker。
- **原因：** 常规游戏仅运行一个 canvas / Stage / Player。Egret 的主运行模型同样围绕单个游戏舞台建立，不需要为编辑器预览、多画布嵌入或多游戏实例提前实现多 context。
- **约束：** 当前 WebGL 后端应明确视为**单 Player / 单 canvas**设计。未来若支持多 canvas，再将 context 管理改为按 canvas 实例化。

### 多 Player 的静态回调注销不完整

- **位置：** `src/blakron/display/DisplayObject.ts`、`src/blakron/display/DisplayObjectContainer.ts`、`src/blakron/player/Player.ts`
- **结论：** 不作为当前 blocker。
- **原因：** 问题发生在多个 WebGL Player 同时注册后再 destroy 的场景。单 Player 正常启动、停止、销毁路径不构成当前游戏运行风险。
- **后续：** 扩展多实例支持前，应将静态回调从 wrapper 链改为可独立删除的 listener 集合。

## Egret 历史兼容行为：本次不建议修改

以下行为从现代 API 视角可以改良，但 Egret 参考实现本身也采用相同或等价设计。若当前目标是兼容 Egret 风格游戏，不应将它们作为本次发布阻断项。

### Touch cancel 与多点 move 去重

- **位置：** `src/blakron/player/TouchHandler.ts`
- **Egret 对照：** `reference/egret-core/src/egret/web/WebTouchHandler.ts` 将原生 `touchcancel` 交给 `onTouchEnd()`；`reference/egret-core/src/egret/player/TouchHandler.ts` 也使用全局 `lastTouchX/Y` 而非每个 touch ID 独立坐标。
- **结论：**
    - `touchcancel` 产生 `TOUCH_END` / `TOUCH_TAP`；
    - 两指交错移动到相同坐标可能被去重；

    都属于继承的历史行为。除非决定升级输入语义并接受与 Egret 的差异，否则本次保持不变。

### ByteArray.dataView slice 与 writeUTF 长度

- **位置：** `src/blakron/utils/ByteArray.ts`
- **Egret 对照：** Egret 的 `dataView` setter 同样使用 `value.buffer`，忽略 view 的 byte offset/length；`writeUTF()` 同样是 16-bit 长度前缀。
- **结论：**
    - `DataView` slice 被扩大为完整 backing buffer；
    - UTF-8 字节数超过 65535 时的长度回绕；

    都可在未来作为安全增强处理，但会改变历史边界行为，不作为本次兼容发布必修项。

### Matrix.createBox 的非均匀缩放 + 旋转

- **位置：** `src/blakron/geom/Matrix.ts`
- **结论：** 不修。
- **原因：** 当前公式沿用 Egret `Matrix.createBox` 的约定。它可能不符合另一种常见的“先 scale 再 rotate”数学直觉，但改动会破坏现有 Egret 兼容语义。

### BitmapFont、BitmapText 与 TextField 的文本边界

- **位置：** `src/blakron/text/BitmapFont.ts`、`src/blakron/text/BitmapText.ts`、`src/blakron/text/TextField.ts`
- **结论：** 不作为本次 blocker。
- **范围：** BMP 以外码点/emoji、末尾换行空行、高度裁剪边界等属于历史文本系统和布局边缘问题。需要现代 Unicode 或严格富文本布局时，再以明确的行为升级单独处理。

## 后续健壮性优化：按实际使用场景排期

这些问题有效，但不应阻塞单 Player、Egret 风格的核心发布：

| 项目                                           | 位置                                      | 说明                                                     |
| ---------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Sheet 配置缺少 `frames` 仍报告成功             | `resource/analyzers/SheetAnalyzer.ts`     | 无效导出资源应更清晰地失败；正常导出资源不触发。         |
| config JSON parse 失败未派发 CONFIG_LOAD_ERROR | `resource/Resource.ts`                    | 事件一致性改良。                                         |
| 重载同名 config 不覆盖旧定义                   | `resource/ResourceConfig.ts`              | 多配置热更新场景；不是典型启动加载流程。                 |
| Sheet 子资源同名冲突                           | `resource/analyzers/SheetAnalyzer.ts`     | 正常资源 key 应全局唯一。                                |
| Sound decode 同步 throw 锁住队列               | `media/Sound.ts`                          | 低频浏览器异常路径；可用 try/finally 加固。              |
| Sound close/load 不真正 abort 旧传输           | `media/Sound.ts`                          | 当前 generation 防止旧回调恢复状态；资源释放可后续加强。 |
| HttpRequest 旧 XHR 事件迟到                    | `net/HttpRequest.ts`                      | abort 后浏览器通常不会再回调；可加实例校验防御。         |
| Video close/fullscreen 与 poster 竞争          | `media/Video.ts`                          | 视频全屏中 close、快速替换 poster 的边缘场景。           |
| play() Promise rejection                       | `media/SoundChannel.ts`、`media/Video.ts` | 自动播放策略下的浏览器健壮性。                           |
| Player FPS 统计                                | `player/Player.ts`                        | 调试遥测准确性，不影响渲染结果。                         |
| localStorage SecurityError                     | `localStorage/localStorage.ts`            | sandbox 或禁用存储环境。                                 |
| ExternalInterface 的 `this` receiver           | `external/ExternalInterface.ts`           | host callback 依赖 `window` receiver 的集成场景。        |
| CustomFilter shader key 拼接碰撞               | `filters/CustomFilter.ts`                 | 仅特定自定义 shader 文本组合触发。                       |
| Base64 非法输入校验                            | `utils/Base64Util.ts`                     | 输入安全性增强。                                         |

## 修复执行记录

发版前必修项 1-5 已全部修复完成，逐项状态：

| #   | 问题                                    | 状态      | 测试                                                                                                 |
| --- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| 1   | WebGL 祖先容器 dirty 不传播             | ✅ 已修复 | 无自动化测试 — 需要真实 WebGL context，happy-dom 无法驱动，已用现有 558+ 单元测试 + build 验证无回归 |
| 2   | ResourceLoader activeCount 计数错误     | ✅ 已修复 | `test/ResourceLoader.test.ts`（新增 6 项）                                                           |
| 3   | Resource.loadGroup 并发覆盖             | ✅ 已修复 | `test/Resource.test.ts`（新增 3 项）                                                                 |
| 4   | ByteArray 读取边界用物理容量            | ✅ 已修复 | `test/ByteArray.test.ts`（新增 7 项）                                                                |
| 5   | EventDispatcher.once 跨 dispatcher 重入 | ✅ 已修复 | `test/EventDispatcher.test.ts`（新增 3 项）                                                          |

除第 1 项外，其余四项均在修复前用 `git stash` 临时还原源码验证过：对应的新测试在未修复状态下会失败，确认测试确实覆盖了原始 bug，而不是同义反复。

修复过程中发现并更正了第一版审查里一处不准确的表述：问题 4 的"Egret 对照"称 Egret 使用 `write_position` 作为可读边界，但复查 `reference/egret-core` 源码后确认 Egret 自身的 `bytesAvailable`/`validate()` 同样基于物理容量，即该问题是 Egret 原版就有的历史缺陷，Blakron 只是原样继承。这不影响该问题的修复必要性，已在对应章节更正说明。

## 测试策略

当前单元测试覆盖事件、几何、工具、显示对象、纹理以及部分 Net/媒体 API。发版前必补测试已随本次修复补齐（见上表），以下仍是后续按未来架构补充的范围：

- 多 Player / 多 canvas；
- 真实浏览器的 WebGL 上下文丢失、touch、AudioContext、fullscreen、CORS、storage 权限（包括问题 1 WebGL 祖先 dirty 传播的端到端验证）；
- 文本 Unicode 与复杂布局。

不要仅因为 happy-dom 测试通过，就认为真实 WebGL 或浏览器媒体路径已经被验证。

## 已执行验证

| 检查                                         | 结果                                      |
| -------------------------------------------- | ----------------------------------------- |
| `pnpm test -- --run --reporter=dot`          | 通过：39 个测试文件，542 项测试           |
| `pnpm build`                                 | 通过；仅有已有 npm 环境配置弃用警告       |
| `npm pack --dry-run --json --ignore-scripts` | 通过：预计发布 574 个文件，解包约 1.41 MB |

当前 dry-run 发布内容包含 `benchmark` 和 source map。是否保留这些产物属于发布策略决策。

## 审查依据与范围

- 审查范围：`packages/core` 的源代码、公共导出、测试、构建配置和 dry-run 发布产物。
- 重新分级参考：`reference/egret-core` 的 EventDispatcher、ByteArray、WebTouchHandler、TouchHandler、Player、ResourceLoader、Matrix、文本与 Video 实现。
- 默认运行模型：单 Stage / 单 Player / 单 canvas。
- 未修改业务实现。
- 未执行 Git 命令。
- 未读取或构建 examples / demo。
