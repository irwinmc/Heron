import { describe, it, expect, vi } from 'vitest';
import { DisplayObject, RenderMode } from '../src/blakron/display/DisplayObject.js';
import { Rectangle } from '../src/blakron/geom/Rectangle.js';
import { Matrix } from '../src/blakron/geom/Matrix.js';
import { BlurFilter } from '../src/blakron/filters/BlurFilter.js';
import { Event } from '../src/blakron/events/Event.js';

describe('DisplayObject', () => {
	it('x/y setter triggers $renderDirty', () => {
		const obj = new DisplayObject();
		obj.$renderDirty = false;
		obj.x = 10;
		expect(obj.x).toBe(10);
		expect(obj.$renderDirty).toBe(true);
	});

	it('x setter no-op for same value', () => {
		const obj = new DisplayObject();
		obj.x = 5;
		obj.$renderDirty = false;
		obj.x = 5;
		expect(obj.$renderDirty).toBe(false);
	});

	it('scaleX/Y setter updates $useTranslate', () => {
		const obj = new DisplayObject();
		expect(obj.$useTranslate).toBe(false);
		obj.scaleX = 2;
		expect(obj.$useTranslate).toBe(true);
		obj.scaleX = 1;
		expect(obj.$useTranslate).toBe(false);
	});

	it('rotation setter updates matrix dirty', () => {
		const obj = new DisplayObject();
		obj.rotation = 45;
		expect(obj.rotation).toBe(45);
		expect(obj.$useTranslate).toBe(true);
	});

	it('alpha setter triggers $markDirty', () => {
		const obj = new DisplayObject();
		obj.$renderDirty = false;
		obj.alpha = 0.5;
		expect(obj.alpha).toBe(0.5);
		expect(obj.$renderDirty).toBe(true);
	});

	it('visible=false sets $renderMode NONE', () => {
		const obj = new DisplayObject();
		obj.visible = false;
		expect(obj.$renderMode).toBe(RenderMode.NONE);
	});

	it('filters sets $renderMode FILTER', () => {
		const obj = new DisplayObject();
		obj.visible = true;
		obj.filters = [new BlurFilter(4, 4)];
		expect(obj.$renderMode).toBe(RenderMode.FILTER);
	});

	it('filters empty restores $renderMode', () => {
		const obj = new DisplayObject();
		obj.filters = [new BlurFilter()];
		expect(obj.$renderMode).toBe(RenderMode.FILTER);
		obj.filters = [];
		expect(obj.$renderMode).toBeUndefined();
	});

	it('mask with Rectangle sets SCROLLRECT mode', () => {
		const obj = new DisplayObject();
		obj.mask = new Rectangle(0, 0, 100, 100);
		expect(obj.$renderMode).toBe(RenderMode.SCROLLRECT);
	});

	it('mask with DisplayObject sets CLIP mode', () => {
		const obj = new DisplayObject();
		const maskObj = new DisplayObject();
		maskObj.$stage = {} as any;
		obj.mask = maskObj;
		expect(obj.$renderMode).toBe(RenderMode.CLIP);
	});

	it('mask=undefined clears mask', () => {
		const obj = new DisplayObject();
		obj.mask = new Rectangle(0, 0, 100, 100);
		obj.mask = undefined;
		expect(obj.$maskRect).toBeUndefined();
		expect(obj.$renderMode).toBeUndefined();
	});

	it('tint setter updates $tintRGB', () => {
		const obj = new DisplayObject();
		obj.tint = 0xff0000;
		expect(obj.tint).toBe(0xff0000);
		expect(obj.$tintRGB).toBe((0xff0000 >> 16) + (0xff0000 & 0xff00) + ((0xff0000 & 0xff) << 16));
	});

	it('$getMatrix returns correct matrix for translation', () => {
		const obj = new DisplayObject();
		obj.x = 10;
		obj.y = 20;
		const m = obj.$getMatrix();
		expect(m.tx).toBe(10);
		expect(m.ty).toBe(20);
	});

	it('$worldAlpha is computed in $markDirty', () => {
		const obj = new DisplayObject();
		obj.alpha = 0.5;
		expect(obj.$worldAlpha).toBeCloseTo(0.5, 10);
	});

	it('$onRenderableDirty callback is called', () => {
		const fn = vi.fn();
		const prev = DisplayObject.$onRenderableDirty;
		DisplayObject.$onRenderableDirty = fn;
		const obj = new DisplayObject();
		obj.x = 99;
		expect(fn).toHaveBeenCalledWith(obj);
		DisplayObject.$onRenderableDirty = prev;
	});

	it('$onStructureChange callback is called on $renderMode change', () => {
		const fn = vi.fn();
		const prev = DisplayObject.$onStructureChange;
		DisplayObject.$onStructureChange = fn;
		const obj = new DisplayObject();
		obj.visible = false;
		expect(fn).toHaveBeenCalled();
		DisplayObject.$onStructureChange = prev;
	});

	it('scrollRect', () => {
		const obj = new DisplayObject();
		const rect = new Rectangle(10, 20, 100, 200);
		obj.scrollRect = rect;
		expect(obj.scrollRect).toBeDefined();
		expect(obj.scrollRect!.x).toBe(10);
		expect(obj.$renderMode).toBe(RenderMode.SCROLLRECT);
	});

	// ── P0 遗漏 ──

	it('tint clamps overflow (> 0xffffff)', () => {
		const obj = new DisplayObject();
		obj.tint = 0x1ffffff;
		expect(obj.tint).toBe(0xffffff);
	});

	it('tint clamps negative to 0xffffff', () => {
		const obj = new DisplayObject();
		obj.tint = -100;
		expect(obj.tint).toBe(0xffffff);
	});

	it('tint with NaN defaults to 0xffffff', () => {
		const obj = new DisplayObject();
		obj.tint = NaN;
		expect(obj.tint).toBe(0xffffff);
	});

	it('$setMatrix updates x/y from matrix values', () => {
		const obj = new DisplayObject();
		const m = new Matrix(2, 0, 0, 3, 50, 60);
		obj['$setMatrix'](m);
		expect(obj.x).toBe(50);
		expect(obj.y).toBe(60);
	});

	it('$setMatrix with needUpdateProperties=false skips derivation', () => {
		const obj = new DisplayObject();
		const m = new Matrix(2, 0, 0, 3, 50, 60);
		obj['$setMatrix'](m, false);
		expect(obj.x).toBe(50);
	});

	it('ENTER_FRAME adds to static callback list', () => {
		const obj = new DisplayObject();
		const fn = vi.fn();
		obj.addEventListener(Event.ENTER_FRAME, fn);
		expect(DisplayObject.$enterFrameCallBackList).toContain(obj);
		obj.removeEventListener(Event.ENTER_FRAME, fn);
		expect(DisplayObject.$enterFrameCallBackList).not.toContain(obj);
	});

	it('RENDER adds to static callback list', () => {
		const obj = new DisplayObject();
		const fn = vi.fn();
		obj.addEventListener(Event.RENDER, fn);
		expect(DisplayObject.$renderCallBackList).toContain(obj);
		obj.removeEventListener(Event.RENDER, fn);
		expect(DisplayObject.$renderCallBackList).not.toContain(obj);
	});

	it('mask=self is rejected', () => {
		const obj = new DisplayObject();
		obj.mask = obj;
		expect(obj.mask).toBeUndefined();
	});
});
