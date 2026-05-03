# Chain (Solana)

The `chain/` subsystem is a clean Solana adapter. It is opt-in but ships with
the core engine — only the optional **Quarry staking** add-on requires extra
installs.

## Surface

```ts
import {
  // Core (always available):
  createConnection,
  loadKeypairFromEnv,
  createMemoInstruction,
  toRawAmount,
  fromRawAmount,
  sanitizeError,
  generateNonce,
  WalletVerifier,
  TokenGate,
  SplRewardSink,
  // Optional add-on:
  type StakingProvider,
  // QuarryStakingProvider, // requires opt-in install (see below)
} from 'game-engine-enhanced/chain/solana';
```

There is no project-specific hardcoding. All addresses, mints, decimals, and
program ids are passed at construction.

## Wallet auth (signed actions)

Sign a one-shot action on the client and verify it on the server with
`tweetnacl` + `bs58`. Replay protection comes from a server-issued nonce.

### Server

```ts
import { generateNonce, WalletVerifier } from 'game-engine-enhanced/chain/solana';

const verifier = new WalletVerifier({
  /** action -> message template */
  templates: {
    login: ({ nonce, wallet }) => `login:${wallet}:${nonce}`,
  },
  /** how long a nonce is valid for, ms */
  ttlMs: 60_000,
});

// Issue a nonce when the client asks to authenticate.
app.post('/auth/nonce', (req, res) => {
  res.json({ nonce: generateNonce() });
});

// Verify a signed action.
app.post('/auth/login', (req, res) => {
  const { wallet, signature, nonce } = req.body;
  const result = verifier.verify({ action: 'login', wallet, signature, nonce });
  if (!result.ok) return res.status(401).json({ error: result.error });
  // mint a session token, etc.
  res.json({ ok: true });
});
```

### Client

```ts
const { nonce } = await fetch('/auth/nonce').then(r => r.json());
const message = `login:${wallet.publicKey.toBase58()}:${nonce}`;
const signature = await wallet.signMessage(new TextEncoder().encode(message));

await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: wallet.publicKey.toBase58(),
    signature: bs58.encode(signature),
    nonce,
  }),
});
```

### Wallet sources

The engine doesn't ship a wallet UI — anything that exposes a `publicKey` and
`signMessage` works. Pick whichever onboarding fits your audience:

| Wallet source                                                           | When to use                                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@solana/wallet-adapter-*` (Phantom, Backpack, Solflare, …)             | Web-native, crypto-savvy users. Lowest friction for existing Solana communities.                                                                           |
| [**Privy**](https://www.privy.io/) (`@privy-io/react-auth`, Solana SDK) | Embedded wallets / email + social login / progressive onboarding. Use this when you need players to "press play" without seeing a wallet popup on day one. |
| Server-managed `Keypair` (custodial)                                    | Fully custodial flows (e.g. tournament servers, NPC accounts). Load via `loadKeypairFromEnv` and never expose to clients.                                  |

Sample Privy wiring (drop into your client):

```tsx
// app entry
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

<PrivyProvider
  appId={process.env.PRIVY_APP_ID!}
  config={{
    embeddedWallets: { createOnLogin: 'users-without-wallets' },
    externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
    loginMethods: ['email', 'wallet', 'google', 'discord'],
  }}
>
  <App />
</PrivyProvider>
```

```ts
// somewhere inside <App />
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';

const { user, login } = usePrivy();
const { wallets } = useSolanaWallets();
const wallet = wallets[0]; // { address, signMessage, signTransaction, ... }

if (!user) await login();
const sig = await wallet.signMessage(new TextEncoder().encode(message));
// hand `wallet.address` + `sig` to the server-side WalletVerifier above
```

The `WalletVerifier`, `TokenGate`, and `SplRewardSink` accept any string
public key + base58 signature, so you can switch onboarding providers at any
time without changing the engine-facing code.

## Token gate (SPL holder check)

```ts
import { TokenGate } from 'game-engine-enhanced/chain/solana';
import { PublicKey } from '@solana/web3.js';

