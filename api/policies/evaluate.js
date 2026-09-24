const profiles = {
  established: {
    wallet_history_days: 426,
    recurring_counterparties: 37,
    deal_size_multiple: 1.2,
    funding_concentration: 0.18,
  },
  thin: {
    wallet_history_days: 19,
    recurring_counterparties: 2,
    deal_size_multiple: 3.4,
    funding_concentration: 0.78,
  },
};

function evaluate(body) {
  const amount = Number(body.amount_usd);
  if (!body.actor || !body.counterparty || !Number.isFinite(amount) || amount < 100) {
    return { error: "INVALID_REQUEST", message: "actor, counterparty and amount_usd >= 100 are required" };
  }

  const selected = body.demo_profile === "established" ? "established" : "thin";
  const evidence = profiles[selected];
  const elevated = selected === "thin" || amount >= 25000 || body.risk_tolerance === "conservative";
  const policy = elevated
    ? { template: "milestone_escrow", escrow_percentage: 100, upfront_percentage: 15, milestone_percentages: [35, 50], review_period_hours: 48, resolver_required: true }
    : { template: "protected_stream", escrow_percentage: 100, upfront_percentage: 30, stream_days: 30, review_period_hours: 12, resolver_required: false };

  const reasons = elevated
    ? [
        { code: "LIMITED_HISTORY", severity: "medium", observation: `Counterparty has ${evidence.wallet_history_days} days of observable activity`, control: "LIMIT_UPFRONT_RELEASE" },
        { code: "CONCENTRATED_FUNDING", severity: "high", observation: `${Math.round(evidence.funding_concentration * 100)}% of inflows came from one related wallet`, control: "REQUIRE_REVIEW_PERIOD" },
        { code: "DEAL_SIZE_ANOMALY", severity: "high", observation: `Value is ${evidence.deal_size_multiple}× the largest observed receipt`, control: "FULL_ESCROW_FUNDING" },
        { code: "LIMITED_CONTINUITY", severity: "medium", observation: `${evidence.recurring_counterparties} recurring counterparties observed`, control: "MILESTONE_RELEASES" },
      ]
    : [
        { code: "SUSTAINED_ACTIVITY", severity: "low", observation: `${evidence.wallet_history_days} days of regular activity`, control: "STREAM_ALLOWED" },
        { code: "RECURRING_RELATIONSHIPS", severity: "low", observation: `${evidence.recurring_counterparties} recurring counterparties observed`, control: "REDUCED_REVIEW" },
        { code: "AGREEMENT_WITHIN_RANGE", severity: "low", observation: `Value is ${evidence.deal_size_multiple}× the median observed receipt`, control: "STANDARD_UPFRONT" },
      ];

  return {
    policy_id: `pol_${Date.now().toString(36)}`,
    decision: elevated ? "ALLOW_WITH_SAFEGUARDS" : "ALLOW",
    mode: "demo",
    expires_in_seconds: 300,
    transaction: { actor: body.actor, counterparty: body.counterparty, amount_usd: amount, intent: body.intent || "service_payment" },
    policy,
    reasons,
    evidence,
    attribution: "Behavioral intelligence adapter ready for Nansen API",
    disclaimer: "Demo decision only. Not financial, legal or identity advice.",
  };
}

export default function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const result = evaluate(request.body || {});
  return response.status(result.error ? 400 : 200).json(result);
}
