const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const admin  = require('firebase-admin');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios  = require('axios');

const DISCORD_TOKEN      = '';
const IGDB_CLIENT_ID     = '';
const IGDB_CLIENT_SECRET = '';

const E = {
  logy  : '',
  gg    : '',
  mad   : '',
  think : '',
  love  : '',
  photo : '',
};

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});


const VERDICTS_HIGH = [
  'An undeniable masterpiece. Drop everything and play it now.',
  'This is what peak gaming looks like. No excuses for skipping it.',
  'Generational title. If you haven\'t played this yet, what are you doing?',
  'One of the greats. The scores don\'t lie and neither does Logy.',
  'Flawless execution. This is the benchmark everything else is judged by.',
];

const VERDICTS_GOOD = [
  'Solid entry. More than worth your time — don\'t sleep on it.',
  'Strong title. Some rough edges, but the core experience delivers.',
  'Genuinely enjoyable. A reliable pick for any gaming session.',
  'Well-crafted and satisfying. Earns its reputation.',
  'Does what it promises and then some. Recommended.',
];

const VERDICTS_MID = [
  'Decent, but won\'t blow your mind. Good for genre fans.',
  'Has its moments, but doesn\'t fully stick the landing.',
  'Playable. Just don\'t go in expecting a revelation.',
  'Middle of the road. Your mileage will vary.',
  'Some good ideas buried under mediocre execution.',
];

const VERDICTS_LOW = [
  'Approach with caution. The scores tell the whole story.',
  'Not Logy\'s recommendation. There are better options.',
  'Hard pass unless you\'re a die-hard fan of the franchise.',
  'Disappointing. The potential was there — the follow-through wasn\'t.',
  'Save your time. The gaming backlog calls.',
];

const SUGGEST_REASONS = [
  (name, genre) => `If you haven't experienced ${name} yet, you're missing one of ${genre || 'gaming'}'s finest moments.`,
  (name, genre) => `${name} hits different — it's the kind of game that stays with you long after the credits roll.`,
  (name, genre) => `Right now is the perfect time to dive into ${name} — the ${genre || 'gaming'} community is still talking about it.`,
  (name, genre) => `${name} is the answer if you've been looking for your next obsession. Trust the algorithm.`,
  (name, genre) => `Don't let ${name} sit in your backlog any longer. This one is worth every minute.`,
];

function getVerdict(score) {
  const pool = score >= 88 ? VERDICTS_HIGH
             : score >= 75 ? VERDICTS_GOOD
             : score >= 60 ? VERDICTS_MID
                           : VERDICTS_LOW;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getSuggestionReason(gameName, genre) {
  const fn = SUGGEST_REASONS[Math.floor(Math.random() * SUGGEST_REASONS.length)];
  return fn(gameName, genre);
}

let _token = null, _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const r = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`
  );
  _token = r.data.access_token;
  _tokenExpiry = Date.now() + (r.data.expires_in - 120) * 1000;
  return _token;
}

async function igdb(endpoint, query) {
  const t = await getToken();
  const r = await axios.post(`https://api.igdb.com/v4/${endpoint}`, query, {
    headers: { 'Client-ID': IGDB_CLIENT_ID, Authorization: `Bearer ${t}` },
  });
  return r.data;
}

const GENRE_MAP = {
  action: '5,25,31', rpg: '12', shooter: '5', fps: '5', racing: '10',
  sport: '14', sports: '14', strategy: '11,15,16', fighting: '4',
  platform: '8', puzzle: '9', simulator: '13', indie: '32',
  horror: '19', adventure: '31', mmo: '36', sandbox: '33', vn: '34',
};

const FIELDS_FULL  = 'name, rating, rating_count, summary, genres.name, first_release_date, cover.image_id, platforms.name, involved_companies.company.name, involved_companies.developer, url';
const FIELDS_LIGHT = 'name, rating, cover.image_id, genres.name, first_release_date';

const RANKS = [
  { min:   0, label: 'ROOKIE',    color: '#9E9E9E' },
  { min:  10, label: 'BRONZE',    color: '#CD7F32' },
  { min:  25, label: 'SILVER',    color: '#C0C0C0' },
  { min:  50, label: 'GOLD',      color: '#FFD700' },
  { min: 100, label: 'PLATINUM',  color: '#00E5FF' },
  { min: 200, label: 'DIAMOND',   color: '#B388FF' },
  { min: 500, label: 'LEGENDARY', color: '#FF6D00' },
];
const getRank = n => RANKS.slice().reverse().find(r => n >= r.min) || RANKS[0];

const cooldowns = new Map();
function checkCD(uid, cmd, ms = 4000) {
  const k = `${uid}:${cmd}`, now = Date.now();
  if (cooldowns.has(k) && now - cooldowns.get(k) < ms)
    return Math.ceil((ms - (now - cooldowns.get(k))) / 1000);
  cooldowns.set(k, now);
  return 0;
}

function rr(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

const glow   = (ctx, c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b; };
const noGlow = ctx => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; };

function hex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
            : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function neonLine(ctx, x1, y1, x2, y2, col, lw = 1, blur = 6) {
  ctx.save();
  glow(ctx, col, blur);
  ctx.strokeStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

function dots(ctx, W, H, col = 'rgba(0,212,255,0.055)', sp = 32) {
  for (let x = sp; x < W; x += sp)
    for (let y = sp; y < H; y += sp) {
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    }
}

function scanlines(ctx, W, H) {
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.055)';
    ctx.fillRect(0, y, W, 2);
  }
}

function accentBar(ctx, H, col = '#00D4FF') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, col + '00'); g.addColorStop(0.5, col); g.addColorStop(1, col + '00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, H);
}

function chip(ctx, x, y, text, col, h = 24) {
  ctx.font = 'bold 11px monospace';
  const tw = ctx.measureText(text).width;
  const cw = tw + 22;
  rr(ctx, x, y, cw, h, 5);
  ctx.fillStyle = col + '22'; ctx.fill();
  rr(ctx, x, y, cw, h, 5);
  ctx.strokeStyle = col + '60'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); glow(ctx, col, 4);
  ctx.fillStyle = col; ctx.textAlign = 'left';
  ctx.fillText(text, x + 11, y + h * 0.68);
  noGlow(ctx); ctx.restore();
  return cw + 8;
}

function scoreRing(ctx, cx, cy, r, score, col) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 9; ctx.stroke();
  if (score > 0) {
    ctx.save(); glow(ctx, col, 18);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (score / 100) * Math.PI * 2);
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
    noGlow(ctx); ctx.restore();
  }
  ctx.save(); glow(ctx, '#fff', 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
  ctx.fillText(score > 0 ? String(score) : '?', cx, cy + 10);
  noGlow(ctx); ctx.restore();
  ctx.fillStyle = 'rgba(160,170,200,0.6)'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('/100', cx, cy + 28);
}

function wrap(ctx, text, x, y, maxW, lh, maxL = 99) {
  const words = text.split(' ');
  let line = '', count = 0;
  for (const w of words) {
    const t = line + w + ' ';
    if (ctx.measureText(t).width > maxW && line) {
      if (count >= maxL) { ctx.fillText(line.trim() + '...', x, y + count * lh); return count + 1; }
      ctx.fillText(line.trim(), x, y + count * lh);
      line = w + ' '; count++;
    } else line = t;
  }
  if (count < maxL) ctx.fillText(line.trim(), x, y + count * lh);
  return count + 1;
}

function footer(ctx, W, H) {
  ctx.fillStyle = 'rgba(0,212,255,0.18)';
  ctx.font = '10px monospace'; ctx.textAlign = 'right';
  ctx.fillText('LOGARY INTELLIGENCE  v4.1', W - 16, H - 10);
}

