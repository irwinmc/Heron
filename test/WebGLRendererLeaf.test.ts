import { describe, expect, it, vi } from 'vitest';
import { Bitmap } from '../src/blakron/display/Bitmap.js';
import { DisplayObject, RenderObjectType } from '../src/blakron/display/DisplayObject.js';
import { Mesh } from '../src/blakron/display/Mesh.js';
import { Shape } from '../src/blakron/display/Shape.js';
import { Sprite } from '../src/blakron/display/Sprite.js';
import { Matrix } from '../src/blakron/geom/Matrix.js';
import { TextField } from '../src/blakron/text/TextField.js';
import { InstructionSet } from '../src/blakron/player/webgl/InstructionSet.js';
import type { WebGLRenderBuffer } from '../src/blakron/player/webgl/WebGLRenderBuffer.js';
import { WebGLRenderer } from '../src/blakron/player/webgl/WebGLRenderer.js';

interface LeafInstruction {
	renderPipeId: string;
	renderable: DisplayObject;
	offsetX: number;
	offsetY: number;
}

interface RendererHarness {
	_createLeafInstruction(obj: DisplayObject, offsetX: number, offsetY: number): LeafInstruction | undefined;
	_executeLeafInstruction(instruction: LeafInstruction, buffer: WebGLRenderBuffer): void;
	_buildLeaf(
		obj: DisplayObject,
		set: InstructionSet,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
	): void;
	_directDraw(obj: DisplayObject, buffer: WebGLRenderBuffer, offsetX: number, offsetY: number): number;
}

function renderer(): RendererHarness {
	return new WebGLRenderer() as unknown as RendererHarness;
}

function buffer(): WebGLRenderBuffer {
	return {
		globalMatrix: new Matrix(),
		globalAlpha: 1,
		globalTintColor: 0xffffff,
	} as WebGLRenderBuffer;
}

describe('WebGLRenderer shared leaf dispatch', () => {
	it('maps every renderable type through one leaf-instruction factory', () => {
		const target = renderer();
		const shape = new Shape();
		const sprite = new Sprite();
		const particle = new DisplayObject();
		particle.$renderObjectType = RenderObjectType.PARTICLE;
		shape.graphics.beginFill(0xffffff);
		shape.graphics.drawRect(0, 0, 10, 10);
		sprite.graphics.beginFill(0xffffff);
		sprite.graphics.drawRect(0, 0, 10, 10);

		expect(target._createLeafInstruction(new Bitmap(), 3, 4)?.renderPipeId).toBe('bitmap');
		expect(target._createLeafInstruction(new Mesh(), 3, 4)?.renderPipeId).toBe('mesh');
		expect(target._createLeafInstruction(shape, 3, 4)?.renderPipeId).toBe('graphics');
		expect(target._createLeafInstruction(sprite, 3, 4)?.renderPipeId).toBe('graphics');
		expect(target._createLeafInstruction(new TextField(), 3, 4)?.renderPipeId).toBe('text');
		expect(target._createLeafInstruction(particle, 3, 4)?.renderPipeId).toBe('particle');
		expect(target._createLeafInstruction(new Sprite(), 3, 4)).toBeUndefined();
		expect(target._createLeafInstruction(new DisplayObject(), 3, 4)).toBeUndefined();
	});

	it('uses the shared factory and executor during direct offscreen traversal', () => {
		const target = renderer();
		const shape = new Shape();
		shape.graphics.beginFill(0xffffff);
		shape.graphics.drawRect(0, 0, 10, 10);
		const create = vi.spyOn(target, '_createLeafInstruction');
		const execute = vi.spyOn(target, '_executeLeafInstruction').mockImplementation(() => {});

		const drawCalls = target._directDraw(shape, buffer(), 5, 7);

		expect(drawCalls).toBe(1);
		expect(create).toHaveBeenCalledWith(shape, 0, 0);
		expect(execute).toHaveBeenCalledWith(expect.objectContaining({ renderPipeId: 'graphics' }), expect.anything());
	});

	it('uses the shared factory when building the main instruction set', () => {
		const target = renderer();
		const shape = new Shape();
		const set = new InstructionSet();
		shape.graphics.beginFill(0xffffff);
		shape.graphics.drawRect(0, 0, 10, 10);
		const create = vi.spyOn(target, '_createLeafInstruction');

		target._buildLeaf(shape, set, buffer(), 5, 7);

		expect(create).toHaveBeenCalledWith(shape, 5, 7);
		expect(set.instructions[0]).toEqual(
			expect.objectContaining({ renderPipeId: 'graphics', renderable: shape, offsetX: 5, offsetY: 7 }),
		);
	});
});
