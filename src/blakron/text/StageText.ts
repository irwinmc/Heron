import { EventDispatcher } from '../events/EventDispatcher.js';
import type { TextField } from './TextField.js';

/**
 * Manages a native HTML <input> or <textarea> element overlaid on the canvas
 * for text input.
 *
 * Positioning strategy
 * ────────────────────
 * The wrapper div uses `position:fixed` so that its `left`/`top` are relative
 * to the **viewport**.  We then compute the viewport coordinates of the
 * TextField by combining `canvas.getBoundingClientRect()` with the stage-
 * logical coordinates from `localToGlobal()`.  This works regardless of the
 * page layout (flexbox centering, CSS transforms, scroll offset, etc.).
 */
export class StageText extends EventDispatcher {
	private _textField?: TextField;
	private _inputElement?: HTMLInputElement | HTMLTextAreaElement;
	private _inputDiv?: HTMLDivElement;
	private _text = '';
	private _gscaleX = 1;
	private _gscaleY = 1;
	private _compositionLock = false;
	private _clearing = false;
	private _isShowing = false;

	setTextField(textField: TextField): void {
		this._textField = textField;
	}

	getText(): string {
		return this._text;
	}

	setText(value: string): void {
		this._text = value;
		if (this._inputElement) this._inputElement.value = value;
	}

	setColor(value: number): void {
		if (this._inputElement) {
			this._inputElement.style.color = colorString(value);
		}
	}

	show(_active = false): void {
		if (!this._textField) return;
		if (this._isShowing) {
			// Already visible — just reposition
			this.initElementPosition();
			this.resetStageText();
			return;
		}
		this.ensureElements();
		this.initElementPosition();
		this.resetStageText();
		this.executeShow();
	}

	hide(): void {
		this.clearInputElement();
	}

	addToStage(): void {
		this.ensureElements();
	}

	removeFromStage(): void {
		this.clearInputElement();
		if (this._inputDiv?.parentElement) {
			this._inputDiv.parentElement.removeChild(this._inputDiv);
			this._inputDiv = undefined;
		}
		this._inputElement = undefined;
	}

	onBlur(): void {
		// clearInputElement is already called from the native blur event listener.
	}

	resetStageText(): void {
		if (!this._textField || !this._inputElement || !this._inputDiv) return;
		const tf = this._textField;
		const el = this._inputElement;
		const canvas = this.getCanvas();
		const stage = tf.stage;

		// _gscaleX/Y = canvas CSS pixels per canvas buffer pixel.
		// The WebGL renderer maps stage coords 1:1 to canvas buffer pixels
		// (projectionVector = canvasWidth/2, -canvasHeight/2), so this ratio
		// is also "CSS pixels per stage pixel".  It is ≈1.0 when the CSS box
		// size matches the buffer size.
		if (canvas) {
			this._gscaleX = (canvas.clientWidth || 1) / (canvas.width || 1);
			this._gscaleY = (canvas.clientHeight || 1) / (canvas.height || 1);
		}

		el.style.fontFamily = tf.fontFamily;
		el.style.fontSize = tf.size * this._gscaleY + 'px';
		el.style.fontWeight = tf.bold ? 'bold' : 'normal';
		el.style.fontStyle = tf.italic ? 'italic' : 'normal';
		el.style.textAlign = tf.textAlign;
		el.style.color = colorString(tf.textColor);
		if (el instanceof HTMLInputElement) {
			el.type = tf.inputType;
			if (tf.maxChars > 0) {
				el.setAttribute('maxlength', String(tf.maxChars));
			} else {
				el.removeAttribute('maxlength');
			}
		}

		// Width: clamp to not exceed the right edge of the stage
		let tw: number;
		if (stage) {
			const globalX = tf.localToGlobal(0, 0).x;
			tw = Math.min(tf.width, stage.stageWidth - globalX);
		} else {
			tw = tf.width;
		}

		// When scaleX !== scaleY (non-uniform stage scaling), the input element
		// needs a CSS transform to match the canvas aspect ratio.
		const rawScaleRatio = this._gscaleX / this._gscaleY;
		const aspectScale = isFinite(rawScaleRatio) ? rawScaleRatio : 1;
		const inputCSSWidth = tw * this._gscaleX;

		el.style.width = inputCSSWidth / aspectScale + 'px';
		if (aspectScale !== 1) {
			el.style.transform = `scale(${aspectScale}, 1)`;
			el.style.left = `${((aspectScale - 1) * inputCSSWidth) / aspectScale / 2}px`;
		} else {
			el.style.transform = '';
			el.style.left = '0px';
		}

		if (tf.multiline) {
			this.setAreaHeight(tf, el);
		} else {
			// Single-line: height = fontSize in CSS pixels, padding handles vertical align
			const cssFontH = tf.size * this._gscaleY;
			el.style.lineHeight = cssFontH + 'px';
			el.style.height = cssFontH + 'px';
			if (tf.height < tf.size) {
				const bottom = (tf.size / 2) * this._gscaleY;
				el.style.padding = `0px 0px ${bottom}px 0px`;
			} else {
				const rap = (tf.height - tf.size) * this._gscaleY;
				const valign = getValign(tf);
				const top = rap * valign;
				let bottom = rap - top;
				if (bottom < (tf.size / 2) * this._gscaleY) {
					bottom = (tf.size / 2) * this._gscaleY;
				}
				el.style.padding = `${top}px 0px ${bottom}px 0px`;
			}
		}

		// Clip the div to the TextField bounds (matches Egret's approach)
		this._inputDiv.style.overflow = 'hidden';
		// this._inputDiv.style.clip = `rect(0px ${inputCSSWidth}px ${tf.height * this._gscaleY}px 0px)`;
		this._inputDiv.style.width = inputCSSWidth + 'px';
		this._inputDiv.style.height = tf.height * this._gscaleY + 'px';
	}