async function loadImg(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

const scoreCol = s => s >= 85 ? '#00E676' : s >= 70 ? '#FFD700' : s >= 55 ? '#FF9800' : '#FF5252';

async function setupBg(ctx, W, H, bannerUrl, darkFactor = 0.88) {
  const img = bannerUrl ? await loadImg(bannerUrl) : null;
  if (img) {
    ctx.drawImage(img, 0, 0, W, H);
    const ov = ctx.createLinearGradient(0, 0, W, H);
    ov.addColorStop(0, `rgba(3,3,10,${darkFactor})`);
    ov.addColorStop(1, `rgba(5,5,16,${Math.min(darkFactor + 0.05, 1)})`);
    ctx.fillStyle = ov; ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#04040D');
    bg.addColorStop(0.5, '#080815');
    bg.addColorStop(1, '#050510');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }
}

function cornerBrackets(ctx, x, y, w, h, col, size = 20) {
  ctx.save(); glow(ctx, col, 8);
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  [[x, y, 1, 1],[x+w, y, -1, 1],[x, y+h, 1, -1],[x+w, y+h, -1, -1]].forEach(([px, py, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(px + dx * size, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * size);
    ctx.stroke();
  });
  noGlow(ctx); ctx.restore();
}

function sectionTag(ctx, x, y, text, col) {
  ctx.font = 'bold 11px monospace';
  const tw = ctx.measureText(text).width;
  const cw = tw + 28;
  rr(ctx, x, y, cw, 28, 6);
  const g = ctx.createLinearGradient(x, 0, x + cw, 0);
  g.addColorStop(0, col + '30'); g.addColorStop(1, col + '08');
  ctx.fillStyle = g; ctx.fill();
  rr(ctx, x, y, cw, 28, 6);
  ctx.strokeStyle = col + '50'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); glow(ctx, col, 8);
  ctx.fillStyle = col; ctx.textAlign = 'left';
  ctx.fillText(text, x + 14, y + 18.5);
  noGlow(ctx); ctx.restore();
}

function statBar(ctx, x, y, w, h, pct, col) {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  if (pct > 0) {
    rr(ctx, x, y, w * Math.min(pct, 1), h, h / 2);
    ctx.save(); glow(ctx, col, 6);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, col); g.addColorStop(1, col + 'AA');
    ctx.fillStyle = g; ctx.fill(); noGlow(ctx); ctx.restore();
  }
}

