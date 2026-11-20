// ==========================================
// 1. PENGATURAN UTAMA (BOT UTAMA — FULL FITUR + AUTO-ACC MAKRO + DEPO SALDO)
// ==========================================
const ADMIN_USERNAME = "Fellstore1"; // Tanpa tanda @
const LINK_CH_CADANGAN = "https://t.me/+OGXaaPyrnd5kMmY1";
const LINK_CH_FREE = "https://t.me/+jf3tLqLIG444MjBI";

// ---- PENGATURAN MENU RESELLER (UBAH SESUAI KEBUTUHAN) ----
const RETAIL_PRICE_LITE = 5000; // harga retail Paket Standar (nama tampilan; variabel LITE = paket Rp 5.000)
const RETAIL_PRICE_STANDAR = 10000; // harga retail Paket Premium (variabel STANDAR = paket Rp 10.000)
const RESELLER_PRICE_LITE = 3500; // harga modal reseller Paket Standar (retail Rp 5.000)
const RESELLER_PRICE_STANDAR = 7000; // harga modal reseller Paket Premium (retail Rp 10.000)
const RESELLER_MIN_ORDER = 10; // minimal ambil set per order
const DEFAULT_MACRO_SECRET = "lumineacc2026"; // nilai LAMA — sekarang DITOLAK sebagai secret (ganti lewat /setmacro KODEBARU)
const nodeCrypto = require("crypto");
const REDIS_ADMIN_ID_KEY = "lumine_main_admin_id"; // ID numerik admin (dikunci otomatis saat pertama kali admin chat)
const REDIS_ORDER_LOCK_PREFIX = "lumine_main_order_lock_"; // kunci anti-proses-ganda order bot utama
// Opsional (disarankan): isi env ADMIN_IDS di Vercel dengan ID Telegram numerik admin, pisah koma bila lebih dari satu.
const ADMIN_IDS = String(process.env.ADMIN_IDS || process.env.ADMIN_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- TIER RESELLER (berdasarkan total omset kumulatif; URUT dari kecil ke besar) ----
// Tier otomatis naik saat omset reseller mencapai min_omset. Ubah angka sesuai kebutuhan.
const RESELLER_TIERS = [
  { name: "🥉 Bronze", min_omset: 0, price_lite: RESELLER_PRICE_LITE, price_standar: RESELLER_PRICE_STANDAR },
  { name: "🥈 Silver", min_omset: 250000, price_lite: 3250, price_standar: 6500 },
  { name: "🥇 Gold", min_omset: 750000, price_lite: 3000, price_standar: 6000 },
  { name: "💎 Platinum", min_omset: 1500000, price_lite: 2750, price_standar: 5500 },
];

// ---- UPSELL SETELAH PEMBAYARAN DI-ACC ----
const UPSELL_ENABLED = true; // false = matikan fitur upsell
const UPSELL_DISCOUNT_PERCENT = 10; // diskon untuk set tawaran
const UPSELL_WINDOW_MINUTES = 10; // lama penawaran berlaku

// ---- HADIAH LEADERBOARD BULANAN (saldo otomatis untuk Top 3 pembeli bulan lalu) ----
const LB_REWARD_ENABLED = true; // false = matikan hadiah
const LB_REWARD_SALDO = [10000, 5000, 3000]; // hadiah saldo untuk peringkat 1, 2, 3
const LB_REWARD_MIN_OMSET = 20000; // minimal total belanja bulan itu agar berhak dapat hadiah
const REDIS_LB_REWARD_LOCK_PREFIX = "lumine_main_lb_reward_";

// ---- BOT RESELLER (WHITE-LABEL) ----
// Harga jual reseller di bot mereka: MINIMAL = harga retail toko utama (tidak boleh lebih murah dari kamu),
// MAKSIMAL = retail + persen berikut (dibulatkan ke Rp 500).
const RESELLER_BOT_MAX_MARKUP_PERCENT = 20;
const RESELLER_BOT_ITEMS_PER_PAGE = 8; // jumlah set per halaman katalog bot reseller

const REDIS_KEY = "lumine_main_katalog";
const REDIS_QRIS_KEY = "lumine_main_qris";
const REDIS_BANNER_KEY = "lumine_main_banner";
const REDIS_TESTI_KEY = "lumine_main_testi";
const REDIS_MACRO_KEY = "lumine_main_macro";
const REDIS_ORDER_SEQ_KEY = "lumine_main_order_seq";
const REDIS_ORDER_PREFIX = "lumine_main_order_";
const REDIS_PENDING_MAP_KEY = "lumine_main_pending_orders";
const REDIS_LB_PREFIX = "lumine_main_lb_";
const REDIS_LB_NAMES_KEY = "lumine_main_lb_names";
const REDIS_LB_ALLCNT_KEY = "lumine_main_lb_allcnt";
const REDIS_USERS_KEY = "lumine_main_users";
const REDIS_VOUCHERS_KEY = "lumine_main_vouchers";
const REDIS_USER_VOUCHER_PREFIX = "lumine_main_uv_";
const REDIS_KOLEKSI_PREFIX = "lumine_main_koleksi_";
const REDIS_MYSTERY_KEY = "lumine_main_mystery";
const REDIS_SALDO_KEY = "lumine_main_saldo";
const REDIS_RESELLER_KEY = "lumine_main_reseller";
const REDIS_RESELLER_OMSET_KEY = "lumine_main_reseller_omset";
const REDIS_RESELLER_OMSET_CNT_KEY = "lumine_main_reseller_omset_cnt";
const REDIS_STORE_OMSET_KEY = "lumine_main_store_omset";
const REDIS_STORE_OMSET_CNT_KEY = "lumine_main_store_omset_cnt";
const REDIS_RATING_KEY = "lumine_main_rating_list";
const REDIS_RATING_SUMMARY_KEY = "lumine_main_rating_summary";
const REDIS_RATING_PENDING_KEY = "lumine_main_rating_pending";
const REDIS_UPSELL_PREFIX = "lumine_main_upsell_";
const REDIS_RBOT_KEY = "lumine_main_rbots";
const REDIS_RBOT_MARGIN_KEY = "lumine_main_rb_margin";
const REDIS_RBOT_PAID_KEY = "lumine_main_rb_margin_paid";
const REDIS_RBOT_SALES_PREFIX = "lumine_main_rb_sales_";
const REDIS_RBOT_FILECACHE_KEY = "lumine_main_rb_filecache";
const REDIS_RBOT_LOCK_PREFIX = "lumine_main_rb_lock_";
const REDIS_WD_HELD_KEY = "lumine_main_wd_held"; // margin yang sedang "ditahan" untuk WD pending
const REDIS_WD_SEQ_KEY = "lumine_main_wd_seq";
const REDIS_WD_PREFIX = "lumine_main_wd_";
const REDIS_WD_PENDING_KEY = "lumine_main_wd_pending"; // hash: id WD -> owner
const REDIS_WD_HIST_PREFIX = "lumine_main_wd_hist_";
const REDIS_WD_LOCK_PREFIX = "lumine_main_wd_lock_";
const REDIS_WD_CH_KEY = "lumine_main_wd_channel";

// ---- PENGATURAN WD (TARIK MARGIN) RESELLER ----
const WD_ENABLED = true; // false = matikan fitur WD
const WD_MIN_AMOUNT = 10000; // minimal nominal sekali WD
const WD_FEE = 0; // biaya admin per WD (Rp). 0 = gratis. Dipotong dari nominal yang ditransfer.

// ---- PENGATURAN UNDANG TEMAN (REFERRAL) ----
const REFERRAL_ENABLED = true; // false = matikan fitur undang teman
const REFERRAL_REWARD_SALDO = 1500; // saldo untuk yang mengundang, per teman yang berhasil belanja
const REFERRAL_MONTHLY_CAP = 10; // maksimal teman yang dihitung per bulan per orang
const REFERRAL_MIN_PAID = 5000; // minimal nominal pembayaran asli (QRIS) teman agar bonus cair
const REFERRAL_FROM_ADMIN_SALDO = true; // true = bonus dipotong otomatis dari saldo admin (kas hadiah); false = bonus langsung ditambah tanpa potong
const REFERRAL_FUND_LOW_WARN = REFERRAL_REWARD_SALDO * 10; // admin diberi peringatan saat saldo kas turun di bawah ini
const REDIS_REF_FUND_KEY = "lumine_main_ref_fund"; // id akun admin yang jadi sumber saldo bonus
const RESELLER_MARGIN_FROM_ADMIN_SALDO = true; // true = margin tiap penjualan bot reseller dipotong otomatis dari saldo admin (kas)
const REDIS_REF_BY_KEY = "lumine_main_ref_by"; // hash: id teman -> id pengundang
const REDIS_REF_REWARDED_KEY = "lumine_main_ref_rewarded"; // hash: id teman yang bonusnya sudah diproses
const REDIS_REF_TOTAL_KEY = "lumine_main_ref_total"; // hash: id pengundang -> total teman berhasil
const REDIS_REF_MONTH_PREFIX = "lumine_main_ref_month_"; // hash per bulan: id pengundang -> jumlah

// Perbandingan string anti timing-attack
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return nodeCrypto.timingSafeEqual(ba, bb);
}

// Secret webhook Telegram bot utama. Bisa dioverride env WEBHOOK_SECRET; kalau kosong,
// diturunkan dari BOT_TOKEN (tidak perlu disimpan, dan tidak bisa ditebak tanpa token).
function getMainWebhookSecret(token) {
  if (process.env.WEBHOOK_SECRET) return String(process.env.WEBHOOK_SECRET);
  return nodeCrypto.createHmac("sha256", String(token)).update("lumine-main-webhook-v1").digest("hex");
}

// Cek admin lewat ID numerik (bukan username, karena username bisa diganti/dilepas orang lain).
//  1) Kalau env ADMIN_IDS diisi -> hanya ID itu yang admin.
//  2) Kalau belum: ID admin dikunci otomatis saat akun @ADMIN_USERNAME pertama kali chat, lalu hanya ID itu yang admin.
async function isAdminUser(from) {
  if (!from || !from.id) return false;
  const uid = String(from.id);
  if (ADMIN_IDS.length > 0) return ADMIN_IDS.includes(uid);

  const pinned = await redisCommand(["GET", REDIS_ADMIN_ID_KEY]);
  if (pinned) return String(pinned) === uid;

  const uname = String(from.username || "").toLowerCase();
  if (uname && uname === ADMIN_USERNAME.toLowerCase()) {
    await redisCommand(["SET", REDIS_ADMIN_ID_KEY, uid, "NX"]);
    const now = await redisCommand(["GET", REDIS_ADMIN_ID_KEY]);
    return String(now) === uid;
  }
  return false;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==========================================
// 2. FUNGSI DATABASE (UPSTASH REDIS REST API)
// ==========================================
async function redisCommand(commandArray) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Variabel database Redis belum terhubung di Vercel.");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commandArray),
  });

  const data = await res.json();
  return data.result;
}

async function getUserSaldo(userId) {
  const raw = await redisCommand(["HGET", REDIS_SALDO_KEY, String(userId)]);
  return parseInt(raw, 10) || 0;
}

async function addUserSaldo(userId, amount) {
  const addVal = Math.round(Number(amount) || 0);
  const res = await redisCommand(["HINCRBY", REDIS_SALDO_KEY, String(userId), addVal]);
  return parseInt(res, 10) || 0;
}

async function deductUserSaldo(userId, amount) {
  const cost = Math.round(Number(amount) || 0);
  if (cost <= 0) return { ok: true, balance: await getUserSaldo(userId) };
  const current = await getUserSaldo(userId);
  if (current < cost) return { ok: false, balance: current };

  const after = parseInt(
    await redisCommand(["HINCRBY", REDIS_SALDO_KEY, String(userId), -cost]),
    10
  );
  if (isNaN(after) || after < 0) {
    await redisCommand(["HINCRBY", REDIS_SALDO_KEY, String(userId), cost]);
    return { ok: false, balance: current };
  }
  return { ok: true, balance: after };
    }

// ---- MANAJEMEN RESELLER (ADD / DELETE / LIST / OMSET) ----
async function getResellerMap() {
  const raw = await redisCommand(["HGETALL", REDIS_RESELLER_KEY]);
  const map = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try {
        map[raw[i]] = JSON.parse(raw[i + 1]);
      } catch {
        map[raw[i]] = { nama: raw[i + 1] };
      }
    }
  }
  return map;
}

async function isReseller(userId) {
  const raw = await redisCommand(["HGET", REDIS_RESELLER_KEY, String(userId)]);
  return Boolean(raw);
}

async function addReseller(userId, nama) {
  const data = { nama: nama || "Reseller", joined: getWibTimestamp() };
  await redisCommand(["HSET", REDIS_RESELLER_KEY, String(userId), JSON.stringify(data)]);
  return data;
}

async function removeReseller(userId) {
  const res = await redisCommand(["HDEL", REDIS_RESELLER_KEY, String(userId)]);
  await redisCommand(["HDEL", REDIS_RESELLER_OMSET_KEY, String(userId)]);
  await redisCommand(["HDEL", REDIS_RESELLER_OMSET_CNT_KEY, String(userId)]);
  try {
    await removeResellerBot(userId);
  } catch (e) {
    console.error("removeResellerBot gagal:", e);
  }
  return parseInt(res, 10) > 0;
}

async function getResellerOmset(userId) {
  const [rp, cnt] = await Promise.all([
    redisCommand(["HGET", REDIS_RESELLER_OMSET_KEY, String(userId)]),
    redisCommand(["HGET", REDIS_RESELLER_OMSET_CNT_KEY, String(userId)]),
  ]);
  return { rupiah: parseInt(rp, 10) || 0, count: parseInt(cnt, 10) || 0 };
}

async function addResellerOmset(userId, nominal) {
  const add = Math.round(Number(nominal) || 0);
  const [rp, cnt] = await Promise.all([
    redisCommand(["HINCRBY", REDIS_RESELLER_OMSET_KEY, String(userId), add]),
    redisCommand(["HINCRBY", REDIS_RESELLER_OMSET_CNT_KEY, String(userId), 1]),
  ]);
  return { rupiah: parseInt(rp, 10) || 0, count: parseInt(cnt, 10) || 0, added: add };
}

// ---- TIER RESELLER: HITUNG & TAMPILAN ----
function getResellerTierInfo(omsetRupiah) {
  const omset = Number(omsetRupiah) || 0;
  let index = 0;
  for (let i = 0; i < RESELLER_TIERS.length; i++) {
    if (omset >= RESELLER_TIERS[i].min_omset) index = i;
  }
  const tier = RESELLER_TIERS[index];
  const next = RESELLER_TIERS[index + 1] || null;
  return {
    index,
    tier,
    next,
    remaining: next ? Math.max(0, next.min_omset - omset) : 0,
  };
}

function buildTierSummaryLines(info) {
  const t = info.tier;
  let out =
    `🏅 <b>Tier:</b> ${t.name}\n` +
    `💲 <b>Harga Tier:</b> Standar <code>${formatRupiah(t.price_lite)}</code> • Premium <code>${formatRupiah(t.price_standar)}</code>\n`;
  out += info.next
    ? `🎯 <b>Naik ke ${info.next.name}:</b> kurang <code>${formatRupiah(info.remaining)}</code> lagi`
    : "🏆 <b>Kamu sudah di tier tertinggi!</b>";
  return out;
}

function buildTierLadderBlock() {
  let out = "╭─── 💰 <b>HARGA RESELLER PER TIER</b> ───\n";
  for (const t of RESELLER_TIERS) {
    const syarat = t.min_omset > 0 ? `omset ≥ ${formatRupiah(t.min_omset)}` : "tier awal";
    out +=
      `│ ${t.name} <i>(${syarat})</i>\n` +
      `│    Standar <code>${formatRupiah(t.price_lite)}</code> • Premium <code>${formatRupiah(t.price_standar)}</code>\n`;
  }
  out += `│ • Minimal ambil : <b>${RESELLER_MIN_ORDER} set</b> per order\n`;
  out += "╰────────────────────\n\n";
  return out;
}

function buildMyTierBlock(omset, info) {
  const t = info.tier;
  let out =
    "╭─── 🏅 <b>TIER KAMU</b> ───\n" +
    `│ • Tier : <b>${t.name}</b>\n` +
    `│ • Omset : <code>${formatRupiah(omset.rupiah)}</code>\n` +
    `│ • <b>Paket Standar</b> : <code>${formatRupiah(t.price_lite)}</code>\n` +
    `│ • <b>Paket Premium</b> : <code>${formatRupiah(t.price_standar)}</code>\n` +
    `│ • Minimal ambil : <b>${RESELLER_MIN_ORDER} set</b> per order\n`;
  out += info.next
    ? `│ 🎯 Naik ke <b>${info.next.name}</b> kurang <code>${formatRupiah(info.remaining)}</code> lagi ` +
      `(Standar ${formatRupiah(info.next.price_lite)} • Premium ${formatRupiah(info.next.price_standar)})\n`
    : "│ 🏆 Kamu sudah di tier tertinggi!\n";
  out += "╰────────────────────\n\n";
  return out;
}

