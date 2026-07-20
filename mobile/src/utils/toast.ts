type Listener = (message: string) => void;

let listener: Listener | null = null;

export function registerToastListener(fn: Listener | null): void {
  listener = fn;
}

export function showToast(message: string): void {
  listener?.(message);
}
