// ==========================================
// 0. PENCATAT ERROR (semua console.error otomatis disimpan ke Redis, admin bisa cek lewat /error)
// ==========================================
const REDIS_ERRLOG_KEY = "lumine_main_errlog";
const REDIS_ERR_ALERT_PREFIX = "lumine_main_erralert_";
const ERR_LOG_MAX = 100; // jumlah error yang disimpan
const ERR_ALERT_COOLDOWN_SEC = 600; // notif error yang sama hanya sekali tiap 10 menit
const _origConsoleError = console.error.bind(console);
const pendingErrLogs = [];
let inErrLog = false;

function formatErrArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) {
        const stackHead = a.stack ? a.stack.split("\n").slice(0, 3).join("\n") : "";
        return `${a.message}${stackHead ? "\n" + stackHead : ""}`;
      }
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ")
    .slice(0, 1500);
}

async function persistErrorLog(text) {
  const entry = JSON.stringify({ t: getWibTimestamp(), msg: text });
  await redisCommand(["LPUSH", REDIS_ERRLOG_KEY, entry]);
  await redisCommand(["LTRIM", REDIS_ERRLOG_KEY, "0", String(ERR_LOG_MAX - 1)]);

  const token = process.env.BOT_TOKEN;
  const qris = await getQris();
  if (!token || !qris || !qris.admin_chat_id) return;
  const keyPart = text.slice(0, 60).replace(/[^A-Za-z0-9]+/g, "_");
  const ok = await redisCommand(["SET", REDIS_ERR_ALERT_PREFIX + keyPart, "1", "NX", "EX", String(ERR_ALERT_COOLDOWN_SEC)]);
  if (ok !== "OK") return;
  await tgRequest(token, "sendMessage", {
    chat_id: qris.admin_chat_id,
    text: "🚨 Ada error di bot:\n" + text.slice(0, 500) + "\n\nLihat riwayat lengkap: /error",
  });
}

console.error = (...args) => {
  _origConsoleError(...args);
  if (inErrLog) return;
  const p = (async () => {
    inErrLog = true;
    try {
      await persistErrorLog(formatErrArgs(args));
    } catch (e) {
      _origConsoleError("Gagal mencatat error:", e && e.message);
    } finally {
      inErrLog = false;
    }
  })();
  pendingErrLogs.push(p);
  if (pendingErrLogs.length > 50) pendingErrLogs.shift();
};

// ==========================================
// 1. PENGATURAN UTAMA (BOT UTAMA — FULL FITUR + AUTO-ACC MAKRO + DEPO SALDO)
// ==========================================
const ADMIN_USERNAME = "Fellstore1"; // Tanpa tanda @
const LINK_CH_CADANGAN = "https://t.me/+OGXaaPyrnd5kMmY1";
const LINK_CH_FREE = "https://t.me/+jf3tLqLIG444MjBI";

// ---- PENGATURAN MENU RESELLER (UBAH SESUAI KEBUTUHAN) ----
const RETAIL_PRICE_LITE = 5000; // TIDAK DIPAKAI LAGI untuk jualan (paket 5k dihapus). Dibiarkan agar hitungan modal reseller tetap aman.
const RETAIL_PRICE_STANDAR = 10000; // harga retail semua set (satu harga: Rp 10.000)
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

// ---- FLASH SALE (promo kilat per-set, otomatis berakhir sendiri) ----
const FLASHSALE_DEFAULT_MINUTES = 60; // durasi default 1 jam kalau admin tidak menentukan durasi
const REDIS_FLASHSALE_KEY = "lumine_main_flashsale"; // JSON: { item_id, item_nama, original_harga, original_nominal, flash_price, start_ts, end_ts }

// ---- PRE ORDER (pembeli bayar dulu, file dikirim otomatis saat admin /rilispo) ----
// Flag per set ada di katalog: item.preorder = true, item.po_eta = teks perkiraan rilis (opsional)
// Order PO per set disimpan di hash: REDIS_PO_PREFIX + itemId -> { orderId: buyerId }
const REDIS_PO_PREFIX = "lumine_main_po_";

// ---- HADIAH LEADERBOARD BULANAN (saldo otomatis untuk Top 3 pembeli bulan lalu) ----
const LB_REWARD_ENABLED = true; // false = matikan hadiah
const LB_REWARD_SALDO = [10000, 5000, 3000]; // hadiah saldo untuk peringkat 1, 2, 3
const LB_REWARD_MIN_OMSET = 20000; // minimal total belanja bulan itu agar berhak dapat hadiah
const REDIS_LB_REWARD_LOCK_PREFIX = "lumine_main_lb_reward_";

// ---- MINI GAME: TAP CHALLENGE (1x gratis per hari WIB, papan skor mingguan + hadiah saldo juara) ----
const TAP_ENABLED = true; // false = matikan game
const TAP_DURASI_DETIK = 10; // lama satu sesi
const TAP_MAX_PER_DETIK = 15; // klik di atas ini per detik dari satu user diabaikan (anti bot)
const TAP_HADIAH = [10000, 5000, 3000]; // hadiah saldo juara 1, 2, 3 minggu lalu
const TAP_SESI_JEDA_DETIK = 60; // data sesi disimpan sedikit lebih lama dari durasi supaya skor akhir masih bisa ditampilkan
const REDIS_TAP_START_PREFIX = "lumine_main_tap_start_"; // key per user: "waktuMulaiMs:weekKey"
const REDIS_TAP_CNT_PREFIX = "lumine_main_tap_cnt_"; // key per user: hitungan tap sesi (INCR di server)
const REDIS_TAP_DAY_PREFIX = "lumine_main_tap_day_"; // hash per hari (WIB): id user -> 1 (jatah main hari ini sudah dipakai)
const REDIS_TAP_RL_PREFIX = "lumine_main_tap_rl_"; // key per user per detik: batas kecepatan klik
const REDIS_TAP_WEEK_PREFIX = "lumine_main_tap_week_"; // sorted set per minggu (WIB): id user -> skor terbaik
const REDIS_TAP_NAMES_KEY = "lumine_main_tap_names"; // hash: id user -> nama tampil di papan skor
const REDIS_TAP_REWARD_LOCK_PREFIX = "lumine_main_tap_reward_"; // lock hadiah per minggu (anti dobel)
// ---- SESI TAMBAHAN TAP CHALLENGE (bayar saldo, hadiah tetap, TANPA undian) ----
const TAP_TIKET_ENABLED = true; // false = matikan sesi tambahan
const TAP_TIKET_HARGA = 2000; // harga satu sesi tambahan (saldo)
const TAP_TIKET_MAX_PER_HARI = 5; // maks sesi tambahan per user per hari (WIB)
const REDIS_TAP_PAID_PREFIX = "lumine_main_tap_paid_"; // hash per hari (WIB): id user -> jumlah sesi tambahan

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
const REDIS_CAD_LOG_KEY = "lumine_main_cad_log"; // LIST riwayat perubahan link cadangan (terbaru di depan)
const REDIS_BUYER_SPEND_KEY = "lumine_main_buyer_spend"; // HASH id pembeli -> total Rp order lunas (sejak fitur ini aktif)
const REDIS_BUYER_FIRST_KEY = "lumine_main_buyer_first"; // HASH id pembeli -> epoch detik pembelian pertama
const REDIS_BUYER_LAST_KEY = "lumine_main_buyer_last"; // HASH id pembeli -> epoch detik pembelian terakhir
const REDIS_BUYER_REJECT_KEY = "lumine_main_buyer_reject"; // HASH id pembeli -> jumlah order ditolak
const REDIS_LB_ALLCNT_KEY = "lumine_main_lb_allcnt";
const REDIS_USERS_KEY = "lumine_main_users";
// ---- HARGA KHUSUS USER BARU BERBATAS WAKTU + PESAN SAMBUTAN ----
const REDIS_JOIN_TS_KEY = "lumine_main_join_ts"; // hash: id user -> waktu pertama masuk bot (ms)
const REDIS_WELCOMED_KEY = "lumine_main_welcomed"; // hash: id user -> 1 (panduan sambutan sudah dikirim)
const NEW_USER_PROMO_DAYS = 3; // harga khusus user baru berlaku N hari sejak pertama masuk bot
const REDIS_NUDGE_DAY_KEY = "lumine_main_newuser_nudge_day"; // tanggal (WIB) terakhir pengingat promo dijalankan
const REDIS_NUDGE_SENT_KEY = "lumine_main_newuser_nudge_sent"; // hash: id user -> 1 (sudah diingatkan)
const NEW_USER_NUDGE_PER_RUN = 100; // batas pesan pengingat per hari
const REDIS_VOUCHERS_KEY = "lumine_main_vouchers";
const REDIS_USER_VOUCHER_PREFIX = "lumine_main_uv_";
const REDIS_KOLEKSI_PREFIX = "lumine_main_koleksi_";
const REDIS_MYSTERY_KEY = "lumine_main_mystery";
const REDIS_SALDO_KEY = "lumine_main_saldo"; // legacy: saldo lama sebelum pemisahan (dipindah otomatis per member)
const REDIS_SALDO_DEP_KEY = "lumine_main_saldo_dep"; // hash: id user -> saldo DEPOSIT (uang asli)
const REDIS_SALDO_FREE_KEY = "lumine_main_saldo_free"; // hash: id user -> saldo GRATISAN (bonus)
const REDIS_SALDO_MIG_KEY = "lumine_main_saldo_mig"; // hash: id user -> 1 (saldo lama sudah dipindah)
const SALDO_GRATIS_MAX_PERCENT = 30; // saldo gratisan hanya boleh menutup maks 30% harga per transaksi
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

// ---- SALDO DUA JENIS: DEPOSIT (uang asli) & GRATISAN (bonus) ----
// Saldo lama dipindah otomatis saat member pertama kali disentuh:
// member yang pernah deposit -> saldo lamanya dianggap deposit; selain itu -> gratisan.
async function isFundAccount(userId) {
  const uid = String(userId);
  if (ADMIN_IDS.includes(uid)) return true;
  const pinned = await redisCommand(["GET", REDIS_ADMIN_ID_KEY]);
  if (pinned && String(pinned) === uid) return true;
  const fund = await getReferralFundId();
  return Boolean(fund) && String(fund) === uid;
}

async function isDepositAccount(userId) {
  if (await isFundAccount(userId)) return true;
  return Number(await redisCommand(["SISMEMBER", REDIS_DEPOSIT_USER_KEY, String(userId)])) === 1;
}

async function ensureSaldoMigrated(userId) {
  const uid = String(userId);
  const claimed = Number(await redisCommand(["HSETNX", REDIS_SALDO_MIG_KEY, uid, "1"]));
  if (claimed !== 1) return;
  try {
    const old = parseInt(await redisCommand(["HGET", REDIS_SALDO_KEY, uid]), 10) || 0;
    if (old !== 0) {
      const key = (await isDepositAccount(uid)) ? REDIS_SALDO_DEP_KEY : REDIS_SALDO_FREE_KEY;
      await redisCommand(["HINCRBY", key, uid, old]);
      await redisCommand(["HDEL", REDIS_SALDO_KEY, uid]);
    }
  } catch (e) {
    await redisCommand(["HDEL", REDIS_SALDO_MIG_KEY, uid]); // gagal: boleh dicoba lagi
    throw e;
  }
}

async function getSaldoSplit(userId) {
  const uid = String(userId);
  await ensureSaldoMigrated(uid);
  const [d, f] = await Promise.all([
    redisCommand(["HGET", REDIS_SALDO_DEP_KEY, uid]),
    redisCommand(["HGET", REDIS_SALDO_FREE_KEY, uid]),
  ]);
  const dep = parseInt(d, 10) || 0;
  const free = parseInt(f, 10) || 0;
  return { dep, free, total: dep + free };
}

// Total saldo (deposit + gratisan), dipakai untuk tampilan.
async function getUserSaldo(userId) {
  return (await getSaldoSplit(userId)).total;
}

// kind: "deposit" | "gratis". Tanpa kind: akun kas admin -> deposit, member -> gratisan.
async function addUserSaldo(userId, amount, kind) {
  const uid = String(userId);
  const addVal = Math.round(Number(amount) || 0);
  await ensureSaldoMigrated(uid);
  const k = kind || ((await isFundAccount(uid)) ? "deposit" : "gratis");
  const key = k === "deposit" ? REDIS_SALDO_DEP_KEY : REDIS_SALDO_FREE_KEY;
  await redisCommand(["HINCRBY", key, uid, addVal]);
  return (await getSaldoSplit(uid)).total;
}

// Ubah saldo deposit langsung (dipakai untuk potong kas admin). Mengembalikan saldo deposit setelahnya.
async function adjustDepositRaw(userId, delta) {
  const uid = String(userId);
  await ensureSaldoMigrated(uid);
  return parseInt(await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, Math.round(delta)]), 10);
}

// Pembayaran khusus saldo deposit (VIP, Mystery Box, Pilih Beberapa Set, kas admin).
async function deductUserSaldo(userId, amount) {
  const uid = String(userId);
  const cost = Math.round(Number(amount) || 0);
  const cur = await getSaldoSplit(uid);
  if (cost <= 0) return { ok: true, balance: cur.total };
  if (cur.dep < cost) return { ok: false, balance: cur.total };
  const after = parseInt(await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, -cost]), 10);
  if (isNaN(after) || after < 0) {
    await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, cost]);
    return { ok: false, balance: cur.total };
  }
  return { ok: true, balance: after + cur.free };
}

// Pembelian pakai saldo: saldo gratisan hanya menutup sebagian kecil (SALDO_GRATIS_MAX_PERCENT)
// sebagai diskon, sisanya wajib dari saldo deposit.
async function payPurchaseWithSaldo(userId, amount) {
  const uid = String(userId);
  const cost = Math.round(Number(amount) || 0);
  const cur = await getSaldoSplit(uid);
  if (cost <= 0) return { ok: true, balance: cur.total, freeUsed: 0, depUsed: 0 };
  const freeUse = Math.min(cur.free, Math.floor((cost * SALDO_GRATIS_MAX_PERCENT) / 100));
  const depUse = cost - freeUse;
  if (cur.dep < depUse) return { ok: false, balance: cur.total, freeUsed: 0, depUsed: 0 };

  const depAfter = parseInt(await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, -depUse]), 10);
  if (isNaN(depAfter) || depAfter < 0) {
    await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, depUse]);
    return { ok: false, balance: cur.total, freeUsed: 0, depUsed: 0 };
  }
  if (freeUse > 0) {
    const freeAfter = parseInt(await redisCommand(["HINCRBY", REDIS_SALDO_FREE_KEY, uid, -freeUse]), 10);
    if (isNaN(freeAfter) || freeAfter < 0) {
      await redisCommand(["HINCRBY", REDIS_SALDO_FREE_KEY, uid, freeUse]);
      await redisCommand(["HINCRBY", REDIS_SALDO_DEP_KEY, uid, depUse]);
      return { ok: false, balance: cur.total, freeUsed: 0, depUsed: 0 };
    }
  }
  return { ok: true, balance: depAfter + (cur.free - freeUse), freeUsed: freeUse, depUsed: depUse };
}

// Kembalikan saldo ke jenis asalnya saat pembayaran gagal di tengah jalan.
async function refundPurchaseSaldo(userId, freeUsed, depUsed) {
  if (freeUsed > 0) await addUserSaldo(userId, freeUsed, "gratis");
  if (depUsed > 0) await addUserSaldo(userId, depUsed, "deposit");
}

// Semua saldo member (lama + baru) untuk statistik admin.
async function getAllSaldoTotals() {
  const [oldRaw, depRaw, freeRaw] = await Promise.all([
    redisCommand(["HGETALL", REDIS_SALDO_KEY]),
    redisCommand(["HGETALL", REDIS_SALDO_DEP_KEY]),
    redisCommand(["HGETALL", REDIS_SALDO_FREE_KEY]),
  ]);
  const totals = {};
  for (const raw of [oldRaw, depRaw, freeRaw]) {
    if (!Array.isArray(raw)) continue;
    for (let i = 0; i < raw.length; i += 2) {
      totals[raw[i]] = (totals[raw[i]] || 0) + (parseInt(raw[i + 1], 10) || 0);
    }
  }
  return Object.values(totals);
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
    `💲 <b>Harga Tier:</b> <code>${formatRupiah(t.price_standar)}</code> per set\n`;
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
      `│    <code>${formatRupiah(t.price_standar)}</code> per set\n`;
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
    `│ • <b>Harga per set</b> : <code>${formatRupiah(t.price_standar)}</code>\n` +
    `│ • Minimal ambil : <b>${RESELLER_MIN_ORDER} set</b> per order\n`;
  out += info.next
    ? `│ 🎯 Naik ke <b>${info.next.name}</b> kurang <code>${formatRupiah(info.remaining)}</code> lagi ` +
      `(harga ${formatRupiah(info.next.price_standar)} per set)\n`
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
      `💲 <b>Harga baru:</b> <code>${formatRupiah(after.tier.price_standar)}</code> per set\n\n` +
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

// ---- FLASH SALE ----
async function getFlashSale() {
  const raw = await redisCommand(["GET", REDIS_FLASHSALE_KEY]);
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || !data.end_ts) return null;
  if (Date.now() >= data.end_ts) return null; // sudah lewat waktu, dianggap tidak aktif
  return data;
}

async function saveFlashSale(data) {
  await redisCommand(["SET", REDIS_FLASHSALE_KEY, JSON.stringify(data)]);
}

async function clearFlashSale() {
  await redisCommand(["DEL", REDIS_FLASHSALE_KEY]);
}

function getFlashSaleRemainingText(fs) {
  const ms = Math.max(0, fs.end_ts - Date.now());
  const totalMin = Math.floor(ms / 60000);
  const jam = Math.floor(totalMin / 60);
  const menit = totalMin % 60;
  if (jam > 0) return `${jam}j ${menit}m lagi`;
  if (menit > 0) return `${menit} menit lagi`;
  return "segera berakhir";
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

  const after = await adjustDepositRaw(fundId, -Math.round(margin));
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

// ---- PAPAN SKOR UNDANG TEMAN MINGGUAN (hanya dihitung saat teman yang diajak sudah belanja) ----
const REDIS_REFLB_PREFIX = "lumine_main_reflb_"; // hash per minggu WIB: id pengundang -> jumlah teman yang sudah belanja
const REDIS_REFLB_PAID_KEY = "lumine_main_reflb_paid"; // minggu terakhir yang hadiahnya sudah dibagikan
const REFLB_HADIAH = [20000, 10000, 5000]; // juara 1, 2, 3 (saldo gratis)
const REFLB_MEDALI = ["🥇", "🥈", "🥉"];
const REFLB_MIN_PESERTA = 3; // minimal jumlah pengundang yang aktif dalam seminggu agar hadiah dibagikan

async function addReferralLeaderboardPoint(referrerId) {
  const { weekKey } = getWibPeriods();
  const key = `${REDIS_REFLB_PREFIX}${weekKey}`;
  await redisCommand(["HINCRBY", key, String(referrerId), 1]);
  await redisCommand(["EXPIRE", key, String(60 * 60 * 24 * 21)]);
}

async function getReferralWeekRows(weekKey) {
  const flat = (await redisCommand(["HGETALL", `${REDIS_REFLB_PREFIX}${weekKey}`])) || [];
  const rows = [];
  for (let i = 0; i < flat.length; i += 2) rows.push({ id: String(flat[i]), n: Number(flat[i + 1]) || 0 });
  return rows.sort((a, b) => b.n - a.n);
}

async function nameOf(ids) {
  if (!ids.length) return [];
  const names = (await redisCommand(["HMGET", REDIS_LB_NAMES_KEY, ...ids])) || [];
  return ids.map((id, i) => (names[i] ? String(names[i]) : `Pembeli ${id.slice(-4)}`));
}

// Dipanggil sekali per hari dari ringkasan harian. Saat minggu berganti, bagikan hadiah minggu sebelumnya.
async function settleReferralWeek(token) {
  const { weekKey } = getWibPeriods();
  const last = await redisCommand(["GET", REDIS_REFLB_PAID_KEY]);
  if (!last) {
    await redisCommand(["SET", REDIS_REFLB_PAID_KEY, weekKey]);
    return;
  }
  if (String(last) === weekKey) return;
  const lock = await redisCommand(["SET", `${REDIS_REFLB_PAID_KEY}_lock_${last}`, "1", "NX", "EX", "604800"]);
  if (lock !== "OK") return; // minggu ini sudah dibagikan

  const rows = (await getReferralWeekRows(String(last))).filter((r) => r.n > 0);
  if (rows.length < REFLB_MIN_PESERTA) {
    // Peserta belum cukup: hadiah tidak dibagikan supaya tidak ada satu orang yang menang sendirian
    const channelId = await getPostChannel();
    if (channelId) {
      await tgRequest(token, "sendMessage", {
        chat_id: channelId,
        parse_mode: "HTML",
        text:
          `🏆 <b>Papan Skor Undang Teman minggu lalu</b>\n\n` +
          `Peserta belum cukup (minimal ${REFLB_MIN_PESERTA} pengundang aktif), jadi hadiah minggu ini belum dibagikan. ` +
          `Minggu baru, kesempatan baru: ajak temanmu lewat menu 👥 Undang Teman!`,
      });
    }
    await redisCommand(["SET", REDIS_REFLB_PAID_KEY, weekKey]);
    return;
  }

  const top = rows.slice(0, REFLB_HADIAH.length);
  const names = await nameOf(top.map((r) => r.id));
  const lines = [];
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    await addUserSaldo(r.id, REFLB_HADIAH[i], "gratis");
    lines.push(`${REFLB_MEDALI[i]} ${escapeHtml(names[i])} — ${r.n} teman, hadiah ${formatRupiah(REFLB_HADIAH[i])}`);
    await tgRequest(token, "sendMessage", {
      chat_id: r.id,
      parse_mode: "HTML",
      text:
        `🏆 <b>Juara ${i + 1} Papan Skor Undang Teman!</b>\n` +
        `Kamu mengajak ${r.n} teman yang sudah belanja minggu lalu.\n` +
        `💰 Saldo masuk: <b>+${formatRupiah(REFLB_HADIAH[i])}</b>`,
    });
  }
  const channelId = await getPostChannel();
  if (channelId && lines.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: channelId,
      parse_mode: "HTML",
      text: `🏆 <b>JUARA UNDANG TEMAN MINGGU LALU</b>\n\n${lines.join("\n")}\n\nMau ikut? Ajak temanmu lewat menu 👥 Undang Teman.`,
    });
  }
  await redisCommand(["SET", REDIS_REFLB_PAID_KEY, weekKey]);
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

  // ANTI CURANG: akun yang diblacklist, atau pengundang & teman yang saling mengundang (loop), tidak dihitung
  if ((await isBanned(referrerId)) || (await isBanned(inviteeId))) return;
  const reverse = await redisCommand(["HGET", REDIS_REF_BY_KEY, String(referrerId)]);
  if (reverse && String(reverse) === inviteeId) return;

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
  try {
    await addReferralLeaderboardPoint(referrerId);
  } catch (lbErr) {
    console.error("Papan skor undang teman error:", lbErr);
  }
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

const QRIS_EXPIRE_MINUTES = 60; // pesanan QRIS yang belum dibayar kedaluwarsa setelah ini

// Pesanan QRIS (punya kode unik) yang masih pending dan sudah lewat batas waktu dianggap kedaluwarsa.
function isQrisOrderExpired(order) {
  if (!order || order.status !== "pending") return false;
  if (!(Number(order.kode_unik) > 0)) return false; // saldo & voucher tidak pakai kode unik
  if (!order.created_ms) return false; // order lama sebelum fitur ini tetap berlaku seperti biasa
  return Date.now() - Number(order.created_ms) > QRIS_EXPIRE_MINUTES * 60 * 1000;
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

  // Order yang masih pending maupun yang sudah tekan Konfirmasi (waiting_acc) boleh dicocokkan makro.
  const valid = [];
  for (const c of candidates) {
    const order = await getOrder(c.orderId);
    if (isQrisOrderExpired(order)) {
      order.status = "expired";
      await saveOrder(c.orderId, order);
      await redisCommand(["HDEL", REDIS_PENDING_MAP_KEY, String(c.orderId)]);
      continue;
    }
    if (order && (order.status === "pending" || order.status === "waiting_acc")) {
      valid.push(order);
    } else {
      await redisCommand(["HDEL", REDIS_PENDING_MAP_KEY, String(c.orderId)]);
    }
  }

  // Pengaman: kalau ada lebih dari satu order aktif dengan nominal yang sama, jangan tebak.
  // Dibiarkan untuk di-ACC manual supaya uang tidak masuk ke order orang lain.
  if (valid.length !== 1) return null;
  return valid[0];
}

function parseNominal(hargaStr) {
  const angka = parseInt(String(hargaStr || "").replace(/\D/g, ""), 10);
  return angka && angka >= 100 ? angka : RETAIL_PRICE_STANDAR;
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

// Ringkasan riwayat pembeli untuk notif admin (dipakai saat cek nominal yang tidak sesuai)
async function buildBuyerStatsBlock(buyerId) {
  const id = String(buyerId);
  const [cnt, spend, last, rej] = await Promise.all([
    redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, id]),
    redisCommand(["HGET", REDIS_BUYER_SPEND_KEY, id]),
    redisCommand(["HGET", REDIS_BUYER_LAST_KEY, id]),
    redisCommand(["HGET", REDIS_BUYER_REJECT_KEY, id]),
  ]);
  const n = parseInt(cnt, 10) || 0;
  const total = parseInt(spend, 10) || 0;
  const rejected = parseInt(rej, 10) || 0;
  const lastSec = parseInt(last, 10) || 0;
  if (!n) return "📊 <b>Pembeli baru</b> (belum pernah ACC)";
  let lastTxt = "-";
  if (lastSec) {
    const hari = Math.floor((Date.now() / 1000 - lastSec) / 86400);
    lastTxt = hari <= 0 ? "hari ini" : `${hari} hari lalu`;
  }
  let line = `📊 <b>Riwayat:</b> ${n}x beli`;
  if (total > 0) line += ` • total ${formatRupiah(total)}`;
  line += ` • terakhir ${lastTxt}`;
  if (rejected) line += ` • ❌ ditolak ${rejected}x`;
  return line;
}

async function getBuyerRejectCount(buyerId) {
  return parseInt(await redisCommand(["HGET", REDIS_BUYER_REJECT_KEY, String(buyerId)]), 10) || 0;
}

const REDIS_OMSET_CREATOR_PREFIX = "lumine_main_omset_cr_"; // HASH per hari (WIB): nama creator -> total Rp lunas

async function recordOmsetPerCreator(order) {
  try {
    const { dayKey } = getWibPeriods();
    const katalogNow = await getKatalog();
    const it = katalogNow.find((k) => String(k.id) === String(order.item_id));
    const creatorName = ((it && it.creator) || "").trim() || "Tanpa creator";
    const nominal = Number(order.final_base_nominal || order.base_nominal) || 0;
    const key = `${REDIS_OMSET_CREATOR_PREFIX}${dayKey}`;
    await redisCommand(["HINCRBY", key, creatorName, nominal]);
    await redisCommand(["EXPIRE", key, "1209600"]);
  } catch (e) {
    console.error("Omset creator error:", e);
  }
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
    redisCommand(["HINCRBY", REDIS_BUYER_SPEND_KEY, memberId, nominal]),
    redisCommand(["HSETNX", REDIS_BUYER_FIRST_KEY, memberId, String(Math.floor(Date.now() / 1000))]),
    redisCommand(["HSET", REDIS_BUYER_LAST_KEY, memberId, String(Math.floor(Date.now() / 1000))]),
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

// ==========================================
// MINI GAME: TAP CHALLENGE
// ==========================================
function getPrevWeekKey() {
  const { weekKey } = getWibPeriods();
  const d = new Date(Date.parse(`${weekKey}T00:00:00Z`) - 7 * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function buildTapHadiahLine() {
  const medals = ["🥇", "🥈", "🥉"];
  return TAP_HADIAH.map((v, i) => `${medals[i]} ${formatRupiah(v)}`).join(" • ");
}

// Posisi user di papan skor minggu tertentu. null = belum punya skor.
async function getTapStanding(weekKey, userId) {
  const zkey = REDIS_TAP_WEEK_PREFIX + weekKey;
  const [rank, score] = await Promise.all([
    redisCommand(["ZREVRANK", zkey, String(userId)]),
    redisCommand(["ZSCORE", zkey, String(userId)]),
  ]);
  if (rank === null || rank === undefined || score === null || score === undefined) return null;
  return { rank: Number(rank) + 1, best: Math.floor(parseFloat(score)) };
}

// Sesi user: { startMs, weekKey, running } atau null kalau tidak ada / sudah dibersihkan Redis.
async function getTapSession(userId) {
  const raw = await redisCommand(["GET", REDIS_TAP_START_PREFIX + String(userId)]);
  if (!raw) return null;
  const [ms, weekKey] = String(raw).split(":");
  const startMs = parseInt(ms, 10);
  if (!startMs || !weekKey) return null;
  return { startMs, weekKey, running: Date.now() <= startMs + TAP_DURASI_DETIK * 1000 };
}

function buildTapResultText(count, standing) {
  let teks = `🏁 <b>Waktu habis!</b>\nSkor kamu: <b>${count} tap</b>.`;
  if (standing) {
    teks += ` Peringkatmu minggu ini: <b>#${standing.rank}</b>.`;
    if (standing.best > count) teks += `\n<i>Skor terbaikmu minggu ini: ${standing.best} tap.</i>`;
  } else {
    teks += " Kamu belum masuk papan skor minggu ini.";
  }
  return teks;
}

async function sendTapMenu(token, chatId, userId) {
  if (!TAP_ENABLED) {
    return tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Tap Challenge sedang tidak aktif." });
  }
  const { dayKey, weekKey } = getWibPeriods();
  const played = Number(await redisCommand(["HEXISTS", REDIS_TAP_DAY_PREFIX + dayKey, String(userId)])) === 1;
  const standing = await getTapStanding(weekKey, userId);

  let teks =
    "👆 <b>TAP CHALLENGE</b>\n" +
    `Tekan tombol <b>👆 Tap!</b> sebanyak mungkin dalam <b>${TAP_DURASI_DETIK} detik</b>.\n\n` +
    "🎟️ 1x main gratis per hari (reset 00:00 WIB)\n" +
    `🎁 <b>Hadiah juara mingguan (saldo):</b> ${buildTapHadiahLine()}\n` +
    "<i>Dibagikan Senin 00:00 WIB berdasarkan skor terbaik minggu itu.</i>\n\n";
  if (standing) teks += `📍 Skor terbaikmu minggu ini: <b>${standing.best} tap</b> (#${standing.rank})\n`;
  const paidUsed = parseInt(await redisCommand(["HGET", REDIS_TAP_PAID_PREFIX + dayKey, String(userId)]), 10) || 0;
  const paidLeft = Math.max(0, TAP_TIKET_MAX_PER_HARI - paidUsed);
  teks += played
    ? "✅ Jatah gratismu hari ini sudah dipakai." +
      (TAP_TIKET_ENABLED && paidLeft > 0
        ? `\n🎟️ Mau main lagi? Sesi tambahan <b>${formatRupiah(TAP_TIKET_HARGA)}</b> (sisa ${paidLeft}x hari ini).`
        : "")
    : "Siap? Tekan Mulai!";

  const rows = [];
  if (!played) rows.push([{ text: "▶️ Mulai", callback_data: "tap_mulai" }]);
  if (played && TAP_TIKET_ENABLED && paidLeft > 0) {
    rows.push([{ text: `🎟️ Sesi Tambahan (${formatRupiah(TAP_TIKET_HARGA)})`, callback_data: "tap_bayar" }]);
  }
  rows.push([{ text: "🏆 Papan Skor Minggu Ini", callback_data: "tap_skor" }]);
  return tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: teks,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendTapSkor(token, chatId, userId) {
  const { weekKey } = getWibPeriods();
  const raw = await redisCommand(["ZREVRANGE", REDIS_TAP_WEEK_PREFIX + weekKey, "0", "9", "WITHSCORES"]);
  const ids = [];
  const skors = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      skors.push(Math.floor(parseFloat(raw[i + 1])) || 0);
    }
  }
  const names = ids.length ? (await redisCommand(["HMGET", REDIS_TAP_NAMES_KEY, ...ids])) || [] : [];
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ids.map((id, i) => {
    const badge = i < 3 ? medals[i] : `<b>${i + 1}.</b>`;
    const nama = (Array.isArray(names) && names[i]) || "Member Lumine";
    return `${badge} <b>${escapeHtml(nama)}</b> — ${skors[i]} tap`;
  });
  const standing = await getTapStanding(weekKey, userId);
  const posisi = standing
    ? `📍 Posisimu: <b>#${standing.rank}</b> (${standing.best} tap)`
    : "📍 Kamu belum punya skor minggu ini.";
  return tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "🏆 <b>PAPAN SKOR TAP CHALLENGE — MINGGU INI</b>\n" +
      `🎁 Hadiah juara: ${buildTapHadiahLine()}\n\n` +
      (lines.length ? lines.join("\n") : "<i>Belum ada skor minggu ini. Jadilah yang pertama!</i>") +
      "\n\n" +
      posisi,
    parse_mode: "HTML",
  });
}

// Semua tombol "tap_*" lewat sini. SENGAJA tidak memakai checkRateLimit global:
// batasnya 12 aksi / 10 detik lalu ban, jadi pemain normal yang tap cepat malah kena ban.
// Di sini batasnya sendiri: maks TAP_MAX_PER_DETIK klik per detik, klik berlebih diabaikan tanpa ban.
async function handleTapCallback(token, call, isCallerAdmin) {
  const uid = String(call.from.id);
  const chatId = call.message.chat.id;
  const messageId = call.message.message_id;
  const data = call.data;
  const answer = (text, alert) =>
    tgRequest(token, "answerCallbackQuery", {
      callback_query_id: call.id,
      ...(text ? { text } : {}),
      ...(alert ? { show_alert: true } : {}),
    }).catch(() => {});

  try {
    if (!isCallerAdmin && (await isBanned(call.from.id))) return;
    if (!TAP_ENABLED) return answer("⚠️ Tap Challenge sedang tidak aktif.", true);

    if (data === "tap_skor") {
      await answer();
      return sendTapSkor(token, chatId, uid);
    }

    // ---- MULAI ----
    if (data === "tap_mulai") {
      const sesi = await getTapSession(uid);
      if (sesi && sesi.running) return answer("⏳ Sesimu sedang berjalan. Tekan 👆 Tap!", true);

      const { dayKey, weekKey } = getWibPeriods();
      const dayHash = REDIS_TAP_DAY_PREFIX + dayKey;
      // Jatah 1x per hari: HSETNX anti klik ganda
      const claimed = await redisCommand(["HSETNX", dayHash, uid, "1"]);
      if (Number(claimed) !== 1) {
        return answer("✅ Kamu sudah main hari ini. Balik lagi besok ya!", true);
      }
      await redisCommand(["EXPIRE", dayHash, String(60 * 60 * 24 * 3)]);

      const ttl = String(TAP_DURASI_DETIK + TAP_SESI_JEDA_DETIK);
      try {
        const nama = call.from.username
          ? maskUsername(call.from.username)
          : String(call.from.first_name || "Member Lumine").slice(0, 12);
        await redisCommand(["SET", REDIS_TAP_CNT_PREFIX + uid, "0", "EX", ttl]);
        await redisCommand(["SET", REDIS_TAP_START_PREFIX + uid, `${Date.now()}:${weekKey}`, "EX", ttl]);
        await redisCommand(["HSET", REDIS_TAP_NAMES_KEY, uid, nama]);
      } catch (e) {
        await redisCommand(["HDEL", dayHash, uid]); // gagal mulai: kembalikan jatah
        throw e;
      }

      await answer("🚀 Mulai! Tap sekarang!");
      const payload = {
        text:
          `👆 <b>TAP SEKARANG!</b> Waktumu ${TAP_DURASI_DETIK} detik.\n` +
          "<i>Setelah waktu habis, tekan tombol sekali lagi untuk melihat skor akhirmu.</i>",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "👆 Tap!", callback_data: "tap_klik" }]] },
      };
      const edited = await tgRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, ...payload });
      if (!edited || !edited.ok) await tgRequest(token, "sendMessage", { chat_id: chatId, ...payload });
      return;
    }

    // ---- SESI TAMBAHAN BERBAYAR (saldo) ----
    if (data === "tap_bayar") {
      if (!TAP_TIKET_ENABLED) return answer("⚠️ Sesi tambahan sedang tidak tersedia.", true);
      const sesiBayar = await getTapSession(uid);
      if (sesiBayar && sesiBayar.running) return answer("⏳ Sesimu sedang berjalan. Tekan 👆 Tap!", true);

      const { dayKey, weekKey } = getWibPeriods();
      const paidHash = REDIS_TAP_PAID_PREFIX + dayKey;
      // Klaim slot dulu supaya klik ganda tidak lolos batas harian
      const used = parseInt(await redisCommand(["HINCRBY", paidHash, uid, "1"]), 10) || 0;
      await redisCommand(["EXPIRE", paidHash, String(60 * 60 * 24 * 3)]);
      if (used > TAP_TIKET_MAX_PER_HARI) {
        await redisCommand(["HINCRBY", paidHash, uid, "-1"]);
        return answer(`✅ Batas ${TAP_TIKET_MAX_PER_HARI} sesi tambahan hari ini sudah tercapai.`, true);
      }

      const bayar = await payPurchaseWithSaldo(uid, TAP_TIKET_HARGA);
      if (!bayar.ok) {
        await redisCommand(["HINCRBY", paidHash, uid, "-1"]);
        return answer(`💰 Saldo kurang. Butuh ${formatRupiah(TAP_TIKET_HARGA)}.`, true);
      }

      const ttlBayar = String(TAP_DURASI_DETIK + TAP_SESI_JEDA_DETIK);
      try {
        const nama = call.from.username
          ? maskUsername(call.from.username)
          : String(call.from.first_name || "Member Lumine").slice(0, 12);
        await redisCommand(["SET", REDIS_TAP_CNT_PREFIX + uid, "0", "EX", ttlBayar]);
        await redisCommand(["SET", REDIS_TAP_START_PREFIX + uid, `${Date.now()}:${weekKey}`, "EX", ttlBayar]);
        await redisCommand(["HSET", REDIS_TAP_NAMES_KEY, uid, nama]);
      } catch (e) {
        // Gagal mulai: kembalikan saldo dan slot
        await refundPurchaseSaldo(uid, bayar.freeUsed, bayar.depUsed);
        await redisCommand(["HINCRBY", paidHash, uid, "-1"]);
        throw e;
      }

      await answer("🚀 Mulai! Tap sekarang!");
      const payloadBayar = {
        text:
          `👆 <b>TAP SEKARANG!</b> Waktumu ${TAP_DURASI_DETIK} detik. <i>(sesi tambahan)</i>\n` +
          "<i>Setelah waktu habis, tekan tombol sekali lagi untuk melihat skor akhirmu.</i>",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "👆 Tap!", callback_data: "tap_klik" }]] },
      };
      const editedBayar = await tgRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, ...payloadBayar });
      if (!editedBayar || !editedBayar.ok) await tgRequest(token, "sendMessage", { chat_id: chatId, ...payloadBayar });
      return;
    }

    // ---- KLIK TAP ----
    if (data === "tap_klik") {
      const now = Date.now();

      // Batas kecepatan per user per detik (klik berlebih tidak dihitung)
      const rlKey = `${REDIS_TAP_RL_PREFIX}${uid}_${Math.floor(now / 1000)}`;
      const rl = parseInt(await redisCommand(["INCR", rlKey]), 10) || 0;
      if (rl === 1) await redisCommand(["EXPIRE", rlKey, "3"]);
      if (rl > TAP_MAX_PER_DETIK) return answer();

      const sesi = await getTapSession(uid);
      if (!sesi) {
        await answer("⌛ Sesi sudah selesai. Buka 👆 Tap Challenge untuk melihat papan skor.", true);
        await tgRequest(token, "editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        }).catch(() => {});
        return;
      }

      // Waktu habis: tolak klik, tampilkan skor akhir
      if (now > sesi.startMs + TAP_DURASI_DETIK * 1000) {
        const count = parseInt(await redisCommand(["GET", REDIS_TAP_CNT_PREFIX + uid]), 10) || 0;
        const standing = await getTapStanding(sesi.weekKey, uid);
        await answer("⌛ Waktu habis!");
        await tgRequest(token, "editMessageText", {
          chat_id: chatId,
          message_id: messageId,
          text: buildTapResultText(count, standing),
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "🏆 Papan Skor", callback_data: "tap_skor" }]] },
        }).catch(() => {});
        return;
      }

      // Hitung di server. Skor di sorted set = tap + pecahan kecil (tie-break: yang lebih dulu mencapai skor itu menang).
      // ZADD GT: hanya naik, jadi skor terbaik minggu itu yang tersimpan.
      const n = parseInt(await redisCommand(["INCR", REDIS_TAP_CNT_PREFIX + uid]), 10) || 0;
      const weekStartMs = Date.parse(`${sesi.weekKey}T00:00:00+07:00`);
      const skor = n + (1 - (now - weekStartMs) / 1e9);
      const zkey = REDIS_TAP_WEEK_PREFIX + sesi.weekKey;
      await Promise.all([
        redisCommand(["ZADD", zkey, "GT", String(skor), uid]),
        redisCommand(["EXPIRE", zkey, "1209600"]),
      ]);
      return answer(`👆 ${n}`);
    }

    return answer();
  } catch (e) {
    console.error("Tap Challenge error:", e);
    await answer("⚠️ Terjadi gangguan, coba lagi.");
  }
}

