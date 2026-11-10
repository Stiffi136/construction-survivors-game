/**
 * Uniform spatial hash based on linked Int32Arrays (no allocations per frame).
 * The world is infinite: cells are folded onto a 64x64 grid via modulo; callers still check hits by
 * distance, duplicates only occur for queries spanning more than 64 cells.
 */
export class SpatialHash {
  private readonly head = new Int32Array(64 * 64);
  private readonly next: Int32Array;
  private readonly inv: number;

  constructor(capacity: number, readonly cell = 64) {
    this.next = new Int32Array(capacity);
    this.inv = 1 / cell;
  }

  clear(): void {
    this.head.fill(-1);
  }

  insert(index: number, x: number, y: number): void {
    const k = this.key(Math.floor(x * this.inv), Math.floor(y * this.inv));
    this.next[index] = this.head[k]!;
    this.head[k] = index;
  }

  private key(cx: number, cy: number): number {
    return ((cx & 63) << 6) | (cy & 63);
  }

  /** Writes candidate indices in the rectangle [x±r, y±r] into out; returns the count. */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const x0 = Math.floor((x - r) * this.inv);
    const x1 = Math.floor((x + r) * this.inv);
    const y0 = Math.floor((y - r) * this.inv);
    const y1 = Math.floor((y + r) * this.inv);
    let n = 0;
    const max = out.length;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        let i = this.head[this.key(cx, cy)]!;
        while (i !== -1 && n < max) {
          out[n++] = i;
          i = this.next[i]!;
        }
      }
    }
    return n;
  }
}
