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

// ---- PENGATURAN RESELLER PREM (BELI SENDIRI LEWAT BOT) ----
// User bayar harga paket -> otomatis jadi reseller + dapat saldo awal gratis yang DIPOTONG dari saldo kas admin.
const RESELLER_PREM_ENABLED = true; // false = matikan menu Reseller Prem
const RESELLER_PREM_PRICE = 30000; // harga paket Reseller Prem
const RESELLER_PREM_BONUS_SALDO = 15000; // saldo awal gratis untuk pembeli (dari kas admin)
const RESELLER_PREM_FROM_ADMIN_SALDO = true; // true = bonus dipotong dari saldo kas admin; false = bonus langsung ditambah tanpa potong
const RESELLER_PREM_TARGET = "resprem"; // kunci internal (callback buy_resprem), jangan diubah
const REDIS_RESPREM_BONUS_KEY = "lumine_main_resprem_bonus"; // hash: id user -> id order (bonus sudah dicairkan, anti dobel)
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
const REDIS_RESTORE_PENDING_PREFIX = "lumine_main_restore_pending_";

// ---- PENGATURAN CHECK-IN HARIAN ----
const CHECKIN_ENABLED = true; // false = matikan check-in harian
const CHECKIN_REWARD_SALDO = 100; // saldo per check-in (Rp100), dipotong dari kas admin
const REDIS_CHECKIN_PREFIX = "lumine_main_checkin_"; // hash per hari (WIB): id user -> 1
const REDIS_DEPOSIT_USER_KEY = "lumine_main_depo_users"; // set: id user yang pernah deposit (syarat check-in)

// ---- KLAIM SALDO DARI SUBSCRIBE CHANNEL LUAR (VERIFIKASI BUKTI MANUAL) ----
const SUB_CLAIM_ENABLED = true; // false = matikan klaim subscribe
const SUB_CLAIM_REWARD = 3000; // saldo per klaim (Rp3.000), dipotong dari kas admin, hanya bisa dibelanjakan di bot
const SUB_CLAIM_CHANNEL_NAME = "GANTI NAMA CHANNEL"; // nama channel yang tampil ke pembeli
const SUB_CLAIM_LINK = "https://GANTI-LINK-SUBSCRIBE"; // link subscribe yang dibuka lewat tombol (nilai awal, bisa diubah lewat /setsub)
const REDIS_SUB_CFG_KEY = "lumine_main_sub_cfg"; // JSON: { name, link, enabled } hasil /setsub
const REDIS_SUB_PENDING_KEY = "lumine_main_sub_pending"; // hash: id user -> "waiting" atau id klaim yang menunggu review
const REDIS_SUB_CLAIMED_KEY = "lumine_main_sub_claimed"; // hash: id user -> id klaim (sudah pernah klaim, hanya sekali)
const REDIS_SUB_REQ_KEY = "lumine_main_sub_req"; // hash: id klaim -> JSON data klaim
const REDIS_SUB_SEQ_KEY = "lumine_main_sub_seq"; // counter id klaim

// ---- SPIN GRATIS HARIAN (wajib sudah check-in hari itu) ----
const SPIN_ENABLED = true; // false = matikan spin wheel
const REDIS_SPIN_PREFIX = "lumine_main_spin_"; // hash per hari (WIB): id user -> 1
const SPIN_SALDO_AMOUNT = 500; // nominal hadiah saldo (dipotong dari kas admin)
// Peluang dasar. Hadiah yang stoknya kosong (mis. tidak ada katalog Rp50.000) otomatis dikeluarkan
// dan peluangnya dibagi ulang ke hadiah yang tersedia. Peluang yang tampil selalu sesuai hasil itu.
const SPIN_PRIZES = [
  { key: "zonk", chance: 8 },
  { key: "saldo", chance: 30 },
  { key: "pack5", chance: 40, price: 5000 },
  { key: "pack10", chance: 20, price: 10000 },
  { key: "all50", chance: 2, price: 50000 },
]; // file restore yg nunggu /restore konfirmasi (TTL 5 menit)

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
  const ratedOrder = await getOrder(orderId).catch(() => null);
  const ratedItemId = ratedOrder && ratedOrder.item_id ? String(ratedOrder.item_id) : "";
  list.unshift({
    order_id: orderId,
    item_id: ratedItemId,
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
  let before = [];
  try {
    before = await getKatalog();
  } catch {}
  await redisCommand(["SET", REDIS_KEY, JSON.stringify(list)]);
  try {
    // Hanya set yang muncul/hilang/berubah nama-harganya yang perlu dicek wishlist.
    // Sebelumnya semua set dicek (1 round trip Redis per set), bikin perintah seperti /setcreator lambat.
    const oldMap = new Map(before.map((i) => [String(i.id), i]));
    const newMap = new Map(list.map((i) => [String(i.id), i]));
    const changedIds = new Set();
    for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
      const a = oldMap.get(id);
      const b = newMap.get(id);
      if (!a || !b || a.nama !== b.nama || a.harga !== b.harga) changedIds.add(id);
    }
    if (changedIds.size > 0) {
      const beforeChanged = before.filter((i) => changedIds.has(String(i.id)));
      const afterChanged = list.filter((i) => changedIds.has(String(i.id)));
      await notifyWishlistChanges(beforeChanged, afterChanged);
    }
  } catch (e) {
    console.error("Notif wishlist gagal:", e);
  }
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

// Versi timestamp yang aman dipakai sebagai nama file (tanpa karakter "/", ":", "•").
function getWibFileStamp() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const min = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

// Upload teks (mis. JSON backup) langsung sebagai dokumen ke Telegram, tanpa perlu file_id
// yang sudah ada (beda dari tgRequest biasa yang cuma kirim JSON payload ke Bot API).
async function sendJsonDocument(token, chatId, filename, textContent, caption) {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) {
      form.append("caption", caption.slice(0, 1024));
      form.append("parse_mode", "HTML");
    }
    form.append("document", new Blob([textContent], { type: "application/json" }), filename);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return Boolean(data && data.ok);
  } catch (e) {
    console.error("sendJsonDocument error:", e);
    return false;
  }
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
  if (String(itemId) === RESELLER_PREM_TARGET) return { source: "", discount: 0, code: "" };
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
      if (!isCategoryEnabled(k)) return false;
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
  try {
    if (!order.is_deposit) await recordLastBuy(order.buyer_id);
  } catch (lbErr) {
    console.error("Catat pembelian terakhir error:", lbErr);
  }
  try {
    await maybeRewardShare(token, order);
  } catch (shErr) {
    console.error("Bonus berbagi error:", shErr);
  }
  try {
    await maybeRewardMitra(token, order);
  } catch (mitraErr) {
    console.error("Mitra reward error:", mitraErr);
  }
  return result;
}

