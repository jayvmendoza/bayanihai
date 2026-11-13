# BAYANIHAI

**AI-powered group buying with blockchain escrow for Filipino farmers.**
*Sama-samang bili. Protektadong bayad.*

The AI Deal Maker groups nearby buyers into one fair bulk order and creates the deal on BNB Smart Chain.
A smart contract holds the buyers' money and releases it to the farmer only after delivery, or refunds the buyers if the deal fails.

> **AI makes the deal. Blockchain protects the money.**

## Live on BNB Smart Chain Testnet

| | |
|---|---|
| Escrow contract (verified) | [`0xFD20336648aF1fEA94649d8F889925De01B11b25`](https://testnet.bscscan.com/address/0xFD20336648aF1fEA94649d8F889925De01B11b25#code) |
| AI agent wallet (can only create deals) | [`0x1553fCa402007DFCbA88f73e2cEF4f5B6747f3a0`](https://testnet.bscscan.com/address/0x1553fCa402007DFCbA88f73e2cEF4f5B6747f3a0) |
| Full demo run (deal #1, Nov 13) | [AI creates deal](https://testnet.bscscan.com/tx/0xf36e6aedf433aac27922267d0a334fd52d7efa2eaf94afb79db5a00e4006b062) → [buyer pays](https://testnet.bscscan.com/tx/0xd55bec79cb86f4a28e6112f5d7dbc00585216e31a38f1e52538c9d7af76c03cd) → [neighbors pay](https://testnet.bscscan.com/tx/0x9f8ca7bc4bc4f3caf4c762f692e21c9e5b599e3ed6049f83404196c963bb6a84) → [delivery confirmed, farmer + hauler paid](https://testnet.bscscan.com/tx/0xc78b4d9eb5a8624bfca45e51a104e1a645ed0798fe0c24367b8a79279e4c25c2) |

Test wallets only, no real funds. Amounts are scaled so ₱1 = 0.000001 tBNB.

---

## Run it locally (no keys needed)

Needs Node.js 20+.

```bash
npm install
```

Terminal 1, the local blockchain:

```bash
npm run chain
```

Terminal 2, deploy the escrow contract (writes `lib/contract.json`):

```bash
npm run deploy:local
```

Terminal 2, start the app:

```bash
npm run dev
```

Then open:

| Screen | URL |
|---|---|
| Presenter demo panel (both phones live) | http://localhost:3000/demo |
| Buyer app (Mamimili) | http://localhost:3000 |
| Farmer app (Magsasaka) | http://localhost:3000/farmer |

> Restarting `npm run chain` wipes the chain. Run `npm run deploy:local` again and click **Reset demo**.

## Demo script (about 2 minutes)

On **/demo**:

0. **Farmer posts a harvest.** Pick a crop and size, then **Ask AI for a fair price**. Gemini picks a price inside a fair window (buyers pay less than the market, the farmer earns at least 1.5x the middleman price) and explains it in Tagalog. Then **Post**. You can also do this on the farmer phone (**+ Mag-post ng ani**).
1. **Run AI Deal Maker** first, before anyone joins. The AI answers **WAIT**: Holy Spirit has 145 kg, but the truck needs 150 kg.
2. **Join with 5 kg** (or tap **Sumali** on the buyer phone). The group is now 150 kg.
3. **Run AI Deal Maker** again. **CREATE DEAL** for Holy Spirit, and the AI wallet creates Deal #N on-chain. Poblacion (40 kg) still waits.
4. **You pay**, then **Neighbors pay**. The money is locked in escrow, and the farmer phone shows *"Nakalaan na ang bayad"*.
5. **Coordinator confirms delivery**. With the default carrots listing (₱40/kg to the farmer, ₱65/kg for buyers), the farmer gets ₱6,000, the hauler ₱3,750, and the escrow is back to ₱0.

The console highlights the **Next** step and shows a status bar while an action runs; buttons stay locked until it finishes, so wait for it before clicking again.

Refund story: **Reset demo**, then **Join**, then **Run refund scenario (90s deadline)**, then **You pay** only, then **Fast-forward 3 min**, then **Claim refunds**. The buyer gets ₱325 back (5 kg × ₱65).

## Turn on Gemini (the real AI review)

1. Get a free API key at https://aistudio.google.com
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY=...`
3. Restart `npm run dev`. AI reviews now show a **Gemini** badge instead of **Rules only**.

Gemini decides and explains the decision in Tagalog. The **rules still do the math**, and Gemini can never approve a group that fails the 150 kg minimum.

## Deploy to BNB Smart Chain Testnet

Use **test wallets only**.

1. Create 2 MetaMask accounts: one **deployer/demo** wallet and one **AI agent** wallet. Get tBNB for both from the BNB Chain testnet faucet.
2. Fill in `.env.local`:
   ```
   RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
   DEPLOYER_PRIVATE_KEY=0x...   # deployer wallet
   AGENT_ADDRESS=0x...          # AI agent wallet address
   AGENT_PRIVATE_KEY=0x...      # AI agent wallet key
   DEMO_PRIVATE_KEY=0x...       # plays buyer, neighbors and coordinator (can be the deployer)
   FARMER_ADDRESS=0x...
   HAULER_ADDRESS=0x...
   ```
3. Run the deployment:
   ```bash
   npm run deploy:testnet
   ```
4. Restart `npm run dev`. Every transaction on /demo now links to testnet.bscscan.com.

Amounts are scaled so ₱1 = 0.000001 tBNB (`WEI_PER_PESO`). A full demo uses about 0.01 tBNB plus gas.
On testnet there's no fast-forward, so the refund scenario takes about 90 seconds of real waiting.

## Deploy to Vercel (installable PWA)

The app runs on Vercel against the **BSC Testnet** contract above. On a phone, open the link and choose **Install app** / **Add to Home screen**: it opens full-screen with the BAYANIHAI icon.

1. **Import the repo.** vercel.com → sign in with GitHub → **Add New → Project** → import `bayanihai`. Framework: Next.js (auto-detected). Don't deploy yet.
2. **Add shared storage.** Project → **Storage** → **Upstash Redis** (free) → Create → connect it to the project. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you. (Vercel can't keep files, so without this the demo state would reset between requests.)
3. **Environment variables** (Project → Settings → Environment Variables). Same values as your `.env.local`:
   `GEMINI_API_KEY`, `RPC_URL`, `DEMO_PRIVATE_KEY`, `AGENT_ADDRESS`, `AGENT_PRIVATE_KEY`, `FARMER_ADDRESS`, `HAULER_ADDRESS`, plus a new **`DEMO_PASSWORD`**. `DEPLOYER_PRIVATE_KEY` is not needed on Vercel.
4. **Deploy.** Then open `https://<your-app>.vercel.app/demo`, log in (any username + `DEMO_PASSWORD`), and click **Reset demo** once.

| Who | URL | Login |
|---|---|---|
| Buyer (Mamimili) | `/` | none |
| Farmer (Magsasaka) | `/farmer` | none |
| Presenter console | `/demo` | `DEMO_PASSWORD` |

The contract address comes from `lib/deployments/bscTestnet.json` (public: address + ABI only). `npm run deploy:testnet` updates it; commit it after redeploying. Private keys live only in Vercel's environment variables, never in the repo.

## How it works

```
Buyer / Farmer app (Next.js)
        │
        ▼
AI Deal Maker (Next.js API, Node.js)
  1. groups pre-orders by pickup point
  2. rules check the math (≥ 150 kg)
  3. Gemini decides + explains (Tagalog)
  4. AI wallet calls createDeal()  ──►  BayanihaiEscrow (Solidity, BNB Smart Chain)
                                          joinDeal()        buyers lock money
                                          confirmDelivery() coordinator → farmer + hauler paid
                                          claimRefund()     buyers pull money back if it fails
```

**Safety by design**

| The AI can | The AI cannot |
|---|---|
| Group buyers | Touch the money |
| Suggest fair prices (clamped to a fair window by rules) | Release payments (only the coordinator) |
| Create the smart contract deal | Change a deal's rules after creation |

**AI Fair Pricing rules.** Buyer price ≤ market − ₱5. Farmer price ≥ 1.5 × middleman price. Buyer price = farmer price + ₱25 transport. Gemini picks inside this window. If it answers outside it, the price is clamped. If Gemini is down, the rules pick ₱10 below market. Market and middleman prices in `lib/listing.ts` are **sample numbers**. Replace them with real PSA or DA data.

Gemini calls go to several models at once and use the first valid answer, so one slow model can't stall the demo.

These rules are enforced by the contract and covered by tests:

```bash
npm run test:contract
```

## AI use and decisions

BAYANIHAI uses AI in two separate places: **inside the product** and **while building it**.

### 1. Inside the app: Gemini (the AI Deal Maker)

| Job | What Gemini does | What keeps it safe |
|---|---|---|
| **AI Fair Pricing** | Picks one buyer price per kg for the harvest | Rules set the fair window first (buyer ≤ market − ₱5, farmer ≥ 1.5 × middleman). Any answer outside it is clamped. |
| **Price explanation** | Writes one friendly Tagalog sentence for the farmer | Written *after* clamping, from the final numbers only, so it can't overstate the deal (an earlier version said "triple" for 1.75x, and we fixed that) |
| **Deal review** | Decides CREATE DEAL or WAIT per pickup point and explains it in English and Tagalog | Final decision = Gemini **AND** the rules. Gemini can never approve a group under the 150 kg truck minimum. |
| **Creating the deal on-chain** | The AI wallet calls `createDeal()` on BNB Smart Chain | The contract only lets the AI **create** deals. It cannot join, release or refund money (`NotAgent` / `NotCoordinator` checks, covered by tests). |

**Reliability:** three Gemini models (`gemini-3.8-flash`, then `gemini-3.5-flash` and `gemini-3.1-flash-lite` as backups) are asked at once, each with a 20-second timeout, and the first valid answer wins. If all fail, or there's no API key, the rules decide alone, so the demo never stalls. Every review shows a **Gemini** or **Rules only** badge so it's always clear who decided.

### 2. While building: AI coding assistants

- **Claude Code** helped plan, write and review the app, the contract tests and the deploy scripts.
- **Kimi** (through BCC's `engr` tool, `engr --kimi`) is the event's coding assistant for Build Day.
- Following the workshop rules: the assistant never received private keys or seed phrases (they stay in `.env.local`, which is git-ignored). Every change was reviewed and tested before commit, and the testnet deploy used dedicated test wallets with no real funds.

### Key decisions

| Decision | Why |
|---|---|
| **The AI can create deals but can never move money** | Trust: buyers' money is released only by the coordinator after delivery, or refunded by the contract. Even a wrong or manipulated AI answer can't take funds. |
| **Rules first, AI second** | The math (150 kg minimum, fair price window) must always be correct. Gemini adds judgment and plain-language explanations on top. |
| **Gemini in the app, Kimi for coding** | Gemini answers fast in structured JSON and explains in Tagalog, and it was already tested with fallbacks. Kimi is built for coding work, which is what we use it for. |
| **Escrow with pull refunds** | If a group doesn't fill or delivery never happens, each buyer withdraws their own refund. No one (including us) can redirect it. |
| **Only IDs, amounts and statuses on-chain** | Names and orders stay off-chain. The blockchain keeps the money trail public without exposing personal data. |

## Project map

| Path | What it is |
|---|---|
| `contracts/BayanihaiEscrow.sol` | Escrow smart contract |
| `test/escrow.test.js` | Contract tests (7) |
| `scripts/deploy.js` | Deploys the contract, writes `lib/contract.json` |
| `lib/ai.ts` | AI Deal Maker review + AI Fair Pricing (rules + Gemini) |
| `lib/listing.ts` | Crops, sample market prices, current listing shape |
| `lib/chain.ts` | Reads deals from the blockchain |
| `lib/deployments/bscTestnet.json` | Public testnet deployment (address + ABI) used when not on a local chain |
| `lib/presenter.ts`, `middleware.ts` | Optional `DEMO_PASSWORD` lock for /demo and presenter-only actions |
| `app/manifest.ts`, `public/sw.js` | PWA: install metadata, icons, offline shell |
| `lib/store.ts` | Demo pre-orders and history (Upstash Redis on Vercel, `data/state.json` locally) |
| `app/api/action/route.ts` | Actions: order, deal-maker, pay, confirm, refund |
| `app/page.tsx`, `app/farmer/page.tsx`, `app/demo/page.tsx` | Buyer, farmer, and presenter screens |

## Prototype limits (say these honestly to judges)

- Wallets are managed by the server for the demo, so users never see crypto. A production version would use proper custodial or embedded wallets.
- Demo state is one JSON document (Redis on Vercel, a file locally). Production would use a real database with per-user orders.
- One farmer (Mang Ramon) and one listing at a time. The four crops use sample market prices.
- Posting a new harvest starts a fresh demo round, and neighbors' pre-orders are simulated.