	// ── Element lifecycle ────────────────────────────────────────────────────

	private ensureElements(): void {
		if (this._inputDiv && this._inputElement) return;
		if (!this._textField) return;
		// Create wrapper div
		if (!this._inputDiv) {
			const div = document.createElement('div');
			div.style.position = 'fixed';
			div.style.boxSizing = 'content-box';
			div.style.left = '0px';
			div.style.top = '-100px';
			div.style.border = 'none';
			div.style.padding = '0';
			div.style.margin = '0';
			div.style.width = '0px';
			div.style.height = '0px';
			div.style.overflow = 'hidden';
			div.style.transformOrigin = '0% 0% 0px';
			div.style.zIndex = '10000';
			div.style.pointerEvents = 'none';
			document.body.appendChild(div);
			this._inputDiv = div;
		}
		// Create input element
		if (!this._inputElement) {
			const tf = this._textField;
			const el = tf.multiline ? document.createElement('textarea') : document.createElement('input');
			if (el instanceof HTMLTextAreaElement) {
				el.style.resize = 'none';
			}
			el.style.position = 'absolute';
			el.style.boxSizing = 'content-box';
			el.style.left = '0px';
			el.style.top = '0px';
			el.style.border = 'none';
			el.style.padding = '0';
			el.style.margin = '0';
			el.style.outline = 'thin';
			el.style.background = 'none transparent';
			el.style.overflow = 'hidden';
			el.style.wordBreak = 'break-all';
			el.style.opacity = '0';
			el.style.pointerEvents = 'auto';
			el.value = this._text;
			el.addEventListener('input', () => {
				if (!this._compositionLock) {
					this.onTextInput();
				}
			});
			el.addEventListener('compositionstart', () => {
				this._compositionLock = true;
			});
			el.addEventListener('compositionend', () => {
				this._compositionLock = false;
				this.onTextInput();
			});
			el.addEventListener('focus', () => {
				this.dispatchEventWith('focus');
			});
			el.addEventListener('blur', () => {
				this.dispatchEventWith('blur');
				this.clearInputElement();
			});
			this._inputDiv.appendChild(el);
			this._inputElement = el;
		}
	}

