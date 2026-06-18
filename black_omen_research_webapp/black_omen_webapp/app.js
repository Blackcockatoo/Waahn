"use strict";

const data = window.BLACK_OMEN_DATA;
const config = window.BLACK_OMEN_CONFIG || {};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const API_URL = config.supabaseUrl ? `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/proposals` : "";
const LOCAL_PROPOSALS_KEY = "black-omen-local-proposals-v1";
const OWNER_KEYS_KEY = "black-omen-owner-keys-v1";

let communityProposals = [];
let currentWordFilter = "ALL";
let lastLocalSubmission = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeStatus(value) {
  return ["HAVE", "THINK", "ASK"].includes(value) ? value : "ASK";
}

function badge(status) {
  const clean = safeStatus(status);
  return `<span class="badge ${clean}">${clean}</span>`;
}

function readableDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function getJsonStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function setJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getOwnerKeys() {
  return getJsonStorage(OWNER_KEYS_KEY, {});
}

function rememberOwnerKey(id, token) {
  const keys = getOwnerKeys();
  keys[id] = token;
  setJsonStorage(OWNER_KEYS_KEY, keys);
}

function forgetOwnerKey(id) {
  const keys = getOwnerKeys();
  delete keys[id];
  setJsonStorage(OWNER_KEYS_KEY, keys);
}

function renderStats() {
  $("#countWords").textContent = data.wordBank.length;
  $("#countCommunity").textContent = communityProposals.length;
  $("#countLines").textContent = data.lineMap.length;
  $("#countSources").textContent = data.sources.length;
}

function renderStaticContent() {
  $("#songText").textContent = data.fullSong;
  const videoParams = new URLSearchParams({ autoplay: "1", mute: "1", playsinline: "1", controls: "1", rel: "0", loop: "1", playlist: data.youtube.id });
  $("#youtubeFrame").src = `https://www.youtube-nocookie.com/embed/${data.youtube.id}?${videoParams}`;
  $("#youtubeLink").href = data.youtube.url;
  $("#requestText").value = data.requestText;
}

function renderWordBank() {
  const query = ($("#wordSearch").value || "").trim().toLowerCase();
  const items = data.wordBank.filter(word => {
    const statusOk = currentWordFilter === "ALL" || word.status.includes(currentWordFilter);
    return statusOk && (!query || Object.values(word).flat().join(" ").toLowerCase().includes(query));
  });
  $("#wordCards").innerHTML = items.length ? items.map(word => `
    <article class="wordCard curatedCard">
      <div>${badge(word.status)}<span class="sourceChip curatedChip">Curated research</span><span class="sourceChip">${esc(word.confidence)}</span></div>
      <h3>${esc(word.english)}</h3><div class="lang">${esc(word.word)}</div>
      <p class="muted"><strong>Pronunciation:</strong> ${esc(word.pronunciation)}</p><p>${esc(word.notes)}</p>
      <div>${(word.sources || []).map(source => `<span class="sourceChip">${esc(source)}</span>`).join("")}</div>
    </article>`).join("") : '<p class="emptyState">No curated words match that search.</p>';
}

function renderMissing() {
  $("#missingCloud").innerHTML = data.missingTerms.map(item => `<span class="miss" title="${esc(item.note)}">${esc(item.term)}</span>`).join("");
}

function renderLineMap() {
  const query = ($("#lineSearch").value || "").toLowerCase();
  const items = data.lineMap.filter(row => Object.values(row).join(" ").toLowerCase().includes(query));
  $("#lineCards").innerHTML = items.map(row => `<article class="lineCard"><div><small>${esc(row.section)}</small><h3>${esc(row.original)}</h3></div><div><small>Found</small><p>${esc(row.found)}</p></div><div><small>Skeleton</small><p class="skeleton">${esc(row.skeleton)}</p><p class="muted">${esc(row.literal)}</p></div><div><small>Unresolved</small><p>${esc(row.unresolved)}</p></div></article>`).join("");
}

