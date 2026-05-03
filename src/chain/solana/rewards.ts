import {
  TokenAccountNotFoundError,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';

import { fromRawAmount, sanitizeError, toRawAmount } from './utils.js';

export interface SplRewardSinkConfig {
  connection: Connection;
  /** Server-controlled keypair that holds the reward pool. */
  senderKeypair: Keypair;
  /** SPL mint of the reward token. */
  mint: PublicKey | string;
  /** Token decimals. */
  decimals: number;
  /** Optional priority fee in microLamports. Default 5000. */
  priorityMicroLamports?: number;
  /** Max retries on send. Default 3. */
  maxRetries?: number;
}

export interface RewardResult {
  success: boolean;
  signature?: string;
  error?: string;
  amount: number;
  recipient: string;
  timestamp: Date;
}

/**
 * Generic, server-side SPL reward dispenser.
 *
 * Configure once with `{ connection, senderKeypair, mint, decimals }`, then
 * `await sink.send(recipient, amount)` to dispatch. The sink ensures the
 * recipient's ATA exists, creates it if not, and sends with a priority fee.
 * Project-specific policies (queues, batching, audit logging, alternate
 * tokens) are layered on top by game code.
 *
 * SECURITY: never log the keypair. Errors are sanitized via {@link sanitizeError}.
 */
export class SplRewardSink {
  readonly connection: Connection;
  readonly mint: PublicKey;
  readonly decimals: number;

  private readonly sender: Keypair;
  private readonly priority: number;
  private readonly maxRetries: number;

  constructor(config: SplRewardSinkConfig) {
    this.connection = config.connection;
    this.sender = config.senderKeypair;
    this.mint = typeof config.mint === 'string' ? new PublicKey(config.mint) : config.mint;
    this.decimals = config.decimals;
    this.priority = config.priorityMicroLamports ?? 5_000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /** Public key of the reward pool. */
  get senderAddress(): PublicKey {
    return this.sender.publicKey;
  }

  /** Pool balance in UI units. */
  async balance(): Promise<number> {
    try {
      const ata = await getAssociatedTokenAddress(this.mint, this.sender.publicKey);
      const account = await getAccount(this.connection, ata);
      return fromRawAmount(account.amount, this.decimals);
    } catch (err) {
      console.error('[SplRewardSink] balance check failed:', sanitizeError(err));
      return 0;
    }
  }

  /** Send `amount` (UI units) to `recipientAddress`. */
  async send(recipientAddress: string, amount: number): Promise<RewardResult> {
    const timestamp = new Date();
    try {
      const recipient = new PublicKey(recipientAddress);
      const rawAmount = toRawAmount(amount, this.decimals);

      const sourceAta = await getAssociatedTokenAddress(this.mint, this.sender.publicKey);
      const sourceAccount = await getAccount(this.connection, sourceAta);
      if (sourceAccount.amount < rawAmount) {
        throw new Error(
          `Insufficient pool balance: have ${fromRawAmount(sourceAccount.amount, this.decimals)}, need ${amount}`,
        );
      }

      const { address: destAta, instruction: createIx } = await this.getOrCreateAta(recipient);

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.priority }));
      if (createIx) tx.add(createIx);
      tx.add(createTransferInstruction(sourceAta, destAta, this.sender.publicKey, rawAmount));

      const signature = await sendAndConfirmTransaction(this.connection, tx, [this.sender], {
        commitment: 'confirmed',
        maxRetries: this.maxRetries,
      });

      return { success: true, signature, amount, recipient: recipientAddress, timestamp };
    } catch (err) {
      return {
        success: false,
        error: sanitizeError(err),
        amount,
        recipient: recipientAddress,
        timestamp,
      };
    }
  }

  private async getOrCreateAta(
    owner: PublicKey,
  ): Promise<{ address: PublicKey; instruction: TransactionInstruction | null }> {
    const ata = await getAssociatedTokenAddress(this.mint, owner);
    try {
      await getAccount(this.connection, ata);
      return { address: ata, instruction: null };
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) {
        return {
          address: ata,
          instruction: createAssociatedTokenAccountInstruction(
            this.sender.publicKey,
            ata,
            owner,
            this.mint,
          ),
        };
      }
      throw err;
    }
  }
}
