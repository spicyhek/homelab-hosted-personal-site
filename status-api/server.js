"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");

const PORT = parsePositiveInt(process.env.PORT, 3000);
const CACHE_TTL_MS = parsePositiveInt(process.env.CACHE_TTL_MS, 30000);
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 5000);

const DEFAULT_TARGETS = [
  { name: "nids.brendanmanley.com", host: "nids.brendanmanley.com" },
  { name: "brendanmanley.com", host: "brendanmanley.com" },
  { name: "grafana.brendanmanley.com", host: "grafana.brendanmanley.com" },
  { name: "status.brendanmanley.com", host: "status.brendanmanley.com" },
];

const STATUS_TARGETS = parseTargets();

const cache = {
  value: null,
  expiresAt: 0,
  inFlight: null,
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTarget(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    return normalizeTarget({ host: entry });
  }

  const rawHost = String(entry.host || entry.name || "").trim();
  const rawUrl = String(entry.url || "").trim();
  const url = rawUrl || (rawHost.startsWith("http://") || rawHost.startsWith("https://") ? rawHost : `https://${rawHost}`);

  try {
    const parsedUrl = new URL(url);
    const host = rawHost.replace(/^https?:\/\//, "") || parsedUrl.host;
    const name = String(entry.name || host).trim();

    if (!host || !name) {
      return null;
    }

    return {
      name,
      host,
      url: parsedUrl.toString(),
    };
  } catch {
    return null;
  }
}

function parseTargets() {
  if (process.env.STATUS_TARGETS_JSON) {
    try {
      const parsed = JSON.parse(process.env.STATUS_TARGETS_JSON);
      if (Array.isArray(parsed)) {
        const targets = parsed.map(normalizeTarget).filter(Boolean);
        if (targets.length > 0) {
          return targets;
        }
      }
    } catch (error) {
      console.warn("Failed to parse STATUS_TARGETS_JSON:", error.message);
    }
  }

  if (process.env.STATUS_TARGETS) {
    const targets = process.env.STATUS_TARGETS.split(",")
      .map((entry) => normalizeTarget(entry))
      .filter(Boolean);

    if (targets.length > 0) {
      return targets;
    }
  }

  return DEFAULT_TARGETS.map(normalizeTarget).filter(Boolean);
}

function getServingNodeName() {
  return process.env.NODE_NAME || process.env.K8S_NODE_NAME || os.hostname();
}

function getPodName() {
  return process.env.POD_NAME || process.env.HOSTNAME || os.hostname();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function requestText(urlString, options = {}) {
  const url = new URL(urlString);
  const transport = url.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: options.method || "GET",
        headers: options.headers || {},
        ca: options.ca,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${REQUEST_TIMEOUT_MS}ms`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchKubernetesNodes() {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT || "443";
  const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
  const caPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

  if (!host || !fs.existsSync(tokenPath) || !fs.existsSync(caPath)) {
    return [];
  }

  const token = fs.readFileSync(tokenPath, "utf8").trim();
  const ca = fs.readFileSync(caPath, "utf8");
  const response = await requestText(`https://${host}:${port}/api/v1/nodes`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    ca,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Kubernetes API returned ${response.statusCode}`);
  }

  const parsed = JSON.parse(response.body);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return items.map((item) => {
    const conditions = Array.isArray(item.status?.conditions) ? item.status.conditions : [];
    const readyCondition = conditions.find((condition) => condition.type === "Ready");

    return {
      name: item.metadata?.name || "unknown-node",
      ready: readyCondition?.status === "True",
    };
  });
}

async function probeTarget(target) {
  const checkedAt = new Date().toISOString();

  try {
    const response = await requestText(target.url);
    return {
      name: target.name,
      host: target.host,
      up: response.statusCode >= 200 && response.statusCode < 400,
      statusCode: response.statusCode,
      checkedAt,
    };
  } catch (error) {
    return {
      name: target.name,
      host: target.host,
      up: false,
      error: error.message,
      checkedAt,
    };
  }
}

async function buildSnapshot() {
  const warnings = [];

  const [sites, nodesResult] = await Promise.all([
    Promise.all(STATUS_TARGETS.map((target) => probeTarget(target))),
    fetchKubernetesNodes().catch((error) => {
      warnings.push(`kubernetes nodes unavailable: ${error.message}`);
      return [];
    }),
  ]);

  return {
    servedBy: getServingNodeName(),
    podName: getPodName(),
    sites,
    nodes: nodesResult,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

async function getSnapshot() {
  const now = Date.now();

  if (cache.value && now < cache.expiresAt) {
    return cache.value;
  }

  if (!cache.inFlight) {
    cache.inFlight = buildSnapshot()
      .then((snapshot) => {
        cache.value = snapshot;
        cache.expiresAt = Date.now() + CACHE_TTL_MS;
        return snapshot;
      })
      .finally(() => {
        cache.inFlight = null;
      });
  }

  try {
    return await cache.inFlight;
  } catch (error) {
    if (cache.value) {
      return {
        ...cache.value,
        stale: true,
        warnings: [...(cache.value.warnings || []), `using stale snapshot: ${error.message}`],
      };
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL." });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/status") {
    try {
      const snapshot = await getSnapshot();
      sendJson(response, 200, snapshot);
    } catch (error) {
      sendJson(response, 503, {
        error: "Unable to build cluster status snapshot.",
        message: error.message,
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, () => {
  console.log(
    `status-api listening on :${PORT} with ${STATUS_TARGETS.length} target(s); cache ttl ${CACHE_TTL_MS}ms`
  );
});
