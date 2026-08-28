import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_EVENTS = new Set([
  "role_path_selected",
  "goal_path_selected",
  "diagnostic_started",
  "diagnostic_completed",
  "diagnostic_recommendation_clicked",
  "product_view_from_diagnostic",
  "sample_opened",
  "purchase_cta_clicked",
  "checkout_opened",
  "purchase_success",
]);
const ROLES = new Set(["pricing", "xva", "validation", "quantdev", "general"]);
const EXPERIENCES = new Set(["transition", "early", "experienced"]);
const TIMELINES = new Set(["urgent", "near", "runway"]);
const READINESS = new Set(["90_plus", "75_89", "55_74", "below_55"]);
const GAPS = new Set(["foundations", "pricing", "risk", "implementation", "interview", "none"]);
const DOMAINS = new Set(["foundations", "pricing", "risk", "implementation", "interview", "integration", "bundle"]);
const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;
const ALLOWED_HOST_RE = /^(?:desk2quant\.com|www\.desk2quant\.com|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?|(?:desk2quant|quant-mentor)(?:-[A-Za-z0-9-]+)*\.vercel\.app)$/i;
const MAX_BODY_BYTES = 8192;

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  try { return ALLOWED_HOST_RE.test(new URL(origin).host); } catch { return false; }
}
function cors(origin: string | null) {
  const allowed = origin && isAllowedOrigin(origin) ? origin : "https://desk2quant.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return s ? s.slice(0, max) : null;
}
function enumValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}
function boolValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function numberValue(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
}
function pagePath(value: unknown): string | null {
  const s = cleanText(value, 180);
  return s && s.startsWith("/") ? s : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  if (!isAllowedOrigin(origin)) return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers });

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413, headers });
  }

  let raw = "";
  try { raw = await req.text(); } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers });
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), { status: 413, headers });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers });
  }

  const eventId = typeof body.event_id === "string" && ID_RE.test(body.event_id) ? body.event_id : null;
  const sessionId = typeof body.session_id === "string" && ID_RE.test(body.session_id) ? body.session_id : null;
  const diagnosticId = body.diagnostic_id == null ? null : (typeof body.diagnostic_id === "string" && ID_RE.test(body.diagnostic_id) ? body.diagnostic_id : null);
  const eventName = typeof body.event_name === "string" && ALLOWED_EVENTS.has(body.event_name) ? body.event_name : null;
  const path = pagePath(body.page_path);
  if (!eventId || !sessionId || !eventName || !path || (body.diagnostic_id != null && !diagnosticId)) {
    return new Response(JSON.stringify({ error: "invalid_event" }), { status: 400, headers });
  }

  const productId = body.product_id == null ? null : (typeof body.product_id === "string" && UUID_RE.test(body.product_id) ? body.product_id : null);
  if (body.product_id != null && !productId) return new Response(JSON.stringify({ error: "invalid_product" }), { status: 400, headers });

  const materialGapRaw = body.material_gap_count == null ? null : Number(body.material_gap_count);
  const materialGapCount = Number.isInteger(materialGapRaw) && materialGapRaw >= 0 && materialGapRaw <= 5 ? materialGapRaw : null;
  const currency = body.currency == null ? null : (typeof body.currency === "string" && CURRENCY_RE.test(body.currency) ? body.currency : null);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response(JSON.stringify({ error: "server_config" }), { status: 503, headers });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error: countError } = await db.from("funnel_events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .gte("created_at", since);
  if (countError) return new Response(JSON.stringify({ error: "storage_unavailable" }), { status: 503, headers });
  if ((count || 0) >= 60) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers });

  const row = {
    event_id: eventId,
    session_id: sessionId,
    diagnostic_id: diagnosticId,
    event_name: eventName,
    page_path: path,
    product_id: productId,
    source: cleanText(body.source, 48),
    role: enumValue(body.role, ROLES),
    experience: enumValue(body.experience, EXPERIENCES),
    timeline: enumValue(body.timeline, TIMELINES),
    readiness_band: enumValue(body.readiness_band, READINESS),
    top_gap: enumValue(body.top_gap, GAPS),
    recommendation_domain: enumValue(body.recommendation_domain, DOMAINS),
    material_gap_count: materialGapCount,
    bundle_suggested: boolValue(body.bundle_suggested),
    amount: numberValue(body.amount),
    currency,
    cta_source: cleanText(body.cta_source, 48),
    utm_source: cleanText(body.utm_source, 100),
    utm_medium: cleanText(body.utm_medium, 100),
    utm_campaign: cleanText(body.utm_campaign, 120),
    referrer_host: cleanText(body.referrer_host, 180),
  };

  const { error } = await db.from("funnel_events").upsert(row, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) {
    console.error("funnel insert failed", error.code, error.message);
    return new Response(JSON.stringify({ error: "storage_unavailable" }), { status: 503, headers });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
});
