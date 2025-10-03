# Up Banking Web App

An unofficial web application to view your Up Banking account details and transactions, with real-time updates via webhooks.

## Features

*   Secure login using your Up Banking Personal Access Token.
*   View account balances and recent transactions.
*   Click on an account to view its specific transactions.
*   Account balances can be blurred/unblurred for privacy.
*   Real-time transaction updates and toast notifications via Up Banking webhooks.
*   Automatic webhook registration on login and deletion on logout.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   [Node.js](https://nodejs.org/) (for local development, though Docker is recommended for deployment)
*   [Docker](https://www.docker.com/)
*   [Docker Compose](https://docs.docker.com/compose/)
*   [Caddy Web Server](https://caddyserver.com/) (or any other reverse proxy)
*   An [Up Banking Personal Access Token](https://api.up.com.au/getting_started/)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone <your-repo-url>
    cd up-banking-web-app
    ```

2.  **Build the Docker Image:**

    Navigate to the root of the project where the `Dockerfile` and `docker-compose.yml` are located, and run:

    ```bash
    docker-compose build
    ```

3.  **Run the Docker Container:**

    Start the application using Docker Compose. Replace `upbank.your-domain.com` with your actual public domain or subdomain where this app will be accessible.

    ```bash
    docker-compose up -d
    ```

    **Important:** The `WEBHOOK_URL` environment variable in `docker-compose.yml` must be set to the publicly accessible URL of your application's webhook endpoint (e.g., `https://upbank.your-domain.com/api/webhooks`). This is crucial for Up Banking to send webhook events to your application.

### Caddy Configuration

To expose your application to the internet and handle HTTPS, you'll need to configure Caddy as a reverse proxy. Add a new block to your Caddyfile (e.g., `/etc/Caddyfile`) similar to this:

```caddy
upbank.your-domain.com { # Replace with your chosen domain/subdomain
    encode gzip
    reverse_proxy up-web-app:3000
}
```

*   **`upbank.your-domain.com`**: Replace this with the domain or subdomain you've chosen for your Up Banking app.
*   **`up-web-app:3000`**: This tells Caddy to proxy requests to the `up-web-app` service (as defined in `docker-compose.yml`) on port `3000` within your Docker network.

After modifying your Caddyfile, reload Caddy to apply the changes:

```bash
sudo systemctl reload caddy
# Or, if Caddy is also in Docker:
docker exec <your_caddy_container_name> caddy reload --config /etc/caddy/Caddyfile
```

### Webhook Management

This application automatically manages webhooks for you:

*   **On Login:** When you log in with your API key, the application first deletes any existing webhooks associated with your account (to clean up old or orphaned webhooks) and then registers a new webhook pointing to the `WEBHOOK_URL` configured in your `docker-compose.yml`.
*   **On Logout:** When you log out, the application attempts to delete the currently registered webhook.

### Validating Webhooks

To confirm your webhook is correctly registered and active, you can use `curl` to query the Up Banking API:

```bash
curl -X GET https://api.up.com.au/api/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Replace `YOUR_API_KEY` with your Up Banking Personal Access Token. Look for a webhook entry with the `url` matching your configured `WEBHOOK_URL`.

## Development

If you want to run the application locally without Docker:

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Set environment variable:**
    ```bash
    export WEBHOOK_URL="http://localhost:3000/api/webhooks"
    # Or on Windows (Command Prompt):
    # set WEBHOOK_URL="http://localhost:3000/api/webhooks"
    # Or on Windows (PowerShell):
    # $env:WEBHOOK_URL="http://localhost:3000/api/webhooks"
    ```
3.  **Start the application:**
    ```bash
    npm start
    ```

Then, access the app at `http://localhost:3000`.
