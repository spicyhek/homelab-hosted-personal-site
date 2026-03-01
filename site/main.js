const CHECK_TIMEOUT_MS = 8000;
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

fetch("/server-id.json")
  .then((r) => r.json())
  .then((data) => {
    const name = data.name || "Unknown";
    const palette = SERVER_COLORS[hashName(name) % SERVER_COLORS.length];
    const badge = document.getElementById("server-badge");
    const serverName = document.getElementById("server-name");
    if (!badge || !serverName) return;
    badge.style.setProperty("--server-color", palette.color);
    badge.style.setProperty("--server-bg", palette.bg);
    serverName.textContent = name;
    badge.classList.add("visible");
  });

function checkServer(host) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  return fetch(`/health-check?target=${encodeURIComponent(host)}`, {
    signal: controller.signal,
    cache: "no-store",
  })
    .then((r) => {
      clearTimeout(timeout);
      return r.ok;
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
    pill.innerHTML = `<span class="status-dot"></span><span class="status-pill-name">${escapeHtml(server.name)}</span>`;
    list.appendChild(pill);
    checkServer(server.host).then((up) => {
      pill.className = `status-pill status-pill--${up ? "up" : "down"} visible`;
      pill.setAttribute("aria-label", `${server.name}: ${up ? "up" : "down"}`);
    });
  });
}

function runServerChecks() {
  const list = document.getElementById("server-status-list");
  if (!list) return;
  fetch("/servers.json", { cache: "no-store" })
    .then((r) => r.json())
    .then(renderServerPills)
    .catch(() => {
      list.innerHTML =
        '<div class="status-pill status-pill--down visible"><span class="status-dot"></span><span class="status-pill-name">Unable to load server list</span></div>';
    });
}

function initPhotoRotation() {
  const photo = document.querySelector(".profile-photo");
  if (!photo) return;

  const frames = [
    {
      src: "assets/profile.png",
      alt: "Portrait photo of Brendan Manley",
    },
    {
      src: "assets/profile-alt-1.png",
      alt: "Brendan at an anime event display",
    },
    {
      src: "assets/profile-alt-2.png",
      alt: "Brendan in cosplay at a convention center",
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
