import { Connection, PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';

import { QuarryStakingProvider, _resetQuarrySdkCache } from './QuarryStakingProvider.js';

describe('QuarryStakingProvider', () => {
  it('throws an actionable error when the optional Quarry/Saber peers are missing', async () => {
    _resetQuarrySdkCache();
    const provider = new QuarryStakingProvider({
      connection: new Connection('https://api.devnet.solana.com'),
      rewarderAddress: PublicKey.default,
      stakeMint: PublicKey.default,
      decimals: 9,
      name: 'Test',
      symbol: 'TST',
    });
    // Constructing is fine; the lazy import only fires on first call.
    await expect(provider.buildStakeTx(PublicKey.default.toBase58(), 1)).rejects.toThrow(
      /optional peer dependencies/,
    );
  });
});