function grain(ctx, W, H, alpha = 0.025) {
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * W, y = Math.random() * H, b = Math.random() * 255 | 0;
    ctx.fillStyle = `rgb(${b},${b},${b})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}
async function drawProfile(userData, stats) {
  const W = 1000, H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  await setupBg(ctx, W, H, userData.profileBanner, 0.86);
  dots(ctx, W, H);
  grain(ctx, W, H);

  const chrome = ctx.createLinearGradient(0, 0, W, 0);
  chrome.addColorStop(0, 'rgba(0,212,255,0.08)');
  chrome.addColorStop(0.5, 'rgba(0,212,255,0.04)');
  chrome.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.fillStyle = chrome; ctx.fillRect(0, 0, W, 70);
  neonLine(ctx, 0, 70, W, 70, 'rgba(0,212,255,0.15)', 1, 5);

  accentBar(ctx, H);

  const rightGlow = ctx.createRadialGradient(W, 0, 0, W, 0, 400);
  rightGlow.addColorStop(0, 'rgba(170,68,255,0.08)');
  rightGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = rightGlow; ctx.fillRect(0, 0, W, H);

  ctx.save(); ctx.globalAlpha = 0.03;
  ctx.fillStyle = '#00D4FF'; ctx.font = 'bold 160px monospace'; ctx.textAlign = 'right';
  ctx.fillText('LG', W - 10, H + 10); ctx.restore();

  const rank     = getRank(stats.totalGames);
  const nextRank = RANKS.find(r => r.min > stats.totalGames);
  sectionTag(ctx, W - 190, 20, `[ ${rank.label} ]`, rank.color);

  const AX = 105, AY = 250, AR = 80;
  const avi = await loadImg(userData.avatar || 'https://via.placeholder.com/160');

  [AR + 22, AR + 14].forEach((r, i) => {
    hex(ctx, AX, AY, r);
    ctx.strokeStyle = rank.color + (i === 0 ? '18' : '30');
    ctx.lineWidth = 1; ctx.stroke();
  });

  ctx.save(); hex(ctx, AX, AY, AR); ctx.clip();
  if (avi) ctx.drawImage(avi, AX - AR, AY - AR, AR * 2, AR * 2);
  else { ctx.fillStyle = '#101020'; ctx.fill(); }
  ctx.restore();

  ctx.save(); glow(ctx, rank.color, 20);
  hex(ctx, AX, AY, AR);
  ctx.strokeStyle = rank.color; ctx.lineWidth = 3; ctx.stroke();
  noGlow(ctx); ctx.restore();

  ctx.save(); glow(ctx, rank.color, 16);
  ctx.beginPath(); ctx.arc(AX, AY + AR + 16, 7, 0, Math.PI * 2);
  ctx.fillStyle = rank.color; ctx.fill(); noGlow(ctx); ctx.restore();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(AX, AY + AR + 16, 3, 0, Math.PI * 2); ctx.fill();

  const uname  = userData.username || 'Unknown';
  const ucolor = userData.usernameColor || '#FFFFFF';
  ctx.save(); glow(ctx, ucolor, 14);
  ctx.fillStyle = ucolor; ctx.font = 'bold 42px monospace'; ctx.textAlign = 'left';
  ctx.fillText(uname, 210, 215); noGlow(ctx); ctx.restore();

  const ulW = Math.min(ctx.measureText(uname).width + 8, 440);
  const ulG = ctx.createLinearGradient(210, 0, 210 + ulW, 0);
  ulG.addColorStop(0, ucolor); ulG.addColorStop(1, 'transparent');
  ctx.fillStyle = ulG; ctx.fillRect(210, 224, ulW, 2);

  // Bio
  ctx.fillStyle = 'rgba(185,190,220,0.80)';
  ctx.font = '15px monospace'; ctx.textAlign = 'left';
  wrap(ctx, userData.bio || 'Ready for the next quest.', 210, 252, 440, 22, 2);

  // Meta chips
  let chipX = 210, chipY = 306;
  if (userData.favoriteGenre) chipX += chip(ctx, chipX, chipY, userData.favoriteGenre, '#00D4FF');
  if (userData.country)       chipX += chip(ctx, chipX, chipY, userData.country,       '#AA44FF');
  if (userData.memberSince)   chip(ctx, chipX, chipY, 'Since ' + userData.memberSince, '#00E676');

  // Rank progress line
  ctx.save(); ctx.textAlign = 'left';
  ctx.beginPath(); ctx.arc(213, 348, 5, 0, Math.PI * 2);
  glow(ctx, rank.color, 12); ctx.fillStyle = rank.color; ctx.fill(); noGlow(ctx);
  ctx.fillStyle = rank.color; ctx.font = 'bold 12px monospace';
  ctx.fillText(rank.label, 226, 353);
  if (nextRank) {
    ctx.fillStyle = 'rgba(130,140,180,0.5)'; ctx.font = '11px monospace';
    const lw = ctx.measureText(rank.label).width;
    ctx.fillText('  ->  ' + nextRank.label + ' at ' + nextRank.min + ' games', 226 + lw, 353);
  }
  ctx.restore();

  neonLine(ctx, 210, 370, W - 30, 370, 'rgba(0,212,255,0.12)', 1, 3);

  // Stats panel
  const PY = 392, PH = 118;
  rr(ctx, 18, PY, W - 36, PH, 20);
  ctx.fillStyle = 'rgba(5,5,16,0.80)'; ctx.fill();
  ctx.save(); glow(ctx, 'rgba(0,212,255,0.2)', 12);
  rr(ctx, 18, PY, W - 36, PH, 20);
  ctx.strokeStyle = 'rgba(0,212,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke();
  noGlow(ctx); ctx.restore();

  const statDefs = [
    { label: 'LIBRARY',   val: stats.totalGames,     col: '#00D4FF' },
    { label: 'COMPLETED', val: stats.playedCount,    col: '#00E676' },
    { label: 'BACKLOG',   val: stats.backlogCount,   col: '#FFD700' },
    { label: 'PLAYING',   val: stats.playingCount,   col: '#FF6D00' },
    { label: 'DROPPED',   val: stats.droppedCount,   col: '#FF4081' },
    { label: 'HOURS',     val: stats.totalHours+'h', col: '#AA44FF' },
    { label: 'AVG SCORE', val: stats.avgScore > 0 ? stats.avgScore+'/10' : 'N/A', col: '#00D4FF' },
  ];

  const slot = (W - 36) / statDefs.length;
  statDefs.forEach(({ label, val, col }, i) => {
    const cx = 18 + slot * i + slot / 2, cy = PY + PH / 2;
    if (i > 0) { ctx.fillStyle = 'rgba(0,212,255,0.07)'; ctx.fillRect(18 + slot * i, PY + 16, 1, PH - 32); }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy - 30, 4, 0, Math.PI * 2);
    glow(ctx, col, 10); ctx.fillStyle = col; ctx.fill(); noGlow(ctx); ctx.restore();
    ctx.save(); glow(ctx, '#fff', 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(val), cx, cy + 4); noGlow(ctx); ctx.restore();
    ctx.fillStyle = 'rgba(100,110,148,0.9)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 22);
  });

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 2 — GAME CARD  (960 x 520)
// ══════════════════════════════════════════════════════════════
async function drawGameCard(game, tagText = '>> GAME INTEL', tagCol = '#00D4FF', verdictText = null) {
  const W = 960, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const score    = Math.round(game.rating || 0);
  const sCol     = scoreCol(score);
  const coverUrl = game.cover ? `https://images.igdb.com/igdb/image/upload/t_1080p/${game.cover.image_id}.jpg` : null;
  const coverImg = await loadImg(coverUrl);

  await setupBg(ctx, W, H, coverUrl, 0.94);
  dots(ctx, W - 310, H);
  grain(ctx, W, H);
  accentBar(ctx, H, tagCol);

  // Right cover panel
  if (coverImg) {
    const CX = W - 288, CY = 32, CW = 250, CH = H - 64;
    ctx.save(); rr(ctx, CX, CY, CW, CH, 18); ctx.clip();
    ctx.drawImage(coverImg, CX, CY, CW, CH); ctx.restore();
    const fade = ctx.createLinearGradient(CX, 0, CX + 60, 0);
    fade.addColorStop(0, '#04040D'); fade.addColorStop(1, 'transparent');
    ctx.fillStyle = fade; ctx.fillRect(CX, CY, 60, CH);
    cornerBrackets(ctx, CX, CY, CW, CH, sCol);
  }

  // Top ambient
  const topGlow = ctx.createLinearGradient(0, 0, 0, 140);
  topGlow.addColorStop(0, tagCol + '10'); topGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = topGlow; ctx.fillRect(0, 0, W - 300, 140);

  sectionTag(ctx, 36, 34, tagText, tagCol);

  // Title
  const name = game.name.length > 24 ? game.name.substring(0, 24) + '...' : game.name;
  ctx.save(); glow(ctx, '#fff', 10);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 46px monospace'; ctx.textAlign = 'left';
  ctx.fillText(name, 36, 142); noGlow(ctx); ctx.restore();

  // Underline
  const ulW = Math.min(ctx.measureText(name).width + 6, 570);
  const ulG = ctx.createLinearGradient(36, 0, 36 + ulW, 0);
  ulG.addColorStop(0, tagCol); ulG.addColorStop(0.5, '#AA44FF66'); ulG.addColorStop(1, 'transparent');
  ctx.fillStyle = ulG; ctx.fillRect(36, 152, ulW, 2);

  // Chips
  let chX = 36;
  if (game.genres?.[0]?.name)    chX += chip(ctx, chX, 164, game.genres[0].name,  '#AA44FF');
  if (game.first_release_date)   chX += chip(ctx, chX, 164, String(new Date(game.first_release_date * 1000).getFullYear()), '#00D4FF');
  if (game.platforms?.[0]?.name) chX += chip(ctx, chX, 164, game.platforms[0].name, '#00E676');
  const dev = game.involved_companies?.find(c => c.developer)?.company?.name;
  if (dev) chip(ctx, chX, 164, dev, '#FFD700');

  // Score ring
  scoreRing(ctx, 100, 316, 60, score, sCol);

  // Rating count
  if (game.rating_count) {
    ctx.fillStyle = 'rgba(120,130,160,0.55)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`${game.rating_count.toLocaleString()} ratings`, 172, 355);
  }

  // Summary
  if (game.summary) {
    ctx.fillStyle = 'rgba(175,182,215,0.76)';
    ctx.font = '14px monospace'; ctx.textAlign = 'left';
    wrap(ctx, game.summary, 210, 242, 390, 22, 5);
  }

  // Verdict banner
  const verdict = verdictText || getVerdict(score);
  rr(ctx, 36, 420, 590, 62, 12);
  const vBg = ctx.createLinearGradient(36, 420, 626, 482);
  vBg.addColorStop(0, sCol + '16'); vBg.addColorStop(1, sCol + '06');
  ctx.fillStyle = vBg; ctx.fill();
  rr(ctx, 36, 420, 590, 62, 12);
  ctx.strokeStyle = sCol + '45'; ctx.lineWidth = 1; ctx.stroke();

  ctx.save(); glow(ctx, sCol, 6);
  ctx.fillStyle = sCol; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('LOGY VERDICT', 56, 440); noGlow(ctx); ctx.restore();
  ctx.fillStyle = 'rgba(220,225,255,0.88)'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
  wrap(ctx, verdict, 56, 458, 550, 18, 2);

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 3 — TOP CHART  (960 x 580)
// ══════════════════════════════════════════════════════════════
async function drawChart(games, title = 'TOP RATED') {
  const W = 960, H = 580;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  await setupBg(ctx, W, H, null);
  dots(ctx, W, H);
  grain(ctx, W, H);
  accentBar(ctx, H);

  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, 'rgba(0,212,255,0.07)'); hg.addColorStop(1, 'transparent');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 90);
  neonLine(ctx, 0, 90, W, 90, 'rgba(0,212,255,0.15)', 1, 5);

  sectionTag(ctx, 28, 22, '>> LOGARY CHARTS', '#00D4FF');
  ctx.save(); glow(ctx, '#fff', 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'left';
  ctx.fillText(title, 28, 78); noGlow(ctx); ctx.restore();

  const medal = ['#FFD700','#C0C0C0','#CD7F32'];
  const lim   = Math.min(games.length, 7);

  for (let i = 0; i < lim; i++) {
    const g  = games[i];
    const sc = Math.round(g.rating || 0);
    const sC = scoreCol(sc);
    const rY = 102 + i * 68;

    rr(ctx, 16, rY, W - 32, 58, 10);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
    ctx.fill();

    ctx.save(); glow(ctx, i < 3 ? medal[i] : 'transparent', 6);
    ctx.fillStyle = i < 3 ? medal[i] : 'rgba(140,150,180,0.3)';
    ctx.fillRect(16, rY + 10, 3, 38); noGlow(ctx); ctx.restore();

    ctx.save(); glow(ctx, i < 3 ? medal[i] : 'transparent', 10);
    ctx.fillStyle = i < 3 ? medal[i] : 'rgba(140,150,180,0.4)';
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`#${i + 1}`, 52, rY + 34); noGlow(ctx); ctx.restore();

    if (g.cover) {
      const img = await loadImg(`https://images.igdb.com/igdb/image/upload/t_cover_small/${g.cover.image_id}.jpg`);
      if (img) {
        ctx.save(); rr(ctx, 76, rY + 6, 40, 46, 6); ctx.clip();
        ctx.drawImage(img, 76, rY + 6, 40, 46); ctx.restore();
        rr(ctx, 76, rY + 6, 40, 46, 6);
        ctx.strokeStyle = 'rgba(0,212,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    ctx.save(); glow(ctx, '#fff', 3);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px monospace'; ctx.textAlign = 'left';
    ctx.fillText(g.name.length > 40 ? g.name.substring(0, 40) + '...' : g.name, 130, rY + 24);
    noGlow(ctx); ctx.restore();

    const yr   = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : '';
    const meta = [g.genres?.[0]?.name, yr].filter(Boolean).join('  •  ');
    ctx.fillStyle = 'rgba(130,140,180,0.55)'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
    ctx.fillText(meta, 130, rY + 44);

    rr(ctx, W - 108, rY + 10, 78, 38, 8);
    ctx.fillStyle = sC + '1A'; ctx.fill();
    rr(ctx, W - 108, rY + 10, 78, 38, 8);
    ctx.strokeStyle = sC + '50'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); glow(ctx, sC, 8);
    ctx.fillStyle = sC; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(sc), W - 108 + 39, rY + 34); noGlow(ctx); ctx.restore();

    statBar(ctx, 130, rY + 54, 600, 4, sc / 100, sC + '88');

    if (i < lim - 1) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(16, rY + 60, W - 32, 1); }
  }

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 4 — COMPARE  (960 x 540)
// ══════════════════════════════════════════════════════════════
async function drawCompare(g1, g2) {
  const W = 960, H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const s1 = Math.round(g1.rating || 0), s2 = Math.round(g2.rating || 0);
  const c1 = scoreCol(s1), c2 = scoreCol(s2);
  const winner = s1 >= s2 ? 0 : 1;

  await setupBg(ctx, W, H, null);
  grain(ctx, W, H);

  const left = ctx.createLinearGradient(0, 0, W / 2, H);
  left.addColorStop(0, c1 + '08'); left.addColorStop(1, 'transparent');
  ctx.fillStyle = left; ctx.fillRect(0, 0, W / 2, H);

  const right = ctx.createLinearGradient(W, 0, W / 2, H);
  right.addColorStop(0, c2 + '08'); right.addColorStop(1, 'transparent');
  ctx.fillStyle = right; ctx.fillRect(W / 2, 0, W / 2, H);

  dots(ctx, W, H);
  accentBar(ctx, H);

  neonLine(ctx, W / 2, 30, W / 2, H - 30, 'rgba(0,212,255,0.12)', 1, 8);
  ctx.save(); glow(ctx, '#00D4FF', 24);
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#04040D'; ctx.fill();
  ctx.strokeStyle = '#00D4FF'; ctx.lineWidth = 2; ctx.stroke(); noGlow(ctx); ctx.restore();
  ctx.save(); glow(ctx, '#00D4FF', 10);
  ctx.fillStyle = '#00D4FF'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
  ctx.fillText('VS', W / 2, H / 2 + 5); noGlow(ctx); ctx.restore();

  for (let s = 0; s < 2; s++) {
    const g   = s === 0 ? g1 : g2;
    const sc  = s === 0 ? s1 : s2;
    const sC  = s === 0 ? c1 : c2;
    const isW = s === winner;

    if (g.cover) {
      const img = await loadImg(`https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`);
      if (img) {
        const cX = s === 0 ? 40 : W / 2 + 26, cY = 32, cW = 140, cH = 200;
        ctx.save(); rr(ctx, cX, cY, cW, cH, 14); ctx.clip();
        ctx.drawImage(img, cX, cY, cW, cH); ctx.restore();
        ctx.save(); glow(ctx, sC, isW ? 20 : 8);
        rr(ctx, cX, cY, cW, cH, 14);
        ctx.strokeStyle = isW ? sC : sC + '60'; ctx.lineWidth = isW ? 2.5 : 1.5; ctx.stroke();
        noGlow(ctx); ctx.restore();
        if (isW) cornerBrackets(ctx, cX, cY, cW, cH, sC, 16);
      }
    }

    const tX = s === 0 ? 196 : W / 2 + 14;
    ctx.save(); glow(ctx, '#fff', 8);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
    ctx.fillText(g.name.length > 18 ? g.name.substring(0, 18) + '...' : g.name, tX, 76);
    noGlow(ctx); ctx.restore();

    if (g.genres?.[0]?.name) chip(ctx, tX, 90, g.genres[0].name, '#AA44FF');

    if (g.first_release_date) {
      ctx.fillStyle = 'rgba(130,140,180,0.5)'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(String(new Date(g.first_release_date * 1000).getFullYear()), tX, 132);
    }

    const rCX = s === 0 ? 125 : W / 2 + 105;
    scoreRing(ctx, rCX, 310, 62, sc, sC);

    const barX = s === 0 ? 40 : W / 2 + 14;
    const barMaxW = W / 2 - 60;
    [
      { label: 'SCORE',   val: sc / 100 },
      { label: 'REVIEWS', val: Math.min((g.rating_count || 0) / 5000, 1) },
    ].forEach(({ label, val }, bi) => {
      ctx.fillStyle = 'rgba(130,140,175,0.45)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(label, barX, 400 + bi * 28 - 2);
      statBar(ctx, barX, 400 + bi * 28 + 4, barMaxW, 8, val, sC);
    });

    if (isW) {
      ctx.save(); glow(ctx, '#FFD700', 20);
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
      ctx.fillText('WINNER', s === 0 ? 40 : W / 2 + 14, H - 14); noGlow(ctx); ctx.restore();
    }
  }

  // Verdict banner at bottom
  const winnerGame = winner === 0 ? g1 : g2;
  const verdict = getVerdict(Math.max(s1, s2));
  rr(ctx, 20, H - 68, W - 40, 52, 10);
  ctx.fillStyle = 'rgba(5,5,18,0.88)'; ctx.fill();
  rr(ctx, 20, H - 68, W - 40, 52, 10);
  ctx.strokeStyle = 'rgba(0,212,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); glow(ctx, '#00D4FF', 6);
  ctx.fillStyle = '#00D4FF'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText('LOGY VERDICT', 40, H - 50); noGlow(ctx); ctx.restore();
  ctx.fillStyle = 'rgba(210,215,245,0.82)'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
  wrap(ctx, verdict, 40, H - 32, W - 80, 18, 1);

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 5 — SEARCH GRID  (960 x 520)
// ══════════════════════════════════════════════════════════════
async function drawSearchGrid(games, query) {
  const W = 960, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  await setupBg(ctx, W, H, null);
  dots(ctx, W, H);
  grain(ctx, W, H);
  accentBar(ctx, H, '#AA44FF');

  sectionTag(ctx, 28, 24, '>> SEARCH', '#AA44FF');
  ctx.save(); glow(ctx, '#fff', 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`"${query.substring(0, 30)}"`, 28, 74); noGlow(ctx); ctx.restore();
  neonLine(ctx, 28, 90, W - 28, 90, 'rgba(170,68,255,0.2)', 1, 4);

  const cols = 3, rows = 2;
  const itemW = (W - 60) / cols, itemH = (H - 115) / rows;

  for (let i = 0; i < Math.min(games.length, 6); i++) {
    const g   = games[i];
    const sc  = Math.round(g.rating || 0);
    const sC  = scoreCol(sc);
    const col = i % cols, row = Math.floor(i / cols);
    const bX  = 24 + col * itemW, bY = 102 + row * itemH;
    const bW  = itemW - 14, bH = itemH - 10;

    rr(ctx, bX, bY, bW, bH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
    rr(ctx, bX, bY, bW, bH, 12);
    ctx.strokeStyle = 'rgba(170,68,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();

    if (g.cover) {
      const img = await loadImg(`https://images.igdb.com/igdb/image/upload/t_cover_small/${g.cover.image_id}.jpg`);
      if (img) {
        ctx.save(); rr(ctx, bX + 12, bY + 10, 46, 60, 6); ctx.clip();
        ctx.drawImage(img, bX + 12, bY + 10, 46, 60); ctx.restore();
        rr(ctx, bX + 12, bY + 10, 46, 60, 6);
        ctx.strokeStyle = sC + '50'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    const nameClip = g.name.length > 18 ? g.name.substring(0, 18) + '...' : g.name;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(nameClip, bX + 68, bY + 28);
    ctx.fillStyle = 'rgba(130,140,180,0.55)'; ctx.font = '11px monospace';
    ctx.fillText(g.genres?.[0]?.name || 'Unknown', bX + 68, bY + 46);
    ctx.save(); glow(ctx, sC, 8);
    ctx.fillStyle = sC; ctx.font = 'bold 16px monospace';
    ctx.fillText(sc > 0 ? String(sc) : 'N/A', bX + 68, bY + 66);
    noGlow(ctx); ctx.restore();
    if (g.first_release_date) {
      ctx.fillStyle = 'rgba(110,120,160,0.45)'; ctx.font = '10px monospace';
      ctx.fillText(String(new Date(g.first_release_date * 1000).getFullYear()), bX + bW - 42, bY + bH - 12);
    }
  }

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 6 — SERVER STATS  (960 x 500)
// ══════════════════════════════════════════════════════════════
async function drawServerStats(data) {
  const W = 960, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  await setupBg(ctx, W, H, null);
  dots(ctx, W, H);
  grain(ctx, W, H);
  accentBar(ctx, H, '#AA44FF');

  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, 'rgba(170,68,255,0.07)'); hg.addColorStop(1, 'transparent');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 90);
  neonLine(ctx, 0, 90, W, 90, 'rgba(170,68,255,0.15)', 1, 5);

  sectionTag(ctx, 28, 22, '>> LOGARY DATABASE', '#AA44FF');
  ctx.save(); glow(ctx, '#fff', 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'left';
  ctx.fillText('SERVER STATISTICS', 28, 76); noGlow(ctx); ctx.restore();

  const bigStats = [
    { label: 'TOTAL USERS',   val: data.totalUsers,            col: '#00D4FF' },
    { label: 'GAMES LOGGED',  val: data.totalGames,            col: '#00E676' },
    { label: 'HOURS TRACKED', val: data.totalHours + 'h',     col: '#AA44FF' },
    { label: 'AVG LIBRARY',   val: data.avgLibrary + ' games', col: '#FFD700' },
  ];

  const cW = (W - 60) / 4;
  bigStats.forEach(({ label, val, col }, i) => {
    const cX = 24 + i * cW;
    rr(ctx, cX, 102, cW - 14, 108, 14);
    const g = ctx.createLinearGradient(cX, 102, cX, 210);
    g.addColorStop(0, col + '14'); g.addColorStop(1, col + '06');
    ctx.fillStyle = g; ctx.fill();
    rr(ctx, cX, 102, cW - 14, 108, 14);
    ctx.strokeStyle = col + '40'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); glow(ctx, col, 12);
    ctx.beginPath(); ctx.arc(cX + 20, 124, 5, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill(); noGlow(ctx); ctx.restore();
    ctx.save(); glow(ctx, '#fff', 5);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'left';
    ctx.fillText(String(val), cX + 16, 180); noGlow(ctx); ctx.restore();
    ctx.fillStyle = 'rgba(110,120,155,0.8)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(label, cX + 16, 198);
  });

  neonLine(ctx, 28, 236, W - 28, 236, 'rgba(0,212,255,0.1)', 1, 3);
  ctx.save(); glow(ctx, '#00D4FF', 6);
  ctx.fillStyle = '#00D4FF'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('TOP PLAYERS', 28, 258); noGlow(ctx); ctx.restore();

  const topMedal = ['#FFD700','#C0C0C0','#CD7F32'];
  (data.topPlayers || []).forEach((p, i) => {
    const rY = 272 + i * 42;
    rr(ctx, 20, rY, W - 40, 34, 8);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.1)'; ctx.fill();
    ctx.save(); glow(ctx, i < 3 ? topMedal[i] : 'transparent', 8);
    ctx.fillStyle = i < 3 ? topMedal[i] : 'rgba(140,150,180,0.35)';
    ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText('#' + (i + 1), 46, rY + 22); noGlow(ctx); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '15px monospace'; ctx.textAlign = 'left';
    ctx.fillText(p.username, 76, rY + 22);
    ctx.fillStyle = 'rgba(130,140,180,0.5)'; ctx.font = '12px monospace';
    ctx.fillText(p.totalGames + ' games', 320, rY + 22);
    ctx.fillText(p.totalHours ? p.totalHours + 'h' : '', 460, rY + 22);
    const pr = getRank(p.totalGames);
    ctx.save(); glow(ctx, pr.color, 6);
    ctx.fillStyle = pr.color; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
    ctx.fillText(pr.label, W - 36, rY + 22); noGlow(ctx); ctx.restore();
  });

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS 7 — WISHLIST  (960 x 520)
// ══════════════════════════════════════════════════════════════
async function drawWishlist(userData, items) {
  const W = 960, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  await setupBg(ctx, W, H, userData.profileBanner, 0.90);
  dots(ctx, W, H);
  grain(ctx, W, H);
  accentBar(ctx, H, '#FF6D00');

  sectionTag(ctx, 28, 24, '>> WISHLIST', '#FF6D00');
  ctx.save(); glow(ctx, '#fff', 6);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px monospace'; ctx.textAlign = 'left';
  ctx.fillText((userData.username || 'Player').toUpperCase() + "'S WISHLIST", 28, 74);
  noGlow(ctx); ctx.restore();
  neonLine(ctx, 28, 90, W - 28, 90, 'rgba(255,109,0,0.2)', 1, 4);

  if (!items?.length) {
    ctx.fillStyle = 'rgba(170,180,215,0.45)'; ctx.font = '18px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Wishlist empty — add games in the Logary app!', W / 2, H / 2);
  } else {
    for (let i = 0; i < Math.min(items.length, 6); i++) {
      const g  = items[i];
      const sc = Math.round(g.rating || 0);
      const sC = scoreCol(sc);
      const rY = 104 + i * 66;

      rr(ctx, 16, rY, W - 32, 56, 10);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.1)'; ctx.fill();

      if (g.cover) {
        const img = await loadImg(`https://images.igdb.com/igdb/image/upload/t_cover_small/${g.cover.image_id}.jpg`);
        if (img) {
          ctx.save(); rr(ctx, 28, rY + 6, 38, 44, 5); ctx.clip();
          ctx.drawImage(img, 28, rY + 6, 38, 44); ctx.restore();
          rr(ctx, 28, rY + 6, 38, 44, 5);
          ctx.strokeStyle = sC + '60'; ctx.lineWidth = 1; ctx.stroke();
        }
      }

      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
      ctx.fillText(g.name.length > 42 ? g.name.substring(0, 42) + '...' : g.name, 80, rY + 22);
      ctx.fillStyle = 'rgba(130,140,180,0.5)'; ctx.font = '11px monospace';
      const meta = [g.genres?.[0]?.name, g.first_release_date ? new Date(g.first_release_date*1000).getFullYear() : null].filter(Boolean).join('  •  ');
      ctx.fillText(meta, 80, rY + 42);
      if (sc > 0) {
        ctx.save(); glow(ctx, sC, 8);
        ctx.fillStyle = sC; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right';
        ctx.fillText(String(sc), W - 32, rY + 28); noGlow(ctx); ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(16, rY + 58, W - 32, 1);
    }
  }

  scanlines(ctx, W, H);
  footer(ctx, W, H);
  return canvas;
}

// ══════════════════════════════════════════════════════════════
//  BOT EVENTS
// ══════════════════════════════════════════════════════════════
client.on('ready', () => {
  console.log(`[ LOGY v4.1 ] Online — ${client.user.tag}`);
  client.user.setActivity('Logary  |  logy help', { type: 3 });
});

// ══════════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ══════════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const botMention     = `<@${client.user.id}>`;
  const botMentionNick = `<@!${client.user.id}>`;
  let isCalled = false, args = '';

  if (message.content.toLowerCase().startsWith('logy')) {
    isCalled = true; args = message.content.slice(4).trim();
  } else if (message.content.startsWith(botMention)) {
    isCalled = true; args = message.content.slice(botMention.length).trim();
  } else if (message.content.startsWith(botMentionNick)) {
    isCalled = true; args = message.content.slice(botMentionNick.length).trim();
  }
  if (!isCalled) return;

  const cmd = args.toLowerCase().trim();

  const errEmbed = txt => message.reply({
    embeds: [new EmbedBuilder().setColor('#DC3545')
      .setTitle(`${E.mad}  System Error`)
      .setDescription(txt)
      .setFooter({ text: 'Logary Intelligence  v4.1' })],
  });

  const sendCanvas = async (canvas, name, content = '') => {
    const att = new AttachmentBuilder(await canvas.encode('png'), { name });
    return message.reply({ content, files: [att] });
  };

  const cd = checkCD(message.author.id, cmd.split(' ')[0], 4000);
  if (cd > 0) return errEmbed(`Hold on. Wait **${cd}s** before using that command again.`);

  // ── HELP ────────────────────────────────────────────────────
  if (cmd === '' || cmd === 'help') {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#00D4FF')
          .setAuthor({ name: 'LOGY  v4.1', iconURL: client.user.displayAvatarURL() })
          .setTitle(`${E.logy}  Logary Intelligence System`)
          .setDescription(`> *Gaming intelligence. Connected to Logary.*\n\u200b`)
          .addFields(
            { name: `${E.photo}  \`logy profile <user>\``,        value: 'Cinematic player card — stats, rank, history.', inline: false },
            { name: `${E.gg}  \`logy game <title>\``,             value: 'Game insight card — score, summary, verdict.', inline: false },
            { name: `${E.gg}  \`logy suggest [genre/keyword]\``,  value: 'Smart game recommendation.', inline: false },
            { name: `${E.think}  \`logy random [genre]\``,        value: 'Random game discovery.', inline: false },
            { name: `${E.love}  \`logy search <query>\``,         value: 'Visual 6-result search grid.', inline: false },
            { name: `${E.logy}  \`logy top [genre]\``,            value: 'Highest-rated games chart.', inline: false },
            { name: `${E.logy}  \`logy trending\``,               value: 'Fresh high-rated releases (last 6 months).', inline: false },
            { name: `${E.gg}  \`logy compare <A> vs <B>\``,       value: 'Head-to-head battle card.', inline: false },
            { name: `${E.logy}  \`logy stats\``,                  value: 'Logary database overview + top players.', inline: false },
            { name: `${E.photo}  \`logy wishlist <user>\``,       value: "Visual wishlist card.", inline: false },
          )
          .setThumbnail(client.user.displayAvatarURL())
          .setFooter({ text: 'Logary Intelligence  v4.1', iconURL: client.user.displayAvatarURL() })
          .setTimestamp(),
      ],
    });
  }

  // ── PROFILE ─────────────────────────────────────────────────
  if (cmd.startsWith('profile')) {
    const uname = args.slice(7).trim();
    if (!uname) return errEmbed('Usage: `logy profile <username>`');
    await message.channel.sendTyping();
    try {
      const snap = await db.collection('users').where('username', '==', uname).get();
      if (snap.empty) return errEmbed(`User **${uname}** not found in Logary.`);
      const doc  = snap.docs[0];
      const data = doc.data();
      const gsn  = await db.collection('users').doc(doc.id).collection('games').get();

      let totalGames = gsn.size, backlogCount = 0, playedCount = 0,
          playingCount = 0, droppedCount = 0, totalHours = 0, scoreSum = 0, scoreCount = 0;

      gsn.forEach(d => {
        const g      = d.data();
        const status = (g.playStatus || '').toLowerCase();
        if (status === 'backlog')                                   backlogCount++;
        if (status === 'played' || status === 'completed')         playedCount++;
        if (status === 'playing' || status === 'currently playing') playingCount++;
        if (status === 'dropped')                                  droppedCount++;
        if (g.playtime  && !isNaN(+g.playtime))                   totalHours += +g.playtime;
        if (g.userHours && !isNaN(+g.userHours))                  totalHours += +g.userHours;
        if (g.userScore && !isNaN(+g.userScore))                  { scoreSum += +g.userScore; scoreCount++; }
      });

      const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;
      const canvas   = await drawProfile(data, { totalGames, backlogCount, playedCount, playingCount, droppedCount, totalHours, avgScore });
      return sendCanvas(canvas, 'logy-profile.png', `${E.photo}  **${uname}** — Player Card`);
    } catch (err) { console.error(err); return errEmbed('Profile render failed. Try again.'); }
  }

  // ── GAME ────────────────────────────────────────────────────
  if (cmd.startsWith('game')) {
    const q = args.slice(4).trim();
    if (!q) return errEmbed('Usage: `logy game <title>`');
    await message.channel.sendTyping();
    try {
      const res = await igdb('games', `search "${q}"; fields ${FIELDS_FULL}; limit 1;`);
      if (!res[0]) return errEmbed(`**${q}** not found.`);
      const canvas = await drawGameCard(res[0], '>> GAME INTEL', '#00D4FF');
      return sendCanvas(canvas, 'logy-game.png', `${E.gg}  **${res[0].name}**`);
    } catch (err) { console.error(err); return errEmbed('Game lookup failed. Try again.'); }
  }

  // ── SUGGEST ─────────────────────────────────────────────────
  if (cmd.startsWith('suggest')) {
    await message.channel.sendTyping();
    try {
      const raw   = args.slice(7).trim();
      const genre = Object.keys(GENRE_MAP).find(k => raw.toLowerCase() === k);
      let query;
      if (genre)    query = `fields ${FIELDS_FULL}; where genres = (${GENRE_MAP[genre]}) & rating > 78 & rating_count > 50 & cover != null; sort rating desc; limit 30; offset ${Math.floor(Math.random() * 40)};`;
      else if (raw) query = `search "${raw}"; fields ${FIELDS_FULL}; where cover != null & rating > 68 & rating_count > 10; limit 10;`;
      else          query = `fields ${FIELDS_FULL}; where rating > 88 & rating_count > 150 & cover != null; sort rating desc; limit 1; offset ${Math.floor(Math.random() * 150)};`;

      const list = await igdb('games', query);
      if (!list?.length) return errEmbed('No matching titles found. Try a different keyword.');
      const game   = list[Math.floor(Math.random() * list.length)];
      const reason = getSuggestionReason(game.name, game.genres?.[0]?.name);
      const canvas = await drawGameCard(game, '>> LOGY RECOMMENDS', '#00E676', reason);
      return sendCanvas(canvas, 'logy-suggest.png', `${E.gg}  Target locked — **${game.name}**`);
    } catch (err) { console.error(err); return errEmbed('Suggestion engine offline. Try again.'); }
  }

  // ── RANDOM ──────────────────────────────────────────────────
  if (cmd.startsWith('random')) {
    await message.channel.sendTyping();
    try {
      const raw   = args.slice(6).trim();
      const genre = Object.keys(GENRE_MAP).find(k => raw.toLowerCase() === k);
      const query = genre
        ? `fields ${FIELDS_FULL}; where genres = (${GENRE_MAP[genre]}) & rating > 65 & cover != null; limit 1; offset ${Math.floor(Math.random() * 200)};`
        : `fields ${FIELDS_FULL}; where rating > 70 & rating_count > 30 & cover != null; limit 1; offset ${Math.floor(Math.random() * 300)};`;
      const list = await igdb('games', query);
      if (!list?.length) return errEmbed('Could not roll a game. Try again!');
      const reason = getSuggestionReason(list[0].name, list[0].genres?.[0]?.name);
      const canvas = await drawGameCard(list[0], '>> RANDOM DISCOVERY', '#FF6D00', reason);
      return sendCanvas(canvas, 'logy-random.png', `${E.think}  Rolling the dice — **${list[0].name}**`);
    } catch (err) { console.error(err); return errEmbed('Random engine failed. Try again.'); }
  }

  // ── SEARCH ──────────────────────────────────────────────────
  if (cmd.startsWith('search')) {
    const q = args.slice(6).trim();
    if (!q) return errEmbed('Usage: `logy search <query>`');
    await message.channel.sendTyping();
    try {
      const res = await igdb('games', `search "${q}"; fields ${FIELDS_LIGHT}; where cover != null; limit 6;`);
      if (!res?.length) return errEmbed('No results found.');
      const canvas = await drawSearchGrid(res, q);
      return sendCanvas(canvas, 'logy-search.png', `${E.love}  Results for **"${q}"**`);
    } catch (err) { console.error(err); return errEmbed('Search failed. Try again.'); }
  }

  // ── TOP ─────────────────────────────────────────────────────
  if (cmd.startsWith('top')) {
    await message.channel.sendTyping();
    try {
      const raw   = args.slice(3).trim();
      const genre = Object.keys(GENRE_MAP).find(k => raw.toLowerCase() === k);
      let query, label = 'ALL TIME TOP RATED';
      if (genre) {
        query = `fields ${FIELDS_LIGHT}; where genres = (${GENRE_MAP[genre]}) & rating > 80 & rating_count > 80 & cover != null; sort rating desc; limit 7;`;
        label = 'TOP ' + genre.toUpperCase();
      } else {
        query = `fields ${FIELDS_LIGHT}; where rating > 92 & rating_count > 200 & cover != null; sort rating desc; limit 7;`;
      }
      const list = await igdb('games', query);
      if (!list?.length) return errEmbed('No chart data found.');
      const canvas = await drawChart(list, label);
      return sendCanvas(canvas, 'logy-top.png', `🏆  **${label}**`);
    } catch (err) { console.error(err); return errEmbed('Chart error. Try again.'); }
  }

  // ── TRENDING ────────────────────────────────────────────────
  if (cmd === 'trending') {
    await message.channel.sendTyping();
    try {
      const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 180;
      const list  = await igdb('games', `fields ${FIELDS_LIGHT}; where first_release_date > ${since} & rating > 75 & rating_count > 25 & cover != null; sort rating desc; limit 7;`);
      if (!list?.length) return errEmbed('No trending data right now.');
      const canvas = await drawChart(list, 'TRENDING NOW');
      return sendCanvas(canvas, 'logy-trending.png', `🔥  What's hot right now.`);
    } catch (err) { console.error(err); return errEmbed('Trending system offline. Try again.'); }
  }

  // ── COMPARE ─────────────────────────────────────────────────
  if (cmd.startsWith('compare')) {
    const part  = args.slice(7).trim();
    const vsIdx = part.toLowerCase().indexOf(' vs ');
    if (vsIdx === -1) return errEmbed('Format: `logy compare Elden Ring vs Dark Souls`');
    const n1 = part.substring(0, vsIdx).trim();
    const n2 = part.substring(vsIdx + 4).trim();
    if (!n1 || !n2) return errEmbed('Provide two game names separated by "vs".');
    await message.channel.sendTyping();
    try {
      const f = `fields ${FIELDS_FULL};`;
      const [r1, r2] = await Promise.all([
        igdb('games', `search "${n1}"; ${f} limit 1;`),
        igdb('games', `search "${n2}"; ${f} limit 1;`),
      ]);
      if (!r1[0] || !r2[0]) return errEmbed('One or both games not found.');
      const canvas = await drawCompare(r1[0], r2[0]);
      return sendCanvas(canvas, 'logy-compare.png', `⚔️  **${r1[0].name}** vs **${r2[0].name}**`);
    } catch (err) { console.error(err); return errEmbed('Compare system error. Try again.'); }
  }

  // ── STATS ───────────────────────────────────────────────────
  if (cmd === 'stats') {
    await message.channel.sendTyping();
    try {
      const usersSnap = await db.collection('users').get();
      let totalUsers = usersSnap.size, totalGames = 0, totalHours = 0;
      const playerList = [];

      for (const userDoc of usersSnap.docs) {
        const gsn = await db.collection('users').doc(userDoc.id).collection('games').get();
        let uGames = gsn.size, uHours = 0;
        gsn.forEach(d => {
          const g = d.data();
          if (g.playtime  && !isNaN(+g.playtime))  uHours += +g.playtime;
          if (g.userHours && !isNaN(+g.userHours)) uHours += +g.userHours;
        });
        totalGames += uGames; totalHours += uHours;
        playerList.push({ username: userDoc.data().username || 'Unknown', totalGames: uGames, totalHours: Math.round(uHours) });
      }

      const avgLibrary = totalUsers > 0 ? Math.round(totalGames / totalUsers) : 0;
      const topPlayers = playerList.sort((a, b) => b.totalGames - a.totalGames).slice(0, 5);
      const canvas     = await drawServerStats({ totalUsers, totalGames, totalHours: Math.round(totalHours), avgLibrary, topPlayers });
      return sendCanvas(canvas, 'logy-stats.png', `📊  **Logary Database Overview**`);
    } catch (err) { console.error(err); return errEmbed('Stats query failed. Try again.'); }
  }

  // ── WISHLIST ────────────────────────────────────────────────
  if (cmd.startsWith('wishlist')) {
    const uname = args.slice(8).trim();
    if (!uname) return errEmbed('Usage: `logy wishlist <username>`');
    await message.channel.sendTyping();
    try {
      const snap = await db.collection('users').where('username', '==', uname).get();
      if (snap.empty) return errEmbed(`User **${uname}** not found.`);
      const doc    = snap.docs[0];
      const data   = doc.data();
      const wsSnap = await db.collection('users').doc(doc.id).collection('games')
        .where('playStatus', 'in', ['wishlist', 'Wishlist', 'WISHLIST', 'want to play', 'Want to Play']).get();

      const items = [];
      for (const d of wsSnap.docs.slice(0, 6)) {
        const g    = d.data();
        const name = g.gameTitle || g.name || g.gameName;
        if (name) {
          try {
            const res = await igdb('games', `search "${name}"; fields ${FIELDS_LIGHT}; limit 1;`);
            if (res[0]) items.push(res[0]); else items.push({ name });
          } catch { items.push({ name }); }
        }
      }

      const canvas = await drawWishlist(data, items);
      return sendCanvas(canvas, 'logy-wishlist.png', `📌  **${uname}**'s Wishlist`);
    } catch (err) { console.error(err); return errEmbed('Wishlist fetch failed. Try again.'); }
  }


  // ── WELCOME TEST ────────────────────────────────────────────
  // Kullanım: logy welcome  (sadece sunucu yöneticileri)
  if (cmd === 'welcome' || cmd === 'testwelcome') {
    if (!message.member.permissions.has('ManageGuild')) {
      return errEmbed('Bu komutu sadece sunucu yöneticileri kullanabilir.');
    }
    await message.channel.sendTyping();
    try {
      const canvas = await drawWelcome(message.member);
      const att    = new AttachmentBuilder(await canvas.encode('png'), { name: 'logy-welcome.png' });
      return message.reply({
        content: `${E.logy} <@${message.author.id}> — Welcome card önizlemesi`,
        files: [att],
      });
    } catch (err) {
      console.error(err);
      return errEmbed('Welcome card render hatası. Try again.');
    }
  }

  // ── UNKNOWN ─────────────────────────────────────────────────
  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(`${E.think}  Unknown Command`)
        .setDescription(
          `That doesn't compute. Try **\`logy help\`** to see all commands.\n\n` +
          `**Maybe you meant?**\n` +
          `> \`logy game ${args}\`\n` +
          `> \`logy search ${args}\``
        )
        .setFooter({ text: 'Logary Intelligence  v4.1' }),
    ],
  });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  await interaction.deferUpdate().catch(() => {});
});


