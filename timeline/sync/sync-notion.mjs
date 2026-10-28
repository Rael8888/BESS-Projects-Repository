// Pulls RENEWD project timelines from Notion and writes timeline/data.json.
// Runs in GitHub Actions (see .github/workflows/timeline-sync.yml).
// Needs: NOTION_TOKEN (secret), PROJECTS_DS and MILESTONES_DS (data source ids).
import { writeFile, readFile } from "node:fs/promises";

const TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DS = process.env.PROJECTS_DS;
const MILESTONES_DS = process.env.MILESTONES_DS;
const OUT = new URL("../data.json", import.meta.url);
if (!TOKEN || !PROJECTS_DS || !MILESTONES_DS) {
  console.error("Missing NOTION_TOKEN, PROJECTS_DS or MILESTONES_DS");
  process.exit(1);
}

async function queryAll(dsId) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dsId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, (+res.headers.get("retry-after") || 2) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
    const j = await res.json();
    rows.push(...j.results.filter(r => !r.in_trash && !r.archived));
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const txt = p => (p?.title ?? p?.rich_text ?? []).map(t => t.plain_text).join("").trim();
const sel = p => p?.select?.name ?? p?.status?.name ?? "";
const chk = p => !!p?.checkbox;
const rel = p => (p?.relation ?? []).map(r => r.id.replace(/-/g, ""));
const num = p => (typeof p?.number === "number" ? p.number : null);
const id = s => s.replace(/-/g, "");

const STATUS = { "Done": "done", "On track": "ontrack", "At risk": "risk", "Blocked": "blocked", "Not started": "not" };
const LANE = { "Commercial": "commercial", "Due diligence": "dd", "Permitting": "permit", "Grid": "grid", "Finance": "finance", "Procurement": "proc", "Build & COD": "build" };

const [projects, milestones] = await Promise.all([queryAll(PROJECTS_DS), queryAll(MILESTONES_DS)]);

const out = { generated: new Date().toISOString(), projects: {} };
const byPid = {};
for (const p of projects) {
  const P = p.properties;
  if (!chk(P["Publish to widget"])) continue;
  const code = (txt(P["Code"]) || id(p.id)).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const mw = num(P["Power MW"]), mwh = num(P["Energy MWh"]);
  byPid[id(p.id)] = out.projects[code] = {
    name: txt(P["Name"]),
    capacity: mw && mwh ? `${mw} MW / ${mwh} MWh` : mw ? `${mw} MW` : "",
    location: txt(P["Location"]),
    summary: txt(P["Summary"]),
    stage: sel(P["Stage"]),
    sample: chk(P["Sample"]),
    items: [],
  };
}

for (const m of milestones) {
  const P = m.properties;
  const date = P["Dates"]?.date;
  if (!date?.start) continue;
  const lane = LANE[sel(P["Workstream"])];
  if (!lane) continue;
  const gate = sel(P["Type"]) === "Gate" || !date.end;
  for (const pid of rel(P["Project"])) {
    const proj = byPid[pid];
    if (!proj) continue;
    proj.items.push({
      id: id(m.id),
      lane,
      name: txt(P["Name"]),
      s: date.start.slice(0, 10),
      ...(gate ? { gate: 1 } : { e: date.end.slice(0, 10) }),
      ...(chk(P["Major gate"]) ? { major: 1 } : {}),
      st: STATUS[sel(P["Status"])] ?? "not",
      ph: sel(P["Phase"]) === "Pre-SPA" ? "pre" : "impl",
      own: txt(P["Owner"]),
      ...(chk(P["Critical path"]) ? { crit: 1 } : {}),
      dep: rel(P["Depends on"]),
      note: txt(P["Note"]),
      url: m.url,
    });
  }
}

// Only write when content changed (ignore the timestamp) to avoid noise commits.
let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
if (prev && JSON.stringify(prev.projects) === JSON.stringify(out.projects)) {
  console.log("No changes.");
} else {
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${Object.keys(out.projects).length} project(s).`);
}
