import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';

import { WalletVerifier, generateNonce } from './verifyWallet.js';

describe('WalletVerifier', () => {
  it('signed-action round-trip succeeds and consumes the nonce', async () => {
    const verifier = new WalletVerifier({ app: 'engine-test' });
    const keys = nacl.sign.keyPair();
    const wallet = bs58.encode(keys.publicKey);

    const nonce = await verifier.issueNonce(wallet);
    const data = { action: 'demo', value: 42 };
    const message = JSON.stringify({
      app: 'engine-test',
      action: 'do',
      nonce,
      timestamp: 0,
      data,
    });
    const sig = nacl.sign.detached(new TextEncoder().encode(message), keys.secretKey);
    const signature = Buffer.from(sig).toString('base64');

    const ok = await verifier.verifySignedAction({
      walletAddress: wallet,
      action: 'do',
      nonce,
      signature,
      data,
    });
    expect(ok).toBe(true);

    // Replay should fail because the nonce was consumed.
    const replay = await verifier.verifySignedAction({
      walletAddress: wallet,
      action: 'do',
      nonce,
      signature,
      data,
    });
    expect(replay).toBe(false);
  });

  it('rejects a signature from a different wallet', async () => {
    const verifier = new WalletVerifier({ app: 'engine-test' });
    const real = nacl.sign.keyPair();
    const attacker = nacl.sign.keyPair();
    const wallet = bs58.encode(real.publicKey);

    const nonce = await verifier.issueNonce(wallet);
    const message = JSON.stringify({ app: 'engine-test', action: 'a', nonce, timestamp: 0 });
    const sig = nacl.sign.detached(new TextEncoder().encode(message), attacker.secretKey);
    const signature = Buffer.from(sig).toString('base64');

    const ok = await verifier.verifySignedAction({
      walletAddress: wallet,
      action: 'a',
      nonce,
      signature,
    });
    expect(ok).toBe(false);
  });

  it('rejects a nonce bound to a different wallet', async () => {
    const verifier = new WalletVerifier({ app: 'engine-test' });
    const a = nacl.sign.keyPair();
    const b = nacl.sign.keyPair();
    const walletA = bs58.encode(a.publicKey);
    const walletB = bs58.encode(b.publicKey);

    const nonce = await verifier.issueNonce(walletA);
    const message = JSON.stringify({ app: 'engine-test', action: 'a', nonce, timestamp: 0 });
    const sig = nacl.sign.detached(new TextEncoder().encode(message), b.secretKey);
    const signature = Buffer.from(sig).toString('base64');

    const ok = await verifier.verifySignedAction({
      walletAddress: walletB,
      action: 'a',
      nonce,
      signature,
    });
    expect(ok).toBe(false);
  });

  it('generateNonce returns base58-shaped strings', () => {
    const n = generateNonce();
    expect(n).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(n.length).toBeGreaterThanOrEqual(32);
  });
});
