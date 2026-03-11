# Status API

This service exposes the homepage status payload at `GET /api/status`.

## Response contract

```json
{
  "servedBy": "kube-node-2",
  "podName": "site-status-api-6bb4d89d7f-abcde",
  "sites": [
    {
      "name": "brendanmanley.com",
      "host": "brendanmanley.com",
      "up": true,
      "statusCode": 200,
      "checkedAt": "2026-03-10T00:00:00.000Z"
    }
  ],
  "nodes": [
    { "name": "kube-node-1", "ready": true },
    { "name": "kube-node-2", "ready": true },
    { "name": "kube-node-3", "ready": false }
  ],
  "generatedAt": "2026-03-10T00:00:00.000Z",
  "warnings": []
}
```

`servedBy` is the Kubernetes node running the API pod that answered the request. Its value can change between page loads

## Configuration of `server.js`

- `PORT`: listener port, default `3000`
- `CACHE_TTL_MS`: in-memory cache TTL for probes and node data, default `30000`
- `REQUEST_TIMEOUT_MS`: outbound request timeout, default `5000`
- `NODE_NAME`: inject from the Downward API so `servedBy` reflects the current Kubernetes node
- `POD_NAME`: optional pod name for debugging
- `STATUS_TARGETS_JSON`: JSON array of `{ "name": "...", "host": "...", "url": "..." }`
- `STATUS_TARGETS`: comma-separated fallback if JSON is not provided

If neither `STATUS_TARGETS_JSON` nor `STATUS_TARGETS` is set, the service probes all subdomains of the site (grafana.brendanmanley.com, status.brendanmanley.com etc)