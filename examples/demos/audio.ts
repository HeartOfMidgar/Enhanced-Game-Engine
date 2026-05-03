import { AudioManager } from '@engine/audio/AudioManager.js';

import { makeOverlay } from './overlay.js';

import { type Demo } from './index.js';

export const audio: Demo = {
  id: 'audio',
  name: 'Audio (master/music/sfx buses)',
  description:
    'Three independent gain buses. Generates a sine-tone buffer in code (no external assets) and plays it through master → sfx.',
  run(host) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;';
    host.appendChild(wrap);

    let mgr: AudioManager | undefined;

    const button = document.createElement('button');
    button.textContent = 'Click to enable audio';
    button.style.cssText =
      'padding:14px 22px;background:#88c0d0;color:#1d2129;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;';
    wrap.appendChild(button);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:none;flex-direction:column;gap:10px;width:100%;max-width:360px;';
    wrap.appendChild(controls);

    function makeSlider(label: string, initial: number, onChange: (v: number) => void): HTMLDivElement {
      const row = document.createElement('div');
      row.innerHTML = `<label style="display:flex;justify-content:space-between;">${label}<span class="value">${initial.toFixed(2)}</span></label>`;
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(initial);
      slider.style.cssText = 'width:100%;';
      slider.addEventListener('input', () => {
        const v = Number.parseFloat(slider.value);
        onChange(v);
        const span = row.querySelector('.value') as HTMLSpanElement | null;
        if (span) span.textContent = v.toFixed(2);
      });
      row.appendChild(slider);
      return row;
    }

    button.addEventListener('click', async () => {
      if (mgr) return;
      mgr = new AudioManager();
      await mgr.resume();
      // Synthesize a short 440Hz beep so we don't need an asset bundled.
      const sampleRate = mgr.context.sampleRate;
      const length = Math.floor(sampleRate * 0.3);
      const buffer = mgr.context.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const t = i / sampleRate;
        data[i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-3 * t);
      }
      mgr.set('beep', buffer);

      button.style.display = 'none';
      controls.style.display = 'flex';

      controls.appendChild(
        makeSlider('Master', 1, (v) => mgr?.setVolume('master', v)),
      );
      controls.appendChild(
        makeSlider('Music', 0.6, (v) => mgr?.setVolume('music', v)),
      );
      controls.appendChild(
        makeSlider('SFX', 0.8, (v) => mgr?.setVolume('sfx', v)),
      );
      const btn = document.createElement('button');
      btn.textContent = '▶ Play beep';
      btn.style.cssText =
        'padding:10px 16px;background:#a3be8c;color:#1d2129;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
      btn.addEventListener('click', () => mgr?.play('beep'));
      controls.appendChild(btn);
    });

    const removeOverlay = makeOverlay(
      host,
      `<b>Audio.</b> WebAudio bus graph: master → {music, sfx}. The first click resumes the AudioContext (browser policy) and unlocks the controls.`,
    );

    return () => {
      removeOverlay();
      mgr?.destroy();
      host.innerHTML = '';
    };
  },
};