// ══════════════════════════════════════════════════════════════
//  WELCOME CONFIG
//  !! Discord Developer Portal > Bot > Server Members Intent AÇ !!
// ══════════════════════════════════════════════════════════════
const WELCOME_CHANNEL_ID = '1481011472346779688'; // örn: '1234567890123456789'

// ══════════════════════════════════════════════════════════════
//  CANVAS — WELCOME CARD  (1100 x 440)
// ══════════════════════════════════════════════════════════════
async function drawWelcome(member) {
  const W = 1100, H = 440;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   '#03030C');
  bg.addColorStop(0.5, '#07071A');
  bg.addColorStop(1,   '#040410');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Dot grid ────────────────────────────────────────────────
  for (let x = 28; x < W; x += 28)
    for (let y = 28; y < H; y += 28) {
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,255,0.045)'; ctx.fill();
    }

  // ── Grain ────────────────────────────────────────────────────
  ctx.save(); ctx.globalAlpha = 0.020;
  for (let i = 0; i < 7000; i++) {
    const b = Math.random() * 255 | 0;
    ctx.fillStyle = `rgb(${b},${b},${b})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  }
  ctx.restore();

  // ── Left accent bar ──────────────────────────────────────────
  const lb = ctx.createLinearGradient(0, 0, 0, H);
  lb.addColorStop(0, '#00D4FF00'); lb.addColorStop(0.5, '#00D4FF'); lb.addColorStop(1, '#00D4FF00');
  ctx.fillStyle = lb; ctx.fillRect(0, 0, 4, H);

  // ── Top chrome bar ───────────────────────────────────────────
  const chrome = ctx.createLinearGradient(0, 0, W, 0);
  chrome.addColorStop(0, 'rgba(0,212,255,0.09)');
  chrome.addColorStop(0.55, 'rgba(170,68,255,0.05)');
  chrome.addColorStop(1, 'transparent');
  ctx.fillStyle = chrome; ctx.fillRect(0, 0, W, 72);

  ctx.save();
  ctx.shadowColor = 'rgba(0,212,255,0.5)'; ctx.shadowBlur = 10;
  ctx.strokeStyle = 'rgba(0,212,255,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 72); ctx.lineTo(W, 72); ctx.stroke();
  ctx.restore();

  // ── Bottom chrome bar ────────────────────────────────────────
  const chrome2 = ctx.createLinearGradient(0, 0, W, 0);
  chrome2.addColorStop(0, 'rgba(170,68,255,0.07)');
  chrome2.addColorStop(0.5, 'rgba(0,212,255,0.04)');
  chrome2.addColorStop(1, 'transparent');
  ctx.fillStyle = chrome2; ctx.fillRect(0, H - 72, W, 72);

  ctx.save();
  ctx.shadowColor = 'rgba(170,68,255,0.4)'; ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(170,68,255,0.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 72); ctx.lineTo(W, H - 72); ctx.stroke();
  ctx.restore();

  // ── Ambient glow top-right ───────────────────────────────────
  const glR = ctx.createRadialGradient(W, 0, 0, W, 0, 420);
  glR.addColorStop(0, 'rgba(170,68,255,0.11)'); glR.addColorStop(1, 'transparent');
  ctx.fillStyle = glR; ctx.fillRect(0, 0, W, H);

  // ── Ambient glow bottom-left ─────────────────────────────────
  const glL = ctx.createRadialGradient(0, H, 0, 0, H, 340);
  glL.addColorStop(0, 'rgba(0,212,255,0.08)'); glL.addColorStop(1, 'transparent');
  ctx.fillStyle = glL; ctx.fillRect(0, 0, W, H);

  // ── Subtle watermark ─────────────────────────────────────────
  ctx.save(); ctx.globalAlpha = 0.025;
  ctx.fillStyle = '#00D4FF'; ctx.font = 'bold 180px monospace'; ctx.textAlign = 'right';
  ctx.fillText('LG', W + 10, H + 20);
  ctx.restore();

  const memberText = `# ${member.guild.memberCount.toLocaleString()}`;
  ctx.font = 'bold 12px monospace';
  const mbW = ctx.measureText(memberText).width + 28;
  const mbX = W - mbW - 24, mbY = 22;

  ctx.beginPath();
  ctx.roundRect(mbX, mbY, mbW, 28, 6);
  ctx.fillStyle = 'rgba(0,212,255,0.10)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,212,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.save();
  ctx.shadowColor = '#00D4FF'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#00D4FF'; ctx.textAlign = 'right';
  ctx.fillText(memberText, mbX + mbW - 14, mbY + 18.5);
  ctx.restore();

  const srvText = member.guild.name.toUpperCase();
  ctx.font = 'bold 12px monospace';
  const snW = ctx.measureText(srvText).width + 28;
  const snX = mbX - snW - 10;

  ctx.beginPath();
  ctx.roundRect(snX, mbY, snW, 28, 6);
  ctx.fillStyle = 'rgba(170,68,255,0.10)'; ctx.fill();
  ctx.strokeStyle = 'rgba(170,68,255,0.30)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#AA44FF'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#AA44FF'; ctx.textAlign = 'right';
  ctx.fillText(srvText, snX + snW - 14, mbY + 18.5);
  ctx.restore();

  const AX = 162, AY = H / 2, AR = 88;

  ctx.beginPath(); ctx.arc(AX, AY, AR + 26, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,212,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath(); ctx.arc(AX, AY, AR + 14, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,212,255,0.20)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.beginPath(); ctx.arc(AX, AY, AR + 38, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(170,68,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avi = await (async () => { try { return await loadImage(avatarUrl); } catch { return null; } })();

  ctx.save();
  ctx.beginPath(); ctx.arc(AX, AY, AR, 0, Math.PI * 2); ctx.clip();
  if (avi) {
    ctx.drawImage(avi, AX - AR, AY - AR, AR * 2, AR * 2);
  } else {
    ctx.fillStyle = '#0C0C1E'; ctx.fill();
    ctx.fillStyle = 'rgba(0,212,255,0.4)';
    ctx.font = `bold ${AR}px monospace`; ctx.textAlign = 'center';
    ctx.fillText((member.user.username[0] || '?').toUpperCase(), AX, AY + AR * 0.36);
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = '#00D4FF'; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(AX, AY, AR, 0, Math.PI * 2);
  ctx.strokeStyle = '#00D4FF'; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = '#00E676'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(AX, AY + AR + 18, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#00E676'; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(AX, AY + AR + 18, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#000'; ctx.fill();

  const TX = 300;

  ctx.save();
  ctx.shadowColor = '#00E676'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#00E676'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
  ctx.fillText('>> WELCOME TO THE SERVER', TX, 116);
  ctx.restore();

  const twu = ctx.measureText('>> WELCOME TO THE SERVER').width;
  const tug = ctx.createLinearGradient(TX, 0, TX + twu, 0);
  tug.addColorStop(0, '#00E67680'); tug.addColorStop(1, 'transparent');
  ctx.fillStyle = tug; ctx.fillRect(TX, 121, twu, 1);

  const displayName = member.user.globalName || member.user.username;
  const nameClip    = displayName.length > 20 ? displayName.substring(0, 20) + '...' : displayName;

  ctx.save();
  ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 56px monospace'; ctx.textAlign = 'left';
  ctx.fillText(nameClip, TX, 200);
  ctx.restore();

  const nuw = Math.min(ctx.measureText(nameClip).width, 700);
  const nug = ctx.createLinearGradient(TX, 0, TX + nuw, 0);
  nug.addColorStop(0, '#00D4FF'); nug.addColorStop(0.45, '#AA44FF55'); nug.addColorStop(1, 'transparent');
  ctx.fillStyle = nug; ctx.fillRect(TX, 210, nuw, 2);

  ctx.fillStyle = 'rgba(178,185,220,0.72)';
  ctx.font = '16px monospace'; ctx.textAlign = 'left';
  ctx.fillText("Your gaming journey starts here. Connect your Logary", TX, 248);
  ctx.fillText("account and let Logy track everything.", TX, 270);

  const chipY = H - 50;

  const joinedStr = 'Joined ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.font = 'bold 11px monospace';
  const jW = ctx.measureText(joinedStr).width + 24;

  ctx.beginPath(); ctx.roundRect(TX, chipY, jW, 26, 5);
  ctx.fillStyle = 'rgba(0,212,255,0.10)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,212,255,0.30)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(0,212,255,0.6)'; ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(0,212,255,0.85)'; ctx.textAlign = 'left';
  ctx.fillText(joinedStr, TX + 12, chipY + 17);
  ctx.restore();

  const logaryStr = 'logary.app';
  ctx.font = 'bold 11px monospace';
  const lgW = ctx.measureText(logaryStr).width + 24;
  const lgX = TX + jW + 10;

  ctx.beginPath(); ctx.roundRect(lgX, chipY, lgW, 26, 5);
  ctx.fillStyle = 'rgba(170,68,255,0.12)'; ctx.fill();
  ctx.strokeStyle = 'rgba(170,68,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#AA44FF'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#AA44FF'; ctx.textAlign = 'left';
  ctx.fillText(logaryStr, lgX + 12, chipY + 17);
  ctx.restore();

  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fillRect(0, y, W, 2);
  }

  ctx.fillStyle = 'rgba(0,212,255,0.14)';
  ctx.font = '10px monospace'; ctx.textAlign = 'right';
  ctx.fillText('LOGARY INTELLIGENCE  v4.1', W - 16, H - 10);

  return canvas;
}

client.on('guildMemberAdd', async member => {
  try {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) {
      console.warn('[WELCOME] Kanal bulunamadı. WELCOME_CHANNEL_ID kontrol et:', WELCOME_CHANNEL_ID);
      return;
    }
    const canvas = await drawWelcome(member);
    const att    = new AttachmentBuilder(await canvas.encode('png'), { name: 'logy-welcome.png' });
    await channel.send({
      content: `${E.logy} <@${member.user.id}>`,
      files: [att],
    });
  } catch (err) {
    console.error('[WELCOME] Hata:', err);
  }
});

client.login(DISCORD_TOKEN);