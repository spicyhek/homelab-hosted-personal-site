# homelab-hosted-personal-site

My website that is hosted on my homelab and deployed through a separate infrastructure repo.

## Layout

- `site/`: static homepage assets served by `nginx`
- `status-api/`: Kubernetes-aware API that the homepage server status section uses

The site expects a same-origin `GET /api/status` endpoint. 