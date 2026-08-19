interface LimiterOptions { maxAttempts: number; windowMs: number }

export class UnlockLimiter {
  private readonly failures = new Map<string, number[]>();
  constructor(private readonly options: LimiterOptions = { maxAttempts: 5, windowMs: 15 * 60_000 }) {}

  consume(key: string, now = Date.now()): void {
    const recent = (this.failures.get(key) ?? []).filter((at) => now - at < this.options.windowMs);
    this.failures.set(key, recent);
    if (recent.length >= this.options.maxAttempts) throw new Error("Try again later.");
  }

  recordFailure(key: string, now = Date.now()): void {
    const recent = (this.failures.get(key) ?? []).filter((at) => now - at < this.options.windowMs);
    recent.push(now);
    this.failures.set(key, recent);
  }

  reset(key: string): void { this.failures.delete(key); }
}