async function notifyResellerTierUp(token, order, result) {
  const before = getResellerTierInfo(result.rupiah - result.added);
  const after = getResellerTierInfo(result.rupiah);
  if (after.index <= before.index) return;

  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    text:
      `🎉 <b>SELAMAT, KAMU NAIK TIER!</b>\n\n` +
      `${before.tier.name} ➜ <b>${after.tier.name}</b>\n\n` +
      `💲 <b>Harga baru:</b> Standar <code>${formatRupiah(after.tier.price_lite)}</code> • Premium <code>${formatRupiah(after.tier.price_standar)}</code>\n\n` +
      `<i>Hubungi admin saat order grosir biar harga tier barumu dipakai ya!</i>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "📊 Cek Omset Saya", callback_data: "reseller_omset_self" }]],
    },
  });

  const qris = await getQris();
  if (qris && qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: qris.admin_chat_id,
      text:
        `🏅 <b>RESELLER NAIK TIER</b>\n\n` +
        `👤 ${escapeHtml(order.buyer_name)} (<code>${escapeHtml(String(order.buyer_id))}</code>)\n` +
        `${before.tier.name} ➜ <b>${after.tier.name}</b>\n` +
        `💰 Omset: <code>${formatRupiah(result.rupiah)}</code>`,
      parse_mode: "HTML",
    });
  }
}

async function addStoreOmset(nominal) {
  await Promise.all([
    redisCommand(["INCRBY", REDIS_STORE_OMSET_KEY, Math.round(Number(nominal) || 0)]),
    redisCommand(["INCR", REDIS_STORE_OMSET_CNT_KEY]),
  ]);
}

async function getStoreOmset() {
  const [rp, cnt] = await Promise.all([
    redisCommand(["GET", REDIS_STORE_OMSET_KEY]),
    redisCommand(["GET", REDIS_STORE_OMSET_CNT_KEY]),
  ]);
  return { rupiah: parseInt(rp, 10) || 0, count: parseInt(cnt, 10) || 0 };
}

// ---- RATING & ULASAN PEMBELI (BINTANG 1-5 + KOMENTAR) ----
async function setPendingRating(userId, orderId, stars) {
  await redisCommand([
    "HSET",
    REDIS_RATING_PENDING_KEY,
    String(userId),
    JSON.stringify({ order_id: orderId, stars }),
  ]);
}

async function getPendingRating(userId) {
  const raw = await redisCommand(["HGET", REDIS_RATING_PENDING_KEY, String(userId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearPendingRating(userId) {
  await redisCommand(["HDEL", REDIS_RATING_PENDING_KEY, String(userId)]);
}

async function saveRating(orderId, userId, buyerName, stars, komentar) {
  const raw = await redisCommand(["GET", REDIS_RATING_KEY]);
  let list = [];
  if (raw) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  list.unshift({
    order_id: orderId,
    buyer_id: userId,
    buyer_name: buyerName,
    stars: Math.min(5, Math.max(1, Number(stars) || 5)),
    komentar: komentar || "",
    waktu: getWibTimestamp(),
  });
  if (list.length > 100) list.length = 100;
  await Promise.all([
    redisCommand(["SET", REDIS_RATING_KEY, JSON.stringify(list)]),
    redisCommand(["HINCRBY", REDIS_RATING_SUMMARY_KEY, "total_stars", Math.min(5, Math.max(1, Number(stars) || 5))]),
    redisCommand(["HINCRBY", REDIS_RATING_SUMMARY_KEY, "total_count", 1]),
  ]);
}

async function getRatingSummary() {
  const raw = await redisCommand(["HGETALL", REDIS_RATING_SUMMARY_KEY]);
  let totalStars = 0;
  let totalCount = 0;
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i] === "total_stars") totalStars = parseInt(raw[i + 1], 10) || 0;
      if (raw[i] === "total_count") totalCount = parseInt(raw[i + 1], 10) || 0;
    }
  }
  const avg = totalCount > 0 ? totalStars / totalCount : 0;
  return { avg, totalCount };
}

async function getRecentRatings(limit = 10) {
  const raw = await redisCommand(["GET", REDIS_RATING_KEY]);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return list.slice(0, limit);
  } catch {
    return [];
  }
}

async function getKatalog() {
  const raw = await redisCommand(["GET", REDIS_KEY]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveKatalog(list) {
  await redisCommand(["SET", REDIS_KEY, JSON.stringify(list)]);
}

async function getQris() {
  const raw = await redisCommand(["GET", REDIS_QRIS_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveQris(qrisData) {
  await redisCommand(["SET", REDIS_QRIS_KEY, JSON.stringify(qrisData)]);
}

async function getBanner() {
  const raw = await redisCommand(["GET", REDIS_BANNER_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveBanner(bannerData) {
  if (!bannerData) {
    await redisCommand(["DEL", REDIS_BANNER_KEY]);
    return;
  }
  await redisCommand(["SET", REDIS_BANNER_KEY, JSON.stringify(bannerData)]);
}

async function getTestiConfig() {
  const raw = await redisCommand(["GET", REDIS_TESTI_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTestiConfig(cfg) {
  if (!cfg) {
    await redisCommand(["DEL", REDIS_TESTI_KEY]);
    return;
  }
  await redisCommand(["SET", REDIS_TESTI_KEY, JSON.stringify(cfg)]);
}

// Secret efektif: Redis (/setmacro) -> env MACRO_SECRET. Secret lama bawaan kode TIDAK dipakai lagi.
function resolveMacroSecret(stored) {
  for (const c of [stored, process.env.MACRO_SECRET]) {
    const s = String(c || "").trim();
    if (s && s !== DEFAULT_MACRO_SECRET) return s;
  }
  return "";
}

async function getMacroConfig() {
  const raw = await redisCommand(["GET", REDIS_MACRO_KEY]);
  if (!raw) {
    return { enabled: true, secret: resolveMacroSecret(""), host: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      secret: resolveMacroSecret(parsed.secret),
      host: parsed.host || "",
    };
  } catch {
    return { enabled: true, secret: resolveMacroSecret(""), host: "" };
  }
}

async function saveMacroConfig(cfg) {
  await redisCommand(["SET", REDIS_MACRO_KEY, JSON.stringify(cfg)]);
}

async function getMysteryConfig() {
  const raw = await redisCommand(["GET", REDIS_MYSTERY_KEY]);
  if (!raw) return { enabled: true, price: 3000 };
  try {
    return JSON.parse(raw);
  } catch {
    return { enabled: true, price: 3000 };
  }
}

async function saveMysteryConfig(cfg) {
  await redisCommand(["SET", REDIS_MYSTERY_KEY, JSON.stringify(cfg)]);
}

// ---- PELUANG GACHA BERTINGKAT (paket murah lebih sering keluar) ----
// Rasio 3 = paket tier termurah keluar 3x lebih sering dari tier di atasnya.
// Contoh 2 harga (5rb & 10rb): 75% / 25%. Naikkan angka = makin jarang paket mahal.
const MYSTERY_TIER_RATIO = 3;

function getMysteryTiers(items) {
  const byPrice = new Map();
  for (const it of items) {
    const price = parseNominal(it.harga);
    if (!byPrice.has(price)) byPrice.set(price, []);
    byPrice.get(price).push(it);
  }
  const prices = [...byPrice.keys()].sort((a, b) => a - b);
  const weights = prices.map((_, i) => Math.pow(MYSTERY_TIER_RATIO, prices.length - 1 - i));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return prices.map((price, i) => ({
    price,
    items: byPrice.get(price),
    weight: weights[i],
    chance: Math.round((weights[i] / total) * 100),
  }));
}

function pickMysteryPrize(items) {
  const tiers = getMysteryTiers(items);
  if (tiers.length === 0) return null;
  const total = tiers.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  let chosen = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (r < t.weight) {
      chosen = t;
      break;
    }
    r -= t.weight;
  }
  return chosen.items[Math.floor(Math.random() * chosen.items.length)];
}

// ---- UNDANG TEMAN (REFERRAL) ----
async function recordReferral(inviteeId, referrerRaw, isNewUser) {
  if (!REFERRAL_ENABLED || !isNewUser) return false;
  const referrerId = String(referrerRaw || "");
  if (!inviteeId || !referrerId || referrerId === String(inviteeId)) return false;
  const known = await redisCommand(["SISMEMBER", REDIS_USERS_KEY, referrerId]);
  if (Number(known) !== 1) return false;
  const set = await redisCommand(["HSETNX", REDIS_REF_BY_KEY, String(inviteeId), referrerId]);
  return Number(set) === 1;
}

async function getReferralFundId() {
  const stored = await redisCommand(["GET", REDIS_REF_FUND_KEY]);
  if (stored) return String(stored);
  const qris = await getQris();
  return qris && qris.admin_chat_id ? String(qris.admin_chat_id) : null;
}

// Margin penjualan bot reseller dipotong dari saldo kas admin. Tidak pernah memblokir margin
// (pembeli sudah bayar), jadi saldo kas boleh minus sebagai tanda admin perlu isi ulang.
async function chargeFundForMargin(token, margin, ownerName) {
  if (!RESELLER_MARGIN_FROM_ADMIN_SALDO || !(margin > 0)) return;
  const fundId = await getReferralFundId();
  if (!fundId) return;

  const after = parseInt(await redisCommand(["HINCRBY", REDIS_SALDO_KEY, String(fundId), -Math.round(margin)]), 10);
  if (isNaN(after)) return;
  const before = after + Math.round(margin);

  if (before >= 0 && after < 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: fundId,
      text:
        `🚨 <b>Saldo kas MINUS ${formatRupiah(Math.abs(after))}!</b>\n` +
        `Margin penjualan reseller <b>${escapeHtml(ownerName || "Reseller")}</b> (${formatRupiah(margin)}) sudah dipotong.\n` +
        `Bonus Undang Teman ditahan sampai kas diisi ulang.\n` +
        `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>`,
      parse_mode: "HTML",
    });
  } else if (before >= REFERRAL_FUND_LOW_WARN && after < REFERRAL_FUND_LOW_WARN) {
    await tgRequest(token, "sendMessage", {
      chat_id: fundId,
      text:
        `🔔 <b>Saldo kas tinggal ${formatRupiah(after)}.</b>\n` +
        `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>`,
      parse_mode: "HTML",
    });
  }
}

async function maybeRewardReferral(token, order) {
  if (!REFERRAL_ENABLED || !order || order.rbot_owner) return;
  // Hanya pembayaran uang asli (QRIS): deposit, atau pembelian yang bukan pakai saldo
  const realMoney = Boolean(order.is_deposit) || !order.paid_with_saldo;
  if (!realMoney) return;
  const paid = Number(order.final_base_nominal || order.base_nominal) || 0;
  if (paid < REFERRAL_MIN_PAID) return;

  const inviteeId = String(order.buyer_id);
  const referrerId = await redisCommand(["HGET", REDIS_REF_BY_KEY, inviteeId]);
  if (!referrerId) return;

  // Klaim satu kali per teman (aman walau ACC terpanggil dua kali)
  const claimed = await redisCommand(["HSETNX", REDIS_REF_REWARDED_KEY, inviteeId, "1"]);
  if (Number(claimed) !== 1) return;

  const { monthKey } = getWibPeriods();
  const cntKey = `${REDIS_REF_MONTH_PREFIX}${monthKey}`;
  const used = parseInt(await redisCommand(["HINCRBY", cntKey, String(referrerId), 1]), 10) || 0;
  await redisCommand(["EXPIRE", cntKey, String(60 * 60 * 24 * 70)]);

  const friendName = escapeHtml(order.buyer_name || "Temanmu");
  if (used > REFERRAL_MONTHLY_CAP) {
    await tgRequest(token, "sendMessage", {
      chat_id: referrerId,
      text:
        `👥 Teman kamu <b>${friendName}</b> baru saja belanja, tapi batas bonus undang teman bulan ini ` +
        `(${REFERRAL_MONTHLY_CAP} teman) sudah tercapai. Bonus berlaku lagi bulan depan ya!`,
      parse_mode: "HTML",
    });
    return;
  }

  // Batalkan klaim bila bonus gagal dibayar, supaya bisa dicoba lagi di pembayaran teman berikutnya
  const undoClaim = async () => {
    await redisCommand(["HDEL", REDIS_REF_REWARDED_KEY, inviteeId]);
    await redisCommand(["HINCRBY", cntKey, String(referrerId), -1]);
  };

  // Potong otomatis dari saldo admin (kas hadiah)
  const fundId = REFERRAL_FROM_ADMIN_SALDO ? await getReferralFundId() : null;
  let fundBalance = null;
  if (fundId) {
    const d = await deductUserSaldo(fundId, REFERRAL_REWARD_SALDO);
    if (!d.ok) {
      await undoClaim();
      await tgRequest(token, "sendMessage", {
        chat_id: fundId,
        text:
          `⚠️ <b>Saldo kas hadiah tidak cukup!</b>\n\n` +
          `Bonus undang teman <b>${formatRupiah(REFERRAL_REWARD_SALDO)}</b> untuk pengundang <code>${escapeHtml(referrerId)}</code> ` +
          `(teman: ${friendName}) ditahan.\n` +
          `💳 Saldo kas: <b>${formatRupiah(d.balance)}</b>\n\n` +
          `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>\n` +
          `<i>Bonus akan dicoba lagi saat teman itu bayar berikutnya.</i>`,
        parse_mode: "HTML",
      });
      return;
    }
    fundBalance = d.balance;
  }

  let newSaldo;
  try {
    newSaldo = await addUserSaldo(referrerId, REFERRAL_REWARD_SALDO);
  } catch (addErr) {
    // kembalikan saldo kas bila gagal menambah ke pengundang
    if (fundId) await addUserSaldo(fundId, REFERRAL_REWARD_SALDO);
    await undoClaim();
    throw addErr;
  }
  await redisCommand(["HINCRBY", REDIS_REF_TOTAL_KEY, String(referrerId), 1]);
  await tgRequest(token, "sendMessage", {
    chat_id: referrerId,
    text:
      `🎉 <b>BONUS UNDANG TEMAN!</b>\n\n` +
      `Teman kamu <b>${friendName}</b> baru saja belanja pertama kali.\n` +
      `💰 Saldo masuk: <b>+${formatRupiah(REFERRAL_REWARD_SALDO)}</b>\n` +
      `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>`,
    parse_mode: "HTML",
  });

  // Peringatan sekali saat saldo kas melewati batas bawah
  if (fundId && fundBalance !== null) {
    const before = fundBalance + REFERRAL_REWARD_SALDO;
    if (before >= REFERRAL_FUND_LOW_WARN && fundBalance < REFERRAL_FUND_LOW_WARN) {
      await tgRequest(token, "sendMessage", {
        chat_id: fundId,
        text:
          `🔔 <b>Saldo kas hadiah tinggal ${formatRupiah(fundBalance)}.</b>\n` +
          `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>`,
        parse_mode: "HTML",
      });
    }
  }
}

async function sendReferralMenu(token, chatId, userId) {
  if (!REFERRAL_ENABLED) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🎁 Fitur Undang Teman sedang tidak aktif.",
    });
    return;
  }
  const me = await tgRequest(token, "getMe", {});
  const botUsername = (me && me.result && me.result.username) || "";
  const link = botUsername ? `https://t.me/${botUsername}?start=ref_${userId}` : "";
  const total = parseInt(await redisCommand(["HGET", REDIS_REF_TOTAL_KEY, String(userId)]), 10) || 0;
  const { monthKey } = getWibPeriods();
  const usedRaw =
    parseInt(await redisCommand(["HGET", `${REDIS_REF_MONTH_PREFIX}${monthKey}`, String(userId)]), 10) || 0;
  const usedMonth = Math.min(REFERRAL_MONTHLY_CAP, usedRaw);

  const rows = [];
  if (link) {
    rows.push([
      {
        text: "📤 Bagikan ke Teman",
        url:
          "https://t.me/share/url?url=" +
          encodeURIComponent(link) +
          "&text=" +
          encodeURIComponent("Yuk beli photopack HD di Lumine Photopack Store!"),
      },
    ]);
  }
  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🎁 <b>UNDANG TEMAN, DAPAT SALDO</b>\n\n" +
      `Bagikan link kamu. Setiap teman baru yang belanja pertama kali, kamu dapat <b>${formatRupiah(REFERRAL_REWARD_SALDO)}</b> saldo!\n\n` +
      (link ? `🔗 <b>Link kamu:</b>\n<code>${escapeHtml(link)}</code>\n\n` : "") +
      `👥 Teman berhasil: <b>${total}</b>\n` +
      `📅 Bulan ini: <b>${usedMonth}/${REFERRAL_MONTHLY_CAP}</b>\n\n` +
      "<b>Syarat:</b>\n" +
      "• Teman harus pengguna baru yang masuk lewat link kamu\n" +
      `• Bonus cair setelah teman bayar minimal ${formatRupiah(REFERRAL_MIN_PAID)} (QRIS / deposit)\n` +
      `• Maksimal ${REFERRAL_MONTHLY_CAP} teman per bulan`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function getVouchers() {
  const raw = await redisCommand(["GET", REDIS_VOUCHERS_KEY]);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveVouchers(vouchersMap) {
  await redisCommand(["SET", REDIS_VOUCHERS_KEY, JSON.stringify(vouchersMap)]);
}

async function getActiveUserVoucher(userId) {
  const code = await redisCommand(["GET", `${REDIS_USER_VOUCHER_PREFIX}${userId}`]);
  if (!code) return null;
  const vouchers = await getVouchers();
  const v = vouchers[String(code).toUpperCase()];
  if (!v || v.quota <= 0) return null;
  if (Array.isArray(v.used_by) && v.used_by.includes(String(userId))) return null;
  return v;
}

async function setActiveUserVoucher(userId, code) {
  await redisCommand([
    "SET",
    `${REDIS_USER_VOUCHER_PREFIX}${userId}`,
    String(code).toUpperCase(),
    "EX",
    "86400",
  ]);
}

async function clearActiveUserVoucher(userId) {
  await redisCommand(["DEL", `${REDIS_USER_VOUCHER_PREFIX}${userId}`]);
      }
    async function getKoleksi(userId) {
  const raw = await redisCommand(["GET", `${REDIS_KOLEKSI_PREFIX}${userId}`]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function addKoleksi(userId, itemNama, itemLink) {
  const list = await getKoleksi(userId);
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yy = wib.getUTCFullYear();
  list.unshift({
    nama: itemNama,
    link: itemLink,
    date: `${dd}/${mm}/${yy}`,
  });
  if (list.length > 30) list.length = 30;
  await redisCommand(["SET", `${REDIS_KOLEKSI_PREFIX}${userId}`, JSON.stringify(list)]);
}

async function getOrder(orderId) {
  const raw = await redisCommand(["GET", `${REDIS_ORDER_PREFIX}${orderId}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveOrder(orderId, orderData) {
  await redisCommand([
    "SET",
    `${REDIS_ORDER_PREFIX}${orderId}`,
    JSON.stringify(orderData),
    "EX",
    "172800",
  ]);
  if (orderData.status === "pending" || orderData.status === "waiting_acc") {
    await redisCommand([
      "HSET",
      REDIS_PENDING_MAP_KEY,
      String(orderId),
      String(orderData.total_nominal),
    ]);
  } else {
    await redisCommand(["HDEL", REDIS_PENDING_MAP_KEY, String(orderId)]);
  }
}

function extractNominalsFromNotif(rawText) {
  const cleaned = String(rawText || "").replace(/([.,]00)(?!\d)/g, "");
  const matches = cleaned.match(/\d[\d.,]*/g) || [];
  const results = [];
  for (const m of matches) {
    const num = parseInt(m.replace(/\D/g, ""), 10);
    if (num >= 500 && num <= 10000000 && !results.includes(num)) {
      results.push(num);
    }
  }
  return results;
}

async function findPendingOrderByNominals(nominalList) {
  if (!Array.isArray(nominalList) || nominalList.length === 0) return null;
  const rawMap = await redisCommand(["HGETALL", REDIS_PENDING_MAP_KEY]);
  if (!Array.isArray(rawMap) || rawMap.length === 0) return null;

  const candidates = [];
  for (let i = 0; i < rawMap.length; i += 2) {
    const oid = rawMap[i];
    const nom = parseInt(rawMap[i + 1], 10) || 0;
    if (nominalList.includes(nom)) {
      candidates.push({ orderId: oid, nominal: nom });
    }
  }

  candidates.sort((a, b) => Number(b.orderId) - Number(a.orderId));

  for (const c of candidates) {
    const order = await getOrder(c.orderId);
    if (order && (order.status === "pending" || order.status === "waiting_acc")) {
      return order;
    } else {
      await redisCommand(["HDEL", REDIS_PENDING_MAP_KEY, String(c.orderId)]);
    }
  }
  return null;
}

function parseNominal(hargaStr) {
  const angka = parseInt(String(hargaStr || "").replace(/\D/g, ""), 10);
  return angka && angka >= 100 ? angka : RETAIL_PRICE_LITE;
}

function formatRupiah(angka) {
  return "Rp " + Number(angka).toLocaleString("id-ID");
}

function getTierBadge(totalPurchases) {
  const n = Number(totalPurchases) || 0;
  if (n >= 7) return "👑 Sultan Lumine";
  if (n >= 4) return "💎 VIP Member";
  if (n >= 2) return "🔥 Collector";
  if (n >= 1) return "🌱 Newbie";
  return "👤 Member";
}

function getRankedKatalog(katalogList) {
  const withSales = katalogList
    .map((item) => ({ id: String(item.id), sold: Number(item.sold) || 0 }))
    .filter((x) => x.sold > 0)
    .sort((a, b) => b.sold - a.sold);

  const rankMap = {};
  withSales.forEach((x, idx) => {
    rankMap[x.id] = idx + 1;
  });
  return rankMap;
}

function getCreatorGroups(items) {
  const map = new Map();
  for (const item of items || []) {
    const raw = String((item && item.creator) || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { key, name: raw, items: [] });
    }
    map.get(key).items.push(item);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "id", { sensitivity: "base" })
  );
}

function maskUsername(rawUsername) {
  if (!rawUsername || rawUsername === "Tanpa Username") return "Member Lumine";
  const clean = rawUsername.replace(/^@/, "");
  if (clean.length <= 3) return `@${clean[0]}***`;
  return `@${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

function getWibTimestamp() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const min = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} • ${hh}:${min} WIB`;
}
// ==========================================
// 3. SISTEM LEADERBOARD, TIER & ORDER
// ==========================================
function getWibPeriods() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wib.getUTCDate()).padStart(2, "0");

  const dayKey = `${y}-${m}-${d}`;
  const monthKey = `${y}-${m}`;

  const dayOfWeek = wib.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(Date.UTC(y, wib.getUTCMonth(), wib.getUTCDate() + diffToMonday));
  const wy = monday.getUTCFullYear();
  const wm = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const wd = String(monday.getUTCDate()).padStart(2, "0");
  const weekKey = `${wy}-${wm}-${wd}`;

  return { dayKey, weekKey, monthKey };
}

async function recordPurchaseToLeaderboard(order) {
  const { dayKey, weekKey, monthKey } = getWibPeriods();
  const memberId = String(order.buyer_id);
  const nominal = Number(order.final_base_nominal || order.base_nominal) || 2000;
  const displayName = order.buyer_name || "Pembeli";

  const kDayRp = `${REDIS_LB_PREFIX}day_rp_${dayKey}`;
  const kDayCnt = `${REDIS_LB_PREFIX}day_cnt_${dayKey}`;
  const kWeekRp = `${REDIS_LB_PREFIX}week_rp_${weekKey}`;
  const kWeekCnt = `${REDIS_LB_PREFIX}week_cnt_${weekKey}`;
  const kMonthRp = `${REDIS_LB_PREFIX}month_rp_${monthKey}`;
  const kMonthCnt = `${REDIS_LB_PREFIX}month_cnt_${monthKey}`;

  await Promise.all([
    redisCommand(["HSET", REDIS_LB_NAMES_KEY, memberId, displayName]),
    redisCommand(["HINCRBY", REDIS_LB_ALLCNT_KEY, memberId, 1]),
    redisCommand(["ZINCRBY", kDayRp, nominal, memberId]),
    redisCommand(["ZINCRBY", kDayCnt, 1, memberId]),
    redisCommand(["ZINCRBY", kWeekRp, nominal, memberId]),
    redisCommand(["ZINCRBY", kWeekCnt, 1, memberId]),
    redisCommand(["ZINCRBY", kMonthRp, nominal, memberId]),
    redisCommand(["ZINCRBY", kMonthCnt, 1, memberId]),
    redisCommand(["EXPIRE", kDayRp, "259200"]),
    redisCommand(["EXPIRE", kDayCnt, "259200"]),
    redisCommand(["EXPIRE", kWeekRp, "1209600"]),
    redisCommand(["EXPIRE", kWeekCnt, "1209600"]),
    redisCommand(["EXPIRE", kMonthRp, "5184000"]),
    redisCommand(["EXPIRE", kMonthCnt, "5184000"]),
  ]);
}

async function buildLeaderboardPayload(period, viewerId) {
  const { dayKey, weekKey, monthKey } = getWibPeriods();

  let titleLabel = "BULAN INI";
  let rpKey = `${REDIS_LB_PREFIX}month_rp_${monthKey}`;
  let cntKey = `${REDIS_LB_PREFIX}month_cnt_${monthKey}`;

  if (period === "day") {
    titleLabel = "HARI INI";
    rpKey = `${REDIS_LB_PREFIX}day_rp_${dayKey}`;
    cntKey = `${REDIS_LB_PREFIX}day_cnt_${dayKey}`;
  } else if (period === "week") {
    titleLabel = "MINGGU INI";
    rpKey = `${REDIS_LB_PREFIX}week_rp_${weekKey}`;
    cntKey = `${REDIS_LB_PREFIX}week_cnt_${weekKey}`;
  }

  const viewerStr = String(viewerId);
  const [rawTop, viewerRank, viewerRp, viewerCnt, viewerAllCnt] = await Promise.all([
    redisCommand(["ZREVRANGE", rpKey, "0", "9", "WITHSCORES"]),
    redisCommand(["ZREVRANK", rpKey, viewerStr]),
    redisCommand(["ZSCORE", rpKey, viewerStr]),
    redisCommand(["ZSCORE", cntKey, viewerStr]),
    redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, viewerStr]),
  ]);

  let listLines = "";
  if (!Array.isArray(rawTop) || rawTop.length === 0) {
    listLines =
      "│ <i>Belum ada transaksi pada periode ini.</i>\n" +
      "│ <i>Jadilah pembeli #1 sekarang!</i>\n";
  } else {
    const userIds = [];
    const totals = [];
    for (let i = 0; i < rawTop.length; i += 2) {
      userIds.push(rawTop[i]);
      totals.push(parseInt(rawTop[i + 1], 10) || 0);
    }

    const [names, counts, allCounts] = await Promise.all([
      redisCommand(["HMGET", REDIS_LB_NAMES_KEY, ...userIds]),
      redisCommand(["HMGET", cntKey, ...userIds]),
      redisCommand(["HMGET", REDIS_LB_ALLCNT_KEY, ...userIds]),
    ]);

    const medals = ["🥇", "🥈", "🥉"];
    for (let idx = 0; idx < userIds.length; idx++) {
      const rankBadge = idx < 3 ? medals[idx] : `<b>${idx + 1}.</b>`;
      const rawName = (Array.isArray(names) && names[idx]) || "Pembeli";
      const buyCount = parseInt((Array.isArray(counts) && counts[idx]) || "1", 10) || 1;
      const lifetimeCount =
        parseInt((Array.isArray(allCounts) && allCounts[idx]) || String(buyCount), 10) || buyCount;
      const tier = getTierBadge(lifetimeCount);
      listLines += `│ ${rankBadge} <b>${escapeHtml(rawName)}</b> [${tier}]\n│     └ ${buyCount}x beli (<code>${formatRupiah(totals[idx])}</code>)\n`;
    }
  }

  const myTier = getTierBadge(viewerAllCnt || 0);
  let myRankText = `📍 <b>Status Kamu:</b> [${myTier}] • <i>Belum ada transaksi periode ini</i>`;
  if (viewerRank !== null && viewerRank !== undefined) {
    const myRankNum = Number(viewerRank) + 1;
    const myRpNum = parseInt(viewerRp, 10) || 0;
    const myCntNum = parseInt(viewerCnt, 10) || 1;
    myRankText = `📍 <b>Posisi Kamu:</b> Peringkat <b>#${myRankNum}</b> [${myTier}]\n     (${myCntNum}x beli • <code>${formatRupiah(myRpNum)}</code>)`;
  }

  const text =
    `🏆 <b>LEADERBOARD TOP BUYER — ${titleLabel}</b>\n` +
    `<i>Peringkat pembeli terbanyak & gelar loyalitas:</i>\n\n` +
    (period === "month" ? buildLbRewardLine() : "") +
    `╭─── 👑 <b>KLASEMEN TOP 10</b> ───\n` +
    listLines +
    `╰─────────────────────\n\n` +
    myRankText;

  const reply_markup = {
    inline_keyboard: [
      [
        { text: period === "day" ? "• 📅 Hari Ini •" : "📅 Hari Ini", callback_data: "lb_day" },
        { text: period === "week" ? "• 📆 Minggu Ini •" : "📆 Minggu Ini", callback_data: "lb_week" },
        { text: period === "month" ? "• 🏆 Bulan Ini •" : "🏆 Bulan Ini", callback_data: "lb_month" },
      ],
      [
        { text: "🛍️ Belanja Biar Naik Rank", callback_data: "menu_katalog" },
        { text: "🔙 Menu Utama", callback_data: "menu_home" },
      ],
    ],
  };

  return { text, reply_markup };
}
// ---- HADIAH LEADERBOARD BULANAN ----
function getPrevMonthKey() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  let y = wib.getUTCFullYear();
  let m = wib.getUTCMonth(); // 0-11 = bulan sekarang; sebagai 1-12 itu bulan lalu
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function buildLbRewardLine() {
  if (!LB_REWARD_ENABLED) return "";
  const medals = ["🥇", "🥈", "🥉"];
  const parts = LB_REWARD_SALDO.map((v, i) => `${medals[i]} ${formatRupiah(v)}`);
  return `🎁 <b>Hadiah Top 3 bulan ini (saldo):</b> ${parts.join(" • ")}\n` +
    `<i>Min. belanja ${formatRupiah(LB_REWARD_MIN_OMSET)} • dibagikan otomatis awal bulan depan</i>\n\n`;
}

// Bagikan hadiah untuk bulan tertentu. Aman dipanggil berkali-kali: hanya jalan sekali per bulan (lock).
async function awardMonthlyLeaderboard(token, monthKey) {
  if (!LB_REWARD_ENABLED) return { ok: false, reason: "disabled" };
  const lockKey = `${REDIS_LB_REWARD_LOCK_PREFIX}${monthKey}`;
  const lock = await redisCommand(["SET", lockKey, "1", "NX", "EX", "5184000"]);
  if (!lock) return { ok: false, reason: "already" };

  const raw = await redisCommand([
    "ZREVRANGE",
    `${REDIS_LB_PREFIX}month_rp_${monthKey}`,
    "0",
    String(LB_REWARD_SALDO.length - 1),
    "WITHSCORES",
  ]);
  const winners = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      winners.push({ userId: raw[i], total: parseInt(raw[i + 1], 10) || 0 });
    }
  }
  const names = winners.length
    ? (await redisCommand(["HMGET", REDIS_LB_NAMES_KEY, ...winners.map((w) => w.userId)])) || []
    : [];

  const medals = ["🥇", "🥈", "🥉"];
  const awarded = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    if (w.total < LB_REWARD_MIN_OMSET) continue;
    const hadiah = LB_REWARD_SALDO[i];
    const saldoBaru = await addUserSaldo(w.userId, hadiah);
    awarded.push({ rank: i + 1, userId: w.userId, nama: names[i] || "Pembeli", total: w.total, hadiah });

    await tgRequest(token, "sendMessage", {
      chat_id: w.userId,
      text:
        `🏆 <b>SELAMAT! KAMU PERINGKAT #${i + 1} LEADERBOARD ${monthKey}</b> ${medals[i]}\n\n` +
        `🎁 <b>Hadiah:</b> +<code>${formatRupiah(hadiah)}</code> saldo\n` +
        `💳 <b>Saldo Kamu Sekarang:</b> <code>${formatRupiah(saldoBaru)}</code>\n\n` +
        "<i>Makasih udah jadi pembeli setia! Gas lagi bulan ini biar naik peringkat 💜</i>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🛍️ Belanja Pakai Saldo", callback_data: "menu_katalog" }]],
      },
    }).catch(() => {});
  }

  if (awarded.length > 0) {
    const lines = awarded
      .map((a) => `${medals[a.rank - 1]} <b>${escapeHtml(a.nama)}</b> — ${formatRupiah(a.total)} ➜ +${formatRupiah(a.hadiah)}`)
      .join("\n");

    const testi = await getTestiConfig();
    if (testi && testi.channel_id) {
      const payload = {
        chat_id: testi.channel_id,
        text:
          `🏆 <b>PEMENANG LEADERBOARD ${monthKey}</b>\n` +
          "━━━━━━━━━━━━━━━━━━━━\n" +
          lines +
          "\n━━━━━━━━━━━━━━━━━━━━\n" +
          "🎁 <i>Hadiah saldo sudah masuk otomatis. Mau ikutan bulan ini? Belanja terus ya!</i>",
        parse_mode: "HTML",
      };
      if (testi.bot_username) {
        payload.reply_markup = {
          inline_keyboard: [[{ text: "🛍️ Belanja Sekarang", url: `https://t.me/${testi.bot_username}` }]],
        };
      }
      await tgRequest(token, "sendMessage", payload).catch(() => {});
    }

    const qris = await getQris();
    if (qris && qris.admin_chat_id) {
      await tgRequest(token, "sendMessage", {
        chat_id: qris.admin_chat_id,
        text: `🎁 <b>HADIAH LEADERBOARD ${monthKey} DIBAGIKAN</b>\n\n${lines}`,
        parse_mode: "HTML",
      }).catch(() => {});
    }
  }
  return { ok: true, awarded };
}

// Dipanggil tiap ada pesan masuk: cek murah (1 GET), baru jalan kalau bulan lalu belum dibagikan.
async function maybeAwardLastMonth(token) {
  if (!LB_REWARD_ENABLED) return;
  const monthKey = getPrevMonthKey();
  const done = await redisCommand(["GET", `${REDIS_LB_REWARD_LOCK_PREFIX}${monthKey}`]);
  if (done) return;
  await awardMonthlyLeaderboard(token, monthKey);
}

// ---- UPSELL: PENAWARAN SET BERIKUTNYA SETELAH ACC ----
function formatWibClock(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} WIB`;
}

function calcUpsellDiscount(baseNominal, percent) {
  const base = Number(baseNominal) || 0;
  const raw = Math.round(((base * (Number(percent) || 0)) / 100) / 50) * 50;
  return Math.max(0, Math.min(raw, base - 500));
}

async function getUpsellOffer(userId) {
  const raw = await redisCommand(["GET", `${REDIS_UPSELL_PREFIX}${userId}`]);
  if (!raw) return null;
  try {
    const offer = JSON.parse(raw);
    if (!offer || !offer.item_id || Number(offer.expires_at) <= Date.now()) return null;
    return offer;
  } catch {
    return null;
  }
}

async function saveUpsellOffer(userId, offer) {
  await redisCommand([
    "SET",
    `${REDIS_UPSELL_PREFIX}${userId}`,
    JSON.stringify(offer),
    "EX",
    String(UPSELL_WINDOW_MINUTES * 60 + 60),
  ]);
}

async function clearUpsellOffer(userId) {
  await redisCommand(["DEL", `${REDIS_UPSELL_PREFIX}${userId}`]);
}

// Pilih diskon terbaik (tidak ditumpuk): voucher aktif ATAU penawaran upsell untuk set tsb.
async function resolveBestDiscount(userId, itemId, baseNominal) {
  const maxCut = Math.max(0, baseNominal - 500);

  let voucherDisc = 0;
  let voucher = null;
  const activeVoucher = await getActiveUserVoucher(userId);
  if (activeVoucher) {
    voucherDisc = Math.min(Number(activeVoucher.discount) || 0, maxCut);
    if (voucherDisc > 0) voucher = activeVoucher;
  }

  let upsellDisc = 0;
  const offer = itemId ? await getUpsellOffer(userId) : null;
  if (offer && String(offer.item_id) === String(itemId)) {
    upsellDisc = Math.min(calcUpsellDiscount(baseNominal, offer.percent), maxCut);
  }

  if (upsellDisc > 0 && upsellDisc >= voucherDisc) {
    return { source: "upsell", discount: upsellDisc, code: "UPSELL" };
  }
  if (voucherDisc > 0) {
    return { source: "voucher", discount: voucherDisc, code: voucher.code };
  }
  return { source: "", discount: 0, code: "" };
}

async function consumeDiscountSource(userId, source) {
  if (source === "upsell") await clearUpsellOffer(userId);
  else if (source === "voucher") await clearActiveUserVoucher(userId);
}

function buildDiscountLine(source, code, discount) {
  if (!(discount > 0)) return "";
  if (source === "upsell") {
    return `🔥 <b>Diskon Spesial (Upsell):</b> -${formatRupiah(discount)}\n`;
  }
  return `🎟️ <b>Voucher (${escapeHtml(code)}):</b> -${formatRupiah(discount)}\n`;
}

async function sendUpsellOffer(token, order, ctx) {
  if (!UPSELL_ENABLED || order.is_deposit || ctx.isReseller) return;

  const percent = UPSELL_DISCOUNT_PERCENT;
  const koleksi = await getKoleksi(order.buyer_id);
  const ownedNames = new Set(koleksi.map((k) => k.nama));

  const candidates = (ctx.katalogList || [])
    .filter((k) => {
      if (!k || !k.id || String(k.id) === String(ctx.boughtItemId)) return false;
      if (ownedNames.has(k.nama)) return false;
      const hasLinks = (Array.isArray(k.links) && k.links.length > 0) || Boolean(k.link);
      const hasFiles = Array.isArray(k.files) && k.files.length > 0;
      if (!hasLinks && !hasFiles) return false;
      return calcUpsellDiscount(parseNominal(k.harga), percent) > 0;
    })
    .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0));

  const pick = candidates[0];
  if (!pick) return;

  const base = parseNominal(pick.harga);
  const discount = calcUpsellDiscount(base, percent);
  const finalPrice = base - discount;
  const expiresAt = Date.now() + UPSELL_WINDOW_MINUTES * 60 * 1000;

  await saveUpsellOffer(order.buyer_id, {
    item_id: String(pick.id),
    percent,
    expires_at: expiresAt,
  });

  const text =
    `🔥 <b>PENAWARAN SPESIAL, KHUSUS KAMU!</b>\n\n` +
    `Makasih udah belanja! Ambil set berikutnya dengan <b>diskon ${percent}%</b> — berlaku <b>${UPSELL_WINDOW_MINUTES} menit</b> saja.\n\n` +
    `🎁 <b>${escapeHtml(pick.nama)}</b>\n` +
    (pick.isi ? `📦 ${escapeHtml(pick.isi)}\n` : "") +
    `💰 <s>${formatRupiah(base)}</s> ➜ <b>${formatRupiah(finalPrice)}</b>\n` +
    `⏳ Berlaku sampai <b>${formatWibClock(expiresAt)}</b>`;

  const replyMarkup = {
    inline_keyboard: [
      [{ text: `🛒 Ambil Diskon ${percent}% — ${formatRupiah(finalPrice)}`, callback_data: `buy_${pick.id}` }],
      [{ text: "🛍️ Lihat Katalog", callback_data: "menu_katalog" }],
    ],
  };

  if (pick.photo_id) {
    await tgRequest(token, "sendPhoto", {
      chat_id: order.buyer_id,
      photo: pick.photo_id,
      caption: text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } else {
    await tgRequest(token, "sendMessage", {
      chat_id: order.buyer_id,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
}

async function createOrder(
  user,
  itemNama,
  baseNominal,
  targetLink,
  isMystery = false,
  itemId = "",
  extraFields = {}
) {
  const orderId = await redisCommand(["INCR", REDIS_ORDER_SEQ_KEY]);
  const isDeposit = Boolean(extraFields && extraFields.is_deposit);
  const skipUnique = Boolean(extraFields && extraFields.skip_unique);
  const kodeUnik = skipUnique ? 0 : ((orderId - 1) % 299) + 1;

  let discount = Number(extraFields && extraFields.preset_discount) || 0;
  let voucherCode = (extraFields && extraFields.preset_voucher_code) || "";

  let upsellApplied = Boolean(extraFields && extraFields.upsell);

  const skipLookup = Boolean(extraFields && extraFields.skip_discount_lookup);
  if (!isDeposit && !skipLookup && discount === 0 && !voucherCode) {
    const best = await resolveBestDiscount(user.id, itemId, baseNominal);
    if (best.discount > 0) {
      discount = best.discount;
      voucherCode = best.code;
      upsellApplied = best.source === "upsell";
      await consumeDiscountSource(user.id, best.source);
    }
  }

  const finalBaseNominal = Math.max(500, baseNominal - discount);
  const totalNominal = finalBaseNominal + kodeUnik;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Pembeli";
  const orderData = {
    id: orderId,
    buyer_id: user.id,
    buyer_name: fullName,
    buyer_username: user.username ? `@${user.username}` : "Tanpa Username",
    item_id: itemId,
    item_nama: itemNama,
    base_nominal: baseNominal,
    discount: discount,
    voucher_code: voucherCode,
    upsell: upsellApplied,
    final_base_nominal: finalBaseNominal,
    kode_unik: kodeUnik,
    total_nominal: totalNominal,
    target_link: targetLink,
    is_mystery: isMystery,
    is_deposit: isDeposit,
    status: "pending",
    ...extraFields,
  };

  await saveOrder(orderId, orderData);
  return orderData;
}

// ==========================================
// 4. HELPER TELEGRAM API, ACC PROSESOR & MENU
// ==========================================
async function tgRequest(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendTestimonialToChannel(token, order, deliveredName, buyerAllCount) {
  const testi = await getTestiConfig();
  if (!testi || !testi.channel_id) return;

  const tier = getTierBadge(buyerAllCount || 1);
  const maskedUser = maskUsername(order.buyer_username);
  const waktu = getWibTimestamp();
  const paketLabel = order.is_mystery
    ? `🎲 Mystery Box ➔ ${deliveredName}`
    : deliveredName;

  const testiText =
    `🧾 <b>TESTIMONI PEMBELIAN #${order.id}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Pembeli :</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(maskedUser)})\n` +
    `🏅 <b>Status  :</b> ${tier}\n` +
    `📦 <b>Paket   :</b> ${escapeHtml(paketLabel)}\n` +
    `💰 <b>Nominal :</b> <code>${formatRupiah(order.total_nominal)}</code>\n` +
    `🕒 <b>Waktu   :</b> ${waktu}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ <i>Pembayaran terverifikasi & link otomatis terkirim!</i>`;

  const payload = {
    chat_id: testi.channel_id,
    text: testiText,
    parse_mode: "HTML",
  };

  if (testi.bot_username) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          {
            text: "🛍️ Order Sekarang di Bot",
            url: `https://t.me/${testi.bot_username}`,
          },
        ],
      ],
    };
  }

  await tgRequest(token, "sendMessage", payload);
                          }
