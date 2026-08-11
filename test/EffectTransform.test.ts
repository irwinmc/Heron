import { describe, expect, it } from 'vitest';
import { Sprite } from '../src/blakron/display/Sprite.js';
import { Filter } from '../src/blakron/filters/Filter.js';
import { Matrix } from '../src/blakron/geom/Matrix.js';
import { Rectangle } from '../src/blakron/geom/Rectangle.js';
import { InstructionSet } from '../src/blakron/player/webgl/InstructionSet.js';
import type { WebGLRenderBuffer } from '../src/blakron/player/webgl/WebGLRenderBuffer.js';
import { WebGLRenderer } from '../src/blakron/player/webgl/WebGLRenderer.js';

interface TestTransform {
	a: number;
	b: number;
	c: number;
	d: number;
	tx: number;
	ty: number;
	offsetX: number;
	offsetY: number;
	alpha: number;
	tint: number;
}

function transform(): TestTransform {
	return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, offsetX: 0, offsetY: 0, alpha: 1, tint: 0xffffff };
}

function updateDirty(renderer: WebGLRenderer, set: InstructionSet): void {
	(renderer as unknown as { _updateDirtyRenderables(value: InstructionSet): void })._updateDirtyRenderables(set);
}

function mockBuffer(): WebGLRenderBuffer {
	return {
		globalMatrix: new Matrix(),
		globalAlpha: 1,
		globalTintColor: 0xffffff,
	} as WebGLRenderBuffer;
}

describe('effect transform partial updates', () => {
	it('indexes effect push instructions on every production build path', () => {
		const renderer = new WebGLRenderer() as unknown as {
			_buildFilter(obj: Sprite, set: InstructionSet, buffer: WebGLRenderBuffer, x: number, y: number): void;
			_buildClip(obj: Sprite, set: InstructionSet, buffer: WebGLRenderBuffer, x: number, y: number): void;
			_buildScrollRect(obj: Sprite, set: InstructionSet, buffer: WebGLRenderBuffer, x: number, y: number): void;
		};
		const filtered = new Sprite();
		filtered.filters = [new Filter()];
		const clipped = new Sprite();
		const scrolled = new Sprite();
		scrolled.scrollRect = new Rectangle(0, 0, 20, 20);
		const filterSet = new InstructionSet();
		const clipSet = new InstructionSet();
		const scrollSet = new InstructionSet();

		renderer._buildFilter(filtered, filterSet, mockBuffer(), 0, 0);
		renderer._buildClip(clipped, clipSet, mockBuffer(), 0, 0);
		renderer._buildScrollRect(scrolled, scrollSet, mockBuffer(), 0, 0);

		expect(filterSet.renderableIndex.get(filtered)).toBe(0);
		expect(clipSet.renderableIndex.get(clipped)).toBe(0);
		expect(scrollSet.renderableIndex.get(scrolled)).toBe(0);
	});

	it('updates filter push and leaf snapshots associated with the same object', () => {
		const renderer = new WebGLRenderer();
		const set = new InstructionSet();
		const obj = new Sprite();
		const filterTransform = transform();
		const leafTransform = transform();
		set.addIndexed({
			renderPipeId: 'filterPush',
			renderable: obj,
			filters: [],
			offsetX: 0,
			offsetY: 0,
			savedBlendMode: 'source-over',
			transform: filterTransform,
		} as never);
		set.addLeaf({ renderPipeId: 'graphics', renderable: obj, transform: leafTransform } as never);

		obj.x = 32;
		obj.y = 17;
		obj.scaleX = 1.5;
		obj.alpha = 0.6;
		set.markRenderableDirty(obj);
		updateDirty(renderer, set);

		for (const snapshot of [filterTransform, leafTransform]) {
			expect(snapshot.tx).toBeCloseTo(obj.$getConcatenatedMatrix().tx);
			expect(snapshot.ty).toBeCloseTo(obj.$getConcatenatedMatrix().ty);
			expect(snapshot.a).toBeCloseTo(obj.$getConcatenatedMatrix().a);
			expect(snapshot.alpha).toBeCloseTo(0.6);
		}
	});

	it('updates scrollRect/mask push and descendant snapshots together', () => {
		const renderer = new WebGLRenderer();
		const set = new InstructionSet();
		const viewport = new Sprite();
		const child = new Sprite();
		child.x = 8;
		viewport.addChild(child);
		const maskTransform = transform();
		const childTransform = transform();
		set.addIndexed({
			renderPipeId: 'maskPush',
			renderable: viewport,
			offsetX: 0,
			offsetY: 0,
			isScrollRect: true,
			transform: maskTransform,
		} as never);
		set.addLeaf({ renderPipeId: 'graphics', renderable: child, transform: childTransform } as never);

		viewport.x = 45;
		viewport.scaleY = 1.25;
		viewport.alpha = 0.7;
		set.markRenderableDirty(viewport);
		updateDirty(renderer, set);

		expect(maskTransform.tx).toBeCloseTo(viewport.$getConcatenatedMatrix().tx);
		expect(maskTransform.d).toBeCloseTo(viewport.$getConcatenatedMatrix().d);
		expect(maskTransform.alpha).toBeCloseTo(0.7);
		expect(childTransform.tx).toBeCloseTo(child.$getConcatenatedMatrix().tx);
		expect(childTransform.d).toBeCloseTo(child.$getConcatenatedMatrix().d);
		expect(childTransform.alpha).toBeCloseTo(0.7);
	});
});
