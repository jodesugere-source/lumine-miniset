// ==========================================
// 1. PENGATURAN UTAMA (BOT UTAMA — FULL FITUR + AUTO-ACC MAKRO + DEPO SALDO)
// ==========================================
const ADMIN_USERNAME = "Fellstore1"; // Tanpa tanda @
const LINK_CH_CADANGAN = "https://t.me/+OGXaaPyrnd5kMmY1";
const LINK_CH_FREE = "https://t.me/+jf3tLqLIG444MjBI";

// ---- PENGATURAN MENU RESELLER (UBAH SESUAI KEBUTUHAN) ----
const RESELLER_PRICE_LITE = 1200; // harga reseller Paket Lite (retail Rp 2.000)
const RESELLER_PRICE_STANDAR = 2000; // harga reseller Paket Standar (retail Rp 3.000)
const RESELLER_MIN_ORDER = 10; // minimal ambil set per order
const DEFAULT_MACRO_SECRET = "lumineacc2026";

const REDIS_KEY = "lumine_main_katalog";
const REDIS_BUNDLE_KEY = "lumine_main_bundle";
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
  await Promise.all([
    redisCommand(["HINCRBY", REDIS_RESELLER_OMSET_KEY, String(userId), Math.round(Number(nominal) || 0)]),
    redisCommand(["HINCRBY", REDIS_RESELLER_OMSET_CNT_KEY, String(userId), 1]),
  ]);
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

async function getBundle() {
  const raw = await redisCommand(["GET", REDIS_BUNDLE_KEY]);
  if (!raw) return { link: "" };
  try {
    return JSON.parse(raw);
  } catch {
    return { link: "" };
  }
}

