# RENEWD project timeline widget

Branded pre-SPA → COD timeline, embedded in Notion.

- **Edit data:** Notion → RENEWD Project Timelines → Projects / Milestones databases.
- **Widget link:** `https://rael8888.github.io/BESS-Projects-Repository/timeline/?project=<Code>`
- **Sync:** `.github/workflows/timeline-sync.yml` runs every 30 min (or on demand from the Actions tab), reads Notion and rewrites `timeline/data.json`. Only projects with **Publish to widget** ticked are exported.

## One-time setup (sync)
1. notion.so/profile/integrations → New internal integration "RENEWD Timeline Sync" (read content only). Copy the secret.
2. In Notion, open the "RENEWD Project Timelines" page → ••• → Connections → add "RENEWD Timeline Sync".
3. GitHub repo → Settings → Secrets and variables → Actions → New secret `NOTION_TOKEN` = the integration secret.
4. Actions tab → "Timeline sync from Notion" → Run workflow.

This repo and its Pages site are public: anyone with the link can read `data.json`. Untick "Publish to widget" for confidential deals.