	/**
	 * Positions the wrapper div so that its (0,0) aligns with the TextField's
	 * top-left corner on screen.
	 *
	 * Uses `position:fixed` + viewport coordinates so the calculation works
	 * regardless of the page layout (flex centering, CSS transforms, etc.).
	 *
	 * IMPORTANT: Uses `clientWidth`/`clientHeight` and `clientLeft`/`clientTop`
	 * to correctly handle CSS borders on the canvas element.
	 */
	private initElementPosition(): void {
		if (!this._textField || !this._inputDiv) return;
		const tf = this._textField;
		const canvas = this.getCanvas();
		const stage = tf.stage;

		// Convert the TextField's local origin (0,0) to stage logical coordinates.
		const stagePoint = tf.localToGlobal(0, 0);

		// Convert stage logical coords → viewport (CSS) coords.
		// We must use the canvas' INNER content area (excluding CSS border)
		// for both the origin and the scaling factor.
		let left = stagePoint.x;
		let top = stagePoint.y;

		if (canvas) {
			// getBoundingClientRect includes CSS border
			const rect = canvas.getBoundingClientRect();
			// clientLeft/Top = border width on left/top side
			const borderLeft = canvas.clientLeft;
			const borderTop = canvas.clientTop;

			// Stage coords map 1:1 to canvas buffer pixels (WebGL projection).
			// Canvas buffer pixels map to CSS pixels via:  cssPx = bufPx * (clientW / canvas.width)
			// Combined:  cssPx = stagePx * (clientW / canvas.width)
			const scaleX = (canvas.clientWidth || 1) / (canvas.width || 1);
			const scaleY = (canvas.clientHeight || 1) / (canvas.height || 1);

			left = rect.left + borderLeft + stagePoint.x * scaleX;
			top = rect.top + borderTop + stagePoint.y * scaleY;
		}

		this._inputDiv.style.left = left + 'px';
		this._inputDiv.style.top = top + 'px';

		// For multiline fields with lineSpacing, nudge the textarea up slightly
		if (tf.multiline && tf.height > tf.size && this._inputElement) {
			const sy = this._gscaleY;
			this._inputElement.style.top = `${(-tf.lineSpacing / 2) * sy}px`;
		} else if (this._inputElement) {
			this._inputElement.style.top = '0px';
		}

		// Propagate any rotation from the display hierarchy
		let rotation = 0;
		let node: typeof tf | undefined = tf;
		while (node) {
			rotation += (node as any).rotation ?? 0;
			node = (node as any).parent;
		}
		this._inputDiv.style.transform = rotation !== 0 ? `rotate(${rotation}deg)` : '';
	}

	private executeShow(): void {
		const el = this._inputElement;
		if (!el) return;
		if (el.value !== this._text) {
			el.value = this._text;
		}
		// Reveal the input element
		el.style.opacity = '1';
		this._isShowing = true;
		// Defer focus to avoid the browser stealing it back during the
		// current mousedown event processing.
		setTimeout(() => {
			if (!this._isShowing || !this._inputElement) return;
			el.selectionStart = el.value.length;
			el.selectionEnd = el.value.length;
			el.focus();
		}, 0);
	}

	private clearInputElement(): void {
		if (this._clearing) return;
		this._clearing = true;
		this._isShowing = false;
		const el = this._inputElement;
		const div = this._inputDiv;
		if (el) {
			el.style.opacity = '0';
			el.style.width = '1px';
			el.style.height = '12px';
			el.style.left = '0px';
			el.style.top = '0px';
			el.style.transform = '';
			el.style.padding = '0';
			el.style.lineHeight = '';
			el.style.verticalAlign = '';
			// DO NOT clear el.value here — the text is preserved in _text.
			// Clearing it causes the displayed text to disappear while the
			// InputController still holds a valid text string.
			el.blur();
		}
		if (div) {
			div.style.left = '0px';
			div.style.top = '-100px';
			div.style.height = '0px';
			div.style.width = '0px';
			div.style.transform = '';
			// div.style.clip = '';
		}
		this._clearing = false;
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private setAreaHeight(tf: TextField, el: HTMLElement): void {
		const cssLineH = (tf.size + tf.lineSpacing) * this._gscaleY;
		if (tf.height <= tf.size) {
			// Field shorter than font size — clamp to font height
			el.style.height = tf.size * this._gscaleY + 'px';
			el.style.padding = '0px';
			el.style.lineHeight = cssLineH + 'px';
		} else {
			// Field taller than font size — use line height as content area,
			// padding distributes the remaining space for vertical alignment.
			el.style.height = cssLineH + 'px';
			const rap = (tf.height - tf.size - tf.lineSpacing) * this._gscaleY;
			const valign = getValign(tf);
			const top = Math.max(0, rap * valign);
			const bottom = Math.max(0, rap - top);
			el.style.padding = `${top}px 0px ${bottom}px 0px`;
			el.style.lineHeight = cssLineH + 'px';
		}
	}

	private onTextInput(): void {
		if (this._inputElement) {
			this._text = this._inputElement.value;
			this.dispatchEventWith('updateText');
		}
	}

	private getCanvas(): HTMLCanvasElement | undefined {
		return document.querySelector('canvas') ?? undefined;
	}
}

/** Convert TextField.verticalAlign string to a 0‒1 ratio (Egret style). */
function getValign(tf: TextField): number {
	const v = (tf as any).verticalAlign;
	if (v === 'middle' || v === 'Middle') return 0.5;
	if (v === 'bottom' || v === 'Bottom') return 1;
	return 0; // top
}

function colorString(color: number): string {
	const r = (color >> 16) & 0xff;
	const g = (color >> 8) & 0xff;
	const b = color & 0xff;
	return `rgb(${r},${g},${b})`;
}
