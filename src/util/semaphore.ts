/**
 * Minimal non-blocking counting semaphore. Used to cap concurrent ffmpeg
 * burn-in jobs (each is CPU-heavy). tryAcquire returns a one-shot release
 * function, or null when the limit is reached (caller returns 503).
 */
export class Semaphore {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }

  get inUse(): number {
    return this.active;
  }

  get limit(): number {
    return this.max;
  }
}
