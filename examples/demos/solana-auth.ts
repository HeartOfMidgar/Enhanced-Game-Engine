import { WalletVerifier, generateNonce } from '@engine/chain/solana/verifyWallet.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { makeOverlay } from './overlay.js';

import { type Demo } from './index.js';

/**
 * Browser-side signed-action demo. Uses an in-memory ephemeral keypair to
 * simulate a wallet (so the demo is self-contained and works without Phantom
 * being installed). Real apps would call `window.solana.signMessage(...)`
 * instead of `nacl.sign.detached(...)`.
 */
export const solanaAuth: Demo = {
  id: 'solana-auth',
  name: 'Solana — wallet auth',
  description:
    'Server issues a nonce, client signs a structured action, server verifies the signature & consumes the nonce. Self-contained (no Phantom needed).',
  run(host) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;color:#d8dee9;';
    host.appendChild(wrap);

    const status = document.createElement('pre');
    status.style.cssText =
      'background:#1d2129;border:1px solid #2c313c;border-radius:8px;padding:14px;width:min(640px,90vw);font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;color:inherit;max-height:60vh;overflow:auto;';
    wrap.appendChild(status);

    const button = document.createElement('button');
    button.textContent = 'Run signed-action round-trip';
    button.style.cssText =
      'padding:10px 16px;background:#88c0d0;color:#1d2129;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
    wrap.appendChild(button);

    function log(line: string): void {
      status.textContent += `${line}\n`;
      status.scrollTop = status.scrollHeight;
    }

    button.addEventListener('click', async () => {
      status.textContent = '';
      log('— Signed-action demo —');

      // Server-side
      const verifier = new WalletVerifier({ app: 'engine-demo' });

      // Client-side: ephemeral keypair simulating a wallet
      const keyPair = nacl.sign.keyPair();
      const walletAddress = bs58.encode(keyPair.publicKey);
      log(`Wallet: ${walletAddress.slice(0, 8)}…`);

      // 1. Server issues a nonce bound to the wallet
      const nonce = await verifier.issueNonce(walletAddress);
      log(`Issued nonce: ${nonce.slice(0, 12)}…`);
      void generateNonce(); // demo helper export is also available

      // 2. Client constructs canonical message and signs it
      const data = { action: 'demo.greet', target: 'world' };
      const message = JSON.stringify({
        app: 'engine-demo',
        action: 'greet',
        nonce,
        timestamp: 0,
        data,
      });
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, keyPair.secretKey);
      const signatureBase64 = btoa(String.fromCharCode(...signatureBytes));
      log(`Signed message (${messageBytes.byteLength} bytes)`);

      // 3. Server verifies
      const ok = await verifier.verifySignedAction({
        walletAddress,
        action: 'greet',
        nonce,
        signature: signatureBase64,
        data,
      });
      log(ok ? '✓ verified — nonce consumed' : '✗ verification failed');

      // 4. Replay-attack: same nonce can't be reused
      const replay = await verifier.verifySignedAction({
        walletAddress,
        action: 'greet',
        nonce,
        signature: signatureBase64,
        data,
      });
      log(
        `Replay attempt: ${replay ? '✗ unexpectedly accepted' : '✓ rejected (nonce single-use)'}`,
      );
    });

    const removeOverlay = makeOverlay(
      host,
      `<b>Solana auth.</b> Same code path the engine ships in <code>chain/solana/verifyWallet</code>. In production the wallet is Phantom/Backpack/Solflare via <code>@solana/wallet-adapter</code>, or <a href="https://www.privy.io/" target="_blank" rel="noopener">Privy</a> for embedded / social-login onboarding — both expose <code>signMessage</code> the verifier accepts.`,
    );

    return () => {
      removeOverlay();
      host.innerHTML = '';
    };
  },
};