async function processAccOrder(token, order) {
  // Kunci per-order: makro + klik ACC manual (atau makro yang retry) tidak boleh memproses order yang sama dua kali.
  const lockKey = `${REDIS_ORDER_LOCK_PREFIX}${order.id}`;
  const lock = await redisCommand(["SET", lockKey, "1", "NX", "EX", "259200"]);
  if (lock === undefined) throw new Error("Gagal membuat kunci order (Redis tidak merespons).");
  if (lock !== "OK") {
    return { deliveredName: order.item_nama, deliveredLink: "", duplicate: true };
  }

  let result;
  try {
    result = await processAccOrderCore(token, order);
  } catch (coreErr) {
    // Kalau gagal SEBELUM status "acc" tersimpan (belum ada efek samping), lepas kunci agar bisa dicoba ulang.
    try {
      const fresh = await getOrder(order.id);
      if (!fresh || fresh.status !== "acc") await redisCommand(["DEL", lockKey]);
    } catch (_) {}
    throw coreErr;
  }
  try {
    await maybeRewardReferral(token, order);
  } catch (refErr) {
    console.error("Referral reward error:", refErr);
  }
  return result;
}

async function processAccOrderCore(token, order) {
  order.status = "acc";
  await saveOrder(order.id, order);

  // KHUSUS ORDER DEPOSIT SALDO (AUTO-ACC)
  if (order.is_deposit) {
    const depositAmount = Number(order.base_nominal) || 0;
    const newSaldo = await addUserSaldo(order.buyer_id, depositAmount);

    await tgRequest(token, "sendMessage", {
      chat_id: order.buyer_id,
      text:
        `✅ <b>DEPOSIT SALDO BERHASIL! (Order #${order.id})</b>\n\n` +
        `💰 <b>Nominal Masuk:</b> +<code>${formatRupiah(depositAmount)}</code>\n` +
        `💳 <b>Saldo Kamu Sekarang:</b> <code>${formatRupiah(newSaldo)}</code>\n\n` +
        `<i>Saldo siap dipakai untuk checkout instan di Katalog atau Mystery Box!</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛍️ Belanja Katalog", callback_data: "menu_katalog" },
            { text: "🎲 Mystery Box", callback_data: "menu_mystery" },
          ],
          [{ text: "💰 Cek Saldo & Riwayat", callback_data: "menu_saldo" }],
        ],
      },
    });

    return {
      deliveredName: `Deposit Saldo (+${formatRupiah(depositAmount)})`,
      deliveredLink: "",
    };
  }

  if (order.voucher_code) {
    const vouchers = await getVouchers();
    const v = vouchers[order.voucher_code];
    if (v && v.quota > 0) {
      v.quota = Math.max(0, v.quota - 1);
      if (!Array.isArray(v.used_by)) v.used_by = [];
      if (!v.used_by.includes(String(order.buyer_id))) {
        v.used_by.push(String(order.buyer_id));
      }
      vouchers[order.voucher_code] = v;
      await saveVouchers(vouchers);
    }
  }

  const katalogList = await getKatalog();
  let deliveredName = order.item_nama;
  let deliveredLinks =
    Array.isArray(order.target_links) && order.target_links.length > 0
      ? order.target_links
      : order.target_link
      ? [order.target_link]
      : [];
  let deliveredFiles = Array.isArray(order.target_files) ? order.target_files : [];
  let soldItemId = order.item_id || "";
  let buyerText = "";

  if (order.is_mystery) {
    const pool = katalogList.map((k) => ({
      id: String(k.id),
      nama: k.nama,
      harga: k.harga,
      links:
        Array.isArray(k.links) && k.links.length > 0 ? k.links : k.link ? [k.link] : [],
      files: Array.isArray(k.files) ? k.files : [],
    }));
    const won =
      pool.length > 0
        ? pickMysteryPrize(pool)
        : { id: "", nama: "Paket Spesial Lumine", links: [`https://t.me/${ADMIN_USERNAME}`], files: [] };

    soldItemId = won.id;
    deliveredName = won.nama;
    deliveredLinks = (won.links || []).map(normalizeUrl);
    deliveredFiles = won.files || [];

    const linksBlock =
      deliveredLinks.length > 0
        ? deliveredLinks.map((l) => `🔗 ${escapeHtml(l)}`).join("\n")
        : "<i>(File dikirim langsung di pesan berikutnya)</i>";

    buyerText =
      `🎲 <b>MYSTERY BOX TERBUKA! (Pesanan #${order.id})</b> 🎲\n\n` +
      `Selamat! Kamu mendapatkan hadiah:\n` +
      `🎁 <b>${escapeHtml(deliveredName)}</b>\n\n` +
      `Berikut akses hadiah kamu:\n` +
      `${linksBlock}\n\n` +
      `<i>Hadiah tersimpan di 🎒 Koleksi Saya & poin masuk ke Leaderboard!</i>`;
  } else {
    deliveredLinks = deliveredLinks.map(normalizeUrl);
    const linksBlock =
      deliveredLinks.length > 0
        ? deliveredLinks.map((l) => `🔗 ${escapeHtml(l)}`).join("\n")
        : "<i>(File dikirim langsung di pesan berikutnya)</i>";

    buyerText =
      `🎉 <b>PEMBAYARAN DI-ACC! (Pesanan #${order.id})</b>\n\n` +
      `Terima kasih telah membeli <b>${escapeHtml(deliveredName)}</b>!\n` +
      `Berikut akses file kamu:\n` +
      `${linksBlock}\n\n` +
      `<i>Link tersimpan otomatis di 🎒 Koleksi Saya & poin masuk ke Leaderboard!</i>`;
  }

  if (soldItemId || deliveredName) {
    const targetIdx = katalogList.findIndex(
      (k) => (soldItemId && String(k.id) === String(soldItemId)) || k.nama === deliveredName
    );
    if (targetIdx !== -1) {
      katalogList[targetIdx].sold = (Number(katalogList[targetIdx].sold) || 0) + 1;
      await saveKatalog(katalogList);
    }
  }

  const buyerIsReseller = await isReseller(order.buyer_id);
  const omsetTasks = [
    recordPurchaseToLeaderboard(order),
    addKoleksi(order.buyer_id, deliveredName, deliveredLinks[0] || ""),
    addStoreOmset(order.total_nominal),
  ];
  let resellerResult = null;
  if (buyerIsReseller) {
    omsetTasks.push(
      addResellerOmset(order.buyer_id, order.total_nominal).then((r) => {
        resellerResult = r;
      })
    );
  }
  await Promise.all(omsetTasks);

  const updatedAllCnt = await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(order.buyer_id)]);
  await sendTestimonialToChannel(token, order, deliveredName, updatedAllCnt);

  const linkButtonRows = deliveredLinks.slice(0, 8).map((link, i) => [
    {
      text: deliveredLinks.length > 1 ? `📂 Buka File ${i + 1}` : "📂 Buka Link File Sekarang",
      url: link,
    },
  ]);

  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    text: buyerText,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        ...linkButtonRows,
        [{ text: "⭐ Beri Rating & Ulasan", callback_data: `rate_init_${order.id}` }],
        [
          { text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" },
          { text: "🏆 Leaderboard", callback_data: "menu_lb" },
        ],
      ],
    },
  });

  // KIRIM FILE YANG DI-UPLOAD ADMIN LANGSUNG (FOTO/DOKUMEN) KE PEMBELI
  for (const f of deliveredFiles) {
    if (!f || !f.file_id) continue;
    if (f.type === "document") {
      await tgRequest(token, "sendDocument", { chat_id: order.buyer_id, document: f.file_id });
    } else {
      await tgRequest(token, "sendPhoto", { chat_id: order.buyer_id, photo: f.file_id });
    }
  }

  // NOTIF NAIK TIER RESELLER (tidak boleh mengganggu proses ACC)
  if (resellerResult) {
    try {
      await notifyResellerTierUp(token, order, resellerResult);
    } catch (tierErr) {
      console.error("Tier Up Notif Error:", tierErr);
    }
  }

  // UPSELL: TAWARKAN SET BERIKUTNYA DENGAN DISKON BERBATAS WAKTU
  try {
    await sendUpsellOffer(token, order, {
      katalogList,
      boughtItemId: soldItemId,
      isReseller: buyerIsReseller,
    });
  } catch (upsellErr) {
    console.error("Upsell Error:", upsellErr);
  }

  return { deliveredName, deliveredLink: deliveredLinks[0] || "" };
}

function normalizeUrl(rawUrl) {
  const clean = String(rawUrl || "").trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    return `https://${clean}`;
  }
  return clean;
}

function getCompactReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "🛍️ Katalog" }, { text: "💰 Saldo & Depo" }],
      [{ text: "🎒 Koleksi Saya" }, { text: "🎲 Mystery Box" }],
      [{ text: "☰ Lainnya" }],
    ],
    resize_keyboard: true,
  };
}
async function sendSaldoMenu(token, chatId, userId) {
  const [saldo, allCnt] = await Promise.all([
    getUserSaldo(userId),
    redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)]),
  ]);
  const tier = getTierBadge(allCnt || 0);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💳 <b>DOMPET SALDO LUMINE</b> [${tier}]\n\n` +
      `╭─── 💰 <b>INFO AKUN KAMU</b> ───\n` +
      `│ • <b>Saldo Aktif :</b> <code>${formatRupiah(saldo)}</code>\n` +
      `│ • <b>Status Depo :</b> ⚡ <b>Auto-ACC QRIS Statis</b>\n` +
      `╰─────────────────────\n\n` +
      `<b>Pilih nominal deposit cepat di bawah ini</b> atau ketik <code>/depo [nominal]</code> (min. Rp 2.000):\n` +
      `<i>Contoh: <code>/depo 7000</code></i>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Rp 5.000", callback_data: "depo_5000" },
          { text: "➕ Rp 10.000", callback_data: "depo_10000" },
        ],
        [
          { text: "➕ Rp 25.000", callback_data: "depo_25000" },
          { text: "➕ Rp 50.000", callback_data: "depo_50000" },
        ],
        [
          { text: "🛍️ Belanja Pakai Saldo", callback_data: "menu_katalog" },
          { text: "🔙 Menu Utama", callback_data: "menu_home" },
        ],
      ],
    },
  });
}

async function createAndSendDepositInvoice(token, chatId, user, amount) {
  const qris = await getQris();
  if (!qris || !qris.file_id || !qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Pembayaran QRIS sedang disiapkan admin. Silakan chat @${ADMIN_USERNAME} untuk isi saldo manual.`,
    });
    return;
  }

  const depoNominal = Math.round(Number(amount) || 0);
  if (depoNominal < 2000 || depoNominal > 5000000) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Nominal deposit minimal <b>Rp 2.000</b> dan maksimal <b>Rp 5.000.000</b>.",
      parse_mode: "HTML",
    });
    return;
  }

  const order = await createOrder(
    user,
    `Deposit Saldo ${formatRupiah(depoNominal)}`,
    depoNominal,
    "DEPOSIT_SALDO",
    false,
    "",
    { is_deposit: true }
  );

  const invoiceCaption =
    `💳 <b>INVOICE DEPOSIT SALDO #${order.id}</b>\n\n` +
    `💰 <b>Saldo Diterima:</b> <code>${formatRupiah(order.base_nominal)}</code>\n` +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💸 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ <b>AUTO-ACC STATIS:</b> Scan QRIS di atas dan transfer <b>TEPAT sampai digit terakhir</b> (<b>${formatRupiah(order.total_nominal)}</b>).\n` +
    `Begitu transfer masuk, saldo otomatis terisi tanpa perlu tunggu admin!`;

  await tgRequest(token, "sendPhoto", {
    chat_id: chatId,
    photo: qris.file_id,
    caption: invoiceCaption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Konfirmasi Pembayaran",
            callback_data: `confirm_${order.id}`,
          },
        ],
        [
          {
            text: "❌ Batalkan Deposit",
            callback_data: `cancel_${order.id}`,
          },
        ],
      ],
    },
  });
}

async function sendMainMenuCard(token, chatId) {
  const banner = await getBanner();
  const mysteryCfg = await getMysteryConfig();
  const cardText =
    "✨ <b>LUMINE PHOTOPACK</b> ✨\n" +
    "<i>Koleksi HD Eksklusif • Tanpa Watermark</i>\n\n" +
    `• <b>Standar:</b> <code>${formatRupiah(RETAIL_PRICE_LITE)}</code> | <b>Premium:</b> <code>${formatRupiah(RETAIL_PRICE_STANDAR)}</code>\n` +
    `• <b>Mystery Box:</b> <code>${formatRupiah(mysteryCfg.price || 3000)}</code>\n\n` +
    "Pilih menu di bawah 👇";

  const inlineMarkup = {
    inline_keyboard: [
      [
        { text: "🛍️ Katalog", callback_data: "menu_katalog" },
        { text: "🔥 Bestseller", callback_data: "menu_bestseller" },
      ],
      [
        { text: "💰 Saldo & Depo", callback_data: "menu_saldo" },
        { text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" },
      ],
      [
        { text: "🎲 Mystery Box", callback_data: "menu_mystery" },
        { text: "🏆 Leaderboard", callback_data: "menu_lb" },
      ],
      [
        { text: "☰ Menu Lainnya", callback_data: "menu_lainnya" },
        { text: "💬 Admin", url: `https://t.me/${ADMIN_USERNAME}` },
      ],
    ],
  };

  if (banner && banner.file_id) {
    await tgRequest(token, "sendPhoto", {
      chat_id: chatId,
      photo: banner.file_id,
      caption: cardText,
      parse_mode: "HTML",
      reply_markup: inlineMarkup,
    });
  } else {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: cardText,
      parse_mode: "HTML",
      reply_markup: inlineMarkup,
    });
  }
                                           }
  async function sendKatalogMenu(token, chatId) {
  const katalogList = await getKatalog();
  if (katalogList.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `📂 Katalog Photopack sedang diperbarui. Hubungi @${ADMIN_USERNAME} untuk info stok terbaru.`,
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  const miniCount = katalogList.filter((k) => (k.kategori || "mini") !== "full").length;
  const fullCount = katalogList.filter((k) => k.kategori === "full").length;
  const creatorGroups = getCreatorGroups(katalogList);

  const keyboard = [
    [{ text: `🧩 Mini Set (${miniCount})`, callback_data: "menu_katalog_mini" }],
    [{ text: `📦 Full Set (${fullCount})`, callback_data: "menu_katalog_full" }],
  ];
  if (creatorGroups.length > 0) {
    keyboard.push([
      { text: `👤 Pilih Creator (${creatorGroups.length})`, callback_data: "menu_katalog_creator" },
    ]);
  }
  keyboard.push([{ text: "🔥 Lihat Top Bestseller", callback_data: "menu_bestseller" }]);
  keyboard.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "╭─── 🛍️ <b>KATALOG PHOTOPACK</b> ───\n" +
      "│ Mau cari berdasarkan kategori atau creator?\n" +
      "│ Pilih menu di bawah ini dulu ya 👇\n" +
      "╰─────────────────────",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

async function sendKatalogCreatorMenu(token, chatId) {
  const katalogList = await getKatalog();
  const creatorGroups = getCreatorGroups(katalogList);

  if (creatorGroups.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "👤 Belum ada daftar creator yang diatur admin saat ini.",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Kembali ke Katalog", callback_data: "menu_katalog" }]],
      },
    });
    return;
  }

  const rows = creatorGroups.map((grp, idx) => [
    {
      text: `👤 ${grp.name} (${grp.items.length} set)`,
      callback_data: `creator_list_${idx}`,
    },
  ]);
  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "menu_katalog" },
    { text: "🏠 Menu Utama", callback_data: "menu_home" },
  ]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "╭─── 👤 <b>KATALOG PER CREATOR</b> ───\n" +
      "│ Pilih nama creator / cosplayer di bawah\n" +
      "│ untuk melihat semua koleksi set-nya 👇\n" +
      "╰───────────────────────",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendKatalogListByCreator(token, chatId, creatorIdx) {
  const katalogList = await getKatalog();
  const creatorGroups = getCreatorGroups(katalogList);
  const group = creatorGroups[creatorIdx];

  if (!group || group.items.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Daftar creator diperbarui. Silakan pilih ulang creator di bawah ini.",
      reply_markup: {
        inline_keyboard: [[{ text: "👤 Daftar Creator", callback_data: "menu_katalog_creator" }]],
      },
    });
    return;
  }

  const rankMap = getRankedKatalog(katalogList);
  const rows = group.items.map((item) => {
    const sold = Number(item.sold) || 0;
    const rank = rankMap[String(item.id)];
    const katIcon = item.kategori === "full" ? "📦" : "🧩";
    let prefix = katIcon;
    let suffix = "";
    if (rank === 1) {
      prefix = "🔥";
      suffix = ` • BESTSELLER (${sold}x)`;
    } else if (rank === 2 || rank === 3) {
      prefix = "⭐";
      suffix = ` • POPULER (${sold}x)`;
    } else if (sold > 0) {
      suffix = ` (${sold}x)`;
    }
    return [
      {
        text: `${prefix} ${item.nama} — ${item.harga}${suffix}`,
        callback_data: `detail_${item.id}`,
      },
    ];
  });

  rows.push([
    { text: "👤 Daftar Creator", callback_data: "menu_katalog_creator" },
    { text: "🛍️ Semua Kategori", callback_data: "menu_katalog" },
  ]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `╭─── 👤 <b>CREATOR: ${escapeHtml(group.name.toUpperCase())}</b> ───\n` +
      `│ Total koleksi: <b>${group.items.length} set</b> (🧩 Mini / 📦 Full)\n` +
      "│ Pilih judul di bawah untuk lihat preview & order 👇\n" +
      "╰────────────────────────",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendKatalogListByCategory(token, chatId, kategori) {
  const katalogList = await getKatalog();
  const filtered = katalogList.filter((item) => (item.kategori || "mini") === kategori);

  if (filtered.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `📂 Belum ada produk di kategori ini. Hubungi @${ADMIN_USERNAME} untuk info stok terbaru.`,
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Kembali ke Kategori", callback_data: "menu_katalog" }]],
      },
    });
    return;
  }

  const rankMap = getRankedKatalog(katalogList);
  const rows = filtered.map((item) => {
    const sold = Number(item.sold) || 0;
    const rank = rankMap[String(item.id)];
    let prefix = "📸";
    let suffix = "";
    if (rank === 1) {
      prefix = "🔥";
      suffix = ` • BESTSELLER (${sold}x)`;
    } else if (rank === 2 || rank === 3) {
      prefix = "⭐";
      suffix = ` • POPULER (${sold}x)`;
    } else if (sold > 0) {
      suffix = ` (${sold}x)`;
    }
    return [
      {
        text: `${prefix} ${item.nama} — ${item.harga}${suffix}`,
        callback_data: `detail_${item.id}`,
      },
    ];
  });
  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "menu_katalog" },
    { text: "🏠 Menu Utama", callback_data: "menu_home" },
  ]);

  const kategoriLabel = kategori === "full" ? "📦 FULL SET" : "🧩 MINI SET";
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `╭─── 🛍️ <b>KATALOG ${kategoriLabel}</b> ───\n` +
      "│ Pilih judul di bawah untuk melihat\n" +
      "│ <b>foto preview</b> & bayar via Saldo / QRIS:\n" +
      "╰─────────────────────\n" +
      "<i>🔥 = Terlaris #1 • ⭐ = Paling Populer</i>",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendBestsellerMenu(token, chatId) {
  const katalogList = await getKatalog();
  const topItems = katalogList
    .filter((item) => (Number(item.sold) || 0) > 0)
    .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
    .slice(0, 5);

  if (topItems.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        "🔥 <b>DAFTAR SET PALING POPULER & BESTSELLER</b>\n\n" +
        "<i>Belum ada riwayat penjualan tercatat. Yuk jadi pembeli pertama di katalog!</i>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍️ Buka Katalog Photopack", callback_data: "menu_katalog" }],
          [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
        ],
      },
    });
    return;
  }

  let lines = "";
  const buttons = [];
  topItems.forEach((item, idx) => {
    const sold = Number(item.sold) || 0;
    const badge = idx === 0 ? "🔥 <b>#1 BESTSELLER</b>" : `⭐ <b>#${idx + 1} POPULER</b>`;
    lines +=
      `│ ${badge}\n` +
      `│ 📸 <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})\n` +
      `│     └ Terjual <b>${sold}x</b> • ${escapeHtml(item.isi)}\n`;
    buttons.push([
      {
        text: `${idx === 0 ? "🔥" : "⭐"} Beli #${idx + 1}: ${item.nama} (${item.harga})`,
        callback_data: `detail_${item.id}`,
      },
    ]);
  });

  buttons.push([
    { text: "🛍️ Semua Katalog", callback_data: "menu_katalog" },
    { text: "🔙 Menu Utama", callback_data: "menu_home" },
  ]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🔥 <b>TOP SET PALING POPULER & BESTSELLER</b> 🔥\n" +
      "<i>Koleksi dengan pembelian tertinggi pilihan member:</i>\n\n" +
      "╭─── 🏆 <b>REKOMENDASI TERLARIS</b> ───\n" +
      lines +
      "╰────────────────────────\n\n" +
      "Ketuk tombol di bawah untuk intip foto preview & checkout 👇",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendMysteryMenu(token, chatId) {
  const cfg = await getMysteryConfig();
  const katalogList = await getKatalog();

  if (!cfg.enabled || katalogList.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🎲 <b>Mystery Box</b> sedang disiapkan admin atau stok katalog masih kosong.",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  const prizePreview = getMysteryTiers(katalogList)
    .map((t) => `• Paket <b>${formatRupiah(t.price)}</b> — peluang <b>${t.chance}%</b>\n`)
    .join("");

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🎲 <b>MYSTERY BOX GACHA — LUMINE EDITION</b> 🎲\n\n" +
      "Coba keberuntunganmu! Cukup bayar harga flat, dan setelah pembayaran terverifikasi bot akan otomatis mengacak hadiah untukmu:\n\n" +
      "╭─── 🎁 <b>DAFTAR HADIAH GACHA</b> ───\n" +
      prizePreview +
      "╰────────────────────────\n\n" +
      `💰 <b>Harga 1x Spin:</b> <code>${formatRupiah(cfg.price)}</code>\n` +
      "<i>Hadiah yang didapat otomatis masuk ke menu 🎒 Koleksi Saya!</i>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `🎲 Spin Mystery Box (${formatRupiah(cfg.price)})`,
            callback_data: "buy_mystery",
          },
        ],
        [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
      ],
    },
  });
            }
                       async function sendKoleksiMenu(token, chatId, userId) {
  const [list, allCnt] = await Promise.all([
    getKoleksi(userId),
    redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)]),
  ]);
  const tier = getTierBadge(allCnt || list.length);

  if (list.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        `🎒 <b>KOLEKSI SAYA</b> [${tier}]\n\n` +
        "Kamu belum memiliki riwayat pembelian yang di-ACC.\n" +
        "Semua link set yang sudah kamu beli akan tersimpan otomatis di sini agar tidak pernah hilang!",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍️ Belanja Sekarang", callback_data: "menu_katalog" }],
          [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
        ],
      },
    });
    return;
  }

  let text =
    `🎒 <b>KOLEKSI SAYA</b> [${tier}]\n` +
    `Total koleksi tersimpan: <b>${list.length} Set</b>\n\n` +
    "╭─── 📂 <b>RIWAYAT AKSES FILE</b> ───\n";

  const showItems = list.slice(0, 8);
  const buttons = [];
  showItems.forEach((item, i) => {
    text += `│ <b>${i + 1}.</b> ${escapeHtml(item.nama)} <i>(${item.date})</i>\n`;
    if (item.link) {
      buttons.push([
        {
          text: `📂 Buka: ${item.nama.slice(0, 28)}`,
          url: normalizeUrl(item.link),
        },
      ]);
    }
  });
  text += "╰───────────────────────\n\nKetuk tombol di bawah untuk membuka ulang file kapan saja 👇";

  buttons.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendResellerMenu(token, chatId, user) {
  const userId = (user && user.id) || "-";
  const uname = user && user.username ? `@${user.username}` : "(tanpa username)";
  const prefill = encodeURIComponent(
    `Halo admin, saya mau daftar Reseller Photopack.\nID Telegram: ${userId}\nUsername: ${uname}`
  );

  const statusReseller = await isReseller(userId);
  let tierBlock = buildTierLadderBlock();
  if (statusReseller) {
    const myOmset = await getResellerOmset(userId);
    tierBlock = buildMyTierBlock(myOmset, getResellerTierInfo(myOmset.rupiah));
  }
  let botBlock = "";
  if (statusReseller) {
    const myBot = await getResellerBot(userId);
    botBlock = myBot
      ? `🤖 <b>Bot Toko Kamu:</b> @${escapeHtml(myBot.username)} ${myBot.active === false ? "(nonaktif)" : "(aktif)"}\n` +
        "<i>Atur harga jual di bot itu: /hargaku • /setharga • /margin</i>\n\n"
      : "🤖 <b>Punya bot toko sendiri!</b>\n" +
        "Buat bot di @BotFather, lalu kirim <code>/daftarbot TOKEN_BOT</code> ke sini. " +
        `Harga jual kamu yang atur (min = harga toko utama, maks +${RESELLER_BOT_MAX_MARKUP_PERCENT}%), untung dicatat otomatis.\n\n`;
  }
  const statusLine = statusReseller
    ? "✅ <b>Status Kamu: Reseller Aktif</b>\n\n"
    : "";

  const keyboardRows = [];
  if (statusReseller) {
    keyboardRows.push([{ text: "📊 Cek Omset Saya", callback_data: "reseller_omset_self" }]);
    if (WD_ENABLED) {
      keyboardRows.push([{ text: "💳 WD Margin", callback_data: "reseller_wd" }]);
    }
  } else {
    keyboardRows.push([{ text: "📝 Daftar Reseller", url: `https://t.me/${ADMIN_USERNAME}?text=${prefill}` }]);
  }
  keyboardRows.push([
    { text: "🛍️ Lihat Katalog", callback_data: "menu_katalog" },
    { text: "📋 Cara Order", callback_data: "menu_cara" },
  ]);
  keyboardRows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🤝 <b>MENU RESELLER | PHOTOPACK</b>\n" +
      "<i>Jual ulang foto pack Lumine dengan harga grosir</i>\n\n" +
      statusLine +
      tierBlock +
      botBlock +
      "╭─── 🌟 <b>KEUNTUNGAN</b> ───\n" +
      "│ ✅ Harga lebih murah dari harga retail\n" +
      "│ ✅ Naik tier otomatis → harga makin murah\n" +
      "│ ✅ Bisa punya bot toko sendiri (harga jual atur sendiri)\n" +
      "│ ✅ Koleksi Photopack HD tanpa watermark\n" +
      "│ ✅ Update set baru dari katalog\n" +
      "│ ✅ Dibantu langsung oleh admin\n" +
      "╰─────────────────────\n\n" +
      (statusReseller
        ? "📊 Klik <b>Cek Omset Saya</b> untuk lihat total omset & transaksi reseller kamu."
        : "📝 <b>Cara Daftar:</b>\n" +
          "1. Klik tombol <b>Daftar Reseller</b> di bawah.\n" +
          "2. Kirim pesan yang sudah terisi otomatis ke admin.\n" +
          "3. Ikuti arahan admin sampai akun reseller aktif."),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboardRows },
  });
}

async function sendCaraOrder(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "📋 <b>PANDUAN & ATURAN PEMBELIAN</b>\n\n" +
      "1️⃣ <b>Pilih Paket / Mystery Box</b>\n" +
      "Buka <b>Katalog Photopack</b>, <b>🔥 Bestseller</b>, atau <b>Mystery Box</b>, lalu klik tombol beli.\n\n" +
      "2️⃣ <b>Bayar Pakai Saldo atau QRIS</b>\n" +
      "• <b>Saldo:</b> Isi saldo di menu <b>💰 Saldo & Depo</b> (Auto-ACC QRIS Statis), lalu checkout 1x klik tanpa kode unik.\n" +
      "• <b>QRIS Langsung:</b> Transfer sesuai nominal persis sampai digit terakhir.\n\n" +
      "3️⃣ <b>Pakai Kode Voucher (Opsional)</b>\n" +
      "Ketik <code>/voucher KODE</code> sebelum klik tombol beli untuk mendapat potongan harga.\n\n" +
      "4️⃣ <b>Terima File Otomatis</b>\n" +
      "Link file langsung dikirim otomatis & tersimpan di <b>🎒 Koleksi Saya</b>.",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🛍️ Buka Katalog", callback_data: "menu_katalog" },
          { text: "💰 Isi Saldo", callback_data: "menu_saldo" },
        ],
        [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
      ],
    },
  });
}

async function sendChannelLainnya(token, chatId) {
  const testi = await getTestiConfig();
  const rows = [
    [{ text: "🛡️ Channel Cadangan", url: LINK_CH_CADANGAN }],
    [{ text: "🎁 Channel Asupan Free", url: LINK_CH_FREE }],
  ];
  if (testi && testi.channel_username) {
    rows.push([{ text: "🧾 Channel Testimoni", url: `https://t.me/${testi.channel_username}` }]);
  }
  rows.push([{ text: `👤 Admin (@${ADMIN_USERNAME})`, url: `https://t.me/${ADMIN_USERNAME}` }]);
  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🔗 <b>TAUTAN CHANNEL & ADMIN RESMI</b>\n\n" +
      "Simpan channel resmi kami di bawah ini 👇",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
    }

async function sendMoreMenu(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: "☰ <b>MENU LAINNYA</b>\n\nPilih fitur atau informasi tambahan:",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎟️ Pakai Voucher", callback_data: "menu_voucher" },
          { text: "🎁 Undang Teman", callback_data: "menu_undang" },
        ],
        [
          { text: "🤝 Reseller", callback_data: "menu_reseller" },
          { text: "📋 Cara Order", callback_data: "menu_cara" },
        ],
        [
          { text: "🔗 Channel Resmi", callback_data: "menu_channel" },
          { text: `💬 Admin`, url: `https://t.me/${ADMIN_USERNAME}` },
        ],
        [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
      ],
    },
  });
}

    async function resolvePurchaseTarget(targetKey) {
  if (targetKey === "mystery") {
    const cfg = await getMysteryConfig();
    const katalogList = await getKatalog();
    if (!cfg.enabled || katalogList.length === 0) {
      return { ok: false, error: "⚠️ Mystery Box sedang tidak tersedia." };
    }
    return {
      ok: true,
      itemId: "",
      itemNama: "🎲 Mystery Box Gacha Photopack",
      baseNominal: cfg.price || 3000,
      targetLink: "MYSTERY_GACHA",
      targetLinks: [],
      targetFiles: [],
      isMystery: true,
    };
  }

  const katalogList = await getKatalog();
  const item = katalogList.find((k) => String(k.id) === String(targetKey));
  if (!item) {
    return { ok: false, error: "⚠️ Paket tidak ditemukan atau sudah dihapus." };
  }
  const itemLinks =
    Array.isArray(item.links) && item.links.length > 0
      ? item.links
      : item.link
      ? [item.link]
      : [];
  const itemFiles = Array.isArray(item.files) ? item.files : [];
  return {
    ok: true,
    itemId: String(item.id),
    itemNama: item.nama,
    baseNominal: parseNominal(item.harga),
    targetLink: itemLinks[0] || "",
    targetLinks: itemLinks,
    targetFiles: itemFiles,
    isMystery: false,
  };
}

