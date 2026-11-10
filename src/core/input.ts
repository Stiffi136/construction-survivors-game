/** Keyboard + touch joystick (floating, anywhere on the playfield). */
export class Input {
  private keys = new Set<string>();
  private touchId = -1;
  private ox = 0;
  private oy = 0;
  private tx = 0;
  private ty = 0;
  /** Movement vector, length 0..1 */
  x = 0;
  y = 0;
  onPause: (() => void) | null = null;
  onKey: ((code: string) => void) | null = null;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private static readonly RADIUS = 56;

  constructor(target: HTMLElement, overlay: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    overlay.appendChild(this.base);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      this.onKey?.(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    target.addEventListener('pointerdown', (e) => {
      if (this.touchId !== -1) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.touchId = e.pointerId;
      this.ox = this.tx = e.clientX;
      this.oy = this.ty = e.clientY;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      this.base.style.display = 'block';
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.knob.style.transform = 'translate(-50%,-50%)';
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.touchId) return;
      this.tx = e.clientX;
      this.ty = e.clientY;
      let dx = this.tx - this.ox;
      let dy = this.ty - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > Input.RADIUS) {
        // Drag the joystick base along so the thumb never gets "stuck"
        const k = (len - Input.RADIUS) / len;
        this.ox += dx * k;
        this.oy += dy * k;
        this.base.style.left = `${this.ox}px`;
        this.base.style.top = `${this.oy}px`;
        dx = this.tx - this.ox;
        dy = this.ty - this.oy;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.touchId) return;
      this.touchId = -1;
      this.base.style.display = 'none';
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset(): void {
    this.keys.clear();
    this.touchId = -1;
    this.base.style.display = 'none';
    this.x = this.y = 0;
  }

  update(): void {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (this.touchId !== -1) {
      const dx = this.tx - this.ox;
      const dy = this.ty - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > 6) {
        const m = Math.min(1, len / Input.RADIUS);
        x += (dx / len) * m;
        y += (-dy / len) * m;
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.x = x;
    this.y = y;
  }
}