// ---- HADIAH JUARA TAP CHALLENGE MINGGUAN ----
// Aman dipanggil berkali-kali: hanya jalan sekali per minggu (lock).
async function awardTapWeek(token, weekKey) {
  if (!TAP_ENABLED) return { ok: false, reason: "disabled" };
  const lockKey = `${REDIS_TAP_REWARD_LOCK_PREFIX}${weekKey}`;
  const lock = await redisCommand(["SET", lockKey, "1", "NX", "EX", "5184000"]);
  if (lock !== "OK") return { ok: false, reason: "already" };

  const raw = await redisCommand([
    "ZREVRANGE",
    REDIS_TAP_WEEK_PREFIX + weekKey,
    "0",
    String(TAP_HADIAH.length - 1),
    "WITHSCORES",
  ]);
  const winners = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      winners.push({ userId: raw[i], skor: Math.floor(parseFloat(raw[i + 1])) || 0 });
    }
  }
  const names = winners.length
    ? (await redisCommand(["HMGET", REDIS_TAP_NAMES_KEY, ...winners.map((w) => w.userId)])) || []
    : [];

  const medals = ["🥇", "🥈", "🥉"];
  const awarded = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    if (w.skor < 1) continue;
    const hadiah = TAP_HADIAH[i];
    try {
      const saldoBaru = await addUserSaldo(w.userId, hadiah);
      awarded.push({ rank: i + 1, userId: w.userId, nama: names[i] || "Member Lumine", skor: w.skor, hadiah });
      await logAdminAction(
        `🎮 Hadiah Tap Challenge minggu ${weekKey}: #${i + 1} ${w.userId} skor ${w.skor} +${formatRupiah(hadiah)}`
      ).catch(() => {});
      await tgRequest(token, "sendMessage", {
        chat_id: w.userId,
        text:
          `🏆 <b>SELAMAT! KAMU JUARA #${i + 1} TAP CHALLENGE</b> ${medals[i]}\n` +
          `Minggu ${weekKey} • skor terbaik <b>${w.skor} tap</b>\n\n` +
          `🎁 <b>Hadiah:</b> +<code>${formatRupiah(hadiah)}</code> saldo\n` +
          `💳 <b>Saldo Kamu Sekarang:</b> <code>${formatRupiah(saldoBaru)}</code>`,
        parse_mode: "HTML",
      }).catch(() => {});
    } catch (e) {
      console.error(`Hadiah Tap Challenge gagal (minggu ${weekKey}, user ${w.userId}, hadiah ${hadiah}):`, e);
    }
  }

  if (awarded.length > 0) {
    const lines = awarded
      .map((a) => `${medals[a.rank - 1]} <b>${escapeHtml(a.nama)}</b> (<code>${a.userId}</code>) — ${a.skor} tap ➜ +${formatRupiah(a.hadiah)}`)
      .join("\n");
    const qris = await getQris();
    if (qris && qris.admin_chat_id) {
      await tgRequest(token, "sendMessage", {
        chat_id: qris.admin_chat_id,
        text: `🎮 <b>HADIAH TAP CHALLENGE ${weekKey} DIBAGIKAN</b>\n\n${lines}`,
        parse_mode: "HTML",
      }).catch(() => {});
    }
  }
  return { ok: true, awarded };
}

// Dipanggil tiap ada pesan masuk: cek murah (1 GET), baru jalan kalau minggu lalu belum dibagikan.
async function maybeAwardTapLastWeek(token) {
  if (!TAP_ENABLED) return;
  const weekKey = getPrevWeekKey();
  const done = await redisCommand(["GET", `${REDIS_TAP_REWARD_LOCK_PREFIX}${weekKey}`]);
  if (done) return;
  await awardTapWeek(token, weekKey);
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
    created_ms: Date.now(),
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
  try {
    await addUndianTickets(token, order);
  } catch (utErr) {
    console.error("Tiket undian error:", utErr);
  }
  try {
    await trackCommunityTarget(token, order);
  } catch (tgErr) {
    console.error("Target komunitas error:", tgErr);
  }
  try {
    await sendTestiReminder(token, order.buyer_id);
  } catch (tiErr) {
    console.error("Pengingat testimoni error:", tiErr);
  }
  return result;
}

// Potong bonus Reseller Prem dari saldo kas admin. Tidak memblokir bonus (pembeli sudah bayar),
// jadi saldo kas boleh minus sebagai tanda admin perlu isi ulang.
async function chargeFundForResellerPrem(token, buyerName) {
  if (!RESELLER_PREM_FROM_ADMIN_SALDO || !(RESELLER_PREM_BONUS_SALDO > 0)) return null;
  const fundId = await getReferralFundId();
  if (!fundId) return null;

  const after = await adjustDepositRaw(fundId, -Math.round(RESELLER_PREM_BONUS_SALDO));
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

// ==========================================
// 4C. PRE ORDER: bayar dulu, file dikirim otomatis saat admin /rilispo
// ==========================================
async function processPreorderPaid(token, order) {
  order.status = "preorder";
  order.po_paid_ms = Date.now();
  await saveOrder(order.id, order);

  const itemId = String(order.item_id || "");
  await redisCommand(["HSET", REDIS_PO_PREFIX + itemId, String(order.id), String(order.buyer_id)]);

  const katalogList = await getKatalog();
  const idx = katalogList.findIndex((k) => String(k.id) === itemId);
  const item = idx !== -1 ? katalogList[idx] : null;

  // Omset, leaderboard & hitungan terjual dihitung saat pembayaran lunas
  await recordPurchaseToLeaderboard(order);
  if (!order.is_deposit) await recordOmsetPerCreator(order);
  await addStoreOmset(order.total_nominal);
  if (await isReseller(order.buyer_id)) {
    await addResellerOmset(order.buyer_id, order.total_nominal);
  }
  if (item) {
    item.sold = (Number(item.sold) || 0) + 1;
    await saveKatalog(katalogList);
  }

  const etaLine = item && item.po_eta ? `📅 Perkiraan rilis: <b>${escapeHtml(item.po_eta)}</b>\n` : "";
  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    parse_mode: "HTML",
    text:
      `🕒 <b>PRE ORDER DITERIMA! (Pesanan #${order.id})</b>\n\n` +
      `📦 <b>${escapeHtml(order.item_nama)}</b>\n` +
      `Pembayaranmu sudah kami terima. Set ini belum rilis, jadi file akan otomatis dikirim ke chat ini begitu sudah siap.\n` +
      etaLine +
      `\n<i>Kamu tidak perlu order ulang. Harga sudah terkunci.</i>`,
    reply_markup: { inline_keyboard: [[{ text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" }]] },
  });

  try {
    const qris = await getQris();
    const adminChat = qris && qris.admin_chat_id;
    if (adminChat) {
      await tgRequest(token, "sendMessage", {
        chat_id: adminChat,
        text:
          `🕒 PO baru #${order.id}\n👤 ${order.buyer_name}\n📦 ${order.item_nama}\n\n` +
          `Saat set siap, kirim file ke semua pembeli PO dengan: /rilispo ${idx !== -1 ? idx + 1 : "NO"}`,
      });
    }
  } catch (poNotifErr) {
    console.error("Notif PO admin error:", poNotifErr);
  }

  return { deliveredName: order.item_nama, deliveredLink: "", preorder: true };
}

async function releasePreorders(token, katalogList, idx) {
  const item = katalogList[idx];
  const itemId = String(item.id);
  // Pakai link & file TERBARU dari katalog (admin biasanya mengisinya setelah pesanan masuk)
  const links =
    Array.isArray(item.links) && item.links.length > 0
      ? item.links.map(normalizeUrl)
      : item.link
      ? [normalizeUrl(item.link)]
      : [];
  const files = Array.isArray(item.files) ? item.files : [];

  const flat = (await redisCommand(["HGETALL", REDIS_PO_PREFIX + itemId])) || [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const orderId = String(flat[i]);
    const order = await getOrder(orderId);
    if (!order || order.status !== "preorder") {
      await redisCommand(["HDEL", REDIS_PO_PREFIX + itemId, orderId]);
      continue;
    }
    try {
      const linksBlock =
        links.length > 0
          ? links.map((l) => `🔗 ${escapeHtml(l)}`).join("\n")
          : "<i>(File dikirim langsung di pesan berikutnya)</i>";
      await tgRequest(token, "sendMessage", {
        chat_id: order.buyer_id,
        parse_mode: "HTML",
        text:
          `🎉 <b>PRE ORDER SUDAH RILIS! (Pesanan #${order.id})</b>\n\n` +
          `Set <b>${escapeHtml(item.nama)}</b> yang kamu pesan sudah siap.\n` +
          `Berikut akses file kamu:\n${linksBlock}\n\n` +
          `<i>Link tersimpan otomatis di 🎒 Koleksi Saya.</i>`,
        reply_markup: {
          inline_keyboard: [
            ...links.slice(0, 8).map((link, n) => [
              { text: links.length > 1 ? `📂 Buka File ${n + 1}` : "📂 Buka Link File Sekarang", url: link },
            ]),
            [{ text: "⭐ Beri Rating & Ulasan", callback_data: `rate_init_${order.id}` }],
          ],
        },
      });
      for (const f of files) {
        if (!f || !f.file_id) continue;
        if (f.type === "document") {
          await tgRequest(token, "sendDocument", { chat_id: order.buyer_id, document: f.file_id });
        } else {
          await tgRequest(token, "sendPhoto", { chat_id: order.buyer_id, photo: f.file_id });
        }
      }
      await addKoleksi(order.buyer_id, item.nama, links[0] || "");
      order.status = "acc";
      order.po_released_ms = Date.now();
      order.target_links = links;
      await saveOrder(order.id, order);
      await redisCommand(["HDEL", REDIS_PO_PREFIX + itemId, orderId]);
      sent++;
    } catch (releaseErr) {
      failed++;
      console.error(`Rilis PO #${orderId} gagal:`, releaseErr);
    }
  }
  return { sent, failed };
}

async function processAccOrderCore(token, order) {
  order.status = "acc";
  await saveOrder(order.id, order);

  // KHUSUS ORDER DEPOSIT SALDO (AUTO-ACC)
  if (order.is_deposit) {
    const depositAmount = Number(order.base_nominal) || 0;
    const newSaldo = await addUserSaldo(order.buyer_id, depositAmount, "deposit");
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

  // KHUSUS ORDER PRE ORDER: pembayaran diterima sekarang, file dikirim saat admin pakai /rilispo
  if (order.is_preorder) {
    return await processPreorderPaid(token, order);
  }

  // KHUSUS PATUNGAN: bagian dicatat, produk dikirim saat terkumpul penuh
  if (order.is_patungan) {
    return await processPatunganPaid(token, order);
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

  let isDupeSaldo = false;
  if (order.is_mystery) {
    const pool = katalogList.map((k) => ({
      id: String(k.id),
      nama: k.nama,
      harga: k.harga,
      links:
        Array.isArray(k.links) && k.links.length > 0 ? k.links : k.link ? [k.link] : [],
      files: Array.isArray(k.files) ? k.files : [],
    }));
    const ownedSet = await getOwnedNameSet(order.buyer_id);
    const freshPool = pool.filter((p) => !ownedSet.has(String(p.nama).toLowerCase().trim()));
    let won;
    if (pool.length === 0) {
      won = { id: "", nama: "Paket Spesial Lumine", links: [`https://t.me/${ADMIN_USERNAME}`], files: [] };
    } else if (freshPool.length === 0) {
      won = null; // semua set sudah dimiliki member
    } else {
      won = pickMysteryPrize(freshPool);
    }

    if (!won) {
      isDupeSaldo = true;
      await addUserSaldo(order.buyer_id, MYSTERY_DUPE_SALDO);
      soldItemId = "";
      deliveredName = `Saldo Pengganti ${formatRupiah(MYSTERY_DUPE_SALDO)}`;
      deliveredLinks = [];
    } else {
      soldItemId = won.id;
      deliveredName = won.nama;
      deliveredLinks = (won.links || []).map(normalizeUrl);
    }
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
    if (isDupeSaldo) {
      buyerText =
        `🎲 <b>MYSTERY BOX TERBUKA! (Pesanan #${order.id})</b> 🎲\n\n` +
        "Set yang keluar dari box ini sudah pernah kamu miliki, jadi kamu dapat saldo pengganti:\n" +
        `💰 <b>+${formatRupiah(MYSTERY_DUPE_SALDO)}</b>\n\n` +
        "<i>Saldo bisa dipakai belanja di bot.</i>";
    }
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
    order.is_deposit ? Promise.resolve() : recordOmsetPerCreator(order),
    isDupeSaldo ? Promise.resolve() : addKoleksi(order.buyer_id, deliveredName, deliveredLinks[0] || ""),
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

  // Notif omset langsung ke admin setiap ada penjualan lunas (bisa dimatikan lewat OMSET_LIVE_NOTIF)
  if (OMSET_LIVE_NOTIF && !order.is_deposit) {
    try {
      const qrisLive = await getQris();
      const adminLive = qrisLive && qrisLive.admin_chat_id;
      const liveTarget = await resolveOmsetTarget(adminLive);
      if (liveTarget) {
        const todayLive = await getDailyOmset(wibDayKey(Date.now()));
        const metode = order.paid_with_saldo ? "Saldo" : "QRIS";
        await tgRequest(token, "sendMessage", {
          chat_id: liveTarget,
          parse_mode: "HTML",
          text:
            `🧾 <b>#${order.id}</b> • ${escapeHtml(getWibTimestamp())}\n` +
            `👤 ${escapeHtml(order.buyer_name || "Member")}\n` +
            `📦 ${escapeHtml(order.item_nama || "Pesanan")}\n` +
            `💰 <b>+${formatRupiah(order.total_nominal)}</b> • ${metode}\n` +
            `📊 Omset hari ini: <b>${formatRupiah(todayLive.rupiah)}</b> (${todayLive.count} transaksi)`,
        });
      }
    } catch (liveErr) {
      console.error("Notif omset live error:", liveErr);
    }
  }

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
      [{ text: "🎁 Promo Saya" }, { text: "⏳ Cek Jeda" }],
      [{ text: "👆 Tap Challenge" }],
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
      `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>`
  );
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
    getSaldoSplit(userId),
    redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)]),
  ]);
  const tier = getTierBadge(allCnt || 0);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `💳 <b>DOMPET SALDO LUMINE</b> [${tier}]\n\n` +
      `╭─── 💰 <b>INFO AKUN KAMU</b> ───\n` +
      `│ • <b>Saldo Deposit :</b> <code>${formatRupiah(saldo.dep)}</code>\n` +
      `│ • <b>Saldo Gratisan :</b> <code>${formatRupiah(saldo.free)}</code> <i>(diskon max ${SALDO_GRATIS_MAX_PERCENT}%)</i>\n` +
      `│ • <b>Total Saldo :</b> <code>${formatRupiah(saldo.total)}</code>\n` +
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
  const flashSale = await getFlashSale();
  const flashBannerLine = flashSale
    ? `\n⚡⚡⚡ <b>FLASH SALE AKTIF!</b> ⚡⚡⚡\n` +
      `📦 ${escapeHtml(flashSale.item_nama)} — <s>${formatRupiah(flashSale.original_nominal)}</s> ➜ <b>${formatRupiah(flashSale.flash_price)}</b>\n` +
      `⏱️ ${getFlashSaleRemainingText(flashSale)}!\n`
    : "";
  const cardText =
    "✨ <b>LUMINE PHOTOPACK</b> ✨\n" +
    "<i>Koleksi HD Eksklusif • Tanpa Watermark</i>\n" +
    flashBannerLine +
    "\n" +
    `• <b>Harga set:</b> <code>${formatRupiah(RETAIL_PRICE_STANDAR)}</code>\n` +
    `• <b>Mystery Box:</b> <code>${formatRupiah(mysteryCfg.price || 3000)}</code>\n\n` +
    "Pilih menu di bawah 👇";

  const inlineMarkup = {
    inline_keyboard: [
      ...(flashSale
        ? [[{ text: `⚡ FLASH SALE: ${flashSale.item_nama}`.slice(0, 60), callback_data: `detail_${flashSale.item_id}` }]]
        : []),
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
  const flashSale = await getFlashSale();

  const keyboard = [
    ...(flashSale
      ? [[{ text: `⚡ FLASH SALE: ${flashSale.item_nama}`.slice(0, 60), callback_data: `detail_${flashSale.item_id}` }]]
      : []),
    ...(MINI_SET_ENABLED ? [[{ text: `🧩 Mini Set (${miniCount})`, callback_data: "menu_katalog_mini" }]] : []),
    [{ text: `📦 Full Set (${fullCount})`, callback_data: "menu_katalog_full" }],
  ];
  if (creatorGroups.length > 0) {
    keyboard.push([
      { text: `👤 Pilih Creator (${creatorGroups.length})`, callback_data: "menu_katalog_creator" },
    ]);
  }
  if (VIP_ENABLED) keyboard.push([{ text: "💎 VIP Semua Set", callback_data: "vip_menu" }]);
  keyboard.push([{ text: "🧺 Pilih Beberapa Set", callback_data: "pick_menu" }]);
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

async function sendPhotopackTextList(token, chatId) {
  const katalogList = (await getKatalog()).filter(isCategoryEnabled);
  if (katalogList.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `📂 Katalog Photopack sedang diperbarui. Hubungi @${ADMIN_USERNAME} untuk info stok terbaru.`,
    });
    return;
  }

  const sections = [
    { label: "🧩 <b>MINI SET</b>", items: katalogList.filter((k) => (k.kategori || "mini") !== "full") },
    { label: "📦 <b>FULL SET</b>", items: katalogList.filter((k) => k.kategori === "full") },
  ];

  const lines = [];
  for (const sec of sections) {
    if (sec.items.length === 0) continue;
    lines.push(`\n${sec.label} (${sec.items.length} set)`);
    sec.items.forEach((item, idx) => {
      const crPart = item.creator ? ` • 👤 ${escapeHtml(item.creator)}` : "";
      lines.push(`${idx + 1}. ${escapeHtml(item.nama)} — ${escapeHtml(String(item.harga))}${crPart}`);
    });
  }

  const header = `🛍️ <b>DAFTAR PHOTOPACK</b> (total ${katalogList.length} set)\n`;
  const footer = "\n<i>Mau lihat preview & bayar? Buka 🛍️ Katalog.</i>";

  // Pecah per ±3500 karakter agar tidak melebihi limit 4096 Telegram
  const chunks = [];
  let cur = header;
  for (const ln of lines) {
    const add = "\n" + ln;
    if (cur.length + add.length > 3500) {
      chunks.push(cur);
      cur = "";
      cur += ln;
    } else {
      cur += add;
    }
  }
  if (cur.length + footer.length > 3500) {
    chunks.push(cur);
    cur = "";
  }
  chunks.push(cur + footer);

  for (const part of chunks) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: part, parse_mode: "HTML" });
  }
}

// ---- VIP SEMUA SET (sekali bayar via saldo, semua set bisa diambil gratis) ----
const VIP_ENABLED = true;
const VIP_PRICE = 500000; // harga VIP (Rp)
const REDIS_VIP_KEY = "lumine_main_vip"; // hash: id user -> tanggal beli VIP

async function isVipUser(userId) {
  const v = await redisCommand(["HGET", REDIS_VIP_KEY, String(userId)]);
  return !!v;
}

async function sendVipMenu(token, chatId, userId) {
  const katalog = await getKatalog();
  const saldo = await getUserSaldo(userId);
  if (await isVipUser(userId)) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        "💎 <b>VIP SEMUA SET</b>\n\n" +
        "✅ Kamu sudah VIP. Semua set di katalog bisa kamu ambil <b>gratis</b>, termasuk set yang ditambahkan nanti.\n\n" +
        "<i>Buka set di katalog lalu tekan 🎁 Ambil Gratis (VIP).</i>",
      reply_markup: { inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]] },
    });
    return;
  }
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "💎 <b>VIP SEMUA SET</b>\n\n" +
      `Bayar sekali <b>${formatRupiah(VIP_PRICE)}</b> dari saldo, lalu semua set di katalog bisa kamu ambil gratis, termasuk set baru.\n\n` +
      `📦 Set tersedia saat ini: <b>${katalog.length}</b>\n` +
      `💳 Saldo kamu: <code>${formatRupiah(saldo)}</code>`,
    reply_markup: {
      inline_keyboard: [
        [{ text: `💳 Beli VIP (${formatRupiah(VIP_PRICE)})`, callback_data: "vip_buy" }],
        [{ text: "➕ Isi Saldo", callback_data: "menu_saldo" }],
        [{ text: "🔙 Katalog", callback_data: "menu_katalog" }],
      ],
    },
  });
}

async function buyVipViaSaldo(token, chatId, from) {
  const userId = String(from.id);
  if (await isVipUser(userId)) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Kamu sudah VIP." });
    return;
  }
  const d = await deductUserSaldo(userId, VIP_PRICE);
  if (!d.ok) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `⚠️ <b>Saldo Tidak Cukup!</b>\nHarga VIP: <code>${formatRupiah(VIP_PRICE)}</code>\n` +
        `Saldo kamu: <code>${formatRupiah(d.balance)}</code>`,
      reply_markup: { inline_keyboard: [[{ text: "➕ Isi Saldo Sekarang", callback_data: "menu_saldo" }]] },
    });
    return;
  }
  const set = Number(await redisCommand(["HSETNX", REDIS_VIP_KEY, userId, new Date().toISOString()]));
  if (set !== 1) {
    // sudah VIP (klik ganda): kembalikan saldo
    await addUserSaldo(userId, VIP_PRICE, "deposit");
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Kamu sudah VIP. Saldo dikembalikan." });
    return;
  }
  try {
    await addStoreOmset(VIP_PRICE);
  } catch (e) {
    console.error("Omset VIP gagal dicatat:", e);
  }
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🎉 <b>VIP aktif!</b>\nSemua set di katalog sekarang bisa kamu ambil gratis.\n` +
      `💳 Sisa saldo: <code>${formatRupiah(d.balance)}</code>`,
    reply_markup: { inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]] },
  });
}

async function sendVipGet(token, chatId, from, itemId) {
  const userId = String(from.id);
  if (!(await isVipUser(userId))) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "💎 Fitur ini khusus member VIP.",
      reply_markup: { inline_keyboard: [[{ text: "💎 Lihat VIP", callback_data: "vip_menu" }]] },
    });
    return;
  }
  const katalog = await getKatalog();
  const item = katalog.find((k) => String(k.id) === String(itemId));
  if (!item) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Set ini sudah dihapus atau diperbarui oleh admin." });
    return;
  }
  const links = Array.isArray(item.links) && item.links.length > 0 ? item.links : item.link ? [item.link] : [];
  if (links.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `📂 Set <b>${escapeHtml(item.nama)}</b> dikirim manual oleh admin. Hubungi @${ADMIN_USERNAME} ya.`,
      parse_mode: "HTML",
    });
    return;
  }
  const normalized = links.map(normalizeUrl);
  await addKoleksi(userId, item.nama, normalized[0] || "");
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🎁 <b>${escapeHtml(item.nama)}</b> (VIP, gratis)\n` +
      normalized.map((l) => `🔗 ${escapeHtml(l)}`).join("\n") +
      "\n\n<i>Tersimpan juga di 🎒 Koleksi Saya.</i>",
    reply_markup: {
      inline_keyboard: normalized.slice(0, 8).map((link, i) => [
        { text: normalized.length > 1 ? `📂 Buka File ${i + 1}` : "📂 Buka Link File Sekarang", url: link },
      ]),
    },
  });
}

// ---- REFERRAL APLIKASI (member kirim ID + nama profil + screenshot, admin ACC, saldo masuk) ----
const APPREF_ENABLED = true;
const APPREF_REWARD = 5000; // hadiah per akun yang di-ACC (Rp)
const APPREF_DAILY_CAP = 5; // maksimal klaim ter-ACC per member per hari (WIB)
const APPREF_DEFAULT_NAME = "Aplikasi Referral";
const APPREF_DEFAULT_LINK = "https://GANTI-LINK-REFERRAL";
const REDIS_APPREF_CFG_KEY = "lumine_main_appref_cfg"; // JSON: { name, link, enabled } hasil /setappref
const REDIS_APPREF_STATE_KEY = "lumine_main_appref_state"; // hash: id user -> JSON { step, appId, name }
const REDIS_APPREF_REQ_KEY = "lumine_main_appref_req"; // hash: id klaim -> JSON data klaim
const REDIS_APPREF_SEQ_KEY = "lumine_main_appref_seq";
const REDIS_APPREF_IDS_KEY = "lumine_main_appref_ids"; // hash: ID aplikasi -> id klaim (anti pakai ulang)
const REDIS_APPREF_DAILY_PREFIX = "lumine_main_appref_day_"; // hash per hari (WIB): id user -> jumlah ACC

function getApprefDayKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getApprefCfg() {
  const cfg = { name: APPREF_DEFAULT_NAME, link: APPREF_DEFAULT_LINK, enabled: true };
  const saved = parseJsonSafe(await redisCommand(["GET", REDIS_APPREF_CFG_KEY]));
  if (saved) Object.assign(cfg, saved);
  return cfg;
}

function isUsableLink(link) {
  return /^https?:\/\/\S+\.\S+/.test(String(link || "")) && !String(link).includes("GANTI");
}

async function getApprefDailyUsed(userId) {
  return Number(await redisCommand(["HGET", REDIS_APPREF_DAILY_PREFIX + getApprefDayKey(), String(userId)])) || 0;
}

async function sendApprefInfo(token, chatId, userId) {
  const cfg = await getApprefCfg();
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    });
  const backBtn = [[{ text: "🔙 Menu Lainnya", callback_data: "menu_lainnya" }]];
  if (!APPREF_ENABLED || !cfg.enabled) {
    return sendMsg("⚠️ Referral aplikasi sedang tidak aktif.", { inline_keyboard: backBtn });
  }
  const used = await getApprefDailyUsed(userId);
  const btns = [];
  if (isUsableLink(cfg.link)) btns.push([{ text: "🔗 Download & Daftar", url: cfg.link }]);
  btns.push([{ text: "📝 Kirim Bukti Referral", callback_data: "appref_start" }]);
  btns.push(...backBtn);
  return sendMsg(
    `📱 <b>REFERRAL ${escapeHtml(cfg.name.toUpperCase())}</b>\n\n` +
      "1️⃣ Download dan daftar lewat tombol di bawah.\n" +
      "2️⃣ Buka <b>profil</b> di aplikasi, lalu salin <b>ID</b>-mu.\n" +
      "3️⃣ Tekan <b>Kirim Bukti Referral</b>, isi ID, nama profil, dan screenshot.\n\n" +
      `💰 Hadiah: <b>${formatRupiah(APPREF_REWARD)}</b> per akun yang di-ACC, masuk ke saldo.\n` +
      `📊 Klaim di-ACC hari ini: ${used}/${APPREF_DAILY_CAP}\n` +
      "<i>Bukti dicek admin. ID dan nama profil di bukti harus sama dengan yang kamu isi.</i>",
    { inline_keyboard: btns }
  );
}

async function startApprefClaim(token, chatId, userId) {
  const cfg = await getApprefCfg();
  const sendMsg = (text) => tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  if (!APPREF_ENABLED || !cfg.enabled) return sendMsg("⚠️ Referral aplikasi sedang tidak aktif.");
  const used = await getApprefDailyUsed(userId);
  if (used >= APPREF_DAILY_CAP) {
    return sendMsg(`⏳ Batas klaim hari ini (${APPREF_DAILY_CAP}) sudah tercapai. Coba lagi besok ya.`);
  }
  await redisCommand(["HSET", REDIS_APPREF_STATE_KEY, String(userId), JSON.stringify({ step: "id" })]);
  return sendMsg(
    "📝 <b>Langkah 1/3</b>\nKirim <b>ID</b> profil kamu di aplikasi (salin dari halaman profil, lalu paste ke sini).\n" +
      "<i>Ketik /batal untuk membatalkan.</i>"
  );
}

// Dipanggil untuk pesan teks member. Return true kalau pesan ini bagian dari alur referral.
async function handleApprefText(token, msg, userId, text) {
  const chatId = msg.chat.id;
  const uid = String(userId);
  const st = parseJsonSafe(await redisCommand(["HGET", REDIS_APPREF_STATE_KEY, uid]));
  if (!st) return false;
  const sendMsg = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
  const input = String(text || "").trim();

  if (/^\/batal$/i.test(input)) {
    await redisCommand(["HDEL", REDIS_APPREF_STATE_KEY, uid]);
    await sendMsg("❌ Klaim referral dibatalkan.");
    return true;
  }

  if (st.step === "id") {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(input)) {
      await sendMsg("⚠️ ID tidak valid. Salin ulang ID dari profil (tanpa spasi), atau ketik /batal.");
      return true;
    }
    if (Number(await redisCommand(["HEXISTS", REDIS_APPREF_IDS_KEY, input])) === 1) {
      await redisCommand(["HDEL", REDIS_APPREF_STATE_KEY, uid]);
      await sendMsg("⚠️ ID ini sudah pernah diklaim, jadi tidak bisa dipakai lagi.");
      return true;
    }
    await redisCommand(["HSET", REDIS_APPREF_STATE_KEY, uid, JSON.stringify({ step: "name", appId: input })]);
    await sendMsg("📝 <b>Langkah 2/3</b>\nKirim <b>nama profil</b> kamu persis seperti di aplikasi.");
    return true;
  }

  if (st.step === "name") {
    const nm = input.replace(/\s+/g, " ").slice(0, 40);
    if (!nm) {
      await sendMsg("⚠️ Nama profil tidak boleh kosong. Kirim ulang namanya.");
      return true;
    }
    await redisCommand([
      "HSET",
      REDIS_APPREF_STATE_KEY,
      uid,
      JSON.stringify({ step: "shot", appId: st.appId, name: nm }),
    ]);
    await sendMsg(
      "📸 <b>Langkah 3/3</b>\nKirim <b>screenshot</b> halaman profil yang memperlihatkan ID dan nama profil. Kirim sebagai <b>foto</b>."
    );
    return true;
  }

  await sendMsg("📸 Kirim <b>foto screenshot</b> profilmu, bukan teks. Atau ketik /batal.");
  return true;
}

// Dipanggil untuk foto dari member. Return true kalau foto ini bagian dari alur referral.
async function handleApprefPhoto(token, msg, userId) {
  const chatId = msg.chat.id;
  const uid = String(userId);
  const st = parseJsonSafe(await redisCommand(["HGET", REDIS_APPREF_STATE_KEY, uid]));
  if (!st || st.step !== "shot") return false;
  const sendMsg = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });

  if ((await getApprefDailyUsed(uid)) >= APPREF_DAILY_CAP) {
    await redisCommand(["HDEL", REDIS_APPREF_STATE_KEY, uid]);
    await sendMsg(`⏳ Batas klaim hari ini (${APPREF_DAILY_CAP}) sudah tercapai. Coba lagi besok ya.`);
    return true;
  }
  if (Number(await redisCommand(["HEXISTS", REDIS_APPREF_IDS_KEY, st.appId])) === 1) {
    await redisCommand(["HDEL", REDIS_APPREF_STATE_KEY, uid]);
    await sendMsg("⚠️ ID ini sudah pernah diklaim, jadi tidak bisa dipakai lagi.");
    return true;
  }

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const reqId = String(await redisCommand(["INCR", REDIS_APPREF_SEQ_KEY]));
  const tgName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || "Pembeli";
  const username = (msg.from && msg.from.username) || "";
  const data = {
    id: reqId,
    user_id: uid,
    app_id: st.appId,
    profile_name: st.name,
    tg_name: tgName,
    username,
    status: "pending",
    created: getWibTimestamp(),
  };
  await redisCommand(["HSET", REDIS_APPREF_REQ_KEY, reqId, JSON.stringify(data)]);
  await redisCommand(["HSET", REDIS_APPREF_IDS_KEY, st.appId, reqId]);
  await redisCommand(["HDEL", REDIS_APPREF_STATE_KEY, uid]);

  const cfg = await getApprefCfg();
  const qris = await getQris();
  const adminChat = qris && qris.admin_chat_id;
  if (adminChat) {
    await tgRequest(token, "sendPhoto", {
      chat_id: adminChat,
      photo: fileId,
      caption:
        `📱 <b>KLAIM REFERRAL #${reqId}</b>\n` +
        `🧩 Aplikasi: ${escapeHtml(cfg.name)}\n` +
        `🆔 ID aplikasi: <code>${escapeHtml(st.appId)}</code>\n` +
        `🧾 Nama profil: <b>${escapeHtml(st.name)}</b>\n` +
        `👤 Telegram: ${escapeHtml(tgName)}${username ? ` (@${escapeHtml(username)})` : ""}\n` +
        `🆔 Telegram ID: <code>${escapeHtml(uid)}</code>\n` +
        `💰 Hadiah: <b>${formatRupiah(APPREF_REWARD)}</b>\n` +
        "<i>Cocokkan ID dan nama dengan referral di aplikasi sebelum ACC.</i>",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ ACC", callback_data: `apprefacc_${reqId}` },
            { text: "❌ Tolak", callback_data: `apprefrej_${reqId}` },
          ],
        ],
      },
    });
  } else {
    console.error("Referral aplikasi: admin_chat_id belum diset, bukti tidak terkirim ke admin.");
  }

  await sendMsg("📨 Bukti referral kamu sudah dikirim. Admin akan mengecek, dan saldo masuk setelah di-ACC.");
  return true;
}

async function processApprefReview(token, chatId, reqId, isAcc) {
  const req = parseJsonSafe(await redisCommand(["HGET", REDIS_APPREF_REQ_KEY, String(reqId)]));
  const sendAdmin = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
  if (!req || req.status !== "pending") {
    await sendAdmin(`⚠️ Klaim referral #${escapeHtml(String(reqId))} tidak ditemukan atau sudah diproses.`);
    return;
  }
  const uid = req.user_id;

  if (!isAcc) {
    req.status = "rejected";
    await redisCommand(["HSET", REDIS_APPREF_REQ_KEY, String(reqId), JSON.stringify(req)]);
    // lepas ID supaya bisa dicoba ulang dengan bukti yang benar
    if (String(await redisCommand(["HGET", REDIS_APPREF_IDS_KEY, req.app_id])) === String(reqId)) {
      await redisCommand(["HDEL", REDIS_APPREF_IDS_KEY, req.app_id]);
    }
    await sendAdmin(`❌ Klaim referral #${reqId} ditolak.`);
    await tgRequest(token, "sendMessage", {
      chat_id: uid,
      parse_mode: "HTML",
      text:
        "❌ Bukti referral kamu ditolak.\nPastikan ID dan nama profil terlihat jelas di screenshot dan sesuai dengan yang kamu isi, lalu coba lagi.",
    });
    return;
  }

  const fundId = await getReferralFundId();
  if (!fundId) {
    await sendAdmin("⚠️ Kas admin belum diset, klaim belum bisa di-ACC.");
    return;
  }
  const dayKey = REDIS_APPREF_DAILY_PREFIX + getApprefDayKey();
  if ((Number(await redisCommand(["HGET", dayKey, uid])) || 0) >= APPREF_DAILY_CAP) {
    await sendAdmin(`⏳ Member ini sudah mencapai batas ${APPREF_DAILY_CAP} klaim hari ini. ACC ditunda.`);
    return;
  }

  const d = await deductUserSaldo(fundId, APPREF_REWARD);
  if (!d.ok) {
    await sendAdmin(
      `⚠️ <b>Saldo kas tidak cukup untuk ACC klaim #${reqId}.</b>\n` +
        `💳 Saldo kas: <b>${formatRupiah(d.balance)}</b>\n` +
        `Isi ulang: <code>/addsaldo ${escapeHtml(fundId)} NOMINAL</code>, lalu tekan ACC lagi.`
    );
    return;
  }

  let newSaldo;
  try {
    newSaldo = await addUserSaldo(uid, APPREF_REWARD);
  } catch (addErr) {
    await addUserSaldo(fundId, APPREF_REWARD);
    throw addErr;
  }

  req.status = "acc";
  await redisCommand(["HSET", REDIS_APPREF_REQ_KEY, String(reqId), JSON.stringify(req)]);
  await redisCommand(["HINCRBY", dayKey, uid, 1]);

  await sendAdmin(`✅ Klaim referral #${reqId} di-ACC. Saldo ${formatRupiah(APPREF_REWARD)} masuk ke member.`);
  await tgRequest(token, "sendMessage", {
    chat_id: uid,
    parse_mode: "HTML",
    text:
      `🎉 <b>Referral kamu di-ACC!</b>\n` +
      `💰 Saldo masuk: <b>+${formatRupiah(APPREF_REWARD)}</b>\n` +
      `💳 Saldo kamu sekarang: <b>${formatRupiah(newSaldo)}</b>\n\n` +
      "<i>Saldo ini hanya bisa dipakai belanja di bot.</i>",
  });
}

// Pengingat cek channel testimoni setelah pembelian berhasil
async function sendTestiReminder(token, userId) {
  const testi = await getTestiConfig();
  if (!testi || !testi.channel_username) return;
  await tgRequest(token, "sendMessage", {
    chat_id: userId,
    parse_mode: "HTML",
    text: "🙏 Terima kasih sudah belanja! Cek channel testimoni kami untuk lihat pengalaman member lain.",
    reply_markup: {
      inline_keyboard: [[{ text: "🧾 Cek Channel Testimoni", url: `https://t.me/${testi.channel_username}` }]],
    },
  });
}

