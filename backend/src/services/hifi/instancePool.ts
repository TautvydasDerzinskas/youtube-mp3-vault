/** Tracks the pool of hifi-api instance base URLs and rotates away from failing ones. */
export class InstancePool {
  private instances: string[];
  private current: string | null;

  constructor(instances: readonly string[]) {
    this.instances = [...instances];
    this.current = this.instances[0] ?? null;
  }

  getCurrent(): string | null {
    return this.current;
  }

  list(): string[] {
    return [...this.instances];
  }

  /** Move a failing instance to the back of the queue and advance `current`. */
  rotate(failedUrl: string): void {
    const index = this.instances.indexOf(failedUrl);
    if (index !== -1) {
      this.instances.splice(index, 1);
      this.instances.push(failedUrl);
    }
    this.current = this.instances[0] ?? null;
  }
}
