# Pactrail

Transaction assurance infrastructure for onchain commerce. Pactrail is an agreement compiler—not a wallet dashboard.

Pactrail converts observable wallet behavior into transaction-specific safeguards such as milestone escrow, release delays, funding requirements and human review. It evaluates the transaction—not the person behind a wallet.

## Product surfaces

- `/` — company homepage
- `/app/` — interactive bilateral Agreement Compiler and downloadable policy receipts
- `/developers/` — live Policy API playground
- `/docs/` — integration documentation
- `/security/` — security model and limitations
- `POST /api/v1/policies/evaluate` — live, versioned Nansen policy endpoint

## Run locally

The frontend is static and the API uses a Vercel Function.

```bash
npm install
npm install -g vercel
copy .env.example .env.local
# Add your NANSEN_API_KEY to .env.local
vercel dev
```

Then open `http://localhost:3000`.

The application can be running in under ten minutes. Never commit `.env.local`; Nansen credentials remain server-side.

## Why Pactrail exists

Blockchains prove that value moved, but they do not decide how an unfamiliar counterparty transaction should be structured. Existing analytics products usually stop at a score, warning or dashboard. Pactrail turns wallet intelligence into an enforceable action: standard terms, full funding, milestones, limited upfront release, a review period or independent resolution.

Pactrail evaluates the proposed transaction—not the identity or permanent reputation of the person behind a wallet. The core question is: **what protection does this specific transaction need?**

This makes Pactrail useful for AI-agent procurement, DAO grants, contributor payments, marketplaces, treasury operations and agreements between unfamiliar wallets.

## Policy request

```bash
curl -X POST http://localhost:3000/api/v1/policies/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "0x4062b997279de7213731dbe00485722a26718892",
    "counterparty": "0x28c6c06298d514db089934071355e5743bf21d60",
    "amount_usd": 10000,
    "intent": "service_payment",
    "chain": "base"
  }'
```

## Nansen integration boundary

The public release uses a server-side Nansen adapter, keeping the API key out of the browser. It evaluates current balances, transactions, related wallets, and counterparties for both parties, and fails closed when either wallet has fewer than two available signal groups. These Nansen sources are normalized into policy features:

- Profiler transactions → continuity and transaction baseline
- Historical/current balances → observed financial capacity
- Related wallets → relationship concentration
- Counterparties → recurring relationship signals
- DeFi holdings → liquid, borrowed and locked capital

Raw Nansen data should not be proxied to customers. Pactrail returns materially transformed controls and reasons, with attribution and respect for Nansen redistribution rules.

Nansen drives the policy rather than decorating the interface. Without sufficient live evidence for both wallets, Pactrail fails closed. Nansen is the right foundation because its Profiler consolidates balances, transactions, counterparties and wallet relationships behind one multi-chain API; reproducing that context from raw RPC data would require a separate indexing, pricing, clustering and entity-intelligence platform.

## Architecture

```text
Proposed transaction
       ↓
Vercel Policy Function
       ↓
Nansen Profiler — both wallets
       ↓
Deterministic Pactrail policy compiler
       ↓
Explainable safeguards + policy receipt
       ↓
Base Sepolia escrow factory
       ↓
Exact USDC approval → funding → milestones → settlement
```

## Safety

The Deal Studio can deploy, create, approve and fund a real Pactrail escrow on Base Sepolia using test USDC. The factory is deployed on demand by the connected payer wallet and its address is retained locally. The contracts are covered by automated lifecycle tests but have not been independently audited; do not use them with mainnet funds.

Run `npm test` to compile the contracts and exercise funding, milestone release, dispute refund, authorization and double-release protection.

## Submission walkthrough

See [SUBMISSION.md](SUBMISSION.md) for the judge-facing description, rubric mapping and silent recording sequence.

## Deployment

Production: https://pactrail.vercel.app

## License

Prototype created for the Nansen Meridian Buildathon.
