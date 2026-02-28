const CHECK_TIMEOUT_MS = 8000;
const RECHECK_INTERVAL_MS = 60000;

const SERVER_COLORS = [
  { color: "#2563eb", bg: "#eff6ff" },
  { color: "#7c3aed", bg: "#f5f3ff" },
  { color: "#059669", bg: "#ecfdf5" },
  { color: "#d97706", bg: "#fffbeb" },
  { color: "#dc2626", bg: "#fef2f2" },
  { color: "#0891b2", bg: "#ecfeff" },
];

function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

fetch("/server-id.json")
  .then((r) => r.json())
  .then((data) => {
    const name = data.name || "Unknown";
    const palette = SERVER_COLORS[hashName(name) % SERVER_COLORS.length];
    const badge = document.getElementById("server-badge");
    badge.style.setProperty("--server-color", palette.color);
    badge.style.setProperty("--server-bg", palette.bg);
    document.getElementById("server-name").textContent = name;
    badge.classList.add("visible");
  });

function checkServer(host) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  return fetch(`/health-check?target=${encodeURIComponent(host)}`, {
    signal: controller.signal,
    cache: "no-store",
    redirect: "manual",
  })
    .then((r) => {
      clearTimeout(timeout);
      return r.type === "opaqueredirect" || r.status < 500;
    })
    .catch(() => {
      clearTimeout(timeout);
      return false;
    });
}

function renderServerPills(servers) {
  const list = document.getElementById("server-status-list");
  if (!list || !Array.isArray(servers)) return;
  list.innerHTML = "";
  servers.forEach((server) => {
    const pill = document.createElement("div");
    pill.className = "status-pill status-pill--checking visible";
    pill.setAttribute("aria-label", `${server.name}: checking`);
    pill.innerHTML = `<span class="status-dot"></span><span class="status-pill-name">${escapeHtml(server.name)}</span><span class="status-icon"></span>`;
    list.appendChild(pill);
    checkServer(server.host).then((up) => {
      pill.className = `status-pill status-pill--${up ? "up" : "down"} visible`;
      pill.setAttribute("aria-label", `${server.name}: ${up ? "up" : "down"}`);
      pill.querySelector(".status-icon").textContent = up ? "\u2713" : "\u2717";
    });
  });
}

function runServerChecks() {
  fetch("/servers.json", { cache: "no-store" })
    .then((r) => r.json())
    .then(renderServerPills)
    .catch(() => {});
}

runServerChecks();
setInterval(runServerChecks, RECHECK_INTERVAL_MS);