async function saveBundle(bundleData) {
  await redisCommand(["SET", REDIS_BUNDLE_KEY, JSON.stringify(bundleData)]);
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

async function getMacroConfig() {
  const raw = await redisCommand(["GET", REDIS_MACRO_KEY]);
  if (!raw) {
    return {
      enabled: true,
      secret: process.env.MACRO_SECRET || DEFAULT_MACRO_SECRET,
      host: "",
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      secret: parsed.secret || process.env.MACRO_SECRET || DEFAULT_MACRO_SECRET,
      host: parsed.host || "",
    };
  } catch {
    return {
      enabled: true,
      secret: process.env.MACRO_SECRET || DEFAULT_MACRO_SECRET,
      host: "",
    };
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
  return angka && angka >= 100 ? angka : 2000;
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

  if (!isDeposit && discount === 0 && !voucherCode) {
    const activeVoucher = await getActiveUserVoucher(user.id);
    if (activeVoucher) {
      discount = Math.min(Number(activeVoucher.discount) || 0, Math.max(0, baseNominal - 500));
      if (discount > 0) {
        voucherCode = activeVoucher.code;
        await clearActiveUserVoucher(user.id);
      }
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
        `<i>Saldo siap dipakai untuk checkout instan di Katalog, Bundling 5k, atau Mystery Box!</i>`,
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
  let deliveredLink = order.target_link;
  let soldItemId = order.item_id || "";
  let buyerText = "";

  if (order.is_mystery) {
    const bundle = await getBundle();
    const pool = katalogList.map((k) => ({ id: String(k.id), nama: k.nama, link: k.link }));
    if (bundle.link && bundle.link.trim() !== "") {
      pool.push({ id: "", nama: "🌟 JACKPOT: Promo Bundling 2 Photopack", link: bundle.link });
    }
    const won =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : { id: "", nama: "Paket Spesial Lumine", link: `https://t.me/${ADMIN_USERNAME}` };

    soldItemId = won.id;
    deliveredName = won.nama;
    deliveredLink = normalizeUrl(won.link);

    buyerText =
      `🎲 <b>MYSTERY BOX TERBUKA! (Pesanan #${order.id})</b> 🎲\n\n` +
      `Selamat! Kamu mendapatkan hadiah:\n` +
      `🎁 <b>${escapeHtml(deliveredName)}</b>\n\n` +
      `Berikut link akses hadiah kamu:\n` +
      `🔗 ${escapeHtml(deliveredLink)}\n\n` +
      `<i>Hadiah tersimpan di 🎒 Koleksi Saya & poin masuk ke Leaderboard!</i>`;
  } else {
    deliveredLink = normalizeUrl(order.target_link);
    buyerText =
      `🎉 <b>PEMBAYARAN DI-ACC! (Pesanan #${order.id})</b>\n\n` +
      `Terima kasih telah membeli <b>${escapeHtml(deliveredName)}</b>!\n` +
      `Berikut link akses file kamu:\n` +
      `🔗 ${escapeHtml(deliveredLink)}\n\n` +
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
    addKoleksi(order.buyer_id, deliveredName, deliveredLink),
    addStoreOmset(order.total_nominal),
  ];
  if (buyerIsReseller) {
    omsetTasks.push(addResellerOmset(order.buyer_id, order.total_nominal));
  }
  await Promise.all(omsetTasks);

  const updatedAllCnt = await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(order.buyer_id)]);
  await sendTestimonialToChannel(token, order, deliveredName, updatedAllCnt);

  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    text: buyerText,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📂 Buka Link File Sekarang", url: deliveredLink }],
        [{ text: "⭐ Beri Rating & Ulasan", callback_data: `rate_init_${order.id}` }],
        [
          { text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" },
          { text: "🏆 Leaderboard", callback_data: "menu_lb" },
        ],
      ],
    },
  });

  return { deliveredName, deliveredLink };
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
      [{ text: "🛍️ Katalog" }, { text: "🔥 Bestseller" }],
      [{ text: "🎲 Mystery Box" }, { text: "🎁 Promo 5k" }],
      [{ text: "💰 Saldo & Depo" }, { text: "🎒 Koleksi Saya" }],
      [{ text: "🏆 Leaderboard" }, { text: "💎 Info & Channel" }],
      [{ text: "🤝 Reseller" }],
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
          { text: "➕ Rp 15.000", callback_data: "depo_15000" },
          { text: "➕ Rp 20.000", callback_data: "depo_20000" },
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
    "╭─── 💰 <b>DAFTAR HARGA</b> ───\n" +
    "│ • <b>Paket Lite</b> (5–7 Foto) : <code>Rp 2.000</code>\n" +
    "│ • <b>Paket Standar</b> (8–10 Foto) : <code>Rp 3.000</code>\n" +
    "│ • 🎁 <b>Bundling 2 Set</b> : <code>Rp 5.000</code>\n" +
    `│ • 🎲 <b>Mystery Box Gacha</b> : <code>${formatRupiah(mysteryCfg.price || 3000)}</code>\n` +
    "╰────────────────────\n\n" +
    "💳 Bisa <b>Deposit Saldo (Auto-ACC)</b> untuk checkout 1x klik tanpa kode unik!\n" +
    "🎟️ Punya kode voucher? Ketik <code>/voucher KODE</code> sebelum checkout!\n\n" +
    "Silakan pilih menu di bawah ini 👇";

  const inlineMarkup = {
    inline_keyboard: [
      [
        { text: "🛍️ Katalog Photopack", callback_data: "menu_katalog" },
        { text: "🔥 Bestseller", callback_data: "menu_bestseller" },
      ],
      [
        { text: "🎲 Mystery Box", callback_data: "menu_mystery" },
        { text: "🎁 Promo Bundling 5k", callback_data: "menu_promo" },
      ],
      [
        { text: "💰 Saldo & Deposit", callback_data: "menu_saldo" },
        { text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" },
      ],
      [
        { text: "🏆 Leaderboard", callback_data: "menu_lb" },
        { text: "🎟️ Pakai Voucher", callback_data: "menu_voucher" },
      ],
      [
        { text: "💎 Upgrade CH Utama", callback_data: "menu_upgrade" },
        { text: "📋 Cara Order", callback_data: "menu_cara" },
      ],
      [
        { text: "🤝 Menu Reseller", callback_data: "menu_reseller" },
        { text: "🔗 Channel Lainnya", callback_data: "menu_channel" },
      ],
      [{ text: `💬 Admin (@${ADMIN_USERNAME})`, url: `https://t.me/${ADMIN_USERNAME}` }],
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

  const rankMap = getRankedKatalog(katalogList);
  const rows = katalogList.map((item) => {
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
    { text: "🔥 Lihat Top Bestseller", callback_data: "menu_bestseller" },
    { text: "🔙 Menu Utama", callback_data: "menu_home" },
  ]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "╭─── 🛍️ <b>KATALOG PHOTOPACK</b> ───\n" +
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
  const bundle = await getBundle();

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

  let prizePreview = `• Salah satu dari <b>${katalogList.length} Koleksi Photopack</b> (nilai s/d Rp 3.000)\n`;
  if (bundle.link && bundle.link.trim() !== "") {
    prizePreview += "• 🌟 <b>GRAND JACKPOT:</b> Promo Bundling 2 Photopack (nilai Rp 5.000)!\n";
  }

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
    buttons.push([
      {
        text: `📂 Buka: ${item.nama.slice(0, 28)}`,
        url: normalizeUrl(item.link),
      },
    ]);
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

async function sendPromoBundling(token, chatId, replyToMessageId = null) {
  const bundle = await getBundle();
  const promoText =
    "🎁 <b>PROMO BUNDLING HEMAT — 2 PHOTOPACK</b>\n\n" +
    "╭─── 💸 <b>RINCIAN PROMO</b> ───\n" +
    "│ • Harga Normal : <s>Rp 6.000</s>\n" +
    "│ • Harga Promo  : <b>Rp 5.000</b> <i>(Hemat Rp 1.000!)</i>\n" +
    "╰────────────────────\n\n" +
    "📌 <b>Cara Klaim Promo:</b>\n" +
    "1. Cek judul 2 set yang kamu mau di <b>Katalog Photopack</b>.\n" +
    "2. Klik tombol <b>Beli Promo</b> di bawah untuk bayar via Saldo atau QRIS.\n" +
    "3. Setelah pembayaran terverifikasi, link akses langsung dikirim otomatis!";

  const buttons = [];
  if (bundle.link && bundle.link.trim() !== "") {
    buttons.push([
      {
        text: "⚡ Beli Promo 2 Photopack (Rp 5.000)",
        callback_data: "buy_bundle",
      },
    ]);
  }
  buttons.push([
    { text: `💬 Tanya Admin (@${ADMIN_USERNAME})`, url: `https://t.me/${ADMIN_USERNAME}` },
  ]);
  buttons.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  const payload = {
    chat_id: chatId,
    text: promoText,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  };
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
  await tgRequest(token, "sendMessage", payload);
}

async function sendResellerMenu(token, chatId, user) {
  const userId = (user && user.id) || "-";
  const uname = user && user.username ? `@${user.username}` : "(tanpa username)";
  const prefill = encodeURIComponent(
    `Halo admin, saya mau daftar Reseller Photopack.\nID Telegram: ${userId}\nUsername: ${uname}`
  );

  const statusReseller = await isReseller(userId);
  const statusLine = statusReseller
    ? "✅ <b>Status Kamu: Reseller Aktif</b>\n\n"
    : "";

  const keyboardRows = [];
  if (statusReseller) {
    keyboardRows.push([{ text: "📊 Cek Omset Saya", callback_data: "reseller_omset_self" }]);
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
      "╭─── 💰 <b>HARGA RESELLER</b> ───\n" +
      `│ • <b>Paket Lite</b> (5–7 Foto) : <code>${formatRupiah(RESELLER_PRICE_LITE)}</code>\n` +
      `│ • <b>Paket Standar</b> (8–10 Foto) : <code>${formatRupiah(RESELLER_PRICE_STANDAR)}</code>\n` +
      `│ • Minimal ambil : <b>${RESELLER_MIN_ORDER} set</b> per order\n` +
      "╰────────────────────\n\n" +
      "╭─── 🌟 <b>KEUNTUNGAN</b> ───\n" +
      "│ ✅ Harga lebih murah dari harga retail\n" +
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

async function sendUpgradeCh(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      "💎 <b>UPGRADE KE FULL SET (CHANNEL UTAMA)</b>\n\n" +
      "╭─── 🌟 <b>KEUNTUNGAN VIP</b> ───\n" +
      "│ ✅ Full Set lengkap (<b>20 – 40+ foto HD</b>)\n" +
      "│ ✅ <b>Bonus Video</b> eksklusif\n" +
      "│ ✅ Harga mulai <b>Rp 5.000 – Rp 10.000</b>\n" +
      "╰─────────────────────\n\n" +
      "Klik tombol di bawah untuk chat admin langsung 👇",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "💬 Chat Admin untuk Join CH Utama", url: `https://t.me/${ADMIN_USERNAME}` }],
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
      isMystery: true,
    };
  }

  if (targetKey === "bundle") {
    const bundle = await getBundle();
    if (!bundle.link) {
      return {
        ok: false,
        error: `⚠️ Link promo bundling belum diatur. Silakan hubungi @${ADMIN_USERNAME}.`,
      };
    }
    return {
      ok: true,
      itemId: "",
      itemNama: "Promo Bundling 2 Photopack",
      baseNominal: 5000,
      targetLink: bundle.link,
      isMystery: false,
    };
  }

  const katalogList = await getKatalog();
  const item = katalogList.find((k) => String(k.id) === String(targetKey));
  if (!item) {
    return { ok: false, error: "⚠️ Paket tidak ditemukan atau sudah dihapus." };
  }
  return {
    ok: true,
    itemId: String(item.id),
    itemNama: item.nama,
    baseNominal: parseNominal(item.harga),
    targetLink: item.link,
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
    target.itemId
  );

  const discountLine =
    order.discount > 0
      ? `🎟️ <b>Voucher (${escapeHtml(order.voucher_code)}):</b> -${formatRupiah(order.discount)}\n`
      : "";

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

      const incomingSecret = String((req.query && req.query.secret) || bodyObj.secret || "").trim();
      if (!incomingSecret || incomingSecret !== macroCfg.secret) {
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

      const { deliveredName } = await processAccOrder(token, matchedOrder);

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

  if (req.method === "GET") {
    if (req.query.setup === "true") {
      const webhookUrl = `https://${req.headers.host}/api/webhook`;
      const result = await tgRequest(token, "setWebhook", { url: webhookUrl });
      const macroCfg = await getMacroConfig();
      macroCfg.host = req.headers.host;
      await saveMacroConfig(macroCfg);

      return res.status(200).json({
        status: "Webhook Bot Utama berhasil diatur",
        webhook_url: webhookUrl,
        macro_autoacc_url: `https://${req.headers.host}/api/webhook?autoacc=1&secret=${macroCfg.secret}&text={not_text}`,
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
      const isCallerAdmin =
        callerUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase();

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
      } else if (data === "menu_bestseller") {
        await sendBestsellerMenu(token, chatId);
      } else if (data === "menu_mystery") {
        await sendMysteryMenu(token, chatId);
      } else if (data === "menu_koleksi") {
        await sendKoleksiMenu(token, chatId, callerId);
      } else if (data === "menu_promo") {
        await sendPromoBundling(token, chatId);
      } else if (data === "menu_cara") {
        await sendCaraOrder(token, chatId);
      } else if (data === "menu_upgrade") {
        await sendUpgradeCh(token, chatId);
      } else if (data === "menu_channel") {
        await sendChannelLainnya(token, chatId);
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

        let discount = 0;
        let voucherCode = "";
        const activeVoucher = await getActiveUserVoucher(callerId);
        if (activeVoucher) {
          discount = Math.min(
            Number(activeVoucher.discount) || 0,
            Math.max(0, target.baseNominal - 500)
          );
          if (discount > 0) {
            voucherCode = activeVoucher.code;
          }
        }

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
          await clearActiveUserVoucher(callerId);
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

        const [saldo, activeV] = await Promise.all([
          getUserSaldo(callerId),
          getActiveUserVoucher(callerId),
        ]);
        const discount = activeV
          ? Math.min(Number(activeV.discount) || 0, Math.max(0, target.baseNominal - 500))
          : 0;
        const effectivePrice = Math.max(500, target.baseNominal - discount);

        if (saldo >= effectivePrice) {
          const sisaSaldo = saldo - effectivePrice;
          const voucherLine =
            discount > 0
              ? `🎟️ <b>Voucher (${escapeHtml(activeV.code)}):</b> -${formatRupiah(discount)}\n`
              : "";

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

        const { deliveredName } = await processAccOrder(token, order);
        const adminExtraNote = order.is_deposit
          ? `\n💳 <b>Saldo Masuk:</b> +${formatRupiah(order.base_nominal)}`
          : order.is_mystery
          ? `\n🎲 <b>Hadiah Gacha Didapat:</b> ${escapeHtml(deliveredName)}`
          : "";
        const adminFooter = order.is_deposit
          ? "💳 <i>Saldo otomatis ditambahkan ke akun pembeli!</i>"
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

        await tgRequest(token, "sendMessage", {
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
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "📊 <b>OMSET RESELLER KAMU</b>\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `💰 <b>Total Omset:</b> <code>${formatRupiah(omset.rupiah)}</code>\n` +
              `🧾 <b>Total Transaksi:</b> <b>${omset.count}x</b>`,
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
      const isAdmin =
        senderUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase();

      if (msg.chat && msg.chat.type === "private") {
        await redisCommand(["SADD", REDIS_USERS_KEY, String(chatId)]);
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
            `  💰 Omset: <code>${formatRupiah(omset.rupiah)}</code> • 🧾 ${omset.count}x transaksi\n`;
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
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `📊 <b>OMSET RESELLER</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 <b>${escapeHtml(info.nama || "Reseller")}</b> (<code>${escapeHtml(targetUid)}</code>)\n` +
            `💰 <b>Total Omset:</b> <code>${formatRupiah(omset.rupiah)}</code>\n` +
            `🧾 <b>Total Transaksi:</b> <b>${omset.count}x</b>`,
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
          macroCfg.secret = arg;
          macroCfg.enabled = true;
          await saveMacroConfig(macroCfg);
        }

        const macroUrl = `https://${host}/api/webhook?autoacc=1&secret=${macroCfg.secret}&text={not_text}`;
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "⚡ <b>PENGATURAN AUTO-ACC MAKRO (MACRODROID)</b>\n\n" +
            `• Status: ${macroCfg.enabled ? "✅ <b>AKTIF</b>" : "❌ <b>NONAKTIF</b>"}\n` +
            `• Secret Key: <code>${escapeHtml(macroCfg.secret)}</code>\n\n` +
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

      // 9. ADMIN: /tambah
      if (rawText.startsWith("/tambah")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const content = rawText.replace(/^\/tambah\s*/i, "").trim();
        const parts = content.split("|").map((p) => p.trim());

        if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts[3]) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format kurang lengkap! Kirim foto preview dengan caption:\n" +
              "<code>/tambah Nama Set | Isi | Harga | Link File Rahasia</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        let photoId = "";
        if (msg.photo && msg.photo.length > 0) {
          photoId = msg.photo[msg.photo.length - 1].file_id;
        }

        const katalogList = await getKatalog();
        const newItem = {
          id: Date.now().toString(),
          nama: parts[0],
          isi: parts[1],
          harga: parts[2],
          link: normalizeUrl(parts[3]),
          photo_id: photoId,
          sold: 0,
        };

        katalogList.push(newItem);
        await saveKatalog(katalogList);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Berhasil ditambahkan ke Katalog!</b>\n` +
            `• <b>Nama:</b> ${escapeHtml(newItem.nama)}\n` +
            `• <b>Isi:</b> ${escapeHtml(newItem.isi)}\n` +
            `• <b>Harga:</b> ${escapeHtml(newItem.harga)}\n` +
            `• <b>Link Rahasia:</b> ${escapeHtml(newItem.link)}`,
          parse_mode: "HTML",
        });
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
            listText += `${idx + 1}. <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})\n`;
          });
          listText += "\nGunakan: <code>/edit [nomor] | Nama | Isi | Harga | Link</code>";
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
          if (parts[4]) targetItem.link = normalizeUrl(parts[4]);
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

      // 12. ADMIN: /setbundle
      if (rawText.startsWith("/setbundle")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setbundle\s*/i, "").trim();
        const currentBundle = await getBundle();

        if (!arg) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🎁 <b>LINK FILE PROMO BUNDLING 5K</b>\n" +
              `Saat ini: ${currentBundle.link ? escapeHtml(currentBundle.link) : "<i>Belum dipasang</i>"}\n` +
              "Pasang: <code>/setbundle https://link-file.com</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg.toLowerCase() === "hapuslink") {
          await saveBundle({ link: "" });
          await tgRequest(token, "sendMessage", { chat_id: chatId, text: "✅ Link bundling dihapus." });
          return res.status(200).json({ ok: true });
        }

        const cleanLink = normalizeUrl(arg);
        await saveBundle({ link: cleanLink });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ <b>Link Bundling 5k disimpan!</b>\n🔗 ${escapeHtml(cleanLink)}`,
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
              "• <code>/tambah Nama | Isi | Harga | Link</code> | <code>/edit [nomor]</code>",
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

        if (text === "/start") {
          const buyerName = escapeHtml((msg.from && msg.from.first_name) || "Kak");
          let headerText = `👋 Halo <b>${buyerName}</b>! Selamat datang di <b>Lumine Photopack Store</b>.`;

          if (isAdmin) {
            headerText +=
              "\n\n🛠️ <b>Panel Admin Lengkap (Bot Utama):</b>\n" +
              "• <code>/setmacro</code> — Link & Setting Auto-ACC Makro\n" +
              "• <code>/addsaldo ID NOMINAL</code> | <code>/ceksaldo ID</code> — Kelola Saldo\n" +
              "• <code>/setbanner</code> | <code>/setqris</code> | <code>/settesti</code> | <code>/broadcast</code>\n" +
              "• <code>/buatvoucher KODE | DISKON | KUOTA</code>\n" +
              "• <code>/setmystery HARGA</code> | <code>/setsold</code> | <code>/resetlb</code>\n" +
              "• <code>/tambah</code> | <code>/edit</code> | <code>/hapus</code> | <code>/setbundle</code>\n" +
              "• <code>/addreseller ID NAMA</code> | <code>/delreseller ID</code> | <code>/listreseller</code>\n" +
              "• <code>/omsetreseller ID</code> | <code>/omsettoko</code> | <code>/listrating</code>";
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
        } else if (text === "🎲 Mystery Box") {
          await sendMysteryMenu(token, chatId);
        } else if (text === "🎁 Promo 5k" || text === "🎁 Promo Bundling 5k") {
          await sendPromoBundling(token, chatId);
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
        } else if (text === "💎 Info & Channel") {
          await sendUpgradeCh(token, chatId);
          await sendChannelLainnya(token, chatId);
        } else if (text === "🤝 Reseller" || text === "/reseller") {
          await sendResellerMenu(token, chatId, msg.from);
        } else {
          if (["saldo", "depo", "deposit", "topup", "top up"].some((k) => lowerText.includes(k))) {
            await sendSaldoMenu(token, chatId, senderId);
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

          if (["bundling", "bundle", "promo", "diskon", "2 set"].some((k) => lowerText.includes(k))) {
            await sendPromoBundling(token, chatId, msg.message_id);
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
            replyText =
              "💰 <b>Info Harga Lumine Photopack:</b>\n" +
              "• Paket Lite (5–7 Foto HD) : <b>Rp 2.000</b>\n" +
              "• Paket Standar (8–10 Foto HD) : <b>Rp 3.000</b>\n" +
              "• 🎁 <b>Promo Bundling 2 Photopack : Rp 5.000</b>\n" +
              "• 🎲 <b>Mystery Box Gacha : Rp 3.000</b>";
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
                                