async function sendQrisInvoiceForTarget(token, chatId, user, target) {
  const qris = await getQris();
  if (!qris || !qris.file_id || !qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Pembayaran QRIS sedang disiapkan admin. Silakan chat @${ADMIN_USERNAME} untuk order langsung.`,
    });
    return;
  }

  const order = await createOrder(
    user,
    target.itemNama,
    target.baseNominal,
    target.targetLink,
    target.isMystery,
    target.itemId,
    {
      target_links: target.targetLinks || [],
      target_files: target.targetFiles || [],
    }
  );

  const discountLine = buildDiscountLine(
    order.upsell ? "upsell" : "voucher",
    order.voucher_code,
    order.discount
  );

  const invoiceCaption =
    `🧾 <b>INVOICE PESANAN #${order.id}</b>\n\n` +
    `📦 <b>Paket:</b> ${escapeHtml(order.item_nama)}\n` +
    `💵 <b>Harga Dasar:</b> ${formatRupiah(order.base_nominal)}\n` +
    discountLine +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ <b>PENTING:</b> Scan QRIS di atas dan transfer <b>TEPAT sampai digit terakhir</b> (<b>${formatRupiah(order.total_nominal)}</b>) agar sistem otomatis memverifikasi pembayaranmu.\n\n` +
    `Setelah transfer berhasil, link file otomatis dikirim atau klik tombol <b>Konfirmasi Pembayaran</b> di bawah 👇`;

  await tgRequest(token, "sendPhoto", {
    chat_id: chatId,
    photo: qris.file_id,
    caption: invoiceCaption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Konfirmasi Pembayaran",
            callback_data: `confirm_${order.id}`,
          },
        ],
        [
          {
            text: "❌ Batalkan Pesanan",
            callback_data: `cancel_${order.id}`,
          },
        ],
      ],
    },
  });
  }
  // ==========================================
// 5. HANDLER UTAMA SERVERLESS VERCEL (WEBHOOK + AUTO-ACC MAKRO)
// ==========================================
// ==========================================
// 4B. BOT RESELLER (WHITE-LABEL): reseller punya bot toko sendiri
//     Pembeli bayar ke QRIS admin (Auto-ACC makro tetap jalan), margin reseller
//     dicatat otomatis & dibayar manual oleh admin (/bayarmargin).
// ==========================================
function parseCommand(text) {
  const t = String(text || "").trim();
  const first = t.split(/\s+/)[0] || "";
  return {
    cmd: first.toLowerCase().replace(/@[a-z0-9_]+$/i, ""),
    arg: t.slice(first.length).trim(),
  };
}

async function getResellerBot(ownerId) {
  const raw = await redisCommand(["HGET", REDIS_RBOT_KEY, String(ownerId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveResellerBot(ownerId, cfg) {
  await redisCommand(["HSET", REDIS_RBOT_KEY, String(ownerId), JSON.stringify(cfg)]);
}

async function getAllResellerBots() {
  const raw = await redisCommand(["HGETALL", REDIS_RBOT_KEY]);
  const map = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try {
        map[raw[i]] = JSON.parse(raw[i + 1]);
      } catch {
        // abaikan data rusak
      }
    }
  }
  return map;
}

async function removeResellerBot(ownerId) {
  const rb = await getResellerBot(ownerId);
  if (!rb) return false;
  try {
    await tgRequest(rb.token, "deleteWebhook", {});
  } catch (e) {
    console.error("deleteWebhook gagal:", e);
  }
  await redisCommand(["HDEL", REDIS_RBOT_KEY, String(ownerId)]);
  return true;
}

async function getResellerMargin(ownerId) {
  const [e, p, h] = await Promise.all([
    redisCommand(["HGET", REDIS_RBOT_MARGIN_KEY, String(ownerId)]),
    redisCommand(["HGET", REDIS_RBOT_PAID_KEY, String(ownerId)]),
    redisCommand(["HGET", REDIS_WD_HELD_KEY, String(ownerId)]),
  ]);
  const earned = parseInt(e, 10) || 0;
  const paid = parseInt(p, 10) || 0;
  const held = Math.max(0, parseInt(h, 10) || 0);
  const owed = Math.max(0, earned - paid); // total margin yang belum dibayar admin
  // available = saldo margin yang boleh di-WD (belum terpakai WD pending)
  return { earned, paid, owed, held, available: Math.max(0, owed - held) };
}

async function getResellerSales(ownerId) {
  const raw = await redisCommand(["GET", `${REDIS_RBOT_SALES_PREFIX}${ownerId}`]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function logResellerSale(ownerId, entry) {
  const list = await getResellerSales(ownerId);
  list.unshift(entry);
  if (list.length > 20) list.length = 20;
  await redisCommand(["SET", `${REDIS_RBOT_SALES_PREFIX}${ownerId}`, JSON.stringify(list)]);
}

async function buildMarginText(ownerId) {
  const [m, sales] = await Promise.all([getResellerMargin(ownerId), getResellerSales(ownerId)]);
  let text =
    "💸 <b>MARGIN KAMU</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    `📈 <b>Total Untung:</b> <code>${formatRupiah(m.earned)}</code>\n` +
    `✅ <b>Sudah Dibayar Admin:</b> <code>${formatRupiah(m.paid)}</code>\n` +
    `⏳ <b>Belum Dibayar:</b> <code>${formatRupiah(m.owed)}</code>\n` +
    (m.held > 0 ? `🔒 <b>Sedang Diproses WD:</b> <code>${formatRupiah(m.held)}</code>\n` : "") +
    `💳 <b>Bisa Ditarik (WD):</b> <code>${formatRupiah(m.available)}</code>\n` +
    (WD_ENABLED
      ? `<i>Tarik margin lewat bot utama: /wd NOMINAL (min ${formatRupiah(WD_MIN_AMOUNT)})</i>\n`
      : "");
  if (sales.length > 0) {
    text += "\n🧾 <b>Penjualan Terakhir:</b>\n";
    for (const s of sales.slice(0, 8)) {
      text +=
        `#${s.id} • ${escapeHtml(s.item)}\n` +
        `   jual ${formatRupiah(s.sell)} − modal ${formatRupiah(s.modal)} = <b>+${formatRupiah(s.margin)}</b>\n`;
    }
  } else {
    text += "\n<i>Belum ada penjualan.</i>";
  }
  return text;
}

// ---- WD (TARIK MARGIN) RESELLER ----
// Alur: reseller /wd NOMINAL TUJUAN -> margin ditahan (held) -> admin transfer manual lalu klik ACC
//       -> held dikurangi & paid ditambah. Kalau ditolak -> held dikembalikan (margin utuh).
async function getWd(wdId) {
  const raw = await redisCommand(["GET", `${REDIS_WD_PREFIX}${wdId}`]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveWd(wd) {
  await redisCommand(["SET", `${REDIS_WD_PREFIX}${wd.id}`, JSON.stringify(wd)]);
  if (wd.status === "pending") {
    await redisCommand(["HSET", REDIS_WD_PENDING_KEY, String(wd.id), String(wd.owner_id)]);
  } else {
    await redisCommand(["HDEL", REDIS_WD_PENDING_KEY, String(wd.id)]);
  }
}

// Ajukan WD. Atomik: tahan dulu (HINCRBY), cek, rollback kalau melebihi saldo.
async function createWdRequest(user, amount, tujuan) {
  const ownerId = String(user.id);
  const nominal = Math.round(Number(amount) || 0);

  if (!WD_ENABLED) return { ok: false, error: "⚠️ Fitur WD sedang dinonaktifkan admin." };
  if (nominal < WD_MIN_AMOUNT) {
    return { ok: false, error: `⚠️ Minimal WD <b>${formatRupiah(WD_MIN_AMOUNT)}</b>.` };
  }
  if (!tujuan || tujuan.length < 5) {
    return {
      ok: false,
      error:
        "⚠️ Isi tujuan transfer yang jelas.\n<i>Contoh: <code>/wd 25000 DANA 08123456789 a.n Budi</code></i>",
    };
  }

  const pendingCount = (await redisCommand(["HGETALL", REDIS_WD_PENDING_KEY])) || [];
  for (let i = 0; i < pendingCount.length; i += 2) {
    if (String(pendingCount[i + 1]) === ownerId) {
      return {
        ok: false,
        error: `⚠️ Kamu masih punya WD #${escapeHtml(String(pendingCount[i]))} yang diproses admin. Tunggu selesai dulu ya.`,
      };
    }
  }

  const newHeld = parseInt(await redisCommand(["HINCRBY", REDIS_WD_HELD_KEY, ownerId, nominal]), 10) || 0;
  const m = await getResellerMargin(ownerId); // held sudah termasuk nominal ini
  if (newHeld > m.owed) {
    await redisCommand(["HINCRBY", REDIS_WD_HELD_KEY, ownerId, -nominal]);
    const avail = Math.max(0, m.owed - (newHeld - nominal));
    return {
      ok: false,
      error: `⚠️ Margin tidak cukup. Yang bisa ditarik sekarang: <b>${formatRupiah(avail)}</b>.`,
    };
  }

  const wdId = await redisCommand(["INCR", REDIS_WD_SEQ_KEY]);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Reseller";
  const wd = {
    id: wdId,
    owner_id: ownerId,
    owner_name: fullName,
    owner_username: user.username ? `@${user.username}` : "Tanpa Username",
    amount: nominal,
    fee: WD_FEE,
    net: Math.max(0, nominal - WD_FEE),
    tujuan: String(tujuan).slice(0, 200),
    status: "pending",
    created: getWibTimestamp(),
  };
  await saveWd(wd);
  await redisCommand(["LPUSH", `${REDIS_WD_HIST_PREFIX}${ownerId}`, String(wdId)]);
  await redisCommand(["LTRIM", `${REDIS_WD_HIST_PREFIX}${ownerId}`, "0", "19"]);
  return { ok: true, wd };
}

// Channel tujuan notif WD: pakai channel khusus WD (/setwdch) kalau ada, kalau tidak pakai Channel Testimoni.
async function getWdChannelId() {
  const raw = await redisCommand(["GET", REDIS_WD_CH_KEY]);
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      if (cfg && cfg.channel_id) return cfg.channel_id;
    } catch {
      // abaikan data rusak
    }
  }
  const testi = await getTestiConfig();
  return (testi && testi.channel_id) || null;
}

async function sendWdToChannel(token, wd) {
  const channelId = await getWdChannelId();
  if (!channelId) return;

  const testi = await getTestiConfig();
  const payload = {
    chat_id: channelId,
    text:
      `💸 <b>BUKTI WD RESELLER #${wd.id}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Reseller :</b> ${escapeHtml(wd.owner_name)} (${escapeHtml(maskUsername(wd.owner_username))})\n` +
      `💰 <b>Nominal  :</b> <code>${formatRupiah(wd.net)}</code>\n` +
      `🕒 <b>Waktu    :</b> ${wd.done_at || getWibTimestamp()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>WD sudah dibayar lunas oleh admin!</i>`,
    parse_mode: "HTML",
  };
  if (testi && testi.bot_username) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: "🤝 Gabung Jadi Reseller", url: `https://t.me/${testi.bot_username}` }]],
    };
  }
  await tgRequest(token, "sendMessage", payload);
}

// Admin ACC: tandai lunas (admin sudah transfer manual). Margin ditahan jadi "dibayar".
async function processWdAcc(token, wd) {
  const lock = await redisCommand(["SET", `${REDIS_WD_LOCK_PREFIX}${wd.id}`, "1", "NX", "EX", "86400"]);
  if (!lock) return { ok: false, duplicate: true };

  wd.status = "done";
  wd.done_at = getWibTimestamp();
  await saveWd(wd);
  await Promise.all([
    redisCommand(["HINCRBY", REDIS_RBOT_PAID_KEY, String(wd.owner_id), wd.amount]),
    redisCommand(["HINCRBY", REDIS_WD_HELD_KEY, String(wd.owner_id), -wd.amount]),
  ]);

  const m = await getResellerMargin(wd.owner_id);
  await tgRequest(token, "sendMessage", {
    chat_id: wd.owner_id,
    text:
      `✅ <b>WD #${wd.id} BERHASIL!</b>\n\n` +
      `💸 <b>Ditarik:</b> <code>${formatRupiah(wd.amount)}</code>\n` +
      (wd.fee > 0 ? `🧾 <b>Biaya Admin:</b> ${formatRupiah(wd.fee)}\n` : "") +
      `🏦 <b>Ditransfer:</b> <code>${formatRupiah(wd.net)}</code>\n` +
      `📍 <b>Tujuan:</b> ${escapeHtml(wd.tujuan)}\n\n` +
      `💳 Sisa margin bisa ditarik: <code>${formatRupiah(m.available)}</code>`,
    parse_mode: "HTML",
  });

  // Posting bukti WD ke channel (tidak boleh mengganggu proses ACC)
  try {
    await sendWdToChannel(token, wd);
  } catch (e) {
    console.error("sendWdToChannel gagal:", e);
  }
  return { ok: true };
}

// Admin tolak: margin yang ditahan dikembalikan utuh.
async function processWdReject(token, wd, alasan) {
  const lock = await redisCommand(["SET", `${REDIS_WD_LOCK_PREFIX}${wd.id}`, "1", "NX", "EX", "86400"]);
  if (!lock) return { ok: false, duplicate: true };

  wd.status = "rejected";
  wd.done_at = getWibTimestamp();
  wd.alasan = alasan || "";
  await saveWd(wd);
  await redisCommand(["HINCRBY", REDIS_WD_HELD_KEY, String(wd.owner_id), -wd.amount]);

  await tgRequest(token, "sendMessage", {
    chat_id: wd.owner_id,
    text:
      `❌ <b>WD #${wd.id} DITOLAK</b>\n\n` +
      `💸 Nominal: <code>${formatRupiah(wd.amount)}</code>\n` +
      (wd.alasan ? `📝 Alasan: ${escapeHtml(wd.alasan)}\n` : "") +
      `\nMargin kamu <b>sudah dikembalikan</b> dan bisa ditarik lagi. Ada pertanyaan? Hubungi @${ADMIN_USERNAME}.`,
    parse_mode: "HTML",
  });
  return { ok: true };
}

async function buildWdHistoryText(ownerId) {
  const ids = (await redisCommand(["LRANGE", `${REDIS_WD_HIST_PREFIX}${ownerId}`, "0", "7"])) || [];
  const m = await getResellerMargin(ownerId);
  let text =
    "💳 <b>WD MARGIN RESELLER</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    `💰 <b>Bisa Ditarik:</b> <code>${formatRupiah(m.available)}</code>\n` +
    (m.held > 0 ? `🔒 <b>Sedang Diproses:</b> <code>${formatRupiah(m.held)}</code>\n` : "") +
    `✅ <b>Total Sudah Ditarik:</b> <code>${formatRupiah(m.paid)}</code>\n\n` +
    "<b>Cara WD:</b>\n" +
    "<code>/wd NOMINAL TUJUAN</code>\n" +
    "<i>Contoh: <code>/wd 25000 DANA 08123456789 a.n Budi</code></i>\n" +
    `Minimal ${formatRupiah(WD_MIN_AMOUNT)}` +
    (WD_FEE > 0 ? ` • Biaya admin ${formatRupiah(WD_FEE)}` : " • Tanpa biaya admin") +
    "\n";
  if (ids.length > 0) {
    text += "\n🧾 <b>Riwayat Terakhir:</b>\n";
    const icon = { pending: "⏳", done: "✅", rejected: "❌" };
    for (const id of ids) {
      const w = await getWd(id);
      if (!w) continue;
      text += `${icon[w.status] || "•"} #${w.id} • ${formatRupiah(w.amount)} • ${escapeHtml(w.created || "")}\n`;
    }
  }
  return text;
}

// Harga modal reseller per set, mengikuti tier & harga retail set tersebut.
function getResellerModalPrice(retailPrice, tier) {
  const retail = Number(retailPrice) || 0;
  if (retail <= RETAIL_PRICE_LITE) return Math.min(retail, tier.price_lite);
  if (retail <= RETAIL_PRICE_STANDAR) return tier.price_standar;
  return Math.round((retail * tier.price_standar) / RETAIL_PRICE_STANDAR / 50) * 50;
}

// Batas harga jual reseller untuk satu set: minimal = retail toko, maksimal = retail + markup%.
function getResellerSellBounds(retail, modal) {
  const min = Math.max(Number(retail) || 0, Number(modal) || 0);
  const cap = Math.round((min * (1 + RESELLER_BOT_MAX_MARKUP_PERCENT / 100)) / 500) * 500;
  return { min, max: Math.max(min, cap) };
}

// Daftar set yang dijual di bot reseller + harga modal / jual / margin.
async function getResellerBotItems(ownerId, rb) {
  const [katalog, omset] = await Promise.all([getKatalog(), getResellerOmset(ownerId)]);
  const tier = getResellerTierInfo(omset.rupiah).tier;
  const prices = (rb && rb.prices) || {};
  const items = [];

  for (const k of katalog) {
    if (!k || !k.id) continue;
    const links =
      Array.isArray(k.links) && k.links.length > 0 ? k.links : k.link ? [k.link] : [];
    const files = Array.isArray(k.files) ? k.files : [];
    if (links.length === 0 && files.length === 0) continue;

    const retail = parseNominal(k.harga);
    const modal = getResellerModalPrice(retail, tier);
    const bounds = getResellerSellBounds(retail, modal);
    if (modal >= bounds.max) continue; // tidak ada ruang margin

    const custom = Number(prices[String(k.id)]);
    const wanted = custom > 0 ? custom : retail;
    const sell = Math.min(bounds.max, Math.max(bounds.min, wanted));

    items.push({
      id: String(k.id),
      nama: k.nama,
      isi: k.isi || "",
      creator: k.creator || "",
      photo_id: k.photo_id || "",
      kategori: k.kategori === "full" ? "full" : "mini",
      sold: Number(k.sold) || 0,
      links,
      files,
      retail,
      modal,
      min_sell: bounds.min,
      max_sell: bounds.max,
      sell,
      margin: sell - modal,
    });
  }
  return { items, tier };
}

async function sendLongText(token, chatId, text) {
  const chunks = [];
  let cur = "";
  for (const line of String(text).split("\n")) {
    if ((cur + line + "\n").length > 3500) {
      chunks.push(cur);
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim()) chunks.push(cur);
  for (const c of chunks) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: c, parse_mode: "HTML" });
  }
}

// file_id Telegram terikat ke bot yang menerimanya. Agar file/foto/QRIS dari bot utama
// bisa tampil di bot reseller, file diunduh lewat bot utama lalu diunggah ulang
// (hasil file_id baru disimpan sebagai cache supaya cuma sekali upload per bot).
async function sendFileViaResellerBot(mainToken, rb, method, chatId, fileId, extra = {}) {
  try {
    const field = method === "sendDocument" ? "document" : "photo";
    const cacheField = `${rb.bot_id}:${fileId}`;

    const cached = await redisCommand(["HGET", REDIS_RBOT_FILECACHE_KEY, cacheField]);
    if (cached) {
      const r = await tgRequest(rb.token, method, { chat_id: chatId, [field]: cached, ...extra });
      if (r && r.ok) return true;
    }

    const info = await tgRequest(mainToken, "getFile", { file_id: fileId });
    if (!info || !info.ok || !info.result || !info.result.file_path) return false;

    const dl = await fetch(`https://api.telegram.org/file/bot${mainToken}/${info.result.file_path}`);
    if (!dl.ok) return false;
    const buf = await dl.arrayBuffer();

    const form = new FormData();
    form.append("chat_id", String(chatId));
    for (const [k, v] of Object.entries(extra)) {
      form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const filename = info.result.file_path.split("/").pop() || (field === "photo" ? "photo.jpg" : "file");
    form.append(field, new Blob([buf]), filename);

    const res = await fetch(`https://api.telegram.org/bot${rb.token}/${method}`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!data || !data.ok) return false;

    const newId =
      field === "photo"
        ? ((data.result.photo || []).slice(-1)[0] || {}).file_id
        : (data.result.document || {}).file_id;
    if (newId) await redisCommand(["HSET", REDIS_RBOT_FILECACHE_KEY, cacheField, newId]);
    return true;
  } catch (e) {
    console.error("sendFileViaResellerBot error:", e);
    return false;
  }
}

async function getOrderBotToken(mainToken, order) {
  if (order && order.rbot_owner) {
    const rb = await getResellerBot(order.rbot_owner);
    if (rb && rb.token) return rb.token;
  }
  return mainToken;
}

async function processAnyOrder(token, order) {
  if (order && order.rbot_owner) return processResellerBotOrder(token, order);
  return processAccOrder(token, order);
}

async function processResellerBotOrder(mainToken, order) {
  // Kunci agar tidak diproses dua kali (makro + klik ACC manual bersamaan)
  const lock = await redisCommand([
    "SET",
    `${REDIS_RBOT_LOCK_PREFIX}${order.id}`,
    "1",
    "NX",
    "EX",
    "86400",
  ]);
  if (!lock) return { deliveredName: order.item_nama, deliveredLink: "", duplicate: true };

  const ownerId = order.rbot_owner;
  const rb = await getResellerBot(ownerId);
  const buyerToken = (rb && rb.token) || mainToken;

  order.status = "acc";
  await saveOrder(order.id, order);

  const links = (
    Array.isArray(order.target_links) && order.target_links.length > 0
      ? order.target_links
      : order.target_link
      ? [order.target_link]
      : []
  ).map(normalizeUrl);
  const files = Array.isArray(order.target_files) ? order.target_files : [];

  const linksBlock =
    links.length > 0
      ? links.map((l) => `🔗 ${escapeHtml(l)}`).join("\n")
      : "<i>(File dikirim langsung di pesan berikutnya)</i>";

  await tgRequest(buyerToken, "sendMessage", {
    chat_id: order.buyer_id,
    text:
      `🎉 <b>PEMBAYARAN DI-ACC! (Pesanan #${order.id})</b>\n\n` +
      `Terima kasih telah membeli <b>${escapeHtml(order.item_nama)}</b>!\n` +
      `Berikut akses file kamu:\n${linksBlock}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: links.slice(0, 8).map((link, i) => [
        { text: links.length > 1 ? `📂 Buka File ${i + 1}` : "📂 Buka Link File Sekarang", url: link },
      ]),
    },
  });

  if (rb) {
    for (const f of files) {
      if (!f || !f.file_id) continue;
      const method = f.type === "document" ? "sendDocument" : "sendPhoto";
      const ok = await sendFileViaResellerBot(mainToken, rb, method, order.buyer_id, f.file_id);
      if (!ok) {
        await tgRequest(buyerToken, "sendMessage", {
          chat_id: order.buyer_id,
          text: `⚠️ Salah satu file gagal terkirim otomatis. Hubungi admin @${ADMIN_USERNAME} dengan menyebut order #${order.id}.`,
        });
      }
    }
  }

  // Counter terjual (ikut ranking Bestseller)
  try {
    const katalogList = await getKatalog();
    const idx = katalogList.findIndex((k) => String(k.id) === String(order.item_id));
    if (idx !== -1) {
      katalogList[idx].sold = (Number(katalogList[idx].sold) || 0) + 1;
      await saveKatalog(katalogList);
    }
  } catch (e) {
    console.error("update sold gagal:", e);
  }

  const margin = Number(order.margin) || 0;
  const modal = Number(order.modal) || 0;

  await addStoreOmset(order.total_nominal);
  if (margin > 0) {
    await redisCommand(["HINCRBY", REDIS_RBOT_MARGIN_KEY, String(ownerId), margin]);
    try {
      await chargeFundForMargin(mainToken, margin, rb && rb.owner_name);
    } catch (fundErr) {
      console.error("potong kas margin gagal:", fundErr);
    }
  }
  await logResellerSale(ownerId, {
    id: order.id,
    item: order.item_nama,
    sell: Number(order.sell_price) || 0,
    modal,
    margin,
    date: getWibTimestamp(),
  });

  // Notifikasi ke reseller (lewat bot utama) + cek naik tier
  try {
    const omsetResult = await addResellerOmset(ownerId, modal);
    const m = await getResellerMargin(ownerId);
    await tgRequest(mainToken, "sendMessage", {
      chat_id: ownerId,
      text:
        `💸 <b>PENJUALAN BARU (#${order.id})</b>\n` +
        `📦 ${escapeHtml(order.item_nama)}\n` +
        `💰 Jual ${formatRupiah(order.sell_price)} − modal ${formatRupiah(modal)} = <b>+${formatRupiah(margin)}</b>\n` +
        `⏳ Margin belum dibayar: <code>${formatRupiah(m.owed)}</code>`,
      parse_mode: "HTML",
    });
    await notifyResellerTierUp(
      mainToken,
      { buyer_id: ownerId, buyer_name: (rb && rb.owner_name) || "Reseller" },
      omsetResult
    );
  } catch (e) {
    console.error("notif reseller gagal:", e);
  }

  // Notifikasi margin ke ADMIN (berlaku untuk Auto-ACC makro maupun ACC manual)
  try {
    const qrisAdmin = await getQris();
    if (qrisAdmin && qrisAdmin.admin_chat_id) {
      const mAdmin = await getResellerMargin(ownerId);
      await tgRequest(mainToken, "sendMessage", {
        chat_id: qrisAdmin.admin_chat_id,
        text:
          `💸 <b>MARGIN RESELLER MASUK (#${order.id})</b>\n\n` +
          `🏪 <b>Toko:</b> ${escapeHtml(order.rbot_nama || "-")} (@${escapeHtml(order.rbot_username || "-")})\n` +
          `👤 <b>Reseller:</b> ${escapeHtml((rb && rb.owner_name) || "Reseller")} (<code>${escapeHtml(String(ownerId))}</code>)\n` +
          `📦 <b>Item:</b> ${escapeHtml(order.item_nama)}\n` +
          `💰 <b>Jual:</b> ${formatRupiah(order.sell_price)} − modal ${formatRupiah(modal)} = <b>+${formatRupiah(margin)}</b>\n` +
          `⏳ <b>Total margin reseller belum dibayar:</b> <code>${formatRupiah(mAdmin.owed)}</code>` +
          (mAdmin.held > 0 ? ` <i>(🔒 ${formatRupiah(mAdmin.held)} sedang WD)</i>` : ""),
        parse_mode: "HTML",
      });
    }
  } catch (e) {
    console.error("notif margin ke admin gagal:", e);
  }

  return { deliveredName: order.item_nama, deliveredLink: links[0] || "" };
}

// ---- ETALASE BOT RESELLER (SISI PEMBELI) ----
function rbShopName(rb) {
  return rb.nama_toko ? rb.nama_toko : `Toko @${rb.username}`;
}

async function rbEditOrSend(ctx, chatId, messageId, text, replyMarkup) {
  if (messageId) {
    const r = await tgRequest(ctx.token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (r && r.ok) return;
  }
  await tgRequest(ctx.token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

async function rbEditCaptionOrText(ctx, chatId, messageId, text) {
  const r = await tgRequest(ctx.token, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: text,
    parse_mode: "HTML",
  });
  if (r && r.ok) return;
  await tgRequest(ctx.token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  });
}

function getRbReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "🛍️ Katalog" }, { text: "🔥 Bestseller" }],
      [{ text: "🏠 Menu Utama" }],
    ],
    resize_keyboard: true,
  };
}

// Kartu menu utama bot reseller (mirip bot utama): banner + info toko + tombol menu.
async function sendRbMainMenu(ctx, chatId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const banner = await getBanner();
  const minPrice = items.length > 0 ? Math.min(...items.map((x) => x.sell)) : 0;
  const miniCount = items.filter((x) => x.kategori !== "full").length;
  const fullCount = items.filter((x) => x.kategori === "full").length;

  const cardText =
    `✨ <b>${escapeHtml(rbShopName(ctx.rb).toUpperCase())}</b> ✨\n` +
    "<i>Koleksi HD Eksklusif • Tanpa Watermark</i>\n\n" +
    "╭─── 💰 <b>INFO TOKO</b> ───\n" +
    `│ • <b>Total Set</b> : ${items.length} koleksi\n` +
    (items.length > 0 ? `│ • <b>Harga Mulai</b> : <code>${formatRupiah(minPrice)}</code>\n` : "") +
    `│ • 🧩 <b>Mini Set</b> : ${miniCount} • 📦 <b>Full Set</b> : ${fullCount}\n` +
    "│ • ⚡ <b>Pengiriman</b> : Otomatis setelah bayar\n" +
    "│ • 💳 <b>Pembayaran</b> : QRIS\n" +
    "╰────────────────────\n\n" +
    "Silakan pilih menu di bawah ini 👇";

  const rows = [
    [
      { text: "🛍️ Katalog Photopack", callback_data: "rkat" },
      { text: "🔥 Bestseller", callback_data: "rbest" },
    ],
    [{ text: "📋 Cara Order", callback_data: "rcara" }],
  ];
  if (ctx.rb.owner_username) {
    rows.push([{ text: `💬 Hubungi Penjual (@${ctx.rb.owner_username})`, url: `https://t.me/${ctx.rb.owner_username}` }]);
  }
  const replyMarkup = { inline_keyboard: rows };

  let sent = false;
  if (banner && banner.file_id) {
    sent = await sendFileViaResellerBot(ctx.mainToken, ctx.rb, "sendPhoto", chatId, banner.file_id, {
      caption: cardText,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
  if (!sent) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: cardText,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
}

// Pilih kategori (Mini Set / Full Set)
async function sendRbCatalog(ctx, chatId, messageId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  if (items.length === 0) {
    await rbEditOrSend(ctx, chatId, messageId, "📂 Katalog sedang diperbarui. Coba lagi nanti ya 🙏", {
      inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "rhome" }]],
    });
    return;
  }
  const miniCount = items.filter((x) => x.kategori !== "full").length;
  const fullCount = items.filter((x) => x.kategori === "full").length;
  const creatorGroups = getCreatorGroups(items);

  const kb = [
    [{ text: `🧩 Mini Set (${miniCount})`, callback_data: "rcat_mini_0" }],
    [{ text: `📦 Full Set (${fullCount})`, callback_data: "rcat_full_0" }],
  ];
  if (creatorGroups.length > 0) {
    kb.push([{ text: `👤 Pilih Creator (${creatorGroups.length})`, callback_data: "rcreator" }]);
  }
  kb.push([{ text: "🔥 Lihat Top Bestseller", callback_data: "rbest" }]);
  kb.push([{ text: "🔙 Menu Utama", callback_data: "rhome" }]);

  await rbEditOrSend(
    ctx,
    chatId,
    messageId,
    "╭─── 🛍️ <b>KATALOG PHOTOPACK</b> ───\n" +
      "│ Mau cari berdasarkan kategori atau creator?\n" +
      "│ Pilih menu di bawah ini dulu ya 👇\n" +
      "╰─────────────────────",
    {
      inline_keyboard: kb,
    }
  );
}