// ---- MYSTERY BOX SPIN x5 (bayar sekali via saldo, 5 box langsung dibuka) ----
const MYSTERY_MULTI_COUNT = 5;

async function sendMysteryMulti(token, chatId, userId) {
  const cfg = await getMysteryConfig();
  const katalogList = await getKatalog();
  if (!cfg.enabled || katalogList.length === 0) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Mystery Box sedang tidak tersedia." });
    return;
  }
  const perBox = cfg.price || 3000;
  const total = perBox * MYSTERY_MULTI_COUNT;
  const saldo = await getUserSaldo(userId);
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🎲 <b>SPIN MYSTERY BOX x${MYSTERY_MULTI_COUNT}</b>\n\n` +
      `Kamu dapat <b>${MYSTERY_MULTI_COUNT} box</b> sekaligus, tiap box dapat hadiah acak sendiri.\n\n` +
      `💰 Harga: <code>${formatRupiah(total)}</code> (${formatRupiah(perBox)} × ${MYSTERY_MULTI_COUNT})\n` +
      `💳 Saldo kamu: <code>${formatRupiah(saldo)}</code>\n` +
      "<i>Pembayaran lewat saldo. Hadiah masuk ke 🎒 Koleksi Saya.</i>",
    reply_markup: {
      inline_keyboard: [
        [{ text: `✅ Spin x${MYSTERY_MULTI_COUNT} (${formatRupiah(total)})`, callback_data: "mys5_pay" }],
        [{ text: "➕ Isi Saldo", callback_data: "menu_saldo" }],
        [{ text: "🔙 Mystery Box", callback_data: "menu_mystery" }],
      ],
    },
  });
}

async function payMysteryMulti(token, chatId, from) {
  const userId = String(from.id);
  const cfg = await getMysteryConfig();
  const katalogList = await getKatalog();
  if (!cfg.enabled || katalogList.length === 0) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Mystery Box sedang tidak tersedia." });
    return;
  }
  const perBox = cfg.price || 3000;
  const total = perBox * MYSTERY_MULTI_COUNT;

  const deduction = await deductUserSaldo(userId, total);
  if (!deduction.ok) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `⚠️ <b>Saldo Tidak Cukup!</b>\nHarga Spin x${MYSTERY_MULTI_COUNT}: <code>${formatRupiah(total)}</code>\n` +
        `Saldo kamu: <code>${formatRupiah(deduction.balance)}</code>`,
      reply_markup: { inline_keyboard: [[{ text: "➕ Isi Saldo Sekarang", callback_data: "menu_saldo" }]] },
    });
    return;
  }

  let done = 0;
  try {
    for (let i = 0; i < MYSTERY_MULTI_COUNT; i++) {
      const order = await createOrder(
        from,
        "🎲 Mystery Box Gacha Photopack",
        perBox,
        "MYSTERY_GACHA",
        true,
        "",
        {
          skip_unique: true,
          paid_with_saldo: true,
          preset_discount: 0,
          skip_discount_lookup: true,
          target_links: [],
          target_files: [],
        }
      );
      await processAccOrder(token, order);
      done++;
    }
  } catch (err) {
    // kembalikan saldo untuk box yang belum sempat dibuka
    const refund = perBox * (MYSTERY_MULTI_COUNT - done);
    if (refund > 0) await addUserSaldo(userId, refund, "deposit");
    console.error("Spin x5 gagal di tengah jalan, saldo dikembalikan:", err);
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Terjadi gangguan. ${done} box sudah dibuka, sisanya ${formatRupiah(refund)} dikembalikan ke saldo.`,
    });
    return;
  }

  const qris = await getQris();
  if (qris && qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: qris.admin_chat_id,
      parse_mode: "HTML",
      text:
        `🎲 <b>SPIN MYSTERY x${MYSTERY_MULTI_COUNT} OTOMATIS</b>\n` +
        `👤 ${escapeHtml(from.first_name || "Pembeli")} (<code>${escapeHtml(userId)}</code>)\n` +
        `💰 Potong saldo: <code>${formatRupiah(total)}</code>\n` +
        `💳 Sisa saldo user: <code>${formatRupiah(deduction.balance)}</code>`,
    });
  }
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: `🎉 ${MYSTERY_MULTI_COUNT} box sudah dibuka! Cek hadiahnya di atas, dan semuanya tersimpan di 🎒 Koleksi Saya.`,
  });
}

// ---- PILIH BEBERAPA SET (centang beberapa set, bayar sekali pakai saldo) ----
const PICK_MAX_ITEMS = 10; // batas set per pembelian (agar proses tidak timeout)
const REDIS_PICK_PREFIX = "lumine_main_pick_"; // per user: JSON array id set terpilih

async function getPickSel(userId) {
  const arr = parseJsonSafe(await redisCommand(["GET", REDIS_PICK_PREFIX + String(userId)]));
  return Array.isArray(arr) ? arr.map(String) : [];
}

async function setPickSel(userId, arr) {
  await redisCommand(["SET", REDIS_PICK_PREFIX + String(userId), JSON.stringify(arr)]);
}

function getPickableItems(katalogList) {
  return katalogList.filter((k) => {
    if (!k || !k.id || !isCategoryEnabled(k)) return false;
    const hasLinks = (Array.isArray(k.links) && k.links.length > 0) || !!k.link;
    const hasFiles = Array.isArray(k.files) && k.files.length > 0;
    return hasLinks || hasFiles;
  });
}

async function sendPickPage(token, chatId, userId, page = 0) {
  const katalogList = await getKatalog();
  const items = getPickableItems(katalogList);
  const sel = await getPickSel(userId);
  if (items.length === 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `📂 Belum ada set yang bisa dipilih. Hubungi @${ADMIN_USERNAME} untuk info stok terbaru.`,
    });
    return;
  }

  const selItems = items.filter((k) => sel.includes(String(k.id)));
  const total = selItems.reduce((sum, k) => sum + parseNominal(k.harga), 0);
  const totalPages = Math.max(1, Math.ceil(items.length / LUMINE_ITEMS_PER_PAGE));
  const p = Math.min(Math.max(0, parseInt(page, 10) || 0), totalPages - 1);
  const slice = items.slice(p * LUMINE_ITEMS_PER_PAGE, (p + 1) * LUMINE_ITEMS_PER_PAGE);

  const rows = slice.map((k) => {
    const on = sel.includes(String(k.id));
    return [
      {
        text: `${on ? "✅" : "⬜"} ${k.nama} — ${k.harga}`.slice(0, 62),
        callback_data: `pick_t_${k.id}_${p}`,
      },
    ];
  });
  const nav = buildLuminePageNav(`pick_p_`, p, totalPages);
  if (nav) rows.push(nav);
  if (selItems.length > 0) {
    rows.push([{ text: `🛒 Lanjut Bayar (${selItems.length} set • ${formatRupiah(total)})`, callback_data: "pick_go" }]);
    rows.push([{ text: "🗑 Kosongkan Pilihan", callback_data: "pick_clear" }]);
  }
  rows.push([{ text: "🔙 Katalog", callback_data: "menu_katalog" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "🧺 <b>PILIH BEBERAPA SET</b>\n" +
      "Tap set untuk pilih atau batal. Bisa pilih sampai " +
      `<b>${PICK_MAX_ITEMS} set</b> sekali bayar.\n\n` +
      `✅ Terpilih: <b>${selItems.length}</b> set • Total: <code>${formatRupiah(total)}</code>\n` +
      (totalPages > 1 ? `Hal <b>${p + 1}/${totalPages}</b>` : ""),
    reply_markup: { inline_keyboard: rows },
  });
}

async function togglePickItem(token, chatId, userId, itemId, page) {
  const katalogList = await getKatalog();
  const items = getPickableItems(katalogList);
  const exists = items.some((k) => String(k.id) === String(itemId));
  const sendMsg = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
  if (!exists) {
    await sendMsg("⚠️ Set ini sudah tidak tersedia. Pilihan kamu sudah diperbarui.");
  } else {
    let sel = await getPickSel(userId);
    if (sel.includes(String(itemId))) {
      sel = sel.filter((x) => x !== String(itemId));
    } else {
      if (sel.length >= PICK_MAX_ITEMS) {
        await sendMsg(`⚠️ Maksimal ${PICK_MAX_ITEMS} set per pembelian. Bayar dulu, lalu pilih lagi.`);
        return sendPickPage(token, chatId, userId, page);
      }
      sel.push(String(itemId));
    }
    await setPickSel(userId, sel);
  }
  return sendPickPage(token, chatId, userId, page);
}

async function resolvePickTargets(userId, ids) {
  const targets = [];
  for (const id of ids) {
    const t = await resolvePurchaseTarget(String(id), userId);
    if (!t || !t.ok) {
      return { ok: false, error: (t && t.error) || "⚠️ Ada set yang sudah tidak tersedia." };
    }
    targets.push(t);
  }
  return { ok: true, targets, total: targets.reduce((s, t) => s + (Number(t.baseNominal) || 0), 0) };
}

async function sendPickConfirm(token, chatId, userId) {
  const sel = await getPickSel(userId);
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text,
      ...(markup ? { reply_markup: markup } : {}),
    });
  if (sel.length === 0) {
    return sendMsg("🧺 Kamu belum memilih set.", {
      inline_keyboard: [[{ text: "🧺 Pilih Set", callback_data: "pick_menu" }]],
    });
  }
  const r = await resolvePickTargets(userId, sel);
  if (!r.ok) {
    return sendMsg(`${r.error}\nBuka 🧺 Pilih Set untuk memperbarui pilihan.`, {
      inline_keyboard: [[{ text: "🧺 Pilih Set", callback_data: "pick_menu" }]],
    });
  }
  const saldo = await getUserSaldo(userId);
  const list = r.targets.map((t, i) => `${i + 1}. ${escapeHtml(t.itemNama)} — ${formatRupiah(t.baseNominal)}`).join("\n");
  const kurang = saldo < r.total;
  return sendMsg(
    `🛒 <b>KONFIRMASI PEMBELIAN</b>\n\n${list}\n\n` +
      `💰 Total: <b>${formatRupiah(r.total)}</b>\n` +
      `💳 Saldo kamu: <code>${formatRupiah(saldo)}</code>\n` +
      (kurang ? "\n⚠️ Saldo belum cukup." : "\n<i>Pembayaran lewat saldo. Semua set langsung dikirim.</i>"),
    kurang
      ? { inline_keyboard: [[{ text: "➕ Isi Saldo Sekarang", callback_data: "menu_saldo" }], [{ text: "🔙 Ubah Pilihan", callback_data: "pick_menu" }]] }
      : {
          inline_keyboard: [
            [{ text: `✅ Bayar ${formatRupiah(r.total)}`, callback_data: "pick_pay" }],
            [{ text: "🔙 Ubah Pilihan", callback_data: "pick_menu" }],
          ],
        }
  );
}

async function payPickSelection(token, chatId, from) {
  const userId = String(from.id);
  const sel = await getPickSel(userId);
  if (sel.length === 0) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: "🧺 Pilihan kamu kosong. Pilih set dulu ya." });
    return;
  }
  const r = await resolvePickTargets(userId, sel);
  if (!r.ok) {
    await tgRequest(token, "sendMessage", { chat_id: chatId, text: `${r.error}\nBuka 🧺 Pilih Set untuk memperbarui pilihan.` });
    return;
  }

  const deduction = await deductUserSaldo(userId, r.total);
  if (!deduction.ok) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text:
        `⚠️ <b>Saldo Tidak Cukup!</b>\nTotal: <code>${formatRupiah(r.total)}</code>\n` +
        `Saldo kamu: <code>${formatRupiah(deduction.balance)}</code>`,
      reply_markup: { inline_keyboard: [[{ text: "➕ Isi Saldo Sekarang", callback_data: "menu_saldo" }]] },
    });
    return;
  }

  let done = 0;
  let refund = 0;
  try {
    for (const t of r.targets) {
      const order = await createOrder(from, t.itemNama, t.baseNominal, t.targetLink, false, t.itemId, {
        skip_unique: true,
        paid_with_saldo: true,
        preset_discount: 0,
        skip_discount_lookup: true,
        target_links: t.targetLinks || [],
        target_files: t.targetFiles || [],
        ...(t.extra || {}),
      });
      await processAccOrder(token, order);
      done++;
    }
  } catch (err) {
    refund = r.targets.slice(done).reduce((s, t) => s + (Number(t.baseNominal) || 0), 0);
    if (refund > 0) await addUserSaldo(userId, refund, "deposit");
    console.error("Pilih beberapa set gagal di tengah jalan, sisa saldo dikembalikan:", err);
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Terjadi gangguan. ${done} set sudah dikirim, sisanya ${formatRupiah(refund)} dikembalikan ke saldo.`,
    });
    return;
  }

  await setPickSel(userId, []);
  const qris = await getQris();
  if (qris && qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: qris.admin_chat_id,
      parse_mode: "HTML",
      text:
        `🛒 <b>PILIH BEBERAPA SET OTOMATIS (${done} set)</b>\n` +
        `👤 ${escapeHtml(from.first_name || "Pembeli")} (<code>${escapeHtml(userId)}</code>)\n` +
        `💰 Potong saldo: <code>${formatRupiah(r.total)}</code>\n` +
        `💳 Sisa saldo user: <code>${formatRupiah(deduction.balance)}</code>`,
    });
  }
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: `🎉 ${done} set sudah dikirim! Semua tersimpan di 🎒 Koleksi Saya.`,
  });
}

// ---- UNDIAN MINGGUAN (1 tiket tiap Rp 5.000 belanja lunas, 3 pemenang saldo, undi tiap Minggu jam 20:00 WIB) ----
const UNDIAN_ENABLED = true;
const UNDIAN_TICKET_STEP = 5000; // tiap kelipatan nominal ini = 1 tiket
const UNDIAN_PRIZES = [5000, 3000, 2000]; // hadiah saldo pemenang 1, 2, 3 (Rp)
const UNDIAN_DRAW_HOUR = 20; // jam undian (WIB), undian selalu hari Minggu
const REDIS_UNDIAN_TIX_PREFIX = "lumine_main_undian_tix_"; // hash per tanggal undi: id user -> jumlah tiket
const REDIS_UNDIAN_DRAW_KEY = "lumine_main_undian_draw"; // hash: tanggal undi -> JSON hasil (atau "running")

function undianWibNow() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { dow: d.getUTCDay(), hour: d.getUTCHours(), d };
}

function undianYmdAdd(d, days) {
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

// Tanggal undian yang terakhir sudah jatuh tempo (Minggu jam 20:00 WIB terakhir)
function getUndianLastDueKey() {
  const { dow, hour, d } = undianWibNow();
  const back = dow === 0 ? (hour >= UNDIAN_DRAW_HOUR ? 0 : 7) : dow;
  return undianYmdAdd(d, -back);
}

// Tanggal undian yang akan datang: tiket yang dibeli sekarang masuk ke sini
function getUndianNextKey() {
  const { dow, hour, d } = undianWibNow();
  let forward = (7 - dow) % 7;
  if (forward === 0 && hour >= UNDIAN_DRAW_HOUR) forward = 7;
  return undianYmdAdd(d, forward);
}

function formatUndianDate(key) {
  const [y, m, dd] = key.split("-");
  return `Minggu, ${dd}/${m}/${y} • 20:00 WIB`;
}

async function addUndianTickets(token, order) {
  if (!UNDIAN_ENABLED || !order || !order.buyer_id) return;
  const n = Math.floor((Number(order.total_nominal) || 0) / UNDIAN_TICKET_STEP);
  if (n <= 0) return;
  const key = getUndianNextKey();
  const total = Number(await redisCommand(["HINCRBY", REDIS_UNDIAN_TIX_PREFIX + key, String(order.buyer_id), n])) || n;
  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    parse_mode: "HTML",
    text:
      `🎟 <b>Kamu dapat +${n} tiket undian!</b>\n` +
      `Tiket kamu minggu ini: <b>${total}</b>\n` +
      `📅 Undian: ${formatUndianDate(key)}`,
  });
}

function pickUndianWinners(entries, k) {
  const winners = [];
  const pool = entries.slice();
  while (winners.length < k && pool.length > 0) {
    const total = pool.reduce((s, e) => s + e.n, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].n;
      if (r < 0) break;
    }
    winners.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return winners;
}

// Dipanggil di setiap pesan masuk. Undi otomatis begitu jatuh tempo, sekali saja per periode.
async function maybeRunUndianDraw(token) {
  if (!UNDIAN_ENABLED) return;
  const drawKey = getUndianLastDueKey();
  if (Number(await redisCommand(["HEXISTS", REDIS_UNDIAN_DRAW_KEY, drawKey])) === 1) return;
  const claimed = Number(await redisCommand(["HSETNX", REDIS_UNDIAN_DRAW_KEY, drawKey, "running"])) === 1;
  if (!claimed) return;

  try {
    const flat = (await redisCommand(["HGETALL", REDIS_UNDIAN_TIX_PREFIX + drawKey])) || [];
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      const n = Number(flat[i + 1]) || 0;
      if (n > 0) entries.push({ uid: String(flat[i]), n });
    }
    const totalTickets = entries.reduce((s, e) => s + e.n, 0);
    const winners = pickUndianWinners(entries, UNDIAN_PRIZES.length);
    const fundId = await getReferralFundId();
    const awarded = [];

    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      const prize = UNDIAN_PRIZES[i];
      if (!fundId) break;
      const d = await deductUserSaldo(fundId, prize);
      if (!d.ok) {
        await tgRequest(token, "sendMessage", {
          chat_id: (await getQris() || {}).admin_chat_id,
          text: `⚠️ Kas kurang untuk hadiah undian ${formatRupiah(prize)}. Isi dengan /addsaldo ${fundId} NOMINAL, lalu bayar manual ke member.`,
        });
        continue;
      }
      await addUserSaldo(w.uid, prize);
      awarded.push({ rank: i + 1, uid: w.uid, prize });
    }

    const result = { drawKey, participants: entries.length, tickets: totalTickets, winners: awarded };
    await redisCommand(["HSET", REDIS_UNDIAN_DRAW_KEY, drawKey, JSON.stringify(result)]);

    const lines = awarded.length
      ? awarded.map((a) => `${["🥇", "🥈", "🥉"][a.rank - 1]} Member ***${escapeHtml(a.uid.slice(-4))} — <b>${formatRupiah(a.prize)}</b>`).join("\n")
      : "Belum ada peserta minggu ini.";
    const announce =
      `🎟 <b>HASIL UNDIAN MINGGUAN</b>\n` +
      `${formatUndianDate(drawKey)}\n` +
      `Peserta: <b>${entries.length}</b> • Total tiket: <b>${totalTickets}</b>\n\n` +
      `${lines}\n\n` +
      `<i>Hadiah sudah masuk ke saldo pemenang. Undian berikutnya tiap Minggu jam 20:00 WIB.</i>`;

    const testi = await getTestiConfig();
    const annTarget = testi && testi.channel_id ? testi.channel_id : (await getQris() || {}).admin_chat_id;
    if (annTarget && entries.length > 0) {
      await tgRequest(token, "sendMessage", { chat_id: annTarget, text: announce, parse_mode: "HTML" });
    }
    for (const a of awarded) {
      await tgRequest(token, "sendMessage", {
        chat_id: a.uid,
        parse_mode: "HTML",
        text: `🎉 <b>Kamu menang undian mingguan!</b>\nPeringkat ${a.rank}, saldo masuk: <b>+${formatRupiah(a.prize)}</b>`,
      });
    }
  } catch (err) {
    // lock tetap tertahan supaya hadiah tidak terbayar dobel; admin perlu cek manual
    console.error("Undian gagal:", err);
    const qris = await getQris();
    if (qris && qris.admin_chat_id) {
      await tgRequest(token, "sendMessage", {
        chat_id: qris.admin_chat_id,
        text: `⚠️ Undian ${drawKey} gagal diproses otomatis. Cek log Vercel sebelum mengulang.`,
      });
    }
  }
}

async function sendUndianInfo(token, chatId, userId) {
  const key = getUndianNextKey();
  const mine = Number(await redisCommand(["HGET", REDIS_UNDIAN_TIX_PREFIX + key, String(userId)])) || 0;
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "🎟 <b>UNDIAN MINGGUAN</b>\n\n" +
      `Setiap belanja lunas <b>${formatRupiah(UNDIAN_TICKET_STEP)}</b> dapat <b>1 tiket</b>.\n` +
      `Pemenang diundi acak, dan hadiahnya saldo:\n` +
      UNDIAN_PRIZES.map((p, i) => `${["🥇", "🥈", "🥉"][i]} ${formatRupiah(p)}`).join("\n") +
      `\n\n📅 Undian berikutnya: <b>${formatUndianDate(key)}</b>\n` +
      `🎫 Tiket kamu minggu ini: <b>${mine}</b>`,
    reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Lainnya", callback_data: "menu_lainnya" }]] },
  });
}

// ---- ANTI DUPE HADIAH (mystery box & spin harian tidak memberi set yang sudah dimiliki) ----
const MYSTERY_DUPE_SALDO = 3000; // saldo pengganti kalau semua set hadiah sudah dimiliki member

async function getOwnedNameSet(userId) {
  const list = await getKoleksi(userId);
  return new Set((Array.isArray(list) ? list : []).map((x) => String((x && x.nama) || "").toLowerCase().trim()));
}

// ---- HARGA KHUSUS PEMBELI BARU (wajib verifikasi nomor HP, satu nomor = satu akun) ----
const NEW_USER_PRICE_MAP = { 10000: 7000 }; // harga normal -> harga khusus; lainnya tetap
const REDIS_PHONE_KEY = "lumine_main_phone"; // hash: id user -> nomor HP terverifikasi
const REDIS_PHONE_OWNER_KEY = "lumine_main_phone_owner"; // hash: nomor HP -> id user pemiliknya

// ---- TIER HARGA MEMBER AKTIF (diskon otomatis berdasarkan jumlah pembelian) ----
const TIER_LEVELS = [
  { min: 15, name: "🥇 Emas", pct: 10 },
  { min: 5, name: "🥈 Perak", pct: 5 },
  { min: 0, name: "🥉 Perunggu", pct: 0 },
];

function tierFromCount(cnt) {
  return TIER_LEVELS.find((t) => cnt >= t.min) || TIER_LEVELS[TIER_LEVELS.length - 1];
}

async function getMemberTier(userId) {
  const cnt = Number(await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)])) || 0;
  return tierFromCount(cnt);
}

function applyTierPrice(retail, tier) {
  if (!tier || !(tier.pct > 0)) return retail;
  return Math.max(500, Math.floor((retail * (1 - tier.pct / 100)) / 100) * 100);
}

async function getNewUserPromoEndTs(userId) {
  const uid = String(userId);
  let joinTs = Number(await redisCommand(["HGET", REDIS_JOIN_TS_KEY, uid])) || 0;
  if (!joinTs) {
    // User lama (masuk sebelum fitur ini): hitung 3 hari dari pertama kali dicek setelah update
    await redisCommand(["HSETNX", REDIS_JOIN_TS_KEY, uid, String(Date.now())]);
    joinTs = Number(await redisCommand(["HGET", REDIS_JOIN_TS_KEY, uid])) || Date.now();
  }
  return joinTs + NEW_USER_PROMO_DAYS * 24 * 60 * 60 * 1000;
}

async function isNewUserPromoActive(userId) {
  return (await getNewUserPromoEndTs(userId)) > Date.now();
}

function getNewUserPrice(retail) {
  const sp = NEW_USER_PRICE_MAP[Number(retail)];
  return sp && sp < Number(retail) ? sp : null;
}

async function isNewBuyer(userId) {
  const cnt = Number(await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(userId)])) || 0;
  return cnt === 0;
}

async function isPhoneVerified(userId) {
  return Number(await redisCommand(["HEXISTS", REDIS_PHONE_KEY, String(userId)])) === 1;
}

async function sendVerifyPhonePrompt(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "📱 <b>VERIFIKASI NOMOR</b>\n\n" +
      "Harga khusus pembeli baru hanya untuk akun dengan nomor yang terverifikasi.\n" +
      "Tekan tombol di bawah lalu pilih <b>nomor kamu sendiri</b>.\n" +
      "<i>Satu nomor hanya bisa dipakai untuk satu akun.</i>",
    reply_markup: {
      keyboard: [[{ text: "📱 Bagikan Nomor Saya", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function handleContactShare(token, msg) {
  const chatId = msg.chat.id;
  const senderId = String(msg.from.id);
  const c = msg.contact;
  const sendMsg = (text, markup) =>
    tgRequest(token, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text,
      ...(markup ? { reply_markup: markup } : {}),
    });
  if (String(c.user_id || "") !== senderId) {
    await sendMsg("⚠️ Bagikan <b>nomor kamu sendiri</b> lewat tombol, bukan kontak orang lain.", { remove_keyboard: true });
    return;
  }
  const phone = String(c.phone_number || "").replace(/\D/g, "");
  if (phone.length < 8) {
    await sendMsg("⚠️ Nomor tidak terbaca. Coba bagikan lagi.");
    return;
  }
  const owner = await redisCommand(["HGET", REDIS_PHONE_OWNER_KEY, phone]);
  if (owner && String(owner) !== senderId) {
    await sendMsg("⚠️ Nomor ini sudah dipakai untuk akun lain, jadi tidak bisa dipakai untuk harga khusus.", { remove_keyboard: true });
    return;
  }
  await redisCommand(["HSET", REDIS_PHONE_KEY, senderId, phone]);
  await redisCommand(["HSET", REDIS_PHONE_OWNER_KEY, phone, senderId]);
  const promoEnd = await getNewUserPromoEndTs(senderId);
  const promoInfo =
    promoEnd > Date.now() && (await isNewBuyer(senderId)) ? `\n⏰ Berlaku sampai <b>${formatWibClock(promoEnd)}</b>.` : "";
  await sendMsg("✅ <b>Nomor terverifikasi!</b>\nHarga khusus pembeli baru sudah aktif untuk akunmu." + promoInfo, {
    remove_keyboard: true,
  });
  await sendMsg("Silakan buka katalog dan pilih set yang kamu mau 👇", {
    inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]],
  });
}

// ---- EDIT HARGA MASSAL (admin): pilih sasaran, preview, lalu konfirmasi ----
const REDIS_HARGA_MASS_KEY = "lumine_main_harga_mass_pending"; // JSON perintah yang menunggu konfirmasi (5 menit)
const REDIS_OMSET_CH_KEY = "lumine_main_omset_ch"; // tujuan notif omset: chat_id channel, "__makro__", atau kosong = chat admin
async function resolveOmsetTarget(fallbackAdminChat) {
  const omCh = await redisCommand(["GET", REDIS_OMSET_CH_KEY]);
  if (omCh === "__makro__") return (await getMacroLogChatId()) || fallbackAdminChat;
  if (omCh) return String(omCh);
  return fallbackAdminChat;
}

const OMSET_LIVE_NOTIF = true; // true = admin dapat notif omset setiap ada penjualan lunas
const HARGA_MASS_PROTECT_MIN = 20000; // set di atas harga ini tidak ikut perubahan massal umum
const HARGA_MASS_MAX_PCT = 30; // perubahan persen maksimal ±30%

function parseHargaMassArgs(tokens) {
  const usage =
    "⚠️ Format:\n" +
    "<code>/hargamassal semua 6000</code>\n" +
    "<code>/hargamassal mini 6000</code> | <code>/hargamassal full 50000</code>\n" +
    "<code>/hargamassal harga 5000 6000</code> (ubah semua set Rp 5.000 jadi Rp 6.000)\n" +
    "<code>/hargamassal creator NAMA 7000</code>\n" +
    "<code>/hargamassal semua +10%</code> atau <code>-10%</code>";
  if (!tokens || tokens.length < 2) return { ok: false, error: usage };
  const kind = String(tokens[0]).toLowerCase();
  const last = String(tokens[tokens.length - 1]);
  let sel;
  if (kind === "semua" || kind === "mini" || kind === "full") {
    if (tokens.length !== 2) return { ok: false, error: usage };
    sel = { type: kind };
  } else if (kind === "harga") {
    if (tokens.length !== 3) return { ok: false, error: usage };
    const from = parseInt(String(tokens[1]).replace(/\D/g, ""), 10);
    if (!from) return { ok: false, error: usage };
    sel = { type: "harga", from };
  } else if (kind === "creator") {
    const name = tokens.slice(1, -1).join(" ").trim();
    if (!name) return { ok: false, error: usage };
    sel = { type: "creator", name };
  } else {
    return { ok: false, error: usage };
  }
  let rule;
  const pct = last.match(/^([+-]?\d+(?:\.\d+)?)%$/);
  if (pct) {
    const p = parseFloat(pct[1]);
    if (Math.abs(p) > HARGA_MASS_MAX_PCT) {
      return { ok: false, error: `⚠️ Perubahan persen maksimal ±${HARGA_MASS_MAX_PCT}% sekali edit.` };
    }
    rule = { type: "pct", pct: p };
  } else {
    const price = parseInt(last.replace(/\D/g, ""), 10);
    if (!price || price < 500) return { ok: false, error: usage };
    rule = { type: "set", price };
  }
  return { ok: true, sel, rule };
}

function hargaMassMatches(item, sel) {
  const retail = parseNominal(item.harga);
  if (sel.type === "semua") return true;
  if (sel.type === "mini") return item.kategori !== "full";
  if (sel.type === "full") return item.kategori === "full";
  if (sel.type === "harga") return retail === sel.from;
  if (sel.type === "creator") return String(item.creator || "").toLowerCase() === sel.name.toLowerCase();
  return false;
}

function hargaMassNewValue(item, rule) {
  const retail = parseNominal(item.harga);
  if (rule.type === "set") return rule.price;
  const raw = retail * (1 + rule.pct / 100);
  return Math.max(500, Math.round(raw / 500) * 500);
}

function buildHargaMassPlan(katalog, parsed) {
  const changes = [];
  let skipped = 0;
  const broad = parsed.sel.type === "semua" || parsed.sel.type === "mini" || parsed.sel.type === "full";
  for (const item of katalog) {
    if (!item || !hargaMassMatches(item, parsed.sel)) continue;
    const oldVal = parseNominal(item.harga);
    // Pengaman: perintah umum tidak menyentuh set mahal (20.000 ke atas)
    if (broad && oldVal >= HARGA_MASS_PROTECT_MIN) {
      skipped++;
      continue;
    }
    const newVal = hargaMassNewValue(item, parsed.rule);
    if (newVal !== oldVal) changes.push({ item, oldVal, newVal });
  }
  changes.skipped = skipped;
  return changes;
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
    if (item.preorder) {
      prefix = "🕒";
      suffix = " • PRE ORDER";
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
        [
          {
            text: `🎲 Spin x${MYSTERY_MULTI_COUNT} (${formatRupiah(cfg.price * MYSTERY_MULTI_COUNT)})`,
            callback_data: "mys5_menu",
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
        [{ text: "📱 Referral Aplikasi", callback_data: "menu_appref" }],
        [{ text: "🎟 Undian Mingguan", callback_data: "menu_undian" }],
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
  let baseNominal = parseNominal(item.harga);
  let tierLabel = "";
  const flashSale = await getFlashSale();
  const flashActive = flashSale && String(flashSale.item_id) === String(item.id);
  if (flashActive) {
    baseNominal = flashSale.flash_price;
    tierLabel = `⚡ FLASH SALE`;
  } else if (userId) {
    const sp = getNewUserPrice(baseNominal);
    if (sp && (await isNewBuyer(userId)) && (await isPhoneVerified(userId)) && (await isNewUserPromoActive(userId))) {
      baseNominal = sp;
    } else {
      const tier = await getMemberTier(userId);
      if (tier.pct > 0) {
        baseNominal = applyTierPrice(baseNominal, tier);
        tierLabel = `${tier.name} -${tier.pct}%`;
      }
    }
  }
  return {
    ok: true,
    itemId: String(item.id),
    itemNama: item.preorder ? `${item.nama} (PRE ORDER)` : item.nama,
    tierLabel,
    baseNominal,
    targetLink: itemLinks[0] || "",
    targetLinks: itemLinks,
    targetFiles: itemFiles,
    isMystery: false,
    isFlashSale: Boolean(flashActive),
    extra: item.preorder ? { is_preorder: true } : {},
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
    (Number(order.kode_unik) > 0 && order.created_ms
      ? `⏰ <b>Bayar sebelum: ${formatWibClock(Number(order.created_ms) + QRIS_EXPIRE_MINUTES * 60 * 1000)} WIB</b>\n\n`
      : "") +
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
  const adminPrices = (rb && rb.admin_prices) || {};
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

    // Harga yang di-set admin (/setharga_admin): dikunci, minimal = harga toko utama, tanpa batas maksimal.
    const adminPrice = Number(adminPrices[String(k.id)]);
    const locked = adminPrice > 0 && adminPrice >= retail;

    if (!locked && modal >= bounds.max) continue; // tidak ada ruang margin

    let sell;
    let minSell;
    let maxSell;
    if (locked) {
      sell = adminPrice;
      minSell = adminPrice;
      maxSell = adminPrice;
    } else {
      const custom = Number(prices[String(k.id)]);
      const wanted = custom > 0 ? custom : retail;
      sell = Math.min(bounds.max, Math.max(bounds.min, wanted));
      minSell = bounds.min;
      maxSell = bounds.max;
    }

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
      min_sell: minSell,
      max_sell: maxSell,
      locked,
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
        text: "⏳ Kamu terlalu sering mengirim pesan. Kamu di-jeda " + formatDurasiBan() + ". Tunggu sebentar ya.",
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
        (x.locked
          ? "   <i>🔒 Harga diatur admin, tidak bisa diubah</i>\n"
          : `   <i>Boleh diatur ${formatRupiah(x.min_sell)} – ${formatRupiah(x.max_sell)}</i>\n`);
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
        if (x.locked) continue; // harga dikunci admin
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
    if (x.locked) {
      await tgRequest(ctx.token, "sendMessage", {
        chat_id: chatId,
        text: `🔒 Harga <b>${escapeHtml(x.nama)}</b> diatur oleh admin (${formatRupiah(x.sell)}). Tidak bisa diubah.`,
        parse_mode: "HTML",
      });
      return;
    }
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
  const adminCmds = ["/listbot", "/matikanbot", "/aktifkanbot", "/listmargin", "/bayarmargin", "/listwd", "/setwdch", "/setharga_admin"];
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

  if (cmd === "/setharga_admin") {
    const parts = arg.trim().split(/\s+/);
    const rid = parts[0] || "";
    const target = String(parts[1] || "").toLowerCase();
    const rawPrice = String(parts[2] || "").toLowerCase();
    const usage =
      "⚠️ Format:\n" +
      "<code>/setharga_admin ID_RESELLER NO HARGA</code>\n" +
      "<code>/setharga_admin ID_RESELLER 1,2,3 HARGA</code>\n" +
      "<code>/setharga_admin ID_RESELLER semua HARGA</code>\n" +
      "<code>/setharga_admin ID_RESELLER NO hapus</code> (kembali ke aturan reseller)\n" +
      "NO = nomor set di katalog utama (lihat /setcreator). Harga minimal = harga toko utama, tanpa batas maksimal.";
    if (!/^\d+$/.test(rid) || !target || !rawPrice) {
      await reply(usage);
      return true;
    }
    const rb = await getResellerBot(rid);
    if (!rb) {
      await reply("⚠️ Bot reseller dengan ID itu tidak ditemukan (lihat /listbot).");
      return true;
    }

    const katalog = await getKatalog();
    let indices = [];
    if (target === "semua") {
      indices = katalog.map((_, i) => i);
    } else {
      for (const s of target.split(",").map((x) => x.trim()).filter(Boolean)) {
        const n = parseInt(s, 10) - 1;
        if (isNaN(n) || n < 0 || n >= katalog.length) {
          await reply(`⚠️ Nomor set <b>${escapeHtml(s)}</b> tidak valid (total katalog: ${katalog.length}).`);
          return true;
        }
        if (!indices.includes(n)) indices.push(n);
      }
    }
    if (indices.length === 0) {
      await reply(usage);
      return true;
    }

    rb.admin_prices = rb.admin_prices || {};

    if (rawPrice === "hapus") {
      for (const idx of indices) delete rb.admin_prices[String(katalog[idx].id)];
      await saveResellerBot(rid, rb);
      await reply(`✅ Harga admin dihapus dari ${indices.length} set. Bot @${escapeHtml(rb.username)} kembali pakai aturan reseller.`);
      return true;
    }

    const price = parseInt(rawPrice.replace(/\D/g, ""), 10);
    if (!price) {
      await reply(usage);
      return true;
    }

    let applied = 0;
    const skipped = [];
    for (const idx of indices) {
      const k = katalog[idx];
      const retail = parseNominal(k.harga);
      if (price < retail) {
        skipped.push(`#${idx + 1} ${escapeHtml(k.nama)} (harga toko ${formatRupiah(retail)})`);
        continue;
      }
      rb.admin_prices[String(k.id)] = price;
      applied++;
    }
    await saveResellerBot(rid, rb);

    let msg = `✅ Harga <b>${formatRupiah(price)}</b> dikunci ke ${applied} set untuk bot @${escapeHtml(rb.username)}.`;
    if (skipped.length > 0) {
      msg += `\n⚠️ Dilewati karena di bawah harga toko utama:\n• ${skipped.join("\n• ")}`;
    }
    await reply(msg);
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
const SPAM_BAN_SEC_PERTAMA = 60; // pelanggaran pertama: ban 1 menit
const SPAM_BAN_SEC_BERULANG = 300; // pelanggaran berulang: ban 5 menit
const SPAM_STRIKE_WINDOW_SEC = 3600; // pelanggaran dihitung "berulang" kalau terjadi dalam 1 jam
const REDIS_TEMPBAN_PREFIX = "lumine_main_tempban_"; // key per user: ada = sedang di-ban sementara
const REDIS_STRIKE_PREFIX = "lumine_main_strike_"; // key per user: jumlah pelanggaran spam

// ---- PENGINGAT PESANAN BELUM DIBAYAR (harga khusus) ----
const REDIS_CART_CHECK_KEY = "lumine_main_cart_check_ts"; // kapan terakhir pengecekan dijalankan
const REDIS_CART_REMIND_PREFIX = "lumine_main_cart_remind_"; // key per pesanan: sudah diingatkan
const CART_REMIND_MIN_MS = 30 * 60 * 1000; // ingatkan setelah 30 menit belum bayar
const CART_REMIND_MAX_MS = 50 * 60 * 1000; // jangan ingatkan kalau sudah mendekati kedaluwarsa (60 menit)
async function maybeCartReminder(token) {
  const now = Date.now();
  const last = Number(await redisCommand(["GET", REDIS_CART_CHECK_KEY])) || 0;
  if (now - last < 10 * 60 * 1000) return;
  await redisCommand(["SET", REDIS_CART_CHECK_KEY, String(now)]);

  const ids = (await redisCommand(["HKEYS", REDIS_PENDING_MAP_KEY])) || [];
  const promoPrices = Object.values(NEW_USER_PRICE_MAP).map(Number);
  for (const orderId of (Array.isArray(ids) ? ids : []).slice(0, 100)) {
    const oRaw = await redisCommand(["GET", REDIS_ORDER_PREFIX + String(orderId)]);
    if (!oRaw) continue;
    let o;
    try {
      o = JSON.parse(oRaw);
    } catch {
      continue;
    }
    if (o.status !== "pending" || o.is_deposit || o.is_mystery || !o.created_ms || !o.buyer_id) continue;
    const umurMs = now - Number(o.created_ms);
    if (umurMs < CART_REMIND_MIN_MS || umurMs >= CART_REMIND_MAX_MS) continue;
    if (!promoPrices.includes(Number(o.base_nominal))) continue; // hanya pesanan harga khusus
    if (!(await isNewUserPromoActive(o.buyer_id))) continue;

    const ok = await redisCommand(["SET", REDIS_CART_REMIND_PREFIX + String(orderId), "1", "NX", "EX", "7200"]);
    if (ok !== "OK") continue;
    const sisaMenit = Math.max(1, Math.ceil((CART_REMIND_MAX_MS + 10 * 60 * 1000 - umurMs) / 60000));
    await tgRequest(token, "sendMessage", {
      chat_id: o.buyer_id,
      parse_mode: "HTML",
      text:
        `⏰ <b>Pesananmu belum dibayar</b>\n\n` +
        `📦 ${escapeHtml(o.item_nama || "Set")}\n` +
        `💰 Harga khusus <b>${formatRupiah(o.base_nominal)}</b> masih berlaku.\n` +
        `⌛ Pesanan akan kedaluwarsa sekitar ${sisaMenit} menit lagi. Selesaikan pembayaranmu sekarang.`,
    });
  }
}

