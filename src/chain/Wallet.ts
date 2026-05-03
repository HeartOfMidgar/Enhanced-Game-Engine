/**
 * Generic wallet abstraction. The engine ships a Solana implementation (the
 * only chain currently targeted), but the interface keeps the door open for
 * other chains without rippling through call sites.
 */
export interface Wallet {
  /** Display address. */
  readonly address: string;
  /** Sign an arbitrary UTF-8 message; returns a base64 signature. */
  signMessage(message: string): Promise<string>;
  /** Optional capability: sign a serialized transaction (returns base64). */
  signTransaction?(serializedTx: string): Promise<string>;
}
