const STATUS_ENDPOINT = "/api/status";
const RECHECK_INTERVAL_MS = 60000;
const PHOTO_ROTATE_INTERVAL_MS = 5000;
const PHOTO_FADE_MS = 260;

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

function showServingNode(name) {
  const resolvedName = name || "Unknown";
  const palette = SERVER_COLORS[hashName(resolvedName) % SERVER_COLORS.length];
  const badge = document.getElementById("server-badge");
  const serverName = document.getElementById("server-name");
  if (!badge || !serverName) return;
  badge.style.setProperty("--server-color", palette.color);
  badge.style.setProperty("--server-bg", palette.bg);
  serverName.textContent = resolvedName;
  badge.classList.add("visible");
}

function showServerListMessage(message) {
  const list = document.getElementById("server-status-list");
  if (!list) return;
  list.innerHTML = `<div class="status-pill status-pill--down visible"><span class="status-dot"></span><span class="status-pill-name">${escapeHtml(message)}</span></div>`;
}

function renderServerPills(servers) {
  const list = document.getElementById("server-status-list");
  if (!list || !Array.isArray(servers)) return;
  list.innerHTML = "";
  if (servers.length === 0) {
    showServerListMessage("No monitored sites configured");
    return;
  }
  servers.forEach((server) => {
    const isUp = Boolean(server.up);
    const pill = document.createElement("div");
    pill.className = `status-pill status-pill--${isUp ? "up" : "down"} visible`;
    pill.setAttribute("aria-label", `${server.name}: ${isUp ? "up" : "down"}`);
    pill.innerHTML = `<span class="status-dot"></span><span class="status-pill-name">${escapeHtml(server.name)}</span>`;
    list.appendChild(pill);
  });
}

function runServerChecks() {
  fetch(STATUS_ENDPOINT, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Status API returned ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      showServingNode(data.servedBy);
      renderServerPills(data.sites);
    })
    .catch(() => {
      showServingNode("Unavailable");
      showServerListMessage("Unable to load server status");
    });
}

function initPhotoRotation() {
  const photo = document.querySelector(".profile-photo");
  if (!photo) return;

  const frames = [
    {
      src: "assets/profile.png",
      alt: "",
    },
    {
      src: "assets/profile-alt-1.png",
      alt: "",
    },
    {
      src: "assets/profile-alt-2.png",
      alt: "",
    },
  ];

  frames.forEach((frame) => {
    const preload = new Image();
    preload.src = frame.src;
  });

  function resolveCurrentIndex() {
    const currentSrc = photo.getAttribute("src") || "";
    const matchIndex = frames.findIndex((frame) => currentSrc.includes(frame.src));
    return matchIndex >= 0 ? matchIndex : 0;
  }

  let current = resolveCurrentIndex();
  let rotating = false;

  function showFrame(index) {
    photo.src = frames[index].src;
    photo.alt = frames[index].alt;
    photo.classList.remove("is-fading");
    current = index;
    rotating = false;
  }

  function rotateToNext() {
    if (rotating) return;
    rotating = true;
    const next = (current + 1) % frames.length;
    photo.classList.add("is-fading");

    // Load the next image first, then swap; if it fails, skip forward.
    const nextImage = new Image();
    nextImage.onload = () => {
      setTimeout(() => showFrame(next), PHOTO_FADE_MS);
    };
    nextImage.onerror = () => {
      const fallback = (next + 1) % frames.length;
      setTimeout(() => showFrame(fallback), PHOTO_FADE_MS);
    };
    nextImage.src = frames[next].src;
  }

  window.setInterval(rotateToNext, PHOTO_ROTATE_INTERVAL_MS);
}

runServerChecks();
setInterval(runServerChecks, RECHECK_INTERVAL_MS);
initPhotoRotation();