// ---- CEK JEDA (sisa waktu ban spam) ----
const REDIS_BANNOTICE_PREFIX = "lumine_main_bannotice_"; // key per user: pesan "sedang di-jeda" sudah dikirim
async function sendCekJeda(token, chatId, uid) {
  const sisa = Number(await redisCommand(["TTL", REDIS_TEMPBAN_PREFIX + String(uid)])) || 0;
  const teks =
    sisa > 0
      ? `⏳ Kamu sedang di-jeda. Sisa waktu: <b>${sisa >= 60 ? Math.ceil(sisa / 60) + " menit" : sisa + " detik"}</b>.`
      : "✅ Kamu tidak sedang di-jeda. Silakan lanjut.";
  await tgRequest(token, "sendMessage", { chat_id: chatId, text: teks, parse_mode: "HTML" });
}

// ---- LOG AKTIVITAS ADMIN ----
const REDIS_ADMINLOG_KEY = "lumine_main_adminlog"; // list: JSON {t, msg}, 200 terakhir
async function logAdminAction(raw) {
  const cmd = String(raw).split(/\s+/)[0].toLowerCase();
  const sensitif = ["/setmacro", "/restore", "/backup", "/setqris"];
  const isi = sensitif.includes(cmd) ? cmd + " (isi disembunyikan)" : String(raw).slice(0, 150);
  await redisCommand(["LPUSH", REDIS_ADMINLOG_KEY, JSON.stringify({ t: getWibTimestamp(), msg: isi })]);
  await redisCommand(["LTRIM", REDIS_ADMINLOG_KEY, "0", "199"]);
}

// ---- NOTIFIKASI SPAM KE ADMIN ----
const REDIS_SPAM_ALERT_PREFIX = "lumine_main_spamalert_"; // key per user: cooldown notif 10 menit
const REDIS_SPAM_ALERT_MINUTE_KEY = "lumine_main_spamalert_menit"; // hitungan notif per menit (maks 10)
let lastSpamBanSec = 0; // durasi ban terakhir, dipakai untuk teks peringatan ke user
function formatDurasiBan() {
  return lastSpamBanSec >= 60 ? `${Math.round(lastSpamBanSec / 60)} menit` : `${lastSpamBanSec} detik`;
}
async function notifySpamBan(uid, strikes, banSec) {
  try {
    const token = process.env.BOT_TOKEN;
    const qris = await getQris();
    if (!token || !qris || !qris.admin_chat_id) return;
    const perMenit = parseInt(await redisCommand(["INCR", REDIS_SPAM_ALERT_MINUTE_KEY]), 10) || 0;
    if (perMenit === 1) await redisCommand(["EXPIRE", REDIS_SPAM_ALERT_MINUTE_KEY, "60"]);
    if (perMenit > 10) return;
    const ok = await redisCommand(["SET", REDIS_SPAM_ALERT_PREFIX + uid, "1", "NX", "EX", "600"]);
    if (ok !== "OK") return;
    const durasi = banSec >= 60 ? `${Math.round(banSec / 60)} menit` : `${banSec} detik`;
    await tgRequest(token, "sendMessage", {
      chat_id: qris.admin_chat_id,
      text: `🚫 <b>Spam terdeteksi</b>\nUser: <code>${uid}</code>\nPelanggaran ke-${strikes}, di-jeda <b>${durasi}</b>.`,
      parse_mode: "HTML",
    });
  } catch (e) {
    console.error("Notif spam error:", e && e.message);
  }
}

// ---- RATE LIMIT ----
// Hitung aksi per user dalam jendela waktu pendek.
// Hasil: "ok" | "limit" (baru melewati batas, kirim peringatan sekali) | "blocked" (diabaikan diam-diam)
// Kalau Redis error, dibiarkan lolos supaya pembeli tidak terblokir karena gangguan teknis.
async function checkRateLimit(userId) {
  if (!RATE_LIMIT_ENABLED || !userId) return "ok";
  try {
    const uid = String(userId);
    // Sedang di-ban sementara: abaikan diam-diam, tanpa menambah hitungan
    if (await redisCommand(["GET", REDIS_TEMPBAN_PREFIX + uid])) return "blocked";

    const key = REDIS_RATE_PREFIX + uid;
    const count = parseInt(await redisCommand(["INCR", key]), 10) || 0;
    if (count === 1) await redisCommand(["EXPIRE", key, RATE_LIMIT_WINDOW_SEC]);
    if (count === RATE_LIMIT_MAX + 1) {
      // Melewati batas: catat pelanggaran, lalu ban 1 menit (pertama) atau 5 menit (berulang)
      const strikeKey = REDIS_STRIKE_PREFIX + uid;
      const strikes = parseInt(await redisCommand(["INCR", strikeKey]), 10) || 1;
      await redisCommand(["EXPIRE", strikeKey, SPAM_STRIKE_WINDOW_SEC]);
      const banSec = strikes <= 1 ? SPAM_BAN_SEC_PERTAMA : SPAM_BAN_SEC_BERULANG;
      await redisCommand(["SET", REDIS_TEMPBAN_PREFIX + uid, "1", "EX", String(banSec)]);
      lastSpamBanSec = banSec;
      await notifySpamBan(uid, strikes, banSec);
      return "limit";
    }
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
      "• Check-in harian bisa menambah saldo.",
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
async function sendPromoStatus(token, chatId, userId) {
  const endTs = await getNewUserPromoEndTs(userId);
  const sisaMs = endTs - Date.now();
  let text;
  if (endTs > 0 && sisaMs > 0 && (await isNewBuyer(userId))) {
    const totalMenit = Math.floor(sisaMs / 60000);
    const hari = Math.floor(totalMenit / 1440);
    const jam = Math.floor((totalMenit % 1440) / 60);
    const menit = totalMenit % 60;
    const sisaTeks = hari > 0 ? `${hari} hari ${jam} jam` : jam > 0 ? `${jam} jam ${menit} menit` : `${menit} menit`;
    text =
      "🎁 <b>Harga khusus user baru masih aktif!</b>\n\n" +
      `⏱️ Sisa waktu: <b>${sisaTeks}</b>\n` +
      `📅 Berakhir: <b>${formatWibClock(endTs)}</b>\n\n` +
      "Buruan pilih set di 🛍️ Katalog sebelum promo habis.";
  } else {
    text =
      "ℹ️ Saat ini kamu tidak punya harga khusus user baru yang aktif.\n\n" +
      "Cek set terbaru dan harganya di 🛍️ Katalog.";
  }
  await tgRequest(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

async function sendWelcomeGuide(token, chatId, userId) {
  const endTs = await getNewUserPromoEndTs(userId);
  const promoLine =
    endTs > Date.now()
      ? `🎁 <b>Harga khusus user baru</b> berlaku sampai <b>${formatWibClock(endTs)}</b> (${NEW_USER_PROMO_DAYS} hari sejak kamu masuk).\n\n`
      : "";
  const text =
    "📖 <b>Panduan Singkat</b>\n\n" +
    promoLine +
    "1️⃣ Pilih set di 🛍️ Katalog\n" +
    "2️⃣ Tekan Beli, lalu bayar lewat QRIS\n" +
    "3️⃣ Setelah pembayaran di-ACC, set langsung dikirim\n" +
    "4️⃣ Lihat set yang sudah kamu beli di 🎒 Koleksi Saya\n\n" +
    `Ada kendala? Hubungi @${ADMIN_USERNAME} 🙏`;
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "📋 Panduan Lengkap", callback_data: "guide:root" }]] },
  });
}

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
  try {
    await settleReferralWeek(token);
  } catch (stlErr) {
    console.error("Bagi hadiah undang teman error:", stlErr);
  }
  try {
    await settlePatunganExpiry(token);
  } catch (ptErr) {
    console.error("Patungan kedaluwarsa error:", ptErr);
  }
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

  // Rekap omset kemarin juga dikirim ke tujuan omset (channel), kalau sudah diatur
  const omsetTargetDaily = await resolveOmsetTarget(null);
  if (omsetTargetDaily && String(omsetTargetDaily) !== String(adminChatId)) {
    await tgRequest(token, "sendMessage", {
      chat_id: omsetTargetDaily,
      parse_mode: "HTML",
      text:
        `📒 <b>REKAP OMSET ${escapeHtml(yesterdayKey)}</b>\n` +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        `💰 Total : <b>${formatRupiah(harian.rupiah)}</b>\n` +
        `🧾 Transaksi : <b>${harian.count}</b>\n` +
        `💼 Omset keseluruhan : ${formatRupiah(omset.rupiah)}`,
    });
  }
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

// Pengingat harga khusus user baru: jalan sekali sehari setelah jam 10 WIB,
// kirim ke user yang sisa promonya kurang dari 24 jam, belum belanja, dan sudah verifikasi HP.
async function maybeNewUserNudge(token) {
  const now = Date.now();
  const wib = new Date(now + 7 * 3600 * 1000);
  if (wib.getUTCHours() < 10) return;

  const todayKey = wibDayKey(now);
  if ((await redisCommand(["GET", REDIS_NUDGE_DAY_KEY])) === todayKey) return;
  await redisCommand(["SET", REDIS_NUDGE_DAY_KEY, todayKey]);

  const [joinRaw, sentRaw, bannedRaw] = await Promise.all([
    redisCommand(["HGETALL", REDIS_JOIN_TS_KEY]),
    redisCommand(["HKEYS", REDIS_NUDGE_SENT_KEY]),
    redisCommand(["HKEYS", REDIS_BLACKLIST_KEY]),
  ]);
  const joinMap = {};
  if (Array.isArray(joinRaw)) for (let i = 0; i < joinRaw.length; i += 2) joinMap[String(joinRaw[i])] = Number(joinRaw[i + 1]) || 0;
  const sent = new Set((Array.isArray(sentRaw) ? sentRaw : []).map(String));
  const banned = new Set((Array.isArray(bannedRaw) ? bannedRaw : []).map(String));

  let count = 0;
  for (const uid of Object.keys(joinMap)) {
    if (count >= NEW_USER_NUDGE_PER_RUN) break;
    if (banned.has(uid) || sent.has(uid)) continue;
    const endTs = joinMap[uid] + NEW_USER_PROMO_DAYS * 24 * 60 * 60 * 1000;
    const sisaMs = endTs - now;
    if (sisaMs <= 0 || sisaMs > 24 * 60 * 60 * 1000) continue;
    if (!(await isPhoneVerified(uid))) continue;
    if (!(await isNewBuyer(uid))) continue;

    const r = await tgRequest(token, "sendMessage", {
      chat_id: uid,
      parse_mode: "HTML",
      text:
        `⏰ <b>Harga khusus kamu hampir habis!</b>\n\n` +
        `Sisa kurang dari 24 jam sampai ${formatWibClock(endTs)}. ` +
        `Set harga normal Rp10.000 masih bisa kamu dapat seharga Rp7.000 untuk pembelian pertama.`,
      reply_markup: { inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]] },
    });
    if (r && r.ok) {
      count++;
      await redisCommand(["HSET", REDIS_NUDGE_SENT_KEY, uid, "1"]);
    }
  }
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

// ==========================================
// AUTO-POST SET BARU KE CHANNEL (pakai link bot, BUKAN link file asli -> anti bocor)
// ==========================================
const REDIS_BACKUP_LINK_KEY = "lumine_main_backup_store_link"; // link toko cadangan (mis. move2link) untuk pengumuman
const REDIS_ANNOUNCE_LAST_KEY = "lumine_main_announce_last"; // JSON: { chat_id, message_id, ts } pengumuman terakhir di channel
const REDIS_POST_CHANNEL_KEY = "lumine_main_post_channel"; // chat_id (-100...) atau @username channel tujuan auto-post set baru

async function getPostChannel() {
  const raw = await redisCommand(["GET", REDIS_POST_CHANNEL_KEY]);
  return raw ? String(raw) : "";
}

async function setPostChannel(val) {
  await redisCommand(["SET", REDIS_POST_CHANNEL_KEY, String(val)]);
}

// Dipanggil setiap ada set baru tersimpan lewat /tambah. Postingan ke channel HANYA berisi
// preview + tombol yang mengarah ke bot (deep-link /start buy_ID), bukan link Drive/file aslinya.
// ---- POSTING MASSAL SET LAMA KE CHANNEL (bertahap, POSTALL_PER_DAY set per hari WIB) ----
const POSTALL_PER_DAY = 0; // jatah posting per hari (WIB). 0 = TANPA BATAS harian. Isi angka (mis. 10) untuk membatasi lagi.
const POSTALL_MAX_PER_RUN = 15; // maksimal posting per satu proses (anti timeout Vercel & anti flood Telegram). Sisa antrean lanjut otomatis di proses berikutnya.
const POSTALL_QUOTA_LABEL = POSTALL_PER_DAY > 0 ? `${POSTALL_PER_DAY} set per hari` : "tanpa batas harian";
const POSTALL_DELAY_MS = 1000; // jeda antar posting supaya tidak kena limit Telegram
const REDIS_POSTALL_STATE_KEY = "lumine_main_postall_state"; // JSON: { active, queue, day, count }
const REDIS_POSTALL_DONE_KEY = "lumine_main_postall_done"; // hash: id set -> 1 (sudah diposting)
const REDIS_POSTALL_LOCK_KEY = "lumine_main_postall_lock"; // kunci anti jalan ganda

