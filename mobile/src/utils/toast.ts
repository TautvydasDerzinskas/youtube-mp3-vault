// Minimal pub/sub so code outside the component tree (the axios interceptor
// in api/client.ts) can surface a toast without threading a callback prop
// through every screen. App.tsx's Root registers the one live listener.
type Listener = (message: string) => void;

let listener: Listener | null = null;

export function registerToastListener(fn: Listener | null): void {
  listener = fn;
}

export function showToast(message: string): void {
  listener?.(message);
}
