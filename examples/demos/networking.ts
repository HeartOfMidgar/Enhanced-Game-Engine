
import { NetClient } from '@engine/net/NetClient.js';
import { Protocol } from '@engine/net/protocol.js';
import { z } from 'zod';

import { makeOverlay } from './overlay.js';

import { type Demo } from './index.js';

const ChatMessage = z.object({
  type: z.literal('chat'),
  from: z.string().max(64),
  body: z.string().max(512),
});

const GameMessages = z.discriminatedUnion('type', [ChatMessage]);

export const networking: Demo = {
  id: 'networking',
  name: 'Networking — echo room',
  description:
    'NetClient connects to ws://localhost:3001 (run `npm run dev:server` in another terminal), joins a room, and broadcasts chat messages.',
  run(host) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;color:#d8dee9;';
    host.appendChild(wrap);

    const status = document.createElement('div');
    status.textContent = 'disconnected';
    status.style.cssText = 'opacity:0.8;';
    wrap.appendChild(status);

    const log = document.createElement('div');
    log.style.cssText =
      'background:#1d2129;border:1px solid #2c313c;border-radius:8px;padding:10px;width:min(640px,90vw);max-height:40vh;overflow:auto;font:12px/1.5 ui-monospace,monospace;';
    wrap.appendChild(log);

    const form = document.createElement('form');
    form.style.cssText = 'display:flex;gap:8px;width:min(640px,90vw);';
    form.innerHTML = `
      <input type="text" name="msg" placeholder="say something..." style="flex:1;padding:8px;background:#1d2129;border:1px solid #2c313c;border-radius:6px;color:inherit;" />
      <button type="submit" style="padding:8px 14px;background:#88c0d0;color:#1d2129;border:none;border-radius:6px;font-weight:600;cursor:pointer;">send</button>
    `;
    wrap.appendChild(form);

    const url = `ws://${location.hostname || 'localhost'}:3001`;
    const protocol = new Protocol({ game: GameMessages });
    const client = new NetClient({ url, protocol });

    function append(text: string): void {
      const line = document.createElement('div');
      line.textContent = text;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    client.events.on('open', () => {
      status.textContent = `connected to ${url} — joined room "lobby"`;
      append('* connected');
      client.joinRoom('lobby');
    });
    client.events.on('reconnecting', (attempt, delay) => {
      status.textContent = `reconnecting (attempt ${attempt}, +${delay}ms)…`;
    });
    client.events.on('close', () => {
      status.textContent = 'disconnected';
      append('* disconnected');
    });
    client.events.on('message', (raw) => {
      const m = raw as { type: string };
      if (m.type === 'chat') {
        const c = m as z.infer<typeof ChatMessage>;
        append(`${c.from}: ${c.body}`);
      } else if (m.type === 'error') {
        append(`! ${(m as { message?: string }).message ?? 'error'}`);
      }
    });
    client.events.on('error', (err) => {
      append(`! ${err instanceof Error ? err.message : String(err)}`);
    });
    client.connect();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const msg = String(data.get('msg') ?? '').trim();
      if (!msg) return;
      const username = `user-${Math.floor(Math.random() * 1000)}`;
      client.send({ type: 'chat', from: username, body: msg });
      (form.elements.namedItem('msg') as HTMLInputElement).value = '';
    });

    const removeOverlay = makeOverlay(
      host,
      `<b>Networking.</b> NetClient + zod-validated protocol. To run the echo server: <code>npm run dev:server</code>. The reference server (<code>server/index.ts</code>) just rebroadcasts chat messages within the room.`,
    );

    return () => {
      removeOverlay();
      client.disconnect();
      host.innerHTML = '';
    };
  },
};
