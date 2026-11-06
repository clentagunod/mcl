import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchReconnect } from '../src/connectivity';

let target: EventTarget & { __mclNetworkOnline: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  target = Object.assign(new EventTarget(), { __mclNetworkOnline: true, setTimeout, clearTimeout });
  vi.stubGlobal('window', target);
  vi.stubGlobal('document', new EventTarget());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function signal(online: boolean) {
  target.__mclNetworkOnline = online;
  target.dispatchEvent(new Event('mcl:connectivity'));
}
it('does not refresh at startup or for repeated online notifications', async () => {
  const refresh = vi.fn(async () => {});
  const stop = watchReconnect(refresh);
  signal(true); target.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(refresh).not.toHaveBeenCalled();
  stop();
});
it('coalesces native and browser reconnect events into one refresh', async () => {
  const refresh = vi.fn(async () => {});
  const stop = watchReconnect(refresh);
  signal(false); signal(true);
  target.dispatchEvent(new Event('online'));
  target.dispatchEvent(new Event('pageshow'));
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});
it('does not refresh when the connection drops again before the debounce finishes', async () => {
  const refresh = vi.fn(async () => {});
  const stop = watchReconnect(refresh);
  signal(false); signal(true); signal(false);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).not.toHaveBeenCalled();
  signal(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});
it('handles a failed refresh silently and refreshes on the next reconnection', async () => {
  const refresh = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(undefined);
  const stop = watchReconnect(refresh);
  signal(false); signal(true);
  await vi.advanceTimersByTimeAsync(300);
  signal(false); signal(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});
it('serializes reconnects while a previous refresh is still running', async () => {
  let resolve!: () => void;
  const refresh = vi.fn().mockImplementationOnce(() => new Promise<void>(done => { resolve = done; })).mockResolvedValue(undefined);
  const stop = watchReconnect(refresh);
  signal(false); signal(true);
  await vi.advanceTimersByTimeAsync(300);
  signal(false); signal(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(1);
  resolve();
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});
it('cancels scheduled refreshes and removes listeners on cleanup', async () => {
  const refresh = vi.fn(async () => {});
  const stop = watchReconnect(refresh);
  signal(false); signal(true); stop();
  await vi.advanceTimersByTimeAsync(300);
  signal(false); signal(true);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).not.toHaveBeenCalled();
});