function renderChants() {
  $("#chantCards").innerHTML = data.safeChants.map(chant => `<article class="chantCard"><h3>${esc(chant.title)}</h3>${chant.lines.map(line => `<div class="chantLine">${esc(line)}</div>`).join("")}<p class="muted">${esc(chant.note)}</p></article>`).join("");
}

function renderSources() {
  $("#sourceCards").innerHTML = data.sources.map(source => `<article class="sourceCard"><h3>${esc(source.title)}</h3><p class="muted">${esc(source.note)}</p><a class="sourceChip" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open source</a></article>`).join("");
}

function renderCommunity() {
  const query = ($("#communitySearch").value || "").trim().toLowerCase();
  const filtered = communityProposals.filter(item => !query || [item.english_term, item.proposed_translation, item.pronunciation, item.research_notes, item.source_name, item.confidence, item.research_status].join(" ").toLowerCase().includes(query));
  const grouped = filtered.reduce((groups, item) => {
    const key = item.normalized_term || item.english_term.trim().toLocaleLowerCase();
    (groups[key] ||= []).push(item);
    return groups;
  }, {});
  const keys = getOwnerKeys();
  const groups = Object.values(grouped).sort((a, b) => a[0].english_term.localeCompare(b[0].english_term));
  $("#communityGroups").innerHTML = groups.length ? groups.map(items => `
    <section class="proposalGroup">
      <div class="proposalGroupHead"><div><span class="eyebrow">English term</span><h3>${esc(items[0].english_term)}</h3></div><span class="countPill">${items.length} proposal${items.length === 1 ? "" : "s"}</span></div>
      <div class="proposalList">${items.map(item => `
        <article class="proposalCard">
          <div class="proposalMeta"><span class="sourceChip communityChip">Community / Unverified</span>${badge(item.research_status)}<span class="sourceChip">${esc(item.confidence)} confidence</span></div>
          <h4>${esc(item.proposed_translation)}</h4>
          ${item.pronunciation ? `<p class="muted"><strong>Pronunciation:</strong> ${esc(item.pronunciation)}</p>` : ""}
          <p class="proposalNotes">${esc(item.research_notes)}</p>
          ${item.source_name || item.source_url ? `<p class="proposalSource"><strong>Source:</strong> ${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">${esc(item.source_name || "Open source")}</a>` : esc(item.source_name)}</p>` : ""}
          <div class="proposalFoot"><span>Added ${esc(readableDate(item.created_at))}</span>${keys[item.id] ? `<span><button class="textBtn" type="button" data-edit-proposal="${esc(item.id)}">Edit</button><button class="textBtn dangerText" type="button" data-delete-proposal="${esc(item.id)}">Delete</button></span>` : ""}</div>
        </article>`).join("")}</div>
    </section>`).join("") : '<div class="emptyState"><strong>No community proposals found.</strong><span>Be the first to add a carefully sourced research lead.</span></div>';
  renderStats();
}

function showConnection(message, kind = "info") {
  const notice = $("#connectionNotice");
  notice.hidden = !message;
  notice.className = `connectionNotice ${kind}`;
  notice.textContent = message;
}

async function apiRequest(path = "", options = {}) {
  if (!API_URL) throw new Error("Shared database is not configured");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The shared database request failed");
  return body;
}

async function loadCommunity() {
  showConnection("Loading shared proposals…");
  try {
    if (API_URL) {
      const result = await apiRequest();
      communityProposals = result.proposals || [];
      showConnection("");
    } else {
      communityProposals = getJsonStorage(LOCAL_PROPOSALS_KEY, []);
      showConnection("Preview mode: proposals are saved only in this browser until Supabase is configured.", "warning");
    }
  } catch (error) {
    communityProposals = getJsonStorage(LOCAL_PROPOSALS_KEY, communityProposals);
    showConnection(navigator.onLine ? `Shared proposals are temporarily unavailable: ${error.message}` : "You are offline. Curated research remains available; showing any locally saved proposals.", "warning");
  }
  renderCommunity();
}

function proposalFromForm() {
  return {
    english_term: $("#englishTerm").value.trim(), proposed_translation: $("#proposedTranslation").value.trim(),
    pronunciation: $("#pronunciation").value.trim(), confidence: $("#confidence").value,
    research_status: $("#researchStatus").value, source_name: $("#sourceName").value.trim(),
    source_url: $("#sourceUrl").value.trim(), research_notes: $("#researchNotes").value.trim(), website: $("#website").value
  };
}

function validateProposal(item) {
  if (item.website) return "Submission rejected.";
  if (item.english_term.length < 1 || item.proposed_translation.length < 1 || item.research_notes.length < 4) return "Add the English term, proposed translation, and a useful research note.";
  if (!["Low", "Medium", "High"].includes(item.confidence) || !["ASK", "THINK", "HAVE"].includes(item.research_status)) return "Choose a valid confidence and research status.";
  if (item.source_url) { try { const url = new URL(item.source_url); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); } catch { return "Source link must be a complete http:// or https:// address."; } }
  return "";
}

function setFormBusy(busy, message = "") {
  $("#submitProposalBtn").disabled = busy;
  $("#submitProposalBtn").textContent = busy ? "Saving…" : ($("#proposalId").value ? "Save changes" : "Publish proposal");
  $("#formStatus").textContent = message;
}

function resetProposalForm() {
  $("#proposalForm").reset(); $("#proposalId").value = ""; $("#proposalFormTitle").textContent = "Propose a word"; $("#cancelEditBtn").hidden = true; setFormBusy(false, "");
}

async function saveLocalProposal(item, id) {
  const now = new Date().toISOString();
  if (Date.now() - lastLocalSubmission < 3000) throw new Error("Please wait a moment before submitting again.");
  lastLocalSubmission = Date.now();
  if (id) {
    const index = communityProposals.findIndex(entry => entry.id === id);
    if (index < 0 || !getOwnerKeys()[id]) throw new Error("This proposal cannot be edited from this browser.");
    communityProposals[index] = { ...communityProposals[index], ...item, normalized_term: item.english_term.toLocaleLowerCase(), updated_at: now };
  } else {
    const newId = crypto.randomUUID();
    communityProposals.unshift({ ...item, id: newId, normalized_term: item.english_term.toLocaleLowerCase(), created_at: now, updated_at: now, visibility: "visible" });
    rememberOwnerKey(newId, crypto.randomUUID());
  }
  setJsonStorage(LOCAL_PROPOSALS_KEY, communityProposals);
}

async function submitProposal(event) {
  event.preventDefault();
  if (!$("#researchConsent").checked) return setFormBusy(false, "Confirm the public research notice before publishing.");
  const item = proposalFromForm();
  const validationError = validateProposal(item);
  if (validationError) return setFormBusy(false, validationError);
  const id = $("#proposalId").value;
  setFormBusy(true, id ? "Updating your proposal…" : "Publishing your proposal…");
  try {
    if (API_URL) {
      const ownerToken = id ? getOwnerKeys()[id] : "";
      const result = await apiRequest(id ? `/${encodeURIComponent(id)}` : "", { method: id ? "PATCH" : "POST", headers: ownerToken ? { "X-Edit-Token": ownerToken } : {}, body: JSON.stringify(item) });
      if (result.editToken) rememberOwnerKey(result.proposal.id, result.editToken);
    } else await saveLocalProposal(item, id);
    resetProposalForm(); await loadCommunity(); $("#communitySearch").focus();
  } catch (error) { setFormBusy(false, error.message); }
}

function beginEdit(id) {
  const item = communityProposals.find(entry => entry.id === id);
  if (!item || !getOwnerKeys()[id]) return;
  $("#proposalId").value = id; $("#englishTerm").value = item.english_term; $("#proposedTranslation").value = item.proposed_translation;
  $("#pronunciation").value = item.pronunciation || ""; $("#confidence").value = item.confidence; $("#researchStatus").value = item.research_status;
  $("#sourceName").value = item.source_name || ""; $("#sourceUrl").value = item.source_url || ""; $("#researchNotes").value = item.research_notes;
  $("#researchConsent").checked = true; $("#proposalFormTitle").textContent = "Edit your proposal"; $("#cancelEditBtn").hidden = false; setFormBusy(false, "");
  $("#proposalForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteProposal(id) {
  const ownerToken = getOwnerKeys()[id];
  if (!ownerToken || !window.confirm("Delete your proposal permanently?")) return;
  try {
    if (API_URL) await apiRequest(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Edit-Token": ownerToken } });
    else { communityProposals = communityProposals.filter(item => item.id !== id); setJsonStorage(LOCAL_PROPOSALS_KEY, communityProposals); }
    forgetOwnerKey(id); await loadCommunity();
  } catch (error) { showConnection(error.message, "warning"); }
}

async function copyBySelector(selector) {
  const element = $(selector); const text = element.value ?? element.innerText ?? element.textContent ?? "";
  try { await navigator.clipboard.writeText(text); } catch { if (element.select) element.select(); document.execCommand("copy"); }
}

function exportWordBankCsv() {
  const columns = ["collection", "english", "word", "status", "confidence", "pronunciation", "notes", "sources"];
  const curated = data.wordBank.map(word => ({ collection: "Curated", ...word }));
  const community = communityProposals.map(item => ({ collection: "Community / Unverified", english: item.english_term, word: item.proposed_translation, status: item.research_status, confidence: item.confidence, pronunciation: item.pronunciation, notes: item.research_notes, sources: [item.source_name, item.source_url].filter(Boolean).join(" — ") }));
  const rows = [columns.join(","), ...curated.concat(community).map(row => columns.map(column => `"${String(column === "sources" && Array.isArray(row[column]) ? row[column].join("; ") : row[column] ?? "").replace(/"/g, '""')}"`).join(","))];
  const link = document.createElement("a"); const url = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
  link.href = url; link.download = "black_omen_word_research.csv"; link.click(); URL.revokeObjectURL(url);
}