async function sendRbCreatorMenu(ctx, chatId, messageId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const creatorGroups = getCreatorGroups(items);
  if (creatorGroups.length === 0) {
    await rbEditOrSend(ctx, chatId, messageId, "👤 Belum ada daftar creator yang tersedia.", {
      inline_keyboard: [[{ text: "🔙 Kembali ke Katalog", callback_data: "rkat" }]],
    });
    return;
  }

  const rows = creatorGroups.map((grp, idx) => [
    { text: `👤 ${grp.name} (${grp.items.length} set)`.slice(0, 62), callback_data: `rcr_${idx}_0` },
  ]);
  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "rkat" },
    { text: "🏠 Menu Utama", callback_data: "rhome" },
  ]);

  await rbEditOrSend(
    ctx,
    chatId,
    messageId,
    "╭─── 👤 <b>KATALOG PER CREATOR</b> ───\n" +
      "│ Pilih nama creator / cosplayer di bawah\n" +
      "│ untuk melihat semua koleksi set-nya 👇\n" +
      "╰───────────────────────",
    { inline_keyboard: rows }
  );
}

async function sendRbCreatorList(ctx, chatId, creatorIdx, page, messageId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const creatorGroups = getCreatorGroups(items);
  const group = creatorGroups[creatorIdx];
  if (!group || group.items.length === 0) {
    await rbEditOrSend(ctx, chatId, messageId, "⚠️ Daftar creator diperbarui. Silakan pilih ulang ya.", {
      inline_keyboard: [[{ text: "👤 Daftar Creator", callback_data: "rcreator" }]],
    });
    return;
  }

  const rankMap = getRankedKatalog(items);
  const totalPages = Math.max(1, Math.ceil(group.items.length / RESELLER_BOT_ITEMS_PER_PAGE));
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const slice = group.items.slice(p * RESELLER_BOT_ITEMS_PER_PAGE, (p + 1) * RESELLER_BOT_ITEMS_PER_PAGE);

  const rows = slice.map((x) => {
    const rank = rankMap[x.id];
    let prefix = x.kategori === "full" ? "📦" : "🧩";
    let suffix = "";
    if (rank === 1) {
      prefix = "🔥";
      suffix = " • BESTSELLER";
    } else if (rank === 2 || rank === 3) {
      prefix = "⭐";
      suffix = " • POPULER";
    }
    return [{ text: `${prefix} ${x.nama} — ${formatRupiah(x.sell)}${suffix}`.slice(0, 62), callback_data: `ritem_${x.id}` }];
  });

  if (totalPages > 1) {
    const nav = [];
    if (p > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `rcr_${creatorIdx}_${p - 1}` });
    nav.push({ text: `${p + 1}/${totalPages}`, callback_data: `rcr_${creatorIdx}_${p}` });
    if (p < totalPages - 1) nav.push({ text: "Berikutnya ➡️", callback_data: `rcr_${creatorIdx}_${p + 1}` });
    rows.push(nav);
  }
  rows.push([
    { text: "👤 Daftar Creator", callback_data: "rcreator" },
    { text: "🛍️ Kategori", callback_data: "rkat" },
  ]);

  await rbEditOrSend(
    ctx,
    chatId,
    messageId,
    `╭─── 👤 <b>CREATOR: ${escapeHtml(group.name.toUpperCase())}</b> ───\n` +
      `│ Total koleksi: <b>${group.items.length} set</b>${totalPages > 1 ? ` • Hal ${p + 1}/${totalPages}` : ""}\n` +
      "│ Pilih judul di bawah untuk lihat preview & bayar QRIS 👇\n" +
      "╰────────────────────────",
    { inline_keyboard: rows }
  );
}

// Daftar set per kategori (dengan halaman)
async function sendRbCategoryList(ctx, chatId, kategori, page, messageId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const kat = kategori === "full" ? "full" : "mini";
  const filtered = items.filter((x) => (kat === "full" ? x.kategori === "full" : x.kategori !== "full"));

  if (filtered.length === 0) {
    await rbEditOrSend(ctx, chatId, messageId, "📂 Belum ada produk di kategori ini. Coba kategori lain ya 🙏", {
      inline_keyboard: [[{ text: "🔙 Kembali ke Kategori", callback_data: "rkat" }]],
    });
    return;
  }

  const rankMap = getRankedKatalog(items);
  const totalPages = Math.max(1, Math.ceil(filtered.length / RESELLER_BOT_ITEMS_PER_PAGE));
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const slice = filtered.slice(p * RESELLER_BOT_ITEMS_PER_PAGE, (p + 1) * RESELLER_BOT_ITEMS_PER_PAGE);

  const rows = slice.map((x) => {
    const rank = rankMap[x.id];
    let prefix = "📸";
    let suffix = "";
    if (rank === 1) {
      prefix = "🔥";
      suffix = " • BESTSELLER";
    } else if (rank === 2 || rank === 3) {
      prefix = "⭐";
      suffix = " • POPULER";
    }
    return [{ text: `${prefix} ${x.nama} — ${formatRupiah(x.sell)}${suffix}`.slice(0, 62), callback_data: `ritem_${x.id}` }];
  });

  if (totalPages > 1) {
    const nav = [];
    if (p > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `rcat_${kat}_${p - 1}` });
    nav.push({ text: `${p + 1}/${totalPages}`, callback_data: `rcat_${kat}_${p}` });
    if (p < totalPages - 1) nav.push({ text: "Berikutnya ➡️", callback_data: `rcat_${kat}_${p + 1}` });
    rows.push(nav);
  }
  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "rkat" },
    { text: "🏠 Menu Utama", callback_data: "rhome" },
  ]);

  const label = kat === "full" ? "📦 FULL SET" : "🧩 MINI SET";
  await rbEditOrSend(
    ctx,
    chatId,
    messageId,
    `╭─── 🛍️ <b>KATALOG ${label}</b> ───\n` +
      "│ Pilih judul di bawah untuk melihat\n" +
      "│ <b>foto preview</b> & bayar via QRIS:\n" +
      "╰─────────────────────\n" +
      `<i>🔥 = Terlaris #1 • ⭐ = Paling Populer${totalPages > 1 ? ` • Hal ${p + 1}/${totalPages}` : ""}</i>`,
    { inline_keyboard: rows }
  );
}

async function sendRbBestseller(ctx, chatId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const top = items
    .filter((x) => (Number(x.sold) || 0) > 0)
    .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
    .slice(0, 5);

  if (top.length === 0) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text:
        "🔥 <b>SET PALING POPULER & BESTSELLER</b>\n\n" +
        "<i>Belum ada riwayat penjualan tercatat. Yuk jadi pembeli pertama!</i>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍️ Buka Katalog Photopack", callback_data: "rkat" }],
          [{ text: "🔙 Menu Utama", callback_data: "rhome" }],
        ],
      },
    });
    return;
  }

  let lines = "";
  const buttons = [];
  top.forEach((x, idx) => {
    const badge = idx === 0 ? "🔥 <b>#1 BESTSELLER</b>" : `⭐ <b>#${idx + 1} POPULER</b>`;
    lines +=
      `│ ${badge}\n` +
      `│ 📸 <b>${escapeHtml(x.nama)}</b> (${formatRupiah(x.sell)})\n` +
      `│     └ Terjual <b>${Number(x.sold) || 0}x</b>${x.isi ? ` • ${escapeHtml(x.isi)}` : ""}\n`;
    buttons.push([
      { text: `${idx === 0 ? "🔥" : "⭐"} Beli #${idx + 1}: ${x.nama} (${formatRupiah(x.sell)})`.slice(0, 62), callback_data: `ritem_${x.id}` },
    ]);
  });
  buttons.push([
    { text: "🛍️ Semua Katalog", callback_data: "rkat" },
    { text: "🔙 Menu Utama", callback_data: "rhome" },
  ]);

  await tgRequest(ctx.token, "sendMessage", {
    chat_id: chatId,
    text:
      "🔥 <b>TOP SET PALING POPULER & BESTSELLER</b> 🔥\n" +
      "<i>Koleksi dengan pembelian tertinggi pilihan member:</i>\n\n" +
      "╭─── 🏆 <b>REKOMENDASI TERLARIS</b> ───\n" +
      lines +
      "╰────────────────────────\n\n" +
      "Ketuk tombol di bawah untuk intip foto preview & checkout 👇",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendRbCaraOrder(ctx, chatId) {
  await tgRequest(ctx.token, "sendMessage", {
    chat_id: chatId,
    text:
      "📋 <b>PANDUAN & ATURAN PEMBELIAN</b>\n\n" +
      "1️⃣ <b>Pilih Paket</b>\n" +
      "Buka <b>Katalog Photopack</b> atau <b>🔥 Bestseller</b>, lalu klik set yang kamu mau.\n\n" +
      "2️⃣ <b>Bayar Pakai QRIS</b>\n" +
      "Scan QRIS dan transfer <b>TEPAT sampai digit terakhir</b> sesuai total di invoice.\n\n" +
      "3️⃣ <b>Terima File Otomatis</b>\n" +
      "Setelah pembayaran terverifikasi, link file langsung dikirim otomatis ke chat ini.\n\n" +
      "<i>Kalau ada kendala, hubungi penjual atau admin.</i>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛍️ Buka Katalog", callback_data: "rkat" }],
        [{ text: "🔙 Menu Utama", callback_data: "rhome" }],
      ],
    },
  });
}

async function sendRbItemDetail(ctx, chatId, itemId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const x = items.find((i) => i.id === String(itemId));
  if (!x) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Set ini sudah tidak tersedia.",
    });
    return;
  }

  const rank = getRankedKatalog(items)[x.id];
  const sold = Number(x.sold) || 0;
  let popularityLine = "";
  if (rank === 1) popularityLine = `│ • <b>Status :</b> 🔥 <b>#1 BESTSELLER</b> (${sold}x terjual)\n`;
  else if (rank === 2 || rank === 3) popularityLine = `│ • <b>Status :</b> ⭐ <b>#${rank} POPULER</b> (${sold}x terjual)\n`;
  else if (sold > 0) popularityLine = `│ • <b>Terjual :</b> ${sold}x pembelian\n`;

  const caption =
    `✨ <b>${escapeHtml(x.nama)}</b>\n\n` +
    "╭─── 📦 <b>DETAIL PAKET</b> ───\n" +
    popularityLine +
    (x.creator ? `│ • <b>Creator :</b> 👤 ${escapeHtml(x.creator)}\n` : "") +
    (x.isi ? `│ • <b>Isi :</b> ${escapeHtml(x.isi)}\n` : "") +
    `│ • <b>Harga :</b> <code>${formatRupiah(x.sell)}</code>\n` +
    "╰────────────────────\n\n" +
    "💳 Klik tombol di bawah untuk checkout via <b>QRIS</b>. File dikirim otomatis setelah pembayaran terverifikasi!";
  const replyMarkup = {
    inline_keyboard: [
      [{ text: `💳 Beli Set Ini (${formatRupiah(x.sell)})`, callback_data: `rbuy_${x.id}` }],
      [{ text: "🔙 Kembali ke Katalog", callback_data: `rcat_${x.kategori === "full" ? "full" : "mini"}_0` }],
    ],
  };

  let sent = false;
  if (x.photo_id) {
    sent = await sendFileViaResellerBot(ctx.mainToken, ctx.rb, "sendPhoto", chatId, x.photo_id, {
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
  if (!sent) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
}

async function sendRbInvoice(ctx, chatId, user, itemId) {
  const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
  const x = items.find((i) => i.id === String(itemId));
  if (!x) {
    await tgRequest(ctx.token, "sendMessage", { chat_id: chatId, text: "⚠️ Set ini sudah tidak tersedia." });
    return;
  }

  const qris = await getQris();
  if (!qris || !qris.file_id || !qris.admin_chat_id) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Pembayaran QRIS sedang disiapkan. Coba lagi beberapa saat lagi ya 🙏",
    });
    return;
  }

  const order = await createOrder(user, x.nama, x.sell, x.links[0] || "", false, x.id, {
    target_links: x.links,
    target_files: x.files,
    skip_discount_lookup: true,
    rbot_owner: String(ctx.ownerId),
    rbot_bot_id: ctx.rb.bot_id,
    rbot_username: ctx.rb.username,
    rbot_nama: rbShopName(ctx.rb),
    sell_price: x.sell,
    modal: x.modal,
    margin: x.margin,
  });

  const caption =
    `🧾 <b>INVOICE PESANAN #${order.id}</b>\n\n` +
    `📦 <b>Paket:</b> ${escapeHtml(order.item_nama)}\n` +
    `💵 <b>Harga:</b> ${formatRupiah(order.base_nominal)}\n` +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    `💰 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    `⚠️ <b>PENTING:</b> Scan QRIS di atas dan transfer <b>TEPAT sampai digit terakhir</b> (<b>${formatRupiah(order.total_nominal)}</b>) agar sistem otomatis memverifikasi pembayaranmu.\n\n` +
    "Setelah transfer berhasil, file otomatis dikirim atau klik tombol <b>Konfirmasi Pembayaran</b> 👇";
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "✅ Konfirmasi Pembayaran", callback_data: `rconfirm_${order.id}` }],
      [{ text: "❌ Batalkan Pesanan", callback_data: `rcancel_${order.id}` }],
    ],
  };

  const sent = await sendFileViaResellerBot(ctx.mainToken, ctx.rb, "sendPhoto", chatId, qris.file_id, {
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
  if (!sent) {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: caption + "\n\n⚠️ <i>Gambar QRIS gagal dimuat, hubungi admin @" + ADMIN_USERNAME + ".</i>",
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  }
}

async function handleRbCallback(ctx, call) {
  const callerId = call.from.id;
  const chatId = call.message && call.message.chat && call.message.chat.id;
  const messageId = call.message && call.message.message_id;
  const data = call.data || "";

  await tgRequest(ctx.token, "answerCallbackQuery", { callback_query_id: call.id });
  if (!chatId) return;

  if (data === "rhome") {
    await sendRbMainMenu(ctx, chatId);
  } else if (data === "rkat" || data.startsWith("rpage_")) {
    await sendRbCatalog(ctx, chatId, messageId);
  } else if (data.startsWith("rcat_")) {
    const [, kat, pg] = data.split("_");
    await sendRbCategoryList(ctx, chatId, kat, pg, messageId);
  } else if (data === "rcreator") {
    await sendRbCreatorMenu(ctx, chatId, messageId);
  } else if (data.startsWith("rcr_")) {
    const [, cIdx, pg] = data.split("_");
    await sendRbCreatorList(ctx, chatId, parseInt(cIdx, 10), pg, messageId);
  } else if (data === "rbest") {
    await sendRbBestseller(ctx, chatId);
  } else if (data === "rcara") {
    await sendRbCaraOrder(ctx, chatId);
  } else if (data.startsWith("ritem_")) {
    await sendRbItemDetail(ctx, chatId, data.replace("ritem_", ""));
  } else if (data.startsWith("rbuy_")) {
    await sendRbInvoice(ctx, chatId, call.from, data.replace("rbuy_", ""));
  } else if (data.startsWith("rcancel_")) {
    const orderId = data.replace("rcancel_", "");
    const order = await getOrder(orderId);
    if (!order || String(order.buyer_id) !== String(callerId) || order.rbot_owner !== String(ctx.ownerId)) return;
    if (order.status === "pending") {
      order.status = "cancelled";
      await saveOrder(orderId, order);
    }
    await rbEditCaptionOrText(
      ctx,
      chatId,
      messageId,
      `🚫 <b>Order #${escapeHtml(orderId)} dibatalkan.</b>\nSilakan pilih lagi lewat /start.`
    );
  } else if (data.startsWith("rconfirm_")) {
    const orderId = data.replace("rconfirm_", "");
    const order = await getOrder(orderId);
    if (!order) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Pesanan sudah kedaluwarsa. Silakan buat pesanan baru.",
      });
      return;
    }
    if (String(order.buyer_id) !== String(callerId) || order.rbot_owner !== String(ctx.ownerId)) return;
    if (order.status !== "pending") return;

    order.status = "waiting_acc";
    await saveOrder(orderId, order);

    await rbEditCaptionOrText(
      ctx,
      chatId,
      messageId,
      `⏳ <b>MENUNGGU VERIFIKASI (Order #${order.id})</b>\n\n` +
        `📦 Item: ${escapeHtml(order.item_nama)}\n` +
        `💰 Nominal: <b>${formatRupiah(order.total_nominal)}</b>\n\n` +
        "Konfirmasi kamu sudah masuk. File akan otomatis dikirim ke chat ini setelah dana terdeteksi!"
    );

    const qris = await getQris();
    if (qris && qris.admin_chat_id) {
      await tgRequest(ctx.mainToken, "sendMessage", {
        chat_id: qris.admin_chat_id,
        text:
          `🔔 <b>PESANAN MASUK #${order.id}</b> 🤖 <i>(Bot Reseller)</i>\n\n` +
          `🏪 <b>Toko:</b> ${escapeHtml(order.rbot_nama)} (@${escapeHtml(order.rbot_username)}) • Reseller <code>${escapeHtml(order.rbot_owner)}</code>\n` +
          `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
          `📦 <b>Item:</b> ${escapeHtml(order.item_nama)}\n` +
          `💰 <b>Nominal Wajib Masuk:</b> <code>${formatRupiah(order.total_nominal)}</code>\n` +
          `💸 <b>Margin Reseller:</b> ${formatRupiah(order.margin)} <i>(jual ${formatRupiah(order.sell_price)} − modal ${formatRupiah(order.modal)})</i>\n\n` +
          "⚡ <i>Jika Auto-ACC Makro aktif, otomatis lunas saat notif HP masuk (atau klik ACC manual di bawah):</i>",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ ACC #${order.id} (Kirim Link)`, callback_data: `acc_${order.id}` },
              { text: `❌ Tolak #${order.id}`, callback_data: `reject_${order.id}` },
            ],
          ],
        },
      });
    }
  }
}

async function handleRbMessage(ctx, msg) {
  if (!msg.chat || msg.chat.type !== "private" || !msg.from) return;
  const chatId = msg.chat.id;
  const isOwner = String(msg.from.id) === String(ctx.ownerId);
  const { cmd, arg } = parseCommand(msg.text || "");

  // ---- PERINTAH PEMILIK TOKO ----
  if (isOwner && cmd === "/hargaku") {
    const { items, tier } = await getResellerBotItems(ctx.ownerId, ctx.rb);
    let text =
      "💲 <b>HARGA JUAL TOKO KAMU</b>\n" +
      `🏅 Tier: ${tier.name}\n` +
      `Batas: minimal = harga toko utama • maksimal +${RESELLER_BOT_MAX_MARKUP_PERCENT}%\n` +
      "━━━━━━━━━━━━━━━━━━━━\n";
    if (items.length === 0) text += "<i>Belum ada set yang bisa dijual.</i>\n";
    items.forEach((x, i) => {
      text +=
        `${i + 1}. <b>${escapeHtml(x.nama)}</b>\n` +
        `   Modal ${formatRupiah(x.modal)} • Jual <code>${formatRupiah(x.sell)}</code> • Untung ${formatRupiah(x.margin)}\n` +
        `   <i>Boleh diatur ${formatRupiah(x.min_sell)} – ${formatRupiah(x.max_sell)}</i>\n`;
    });
    text +=
      "\nUbah harga:\n<code>/setharga NO HARGA</code>\n<code>/setharga semua HARGA</code>";
    await sendLongText(ctx.token, chatId, text);
    return;
  }

  if (isOwner && cmd === "/setharga") {
    const parts = arg.split(/\s+/);
    const target = (parts[0] || "").toLowerCase();
    const price = parseInt(String(parts[1] || "").replace(/\D/g, ""), 10);
    if (!target || !price) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text:
          "⚠️ Format: <code>/setharga NO HARGA</code> atau <code>/setharga semua HARGA</code>\nLihat nomor set di /hargaku",
        parse_mode: "HTML",
      });
      return;
    }

    const { items } = await getResellerBotItems(ctx.ownerId, ctx.rb);
    const rb = ctx.rb;
    rb.prices = rb.prices || {};

    if (target === "semua") {
      let adjusted = 0;
      for (const x of items) {
        const clamped = Math.min(x.max_sell, Math.max(x.min_sell, price));
        if (clamped !== price) adjusted++;
        rb.prices[x.id] = clamped;
      }
      await saveResellerBot(ctx.ownerId, rb);
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text:
          `✅ Harga <b>${formatRupiah(price)}</b> diterapkan ke ${items.length} set.` +
          (adjusted > 0
            ? `\nℹ️ ${adjusted} set disesuaikan otomatis ke batas modal/maksimal.`
            : "") +
          "\nCek hasilnya di /hargaku",
        parse_mode: "HTML",
      });
      return;
    }

    const idx = parseInt(target, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= items.length) {
      await tgRequest(ctx.token, "sendMessage", { chat_id: chatId, text: "⚠️ Nomor set tidak valid. Lihat /hargaku" });
      return;
    }
    const x = items[idx];
    if (price < x.min_sell) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Harga terlalu rendah. Minimal <b>${formatRupiah(x.min_sell)}</b> (sama dengan harga toko utama).`,
        parse_mode: "HTML",
      });
      return;
    }
    if (price > x.max_sell) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ Harga terlalu tinggi. Maksimal <b>${formatRupiah(x.max_sell)}</b> untuk set ini.`,
        parse_mode: "HTML",
      });
      return;
    }
    rb.prices[x.id] = price;
    await saveResellerBot(ctx.ownerId, rb);
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>${escapeHtml(x.nama)}</b> sekarang dijual <b>${formatRupiah(price)}</b>\n` +
        `💸 Untung per penjualan: <b>${formatRupiah(price - x.modal)}</b>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (isOwner && cmd === "/setnama") {
    const nama = arg.replace(/\s+/g, " ").slice(0, 40);
    if (!nama) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Format: <code>/setnama NAMA TOKO</code>",
        parse_mode: "HTML",
      });
      return;
    }
    ctx.rb.nama_toko = nama;
    await saveResellerBot(ctx.ownerId, ctx.rb);
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: `✅ Nama toko diubah jadi <b>${escapeHtml(nama)}</b>`,
      parse_mode: "HTML",
    });
    return;
  }

  if (isOwner && cmd === "/margin") {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: await buildMarginText(ctx.ownerId),
      parse_mode: "HTML",
    });
    return;
  }

  // ---- ETALASE UNTUK SEMUA ORANG ----
  if (isOwner && cmd === "/start") {
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text:
        "🛠️ <b>Panel Pemilik Toko</b> <i>(hanya kamu yang melihat ini)</i>\n" +
        "• <code>/hargaku</code> — lihat & cek harga jual\n" +
        "• <code>/setharga NO HARGA</code> — ubah harga satu set\n" +
        "• <code>/setharga semua HARGA</code> — samakan harga semua set\n" +
        "• <code>/setnama NAMA TOKO</code> — ganti nama toko\n" +
        "• <code>/margin</code> — lihat untung & pembayaran dari admin",
      parse_mode: "HTML",
    });
  }

  const t = String(msg.text || "").trim();
  if (t === "🛍️ Katalog" || /katalog|list|daftar|harga/i.test(t)) {
    await sendRbCatalog(ctx, chatId, null);
    return;
  }
  if (t === "🔥 Bestseller" || /bestseller|populer|terlaris|laris/i.test(t)) {
    await sendRbBestseller(ctx, chatId);
    return;
  }
  if (t === "📋 Cara Order" || /cara|order|beli/i.test(t)) {
    await sendRbCaraOrder(ctx, chatId);
    return;
  }

  if (cmd === "/start") {
    const buyerName = escapeHtml((msg.from && msg.from.first_name) || "Kak");
    await tgRequest(ctx.token, "sendMessage", {
      chat_id: chatId,
      text: `👋 Halo <b>${buyerName}</b>! Selamat datang di <b>${escapeHtml(rbShopName(ctx.rb))}</b>.`,
      parse_mode: "HTML",
      reply_markup: getRbReplyKeyboard(),
    });
  }
  await sendRbMainMenu(ctx, chatId);
}

