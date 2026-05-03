import { demos, type Demo } from './demos/index.js';

interface RunningDemo {
  cleanup: () => void;
}

const app = document.getElementById('app') as HTMLDivElement;
let running: RunningDemo | undefined;

function renderPicker(): void {
  if (running) {
    running.cleanup();
    running = undefined;
  }
  app.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'demo-picker';
  root.innerHTML = `
    <header class="picker-header">
      <img class="mark" src="/saltaire-mark.png" alt="Saltaire Protocol mark" />
      <div>
        <h1>game-engine-enhanced — playground</h1>
        <p class="kicker">Saltaire Protocol · <a href="https://x.com/HeartOfMidgar" target="_blank" rel="noopener">@HeartOfMidgar</a></p>
      </div>
    </header>
    <p class="lede">Pick a demo. Each is self-contained and wires into the engine the same way. The 3D demos support mouse-drag orbit + scroll zoom; the live FPS HUD in the top-right confirms the loop is running. Open <code>devtools</code> for the full debug panel (toggle with <code>~</code>).</p>
  `;
  for (const demo of demos) {
    const card = document.createElement('button');
    card.className = 'demo-card';
    const badgeHtml = demo.badge
      ? `<span class="badge ${demo.badge.kind ?? ''}">${escapeHtml(demo.badge.label)}</span>`
      : '';
    card.innerHTML = `
      ${badgeHtml}
      <span class="name">${escapeHtml(demo.name)}</span>
      <span class="desc">${escapeHtml(demo.description)}</span>
    `;
    card.addEventListener('click', () => location.assign(`#/${demo.id}`));
    root.appendChild(card);
  }
  app.appendChild(root);
}

async function renderDemo(demo: Demo): Promise<void> {
  if (running) {
    running.cleanup();
    running = undefined;
  }
  app.innerHTML = '';
  const host = document.createElement('div');
  host.className = 'demo-host';
  app.appendChild(host);

  const back = document.createElement('button');
  back.className = 'demo-back';
  back.textContent = '← demos';
  back.addEventListener('click', () => location.assign('#/'));
  document.body.appendChild(back);

  try {
    const cleanup = await demo.run(host);
    running = {
      cleanup: () => {
        cleanup();
        back.remove();
      },
    };
  } catch (err) {
    host.innerHTML = `<pre style="padding:24px;color:#bf616a;white-space:pre-wrap;">${escapeHtml(
      err instanceof Error ? err.stack ?? err.message : String(err),
    )}</pre>`;
    running = {
      cleanup: () => {
        back.remove();
      },
    };
  }
}

function route(): void {
  const hash = location.hash.replace(/^#\/?/, '');
  if (!hash) {
    renderPicker();
    return;
  }
  const demo = demos.find((d) => d.id === hash);
  if (!demo) {
    renderPicker();
    return;
  }
  void renderDemo(demo);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

window.addEventListener('hashchange', route);
route();
