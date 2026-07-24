import type { ResourceItem } from './ResourceItem.js';
import type { AnalyzerBase } from './analyzers/AnalyzerBase.js';

/**
 * Queue-based resource loader with concurrency control.
 *
 * - Items are processed in priority order (higher priority first).
 * - Concurrency is limited to `threadCount` (default 2).
 * - Failed items are retried up to `retryCount` times (default 3).
 * - Progress is reported via the `onProgress` callback.
 */
export class ResourceLoader {
	// ── Configuration ──────────────────────────────────────────────────────

	/** Maximum concurrent loads */
	public threadCount = 2;
	/** Maximum retries for failed items */
	public retryCount = 3;

	// ── Callbacks ──────────────────────────────────────────────────────────

	/** Called for each successfully loaded item */
	public onComplete?: (item: ResourceItem) => void;
	/** Called for each failed item (after retries exhausted) */
	public onError?: (item: ResourceItem) => void;
	/** Called with (loaded, total) progress */
	public onProgress?: (loaded: number, total: number) => void;

	// ── Internal state ─────────────────────────────────────────────────────

	private pendingList: ResourceItem[] = [];
	private loadingList: ResourceItem[] = [];
	private retryDic: Map<string, number> = new Map<string, number>();
	private analyzerMap: Map<string, AnalyzerBase> = new Map<string, AnalyzerBase>();
	private activeCount = 0;

	// ── Public API ─────────────────────────────────────────────────────────

	/**
	 * Register an analyzer for a resource type.
	 */
	public registerAnalyzer(type: string, analyzer: AnalyzerBase): void {
		this.analyzerMap.set(type, analyzer);
	}

	/**
	 * Enqueue items for loading. Does not start loading — call `start()` to begin.
	 */
	public loadResourceList(list: ResourceItem[]): void {
		this.pendingList = list.slice();
		this.loadingList = [];
	}

	/**
	 * Start or resume loading. Returns a promise that resolves when all items are loaded.
	 */
	public start(): Promise<void> {
		return new Promise<void>(resolve => {
			this._resolve = resolve;
			this.next();
		});
	}

	/**
	 * Abort all loading.
	 */
	public abort(): void {
		this.pendingList = [];
		this.loadingList = [];
		this.activeCount = 0;
		if (this._resolve) {
			this._resolve();
			this._resolve = undefined;
		}
	}

	// ── Private methods ────────────────────────────────────────────────────

	private _resolve?: () => void;

	private next(): void {
		// All done?
		if (this.pendingList.length === 0 && this.activeCount === 0) {
			if (this._resolve) {
				this._resolve();
				this._resolve = undefined;
			}
			return;
		}

		// Fill up to threadCount
		while (this.activeCount < this.threadCount && this.pendingList.length > 0) {
			const item = this.pendingList.shift()!;
			this.loadingList.push(item);
			this.activeCount++;
			this.loadItem(item);
		}
	}

	/**
	 * Load a single item via its registered analyzer and route the outcome
	 * through `finishItem()`, regardless of how it finished (no analyzer,
	 * synchronous throw, rejection, or a resolved result).
	 *
	 * `analyzer.loadFile(item)` is a plain (possibly user-supplied) method —
	 * it isn't guaranteed to always return a Promise before throwing. If it
	 * throws synchronously instead of rejecting, that exception happens on
	 * the call expression itself, before any Promise exists to attach
	 * `.catch()` to; without the try/catch below, the exception would
	 * propagate out of `loadItem()` (past `next()`'s while-loop, skipping
	 * every subsequent item this tick) and this item's `activeCount` slot
	 * would never be retired, permanently wedging `start()`.
	 */
	private loadItem(item: ResourceItem): void {
		const analyzer = this.analyzerMap.get(item.type);
		if (!analyzer) {
			item.loaded = false;
			this.finishItem(item);
			return;
		}

		let result: Promise<ResourceItem>;
		try {
			result = analyzer.loadFile(item);
		} catch {
			item.loaded = false;
			this.finishItem(item);
			return;
		}

		result
			.then(r => {
				this.finishItem(r);
			})
			.catch(() => {
				item.loaded = false;
				this.finishItem(item);
			});
	}

	/**
	 * Single completion point for an in-flight item, whether it loaded, failed,
	 * threw, or had no analyzer. Decrements `activeCount` exactly once per item
	 * so retry / no-analyzer paths can't double-decrement or leak a slot.
	 */
	private finishItem(item: ResourceItem): void {
		this.loadingList = this.loadingList.filter(i => i !== item);
		this.activeCount--;

		if (item.loaded) {
			this.onItemComplete(item);
		} else {
			this.onItemError(item);
		}
	}

	private onItemComplete(item: ResourceItem): void {
		this.reportProgress();

		if (this.onComplete) {
			this.onComplete(item);
		}

		this.next();
	}

	private onItemError(item: ResourceItem): void {
		const retries = this.retryDic.get(item.name) ?? 0;
		if (retries < this.retryCount) {
			this.retryDic.set(item.name, retries + 1);
			this.pendingList.push(item);
			this.next();
			return;
		}

		// Retries exhausted
		if (this.onError) {
			this.onError(item);
		}

		this.reportProgress();
		this.next();
	}

	private reportProgress(): void {
		if (this.onProgress) {
			const total = this.pendingList.length + this.loadingList.length + this.activeCount;
			const loaded = total > 0 ? this.activeCount : 0;
			this.onProgress(loaded, total + loaded);
		}
	}
}
