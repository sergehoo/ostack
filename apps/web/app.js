// Dashboard OStack — chaque valeur affichée provient d'un artefact réel lu par
// l'API locale en lecture seule. Aucun chiffre n'est inventé : sans API, la
// page dit "hors ligne" ; sans artefact, elle affiche zéro ou une absence.

const API = "http://127.0.0.1:4310";

document.querySelectorAll(".workflow-cards button,.primary").forEach((button) => button.addEventListener("click", () => {
  const original = button.textContent;
  button.textContent = "Bientôt disponible";
  setTimeout(() => { button.textContent = original; }, 1400);
}));

function set(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setBar(id, ratio) {
  const element = document.getElementById(id);
  if (element) element.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

async function fetchJson(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return response.json();
}

function relativeTime(iso) {
  if (!iso) return "";
  const deltaMs = Date.now() - Date.parse(iso);
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

const STATUS_TAGS = {
  succeeded: ["success", "TERMINÉ"],
  running: ["running", "EN COURS"],
  waiting_approval: ["waiting", "APPROBATION"],
  failed: ["waiting", "ÉCHEC"],
  cancelled: ["waiting", "ANNULÉ"]
};

function renderRuns(runs) {
  const list = document.getElementById("activity-list");
  if (!list) return;
  list.textContent = "";
  if (runs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "run";
    empty.innerHTML = "<div><strong>Aucune exécution locale</strong><p>Lancez <code>ostack feature</code> pour démarrer un workflow vérifié.</p></div>";
    list.append(empty);
    return;
  }
  for (const run of runs.slice(0, 5)) {
    const [tagClass, label] = STATUS_TAGS[run.status] ?? ["waiting", String(run.status).toUpperCase()];
    const row = document.createElement("div");
    row.className = "run";
    const icon = document.createElement("span");
    icon.className = `run-icon ${tagClass === "success" ? "green" : tagClass === "running" ? "violet pulse" : "amber"}`;
    icon.textContent = tagClass === "success" ? "✓" : tagClass === "running" ? "▷" : "!";
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = run.workflowId;
    const meta = document.createElement("p");
    meta.textContent = `${run.completedSteps.length} étape(s) · ${run.id.slice(0, 8)}`;
    body.append(title, meta);
    const tag = document.createElement("span");
    tag.className = `tag ${tagClass}`;
    tag.textContent = label;
    const time = document.createElement("time");
    time.textContent = relativeTime(run.updatedAt ?? run.startedAt);
    row.append(icon, body, tag, time);
    list.append(row);
  }
}

function renderVerification(data) {
  const packs = data.evidencePacks;
  set("m-packs", `${packs.verified} / ${packs.total}`);
  set("m-packs-detail", packs.total === 0 ? "Aucun pack — lancez 'ostack prove'" : "vérifiés / total");
  set("m-invariants", String(data.intents.invariants));
  set("m-invariants-detail", `${data.intents.total} intention(s) compilée(s)`);
  const unverified = data.graph ? data.graph.unverified.length : null;
  set("m-unverified", unverified === null ? "—" : String(unverified));
  set("m-unverified-detail", unverified === null ? "Graphe absent — lancez 'ostack graph rebuild'" : "invariants et permissions sans preuve");

  set("v-packs", `${packs.verified} / ${packs.total}`);
  setBar("v-packs-bar", packs.total === 0 ? 0 : packs.verified / packs.total);
  set("v-drafts", `${data.drafts.pending} (${data.drafts.openTodos} à faire)`);
  setBar("v-drafts-bar", data.drafts.pending === 0 ? 0 : 1);
  set("v-blocking", String(data.deliberations.blockingChallenges));
  setBar("v-blocking-bar", data.deliberations.blockingChallenges === 0 ? 0 : 1);
  set("v-unverified", unverified === null ? "graphe absent" : String(unverified));
  setBar("v-unverified-bar", unverified ? 1 : 0);
  set("v-score", packs.total === 0 ? "—" : String(Math.round((packs.verified / packs.total) * 100)));
  set("v-note", packs.total === 0 ? "AUCUNE PREUVE ENREGISTRÉE POUR CE PROJET" : "");
}

async function refresh() {
  const status = document.getElementById("api-status");
  try {
    await fetchJson("/api/health");
    if (status) status.innerHTML = "<i></i> API locale connectée";
    const [runs, verification] = await Promise.all([fetchJson("/api/runs"), fetchJson("/api/verification")]);
    set("m-runs", String(runs.meta.count));
    set("m-runs-detail", runs.meta.count === 0 ? "Aucun workflow exécuté" : "runs persistés (SQLite)");
    renderRuns(runs.data);
    renderVerification(verification.data);
  } catch {
    if (status) status.innerHTML = "<i></i> API hors ligne — lancez npm run api";
  }
}

refresh();
setInterval(refresh, 15000);
