<p align="center">
  <img src="assets/saltaire-mark.png" alt="Saltaire Protocol mark" width="200" />
</p>

<p align="center">
  <i>Project banner coming soon — placeholder uses the Saltaire Protocol mark.</i>
</p>

# Game Engine Enhanced

A clean, modern, ESM-first TypeScript game engine with first-class **Solana** plumbing. Part of the [Saltaire Protocol](https://x.com/HeartOfMidgar) stack.

- **Three.js** rendering, **bitecs** ECS, **cannon-es** physics
- **ws**-based networking with **zod**-validated protocols and per-connection rate limiting
- **Solana** adapter for wallet authentication, SPL token gating, and reward distribution
- **Optional** Quarry staking add-on (lazy-loaded)
- **Bring-your-own wallet UX** — works directly with `@solana/web3.js` `Keypair`s, browser wallet adapters, or higher-level SDKs like [Privy](https://www.privy.io/) for embedded / social login
- **Vite** for development & examples, **Vitest** for testing, **TypeScript 5** strict
- Node 20+, ESM only, no Webpack, no Babel, no Jest

---

## Quick start

```bash
npm install
npm run dev          # opens the examples playground (Vite)
npm run dev:server   # optional: run the reference WebSocket server
```

```bash
npm run typecheck
npm run lint
npm run test         # unit tests with Vitest
npm run test:cov     # with coverage report
npm run build        # build the library to dist/
npm run docs         # build API docs into docs/api/
```

## Layout

```
src/
  core/      Engine, Scene, World wrapper, plugins, DI, types
  render/    Three.js wrapper (Renderer, components, RenderSystem)
  physics/   cannon-es wrapper + PhysicsSystem
  input/     Keyboard / mouse / gamepad / touch + action mapping
  audio/     WebAudio bus graph (master / music / sfx)
  assets/    Async loader + cache + progress
  net/       ws client/server, Room model, zod protocol, rate-limit
  chain/     Solana adapter (wallet, auth, token gate, rewards, optional staking)
  devtools/  DebugPanel (FPS, Entities, Systems, Deps)
  storage/   In-memory default + optional Redis adapter
examples/    Single Vite playground with a route-based demo picker
server/      Reference Node server (Express + ws) for the networking demo
docs/        architecture / guide / plugins / chain / networking
```

## Hello world

```ts
import { Engine, ServiceTokens } from 'game-engine-enhanced';
import { RenderPlugin } from 'game-engine-enhanced/render';

const engine = new Engine();
await engine.use(new RenderPlugin({ canvas: '#game' }));
engine.start();
```

See `examples/` for a full set of runnable demos covering rendering, ECS,
input, audio, physics, particles, networking, Solana auth, the optional
Quarry staking add-on, and the dev-tools panel.

## Documentation

- [Architecture](docs/architecture.md) — engine, ECS, plugin, DI overview
- [Usage guide](docs/guide.md) — building a game, plugin authoring, lifecycle
- [Plugins & devtools](docs/plugins.md) — DebugPanel, custom plugins
- [Chain (Solana)](docs/chain.md) — wallet auth, token gating, rewards, staking add-on
- [Networking](docs/networking.md) — Room model, protocol, rate limiting, storage
- API reference: `npm run docs` → `docs/api/`

## Optional dependencies

The engine ships with a minimal core. Some subsystems require opt-in installs:

| Feature                           | Install                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Redis-backed storage              | `npm install ioredis`                                                                 |
| Quarry staking provider           | `npm install @quarryprotocol/quarry-sdk @saberhq/solana-contrib @saberhq/token-utils` |

See [`docs/chain.md`](docs/chain.md) and [`docs/networking.md`](docs/networking.md) for
configuration.

## Credits

Built and maintained by [@HeartOfMidgar](https://x.com/HeartOfMidgar) as part of the **Saltaire Protocol**. Open-sourced so other teams can stand up Solana-aware games without rewriting the plumbing.

## License

MIT — see [LICENSE](LICENSE).