function bindEvents() {
  $("#wordSearch").addEventListener("input", renderWordBank); $("#lineSearch").addEventListener("input", renderLineMap); $("#communitySearch").addEventListener("input", renderCommunity);
  $$(".pill[data-filter]").forEach(button => button.addEventListener("click", () => { $$(".pill[data-filter]").forEach(item => item.classList.remove("active")); button.classList.add("active"); currentWordFilter = button.dataset.filter; renderWordBank(); }));
  $$("[data-copy]").forEach(button => button.addEventListener("click", () => copyBySelector(button.dataset.copy)));
  $("#proposalForm").addEventListener("submit", submitProposal); $("#cancelEditBtn").addEventListener("click", resetProposalForm); $("#refreshCommunityBtn").addEventListener("click", loadCommunity);
  $("#communityGroups").addEventListener("click", event => { const edit = event.target.closest("[data-edit-proposal]"); const remove = event.target.closest("[data-delete-proposal]"); if (edit) beginEdit(edit.dataset.editProposal); if (remove) deleteProposal(remove.dataset.deleteProposal); });
  $("#printBtn").addEventListener("click", () => window.print()); $("#exportBtn").addEventListener("click", exportWordBankCsv);
  $("#menuBtn").addEventListener("click", () => { const open = $("#navLinks").classList.toggle("open"); $("#menuBtn").setAttribute("aria-expanded", String(open)); });
  $$("#navLinks a").forEach(link => link.addEventListener("click", () => { $("#navLinks").classList.remove("open"); $("#menuBtn").setAttribute("aria-expanded", "false"); }));
  window.addEventListener("online", loadCommunity); window.addEventListener("offline", () => showConnection("You are offline. Curated research remains available.", "warning"));
}

async function init() {
  renderStaticContent(); renderWordBank(); renderMissing(); renderLineMap(); renderChants(); renderSources(); bindEvents(); await loadCommunity();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

init();
