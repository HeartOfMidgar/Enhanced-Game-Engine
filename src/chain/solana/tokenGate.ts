import { type Connection, PublicKey } from '@solana/web3.js';

import { fromRawAmount } from './utils.js';

export interface TokenGateConfig {
  /** Solana RPC connection. */
  connection: Connection;
  /** SPL token mint to gate on. */
  mint: PublicKey | string;
  /** Token decimals (used to interpret raw amounts). */
  decimals: number;
  /**
   * Minimum balance required (in UI units) to be eligible. Default: any
   * non-zero balance.
   */
  minBalance?: number;
  /** Cache duration in ms. Default 60s. */
  cacheTtlMs?: number;
}

export interface HolderResult {
  walletAddress: string;
  balance: number;
  required: number;
  isEligible: boolean;
  cachedAt: number;
}

/**
 * Generic SPL token-gate. Checks whether a wallet holds at least `minBalance`
 * of a given mint, with an in-memory result cache.
 *
 * Stays deliberately minimal: project-specific policies (tiered access,
 * indexer integrations, flash-loan guards, time-weighted balances) are layered
 * on top by game code rather than baked into the engine.
 */
export class TokenGate {
  private readonly connection: Connection;
  private readonly mint: PublicKey;
  private readonly decimals: number;
  private readonly minBalance: number;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, HolderResult>();

  constructor(config: TokenGateConfig) {
    this.connection = config.connection;
    this.mint = typeof config.mint === 'string' ? new PublicKey(config.mint) : config.mint;
    this.decimals = config.decimals;
    this.minBalance = config.minBalance ?? 0;
    this.cacheTtlMs = config.cacheTtlMs ?? 60_000;
  }

  /** Sum of all SPL token accounts the wallet owns for this mint, in UI units. */
  async getBalance(walletAddress: string): Promise<number> {
    const owner = new PublicKey(walletAddress);
    const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
      mint: this.mint,
    });
    let total = 0n;
    for (const account of accounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.amount as string | undefined;
      if (amount) total += BigInt(amount);
    }
    return fromRawAmount(total, this.decimals);
  }

  /** Cached eligibility check. */
  async verify(walletAddress: string): Promise<HolderResult> {
    const cached = this.cache.get(walletAddress);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs) return cached;

    let balance = 0;
    try {
      balance = await this.getBalance(walletAddress);
    } catch {
      // On RPC failure, fall through to a deny result; cache nothing.
      return {
        walletAddress,
        balance: 0,
        required: this.minBalance,
        isEligible: false,
        cachedAt: Date.now(),
      };
    }

    const result: HolderResult = {
      walletAddress,
      balance,
      required: this.minBalance,
      isEligible: balance >= this.minBalance && balance > 0,
      cachedAt: Date.now(),
    };
    this.cache.set(walletAddress, result);
    return result;
  }

  invalidate(walletAddress: string): void {
    this.cache.delete(walletAddress);
  }

  clear(): void {
    this.cache.clear();
  }
}
