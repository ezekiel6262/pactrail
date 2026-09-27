# Pactrail — Meridian Buildathon Submission

## One-line description

Pactrail is an agreement compiler that turns live Nansen wallet intelligence into transaction-specific safeguards and enforceable onchain escrow terms.

## The problem

Onchain settlement is programmable, but agreements between unfamiliar wallets still rely on blind upfront payments, screenshots and generic reputation. Analytics can warn a user, yet the user must still decide what to do.

Pactrail closes that gap. It does not classify a person as trustworthy or untrustworthy. It evaluates one proposed transaction and asks: **what structure limits the harm if either party fails?**

## What it does

1. A payer proposes a transaction, counterparty and value.
2. Pactrail queries live Nansen Profiler data for both wallets.
3. A deterministic policy compiler evaluates continuity, liquidity, deal-size anomalies, recurring counterparties and wallet relationships.
4. It returns explainable controls: standard terms, full escrow funding, milestones, a limited kickoff release, review delays or independent resolution.
5. The user can download the evidence-bearing policy receipt.
6. On Base Sepolia, the connected wallet can create a policy-bound escrow, approve the exact test-USDC amount and fund it onchain.

## Why Nansen is essential

Nansen is the decision substrate, not a visualization layer. Balances inform capacity; transactions create the behavioral baseline; counterparties reveal continuity and concentration; related-wallet data provides relationship context. If sufficient live Nansen evidence is unavailable for either party, Pactrail fails closed rather than inventing a decision.

Reproducing this from raw chain RPCs would require multi-chain indexing, token pricing, relationship graphs, entity clustering and years of behavioral history. Nansen makes that intelligence accessible through one coherent API.

## Why this is original

Most wallet-intelligence products stop at insight: a dashboard, alert or score. Pactrail carries intelligence into the transaction itself. The output is not “this wallet looks risky.” The output is “fund 100%, release 15% at kickoff, split the remainder into milestones, allow 48 hours for review and require an independent resolver.”

## Judge rubric

### Data integration — 25%

- Live Nansen calls analyze both payer and counterparty.
- Nansen-derived features directly select contract terms.
- Every safeguard includes a human-readable reason.
- The engine fails closed when evidence is unavailable.

### Creativity and originality — 25%

- Pactrail is an agreement compiler, not another analytics dashboard.
- It transforms behavioral intelligence into enforceable commercial protection.
- The same policy layer can protect AI agents, DAOs, marketplaces and treasury workflows.

### Functionality and workability — 25%

- Public website, Deal Studio, documentation and API playground are deployed on Vercel.
- The Policy API is versioned and validates every request.
- Policy receipts are downloadable and locally retained.
- The Base Sepolia flow creates, approves and funds a real escrow through the user's wallet.
- Automated tests cover funding, authorization, disputes, refunds, milestone releases and completion.

### Documentation and submission — 25%

- A builder can run the project in under ten minutes.
- Credentials stay server-side and `.env.local` is ignored.
- README includes architecture, API usage, safety limitations and testing commands.
- This document supplies a silent, followable recording sequence.

## Silent demo recording

Use short title cards or cursor emphasis; narration is unnecessary.

1. Open the homepage and pause on “The trust rail for onchain commerce.”
2. Open Deal Studio.
3. Show the payer, recipient, amount and network.
4. Click **Compile agreement**.
5. Pause on the live Nansen signal count and explainable evidence.
6. Expand **Why these terms?** and show the recommended controls.
7. Open **Review execution readiness**.
8. Show the policy ID and download the receipt.
9. Enter an independent resolver and click **Create & fund on Base Sepolia**.
10. Confirm the factory deployment if this is the first run, escrow creation, exact USDC approval and funding in the wallet.
11. Finish on the BaseScan escrow link and confirmed transaction receipt.
12. Briefly show `/developers/`, `/docs/` and the GitHub README.

## Local setup

```bash
git clone https://github.com/ezekiel6262/pactrail.git
cd pactrail
npm install
copy .env.example .env.local
# Put NANSEN_API_KEY in .env.local
npm test
npm install -g vercel
vercel dev
```

Open `http://localhost:3000/app/`.

## Links

- Product: https://pactrail.vercel.app
- Deal Studio: https://pactrail.vercel.app/app/
- Developer playground: https://pactrail.vercel.app/developers/
- Documentation: https://pactrail.vercel.app/docs/
- Source: https://github.com/ezekiel6262/pactrail

## Honest safety boundary

The escrow implementation is a Base Sepolia testnet beta. It is covered by automated lifecycle tests but has not received an independent audit and must not be used with mainnet funds. Pactrail never substitutes simulated hashes for confirmed onchain transactions.
