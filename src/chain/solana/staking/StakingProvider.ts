/**
 * Generic on-chain staking interface. Concrete implementations (e.g. Quarry,
 * a custom Anchor program, ...) plug in here.
 *
 * The interface is intentionally minimal — staking protocols vary widely, and
 * we don't want to bake any one protocol's vocabulary into the engine. Higher
 * level economic logic (reward halving, multi-tier bonuses, vault sharing,
 * raid escrow) is the consumer's job.
 */

export interface TxBuildResult {
  /** Base64-encoded serialized Solana transaction the wallet should sign. */
  transaction: string;
  /** Human-readable description, suitable for wallet UIs. */
  message: string;
  /** RPC blockhash the tx was built against. */
  blockhash: string;
  /** Last valid block height for re-broadcast. */
  lastValidBlockHeight: number;
}

export interface UserStakeInfo {
  walletAddress: string;
  stakedAmount: number;
  pendingRewards: number;
  lastStakeTime: Date | null;
  /** Protocol-specific PDA / account ref (opaque). */
  accountRef?: string | null;
}

export interface StakingStats {
  totalStaked: number;
  stakerCount: number;
  rewardRate: number;
  rewardSupply?: number;
}

export interface StakeVerification {
  verified: boolean;
  actualAmount?: number;
  error?: string;
}

export interface StakingProvider {
  /** Build a stake transaction for a user to sign. `amount` is in UI units. */
  buildStakeTx(walletAddress: string, amount: number): Promise<TxBuildResult>;
  /** Build an unstake transaction. */
  buildUnstakeTx(walletAddress: string, amount: number): Promise<TxBuildResult>;
  /** Build a claim-rewards transaction. */
  buildClaimTx(walletAddress: string): Promise<TxBuildResult & { estimatedReward?: number }>;
  /** Read the user's current staking position. */
  getUserStakeInfo(walletAddress: string): Promise<UserStakeInfo>;
  /** Aggregate protocol stats (totalStaked etc.). */
  getStats(): Promise<StakingStats | null>;
  /** Verify that a stake transaction was confirmed on-chain. */
  verifyStakeTx(signature: string, walletAddress: string, expectedAmount: number): Promise<StakeVerification>;
}
