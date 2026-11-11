# BAYANIHAI

**AI-powered group buying with blockchain escrow for Filipino farmers.**
*Sama-samang bili. Protektadong bayad.*

The AI Deal Maker groups nearby buyers into one fair bulk order and creates the deal on BNB Smart Chain.
A smart contract holds the buyers' money and releases it to the farmer only after delivery, or refunds the buyers if the deal fails.

> **AI makes the deal. Blockchain protects the money.**

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

1. **Run AI Deal Maker** first, before anyone joins. The AI answers **WAIT**: Holy Spirit has 145 kg, but the truck needs 150 kg.
2. **Join with 5 kg** (or tap **Sumali** on the buyer phone). The group is now 150 kg.
3. **Run AI Deal Maker** again. **CREATE DEAL** for Holy Spirit, and the AI wallet creates Deal #N on-chain. Poblacion (40 kg) still waits.
4. **You pay**, then **Neighbors pay**. The money is locked in escrow, and the farmer phone shows *"Nakalaan na ang bayad"*.
5. **Coordinator confirms delivery**. The farmer gets ₱6,750, the hauler ₱3,750, and the escrow is back to ₱0.

Refund story: **Reset demo**, then **Join**, then **Run (refund scenario: 90s deadline)**, then **You pay** only, then **Fast-forward 3 min**, then **Claim refunds**. The buyer gets ₱350 back.

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
| Suggest and check fair prices | Release payments (only the coordinator) |
| Create the smart contract deal | Change a deal's rules after creation |

These rules are enforced by the contract and covered by tests:

```bash
npm run test:contract
```

## Project map

| Path | What it is |
|---|---|
| `contracts/BayanihaiEscrow.sol` | Escrow smart contract |
| `test/escrow.test.js` | Contract tests (7) |
| `scripts/deploy.js` | Deploys the contract, writes `lib/contract.json` |
| `lib/ai.ts` | AI Deal Maker review (rules + Gemini) |
| `lib/chain.ts` | Reads deals from the blockchain |
| `lib/store.ts` | Demo pre-orders and history (`data/state.json`) |
| `app/api/action/route.ts` | Actions: order, deal-maker, pay, confirm, refund |
| `app/page.tsx`, `app/farmer/page.tsx`, `app/demo/page.tsx` | Buyer, farmer, and presenter screens |

## Prototype limits (say these honestly to judges)

- Wallets are managed by the server for the demo, so users never see crypto. A production version would use proper custodial or embedded wallets.
- Pre-orders live in a JSON file. Production would use a database (e.g., Supabase).
- One sample listing (carrots from Mang Ramon). Prices are sample numbers.