async function handleResellerBotRequest(req, res, mainToken, ownerId) {
  if (req.method !== "POST") return res.status(200).send("ok");
  try {
    const rb = await getResellerBot(ownerId);
    if (!rb) return res.status(200).json({ ok: true });

    const headerSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
    if (!headerSecret || headerSecret !== rb.secret) {
      return res.status(401).json({ ok: false });
    }
    if (rb.active === false) return res.status(200).json({ ok: true });
    if (!(await isReseller(ownerId))) return res.status(200).json({ ok: true });

    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const ctx = { mainToken, rb, ownerId: String(ownerId), token: rb.token };

    if (update.callback_query) {
      await handleRbCallback(ctx, update.callback_query);
    } else if (update.message) {
      await handleRbMessage(ctx, update.message);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Reseller Bot Error:", err);
    return res.status(200).json({ ok: true });
  }
}

// ---- PERINTAH DI BOT UTAMA: DAFTAR/KELOLA BOT RESELLER + ADMIN ----
// return true bila perintah sudah ditangani.
async function handleResellerBotMainCommands(token, req, msg, rawText, isAdmin) {
  const { cmd, arg } = parseCommand(rawText);
  const chatId = msg.chat.id;
  const uid = msg.from && msg.from.id;
  const reply = (text) =>
    tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });

  // ----- reseller -----
  if (cmd === "/daftarbot") {
    if (!msg.chat || msg.chat.type !== "private") return true;
    // hapus pesan berisi token (best-effort)
    tgRequest(token, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});

    if (!(await isReseller(uid))) {
      await reply("❌ Fitur ini khusus reseller. Daftar dulu lewat menu 🤝 Reseller ya!");
      return true;
    }
    if (await getResellerBot(uid)) {
      await reply("⚠️ Kamu sudah punya bot toko. Lihat /botku atau hapus dulu dengan /hapusbot.");
      return true;
    }
    const botToken = arg.trim();
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
      await reply(
        "⚠️ Format token tidak valid.\n\n<b>Cara:</b>\n1. Buka @BotFather → <code>/newbot</code>\n2. Salin token bot kamu\n3. Kirim: <code>/daftarbot TOKEN_BOT</code>"
      );
      return true;
    }
    if (botToken === token) {
      await reply("⚠️ Token itu tidak bisa dipakai.");
      return true;
    }
    const me = await tgRequest(botToken, "getMe", {});
    if (!me || !me.ok || !me.result) {
      await reply("⚠️ Token tidak valid / bot tidak ditemukan. Cek lagi token dari @BotFather.");
      return true;
    }
    const all = await getAllResellerBots();
    if (Object.values(all).some((b) => String(b.bot_id) === String(me.result.id))) {
      await reply("⚠️ Bot itu sudah terdaftar. Pakai bot lain.");
      return true;
    }

    const secret = require("crypto").randomBytes(24).toString("hex");
    const hookUrl = `https://${req.headers.host}/api/webhook?rb=${uid}`;
    const wh = await tgRequest(botToken, "setWebhook", {
      url: hookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    if (!wh || !wh.ok) {
      await reply(`⚠️ Gagal memasang webhook bot: ${escapeHtml((wh && wh.description) || "tidak diketahui")}`);
      return true;
    }

    await saveResellerBot(uid, {
      token: botToken,
      bot_id: me.result.id,
      username: me.result.username || "",
      secret,
      nama_toko: "",
      prices: {},
      active: true,
      owner_name: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "Reseller",
      owner_username: msg.from.username || "",
      created: getWibTimestamp(),
    });

    await reply(
      `✅ <b>Bot toko aktif!</b>\n\n` +
        `🤖 @${escapeHtml(me.result.username || "")}\n` +
        `🔗 https://t.me/${escapeHtml(me.result.username || "")}\n\n` +
        "<b>Atur toko kamu di bot itu</b> (kirim perintah dari akun ini):\n" +
        "• <code>/hargaku</code> — lihat modal & harga jual\n" +
        "• <code>/setharga NO HARGA</code> — atur harga jual\n" +
        "• <code>/setnama NAMA TOKO</code>\n" +
        "• <code>/margin</code> — untung kamu\n\n" +
        `ℹ️ Harga jual minimal = harga toko utama, maksimal +${RESELLER_BOT_MAX_MARKUP_PERCENT}%. Cek batas tiap set di /hargaku.`
    );
    return true;
  }

  if (cmd === "/botku") {
    if (!(await isReseller(uid))) {
      await reply("❌ Kamu belum terdaftar sebagai reseller.");
      return true;
    }
    const rb = await getResellerBot(uid);
    await reply(
      rb
        ? `🤖 <b>Bot Toko Kamu</b>\n@${escapeHtml(rb.username)} — ${rb.active === false ? "⛔ nonaktif (hubungi admin)" : "✅ aktif"}\n🏪 ${escapeHtml(rbShopName(rb))}\n\nAtur harga di bot itu: /hargaku • /setharga • /margin`
        : "Kamu belum punya bot toko. Kirim <code>/daftarbot TOKEN_BOT</code> (token dari @BotFather)."
    );
    return true;
  }

  if (cmd === "/margin") {
    if (!(await isReseller(uid))) {
      await reply("❌ Kamu belum terdaftar sebagai reseller.");
      return true;
    }
    await reply(await buildMarginText(uid));
    return true;
  }

  // ----- WD margin (reseller) -----
  if (cmd === "/riwayatwd" || (cmd === "/wd" && !arg)) {
    if (!msg.chat || msg.chat.type !== "private") return true;
    if (!(await isReseller(uid))) {
      await reply("❌ Fitur WD khusus reseller.");
      return true;
    }
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: await buildWdHistoryText(uid),
      parse_mode: "HTML",
    });
    return true;
  }

  if (cmd === "/wd") {
    if (!msg.chat || msg.chat.type !== "private") return true;
    if (!(await isReseller(uid))) {
      await reply("❌ Fitur WD khusus reseller.");
      return true;
    }
    const m = arg.match(/^(\S+)\s+([\s\S]+)$/);
    const nominal = m ? parseInt(m[1].replace(/\D/g, ""), 10) : parseInt(arg.replace(/\D/g, ""), 10);
    const tujuan = m ? m[2].trim() : "";
    if (!nominal) {
      await reply(
        "⚠️ Format: <code>/wd NOMINAL TUJUAN</code>\n<i>Contoh: <code>/wd 25000 DANA 08123456789 a.n Budi</code></i>"
      );
      return true;
    }

    const result = await createWdRequest(msg.from, nominal, tujuan);
    if (!result.ok) {
      await reply(result.error);
      return true;
    }

    const wd = result.wd;
    await reply(
      `⏳ <b>PENGAJUAN WD #${wd.id} TERKIRIM</b>\n\n` +
        `💸 Nominal: <code>${formatRupiah(wd.amount)}</code>\n` +
        (wd.fee > 0 ? `🧾 Biaya Admin: ${formatRupiah(wd.fee)}\n` : "") +
        `🏦 Diterima: <code>${formatRupiah(wd.net)}</code>\n` +
        `📍 Tujuan: ${escapeHtml(wd.tujuan)}\n\n` +
        "Admin akan memproses & mentransfer manual. Kamu dapat notifikasi saat selesai."
    );

    const qris = await getQris();
    const adminChat = qris && qris.admin_chat_id;
    if (adminChat) {
      await tgRequest(token, "sendMessage", {
        chat_id: adminChat,
        text:
          `💸 <b>PENGAJUAN WD RESELLER #${wd.id}</b>\n\n` +
          `👤 ${escapeHtml(wd.owner_name)} (${escapeHtml(wd.owner_username)}) • <code>${escapeHtml(wd.owner_id)}</code>\n` +
          `💰 Nominal: <code>${formatRupiah(wd.amount)}</code>\n` +
          (wd.fee > 0 ? `🧾 Biaya Admin: ${formatRupiah(wd.fee)}\n` : "") +
          `🏦 <b>Transfer: <code>${formatRupiah(wd.net)}</code></b>\n` +
          `📍 Tujuan: <code>${escapeHtml(wd.tujuan)}</code>\n\n` +
          "<i>Transfer manual dulu, lalu klik ACC. Tolak = margin dikembalikan ke reseller.</i>",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ ACC WD #${wd.id} (Sudah Transfer)`, callback_data: `wdacc_${wd.id}` },
              { text: `❌ Tolak #${wd.id}`, callback_data: `wdrej_${wd.id}` },
            ],
          ],
        },
      });
    } else {
      await reply(`ℹ️ Admin belum mengaktifkan notifikasi. Hubungi @${ADMIN_USERNAME} sebut WD #${wd.id}.`);
    }
    return true;
  }

  if (cmd === "/hapusbot") {
    const targetId = isAdmin && /^\d+$/.test(arg) ? arg : String(uid);
    const ok = await removeResellerBot(targetId);
    await reply(ok ? `✅ Bot toko <code>${escapeHtml(targetId)}</code> dihapus.` : "⚠️ Tidak ada bot toko yang terdaftar.");
    return true;
  }

  // ----- admin -----
  const adminCmds = ["/listbot", "/matikanbot", "/aktifkanbot", "/listmargin", "/bayarmargin", "/listwd", "/setwdch"];
  if (!adminCmds.includes(cmd)) return false;
  if (!isAdmin) return true;

  if (cmd === "/setwdch") {
    const current = await redisCommand(["GET", REDIS_WD_CH_KEY]);
    if (!arg) {
      let status = "Pakai <b>Channel Testimoni</b> (default)";
      if (current) {
        try {
          status = `✅ <b>${escapeHtml(JSON.parse(current).channel_title || "Channel WD")}</b>`;
        } catch {
          // abaikan
        }
      }
      await reply(
        "💸 <b>CHANNEL BUKTI WD</b>\n\n" +
          `Status: ${status}\n\n` +
          "1. Jadikan bot ini <b>Admin</b> di channelnya.\n" +
          "2. Ketik <code>/setwdch @username_channel</code>\n" +
          "<i><code>/setwdch off</code> = balik ke Channel Testimoni.</i>"
      );
      return true;
    }
    if (arg.toLowerCase() === "off") {
      await redisCommand(["DEL", REDIS_WD_CH_KEY]);
      await reply("✅ Channel WD khusus dihapus. Notif WD kembali ke Channel Testimoni.");
      return true;
    }
    const test = await tgRequest(token, "sendMessage", {
      chat_id: arg,
      text: "✅ <b>Channel Bukti WD Berhasil Terhubung!</b>",
      parse_mode: "HTML",
    });
    if (test && test.ok) {
      await redisCommand([
        "SET",
        REDIS_WD_CH_KEY,
        JSON.stringify({
          channel_id: test.result.chat.id,
          channel_title: test.result.chat.title || arg,
        }),
      ]);
      await reply(`✅ Notif WD akan diposting ke <b>${escapeHtml(test.result.chat.title || arg)}</b>.`);
    } else {
      await reply("⚠️ Gagal kirim ke channel itu. Pastikan bot sudah jadi Admin di channel lalu ulangi.");
    }
    return true;
  }

  if (cmd === "/listwd") {
    const pend = (await redisCommand(["HGETALL", REDIS_WD_PENDING_KEY])) || [];
    if (pend.length === 0) {
      await reply("✅ Tidak ada WD pending.");
      return true;
    }
    for (let i = 0; i < pend.length; i += 2) {
      const w = await getWd(pend[i]);
      if (!w || w.status !== "pending") continue;
      await tgRequest(token, "sendMessage", {
        chat_id: chatId,
        text:
          `💸 <b>WD PENDING #${w.id}</b>\n` +
          `👤 ${escapeHtml(w.owner_name)} • <code>${escapeHtml(w.owner_id)}</code>\n` +
          `🏦 Transfer: <code>${formatRupiah(w.net)}</code> (nominal ${formatRupiah(w.amount)})\n` +
          `📍 <code>${escapeHtml(w.tujuan)}</code>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ ACC #${w.id}`, callback_data: `wdacc_${w.id}` },
              { text: `❌ Tolak #${w.id}`, callback_data: `wdrej_${w.id}` },
            ],
          ],
        },
      });
    }
    return true;
  }

  if (cmd === "/listbot") {
    const all = await getAllResellerBots();
    const ids = Object.keys(all);
    if (ids.length === 0) {
      await reply("📂 Belum ada bot reseller.");
      return true;
    }
    let text = "🤖 <b>DAFTAR BOT RESELLER</b>\n━━━━━━━━━━━━━━━━━━━━\n";
    for (const id of ids) {
      const b = all[id];
      const m = await getResellerMargin(id);
      text +=
        `• @${escapeHtml(b.username)} — ${b.active === false ? "⛔" : "✅"}\n` +
        `  👤 ${escapeHtml(b.owner_name || "-")} (<code>${escapeHtml(id)}</code>)\n` +
        `  💸 Margin belum dibayar: <code>${formatRupiah(m.owed)}</code>\n`;
    }
    await sendLongText(token, chatId, text);
    return true;
  }

  if (cmd === "/matikanbot" || cmd === "/aktifkanbot") {
    const rb = /^\d+$/.test(arg) ? await getResellerBot(arg) : null;
    if (!rb) {
      await reply(`⚠️ Gunakan: <code>${cmd} ID_RESELLER</code> (lihat /listbot)`);
      return true;
    }
    rb.active = cmd === "/aktifkanbot";
    await saveResellerBot(arg, rb);
    await reply(`✅ Bot @${escapeHtml(rb.username)} ${rb.active ? "diaktifkan" : "dinonaktifkan"}.`);
    return true;
  }

  if (cmd === "/listmargin") {
    const all = await getAllResellerBots();
    const rows = [];
    for (const id of Object.keys(all)) {
      const m = await getResellerMargin(id);
      if (m.owed > 0) rows.push({ id, name: all[id].owner_name || "-", owed: m.owed });
    }
    rows.sort((a, b) => b.owed - a.owed);
    if (rows.length === 0) {
      await reply("✅ Tidak ada margin reseller yang belum dibayar.");
      return true;
    }
    let text = "💸 <b>MARGIN BELUM DIBAYAR</b>\n━━━━━━━━━━━━━━━━━━━━\n";
    let total = 0;
    for (const r of rows) {
      total += r.owed;
      text += `• ${escapeHtml(r.name)} (<code>${escapeHtml(r.id)}</code>): <b>${formatRupiah(r.owed)}</b>\n`;
    }
    text += `\nTotal: <b>${formatRupiah(total)}</b>\nBayar: <code>/bayarmargin ID NOMINAL</code>`;
    await sendLongText(token, chatId, text);
    return true;
  }

  if (cmd === "/bayarmargin") {
    const parts = arg.split(/\s+/);
    const targetId = parts[0];
    const nominal = parseInt(String(parts[1] || "").replace(/\D/g, ""), 10);
    if (!targetId || !/^\d+$/.test(targetId) || !nominal) {
      await reply("⚠️ Gunakan: <code>/bayarmargin ID NOMINAL</code> (lihat /listmargin)");
      return true;
    }
    const m = await getResellerMargin(targetId);
    if (nominal > m.available) {
      await reply(
        `⚠️ Nominal melebihi margin yang bisa dibayar (${formatRupiah(m.available)}).` +
          (m.held > 0 ? `\n🔒 ${formatRupiah(m.held)} sedang diproses lewat WD pending (cek /listwd).` : "")
      );
      return true;
    }
    await redisCommand(["HINCRBY", REDIS_RBOT_PAID_KEY, targetId, nominal]);
    const after = await getResellerMargin(targetId);
    await reply(
      `✅ Pembayaran margin <b>${formatRupiah(nominal)}</b> dicatat untuk <code>${escapeHtml(targetId)}</code>.\nSisa belum dibayar: <b>${formatRupiah(after.owed)}</b>`
    );
    await tgRequest(token, "sendMessage", {
      chat_id: targetId,
      text:
        `✅ <b>MARGIN DIBAYAR!</b>\nAdmin sudah membayar margin kamu sebesar <b>${formatRupiah(nominal)}</b>.\n` +
        `⏳ Sisa belum dibayar: <code>${formatRupiah(after.owed)}</code>`,
      parse_mode: "HTML",
    });
    return true;
  }

  return false;
}

