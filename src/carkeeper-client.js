import "dotenv/config";

const reportEngineUrl = String(
  process.env.CARKEEPER_REPORT_ENGINE_URL ?? "https://carkeeper-report-engine.onrender.com/plugin/generate-report"
).replace(/\/$/, "");
const reportEngineToken = process.env.CARKEEPER_PLUGIN_TOKEN ?? "";
const wpApiBaseUrl = String(process.env.CARKEEPER_WP_API_BASE_URL ?? "https://carkeeper.uk/wp-json/carkeeper/v1").replace(/\/$/, "");
const wpApiToken = process.env.CARKEEPER_WP_API_TOKEN ?? "";

function normalizeRegistration(registration) {
  return String(registration ?? "").replace(/\s+/g, "").toUpperCase();
}

function cleanNullable(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = 300000 } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

function buildReportPayload(args = {}) {
  return {
    registration: normalizeRegistration(args.registration),
    vin: cleanNullable(args.vin),
    year: cleanNullable(args.year),
    make: cleanNullable(args.make),
    model: cleanNullable(args.model),
    tier: "premium",
    asking_price: cleanNullable(args.askingPrice),
    listing_text: cleanNullable(args.advertText),
    source_type: "chatgpt_plugin",
    report_date: new Date().toISOString().slice(0, 10),
    image_urls: Array.isArray(args.imageUrls) ? args.imageUrls.slice(0, 4) : [],
    goal: cleanNullable(args.goal || "Help the buyer decide whether this specific car is worth pursuing, negotiating on, or avoiding."),
    notes: args.mileage ? `User-supplied current mileage: ${args.mileage} miles.` : "",
  };
}

function parseSnapshot(report = "") {
  const text = String(report);
  const score = text.match(/Buyer Score:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const pricingVerdict = text.match(/Pricing Verdict:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const quickVerdict = text.match(/Quick Verdict:\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  return { buyerScore: score, pricingVerdict, quickVerdict };
}

async function generateReport(args) {
  if (!reportEngineToken) throw new Error("CARKEEPER_PLUGIN_TOKEN is not configured on the MCP server.");
  const result = await fetchJson(reportEngineUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${reportEngineToken}`,
    },
    body: buildReportPayload(args),
    timeoutMs: 330000,
  });

  return {
    ...result,
    snapshot: parseSnapshot(result.report),
  };
}

export async function checkVehicle(args) {
  const result = await generateReport({
    ...args,
    goal: "Check this exact UK vehicle and identify the factual history, MOT, mileage, valuation and buyer-risk signals that matter most.",
  });
  return {
    registration: normalizeRegistration(args.registration),
    meta: result.meta,
    snapshot: result.snapshot,
    sections: result.sections,
    report: result.report,
    dataSources: {
      vehicleIdentity: true,
      motHistory: true,
      vehicleHistoryCheck: Boolean(result.debug?.hasVehicleHistoryCheck),
      valuation: true,
      webResearch: true,
    },
  };
}

export async function analysePurchase(args) {
  const result = await generateReport(args);
  return {
    registration: normalizeRegistration(args.registration),
    suppliedMileage: args.mileage ?? null,
    askingPrice: args.askingPrice ?? null,
    meta: result.meta,
    snapshot: result.snapshot,
    sections: result.sections,
    report: result.report,
  };
}

function numericBuyerScore(snapshot) {
  const raw = snapshot?.buyerScore || "";
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export async function compareVehicles({ vehicles }) {
  // Run sequentially to avoid multiplying upstream API/OpenAI load unexpectedly.
  const analyses = [];
  for (const vehicle of vehicles) {
    const analysis = await analysePurchase(vehicle);
    analyses.push(analysis);
  }

  const ranked = analyses
    .map((analysis) => ({ ...analysis, numericBuyerScore: numericBuyerScore(analysis.snapshot) }))
    .sort((a, b) => (b.numericBuyerScore ?? -1) - (a.numericBuyerScore ?? -1));

  return {
    vehicles: analyses,
    recommendedRegistration: ranked[0]?.registration ?? null,
    recommendationBasis: ranked[0]?.numericBuyerScore != null
      ? "Highest CarKeeper Buyer Score. Read each full verdict because score alone should not override a major vehicle-specific concern."
      : "CarKeeper returned full reports but no machine-readable Buyer Score was found; compare the Quick Verdict and Final Verdict sections.",
  };
}

async function callWordPress(path, body = undefined, method = "POST") {
  if (!wpApiToken) throw new Error("CARKEEPER_WP_API_TOKEN is not configured on the MCP server.");
  return fetchJson(`${wpApiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${wpApiToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body,
    timeoutMs: 45000,
  });
}

export async function startFullReportCheckout(args) {
  return callWordPress("/create-checkout", {
    registration: normalizeRegistration(args.registration),
    asking_price: args.askingPrice ?? null,
    advert_text: args.advertText ?? null,
    image_urls: args.imageUrls ?? [],
  });
}

export async function getReport({ reportId }) {
  return callWordPress(`/reports/${encodeURIComponent(reportId)}`, undefined, "GET");
}
