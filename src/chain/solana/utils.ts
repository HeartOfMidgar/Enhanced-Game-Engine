import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  type Commitment,
  clusterApiUrl,
} from '@solana/web3.js';
import bs58 from 'bs58';

/** SPL Memo Program v2 id. */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Build a memo instruction signed by `signer`. */
export function createMemoInstruction(memo: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });
}

/**
 * Construct a Solana RPC connection. `url` may be:
 *   - 'mainnet-beta' / 'devnet' / 'testnet' (uses clusterApiUrl)
 *   - a full https URL
 */
export function createConnection(url: string, commitment: Commitment = 'confirmed'): Connection {
  const isCluster = url === 'mainnet-beta' || url === 'devnet' || url === 'testnet';
  return new Connection(isCluster ? clusterApiUrl(url) : url, commitment);
}

/**
 * Load a server-side keypair from an environment variable.
 *
 * Accepts either:
 *   - JSON array of 64 numbers (Phantom export)
 *   - base58-encoded secret key
 *
 * SECURITY: never logs the value, sanitises errors so we don't leak hints.
 */
export function loadKeypairFromEnv(envVarName: string): Keypair {
  const raw = process.env[envVarName];
  if (!raw) throw new Error(`${envVarName} environment variable is required`);
  if (raw.length < 32) throw new Error(`${envVarName} appears to be too short`);

  // Try JSON array (Phantom export).
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length === 64) {
      return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
    }
  } catch {
    // fall through
  }
  // Try base58.
  try {
    const decoded = bs58.decode(raw);
    return Keypair.fromSecretKey(decoded);
  } catch {
    throw new Error(`Failed to parse ${envVarName}. Check format.`);
  }
}

/** Convert a UI-units amount to raw on-chain units. */
export function toRawAmount(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/** Convert raw on-chain units to a UI-units number. */
export function fromRawAmount(raw: bigint | number, decimals: number): number {
  return Number(raw) / Math.pow(10, decimals);
}

/** Strip key-shaped substrings from an error message before logging. */
export function sanitizeError(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown error';
  return err.message
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,}/g, '[REDACTED_KEY]')
    .replace(/\[[\d,\s]{100,}\]/g, '[REDACTED_ARRAY]');
}
