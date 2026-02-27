# homelab-hosted-personal-site

## Homelab specs:

- 1x Raspberry Pi 5 8GB with Silicon Power 120GB M.2 SSD
- Netgear GS308E switch

## High level dataflow:

1. Browser requests DNS resolver
2. Cloudflare DNS responds with Cloudflare IP
3. Browser connects to some Cloudflare edge server
4. HTTPS handshake, cert validation, encryption of connection
5. If approved, Cloudflare forwards requests through a pre-established tunnel between Cloudflare and the homelab web server
6. Request hits dockerized Cloudflare tunnel daemon `cloudflared` in the homelab docker network
7. Daemon forwards request to dockerized nginx server in the homelab docker network
8. Response flows back through nginx, `cloudflared`, then the tunnel, then Cloudflare edge servers, then to the browser

## Load balancing soon


