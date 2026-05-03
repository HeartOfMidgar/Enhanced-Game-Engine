/**
 * Lightweight time / FPS tracker.
 *
 * The engine drives this via {@link Time.update} once per real frame; consumers
 * read `dt`, `elapsed`, `fps`, `frameCount` for telemetry and HUDs.
 */
export class Time {
  /** Real seconds since the previous frame, clamped to {@link maxFrameTime}. */
  dt = 0;
  /** Total real seconds since {@link Time.reset}. */
  elapsed = 0;
  /** Smoothed frames-per-second. */
  fps = 0;
  /** Frames updated since reset. */
  frameCount = 0;

  /** Hard cap on a single frame's `dt` to avoid spiral-of-death after pauses. */
  maxFrameTime = 0.25;

  /** How often to recompute the FPS counter, in seconds. */
  fpsUpdateRate = 0.5;

  private fpsAccum = 0;
  private fpsFrames = 0;

  update(rawDt: number): void {
    this.dt = Math.min(rawDt, this.maxFrameTime);
    this.elapsed += this.dt;
    this.frameCount += 1;

    this.fpsAccum += this.dt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= this.fpsUpdateRate) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  reset(): void {
    this.dt = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }
}
