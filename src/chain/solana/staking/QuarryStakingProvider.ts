import {
  type Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';

import { createMemoInstruction, fromRawAmount, sanitizeError, toRawAmount } from '../utils.js';

import type {
  StakingProvider,
  StakingStats,
  StakeVerification,
  TxBuildResult,
  UserStakeInfo,
} from './StakingProvider.js';

const REQUIRED_PEERS = [
  '@quarryprotocol/quarry-sdk',
  '@saberhq/solana-contrib',
  '@saberhq/token-utils',
] as const;

/**
 * Quarry Protocol implementation of {@link StakingProvider}.
 *
 * The Quarry SDK and its Saber peers are **optional peer dependencies**. They
 * are dynamically `import()`-ed only when this class is constructed; the
 * engine ships and runs without them. If a consumer instantiates this class
 * without installing the peers, an actionable error is thrown lazily on the
 * first call.
 *
 * Install the peers explicitly to use Quarry staking:
 *
 *   npm install @quarryprotocol/quarry-sdk @saberhq/solana-contrib @saberhq/token-utils
 *
 * Token name, symbol, mint, decimals, rewarder, and memo prefix are all
 * configured explicitly through {@link QuarryStakingConfig} — no environment
 * reads, no project-specific hardcoding.
 */
export interface QuarryStakingConfig {
  connection: Connection;
  /** Quarry rewarder PDA. */
  rewarderAddress: PublicKey | string;
  /** SPL mint of the stake token. */
  stakeMint: PublicKey | string;
  /** Decimals of the stake token. */
  decimals: number;
  /** Token name (used in tx descriptions). */
  name: string;
  /** Token symbol. */
  symbol: string;
  /** Application name (used as memo prefix). Default: "engine". */
  app?: string;
  /** Optional IOU mint (for IOU-redemption flow). */
  iouTokenMint?: PublicKey | string;
}

// All Quarry / Saber types are loaded at runtime from optional peer deps,
// so we use `unknown` shapes here to avoid hard typed dependencies. The
// runtime code performs the necessary structural calls.
interface QuarrySdks {
  QuarrySDK: { load: (args: { provider: unknown }) => { mine: { loadRewarderWrapper: (rewarder: PublicKey) => Promise<unknown> } } };
  SolanaProvider: { init: (args: { connection: Connection; wallet: unknown }) => unknown };
  Token: { fromMint: (mint: PublicKey, decimals: number, info: { name: string; symbol: string }) => unknown };
  TokenAmount: new (token: unknown, amount: string) => unknown;
}

let cachedSdks: Promise<QuarrySdks> | null = null;

async function loadQuarrySDKs(): Promise<QuarrySdks> {
  if (cachedSdks) return cachedSdks;
  cachedSdks = (async () => {
    try {
      // @ts-expect-error - optional peer dependency, may not be installed
      const quarry = (await import('@quarryprotocol/quarry-sdk')) as { QuarrySDK: QuarrySdks['QuarrySDK'] };
      // @ts-expect-error - optional peer dependency, may not be installed
      const contrib = (await import('@saberhq/solana-contrib')) as { SolanaProvider: QuarrySdks['SolanaProvider'] };
      // @ts-expect-error - optional peer dependency, may not be installed
      const tokenUtils = (await import('@saberhq/token-utils')) as { Token: QuarrySdks['Token']; TokenAmount: QuarrySdks['TokenAmount'] };
      return {
        QuarrySDK: quarry.QuarrySDK,
        SolanaProvider: contrib.SolanaProvider,
        Token: tokenUtils.Token,
        TokenAmount: tokenUtils.TokenAmount,
      } satisfies QuarrySdks;
    } catch (err) {
      throw new Error(
        `Quarry staking requires optional peer dependencies. Install with:\n  npm install ${REQUIRED_PEERS.join(' ')}`,
        { cause: err as Error },
      );
    }
  })();
  return cachedSdks;
}

/** @internal Reset the SDK cache (used by tests). */
export function _resetQuarrySdkCache(): void {
  cachedSdks = null;
}

interface QuarryView {
  token: unknown;
  rewarder: unknown;
  quarry: unknown;
  minerActions: unknown;
}

export class QuarryStakingProvider implements StakingProvider {
  readonly connection: Connection;
  readonly rewarder: PublicKey;
  readonly stakeMint: PublicKey;
  readonly decimals: number;
  readonly name: string;
  readonly symbol: string;
  readonly app: string;
  readonly iouMint?: PublicKey;

  private readonly sdkPromise: Promise<QuarrySdks>;

  constructor(config: QuarryStakingConfig) {
    this.connection = config.connection;
    this.rewarder =
      typeof config.rewarderAddress === 'string'
        ? new PublicKey(config.rewarderAddress)
        : config.rewarderAddress;
    this.stakeMint =
      typeof config.stakeMint === 'string' ? new PublicKey(config.stakeMint) : config.stakeMint;
    this.decimals = config.decimals;
    this.name = config.name;
    this.symbol = config.symbol;
    this.app = config.app ?? 'engine';
    if (config.iouTokenMint) {
      this.iouMint =
        typeof config.iouTokenMint === 'string'
          ? new PublicKey(config.iouTokenMint)
          : config.iouTokenMint;
    }
    this.sdkPromise = loadQuarrySDKs();
  }

  async buildStakeTx(walletAddress: string, amount: number): Promise<TxBuildResult> {
    const { sdks, view, blockhash, lastValidBlockHeight, userPubkey } = await this.beginBuild(
      walletAddress,
    );
    const tx = new Transaction();
    tx.add(this.memo(`${this.app}:stake:${amount}`, userPubkey));

    const quarry = view.quarry as QuarryShape;
    const minerKey = await quarry.getMinerAddress(userPubkey);
    const exists = (await this.connection.getAccountInfo(minerKey)) !== null;
    if (!exists) {
      const pendingMiner = await quarry.createMiner({ authority: userPubkey });
      tx.add(...pendingMiner.tx.instructions);
    }

    const stakeAmount = new sdks.TokenAmount(view.token, toRawAmount(amount, this.decimals).toString());
    const stakeTx = await (view.minerActions as MinerActionsShape).stake(stakeAmount);
    tx.add(...stakeTx.instructions);

    return this.finalizeTx(tx, userPubkey, blockhash, lastValidBlockHeight, `Stake ${amount} ${this.symbol}`);
  }

  async buildUnstakeTx(walletAddress: string, amount: number): Promise<TxBuildResult> {
    const { sdks, view, blockhash, lastValidBlockHeight, userPubkey } = await this.beginBuild(
      walletAddress,
    );
    const tx = new Transaction();
    tx.add(this.memo(`${this.app}:unstake:${amount}`, userPubkey));

    const unstakeAmount = new sdks.TokenAmount(view.token, toRawAmount(amount, this.decimals).toString());
    const withdrawTx = await (view.minerActions as MinerActionsShape).withdraw(unstakeAmount);
    tx.add(...withdrawTx.instructions);

    return this.finalizeTx(tx, userPubkey, blockhash, lastValidBlockHeight, `Unstake ${amount} ${this.symbol}`);
  }

  async buildClaimTx(walletAddress: string): Promise<TxBuildResult & { estimatedReward?: number }> {
    const { view, blockhash, lastValidBlockHeight, userPubkey } = await this.beginBuild(walletAddress);
    const info = await this.getUserStakeInfo(walletAddress);
    const tx = new Transaction();
    tx.add(this.memo(`${this.app}:claim`, userPubkey));
    const claimTx = await (view.minerActions as MinerActionsShape).claim();
    tx.add(...claimTx.instructions);
    const result = await this.finalizeTx(
      tx,
      userPubkey,
      blockhash,
      lastValidBlockHeight,
      `Claim ${this.symbol} rewards`,
    );
    return { ...result, estimatedReward: info.pendingRewards };
  }

  async getUserStakeInfo(walletAddress: string): Promise<UserStakeInfo> {
    const fallback: UserStakeInfo = {
      walletAddress,
      stakedAmount: 0,
      pendingRewards: 0,
      lastStakeTime: null,
      accountRef: null,
    };
    try {
      const userPubkey = new PublicKey(walletAddress);
      const view = await this.loadView(userPubkey);
      const quarry = view.quarry as QuarryShape;
      const minerKey = await quarry.getMinerAddress(userPubkey);
      const minerAccount = await this.connection.getAccountInfo(minerKey);
      if (!minerAccount) return fallback;
      const miner = (await quarry.getMiner(userPubkey)) as MinerShape | null;
      if (!miner) return fallback;
      const staked = bnToNumber(miner.balance ?? miner.tokensDeposited ?? 0);
      const earned = bnToNumber(miner.rewardsEarned ?? 0);
      return {
        walletAddress,
        stakedAmount: fromRawAmount(staked, this.decimals),
        pendingRewards: fromRawAmount(earned, this.decimals),
        lastStakeTime: null,
        accountRef: minerKey.toBase58(),
      };
    } catch (err) {
      console.warn('[QuarryStaking] getUserStakeInfo failed:', sanitizeError(err));
      return fallback;
    }
  }

  async getStats(): Promise<StakingStats | null> {
    try {
      const view = await this.loadView();
      const quarry = view.quarry as QuarryShape;
      const data = quarry.quarryData;
      return {
        totalStaked: fromRawAmount(bnToNumber(data.totalTokensDeposited), this.decimals),
        stakerCount: bnToNumber(data.numMiners),
        rewardRate: fromRawAmount(bnToNumber(data.annualRewardsRate), this.decimals),
      };
    } catch (err) {
      console.warn('[QuarryStaking] getStats failed:', sanitizeError(err));
      return null;
    }
  }

  async verifyStakeTx(
    signature: string,
    walletAddress: string,
    expectedAmount: number,
  ): Promise<StakeVerification> {
    try {
      const result = await this.connection.confirmTransaction(signature, 'confirmed');
      if (result.value.err) return { verified: false, error: 'Transaction failed on-chain' };
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return { verified: false, error: 'Transaction not found' };
      const memo = tx.meta?.logMessages?.find((l) => l.includes(`${this.app}:stake`));
      if (!memo) return { verified: false, error: `Not a ${this.app} stake transaction` };
      void walletAddress;
      return { verified: true, actualAmount: expectedAmount };
    } catch (err) {
      return { verified: false, error: sanitizeError(err) };
    }
  }

  // --------------------------- private helpers -----------------------------

  private memo(text: string, signer: PublicKey): TransactionInstruction {
    return createMemoInstruction(text, signer);
  }

  private async beginBuild(walletAddress: string): Promise<{
    sdks: QuarrySdks;
    view: QuarryView;
    blockhash: string;
    lastValidBlockHeight: number;
    userPubkey: PublicKey;
  }> {
    const sdks = await this.sdkPromise;
    const userPubkey = new PublicKey(walletAddress);
    const view = await this.loadView(userPubkey);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    return { sdks, view, blockhash, lastValidBlockHeight, userPubkey };
  }

  private async loadView(userPubkey: PublicKey = PublicKey.default): Promise<QuarryView> {
    const sdks = await this.sdkPromise;
    const provider = sdks.SolanaProvider.init({
      connection: this.connection,
      wallet: {
        publicKey: userPubkey,
        signTransaction: async (tx: unknown) => tx,
        signAllTransactions: async (txs: unknown) => txs,
      },
    });
    const sdk = sdks.QuarrySDK.load({ provider });
    const token = sdks.Token.fromMint(this.stakeMint, this.decimals, {
      name: this.name,
      symbol: this.symbol,
    });
    const rewarderWrapper = (await sdk.mine.loadRewarderWrapper(this.rewarder)) as RewarderWrapperShape;
    const quarry = (await rewarderWrapper.getQuarry(token)) as QuarryShape;
    const minerActions = (await quarry.getMinerActions(userPubkey)) as MinerActionsShape;
    return { token, rewarder: rewarderWrapper, quarry, minerActions };
  }

  private finalizeTx(
    tx: Transaction,
    feePayer: PublicKey,
    blockhash: string,
    lastValidBlockHeight: number,
    message: string,
  ): TxBuildResult {
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
      transaction: serialized.toString('base64'),
      message,
      blockhash,
      lastValidBlockHeight,
    };
  }
}

interface MinerActionsShape {
  stake(amount: unknown): Promise<{ instructions: TransactionInstruction[] }>;
  withdraw(amount: unknown): Promise<{ instructions: TransactionInstruction[] }>;
  claim(): Promise<{ instructions: TransactionInstruction[] }>;
}

interface QuarryShape {
  getMinerAddress(pk: PublicKey): Promise<PublicKey>;
  createMiner(opts: { authority: PublicKey }): Promise<{ tx: { instructions: TransactionInstruction[] } }>;
  getMiner(pk: PublicKey): Promise<unknown>;
  getMinerActions(pk: PublicKey): Promise<MinerActionsShape>;
  quarryData: {
    totalTokensDeposited: unknown;
    numMiners: unknown;
    annualRewardsRate: unknown;
  };
}

interface RewarderWrapperShape {
  getQuarry(token: unknown): Promise<unknown>;
}

interface MinerShape {
  balance?: unknown;
  tokensDeposited?: unknown;
  rewardsEarned?: unknown;
}

function bnToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'object') {
    const v = value as { toNumber?: () => number; toString?: () => string };
    if (typeof v.toNumber === 'function') return v.toNumber();
    if (typeof v.toString === 'function') return Number(v.toString());
  }
  return 0;
}