// Potong bonus Reseller Prem dari saldo kas admin. Tidak memblokir bonus (pembeli sudah bayar),
// jadi saldo kas boleh minus sebagai tanda admin perlu isi ulang.
async function chargeFundForResellerPrem(token, buyerName) {
  if (!RESELLER_PREM_FROM_ADMIN_SALDO || !(RESELLER_PREM_BONUS_SALDO > 0)) return null;
  const fundId = await getReferralFundId();
  if (!fundId) return null;

  const after = parseInt(
    await redisCommand(["HINCRBY", REDIS_SALDO_KEY, String(fundId), -Math.round(RESELLER_PREM_BONUS_SALDO)]),
    10
  );
  if (isNaN(after)) return null;
  const before = after + Math.round(RESELLER_PREM_BONUS_SALDO);

  if (before >= 0 && after < 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: fundId,
      text:
        `🚨 <b>Saldo kas MINUS ${formatRupiah(Math.abs(after))}!</b>\n` +
        `Bonus Reseller Prem <b>${escapeHtml(buyerName || "Reseller")}</b> (${formatRupiah(RESELLER_PREM_BONUS_SALDO)}) sudah dipotong.\n` +
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
  return { fundId, balance: after };
}

async function processResellerPremOrder(token, order) {
  const buyerId = String(order.buyer_id);
  const alreadyReseller = await isReseller(buyerId);
  if (!alreadyReseller) {
    await addReseller(buyerId, order.buyer_name);
  }

  // Bonus saldo awal: cair satu kali per user (aman walau ACC terpanggil dua kali)
  const claimed = await redisCommand(["HSETNX", REDIS_RESPREM_BONUS_KEY, buyerId, String(order.id)]);
  let bonusGiven = 0;
  let newSaldo = await getUserSaldo(buyerId);
  let fund = null;
  if (Number(claimed) === 1 && RESELLER_PREM_BONUS_SALDO > 0) {
    try {
      fund = await chargeFundForResellerPrem(token, order.buyer_name);
      newSaldo = await addUserSaldo(buyerId, RESELLER_PREM_BONUS_SALDO);
      bonusGiven = RESELLER_PREM_BONUS_SALDO;
    } catch (bonusErr) {
      // kembalikan kas & klaim bila gagal menambah saldo user
      if (fund) await addUserSaldo(fund.fundId, RESELLER_PREM_BONUS_SALDO);
      await redisCommand(["HDEL", REDIS_RESPREM_BONUS_KEY, buyerId]);
      throw bonusErr;
    }
  }

  try {
    await addStoreOmset(order.total_nominal);
  } catch (omsetErr) {
    console.error("Omset Reseller Prem error:", omsetErr);
  }

  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    text:
      `💎 <b>SELAMAT! RESELLER PREM AKTIF (Pesanan #${order.id})</b>\n\n` +
      `🤝 Akunmu sekarang resmi jadi <b>Reseller</b> Lumine Photopack Store.\n` +
      (bonusGiven > 0
        ? `🎁 <b>Saldo Awal Gratis:</b> +<code>${formatRupiah(bonusGiven)}</code>\n`
        : "") +
      `💳 <b>Saldo Kamu Sekarang:</b> <code>${formatRupiah(newSaldo)}</code>\n\n` +
      `<i>Buka menu Reseller untuk cek tier, omset, dan buat bot toko sendiri.</i>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🤝 Menu Reseller", callback_data: "menu_reseller" }],
        [
          { text: "🛍️ Belanja Katalog", callback_data: "menu_katalog" },
          { text: "💰 Cek Saldo", callback_data: "menu_saldo" },
        ],
      ],
    },
  });

  // Notifikasi ke admin (kas yang keluar)
  const qris = await getQris();
  const adminChat = (qris && qris.admin_chat_id) || (fund && fund.fundId);
  if (adminChat) {
    await tgRequest(token, "sendMessage", {
      chat_id: adminChat,
      text:
        `💎 <b>RESELLER PREM BARU (#${order.id})</b>\n\n` +
        `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
        `💰 <b>Bayar:</b> <code>${formatRupiah(order.total_nominal)}</code>\n` +
        (bonusGiven > 0
          ? `🎁 <b>Bonus saldo awal:</b> <code>${formatRupiah(bonusGiven)}</code>` +
            (fund ? ` (kas sekarang: <code>${formatRupiah(fund.balance)}</code>)` : "") + `\n`
          : `ℹ️ Bonus saldo awal tidak diberikan (sudah pernah cair untuk user ini).\n`) +
        `✅ <i>Status reseller aktif otomatis.</i>`,
      parse_mode: "HTML",
    });
  }

  return { deliveredName: `Reseller Prem (bonus saldo ${formatRupiah(bonusGiven)})`, deliveredLink: "" };
}

async function processAccOrderCore(token, order) {
  order.status = "acc";
  await saveOrder(order.id, order);

  // KHUSUS ORDER DEPOSIT SALDO (AUTO-ACC)
  if (order.is_deposit) {
    const depositAmount = Number(order.base_nominal) || 0;
    const newSaldo = await addUserSaldo(order.buyer_id, depositAmount);
    await redisCommand(["SADD", REDIS_DEPOSIT_USER_KEY, String(order.buyer_id)]);

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

  // KHUSUS ORDER RESELLER PREM (jadi reseller + saldo awal dari kas admin)
  if (order.is_resprem) {
    return await processResellerPremOrder(token, order);
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
      [{ text: "☰ Lainnya" }, { text: "📖 Panduan" }],
    ],
    resize_keyboard: true,
  };
}
// ---- CHECK-IN HARIAN ----
// Syarat: pernah belanja (lb_allcnt > 0) atau pernah deposit.
async function checkinEligible(userId) {
  const cnt = await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)]);
  if ((parseInt(cnt, 10) || 0) > 0) return true;
  const dep = await redisCommand(["SISMEMBER", REDIS_DEPOSIT_USER_KEY, String(userId)]);
  return Number(dep) === 1;
}

async function claimDailyCheckin(token, chatId, userId) {
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    });

  if (!CHECKIN_ENABLED) {
    return sendMsg("⚠️ Check-in harian sedang tidak aktif.");
  }
  if (!(await checkinEligible(userId))) {
    return sendMsg(
      "🔒 <b>Check-in harian khusus pembeli.</b>\n" +
        "Lakukan satu kali pembelian atau deposit saldo dulu, lalu kamu bisa check-in tiap hari dan dapat " +
        `<b>${formatRupiah(CHECKIN_REWARD_SALDO)}</b>.`
    );
  }

  const fundId = await getReferralFundId();
  if (!fundId) {
    return sendMsg("⚠️ Check-in belum bisa diproses. Coba lagi nanti ya.");
  }

  const { dayKey } = getWibPeriods();
  const key = `${REDIS_CHECKIN_PREFIX}${dayKey}`;

  // Klaim satu kali per user per hari (HSETNX anti klik ganda)
  const claimed = await redisCommand(["HSETNX", key, String(userId), "1"]);
  await redisCommand(["EXPIRE", key, String(60 * 60 * 24 * 3)]);
  if (Number(claimed) !== 1) {
    return sendMsg("✅ Kamu sudah check-in hari ini. Balik lagi besok ya!");
  }

  // Potong dari kas admin; kalau kas kurang, batalkan klaim (tidak sampai minus)
  const d = await deductUserSaldo(fundId, CHECKIN_REWARD_SALDO);
  if (!d.ok) {
    await redisCommand(["HDEL", key, String(userId)]);
    await sendMsg("⚠️ Check-in belum bisa diproses karena saldo kas habis. Coba lagi nanti ya.");
    await tgRequest(token, "sendMessage", {
      chat_id: fundId,
      text:
        `⚠️ <b>Saldo kas tidak cukup untuk check-in harian!</b>\n` +
        `💳 Saldo kas: <b>${formatRupiah(d.balance)}</b>\n` +
        `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>`,
      parse_mode: "HTML",
    });
    return;
  }

  let newSaldo;
  try {
    newSaldo = await addUserSaldo(userId, CHECKIN_REWARD_SALDO);
  } catch (addErr) {
    // kembalikan kas dan klaim bila gagal menambah saldo user
    await addUserSaldo(fundId, CHECKIN_REWARD_SALDO);
    await redisCommand(["HDEL", key, String(userId)]);
    throw addErr;
  }

  await sendMsg(
    `🎉 <b>Check-in berhasil!</b>\n` +
      `💰 Saldo masuk: <b>+${formatRupiah(CHECKIN_REWARD_SALDO)}</b>\n` +
      `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>`,
    { inline_keyboard: [[{ text: "🎡 Spin Gratis Sekarang", callback_data: "spin_info" }]] }
  );
}

// ---- SPIN GRATIS HARIAN ----
// Ambil katalog yang punya link, dikelompokkan per harga (5k, 10k, 50k)
async function getSpinPool() {
  const katalog = await getKatalog();
  const ok = katalog.filter(
    (k) => (Array.isArray(k.links) && k.links.length > 0) || (typeof k.link === "string" && k.link)
  );
  const byPrice = (price) => ok.filter((k) => parseNominal(k.harga) === price);
  return {
    pack5: byPrice(5000),
    pack10: byPrice(10000),
    all50: byPrice(50000),
  };
}

// Peluang nyata setiap hadiah setelah hadiah kosong dikeluarkan
async function getSpinOdds(fundId, pool) {
  const fundBal = await getUserSaldo(fundId);
  const available = SPIN_PRIZES.filter((p) => {
    if (p.key === "zonk") return true;
    if (p.key === "saldo") return fundBal >= SPIN_SALDO_AMOUNT;
    return pool[p.key] && pool[p.key].length > 0;
  });
  const total = available.reduce((a, p) => a + p.chance, 0) || 1;
  return available.map((p) => ({ ...p, real: (p.chance / total) * 100 }));
}

function pickFromOdds(odds) {
  const total = odds.reduce((a, p) => a + p.chance, 0);
  let r = Math.random() * total;
  for (const p of odds) {
    if (r < p.chance) return p;
    r -= p.chance;
  }
  return odds[odds.length - 1];
}

function spinPrizeLabel(key) {
  if (key === "zonk") return "Zonk, coba lagi besok";
  if (key === "saldo") return `Saldo ${formatRupiah(SPIN_SALDO_AMOUNT)}`;
  if (key === "pack5") return "Photopack 5k";
  if (key === "pack10") return "Photopack 10k";
  return "All Pack 50k";
}

async function sendSpinInfo(token, chatId, userId) {
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    });
  const backBtn = [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]];

  if (!SPIN_ENABLED) return sendMsg("⚠️ Spin gratis sedang tidak aktif.", { inline_keyboard: backBtn });

  const { dayKey } = getWibPeriods();
  const checkedIn = Number(await redisCommand(["HEXISTS", `${REDIS_CHECKIN_PREFIX}${dayKey}`, String(userId)])) === 1;
  if (!checkedIn) {
    return sendMsg(
      "🔒 <b>Spin gratis terbuka setelah check-in.</b>\nCheck-in dulu di menu 💰 Saldo & Depo, lalu spin di sini.",
      { inline_keyboard: backBtn }
    );
  }
  const spun = Number(await redisCommand(["HEXISTS", `${REDIS_SPIN_PREFIX}${dayKey}`, String(userId)])) === 1;
  if (spun) {
    return sendMsg("✅ Kamu sudah spin hari ini. Balik lagi besok ya!", { inline_keyboard: backBtn });
  }

  const fundId = await getReferralFundId();
  const pool = await getSpinPool();
  const odds = fundId ? await getSpinOdds(fundId, pool) : [];
  const lines = odds.map((p) => `• ${spinPrizeLabel(p.key)} — peluang <b>${p.real.toFixed(1)}%</b>\n`).join("");

  return sendMsg(
    "🎡 <b>SPIN GRATIS HARIAN</b>\n\n" +
      "Peluang setiap hadiah:\n" +
      lines +
      "\n<i>Gratis 1 spin per hari, setelah check-in. Hadiah pack langsung masuk ke 🎒 Koleksi Saya.</i>",
    { inline_keyboard: [[{ text: "🎡 Putar Sekarang", callback_data: "spin_go" }], ...backBtn] }
  );
}

async function doSpin(token, chatId, userId) {
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    });
  const backBtn = { inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]] };

  if (!SPIN_ENABLED) return sendMsg("⚠️ Spin gratis sedang tidak aktif.", backBtn);

  const { dayKey } = getWibPeriods();
  const checkedIn = Number(await redisCommand(["HEXISTS", `${REDIS_CHECKIN_PREFIX}${dayKey}`, String(userId)])) === 1;
  if (!checkedIn) return sendMsg("🔒 Check-in dulu ya sebelum spin.", backBtn);

  // Klaim 1 spin per hari (HSETNX anti klik ganda)
  const spinKey = `${REDIS_SPIN_PREFIX}${dayKey}`;
  const claimed = await redisCommand(["HSETNX", spinKey, String(userId), "1"]);
  await redisCommand(["EXPIRE", spinKey, String(60 * 60 * 24 * 3)]);
  if (Number(claimed) !== 1) {
    return sendMsg("✅ Kamu sudah spin hari ini. Balik lagi besok ya!", backBtn);
  }

  const fundId = await getReferralFundId();
  if (!fundId) {
    await redisCommand(["HDEL", spinKey, String(userId)]);
    return sendMsg("⚠️ Spin belum bisa diproses. Coba lagi nanti ya.", backBtn);
  }

  const pool = await getSpinPool();
  const odds = await getSpinOdds(fundId, pool);
  const prize = pickFromOdds(odds);

  try {
    if (prize.key === "zonk") {
      return sendMsg("😅 <b>Zonk!</b> Belum beruntung hari ini. Coba lagi besok ya!", backBtn);
    }

    if (prize.key === "saldo") {
      const d = await deductUserSaldo(fundId, SPIN_SALDO_AMOUNT);
      if (!d.ok) {
        // kas berubah sejak peluang dihitung: anggap zonk, jangan minus
        return sendMsg("😅 <b>Zonk!</b> Belum beruntung hari ini. Coba lagi besok ya!", backBtn);
      }
      let newSaldo;
      try {
        newSaldo = await addUserSaldo(userId, SPIN_SALDO_AMOUNT);
      } catch (addErr) {
        await addUserSaldo(fundId, SPIN_SALDO_AMOUNT);
        throw addErr;
      }
      return sendMsg(
        `🎉 <b>Kamu dapat saldo ${formatRupiah(SPIN_SALDO_AMOUNT)}!</b>\n` +
          `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>`,
        backBtn
      );
    }

    // Hadiah pack: pilih satu item acak dari tier, simpan ke koleksi
    const items = pool[prize.key];
    const item = items[Math.floor(Math.random() * items.length)];
    const link = normalizeUrl(
      Array.isArray(item.links) && item.links.length > 0 ? item.links[0] : item.link
    );
    await addKoleksi(userId, item.nama, link);
    return sendMsg(
      `🎁 <b>Kamu dapat ${escapeHtml(item.nama)}!</b>\n\n` +
        `🔗 ${escapeHtml(link)}\n\n` +
        `<i>Tersimpan juga di 🎒 Koleksi Saya.</i>`,
      backBtn
    );
  } catch (err) {
    await redisCommand(["HDEL", spinKey, String(userId)]);
    throw err;
  }
}

// ---- KLAIM SALDO SUBSCRIBE ----
// Konfigurasi dibaca dari database (diubah lewat /setsub). Kalau belum pernah diatur, pakai nilai di konstanta.
async function getSubConfig() {
  const fallback = { name: SUB_CLAIM_CHANNEL_NAME, link: SUB_CLAIM_LINK, enabled: SUB_CLAIM_ENABLED };
  const raw = await redisCommand(["GET", REDIS_SUB_CFG_KEY]);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

async function saveSubConfig(cfg) {
  await redisCommand(["SET", REDIS_SUB_CFG_KEY, JSON.stringify(cfg)]);
}

async function getSubReq(reqId) {
  const raw = await redisCommand(["HGET", REDIS_SUB_REQ_KEY, String(reqId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSubReq(reqId, data) {
  await redisCommand(["HSET", REDIS_SUB_REQ_KEY, String(reqId), JSON.stringify(data)]);
}

async function sendSubInfo(token, chatId, userId) {
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    });
  const backBtn = [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]];
  const uid = String(userId);

  if (!(await getSubConfig()).enabled) return sendMsg("⚠️ Klaim saldo subscribe sedang tidak aktif.", { inline_keyboard: backBtn });

  const claimed = Number(await redisCommand(["HEXISTS", REDIS_SUB_CLAIMED_KEY, uid])) === 1;
  if (claimed) {
    return sendMsg("✅ Kamu sudah pernah klaim saldo subscribe. Klaim hanya bisa sekali ya.", { inline_keyboard: backBtn });
  }
  const pend = await redisCommand(["HGET", REDIS_SUB_PENDING_KEY, uid]);
  if (pend && pend !== "waiting") {
    return sendMsg("⏳ Bukti subscribe kamu sedang diverifikasi admin. Mohon tunggu ya.", { inline_keyboard: backBtn });
  }

  return sendMsg(
    `🎁 <b>KLAIM SALDO ${formatRupiah(SUB_CLAIM_REWARD)}</b>\n\n` +
      `1️⃣ Subscribe ke <b>${escapeHtml((await getSubConfig()).name)}</b> lewat tombol di bawah.\n` +
      `2️⃣ Kembali ke sini, tekan <b>Sudah Subscribe</b>, lalu kirim screenshot bukti subscribe.\n\n` +
      `<i>Saldo ini hanya bisa dipakai belanja di bot dan tidak bisa ditarik tunai. Klaim hanya bisa sekali.</i>`,
    {
      inline_keyboard: [
        [{ text: "🔔 Subscribe Sekarang", url: (await getSubConfig()).link }],
        [{ text: "📸 Sudah Subscribe, Kirim Bukti", callback_data: "sub_start" }],
        ...backBtn,
      ],
    }
  );
}

async function startSubProof(token, chatId, userId) {
  const sendMsg = (text) =>
    tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  const uid = String(userId);

  if (!(await getSubConfig()).enabled) return sendMsg("⚠️ Klaim saldo subscribe sedang tidak aktif.");

  const claimed = Number(await redisCommand(["HEXISTS", REDIS_SUB_CLAIMED_KEY, uid])) === 1;
  if (claimed) return sendMsg("✅ Kamu sudah pernah klaim saldo subscribe.");
  const pend = await redisCommand(["HGET", REDIS_SUB_PENDING_KEY, uid]);
  if (pend && pend !== "waiting") return sendMsg("⏳ Bukti subscribe kamu sedang diverifikasi admin.");

  await redisCommand(["HSET", REDIS_SUB_PENDING_KEY, uid, "waiting"]);
  return sendMsg(
    "📸 Kirim <b>screenshot bukti subscribe</b> sekarang di chat ini.\n" +
      "<i>Pastikan nama channel dan tombol Subscribe/Subscribed terlihat jelas.</i>"
  );
}

async function handleSubProof(token, msg, userId) {
  const chatId = msg.chat.id;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const reqId = String(await redisCommand(["INCR", REDIS_SUB_SEQ_KEY]));
  const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "Pembeli";
  const username = (msg.from && msg.from.username) || "";

  await saveSubReq(reqId, {
    id: reqId,
    user_id: String(userId),
    name,
    username,
    status: "pending",
    created: getWibTimestamp(),
  });
  await redisCommand(["HSET", REDIS_SUB_PENDING_KEY, String(userId), reqId]);

  const qris = await getQris();
  const adminChat = qris && qris.admin_chat_id;
  if (adminChat) {
    await tgRequest(token, "sendPhoto", {
      chat_id: adminChat,
      photo: fileId,
      caption:
        `🎁 <b>KLAIM SUBSCRIBE #${reqId}</b>\n` +
        `👤 ${escapeHtml(name)}${username ? ` (@${escapeHtml(username)})` : ""}\n` +
        `🆔 <code>${escapeHtml(String(userId))}</code>\n` +
        `📺 ${escapeHtml((await getSubConfig()).name)}\n` +
        `💰 Hadiah: <b>${formatRupiah(SUB_CLAIM_REWARD)}</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ ACC", callback_data: `subacc_${reqId}` },
            { text: "❌ Tolak", callback_data: `subrej_${reqId}` },
          ],
        ],
      },
    });
  } else {
    console.error("Klaim subscribe: admin_chat_id belum diset, bukti tidak terkirim ke admin.");
  }

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: "📨 Bukti kamu sudah dikirim. Admin akan memverifikasi, dan saldo masuk setelah di-ACC.",
    parse_mode: "HTML",
  });
}

async function processSubReview(token, chatId, messageId, reqId, isAcc) {
  const req = await getSubReq(reqId);
  if (!req || req.status !== "pending") {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Klaim #${escapeHtml(String(reqId))} tidak ditemukan atau sudah diproses.`,
      parse_mode: "HTML",
    });
    return;
  }

  const userId = req.user_id;
  const fundId = await getReferralFundId();

  if (isAcc) {
    if (!fundId) {
      await tgRequest(token, "sendMessage", {
        chat_id: chatId,
        text: "⚠️ Kas admin belum diset, klaim belum bisa di-ACC.",
      });
      return;
    }
    const d = await deductUserSaldo(fundId, SUB_CLAIM_REWARD);
    if (!d.ok) {
      await tgRequest(token, "sendMessage", {
        chat_id: chatId,
        text:
          `⚠️ <b>Saldo kas tidak cukup untuk ACC klaim #${reqId}.</b>\n` +
          `💳 Saldo kas: <b>${formatRupiah(d.balance)}</b>\n` +
          `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>, lalu tekan ACC lagi.`,
        parse_mode: "HTML",
      });
      return;
    }

    let newSaldo;
    try {
      newSaldo = await addUserSaldo(userId, SUB_CLAIM_REWARD);
    } catch (addErr) {
      await addUserSaldo(fundId, SUB_CLAIM_REWARD);
      throw addErr;
    }

    req.status = "acc";
    await saveSubReq(reqId, req);
    await redisCommand(["HSET", REDIS_SUB_CLAIMED_KEY, userId, reqId]);
    await redisCommand(["HDEL", REDIS_SUB_PENDING_KEY, userId]);

    await tgRequest(token, "sendMessage", {
      chat_id: userId,
      text:
        `🎉 <b>Klaim saldo subscribe berhasil!</b>\n` +
        `💰 Saldo masuk: <b>+${formatRupiah(SUB_CLAIM_REWARD)}</b>\n` +
        `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>\n\n` +
        `<i>Saldo ini hanya bisa dipakai belanja di bot.</i>`,
      parse_mode: "HTML",
    });
  } else {
    req.status = "rejected";
    await saveSubReq(reqId, req);
    await redisCommand(["HDEL", REDIS_SUB_PENDING_KEY, userId]);

    await tgRequest(token, "sendMessage", {
      chat_id: userId,
      text:
        "❌ Bukti subscribe kamu belum bisa diterima.\n" +
        "Pastikan screenshot jelas, lalu kirim ulang lewat menu 💰 Saldo & Depo > 🎁 Klaim Saldo Subscribe.",
      parse_mode: "HTML",
    });
  }

  await tgRequest(token, "editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption:
      `${isAcc ? "✅ <b>DI-ACC</b>" : "❌ <b>DITOLAK</b>"} klaim subscribe #${escapeHtml(String(reqId))}\n` +
      `👤 ${escapeHtml(req.name)}${req.username ? ` (@${escapeHtml(req.username)})` : ""}\n` +
      `🆔 <code>${escapeHtml(String(userId))}</code>`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });
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
          { text: "✅ Check-in Harian (+Rp100)", callback_data: "checkin" },
        ],
        [
          { text: "🎡 Spin Gratis Harian", callback_data: "spin_info" },
        ],
        [
          { text: "🎁 Klaim Saldo Subscribe", callback_data: "sub_info" },
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
  const creatorGroups = getCreatorGroups(katalogList.filter(isCategoryEnabled));

  const keyboard = [
    ...(MINI_SET_ENABLED ? [[{ text: `🧩 Mini Set (${miniCount})`, callback_data: "menu_katalog_mini" }]] : []),
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

const LUMINE_ITEMS_PER_PAGE = 8; // jumlah set per halaman katalog Lumine (sama pola dengan bot reseller)

function buildLuminePageNav(prefix, p, totalPages) {
  if (totalPages <= 1) return null;
  const nav = [];
  if (p > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `${prefix}${p - 1}` });
  nav.push({ text: `${p + 1}/${totalPages}`, callback_data: `${prefix}${p}` });
  if (p < totalPages - 1) nav.push({ text: "Berikutnya ➡️", callback_data: `${prefix}${p + 1}` });
  return nav;
}

function buildLumineItemRows(slice, rankMap, defaultIcon) {
  return slice.map((item) => {
    const sold = Number(item.sold) || 0;
    const rank = rankMap[String(item.id)];
    let prefix = defaultIcon;
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
}

async function sendKatalogListByCreator(token, chatId, creatorIdx, page = 0) {
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
  const totalPages = Math.max(1, Math.ceil(group.items.length / LUMINE_ITEMS_PER_PAGE));
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const slice = group.items.slice(p * LUMINE_ITEMS_PER_PAGE, (p + 1) * LUMINE_ITEMS_PER_PAGE);

  const rows = buildLumineItemRows(
    slice,
    rankMap,
    "📸"
  );
  const nav = buildLuminePageNav(`kcr_${creatorIdx}_`, p, totalPages);
  if (nav) rows.push(nav);
  rows.push([
    { text: "👤 Daftar Creator", callback_data: "menu_katalog_creator" },
    { text: "🛍️ Semua Kategori", callback_data: "menu_katalog" },
  ]);

  const hal = totalPages > 1 ? `│ Hal <b>${p + 1}/${totalPages}</b>\n` : "";
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `╭─── 👤 <b>CREATOR: ${escapeHtml(group.name.toUpperCase())}</b> ───\n` +
      `│ Total koleksi: <b>${group.items.length} set</b> (🧩 Mini / 📦 Full)\n` +
      "│ Pilih judul di bawah untuk lihat preview & order 👇\n" +
      hal +
      "╰────────────────────────",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendKatalogListByCategory(token, chatId, kategori, page = 0) {
  const katalogList = await getKatalog();
  const filtered = katalogList.filter((item) => (item.kategori || "mini") === kategori && isCategoryEnabled(item));

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
  const totalPages = Math.max(1, Math.ceil(filtered.length / LUMINE_ITEMS_PER_PAGE));
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const slice = filtered.slice(p * LUMINE_ITEMS_PER_PAGE, (p + 1) * LUMINE_ITEMS_PER_PAGE);

  const rows = buildLumineItemRows(slice, rankMap, "📸");
  const nav = buildLuminePageNav(`kcat_${kategori}_`, p, totalPages);
  if (nav) rows.push(nav);
  rows.push([
    { text: "🔙 Kembali ke Kategori", callback_data: "menu_katalog" },
    { text: "🏠 Menu Utama", callback_data: "menu_home" },
  ]);

  const kategoriLabel = kategori === "full" ? "📦 FULL SET" : "🧩 MINI SET";
  const hal = totalPages > 1 ? `│ Hal <b>${p + 1}/${totalPages}</b> • total ${filtered.length} set\n` : "";
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `╭─── 🛍️ <b>KATALOG ${kategoriLabel}</b> ───\n` +
      "│ Pilih judul di bawah untuk melihat\n" +
      "│ <b>foto preview</b> & bayar via Saldo / QRIS:\n" +
      hal +
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
  const premBlock =
    !statusReseller && RESELLER_PREM_ENABLED
      ? "╭─── 💎 <b>RESELLER PREM</b> ───\n" +
        `│ 💰 Harga: <b>${formatRupiah(RESELLER_PREM_PRICE)}</b>\n` +
        `│ 🎁 Gratis saldo awal: <b>${formatRupiah(RESELLER_PREM_BONUS_SALDO)}</b>\n` +
        "│ ⚡ Aktif otomatis setelah bayar (tanpa chat admin)\n" +
        "╰─────────────────────\n\n"
      : "";

  const keyboardRows = [];
  if (statusReseller) {
    keyboardRows.push([{ text: "📊 Cek Omset Saya", callback_data: "reseller_omset_self" }]);
    if (WD_ENABLED) {
      keyboardRows.push([{ text: "💳 WD Margin", callback_data: "reseller_wd" }]);
    }
  } else {
    if (RESELLER_PREM_ENABLED) {
      keyboardRows.push([
        {
          text: `💎 Beli Reseller Prem ${formatRupiah(RESELLER_PREM_PRICE)} (Gratis Saldo ${formatRupiah(RESELLER_PREM_BONUS_SALDO)})`,
          callback_data: `buy_${RESELLER_PREM_TARGET}`,
        },
      ]);
    }
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
      premBlock +
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

    async function resolvePurchaseTarget(targetKey, userId) {
  if (targetKey === RESELLER_PREM_TARGET) {
    if (!RESELLER_PREM_ENABLED) {
      return { ok: false, error: "⚠️ Reseller Prem sedang tidak tersedia." };
    }
    if (userId && (await isReseller(userId))) {
      return { ok: false, error: "✅ Kamu sudah terdaftar sebagai Reseller. Buka menu 🤝 Reseller untuk cek status & omset." };
    }
    return {
      ok: true,
      itemId: RESELLER_PREM_TARGET,
      itemNama: "💎 Reseller Prem",
      baseNominal: RESELLER_PREM_PRICE,
      targetLink: "",
      targetLinks: [],
      targetFiles: [],
      isMystery: false,
      extra: { is_resprem: true },
    };
  }
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
      ...(target.extra || {}),
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
    ...(MINI_SET_ENABLED ? [[{ text: `🧩 Mini Set (${miniCount})`, callback_data: "rcat_mini_0" }]] : []),
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
  const filtered = items.filter((x) => (kat === "full" ? x.kategori === "full" : x.kategori !== "full") && isCategoryEnabled(x));

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

  // Blacklist & rate limit (pemilik toko dikecualikan)
  if (String(callerId) !== String(ctx.ownerId)) {
    if (await isBanned(callerId)) return;
    const rl = await checkRateLimit(callerId);
    if (rl !== "ok") return;
  }

  // Menu yang sedang tampil diganti, bukan ditumpuk chat baru
  const RB_NAV_NEW = ["rhome", "rbest", "rcara"];
  if (RB_NAV_NEW.includes(data) && messageId) {
    try {
      await tgRequest(ctx.token, "deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch (delErr) {
      console.error("Gagal hapus pesan navigasi bot reseller:", delErr);
    }
  }

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
  if (!isOwner) {
    if (await isBanned(msg.from.id)) return;
    const rl = await checkRateLimit(msg.from.id);
    if (rl === "limit") {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: "⏳ Kamu terlalu sering mengirim pesan. Tunggu sebentar ya.",
      });
      return;
    }
    if (rl === "blocked") return;
  }
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
    if (!(await isReseller(uid)) && !(await isMitra(uid))) {
      await reply("❌ Fitur WD khusus reseller atau mitra.");
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

// ==========================================
// FITUR BARU: RATE LIMIT, BLACKLIST, TIKET BANTUAN, ASISTEN PANDUAN
// ==========================================

// ---- PENGATURAN ----
const RATE_LIMIT_ENABLED = true;
const RATE_LIMIT_MAX = 12; // maks pesan/tombol per jendela waktu
const RATE_LIMIT_WINDOW_SEC = 10; // panjang jendela (detik)
const TIKET_MAX_LEN = 1000; // batas panjang isi tiket
const REDIS_RATE_PREFIX = "lumine_main_rl_";
const REDIS_BLACKLIST_KEY = "lumine_main_blacklist"; // hash: id user -> JSON {alasan, waktu}
const REDIS_TIKET_SEQ_KEY = "lumine_main_tiket_seq";
const REDIS_TIKET_PREFIX = "lumine_main_tiket_"; // key per tiket: JSON
const REDIS_TIKET_USER_KEY = "lumine_main_tiket_user"; // hash: id user -> id tiket yang masih terbuka

// ---- RATE LIMIT ----
// Hitung aksi per user dalam jendela waktu pendek.
// Hasil: "ok" | "limit" (baru melewati batas, kirim peringatan sekali) | "blocked" (diabaikan diam-diam)
// Kalau Redis error, dibiarkan lolos supaya pembeli tidak terblokir karena gangguan teknis.
async function checkRateLimit(userId) {
  if (!RATE_LIMIT_ENABLED || !userId) return "ok";
  try {
    const key = REDIS_RATE_PREFIX + String(userId);
    const count = parseInt(await redisCommand(["INCR", key]), 10) || 0;
    if (count === 1) await redisCommand(["EXPIRE", key, RATE_LIMIT_WINDOW_SEC]);
    if (count === RATE_LIMIT_MAX + 1) return "limit";
    if (count > RATE_LIMIT_MAX + 1) return "blocked";
    return "ok";
  } catch (e) {
    console.error("Rate limit error (dilewati):", e);
    return "ok";
  }
}

// ---- BLACKLIST ----
async function isBanned(userId) {
  if (!userId) return false;
  try {
    return Boolean(await redisCommand(["HGET", REDIS_BLACKLIST_KEY, String(userId)]));
  } catch (e) {
    console.error("Cek blacklist error (dilewati):", e);
    return false;
  }
}

// ---- TIKET BANTUAN ----
async function getTiket(id) {
  const raw = await redisCommand(["GET", REDIS_TIKET_PREFIX + String(id)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveTiket(tiket) {
  await redisCommand(["SET", REDIS_TIKET_PREFIX + tiket.id, JSON.stringify(tiket)]);
}

async function getOpenTiketId(userId) {
  const raw = await redisCommand(["HGET", REDIS_TIKET_USER_KEY, String(userId)]);
  return raw ? String(raw) : null;
}

async function createTiket(from, isi) {
  const id = String(await redisCommand(["INCR", REDIS_TIKET_SEQ_KEY]));
  const waktu = getWibTimestamp();
  const tiket = {
    id,
    user_id: String(from.id),
    nama: from.first_name || "Pembeli",
    username: from.username || "",
    status: "terbuka",
    dibuat: waktu,
    riwayat: [{ dari: "pembeli", isi, waktu }],
  };
  await saveTiket(tiket);
  await redisCommand(["HSET", REDIS_TIKET_USER_KEY, String(from.id), id]);
  return tiket;
}

// Kirim ke admin. Mengembalikan true kalau berhasil.
async function kirimKeAdmin(token, adminChatId, text) {
  const r = await tgRequest(token, "sendMessage", {
    chat_id: adminChatId,
    text,
    parse_mode: "HTML",
  });
  return Boolean(r && r.ok);
}

// Dipanggil saat pembeli mengetik /bantuan [isi]
async function handleBantuan(token, msg, isi) {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const qris = await getQris();
  const adminChatId = qris && qris.admin_chat_id;

  if (!adminChatId) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `Maaf, layanan tiket belum aktif. Hubungi @${ADMIN_USERNAME} langsung 🙏`,
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (!isi) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        "🎫 <b>Bantuan Admin</b>\n\n" +
        "Ketik <code>/bantuan</code> diikuti masalahmu, misalnya:\n" +
        "<code>/bantuan pesanan saya belum masuk, sudah bayar tadi</code>\n\n" +
        "Admin akan membalas lewat bot ini. Untuk panduan cepat, ketik /panduan.",
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const isiAman = isi.slice(0, TIKET_MAX_LEN);
  const namaAman = escapeHtml(msg.from.first_name || "Pembeli");
  const userTag = msg.from.username ? ` (@${escapeHtml(msg.from.username)})` : "";

  // Sudah ada tiket terbuka -> jadikan pesan lanjutan
  const openId = await getOpenTiketId(userId);
  if (openId) {
    const tiket = await getTiket(openId);
    if (tiket && tiket.status === "terbuka") {
      tiket.riwayat.push({ dari: "pembeli", isi: isiAman, waktu: getWibTimestamp() });
      await saveTiket(tiket);

      await kirimKeAdmin(
        token,
        adminChatId,
        `💬 <b>Lanjutan tiket #${tiket.id}</b> dari ${namaAman}${userTag}\n\n` +
          `<i>${escapeHtml(isiAman)}</i>\n\n` +
          `↩️ Balas: <code>/balas ${tiket.id} pesan</code>`
      );
      await tgRequest(token, "sendMessage", {
        chat_id: chatId,
        text: `✅ Pesan lanjutan terkirim ke admin untuk tiket #${tiket.id}.`,
        reply_to_message_id: msg.message_id,
      });
      return;
    }
  }

  // Tiket baru
  const tiket = await createTiket(msg.from, isiAman);
  await kirimKeAdmin(
    token,
    adminChatId,
    `🎫 <b>TIKET BARU #${tiket.id}</b>\n` +
      `👤 ${namaAman}${userTag}\n` +
      `🆔 <code>${userId}</code>\n\n` +
      `<i>${escapeHtml(isiAman)}</i>\n\n` +
      `↩️ Balas: <code>/balas ${tiket.id} pesan</code>\n` +
      `✅ Tutup: <code>/tutuptiket ${tiket.id}</code>`
  );
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `✅ Tiket <b>#${tiket.id}</b> sudah dikirim ke admin.\n` +
      "Balasan admin akan muncul di chat ini. Pesan lanjutan bisa dikirim dengan <code>/bantuan</code> lagi.",
    parse_mode: "HTML",
    reply_to_message_id: msg.message_id,
  });
}

// ---- PERINTAH ADMIN: /ban, /unban, /listban, /balas, /tutuptiket ----
// Mengembalikan true kalau perintah sudah ditangani.
async function handleModerationCommands(token, msg, rawText, isAdmin) {
  const isBanCmd = /^\/(un)?ban(\s|$)/i.test(rawText);
  const isListBan = /^\/listban(\s|$)/i.test(rawText);
  const isBalas = /^\/balas(\s|$)/i.test(rawText);
  const isTutup = /^\/tutuptiket(\s|$)/i.test(rawText);
  if (!isBanCmd && !isListBan && !isBalas && !isTutup) return false;

  // Bukan admin: abaikan diam-diam
  if (!isAdmin) return true;

  const chatId = msg.chat.id;
  const reply = (text) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    });

  // /listban
  if (isListBan) {
    const raw = await redisCommand(["HGETALL", REDIS_BLACKLIST_KEY]);
    const list = Array.isArray(raw) ? raw : [];
    if (!list.length) {
      await reply("Daftar blacklist kosong.");
      return true;
    }
    let out = "🚫 <b>Daftar Blacklist</b>\n";
    for (let i = 0; i < list.length; i += 2) {
      let alasan = "";
      try {
        alasan = JSON.parse(list[i + 1]).alasan || "";
      } catch {}
      out += `\n• <code>${list[i]}</code>${alasan ? " — " + escapeHtml(alasan) : ""}`;
    }
    await reply(out);
    return true;
  }

  // /ban ID [alasan]  dan  /unban ID
  if (isBanCmd) {
    const unban = /^\/unban/i.test(rawText);
    const args = rawText.replace(/^\/(un)?ban\s*/i, "").trim();
    const [targetUid, ...rest] = args.split(/\s+/);
    if (!targetUid || !/^\d{5,15}$/.test(targetUid)) {
      await reply(
        "Format: <code>/ban ID_NUMERIK [alasan]</code>\n" +
          "Atau <code>/unban ID_NUMERIK</code>\n" +
          "ID adalah ID numerik Telegram pembeli."
      );
      return true;
    }

    if (unban) {
      await redisCommand(["HDEL", REDIS_BLACKLIST_KEY, targetUid]);
      await reply(`✅ <code>${targetUid}</code> sudah dibuka blokirnya.`);
      return true;
    }

    // Admin tidak boleh diblokir
    const pinned = await redisCommand(["GET", REDIS_ADMIN_ID_KEY]);
    if (ADMIN_IDS.includes(targetUid) || String(pinned) === targetUid) {
      await reply("❌ Akun admin tidak bisa diblokir.");
      return true;
    }

    const alasan = rest.join(" ").slice(0, 200);
    await redisCommand([
      "HSET",
      REDIS_BLACKLIST_KEY,
      targetUid,
      JSON.stringify({ alasan, waktu: getWibTimestamp() }),
    ]);
    await reply(
      `🚫 <code>${targetUid}</code> diblokir dari bot.` +
        (alasan ? `\nAlasan: ${escapeHtml(alasan)}` : "")
    );
    return true;
  }

  // /balas ID_TIKET pesan
  if (isBalas) {
    const m = /^\/balas\s+(\d+)\s+([\s\S]+)$/i.exec(rawText);
    if (!m) {
      await reply("Format: <code>/balas ID_TIKET pesan</code>");
      return true;
    }
    const tiket = await getTiket(m[1]);
    if (!tiket) {
      await reply("Tiket tidak ditemukan.");
      return true;
    }
    if (tiket.status !== "terbuka") {
      await reply(`Tiket #${tiket.id} sudah ditutup.`);
      return true;
    }

    const balasan = m[2].trim().slice(0, TIKET_MAX_LEN);
    tiket.riwayat.push({ dari: "admin", isi: balasan, waktu: getWibTimestamp() });
    await saveTiket(tiket);

    const r = await tgRequest(token, "sendMessage", {
      chat_id: tiket.user_id,
      text:
        `💬 <b>Balasan admin (tiket #${tiket.id})</b>\n\n${escapeHtml(balasan)}\n\n` +
        "Masih ada kendala? Ketik <code>/bantuan</code> lalu tulis pesanmu.",
      parse_mode: "HTML",
    });
    if (r && r.ok) {
      await reply(`✅ Balasan terkirim ke tiket #${tiket.id}.`);
    } else {
      await reply(`⚠️ Balasan tersimpan, tapi gagal dikirim ke pembeli (mungkin bot diblokir).`);
    }
    return true;
  }

  // /tutuptiket ID_TIKET
  if (isTutup) {
    const id = rawText.replace(/^\/tutuptiket\s*/i, "").trim();
    const tiket = /^\d+$/.test(id) ? await getTiket(id) : null;
    if (!tiket) {
      await reply("Tiket tidak ditemukan.");
      return true;
    }
    tiket.status = "ditutup";
    await saveTiket(tiket);

    const openId = await getOpenTiketId(tiket.user_id);
    if (openId === tiket.id) {
      await redisCommand(["HDEL", REDIS_TIKET_USER_KEY, tiket.user_id]);
    }

    await tgRequest(token, "sendMessage", {
      chat_id: tiket.user_id,
      text: `✅ Tiket #${tiket.id} sudah ditutup. Terima kasih! Butuh bantuan lagi? Ketik /bantuan.`,
    });
    await reply(`✅ Tiket #${tiket.id} ditutup.`);
    return true;
  }

  return false;
}

// ---- ASISTEN PANDUAN (MENU BERTINGKAT DENGAN TOMBOL) ----
// Format tiap baris tombol: [label, kunci_node]
const PANDUAN_TREE = {
  root: {
    text:
      "👋 <b>Asisten Panduan Lumine Photopack</b>\n\n" +
      "Pilih topik yang ingin kamu tanyakan:",
    buttons: [
      [["🛍️ Cara Beli", "beli"], ["💳 Pembayaran", "bayar"]],
      [["💰 Saldo & Deposit", "saldo"], ["⏳ Pesanan Belum Masuk", "belum"]],
      [["💬 Hubungi Admin", "admin"]],
    ],
  },
  beli: {
    text:
      "🛍️ <b>Cara Beli (4 langkah)</b>\n\n" +
      "1️⃣ Buka <b>🛍️ Katalog</b>\n" +
      "2️⃣ Pilih set yang kamu mau, lalu tekan <b>💳 Beli Set Ini</b>\n" +
      "3️⃣ Pilih cara bayar: <b>Saldo</b> atau <b>QRIS</b>\n" +
      "4️⃣ File dikirim otomatis setelah pembayaran diterima. Semua file juga tersimpan di <b>🎒 Koleksi Saya</b>.\n\n" +
      "Mau tahu detail cara bayar? Pilih di bawah:",
    buttons: [[["💳 Bayar pakai Saldo", "beli_saldo"], ["📲 Bayar pakai QRIS", "beli_qris"]]],
  },
  beli_saldo: {
    text:
      "💳 <b>Bayar pakai Saldo</b>\n\n" +
      "• Isi saldo dulu lewat <b>💰 Saldo & Depo</b>.\n" +
      "• Saat checkout, pilih <b>Saldo</b>. Tidak perlu kode unik, cukup sekali klik.\n" +
      "• Kalau saldo belum cukup, bot akan memberi tahu. Tambah saldo, lalu coba lagi.",
    buttons: [],
  },
  beli_qris: {
    text:
      "📲 <b>Bayar pakai QRIS</b>\n\n" +
      "• Pilih <b>QRIS</b> saat checkout.\n" +
      "• Transfer <b>tepat sampai digit terakhir</b>, termasuk kode unik di nominal itu.\n" +
      "• Pembayaran dicocokkan otomatis, lalu file langsung dikirim.\n" +
      "• Jangan dibulatkan atau dikurangi, karena pembayaran tidak akan terdeteksi.",
    buttons: [],
  },
  bayar: {
    text:
      "💳 <b>Pembayaran</b>\n\n" +
      "• Bayar QRIS <b>tepat sesuai nominal</b> yang tertera, termasuk kode unik. " +
      "Kode unik dipakai untuk mencocokkan pembayaranmu.\n" +
      "• Pembayaran pakai Saldo langsung diproses.",
    buttons: [],
  },
  saldo: {
    text:
      "💰 <b>Saldo & Deposit</b>\n\n" +
      "• Isi saldo lewat menu 💰 Saldo & Depo.\n" +
      "• Check-in harian bisa menambah saldo, dan spin harian dibuka setelah check-in.",
    buttons: [],
  },
  belum: {
    text:
      "⏳ <b>Pesanan Belum Masuk</b>\n\n" +
      "Setelah bayar, tunggu sebentar. Kalau pesanan belum masuk juga, " +
      "ketik <code>/bantuan</code> lalu sertakan nama set dan jam bayarmu. Admin akan membantu.",
    buttons: [[["🎫 Cara Kirim Bantuan", "admin"]]],
  },
  admin: {
    text:
      "💬 <b>Hubungi Admin</b>\n\n" +
      "Ketik <code>/bantuan</code> diikuti masalahmu. Admin akan membalas lewat bot ini.",
    buttons: [],
  },
};

function buildPanduanMarkup(nodeKey) {
  const node = PANDUAN_TREE[nodeKey] || PANDUAN_TREE.root;
  const rows = [...node.buttons];
  if (nodeKey !== "root") rows.push([["🔙 Kembali", "root"]]);
  return {
    inline_keyboard: rows.map((row) =>
      row.map(([label, key]) => ({ text: label, callback_data: `guide:${key}` }))
    ),
  };
}

// Tampilkan node panduan. Kalau messageId ada (dari tombol), pesan diedit; kalau tidak, kirim baru.
async function sendPanduan(token, chatId, nodeKey, messageId) {
  const key = PANDUAN_TREE[nodeKey] ? nodeKey : "root";
  const payload = {
    chat_id: chatId,
    text: PANDUAN_TREE[key].text,
    parse_mode: "HTML",
    reply_markup: buildPanduanMarkup(key),
  };
  if (messageId) {
    return tgRequest(token, "editMessageText", { ...payload, message_id: messageId });
  }
  return tgRequest(token, "sendMessage", payload);
}

// ==========================================
// FITUR BARU: WISHLIST + NOTIFIKASI (HARGA TURUN, HABIS, KEMBALI TERSEDIA)
// ==========================================

const WL_MAX_ITEMS = 20; // maks set per wishlist
const REDIS_WL_USER_PREFIX = "lumine_main_wl_u_"; // hash per user: id set -> JSON {nama, harga, out}
const REDIS_WL_ITEM_PREFIX = "lumine_main_wl_i_"; // set per set-katalog: id user yang memantau

// Ambil seluruh wishlist user: { id: {nama, harga, out} }
async function getWishlist(userId) {
  const raw = await redisCommand(["HGETALL", REDIS_WL_USER_PREFIX + String(userId)]);
  const out = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try {
        out[raw[i]] = JSON.parse(raw[i + 1]);
      } catch {}
    }
  }
  return out;
}

async function isInWishlist(userId, itemId) {
  const res = await redisCommand(["HEXISTS", REDIS_WL_USER_PREFIX + String(userId), String(itemId)]);
  return Number(res) === 1;
}

// Tambah atau hapus dari wishlist. Hasil: true (ditambah), false (dihapus), "penuh"
async function toggleWishlist(userId, item) {
  const uKey = REDIS_WL_USER_PREFIX + String(userId);
  const iKey = REDIS_WL_ITEM_PREFIX + String(item.id);

  if (await isInWishlist(userId, item.id)) {
    await redisCommand(["HDEL", uKey, String(item.id)]);
    await redisCommand(["SREM", iKey, String(userId)]);
    return false;
  }

  const current = Object.keys(await getWishlist(userId)).length;
  if (current >= WL_MAX_ITEMS) return "penuh";

  await redisCommand([
    "HSET",
    uKey,
    String(item.id),
    JSON.stringify({ nama: item.nama, harga: item.harga, out: false }),
  ]);
  await redisCommand(["SADD", iKey, String(userId)]);
  return true;
}

async function removeFromWishlist(userId, itemId) {
  await redisCommand(["HDEL", REDIS_WL_USER_PREFIX + String(userId), String(itemId)]);
  await redisCommand(["SREM", REDIS_WL_ITEM_PREFIX + String(itemId), String(userId)]);
}

// Tombol wishlist di halaman detail produk
function buildWishlistButton(inWishlist, itemId) {
  return {
    text: inWishlist ? "💔 Hapus dari Wishlist" : "⭐ Simpan ke Wishlist",
    callback_data: `wl_${itemId}`,
  };
}

// Dipanggil saat tombol wishlist ditekan di halaman detail
async function handleWishlistToggle(token, chatId, messageId, userId, itemId) {
  const katalog = await getKatalog();
  const item = katalog.find((k) => String(k.id) === String(itemId));
  if (!item) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Set ini sudah tidak tersedia, jadi tidak bisa diubah dari wishlist.",
    });
    return;
  }

  const result = await toggleWishlist(userId, item);
  if (result === "penuh") {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `Wishlist kamu sudah penuh (maks ${WL_MAX_ITEMS} set). Hapus salah satu dulu lewat /wishlist.`,
    });
    return;
  }

  // Perbarui tombol di halaman detail tanpa mengirim ulang pesan
  const wlRow = [buildWishlistButton(result, item.id)];
  await tgRequest(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: `💳 Beli Set Ini (${item.harga})`, callback_data: `buy_${item.id}` }],
        wlRow,
        [{ text: "🔙 Kembali ke Katalog", callback_data: "menu_katalog" }],
      ],
    },
  });

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: result
      ? `⭐ <b>${escapeHtml(item.nama)}</b> disimpan ke wishlist. Kamu akan dikabari kalau harganya turun atau stoknya kembali.`
      : `Dihapus dari wishlist.`,
    parse_mode: "HTML",
  });
}

