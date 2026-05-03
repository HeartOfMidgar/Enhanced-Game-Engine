import { makeOverlay } from './overlay.js';

import { type Demo } from './index.js';

export const solanaStaking: Demo = {
  id: 'solana-staking',
  name: 'Solana — Quarry staking (optional)',
  description:
    'Optional add-on. Requires installing @quarryprotocol/quarry-sdk and Saber peers, plus a Rewarder address.',
  badge: { label: 'optional add-on', kind: 'optional' },
  run(host) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;color:#d8dee9;text-align:center;max-width:760px;margin:auto;';
    host.appendChild(wrap);
    wrap.innerHTML = `
      <h2 style="margin:0;">Quarry staking is an opt-in add-on</h2>
      <p style="color:#81a1c1;">The engine doesn't pull Quarry/Saber by default. To enable this demo:</p>
      <pre style="background:#1d2129;border:1px solid #2c313c;border-radius:8px;padding:14px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;text-align:left;width:min(640px,90vw);"># 1. Install the optional peers in your app
npm install @quarryprotocol/quarry-sdk @saberhq/solana-contrib @saberhq/token-utils

# 2. Configure a QuarryStakingProvider with a real rewarder address
import { Connection } from '@solana/web3.js';
import { QuarryStakingProvider } from 'game-engine-enhanced/chain';

const provider = new QuarryStakingProvider({
  connection: new Connection('https://api.mainnet-beta.solana.com'),
  rewarderAddress: '...',  // your Quarry rewarder PDA
  stakeMint: '...',        // SPL mint of the stake token
  decimals: 9,
  name: 'My Token',
  symbol: 'MYT',
});

// 3. Build txs for users to sign
const tx = await provider.buildStakeTx(walletAddress, 100);
</pre>
      <p style="color:#81a1c1;font-size:13px;">
        Without Quarry installed, instantiating <code>QuarryStakingProvider</code> resolves successfully,
        but the first call (<code>buildStakeTx</code> etc.) throws an actionable error pointing at the install command.
      </p>
    `;

    const removeOverlay = makeOverlay(
      host,
      `<b>Quarry staking</b> is fully generic — configure mint, decimals, symbol, and rewarder explicitly through <code>QuarryStakingConfig</code>. See <code>docs/chain.md</code> for the full integration guide.`,
    );

    return () => {
      removeOverlay();
      host.innerHTML = '';
    };
  },
};