async function getPostAllState() {
  const raw = await redisCommand(["GET", REDIS_POSTALL_STATE_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function savePostAllState(st) {
  await redisCommand(["SET", REDIS_POSTALL_STATE_KEY, JSON.stringify(st)]);
}

// Kirim satu set ke channel: foto preview (kalau ada) + tombol ke bot. Link file asli tidak ikut.
async function postOneSetToChannel(token, item, channel, botUname, requirePhoto = false) {
  if (requirePhoto && !item.photo_id) return false; // /postset: jangan posting kalau preview belum ada
  const deepLink = `https://t.me/${botUname}?start=buy_${item.id}`;
  const katIcon = item.kategori === "full" ? "📦" : "🧩";
  const caption =
    `✨ <b>${escapeHtml(item.nama)}</b>\n` +
    `${katIcon} ${item.kategori === "full" ? "Full Set" : "Mini Set"}\n` +
    (item.creator ? `👤 Creator: ${escapeHtml(item.creator)}\n` : "") +
    (item.isi ? `📂 Isi: ${escapeHtml(item.isi)}\n` : "") +
    `💰 Harga: <b>${escapeHtml(String(item.harga))}</b>\n\n` +
    `Klik tombol di bawah untuk lihat & beli lewat bot 👇`;
  const replyMarkup = buildPostMarkup(item, botUname);

  const r = item.photo_id
    ? await tgRequest(token, "sendPhoto", {
        chat_id: channel,
        photo: item.photo_id,
        caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      })
    : await tgRequest(token, "sendMessage", {
        chat_id: channel,
        text: caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
  if (r && r.ok) {
    const mid = r.result && r.result.message_id;
    if (mid) {
      await recordPostMsg(item.id, (r.result.chat && r.result.chat.id) || channel, mid, "", msgToHtml(r.result), Boolean(r.result.photo));
      if (getCadanganList(item).length) await editPostButtons(token, item, botUname);
    }
  }
  return Boolean(r && r.ok);
}

// Posting sebagian antrean sesuai jatah harian. Aman dipanggil berkali-kali (hook tiap pesan masuk).
async function runPostAllBatch(token) {
  const st0 = await getPostAllState();
  if (!st0 || !st0.active) return { ran: false, reason: "inactive" };

  const lockOk = await redisCommand(["SET", REDIS_POSTALL_LOCK_KEY, "1", "NX", "EX", "120"]);
  if (lockOk !== "OK") return { ran: false, reason: "locked" };

  try {
    const st = await getPostAllState();
    if (!st || !st.active) return { ran: false, reason: "inactive" };

    const { dayKey } = getWibPeriods();
    if (st.day !== dayKey) {
      st.day = dayKey;
      st.count = 0;
    }
    if (POSTALL_PER_DAY > 0 && st.count >= POSTALL_PER_DAY) return { ran: false, reason: "quota" };

    const channel = await getPostChannel();
    if (!channel) return { ran: false, reason: "nochannel" };
    const botUname = await getBotUsername(token);
    if (!botUname) return { ran: false, reason: "nobot" };

    const byId = new Map((await getKatalog()).map((k) => [String(k.id), k]));
    let posted = 0;
    let failed = 0;
    while ((POSTALL_PER_DAY <= 0 || st.count < POSTALL_PER_DAY) && st.queue.length > 0 && posted + failed < POSTALL_MAX_PER_RUN) {
      const id = String(st.queue.shift());
      const item = byId.get(id);
      if (!item) continue; // set sudah dihapus dari katalog
      if (Number(await redisCommand(["HEXISTS", REDIS_POSTALL_DONE_KEY, id])) === 1) continue;

      const ok = await postOneSetToChannel(token, item, channel, botUname);
      if (ok) {
        await redisCommand(["HSET", REDIS_POSTALL_DONE_KEY, id, "1"]);
        st.count++;
        posted++;
      } else {
        failed++; // gagal dikirim: dilewati, tidak diulang otomatis
      }
      await new Promise((resolve) => setTimeout(resolve, POSTALL_DELAY_MS));
    }

    if (st.queue.length === 0) st.active = false;
    await savePostAllState(st);

    const qris = await getQris();
    if (qris && qris.admin_chat_id && (posted > 0 || failed > 0)) {
      await tgRequest(token, "sendMessage", {
        chat_id: qris.admin_chat_id,
        text:
          `📢 <b>Posting massal ke channel</b>\n` +
          `✅ Terkirim: ${posted} • ❌ Gagal: ${failed}\n` +
          (st.active ? `⏳ Sisa antrean: ${st.queue.length} set (lanjut otomatis, ${POSTALL_QUOTA_LABEL})` : "🎉 Antrean selesai."),
        parse_mode: "HTML",
      });
    }
    return { ran: true, posted, failed, left: st.queue.length };
  } finally {
    await redisCommand(["DEL", REDIS_POSTALL_LOCK_KEY]);
  }
}

// ---- PREVIEW MASSAL: admin kirim foto tanpa caption, dipasang berurutan ke set yang belum punya preview ----
const REDIS_PREVIEWMASSAL_KEY = "lumine_main_previewmassal"; // JSON: { active, queue: [id set] }

async function getPreviewMassal() {
  const raw = await redisCommand(["GET", REDIS_PREVIEWMASSAL_KEY]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function savePreviewMassal(st) {
  await redisCommand(["SET", REDIS_PREVIEWMASSAL_KEY, JSON.stringify(st)]);
}

// Dipanggil untuk tiap foto admin tanpa caption. Return true kalau foto ini dipakai untuk sesi massal.
const REDIS_PREVIEWMASSAL_LOCK_KEY = "lumine_main_previewmassal_lock";
const REDIS_PREVIEWMASSAL_PENDING_KEY = "lumine_main_previewmassal_pending"; // antrean foto (file_id) yang belum dipasang

// Pasang satu foto ke set berikutnya yang belum punya preview. Dipanggil hanya saat memegang kunci.
async function placeOnePreviewMassal(fileId) {
  const st = await getPreviewMassal();
  if (!st || !st.active) return null;

  const katalog = await getKatalog();
  let idx = -1;
  while (st.queue.length > 0 && idx === -1) {
    const id = String(st.queue.shift());
    const i = katalog.findIndex((k) => String(k.id) === id);
    if (i !== -1 && !katalog[i].photo_id) idx = i;
  }
  if (idx === -1) {
    st.active = false;
    await savePreviewMassal(st);
    return null;
  }

  katalog[idx].photo_id = fileId;
  await saveKatalog(katalog);

  st.done = Array.isArray(st.done) ? st.done : [];
  st.done.push(`${idx + 1}. ${katalog[idx].nama}`);
  if (st.done.length > 50) st.done = st.done.slice(-50);

  let nextIdx = -1;
  for (const id of st.queue) {
    const i = katalog.findIndex((k) => String(k.id) === String(id));
    if (i !== -1 && !katalog[i].photo_id) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1) st.active = false;
  const sisa = katalog.filter((k) => st.queue.map(String).includes(String(k.id)) && !k.photo_id).length;
  await savePreviewMassal(st);

  return {
    no: idx + 1,
    nama: katalog[idx].nama,
    nextNo: nextIdx !== -1 ? nextIdx + 1 : 0,
    nextNama: nextIdx !== -1 ? katalog[nextIdx].nama : "",
    sisa,
    selesai: !st.active,
    done: st.done,
  };
}

// Foto masuk ke antrean dulu (berurutan sesuai kedatangan). Satu proses memegang kunci dan
// memasang semua foto yang antre; proses lain cukup menambahkan fotonya ke antrean.
async function handlePreviewMassalPhoto(token, msg) {
  const st0 = await getPreviewMassal();
  if (!st0 || !st0.active) return false;

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  await redisCommand(["RPUSH", REDIS_PREVIEWMASSAL_PENDING_KEY, fileId]);

  const chatId = msg.chat.id;
  let placed = [];
  for (let round = 0; round < 100; round++) {
    const got = await redisCommand(["SET", REDIS_PREVIEWMASSAL_LOCK_KEY, "1", "NX", "EX", "60"]);
    if (got !== "OK") break; // proses lain sedang memasang dan akan mengambil foto ini

    try {
      while (true) {
        const next = await redisCommand(["LPOP", REDIS_PREVIEWMASSAL_PENDING_KEY]);
        if (!next) break;
        const r = await placeOnePreviewMassal(String(next));
        if (r) placed.push(r);
        else {
          await redisCommand(["DEL", REDIS_PREVIEWMASSAL_PENDING_KEY]); // sesi habis: sisa foto dibuang
          break;
        }
      }
    } finally {
      await redisCommand(["DEL", REDIS_PREVIEWMASSAL_LOCK_KEY]);
    }

    // Cek lagi: ada foto yang masuk saat kunci dipegang?
    const sisaAntrean = Number(await redisCommand(["LLEN", REDIS_PREVIEWMASSAL_PENDING_KEY])) || 0;
    const stNow = await getPreviewMassal();
    if (sisaAntrean === 0 || !stNow || !stNow.active) break;
  }

  if (placed.length > 0) {
    const last = placed[placed.length - 1];
    const daftar = placed.map((p) => `✅ ${p.no}. ${escapeHtml(p.nama)}`).join("\n");
    const cek = (last.done || []).slice(-5).map((d) => `✅ ${escapeHtml(d)}`).join("\n");
    const bawah = last.selesai
      ? "🎉 Semua set sudah dipasangi preview. Sesi massal selesai."
      : `⏭ Berikutnya: <b>${last.nextNo}. ${escapeHtml(last.nextNama)}</b>\nSisa antrean: <b>${last.sisa}</b> set.`;
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        `📋 <b>Dipasang ${placed.length} foto</b>\n${daftar}\n\n` +
        `<b>Checklist sesi</b> (${(last.done || []).length} terpasang)\n${cek}\n\n${bawah}`,
      parse_mode: "HTML",
    });
  }
  return true;
}

// ---- POST SET BERDASARKAN NOMOR (/postset), jatah harian sendiri POSTALL_PER_DAY ----
const REDIS_POSTSET_QUEUE_KEY = "lumine_main_postset_queue"; // list: id set yang antre
const REDIS_POSTSET_DAY_PREFIX = "lumine_main_postset_day_"; // counter posting per hari (WIB)
const REDIS_POSTSET_LOCK_KEY = "lumine_main_postset_lock";

// Posting dari antrean /postset sesuai sisa jatah hari ini. Aman dipanggil berkali-kali.
async function runPostSetBatch(token) {
  const qLen = Number(await redisCommand(["LLEN", REDIS_POSTSET_QUEUE_KEY])) || 0;
  if (qLen === 0) return { ran: false, reason: "empty" };

  const { dayKey } = getWibPeriods();
  const dayKeyCnt = REDIS_POSTSET_DAY_PREFIX + dayKey;
  if (POSTALL_PER_DAY > 0 && (Number(await redisCommand(["GET", dayKeyCnt])) || 0) >= POSTALL_PER_DAY) {
    return { ran: false, reason: "quota" };
  }
  const channel = await getPostChannel();
  if (!channel) return { ran: false, reason: "nochannel" };
  const botUname = await getBotUsername(token);
  if (!botUname) return { ran: false, reason: "nobot" };

  const lockOk = await redisCommand(["SET", REDIS_POSTSET_LOCK_KEY, "1", "NX", "EX", "120"]);
  if (lockOk !== "OK") return { ran: false, reason: "locked" };

  let posted = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const byId = new Map((await getKatalog()).map((k) => [String(k.id), k]));
    while (true) {
      const used = Number(await redisCommand(["GET", dayKeyCnt])) || 0;
      if (POSTALL_PER_DAY > 0 && used >= POSTALL_PER_DAY) break;
      if (posted + failed >= POSTALL_MAX_PER_RUN) break; // sisa dilanjutkan otomatis di proses berikutnya
      const id = await redisCommand(["LPOP", REDIS_POSTSET_QUEUE_KEY]);
      if (!id) break;
      const item = byId.get(String(id));
      if (!item || Number(await redisCommand(["HEXISTS", REDIS_POSTALL_DONE_KEY, String(id)])) === 1) {
        skipped++;
        continue;
      }
      const ok = await postOneSetToChannel(token, item, channel, botUname, true);
      if (ok) {
        await redisCommand(["HSET", REDIS_POSTALL_DONE_KEY, String(id), "1"]);
        await redisCommand(["INCR", dayKeyCnt]);
        await redisCommand(["EXPIRE", dayKeyCnt, String(60 * 60 * 24 * 3)]);
        posted++;
      } else {
        failed++;
      }
      await new Promise((resolve) => setTimeout(resolve, POSTALL_DELAY_MS));
    }
  } finally {
    await redisCommand(["DEL", REDIS_POSTSET_LOCK_KEY]);
  }

  const sisa = Number(await redisCommand(["LLEN", REDIS_POSTSET_QUEUE_KEY])) || 0;
  return { ran: true, posted, failed, skipped, sisa };
}

// ---- TOMBOL "LINK CADANGAN" PADA POSTINGAN CHANNEL (diedit langsung, tanpa posting ulang) ----
const REDIS_POSTMSG_KEY = "lumine_main_post_msgs"; // hash: id set -> JSON { chat_id, message_id, cad } (postingan channel milik set itu)

// Semua link cadangan satu set: link utama (item.cadangan) + link tambahan (item.cadangan_extra)
function getCadanganList(item) {
  const out = [];
  if (item && item.cadangan) out.push(String(item.cadangan));
  if (item && Array.isArray(item.cadangan_extra)) {
    for (const u of item.cadangan_extra) if (u && !out.includes(String(u))) out.push(String(u));
  }
  return out;
}

function cadanganKey(item) {
  return getCadanganList(item).join("|");
}

// Tombol postingan: tombol beli ke bot + tombol untuk tiap link cadangan set
function buildPostMarkup(item, botUname) {
  const rows = [[{ text: "🛒 Lihat & Beli", url: `https://t.me/${botUname}?start=buy_${item.id}` }]];
  return { inline_keyboard: rows };
}

async function recordPostMsg(itemId, chatId, messageId, cad, base, isPhoto) {
  await redisCommand([
    "HSET",
    REDIS_POSTMSG_KEY,
    String(itemId),
    JSON.stringify({ chat_id: chatId, message_id: messageId, cad: cad || "", base: base || "", photo: Boolean(isPhoto) }),
  ]);
}

// Ubah teks + entity pesan Telegram jadi HTML (supaya teks asli tetap utuh saat link cadangan ditambahkan)
function msgToHtml(m) {
  const src = String((m && (m.text || m.caption)) || "");
  const ents = ((m && (m.entities || m.caption_entities)) || []).filter((e) => e && e.type && e.length > 0);
  if (!ents.length) return escapeHtml(src);
  const tagOf = (e) => {
    if (e.type === "bold") return ["<b>", "</b>"];
    if (e.type === "italic") return ["<i>", "</i>"];
    if (e.type === "underline") return ["<u>", "</u>"];
    if (e.type === "strikethrough") return ["<s>", "</s>"];
    if (e.type === "code") return ["<code>", "</code>"];
    if (e.type === "pre") return ["<pre>", "</pre>"];
    if (e.type === "text_link" && e.url) return [`<a href="${escapeHtml(e.url)}">`, "</a>"];
    return null;
  };
  const sorted = ents.slice().sort((a, b) => a.offset - b.offset || b.length - a.length);
  let out = "";
  const stack = [];
  let idx = 0;
  for (let i = 0; i <= src.length; i++) {
    // tutup tag yang berakhir di posisi ini (urutan LIFO)
    while (stack.length && stack[stack.length - 1].end === i) {
      out += stack.pop().close;
    }
    // buka tag yang mulai di posisi ini
    while (idx < sorted.length && sorted[idx].offset === i) {
      const e = sorted[idx++];
      const t = tagOf(e);
      if (t) {
        out += t[0];
        stack.push({ end: e.offset + e.length, close: t[1] });
      }
    }
    if (i < src.length) out += escapeHtml(src[i]);
  }
  while (stack.length) out += stack.pop().close;
  return out;
}

// Blok teks link cadangan yang ditambahkan di bawah teks asli postingan
function cadanganBlock(item) {
  const list = getCadanganList(item);
  if (!list.length) return "";
  const lines = list.map((u, i) => (list.length > 1 ? `${i + 1}. ${escapeHtml(u)}` : escapeHtml(u)));
  return "\n\n🛍️ <b>Beli di Link Cadangan:</b>\n" + lines.join("\n");
}

async function getPostMsg(itemId) {
  try {
    const raw = await redisCommand(["HGET", REDIS_POSTMSG_KEY, String(itemId)]);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function getAllPostMsgs() {
  const flat = (await redisCommand(["HGETALL", REDIS_POSTMSG_KEY])) || [];
  const out = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out[flat[i]] = JSON.parse(flat[i + 1]);
    } catch {}
  }
  return out;
}

// Edit tombol satu postingan channel supaya sesuai link cadangan set saat ini.
async function editPostButtons(token, item, botUname) {
  const rec = await getPostMsg(item.id);
  if (!rec) return { ok: false, reason: "belum tercatat" };
  if (!rec.base) return { ok: false, reason: "teks asli belum tercatat, teruskan ulang postingan ini ke bot" };
  const want = cadanganKey(item);
  if ((rec.cad || "") === want) return { ok: true, skipped: true };
  const fullText = rec.base + cadanganBlock(item);
  const payload = rec.photo
    ? { chat_id: rec.chat_id, message_id: rec.message_id, caption: fullText, parse_mode: "HTML", reply_markup: buildPostMarkup(item, botUname) }
    : { chat_id: rec.chat_id, message_id: rec.message_id, text: fullText, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: buildPostMarkup(item, botUname) };
  const r = await tgRequest(token, rec.photo ? "editMessageCaption" : "editMessageText", payload);
  if (r && (r.ok || /not modified/i.test(r.description || ""))) {
    rec.cad = want;
    await redisCommand(["HSET", REDIS_POSTMSG_KEY, String(item.id), JSON.stringify(rec)]);
    return { ok: true };
  }
  return { ok: false, reason: (r && r.description) || "unknown", retryAfter: r && r.parameters && r.parameters.retry_after };
}

// entries: [{ no, item }]. Maksimal maxN edit per proses (anti timeout & anti flood Telegram).
async function syncPostButtons(token, entries, maxN) {
  const botUname = await getBotUsername(token);
  const res = { edited: 0, skipped: 0, notRecorded: [], failed: [], left: 0 };
  if (!botUname) {
    res.failed.push({ no: 0, reason: "username bot tidak terbaca" });
    return res;
  }
  let stop = false;
  for (const e of entries) {
    if (stop || res.edited >= maxN) {
      res.left++;
      continue;
    }
    const r = await editPostButtons(token, e.item, botUname);
    if (r.ok && r.skipped) res.skipped++;
    else if (r.ok) {
      res.edited++;
      await new Promise((rs) => setTimeout(rs, 700));
    } else if (r.reason === "belum tercatat") res.notRecorded.push(e.no);
    else {
      res.failed.push({ no: e.no, reason: r.reason });
      if (r.retryAfter) {
        stop = true;
        res.left++;
      }
    }
  }
  return res;
}

async function syncSummaryText(token, entries) {
  if (!entries.length) return "";
  const sy = await syncPostButtons(token, entries, 25);
  let t = "";
  if (sy.edited) t += `\n✏️ ${sy.edited} postingan di channel sudah diedit otomatis (tanpa posting ulang).`;
  if (sy.notRecorded.length)
    t +=
      `\n📭 Postingan belum tercatat untuk nomor: ${sy.notRecorded.slice(0, 25).join(", ")}${sy.notRecorded.length > 25 ? " dst" : ""}.` +
      `\nTeruskan (forward) postingan set itu dari channel ke bot ini, nanti otomatis tercatat dan diedit.`;
  if (sy.failed.length) t += `\n⚠️ Gagal edit: ${sy.failed.slice(0, 5).map((f) => `#${f.no} (${escapeHtml(String(f.reason).slice(0, 60))})`).join(", ")}`;
  if (sy.left) t += `\n⏳ ${sy.left} postingan belum diproses, kirim /updatepost untuk lanjut.`;
  return t ? "\n" + t : "";
}

// Kenali set dari postingan channel yang di-forward admin: pakai tombol (start=buy_ID), kalau tidak ada pakai nama di teks.
function parsePostedSet(m, katalog) {
  const kb = (m.reply_markup && m.reply_markup.inline_keyboard) || [];
  for (const row of kb) {
    for (const b of row) {
      const mm = /[?&]start=buy_(\d+)/.exec((b && b.url) || "");
      if (mm) {
        const it = katalog.find((k) => String(k.id) === mm[1]);
        if (it) return { item: it };
      }
    }
  }
  const text = String(m.caption || m.text || "");
  let nama = "";
  for (const raw of text.split(/\r?\n/)) {
    const ln = raw.trim();
    const mm = /^(?:✨|📦|🧩)\s*(.+)$/.exec(ln);
    if (!mm) continue;
    const cand = mm[1].trim();
    if (/^(full|mini)\s*set$/i.test(cand)) continue;
    nama = cand;
    break;
  }
  if (!nama) return { item: null, why: "nama set tidak terbaca di postingan" };
  const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
  const hits = katalog.filter((k) => norm(k.nama) === norm(nama));
  if (hits.length === 1) return { item: hits[0] };
  if (hits.length > 1) return { item: null, why: `ada ${hits.length} set bernama "${nama}"` };
  return { item: null, why: `tidak ada set bernama "${nama}"` };
}

// ---- CHANNEL CADANGAN: bot membaca link dari postingan channel cadangan, dicocokkan ke nama set ----
const REDIS_BACKUP_CH_KEY = "lumine_main_backup_channel"; // channel cadangan (@username atau id)
const REDIS_KATALOG_LOCK_KEY = "lumine_main_katalog_lock"; // kunci anti tabrakan tulis katalog

async function getBackupChannel() {
  const raw = await redisCommand(["GET", REDIS_BACKUP_CH_KEY]);
  return raw ? String(raw) : "";
}

function sameChannelCfg(cfg, chat) {
  if (!cfg || !chat) return false;
  if (String(cfg) === String(chat.id)) return true;
  return String(cfg).startsWith("@") && Boolean(chat.username) && String(cfg).toLowerCase() === "@" + String(chat.username).toLowerCase();
}

async function getNotifyAdminId() {
  if (ADMIN_IDS.length > 0) return ADMIN_IDS[0];
  const pinned = await redisCommand(["GET", REDIS_ADMIN_ID_KEY]);
  return pinned ? String(pinned) : "";
}

const normCore = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Jarak ejaan (Levenshtein) untuk menebak nama set yang salah ketik
function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
// Cari set di katalog yang namanya paling mirip (dipakai untuk saran "maksudnya ...?")
function bestNameGuess(text, katalog, maxDist = 4) {
  const t = normCore(text);
  if (!t) return null;
  let best = null, bd = Infinity;
  for (const k of katalog) {
    const d = editDistance(t, normCore(k.nama));
    if (d < bd) { bd = d; best = k; }
  }
  return best && bd <= maxDist ? { item: best, no: katalog.indexOf(best) + 1, dist: bd } : null;
}

// Cari nama set di dalam sebuah teks (nama terpanjang yang menang; kembar/ambigu dilaporkan).
function findSetInText(text, katalog) {
  const t = " " + normCore(text) + " ";
  const hits = [];
  for (const it of katalog) {
    const n = normCore(it.nama);
    if (n.length >= 3 && t.includes(" " + n + " ")) hits.push({ it, n });
  }
  if (!hits.length) return { item: null, ambiguous: false };
  const maxLen = Math.max(...hits.map((h) => h.n.length));
  const best = hits.filter((h) => h.n.length === maxLen);
  if (best.length > 1) return { item: null, ambiguous: true, names: best.map((b) => b.it.nama) };
  return { item: best[0].it, ambiguous: false };
}

// Ambil semua link dari satu postingan (teks, hyperlink, tombol) lalu pasangkan ke set berdasarkan nama.
function extractBackupPairs(m, katalog, botUname) {
  const text = String(m.text || m.caption || "");
  const ents = m.entities || m.caption_entities || [];
  const raw = [];
  const push = (url, start, end, label) => {
    let u = String(url || "").trim().replace(/[)\].,;]+$/, "");
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      if (/^(t\.me|telegram\.me)\//i.test(u) || /^[\w-]+(\.[\w-]+)+\//.test(u)) u = "https://" + u;
      else return;
    }
    raw.push({ url: u, start, end, label: label || "" });
  };
  for (const e of ents) {
    if (e.type === "text_link" && e.url) push(e.url, e.offset, e.offset + e.length, text.substr(e.offset, e.length));
    else if (e.type === "url") push(text.substr(e.offset, e.length), e.offset, e.offset + e.length, "");
  }
  for (const row of (m.reply_markup && m.reply_markup.inline_keyboard) || []) {
    for (const b of row) if (b && b.url) push(b.url, -1, -1, b.text || "");
  }
  const mine = botUname ? new RegExp("t\\.me/" + botUname + "(\\b|/|\\?)", "i") : null;
  const seen = new Set();
  const links = raw.filter((l) => {
    if (/[?&]start=buy_/i.test(l.url) || (mine && mine.test(l.url))) return false;
    const key = l.url + "@" + l.start;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lines = [];
  let pos = 0;
  for (const ln of text.split("\n")) {
    lines.push({ start: pos, end: pos + ln.length, text: ln });
    pos += ln.length + 1;
  }
  const stripUrl = (x) => String(x).replace(/https?:\/\/\S+/g, " ");

  const pairsList = [];
  const unmatched = [];
  const ambiguous = [];
  for (const l of links) {
    const cands = [];
    if (l.label && !/^https?:\/\//i.test(l.label.trim())) cands.push(l.label);
    if (l.start >= 0) {
      const li = lines.findIndex((x) => l.start >= x.start && l.start <= x.end);
      if (li >= 0) {
        cands.push(stripUrl(lines[li].text));
        // nama set bisa ada di baris di atas (mis. "Nama Set" lalu "Link : https://...")
        for (let pj = li - 1; pj >= 0; pj--) {
          if (normCore(lines[pj].text)) {
            cands.push(lines[pj].text);
            break;
          }
        }
      }
    } else cands.push(text);
    if (links.length === 1) cands.push(text);

    let found = null;
    let amb = null;
    for (const c of cands) {
      const r = findSetInText(c, katalog);
      if (r.item) {
        found = r.item;
        break;
      }
      if (r.ambiguous && !amb) amb = r.names;
    }
    if (found) pairsList.push({ item: found, url: l.url });
    else if (amb) ambiguous.push({ url: l.url, names: amb });
    else unmatched.push({ url: l.url, label: (l.label || cands[1] || "").trim().slice(0, 40) });
  }
  return { total: links.length, pairs: pairsList, unmatched, ambiguous };
}

// Simpan link cadangan ke katalog (dengan kunci supaya banyak postingan yang masuk bersamaan tidak saling menimpa).
async function applyBackupPairs(pairs) {
  let locked = false;
  for (let i = 0; i < 30 && !locked; i++) {
    locked = (await redisCommand(["SET", REDIS_KATALOG_LOCK_KEY, "1", "NX", "EX", "15"])) === "OK";
    if (!locked) await new Promise((rs) => setTimeout(rs, 200));
  }
  try {
    const list = await getKatalog();
    const changed = [];
    const conflicts = [];
    let unchanged = 0;
    for (const p of pairs) {
      const idx = list.findIndex((k) => String(k.id) === String(p.item.id));
      if (idx < 0) continue;
      const old = list[idx].cadangan || "";
      if (getCadanganList(list[idx]).includes(p.url)) {
        unchanged++;
        continue;
      }
      if (old) {
        // set sudah punya link cadangan: tanya admin dulu (tambah / ganti / abaikan)
        conflicts.push({ item: list[idx], url: p.url });
        continue;
      }
      list[idx].cadangan = p.url;
      if (!changed.some((c) => c.no === idx + 1)) changed.push({ no: idx + 1, item: list[idx], old, added: false });
    }
    if (changed.length) {
      await saveKatalog(list);
      const nowTs = Date.now();
      for (const c of changed) {
        await redisCommand(["LPUSH", REDIS_CAD_LOG_KEY, JSON.stringify({ t: nowTs, nama: c.item.nama, lama: c.old || "", baru: c.item.cadangan || (c.item.cadangan_extra || []).slice(-1)[0] || "", via: "auto" })]);
      }
      await redisCommand(["LTRIM", REDIS_CAD_LOG_KEY, "0", "499"]);
    }
    return { changed, unchanged, conflicts };
  } finally {
    if (locked) await redisCommand(["DEL", REDIS_KATALOG_LOCK_KEY]);
  }
}

// Terapkan pilihan admin dari tombol konfirmasi (tambah atau ganti link cadangan)
async function applyCadanganChoice(token, itemId, url, mode) {
  const got = await redisCommand(["SET", REDIS_KATALOG_LOCK_KEY, "1", "NX", "EX", "15"]);
  if (got !== "OK") return { ok: false, reason: "katalog sedang dipakai, coba lagi" };
  try {
    const list = await getKatalog();
    const idx = list.findIndex((k) => String(k.id) === String(itemId));
    if (idx < 0) return { ok: false, reason: "set tidak ditemukan" };
    const item = list[idx];
    if (mode === "rep") {
      item.cadangan = url;
      item.cadangan_extra = [];
    } else {
      if (!item.cadangan) item.cadangan = url;
      else {
        if (!Array.isArray(item.cadangan_extra)) item.cadangan_extra = [];
        if (!getCadanganList(item).includes(url)) item.cadangan_extra.push(url);
      }
    }
    await saveKatalog(list);
    await redisCommand(["LPUSH", REDIS_CAD_LOG_KEY, JSON.stringify({ t: Date.now(), nama: item.nama, lama: "", baru: url, via: mode === "rep" ? "konfirmasi ganti" : "konfirmasi tambah" })]);
    await redisCommand(["LTRIM", REDIS_CAD_LOG_KEY, "0", "499"]);
    await syncSummaryText(token, [{ no: idx + 1, item }]);
    return { ok: true };
  } finally {
    await redisCommand(["DEL", REDIS_KATALOG_LOCK_KEY]);
  }
}

// Laporan harian ringkas untuk admin (dipanggil oleh Vercel Cron)
async function sendDailyReport(token) {
  const to = await getNotifyAdminId();
  if (!to) return;
  const katalog = await getKatalog();
  const noCad = katalog.filter((k) => getCadanganList(k).length === 0).length;
  const noPrev = katalog.filter((k) => !k.photo_id).length;
  const flat = (await redisCommand(["HGETALL", REDIS_POSTMSG_KEY])) || [];
  const tercatat = new Set();
  for (let i = 0; i < flat.length; i += 2) tercatat.add(String(flat[i]));
  const belumTercatat = katalog.filter((k) => !tercatat.has(String(k.id))).length;
  const logs = (await redisCommand(["LRANGE", REDIS_CAD_LOG_KEY, "0", "499"])) || [];
  const dayAgo = Date.now() - 86400000;
  const baruHariIni = logs
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter((e) => e && e.t >= dayAgo).length;
  const pesan =
    "🗓 <b>Laporan harian</b>\n" +
    `• Set di katalog: <b>${katalog.length}</b>\n` +
    `• Belum punya link cadangan: <b>${noCad}</b>\n` +
    `• Belum punya preview: <b>${noPrev}</b>\n` +
    `• Postingan CH utama belum tercatat: <b>${belumTercatat}</b>\n` +
    `• Link cadangan baru (24 jam): <b>${baruHariIni}</b>`;
  const { dayKey } = getWibPeriods();
  const omsetRaw = (await redisCommand(["HGETALL", `${REDIS_OMSET_CREATOR_PREFIX}${dayKey}`])) || [];
  let omsetTxt = "\n\n💰 <b>Omset hari ini per creator:</b>";
  if (omsetRaw.length === 0) omsetTxt += "\n<i>Belum ada penjualan.</i>";
  else {
    const rows = [];
    for (let i = 0; i < omsetRaw.length; i += 2) rows.push([String(omsetRaw[i]), Number(omsetRaw[i + 1]) || 0]);
    rows.sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((acc, r) => acc + r[1], 0);
    for (const [name, val] of rows) omsetTxt += `\n• ${escapeHtml(name)}: <b>${formatRupiah(val)}</b>`;
    omsetTxt += `\n<b>Total: ${formatRupiah(total)}</b>`;
  }
  await tgRequest(token, "sendMessage", { chat_id: to, text: pesan + omsetTxt, parse_mode: "HTML" });

  const backupPayload = JSON.stringify({ exported_at: getWibTimestamp(), total: katalog.length, katalog }, null, 2);
  await sendJsonDocument(
    token,
    to,
    `backup-katalog-${getWibFileStamp()}.json`,
    backupPayload,
    `📦 <b>Backup katalog harian</b> (${katalog.length} set). Simpan baik-baik. Kalau katalog rusak, upload file ini dengan caption /restore.`
  );
}

// Proses satu postingan dari channel cadangan (atau yang di-forward admin dari sana).
async function handleBackupPost(token, m, reportChatId, alwaysNotify) {
  const katalog = await getKatalog();
  const botUname = await getBotUsername(token);
  const ex = extractBackupPairs(m, katalog, botUname);
  const to = reportChatId || (await getNotifyAdminId());
  const say = (t) => (to ? tgRequest(token, "sendMessage", { chat_id: to, text: t, parse_mode: "HTML", disable_web_page_preview: true }) : null);
  if (ex.total === 0) {
    if (alwaysNotify) await say("⚠️ Tidak ada link di postingan ini.");
    return;
  }
  const ap = ex.pairs.length ? await applyBackupPairs(ex.pairs) : { changed: [], unchanged: 0, conflicts: [] };
  for (const cf of ap.conflicts || []) {
    const pid = Math.random().toString(36).slice(2, 10);
    await redisCommand(["SET", `lumine_main_cad_pend_${pid}`, JSON.stringify({ itemId: String(cf.item.id), url: cf.url }), "EX", "86400"]);
    if (to) {
      await tgRequest(token, "sendMessage", {
        chat_id: to,
        text: `⚠️ <b>${escapeHtml(cf.item.nama)}</b> sudah punya link cadangan.\nLink baru: ${escapeHtml(cf.url)}\nMau diapakan?`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: "➕ Tambah", callback_data: `cadpick_${pid}_add` },
            { text: "🔁 Ganti", callback_data: `cadpick_${pid}_rep` },
            { text: "❌ Abaikan", callback_data: `cadpick_${pid}_skip` },
          ]],
        },
      });
    }
  }
  const syncTxt = ap.changed.length ? await syncSummaryText(token, ap.changed.map((c) => ({ no: c.no, item: c.item }))) : "";

  const problem = ex.unmatched.length > 0 || ex.ambiguous.length > 0;
  const cnt = Number(await redisCommand(["INCR", "lumine_main_bk_cnt"])) || 1;
  if (cnt === 1) await redisCommand(["EXPIRE", "lumine_main_bk_cnt", "120"]);
  const periodic = cnt === 1 || cnt % 10 === 0;
  if (!problem && !(periodic && (ap.changed.length || alwaysNotify))) return;

  const short = (u) => (u.length > 55 ? u.slice(0, 52) + "..." : u);
  const lines = [];
  for (const c of ap.changed.slice(0, 15)) {
    lines.push(`🔗 #${c.no} <b>${escapeHtml(c.item.nama)}</b> ← ${escapeHtml(short(c.item.cadangan))} (${c.added ? "ditambah" : c.old ? "diperbarui" : "baru"})`);
  }
  if (ap.changed.length > 15) lines.push(`… dan ${ap.changed.length - 15} set lain`);
  if (!ap.changed.length && ap.unchanged) lines.push(`✅ ${ap.unchanged} set sudah punya link yang sama, tidak ada perubahan.`);
  for (const u of ex.unmatched.slice(0, 5)) {
    const g = u.label ? bestNameGuess(u.label, katalog) : null;
    const saran = g ? `\n   💡 Maksudnya <b>${escapeHtml(g.item.nama)}</b>? Kirim: <code>/setcadangan ${g.no} ${escapeHtml(u.url)}</code>` : "";
    lines.push(`❓ Link tidak cocok dengan set manapun: ${escapeHtml(short(u.url))}${u.label ? ` (teks: "${escapeHtml(u.label)}")` : ""}${saran}`);
  }
  for (const a of ex.ambiguous.slice(0, 3)) {
    lines.push(`⚠️ Nama kembar, dilewati: ${escapeHtml(a.names.slice(0, 3).join(" / "))} → ${escapeHtml(short(a.url))}`);
  }
  if (cnt > 1 && periodic) lines.push(`<i>(${cnt} postingan diproses dalam 2 menit terakhir)</i>`);
  await say(`📥 <b>Channel cadangan</b>\n${lines.join("\n")}${syncTxt}`);
}

async function postNewSetToChannel(token, item) {
  try {
    const targetChannel = await getPostChannel();
    if (!targetChannel) return; // belum diset admin lewat /setpostchannel

    const botUname = await getBotUsername(token);
    if (!botUname) return;

    const deepLink = `https://t.me/${botUname}?start=buy_${item.id}`;
    const katIcon = item.kategori === "full" ? "📦" : "🧩";
    const caption =
      `🆕 <b>SET BARU RILIS!</b>\n\n` +
      `${katIcon} <b>${escapeHtml(item.nama)}</b>\n` +
      (item.creator ? `👤 Creator: ${escapeHtml(item.creator)}\n` : "") +
      `📂 Isi: ${escapeHtml(item.isi)}\n` +
      `💰 Harga: <b>${escapeHtml(item.harga)}</b>\n\n` +
      `Klik tombol di bawah buat lihat & beli langsung lewat bot 👇`;

    const replyMarkup = buildPostMarkup(item, botUname);

    const rNew = item.photo_id
      ? await tgRequest(token, "sendPhoto", {
          chat_id: targetChannel,
          photo: item.photo_id,
          caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        })
      : await tgRequest(token, "sendMessage", {
          chat_id: targetChannel,
          text: caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
    // set yang sudah diposting otomatis ikut ditandai, supaya /postsemua & /postset tidak memposting dobel
    if (rNew && rNew.ok) {
      await redisCommand(["HSET", REDIS_POSTALL_DONE_KEY, String(item.id), "1"]);
      // catat id pesan channel supaya tombol bisa diedit nanti (tombol Link Cadangan) tanpa posting ulang
      const mid = rNew.result && rNew.result.message_id;
      if (mid) {
        await recordPostMsg(item.id, (rNew.result.chat && rNew.result.chat.id) || targetChannel, mid, "", msgToHtml(rNew.result), Boolean(rNew.result.photo));
        if (getCadanganList(item).length) await editPostButtons(token, item, botUname);
      }
    }
  } catch (e) {
    console.error("Auto-post set ke channel gagal:", e && e.message);
  }
}

// Tampilkan detail 1 set. Dipakai oleh callback "detail_ID" (tombol di dalam bot) DAN oleh
// deep-link /start buy_ID (dari tombol channel), supaya tampilannya konsisten di kedua jalur.
async function sendItemDetailView(token, chatId, callerId, itemId) {
  const katalogList = await getKatalog();
  const item = katalogList.find((k) => String(k.id) === String(itemId));

  if (!item) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Maaf, set ini sudah dihapus atau diperbarui oleh admin.",
    });
    return;
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
  const flashSaleNow = await getFlashSale();
  const itemFlashActive = Boolean(flashSaleNow && String(flashSaleNow.item_id) === String(item.id));
  const flashLine = itemFlashActive
    ? `│ • ⚡ <b>FLASH SALE :</b> <s>${escapeHtml(item.harga)}</s> ➜ <code>${formatRupiah(flashSaleNow.flash_price)}</code>\n` +
      `│ • ⏱️ <b>Berakhir :</b> ${getFlashSaleRemainingText(flashSaleNow)} (${formatWibClock(flashSaleNow.end_ts)})\n`
    : "";
  const captionText =
    (itemFlashActive ? `⚡⚡⚡ <b>FLASH SALE AKTIF!</b> ⚡⚡⚡\n\n` : "") +
    `✨ <b>${escapeHtml(item.nama)}</b>\n\n` +
    itemRatingBlock +
    `╭─── 📦 <b>DETAIL PAKET</b> ───\n` +
    popularityLine +
    (item.creator ? `│ • <b>Creator :</b> 👤 ${escapeHtml(item.creator)}\n` : "") +
    `│ • <b>Isi :</b> ${escapeHtml(item.isi)}\n` +
    (itemFlashActive
      ? flashLine
      : `│ • <b>Harga :</b> <code>${escapeHtml(item.harga)}</code>\n`) +
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
  if (VIP_ENABLED && (await isVipUser(callerId))) {
    inlineMarkup.inline_keyboard[0] = [{ text: "🎁 Ambil Gratis (VIP)", callback_data: `vipget_${item.id}` }];
  }
  const newUserSpecial = getNewUserPrice(parseNominal(item.harga));
  if (newUserSpecial && (await isNewBuyer(callerId)) && (await isNewUserPromoActive(callerId))) {
    if (await isPhoneVerified(callerId)) {
      inlineMarkup.inline_keyboard[0] = [
        { text: `💳 Beli Set Ini (${formatRupiah(newUserSpecial)} • harga khusus)`, callback_data: `buyconf_${item.id}` },
      ];
    } else {
      inlineMarkup.inline_keyboard.unshift([
        { text: "📱 Verifikasi Nomor untuk Harga Khusus", callback_data: "verify_phone" },
      ]);
    }
  }
  const tierNow = await getMemberTier(callerId);
  if (tierNow.pct > 0 && !newUserSpecial) {
    const curBtn = inlineMarkup.inline_keyboard[0] && inlineMarkup.inline_keyboard[0][0];
    if (curBtn && String(curBtn.callback_data || "").startsWith("buy_")) {
      const tierPrice = applyTierPrice(parseNominal(item.harga), tierNow);
      inlineMarkup.inline_keyboard[0] = [
        { text: `💳 Beli Set Ini (${formatRupiah(tierPrice)} • ${tierNow.name} -${tierNow.pct}%)`, callback_data: `buy_${item.id}` },
      ];
    }
  }
  if (itemFlashActive) {
    const curBtnFlash = inlineMarkup.inline_keyboard[0] && inlineMarkup.inline_keyboard[0][0];
    if (curBtnFlash && String(curBtnFlash.callback_data || "").startsWith("buy_")) {
      inlineMarkup.inline_keyboard[0] = [
        { text: `⚡ Beli Flash Sale (${formatRupiah(flashSaleNow.flash_price)})`, callback_data: `buy_${item.id}` },
      ];
    }
  }
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
}

// ---- TARGET KOMUNITAS (hadiah saldo untuk setiap pembeli unik) ----
const REDIS_TARGET_KEY = "lumine_main_target"; // JSON: {target, hadiah, end_ts, status, count, channel_id, pinned_msg_id}
const REDIS_TARGET_BUYERS_KEY = "lumine_main_target_buyers"; // HASH: id pembeli -> 1 (dihitung sekali per pembeli)
const REDIS_TARGET_LOCK_KEY = "lumine_main_target_lock"; // kunci hadiah, anti dobel

async function getTarget() {
  const raw = await redisCommand(["GET", REDIS_TARGET_KEY]);
  return raw ? JSON.parse(raw) : null;
}

async function saveTarget(t) {
  await redisCommand(["SET", REDIS_TARGET_KEY, JSON.stringify(t)]);
}

async function refreshTargetMessage(token, t) {
  const filled = Math.min(10, Math.floor((t.count / t.target) * 10));
  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
  const text =
    `🎯 <b>TARGET KOMUNITAS</b>\n` +
    `${bar} ${t.count}/${t.target} pembeli\n` +
    `Hadiah: saldo ${formatRupiah(t.hadiah)} untuk semua pembeli!`;
  if (t.pinned_msg_id) {
    const r = await tgRequest(token, "editMessageText", {
      chat_id: t.channel_id,
      message_id: t.pinned_msg_id,
      text,
      parse_mode: "HTML",
    });
    if (r && r.ok) return;
  }
  const sent = await tgRequest(token, "sendMessage", { chat_id: t.channel_id, text, parse_mode: "HTML" });
  if (sent && sent.ok) {
    t.pinned_msg_id = sent.result.message_id;
    await tgRequest(token, "pinChatMessage", { chat_id: t.channel_id, message_id: t.pinned_msg_id });
    await saveTarget(t);
  }
}

async function completeCommunityTarget(token, t) {
  const lock = await redisCommand(["SET", REDIS_TARGET_LOCK_KEY, "1", "NX", "EX", "604800"]);
  if (lock !== "OK") return; // hadiah sudah pernah diberikan
  t.status = "tercapai";
  await saveTarget(t);
  const buyers = (await redisCommand(["HKEYS", REDIS_TARGET_BUYERS_KEY])) || [];
  for (const uid of buyers) {
    try {
      await addUserSaldo(uid, t.hadiah, "gratis");
    } catch (e) {
      console.error("Hadiah target error:", uid, e);
    }
  }
  await tgRequest(token, "sendMessage", {
    chat_id: t.channel_id,
    parse_mode: "HTML",
    text:
      `🎉 <b>TARGET TERCAPAI!</b>\n` +
      `Semua ${buyers.length} pembeli dapat saldo <b>${formatRupiah(t.hadiah)}</b>. Terima kasih!`,
  });
}

// ---- PATUNGAN PRODUK MAHAL (beberapa pembeli urunan satu produk, dikirim saat terkumpul penuh) ----
const REDIS_PATUNGAN_KEY = "lumine_main_patungan"; // JSON: {id, item_id, item_nama, bagian, share_price, end_ts, status, terjual, channel_id, pinned_msg_id}
const REDIS_PATUNGAN_BUYERS_KEY = "lumine_main_patungan_buyers"; // HASH: id pembeli -> jumlah bagian yang sudah lunas
const REDIS_PATUNGAN_LOCK_KEY = "lumine_main_patungan_lock"; // kunci penyelesaian, anti dobel
const PATUNGAN_MIN_BAGIAN = 10000; // harga minimal satu bagian (Rp)

async function getPatungan() {
  const raw = await redisCommand(["GET", REDIS_PATUNGAN_KEY]);
  return raw ? JSON.parse(raw) : null;
}
async function savePatungan(p) {
  await redisCommand(["SET", REDIS_PATUNGAN_KEY, JSON.stringify(p)]);
}

async function refreshPatunganMessage(token, p) {
  const filled = Math.min(10, Math.floor((p.terjual / p.bagian) * 10));
  const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
  const sisa = Math.max(0, p.bagian - p.terjual);
  const text =
    `🤝 <b>PATUNGAN: ${escapeHtml(p.item_nama)}</b>\n` +
    `${bar} ${p.terjual}/${p.bagian} bagian\n` +
    `1 bagian: <b>${formatRupiah(p.share_price)}</b> • sisa ${sisa} bagian\n` +
    `Begitu terkumpul penuh, produk dikirim ke semua peserta urunan.`;
  const markup = {
    inline_keyboard: [[{ text: "🤝 Ambil bagian", callback_data: `patungan_ambil_${p.id}` }]],
  };
  if (p.pinned_msg_id) {
    const r = await tgRequest(token, "editMessageText", {
      chat_id: p.channel_id,
      message_id: p.pinned_msg_id,
      text,
      parse_mode: "HTML",
      reply_markup: markup,
    });
    if (r && r.ok) return;
  }
  const sent = await tgRequest(token, "sendMessage", {
    chat_id: p.channel_id,
    text,
    parse_mode: "HTML",
    reply_markup: markup,
  });
  if (sent && sent.ok) {
    p.pinned_msg_id = sent.result.message_id;
    await tgRequest(token, "pinChatMessage", { chat_id: p.channel_id, message_id: p.pinned_msg_id });
    await savePatungan(p);
  }
}

// Kembalikan uang peserta ke saldo deposit (uang asli, bisa dipakai belanja)
async function refundPatunganBuyer(token, uid, nominal, alasan) {
  if (!(nominal > 0)) return;
  await addUserSaldo(uid, nominal, "deposit");
  await tgRequest(token, "sendMessage", {
    chat_id: uid,
    parse_mode: "HTML",
    text:
      `↩️ <b>Urunan dikembalikan</b>\n` +
      `${escapeHtml(alasan)}\n` +
      `💰 <b>${formatRupiah(nominal)}</b> sudah masuk ke saldo deposit kamu.`,
  });
}

async function completePatungan(token, p) {
  const lock = await redisCommand(["SET", REDIS_PATUNGAN_LOCK_KEY, "1", "NX", "EX", "604800"]);
  if (lock !== "OK") return;
  p.status = "terkumpul";
  await savePatungan(p);

  const katalogList = await getKatalog();
  const item = katalogList.find((k) => String(k.id) === String(p.item_id));
  const links =
    item && Array.isArray(item.links) && item.links.length > 0 ? item.links : item && item.link ? [item.link] : [];
  const linksBlock = links.length
    ? links.map((l) => `🔗 ${escapeHtml(normalizeUrl(l))}`).join("\n")
    : "<i>File akan dikirim admin lewat chat.</i>";

  const buyers = (await redisCommand(["HKEYS", REDIS_PATUNGAN_BUYERS_KEY])) || [];
  for (const uid of buyers) {
    try {
      await addKoleksi(uid, p.item_nama, links[0] || "");
      await tgRequest(token, "sendMessage", {
        chat_id: uid,
        parse_mode: "HTML",
        text:
          `🎉 <b>PATUNGAN TERKUMPUL!</b>\n` +
          `Terima kasih sudah urunan <b>${escapeHtml(p.item_nama)}</b>. Berikut aksesnya:\n` +
          `${linksBlock}\n\n<i>Tersimpan juga di 🎒 Koleksi Saya.</i>`,
      });
    } catch (e) {
      console.error("Kirim patungan error:", uid, e);
    }
  }
  const channelId = p.channel_id;
  await tgRequest(token, "sendMessage", {
    chat_id: channelId,
    parse_mode: "HTML",
    text: `🎉 <b>PATUNGAN ${escapeHtml(p.item_nama)} TERKUMPUL!</b>\nProduk sudah dikirim ke ${buyers.length} peserta urunan.`,
  });
}

async function processPatunganPaid(token, order) {
  const uid = String(order.buyer_id);
  const amount = Number(order.final_base_nominal || order.base_nominal) || 0;
  const p = await getPatungan();
  if (!p || p.status !== "aktif" || Date.now() > p.end_ts) {
    await refundPatunganBuyer(token, uid, amount, "Patungan sudah tidak aktif saat pembayaranmu masuk.");
    return { deliveredName: order.item_nama, deliveredLink: "" };
  }
  if (p.terjual >= p.bagian) {
    await refundPatunganBuyer(token, uid, amount, "Bagian patungan sudah habis terisi duluan.");
    return { deliveredName: order.item_nama, deliveredLink: "" };
  }

  await redisCommand(["HINCRBY", REDIS_PATUNGAN_BUYERS_KEY, uid, 1]);
  p.terjual += 1;
  await savePatungan(p);
  await tgRequest(token, "sendMessage", {
    chat_id: uid,
    parse_mode: "HTML",
    text: `🤝 Bagian urunanmu untuk <b>${escapeHtml(p.item_nama)}</b> sudah tercatat (${p.terjual}/${p.bagian}).`,
  });
  if (p.terjual % 5 === 0 || p.terjual >= p.bagian) await refreshPatunganMessage(token, p);
  if (p.terjual >= p.bagian) await completePatungan(token, p);
  return { deliveredName: order.item_nama, deliveredLink: "" };
}

// Dipanggil sekali per hari dari ringkasan harian: patungan yang lewat batas waktu dinyatakan gagal dan uangnya dikembalikan
async function settlePatunganExpiry(token) {
  const p = await getPatungan();
  if (!p || p.status !== "aktif" || Date.now() <= p.end_ts) return;
  p.status = "gagal";
  await savePatungan(p);
  const buyers = (await redisCommand(["HGETALL", REDIS_PATUNGAN_BUYERS_KEY])) || [];
  for (let i = 0; i < buyers.length; i += 2) {
    const uid = String(buyers[i]);
    const bagianUid = Number(buyers[i + 1]) || 0;
    try {
      await refundPatunganBuyer(token, uid, bagianUid * p.share_price, `Patungan ${p.item_nama} belum terkumpul sampai batas waktu.`);
    } catch (e) {
      console.error("Refund patungan error:", uid, e);
    }
  }
  await tgRequest(token, "sendMessage", {
    chat_id: p.channel_id,
    parse_mode: "HTML",
    text: `⌛ Patungan <b>${escapeHtml(p.item_nama)}</b> belum terkumpul sampai batas waktu. Uang peserta sudah dikembalikan ke saldo deposit.`,
  });
  await redisCommand(["DEL", REDIS_PATUNGAN_BUYERS_KEY]);
}

// ---- BARTER KE ADMIN (tukar produk di koleksi dengan produk katalog, tanpa pembayaran, admin yang ACC) ----
const REDIS_BARTER_PREFIX = "lumine_main_barter_"; // JSON per pengajuan: {id, uid, old_nama, old_link, old_item_id, tuju_id, tuju_nama, tuju_link, status}
const REDIS_BARTER_LOCK_PREFIX = "lumine_main_barter_lock_";
const REDIS_BARTER_CD_PREFIX = "lumine_main_barter_cd_"; // cooldown: produk hasil tukar tidak bisa ditukar lagi
const BARTER_COOLDOWN_DETIK = 60 * 60 * 24 * 30;

async function removeKoleksiEntry(uid, nama, link) {
  const list = await getKoleksi(uid);
  const idx = list.findIndex((e) => e.nama === nama && (e.link || "") === (link || ""));
  if (idx < 0) return false;
  list.splice(idx, 1);
  await redisCommand(["SET", `${REDIS_KOLEKSI_PREFIX}${uid}`, JSON.stringify(list)]);
  return true;
}

async function getBarter(id) {
  const raw = await redisCommand(["GET", `${REDIS_BARTER_PREFIX}${id}`]);
  return raw ? JSON.parse(raw) : null;
}
async function saveBarter(b) {
  await redisCommand(["SET", `${REDIS_BARTER_PREFIX}${b.id}`, JSON.stringify(b), "EX", "259200"]);
}

// Ambil entry koleksi ke-i beserta produk katalog dan nilai tukarnya
async function barterSourceAt(uid, i) {
  const list = await getKoleksi(uid);
  const entry = list[i];
  if (!entry) return { ok: false, error: "Produk tidak ditemukan di koleksimu." };
  const katalogList = await getKatalog();
  const item = katalogList.find((k) => k.nama === entry.nama);
  if (!item) return { ok: false, error: "Produk ini sudah tidak ada di katalog, jadi tidak bisa ditukar." };
  const cd = await redisCommand(["GET", `${REDIS_BARTER_CD_PREFIX}${uid}_${item.id}`]);
  if (cd) return { ok: false, error: "Produk hasil tukar belum bisa ditukar lagi (tunggu 30 hari)." };
  return { ok: true, entry, item };
}

async function finalizeBarter(token, b) {
  const lock = await redisCommand(["SET", `${REDIS_BARTER_LOCK_PREFIX}${b.id}`, "1", "NX", "EX", "604800"]);
  if (lock !== "OK") return;
  b.status = "selesai";
  await saveBarter(b);
  await removeKoleksiEntry(b.uid, b.old_nama, b.old_link);
  await addKoleksi(b.uid, b.tuju_nama, b.tuju_link);
  await redisCommand(["SET", `${REDIS_BARTER_CD_PREFIX}${b.uid}_${b.tuju_id}`, "1", "EX", String(BARTER_COOLDOWN_DETIK)]);
  await tgRequest(token, "sendMessage", {
    chat_id: b.uid,
    parse_mode: "HTML",
    text:
      `🔁 <b>BARTER BERHASIL!</b>\n` +
      `<b>${escapeHtml(b.old_nama)}</b> sudah ditukar dengan <b>${escapeHtml(b.tuju_nama)}</b>.\n` +
      `🔗 ${escapeHtml(normalizeUrl(b.tuju_link || "(file dikirim admin)"))}`,
  });
}

// ---- BARTER DENGAN PRODUK DI LUAR KOLEKSI (pembeli mengetik sendiri produk yang mau ditawarkan) ----
const REDIS_BARTER_WAIT_PREFIX = "lumine_main_barter_wait_"; // flag: user sedang diminta mengetik produk

// Daftar produk tujuan dari katalog, dibagi halaman (8 per halaman) supaya semua produk bisa dipilih
const BARTER_TUJU_PER_HALAMAN = 8;
async function sendBarterTujuPage(token, chatId, modeKey, page, excludeNama, pembuka, hargaRef = 0) {
  const katalogList = await getKatalog();
  let semua = katalogList.filter((k) => parseNominal(k.harga) > 0 && (!excludeNama || k.nama !== excludeNama));
  if (hargaRef > 0) {
    // hanya tampilkan produk yang lolos batas selisih, supaya tidak ditolak otomatis
    semua = semua.filter((k) => {
      const h = parseNominal(k.harga);
      return Math.abs(h - hargaRef) / Math.max(h, hargaRef) <= BARTER_MAKS_SELISIH;
    });
    // yang harganya paling mirip tampil paling atas
    semua.sort((a, b) => Math.abs(parseNominal(a.harga) - hargaRef) - Math.abs(parseNominal(b.harga) - hargaRef));
  } else {
    // tanpa harga pembanding, yang termurah tampil dulu
    semua.sort((a, b) => parseNominal(a.harga) - parseNominal(b.harga));
  }
  if (!semua.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "Belum ada produk dengan harga yang cukup mirip untuk ditukar. Coba barang lain atau pilih dari daftar yang dibutuhkan admin.",
    });
    return;
  }
  const totalHalaman = Math.ceil(semua.length / BARTER_TUJU_PER_HALAMAN);
  const hal = Math.min(Math.max(0, page), totalHalaman - 1);
  const potong = semua.slice(hal * BARTER_TUJU_PER_HALAMAN, (hal + 1) * BARTER_TUJU_PER_HALAMAN);
  const daftarTeks = potong
    .map((k, i) => {
      const nomor = hal * BARTER_TUJU_PER_HALAMAN + i + 1;
      return `<b>${nomor}. ${escapeHtml(k.nama)}</b> — ${formatRupiah(parseNominal(k.harga))}` +
        (k.isi ? `\n<i>${escapeHtml(String(k.isi).slice(0, 120))}</i>` : "");
    })
    .join("\n\n");
  const rows = potong.map((k, i) => [{
    text: `${hal * BARTER_TUJU_PER_HALAMAN + i + 1}. ${k.nama.slice(0, 26)}`,
    callback_data: modeKey === "lain"
      ? `barter_lainpilih_${k.id}`
      : `barter_tuju_${modeKey.slice(1)}_${k.id}`,
  }]);
  const nav = [];
  if (hal > 0) nav.push({ text: "⬅️ Sebelumnya", callback_data: `barter_halaman_${modeKey}_${hal - 1}` });
  if (hal < totalHalaman - 1) nav.push({ text: "Berikutnya ➡️", callback_data: `barter_halaman_${modeKey}_${hal + 1}` });
  if (nav.length) rows.push(nav);
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `${pembuka || "Pilih produk tujuan dari katalog:"}\n\n${daftarTeks}\n\n` +
      `<i>Halaman ${hal + 1}/${totalHalaman} • ${semua.length} produk${hargaRef > 0 ? " (harga mirip)" : ""}</i>`,
    reply_markup: { inline_keyboard: rows },
  });
}

// ---- BARANG YANG DIBUTUHKAN ADMIN (daftar pendek yang dipajang di menu barter) ----
const REDIS_BUTUH_KEY = "lumine_main_butuh"; // JSON array: nama barang yang dibutuhkan admin
async function getButuh() {
  const raw = await redisCommand(["GET", REDIS_BUTUH_KEY]);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function saveButuh(arr) {
  await redisCommand(["SET", REDIS_BUTUH_KEY, JSON.stringify(arr.slice(0, 20))]);
}

// ---- BUKTI PENAWARAN BARTER (nama, foto preview, link isi, total foto) ----
const REDIS_BARTER_DRAFT_PREFIX = "lumine_main_barter_draft_"; // alur pengisian penawaran yang sedang berjalan
const REDIS_BARTER_OFFER_PREFIX = "lumine_main_barter_offer_"; // penawaran lengkap yang siap dipilih tujuannya

async function getBarterDraft(uid) {
  const raw = await redisCommand(["GET", `${REDIS_BARTER_DRAFT_PREFIX}${uid}`]);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function setBarterDraft(uid, d) {
  await redisCommand(["SET", `${REDIS_BARTER_DRAFT_PREFIX}${uid}`, JSON.stringify(d), "EX", "900"]);
}
async function delBarterDraft(uid) {
  await redisCommand(["DEL", `${REDIS_BARTER_DRAFT_PREFIX}${uid}`]);
}
async function getBarterOffer(uid) {
  const raw = await redisCommand(["GET", `${REDIS_BARTER_OFFER_PREFIX}${uid}`]);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function setBarterOffer(uid, o) {
  await redisCommand(["SET", `${REDIS_BARTER_OFFER_PREFIX}${uid}`, JSON.stringify(o), "EX", "900"]);
}

// Mulai pengisian bukti: minta foto preview dulu (nama sudah diketahui)
async function startBarterProof(token, chatId, uid, dasar) {
  await setBarterDraft(uid, { ...dasar, step: "foto" });
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `📸 Kirim <b>1 foto preview</b> dari produk <b>${escapeHtml(dasar.nama)}</b>. Ini untuk dilihat admin sebelum menyetujui.`,
  });
}

// Mengolah pesan selama pengisian bukti. Mengembalikan true kalau pesan sudah ditangani.
async function handleBarterDraftMessage(token, msg, draft, uid) {
  const text = (msg.text || "").trim();
  if (text.startsWith("/")) return false;
  const chatId = msg.chat.id;
  const ask = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: t });

  if (draft.step === "nama") {
    if (!text) { await ask("✍️ Ketik nama produknya sebagai teks."); return true; }
    draft.nama = text.slice(0, 200);
    draft.step = "foto";
    await setBarterDraft(uid, draft);
    await ask(`📸 Kirim <b>1 foto preview</b> dari produk <b>${escapeHtml(draft.nama)}</b>.`);
    return true;
  }
  if (draft.step === "foto") {
    if (!msg.photo || !msg.photo.length) { await ask("📸 Kirim foto, bukan teks."); return true; }
    draft.preview = msg.photo[msg.photo.length - 1].file_id;
    draft.step = "link";
    await setBarterDraft(uid, draft);
    await ask("🔗 Kirim <b>link isi produkmu</b> (link file atau folder).");
    return true;
  }
  if (draft.step === "link") {
    const cocok = text.match(/https?:\/\/\S+/i);
    if (!cocok) { await ask("🔗 Kirim link yang diawali https://"); return true; }
    draft.link = cocok[0];
    draft.step = "total";
    await setBarterDraft(uid, draft);
    await ask("🖼️ Berapa <b>total foto</b> di produk itu? Ketik angkanya.");
    return true;
  }
  if (draft.step === "total") {
    const n = parseInt(text, 10);
    if (!(n >= 1 && n <= 500)) { await ask("🖼️ Ketik angka total foto, misalnya <code>12</code>."); return true; }
    await delBarterDraft(uid);
    const offer = {
      mode: draft.mode,
      nama: draft.nama,
      link: draft.link,
      total: n,
      preview: draft.preview,
      old_item_id: draft.old_item_id || "",
      old_harga: Number(draft.old_harga) || 0,
    };
    await setBarterOffer(uid, offer);
    await ask(`✅ Penawaran diterima: <b>${escapeHtml(offer.nama)}</b> (${n} foto).\nSekarang pilih produk tujuan dari katalog:`);
    const isKoleksi = String(offer.mode || "").startsWith("k");
    await sendBarterTujuPage(
      token, chatId, isKoleksi ? offer.mode : "lain", 0,
      isKoleksi ? offer.nama : null,
      "Pilih produk tujuan dari katalog:",
      isKoleksi ? offer.old_harga : 0
    );
    return true;
  }
  return false;
}

const BARTER_MAKS_SELISIH = 0.3; // selisih harga di atas 30% ditolak otomatis oleh bot

