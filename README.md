# CarKeeper ChatGPT MCP integration

This project connects ChatGPT to the live CarKeeper report engine.

## What it exposes

- `check_vehicle` — runs the real CarKeeper engine for a registration.
- `analyse_purchase` — runs the full CarKeeper buying report with price, advert text and optional images.
- `compare_vehicles` — runs CarKeeper on 2–5 cars and ranks them by the Buyer Score returned by the live report.
- `start_full_report_checkout` — optional/private tool that creates the existing £9.99 CarKeeper WooCommerce checkout.
- `get_report` — optional/private tool that reads status/text for an existing paid report.

The commerce tools are disabled by default because the current public Plugin Directory form says digital-goods commerce is not supported. They can still be enabled in Developer Mode for private testing.

## Architecture

ChatGPT -> MCP server -> protected CarKeeper Render endpoint -> DVLA/DVSA/Check Car Details/web/OpenAI

Optional private purchase path:
ChatGPT -> MCP server -> WordPress REST bridge -> existing WooCommerce checkout/report flow

## 1. Patch the Render report engine

Use the supplied `carkeeper-report-engine-plugin` version of the backend. It keeps `/generate-report` unchanged for the website and adds:

`POST /plugin/generate-report`

This route requires:

`Authorization: Bearer <CARKEEPER_PLUGIN_TOKEN>`

Add `CARKEEPER_PLUGIN_TOKEN` to the Render service environment.

## 2. Configure this MCP server

Copy `.env.example` to `.env` and set the SAME `CARKEEPER_PLUGIN_TOKEN` value.

For public/plugin testing, leave:

`CARKEEPER_ENABLE_COMMERCE_TOOLS=false`

## 3. Install and run

```bash
npm install
npm start
```

The MCP endpoint is:

`http://localhost:8787/mcp`

## 4. Test locally

```bash
npx @modelcontextprotocol/inspector@latest
```

Connect Inspector to `http://localhost:8787/mcp` using Streamable HTTP.

## 5. Connect to ChatGPT Developer Mode

Expose port 8787 using an HTTPS tunnel such as ngrok and use:

`https://YOUR-TUNNEL/mcp`

as the app's MCP URL.

## Optional: existing £9.99 checkout flow

Install `carkeeper-chatgpt-api.php` as a small WordPress plugin. Add this constant somewhere secure in WordPress configuration:

```php
define('CK_CHATGPT_API_TOKEN', 'a-long-random-secret');
```

Set the same value as `CARKEEPER_WP_API_TOKEN` on the MCP server and set:

`CARKEEPER_ENABLE_COMMERCE_TOOLS=true`

for private Developer Mode testing only.

The bridge uses the existing CarKeeper report creation, checkout token restoration, £9.99 WooCommerce product and paid-report storage rather than creating a second payment system.

## Security

Never commit `.env`, OpenAI keys, Check Car Details keys, DVLA keys or shared plugin tokens. Generate long random secrets for both shared tokens.
