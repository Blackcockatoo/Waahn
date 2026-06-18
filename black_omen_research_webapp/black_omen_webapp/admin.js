"use strict";

const config = window.BLACK_OMEN_CONFIG || {};
const $ = selector => document.querySelector(selector);
const API_URL = config.supabaseUrl ? `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/proposals` : "";
const SESSION_KEY = "black-omen-admin-session-v1";
let proposals = [];
let session = null;

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function safeStatus(value) { return ["HAVE", "THINK", "ASK"].includes(value) ? value : "ASK"; }
function badge(status) { const clean = safeStatus(status); return `<span class="badge ${clean}">${clean}</span>`; }

function parseAuthRedirect() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.get("access_token")) return;
  session = { access_token: params.get("access_token"), refresh_token: params.get("refresh_token") || "", expires_at: Date.now() + Number(params.get("expires_in") || 3600) * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  history.replaceState({}, document.title, location.pathname);
}

function restoreSession() {
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { session = null; }
  if (session?.expires_at <= Date.now()) { localStorage.removeItem(SESSION_KEY); session = null; }
}

function showStatus(message, warning = false) {
  const status = $("#adminStatus"); status.hidden = !message; status.textContent = message; status.className = `connectionNotice${warning ? " warning" : ""}`;
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1${path}`, { ...options, headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.msg || body.error_description || body.error || "Authentication failed"); return body;
}

async function adminRequest(path = "?admin=1", options = {}) {
  if (!session?.access_token) throw new Error("Sign in again to continue.");
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({})); if (response.status === 401 || response.status === 403) { localStorage.removeItem(SESSION_KEY); session = null; showLogin(); }
  if (!response.ok) throw new Error(body.error || "Administrator request failed"); return body;
}

function showLogin() { $("#loginPanel").hidden = false; $("#adminPanel").hidden = true; }
function showAdmin() { $("#loginPanel").hidden = true; $("#adminPanel").hidden = false; loadProposals(); }

async function sendMagicLink(event) {
  event.preventDefault(); const email = $("#adminEmail").value.trim(); $("#loginStatus").textContent = "Sending…";
  try { await authRequest("/otp", { method: "POST", body: JSON.stringify({ email, options: { emailRedirectTo: location.href.split("#")[0] } }) }); $("#loginStatus").textContent = "Check your email for the secure sign-in link."; }
  catch (error) { $("#loginStatus").textContent = error.message; }
}

async function loadProposals() {
  showStatus("Loading proposals…");
  try { const result = await adminRequest("?admin=1"); proposals = result.proposals || []; showStatus(""); render(); }
  catch (error) { showStatus(error.message, true); }
}

function render() {
  const query = $("#adminSearch").value.trim().toLowerCase(); const visibility = $("#visibilityFilter").value;
  const filtered = proposals.filter(item => (visibility === "all" || item.visibility === visibility) && (!query || Object.values(item).join(" ").toLowerCase().includes(query)));
  $("#adminList").innerHTML = filtered.length ? filtered.map(item => `<article class="card adminCard" data-admin-id="${esc(item.id)}"><div class="adminCardHead"><div><span class="sourceChip communityChip">Community / Unverified</span>${badge(item.research_status)}<span class="sourceChip">${esc(item.visibility)}</span><h3>${esc(item.english_term)} → ${esc(item.proposed_translation)}</h3></div><div class="adminActions"><button class="pill" type="button" data-visibility="${item.visibility === "visible" ? "hidden" : "visible"}">${item.visibility === "visible" ? "Hide" : "Restore"}</button><button class="pill dangerBtn" type="button" data-admin-delete>Delete permanently</button></div></div><p>${esc(item.research_notes)}</p><p class="muted">${esc(item.pronunciation || "No pronunciation")} · ${esc(item.confidence)} confidence · ${esc(item.source_name || "No source name")}</p>${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}<small class="adminDates">Created ${esc(new Date(item.created_at).toLocaleString())}</small></article>`).join("") : '<div class="emptyState">No proposals match these filters.</div>';
}

async function updateVisibility(id, visibility) {
  try { await adminRequest(`/${encodeURIComponent(id)}/admin`, { method: "PATCH", body: JSON.stringify({ visibility }) }); await loadProposals(); } catch (error) { showStatus(error.message, true); }
}

async function permanentDelete(id) {
  if (!confirm("Permanently delete this community proposal? This cannot be undone.")) return;
  try { await adminRequest(`/${encodeURIComponent(id)}/admin`, { method: "DELETE" }); await loadProposals(); } catch (error) { showStatus(error.message, true); }
}

async function init() {
  if (!API_URL || !config.supabaseAnonKey) { $("#adminSetup").hidden = false; $("#loginPanel").hidden = true; return; }
  parseAuthRedirect(); restoreSession(); session ? showAdmin() : showLogin();
  $("#loginForm").addEventListener("submit", sendMagicLink); $("#adminSearch").addEventListener("input", render); $("#visibilityFilter").addEventListener("change", render); $("#adminRefresh").addEventListener("click", loadProposals);
  $("#signOutBtn").addEventListener("click", () => { localStorage.removeItem(SESSION_KEY); session = null; showLogin(); });
  $("#adminList").addEventListener("click", event => { const card = event.target.closest("[data-admin-id]"); if (!card) return; const visibility = event.target.closest("[data-visibility]"); if (visibility) updateVisibility(card.dataset.adminId, visibility.dataset.visibility); if (event.target.closest("[data-admin-delete]")) permanentDelete(card.dataset.adminId); });
}

init();
