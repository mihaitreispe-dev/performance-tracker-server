/**
 * Sliding window rate limiter for API request throttling.
 * Tracks request timestamps and blocks until a slot is available when limit is reached.
 */
export class RateLimiter {
  private requestTimestamps: number[] = [];

  /**
   * @param maxRequests - Maximum number of requests allowed in the window
   * @param windowMs - Time window in milliseconds
   */
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Wait until a request slot is available within the rate limit window.
   * Removes expired timestamps and blocks if the limit is reached.
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove timestamps outside the current window
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < this.windowMs);

    // If at limit, wait until the oldest request expires
    if (this.requestTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = this.windowMs - (now - oldestTimestamp) + 100; // +100ms buffer

      if (waitTime > 0) {
        await this.delay(waitTime);
        // Recursively check again after waiting
        return this.waitForSlot();
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Get the current number of requests in the window.
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < this.windowMs);
    return this.requestTimestamps.length;
  }

  /**
   * Reset the rate limiter, clearing all tracked requests.
   */
  reset(): void {
    this.requestTimestamps = [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