module.exports = async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: "BOT_TOKEN belum diisi di Vercel." });
  }

  // HANDLER AUTO-ACC MAKRO (GET ATAU POST DENGAN ?autoacc=1)
  const isAutoAccCall =
    (req.query && String(req.query.autoacc) === "1") ||
    (req.body && typeof req.body === "object" && String(req.body.autoacc) === "1");

  if (isAutoAccCall) {
    try {
      const macroCfg = await getMacroConfig();
      if (!macroCfg.enabled) {
        return res.status(200).json({ ok: false, reason: "Auto-ACC makro sedang dimatikan (/setmacro off)" });
      }

      const bodyObj =
        req.body && typeof req.body === "string"
          ? (() => {
              try {
                return JSON.parse(req.body);
              } catch {
                return {};
              }
            })()
          : req.body || {};

      if (!macroCfg.secret) {
        return res.status(503).json({
          ok: false,
          error: "Secret makro belum diatur. Kirim /setmacro KODERAHASIA ke bot, lalu samakan di makro Android.",
        });
      }
      const incomingSecret = String(
        (req.query && req.query.secret) || bodyObj.secret || req.headers["x-macro-secret"] || ""
      ).trim();
      if (!incomingSecret || !safeEqual(incomingSecret, macroCfg.secret)) {
        return res.status(401).json({ ok: false, error: "Secret makro tidak cocok" });
      }

      const rawNotif = [
        req.query && req.query.nominal,
        req.query && req.query.title,
        req.query && req.query.text,
        bodyObj.nominal,
        bodyObj.title,
        bodyObj.text,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const nominals = extractNominalsFromNotif(rawNotif);
      const matchedOrder = await findPendingOrderByNominals(nominals);
      const qris = await getQris();

      if (!matchedOrder) {
        if (qris && qris.admin_chat_id) {
          const debugText = escapeHtml(rawNotif || "(KOSONG / TIDAK TERBACA)");
          const debugNums = nominals.length > 0 ? nominals.join(", ") : "Tidak ada angka";
          await tgRequest(token, "sendMessage", {
            chat_id: qris.admin_chat_id,
            text:
              `🔍 <b>LOG MAKRO MASUK (BELUM COCOK)</b>\n\n` +
              `📲 <b>Isi Notif:</b> <i>"${debugText}"</i>\n` +
              `🔢 <b>Angka Terbaca:</b> <code>${escapeHtml(debugNums)}</code>\n\n` +
              `<i>Pastikan ada pesanan pending dengan total transfer yang sama persis.</i>`,
            parse_mode: "HTML",
          });
        }

        return res.status(200).json({
          ok: true,
          matched: false,
          raw_notif: rawNotif,
          extracted_nominals: nominals,
          message: "Tidak ada pesanan aktif dengan nominal tersebut.",
        });
      }

      const accResult = await processAnyOrder(token, matchedOrder);
      if (accResult && accResult.duplicate) {
        return res.status(200).json({
          ok: true,
          matched: true,
          duplicate: true,
          order_id: matchedOrder.id,
          message: "Order ini sudah/sedang diproses.",
        });
      }
      const { deliveredName } = accResult;

      if (qris && qris.admin_chat_id) {
        const extraNote = matchedOrder.is_deposit
          ? `\n💳 <b>Jenis:</b> Deposit Saldo (+${formatRupiah(matchedOrder.base_nominal)})`
          : matchedOrder.is_mystery
          ? `\n🎲 <b>Hadiah Gacha:</b> ${escapeHtml(deliveredName)}`
          : "";
        const notifSnippet = escapeHtml(rawNotif.slice(0, 140));
        const footerNote = matchedOrder.is_deposit
          ? "✅ <i>Saldo otomatis ditambahkan ke akun pembeli!</i>"
          : "✅ <i>Link otomatis terkirim ke pembeli, Bestseller, Leaderboard & Testimoni!</i>";

        await tgRequest(token, "sendMessage", {
          chat_id: qris.admin_chat_id,
          text:
            `⚡ <b>AUTO-ACC MAKRO BERHASIL (#${matchedOrder.id})</b>\n\n` +
            `👤 <b>Pembeli:</b> ${escapeHtml(matchedOrder.buyer_name)} (${escapeHtml(matchedOrder.buyer_username)})\n` +
            `📦 <b>Paket:</b> ${escapeHtml(matchedOrder.item_nama)}${extraNote}\n` +
            `💰 <b>Nominal Cocok:</b> <code>${formatRupiah(matchedOrder.total_nominal)}</code>\n` +
            `📲 <b>Notif HP:</b> <i>"${notifSnippet}"</i>\n\n` +
            footerNote,
          parse_mode: "HTML",
        });
      }

      return res.status(200).json({
        ok: true,
        matched: true,
        order_id: matchedOrder.id,
        nominal: matchedOrder.total_nominal,
      });
    } catch (macroErr) {
      console.error("Auto-ACC Macro Error:", macroErr);
      return res.status(200).json({ ok: false, error: String(macroErr.message || macroErr) });
    }
  }

  // BOT RESELLER: update dari bot toko milik reseller (?rb=ID_RESELLER)
  if (req.query && req.query.rb) {
    return handleResellerBotRequest(req, res, token, String(req.query.rb));
  }

  if (req.method === "GET") {
    if (req.query.setup === "true") {
      const webhookUrl = `https://${req.headers.host}/api/webhook`;
      const result = await tgRequest(token, "setWebhook", {
        url: webhookUrl,
        secret_token: getMainWebhookSecret(token),
      });
      const macroCfg = await getMacroConfig();
      macroCfg.host = req.headers.host;
      await saveMacroConfig(macroCfg);

      return res.status(200).json({
        status: "Webhook Bot Utama berhasil diatur",
        webhook_url: webhookUrl,
        macro_autoacc_url: `https://${req.headers.host}/api/webhook?autoacc=1&secret=(disembunyikan, lihat lewat /setmacro di bot)&text={not_text}`,
        database_connected: Boolean(
          (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
            (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
        ),
        telegram_response: result,
      });
    }
    return res.status(200).send("Bot Utama Lumine Photopack Aktif!");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Pastikan request benar-benar dari Telegram (header dari setWebhook secret_token)
  const hdrSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
  if (!safeEqual(hdrSecret, getMainWebhookSecret(token))) {
    console.warn("Webhook ditolak: secret_token tidak ada/tidak cocok.");
    return res.status(401).json({ ok: false });
  }

  try {
    const update =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // ------------------------------------------
    // 0. HANDLER POSTINGAN CHANNEL (/settesti LANGSUNG DI CH)
    // ------------------------------------------
    if (update.channel_post) {
      const post = update.channel_post;
      const postText = (post.text || "").trim();
      if (postText.startsWith("/settesti")) {
        const me = await tgRequest(token, "getMe", {});
        const botUsername = (me && me.result && me.result.username) || "";
        const chTitle = post.chat.title || "Channel Testimoni";
        const chUsername = post.chat.username || "";

        await saveTestiConfig({
          channel_id: post.chat.id,
          channel_title: chTitle,
          channel_username: chUsername,
          bot_username: botUsername,
        });

        await tgRequest(token, "deleteMessage", {
          chat_id: post.chat.id,
          message_id: post.message_id,
        });

        await tgRequest(token, "sendMessage", {
          chat_id: post.chat.id,
          text:
            `✅ <b>Channel Testimoni Berhasil Terhubung!</b>\n` +
            `Setiap pesanan yang di-ACC akan otomatis diposting di sini.`,
          parse_mode: "HTML",
        });

        const qris = await getQris();
        if (qris && qris.admin_chat_id) {
          await tgRequest(token, "sendMessage", {
            chat_id: qris.admin_chat_id,
            text:
              `✅ <b>Channel Testimoni Aktif!</b>\n` +
              `• <b>Nama CH:</b> ${escapeHtml(chTitle)}\n` +
              `• <b>ID CH:</b> <code>${post.chat.id}</code>`,
            parse_mode: "HTML",
          });
        }
      }
      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------
    // A. HANDLER KLIK TOMBOL INLINE
    // ------------------------------------------
    if (update.callback_query) {
      const call = update.callback_query;
      const chatId = call.message.chat.id;
      const messageId = call.message.message_id;
      const data = call.data;
      const callerId = call.from.id;
      const callerUsername = (call.from && call.from.username) || "";
      const isCallerAdmin = await isAdminUser(call.from);

      await tgRequest(token, "answerCallbackQuery", {
        callback_query_id: call.id,
      });

      if (data === "menu_home") {
        await sendMainMenuCard(token, chatId);
      } else if (data === "menu_saldo") {
        await sendSaldoMenu(token, chatId, callerId);
      } else if (data.startsWith("depo_")) {
        const nominal = parseInt(data.replace("depo_", ""), 10) || 0;
        await createAndSendDepositInvoice(token, chatId, call.from, nominal);
      } else if (data === "menu_katalog") {
        await sendKatalogMenu(token, chatId);
      } else if (data === "menu_katalog_mini") {
        await sendKatalogListByCategory(token, chatId, "mini");
      } else if (data === "menu_katalog_full") {
        await sendKatalogListByCategory(token, chatId, "full");
      } else if (data === "menu_katalog_creator") {
        await sendKatalogCreatorMenu(token, chatId);
      } else if (data.startsWith("creator_list_")) {
        const cIdx = parseInt(data.replace("creator_list_", ""), 10);
        await sendKatalogListByCreator(token, chatId, cIdx);
      } else if (data === "menu_bestseller") {
        await sendBestsellerMenu(token, chatId);
      } else if (data === "menu_mystery") {
        await sendMysteryMenu(token, chatId);
      } else if (data === "menu_koleksi") {
        await sendKoleksiMenu(token, chatId, callerId);
      } else if (data === "menu_promo") {
        // tombol lama (promo bundling sudah dihapus) -> arahkan ke katalog
        await sendKatalogMenu(token, chatId);
      } else if (data === "menu_cara") {
        await sendCaraOrder(token, chatId);
      } else if (data === "menu_lainnya") {
        await sendMoreMenu(token, chatId);
      } else if (data === "menu_channel") {
        await sendChannelLainnya(token, chatId);
      } else if (data === "menu_undang") {
        await sendReferralMenu(token, chatId, callerId);
      } else if (data === "menu_reseller") {
        await sendResellerMenu(token, chatId, call.from);
      } else if (data === "menu_voucher") {
        const activeV = await getActiveUserVoucher(callerId);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "🎟️ <b>KLAIM KODE VOUCHER DISKON</b>\n\n" +
            (activeV
              ? `✅ Voucher aktif siap pakai: <b>${escapeHtml(activeV.code)}</b> (Potongan <b>${formatRupiah(activeV.discount)}</b>)\n\n`
              : "") +
            "Ketik perintah berikut untuk memasang kode voucher sebelum checkout:\n" +
            "<code>/voucher KODE_KAMU</code>\n\n" +
            "<i>Contoh: <code>/voucher YT500</code></i>",
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
          },
        });
      } else if (data === "menu_lb") {
        const lb = await buildLeaderboardPayload("month", callerId);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: lb.text,
          parse_mode: "HTML",
          reply_markup: lb.reply_markup,
        });
      } else if (data.startsWith("lb_")) {
        const period = data.replace("lb_", "");
        const lb = await buildLeaderboardPayload(period, callerId);
        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: lb.text,
          parse_mode: "HTML",
          reply_markup: lb.reply_markup,
        });
      } else if (data.startsWith("detail_")) {
        const katalogList = await getKatalog();
        const itemId = data.replace("detail_", "");
        const item = katalogList.find((k) => String(k.id) === itemId);

        if (!item) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Maaf, set ini sudah dihapus atau diperbarui oleh admin.",
          });
          return res.status(200).json({ ok: true });
        }

        const rankMap = getRankedKatalog(katalogList);
        const rank = rankMap[String(item.id)];
        const sold = Number(item.sold) || 0;
        let popularityLine = "";
        if (rank === 1) {
          popularityLine = `│ • <b>Status :</b> 🔥 <b>#1 BESTSELLER</b> (${sold}x terjual)\n`;
        } else if (rank === 2 || rank === 3) {
          popularityLine = `│ • <b>Status :</b> ⭐ <b>#${rank} POPULER</b> (${sold}x terjual)\n`;
        } else if (sold > 0) {
          popularityLine = `│ • <b>Terjual :</b> ${sold}x pembelian\n`;
        }

        const [activeV, saldo] = await Promise.all([
          getActiveUserVoucher(callerId),
          getUserSaldo(callerId),
        ]);
        const voucherNote = activeV
          ? `\n🎟️ <i>Voucher aktif: <b>${escapeHtml(activeV.code)}</b> (-${formatRupiah(activeV.discount)})</i>`
          : "";

        const captionText =
          `✨ <b>${escapeHtml(item.nama)}</b>\n\n` +
          `╭─── 📦 <b>DETAIL PAKET</b> ───\n` +
          popularityLine +
          (item.creator ? `│ • <b>Creator :</b> 👤 ${escapeHtml(item.creator)}\n` : "") +
          `│ • <b>Isi :</b> ${escapeHtml(item.isi)}\n` +
          `│ • <b>Harga :</b> <code>${escapeHtml(item.harga)}</code>\n` +
          `│ • <b>Saldo Kamu :</b> <code>${formatRupiah(saldo)}</code>\n` +
          `╰────────────────────${voucherNote}\n\n` +
          `💳 Klik tombol di bawah untuk checkout via <b>Saldo</b> atau <b>QRIS</b>!`;

        const inlineMarkup = {
          inline_keyboard: [
            [
              {
                text: `💳 Beli Set Ini (${item.harga})`,
                callback_data: `buy_${item.id}`,
              },
            ],
            [
              {
                text: "🔙 Kembali ke Katalog",
                callback_data: "menu_katalog",
              },
            ],
          ],
        };

        if (item.photo_id) {
          await tgRequest(token, "sendPhoto", {
            chat_id: chatId,
            photo: item.photo_id,
            caption: captionText,
            parse_mode: "HTML",
            reply_markup: inlineMarkup,
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: captionText,
            parse_mode: "HTML",
            reply_markup: inlineMarkup,
          });
          }
                } else if (data.startsWith("buyqris_")) {
        const targetKey = data.replace("buyqris_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: target.error });
          return res.status(200).json({ ok: true });
        }
        await sendQrisInvoiceForTarget(token, chatId, call.from, target);
      } else if (data.startsWith("paysaldo_")) {
        const targetKey = data.replace("paysaldo_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: target.error });
          return res.status(200).json({ ok: true });
        }

        const bestDiscount = await resolveBestDiscount(callerId, target.itemId, target.baseNominal);
        const discount = bestDiscount.discount;
        const voucherCode = bestDiscount.code;

        const finalPrice = Math.max(500, target.baseNominal - discount);
        const deduction = await deductUserSaldo(callerId, finalPrice);

        if (!deduction.ok) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `⚠️ <b>Saldo Tidak Cukup!</b>\n` +
              `Harga paket: <code>${formatRupiah(finalPrice)}</code>\n` +
              `Saldo kamu: <code>${formatRupiah(deduction.balance)}</code>`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "➕ Isi Saldo Sekarang", callback_data: "menu_saldo" }],
                [{ text: "💳 Bayar Via QRIS Saja", callback_data: `buyqris_${targetKey}` }],
              ],
            },
          });
          return res.status(200).json({ ok: true });
        }

        if (discount > 0) {
          await consumeDiscountSource(callerId, bestDiscount.source);
        }

        const order = await createOrder(
          call.from,
          target.itemNama,
          target.baseNominal,
          target.targetLink,
          target.isMystery,
          target.itemId,
          {
            skip_unique: true,
            paid_with_saldo: true,
            preset_discount: discount,
            preset_voucher_code: voucherCode,
            upsell: bestDiscount.source === "upsell",
            skip_discount_lookup: true,
            target_links: target.targetLinks || [],
            target_files: target.targetFiles || [],
          }
        );

        const { deliveredName } = await processAccOrder(token, order);

        const qris = await getQris();
        if (qris && qris.admin_chat_id) {
          const mysteryNote = order.is_mystery
            ? `\n🎲 <b>Hadiah Gacha:</b> ${escapeHtml(deliveredName)}`
            : "";
          await tgRequest(token, "sendMessage", {
            chat_id: qris.admin_chat_id,
            text:
              `💳 <b>TRANSAKSI SALDO OTOMATIS (#${order.id})</b>\n\n` +
              `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
              `📦 <b>Paket:</b> ${escapeHtml(order.item_nama)}${mysteryNote}\n` +
              `💰 <b>Potong Saldo:</b> <code>${formatRupiah(order.total_nominal)}</code>\n` +
              `💳 <b>Sisa Saldo User:</b> <code>${formatRupiah(deduction.balance)}</code>\n\n` +
              `✅ <i>Link otomatis terkirim ke pembeli!</i>`,
            parse_mode: "HTML",
          });
        }
      } else if (data.startsWith("buy_")) {
        const targetKey = data.replace("buy_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: target.error });
          return res.status(200).json({ ok: true });
        }

        const [saldo, bestDiscount] = await Promise.all([
          getUserSaldo(callerId),
          resolveBestDiscount(callerId, target.itemId, target.baseNominal),
        ]);
        const discount = bestDiscount.discount;
        const effectivePrice = Math.max(500, target.baseNominal - discount);

        if (saldo >= effectivePrice) {
          const sisaSaldo = saldo - effectivePrice;
          const voucherLine = buildDiscountLine(bestDiscount.source, bestDiscount.code, discount);

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `⚡ <b>PILIH METODE PEMBAYARAN</b>\n\n` +
              `📦 <b>Paket:</b> ${escapeHtml(target.itemNama)}\n` +
              voucherLine +
              `💰 <b>Total Bayar:</b> <code>${formatRupiah(effectivePrice)}</code>\n` +
              `💳 <b>Saldo Kamu:</b> <code>${formatRupiah(saldo)}</code> <i>(Sisa: ${formatRupiah(sisaSaldo)})</i>\n\n` +
              `Saldo kamu mencukupi! Pilih bayar instan pakai saldo atau via QRIS 👇`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `⚡ Bayar Pakai Saldo (${formatRupiah(effectivePrice)})`,
                    callback_data: `paysaldo_${targetKey}`,
                  },
                ],
                [
                  {
                    text: "💳 Bayar Via QRIS (+ Kode Unik)",
                    callback_data: `buyqris_${targetKey}`,
                  },
                ],
              ],
            },
          });
          return res.status(200).json({ ok: true });
        }

        await sendQrisInvoiceForTarget(token, chatId, call.from, target);
      } else if (data.startsWith("confirm_")) {
        const orderId = data.replace("confirm_", "");
        const order = await getOrder(orderId);

        if (!order) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Pesanan sudah kedaluwarsa. Silakan buat pesanan baru.",
          });
          return res.status(200).json({ ok: true });
        }

        if (order.status !== "pending") {
          return res.status(200).json({ ok: true });
        }

        order.status = "waiting_acc";
        await saveOrder(orderId, order);

        const waitNote = order.is_deposit
          ? "Konfirmasi deposit sudah masuk. Saldo otomatis terisi segera setelah dana terdeteksi!"
          : "Konfirmasi kamu sudah masuk. Link file akan otomatis dikirim ke chat ini segera setelah dana terdeteksi!";

        await tgRequest(token, "editMessageCaption", {
          chat_id: chatId,
          message_id: messageId,
          caption:
            `⏳ <b>MENUNGGU VERIFIKASI (Order #${order.id})</b>\n\n` +
            `📦 Item: ${escapeHtml(order.item_nama)}\n` +
            `💰 Nominal: <b>${formatRupiah(order.total_nominal)}</b>\n\n` +
            waitNote,
          parse_mode: "HTML",
        });

        const qris = await getQris();
        if (qris && qris.admin_chat_id) {
          const voucherInfo =
            order.discount > 0
              ? `\n🎟️ <b>Voucher Dipakai:</b> ${escapeHtml(order.voucher_code)} (-${formatRupiah(order.discount)})`
              : "";

          const titleLabel = order.is_deposit
            ? `🔔 <b>DEPOSIT SALDO MASUK #${order.id}</b>`
            : `🔔 <b>PESANAN MASUK #${order.id}</b>`;

          const adminNotifText =
            `${titleLabel}\n\n` +
            `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
            `📦 <b>Item:</b> ${escapeHtml(order.item_nama)}${voucherInfo}\n` +
            `💰 <b>Nominal Wajib Masuk:</b> <code>${formatRupiah(order.total_nominal)}</code>\n\n` +
            `⚡ <i>Jika Auto-ACC Makro aktif, otomatis lunas saat notif HP masuk (atau klik ACC manual di bawah):</i>`;

          await tgRequest(token, "sendMessage", {
            chat_id: qris.admin_chat_id,
            text: adminNotifText,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: order.is_deposit
                      ? `✅ ACC Depo #${order.id}`
                      : `✅ ACC #${order.id} (Kirim Link)`,
                    callback_data: `acc_${order.id}`,
                  },
                  {
                    text: `❌ Tolak #${order.id}`,
                    callback_data: `reject_${order.id}`,
                  },
                ],
              ],
            },
          });
        }
      } else if (data.startsWith("cancel_")) {
        const orderId = data.replace("cancel_", "");
        const order = await getOrder(orderId);
        if (order && order.status === "pending") {
          order.status = "cancelled";
          await saveOrder(orderId, order);
        }
        await tgRequest(token, "editMessageCaption", {
          chat_id: chatId,
          message_id: messageId,
          caption: `🚫 <b>Order #${orderId} dibatalkan.</b>\nSilakan pilih kembali melalui menu.`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🛍️ Buka Katalog", callback_data: "menu_katalog" },
                { text: "💰 Saldo & Depo", callback_data: "menu_saldo" },
              ],
            ],
          },
        });
      } else if (data.startsWith("acc_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const orderId = data.replace("acc_", "");
        const order = await getOrder(orderId);

        if (!order || order.status === "acc") {
          return res.status(200).json({ ok: true });
        }

        const accResult = await processAnyOrder(token, order);
        if (accResult && accResult.duplicate) {
          await tgRequest(token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ <b>ORDER #${order.id}</b> sudah diproses (otomatis/ACC sebelumnya). Tidak diproses ulang.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const { deliveredName } = accResult;
        const adminExtraNote = order.is_deposit
          ? `\n💳 <b>Saldo Masuk:</b> +${formatRupiah(order.base_nominal)}`
          : order.is_mystery
          ? `\n🎲 <b>Hadiah Gacha Didapat:</b> ${escapeHtml(deliveredName)}`
          : "";
        const adminFooter = order.is_deposit
          ? "💳 <i>Saldo otomatis ditambahkan ke akun pembeli!</i>"
          : order.rbot_owner
          ? "🤖 <i>Link terkirim lewat bot reseller & margin reseller tercatat!</i>"
          : "🔥 <i>Link terkirim, Bestseller & Leaderboard terupdate!</i>";

        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text:
            `✅ <b>ORDER #${order.id} SUDAH DI-ACC</b>\n` +
            `👤 Pembeli: ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
            `📦 Item: ${escapeHtml(order.item_nama)}${adminExtraNote}\n` +
            `💰 Nominal: <b>${formatRupiah(order.total_nominal)}</b>\n` +
            adminFooter,
          parse_mode: "HTML",
        });
      } else if (data.startsWith("reject_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const orderId = data.replace("reject_", "");
        const order = await getOrder(orderId);

        if (!order || order.status === "rejected" || order.status === "acc") {
          return res.status(200).json({ ok: true });
        }

        order.status = "rejected";
        await saveOrder(orderId, order);

        await tgRequest(await getOrderBotToken(token, order), "sendMessage", {
          chat_id: order.buyer_id,
          text:
            `❌ <b>ORDER #${order.id} DITOLAK</b>\n\n` +
            `Pembayaran sebesar <b>${formatRupiah(order.total_nominal)}</b> untuk <b>${escapeHtml(order.item_nama)}</b> tidak ditemukan di mutasi kami.\n\n` +
            `Jika kamu sudah transfer sesuai kode unik, silakan kirim bukti transfer ke admin @${ADMIN_USERNAME}.`,
          parse_mode: "HTML",
        });

        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text:
            `❌ <b>ORDER #${order.id} DITOLAK (DANA TIDAK MASUK)</b>\n` +
            `👤 Pembeli: ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
            `💰 Nominal: ${formatRupiah(order.total_nominal)}`,
          parse_mode: "HTML",
        });
      } else if (data === "reseller_wd") {
        if (!(await isReseller(callerId))) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "❌ Fitur WD khusus reseller.",
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: await buildWdHistoryText(callerId),
            parse_mode: "HTML",
          });
        }
      } else if (data.startsWith("wdacc_") || data.startsWith("wdrej_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const isAcc = data.startsWith("wdacc_");
        const wdId = data.replace(isAcc ? "wdacc_" : "wdrej_", "");
        const wd = await getWd(wdId);

        if (!wd || wd.status !== "pending") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ WD #${escapeHtml(wdId)} tidak ditemukan atau sudah diproses.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const r = isAcc ? await processWdAcc(token, wd) : await processWdReject(token, wd, "");
        if (r.duplicate) return res.status(200).json({ ok: true });

        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text:
            (isAcc ? `✅ <b>WD #${wd.id} SUDAH DI-ACC</b>\n` : `❌ <b>WD #${wd.id} DITOLAK</b>\n`) +
            `👤 ${escapeHtml(wd.owner_name)} • <code>${escapeHtml(wd.owner_id)}</code>\n` +
            `💰 Nominal: <b>${formatRupiah(wd.amount)}</b> • Transfer: <b>${formatRupiah(wd.net)}</b>\n` +
            `📍 ${escapeHtml(wd.tujuan)}\n` +
            (isAcc ? "💸 <i>Margin dicatat sebagai sudah dibayar.</i>" : "↩️ <i>Margin dikembalikan ke reseller.</i>"),
          parse_mode: "HTML",
        });
      } else if (data === "reseller_omset_self") {
        const statusReseller = await isReseller(callerId);
        if (!statusReseller) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "❌ Kamu belum terdaftar sebagai Reseller. Daftar dulu lewat menu 🤝 Reseller ya!",
            parse_mode: "HTML",
          });
        } else {
          const omset = await getResellerOmset(callerId);
          const tierInfo = getResellerTierInfo(omset.rupiah);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "📊 <b>OMSET RESELLER KAMU</b>\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `💰 <b>Total Omset:</b> <code>${formatRupiah(omset.rupiah)}</code>\n` +
              `🧾 <b>Total Transaksi:</b> <b>${omset.count}x</b>\n\n` +
              buildTierSummaryLines(tierInfo),
            parse_mode: "HTML",
          });
        }
      } else if (data.startsWith("rate_init_")) {
        const orderId = data.replace("rate_init_", "");
        const order = await getOrder(orderId);
        if (!order || String(order.buyer_id) !== String(callerId)) {
          return res.status(200).json({ ok: true });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `⭐ <b>Beri Rating untuk Pesanan #${orderId}</b>\nPilih jumlah bintang:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "⭐1", callback_data: `rate_star_${orderId}_1` },
                { text: "⭐2", callback_data: `rate_star_${orderId}_2` },
                { text: "⭐3", callback_data: `rate_star_${orderId}_3` },
                { text: "⭐4", callback_data: `rate_star_${orderId}_4` },
                { text: "⭐5", callback_data: `rate_star_${orderId}_5` },
              ],
            ],
          },
        });
      } else if (data.startsWith("rate_star_")) {
        const partsRate = data.replace("rate_star_", "").split("_");
        const orderId = partsRate[0];
        const stars = parseInt(partsRate[1], 10) || 5;
        const order = await getOrder(orderId);
        if (!order || String(order.buyer_id) !== String(callerId)) {
          return res.status(200).json({ ok: true });
        }
        await setPendingRating(callerId, orderId, stars);
        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text:
            `⭐ <b>Kamu memilih ${stars}/5 bintang untuk Pesanan #${orderId}</b>\n\n` +
            `Sekarang ketik komentar/ulasan singkat kamu (atau ketik <code>-</code> jika tanpa komentar).`,
          parse_mode: "HTML",
        });
      }

      return res.status(200).json({ ok: true });
    }
          // ------------------------------------------
    // B. HANDLER PESAN TEKS & FOTO DARI USER
    // ------------------------------------------
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const senderId = msg.from && msg.from.id;
      const senderUsername = (msg.from && msg.from.username) || "";
      const isAdmin = await isAdminUser(msg.from);

      let isNewUser = false;
      if (msg.chat && msg.chat.type === "private") {
        const addedRes = await redisCommand(["SADD", REDIS_USERS_KEY, String(chatId)]);
        isNewUser = Number(addedRes) === 1;
      }

      // Hadiah leaderboard bulan lalu (jalan sekali per bulan, otomatis)
      try {
        await maybeAwardLastMonth(token);
      } catch (awardErr) {
        console.error("Award Leaderboard Error:", awardErr);
      }

      const rawText = (msg.text || msg.caption || "").trim();
      const lowerText = rawText.toLowerCase();

      // RATING: TANGKAP KOMENTAR SETELAH PILIH BINTANG
      if (msg.text && !rawText.startsWith("/")) {
        const pendingRate = await getPendingRating(senderId);
        if (pendingRate) {
          const komentar = rawText === "-" ? "" : rawText.slice(0, 300);
          const buyerFullName =
            [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "Pembeli";
          const starsText = "⭐".repeat(Math.min(5, Math.max(1, pendingRate.stars)));

          await saveRating(pendingRate.order_id, senderId, buyerFullName, pendingRate.stars, komentar);
          await clearPendingRating(senderId);

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `🙏 <b>Terima kasih atas rating & ulasannya!</b>\n\n` +
              `${starsText} (${pendingRate.stars}/5)\n` +
              (komentar ? `💬 "${escapeHtml(komentar)}"\n\n` : "\n") +
              `Masukanmu sangat berarti buat Lumine Photopack Store! 💜`,
            parse_mode: "HTML",
          });

          const testi = await getTestiConfig();
          if (testi && testi.channel_id) {
            await tgRequest(token, "sendMessage", {
              chat_id: testi.channel_id,
              text:
                `⭐ <b>RATING BARU DARI PEMBELI</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `👤 ${escapeHtml(maskUsername(msg.from.username ? `@${msg.from.username}` : "Tanpa Username"))}\n` +
                `${starsText} (${pendingRate.stars}/5)\n` +
                (komentar ? `💬 <i>"${escapeHtml(komentar)}"</i>` : "<i>(tanpa komentar)</i>"),
              parse_mode: "HTML",
            });
          }
          return res.status(200).json({ ok: true });
        }
      }

      // BOT RESELLER: /daftarbot /botku /margin /hapusbot + admin /listbot /matikanbot /aktifkanbot /listmargin /bayarmargin
      if (rawText.startsWith("/")) {
        const rbHandled = await handleResellerBotMainCommands(token, req, msg, rawText, isAdmin);
        if (rbHandled) return res.status(200).json({ ok: true });
      }

      // ADMIN: /addsaldo & /ceksaldo
      if (rawText.startsWith("/addsaldo")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const parts = rawText.replace(/^\/addsaldo\s*/i, "").trim().split(/\s+/);
        const targetUid = parts[0];
        const delta = parseInt(parts[1], 10);

        if (!targetUid || isNaN(delta) || delta === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format salah!\n" +
              "Gunakan: <code>/addsaldo [user_id] [nominal]</code>\n" +
              "<i>Contoh: <code>/addsaldo 123456789 5000</code> (atau <code>-2000</code> untuk kurangi)</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const updatedSaldo = await addUserSaldo(targetUid, delta);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Saldo User Diperbarui!</b>\n` +
            `• <b>User ID:</b> <code>${escapeHtml(targetUid)}</code>\n` +
            `• <b>Perubahan:</b> ${delta > 0 ? "+" : ""}${formatRupiah(delta)}\n` +
            `• <b>Saldo Sekarang:</b> <code>${formatRupiah(updatedSaldo)}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/ceksaldo")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const targetUid = rawText.replace(/^\/ceksaldo\s*/i, "").trim();
        if (!targetUid) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gunakan: <code>/ceksaldo [user_id]</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const userBal = await getUserSaldo(targetUid);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `💳 Saldo user <code>${escapeHtml(targetUid)}</code>: <b>${formatRupiah(userBal)}</b>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /kashadiah (akun saldo admin yang membayar bonus undang teman)
      if (rawText.startsWith("/kashadiah")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        await redisCommand(["SET", REDIS_REF_FUND_KEY, String(senderId)]);
        const fundBal = await getUserSaldo(senderId);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "🏦 <b>KAS HADIAH UNDANG TEMAN</b>\n\n" +
            `• Akun kas: <code>${escapeHtml(String(senderId))}</code> (saldo admin kamu)\n` +
            `• Saldo kas: <b>${formatRupiah(fundBal)}</b>\n` +
            `• Bonus Undang Teman: <b>${formatRupiah(REFERRAL_REWARD_SALDO)}</b> per teman (dipotong otomatis)\n` +
            "• Margin tiap penjualan bot reseller juga dipotong otomatis dari saldo ini\n" +
            "• WD reseller tetap transfer uang asli manual (tidak mengubah saldo kas)\n\n" +
            `Isi ulang: <code>/addsaldo ${escapeHtml(String(senderId))} NOMINAL</code>\n` +
            "<i>Margin reseller tidak pernah diblokir (saldo kas boleh minus sebagai tanda perlu isi ulang). Bonus Undang Teman ditahan kalau kas kurang.</i>",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /addreseller
      if (rawText.startsWith("/addreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const parts = rawText.replace(/^\/addreseller\s*/i, "").trim().split(/\s+/);
        const targetUid = parts[0];
        const targetNama = parts.slice(1).join(" ") || "Reseller";

        if (!targetUid || isNaN(parseInt(targetUid, 10))) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format salah!\n" +
              "Gunakan: <code>/addreseller [user_id] [nama]</code>\n" +
              "<i>Contoh: <code>/addreseller 123456789 Budi Store</code></i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await addReseller(targetUid, targetNama);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Reseller Baru Ditambahkan!</b>\n` +
            `• <b>User ID:</b> <code>${escapeHtml(targetUid)}</code>\n` +
            `• <b>Nama:</b> ${escapeHtml(targetNama)}`,
          parse_mode: "HTML",
        });

        await tgRequest(token, "sendMessage", {
          chat_id: targetUid,
          text:
            "🎉 <b>Selamat! Kamu resmi jadi Reseller Lumine Photopack Store.</b>\n" +
            "Cek menu 🤝 Reseller untuk lihat harga grosir & omset kamu ya!",
          parse_mode: "HTML",
        }).catch(() => {});
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /delreseller
      if (rawText.startsWith("/delreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const targetUid = rawText.replace(/^\/delreseller\s*/i, "").trim();
        if (!targetUid) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gunakan: <code>/delreseller [user_id]</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const removedOk = await removeReseller(targetUid);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: removedOk
            ? `✅ Reseller <code>${escapeHtml(targetUid)}</code> berhasil dihapus.`
            : `⚠️ User <code>${escapeHtml(targetUid)}</code> tidak terdaftar sebagai reseller.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /listreseller
      if (rawText.startsWith("/listreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const resellerMap = await getResellerMap();
        const ids = Object.keys(resellerMap);
        if (ids.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "📂 Belum ada reseller terdaftar.",
          });
          return res.status(200).json({ ok: true });
        }

        let listText = "🤝 <b>DAFTAR RESELLER</b>\n━━━━━━━━━━━━━━━━━━━━\n";
        for (const uid of ids) {
          const info = resellerMap[uid] || {};
          const omset = await getResellerOmset(uid);
          listText +=
            `• <b>${escapeHtml(info.nama || "Reseller")}</b> (<code>${escapeHtml(uid)}</code>)\n` +
            `  🏅 ${getResellerTierInfo(omset.rupiah).tier.name} • 💰 Omset: <code>${formatRupiah(omset.rupiah)}</code> • 🧾 ${omset.count}x transaksi\n`;
        }
        listText += `\nTotal: <b>${ids.length} reseller</b>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /omsetreseller [user_id] — cek omset reseller tertentu
      if (rawText.startsWith("/omsetreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const targetUid = rawText.replace(/^\/omsetreseller\s*/i, "").trim();
        if (!targetUid) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gunakan: <code>/omsetreseller [user_id]</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const resellerMap = await getResellerMap();
        const info = resellerMap[targetUid];
        if (!info) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ User <code>${escapeHtml(targetUid)}</code> tidak terdaftar sebagai reseller.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const omset = await getResellerOmset(targetUid);
        const tierInfo = getResellerTierInfo(omset.rupiah);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `📊 <b>OMSET RESELLER</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 <b>${escapeHtml(info.nama || "Reseller")}</b> (<code>${escapeHtml(targetUid)}</code>)\n` +
            `💰 <b>Total Omset:</b> <code>${formatRupiah(omset.rupiah)}</code>\n` +
            `🧾 <b>Total Transaksi:</b> <b>${omset.count}x</b>\n\n` +
            buildTierSummaryLines(tierInfo),
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /omsettoko — cek omset keseluruhan toko (punya sendiri)
      if (rawText.startsWith("/omsettoko")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const storeOmset = await getStoreOmset();
        const ratingSummary = await getRatingSummary();
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `📈 <b>OMSET TOKO (KESELURUHAN)</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 <b>Total Omset:</b> <code>${formatRupiah(storeOmset.rupiah)}</code>\n` +
            `🧾 <b>Total Transaksi:</b> <b>${storeOmset.count}x</b>\n` +
            `⭐ <b>Rating Toko:</b> ${
              ratingSummary.totalCount > 0
                ? `${ratingSummary.avg.toFixed(1)}/5 (${ratingSummary.totalCount} ulasan)`
                : "Belum ada rating"
            }`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /listrating — lihat ulasan terbaru dari pembeli
      if (rawText.startsWith("/listrating")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const recent = await getRecentRatings(10);
        const summary = await getRatingSummary();
        if (recent.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "📂 Belum ada rating dari pembeli.",
          });
          return res.status(200).json({ ok: true });
        }
        let listText =
          `⭐ <b>RATING TOKO: ${summary.avg.toFixed(1)}/5</b> (${summary.totalCount} ulasan)\n` +
          `━━━━━━━━━━━━━━━━━━━━\n`;
        recent.forEach((r) => {
          listText +=
            `#${r.order_id} • ${"⭐".repeat(r.stars)} — ${escapeHtml(r.buyer_name)}\n` +
            (r.komentar ? `💬 "${escapeHtml(r.komentar)}"\n` : "") +
            `\n`;
        });
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
        return res.status(200).json({ ok: true });
      }

      // USER: /depo & /saldo
      if (rawText.startsWith("/depo")) {
        const arg = rawText.replace(/^\/depo\s*/i, "").trim();
        if (!arg) {
          await sendSaldoMenu(token, chatId, senderId);
          return res.status(200).json({ ok: true });
        }
        const nominal = parseInt(arg.replace(/\D/g, ""), 10) || 0;
        await createAndSendDepositInvoice(token, chatId, msg.from, nominal);
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/saldo")) {
        await sendSaldoMenu(token, chatId, senderId);
        return res.status(200).json({ ok: true });
      }

      // 0A. ADMIN: /setmacro (PENGATURAN & LINK AUTO-ACC MAKRO ANDROID)
      if (rawText.startsWith("/setmacro")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        // Secret ditampilkan di chat -> hanya boleh di chat pribadi, jangan di grup
        if (!msg.chat || msg.chat.type !== "private") return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setmacro\s*/i, "").trim();
        const macroCfg = await getMacroConfig();
        const host = macroCfg.host || req.headers.host || "domain-vercel-kamu.vercel.app";

        if (arg.toLowerCase() === "off") {
          macroCfg.enabled = false;
          await saveMacroConfig(macroCfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ <b>Auto-ACC Makro dimatikan.</b> Sekarang verifikasi kembali ke manual.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg.toLowerCase() === "on") {
          macroCfg.enabled = true;
          await saveMacroConfig(macroCfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ <b>Auto-ACC Makro diaktifkan!</b>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg && !arg.includes(" ")) {
          if (!/^[A-Za-z0-9_-]{12,64}$/.test(arg) || arg === DEFAULT_MACRO_SECRET) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                "⚠️ <b>Secret tidak valid.</b>\nPakai <b>12–64 karakter</b> huruf/angka/<code>_</code>/<code>-</code> tanpa spasi, " +
                "acak & sulit ditebak, dan jangan pakai secret lama.\n" +
                "Contoh: <code>/setmacro Kx9mQ2vLp7TrZ4wB</code>",
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }
          macroCfg.secret = arg;
          macroCfg.enabled = true;
          await saveMacroConfig(macroCfg);
        }

        const secretShown = macroCfg.secret || "";
        const macroUrl = `https://${host}/api/webhook?autoacc=1&secret=${secretShown || "KODERAHASIA"}&text={not_text}`;
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "⚡ <b>PENGATURAN AUTO-ACC MAKRO (MACRODROID)</b>\n\n" +
            `• Status: ${macroCfg.enabled ? "✅ <b>AKTIF</b>" : "❌ <b>NONAKTIF</b>"}\n` +
            `• Secret Key: ${
              secretShown
                ? `<code>${escapeHtml(secretShown)}</code>`
                : "❗ <b>BELUM DIATUR</b> — kirim <code>/setmacro KODERAHASIA</code> dulu"
            }\n\n` +
            "<b>1. Salin URL Webhook ini ke MacroDroid (HTTP Request GET):</b>\n" +
            `<code>${escapeHtml(macroUrl)}</code>\n\n` +
            "<b>2. Perintah Kontrol:</b>\n" +
            "• <code>/setmacro on</code> — Aktifkan Auto-ACC\n" +
            "• <code>/setmacro off</code> — Matikan Auto-ACC\n" +
            "• <code>/setmacro koderahasia</code> — Ganti secret key",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 0B. ADMIN: /setsold (ATUR / RESET ANGKA TERJUAL BESTSELLER)
      if (rawText.startsWith("/setsold")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "📂 Katalog masih kosong." });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/setsold\s*/i, "").trim();
        if (!arg) {
          let listText = "🔥 <b>DATA PENJUALAN SET (BESTSELLER)</b>\n\n";
          katalogList.forEach((item, idx) => {
            listText += `${idx + 1}. <b>${escapeHtml(item.nama)}</b> — Terjual: <b>${Number(item.sold) || 0}x</b>\n`;
          });
          listText +=
            "\n<b>Ubah / Reset jumlah terjual:</b>\n" +
            "<code>/setsold [nomor] [jumlah]</code>\n" +
            "<i>Contoh: <code>/setsold 1 0</code> untuk reset ke 0</i>";
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split(/\s+/);
        const idx = parseInt(parts[0], 10) - 1;
        const newSold = parseInt(parts[1], 10);
        if (isNaN(idx) || idx < 0 || idx >= katalogList.length || isNaN(newSold) || newSold < 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format salah! Contoh: <code>/setsold 1 0</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        katalogList[idx].sold = newSold;
        await saveKatalog(katalogList);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Jumlah terjual <b>${escapeHtml(katalogList[idx].nama)}</b> diatur ke <b>${newSold}x</b>!`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 0C. ADMIN: /setcreator (ATUR / HAPUS CREATOR PADA SET KATALOG)
      if (rawText.startsWith("/setcreator")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "📂 Katalog masih kosong." });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/setcreator\s*/i, "").trim();
        if (!arg) {
          let listText = "👤 <b>DAFTAR CREATOR SET KATALOG</b>\n\n";
          katalogList.forEach((item, idx) => {
            const katIcon = item.kategori === "full" ? "📦" : "🧩";
            const crLabel = item.creator
              ? `👤 <b>${escapeHtml(item.creator)}</b>`
              : "<i>(belum diatur)</i>";
            listText += `${idx + 1}. ${katIcon} <b>${escapeHtml(item.nama)}</b> — ${crLabel}\n`;
          });
          listText +=
            "\n<b>Atur / Ubah Creator:</b>\n" +
            "• Satu set: <code>/setcreator [nomor] [Nama Creator]</code>\n" +
            "• Banyak set sekaligus: <code>/setcreator 1,2,3 [Nama Creator]</code>\n" +
            "• Hapus creator: <code>/setcreator [nomor] -</code>\n" +
            "<i>Contoh: <code>/setcreator 1 Larissa Rochefort</code></i>";
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
          return res.status(200).json({ ok: true });
        }

        const spaceIdx = arg.search(/\s+/);
        if (spaceIdx === -1) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format kurang lengkap!\n" +
              "Gunakan: <code>/setcreator [nomor] [Nama Creator]</code>\n" +
              "<i>Contoh: <code>/setcreator 1 Byoru</code> atau <code>/setcreator 1,2 Byoru</code></i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const targetPart = arg.slice(0, spaceIdx).trim();
        const rawCreatorName = arg.slice(spaceIdx).trim();
        const isClear = rawCreatorName === "-" || rawCreatorName.toLowerCase() === "hapus";
        const creatorVal = isClear ? "" : rawCreatorName.replace(/\s+/g, " ").slice(0, 60);

        const rawNums = targetPart.split(",").map((s) => s.trim()).filter(Boolean);
        const indices = [];
        for (const numStr of rawNums) {
          const n = parseInt(numStr, 10) - 1;
          if (isNaN(n) || n < 0 || n >= katalogList.length) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text: `⚠️ Nomor set <b>${escapeHtml(numStr)}</b> tidak valid (total katalog: ${katalogList.length}).`,
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }
          if (!indices.includes(n)) indices.push(n);
        }

        if (indices.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Nomor set tidak valid." });
          return res.status(200).json({ ok: true });
        }

        const updatedNames = [];
        for (const idx of indices) {
          katalogList[idx].creator = creatorVal;
          updatedNames.push(`#${idx + 1} <b>${escapeHtml(katalogList[idx].nama)}</b>`);
        }
        await saveKatalog(katalogList);

        const resultText = isClear
          ? `✅ Creator dihapus dari:\n• ${updatedNames.join("\n• ")}`
          : `✅ Creator diatur ke 👤 <b>${escapeHtml(creatorVal)}</b> untuk:\n• ${updatedNames.join("\n• ")}`;

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: resultText,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 1. ADMIN: /settesti
      if (rawText.startsWith("/settesti")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/settesti\s*/i, "").trim();
        const currentTesti = await getTestiConfig();

        if (!arg) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🧾 <b>PENGATURAN CHANNEL TESTIMONI OTOMATIS</b>\n\n" +
              `• Status: ${currentTesti ? `✅ <b>Aktif (${escapeHtml(currentTesti.channel_title || currentTesti.channel_id)})</b>` : "❌ <b>Belum Dipasang</b>"}\n\n` +
              "<b>Cara Pasang:</b>\n" +
              "1. Jadikan bot ini <b>Admin</b> di Channel Testimoni.\n" +
              "2. Ketik <code>/settesti @username_channel</code> di chat ini (atau ketik <code>/settesti</code> di dalam channel).\n\n" +
              "<i>Ketik <code>/settesti off</code> untuk mematikan.</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg.toLowerCase() === "off") {
          await saveTestiConfig(null);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ Posting otomatis ke Channel Testimoni dimatikan.",
          });
          return res.status(200).json({ ok: true });
        }

        const me = await tgRequest(token, "getMe", {});
        const botUsername = (me && me.result && me.result.username) || "";
        const testRes = await tgRequest(token, "sendMessage", {
          chat_id: arg,
          text: "✅ <b>Channel Testimoni Berhasil Terhubung!</b>",
          parse_mode: "HTML",
        });

        if (testRes && testRes.ok) {
          const chTitle = (testRes.result && testRes.result.chat && testRes.result.chat.title) || arg;
          const chUsername = (testRes.result && testRes.result.chat && testRes.result.chat.username) || "";
          await saveTestiConfig({
            channel_id: testRes.result.chat.id,
            channel_title: chTitle,
            channel_username: chUsername,
            bot_username: botUsername,
          });
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ <b>Berhasil terhubung ke ${escapeHtml(chTitle)}!</b>`,
            parse_mode: "HTML",
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gagal mengirim ke channel tersebut. Pastikan bot sudah jadi Admin di channel lalu ulangi.",
            parse_mode: "HTML",
          });
        }
        return res.status(200).json({ ok: true });
      }
            // 2. ADMIN: /broadcast
      if (rawText.startsWith("/broadcast")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const bcText = rawText.replace(/^\/broadcast\s*/i, "").trim();
        const userIds = (await redisCommand(["SMEMBERS", REDIS_USERS_KEY])) || [];

        if (!bcText && (!msg.photo || msg.photo.length === 0)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "📢 <b>FITUR BROADCAST STOK BARU</b>\n\n" +
              `• Total user terdaftar di bot: <b>${userIds.length} User</b>\n\n` +
              "<b>Cara kirim:</b>\n" +
              "<code>/broadcast Halo guys! Photopack baru sudah rilis!</code>\n" +
              "<i>Bisa juga kirim foto dengan caption <code>/broadcast Pesan...</code></i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const photoId =
          msg.photo && msg.photo.length > 0
            ? msg.photo[msg.photo.length - 1].file_id
            : "";

        let sentCount = 0;
        const batchSize = 20;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map((uid) => {
              if (photoId) {
                return tgRequest(token, "sendPhoto", {
                  chat_id: uid,
                  photo: photoId,
                  caption: bcText,
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "🛍️ Cek Katalog Sekarang", callback_data: "menu_katalog" }],
                    ],
                  },
                });
              }
              return tgRequest(token, "sendMessage", {
                chat_id: uid,
                text: bcText,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🛍️ Cek Katalog Sekarang", callback_data: "menu_katalog" }],
                  ],
                },
              });
            })
          );
          results.forEach((r) => {
            if (r && r.ok) sentCount++;
          });
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Broadcast selesai!</b>\nTerkirim ke <b>${sentCount}</b> dari <b>${userIds.length}</b> user.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 3. ADMIN: /buatvoucher & /hapusvoucher
      if (rawText.startsWith("/buatvoucher")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/buatvoucher\s*/i, "").trim();
        const vouchers = await getVouchers();

        if (!arg) {
          const keys = Object.keys(vouchers);
          let listStr = "🎟️ <b>DAFTAR VOUCHER AKTIF</b>\n\n";
          if (keys.length === 0) {
            listStr += "<i>Belum ada kode voucher aktif.</i>\n";
          } else {
            keys.forEach((k) => {
              const v = vouchers[k];
              listStr += `• <code>${escapeHtml(v.code)}</code> — Potongan <b>${formatRupiah(v.discount)}</b> (Sisa kuota: <b>${v.quota}</b>)\n`;
            });
          }
          listStr +=
            "\n<b>Cara buat voucher baru:</b>\n" +
            "<code>/buatvoucher KODE | POTONGAN | KUOTA</code>\n" +
            "<i>Contoh: <code>/buatvoucher YT500 | 500 | 10</code></i>\n\n" +
            "<b>Cara hapus:</b> <code>/hapusvoucher KODE</code>";

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: listStr,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split("|").map((p) => p.trim());
        if (parts.length < 3) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format salah! Gunakan: <code>/buatvoucher KODE | POTONGAN | KUOTA</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const code = parts[0].toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        const discount = parseInt(parts[1].replace(/\D/g, ""), 10) || 0;
        const quota = parseInt(parts[2].replace(/\D/g, ""), 10) || 1;

        if (!code || discount < 100) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Kode voucher harus huruf/angka dan potongan minimal Rp 100.",
          });
          return res.status(200).json({ ok: true });
        }

        vouchers[code] = { code, discount, quota, used_by: [] };
        await saveVouchers(vouchers);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Voucher Berhasil Dibuat!</b>\n\n` +
            `• <b>Kode:</b> <code>${code}</code>\n` +
            `• <b>Potongan Harga:</b> ${formatRupiah(discount)}\n` +
            `• <b>Kuota:</b> ${quota} orang tercepat`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/hapusvoucher")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const code = rawText.replace(/^\/hapusvoucher\s*/i, "").trim().toUpperCase();
        const vouchers = await getVouchers();
        if (vouchers[code]) {
          delete vouchers[code];
          await saveVouchers(vouchers);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Voucher <code>${escapeHtml(code)}</code> berhasil dihapus.`,
            parse_mode: "HTML",
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Kode voucher tidak ditemukan.",
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 4. USER: /voucher KODE
      if (rawText.startsWith("/voucher")) {
        const code = rawText.replace(/^\/voucher\s*/i, "").trim().toUpperCase();
        if (!code) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "🎟️ Ketik kode voucher kamu setelah perintah:\n<code>/voucher KODE_KAMU</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const vouchers = await getVouchers();
        const v = vouchers[code];
        if (!v) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ Kode voucher <b>${escapeHtml(code)}</b> tidak ditemukan atau sudah tidak berlaku.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (v.quota <= 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `😢 Maaf, kuota voucher <b>${escapeHtml(code)}</b> sudah habis!`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (Array.isArray(v.used_by) && v.used_by.includes(String(senderId))) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Kamu sudah pernah menggunakan voucher <b>${escapeHtml(code)}</b> sebelumnya.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await setActiveUserVoucher(senderId, code);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `🎉 <b>VOUCHER BERHASIL DIPASANG!</b>\n\n` +
            `🎟️ Kode: <code>${escapeHtml(v.code)}</code>\n` +
            `💸 Potongan: <b>${formatRupiah(v.discount)}</b>\n\n` +
            `Diskon akan otomatis memotong tagihan saat kamu checkout set di Katalog atau Mystery Box 👇`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🛍️ Buka Katalog", callback_data: "menu_katalog" },
                { text: "🎲 Mystery Box", callback_data: "menu_mystery" },
              ],
            ],
          },
        });
        return res.status(200).json({ ok: true });
      }

      // 5. ADMIN: /setmystery
      if (rawText.startsWith("/setmystery")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setmystery\s*/i, "").trim().toLowerCase();
        const cfg = await getMysteryConfig();

        if (!arg) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🎲 <b>PENGATURAN MYSTERY BOX GACHA</b>\n\n" +
              `• Status: ${cfg.enabled ? "✅ <b>Aktif</b>" : "❌ <b>Nonaktif</b>"}\n` +
              `• Harga Spin: <b>${formatRupiah(cfg.price)}</b>\n\n` +
              "<b>Ubah harga:</b> <code>/setmystery 3000</code>\n" +
              "<b>Matikan:</b> <code>/setmystery off</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg === "off") {
          cfg.enabled = false;
          await saveMysteryConfig(cfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ Mystery Box dinonaktifkan.",
          });
          return res.status(200).json({ ok: true });
        }

        const newPrice = parseInt(arg.replace(/\D/g, ""), 10);
        if (!newPrice || newPrice < 500) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Masukkan nominal minimal 500 (contoh: <code>/setmystery 3000</code>).",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        cfg.enabled = true;
        cfg.price = newPrice;
        await saveMysteryConfig(cfg);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Mystery Box aktif dengan harga ${formatRupiah(newPrice)}!</b>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 5B. ADMIN: /hadiahlb — lihat pengaturan hadiah / bagikan hadiah bulan lalu sekarang
      if (rawText.startsWith("/hadiahlb")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/hadiahlb\s*/i, "").trim().toLowerCase();
        const monthKey = getPrevMonthKey();

        if (arg === "kirim") {
          const r = await awardMonthlyLeaderboard(token, monthKey);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: r.ok
              ? `✅ Hadiah leaderboard ${monthKey} diproses. Pemenang: <b>${r.awarded.length}</b> orang.`
              : r.reason === "already"
              ? `⚠️ Hadiah ${monthKey} sudah pernah dibagikan.`
              : "⚠️ Fitur hadiah leaderboard dimatikan.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const done = await redisCommand(["GET", `${REDIS_LB_REWARD_LOCK_PREFIX}${monthKey}`]);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "🎁 <b>HADIAH LEADERBOARD BULANAN</b>\n\n" +
            `• Status: ${LB_REWARD_ENABLED ? "✅ Aktif" : "❌ Nonaktif"}\n` +
            `• Bulan yang dihitung: <b>${monthKey}</b> (${done ? "sudah dibagikan" : "belum dibagikan"})\n\n` +
            buildLbRewardLine() +
            "Dibagikan otomatis begitu ada pesan masuk di awal bulan. Mau sekarang? <code>/hadiahlb kirim</code>\n" +
            "<i>Ubah nominal di LB_REWARD_SALDO pada kode.</i>",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 6. ADMIN: /resetlb
      if (rawText.startsWith("/resetlb")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const { dayKey, weekKey, monthKey } = getWibPeriods();
        await Promise.all([
          redisCommand(["DEL", `${REDIS_LB_PREFIX}day_rp_${dayKey}`]),
          redisCommand(["DEL", `${REDIS_LB_PREFIX}day_cnt_${dayKey}`]),
          redisCommand(["DEL", `${REDIS_LB_PREFIX}week_rp_${weekKey}`]),
          redisCommand(["DEL", `${REDIS_LB_PREFIX}week_cnt_${weekKey}`]),
          redisCommand(["DEL", `${REDIS_LB_PREFIX}month_rp_${monthKey}`]),
          redisCommand(["DEL", `${REDIS_LB_PREFIX}month_cnt_${monthKey}`]),
          redisCommand(["DEL", REDIS_LB_ALLCNT_KEY]),
        ]);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: "✅ <b>Data Leaderboard & Tier berhasil di-reset ke 0!</b>",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
    }
            // 7. ADMIN: /setbanner
      if (rawText.startsWith("/setbanner")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setbanner\s*/i, "").trim().toLowerCase();
        if (arg === "hapus") {
          await saveBanner(null);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ Banner menu utama berhasil dihapus.",
          });
          return res.status(200).json({ ok: true });
        }

        if (msg.photo && msg.photo.length > 0) {
          const largestPhoto = msg.photo[msg.photo.length - 1];
          await saveBanner({ file_id: largestPhoto.file_id });
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ <b>Banner Menu Utama Berhasil Dipasang!</b> Ketik <code>/start</code> untuk cek.",
            parse_mode: "HTML",
          });
        } else {
          const currentBanner = await getBanner();
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🖼️ <b>PENGATURAN BANNER (/start)</b>\n" +
              `Status: ${currentBanner ? "✅ Terpasang" : "❌ Belum Dipasang"}\n` +
              "Kirim 1 foto banner dengan caption <code>/setbanner</code> (atau <code>/setbanner hapus</code>).",
            parse_mode: "HTML",
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 8. ADMIN: /setqris
      if (rawText.startsWith("/setqris")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        if (msg.photo && msg.photo.length > 0) {
          const largestPhoto = msg.photo[msg.photo.length - 1];
          await saveQris({
            file_id: largestPhoto.file_id,
            admin_chat_id: chatId,
          });
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ <b>Foto QRIS & Notifikasi Admin Berhasil Diaktifkan!</b>",
            parse_mode: "HTML",
          });
        } else {
          const currentQris = await getQris();
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "💳 <b>PENGATURAN QRIS</b>\n" +
              `Status: ${currentQris ? "✅ Terpasang" : "❌ Belum Dipasang"}\n` +
              "Kirim 1 foto QRIS dengan caption <code>/setqris</code>.",
            parse_mode: "HTML",
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 9. ADMIN: /tambah — bisa 1 set (+ foto preview) atau BANYAK set sekaligus (1 baris = 1 set)
      // Catatan: pakai (?!file) supaya "/tambahfile" tidak ikut tertangkap di sini.
      if (/^\/tambah(?!file)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const content = rawText.replace(/^\/tambah(?!file)\s*/i, "").trim();

        // Pecah jadi beberapa record. Baris yang diawali link (http / t.me) dan punya < 3 tanda "|"
        // dianggap lanjutan link dari set sebelumnya; selain itu = set baru.
        const records = [];
        for (const rawLine of content.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          const pipeCount = (line.match(/\|/g) || []).length;
          const looksLikeLink = /^(https?:\/\/|t\.me\/|telegram\.me\/)/i.test(line);
          if (records.length > 0 && pipeCount < 3 && looksLikeLink) {
            records[records.length - 1] += "\n" + line;
          } else {
            records.push(line);
          }
        }

        if (records.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format kurang lengkap! Kirim foto preview dengan caption:\n" +
              "<code>/tambah Nama Set | Isi | Harga | Link1, Link2 | kategori</code>\n\n" +
              "<b>Mau tambah banyak set sekaligus?</b> 1 baris = 1 set:\n" +
              "<code>/tambah\nNama A | 29 | Rp 5.000 | https://t.me/+abc | Full\nNama B | 20 | Rp 5.000 | https://t.me/+def | Full</code>\n\n" +
              "<i>• Link bisa lebih dari satu, pisahkan dengan koma.\n" +
              "• Kategori opsional: <code>mini</code> atau <code>full</code> (default: mini).\n" +
              "• Foto preview hanya dipakai kalau tambah 1 set. Untuk banyak set, pasang fotonya nanti lewat <code>/edit [nomor]</code>.\n" +
              "• Mau tambah file upload langsung (bukan link)? Pakai <code>/tambahfile [nomor]</code> setelah set ini tersimpan.</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const isBulk = records.length > 1;
        let photoId = "";
        if (!isBulk && msg.photo && msg.photo.length > 0) {
          photoId = msg.photo[msg.photo.length - 1].file_id;
        }

        const katalogList = await getKatalog();
        const baseId = Date.now();
        const added = []; // { no, item }
        const failed = []; // { no, text }

        records.forEach((rec, i) => {
          const parts = rec.split("|").map((p) => p.trim());
          if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts[3]) {
            failed.push({ no: i + 1, text: rec.split("\n")[0].slice(0, 60) });
            return;
          }

          const linksArr = parts[3]
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map(normalizeUrl);
          const kategoriRaw = (parts[4] || "mini").toLowerCase();
          const kategori = kategoriRaw.includes("full") ? "full" : "mini";
          const creator = (parts[5] || "").replace(/\s+/g, " ").trim().slice(0, 60);

          const newItem = {
            id: String(baseId + i), // +i supaya ID unik walau ditambah barengan
            nama: parts[0],
            isi: parts[1],
            harga: parts[2],
            links: linksArr,
            link: linksArr[0] || "",
            files: [],
            kategori,
            creator,
            photo_id: photoId,
            sold: 0,
          };

          katalogList.push(newItem);
          added.push({ no: katalogList.length, item: newItem });
        });

        // Tidak ada satupun yang valid -> kasih contoh format
        if (added.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format kurang lengkap! Kirim foto preview dengan caption:\n" +
              "<code>/tambah Nama Set | Isi | Harga | Link1, Link2 | kategori</code>\n\n" +
              "<b>Mau tambah banyak set sekaligus?</b> 1 baris = 1 set:\n" +
              "<code>/tambah\nNama A | 29 | Rp 5.000 | https://t.me/+abc | Full\nNama B | 20 | Rp 5.000 | https://t.me/+def | Full</code>\n\n" +
              "<i>• Link bisa lebih dari satu, pisahkan dengan koma.\n" +
              "• Kategori opsional: <code>mini</code> atau <code>full</code> (default: mini).\n" +
              "• Foto preview hanya dipakai kalau tambah 1 set. Untuk banyak set, pasang fotonya nanti lewat <code>/edit [nomor]</code>.</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await saveKatalog(katalogList);

        // --- Tambah 1 set: tampilan detail seperti sebelumnya ---
        if (!isBulk) {
          const newItem = added[0].item;
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `✅ <b>Berhasil ditambahkan ke Katalog!</b>\n` +
              `• <b>Nama:</b> ${escapeHtml(newItem.nama)}\n` +
              (newItem.creator ? `• <b>Creator:</b> 👤 ${escapeHtml(newItem.creator)}\n` : "") +
              `• <b>Isi:</b> ${escapeHtml(newItem.isi)}\n` +
              `• <b>Harga:</b> ${escapeHtml(newItem.harga)}\n` +
              `• <b>Kategori:</b> ${newItem.kategori === "full" ? "📦 Full Set" : "🧩 Mini Set"}\n` +
              `• <b>Jumlah Link:</b> ${newItem.links.length}x\n` +
              (newItem.links.length > 0
                ? newItem.links.map((l, i) => `  ${i + 1}. ${escapeHtml(l)}`).join("\n") + "\n"
                : "") +
              `\n<i>Mau lampirkan file upload langsung? Kirim foto/dokumen dengan caption <code>/tambahfile ${added[0].no}</code></i>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        // --- Tambah banyak set: kirim rangkuman (dipecah kalau kepanjangan, batas Telegram 4096 karakter) ---
        const blocks = [];
        blocks.push(`✅ <b>${added.length} set berhasil ditambahkan ke Katalog!</b>\n`);
        added.forEach(({ no, item }) => {
          const katIcon = item.kategori === "full" ? "📦" : "🧩";
          blocks.push(
            `${no}. ${katIcon} <b>${escapeHtml(item.nama)}</b> — ${escapeHtml(item.isi)} isi • ${escapeHtml(item.harga)} • ${item.links.length} link`
          );
        });
        if (failed.length > 0) {
          blocks.push(`\n⚠️ <b>${failed.length} baris dilewati</b> (format kurang lengkap):`);
          failed.forEach((f) => {
            blocks.push(`• Baris ke-${f.no}: <code>${escapeHtml(f.text)}</code>`);
          });
          blocks.push("<i>Perbaiki baris di atas lalu kirim ulang dengan /tambah (yang sudah masuk tidak perlu dikirim lagi).</i>");
        }
        blocks.push(
          "\n<i>Lampirkan file langsung: kirim foto/dokumen dengan caption <code>/tambahfile NOMOR</code>. " +
            "Pasang foto preview per set: <code>/edit NOMOR</code> + foto.</i>"
        );

        const MAX_LEN = 3800;
        const messages = [];
        let current = "";
        for (const b of blocks) {
          if (current && current.length + b.length + 1 > MAX_LEN) {
            messages.push(current);
            current = "";
          }
          current += (current ? "\n" : "") + b;
        }
        if (current) messages.push(current);

        for (const text of messages) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 10. ADMIN: /edit
      if (rawText.startsWith("/edit")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "📂 Katalog masih kosong." });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/edit\s*/i, "").trim();
        if (!arg) {
          let listText = "✏️ <b>DAFTAR SET UNTUK DI-EDIT</b>\n\n";
          katalogList.forEach((item, idx) => {
            const katLabel = item.kategori === "full" ? "📦" : "🧩";
            const crInfo = item.creator ? ` • 👤 ${escapeHtml(item.creator)}` : "";
            listText += `${idx + 1}. ${katLabel} <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})${crInfo}\n`;
          });
          listText +=
            "\nGunakan: <code>/edit [nomor] | Nama | Isi | Harga | Link1,Link2 | kategori | Creator</code>\n" +
            "<i>Kosongkan bagian yang tidak ingin diubah (tetap pakai tanda | -nya).</i>";
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split("|").map((p) => p.trim());
        const idx = parseInt(parts[0], 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Nomor set tidak valid." });
          return res.status(200).json({ ok: true });
        }

        const targetItem = katalogList[idx];
        if (msg.photo && msg.photo.length > 0) {
          targetItem.photo_id = msg.photo[msg.photo.length - 1].file_id;
        }
        if (parts.length >= 5) {
          if (parts[1]) targetItem.nama = parts[1];
          if (parts[2]) targetItem.isi = parts[2];
          if (parts[3]) targetItem.harga = parts[3];
          if (parts[4]) {
            const linksArr = parts[4]
              .split(/[\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map(normalizeUrl);
            targetItem.links = linksArr;
            targetItem.link = linksArr[0] || "";
          }
        }
        if (parts.length >= 6 && parts[5]) {
          targetItem.kategori = parts[5].toLowerCase().includes("full") ? "full" : "mini";
        }
        if (parts.length >= 7 && parts[6]) {
          targetItem.creator =
            parts[6] === "-" || parts[6].toLowerCase() === "hapus"
              ? ""
              : parts[6].replace(/\s+/g, " ").slice(0, 60);
        }

        katalogList[idx] = targetItem;
        await saveKatalog(katalogList);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Set #${idx + 1} (${escapeHtml(targetItem.nama)}) diperbarui!</b>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10B. ADMIN: /tambahfile — lampirkan file upload langsung (foto/dokumen) ke sebuah set
      if (rawText.startsWith("/tambahfile")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        const idx = parseInt(rawText.replace(/^\/tambahfile\s*/i, "").trim(), 10) - 1;

        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Gunakan: kirim foto atau dokumen dengan caption <code>/tambahfile [nomor]</code>\n" +
              "<i>Contoh: <code>/tambahfile 1</code></i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        let fileId = "";
        let fileType = "";
        if (msg.photo && msg.photo.length > 0) {
          fileId = msg.photo[msg.photo.length - 1].file_id;
          fileType = "photo";
        } else if (msg.document) {
          fileId = msg.document.file_id;
          fileType = "document";
        }

        if (!fileId) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Kirim file-nya (foto atau dokumen) langsung bareng caption <code>/tambahfile [nomor]</code>.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const targetItem = katalogList[idx];
        if (!Array.isArray(targetItem.files)) targetItem.files = [];
        targetItem.files.push({ file_id: fileId, type: fileType });
        katalogList[idx] = targetItem;
        await saveKatalog(katalogList);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>File ditambahkan ke Set #${idx + 1} (${escapeHtml(targetItem.nama)})!</b>\n` +
            `📎 Total file terlampir sekarang: <b>${targetItem.files.length}</b>\n\n` +
            "<i>Kirim lagi foto/dokumen lain dengan caption yang sama untuk menambah lebih banyak file.</i>",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10C. ADMIN: /hapusfile [nomor_set] [nomor_file] — hapus salah satu file terlampir
      if (rawText.startsWith("/hapusfile")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        const argParts = rawText.replace(/^\/hapusfile\s*/i, "").trim().split(/\s+/);
        const idx = parseInt(argParts[0], 10) - 1;
        const fileIdx = parseInt(argParts[1], 10) - 1;

        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gunakan: <code>/hapusfile [nomor_set] [nomor_file]</code>\n<i>Lihat nomor file lewat /listfile [nomor_set]</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const targetItem = katalogList[idx];
        const files = Array.isArray(targetItem.files) ? targetItem.files : [];
        if (isNaN(fileIdx) || fileIdx < 0 || fileIdx >= files.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Nomor file tidak valid. Set ini punya ${files.length} file terlampir.`,
          });
          return res.status(200).json({ ok: true });
        }

        files.splice(fileIdx, 1);
        targetItem.files = files;
        katalogList[idx] = targetItem;
        await saveKatalog(katalogList);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ File ke-${fileIdx + 1} pada Set #${idx + 1} (${escapeHtml(targetItem.nama)}) dihapus.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10D. ADMIN: /listfile [nomor_set] — lihat link & file terlampir pada satu set
      if (rawText.startsWith("/listfile")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        const idx = parseInt(rawText.replace(/^\/listfile\s*/i, "").trim(), 10) - 1;

        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gunakan: <code>/listfile [nomor_set]</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const item = katalogList[idx];
        const links = Array.isArray(item.links) && item.links.length > 0 ? item.links : item.link ? [item.link] : [];
        const files = Array.isArray(item.files) ? item.files : [];

        let listText =
          `📎 <b>LINK & FILE — Set #${idx + 1} (${escapeHtml(item.nama)})</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔗 <b>Link (${links.length}):</b>\n`;
        listText += links.length > 0 ? links.map((l, i) => `  ${i + 1}. ${escapeHtml(l)}`).join("\n") : "  <i>(kosong)</i>";
        listText += `\n\n📁 <b>File Upload (${files.length}):</b>\n`;
        listText += files.length > 0 ? files.map((f, i) => `  ${i + 1}. ${f.type || "file"}`).join("\n") : "  <i>(kosong)</i>";
        listText += `\n\n<i>Hapus file: /hapusfile ${idx + 1} [nomor_file]</i>`;

        await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
        return res.status(200).json({ ok: true });
      }

      // 11. ADMIN: /hapus
      if (rawText.startsWith("/hapus")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "📂 Katalog masih kosong." });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/hapus\s*/i, "").trim();
        if (!arg) {
          let listText = "🗑️ <b>PILIH NOMOR SET UNTUK DIHAPUS</b>\n\n";
          katalogList.forEach((item, idx) => {
            listText += `${idx + 1}. <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})\n`;
          });
          listText += "\nKetik: <code>/hapus [nomor]</code>";
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: listText, parse_mode: "HTML" });
          return res.status(200).json({ ok: true });
        }

        const idx = parseInt(arg, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Nomor set tidak valid." });
          return res.status(200).json({ ok: true });
        }

        const removed = katalogList.splice(idx, 1)[0];
        await saveKatalog(katalogList);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Set <b>${escapeHtml(removed.nama)}</b> dihapus.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 13. FOTO TANPA CAPTION PERINTAH
      if (msg.photo) {
        if (isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "💡 Gunakan caption perintah saat kirim foto:\n" +
              "• <code>/setbanner</code> | <code>/setqris</code> | <code>/broadcast Pesan</code>\n" +
              "• <code>/tambah Nama | Isi | Harga | Link</code> (bisa banyak baris sekaligus) | <code>/edit [nomor]</code>\n" +
              "• <code>/tambahfile [nomor]</code> — lampirkan file ini langsung ke set",
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id,
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `Pembayaran via Saldo atau QRIS + Kode Unik di menu Katalog. Butuh bantuan? Chat @${ADMIN_USERNAME} 🙏`,
            reply_to_message_id: msg.message_id,
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 14. MENU UTAMA & AUTO-REPLY PEMBELI
      if (msg.text) {
        const text = msg.text.trim();

        const startRefMatch = /^\/start\s+ref_(\d{3,15})$/i.exec(text);
        if (startRefMatch) {
          try {
            await recordReferral(senderId, startRefMatch[1], isNewUser);
          } catch (refErr) {
            console.error("Referral record error:", refErr);
          }
        }

        if (text === "/start" || startRefMatch) {
          const buyerName = escapeHtml((msg.from && msg.from.first_name) || "Kak");
          let headerText = `👋 Halo <b>${buyerName}</b>! Selamat datang di <b>Lumine Photopack Store</b>.`;

          if (isAdmin) {
            headerText +=
              "\n\n🛠️ <b>Panel Admin Lengkap (Bot Utama):</b>\n" +
              "• <code>/setmacro</code> — Link & Setting Auto-ACC Makro\n" +
              "• <code>/addsaldo ID NOMINAL</code> | <code>/ceksaldo ID</code> — Kelola Saldo\n" +
              "• <code>/kashadiah</code> — Saldo kas bonus Undang Teman\n" +
              "• <code>/setbanner</code> | <code>/setqris</code> | <code>/settesti</code> | <code>/broadcast</code>\n" +
              "• <code>/buatvoucher KODE | DISKON | KUOTA</code>\n" +
              "• <code>/setmystery HARGA</code> | <code>/setsold</code> | <code>/setcreator</code> | <code>/resetlb</code> | <code>/hadiahlb</code>\n" +
              "• <code>/tambah</code> (1 baris = 1 set, bisa banyak sekaligus) | <code>/edit</code> | <code>/hapus</code>\n" +
              "• <code>/tambahfile NO</code> | <code>/hapusfile NO NO</code> | <code>/listfile NO</code> — lampirkan banyak file/link\n" +
              "• <code>/addreseller ID NAMA</code> | <code>/delreseller ID</code> | <code>/listreseller</code>\n" +
              "• <code>/omsetreseller ID</code> | <code>/omsettoko</code> | <code>/listrating</code>\n" +
              "• <code>/listbot</code> | <code>/matikanbot ID</code> | <code>/aktifkanbot ID</code>\n" +
              "• <code>/listmargin</code> | <code>/bayarmargin ID NOMINAL</code> — margin bot reseller\n" +
              "• <code>/listwd</code> — WD reseller pending (ACC/Tolak lewat tombol)\n" +
              "• <code>/setwdch</code> — channel bukti WD (default: Channel Testimoni)";
          }

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: headerText,
            parse_mode: "HTML",
            reply_markup: getCompactReplyKeyboard(),
          });

          await sendMainMenuCard(token, chatId);
        } else if (text === "💰 Saldo & Depo" || text === "💰 Saldo & Deposit") {
          await sendSaldoMenu(token, chatId, senderId);
        } else if (text === "🛍️ Katalog" || text === "🛍️ Katalog Mini Set" || text === "🛍️ Katalog Set Pool" || text === "🛍️ Katalog Photopack") {
          await sendKatalogMenu(token, chatId);
        } else if (text === "🔥 Bestseller" || text === "/bestseller") {
          await sendBestsellerMenu(token, chatId);
        } else if (text === "/creator" || text === "👤 Creator") {
          await sendKatalogCreatorMenu(token, chatId);
        } else if (text === "🎲 Mystery Box") {
          await sendMysteryMenu(token, chatId);
        } else if (text === "🎁 Promo 5k" || text === "🎁 Promo Bundling 5k") {
          // tombol lama (promo bundling sudah dihapus) -> arahkan ke katalog
          await sendKatalogMenu(token, chatId);
        } else if (text === "🏆 Leaderboard" || text === "/leaderboard") {
          const lb = await buildLeaderboardPayload("month", senderId);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: lb.text,
            parse_mode: "HTML",
            reply_markup: lb.reply_markup,
          });
        } else if (text === "🎒 Koleksi Saya" || text === "/koleksi") {
          await sendKoleksiMenu(token, chatId, senderId);
        } else if (text === "📋 Cara Order" || text === "📋 Cara Beli & Aturan") {
          await sendCaraOrder(token, chatId);
        } else if (text === "☰ Lainnya" || text === "Menu Lainnya") {
          await sendMoreMenu(token, chatId);
        } else if (text === "💎 Info & Channel") {
          await sendChannelLainnya(token, chatId);
        } else if (text === "/undang" || text === "/referral") {
          await sendReferralMenu(token, chatId, senderId);
        } else if (text === "🤝 Reseller" || text === "/reseller") {
          await sendResellerMenu(token, chatId, msg.from);
        } else {
          if (["saldo", "depo", "deposit", "topup", "top up"].some((k) => lowerText.includes(k))) {
            await sendSaldoMenu(token, chatId, senderId);
            return res.status(200).json({ ok: true });
          }

          if (["undang teman", "referral", "ajak teman"].some((k) => lowerText.includes(k))) {
            await sendReferralMenu(token, chatId, senderId);
            return res.status(200).json({ ok: true });
          }

          if (["reseller", "grosir", "jadi agen"].some((k) => lowerText.includes(k))) {
            await sendResellerMenu(token, chatId, msg.from);
            return res.status(200).json({ ok: true });
          }

          if (["bestseller", "populer", "terlaris", "laris", "rekomendasi"].some((k) => lowerText.includes(k))) {
            await sendBestsellerMenu(token, chatId);
            return res.status(200).json({ ok: true });
          }

          if (["mystery", "gacha", "spin", "box"].some((k) => lowerText.includes(k))) {
            await sendMysteryMenu(token, chatId);
            return res.status(200).json({ ok: true });
          }

          if (["leaderboard", "top", "peringkat", "rank", "sultan"].some((k) => lowerText.includes(k))) {
            const lb = await buildLeaderboardPayload("month", senderId);
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text: lb.text,
              parse_mode: "HTML",
              reply_markup: lb.reply_markup,
              reply_to_message_id: msg.message_id,
            });
            return res.status(200).json({ ok: true });
          }

          let replyText =
            "Halo! Gunakan tombol menu di bawah atau ketik /start untuk membuka Katalog, 💰 Saldo & Depo, 🔥 Bestseller, Mystery Box, Leaderboard, dan Koleksi Saya.\n" +
            `Butuh bantuan? Hubungi @${ADMIN_USERNAME} 🙏`;

          if (["harga", "berapa", "brp", "list", "daftar"].some((k) => lowerText.includes(k))) {
            const mysteryCfgInfo = await getMysteryConfig();
            replyText =
              "💰 <b>Info Harga Lumine Photopack:</b>\n" +
              `• Paket Standar : <b>${formatRupiah(RETAIL_PRICE_LITE)}</b>\n` +
              `• Paket Premium : <b>${formatRupiah(RETAIL_PRICE_STANDAR)}</b>\n` +
              `• 🎲 <b>Mystery Box Gacha : ${formatRupiah(mysteryCfgInfo.price || 3000)}</b>`;
          }

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: replyText,
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id,
          });
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return res.status(200).json({ ok: true });
  }
};
                                