async function createBarterRequest(token, chatId, uid, oldNama, oldLink, oldItemId, tuju, oldHarga, bukti) {
  const hargaTuju = parseNominal(tuju.harga);
  const hargaLama = Number(oldHarga) || 0;
  if (hargaLama > 0 && hargaTuju > 0) {
    const selisihPct = Math.abs(hargaTuju - hargaLama) / Math.max(hargaTuju, hargaLama);
    if (selisihPct > BARTER_MAKS_SELISIH) {
      await tgRequest(token, "sendMessage", {
        chat_id: chatId,
        parse_mode: "HTML",
        text:
          `❌ <b>Pengajuan ditolak otomatis.</b>\n` +
          `Harga <b>${escapeHtml(oldNama)}</b> (${formatRupiah(hargaLama)}) dan <b>${escapeHtml(tuju.nama)}</b> (${formatRupiah(hargaTuju)}) terlalu jomplang, selisihnya lebih dari ${Math.round(BARTER_MAKS_SELISIH * 100)}%.\n` +
          `Coba pilih produk tujuan yang harganya lebih mirip.`,
      });
      return null;
    }
  }
  const tujuLinks =
    Array.isArray(tuju.links) && tuju.links.length > 0 ? tuju.links : tuju.link ? [tuju.link] : [];
  const b = {
    id: Date.now().toString(36),
    uid,
    old_nama: oldNama,
    old_link: oldLink || "",
    old_item_id: oldItemId || "",
    bukti: bukti || null,
    tuju_id: String(tuju.id),
    tuju_nama: tuju.nama,
    tuju_link: tujuLinks[0] || "",
    status: "menunggu_acc",
  };
  await saveBarter(b);
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text: `⏳ Pengajuan barter dikirim ke admin. Kamu akan dikabari setelah disetujui.`,
  });
  const adminId = await getNotifyAdminId();
  if (adminId) {
    const teksAdmin =
        `🔁 <b>PENGAJUAN BARTER</b>\n` +
        `Pembeli: <code>${escapeHtml(uid)}</code>\n` +
        `Tukar: <b>${escapeHtml(oldNama)}</b>${hargaLama > 0 ? ` (harga ${formatRupiah(hargaLama)})` : " (produk di luar koleksi)"}\n` +
        `Ke: <b>${escapeHtml(b.tuju_nama)}</b> (harga ${formatRupiah(hargaTuju)})\n` +
        `${bukti ? `📦 Isi link: ${escapeHtml(bukti.link)}\n🖼️ Total foto: <b>${bukti.total}</b>\n` : ""}` +
        `<i>Tanpa pembayaran. ACC kalau tukarannya layak.</i>`;
    const markup = {
      inline_keyboard: [[
        { text: "✅ ACC", callback_data: `barter_acc_${b.id}` },
        { text: "❌ Tolak", callback_data: `barter_tolak_${b.id}` },
      ]],
    };
    if (bukti && bukti.preview) {
      await tgRequest(token, "sendPhoto", { chat_id: adminId, photo: bukti.preview, caption: teksAdmin, parse_mode: "HTML", reply_markup: markup });
    } else {
      await tgRequest(token, "sendMessage", { chat_id: adminId, parse_mode: "HTML", text: teksAdmin, reply_markup: markup });
    }
  }
  return b;
}