const gate = new TokenGate({
  connection,
  mint: new PublicKey('YOUR_MINT'),
  minBalance: 1,           // raw or human-readable, see decimals below
  decimals: 9,             // optional; converts minBalance from human → raw
});

const ok = await gate.holds(new PublicKey(walletAddress));
```

## Reward sink (server-side SPL distribution)

`SplRewardSink` sends an SPL token from a server-controlled keypair to a user
wallet. It handles ATA creation, compute-budget, and retries.

```ts
import { SplRewardSink } from 'game-engine-enhanced/chain/solana';

const sink = new SplRewardSink({
  connection,
  senderKeypair: serverKeypair, // loaded from .env
  mint: new PublicKey('YOUR_MINT'),
  decimals: 9,
});

const sig = await sink.send({
  to: new PublicKey(playerAddress),
  amount: 100,             // human-readable; converted with decimals
  memo: 'reward:level-3',  // optional memo program note
});
```

> The sender keypair never reaches the client. Load it server-side from an
> env var with `loadKeypairFromEnv('SOLANA_REWARDS_KEYPAIR')`.

## Connection helpers

```ts
import { createConnection } from 'game-engine-enhanced/chain/solana';

const connection = createConnection({
  endpoint: process.env.SOLANA_RPC_URL!,
  commitment: 'confirmed',
});
```

## Optional: Quarry staking add-on

Quarry is a niche, protocol-specific staking implementation. It is **not** part
of the engine's required runtime. If you want it, install the SDKs explicitly:

```bash
npm install \
  @quarryprotocol/quarry-sdk \
  @saberhq/solana-contrib \
  @saberhq/token-utils
```

Then construct a `QuarryStakingProvider`:

```ts
import { QuarryStakingProvider } from 'game-engine-enhanced/chain/solana/staking';

const staking = new QuarryStakingProvider({
  connection,
  rewarderAddress: new PublicKey('YOUR_REWARDER'),
  stakeMint: new PublicKey('YOUR_STAKE_MINT'),
  decimals: 9,
  name: 'My Game',
  symbol: 'GAME',
  // iouTokenMint, redeemerWallet — optional, for IOU redemption flow
});
```

If the SDKs are not installed, instantiation throws a clear
`Quarry SDKs not installed. Run: npm install ...` error pointing at the
install command above. The rest of the chain subsystem (and the engine in
general) works fine without them.

### `StakingProvider` interface

`QuarryStakingProvider` is one implementation of a generic interface, so games
can swap in another protocol without touching call sites:

```ts
export interface StakingProvider {
  buildStakeTx(wallet: string, amount: number): Promise<TxBuildResult>;
  buildUnstakeTx(wallet: string, amount: number): Promise<TxBuildResult>;
  buildClaimTx(wallet: string): Promise<TxBuildResult>;
  getUserStakeInfo(wallet: string): Promise<UserStakeInfo>;
  getStats(): Promise<StakingStats | null>;
}
```

## Configuration via environment

The engine never auto-reads `process.env`; constructors take everything
explicitly. The example server reads its config from `.env` (see
[`.env.example`](../.env.example)) and forwards it to constructors.

| Variable                           | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `SOLANA_RPC_URL`                   | RPC endpoint                               |
| `SOLANA_REWARDS_KEYPAIR`           | base58 secret for `SplRewardSink`          |
| `TOKEN_GATE_MINT`                  | SPL mint for `TokenGate`                   |
| `TOKEN_GATE_MIN_BALANCE`           | minimum raw balance                        |
| `QUARRY_REWARDER_ADDRESS`          | Quarry rewarder pubkey (optional add-on)   |
| `QUARRY_STAKE_MINT`                | stake mint pubkey (optional add-on)        |

## Errors

All chain errors flow through `sanitizeError`, which strips RPC-leaked secrets
and returns a stable `{ code, message }` shape suitable for sending to clients.
