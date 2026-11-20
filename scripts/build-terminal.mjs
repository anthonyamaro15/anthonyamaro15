// Builds terminal.svg, a neofetch-style card with live GitHub data.
// Run by .github/workflows/terminal.yml once a day.
// Local run: GITHUB_TOKEN=xxx node scripts/build-terminal.mjs
// Offline run with the last known numbers: FALLBACK=1 node scripts/build-terminal.mjs

import { writeFileSync } from "node:fs";

const USER = "anthonyamaro15";
const CAREER_START = new Date("2021-03-01"); // started at Blue Raster
const FALLBACK = { nevi: 97, ff: 25, oxcPrs: 11, lastPush: { repo: "nevi", when: "recently" } };

// ---------- data ----------

async function gh(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": USER };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function relative(date, now = new Date()) {
  const days = Math.floor((now - date) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

function uptime(now = new Date()) {
  const months = (now.getUTCFullYear() - CAREER_START.getUTCFullYear()) * 12 + (now.getUTCMonth() - CAREER_START.getUTCMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = `${y} year${y === 1 ? "" : "s"}`;
  return m ? `${ys}, ${m} month${m === 1 ? "" : "s"}` : ys;
}

async function loadData() {
  if (process.env.FALLBACK) return FALLBACK;
  // each source falls back on its own, so one failed call never blanks the card
  const safe = (p, fallback) =>
    p.catch((err) => {
      console.warn(`using fallback: ${err.message}`);
      return fallback;
    });
  const [nevi, ff, oxcPrs, lastPush] = await Promise.all([
    safe(gh(`/repos/${USER}/nevi`).then((r) => r.stargazers_count), FALLBACK.nevi),
    safe(gh(`/repos/${USER}/file-finder-rust`).then((r) => r.stargazers_count), FALLBACK.ff),
    safe(
      gh(`/search/issues?q=${encodeURIComponent(`repo:oxc-project/oxc is:pr is:merged author:${USER}`)}&per_page=1`).then((r) => r.total_count),
      FALLBACK.oxcPrs,
    ),
    safe(
      gh(`/users/${USER}/events/public?per_page=50`).then((events) => {
        const push = events.find((e) => e.type === "PushEvent");
        if (!push) throw new Error("no recent public push");
        return { repo: push.repo.name.replace(`${USER}/`, ""), when: relative(new Date(push.created_at)) };
      }),
      FALLBACK.lastPush,
    ),
  ]);
  return { nevi, ff, oxcPrs, lastPush };
}

// ---------- svg ----------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ART = [
  " █████╗  █████╗ ",
  "██╔══██╗██╔══██╗",
  "███████║███████║",
  "██╔══██║██╔══██║",
  "██║  ██║██║  ██║",
  "╚═╝  ╚═╝╚═╝  ╚═╝",
];
const ART_COLORS = ["#7ee787", "#56d4b0", "#56c8d8", "#79c0ff", "#a5b4fc", "#d2a8ff"];
const PALETTE = ["#ff7b72", "#ffa657", "#e3b341", "#7ee787", "#56d4dd", "#79c0ff", "#d2a8ff", "#e6edf3"];

function prompt(cmd, cursor = false) {
  const tail = cursor
    ? `<tspan class="c">█<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" begin="CURSOR_BEGIN" repeatCount="indefinite"/></tspan>`
    : `<tspan class="c">${esc(cmd)}</tspan>`;
  return `<tspan class="u">anthony@vegas</tspan><tspan class="s">:</tspan><tspan class="d">~</tspan><tspan class="s">$ </tspan>${tail}`;
}

function build(d) {
  const W = 860;
  const info = [
    ["role", "software engineer @ Blue Raster"],
    ["location", "las vegas, nv"],
    ["uptime", uptime()],
    ["editor", "neovim, nevi"],
    ["terminal", "warp"],
    ["langs", "typescript, rust, python"],
    ["stack", "react, next.js, node, aws"],
    ["ai", "claude code, codex"],
    ["oss", `oxc · <tspan class="p">${d.oxcPrs} merged PRs</tspan>`, true],
    ["stars", `nevi <tspan class="y">★ ${d.nevi}</tspan> · ff <tspan class="y">★ ${d.ff}</tspan>`, true],
    ["last push", `${esc(d.lastPush.repo)} · ${esc(d.lastPush.when)}`, true],
  ];

  const INFO_X = 290;
  const TOP = 108;
  const STEP = 22;
  const REVEAL = 1.3; // seconds, when the neofetch output starts appearing
  const lines = [];

  lines.push(`<text x="${INFO_X}" y="${TOP}" xml:space="preserve"><tspan class="u b">anthony</tspan><tspan class="s">@</tspan><tspan class="d b">vegas</tspan></text>`);
  lines.push(`<text x="${INFO_X}" y="${TOP + STEP}" class="s">-------------</text>`);
  info.forEach(([k, v, raw], i) => {
    const value = raw ? v : esc(v);
    lines.push(`<text x="${INFO_X}" y="${TOP + STEP * (i + 2)}" xml:space="preserve"><tspan class="k">${k}</tspan><tspan class="s">: </tspan><tspan class="o">${value}</tspan></text>`);
  });

  const paletteY = TOP + STEP * (info.length + 2) + 4;
  const swatches = PALETTE.map((c, i) => `<rect x="${INFO_X + i * 26}" y="${paletteY}" width="24" height="14" rx="2" fill="${c}"/>`).join("");

  const artTop = TOP + 82; // centers the monogram against the info column
  const art = ART.map((row, i) => `<text x="28" y="${artTop + i * 25}" class="a" fill="${ART_COLORS[i]}" xml:space="preserve">${row}</text>`).join("\n    ");

  // stagger each info line in after the command is typed
  const staggered = lines
    .map((l, i) => `<g opacity="0"><set attributeName="opacity" to="1" begin="${(REVEAL + 0.06 * i).toFixed(2)}s" fill="freeze"/>${l}</g>`)
    .join("\n  ");

  const outEnd = REVEAL + 0.06 * lines.length;
  const cursorY = paletteY + 50;
  const H = cursorY + 26;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Terminal running neofetch for Anthony Amaro: software engineer at Blue Raster, ${d.oxcPrs} merged PRs into Oxc, Nevi ${d.nevi} stars, ff ${d.ff} stars.">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 15px; }
    .a { font-size: 22px; }
    .u { fill: #7ee787; } .d { fill: #79c0ff; } .s { fill: #8b949e; } .c { fill: #e6edf3; }
    .o { fill: #c9d1d9; } .k { fill: #79c0ff; font-weight: bold; } .p { fill: #d2a8ff; } .y { fill: #e3b341; }
    .b { font-weight: bold; }
  </style>
  <defs>
    <clipPath id="type"><rect x="0" y="52" height="26" width="0"><animate attributeName="width" from="0" to="300" begin="0.3s" dur="0.7s" fill="freeze"/></rect></clipPath>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="#0d1117" stroke="#30363d"/>
  <path d="M10.5 0.5h${W - 21}a10 10 0 0 1 10 10v26h-${W - 1}v-26a10 10 0 0 1 10-10z" fill="#161b22"/>
  <line x1="0.5" y1="36.5" x2="${W - 0.5}" y2="36.5" stroke="#30363d"/>
  <circle cx="22" cy="18.5" r="6" fill="#ff5f57"/>
  <circle cx="42" cy="18.5" r="6" fill="#febc2e"/>
  <circle cx="62" cy="18.5" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="23" text-anchor="middle" class="s" style="font-size:13px">anthony@vegas: ~</text>

  <text x="24" y="70" clip-path="url(#type)" xml:space="preserve">${prompt("neofetch")}</text>

  <g opacity="0"><set attributeName="opacity" to="1" begin="${REVEAL}s" fill="freeze"/>
    ${art}
  </g>
  ${staggered}
  <g opacity="0"><set attributeName="opacity" to="1" begin="${outEnd.toFixed(2)}s" fill="freeze"/>${swatches}</g>

  <g opacity="0"><set attributeName="opacity" to="1" begin="${(outEnd + 0.3).toFixed(2)}s" fill="freeze"/>
    <text x="24" y="${cursorY}" xml:space="preserve">${prompt("", true).replace("CURSOR_BEGIN", `${(outEnd + 0.3).toFixed(2)}s`)}</text>
  </g>
</svg>
`;
}

const data = await loadData();
writeFileSync(new URL("../terminal.svg", import.meta.url), build(data));
console.log("terminal.svg written", data);