async function trackCommunityTarget(token, order) {
  if (order.is_deposit) return; // isi saldo bukan pembelian produk
  const t = await getTarget();
  if (!t || t.status !== "aktif" || Date.now() > t.end_ts) return;

  // HSETNX: 1 = pembeli baru di periode ini, 0 = sudah pernah dihitung
  const isNew = Number(await redisCommand(["HSETNX", REDIS_TARGET_BUYERS_KEY, String(order.buyer_id), "1"]));
  if (isNew !== 1) return;

  t.count = Number(await redisCommand(["HLEN", REDIS_TARGET_BUYERS_KEY])) || 0;
  await saveTarget(t);
  if (t.count % 10 === 0 || t.count >= t.target) await refreshTargetMessage(token, t);
  if (t.count >= t.target) await completeCommunityTarget(token, t);
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
              `🔒 Kalau ada lebih dari satu order dengan nominal sama, makro tidak auto-ACC. ACC manual.\n` +
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
    if (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
      await sendDailyReport(token);
      return res.status(200).json({ ok: true, report: "sent" });
    }
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
    // 0a. CHANNEL CADANGAN: postingan yang DIEDIT juga dibaca ulang (mis. admin membetulkan link)
    // ------------------------------------------
    if (update.edited_channel_post) {
      const ep = update.edited_channel_post;
      try {
        const bkCfgE = await getBackupChannel();
        if (bkCfgE && sameChannelCfg(bkCfgE, ep.chat)) await handleBackupPost(token, ep, "", false);
      } catch (bkErr) {
        console.error("Channel cadangan (edit) error:", bkErr && bkErr.message);
      }
      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------
    // 0. HANDLER POSTINGAN CHANNEL (/settesti LANGSUNG DI CH)
    // ------------------------------------------
    if (update.channel_post) {
      const post = update.channel_post;
      const postText = (post.text || "").trim();

      // /setchcadangan langsung di channel cadangan: jadikan channel ini sumber link cadangan
      if (postText.startsWith("/setchcadangan")) {
        await redisCommand(["SET", REDIS_BACKUP_CH_KEY, String(post.chat.id)]);
        await tgRequest(token, "deleteMessage", { chat_id: post.chat.id, message_id: post.message_id });
        const adm = await getNotifyAdminId();
        if (adm) {
          await tgRequest(token, "sendMessage", {
            chat_id: adm,
            parse_mode: "HTML",
            text: `✅ <b>Channel cadangan terhubung:</b> ${escapeHtml(post.chat.title || "")}\nID: <code>${post.chat.id}</code>\nSetiap postingan di sana yang berisi link + nama set akan otomatis dicocokkan.`,
          });
        }
        return res.status(200).json({ ok: true });
      }

      // Postingan di channel cadangan: baca link, cocokkan ke nama set, perbarui link cadangan
      try {
        const bkCfg = await getBackupChannel();
        if (bkCfg && sameChannelCfg(bkCfg, post.chat)) {
          await handleBackupPost(token, post, "", false);
          return res.status(200).json({ ok: true });
        }
      } catch (bkErr) {
        console.error("Channel cadangan error:", bkErr && bkErr.message);
      }
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

      // TAP CHALLENGE: punya pembatas kecepatan sendiri (rate limit global akan mem-ban pemain yang tap cepat)
      if (data && data.startsWith("tap_")) {
        await handleTapCallback(token, call, isCallerAdmin);
        return res.status(200).json({ ok: true });
      }

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
      const NAV_PREFIXES = ["menu_", "detail_", "lb_", "rhome", "rkat", "rcreator", "rbest", "rcara", "wlr_", "kcat_", "kcr_", "creator_list_", "pick_"];
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
      } else if (data.startsWith("depo_")) {
        const nominal = parseInt(data.replace("depo_", ""), 10) || 0;
        await createAndSendDepositInvoice(token, chatId, call.from, nominal);
      } else if (data === "vip_menu") {
        await sendVipMenu(token, chatId, callerId);
      } else if (data === "vip_buy") {
        await buyVipViaSaldo(token, chatId, call.from);
      } else if (data.startsWith("vipget_")) {
        await sendVipGet(token, chatId, call.from, data.replace("vipget_", ""));
      } else if (data === "pick_menu") {
        await sendPickPage(token, chatId, callerId, 0);
      } else if (data.startsWith("pick_p_")) {
        await sendPickPage(token, chatId, callerId, data.replace("pick_p_", ""));
      } else if (data.startsWith("pick_t_")) {
        const m = data.match(/^pick_t_(.+)_(\d+)$/);
        if (m) await togglePickItem(token, chatId, callerId, m[1], m[2]);
      } else if (data === "pick_clear") {
        await setPickSel(callerId, []);
        await sendPickPage(token, chatId, callerId, 0);
      } else if (data === "pick_go") {
        await sendPickConfirm(token, chatId, callerId);
      } else if (data === "pick_pay") {
        await payPickSelection(token, chatId, call.from);
      } else if (data === "verify_phone") {
        await sendVerifyPhonePrompt(token, chatId);
      } else if (data === "mys5_menu") {
        await sendMysteryMulti(token, chatId, callerId);
      } else if (data === "mys5_pay") {
        await payMysteryMulti(token, chatId, call.from);
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
        const flashSaleNow = await getFlashSale();
        const itemFlashActive = Boolean(flashSaleNow && String(flashSaleNow.item_id) === String(item.id));
        const flashLine = itemFlashActive
          ? `│ • ⚡ <b>FLASH SALE :</b> <s>${escapeHtml(item.harga)}</s> ➜ <code>${formatRupiah(flashSaleNow.flash_price)}</code>\n` +
            `│ • ⏱️ <b>Berakhir :</b> ${getFlashSaleRemainingText(flashSaleNow)} (${formatWibClock(flashSaleNow.end_ts)})\n`
          : "";
        const captionText =
          (itemFlashActive ? `⚡⚡⚡ <b>FLASH SALE AKTIF!</b> ⚡⚡⚡\n\n` : "") +
          `✨ <b>${escapeHtml(item.nama)}</b>\n\n` +
          itemRatingBlock +
          (item.preorder ? "🕒 <b>PRE ORDER</b>" + (item.po_eta ? " • rilis: " + escapeHtml(item.po_eta) : "") + "\n\n" : "") +
          `╭─── 📦 <b>DETAIL PAKET</b> ───\n` +
          popularityLine +
          (item.creator ? `│ • <b>Creator :</b> 👤 ${escapeHtml(item.creator)}\n` : "") +
          `│ • <b>Isi :</b> ${escapeHtml(item.isi)}\n` +
          (itemFlashActive
            ? flashLine
            : `│ • <b>Harga :</b> <code>${escapeHtml(item.harga)}</code>\n`) +
          `│ • <b>Saldo Kamu :</b> <code>${formatRupiah(saldo)}</code>\n` +
          `╰────────────────────${voucherNote}\n\n` +
          (item.preorder ? `💳 Pre order hanya bisa dibayar via <b>QRIS</b>.` : `💳 Klik tombol di bawah untuk checkout via <b>Saldo</b> atau <b>QRIS</b>!`);

        const wlRowMarkup = [buildWishlistButton(await isInWishlist(callerId, item.id), item.id)];
        const inlineMarkup = {
          inline_keyboard: [
            [
              {
                text: item.preorder ? `🕒 Pre Order Set Ini (${item.harga})` : `💳 Beli Set Ini (${item.harga})`,
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
        if (VIP_ENABLED && (await isVipUser(callerId))) {
          inlineMarkup.inline_keyboard[0] = [{ text: "🎁 Ambil Gratis (VIP)", callback_data: `vipget_${item.id}` }];
        }
        const newUserSpecial = getNewUserPrice(parseNominal(item.harga));
        if (newUserSpecial && (await isNewBuyer(callerId)) && (await isNewUserPromoActive(callerId))) {
          if (await isPhoneVerified(callerId)) {
            inlineMarkup.inline_keyboard[0] = [
              { text: `💳 Beli Set Ini (${formatRupiah(newUserSpecial)} • harga khusus)`, callback_data: `buyconf_${item.id}` },
            ];
          } else {
            inlineMarkup.inline_keyboard.unshift([
              { text: "📱 Verifikasi Nomor untuk Harga Khusus", callback_data: "verify_phone" },
            ]);
          }
        }
        const tierNow = await getMemberTier(callerId);
        if (tierNow.pct > 0 && !newUserSpecial) {
          const curBtn = inlineMarkup.inline_keyboard[0] && inlineMarkup.inline_keyboard[0][0];
          if (curBtn && String(curBtn.callback_data || "").startsWith("buy_")) {
            const tierPrice = applyTierPrice(parseNominal(item.harga), tierNow);
            inlineMarkup.inline_keyboard[0] = [
              { text: `💳 Beli Set Ini (${formatRupiah(tierPrice)} • ${tierNow.name} -${tierNow.pct}%)`, callback_data: `buy_${item.id}` },
            ];
          }
        }
        if (itemFlashActive) {
          const curBtnFlash = inlineMarkup.inline_keyboard[0] && inlineMarkup.inline_keyboard[0][0];
          if (curBtnFlash && String(curBtnFlash.callback_data || "").startsWith("buy_")) {
            inlineMarkup.inline_keyboard[0] = [
              { text: `⚡ Beli Flash Sale (${formatRupiah(flashSaleNow.flash_price)})`, callback_data: `buy_${item.id}` },
            ];
          }
        }
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
      } else if (data.startsWith("barter_halaman_")) {
        const sisa = data.replace("barter_halaman_", "");
        const cut = sisa.lastIndexOf("_");
        const modeKey = sisa.slice(0, cut);
        const page = parseInt(sisa.slice(cut + 1), 10) || 0;
        let excludeNama = null;
        let hargaRef = 0;
        if (modeKey.startsWith("k")) {
          const src = await barterSourceAt(String(call.from.id), parseInt(modeKey.slice(1), 10));
          excludeNama = src.ok ? src.item.nama : null;
          hargaRef = src.ok ? parseNominal(src.item.harga) : 0;
        }
        await sendBarterTujuPage(token, chatId, modeKey, page, excludeNama, "Pilih produk tujuan dari katalog:", hargaRef);
      } else if (data === "barter_butuh") {
        const list = await getButuh();
        if (!list.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Saat ini admin belum membutuhkan barang khusus." });
          return res.status(200).json({ ok: true });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: "📌 <b>Barang yang dibutuhkan admin</b>\nPilih salah satu sebagai penawaranmu:",
          reply_markup: {
            inline_keyboard: list.map((x, i) => [{ text: x.slice(0, 40), callback_data: `barter_butuhpilih_${i}` }]),
          },
        });
      } else if (data.startsWith("barter_butuhpilih_")) {
        const i = parseInt(data.replace("barter_butuhpilih_", ""), 10);
        const list = await getButuh();
        if (!list[i]) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Barang itu sudah tidak dibutuhkan admin." });
          return res.status(200).json({ ok: true });
        }
        await startBarterProof(token, chatId, String(call.from.id), {
          mode: "lain",
          nama: `[DIBUTUHKAN ADMIN] ${list[i]}`,
        });
      } else if (data === "barter_lain") {
        await setBarterDraft(String(call.from.id), { step: "nama", mode: "lain" });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: "✍️ Ketik nama produk yang mau kamu tawarkan untuk ditukar (bukan dari koleksimu). Sertakan detail singkat kalau perlu.",
        });
      } else if (data.startsWith("barter_lainpilih_")) {
        const tujuId = data.replace("barter_lainpilih_", "");
        const uid = String(call.from.id);
        const offer = await getBarterOffer(uid);
        const katalogList = await getKatalog();
        const tuju = katalogList.find((k) => String(k.id) === String(tujuId));
        if (!offer || !tuju) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Penawaran sudah kedaluwarsa. Ulangi lewat /barter." });
          return res.status(200).json({ ok: true });
        }
        await createBarterRequest(token, chatId, uid, offer.nama, offer.link, "", tuju, 0, offer);
      } else if (data.startsWith("barter_pilih_")) {
        const i = parseInt(data.replace("barter_pilih_", ""), 10);
        const src = await barterSourceAt(String(call.from.id), i);
        if (!src.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: `⚠️ ${src.error}` });
          return res.status(200).json({ ok: true });
        }
        await startBarterProof(token, chatId, String(call.from.id), {
          mode: `k${i}`,
          nama: src.item.nama,
          link: src.entry.link || "",
          old_item_id: String(src.item.id),
          old_harga: parseNominal(src.item.harga),
        });
      } else if (data.startsWith("barter_tuju_")) {
        const tujuId = data.split("_")[3];
        const uid = String(call.from.id);
        const offer = await getBarterOffer(uid);
        if (!offer) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Penawaran sudah kedaluwarsa. Ulangi lewat /barter." });
          return res.status(200).json({ ok: true });
        }
        if (offer.old_item_id) {
          const cd = await redisCommand(["GET", `${REDIS_BARTER_CD_PREFIX}${uid}_${offer.old_item_id}`]);
          if (cd) {
            await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Produk hasil tukar belum bisa ditukar lagi (tunggu 30 hari)." });
            return res.status(200).json({ ok: true });
          }
        }
        const katalogList = await getKatalog();
        const tuju = katalogList.find((k) => String(k.id) === String(tujuId));
        if (!tuju) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Produk tujuan sudah tidak ada." });
          return res.status(200).json({ ok: true });
        }
        await createBarterRequest(token, chatId, uid, offer.nama, offer.link, offer.old_item_id, tuju, offer.old_harga, offer);
      } else if (data.startsWith("barter_acc_") || data.startsWith("barter_tolak_")) {
        if (!(await isAdminUser(call.from))) return res.status(200).json({ ok: true });
        const isAcc = data.startsWith("barter_acc_");
        const b = await getBarter(data.replace(/^barter_(acc|tolak)_/, ""));
        if (!b || b.status !== "menunggu_acc") {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Pengajuan ini sudah diproses atau kedaluwarsa." });
          return res.status(200).json({ ok: true });
        }
        if (!isAcc) {
          b.status = "ditolak";
          await saveBarter(b);
          await tgRequest(token, "sendMessage", { chat_id: b.uid, text: `❌ Pengajuan barter ke ${b.tuju_nama} ditolak admin.` });
          return res.status(200).json({ ok: true });
        }
        await finalizeBarter(token, b);
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: `✅ Barter ${b.id} di-ACC.` });
      } else if (data.startsWith("patungan_ambil_")) {
        const p = await getPatungan();
        if (!p || p.status !== "aktif" || Date.now() > p.end_ts) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Patungan ini sudah tidak aktif." });
          return res.status(200).json({ ok: true });
        }
        if (p.terjual >= p.bagian) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "🎉 Semua bagian sudah terisi." });
          return res.status(200).json({ ok: true });
        }
        const target = {
          ok: true,
          itemId: p.item_id,
          itemNama: `Patungan ${p.item_nama}`,
          baseNominal: p.share_price,
          tierLabel: "",
          targetLink: "",
          targetLinks: [],
          targetFiles: [],
          isMystery: false,
          extra: { is_patungan: true, skip_discount_lookup: true },
        };
        await sendQrisInvoiceForTarget(token, chatId, call.from, target);
      } else if (data.startsWith("paysaldo_")) {
        const targetKey = data.replace("paysaldo_", "");
        const target = await resolvePurchaseTarget(targetKey, callerId);
        if (!target.ok) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: target.error });
          return res.status(200).json({ ok: true });
        }
        if (target.extra && target.extra.is_preorder) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Set pre order hanya bisa dibayar lewat QRIS.",
          });
          return res.status(200).json({ ok: true });
        }

        const bestDiscount = await resolveBestDiscount(callerId, target.itemId, target.baseNominal);
        const discount = bestDiscount.discount;
        const voucherCode = bestDiscount.code;

        const finalPrice = Math.max(500, target.baseNominal - discount);
        const depositOnly = Boolean(target.isMystery) || String(target.itemId) === String(RESELLER_PREM_TARGET);
        const deduction = depositOnly
          ? await deductUserSaldo(callerId, finalPrice) // Mystery Box & Reseller Prem wajib saldo deposit
          : await payPurchaseWithSaldo(callerId, finalPrice);

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
      } else if (data.startsWith("buyconf_")) {
        const confId = data.replace("buyconf_", "");
        const katalogConf = await getKatalog();
        const confItem = katalogConf.find((x) => String(x.id) === confId);
        if (!confItem) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Set ini sudah tidak tersedia." });
          return res.status(200).json({ ok: true });
        }
        const normal = parseNominal(confItem.harga);
        const khusus = getNewUserPrice(normal) || normal;
        const endTs = await getNewUserPromoEndTs(callerId);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `🎁 <b>Konfirmasi Harga Khusus</b>\n\n` +
            `📦 <b>${escapeHtml(confItem.nama)}</b>\n` +
            `💰 Normal <s>${formatRupiah(normal)}</s> ➜ <b>${formatRupiah(khusus)}</b>\n` +
            `⚠️ Harga khusus hanya berlaku <b>sekali</b>, untuk pembelian pertama kamu.\n` +
            `⏰ Berlaku sampai <b>${formatWibClock(endTs)}</b>.\n\nLanjut bayar?`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Ya, lanjut bayar", callback_data: `buy_${confId}` }],
              [{ text: "❌ Batal", callback_data: "menu_katalog" }],
            ],
          },
        });
        return res.status(200).json({ ok: true });
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

        const isPreorderTarget = Boolean(target.extra && target.extra.is_preorder);
        if (!isPreorderTarget && saldo >= effectivePrice) {
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

        if (isQrisOrderExpired(order)) {
          order.status = "expired";
          await saveOrder(orderId, order);
          await redisCommand(["HDEL", REDIS_PENDING_MAP_KEY, String(orderId)]);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⏰ Pesanan ini sudah kedaluwarsa karena belum dibayar dalam " + QRIS_EXPIRE_MINUTES + " menit. Silakan buat pesanan baru ya.",
          });
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

          const buyerStats = await buildBuyerStatsBlock(order.buyer_id);
          const warnPembeli = (await getBuyerRejectCount(order.buyer_id)) >= 2 ? "⚠️ " : "";
          const adminNotifText =
            `${warnPembeli}${titleLabel}\n\n` +
            `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(order.buyer_username)})\n` +
            `🏷️ <a href="tg://user?id=${escapeHtml(String(order.buyer_id))}">Chat pembeli</a>\n` +
            `${buyerStats}\n` +
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
      } else if (data.startsWith("cadpick_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const [, pid, act] = data.split("_");
        const key = `lumine_main_cad_pend_${pid}`;
        const raw = await redisCommand(["GET", key]);
        await redisCommand(["DEL", key]);
        if (!raw) {
          await tgRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, text: "⏰ Pilihan ini sudah tidak berlaku." });
          return res.status(200).json({ ok: true });
        }
        const pend = JSON.parse(raw);
        let hasil = "❌ Diabaikan, link lama tetap dipakai.";
        if (act === "add" || act === "rep") {
          const r = await applyCadanganChoice(token, pend.itemId, pend.url, act);
          hasil = r.ok ? (act === "rep" ? "🔁 Link cadangan diganti." : "➕ Link cadangan ditambahkan.") : `⚠️ Gagal: ${r.reason}`;
        }
        await tgRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, text: hasil });
        return res.status(200).json({ ok: true });
      } else if (data.startsWith("reject_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const orderId = data.replace("reject_", "");
        const order = await getOrder(orderId);

        if (!order || order.status === "rejected" || order.status === "acc") {
          return res.status(200).json({ ok: true });
        }

        order.status = "rejected";
        await saveOrder(orderId, order);
        await redisCommand(["HINCRBY", REDIS_BUYER_REJECT_KEY, String(order.buyer_id), 1]);

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
      } else if (data === "menu_undian") {
        await sendUndianInfo(token, chatId, callerId);
      } else if (data === "menu_appref") {
        await sendApprefInfo(token, chatId, callerId);
      } else if (data === "appref_start") {
        await startApprefClaim(token, chatId, callerId);
      } else if (data.startsWith("apprefacc_") || data.startsWith("apprefrej_")) {
        if (!isCallerAdmin) return res.status(200).json({ ok: true });
        const isAccA = data.startsWith("apprefacc_");
        await processApprefReview(token, chatId, data.replace(isAccA ? "apprefacc_" : "apprefrej_", ""), isAccA);
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

      // ADMIN: teruskan (forward) postingan CHANNEL UTAMA ke bot -> bot mencatat id pesannya per set,
      // lalu otomatis mengedit tombolnya (tambah "Link Cadangan") kalau set itu sudah punya link cadangan.
      if (isAdmin && msg.chat.type === "private" && (msg.forward_origin || msg.forward_from_chat)) {
        const origin = msg.forward_origin || {};
        const fchat = origin.chat || msg.forward_from_chat || null;
        const fmid = origin.message_id || msg.forward_from_message_id || 0;
        const pcF = String((await getPostChannel()) || "");
        const sameCh =
          fchat &&
          fmid &&
          pcF &&
          (pcF === String(fchat.id) || (pcF.startsWith("@") && fchat.username && pcF.toLowerCase() === "@" + String(fchat.username).toLowerCase()));
        if (sameCh) {
          const sendF = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML", disable_web_page_preview: true });
          const katalogF = await getKatalog();
          const found = parsePostedSet(msg, katalogF);
          const cntF = Number(await redisCommand(["INCR", "lumine_main_fwd_cnt"])) || 1;
          if (cntF === 1) await redisCommand(["EXPIRE", "lumine_main_fwd_cnt", "120"]);
          if (!found.item) {
            await sendF(`⚠️ Postingan ini tidak dikenali: ${escapeHtml(found.why || "set tidak ditemukan")}.`);
            return res.status(200).json({ ok: true });
          }
          const it = found.item;
          const old = await getPostMsg(it.id);
          const keepCad = old && String(old.message_id) === String(fmid) ? old.cad || "" : "";
          await recordPostMsg(it.id, fchat.id, fmid, keepCad, msgToHtml(msg), Boolean(msg.photo));
          let note = "";
          if (it.cadangan) {
            const botUnameF = await getBotUsername(token);
            const er = await editPostButtons(token, it, botUnameF);
            note = er.ok ? " • tombol Link Cadangan sudah dipasang ✏️" : ` • ⚠️ gagal edit: ${escapeHtml(String(er.reason).slice(0, 60))} (coba /updatepost nanti)`;
          } else {
            note = " • belum punya link cadangan (isi lewat /setcadangan, nanti otomatis diedit)";
          }
          const gagal = note.includes("gagal edit");
          if (cntF === 1 || cntF % 10 === 0 || gagal) {
            const no = katalogF.findIndex((k) => String(k.id) === String(it.id)) + 1;
            await sendF(`📌 #${no} ${escapeHtml(it.nama)} tercatat${note}${cntF > 1 ? `\n(${cntF} postingan diproses dalam 2 menit terakhir)` : ""}`);
          }
          return res.status(200).json({ ok: true });
        }
        // forward dari CHANNEL CADANGAN: baca link-nya dan cocokkan ke nama set (untuk postingan lama)
        const bkCfgF = await getBackupChannel();
        if (fchat && bkCfgF && sameChannelCfg(bkCfgF, fchat)) {
          await handleBackupPost(token, msg, chatId, true);
          return res.status(200).json({ ok: true });
        }
      }

      // BLACKLIST & RATE LIMIT (admin dikecualikan)
      if (!isAdmin && senderId) {
        if (await isBanned(senderId)) return res.status(200).json({ ok: true });
        const rl = await checkRateLimit(senderId);
        if (rl === "limit") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⏳ Kamu terlalu sering mengirim pesan. Kamu di-jeda " + formatDurasiBan() + ". Tunggu sebentar ya.",
          });
          return res.status(200).json({ ok: true });
        }
        if (rl === "blocked") {
          if (["/cekban", "⏳ Cek Jeda"].includes(String(msg.text || "").trim())) {
            await sendCekJeda(token, chatId, senderId);
          } else {
            // Diabaikan saat di-jeda: beri tahu sekali saja per jeda, supaya tidak ikut memicu spam
            const sisaBan = Number(await redisCommand(["TTL", REDIS_TEMPBAN_PREFIX + String(senderId)])) || 0;
            if (sisaBan > 0) {
              const baru = await redisCommand(["SET", REDIS_BANNOTICE_PREFIX + String(senderId), "1", "NX", "EX", String(sisaBan)]);
              if (baru === "OK") {
                await tgRequest(token, "sendMessage", {
                  chat_id: chatId,
                  text: "⏳ Kamu sedang di-jeda karena terlalu sering mengirim pesan. Pesanmu diabaikan sampai jeda selesai. Tekan ⏳ Cek Jeda untuk melihat sisa waktunya.",
                });
              }
            }
          }
          return res.status(200).json({ ok: true });
        }
      }

      let isNewUser = false;
      if (msg.chat && msg.chat.type === "private") {
        const addedRes = await redisCommand(["SADD", REDIS_USERS_KEY, String(chatId)]);
        isNewUser = Number(addedRes) === 1;
        if (isNewUser) await redisCommand(["HSETNX", REDIS_JOIN_TS_KEY, String(chatId), String(Date.now())]);
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

      // Pengingat pesanan harga khusus yang belum dibayar (dicek tiap 10 menit)
      try {
        await maybeCartReminder(token);
      } catch (cartErr) {
        console.error("Pengingat pesanan error:", cartErr);
      }

      // Pengingat harga khusus user baru (sekali sehari)
      try {
        await maybeNewUserNudge(token);
      } catch (nudgeErr) {
        console.error("Pengingat user baru error:", nudgeErr);
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

      // Hadiah juara Tap Challenge minggu lalu (sekali per minggu, otomatis)
      try {
        await maybeAwardTapLastWeek(token);
      } catch (tapAwardErr) {
        console.error("Award Tap Challenge Error:", tapAwardErr);
      }

      const rawText = (msg.text || msg.caption || "").trim();

      // BARTER: alur pengisian bukti penawaran (nama, foto, link, total foto)
      if (msg.chat && msg.chat.type === "private") {
        const uidDraft = String(msg.from && msg.from.id);
        const draft = await getBarterDraft(uidDraft);
        if (draft && (await handleBarterDraftMessage(token, msg, draft, uidDraft))) {
          return res.status(200).json({ ok: true });
        }
      }
      const lowerText = rawText.toLowerCase();

      // Catat setiap perintah admin, lalu tampilkan log bila diminta
      if (isAdmin && rawText.startsWith("/")) {
        try {
          await logAdminAction(rawText);
        } catch (logErr) {
          console.error("Log admin error:", logErr && logErr.message);
        }
      }
      if (isAdmin && rawText.startsWith("/promoadmin")) {
        const joinRaw = await redisCommand(["HGETALL", REDIS_JOIN_TS_KEY]);
        const now = Date.now();
        const kandidat = [];
        if (Array.isArray(joinRaw)) {
          for (let i = 0; i < joinRaw.length; i += 2) {
            const endTs = Number(joinRaw[i + 1]) + NEW_USER_PROMO_DAYS * 24 * 60 * 60 * 1000;
            if (endTs > now) kandidat.push({ uid: String(joinRaw[i]), endTs });
          }
        }
        kandidat.sort((a, b) => a.endTs - b.endTs);
        const lines = [];
        let total = 0;
        for (const k of kandidat) {
          if (!(await isNewBuyer(k.uid))) continue;
          if (!(await isPhoneVerified(k.uid))) continue;
          total++;
          if (lines.length < 20) lines.push(`• <code>${k.uid}</code> — s/d ${formatWibClock(k.endTs)}`);
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `🎁 <b>Ringkasan Harga Khusus</b>\n` +
            `User yang masih punya harga khusus: <b>${total}</b>\n\n` +
            (lines.length ? lines.join("\n") : "Tidak ada.") +
            (total > lines.length ? `\n…dan ${total - lines.length} lainnya` : ""),
        });
        return res.status(200).json({ ok: true });
      }
      if (isAdmin && rawText.startsWith("/fiturbot")) {
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            "🧭 <b>Fitur Penting Bot (Admin)</b>\n\n" +
            "<b>🎁 Harga khusus user baru</b>\n" +
            "• Berlaku 3 hari sejak masuk bot, sekali pakai, Rp7.000 untuk set Rp10.000\n" +
            "• Konfirmasi sebelum bayar, pengingat pesanan belum dibayar (30 menit)\n" +
            "• <code>/promo</code> (user) | <code>/promoadmin</code> (ringkasan admin)\n" +
            "• <code>/umumkantombol</code> — kabari user soal menu baru\n\n" +
            "<b>🛡️ Anti-spam</b>\n" +
            "• Ban 1 menit untuk pelanggaran pertama, 5 menit untuk berulang\n" +
            "• User bisa cek sisa jeda lewat ⏳ Cek Jeda\n" +
            "• Admin dapat notifikasi setiap ada spam\n\n" +
            "<b>📖 Sambutan</b>\n" +
            "• Panduan singkat otomatis untuk user yang pertama kali /start\n\n" +
            "<b>⚡ Promo & harga</b>\n" +
            "• <code>/flashsale NO | HARGA | MENIT</code> | <code>/stopflashsale</code>\n" +
            "• <code>/hargamassal</code> — edit harga banyak set\n\n" +
            "<b>🔗 Link cadangan (otomatis)</b>\n" +
            "• Posting <code>Nama Set Persis https://link</code> di CH cadangan, bisa banyak baris\n" +
            "• Link cocok otomatis masuk ke set, lalu teks \"Beli di Link Cadangan\" ditulis di postingan CH utama\n" +
            "• Nama mirip akan diberi saran perintah yang bisa langsung dikirim\n" +
            "• Kalau set sudah punya link, bot tanya dulu: ➕ Tambah / 🔁 Ganti / ❌ Abaikan\n" +
            "• <code>/setcadangan hapus NO</code> atau <code>hapus 1-5</code> untuk menghapus link\n" +
            "• <code>/riwayatcad</code> — 15 perubahan link terakhir\n" +
            "• <code>/cekdeadlink</code> — cek link cadangan yang tidak bisa dibuka (jalankan ulang kalau belum selesai)\n\n" +
            "<b>📦 Katalog & postingan</b>\n" +
            "• <code>/tambah</code> — set baru, satu baris satu set. Nama yang hampir sama dengan set lain akan dilewati\n" +
            "• <code>/edit NO | Nama | Isi | Harga | Link</code> — kosongkan kolom yang tidak mau diubah\n" +
            "• <code>/cekpost</code> — postingan CH utama yang sudah tercatat bot\n" +
            "• Postingan lama: teruskan dari CH ke bot supaya bisa diedit\n\n" +
            "<b>🖼 Preview</b>\n" +
            "• <code>/cekpreview NO</code> | kirim foto dengan caption <code>/setpreview NO</code>\n" +
            "• <code>/previewmassal</code> — kirim foto tanpa caption satu per satu, dipasang ke set yang belum punya preview\n\n" +
            "<b>🛒 Pesanan & pembeli</b>\n" +
            "• <code>/pending</code> — pesanan yang belum di-ACC, urut dari yang paling lama\n" +
            "• Notif pesanan masuk menampilkan riwayat pembeli, tombol chat, dan ⚠️ kalau pernah ditolak 2 kali atau lebih\n" +
            "• <code>/hapuslb ID atau NAMA</code> — hapus akun dari klasemen (riwayat order tidak ikut terhapus)\n\n" +
            "<b>📊 Laporan harian (09:00 WIB)</b>\n" +
            "• Jumlah set, yang belum punya link cadangan atau preview, postingan belum tercatat, link baru 24 jam terakhir\n" +
            "• Omset hari ini per creator, plus file backup katalog\n\n" +
            "<b>🧾 Admin lain</b>\n" +
            "• <code>/logadmin</code> — 20 perintah admin terakhir\n" +
            "• <code>/omset</code> | <code>/error</code> | <code>/broadcast</code>\n" +
            "• <code>/setchcadangan</code> | <code>/setcadangan NO LINK</code> | <code>/cekcadangan</code> | <code>/cekpost</code> | <code>/updatepost</code> | <code>/pengumuman 1,2,3</code> — link cadangan per set (postingan channel diedit otomatis)\n" +
            "• <code>/addsaldo ID NOMINAL</code> | <code>/ceksaldo ID</code>\n" +
            "• <code>/listwd</code> | <code>/listbot</code> | <code>/backup</code> | <code>/restore</code>",
        });
        return res.status(200).json({ ok: true });
      }
      if (isAdmin && rawText.startsWith("/logadmin")) {
        const rawLog = await redisCommand(["LRANGE", REDIS_ADMINLOG_KEY, "0", "19"]);
        const lines = (Array.isArray(rawLog) ? rawLog : [])
          .map((e) => {
            try {
              const o = JSON.parse(e);
              return `• ${escapeHtml(o.t)} — ${escapeHtml(o.msg)}`;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: lines.length ? "🧾 <b>Log Admin (20 terakhir)</b>\n" + lines.join("\n") : "Log admin masih kosong.",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // VERIFIKASI NOMOR: member membagikan kontak miliknya
      if (msg.contact) {
        await handleContactShare(token, msg);
        return res.status(200).json({ ok: true });
      }

      // UNDIAN: undi otomatis kalau sudah jatuh tempo
      try {
        await maybeRunUndianDraw(token);
      } catch (udErr) {
        console.error("Cek undian error:", udErr);
      }

      // POSTING MASSAL: kirim jatah harian set lama ke channel (no-op kalau tidak aktif)
      try {
        await runPostAllBatch(token);
      } catch (paErr) {
        console.error("Posting massal error:", paErr);
      }
      try {
        await runPostSetBatch(token);
      } catch (psErr) {
        console.error("Postset error:", psErr);
      }

      // REFERRAL APLIKASI: input ID / nama dari member (perintah / selain /batal diabaikan)
      if (rawText && (!rawText.startsWith("/") || /^\/batal$/i.test(rawText))) {
        if (await handleApprefText(token, msg, senderId, rawText)) {
          return res.status(200).json({ ok: true });
        }
      }

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

        const updatedSaldo = await addUserSaldo(targetUid, delta, "deposit");
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

      // 0C. USER: /undangskor (papan skor undang teman minggu ini)
      if (/^\/undangskor(\s|$)/i.test(rawText)) {
        const { weekKey } = getWibPeriods();
        const rows = await getReferralWeekRows(weekKey);
        const top = rows.slice(0, 10);
        const names = await nameOf(top.map((r) => r.id));
        const myIdx = rows.findIndex((r) => r.id === String(msg.from && msg.from.id));
        let teks = "🏆 <b>Papan Skor Undang Teman Minggu Ini</b>\n\n";
        if (!top.length) teks += "Belum ada yang belanja dari ajakan minggu ini. Jadilah yang pertama!\n";
        top.forEach((r, i) => {
          teks += `${i + 1}. ${escapeHtml(names[i])} — ${r.n} teman\n`;
        });
        teks += myIdx === -1 ? "\nKamu belum masuk papan skor minggu ini." : `\nKamu di posisi <b>${myIdx + 1}</b> dengan ${rows[myIdx].n} teman.`;
        teks += `\n\n<i>Hadiah juara dibagikan setiap awal minggu jika peserta minimal ${REFLB_MIN_PESERTA} pengundang.</i>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: teks, parse_mode: "HTML" });
        return res.status(200).json({ ok: true });
      }

      // 0D. ADMIN: /patungan ID_PRODUK HARGA BAGIAN HARI
      if (/^\/patungan(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        if (!msg.chat || msg.chat.type !== "private") return res.status(200).json({ ok: true });
        const args = rawText.trim().split(/\s+/).slice(1);
        const itemId = String(args[0] || "");
        const harga = parseInt(args[1], 10);
        const bagian = parseInt(args[2], 10);
        const hari = parseInt(args[3], 10);
        const fmt = "Format: <code>/patungan ID_PRODUK HARGA BAGIAN HARI</code>\nContoh: <code>/patungan 12 300000 10 7</code>";
        if (!itemId || !harga || !bagian || !hari || bagian < 2 || hari < 1) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, parse_mode: "HTML", text: fmt });
          return res.status(200).json({ ok: true });
        }
        const existing = await getPatungan();
        if (existing && existing.status === "aktif" && Date.now() <= existing.end_ts) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Masih ada patungan yang berjalan. Tunggu selesai dulu." });
          return res.status(200).json({ ok: true });
        }
        const katalogList = await getKatalog();
        const item = katalogList.find((k) => String(k.id) === itemId);
        if (!item) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ ID produk tidak ditemukan di katalog." });
          return res.status(200).json({ ok: true });
        }
        const sharePrice = Math.ceil(harga / bagian);
        if (sharePrice < PATUNGAN_MIN_BAGIAN) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Harga satu bagian minimal ${formatRupiah(PATUNGAN_MIN_BAGIAN)}. Kurangi jumlah bagian.`,
          });
          return res.status(200).json({ ok: true });
        }
        const channelId = await getPostChannel();
        if (!channelId) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Channel posting belum diatur." });
          return res.status(200).json({ ok: true });
        }
        const p = {
          id: String(Date.now()),
          item_id: String(item.id),
          item_nama: item.nama,
          bagian,
          share_price: sharePrice,
          end_ts: Date.now() + hari * 86400000,
          status: "aktif",
          terjual: 0,
          channel_id: channelId,
          pinned_msg_id: null,
        };
        await redisCommand(["DEL", REDIS_PATUNGAN_BUYERS_KEY]);
        await redisCommand(["DEL", REDIS_PATUNGAN_LOCK_KEY]);
        await savePatungan(p);
        await refreshPatunganMessage(token, p);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `✅ Patungan <b>${escapeHtml(p.item_nama)}</b> dibuka: ${bagian} bagian @ ${formatRupiah(sharePrice)}, berlaku ${hari} hari.`,
        });
        return res.status(200).json({ ok: true });
      }

      // 0D2. ADMIN: /butuh (kelola daftar barang yang dibutuhkan admin untuk barter)
      if (/^\/butuh(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        if (!msg.chat || msg.chat.type !== "private") return res.status(200).json({ ok: true });
        const args = rawText.trim().split(/\s+/).slice(1);
        const aksi = (args[0] || "").toLowerCase();
        const nama = args.slice(1).join(" ").trim();
        let list = await getButuh();
        let info = "";
        if (aksi === "tambah" && nama) {
          if (!list.includes(nama)) list.push(nama);
          await saveButuh(list);
          info = `✅ <b>${escapeHtml(nama)}</b> ditambahkan.\n\n`;
        } else if (aksi === "hapus" && nama) {
          list = list.filter((x) => x.toLowerCase() !== nama.toLowerCase());
          await saveButuh(list);
          info = `🗑️ <b>${escapeHtml(nama)}</b> dihapus.\n\n`;
        } else if (aksi === "kosong") {
          await saveButuh([]);
          list = [];
          info = "🧹 Daftar dikosongkan.\n\n";
        }
        const daftar = list.length ? list.map((x, i) => `${i + 1}. ${escapeHtml(x)}`).join("\n") : "<i>(kosong)</i>";
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            info +
            `📌 <b>Barang yang dibutuhkan admin</b>\n${daftar}\n\n` +
            `Perintah:\n<code>/butuh tambah NAMA</code>\n<code>/butuh hapus NAMA</code>\n<code>/butuh kosong</code>`,
        });
        return res.status(200).json({ ok: true });
      }

      // 0E. USER: /barter (barter produk di koleksi ke admin, tanpa pembayaran)
      if (/^\/barter(\s|$)/i.test(rawText)) {
        const uid = String(msg.from && msg.from.id);
        const list = (await getKoleksi(uid)).slice(0, 6);
        if (!list.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Koleksimu masih kosong, belum ada yang bisa ditukar." });
          return res.status(200).json({ ok: true });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: "🔁 <b>Barter ke Admin</b>\nPilih produk dari koleksimu yang mau ditukar. Admin yang menilai dan menyetujui tukarannya.",
          reply_markup: {
            inline_keyboard: [
              ...list.map((e, i) => [{ text: e.nama.slice(0, 40), callback_data: `barter_pilih_${i}` }]),
              [{ text: "➕ Produk lain (ketik sendiri)", callback_data: "barter_lain" }],
              ...((await getButuh()).length ? [[{ text: "📌 Dibutuhkan admin", callback_data: "barter_butuh" }]] : []),
            ],
          },
        });
        return res.status(200).json({ ok: true });
      }

      // 0B. ADMIN: /target & /targetstop (TARGET KOMUNITAS)
      if (/^\/targetstop(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const t = await getTarget();
        if (t && t.status === "aktif") {
          t.status = "dibatalkan";
          await saveTarget(t);
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "🛑 Target komunitas dibatalkan.", parse_mode: "HTML" });
        } else {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Tidak ada target yang sedang berjalan." });
        }
        return res.status(200).json({ ok: true });
      }

      if (/^\/target(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        if (!msg.chat || msg.chat.type !== "private") return res.status(200).json({ ok: true });
        const args = rawText.trim().split(/\s+/).slice(1);
        const jumlah = parseInt(args[0], 10);
        const hadiah = parseInt(args[1], 10);
        const hari = parseInt(args[2], 10);
        if (!jumlah || !hadiah || !hari || jumlah < 1 || hadiah < 1 || hari < 1) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: "Format: <code>/target JUMLAH_PEMBELI HADIAH_RP HARI</code>\nContoh: <code>/target 200 10000 7</code>",
          });
          return res.status(200).json({ ok: true });
        }
        const channelId = await getPostChannel();
        if (!channelId) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "⚠️ Channel posting belum diatur. Atur dulu lewat menu admin." });
          return res.status(200).json({ ok: true });
        }
        const t = {
          target: jumlah,
          hadiah,
          end_ts: Date.now() + hari * 86400000,
          status: "aktif",
          count: 0,
          channel_id: channelId,
          pinned_msg_id: null,
        };
        await redisCommand(["DEL", REDIS_TARGET_BUYERS_KEY]);
        await redisCommand(["DEL", REDIS_TARGET_LOCK_KEY]);
        await saveTarget(t);
        await refreshTargetMessage(token, t);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `✅ Target komunitas dibuat: <b>${jumlah} pembeli</b>, hadiah <b>${formatRupiah(hadiah)}</b> per pembeli, berlaku <b>${hari} hari</b>.`,
        });
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

      // 0F. ADMIN: /error (lihat / hapus riwayat error bot)
      if (/^\/error(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/error\s*/i, "").trim().toLowerCase();
        if (arg === "clear" || arg === "hapus") {
          await redisCommand(["DEL", REDIS_ERRLOG_KEY]);
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Riwayat error dihapus." });
          return res.status(200).json({ ok: true });
        }
        const rows = (await redisCommand(["LRANGE", REDIS_ERRLOG_KEY, "0", "9"])) || [];
        if (rows.length === 0) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Tidak ada error tercatat. Bot aman." });
          return res.status(200).json({ ok: true });
        }
        const lines = rows.map((r, i) => {
          const e = parseJsonSafe(r) || { t: "-", msg: String(r) };
          return `${i + 1}. <b>${escapeHtml(e.t)}</b>\n<code>${escapeHtml(String(e.msg).slice(0, 300))}</code>`;
        });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `🚨 <b>ERROR TERAKHIR</b> (10 terbaru)\n\n${lines.join("\n\n")}\n\n<i>Hapus riwayat: /error clear</i>`,
        });
        return res.status(200).json({ ok: true });
      }

      // 0G. ADMIN: /users (ringkasan member) dan /user ID (data satu member)
      if (/^\/users$/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const [totalUsers, buyers, vipCount, resellerCount, saldoVals, undianKey] = await Promise.all([
          redisCommand(["SCARD", REDIS_USERS_KEY]),
          redisCommand(["HLEN", REDIS_LB_ALLCNT_KEY]),
          redisCommand(["HLEN", REDIS_VIP_KEY]),
          redisCommand(["HLEN", REDIS_RESELLER_KEY]),
          getAllSaldoTotals(),
          Promise.resolve(getUndianNextKey()),
        ]);
        const totalSaldo = (Array.isArray(saldoVals) ? saldoVals : []).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
        const pemegangSaldo = (Array.isArray(saldoVals) ? saldoVals : []).filter((v) => (parseInt(v, 10) || 0) > 0).length;
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            "👥 <b>RINGKASAN MEMBER</b>\n\n" +
            `• Total member (pernah chat bot): <b>${totalUsers || 0}</b>\n` +
            `• Pernah beli: <b>${buyers || 0}</b>\n` +
            `• VIP: <b>${vipCount || 0}</b>\n` +
            `• Reseller: <b>${resellerCount || 0}</b>\n` +
            `• Punya saldo: <b>${pemegangSaldo}</b> member\n` +
            `• Total saldo member: <code>${formatRupiah(totalSaldo)}</code>\n` +
            `• Undian ${formatUndianDate(undianKey)}\n\n` +
            "<i>Cek satu member: /user ID_TELEGRAM</i>",
        });
        return res.status(200).json({ ok: true });
      }

      if (/^\/user\s+\d+$/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const uid = rawText.replace(/^\/user\s+/i, "").trim();
        const [saldo, buyCount, koleksi, vipDate, reseller, banned, tiket] = await Promise.all([
          getUserSaldo(uid),
          redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, uid]),
          getKoleksi(uid),
          redisCommand(["HGET", REDIS_VIP_KEY, uid]),
          isReseller(uid),
          isBanned(uid),
          redisCommand(["HGET", REDIS_UNDIAN_TIX_PREFIX + getUndianNextKey(), uid]),
        ]);
        const koleksiList = Array.isArray(koleksi) ? koleksi : [];
        const lastItems = koleksiList.slice(-3).reverse().map((k) => `  • ${escapeHtml(k.nama)} (${escapeHtml(k.date || "-")})`).join("\n");
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `👤 <b>DATA MEMBER</b>\n` +
            `🆔 <code>${escapeHtml(uid)}</code>\n\n` +
            `💳 Saldo: <code>${formatRupiah(saldo)}</code>\n` +
            `🛒 Total pembelian: <b>${Number(buyCount) || 0}</b>\n` +
            `🎒 Koleksi tersimpan: <b>${koleksiList.length}</b> set\n` +
            (lastItems ? `${lastItems}\n` : "") +
            `💎 VIP: ${vipDate ? `✅ sejak ${escapeHtml(String(vipDate).slice(0, 10))}` : "❌ belum"}\n` +
            `🤝 Reseller: ${reseller ? "✅ ya" : "❌ tidak"}\n` +
            `🎟 Tiket undian minggu ini: <b>${Number(tiket) || 0}</b>\n` +
            `🚫 Diblokir: ${banned ? "✅ ya" : "❌ tidak"}\n\n` +
            "<i>Nama Telegram belum tersimpan, jadi yang ditampilkan cuma ID.</i>",
        });
        return res.status(200).json({ ok: true });
      }

      // 0H. ADMIN: /hargamassal (edit harga banyak set sekaligus, dengan preview & konfirmasi)
      if (/^\/hargamassal(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const argRaw = rawText.replace(/^\/hargamassal\s*/i, "").trim();
        const sendAdm = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });

        if (/^ya$/i.test(argRaw)) {
          const pending = parseJsonSafe(await redisCommand(["GET", REDIS_HARGA_MASS_KEY]));
          if (!pending || !pending.tokens) {
            await sendAdm("⚠️ Tidak ada perubahan harga yang menunggu konfirmasi (atau sudah lewat 5 menit).");
            return res.status(200).json({ ok: true });
          }
          const parsed = parseHargaMassArgs(pending.tokens);
          const katalog = await getKatalog();
          const changes = buildHargaMassPlan(katalog, parsed);
          if (changes.length === 0) {
            await redisCommand(["DEL", REDIS_HARGA_MASS_KEY]);
            await sendAdm("ℹ️ Tidak ada set yang berubah harganya.");
            return res.status(200).json({ ok: true });
          }
          for (const c of changes) c.item.harga = formatRupiah(c.newVal);
          await saveKatalog(katalog);
          await redisCommand(["DEL", REDIS_HARGA_MASS_KEY]);
          await sendAdm(
            `✅ Harga <b>${changes.length} set</b> sudah diubah.\n` +
              "Harga reseller ikut menyesuaikan otomatis. Member yang wishlist set yang turun harganya akan dikabari."
          );
          return res.status(200).json({ ok: true });
        }

        const tokens = argRaw.split(/\s+/).filter(Boolean);
        const parsed = parseHargaMassArgs(tokens);
        if (!parsed.ok) {
          await sendAdm(parsed.error);
          return res.status(200).json({ ok: true });
        }
        const katalog = await getKatalog();
        const changes = buildHargaMassPlan(katalog, parsed);
        if (changes.length === 0) {
          await sendAdm(
            "ℹ️ Tidak ada set yang cocok dengan sasaran itu, atau harganya tidak berubah." +
              (changes.skipped ? `\n🔒 ${changes.skipped} set harga ${formatRupiah(HARGA_MASS_PROTECT_MIN)} ke atas dilewati (dilindungi).` : "")
          );
          return res.status(200).json({ ok: true });
        }
        await redisCommand(["SET", REDIS_HARGA_MASS_KEY, JSON.stringify({ tokens }), "EX", "300"]);
        const sample = changes
          .slice(0, 10)
          .map((c) => `• ${escapeHtml(c.item.nama)}: ${formatRupiah(c.oldVal)} → <b>${formatRupiah(c.newVal)}</b>`)
          .join("\n");
        await sendAdm(
          `🔍 <b>PREVIEW EDIT HARGA</b>\n` +
            `Akan mengubah <b>${changes.length} set</b>${changes.length > 10 ? " (menampilkan 10 pertama)" : ""}:\n\n` +
            `${sample}\n\n` +
            (changes.skipped ? `🔒 ${changes.skipped} set harga ${formatRupiah(HARGA_MASS_PROTECT_MIN)} ke atas dilewati (dilindungi).\n` : "") +
            "✅ Terapkan: <code>/hargamassal ya</code>\n" +
            "<i>Perubahan ini menunggu konfirmasi selama 5 menit.</i>"
        );
        return res.status(200).json({ ok: true });
      }

      // 0J. ADMIN: /setomset (tujuan notif omset: channel, log makro, atau chat admin)
      if (/^\/setomset(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setomset\s*/i, "").trim().toLowerCase();
        const sendAdm = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        if (!arg) {
          const cur = await redisCommand(["GET", REDIS_OMSET_CH_KEY]);
          const label = !cur ? "chat admin (pribadi)" : cur === "__makro__" ? "channel log makro" : `channel <code>${escapeHtml(String(cur))}</code>`;
          await sendAdm(
            `💰 Notif omset dikirim ke: <b>${label}</b>\n\n` +
              "Atur: <code>/setomset CHAT_ID</code> (channel/grup)\n" +
              "<code>/setomset makro</code> (pakai channel log makro)\n" +
              "<code>/setomset off</code> (kembali ke chat admin)\n" +
              "<i>Bot harus jadi admin di channel itu.</i>"
          );
          return res.status(200).json({ ok: true });
        }
        if (arg === "off") {
          await redisCommand(["DEL", REDIS_OMSET_CH_KEY]);
          await sendAdm("✅ Notif omset kembali ke chat admin.");
          return res.status(200).json({ ok: true });
        }
        if (arg === "makro") {
          const logId = await getMacroLogChatId();
          if (!logId) {
            await sendAdm("⚠️ Channel log makro belum diset. Atur dulu dengan /setlogmakro CHAT_ID.");
            return res.status(200).json({ ok: true });
          }
          await redisCommand(["SET", REDIS_OMSET_CH_KEY, "__makro__"]);
          await sendAdm("✅ Notif omset sekarang masuk ke channel log makro.");
          return res.status(200).json({ ok: true });
        }
        if (/^-?\d{5,20}$/.test(arg)) {
          await redisCommand(["SET", REDIS_OMSET_CH_KEY, arg]);
          await sendAdm(`✅ Notif omset sekarang dikirim ke <code>${escapeHtml(arg)}</code>.\nPastikan bot sudah jadi admin di channel itu.`);
          return res.status(200).json({ ok: true });
        }
        await sendAdm("⚠️ Format: <code>/setomset CHAT_ID</code>, <code>/setomset makro</code>, atau <code>/setomset off</code>.");
        return res.status(200).json({ ok: true });
      }

      // 0I. ADMIN: /omset (omset hari ini, kemarin, dan total kapan saja)
      if (/^\/omset$/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const now = Date.now();
        const [today, yesterday, total] = await Promise.all([
          getDailyOmset(wibDayKey(now)),
          getDailyOmset(wibDayKey(now - 86400000)),
          getStoreOmset(),
        ]);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            "💰 <b>OMSET TOKO</b>\n" +
            "━━━━━━━━━━━━━━━━━━━━\n" +
            `📅 Hari ini : <code>${formatRupiah(today.rupiah)}</code> (${today.count} transaksi)\n` +
            `📅 Kemarin : <code>${formatRupiah(yesterday.rupiah)}</code> (${yesterday.count} transaksi)\n` +
            `💼 Total : <code>${formatRupiah(total.rupiah)}</code>\n\n` +
            "<i>Omset hari ini dihitung dari pesanan yang sudah lunas. Ringkasan lengkap tiap pagi dikirim otomatis.</i>",
        });
        return res.status(200).json({ ok: true });
      }

      // 0E. ADMIN: /undian (status undian minggu ini & hasil terakhir)
      if (/^\/undian$/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const nextKey = getUndianNextKey();
        const lastKey = getUndianLastDueKey();
        const flat = (await redisCommand(["HGETALL", REDIS_UNDIAN_TIX_PREFIX + nextKey])) || [];
        let tix = 0;
        let peserta = 0;
        for (let i = 1; i < flat.length; i += 2) {
          const n = Number(flat[i]) || 0;
          if (n > 0) {
            tix += n;
            peserta++;
          }
        }
        const last = parseJsonSafe(await redisCommand(["HGET", REDIS_UNDIAN_DRAW_KEY, lastKey]));
        let lastText = "Belum ada hasil.";
        if (last && last.winners) {
          lastText = last.winners.length
            ? last.winners.map((w) => `${w.rank}. ***${escapeHtml(String(w.uid).slice(-4))} • ${formatRupiah(w.prize)}`).join("\n")
            : "Tidak ada peserta.";
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `🎟 <b>UNDIAN MINGGUAN (ADMIN)</b>\n` +
            `📅 Undian berikutnya: <b>${formatUndianDate(nextKey)}</b>\n` +
            `👥 Peserta: <b>${peserta}</b> • 🎫 Tiket: <b>${tix}</b>\n\n` +
            `<b>Hasil terakhir (${formatUndianDate(lastKey)}):</b>\n${lastText}`,
        });
        return res.status(200).json({ ok: true });
      }

      // 0D. ADMIN: /setappref (NAMA & LINK REFERRAL APLIKASI)
      if (/^\/setappref(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setappref\s*/i, "").trim();
        const cur = await getApprefCfg();
        const sendAdm = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        if (!arg) {
          await sendAdm(
            `📱 <b>REFERRAL APLIKASI</b>\n` +
              `Status: ${cur.enabled ? "✅ aktif" : "⏸ nonaktif"}\n` +
              `Nama: <b>${escapeHtml(cur.name)}</b>\n` +
              `Link: ${escapeHtml(cur.link)}\n\n` +
              "Atur: <code>/setappref NAMA | LINK</code>\n" +
              "Matikan / nyalakan: <code>/setappref off</code> | <code>/setappref on</code>"
          );
          return res.status(200).json({ ok: true });
        }
        if (/^(on|off)$/i.test(arg)) {
          cur.enabled = arg.toLowerCase() === "on";
          await redisCommand(["SET", REDIS_APPREF_CFG_KEY, JSON.stringify(cur)]);
          await sendAdm(`✅ Referral aplikasi ${cur.enabled ? "diaktifkan" : "dinonaktifkan"}.`);
          return res.status(200).json({ ok: true });
        }
        const parts = arg.split("|").map((s) => s.trim());
        if (parts.length < 2 || !isUsableLink(parts[1])) {
          await sendAdm(
            "⚠️ Format: <code>/setappref NAMA | LINK</code>\n" +
              "<i>Contoh: /setappref Aplikasi X | https://link-referral-kamu</i>"
          );
          return res.status(200).json({ ok: true });
        }
        cur.name = parts[0].slice(0, 40) || APPREF_DEFAULT_NAME;
        cur.link = parts[1];
        await redisCommand(["SET", REDIS_APPREF_CFG_KEY, JSON.stringify(cur)]);
        await sendAdm(`✅ Referral aplikasi disimpan.\nNama: <b>${escapeHtml(cur.name)}</b>\nLink: ${escapeHtml(cur.link)}`);
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

      // 5B4. ADMIN: /pending — daftar pesanan yang belum di-ACC (menunggu verifikasi / belum dibayar)
      if (/^\/pending(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const flat = (await redisCommand(["HGETALL", REDIS_PENDING_MAP_KEY])) || [];
        const rows = [];
        for (let i = 0; i < flat.length; i += 2) {
          const ord = await getOrder(String(flat[i]));
          if (!ord || (ord.status !== "pending" && ord.status !== "waiting_acc")) continue;
          const menit = ord.created_ms ? Math.floor((Date.now() - ord.created_ms) / 60000) : null;
          rows.push({ ord, menit });
        }
        if (!rows.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Tidak ada pesanan yang menunggu ACC." });
          return res.status(200).json({ ok: true });
        }
        rows.sort((a, b) => (b.menit || 0) - (a.menit || 0));
        const waiting = rows.filter((r) => r.ord.status === "waiting_acc").length;
        let txt = `🕓 <b>Pesanan belum di-ACC: ${rows.length}</b> (sudah konfirmasi bayar: ${waiting})\n\n`;
        for (const { ord, menit } of rows.slice(0, 25)) {
          const label = ord.status === "waiting_acc" ? "🕓 sudah konfirmasi" : "⏳ belum bayar";
          const umur = menit === null ? "" : menit < 60 ? ` • ${menit} mnt lalu` : ` • ${Math.floor(menit / 60)} jam lalu`;
          txt += `#${ord.id} ${label}${umur}\n   ${escapeHtml(ord.buyer_name || "Pembeli")} (${escapeHtml(ord.buyer_username || "-")}) • ${formatRupiah(ord.total_nominal)}\n`;
        }
        if (rows.length > 25) txt += `\n… dan ${rows.length - 25} pesanan lain`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: txt, parse_mode: "HTML" });
        return res.status(200).json({ ok: true });
      }

      // 5B3. ADMIN: /cekdeadlink — cek link cadangan yang tidak bisa dibuka (dibatasi waktu, aman untuk Vercel)
      if (/^\/cekdeadlink(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const start = Date.now();
        const katalogCek = await getKatalog();
        const urls = [];
        for (const k of katalogCek) {
          for (const u of getCadanganList(k)) urls.push({ no: katalogCek.indexOf(k) + 1, nama: k.nama, url: u });
        }
        const bad = [];
        let checked = 0;
        const TIME_BUDGET_MS = 7000;
        for (let i = 0; i < urls.length && Date.now() - start < TIME_BUDGET_MS; i += 8) {
          const batch = urls.slice(i, i + 8);
          await Promise.all(batch.map(async (x) => {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 4000);
            try {
              const r = await fetch(x.url, { method: "GET", redirect: "follow", signal: ctl.signal });
              if (!r.ok) bad.push({ ...x, status: r.status });
            } catch (e) {
              bad.push({ ...x, status: "gagal dibuka" });
            } finally {
              clearTimeout(t);
            }
          }));
          checked += batch.length;
        }
        const sisa = urls.length - checked;
        let txt = `🔎 <b>Cek link cadangan</b>\nDiperiksa: ${checked} dari ${urls.length} link.\n`;
        if (!bad.length) txt += "✅ Semua link yang diperiksa bisa dibuka.";
        else {
          txt += `❌ <b>${bad.length} link bermasalah:</b>\n`;
          for (const b of bad.slice(0, 20)) txt += `• #${b.no} ${escapeHtml(b.nama)} (${escapeHtml(String(b.status))})\n`;
          if (bad.length > 20) txt += `… dan ${bad.length - 20} lainnya\n`;
        }
        if (sisa > 0) txt += `\n<i>Masih ada ${sisa} link belum diperiksa. Jalankan /cekdeadlink lagi nanti untuk melanjutkan. Catatan: link undangan Telegram kadang tetap terbuka walau sudah tidak valid.</i>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: txt, parse_mode: "HTML", disable_web_page_preview: true });
        return res.status(200).json({ ok: true });
      }

      // 5B2. ADMIN: /riwayatcad — 15 perubahan link cadangan terakhir (hasil auto-detect)
      if (/^\/riwayatcad(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const raw = (await redisCommand(["LRANGE", REDIS_CAD_LOG_KEY, "0", "14"])) || [];
        if (!raw.length) {
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "Belum ada riwayat perubahan link cadangan." });
          return res.status(200).json({ ok: true });
        }
        const lines = raw.map((r) => {
          const e = JSON.parse(r);
          const tgl = new Date(e.t + 7 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
          const lama = e.lama ? `${escapeHtml(e.lama)} → ` : "";
          return `• ${tgl} <b>${escapeHtml(e.nama)}</b>: ${lama}${escapeHtml(e.baru)} <i>(${escapeHtml(e.via)})</i>`;
        });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `🕓 <b>Riwayat link cadangan (terbaru)</b>\n\n${lines.join("\n")}`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        return res.status(200).json({ ok: true });
      }

      // 5C. ADMIN: /hapuslb ID_ATAU_NAMA — hapus satu akun dari klasemen (+ hitungan beli & tier)
      if (/^\/hapuslb(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const target = rawText.replace(/^\/hapuslb\s*/i, "").trim();
        if (!target) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "Format: <code>/hapuslb ID</code> atau <code>/hapuslb NAMA</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        let memberId = /^\d+$/.test(target) ? target : null;
        if (!memberId) {
          const flat = (await redisCommand(["HGETALL", REDIS_LB_NAMES_KEY])) || [];
          for (let i = 0; i < flat.length; i += 2) {
            if (String(flat[i + 1] || "").trim().toLowerCase() === target.toLowerCase()) {
              memberId = String(flat[i]);
              break;
            }
          }
        }
        if (!memberId) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ Akun "${escapeHtml(target)}" tidak ditemukan di klasemen.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }
        const { dayKey, weekKey, monthKey } = getWibPeriods();
        await Promise.all([
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}day_rp_${dayKey}`, memberId]),
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}day_cnt_${dayKey}`, memberId]),
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}week_rp_${weekKey}`, memberId]),
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}week_cnt_${weekKey}`, memberId]),
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}month_rp_${monthKey}`, memberId]),
          redisCommand(["ZREM", `${REDIS_LB_PREFIX}month_cnt_${monthKey}`, memberId]),
          redisCommand(["HDEL", REDIS_LB_ALLCNT_KEY, memberId]),
          redisCommand(["HDEL", REDIS_LB_NAMES_KEY, memberId]),
          redisCommand(["HDEL", REDIS_BUYER_SPEND_KEY, memberId]),
        ]);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Akun <code>${escapeHtml(memberId)}</code> dihapus dari klasemen (termasuk hitungan beli & tier).\n<i>Riwayat order dan saldo tidak ikut berubah.</i>`,
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
              "<code>/tambah\nNama A | 29 | Rp 10.000 | https://t.me/+abc | Full\nNama B | 20 | Rp 10.000 | https://t.me/+def | Full</code>\n\n" +
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

          const dupGuess = katalogList.find((k) => {
            const a = normCore(k.nama), b = normCore(parts[0]);
            return a !== b && editDistance(a, b) <= 2;
          });
          if (dupGuess) {
            failed.push({ no: i + 1, text: `"${parts[0]}" mirip "${dupGuess.nama}". Kalau memang beda, ubah nama dulu lalu kirim ulang` });
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
              "<code>/tambah\nNama A | 29 | Rp 10.000 | https://t.me/+abc | Full\nNama B | 20 | Rp 10.000 | https://t.me/+def | Full</code>\n\n" +
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
          await postNewSetToChannel(token, newItem);
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
        for (const { item } of added) {
          await postNewSetToChannel(token, item);
        }
        return res.status(200).json({ ok: true });
      }

      // 10. ADMIN: /edit
      // POST SET BERDASARKAN NOMOR: /postset 5 | /postset 5 9 12 | /postset 5-20
      if (/^\/postset(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const replyS = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        let argS = rawText.replace(/^\/postset\s*/i, "").trim();
        const ulangS = /(^|\s)ulang(\s|$)/i.test(argS);
        argS = argS.replace(/(^|\s)ulang(?=\s|$)/gi, " ").trim();
        const katalogS = await getKatalog();
        const usageS =
          "⚠️ Format: <code>/postset 5</code>, <code>/postset 5 9 12</code>, atau <code>/postset 5-20</code>\n" +
          "Nomor sama dengan di <code>/edit</code>.";
        if (!argS) {
          await replyS(usageS);
          return res.status(200).json({ ok: true });
        }

        const nosS = new Set();
        const salahS = [];
        for (const tok of argS.split(/[\s,]+/).filter(Boolean)) {
          const rg = /^(\d+)-(\d+)$/.exec(tok);
          if (rg) {
            let a = parseInt(rg[1], 10);
            let b = parseInt(rg[2], 10);
            if (a > b) [a, b] = [b, a];
            if (b - a > 200) {
              salahS.push(tok);
              continue;
            }
            for (let n = a; n <= b; n++) nosS.add(n);
          } else if (/^\d+$/.test(tok)) {
            nosS.add(parseInt(tok, 10));
          } else {
            salahS.push(tok);
          }
        }
        const validS = [...nosS].filter((n) => n >= 1 && n <= katalogS.length);
        salahS.push(...[...nosS].filter((n) => n < 1 || n > katalogS.length).map(String));
        if (validS.length === 0) {
          await replyS(usageS);
          return res.status(200).json({ ok: true });
        }

        const doneS = new Set((await redisCommand(["HKEYS", REDIS_POSTALL_DONE_KEY])) || []);
        let antreS = 0;
        let sudahS = 0;
        for (const n of validS) {
          const id = String(katalogS[n - 1].id);
          if (doneS.has(id)) {
            if (!ulangS) {
              sudahS++;
              continue;
            }
            await redisCommand(["HDEL", REDIS_POSTALL_DONE_KEY, id]); // posting ulang: hapus tanda "sudah diposting"
          }
          await redisCommand(["RPUSH", REDIS_POSTSET_QUEUE_KEY, id]);
          antreS++;
        }

        await replyS(
          `📮 Antre <b>${antreS}</b> set` +
            (sudahS ? ` • sudah pernah diposting <b>${sudahS}</b> (dilewati, pakai <code>/postset NOMOR ulang</code> untuk posting ulang)` : "") +
            (salahS.length ? ` • nomor tidak valid: ${escapeHtml(salahS.join(", "))}` : "") +
            `.\nJatah posting: ${POSTALL_QUOTA_LABEL}.`
        );

        const runS = await runPostSetBatch(token);
        if (runS.ran) {
          await replyS(
            `✅ Diposting: <b>${runS.posted}</b> • gagal: ${runS.failed}` +
              (runS.failed > 0 ? " (set belum punya preview/foto atau gagal kirim, tidak ditandai terposting)" : "") +
              "\n" +
              (runS.sisa > 0 ? `⏳ Sisa antrean: <b>${runS.sisa}</b> set, lanjut otomatis di batch berikutnya.` : "🎉 Antrean kosong.")
          );
        } else if (runS.reason === "quota") {
          await replyS(`⏳ Jatah hari ini sudah habis. Antrean dilanjutkan besok otomatis.`);
        }
        return res.status(200).json({ ok: true });
      }

      // TANDAI SET YANG SUDAH ADA DI CHANNEL: /tandaipost 1-120 | /tandaipost 5 9 12 | /tandaipost hapus 5-9 | /tandaipost cek
      if (/^\/tandaipost(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const replyT = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        let argT = rawText.replace(/^\/tandaipost\s*/i, "").trim();
        const katalogT = await getKatalog();
        const doneT = new Set((await redisCommand(["HKEYS", REDIS_POSTALL_DONE_KEY])) || []);
        if (/^cek$/i.test(argT)) {
          const belum = katalogT.map((k, i) => ({ k, no: i + 1 })).filter((x) => !doneT.has(String(x.k.id)));
          await replyT(
            `📊 Total set: <b>${katalogT.length}</b>\n✅ Ditandai sudah di channel: <b>${katalogT.length - belum.length}</b>\n` +
              `⏳ Belum diposting: <b>${belum.length}</b>` +
              (belum.length && belum.length <= 40 ? `\nNomor: ${belum.map((x) => x.no).join(", ")}` : "")
          );
          return res.status(200).json({ ok: true });
        }
        const hapusT = /^hapus(\s|$)/i.test(argT);
        if (hapusT) argT = argT.replace(/^hapus\s*/i, "").trim();
        const nosT = new Set();
        for (const tok of argT.split(/[\s,]+/).filter(Boolean)) {
          const rg = /^(\d+)-(\d+)$/.exec(tok);
          if (rg) {
            let a = parseInt(rg[1], 10);
            let b = parseInt(rg[2], 10);
            if (a > b) [a, b] = [b, a];
            for (let n = a; n <= b && n - a <= 1000; n++) nosT.add(n);
          } else if (/^\d+$/.test(tok)) nosT.add(parseInt(tok, 10));
        }
        const validT = [...nosT].filter((n) => n >= 1 && n <= katalogT.length);
        if (validT.length === 0) {
          await replyT(
            "⚠️ Format: <code>/tandaipost 1-120</code> (tandai sudah ada di channel), <code>/tandaipost hapus 5-9</code> (batalkan tanda), <code>/tandaipost cek</code>."
          );
          return res.status(200).json({ ok: true });
        }
        for (const n of validT) {
          const id = String(katalogT[n - 1].id);
          if (hapusT) await redisCommand(["HDEL", REDIS_POSTALL_DONE_KEY, id]);
          else await redisCommand(["HSET", REDIS_POSTALL_DONE_KEY, id, "1"]);
        }
        await replyT(
          hapusT
            ? `↩️ Tanda dihapus untuk <b>${validT.length}</b> set (akan ikut diposting lagi).`
            : `✅ <b>${validT.length}</b> set ditandai sudah ada di channel, akan dilewati oleh /postsemua dan /postset.`
        );
        return res.status(200).json({ ok: true });
      }

      // PREVIEW MASSAL: mulai / hentikan / cek sesi
      if (/^\/previewmassal(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const replyM = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        const subM = rawText.replace(/^\/previewmassal\s*/i, "").trim().toLowerCase();

        if (subM === "stop") {
          const st = await getPreviewMassal();
          if (st) {
            st.active = false;
            await savePreviewMassal(st);
          }
          await replyM("⏹ Sesi preview massal dihentikan.");
          return res.status(200).json({ ok: true });
        }

        const katalogM = await getKatalog();
        if (subM === "status") {
          const st = await getPreviewMassal();
          await replyM(
            st && st.active
              ? `ℹ️ Sesi aktif. Sisa antrean: <b>${st.queue.length}</b> set.`
              : "ℹ️ Tidak ada sesi preview massal yang aktif."
          );
          return res.status(200).json({ ok: true });
        }

        // Sesi sudah berjalan: jangan ditimpa, supaya checklist dan antrean tidak hilang
        const sesiAktif = await getPreviewMassal();
        if (sesiAktif && sesiAktif.active) {
          await replyM(
            `ℹ️ Sesi preview massal sudah berjalan (sisa <b>${sesiAktif.queue.length}</b> set, ` +
              `terpasang <b>${(sesiAktif.done || []).length}</b>). Lanjutkan dengan kirim foto. ` +
              `Hentikan dengan <code>/previewmassal stop</code>.`
          );
          return res.status(200).json({ ok: true });
        }

        const queueM = katalogM.filter((k) => k && k.id && !k.photo_id).map((k) => String(k.id));
        if (queueM.length === 0) {
          await replyM("✅ Semua set sudah punya preview.");
          return res.status(200).json({ ok: true });
        }
        await savePreviewMassal({ active: true, queue: queueM, done: (sesiAktif && sesiAktif.done) || [] });
        const pertama = katalogM.findIndex((k) => String(k.id) === queueM[0]);
        await replyM(
          `🖼 <b>Mode preview massal aktif.</b>\n` +
            `Antrean: <b>${queueM.length}</b> set yang belum punya preview.\n` +
            `Set pertama: <b>${pertama + 1}. ${escapeHtml(katalogM[pertama].nama)}</b>\n\n` +
            `Kirim foto <b>tanpa caption</b> satu per satu, urut sesuai nomor. ` +
            `Hentikan dengan <code>/previewmassal stop</code>.`
        );
        return res.status(200).json({ ok: true });
      }

      // PREVIEW SET: atur, hapus, dan cek preview foto per set (admin)
      if (/^\/(setpreview|hapuspreview|cekpreview)(\s|$)/i.test(rawText)) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const replyP = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        const katalogP = await getKatalog();
        const cmdP = rawText.split(/\s+/)[0].toLowerCase();
        const argP = rawText.slice(cmdP.length).trim();

        if (cmdP === "/cekpreview" && !argP) {
          const tanpa = katalogP.map((k, i) => ({ k, no: i + 1 })).filter((x) => !x.k.photo_id);
          let t =
            `🖼 <b>CEK PREVIEW SET</b>\n` +
            `✅ Punya preview: <b>${katalogP.length - tanpa.length}</b>\n` +
            `❌ Belum ada: <b>${tanpa.length}</b> dari ${katalogP.length} set\n\n`;
          if (tanpa.length > 0) {
            t += "<b>Belum punya preview:</b>\n" + tanpa.map((x) => `${x.no}. ${escapeHtml(x.k.nama)}`).join("\n") + "\n\n";
          }
          t += "Cek satu set: <code>/cekpreview NO</code>\nAtur preview: kirim foto dengan caption <code>/setpreview NO</code>";
          await sendLongText(token, chatId, t);
          return res.status(200).json({ ok: true });
        }

        const noP = parseInt(argP, 10);
        const idxP = noP - 1;
        if (!argP || isNaN(noP) || idxP < 0 || idxP >= katalogP.length) {
          await replyP(
            "⚠️ Nomor set tidak valid. Lihat nomor di <code>/edit</code>.\n" +
              "• <code>/cekpreview NO</code> — cek ada preview atau tidak\n" +
              "• Kirim foto dengan caption <code>/setpreview NO</code> — pasang/ganti preview\n" +
              "• <code>/hapuspreview NO</code> — hapus preview"
          );
          return res.status(200).json({ ok: true });
        }
        const itemP = katalogP[idxP];

        if (cmdP === "/cekpreview") {
          await replyP(
            `${itemP.photo_id ? "✅" : "❌"} <b>${escapeHtml(itemP.nama)}</b> ` +
              (itemP.photo_id ? "sudah punya preview." : "belum punya preview.")
          );
          return res.status(200).json({ ok: true });
        }

        if (cmdP === "/hapuspreview") {
          if (!itemP.photo_id) {
            await replyP(`ℹ️ <b>${escapeHtml(itemP.nama)}</b> memang belum punya preview.`);
            return res.status(200).json({ ok: true });
          }
          delete itemP.photo_id;
          await saveKatalog(katalogP);
          await replyP(`🗑 Preview <b>${escapeHtml(itemP.nama)}</b> dihapus.`);
          return res.status(200).json({ ok: true });
        }

        // /setpreview NO (wajib kirim foto)
        if (!msg.photo || msg.photo.length === 0) {
          await replyP("📸 Kirim <b>foto</b> dengan caption <code>/setpreview " + noP + "</code> untuk memasang preview.");
          return res.status(200).json({ ok: true });
        }
        const adaSebelumnya = Boolean(itemP.photo_id);
        itemP.photo_id = msg.photo[msg.photo.length - 1].file_id;
        await saveKatalog(katalogP);
        await replyP(
          `✅ Preview <b>${escapeHtml(itemP.nama)}</b> ${adaSebelumnya ? "diganti" : "dipasang"}.`
        );
        return res.status(200).json({ ok: true });
      }

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

        // Edit banyak set sekaligus: /edit 37,39 | | | Rp 15.000 | |   atau   /edit 37-40 | | | Rp 15.000 | |
        // Untuk banyak set hanya Harga, Kategori, dan Creator yang bisa diubah.
        if (/[,\-]/.test(parts[0])) {
          const nums = new Set();
          let bad = false;
          for (const seg of parts[0].split(",")) {
            const t = seg.trim();
            const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) {
              const a = parseInt(m[1], 10);
              const b = parseInt(m[2], 10);
              for (let n = Math.min(a, b); n <= Math.max(a, b) && nums.size <= katalogList.length; n++) nums.add(n);
            } else if (/^\d+$/.test(t)) {
              nums.add(parseInt(t, 10));
            } else {
              bad = true;
            }
          }
          const list = [...nums];
          if (bad || list.length === 0 || list.some((n) => n < 1 || n > katalogList.length)) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text: "⚠️ Nomor set tidak valid. Contoh: <code>/edit 37,39 | | | Rp 15.000 | |</code> atau <code>/edit 37-40 | | | Rp 15.000 | |</code>",
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }
          if (parts[1] || parts[2] || parts[4]) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text: "⚠️ Kalau edit banyak set sekaligus, hanya <b>Harga</b>, <b>Kategori</b>, dan <b>Creator</b> yang bisa diubah. Nama, Isi, dan Link kosongkan (edit satu per satu).",
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }
          for (const n of list) {
            const it = katalogList[n - 1];
            if (parts[3]) it.harga = parts[3];
            if (parts.length >= 6 && parts[5]) it.kategori = parts[5].toLowerCase().includes("full") ? "full" : "mini";
            if (parts.length >= 7 && parts[6]) {
              it.creator =
                parts[6] === "-" || parts[6].toLowerCase() === "hapus" ? "" : parts[6].replace(/\s+/g, " ").slice(0, 60);
            }
          }
          await saveKatalog(katalogList);
          const namaList = list
            .slice(0, 15)
            .map((n) => `• #${n} ${escapeHtml(katalogList[n - 1].nama)}`)
            .join("\n");
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ <b>${list.length} set diperbarui!</b>\n${namaList}${list.length > 15 ? "\n…" : ""}`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

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

      // 10A1. ADMIN: /umumkantombol — kabari semua user soal menu baru (manual, sekali)
      if (rawText.startsWith("/umumkantombol")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const allUserIds = (await redisCommand(["SMEMBERS", REDIS_USERS_KEY])) || [];
        const bannedIds = new Set(((await redisCommand(["HKEYS", REDIS_BLACKLIST_KEY])) || []).map(String));
        const userIds = allUserIds.filter((uid) => !bannedIds.has(String(uid)));
        const announceText =
          "📢 <b>Menu baru sudah tersedia!</b>\n\n" +
          "Ketik /start untuk memuat ulang menu di bawah, lalu pakai tombol <b>🎁 Promo Saya</b> untuk cek sisa waktu harga khusus.";
        let sentCount = 0;
        for (let i = 0; i < userIds.length; i += 20) {
          const batch = userIds.slice(i, i + 20);
          const results = await Promise.all(
            batch.map((uid) => tgRequest(token, "sendMessage", { chat_id: uid, text: announceText, parse_mode: "HTML" }))
          );
          results.forEach((r) => {
            if (r && r.ok) sentCount++;
          });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Pengumuman terkirim ke <b>${sentCount}</b> dari <b>${userIds.length}</b> user.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10A2. ADMIN: /flashsale — mulai promo kilat (default 1 jam) untuk satu set
      if (rawText.startsWith("/preorder") || rawText.startsWith("/rilispo")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const isRilis = rawText.startsWith("/rilispo");
        const katalogList = await getKatalog();
        const arg = rawText.replace(/^\/(preorder|rilispo)\s*/i, "").trim();
        const sayAdmin = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });

        if (!arg) {
          const poLines = [];
          for (let i = 0; i < katalogList.length; i++) {
            const it = katalogList[i];
            if (!it.preorder) continue;
            const pending = Number(await redisCommand(["HLEN", REDIS_PO_PREFIX + String(it.id)])) || 0;
            poLines.push(`${i + 1}. <b>${escapeHtml(it.nama)}</b> — ETA: ${escapeHtml(it.po_eta || "-")} — pending: ${pending}`);
          }
          await sayAdmin(
            (poLines.length > 0 ? "🕒 <b>SET PRE ORDER AKTIF</b>\n\n" + poLines.join("\n") : "🕒 Belum ada set pre order aktif.") +
              "\n\n<b>Perintah:</b>\n" +
              "<code>/preorder NO ETA</code> — aktifkan PO (ETA opsional)\n" +
              "<code>/preorder NO off</code> — matikan PO\n" +
              "<code>/rilispo NO</code> — kirim file ke semua pembeli PO"
          );
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split(/\s+/);
        const idx = parseInt(parts[0], 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= katalogList.length) {
          await sayAdmin("⚠️ Nomor set tidak valid.");
          return res.status(200).json({ ok: true });
        }
        const item = katalogList[idx];
        const itemId = String(item.id);
        const restArg = arg.slice(parts[0].length).trim();

        if (isRilis) {
          if (!item.preorder) {
            await sayAdmin(`ℹ️ <b>${escapeHtml(item.nama)}</b> tidak sedang mode pre order.`);
            return res.status(200).json({ ok: true });
          }
          const { sent, failed } = await releasePreorders(token, katalogList, idx);
          const left = Number(await redisCommand(["HLEN", REDIS_PO_PREFIX + itemId])) || 0;
          if (left === 0) {
            item.preorder = false;
            delete item.po_eta;
            await saveKatalog(katalogList);
          }
          await sayAdmin(
            `✅ Rilis PO <b>${escapeHtml(item.nama)}</b>: terkirim ${sent}, gagal ${failed}.` +
              (left > 0
                ? `\n⚠️ ${left} pesanan belum terkirim. Jalankan <code>/rilispo ${idx + 1}</code> lagi.`
                : "\n🎉 Set ini sudah tidak mode pre order.")
          );
          return res.status(200).json({ ok: true });
        }

        if (restArg.toLowerCase() === "off") {
          item.preorder = false;
          delete item.po_eta;
          await saveKatalog(katalogList);
          const left = Number(await redisCommand(["HLEN", REDIS_PO_PREFIX + itemId])) || 0;
          await sayAdmin(
            `✅ PO <b>${escapeHtml(item.nama)}</b> dimatikan.` +
              (left > 0 ? `\n⚠️ Masih ada ${left} pesanan PO. Jalankan <code>/rilispo ${idx + 1}</code> untuk mengirim filenya.` : "")
          );
          return res.status(200).json({ ok: true });
        }

        item.preorder = true;
        if (restArg) item.po_eta = restArg;
        else delete item.po_eta;
        await saveKatalog(katalogList);
        await sayAdmin(
          `🕒 <b>${escapeHtml(item.nama)}</b> sekarang PRE ORDER.` +
            (restArg ? `\nPerkiraan rilis: <b>${escapeHtml(restArg)}</b>` : "") +
            `\n\nKirim file ke pembeli saat siap: <code>/rilispo ${idx + 1}</code>`
        );
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/flashsale")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogList = await getKatalog();
        const content = rawText.replace(/^\/flashsale\s*/i, "").trim();
        const parts = content.split("|").map((p) => p.trim());
        const idx = parseInt(parts[0], 10) - 1;

        if (!content) {
          const activeFs = await getFlashSale();
          let helpText =
            "⚡ <b>FLASH SALE</b>\n\n" +
            "Gunakan: <code>/flashsale [nomor_set] | [harga_flash] | [durasi_menit]</code>\n" +
            "<i>Durasi opsional, default 60 menit (1 jam). Lihat nomor set lewat /edit.\n" +
            "Contoh: <code>/flashsale 2 | 1500 | 30</code></i>\n\n" +
            "Hentikan promo yang sedang jalan: <code>/stopflashsale</code>";
          if (activeFs) {
            helpText +=
              `\n\n🔥 <b>Sedang aktif:</b> ${escapeHtml(activeFs.item_nama)}\n` +
              `${formatRupiah(activeFs.original_nominal)} ➜ ${formatRupiah(activeFs.flash_price)} (${getFlashSaleRemainingText(activeFs)})`;
          }
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: helpText, parse_mode: "HTML" });
          return res.status(200).json({ ok: true });
        }

        if (isNaN(idx) || idx < 0 || idx >= katalogList.length || !parts[1]) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format: <code>/flashsale [nomor_set] | [harga_flash] | [durasi_menit]</code>\n" +
              "<i>Lihat nomor set lewat /edit.</i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const item = katalogList[idx];
        const originalNominal = parseNominal(item.harga);
        const flashPrice = Math.round(Number(parts[1].replace(/[^\d]/g, "")) || 0);

        if (flashPrice <= 0 || flashPrice >= originalNominal) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Harga flash sale harus lebih murah dari harga asli (${formatRupiah(originalNominal)}).`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const durasiMenit = parts[2] ? Math.max(1, parseInt(parts[2], 10) || FLASHSALE_DEFAULT_MINUTES) : FLASHSALE_DEFAULT_MINUTES;
        const startTs = Date.now();
        const endTs = startTs + durasiMenit * 60 * 1000;

        await saveFlashSale({
          item_id: String(item.id),
          item_nama: item.nama,
          original_harga: item.harga,
          original_nominal: originalNominal,
          flash_price: flashPrice,
          start_ts: startTs,
          end_ts: endTs,
        });

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `⚡ <b>FLASH SALE DIMULAI!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📦 <b>${escapeHtml(item.nama)}</b>\n` +
            `💰 ${formatRupiah(originalNominal)} ➜ <b>${formatRupiah(flashPrice)}</b>\n` +
            `⏱️ Durasi: <b>${durasiMenit} menit</b> (berakhir ${formatWibClock(endTs)})\n\n` +
            `Mengirim pengumuman ke semua user...`,
          parse_mode: "HTML",
        });

        // Umumkan ke semua user secara otomatis (pakai pola yang sama dengan /broadcast)
        const allUserIds = (await redisCommand(["SMEMBERS", REDIS_USERS_KEY])) || [];
        const bannedIds = new Set(((await redisCommand(["HKEYS", REDIS_BLACKLIST_KEY])) || []).map(String));
        const userIds = allUserIds.filter((uid) => !bannedIds.has(String(uid)));
        const announceText =
          `⚡⚡⚡ <b>FLASH SALE ${durasiMenit} MENIT!</b> ⚡⚡⚡\n\n` +
          `📦 <b>${escapeHtml(item.nama)}</b>\n` +
          `💰 <s>${formatRupiah(originalNominal)}</s> ➜ <b>${formatRupiah(flashPrice)}</b>\n` +
          `⏱️ Buruan sebelum ${formatWibClock(endTs)}, stok harga promo terbatas waktu!`;

        let sentCount = 0;
        const batchSize = 20;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map((uid) =>
              tgRequest(token, "sendMessage", {
                chat_id: uid,
                text: announceText,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[{ text: "⚡ Serbu Sekarang!", callback_data: `detail_${item.id}` }]],
                },
              })
            )
          );
          results.forEach((r) => {
            if (r && r.ok) sentCount++;
          });
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Pengumuman flash sale terkirim!</b>\nTerkirim ke <b>${sentCount}</b> dari <b>${userIds.length}</b> user.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10A3. ADMIN: /stopflashsale — hentikan promo kilat yang sedang berjalan
      if (rawText.startsWith("/stopflashsale")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const activeFs = await getFlashSale();
        await clearFlashSale();
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: activeFs
            ? `🛑 Flash sale <b>${escapeHtml(activeFs.item_nama)}</b> dihentikan.`
            : "ℹ️ Tidak ada flash sale yang sedang aktif.",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10A4. ADMIN: /setpostchannel — set/lihat channel tujuan auto-post set baru
      if (rawText.startsWith("/postsemua")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/postsemua\s*/i, "").trim().toLowerCase();
        const reply = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });

        if (arg === "stop") {
          const st = await getPostAllState();
          if (st) {
            st.active = false;
            await savePostAllState(st);
          }
          await reply("⏹ Posting massal dihentikan.");
          return res.status(200).json({ ok: true });
        }

        if (arg === "status") {
          const st = await getPostAllState();
          if (!st || !st.active) {
            await reply("ℹ️ Tidak ada posting massal yang berjalan.");
          } else {
            await reply(`ℹ️ Posting massal aktif. Sisa antrean: <b>${st.queue.length}</b> set (${POSTALL_QUOTA_LABEL}).`);
          }
          return res.status(200).json({ ok: true });
        }

        const channel = await getPostChannel();
        if (!channel) {
          await reply("⚠️ Atur channel dulu lewat <code>/setpostchannel @username_channel</code>.");
          return res.status(200).json({ ok: true });
        }
        const existing = await getPostAllState();
        if (existing && existing.active) {
          await reply(`⚠️ Posting massal sudah berjalan (sisa ${existing.queue.length} set). Cek dengan <code>/postsemua status</code>.`);
          return res.status(200).json({ ok: true });
        }

        const katalog = await getKatalog();
        const done = new Set((await redisCommand(["HKEYS", REDIS_POSTALL_DONE_KEY])) || []);
        const queue = katalog.filter((k) => k && k.id && !done.has(String(k.id))).map((k) => String(k.id));
        if (queue.length === 0) {
          await reply("✅ Semua set sudah pernah diposting ke channel.");
          return res.status(200).json({ ok: true });
        }

        await savePostAllState({ active: true, queue, day: "", count: 0 });
        await reply(
          `🚀 Posting massal dimulai.\n` +
            `Antrean: <b>${queue.length}</b> set • jatah <b>${POSTALL_QUOTA_LABEL}</b>.\n` +
            `Cek sisa dengan <code>/postsemua status</code>, hentikan dengan <code>/postsemua stop</code>.`
        );
        const first = await runPostAllBatch(token);
        if (first.ran === false && first.reason === "locked") {
          await reply("ℹ️ Batch sedang berjalan, akan lanjut otomatis.");
        }
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/setpostchannel")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setpostchannel\s*/i, "").trim();

        if (!arg) {
          const current = await getPostChannel();
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `📢 <b>Channel Auto-Post Set Baru</b>\n\n` +
              `Saat ini: ${current ? `<code>${escapeHtml(current)}</code>` : "<i>belum diset</i>"}\n\n` +
              `Gunakan: <code>/setpostchannel ID_atau_@username</code>\n` +
              `<i>• Bot harus jadi admin di channel tersebut.\n` +
              `• Set baru lewat /tambah akan otomatis diposting ke sana, isinya cuma preview + tombol ke bot (bukan link file asli).\n` +
              `• Kosongkan lagi dengan <code>/setpostchannel off</code>.</i>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg.toLowerCase() === "off") {
          await setPostChannel("");
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Auto-post ke channel dimatikan." });
          return res.status(200).json({ ok: true });
        }

        await setPostChannel(arg);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Channel auto-post diset ke: <code>${escapeHtml(arg)}</code>\n<i>Pastikan bot sudah jadi admin di channel itu ya.</i>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 10A5. ADMIN: /setcadangan, /cekcadangan, /pengumuman, /hapuspengumuman
      // Tiap set bisa punya link CADANGAN sendiri (mis. move2link) di field item.cadangan.
      // Pengumuman "belum paham cara beli di bot? beli lewat Lumine cadangan" diposting ke CHANNEL UTAMA
      // (channel yang sama dengan auto-post set baru, diatur lewat /setpostchannel).
      const cadNos = (str) => {
        const out = new Set();
        for (const tok of String(str).split(/[\s,]+/).filter(Boolean)) {
          const rg = /^(\d+)-(\d+)$/.exec(tok);
          if (rg) {
            const a = parseInt(rg[1], 10);
            const b = parseInt(rg[2], 10);
            for (let n = Math.min(a, b); n <= Math.max(a, b) && out.size <= 1000; n++) out.add(n);
          } else if (/^\d+$/.test(tok)) out.add(parseInt(tok, 10));
        }
        return [...out].sort((x, y) => x - y);
      };
      const cadUrlOk = (u) => /^https?:\/\/[^\s<>"]+\.[^\s<>"]+$/i.test(u);

      if (rawText.startsWith("/setchcadangan")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const argB = rawText.replace(/^\/setchcadangan\s*/i, "").trim();
        const sendB = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML", disable_web_page_preview: true });
        if (!argB) {
          const cur = await getBackupChannel();
          await sendB(
            `📥 <b>Channel Cadangan (sumber link)</b>\n\nSaat ini: ${cur ? `<code>${escapeHtml(cur)}</code>` : "<i>belum diset</i>"}\n\n` +
              `Atur: <code>/setchcadangan @username_channel</code> (atau ID -100...)\n` +
              `Atau kirim <code>/setchcadangan</code> langsung di channel cadangan.\nMatikan: <code>/setchcadangan off</code>\n\n` +
              `<b>Cara kerja:</b> bot harus jadi admin di channel itu. Tiap postingan baru (atau yang diedit) yang berisi nama set + link otomatis mengisi link cadangan set tersebut, lalu postingan set di channel utama ikut diedit. ` +
              `Postingan lama: teruskan (forward) dari channel cadangan ke bot ini.`
          );
          return res.status(200).json({ ok: true });
        }
        if (argB.toLowerCase() === "off") {
          await redisCommand(["DEL", REDIS_BACKUP_CH_KEY]);
          await sendB("✅ Pembacaan channel cadangan dimatikan.");
          return res.status(200).json({ ok: true });
        }
        await redisCommand(["SET", REDIS_BACKUP_CH_KEY, argB.split(/\s+/)[0]]);
        await sendB(`✅ Channel cadangan diset: <code>${escapeHtml(argB.split(/\s+/)[0])}</code>\n<i>Pastikan bot jadi admin di channel itu.</i>`);
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/setcadangan")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setcadangan\s*/i, "").trim();
        const sendT = (t) =>
          tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML", disable_web_page_preview: true });
        const katalogCad = await getKatalog();

        if (!arg) {
          const cur = await redisCommand(["GET", REDIS_BACKUP_LINK_KEY]);
          const punya = katalogCad.filter((k) => k.cadangan).length;
          await sendT(
            `🛟 <b>Link Cadangan</b>\n\n` +
              `Set yang sudah punya link cadangan: <b>${punya}</b> dari ${katalogCad.length}\n` +
              `Link umum (toko cadangan): ${cur ? `<code>${escapeHtml(String(cur))}</code>` : "<i>belum diset</i>"}\n\n` +
              `<b>Per set (satu-satu):</b>\n<code>/setcadangan 5 https://move2link.com/xxxx</code>\n\n` +
              `<b>Banyak set sekaligus</b> (1 baris = 1 set):\n<code>/setcadangan\n1 https://move2link.com/aaa\n2 https://move2link.com/bbb\n3 https://move2link.com/ccc</code>\n\n` +
              `<b>Beberapa set, link sama:</b> <code>/setcadangan 1-5 https://link</code>\n` +
              `<b>Hapus:</b> <code>/setcadangan hapus 5</code> (atau <code>hapus 1-5</code>)\n` +
              `<b>Link umum:</b> <code>/setcadangan https://link</code> | <code>/setcadangan off</code>\n\n` +
              `Cek: /cekcadangan • Pengumuman: <code>/pengumuman tes 1,2,3</code>`
          );
          return res.status(200).json({ ok: true });
        }
        if (arg.toLowerCase() === "off") {
          await redisCommand(["DEL", REDIS_BACKUP_LINK_KEY]);
          await sendT("✅ Link umum cadangan dihapus (link per set tidak ikut terhapus).");
          return res.status(200).json({ ok: true });
        }
        if (/^hapus(\s|$)/i.test(arg)) {
          const nosDel = cadNos(arg.replace(/^hapus/i, "")).filter((n) => n >= 1 && n <= katalogCad.length);
          if (!nosDel.length) {
            await sendT("Format: <code>/setcadangan hapus 5</code> atau <code>/setcadangan hapus 1-5</code>");
            return res.status(200).json({ ok: true });
          }
          for (const n of nosDel) { delete katalogCad[n - 1].cadangan; delete katalogCad[n - 1].cadangan_extra; }
          await saveKatalog(katalogCad);
          const syncDel = await syncSummaryText(token, nosDel.map((n) => ({ no: n, item: katalogCad[n - 1] })));
          await sendT(`🗑 Link cadangan dihapus dari ${nosDel.length} set.${syncDel}`);
          return res.status(200).json({ ok: true });
        }

        const firstTok = arg.split(/\s+/)[0];
        if (!/^[\d,\-]+$/.test(firstTok)) {
          // bukan nomor -> link umum toko cadangan
          const urlCad = normalizeUrl(firstTok);
          if (!cadUrlOk(urlCad)) {
            await sendT("⚠️ Format salah. Per set: <code>/setcadangan 5 https://link</code> • Link umum: <code>/setcadangan https://link</code>");
            return res.status(200).json({ ok: true });
          }
          await redisCommand(["SET", REDIS_BACKUP_LINK_KEY, urlCad]);
          await sendT(`✅ Link umum cadangan disimpan:\n<code>${escapeHtml(urlCad)}</code>\n\nCek tampilannya: <code>/pengumuman tes</code>`);
          return res.status(200).json({ ok: true });
        }

        // per set: tiap baris "NOMOR LINK" atau "NOMOR | LINK" (NOMOR boleh 1,2,3 atau 1-5)
        let okCount = 0;
        const affected = new Set();
        const bad = [];
        const outOfRange = [];
        for (const rawLine of arg.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          const m = /^([\d,\s\-]+?)\s*[|\s]\s*(\S+)$/.exec(line);
          const urlLine = m ? normalizeUrl(m[2]) : "";
          if (!m || !cadUrlOk(urlLine)) {
            bad.push(line.slice(0, 50));
            continue;
          }
          for (const n of cadNos(m[1])) {
            if (n < 1 || n > katalogCad.length) {
              outOfRange.push(n);
              continue;
            }
            katalogCad[n - 1].cadangan = urlLine;
            affected.add(n);
            okCount++;
          }
        }
        if (okCount > 0) await saveKatalog(katalogCad);
        const syncTxt = okCount > 0 ? await syncSummaryText(token, [...affected].map((n) => ({ no: n, item: katalogCad[n - 1] }))) : "";
        await sendT(
          (okCount > 0 ? `✅ <b>${okCount} set</b> diperbarui link cadangannya.` : "⚠️ Tidak ada baris yang valid.") +
            (outOfRange.length ? `\n⚠️ Nomor tidak ada: ${[...new Set(outOfRange)].slice(0, 15).join(", ")}` : "") +
            (bad.length ? `\n⚠️ Baris dilewati: ${bad.slice(0, 8).map((b) => `<code>${escapeHtml(b)}</code>`).join(", ")}` : "") +
            syncTxt +
            (okCount > 0 ? `\n\nCek: /cekcadangan • /cekpost` : `\n\nFormat tiap baris: <code>NOMOR https://link</code>`)
        );
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/cekcadangan")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogCek = await getKatalog();
        const argC = rawText.replace(/^\/cekcadangan\s*/i, "").trim().toLowerCase();
        const lines = [];
        let punya = 0;
        katalogCek.forEach((k, i) => {
          if (k.cadangan) punya++;
          if (argC === "semua" || (argC === "" && !k.cadangan) || (argC === "ada" && k.cadangan)) {
            lines.push(`${i + 1}. ${k.cadangan ? "✅" : "❌"} ${escapeHtml(k.nama)}${k.cadangan ? ` → ${escapeHtml(k.cadangan)}` : ""}`);
          }
        });
        const head = `🛟 Link cadangan: <b>${punya}</b> dari ${katalogCek.length} set\n(${argC === "" ? "yang BELUM punya" : argC === "ada" ? "yang sudah punya" : "semua set"})\n`;
        let buf = head;
        for (const l of lines) {
          if (buf.length + l.length + 1 > 3800) {
            await tgRequest(token, "sendMessage", { chat_id: chatId, text: buf, parse_mode: "HTML", disable_web_page_preview: true });
            buf = "";
          }
          buf += (buf ? "\n" : "") + l;
        }
        if (!lines.length) buf += "\n<i>Tidak ada.</i>";
        buf += `\n\n<i>/cekcadangan ada • /cekcadangan semua</i>`;
        await tgRequest(token, "sendMessage", { chat_id: chatId, text: buf, parse_mode: "HTML", disable_web_page_preview: true });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/pengumuman")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const sendT = (t) =>
          tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML", disable_web_page_preview: true });
        let argP = rawText.replace(/^\/pengumuman\s*/i, "").trim();
        const pinIt = /(^|\s)--pin(\s|$)/i.test(argP);
        argP = argP.replace(/(^|\s)--pin(?=\s|$)/gi, " ").trim();
        let isTes = false;
        if (/^tes(\s|$)/i.test(argP)) {
          isTes = true;
          argP = argP.replace(/^tes\s*/i, "").trim();
        }

        // Mode per set: /pengumuman 1,2,3 [teks]  atau  /pengumuman semua [teks]
        const katalogPeng = await getKatalog();
        let setNos = [];
        const tokP = argP.split(/\s+/)[0] || "";
        if (/^[\d,\-]+$/.test(tokP)) {
          setNos = cadNos(tokP);
          argP = argP.slice(tokP.length).trim();
        } else if (/^semua$/i.test(tokP)) {
          setNos = katalogPeng.map((k, i) => (k.cadangan ? i + 1 : 0)).filter(Boolean);
          argP = argP.slice(tokP.length).trim();
        }
        const perSet = setNos.length > 0 || /^[\d,\-]+$|^semua$/i.test(tokP);

        const chPeng = isTes ? String(chatId) : await getPostChannel();
        if (!chPeng) {
          await sendT("⚠️ Channel utama belum diset. Atur dulu: <code>/setpostchannel @username_channel</code>");
          return res.status(200).json({ ok: true });
        }
        const botUnamePeng = await getBotUsername(token);
        const photoPeng = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1].file_id : "";
        const extraTxt = argP ? `${escapeHtml(argP)}\n\n` : "";

        // susun daftar pesan (tiap pesan = caption + tombol)
        const posts = [];
        if (perSet) {
          const valid = setNos.filter((n) => n >= 1 && n <= katalogPeng.length);
          const tanpaLink = valid.filter((n) => !katalogPeng[n - 1].cadangan);
          const punya = valid.filter((n) => katalogPeng[n - 1].cadangan);
          if (!punya.length) {
            await sendT(
              "⚠️ Tidak ada set yang punya link cadangan dari nomor itu." +
                (tanpaLink.length ? `\nBelum ada link: ${tanpaLink.slice(0, 20).join(", ")}` : "") +
                "\nAtur dulu: <code>/setcadangan 5 https://link</code>"
            );
            return res.status(200).json({ ok: true });
          }
          const CHUNK = 15;
          const MAXPOST = 5;
          for (let i = 0; i < punya.length && posts.length < MAXPOST; i += CHUNK) {
            const grp = punya.slice(i, i + CHUNK);
            const names = grp.map((n) => `${n}. ${escapeHtml(katalogPeng[n - 1].nama)}`).join("\n");
            const rows = grp.map((n) => [{ text: `🔗 #${n} ${katalogPeng[n - 1].nama}`.slice(0, 60), url: katalogPeng[n - 1].cadangan }]);
            if (botUnamePeng) rows.push([{ text: "🤖 Beli di Bot Utama", url: `https://t.me/${botUnamePeng}` }]);
            posts.push({
              caption:
                `📢 <b>PENGUMUMAN</b>\n\n` +
                `Bingung atau belum tahu cara beli di bot? Set di bawah ini juga bisa dibeli lewat <b>Link Cadangan</b> 👇\n\n` +
                `${names}\n\n${extraTxt}Klik tombol set yang kamu mau.`,
              rows,
            });
          }
          var sisaPeng = Math.max(0, punya.length - posts.length * CHUNK);
          var tanpaLinkPeng = tanpaLink;
        } else {
          const backupLink = await redisCommand(["GET", REDIS_BACKUP_LINK_KEY]);
          if (!backupLink) {
            await sendT(
              "⚠️ Belum ada link cadangan.\n• Per set: <code>/setcadangan 5 https://link</code> lalu <code>/pengumuman 5</code>\n• Atau link umum: <code>/setcadangan https://link</code> lalu <code>/pengumuman</code>"
            );
            return res.status(200).json({ ok: true });
          }
          const rows = [[{ text: "🔗 Beli di Link Cadangan", url: String(backupLink) }]];
          if (botUnamePeng) rows.push([{ text: "🤖 Beli di Bot Utama", url: `https://t.me/${botUnamePeng}` }]);
          posts.push({
            caption:
              `📢 <b>PENGUMUMAN</b>\n\n` +
              `Bingung atau belum tahu cara beli di bot? Tenang, kamu juga bisa beli lewat <b>Link Cadangan</b> 👇\n\n` +
              `${extraTxt}Klik tombol di bawah untuk lanjut belanja.`,
            rows,
          });
        }

        if (photoPeng && posts.some((x) => x.caption.length > 1000)) {
          await sendT("⚠️ Teks terlalu panjang untuk caption foto (maks sekitar 1000 karakter). Kirim tanpa foto, atau kurangi jumlah set/teksnya.");
          return res.status(200).json({ ok: true });
        }

        const sentIds = [];
        let errPeng = "";
        for (let i = 0; i < posts.length; i++) {
          const pst = posts[i];
          const usePhoto = photoPeng && i === 0;
          const r = usePhoto
            ? await tgRequest(token, "sendPhoto", {
                chat_id: chPeng,
                photo: photoPeng,
                caption: pst.caption,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: pst.rows },
              })
            : await tgRequest(token, "sendMessage", {
                chat_id: chPeng,
                text: pst.caption,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard: pst.rows },
              });
          if (!r || !r.ok) {
            errPeng = (r && r.description) || "unknown";
            break;
          }
          if (r.result && r.result.message_id) sentIds.push(r.result.message_id);
          if (i < posts.length - 1) await new Promise((rs) => setTimeout(rs, 1000));
        }
        if (errPeng) {
          await sendT(
            `❌ Gagal ${isTes ? "mengirim contoh" : "posting ke channel"}: ${escapeHtml(errPeng)}\n` +
              (isTes ? "" : "<i>Pastikan bot jadi admin di channel dan <code>/setpostchannel</code> sudah benar.</i>") +
              (sentIds.length ? `\n(${sentIds.length} pesan sempat terkirim, hapus dengan /hapuspengumuman)` : "")
          );
          if (!isTes && sentIds.length) {
            await redisCommand(["SET", REDIS_ANNOUNCE_LAST_KEY, JSON.stringify({ chat_id: chPeng, ids: sentIds, ts: Date.now() })]);
          }
          return res.status(200).json({ ok: true });
        }
        const notes =
          (perSet && tanpaLinkPeng && tanpaLinkPeng.length ? `\n⚠️ Dilewati (belum punya link cadangan): ${tanpaLinkPeng.slice(0, 20).join(", ")}` : "") +
          (perSet && sisaPeng ? `\n⚠️ ${sisaPeng} set belum ikut (maks 5 pesan per perintah). Kirim lagi dengan nomor sisanya.` : "");
        if (isTes) {
          await sendT(`👆 Itu contohnya (${posts.length} pesan). Kalau sudah pas, kirim tanpa kata <code>tes</code> (boleh tambah foto atau <code>--pin</code>).${notes}`);
          return res.status(200).json({ ok: true });
        }
        await redisCommand(["SET", REDIS_ANNOUNCE_LAST_KEY, JSON.stringify({ chat_id: chPeng, ids: sentIds, ts: Date.now() })]);
        let pinNote = "";
        if (pinIt && sentIds.length) {
          const rPin = await tgRequest(token, "pinChatMessage", { chat_id: chPeng, message_id: sentIds[0], disable_notification: true });
          pinNote = rPin && rPin.ok ? " dan pesan pertama di-pin" : " (gagal pin, pastikan bot punya izin pin pesan)";
        }
        await sendT(`✅ Pengumuman terkirim ke channel utama (${posts.length} pesan)${pinNote}.${notes}\nHapus lagi: <code>/hapuspengumuman</code>`);
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/hapuspengumuman")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const sendT = (t) => tgRequest(token, "sendMessage", { chat_id: chatId, text: t, parse_mode: "HTML" });
        let last = null;
        try {
          last = JSON.parse((await redisCommand(["GET", REDIS_ANNOUNCE_LAST_KEY])) || "null");
        } catch (_) {}
        const ids = last ? last.ids || (last.message_id ? [last.message_id] : []) : [];
        if (!last || !ids.length) {
          await sendT("Belum ada pengumuman yang tercatat untuk dihapus.");
          return res.status(200).json({ ok: true });
        }
        let okDel = 0;
        let errDel = "";
        for (const mid of ids) {
          const rDel = await tgRequest(token, "deleteMessage", { chat_id: last.chat_id, message_id: mid });
          if (rDel && rDel.ok) okDel++;
          else errDel = (rDel && rDel.description) || "unknown";
        }
        if (okDel === ids.length) await redisCommand(["DEL", REDIS_ANNOUNCE_LAST_KEY]);
        await sendT(okDel === ids.length ? `🗑 Pengumuman terakhir dihapus dari channel (${okDel} pesan).` : `⚠️ ${okDel}/${ids.length} pesan terhapus. Error: ${escapeHtml(errDel)}`);
        return res.status(200).json({ ok: true });
      }

      // 10A6. ADMIN: /cekpost & /updatepost — edit tombol postingan channel yang sudah ada (tanpa posting ulang)
      if (rawText.startsWith("/cekpost")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const katalogCp = await getKatalog();
        const recs = await getAllPostMsgs();
        const belum = [];
        let tercatat = 0;
        let sudahCad = 0;
        let perluEdit = 0;
        katalogCp.forEach((k, i) => {
          const r = recs[String(k.id)];
          if (r) {
            tercatat++;
            if ((r.cad || "") === cadanganKey(k)) {
              if (k.cadangan) sudahCad++;
            } else perluEdit++;
          } else belum.push(i + 1);
        });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text:
            `📌 <b>Postingan channel yang tercatat</b>\n\n` +
            `Tercatat: <b>${tercatat}</b> dari ${katalogCp.length} set\n` +
            `✅ Link cadangan sudah tertulis di postingan: <b>${sudahCad}</b>\n` +
            `✏️ Perlu diedit (kirim /updatepost): <b>${perluEdit}</b>\n` +
            `📭 Belum tercatat: <b>${belum.length}</b>` +
            (belum.length && belum.length <= 40 ? `\nNomor: ${belum.join(", ")}` : "") +
            `\n\n<i>Postingan baru yang diposting bot otomatis tercatat. Postingan lama: teruskan (forward) dari channel ke bot ini (bisa banyak sekaligus).</i>`,
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/updatepost")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const argU = rawText.replace(/^\/updatepost\s*/i, "").trim();
        const katalogUp = await getKatalog();
        const recsU = await getAllPostMsgs();
        let entries = [];
        if (!argU || /^semua$/i.test(argU)) {
          katalogUp.forEach((k, i) => {
            const r = recsU[String(k.id)];
            if (r && (r.cad || "") !== cadanganKey(k)) entries.push({ no: i + 1, item: k });
          });
        } else {
          entries = cadNos(argU)
            .filter((n) => n >= 1 && n <= katalogUp.length)
            .map((n) => ({ no: n, item: katalogUp[n - 1] }));
        }
        if (!entries.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            parse_mode: "HTML",
            text: "Tidak ada postingan yang perlu diedit. Cek dulu: /cekpost\n<i>Isi link cadangan: /setcadangan • lalu <code>/updatepost</code> atau <code>/updatepost 1,2,3</code></i>",
          });
          return res.status(200).json({ ok: true });
        }
        const syncU = await syncSummaryText(token, entries);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          parse_mode: "HTML",
          text: `✅ Selesai memproses ${entries.length} set.${syncU || "\nTidak ada perubahan."}`,
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

      // PREVIEW MASSAL: foto admin tanpa caption saat sesi aktif
      if (isAdmin && msg.photo && msg.photo.length > 0 && !rawText) {
        if (await handlePreviewMassalPhoto(token, msg)) {
          return res.status(200).json({ ok: true });
        }
      }

      // 12A. SCREENSHOT REFERRAL APLIKASI (hanya saat user sedang di langkah 3)
      if (msg.photo && msg.photo.length > 0) {
        if (await handleApprefPhoto(token, msg, senderId)) {
          return res.status(200).json({ ok: true });
        }
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

        // Deep-link dari tombol auto-post channel: /start buy_ID -> langsung buka detail set itu
        const startBuyMatch = /^\/start\s+buy_([A-Za-z0-9_-]{1,30})$/i.exec(text);
        if (startBuyMatch) {
          await sendItemDetailView(token, chatId, senderId, startBuyMatch[1]);
          return res.status(200).json({ ok: true });
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
              "• <code>/flashsale NO | HARGA | MENIT</code> | <code>/stopflashsale</code> — promo kilat + auto broadcast\n" +
              "• <code>/preorder NO ETA</code> | <code>/preorder NO off</code> | <code>/rilispo NO</code> — pre order\n" +
              "• <code>/addreseller ID NAMA</code> | <code>/delreseller ID</code> | <code>/listreseller</code>\n" +
              "• <code>/omsetreseller ID</code> | <code>/omsettoko</code> | <code>/listrating</code>\n" +
              "• <code>/fiturbot</code> — daftar fitur penting bot\n" +
            "• <code>/error</code> — lihat error terakhir | <code>/error clear</code>\n" +
              "• <code>/omset</code> — omset hari ini, kemarin, dan total | <code>/setomset</code> — tujuan notif omset\n" +
              "• <code>/hargamassal semua|mini|full|harga|creator ... HARGA/%</code> — edit harga banyak set\n" +
              "• <code>/listbot</code> | <code>/matikanbot ID</code> | <code>/aktifkanbot ID</code>\n" +
              "• <code>/setharga_admin ID NO HARGA</code> — kunci harga jual bot reseller (min = harga toko)\n" +
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

          try {
            const firstWelcome = Number(await redisCommand(["HSETNX", REDIS_WELCOMED_KEY, String(senderId), "1"])) === 1;
            if (firstWelcome) await sendWelcomeGuide(token, chatId, senderId);
          } catch (welcomeErr) {
            console.error("Panduan sambutan error:", welcomeErr);
          }

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
        } else if (text === "👆 Tap Challenge" || text === "/tap") {
          await sendTapMenu(token, chatId, senderId);
        } else if (text === "/tapskor") {
          await sendTapSkor(token, chatId, senderId);
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
        } else if (text === "⏳ Cek Jeda" || text === "/cekban") {
          await sendCekJeda(token, chatId, senderId);
        } else if (text === "/promo" || text === "🎁 Promo Saya") {
          await sendPromoStatus(token, chatId, senderId);
        } else if (text === "/undang" || text === "/referral") {
          await sendReferralMenu(token, chatId, senderId);
        } else if (text === "🤝 Reseller" || text === "/reseller") {
          await sendResellerMenu(token, chatId, msg.from);
        } else {
          if (
            /^\/?(list|daftar)(\s+(photopack|photo pack|photopek|set|katalog))?$/.test(lowerText.trim()) ||
            ["list photopack", "daftar photopack", "lihat photopack", "photopack apa aja", "photopack apa saja"].some((k) => lowerText.includes(k))
          ) {
            await sendPhotopackTextList(token, chatId);
            return res.status(200).json({ ok: true });
          }

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
              `• Harga per set : <b>${formatRupiah(RETAIL_PRICE_STANDAR)}</b>\n` +
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
    await Promise.allSettled(pendingErrLogs.splice(0));
    return res.status(200).json({ ok: true });
  }
};
                                
