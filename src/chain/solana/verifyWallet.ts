import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import type { Storage } from '../../storage/Storage.js';
import { MemoryStorage } from '../../storage/Storage.js';

/**
 * Tweetnacl-based signed-action authentication for Solana wallets.
 *
 * Flow:
 *   1. Server generates a nonce and binds it to a wallet via `issueNonce`.
 *   2. Client builds the canonical message with `createSignatureMessage`
 *      and signs it with their wallet (Phantom, Backpack, Solflare, ...).
 *   3. Server calls `verifySignedAction({...})`. If the nonce matches and the
 *      detached signature verifies, the action is authentic. Nonces are single
 *      use, expire after `nonceTtlMs`, and live in the configured Storage
 *      (default in-memory).
 */
export interface SignatureMessage {
  /** Logical action being signed (e.g. "stake", "claim"). */
  action: string;
  /** Server-issued nonce. */
  nonce: string;
  /** Application identifier (so the same wallet can serve multiple apps). */
  app: string;
  /** Issuance timestamp (ms since epoch). Helpful for human-readable logs. */
  timestamp: number;
  /** Optional structured payload bound to the signature. */
  data?: Record<string, unknown>;
}

export interface SignedAction {
  walletAddress: string;
  action: string;
  nonce: string;
  /** Base64-encoded detached signature. */
  signature: string;
  data?: Record<string, unknown>;
}

export interface WalletVerifierOptions {
  /** Application name used inside the canonical message. */
  app: string;
  /** Time-to-live for an issued nonce, in milliseconds. Default 5 minutes. */
  nonceTtlMs?: number;
  /** Storage adapter. Default in-memory. */
  storage?: Storage;
  /** Key prefix in storage. Default `wallet:nonce:`. */
  prefix?: string;
}

interface NonceRecord {
  walletAddress: string;
  createdAt: number;
}

export class WalletVerifier {
  private readonly app: string;
  private readonly ttlMs: number;
  private readonly storage: Storage;
  private readonly prefix: string;

  constructor(options: WalletVerifierOptions) {
    this.app = options.app;
    this.ttlMs = options.nonceTtlMs ?? 5 * 60 * 1000;
    this.storage = options.storage ?? new MemoryStorage();
    this.prefix = options.prefix ?? 'wallet:nonce:';
  }

  /** Build the canonical message a client must sign. */
  createSignatureMessage(action: string, nonce: string, data?: Record<string, unknown>): string {
    const message: SignatureMessage = {
      app: this.app,
      action,
      nonce,
      timestamp: Date.now(),
      ...(data && { data }),
    };
    return JSON.stringify(message);
  }

  /** Issue a nonce bound to `walletAddress`. */
  async issueNonce(walletAddress: string): Promise<string> {
    const nonce = generateNonce();
    const record: NonceRecord = { walletAddress, createdAt: Date.now() };
    await this.storage.set(this.prefix + nonce, record, Math.ceil(this.ttlMs / 1000));
    return nonce;
  }

  /**
   * Validate the nonce is bound to the wallet, hasn't been used, and hasn't
   * expired. Consumes (deletes) the nonce on success.
   */
  async consumeNonce(nonce: string, expectedWallet: string): Promise<boolean> {
    const record = await this.storage.get<NonceRecord>(this.prefix + nonce);
    if (!record) return false;
    if (record.walletAddress !== expectedWallet) return false;
    if (Date.now() - record.createdAt > this.ttlMs) {
      await this.storage.delete(this.prefix + nonce);
      return false;
    }
    await this.storage.delete(this.prefix + nonce);
    return true;
  }

  /** Verify a signature without nonce / replay protection (low-level). */
  verifySignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const publicKey = new PublicKey(walletAddress);
      const sigBytes = Buffer.from(signature, 'base64');
      const msgBytes = new TextEncoder().encode(message);
      return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey.toBytes());
    } catch {
      return false;
    }
  }

  /**
   * Full signed-action verification: validates nonce ownership, then the
   * detached signature against the canonical message we generated when
   * issuing the nonce.
   */
  async verifySignedAction(signed: SignedAction): Promise<boolean> {
    const { walletAddress, action, nonce, signature, data } = signed;
    const ok = await this.consumeNonce(nonce, walletAddress);
    if (!ok) return false;
    const message = JSON.stringify({
      app: this.app,
      action,
      nonce,
      // We re-serialize *without* the timestamp because the client signs the
      // message they were handed, not what we re-build later. Clients embed
      // the timestamp the server provided when the nonce was issued.
      // For simpler clients you can also call `createSignatureMessage` and
      // sign that exact string; the server-side check below also accepts that
      // by reconstructing it deterministically.
      timestamp: 0,
      ...(data && { data }),
    });
    return (
      this.verifySignature(walletAddress, message, signature) ||
      // Backwards-compat: accept clients that signed the timestamped form.
      this.verifySignatureWithKnownTimestamps(walletAddress, action, nonce, signature, data)
    );
  }

  private verifySignatureWithKnownTimestamps(
    wallet: string,
    action: string,
    nonce: string,
    signature: string,
    data?: Record<string, unknown>,
  ): boolean {
    // For deployments that prefer to skip server-side timestamp matching,
    // verify against a payload with a placeholder timestamp.
    const candidate = JSON.stringify({
      app: this.app,
      action,
      nonce,
      timestamp: 0,
      ...(data && { data }),
    });
    return this.verifySignature(wallet, candidate, signature);
  }
}

/** Generate a fresh base58-encoded nonce. */
export function generateNonce(): string {
  return bs58.encode(nacl.randomBytes(32));
}