// Daftar wishlist user, lengkap dengan status tersedia atau tidak
async function sendWishlist(token, chatId, userId) {
  const wl = await getWishlist(userId);
  const ids = Object.keys(wl);

  if (!ids.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        "⭐ <b>Wishlist kamu masih kosong</b>\n\n" +
        "Buka set di katalog, lalu tekan ⭐ Simpan ke Wishlist.",
      parse_mode: "HTML",
    });
    return;
  }

  const katalog = await getKatalog();
  const aktif = new Set(katalog.map((k) => String(k.id)));

  let text = `⭐ <b>Wishlist Kamu</b> (${ids.length}/${WL_MAX_ITEMS})\n\n`;
  const rows = [];
  for (const id of ids) {
    const w = wl[id];
    const tersedia = aktif.has(id);
    text += `• ${escapeHtml(w.nama)} — ${escapeHtml(w.harga)} ${tersedia ? "✅" : "⏸ belum tersedia"}\n`;
    const row = [];
    if (tersedia) row.push({ text: `🛍️ ${String(w.nama).slice(0, 25)}`, callback_data: `detail_${id}` });
    row.push({ text: "🗑 Hapus", callback_data: `wlr_${id}` });
    rows.push(row);
  }

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

// Dipanggil dari saveKatalog: bandingkan katalog lama dan baru, lalu kabari pemantau yang relevan
async function notifyWishlistChanges(before, after) {
  const token = process.env.BOT_TOKEN;
  const beforeMap = new Map(before.map((i) => [String(i.id), i]));
  const afterMap = new Map(after.map((i) => [String(i.id), i]));
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const id of allIds) {
    const subs = await redisCommand(["SMEMBERS", REDIS_WL_ITEM_PREFIX + id]);
    if (!Array.isArray(subs) || !subs.length) continue;

    const was = beforeMap.get(id);
    const now = afterMap.get(id);

    for (const uid of subs) {
      const uKey = REDIS_WL_USER_PREFIX + String(uid);
      const raw = await redisCommand(["HGET", uKey, id]);
      if (!raw) continue;

      let w;
      try {
        w = JSON.parse(raw);
      } catch {
        continue;
      }

      let changed = false;

      if (was && !now) {
        // Hilang dari katalog: sekali kabari, lalu tandai
        if (!w.out) {
          w.out = true;
          changed = true;
          await tgRequest(token, "sendMessage", {
            chat_id: uid,
            parse_mode: "HTML",
            text: `⏸ <b>${escapeHtml(w.nama)}</b> di wishlistmu sedang tidak tersedia. Kami kabari saat kembali.`,
          });
        }
      } else if (!was && now) {
        // Kembali tersedia (restock)
        if (w.out) {
          await tgRequest(token, "sendMessage", {
            chat_id: uid,
            parse_mode: "HTML",
            text: `🔔 <b>${escapeHtml(now.nama)}</b> sudah tersedia lagi!\n💲 Harga: <code>${escapeHtml(now.harga)}</code>`,
            reply_markup: {
              inline_keyboard: [[{ text: "🛍️ Lihat Set Ini", callback_data: `detail_${id}` }]],
            },
          });
        }
        w.out = false;
        w.nama = now.nama;
        w.harga = now.harga;
        changed = true;
      } else if (was && now) {
        // Masih ada: cek penurunan harga
        const hargaLama = parseNominal(w.harga);
        const hargaBaru = parseNominal(now.harga);
        if (hargaBaru < hargaLama) {
          await tgRequest(token, "sendMessage", {
            chat_id: uid,
            parse_mode: "HTML",
            text:
              `💸 <b>Harga turun!</b>\n` +
              `<b>${escapeHtml(now.nama)}</b>: <s>${escapeHtml(w.harga)}</s> ➜ <code>${escapeHtml(now.harga)}</code>`,
            reply_markup: {
              inline_keyboard: [[{ text: "🛍️ Lihat Set Ini", callback_data: `detail_${id}` }]],
            },
          });
        }
        if (w.harga !== now.harga || w.nama !== now.nama) {
          w.harga = now.harga;
          w.nama = now.nama;
          changed = true;
        }
      }

      if (changed) {
        await redisCommand(["HSET", uKey, id, JSON.stringify(w)]);
      }
    }
  }
}

