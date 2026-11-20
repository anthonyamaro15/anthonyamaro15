// Builds nevi.svg: about.md open in Nevi, with live stars, releases and Oxc PRs.
// Run by .github/workflows/nevi.yml once a day.
// Local run: GITHUB_TOKEN=xxx node scripts/build-nevi.mjs
// Offline run with the last known numbers: FALLBACK=1 node scripts/build-nevi.mjs

import { writeFileSync } from 'node:fs';

const USER = 'anthonyamaro15';
const FALLBACK = {
  nevi: { stars: 97, version: 'v0.4.0' },
  ff: { stars: 25, version: 'v0.3.0' },
  oxcPrs: 11,
  lastPush: { repo: 'nevi', when: 'recently' },
};

// ---------- data ----------

async function gh(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function relative(date, now = new Date()) {
  const days = Math.floor((now - date) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

async function loadData() {
  if (process.env.FALLBACK) return FALLBACK;
  // each source falls back on its own, so one failed call never blanks the card
  const safe = (p, fallback) =>
    p.catch((err) => {
      console.warn(`using fallback: ${err.message}`);
      return fallback;
    });
  const repo = (name, fallback) =>
    safe(
      Promise.all([gh(`/repos/${USER}/${name}`), gh(`/repos/${USER}/${name}/releases/latest`)]).then(([r, rel]) => ({
        stars: r.stargazers_count,
        version: rel.tag_name,
      })),
      fallback
    );
  const [nevi, ff, oxcPrs, lastPush] = await Promise.all([
    repo('nevi', FALLBACK.nevi),
    repo('file-finder-rust', FALLBACK.ff),
    safe(
      gh(
        `/search/issues?q=${encodeURIComponent(`repo:oxc-project/oxc is:pr is:merged author:${USER}`)}&per_page=1`
      ).then((r) => r.total_count),
      FALLBACK.oxcPrs
    ),
    safe(
      gh(`/users/${USER}/events/public?per_page=50`).then((events) => {
        const push = events.find((e) => e.type === 'PushEvent');
        if (!push) throw new Error('no recent public push');
        return { repo: push.repo.name.replace(`${USER}/`, ''), when: relative(new Date(push.created_at)) };
      }),
      FALLBACK.lastPush
    ),
  ]);
  return { nevi, ff, oxcPrs, lastPush };
}

// ---------- content ----------
// Each line is a list of [text, class] pieces. Classes: h heading, k keyword, y string, p accent, d dim.

const list = (text) => [['- ', 'k'], [text]];
const skill = (label, items) => [[label.padEnd(12), 'k'], [items.join(' · ')]];
const project = (name, desc, version, tail, tailClass) => [
  [name.padEnd(7), 'y'],
  [desc.padEnd(38)],
  [version.padEnd(9), 'd'],
  [tail, tailClass],
];

function about(d) {
  return [
    [['# Anthony Amaro', 'h']],
    [],
    [['Software engineer at '], ['Blue Raster', 'k'], [' in Las Vegas since 2021.']],
    [['Mapping and web apps by day, fast terminal tools in Rust by night.']],
    [],
    [['## what I do', 'h']],
    list('build map-heavy web apps with React, Next.js and the ArcGIS JS API'),
    list('write APIs and services in Node and Python, deployed on AWS'),
    list('make terminal tools in Rust: a text editor and a file finder'),
    list('contribute to oxc, the Rust-based JavaScript toolchain'),
    list('build AI tooling: MCP servers, skills, plugins and custom agents'),
    [],
    [['## what I know', 'h']],
    skill('languages', ['typescript', 'rust', 'python']),
    skill('frontend', ['react', 'next.js', 'redux', 'arcgis js api']),
    skill('backend', ['node', 'express', 'postgres', 'aws']),
    skill('ai', ['claude code', 'codex', 'grok', 'gemini', 'mcp']),
    skill('tools', ['neovim', 'nevi', 'git']),
    [],
    [['## shipping', 'h']],
    project('nevi', 'terminal editor, Neovim meets Zed', d.nevi.version, `★ ${d.nevi.stars}`, 'y'),
    project('ff', 'TUI file finder', d.ff.version, `★ ${d.ff.stars}`, 'y'),
    project('oxc', 'linter diagnostics', 'merged', `${d.oxcPrs} PRs`, 'p'),
  ];
}

function tree(d) {
  return [
    ['▾ anthony/', 'k'],
    ['  ▸ nevi/', '', `★${d.nevi.stars}`, 'y'],
    ['  ▸ ff/', '', `★${d.ff.stars}`, 'y'],
    ['  ▸ oxc/', '', `${d.oxcPrs} PRs`, 'p'],
    ['  ▸ blue-raster/'],
    ['    about.md', 'act'],
    ['    links.md'],
  ];
}

// ---------- svg ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function build(d) {
  const W = 860, TITLE = 34, TREE = 200, STEP = 20, PAD = 14;
  const lines = about(d);
  const CURSOR = lines.length - 3; // the nevi line
  const bodyH = lines.length * STEP + PAD * 2;
  const statusY = TITLE + bodyH;
  const cmdY = statusY + 24;
  const H = cmdY + 28;
  const textX = TREE + 52;
  const reveal = (i) => (0.25 + i * 0.035).toFixed(2);
  const typeAt = Number(reveal(lines.length)) + 0.2;
  const hide = (t) => `<set attributeName="opacity" to="0" begin="0s" end="${t}s"/>`; // visible by default, so non-SMIL renderers show the final frame

  const buffer = lines
    .map((pieces, i) => {
      const y = TITLE + PAD + (i + 1) * STEP - 5;
      const spans = pieces.map(([t, c]) => (c ? `<tspan class="${c}">${esc(t)}</tspan>` : esc(t))).join('');
      const num = `<text x="${TREE + 38}" y="${y}" text-anchor="end" class="${i === CURSOR ? 'c' : 'd'}">${i + 1}</text>`;
      return `<g>${hide(reveal(i))}${num}<text x="${textX}" y="${y}" xml:space="preserve">${spans}</text></g>`;
    })
    .join('\n  ');

  const files = tree(d)
    .map(([label, cls, meta, metaCls], i) => {
      const y = TITLE + PAD + (i + 1) * STEP - 5;
      const bar = cls === 'act' ? `<rect x="0" y="${y - 15}" width="${TREE}" height="${STEP}" fill="#1b2129"/>` : '';
      const metaText = meta ? `<text x="${TREE - 14}" y="${y}" text-anchor="end" class="${metaCls}">${esc(meta)}</text>` : '';
      return `${bar}<text x="12" y="${y}" xml:space="preserve" class="${cls === 'act' ? 'h' : cls || ''}">${esc(label)}</text>${metaText}`;
    })
    .join('\n  ');

  const cursorY = TITLE + PAD + CURSOR * STEP;
  const stars = d.nevi.stars + d.ff.stars;
  const cmd = ':e nevi/README.md';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="about.md open in the Nevi editor. Anthony Amaro, software engineer at Blue Raster in Las Vegas. Builds mapping and web apps with React, Next.js and ArcGIS, APIs in Node and Python on AWS, and terminal tools in Rust. Builds AI tooling: MCP servers, skills, plugins and custom agents. Knows TypeScript, Rust and Python, React, Next.js, Redux, ArcGIS, Node, Express, Postgres, AWS, Claude Code, Codex, Grok and Gemini. Projects: Nevi ${d.nevi.version} with ${d.nevi.stars} stars, ff ${d.ff.version} with ${d.ff.stars} stars, ${d.oxcPrs} merged PRs in Oxc.">
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 13px; fill: #c9d1d9; }
    .h { fill: #7ee7c7; font-weight: bold; } .k { fill: #79c0ff; } .y { fill: #e3b341; } .p { fill: #d2a8ff; }
    .d { fill: #4b5563; } .c { fill: #c9d1d9; } .m { fill: #0b0e13; font-weight: bold; } .s { fill: #8b949e; font-size: 12px; }
  </style>
  <defs>
    <clipPath id="type"><rect x="0" y="${cmdY}" height="28" width="${W}"><set attributeName="width" to="0" begin="0s" end="${typeAt.toFixed(2)}s"/><animate attributeName="width" from="12" to="${12 + (cmd.length + 1) * 10}" begin="${typeAt.toFixed(2)}s" dur="0.6s" fill="freeze"/></rect></clipPath>
    <clipPath id="win"><rect width="${W}" height="${H}" rx="10"/></clipPath>
  </defs>

  <g clip-path="url(#win)">
  <rect width="${W}" height="${H}" fill="#0f1218"/>
  <rect width="${W}" height="${TITLE}" fill="#0b0e13"/>
  <rect y="${TITLE}" width="${TREE}" height="${bodyH}" fill="#0b0e13"/>
  <line x1="${TREE + 0.5}" y1="${TITLE}" x2="${TREE + 0.5}" y2="${statusY}" stroke="#30363d"/>
  <line x1="0" y1="${TITLE - 0.5}" x2="${W}" y2="${TITLE - 0.5}" stroke="#30363d"/>
  <circle cx="20" cy="17" r="5.5" fill="#ff5f57"/><circle cx="38" cy="17" r="5.5" fill="#febc2e"/><circle cx="56" cy="17" r="5.5" fill="#28c840"/>
  <text x="80" y="21" class="s">nevi · ~/anthony/about.md</text>

  ${files}

  <rect x="${TREE + 1}" y="${cursorY}" width="${W - TREE - 1}" height="${STEP}" fill="#1b2129"/>
  ${buffer}

  <rect y="${statusY}" width="${W}" height="22" fill="#1b2129"/>
  <rect y="${statusY}" width="72" height="22" fill="#7ee7c7"/>
  <text x="36" y="${statusY + 15}" text-anchor="middle" class="m">NORMAL</text>
  <text x="86" y="${statusY + 15}" class="s">about.md</text>
  <text x="${W - 12}" y="${statusY + 15}" text-anchor="end" class="s" xml:space="preserve">★ ${stars}   last push: ${esc(d.lastPush.repo)} · ${esc(d.lastPush.when)}   ${CURSOR + 1}:1</text>

  <text x="12" y="${cmdY + 18}" clip-path="url(#type)" xml:space="preserve">${esc(cmd)}<tspan>█<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" begin="${(typeAt + 0.6).toFixed(2)}s" repeatCount="indefinite"/></tspan></text>
  </g>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="#30363d"/>
</svg>
`;
}

const data = await loadData();
writeFileSync(new URL('../nevi.svg', import.meta.url), build(data));
console.log('nevi.svg written', JSON.stringify(data));
