# ledger-go

ledger-go is a Cloudflare Worker. It counts the clicks on the wiki links in the Adventurer's Ledger. Then it sends the visitor to the wiki page.

## What the Worker records

The Worker records three values for each click:

- the UTC day
- the wiki page title
- the number of clicks

The Worker does not read or keep an IP address, a cookie, a referrer or a user agent.

If the database fails, the Worker still sends the visitor to the wiki page. A database failure does not break a link.

## Addresses

| Address | Result |
|---|---|
| `/wiki/<page title>` | Adds one click for today and that page. Sends a 302 redirect to `ffxiv.consolegameswiki.com`. |
| `/stats` | Returns the clicks of the last 30 days as JSON. Requires the `STATS_KEY` secret. Without the secret, the address returns 404. |

The Worker sends visitors to `ffxiv.consolegameswiki.com` only. It refuses all other paths.

## Deploy the Worker for the first time

Prerequisites:

- A Cloudflare account with a `workers.dev` subdomain.
- A completed `npx wrangler login` on this PC.

Procedure:

1. Open a terminal in `tools/go-worker`.
2. Create the database:

   ```bash
   npx wrangler d1 create ledger-go
   ```

3. Copy the `database_id` value from the output into `wrangler.toml`.
4. Create the table:

   ```bash
   npx wrangler d1 execute ledger-go --remote --file schema.sql
   ```

5. Set the key for the stats address. Type a long random value when Wrangler asks for it:

   ```bash
   npx wrangler secret put STATS_KEY
   ```

6. Deploy the Worker:

   ```bash
   npx wrangler deploy
   ```

7. Copy the Worker address from the output. The address has the form `https://ledger-go.<subdomain>.workers.dev`.
8. In `journey.js`, set `WIKI_GO_BASE` to that address. Do not add a slash at the end.
9. In `index.html`, under "How this works", add this text after the first paragraph: "A wiki link in Story goes through the Ledger's click counter. The counter records the wiki page and the day. It records nothing about you."

## Move to go.legendmemoria.org

Do this procedure after the legendmemoria.org DNS moves to Cloudflare.

1. In the Cloudflare dashboard, open the Worker. Add the custom domain `go.legendmemoria.org`.
2. In `journey.js`, set `WIKI_GO_BASE` to `https://go.legendmemoria.org`.

CAUTION: Keep the DNS records for GitHub Pages as "DNS only" (grey cloud). If Cloudflare proxies those records, GitHub cannot issue the HTTPS certificate for the site.

The `workers.dev` address continues to operate after the move.

## Read the counts

Run this command. Replace `<key>` with the `STATS_KEY` value:

```bash
curl -H "Authorization: Bearer <key>" https://ledger-go.<subdomain>.workers.dev/stats
```
