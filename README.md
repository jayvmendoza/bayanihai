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

The AI runs **automatically**. People only do what people should do: buy, pay, and confirm delivery.

| # | Who | Action | What happens automatically |
|---|---|---|---|
| 0 | Farmer (`/farmer`) | **+ Ani** → pick crop and kilos → **Itanong sa AI** → **I-post** | Gemini picks a fair price inside the rules (buyers pay less than the market, the farmer earns at least 1.5x the middleman) and explains it in Tagalog |
| 1 | Buyer (`/`) | **Mamimili ako** → Carrots → **Sumali** (5 kg) | The **AI Deal Maker starts by itself**: Holy Spirit reaches 150 kg → **CREATE DEAL**, the AI wallet creates the deal on BNB Smart Chain, and the neighbors' pre-orders pay in (145/150 kg). Poblacion (40 kg) gets **WAIT**. Takes about 15 seconds. |
| 2 | Buyer | **Magbayad** → **GCash** (upload receipt or **Demo resibo**), **Cash**, or **Crypto wallet** | GCash: the AI reads the receipt, the rules check it, the escrow is funded and the proof is recorded on-chain. The group is now 150/150 (**Funded**). |
| 3 | Coordinator (`/demo`) | **Coordinator confirms delivery** (and **received cash** if the buyer chose cash) | The contract pays the farmer and the hauler. With the carrots listing at ₱40/₱65: farmer ₱6,000, hauler ₱3,750, escrow for this deal back to ₱0. |

Fraud check: after a round paid with **Demo resibo**, **Reset demo**, join again, and tap **Ulitin ang huling resibo**. The AI rejects it: *"Nagamit na ang resibong ito."*

Refund story: **Reset demo**, then tap **Arm refund test** in `/demo` (the next deal gets a 90-second deadline). Have the buyer **Sumali** and pay, but don't confirm delivery. After the deadlines pass (about 3 minutes; locally **Fast-forward 3 min**), tap **Claim refunds** or **Kunin ang refund** on the buyer phone.

The `/demo` buttons (**Run AI Deal Maker now**, **Neighbors pay**) are manual overrides in case you want to drive a step yourself.

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
| **AI Receipt Check (GCash)** | Reads the buyer's GCash receipt screenshot: amount, reference number, date, signs of editing | The rules decide: the amount must equal the order, the reference must be valid and never used before, no edit signs. A fingerprint (SHA-256) of the reference is written on-chain with the escrow lock, so the same receipt can't be reused. |
| **Creating the deal on-chain** | The AI wallet calls `createDeal()` on BNB Smart Chain | The contract only lets the AI **create** deals. It cannot join, release or refund money (`NotAgent` / `NotCoordinator` checks, covered by tests). |

**Reliability:** three Gemini models (`gemini-3.8-flash`, then `gemini-3.5-flash` and `gemini-3.1-flash-lite` as backups) are asked at once, each with a 20-second timeout, and the first valid answer wins. If all fail, or there's no API key, the rules decide alone, so the demo never stalls. Every review shows a **Gemini** or **Rules only** badge so it's always clear who decided.

### Paying with GCash, cash, or a wallet

Buyers choose how to pay; the money always ends up in the same escrow contract.

| Method | How it reaches the escrow | What is recorded on BNB Smart Chain |
|---|---|---|
| **GCash** | Buyer uploads the receipt, the AI reads it, the rules check it, then the escrow is funded on the buyer's behalf | `BAYANIHAI|GCASH|ref:<sha256 prefix>|php:<amount>|deal:<id>` in the same transaction as the lock |
| **Cash** | Buyer hands cash to the barangay coordinator, who confirms it in the console | `BAYANIHAI|CASH|coordinator:<address>|php:<amount>|deal:<id>` |
| **Crypto wallet** | Buyer's wallet calls `joinDeal()` directly | the `joinDeal()` call itself |

The proof memo is extra calldata after the `joinDeal()` arguments: the contract ignores it, but it is stored on-chain and readable on BscScan (Input Data). In this prototype GCash is not connected to a real payment API (that needs a merchant account, e.g. PayMongo or Xendit) and tBNB stands in for pesos in the escrow. The "Demo resibo" button makes a clearly-labelled sample receipt for testing.

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
