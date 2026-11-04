import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./client-trash-operations', () => ({ mutateTrashEntry: fake.call }));
import { createTrashAction } from './client-trash';

beforeEach(() => { fake.call.mockReset().mockResolvedValue(undefined); });
describe('bulk Trash actions', () => {
  it('keeps successful clients and retries an interrupted client with the same request ID', async () => {
    fake.call.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Offline'));
    const action = createTrashAction('trash', Array.from({ length: 160 }, (_, i) => ({ id: `c${i}` })));
    await expect(action()).rejects.toThrow('1 of 160 clients completed');
    const failed = fake.call.mock.calls[1];
    await action();
    expect(fake.call).toHaveBeenCalledTimes(161);
    expect(fake.call.mock.calls[2]).toEqual(failed);
    expect(fake.call.mock.calls[160][1].id).toBe('c159');
    await action();
    expect(fake.call).toHaveBeenCalledTimes(161);
  });
  it('uses the same purge request ID after a page reload and sends one client per purge', async () => {
    const entries = [{ id: 'a', trashId: 'version-a' }, { id: 'b', trashId: 'version-b' }];
    await createTrashAction('purge', entries)();
    await createTrashAction('purge', entries)();
    expect(fake.call.mock.calls[0]).toEqual(fake.call.mock.calls[2]);
    expect(fake.call.mock.calls[1][1]).toEqual(entries[1]);
  });
  it('shares an in-flight action instead of starting duplicate operations', async () => {
    const action = createTrashAction('restore', [{ id: 'a', trashId: 'v1' }]);
    await Promise.all([action(), action()]);
    expect(fake.call).toHaveBeenCalledOnce();
  });
});
