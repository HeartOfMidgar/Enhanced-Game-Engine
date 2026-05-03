import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetManager, type AssetDescriptor, type AssetProgress } from './AssetManager.js';

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const text = (body: string): Response => new Response(body, { status: 200 });

describe('AssetManager', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/data.json')) return json({ ok: true });
      if (u.endsWith('/hello.txt')) return text('hello');
      if (u.endsWith('/raw.bin')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads JSON, text, and binary kinds', async () => {
    const am = new AssetManager();
    const j = (await am.load({ id: 'j', url: '/data.json', kind: 'json' })) as { ok: boolean };
    expect(j.ok).toBe(true);
    const t = await am.load<string>({ id: 't', url: '/hello.txt', kind: 'text' });
    expect(t).toBe('hello');
    const b = await am.load<ArrayBuffer>({ id: 'b', url: '/raw.bin', kind: 'binary' });
    expect(b.byteLength).toBe(4);
  });

  it('caches and dedupes inflight loads', async () => {
    const am = new AssetManager();
    const a = am.load({ id: 'j', url: '/data.json', kind: 'json' });
    const b = am.load({ id: 'j', url: '/data.json', kind: 'json' });
    await Promise.all([a, b]);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('emits progress events for loadAll', async () => {
    const am = new AssetManager();
    const events: AssetProgress[] = [];
    am.events.on('progress', (p) => events.push(p));
    const manifest: AssetDescriptor[] = [
      { id: 'j', url: '/data.json', kind: 'json' },
      { id: 't', url: '/hello.txt', kind: 'text' },
    ];
    await am.loadAll(manifest);
    expect(events.length).toBeGreaterThanOrEqual(manifest.length);
    const last = events[events.length - 1];
    expect(last?.ratio).toBe(1);
    expect(last?.loaded).toBe(2);
    expect(last?.total).toBe(2);
  });

  it('emits error for failed loads', async () => {
    const am = new AssetManager();
    const errs: unknown[] = [];
    am.events.on('error', (_d, e) => errs.push(e));
    await expect(am.load({ id: 'x', url: '/missing.json', kind: 'json' })).rejects.toThrow();
    expect(errs.length).toBe(1);
  });
});