// ==========================================
// RINGKASAN HARIAN (VERSI 2) + OMSET HARIAN + REWARD ULASAN
// ==========================================
const SUMMARY_ENABLED = true;
const SUMMARY_HOUR_WIB = 7; // ringkasan dikirim di update pertama setelah jam ini (WIB)
const REDIS_SUMMARY_LAST_KEY = "lumine_main_summary_last";
const REVIEW_REWARD_SALDO = 500; // saldo untuk pembeli yang memberi ulasan (sekali per order)
const REDIS_REVIEW_REWARD_KEY = "lumine_main_review_reward"; // hash: id order -> id user

// Tanggal WIB dalam format YYYY-MM-DD untuk timestamp (ms) tertentu
function wibDayKey(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Tambah omset ke total dan ke penghitung harian
async function addStoreOmset(nominal) {
  const amount = Math.round(Number(nominal) || 0);
  const dayKey = "lumine_main_omset_day_" + wibDayKey(Date.now());
  await Promise.all([
    redisCommand(["INCRBY", REDIS_STORE_OMSET_KEY, amount]),
    redisCommand(["INCR", REDIS_STORE_OMSET_CNT_KEY]),
    redisCommand(["HINCRBY", dayKey, "rupiah", amount]),
    redisCommand(["HINCRBY", dayKey, "count", 1]),
  ]);
  await redisCommand(["EXPIRE", dayKey, 60 * 60 * 24 * 90]);
}

async function getDailyOmset(dayKey) {
  const raw = await redisCommand(["HGETALL", "lumine_main_omset_day_" + dayKey]);
  const map = {};
  if (Array.isArray(raw)) for (let i = 0; i < raw.length; i += 2) map[raw[i]] = raw[i + 1];
  return { rupiah: parseInt(map.rupiah, 10) || 0, count: parseInt(map.count, 10) || 0 };
}

// Ringkasan harian untuk admin: dikirim sekali sehari, berisi data kemarin dan antrean hari ini
async function maybeSendDailySummary(token) {
  if (!SUMMARY_ENABLED) return;
  const now = Date.now();
  const wib = new Date(now + 7 * 3600 * 1000);
  if (wib.getUTCHours() < SUMMARY_HOUR_WIB) return;

  const todayKey = wibDayKey(now);
  const yesterdayKey = wibDayKey(now - 86400000);
  const last = await redisCommand(["GET", REDIS_SUMMARY_LAST_KEY]);
  if (last === todayKey) return;
  await redisCommand(["SET", REDIS_SUMMARY_LAST_KEY, todayKey]);

  const qris = await getQris();
  const adminChatId = qris && qris.admin_chat_id;
  if (!adminChatId) return;

  const [pendingOrder, pendingSub, pendingWd, harian, omset, users, resellers] = await Promise.all([
    redisCommand(["HLEN", REDIS_PENDING_MAP_KEY]),
    redisCommand(["HLEN", REDIS_SUB_PENDING_KEY]),
    redisCommand(["HLEN", REDIS_WD_PENDING_KEY]),
    getDailyOmset(yesterdayKey),
    getStoreOmset(),
    redisCommand(["SCARD", REDIS_USERS_KEY]),
    redisCommand(["HLEN", REDIS_RESELLER_KEY]),
  ]);

  const antrean = (Number(pendingOrder) || 0) + (Number(pendingSub) || 0) + (Number(pendingWd) || 0);
  const text =
    `☀️ <b>RINGKASAN HARIAN</b>\n` +
    `📅 Data kemarin: ${escapeHtml(yesterdayKey)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Omset kemarin : <code>${formatRupiah(harian.rupiah)}</code> (${harian.count} transaksi)\n` +
    `💼 Total omset : <code>${formatRupiah(omset.rupiah)}</code>\n` +
    `👥 Total pembeli : <b>${Number(users) || 0}</b>\n` +
    `🤝 Total reseller : <b>${Number(resellers) || 0}</b>\n\n` +
    `📋 <b>Antrean yang perlu dicek</b>\n` +
    `• Order pending : <b>${Number(pendingOrder) || 0}</b>\n` +
    `• Klaim subscribe : <b>${Number(pendingSub) || 0}</b>\n` +
    `• Penarikan (WD) : <b>${Number(pendingWd) || 0}</b>\n` +
    (antrean > 0 ? `\nAda ${antrean} antrean menunggu. 💪` : `\nTidak ada antrean. ✅`);

  await tgRequest(token, "sendMessage", { chat_id: adminChatId, text, parse_mode: "HTML" });
}

// Reward saldo untuk ulasan, hanya sekali per order
async function rewardReview(token, chatId, userId, orderId) {
  if (!REVIEW_REWARD_SALDO || !orderId) return;
  const added = await redisCommand(["HSETNX", REDIS_REVIEW_REWARD_KEY, String(orderId), String(userId)]);
  if (Number(added) !== 1) return;
  await addUserSaldo(userId, REVIEW_REWARD_SALDO);
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🎁 Makasih sudah mengulas! Saldo <code>${formatRupiah(REVIEW_REWARD_SALDO)}</code> ` +
      `sudah masuk ke akunmu dan bisa dipakai untuk belanja berikutnya 💜`,
  });
}

// ==========================================
// PROGRAM MITRA: BAGI LINK, DAPAT KOMISI (BISA DI-WD)
// ==========================================
const MITRA_ENABLED = true;
const MITRA_COMMISSION_PERCENT = 5; // komisi dari nominal yang dibayar pembeli (setelah diskon)
const MITRA_MONTHLY_CAP = 100000; // batas komisi per mitra per bulan (Rp)
const REDIS_MITRA_CODE_KEY = "lumine_main_mitra_code"; // hash: kode -> id user
const REDIS_MITRA_USER_KEY = "lumine_main_mitra_user"; // hash: id user -> kode
const REDIS_MITRA_REF_KEY = "lumine_main_mitra_ref"; // hash: id pembeli -> kode (hanya pembeli baru)
const REDIS_MITRA_BUYERS_PREFIX = "lumine_main_mitra_buyers_"; // hash per kode: id pembeli -> 1
const REDIS_MITRA_PAID_KEY = "lumine_main_mitra_paid"; // hash: id order -> id mitra (komisi sekali per order)
const REDIS_MITRA_MONTH_PREFIX = "lumine_main_mitra_month_"; // hash per bulan: id mitra -> total komisi

async function getMitraCode(uid) {
  const c = await redisCommand(["HGET", REDIS_MITRA_USER_KEY, String(uid)]);
  return c ? String(c) : null;
}

async function isMitra(uid) {
  return Boolean(await getMitraCode(uid));
}

function wibMonthKey() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function sendMitraInfo(token, chatId, uid) {
  const code = await getMitraCode(uid);
  const me = await tgRequest(token, "getMe", {});
  const uname = (me && me.result && me.result.username) || "";
  const buyers = await redisCommand(["HLEN", REDIS_MITRA_BUYERS_PREFIX + code]);
  const m = await getResellerMargin(uid);
  const link = `https://t.me/${uname}?start=m_${code}`;
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🤝 <b>Program Mitra</b>\n\n` +
      `Link kamu:\n<code>${link}</code>\n\n` +
      `Setiap pembeli baru yang datang lewat link ini dan membayar pakai QRIS, ` +
      `kamu dapat komisi <b>${MITRA_COMMISSION_PERCENT}%</b> dari nominal yang dibayar.\n\n` +
      `👥 Pembeli dari link kamu : <b>${Number(buyers) || 0}</b>\n` +
      `💰 Total komisi : <code>${formatRupiah(m.earned)}</code>\n` +
      `💳 Bisa ditarik : <code>${formatRupiah(m.available)}</code>\n\n` +
      `Tarik komisi lewat bot ini: <code>/wd NOMINAL TUJUAN</code>`,
  });
}

// /daftarmitra KODE
async function registerMitra(token, msg, kodeRaw) {
  const chatId = msg.chat.id;
  const uid = String(msg.from.id);
  const reply = (text) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    });

  if (!MITRA_ENABLED) return reply("Program mitra sedang tidak dibuka.");
  if (msg.chat.type !== "private") return reply("Daftar mitra lewat chat pribadi dengan bot ya.");
  if (await isMitra(uid)) return sendMitraInfo(token, chatId, uid);

  const kode = String(kodeRaw || "").trim().toLowerCase();
  if (!/^[a-z0-9]{3,16}$/.test(kode)) {
    return reply(
      "Format: <code>/daftarmitra KODE</code>\n" +
        "Kode 3 sampai 16 huruf atau angka, tanpa spasi.\n" +
        "Contoh: <code>/daftarmitra kiko99</code>"
    );
  }

  const ok = await redisCommand(["HSETNX", REDIS_MITRA_CODE_KEY, kode, uid]);
  if (Number(ok) !== 1) return reply("Kode itu sudah dipakai orang lain. Coba kode lain ya.");
  await redisCommand(["HSET", REDIS_MITRA_USER_KEY, uid, kode]);

  await reply("🎉 Selamat, kamu sudah jadi mitra!");
  await sendMitraInfo(token, chatId, uid);
}

// Dipanggil saat pembeli baru masuk lewat link mitra (/start m_KODE)
async function recordMitraReferral(buyerId, codeRaw, isNewUser) {
  if (!MITRA_ENABLED || !isNewUser) return;
  const code = String(codeRaw || "").toLowerCase();
  const owner = await redisCommand(["HGET", REDIS_MITRA_CODE_KEY, code]);
  if (!owner || String(owner) === String(buyerId)) return; // kode tidak ada, atau pakai link sendiri
  const set = await redisCommand(["HSETNX", REDIS_MITRA_REF_KEY, String(buyerId), code]);
  if (Number(set) !== 1) return; // sudah tercatat dari mitra lain
  await redisCommand(["HSET", REDIS_MITRA_BUYERS_PREFIX + code, String(buyerId), "1"]);
}

// Dipanggil setelah order di-ACC: hitung komisi mitra (hanya pembayaran uang asli)
async function maybeRewardMitra(token, order) {
  if (!MITRA_ENABLED || !order || order.rbot_owner || order.is_deposit) return;
  if (order.paid_with_saldo) return;

  const buyerId = String(order.buyer_id);
  const code = await redisCommand(["HGET", REDIS_MITRA_REF_KEY, buyerId]);
  if (!code) return;
  const mitraId = await redisCommand(["HGET", REDIS_MITRA_CODE_KEY, String(code)]);
  if (!mitraId || String(mitraId) === buyerId) return; // tidak boleh komisi dari pembelian sendiri

  const paid = Number(order.final_base_nominal || order.base_nominal) || 0;
  const commission = Math.floor((paid * MITRA_COMMISSION_PERCENT) / 100);
  if (commission <= 0) return;

  // Sekali per order, aman walau ACC terpanggil dua kali
  const first = await redisCommand(["HSETNX", REDIS_MITRA_PAID_KEY, String(order.id), String(mitraId)]);
  if (Number(first) !== 1) return;

  // Batas komisi bulanan
  const monthKey = REDIS_MITRA_MONTH_PREFIX + wibMonthKey();
  const used = parseInt(await redisCommand(["HGET", monthKey, String(mitraId)]), 10) || 0;
  const give = Math.min(commission, Math.max(0, MITRA_MONTHLY_CAP - used));
  if (give <= 0) return;

  await redisCommand(["HINCRBY", monthKey, String(mitraId), give]);
  await redisCommand(["EXPIRE", monthKey, 60 * 60 * 24 * 400]);
  // Masuk ke ledger margin yang sama dengan reseller, jadi bisa di-WD lewat /wd
  await redisCommand(["HINCRBY", REDIS_RBOT_MARGIN_KEY, String(mitraId), give]);

  const m = await getResellerMargin(mitraId);
  await tgRequest(token, "sendMessage", {
    chat_id: mitraId,
    parse_mode: "HTML",
    text:
      `💸 <b>Ada penjualan dari linkmu!</b>\n\n` +
      `Komisi masuk: <code>+${formatRupiah(give)}</code>\n` +
      `💳 Bisa ditarik sekarang: <code>${formatRupiah(m.available)}</code>\n\n` +
      `Tarik lewat bot: <code>/wd NOMINAL TUJUAN</code>`,
  });
}

// Admin: /cabutmitra ID_USER
async function removeMitra(token, uid) {
  const code = await getMitraCode(uid);
  if (!code) return false;
  await redisCommand(["HDEL", REDIS_MITRA_CODE_KEY, code]);
  await redisCommand(["HDEL", REDIS_MITRA_USER_KEY, String(uid)]);
  return true;
}

// ==========================================
// HADIAH MITRA TERBAIK BULANAN (SALDO, ADA MINIMAL KOMISI)
// ==========================================
const MITRA_TOP_ENABLED = true;
const MITRA_TOP_REWARD = [10000, 5000, 3000]; // saldo untuk peringkat 1, 2, 3
const MITRA_TOP_MIN_KOMISI = 20000; // minimal komisi bulan itu agar berhak dapat hadiah (Rp)
const REDIS_MITRA_TOP_LOCK_PREFIX = "lumine_main_mitra_top_"; // kunci anti-dobel per bulan

function prevMonthKeyWib() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Jalan di update pertama setelah pergantian bulan, sekali per bulan
async function maybeAwardMitraTop(token) {
  if (!MITRA_TOP_ENABLED) return;
  const monthKey = prevMonthKeyWib();
  const locked = await redisCommand([
    "SET",
    REDIS_MITRA_TOP_LOCK_PREFIX + monthKey,
    "1",
    "NX",
    "EX",
    String(60 * 60 * 24 * 400),
  ]);
  if (!locked) return;

  const raw = await redisCommand(["HGETALL", REDIS_MITRA_MONTH_PREFIX + monthKey]);
  const entries = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ uid: String(raw[i]), total: parseInt(raw[i + 1], 10) || 0 });
    }
  }
  const winners = entries
    .filter((e) => e.total >= MITRA_TOP_MIN_KOMISI)
    .sort((a, b) => b.total - a.total)
    .slice(0, MITRA_TOP_REWARD.length);

  if (!winners.length) return;

  const medals = ["🥇", "🥈", "🥉"];
  const lines = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const hadiah = MITRA_TOP_REWARD[i];
    await addUserSaldo(w.uid, hadiah);
    lines.push(`${medals[i]} <code>${w.uid}</code> — komisi ${formatRupiah(w.total)} ➜ +${formatRupiah(hadiah)}`);
    await tgRequest(token, "sendMessage", {
      chat_id: w.uid,
      parse_mode: "HTML",
      text:
        `🏆 <b>Selamat! Kamu Mitra Terbaik ${medals[i]} bulan ${escapeHtml(monthKey)}</b>\n\n` +
        `Total komisimu: <code>${formatRupiah(w.total)}</code>\n` +
        `🎁 Bonus saldo: <code>+${formatRupiah(hadiah)}</code>\n\n` +
        `Terus share linkmu ya! 💜`,
    });
  }

  const qris = await getQris();
  if (qris && qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: qris.admin_chat_id,
      parse_mode: "HTML",
      text:
        `🏆 <b>Hadiah Mitra Terbaik ${escapeHtml(monthKey)}</b>\n` +
        `Minimal komisi: ${formatRupiah(MITRA_TOP_MIN_KOMISI)}\n\n` +
        lines.join("\n"),
    });
  }
}

// ==========================================
// WIN-BACK: PEMBELI YANG LAMA TIDAK BELANJA DAPAT SALDO UNTUK KEMBALI
// ==========================================
const WINBACK_ENABLED = true;
const WINBACK_DAYS = 30; // dianggap tidak aktif setelah sekian hari tanpa belanja
const WINBACK_SALDO = 2000; // saldo hadiah (hanya bisa dipakai belanja di toko)
const WINBACK_PER_RUN = 25; // batas kirim per hari, supaya tidak kena batas Telegram
const REDIS_LASTBUY_KEY = "lumine_main_lastbuy"; // hash: id user -> timestamp (ms) pembelian terakhir
const REDIS_WINBACK_SENT_KEY = "lumine_main_winback_sent"; // hash: id user -> timestamp (ms) terakhir ditawari
const REDIS_WINBACK_DAY_KEY = "lumine_main_winback_day";

// Dipanggil saat order berhasil di-ACC (bukan deposit)
async function recordLastBuy(buyerId) {
  await redisCommand(["HSET", REDIS_LASTBUY_KEY, String(buyerId), String(Date.now())]);
}

// Jalan sekali sehari, setelah jam 10 WIB
async function maybeWinBack(token) {
  if (!WINBACK_ENABLED) return;
  const now = Date.now();
  const wib = new Date(now + 7 * 3600 * 1000);
  if (wib.getUTCHours() < 10) return;

  const todayKey = wibDayKey(now);
  if ((await redisCommand(["GET", REDIS_WINBACK_DAY_KEY])) === todayKey) return;
  await redisCommand(["SET", REDIS_WINBACK_DAY_KEY, todayKey]);

  const [lastRaw, sentRaw, users, bannedRaw] = await Promise.all([
    redisCommand(["HGETALL", REDIS_LASTBUY_KEY]),
    redisCommand(["HGETALL", REDIS_WINBACK_SENT_KEY]),
    redisCommand(["SMEMBERS", REDIS_USERS_KEY]),
    redisCommand(["HKEYS", REDIS_BLACKLIST_KEY]),
  ]);
  const toMap = (raw) => {
    const m = {};
    if (Array.isArray(raw)) for (let i = 0; i < raw.length; i += 2) m[String(raw[i])] = Number(raw[i + 1]) || 0;
    return m;
  };
  const lastBuy = toMap(lastRaw);
  const sentAt = toMap(sentRaw);
  const banned = new Set((Array.isArray(bannedRaw) ? bannedRaw : []).map(String));
  const cutoff = now - WINBACK_DAYS * 86400000;

  let sent = 0;
  for (const uid of (Array.isArray(users) ? users : []).map(String)) {
    if (sent >= WINBACK_PER_RUN) break;
    if (banned.has(uid)) continue;
    const last = lastBuy[uid] || 0;
    if (!last || last > cutoff) continue; // belum pernah beli, atau masih aktif
    if ((sentAt[uid] || 0) > last) continue; // sudah ditawari setelah pembelian terakhirnya

    const r = await tgRequest(token, "sendMessage", {
      chat_id: uid,
      parse_mode: "HTML",
      text:
        `🎁 <b>Kangen nih!</b>\n\n` +
        `Sudah ${WINBACK_DAYS} hari kamu belum mampir. Kami kasih saldo ` +
        `<code>${formatRupiah(WINBACK_SALDO)}</code> buat belanja lagi.\n\n` +
        `Cek set terbaru di 🛍️ Katalog 💜`,
      reply_markup: { inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]] },
    });
    if (!r || !r.ok) continue; // bot diblokir atau gagal kirim: saldo tidak diberikan

    await addUserSaldo(uid, WINBACK_SALDO);
    await redisCommand(["HSET", REDIS_WINBACK_SENT_KEY, uid, String(now)]);
    sent++;
  }
  if (sent > 0) console.log(`Win-back terkirim: ${sent} pembeli`);
}

// ==========================================
// BACKUP PENUH: SEMUA DATA BOT (PENGGUNA, SALDO, ORDER, RESELLER, MITRA, DLL)
// ==========================================
const FULLBACKUP_ENABLED = true;
const FULLBACKUP_HOUR_WIB = 3; // backup otomatis dikirim di update pertama setelah jam ini (WIB)
const REDIS_FULLBACKUP_DAY_KEY = "lumine_main_fullbackup_day";
const BACKUP_KEY_PREFIX = "lumine_main_";
// Kunci sementara yang tidak perlu dicadangkan (rate limit, kunci proses)
const BACKUP_SKIP_RE = /_rl_|_lock_|_lock$|_day$|_last$/;

// Ambil seluruh data bot dari Redis
async function dumpAllRedis() {
  const keys = new Set();
  let cursor = "0";
  do {
    const res = await redisCommand(["SCAN", cursor, "MATCH", `${BACKUP_KEY_PREFIX}*`, "COUNT", "500"]);
    cursor = String(res[0]);
    for (const k of res[1] || []) keys.add(String(k));
  } while (cursor !== "0");

  const data = {};
  for (const key of keys) {
    if (BACKUP_SKIP_RE.test(key)) continue;
    const type = await redisCommand(["TYPE", key]);
    if (type === "string") {
      data[key] = { type, value: await redisCommand(["GET", key]) };
    } else if (type === "hash") {
      const raw = (await redisCommand(["HGETALL", key])) || [];
      const obj = {};
      for (let i = 0; i < raw.length; i += 2) obj[String(raw[i])] = String(raw[i + 1]);
      data[key] = { type, value: obj };
    } else if (type === "set") {
      data[key] = { type, value: (await redisCommand(["SMEMBERS", key])) || [] };
    } else if (type === "list") {
      data[key] = { type, value: (await redisCommand(["LRANGE", key, "0", "-1"])) || [] };
    }
  }
  return data;
}

async function buildFullBackupFile() {
  const keys = await dumpAllRedis();
  const payload = JSON.stringify(
    { version: 1, exported_at: getWibTimestamp(), total_keys: Object.keys(keys).length, keys },
    null,
    2
  );
  return { payload, total: Object.keys(keys).length };
}

// Kirim backup ke chat admin (dipakai otomatis dan manual)
async function sendFullBackup(token, chatId, label) {
  const { payload, total } = await buildFullBackupFile();
  const filename = `backup-penuh-${getWibFileStamp()}.json`;
  const sent = await sendJsonDocument(
    token,
    chatId,
    filename,
    payload,
    `🛟 <b>Backup Penuh (${escapeHtml(label)})</b>\n` +
      `Jumlah data: <b>${total}</b> kunci\n` +
      `Waktu: ${getWibTimestamp()}\n\n` +
      `<i>Simpan file ini di tempat aman. Kalau data bermasalah, kirim file ini ke bot dengan caption <code>/restorefull KONFIRM</code>.</i>`
  );
  return sent;
}

// Otomatis sekali sehari
async function maybeFullBackup(token) {
  if (!FULLBACKUP_ENABLED) return;
  const now = Date.now();
  const wib = new Date(now + 7 * 3600 * 1000);
  if (wib.getUTCHours() < FULLBACKUP_HOUR_WIB) return;
  const todayKey = wibDayKey(now);
  if ((await redisCommand(["GET", REDIS_FULLBACKUP_DAY_KEY])) === todayKey) return;
  await redisCommand(["SET", REDIS_FULLBACKUP_DAY_KEY, todayKey]);

  const qris = await getQris();
  const adminChatId = qris && qris.admin_chat_id;
  if (!adminChatId) return;
  await sendFullBackup(token, adminChatId, "otomatis harian");
}

// Pulihkan dari file backup. Hanya jalan kalau caption persis "/restorefull KONFIRM".
async function restoreFromBackupFile(token, fileId) {
  const info = await tgRequest(token, "getFile", { file_id: fileId });
  const filePath = info && info.result && info.result.file_path;
  if (!filePath) throw new Error("Tidak bisa mengambil file dari Telegram");

  const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const parsed = JSON.parse(await res.text());
  if (!parsed || parsed.version !== 1 || !parsed.keys || typeof parsed.keys !== "object") {
    throw new Error("File bukan backup penuh yang valid");
  }

  let written = 0;
  const entries = Object.entries(parsed.keys);
  for (let i = 0; i < entries.length; i += 20) {
    await Promise.all(
      entries.slice(i, i + 20).map(async ([key, item]) => {
        if (!key.startsWith(BACKUP_KEY_PREFIX)) return;
        await redisCommand(["DEL", key]);
        if (item.type === "string") {
          await redisCommand(["SET", key, item.value]);
        } else if (item.type === "hash") {
          const flat = [];
          for (const [f, v] of Object.entries(item.value)) flat.push(f, v);
          for (let j = 0; j < flat.length; j += 200) {
            await redisCommand(["HSET", key, ...flat.slice(j, j + 200)]);
          }
        } else if (item.type === "set") {
          for (let j = 0; j < item.value.length; j += 200) {
            await redisCommand(["SADD", key, ...item.value.slice(j, j + 200)]);
          }
        } else if (item.type === "list") {
          for (let j = 0; j < item.value.length; j += 200) {
            await redisCommand(["RPUSH", key, ...item.value.slice(j, j + 200)]);
          }
        }
        written++;
      })
    );
  }
  return { written, exported_at: parsed.exported_at };
}

// ==========================================
// PAPAN PERINGKAT SALDO (TANPA MENAMPILKAN JUMLAH SALDO)
// ==========================================
const RANK_TOP_N = 10; // jumlah peringkat teratas yang ditampilkan
const RANK_MAX_USERS = 500; // batas pengguna yang dihitung, supaya tidak berat
const RANK_CACHE_SEC = 600; // hasil peringkat disimpan 10 menit
const REDIS_RANK_CACHE_KEY = "lumine_main_rank_cache";

// Urutan uid pembeli dari saldo terbesar. Jumlah saldo tidak disimpan di hasil, hanya urutannya.
async function getSaldoRanking() {
  const cached = await redisCommand(["GET", REDIS_RANK_CACHE_KEY]);
  if (cached) {
    try {
      const c = JSON.parse(cached);
      if (Date.now() - c.ts < RANK_CACHE_SEC * 1000) return c.order;
    } catch {}
  }

  const users = ((await redisCommand(["SMEMBERS", REDIS_USERS_KEY])) || [])
    .map(String)
    .slice(0, RANK_MAX_USERS);
  const bannedRaw = (await redisCommand(["HKEYS", REDIS_BLACKLIST_KEY])) || [];
  const banned = new Set(bannedRaw.map(String));

  const rows = [];
  for (let i = 0; i < users.length; i += 50) {
    const chunk = users.slice(i, i + 50).filter((u) => !banned.has(u));
    const saldos = await Promise.all(chunk.map((u) => getUserSaldo(u)));
    chunk.forEach((u, j) => {
      const s = Number(saldos[j]) || 0;
      if (s > 0) rows.push({ uid: u, s });
    });
  }
  rows.sort((a, b) => b.s - a.s);
  const order = rows.map((r) => r.uid);

  await redisCommand(["SET", REDIS_RANK_CACHE_KEY, JSON.stringify({ ts: Date.now(), order })]);
  return order;
}

// Nama disamarkan: hanya 4 digit terakhir ID yang terlihat
function maskPeringkatId(uid) {
  return `Pembeli ****${String(uid).slice(-4)}`;
}

async function sendPeringkat(token, chatId, uid) {
  const order = await getSaldoRanking();
  if (!order.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🏆 Papan peringkat belum ada. Isi saldo untuk jadi yang pertama!",
    });
    return;
  }

  const medal = ["🥇", "🥈", "🥉"];
  let text =
    "🏆 <b>Papan Peringkat Pembeli</b>\n" +
    "<i>Peringkat berdasarkan saldo. Jumlah saldo tidak ditampilkan.</i>\n\n";
  order.slice(0, RANK_TOP_N).forEach((u, i) => {
    const label = medal[i] || `${i + 1}.`;
    text += `${label} ${maskPeringkatId(u)}${u === String(uid) ? " ← kamu" : ""}\n`;
  });

  const pos = order.indexOf(String(uid));
  text +=
    pos >= 0
      ? `\n📍 Kamu di peringkat <b>${pos + 1}</b> dari ${order.length} pembeli.`
      : `\n📍 Isi saldo untuk masuk papan peringkat.`;

  await tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

// ==========================================
// BAGIKAN SET: PEMBELI BERBAGI LINK SET, TEMAN BELI PERTAMA KALI, PEMBAGI DAPAT SALDO
// ==========================================
const SHARE_ENABLED = true;
const SHARE_REWARD_SALDO = 500; // bonus saldo untuk pembagi (hanya bisa dipakai belanja di toko)
const SHARE_WINDOW_DAYS = 7; // teman harus beli dalam jangka waktu ini setelah masuk lewat link
const REDIS_SHARE_REF_KEY = "lumine_main_share_ref"; // hash: id pembeli baru -> JSON {sharer, item, ts}
const REDIS_SHARE_PAID_KEY = "lumine_main_share_paid"; // hash: id pembeli -> 1 (bonus hanya sekali)
let BOT_USERNAME_CACHE = null;

async function getBotUsername(token) {
  if (BOT_USERNAME_CACHE) return BOT_USERNAME_CACHE;
  const me = await tgRequest(token, "getMe", {});
  BOT_USERNAME_CACHE = (me && me.result && me.result.username) || "";
  return BOT_USERNAME_CACHE;
}

function buildShareUrl(uname, sharerId, itemId, nama) {
  const link = `https://t.me/${uname}?start=s_${sharerId}_${itemId}`;
  const text = `Cek ${nama} di Lumine Photopack 🛍️`;
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

// Dipanggil saat pembeli baru masuk lewat link bagikan (/start s_PEMBAGI_ITEM)
async function recordShareReferral(buyerId, sharerId, itemId, isNewUser) {
  if (!SHARE_ENABLED || !isNewUser) return;
  if (String(sharerId) === String(buyerId)) return;
  await redisCommand([
    "HSETNX",
    REDIS_SHARE_REF_KEY,
    String(buyerId),
    JSON.stringify({ sharer: String(sharerId), item: String(itemId), ts: Date.now() }),
  ]);
}

// Dipanggil setelah order di-ACC: bonus untuk pembagi saat teman pertama kali beli set yang dibagikan
async function maybeRewardShare(token, order) {
  if (!SHARE_ENABLED || !order || order.is_deposit || order.rbot_owner || order.paid_with_saldo) return;
  const buyerId = String(order.buyer_id);
  const raw = await redisCommand(["HGET", REDIS_SHARE_REF_KEY, buyerId]);
  if (!raw) return;

  let ref;
  try {
    ref = JSON.parse(raw);
  } catch {
    return;
  }
  if (String(ref.item) !== String(order.item_id)) return;
  if (Date.now() - Number(ref.ts) > SHARE_WINDOW_DAYS * 86400000) return;

  const first = await redisCommand(["HSETNX", REDIS_SHARE_PAID_KEY, buyerId, "1"]);
  if (Number(first) !== 1) return;

  await addUserSaldo(ref.sharer, SHARE_REWARD_SALDO);
  await tgRequest(token, "sendMessage", {
    chat_id: ref.sharer,
    parse_mode: "HTML",
    text:
      `🎁 <b>Bonus berbagi!</b>\n\n` +
      `Temanmu baru saja membeli set yang kamu bagikan. Saldo ` +
      `<code>+${formatRupiah(SHARE_REWARD_SALDO)}</code> sudah masuk ke akunmu. Terus bagikan ya! 💜`,
  });
}

// ==========================================
// SAKLAR KATEGORI: MINI SET DINONAKTIFKAN (data lama tetap tersimpan, hanya disembunyikan)
// ==========================================
const MINI_SET_ENABLED = false;
function isCategoryEnabled(item) {
  return MINI_SET_ENABLED || (item.kategori || "mini") === "full";
}

// ==========================================
// RATING PER SET DI HALAMAN DETAIL
// ==========================================
const DETAIL_REVIEW_SHOW = 2; // jumlah ulasan terbaru yang ditampilkan di detail
const DETAIL_REVIEW_MAX_LEN = 80; // potong ulasan panjang supaya caption tidak kepanjangan

// Rata-rata dan ulasan terbaru untuk satu set. Ulasan lama tanpa item_id hanya masuk ke rata-rata toko.
async function getItemRating(itemId) {
  const raw = await redisCommand(["GET", REDIS_RATING_KEY]);
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  const mine = list.filter((r) => String(r.item_id || "") === String(itemId));
  if (!mine.length) return { avg: 0, count: 0, comments: [] };
  const total = mine.reduce((sum, r) => sum + (Number(r.stars) || 0), 0);
  const comments = mine
    .filter((r) => r.komentar && String(r.komentar).trim())
    .slice(0, DETAIL_REVIEW_SHOW)
    .map((r) => ({
      komentar: String(r.komentar).slice(0, DETAIL_REVIEW_MAX_LEN),
      buyer_name: String(r.buyer_name || "Pembeli"),
    }));
  return { avg: total / mine.length, count: mine.length, comments };
}

function buildRatingBlock(rating) {
  if (!rating.count) return "";
  const lines = [`⭐ <b>${rating.avg.toFixed(1)}/5</b> dari ${rating.count} ulasan`];
  for (const c of rating.comments) {
    lines.push(`   “${escapeHtml(c.komentar)}” — ${escapeHtml(c.buyer_name)}`);
  }
  return lines.join("\n") + "\n\n";
}

// ==========================================
// CEK KESEHATAN BOT (ADMIN): mencari data dan konfigurasi yang bermasalah
// ==========================================
async function runBotHealthCheck() {
  const issues = [];

  if (!process.env.BOT_TOKEN) issues.push("BOT_TOKEN belum diset di environment");

  // Katalog: ID ganda, nama kosong, harga tidak valid
  const katalog = await getKatalog();
  const seen = new Set();
  for (const k of katalog) {
    const id = String(k.id);
    if (seen.has(id)) issues.push(`ID set ganda: ${id}`);
    seen.add(id);
    if (!k.nama || !String(k.nama).trim()) issues.push(`Set ID ${id} tidak punya nama`);
    if (!(parseNominal(k.harga) > 0)) issues.push(`Set "${k.nama || id}" harga tidak valid (${k.harga || "kosong"})`);
  }

  // Mitra: kode dan pemilik harus saling cocok
  const codeRaw = (await redisCommand(["HGETALL", REDIS_MITRA_CODE_KEY])) || [];
  const userRaw = (await redisCommand(["HGETALL", REDIS_MITRA_USER_KEY])) || [];
  const userMap = {};
  for (let i = 0; i < userRaw.length; i += 2) userMap[String(userRaw[i])] = String(userRaw[i + 1]);
  for (let i = 0; i < codeRaw.length; i += 2) {
    const code = String(codeRaw[i]);
    const uid = String(codeRaw[i + 1]);
    if (userMap[uid] !== code) issues.push(`Kode mitra "${code}" tidak cocok dengan pemiliknya (${uid})`);
  }

  // Blacklist: admin tidak boleh ikut diblokir
  const banned = (await redisCommand(["HKEYS", REDIS_BLACKLIST_KEY])) || [];
  for (const id of banned) {
    if (ADMIN_IDS.includes(String(id))) issues.push(`Admin ${id} ada di blacklist`);
  }

  return issues;
}

// ==========================================
// CHAT LOG MAKRO (bisa dipisah dari chat admin)
// ==========================================
const REDIS_MACRO_LOGCHAT_KEY = "lumine_main_macro_logchat";
async function getMacroLogChatId() {
  const raw = await redisCommand(["GET", REDIS_MACRO_LOGCHAT_KEY]);
  return raw ? String(raw) : null;
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
      const logChatId = (await getMacroLogChatId()) || (qris && qris.admin_chat_id);

      if (!matchedOrder) {
        if (logChatId) {
          const notifTxt = escapeHtml((rawNotif || "(kosong / tidak terbaca)").slice(0, 200));
          const nomTxt = nominals.length ? nominals.map((n) => formatRupiah(n)).join(", ") : "tidak ada";
          await tgRequest(token, "sendMessage", {
            chat_id: logChatId,
            parse_mode: "HTML",
            text:
              `🔴 <b>MAKRO: TIDAK COCOK</b>\n` +
              `🕒 ${getWibTimestamp()}\n\n` +
              `📲 <b>Notif:</b> <i>"${notifTxt}"</i>\n` +
              `🔢 <b>Angka terbaca:</b> ${nomTxt}\n\n` +
              `⚠️ Tidak ada order pending dengan nominal itu.\n` +
              `💡 <i>Cek: total transfer harus sama persis dengan total order, termasuk kode unik.</i>`,
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

      if (logChatId) {
        const extraNote = matchedOrder.is_deposit
          ? `\n🏷 <b>Jenis:</b> Deposit Saldo (+${formatRupiah(matchedOrder.base_nominal)})`
          : matchedOrder.is_resprem
          ? `\n🏷 <b>Jenis:</b> Reseller Prem (+bonus ${formatRupiah(RESELLER_PREM_BONUS_SALDO)})`
          : matchedOrder.is_mystery
          ? `\n🏷 <b>Gacha:</b> ${escapeHtml(deliveredName)}`
          : "";
        const notifSnippet = escapeHtml(rawNotif.slice(0, 200));
        await tgRequest(token, "sendMessage", {
          chat_id: logChatId,
          parse_mode: "HTML",
          text:
            `🟢 <b>MAKRO: ORDER #${matchedOrder.id} DIACC OTOMATIS</b>\n` +
            `🕒 ${getWibTimestamp()}\n\n` +
            `👤 <b>Pembeli:</b> ${escapeHtml(matchedOrder.buyer_name)} (${escapeHtml(matchedOrder.buyer_username)})\n` +
            `🆔 <code>${matchedOrder.buyer_id}</code>\n` +
            `📦 <b>Paket:</b> ${escapeHtml(matchedOrder.item_nama)}${extraNote}\n` +
            `💰 <b>Nominal:</b> <code>${formatRupiah(matchedOrder.total_nominal)}</code>\n` +
            `📲 <b>Notif:</b> <i>"${notifSnippet}"</i>\n\n` +
            `✅ <i>Pembeli sudah dapat file/saldo otomatis.</i>`,
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

      // BLACKLIST & RATE LIMIT (admin dikecualikan)
      if (!isCallerAdmin) {
        if (await isBanned(callerId)) return res.status(200).json({ ok: true });
        const rl = await checkRateLimit(callerId);
        if (rl !== "ok") {
          await tgRequest(token, "answerCallbackQuery", {
            callback_query_id: call.id,
            text: "⏳ Pelan-pelan ya, tunggu sebentar.",
          });
          return res.status(200).json({ ok: true });
        }
      }

      await tgRequest(token, "answerCallbackQuery", {
        callback_query_id: call.id,
      });

      // NAVIGASI: menu yang sedang tampil diganti, bukan ditumpuk chat baru.
      // Hanya tombol navigasi yang di-whitelist. Tombol bayar, WD, ACC admin, dan lainnya TIDAK dihapus.
      const NAV_PREFIXES = ["menu_", "detail_", "lb_", "rhome", "rkat", "rcreator", "rbest", "rcara", "wlr_", "kcat_", "kcr_", "creator_list_"];
      if (NAV_PREFIXES.some((p) => data && data.startsWith(p))) {
        try {
          await tgRequest(token, "deleteMessage", { chat_id: chatId, message_id: messageId });
        } catch (delErr) {
          console.error("Gagal hapus pesan navigasi:", delErr);
        }
      }

      if (data && data.startsWith("guide:")) {
        await sendPanduan(token, chatId, data.slice(6), messageId);
        return res.status(200).json({ ok: true });
      }

      if (data === "menu_home") {
        await sendMainMenuCard(token, chatId);
      } else if (data === "menu_saldo") {
        await sendSaldoMenu(token, chatId, callerId);
      } else if (data === "checkin") {
        await claimDailyCheckin(token, chatId, callerId);
      } else if (data === "sub_info") {
        await sendSubInfo(token, chatId, callerId);
      } else if (data === "sub_start") {
        await startSubProof(token, chatId, callerId);
      } else if (data === "spin_info") {
        await sendSpinInfo(token, chatId, callerId);
      } else if (data === "spin_go") {
        await doSpin(token, chatId, callerId);
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
      } else if (data.startsWith("kcat_")) {
        const [, kat, pg] = data.split("_");
        await sendKatalogListByCategory(token, chatId, kat, pg);
      } else if (data.startsWith("kcr_")) {
        const [, cIdx, pg] = data.split("_");
        await sendKatalogListByCreator(token, chatId, parseInt(cIdx, 10), pg);
      } else if (data.startsWith("creator_list_")) {
        const cIdx = parseInt(data.replace("creator_list_", ""), 10);
        await sendKatalogListByCreator(token, chatId, cIdx, 0);
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
      } else if (data.startsWith("wl_")) {
        await handleWishlistToggle(token, chatId, messageId, callerId, data.slice(3));
        return res.status(200).json({ ok: true });
      } else if (data.startsWith("wlr_")) {
        await removeFromWishlist(callerId, data.slice(4));
        await sendWishlist(token, chatId, callerId);
        return res.status(200).json({ ok: true });
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

        const itemRatingBlock = buildRatingBlock(await getItemRating(item.id));
        const captionText =
          `✨ <b>${escapeHtml(item.nama)}</b>\n\n` +
          itemRatingBlock +
          `╭─── 📦 <b>DETAIL PAKET</b> ───\n` +
          popularityLine +
          (item.creator ? `│ • <b>Creator :</b> 👤 ${escapeHtml(item.creator)}\n` : "") +
          `│ • <b>Isi :</b> ${escapeHtml(item.isi)}\n` +
          `│ • <b>Harga :</b> <code>${escapeHtml(item.harga)}</code>\n` +
          `│ • <b>Saldo Kamu :</b> <code>${formatRupiah(saldo)}</code>\n` +
          `╰────────────────────${voucherNote}\n\n` +
          `💳 Klik tombol di bawah untuk checkout via <b>Saldo</b> atau <b>QRIS</b>!`;

        const wlRowMarkup = [buildWishlistButton(await isInWishlist(callerId, item.id), item.id)];
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

        inlineMarkup.inline_keyboard.splice(1, 0, wlRowMarkup);
        const botUname = await getBotUsername(token);
        if (botUname && /^[A-Za-z0-9_-]{1,30}$/.test(String(item.id))) {
          inlineMarkup.inline_keyboard.splice(2, 0, [
            { text: "📤 Bagikan Set", url: buildShareUrl(botUname, callerId, item.id, item.nama) },
          ]);
        }

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
        const target = await resolvePurchaseTarget(targetKey, callerId);
        if (!target.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: target.error });
          return res.status(200).json({ ok: true });
        }
        await sendQrisInvoiceForTarget(token, chatId, call.from, target);
      } else if (data.startsWith("paysaldo_")) {
        const targetKey = data.replace("paysaldo_", "");
        const target = await resolvePurchaseTarget(targetKey, callerId);
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
            ...(target.extra || {}),
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
        const target = await resolvePurchaseTarget(targetKey, callerId);
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
          : order.is_resprem
          ? `\n💎 <b>Jenis:</b> Reseller Prem (+bonus saldo ${formatRupiah(RESELLER_PREM_BONUS_SALDO)})`
          : order.is_mystery
          ? `\n🎲 <b>Hadiah Gacha Didapat:</b> ${escapeHtml(deliveredName)}`
          : "";
        const adminFooter = order.is_deposit
          ? "💳 <i>Saldo otomatis ditambahkan ke akun pembeli!</i>"
          : order.is_resprem
          ? "💎 <i>Status reseller & saldo awal otomatis aktif!</i>"
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
      } else if (data.startsWith("subacc_") || data.startsWith("subrej_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const isAccSub = data.startsWith("subacc_");
        const reqIdSub = data.replace(isAccSub ? "subacc_" : "subrej_", "");
        await processSubReview(token, chatId, messageId, reqIdSub, isAccSub);
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

      // BLACKLIST & RATE LIMIT (admin dikecualikan)
      if (!isAdmin && senderId) {
        if (await isBanned(senderId)) return res.status(200).json({ ok: true });
        const rl = await checkRateLimit(senderId);
        if (rl === "limit") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⏳ Kamu terlalu sering mengirim pesan. Tunggu sebentar ya.",
          });
          return res.status(200).json({ ok: true });
        }
        if (rl === "blocked") return res.status(200).json({ ok: true });
      }

      let isNewUser = false;
      if (msg.chat && msg.chat.type === "private") {
        const addedRes = await redisCommand(["SADD", REDIS_USERS_KEY, String(chatId)]);
        isNewUser = Number(addedRes) === 1;
      }

      // Hadiah mitra terbaik bulan lalu (sekali per bulan)
      try {
        await maybeAwardMitraTop(token);
      } catch (mtErr) {
        console.error("Hadiah mitra terbaik error:", mtErr);
      }

      // Win-back pembeli tidak aktif (sekali sehari)
      try {
        await maybeWinBack(token);
      } catch (wbErr) {
        console.error("Win-back error:", wbErr);
      }

      // Backup penuh otomatis (sekali sehari)
      try {
        await maybeFullBackup(token);
      } catch (fbErr) {
        console.error("Backup penuh error:", fbErr);
      }

      // Ringkasan harian untuk admin (sekali per hari)
      try {
        await maybeSendDailySummary(token);
      } catch (sumErr) {
        console.error("Ringkasan harian error:", sumErr);
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
          await rewardReview(token, chatId, senderId, pendingRate.order_id);

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

      // MODERASI & TIKET
      if (rawText.startsWith("/")) {
        if (await handleModerationCommands(token, msg, rawText, isAdmin)) {
          return res.status(200).json({ ok: true });
        }
      }
      if (/^\/bantuan(\s|$)/i.test(rawText)) {
        await handleBantuan(token, msg, rawText.replace(/^\/bantuan\s*/i, "").trim());
        return res.status(200).json({ ok: true });
      }
      if (/^\/panduan(\s|$)/i.test(rawText)) {
        await sendPanduan(token, chatId, "root");
        return res.status(200).json({ ok: true });
      }

      // MITRA
      if (/^\/daftarmitra(\s|$)/i.test(rawText)) {
        await registerMitra(token, msg, rawText.replace(/^\/daftarmitra\s*/i, ""));
        return res.status(200).json({ ok: true });
      }
      if (/^\/mitra(\s|$)/i.test(rawText) && msg.chat.type === "private") {
        if (await isMitra(senderId)) {
          await sendMitraInfo(token, chatId, String(senderId));
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: "Kamu belum jadi mitra. Daftar dengan <code>/daftarmitra KODE</code>, contoh <code>/daftarmitra kiko99</code>.",
          });
        }
        return res.status(200).json({ ok: true });
      }
      if (isAdmin && /^\/cabutmitra(\s|$)/i.test(rawText)) {
        const targetUid = rawText.replace(/^\/cabutmitra\s*/i, "").trim();
        const ok = /^\d{5,15}$/.test(targetUid) ? await removeMitra(token, targetUid) : false;
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: ok ? `✅ ${targetUid} sudah bukan mitra lagi.` : "ID tidak valid atau bukan mitra.",
          reply_to_message_id: msg.message_id,
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /listmitra
      if (isAdmin && /^\/listmitra(\s|$)/i.test(rawText)) {
        const raw = await redisCommand(["HGETALL", REDIS_MITRA_CODE_KEY]);
        const pairs = [];
        if (Array.isArray(raw)) for (let i = 0; i < raw.length; i += 2) pairs.push([String(raw[i]), String(raw[i + 1])]);
        if (!pairs.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Belum ada mitra terdaftar.", reply_to_message_id: msg.message_id });
          return res.status(200).json({ ok: true });
        }
        let out = `🤝 <b>Daftar Mitra</b> (${pairs.length})\n`;
        let totalKomisi = 0;
        for (const [kode, uid] of pairs.slice(0, 30)) {
          const [buyers, m] = await Promise.all([
            redisCommand(["HLEN", REDIS_MITRA_BUYERS_PREFIX + kode]),
            getResellerMargin(uid),
          ]);
          totalKomisi += m.earned;
          out +=
            `\n• <code>${escapeHtml(kode)}</code> — <code>${uid}</code>\n` +
            `   👥 ${Number(buyers) || 0} pembeli • 💰 ${formatRupiah(m.earned)} • 💳 bisa WD ${formatRupiah(m.available)}`;
        }
        out += `\n\n📊 Total komisi semua mitra: <code>${formatRupiah(totalKomisi)}</code>`;
        if (pairs.length > 30) out += `\n<i>(menampilkan 30 pertama)</i>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: out, parse_mode: "HTML", reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // CEK ID
      if (/^\/id(\s|$)/i.test(rawText)) {
        const uname = msg.from && msg.from.username ? `@${escapeHtml(msg.from.username)}` : "Tanpa username";
        const nama = escapeHtml([msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "-");
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `🆔 <b>Profil Telegram kamu</b>\n\n👤 Nama : ${nama}\n🔖 Username : ${uname}\n🔢 ID : <code>${senderId}</code>\n\n<i>Ketuk ID di atas untuk menyalin.</i>`,
          reply_to_message_id: msg.message_id,
        });
        return res.status(200).json({ ok: true });
      }

      // BACKUP PENUH (ADMIN)
      if (isAdmin && /^\/fullbackup(\s|$)/i.test(rawText)) {
        const ok = await sendFullBackup(token, chatId, "manual");
        if (!ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Gagal membuat backup penuh. Coba lagi." });
        }
        return res.status(200).json({ ok: true });
      }
      if (isAdmin && msg.document && /^\/restorefull\s+KONFIRM\s*$/.test(rawText)) {
        try {
          const r = await restoreFromBackupFile(token, msg.document.file_id);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: `✅ <b>Restore selesai</b>\nKunci dipulihkan: <b>${r.written}</b>\nDari backup: ${escapeHtml(r.exported_at)}`,
          });
        } catch (rsErr) {
          console.error("Restore penuh error:", rsErr);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Restore gagal: ${String(rsErr.message || rsErr)}. Data lama tidak diubah kalau file tidak valid.`,
          });
        }
        return res.status(200).json({ ok: true });
      }
      if (isAdmin && /^\/restorefull(\s|$)/i.test(rawText) && !msg.document) {
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: "Untuk restore, upload file backup penuh dengan caption <code>/restorefull KONFIRM</code>.\n<i>Ini akan menimpa data bot saat ini.</i>",
        });
        return res.status(200).json({ ok: true });
      }

      // PAPAN PERINGKAT (tanpa menampilkan jumlah saldo)
      if (/^\/peringkat(\s|$)/i.test(rawText) && msg.chat.type === "private") {
        await sendPeringkat(token, chatId, senderId);
        return res.status(200).json({ ok: true });
      }

      // LEADERBOARD SALDO KHUSUS ADMIN (menampilkan jumlah saldo)
      if (isAdmin && /^\/lbsaldo(\s|$)/i.test(rawText)) {
        const order = await getSaldoRanking();
        const top = order.slice(0, RANK_TOP_N);
        if (!top.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Belum ada pembeli yang punya saldo.", reply_to_message_id: msg.message_id });
          return res.status(200).json({ ok: true });
        }
        const amounts = await Promise.all(top.map((u) => getUserSaldo(u)));
        let out = "🏦 <b>Leaderboard Saldo (ADMIN)</b>\n<i>Hanya untuk admin, jangan dibagikan.</i>\n\n";
        top.forEach((u, i) => {
          out += `${i + 1}. <code>${u}</code> — <code>${formatRupiah(Number(amounts[i]) || 0)}</code>\n`;
        });
        out += `\nJumlah pembeli yang punya saldo: <b>${order.length}</b>\n<i>Data diperbarui tiap 10 menit.</i>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: out, parse_mode: "HTML", reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // CHECKLIST HARGA (ADMIN): lihat harga apa saja yang dipakai dan berapa set di tiap harga
      if (isAdmin && /^\/hargalist(\s|$)/i.test(rawText)) {
        const katalog = await getKatalog();
        if (!katalog.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Katalog masih kosong.", reply_to_message_id: msg.message_id });
          return res.status(200).json({ ok: true });
        }
        const groups = new Map();
        for (const k of katalog) {
          const n = parseNominal(k.harga) || 0;
          if (!groups.has(n)) groups.set(n, []);
          groups.get(n).push(k);
        }
        const keys = [...groups.keys()].sort((a, b) => a - b);
        let out = `📋 <b>Checklist Harga</b>\n<i>${keys.length} titik harga, ${katalog.length} set total</i>\n`;
        for (const n of keys) {
          const list = groups.get(n);
          const label = n > 0 ? formatRupiah(n) : "Harga tidak valid";
          out += `\n☑️ <b>${label}</b> — ${list.length} set\n`;
          const names = list.slice(0, 5).map((k) => `• ${escapeHtml(k.nama)} (${(k.kategori || "mini") === "full" ? "Full" : "Mini"})`);
          out += names.join("\n");
          if (list.length > 5) out += `\n• ...+${list.length - 5} lainnya`;
          out += "\n";
        }
        await tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: out, reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // CEK TOP UP (ADMIN): ringkasan dan daftar top up yang bermasalah
      if (isAdmin && /^\/cektopup(\s|$)/i.test(rawText)) {
        const seqRaw = await redisCommand(["GET", REDIS_ORDER_SEQ_KEY]);
        const maxId = parseInt(seqRaw, 10) || 0;
        const scanFrom = Math.max(1, maxId - 199);
        const ids = [];
        for (let id = maxId; id >= scanFrom; id--) ids.push(id);

        const counts = { pending: 0, waiting_acc: 0, acc: 0, rejected: 0, cancelled: 0 };
        const problems = [];
        for (let i = 0; i < ids.length; i += 40) {
          const raws = await Promise.all(ids.slice(i, i + 40).map((id) => redisCommand(["GET", `${REDIS_ORDER_PREFIX}${id}`])));
          for (const raw of raws) {
            if (!raw) continue;
            let o;
            try {
              o = typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              continue;
            }
            if (!o || !o.is_deposit) continue;
            const st = String(o.status || "");
            if (counts[st] !== undefined) counts[st]++;
            if (st === "waiting_acc" || st === "rejected" || st === "cancelled") {
              problems.push({ id: o.id, st, buyer: o.buyer_name || "-", uid: o.buyer_id, nominal: o.total_nominal });
            }
          }
        }

        const totalDepo = Object.values(counts).reduce((a, b) => a + b, 0);
        let out =
          `🔎 <b>Cek Top Up</b>\n<i>Memeriksa ${ids.length} order terakhir</i>\n\n` +
          `📊 Total top up : <b>${totalDepo}</b>\n` +
          `✅ Berhasil (acc) : <b>${counts.acc}</b>\n` +
          `⏳ Menunggu bayar (pending) : <b>${counts.pending}</b>\n` +
          `🕓 Menunggu ACC admin : <b>${counts.waiting_acc}</b>\n` +
          `❌ Ditolak : <b>${counts.rejected}</b>\n` +
          `🚫 Dibatalkan : <b>${counts.cancelled}</b>\n`;

        if (problems.length) {
          out += `\n⚠️ <b>Perlu dicek</b> (${problems.length})\n`;
          const label = { waiting_acc: "🕓 tunggu ACC", rejected: "❌ ditolak", cancelled: "🚫 batal" };
          for (const p of problems.slice(0, 15)) {
            out += `\n• #${p.id} — ${escapeHtml(p.buyer)} <code>${p.uid}</code>\n   ${formatRupiah(Number(p.nominal) || 0)} • ${label[p.st]}`;
          }
          if (problems.length > 15) out += `\n\n<i>...+${problems.length - 15} lainnya</i>`;
        } else {
          out += `\n✅ Tidak ada top up yang bermasalah.`;
        }
        out += `\n\n<i>Catatan: order belum menyimpan waktu, jadi "pending lama" belum bisa dideteksi.</i>`;

        await tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: out, reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // CEK KESEHATAN BOT (ADMIN)
      if (isAdmin && /^\/cekbot(\s|$)/i.test(rawText)) {
        const issues = await runBotHealthCheck();
        let out;
        if (!issues.length) {
          out = "✅ <b>Pemeriksaan selesai</b>\nKatalog, mitra, dan blacklist tidak menemukan masalah.";
        } else {
          out = `⚠️ <b>Ditemukan ${issues.length} masalah</b>\n`;
          for (const it of issues.slice(0, 30)) out += `\n• ${escapeHtml(it)}`;
          if (issues.length > 30) out += `\n\n<i>...+${issues.length - 30} lainnya</i>`;
        }
        await tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: out, reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // SET CHAT LOG MAKRO (ADMIN): /setlogmakro CHAT_ID | /setlogmakro reset
      if (isAdmin && /^\/setlogmakro(\s|$)/i.test(rawText)) {
        const arg = rawText.replace(/^\/setlogmakro\s*/i, "").trim();
        let reply;
        if (!arg || arg.toLowerCase() === "reset") {
          await redisCommand(["DEL", REDIS_MACRO_LOGCHAT_KEY]);
          reply = "✅ Log makro kembali ke chat admin.";
        } else if (/^-?\d{5,20}$/.test(arg)) {
          await redisCommand(["SET", REDIS_MACRO_LOGCHAT_KEY, arg]);
          reply = `✅ Log makro sekarang dikirim ke chat <code>${escapeHtml(arg)}</code>.\n\n<i>Pastikan bot sudah dijadikan admin di chat/channel itu.</i>`;
        } else {
          reply = "Format: <code>/setlogmakro CHAT_ID</code> atau <code>/setlogmakro reset</code>.\nCHAT_ID channel biasanya diawali <code>-100</code>.";
        }
        await tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: reply, reply_to_message_id: msg.message_id });
        return res.status(200).json({ ok: true });
      }

      // CEK ID (ADMIN)
      // /cekid            -> ID chat tempat perintah diketik (pribadi atau grup)
      // /cekidchannel     -> ID channel, dari pesan yang diteruskan (forward) dari channel itu
      if (isAdmin && /^\/cekidchannel(\s|$)/i.test(rawText)) {
        const src = msg.forward_from_chat;
        if (!src || src.type !== "channel") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text:
              "📢 <b>Cek ID Channel</b>\n\n" +
              "Teruskan (forward) satu pesan dari channel ke bot ini, lalu balas pesan itu dengan <code>/cekidchannel</code>.\n\n" +
              "<i>Bot harus bisa menerima pesan dari channel tersebut, misalnya sebagai admin channel.</i>",
            reply_to_message_id: msg.message_id,
          });
          return res.status(200).json({ ok: true });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `📢 <b>Info Channel</b>\n\n` +
            `📛 Nama : ${escapeHtml(src.title || "-")}\n` +
            `🔗 Username : ${src.username ? "@" + escapeHtml(src.username) : "tanpa username (privat)"}\n` +
            `🔢 ID : <code>${src.id}</code>\n\n` +
            `<i>Salin ID ini untuk dipakai di /setlogmakro.</i>`,
          reply_to_message_id: msg.message_id,
        });
        return res.status(200).json({ ok: true });
      }

      if (isAdmin && /^\/cekid(\s|$)/i.test(rawText)) {
        const tipe = { private: "Chat pribadi", group: "Grup", supergroup: "Supergrup", channel: "Channel" }[msg.chat.type] || msg.chat.type;
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `🆔 <b>Info Chat Ini</b>\n\n` +
            `📛 Nama : ${escapeHtml(msg.chat.title || msg.chat.first_name || "-")}\n` +
            `🏷 Jenis : ${tipe}\n` +
            `🔢 ID : <code>${msg.chat.id}</code>`,
          reply_to_message_id: msg.message_id,
        });
        return res.status(200).json({ ok: true });
      }

      // WISHLIST
      if (/^\/wishlist(\s|$)/i.test(rawText) || rawText === "⭐ Wishlist") {
        await sendWishlist(token, chatId, senderId);
        return res.status(200).json({ ok: true });
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
      if (/^\/?set\s*creator(?=\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "📂 Katalog masih kosong." });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/?set\s*creator\s*/i, "").trim();
        if (!arg) {
          const lines = katalogList.map((item, idx) => {
            const katIcon = item.kategori === "full" ? "📦" : "🧩";
            const crLabel = item.creator
              ? `👤 <b>${escapeHtml(item.creator)}</b>`
              : "<i>(belum diatur)</i>";
            return `${idx + 1}. ${katIcon} <b>${escapeHtml(item.nama)}</b> — ${crLabel}\n`;
          });
          const header = "👤 <b>DAFTAR CREATOR SET KATALOG</b>\n\n";
          const footer =
            "\n<b>Atur / Ubah Creator:</b>\n" +
            "• Satu set: <code>/setcreator [nomor] [Nama Creator]</code>\n" +
            "• Banyak set sekaligus: <code>/setcreator 1,2,3 [Nama Creator]</code>\n" +
            "• Hapus creator: <code>/setcreator [nomor] -</code>\n" +
            "<i>Contoh: <code>/setcreator 1 Larissa Rochefort</code></i>";
          // Pecah per ±3500 karakter supaya tidak melebihi limit 4096 Telegram
          const chunks = [];
          let cur = header;
          for (const ln of lines) {
            if (cur.length + ln.length > 3500) {
              chunks.push(cur);
              cur = "";
            }
            cur += ln;
          }
          if (cur.length + footer.length > 3500) {
            chunks.push(cur);
            cur = "";
          }
          chunks.push(cur + footer);
          for (const part of chunks) {
            await tgRequest(token, "sendMessage", { chat_id: chatId, text: part, parse_mode: "HTML" });
          }
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
        const allUserIds = (await redisCommand(["SMEMBERS", REDIS_USERS_KEY])) || [];
        const bannedIds = new Set(((await redisCommand(["HKEYS", REDIS_BLACKLIST_KEY])) || []).map(String));
        const userIds = allUserIds.filter((uid) => !bannedIds.has(String(uid)));

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

      // 4C. ADMIN: /setsub (nama, link, dan status klaim subscribe)
      if (rawText.startsWith("/setsub")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const subArg = rawText.replace(/^\/setsub\s*/i, "").trim();
        const subCfg = await getSubConfig();
        const replySub = (text) =>
          tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });

        if (!subArg) {
          await replySub(
            "🎁 <b>PENGATURAN KLAIM SUBSCRIBE</b>\n\n" +
              `• Status: ${subCfg.enabled ? "✅ <b>Aktif</b>" : "❌ <b>Nonaktif</b>"}\n` +
              `• Channel: <b>${escapeHtml(subCfg.name)}</b>\n` +
              `• Link: ${escapeHtml(subCfg.link)}\n\n` +
              "<b>Ubah:</b> <code>/setsub NAMA CHANNEL | LINK</code>\n" +
              "<b>Matikan:</b> <code>/setsub off</code> | <b>Nyalakan:</b> <code>/setsub on</code>"
          );
          return res.status(200).json({ ok: true });
        }

        const subLower = subArg.toLowerCase();
        if (subLower === "on" || subLower === "off") {
          subCfg.enabled = subLower === "on";
          await saveSubConfig(subCfg);
          await replySub(`✅ Klaim subscribe ${subCfg.enabled ? "diaktifkan" : "dinonaktifkan"}.`);
          return res.status(200).json({ ok: true });
        }

        const subParts = subArg.split("|").map((s) => s.trim());
        if (subParts.length !== 2 || !subParts[0] || !/^https?:\/\/\S+$/i.test(subParts[1])) {
          await replySub(
            "⚠️ Format salah.\nContoh: <code>/setsub Channel Lumine | https://youtube.com/@namachannel</code>"
          );
          return res.status(200).json({ ok: true });
        }

        subCfg.name = subParts[0].slice(0, 60);
        subCfg.link = subParts[1];
        await saveSubConfig(subCfg);
        await replySub(
          `✅ Klaim subscribe diperbarui:\n📺 <b>${escapeHtml(subCfg.name)}</b>\n🔗 ${escapeHtml(subCfg.link)}`
        );
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

      // 8B. ADMIN: /backup — ekspor seluruh katalog jadi file JSON yang dikirim ke chat admin.
      // Katalog cuma hidup di Redis, jadi kalau ke-reset/salah /hapus, ini satu-satunya jalan balikin.
      if (rawText.startsWith("/backup")) {
        if (!isAdmin) return res.status(200).json({ ok: true });

        const katalogList = await getKatalog();
        const payload = JSON.stringify(
          { exported_at: getWibTimestamp(), total: katalogList.length, katalog: katalogList },
          null,
          2
        );
        const filename = `backup-katalog-${getWibFileStamp()}.json`;
        const sent = await sendJsonDocument(
          token,
          chatId,
          filename,
          payload,
          `📦 <b>Backup Katalog</b>\nTotal: <b>${katalogList.length} set</b>\nWaktu: ${getWibTimestamp()}\n\n` +
            "<i>Simpan file ini baik-baik (misal forward ke Saved Messages). Kalau katalog ke-reset atau salah kehapus, upload lagi file ini dengan caption /restore.</i>"
        );
        if (!sent) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Gagal membuat file backup. Coba lagi beberapa saat lagi.",
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 8C. ADMIN: /restore — balikin katalog dari file JSON hasil /backup.
      // Alur 2 langkah biar nggak kepencet nggak sengaja: upload file dulu -> baru /restore konfirmasi.
      if (/^\/restore\b/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });

        const restoreKey = REDIS_RESTORE_PENDING_PREFIX + String(chatId);
        const isConfirm = /konfirmasi/i.test(rawText);

        if (isConfirm) {
          const pendingRaw = await redisCommand(["GET", restoreKey]);
          if (!pendingRaw) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                "⚠️ Tidak ada file restore yang nunggu konfirmasi (mungkin sudah lewat 5 menit).\n" +
                "Upload lagi file JSON backup-nya dengan caption <code>/restore</code>.",
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }

          let parsedList = null;
          try {
            const parsed = JSON.parse(pendingRaw);
            parsedList = Array.isArray(parsed) ? parsed : null;
          } catch {
            parsedList = null;
          }

          if (!parsedList) {
            await redisCommand(["DEL", restoreKey]);
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text: "⚠️ File restore yang tersimpan ternyata rusak/tidak valid. Dibatalkan, silakan upload ulang.",
            });
            return res.status(200).json({ ok: true });
          }

          // Jaga-jaga: backup dulu katalog yang LAMA sebelum ditimpa, biar kalau file restore
          // ternyata salah, admin masih bisa balikin lagi dari sini.
          const oldKatalog = await getKatalog();
          const oldPayload = JSON.stringify(
            { exported_at: getWibTimestamp(), total: oldKatalog.length, katalog: oldKatalog },
            null,
            2
          );
          await sendJsonDocument(
            token,
            chatId,
            `auto-backup-sebelum-restore-${getWibFileStamp()}.json`,
            oldPayload,
            `🗂️ Backup otomatis katalog LAMA (${oldKatalog.length} set) sebelum ditimpa oleh /restore.`
          );

          await saveKatalog(parsedList);
          await redisCommand(["DEL", restoreKey]);

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `✅ <b>Restore berhasil!</b>\n` +
              `Katalog sekarang: <b>${parsedList.length} set</b> (sebelumnya <b>${oldKatalog.length} set</b>).\n` +
              "Katalog lama sudah dikirim sebagai file terpisah di atas, kalau-kalau perlu dibalikin lagi.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        // Bukan konfirmasi -> harus ada file JSON terlampir (dikirim dengan caption /restore).
        if (!msg.document) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "♻️ <b>RESTORE KATALOG DARI BACKUP</b>\n" +
              "Kirim file JSON hasil <code>/backup</code> dengan caption <code>/restore</code>.\n" +
              "Setelah filenya terbaca, konfirmasi dengan <code>/restore konfirmasi</code> (berlaku 5 menit).",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        try {
          const info = await tgRequest(token, "getFile", { file_id: msg.document.file_id });
          if (!info || !info.ok || !info.result || !info.result.file_path) {
            throw new Error("getFile gagal");
          }
          const dl = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
          if (!dl.ok) throw new Error("download file gagal");
          const fileText = await dl.text();
          const json = JSON.parse(fileText);
          const list = Array.isArray(json) ? json : Array.isArray(json && json.katalog) ? json.katalog : null;

          if (!list) throw new Error("format JSON tidak dikenali");

          await redisCommand(["SET", restoreKey, JSON.stringify(list), "EX", "300"]);
          const currentCount = (await getKatalog()).length;

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `📦 File backup terbaca: <b>${list.length} set</b>.\n` +
              `📋 Katalog saat ini: <b>${currentCount} set</b>.\n\n` +
              "⚠️ <b>Ini akan MENIMPA seluruh katalog saat ini.</b> Katalog lama otomatis dibackup dulu sebelum ditimpa.\n" +
              "Ketik <code>/restore konfirmasi</code> dalam 5 menit untuk lanjut, atau abaikan pesan ini untuk batal.",
            parse_mode: "HTML",
          });
        } catch (e) {
          console.error("Restore parse error:", e);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Gagal membaca file ini. Pastikan file JSON hasil dari <code>/backup</code> bot ini (bukan file lain), lalu kirim ulang dengan caption <code>/restore</code>.",
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
          const kategoriRaw = (parts[4] || "full").toLowerCase();
          const kategori = kategoriRaw.includes("mini") && MINI_SET_ENABLED ? "mini" : "full";
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

      // 12B. BUKTI SUBSCRIBE UNTUK KLAIM SALDO (hanya saat user sedang menunggu)
      if (msg.photo && msg.photo.length > 0 && !isAdmin) {
        const subState = await redisCommand(["HGET", REDIS_SUB_PENDING_KEY, String(senderId)]);
        if (subState === "waiting") {
          await handleSubProof(token, msg, senderId);
          return res.status(200).json({ ok: true });
        }
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

        const startShareMatch = /^\/start\s+s_(\d{5,15})_([A-Za-z0-9_-]{1,30})$/i.exec(text);
        if (startShareMatch) {
          try {
            await recordShareReferral(senderId, startShareMatch[1], startShareMatch[2], isNewUser);
          } catch (shareRecErr) {
            console.error("Share record error:", shareRecErr);
          }
        }
        const startMitraMatch = /^\/start\s+m_([a-z0-9]{3,16})$/i.exec(text);
        if (startMitraMatch) {
          try {
            await recordMitraReferral(senderId, startMitraMatch[1], isNewUser);
          } catch (mitraRecErr) {
            console.error("Mitra record error:", mitraRecErr);
          }
        }

        if (text === "/start" || startRefMatch || startMitraMatch || startShareMatch) {
          const buyerName = escapeHtml((msg.from && msg.from.first_name) || "Kak");
          let headerText = `👋 Halo <b>${buyerName}</b>! Selamat datang di <b>Lumine Photopack Store</b>.\n🆔 ID kamu: <code>${senderId}</code>`;

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
              "• <code>/setwdch</code> — channel bukti WD (default: Channel Testimoni)\n" +
              "• <code>/backup</code> — ekspor katalog ke file JSON | <code>/restore</code> — balikin dari file JSON";
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
          if (["panduan", "bantuan", "help"].some((k) => lowerText.includes(k))) {
            await sendPanduan(token, chatId, "root");
            return res.status(200).json({ ok: true });
          }

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
                                
