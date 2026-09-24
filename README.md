# Pactrail

Transaction assurance infrastructure for onchain commerce.

Pactrail converts observable wallet behavior into transaction-specific safeguards such as milestone escrow, release delays, funding requirements and human review. It evaluates the transaction—not the person behind a wallet.

## Product surfaces

- `/` — company homepage
- `/app/` — interactive Agreement Compiler and escrow simulation
- `/developers/` — live Policy API playground
- `/docs/` — integration documentation
- `/security/` — security model and limitations
- `POST /api/policies/evaluate` — deterministic policy endpoint

## Run locally

The frontend is static and the API uses a Vercel Function.

```bash
npm install -g vercel
vercel dev
```

Then open `http://localhost:3000`.

## Policy request

```bash
curl -X POST http://localhost:3000/api/policies/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "0x71A9...2F18",
    "counterparty": "0x3C42...91E7",
    "amount_usd": 10000,
    "intent": "service_payment",
    "demo_profile": "thin"
  }'
```

## Nansen integration boundary

The public release runs in deterministic demo mode so it remains stable without exposing API credentials. The production adapter is designed to normalize these Nansen sources into policy features:

- Profiler transactions → continuity and transaction baseline
- Historical/current balances → observed financial capacity
- Related wallets → relationship concentration
- Counterparties → recurring relationship signals
- DeFi holdings → liquid, borrowed and locked capital

Raw Nansen data should not be proxied to customers. Pactrail returns materially transformed controls and reasons, with attribution and respect for Nansen redistribution rules.

## Safety

The current escrow experience is a simulation. `contracts/PactrailEscrow.sol` is a reference implementation and has not been audited or deployed. Do not use it with real funds.

## Deployment

Production: https://pactrail.vercel.app

## License

Prototype created for the Nansen Meridian Buildathon.
