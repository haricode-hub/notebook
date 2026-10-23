# Cloudflare deployment status

Updated: 2026-10-23

## Goal

Publish the app running in Docker on the user's Windows PC at `app.hariinfo.xyz`, with API at `api.hariinfo.xyz`, using Cloudflare Tunnel instead of a VPS.

## Completed / reported

- The domain `hariinfo.xyz` is registered at GoDaddy and was added to Cloudflare's Free plan.
- Resend reports the sending domain as verified.
- Cloudflare imported six DNS records: two parked apex A records, `_domainconnect` and `www` CNAMEs, `_dmarc` TXT, and the Resend DKIM TXT.
- GoDaddy DNS also showed `resend` and `send` CNAME records. These were missing from Cloudflare's six-record import, and the user was instructed to add them as DNS-only records. Their addition has not yet been confirmed by a screenshot.
- Cloudflare showed assigned nameservers `dina.ns.cloudflare.com` and `henrik.ns.cloudflare.com`; the user reached the Cloudflare screen saying it is waiting for nameserver propagation. This suggests the nameserver change was submitted at GoDaddy, but Cloudflare has not yet confirmed activation.

## Current status

**Waiting for Cloudflare to activate the zone after nameserver propagation.** Cloudflare's screen says this commonly takes 1–2 hours and can take up to 24 hours. The user can click **Check nameservers now**; repeated checks do not speed propagation.

## Next steps

1. Wait for the Cloudflare zone status to become **Active**. If it remains pending beyond 24 hours, check GoDaddy's nameserver settings and make sure only Cloudflare's assigned nameservers are set.
2. In Cloudflare **DNS → Records**, confirm these are present and set to **DNS only**:
   - `resend` CNAME → `resend-apne1.forge.rmta.net`
   - `send` CNAME → `send.forge.rmta.net`
   - `_dmarc` TXT and the Resend DKIM TXT record
3. Create a Cloudflare Tunnel and install/run its Windows connector on the same PC as Docker. Keep the connector token private. Add public hostnames:
   - `app.hariinfo.xyz` → `http://localhost:3000`
   - `api.hariinfo.xyz` → `http://localhost:8000`
4. Update local `.env` public URLs to:

   ```env
   BETTER_AUTH_URL=https://app.hariinfo.xyz
   WEB_ORIGIN=https://app.hariinfo.xyz
   NEXT_PUBLIC_API_URL=https://api.hariinfo.xyz
   ```

   Keep existing secrets private and verify the SMTP password is the current Resend API key.
5. From the project directory, rebuild the app containers:

   ```powershell
   docker compose up -d --build web api
   ```

6. Test `https://api.hariinfo.xyz/healthz`, then open `https://app.hariinfo.xyz` and test signup/verification email. Do not publish database, Redis, embedding, or other internal service ports through the tunnel.

## Availability note

Cloudflare Tunnel avoids router port forwarding and a VPS, but the Windows PC, Docker, and tunnel connector must remain running for the site to be reachable. This is suitable for testing, not reliable always-on hosting.
