import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const encoder = new TextEncoder();

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-edit-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Vary": "Origin"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validUrl(value: string) {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function proposalPayload(body: Record<string, unknown>) {
  const englishTerm = cleanString(body.english_term, 80);
  const proposedTranslation = cleanString(body.proposed_translation, 120);
  const pronunciation = cleanString(body.pronunciation, 160);
  const researchNotes = cleanString(body.research_notes, 2000);
  const sourceName = cleanString(body.source_name, 160);
  const sourceUrl = cleanString(body.source_url, 500);
  const confidence = cleanString(body.confidence, 10);
  const researchStatus = cleanString(body.research_status, 10);
  if (cleanString(body.website, 200)) throw new Error("Submission rejected.");
  if (!englishTerm || !proposedTranslation || researchNotes.length < 4) throw new Error("English term, translation, and a useful research note are required.");
  if (!["Low", "Medium", "High"].includes(confidence)) throw new Error("Invalid confidence value.");
  if (!["ASK", "THINK", "HAVE"].includes(researchStatus)) throw new Error("Invalid research status.");
  if (!validUrl(sourceUrl)) throw new Error("Source URL must use http or https.");
  return { english_term: englishTerm, normalized_term: englishTerm.normalize("NFKC").toLocaleLowerCase("en-AU"), proposed_translation: proposedTranslation, pronunciation, research_notes: researchNotes, source_name: sourceName, source_url: sourceUrl, confidence, research_status: researchStatus };
}

async function enforceRateLimit(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const clientHash = await sha256(`${ip}:${Deno.env.get("RATE_LIMIT_SALT") ?? SERVICE_ROLE_KEY.slice(0, 24)}`);
  const now = Date.now();
  const { data } = await supabase.from("proposal_rate_limits").select("window_start, attempts").eq("client_hash", clientHash).maybeSingle();
  const expired = !data || now - new Date(data.window_start).getTime() > 60 * 60 * 1000;
  const attempts = expired ? 1 : Number(data.attempts) + 1;
  if (!expired && attempts > 12) throw new Error("Too many submissions from this connection. Please try again later.");
  await supabase.from("proposal_rate_limits").upsert({ client_hash: clientHash, window_start: expired ? new Date().toISOString() : data.window_start, attempts });
}

async function requireAdmin(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || !ADMIN_EMAIL) return false;
  const { data, error } = await supabase.auth.getUser(token);
  return !error && data.user?.email?.toLowerCase() === ADMIN_EMAIL;
}

const publicColumns = "id,english_term,normalized_term,proposed_translation,pronunciation,research_notes,source_name,source_url,confidence,research_status,visibility,created_at,updated_at";

async function handleGet(request: Request, adminMode: boolean) {
  if (adminMode && !(await requireAdmin(request))) return json({ error: "Administrator access required." }, 403);
  let query = supabase.from("word_proposals").select(publicColumns).order("normalized_term").order("created_at", { ascending: false }).limit(1000);
  if (!adminMode) query = query.eq("visibility", "visible");
  const { data, error } = await query;
  return error ? json({ error: "Unable to load proposals." }, 500) : json({ proposals: data });
}

async function handleCreate(request: Request) {
  await enforceRateLimit(request);
  let payload;
  try { payload = proposalPayload(await request.json()); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid proposal." }, 400); }
  const { data: duplicate } = await supabase.from("word_proposals").select("id").eq("normalized_term", payload.normalized_term).ilike("proposed_translation", payload.proposed_translation).eq("source_url", payload.source_url).eq("visibility", "visible").limit(1).maybeSingle();
  if (duplicate) return json({ error: "That exact proposal is already in the community word bank." }, 409);
  const editToken = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await supabase.from("word_proposals").insert({ ...payload, owner_token_hash: await sha256(editToken) }).select(publicColumns).single();
  return error ? json({ error: "Unable to publish the proposal." }, 500) : json({ proposal: data, editToken }, 201);
}

async function ownerMatches(id: string, request: Request) {
  const token = request.headers.get("x-edit-token") || "";
  if (!token || token.length > 200) return false;
  const { data } = await supabase.from("word_proposals").select("owner_token_hash").eq("id", id).maybeSingle();
  return Boolean(data && data.owner_token_hash === await sha256(token));
}

async function handleOwnerUpdate(id: string, request: Request) {
  if (!(await ownerMatches(id, request))) return json({ error: "This proposal cannot be edited from this browser." }, 403);
  let payload;
  try { payload = proposalPayload(await request.json()); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid proposal." }, 400); }
  const { data, error } = await supabase.from("word_proposals").update(payload).eq("id", id).select(publicColumns).single();
  return error ? json({ error: "Unable to update the proposal." }, 500) : json({ proposal: data });
}

async function handleOwnerDelete(id: string, request: Request) {
  if (!(await ownerMatches(id, request))) return json({ error: "This proposal cannot be deleted from this browser." }, 403);
  const { error } = await supabase.from("word_proposals").delete().eq("id", id);
  return error ? json({ error: "Unable to delete the proposal." }, 500) : json({ deleted: true });
}

async function handleAdmin(id: string, request: Request) {
  if (!(await requireAdmin(request))) return json({ error: "Administrator access required." }, 403);
  if (request.method === "DELETE") {
    const { error } = await supabase.from("word_proposals").delete().eq("id", id);
    return error ? json({ error: "Unable to delete the proposal." }, 500) : json({ deleted: true });
  }
  const body = await request.json();
  if (!["visible", "hidden"].includes(body.visibility)) return json({ error: "Invalid visibility." }, 400);
  const { data, error } = await supabase.from("word_proposals").update({ visibility: body.visibility }).eq("id", id).select("id,visibility").single();
  return error ? json({ error: "Unable to update visibility." }, 500) : json({ proposal: data });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const functionIndex = parts.lastIndexOf("proposals");
    const id = functionIndex >= 0 ? parts[functionIndex + 1] : undefined;
    const adminPath = parts[functionIndex + 2] === "admin";
    if (request.method === "GET") return handleGet(request, url.searchParams.get("admin") === "1");
    if (request.method === "POST" && !id) return handleCreate(request);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Proposal not found." }, 404);
    if (adminPath && ["PATCH", "DELETE"].includes(request.method)) return handleAdmin(id, request);
    if (request.method === "PATCH") return handleOwnerUpdate(id, request);
    if (request.method === "DELETE") return handleOwnerDelete(id, request);
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return json({ error: message }, message.startsWith("Too many") ? 429 : 500);
  }
});
