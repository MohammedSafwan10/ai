/** Drain even when Chromium suspends animation frames in a hidden window. */
export class EventBatcher<T> {
  private events: T[] = [];
  private frame: number | null = null;
  private timer: number | null = null;

  constructor(private readonly scheduler: {
    requestFrame: (callback: () => void) => number;
    cancelFrame: (id: number) => void;
    setTimer: (callback: () => void, delay: number) => number;
    clearTimer: (id: number) => void;
  }, private readonly consume: (events: T[]) => void) {}

  enqueue(event: T) {
    this.events.push(event);
    // A timer can also be throttled, so incoming traffic enforces a hard bound.
    if (this.events.length >= 64) { this.flush(); return; }
    if (this.frame !== null) return;
    this.frame = this.scheduler.requestFrame(this.flush);
    this.timer = this.scheduler.setTimer(this.flush, 100);
  }

  private cancelScheduled() {
    if (this.frame !== null) this.scheduler.cancelFrame(this.frame);
    if (this.timer !== null) this.scheduler.clearTimer(this.timer);
    this.frame = null;
    this.timer = null;
  }

  flush = () => {
    this.cancelScheduled();
    const events = this.events;
    this.events = [];
    if (events.length) this.consume(events);
  };

  clear() { this.cancelScheduled(); this.events = []; }
}
