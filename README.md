# Up Banking Web App

An unofficial web application to view your Up Banking account details and transactions, with real-time updates via webhooks.

## Features

- Secure login using your Up Banking Personal Access Token
- View all account balances (including 2Up joint accounts)
- Click an account to view its transactions, grouped by date
- Filter transactions by status (settled/pending), date range, category, or tag
- Paginated transaction loading — 50 at a time with a "Load more" button
- Transaction detail panel showing category, card method, foreign amounts, round-ups, cashback, and sender name
- Real-time transaction updates and toast notifications via Up Banking webhooks
- Toast notifications show merchant name and amount, auto-dismiss after 4 seconds
- Automatic webhook registration on login and deletion on logout
- Session auto-expires after 10 minutes

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (for local development)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Caddy](https://caddyserver.com/) or another reverse proxy (for production)
- An [Up Banking Personal Access Token](https://api.up.com.au/getting_started/)

### Installation

1. **Clone the repository:**

    ```bash
    git clone <your-repo-url>
    cd up-banking-web-app
    ```

2. **Build the Docker image:**

    ```bash
    docker-compose build
    ```

3. **Configure environment variables in `docker-compose.yml`:**

    | Variable | Required | Description |
    |----------|----------|-------------|
    | `WEBHOOK_URL` | Optional | Publicly accessible HTTPS URL for webhook delivery (e.g. `https://upbank.your-domain.com/api/webhooks`). Must be HTTPS — HTTP or localhost URLs are ignored. |
    | `SESSION_SECRET` | Recommended | Secret used to sign session cookies. Defaults to a hardcoded string if not set. |

4. **Start the container:**

    ```bash
    docker-compose up -d
    ```

### Caddy Configuration

Add a block to your Caddyfile to proxy requests to the container:

```caddy
upbank.your-domain.com {
    encode gzip
    reverse_proxy up-web-app:3000
}
```

Reload Caddy after editing:

```bash
sudo systemctl reload caddy
# or if Caddy is also in Docker:
docker exec <caddy_container> caddy reload --config /etc/caddy/Caddyfile
```

### Webhook Management

- **On login:** any existing webhooks pointing to `WEBHOOK_URL` are deleted, then a fresh one is registered. The secret key returned at registration is stored server-side and used to verify the HMAC-SHA256 signature on all incoming webhook requests.
- **On logout:** the registered webhook is deleted and the session is cleared.
- Webhooks are only registered when `WEBHOOK_URL` is set to a valid public HTTPS address. Running locally without a tunnel means real-time updates won't work, but all other functionality is unaffected.

To confirm your webhook is active:

```bash
curl -X GET https://api.up.com.au/api/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Local Development

```bash
npm install
npm start
# App available at http://localhost:3000
```

Webhooks require a publicly reachable HTTPS URL (e.g. via [ngrok](https://ngrok.com/)). Without one, real-time updates are simply disabled — the rest of the app works normally.
