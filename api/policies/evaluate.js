const BASE = "https://api.nansen.ai/api/v1";
const EVM = /^0x[a-fA-F0-9]{40}$/;
const buckets = new Map();

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const rows = (result) => result.status === "fulfilled" ? result.value.data : [];

function rateLimited(req) {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

async function nansen(path, body, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Nansen ${response.status}`);
    return { data: payload.data || [], requestId: response.headers.get("x-request-id") };
  } finally { clearTimeout(timeout); }
}

async function profile(address, chain, key) {
  const to = new Date();
  const from = new Date(to.getTime() - 180 * 86_400_000);
  const common = { address, chain };
  const date = { from: from.toISOString(), to: to.toISOString() };
  const settled = await Promise.allSettled([
    nansen("/profiler/address/current-balance", { ...common, hide_spam_token: true, pagination: { page: 1, per_page: 100 } }, key),
    nansen("/profiler/address/transactions", { ...common, date, hide_spam_token: true, pagination: { page: 1, per_page: 100 } }, key),
    nansen("/profiler/address/related-wallets", { ...common, pagination: { page: 1, per_page: 50 } }, key),
    nansen("/profiler/address/counterparties", { ...common, date, group_by: "wallet", source_input: "Combined", pagination: { page: 1, per_page: 50 } }, key),
  ]);
  const names = ["balances", "transactions", "related_wallets", "counterparties"];
  const results = Object.fromEntries(names.map((name, index) => [name, settled[index]]));
  return {
    results,
    available: settled.filter((item) => item.status === "fulfilled").length,
    unavailable: names.filter((_, index) => settled[index].status === "rejected"),
    requestIds: settled.filter((item) => item.status === "fulfilled").map((item) => item.value.requestId).filter(Boolean),
  };
}

function features(profileResult, amount) {
  const balances = rows(profileResult.results.balances);
  const transactions = rows(profileResult.results.transactions);
  const related = rows(profileResult.results.related_wallets);
  const counterparties = rows(profileResult.results.counterparties);
  const timestamps = transactions.map((item) => new Date(item.block_timestamp || item.timestamp).getTime()).filter(Number.isFinite);
  const liquid = balances.reduce((sum, item) => sum + number(item.value_usd), 0);
  const volumes = transactions.map((item) => number(item.value_usd || item.volume_usd)).filter(Boolean);
  const totalVolume = counterparties.reduce((sum, item) => sum + number(item.total_volume_usd), 0);
  const topVolume = counterparties.reduce((max, item) => Math.max(max, number(item.total_volume_usd)), 0);
  return {
    wallet_history_days: timestamps.length ? Math.max(1, Math.round((Date.now() - Math.min(...timestamps)) / 86_400_000)) : 0,
    liquid_balance_usd: Math.round(liquid),
    recurring_counterparties: counterparties.filter((item) => number(item.interaction_count) >= 2).length,
    related_wallets: related.length,
    deal_size_multiple: volumes.length ? Number((amount / Math.max(...volumes)).toFixed(2)) : null,
    deal_to_liquidity_ratio: liquid ? Number((amount / liquid).toFixed(2)) : null,
    counterparty_concentration: totalVolume ? Number((topVolume / totalVolume).toFixed(2)) : null,
    transactions_observed: transactions.length,
  };
}

function compile(actor, counterparty, riskTolerance) {
  let score = riskTolerance === "conservative" ? 1 : 0;
  const reasons = [];
  const add = (condition, points, role, code, severity, observation, control) => {
    if (!condition) return;
    score += points;
    reasons.push({ role, code, severity, observation, control });
  };
  add(actor.deal_to_liquidity_ratio === null || actor.deal_to_liquidity_ratio > 1, 2, "payer", "PAYER_CAPACITY_MISMATCH", "high", actor.deal_to_liquidity_ratio ? `Deal is ${actor.deal_to_liquidity_ratio}× the payer's observed liquid holdings` : "No payer liquid holdings were returned", "FULL_ESCROW_FUNDING");
  add(actor.wallet_history_days < 30, 1, "payer", "LIMITED_PAYER_HISTORY", "medium", `${actor.wallet_history_days || "Fewer than 1"} payer activity days observed`, "REQUIRE_FUNDING_CONFIRMATION");
  add(counterparty.wallet_history_days < 60, 2, "counterparty", "LIMITED_COUNTERPARTY_HISTORY", "high", `${counterparty.wallet_history_days || "Fewer than 1"} recipient activity days observed`, "LIMIT_UPFRONT_RELEASE");
  add(counterparty.recurring_counterparties < 3, 1, "counterparty", "LIMITED_CONTINUITY", "medium", `${counterparty.recurring_counterparties} recurring recipient counterparties observed`, "MILESTONE_RELEASES");
  add(counterparty.deal_size_multiple === null || counterparty.deal_size_multiple > 2, 2, "counterparty", "DEAL_SIZE_ANOMALY", "high", counterparty.deal_size_multiple ? `Value is ${counterparty.deal_size_multiple}× the recipient's largest observed transfer` : "No comparable recipient transfer was observed", "FULL_ESCROW_FUNDING");
  if (!reasons.length) reasons.push({ role: "transaction", code: "ESTABLISHED_ACTIVITY", severity: "low", observation: "No elevated transaction-specific signals were detected across either wallet", control: "STANDARD_TERMS" });
  const enhanced = score >= 3;
  return {
    decision: enhanced ? "ALLOW_WITH_SAFEGUARDS" : "ALLOW",
    reasons,
    policy: enhanced
      ? { template: "milestone_escrow", escrow_percentage: 100, upfront_percentage: 15, milestone_percentages: [35, 50], review_period_hours: 48, resolver_required: score >= 5 }
      : { template: "protected_stream", escrow_percentage: 100, upfront_percentage: 30, stream_days: 30, review_period_hours: 12, resolver_required: false },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", process.env.PACTRAIL_ALLOWED_ORIGIN || "https://pactrail.vercel.app");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Pactrail-Key");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (process.env.PACTRAIL_API_KEY && req.headers["x-pactrail-key"] !== process.env.PACTRAIL_API_KEY) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (rateLimited(req)) return res.status(429).json({ error: "RATE_LIMITED", message: "Try again in one minute" });

  const body = req.body || {};
  const amount = Number(body.amount_usd);
  if (!EVM.test(body.actor || "") || !EVM.test(body.counterparty || "") || !Number.isFinite(amount) || amount < 100) return res.status(400).json({ error: "INVALID_REQUEST", message: "Full EVM addresses and amount_usd >= 100 are required" });
  if (!process.env.NANSEN_API_KEY) return res.status(503).json({ error: "LIVE_DATA_NOT_CONFIGURED", message: "Nansen API access is required; fallback evaluation is disabled" });

  const chain = String(body.chain || "base").toLowerCase();
  const [actorProfile, counterpartyProfile] = await Promise.all([
    profile(body.actor, chain, process.env.NANSEN_API_KEY),
    profile(body.counterparty, chain, process.env.NANSEN_API_KEY),
  ]);
  if (actorProfile.available < 2 || counterpartyProfile.available < 2) return res.status(502).json({
    error: "INSUFFICIENT_LIVE_EVIDENCE",
    message: "At least two live Nansen signal groups are required for each wallet",
    data_quality: { actor: { available: actorProfile.available, unavailable: actorProfile.unavailable }, counterparty: { available: counterpartyProfile.available, unavailable: counterpartyProfile.unavailable } },
  });

  const evidence = { actor: features(actorProfile, amount), counterparty: features(counterpartyProfile, amount) };
  const outcome = compile(evidence.actor, evidence.counterparty, body.risk_tolerance);
  return res.status(200).json({
    policy_id: `pol_${Date.now().toString(36)}`,
    decision: outcome.decision,
    mode: "live",
    provider: "Nansen API",
    evaluated_at: new Date().toISOString(),
    expires_in_seconds: 300,
    transaction: { actor: body.actor, counterparty: body.counterparty, amount_usd: amount, intent: body.intent || "service_payment", chain },
    policy: outcome.policy,
    reasons: outcome.reasons,
    evidence,
    data_quality: {
      actor: { available: actorProfile.available, unavailable: actorProfile.unavailable },
      counterparty: { available: counterpartyProfile.available, unavailable: counterpartyProfile.unavailable },
      total_signal_groups: actorProfile.available + counterpartyProfile.available,
    },
    nansen_request_ids: [...actorProfile.requestIds, ...counterpartyProfile.requestIds],
    disclaimer: "Transaction-specific safeguards; not identity, legal or financial advice.",
  });
}
