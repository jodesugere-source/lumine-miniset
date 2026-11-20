// ==========================================
// 1. PENGATURAN UTAMA (BOT UTAMA — FULL FITUR + AUTO-ACC MAKRO + DEPO SALDO + RESELLER & DROPSHIP ANTI-CURANG)
// ==========================================
const ADMIN_USERNAME = "Fellstore1"; // Tanpa tanda @
const LINK_CH_CADANGAN = "https://t.me/+OGXaaPyrnd5kMmY1";
const LINK_CH_FREE = "https://t.me/+jf3tLqLIG444MjBI";
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

// KEY SISTEM RESELLER & DROPSHIP
const REDIS_RESELLER_CFG_KEY = "lumine_main_reseller_cfg";
const REDIS_RESELLERS_KEY = "lumine_main_resellers";
const REDIS_RESELLER_CODE_MAP_KEY = "lumine_main_reseller_codes";
const REDIS_USER_DROPSHIP_PREFIX = "lumine_main_ds_ref_";
const REDIS_RESELLER_DAILY_PREFIX = "lumine_main_rs_daily_";

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

// ==========================================
// 2B. FUNGSI DATABASE RESELLER & DROPSHIP (ANTI-CURANG)
// ==========================================
async function getResellerConfig() {
  const defaults = {
    enabled: true,
    reg_fee: 15000, // Biaya aktivasi lisensi reseller (anti akun tuyul/beli murah 1x)
    reseller_discount_pct: 30, // Diskon kulakan khusus saldo reseller (%)
    dropship_comm_pct: 25, // Komisi dropship otomatis ke saldo reseller (%)
    min_saldo_kulakan: 5000, // Minimal saldo tersedia agar harga reseller aktif
    max_same_item_daily: 2, // Batas maksimal beli judul sama per hari
  };
  const raw = await redisCommand(["GET", REDIS_RESELLER_CFG_KEY]);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      reg_fee: parsed.reg_fee !== undefined ? Number(parsed.reg_fee) : defaults.reg_fee,
      reseller_discount_pct:
        parsed.reseller_discount_pct !== undefined
          ? Number(parsed.reseller_discount_pct)
          : defaults.reseller_discount_pct,
      dropship_comm_pct:
        parsed.dropship_comm_pct !== undefined
          ? Number(parsed.dropship_comm_pct)
          : defaults.dropship_comm_pct,
      min_saldo_kulakan:
        parsed.min_saldo_kulakan !== undefined
          ? Number(parsed.min_saldo_kulakan)
          : defaults.min_saldo_kulakan,
      max_same_item_daily:
        parsed.max_same_item_daily !== undefined
          ? Number(parsed.max_same_item_daily)
          : defaults.max_same_item_daily,
    };
  } catch {
    return defaults;
  }
}

async function saveResellerConfig(cfg) {
  await redisCommand(["SET", REDIS_RESELLER_CFG_KEY, JSON.stringify(cfg)]);
}

function generateDropshipCode(userId) {
  const base = Number(userId).toString(36).toUpperCase().slice(-4);
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return `DS-${base}${rand}`.slice(0, 10);
}

async function getReseller(userId) {
  const raw = await redisCommand(["HGET", REDIS_RESELLERS_KEY, String(userId)]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.active ? parsed : null;
  } catch {
    return null;
  }
}

async function getResellerRaw(userId) {
  const raw = await redisCommand(["HGET", REDIS_RESELLERS_KEY, String(userId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveReseller(resellerObj) {
  await redisCommand([
    "HSET",
    REDIS_RESELLERS_KEY,
    String(resellerObj.user_id),
    JSON.stringify(resellerObj),
  ]);
  if (resellerObj.code) {
    if (resellerObj.active) {
      await redisCommand([
        "HSET",
        REDIS_RESELLER_CODE_MAP_KEY,
        String(resellerObj.code).toUpperCase(),
        String(resellerObj.user_id),
      ]);
    } else {
      await redisCommand([
        "HDEL",
        REDIS_RESELLER_CODE_MAP_KEY,
        String(resellerObj.code).toUpperCase(),
      ]);
    }
  }
}

async function registerOrActivateReseller(userObj, customStoreName = "") {
  const uid = String(userObj.id);
  const existing = await getResellerRaw(uid);
  const fullName =
    [userObj.first_name, userObj.last_name].filter(Boolean).join(" ") ||
    (existing && existing.name) ||
    "Reseller Lumine";
  const username = userObj.username
    ? `@${String(userObj.username).replace(/^@/, "")}`
    : (existing && existing.username) || "Tanpa Username";

  let code = existing && existing.code ? existing.code : generateDropshipCode(uid);
  const ownerOfCode = await redisCommand(["HGET", REDIS_RESELLER_CODE_MAP_KEY, code]);
  if (ownerOfCode && String(ownerOfCode) !== uid) {
    code = generateDropshipCode(uid + String(Date.now()).slice(-3));
  }

  const storeName =
    customStoreName.trim() ||
    (existing && existing.store_name) ||
    `${fullName} Store`;

  const resellerData = {
    user_id: uid,
    name: fullName,
    username,
    store_name: storeName,
    code,
    joined_at: (existing && existing.joined_at) || getWibTimestamp(),
    total_sales: (existing && Number(existing.total_sales)) || 0,
    total_commission: (existing && Number(existing.total_commission)) || 0,
    total_kulakan: (existing && Number(existing.total_kulakan)) || 0,
    active: true,
  };

  await saveReseller(resellerData);
  return resellerData;
}
async function getResellerByDropshipCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  const uid = await redisCommand(["HGET", REDIS_RESELLER_CODE_MAP_KEY, clean]);
  if (!uid) return null;
  return getReseller(uid);
}

async function getAllResellers() {
  const rawMap = await redisCommand(["HGETALL", REDIS_RESELLERS_KEY]);
  if (!Array.isArray(rawMap) || rawMap.length === 0) return [];
  const list = [];
  for (let i = 0; i < rawMap.length; i += 2) {
    try {
      const item = JSON.parse(rawMap[i + 1]);
      if (item && item.active) list.push(item);
    } catch {
      // skip invalid
    }
  }
  return list;
}

async function setBuyerDropshipRef(buyerId, resellerId) {
  await redisCommand([
    "SET",
    `${REDIS_USER_DROPSHIP_PREFIX}${buyerId}`,
    String(resellerId),
    "EX",
    "86400",
  ]);
}

async function getBuyerDropshipReseller(buyerId) {
  const resellerId = await redisCommand(["GET", `${REDIS_USER_DROPSHIP_PREFIX}${buyerId}`]);
  if (!resellerId) return null;
  // ANTI-CURANG: Blokir self-referral (reseller pakai kode dropship sendiri)
  if (String(resellerId) === String(buyerId)) return null;
  return getReseller(resellerId);
}

async function getResellerDailyItemCount(resellerId, itemId) {
  if (!itemId) return 0;
  const { dayKey } = getWibPeriods();
  const key = `${REDIS_RESELLER_DAILY_PREFIX}${dayKey}`;
  const raw = await redisCommand(["HGET", key, `${resellerId}_${itemId}`]);
  return parseInt(raw, 10) || 0;
}

async function incResellerDailyItemCount(resellerId, itemId) {
  if (!itemId) return;
  const { dayKey } = getWibPeriods();
  const key = `${REDIS_RESELLER_DAILY_PREFIX}${dayKey}`;
  await redisCommand(["HINCRBY", key, `${resellerId}_${itemId}`, 1]);
  await redisCommand(["EXPIRE", key, "172800"]);
}

async function evaluateBuyerPricing(userId, target, payMethod = "saldo") {
  const baseNominal = Number(target.baseNominal) || 2000;
  const [resellerCfg, reseller, userSaldo, activeVoucher] = await Promise.all([
    getResellerConfig(),
    getReseller(userId),
    getUserSaldo(userId),
    getActiveUserVoucher(userId),
  ]);

  const isEligibleKatalog = !target.isMystery && target.targetKey !== "bundle" && Boolean(target.itemId);

  // CEK HARGA RESELLER (ANTI-CURANG: Wajib Reseller Aktif + Bayar Pakai Saldo + Min Saldo Mengendap + Limit Harian)
  if (resellerCfg.enabled && reseller && isEligibleKatalog && payMethod === "saldo") {
    const dailyUsed = await getResellerDailyItemCount(userId, target.itemId);
    if (dailyUsed >= resellerCfg.max_same_item_daily) {
      return {
        finalPrice: baseNominal,
        discount: 0,
        voucherCode: "",
        isResellerPrice: false,
        resellerNote: `⚠️ Limit kulakan harian item ini (${resellerCfg.max_same_item_daily}x/hari) tercapai — harga normal berlaku.`,
      };
    }

    if (userSaldo < resellerCfg.min_saldo_kulakan) {
      return {
        finalPrice: baseNominal,
        discount: 0,
        voucherCode: "",
        isResellerPrice: false,
        resellerNote: `⚠️ Saldo min. ${formatRupiah(resellerCfg.min_saldo_kulakan)} wajib tersedia untuk harga reseller.`,
      };
    }

    const rawDiscount = Math.floor((baseNominal * resellerCfg.reseller_discount_pct) / 100);
    const finalPrice = Math.max(1000, baseNominal - rawDiscount);
    const actualDiscount = Math.max(0, baseNominal - finalPrice);

    return {
      finalPrice,
      discount: actualDiscount,
      voucherCode: "",
      isResellerPrice: true,
      resellerDiscountPct: resellerCfg.reseller_discount_pct,
      resellerNote: `🤝 Harga Kulakan Reseller (-${resellerCfg.reseller_discount_pct}%)`,
    };
  }

  // HARGA REGULER + VOUCHER ECERAN (Tidak digabung dengan diskon reseller)
  let discount = 0;
  let voucherCode = "";
  if (activeVoucher) {
    discount = Math.min(Number(activeVoucher.discount) || 0, Math.max(0, baseNominal - 500));
    if (discount > 0) {
      voucherCode = activeVoucher.code;
    }
  }

  return {
    finalPrice: Math.max(500, baseNominal - discount),
    discount,
    voucherCode,
    isResellerPrice: false,
    resellerNote: "",
  };
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
  const isResellerReg = Boolean(extraFields && extraFields.is_reseller_reg);
  const skipUnique = Boolean(extraFields && extraFields.skip_unique);
  const kodeUnik = skipUnique ? 0 : ((orderId - 1) % 299) + 1;

  let discount = Number(extraFields && extraFields.preset_discount) || 0;
  let voucherCode = (extraFields && extraFields.preset_voucher_code) || "";
  const isResellerPrice = Boolean(extraFields && extraFields.is_reseller_price);

  if (!isDeposit && !isResellerReg && !isResellerPrice && discount === 0 && !voucherCode) {
    const activeVoucher = await getActiveUserVoucher(user.id);
    if (activeVoucher) {
      discount = Math.min(Number(activeVoucher.discount) || 0, Math.max(0, baseNominal - 500));
      if (discount > 0) {
        voucherCode = activeVoucher.code;
        await clearActiveUserVoucher(user.id);
      }
    }
  }

  // Cek rujukan dropship aktif (hanya untuk pembelian reguler non-reseller-kulakan)
  let dropshipResellerId = "";
  let dropshipStoreName = "";
  let dropshipCode = "";
  if (!isDeposit && !isResellerReg && !isResellerPrice) {
    const dsReseller = await getBuyerDropshipReseller(user.id);
    if (dsReseller && String(dsReseller.user_id) !== String(user.id)) {
      dropshipResellerId = String(dsReseller.user_id);
      dropshipStoreName = dsReseller.store_name || dsReseller.name;
      dropshipCode = dsReseller.code;
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
    buyer_first_name: user.first_name || "",
    buyer_last_name: user.last_name || "",
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
    is_reseller_reg: isResellerReg,
    is_reseller_price: isResellerPrice,
    dropship_reseller_id: dropshipResellerId,
    dropship_store_name: dropshipStoreName,
    dropship_code: dropshipCode,
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
  const partnerLine = order.dropship_store_name
    ? `\n🏪 <b>Partner :</b> ${escapeHtml(order.dropship_store_name)} (Dropship)`
    : order.is_reseller_price
    ? `\n🤝 <b>Tipe    :</b> Kulakan Reseller Resmi`
    : "";

  const testiText =
    `🧾 <b>TESTIMONI PEMBELIAN #${order.id}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Pembeli :</b> ${escapeHtml(order.buyer_name)} (${escapeHtml(maskedUser)})\n` +
    `🏅 <b>Status  :</b> ${tier}${partnerLine}\n` +
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

  // 1. KHUSUS ORDER AKTIVASI RESELLER (AUTO-ACC)
  if (order.is_reseller_reg) {
    const newReseller = await registerOrActivateReseller(
      {
        id: order.buyer_id,
        first_name: order.buyer_first_name || order.buyer_name,
        last_name: order.buyer_last_name || "",
        username: String(order.buyer_username || "").replace(/^@/, ""),
      },
      order.custom_store_name || ""
    );

    const me = await tgRequest(token, "getMe", {});
    const botUsername = (me && me.result && me.result.username) || "";
    const dsLink = botUsername
      ? `https://t.me/${botUsername}?start=ds_${newReseller.code}`
      : `/dropship ${newReseller.code}`;

    await tgRequest(token, "sendMessage", {
      chat_id: order.buyer_id,
      text:
        `🤝 <b>SELAMAT! AKUN RESELLER AKTIF (Order #${order.id})</b>\n\n` +
        `🏪 <b>Nama Toko:</b> ${escapeHtml(newReseller.store_name)}\n` +
        `🔑 <b>Kode Dropship Kamu:</b> <code>${escapeHtml(newReseller.code)}</code>\n` +
        `🔗 <b>Link Toko Dropship:</b>\n<code>${escapeHtml(dsLink)}</code>\n\n` +
        `<b>Keuntungan & Aturan Reseller:</b>\n` +
        `1️⃣ <b>Harga Kulakan Murah:</b> Isi saldo lalu beli set di Katalog untuk dapat diskon khusus reseller.\n` +
        `2️⃣ <b>Komisi Dropship Otomatis:</b> Sebarkan Kode/Link Dropship ke pembelimu. Setiap buyer belanja harga normal, komisi otomatis masuk ke Saldomu!\n` +
        `3️⃣ <i>Anti-Curang: Kode dropship tidak bisa dipakai untuk akun sendiri.</i>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🤝 Buka Panel Reseller", callback_data: "menu_reseller" }],
          [
            { text: "💰 Isi Saldo Kulakan", callback_data: "menu_saldo" },
            { text: "🛍️ Cek Katalog", callback_data: "menu_katalog" },
          ],
        ],
      },
    });

    return {
      deliveredName: `Aktivasi Reseller (${newReseller.code})`,
      deliveredLink: "",
    };
  }

  // 2. KHUSUS ORDER DEPOSIT SALDO (AUTO-ACC)
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

  const dsBanner = order.dropship_store_name
    ? `\n🏪 <b>Partner Dropship:</b> ${escapeHtml(order.dropship_store_name)}`
    : "";

  if (order.is_mystery) {
    const bundle = await getBundle();
    const pool = katalogList.map((k) => ({ id: String(k.id), nama: k.nama, link: k.link }));
    if (bundle.link && bundle.link.trim() !== "") {
      pool.push({ id: "", nama: "🌟 JACKPOT: Promo Bundling 2 Mini Set", link: bundle.link });
    }
    const won =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : { id: "", nama: "Paket Spesial Lumine", link: `https://t.me/${ADMIN_USERNAME}` };

    soldItemId = won.id;
    deliveredName = won.nama;
    deliveredLink = normalizeUrl(won.link);

    buyerText =
      `🎲 <b>MYSTERY BOX TERBUKA! (Pesanan #${order.id})</b> 🎲${dsBanner}\n\n` +
      `Selamat! Kamu mendapatkan hadiah:\n` +
      `🎁 <b>${escapeHtml(deliveredName)}</b>\n\n` +
      `Berikut link akses hadiah kamu:\n` +
      `🔗 ${escapeHtml(deliveredLink)}\n\n` +
      `<i>Hadiah tersimpan di 🎒 Koleksi Saya & poin masuk ke Leaderboard!</i>`;
  } else {
    deliveredLink = normalizeUrl(order.target_link);
    buyerText =
      `🎉 <b>PEMBAYARAN DI-ACC! (Pesanan #${order.id})</b>${dsBanner}\n\n` +
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

  // UPDATE STATISTIK KULAKAN RESELLER JIKA HARGA RESELLER DIPAKAI
  if (order.is_reseller_price) {
    await incResellerDailyItemCount(order.buyer_id, order.item_id);
    const rsObj = await getResellerRaw(order.buyer_id);
    if (rsObj) {
      rsObj.total_kulakan = (Number(rsObj.total_kulakan) || 0) + 1;
      await saveReseller(rsObj);
    }
  }

  // CAIRKAN KOMISI DROPSHIP KE RESELLER PEMILIK KODE (ANTI-CURANG: Hanya jika buyer != reseller)
  if (
    order.dropship_reseller_id &&
    String(order.dropship_reseller_id) !== String(order.buyer_id)
  ) {
    const [resellerCfg, dsReseller] = await Promise.all([
      getResellerConfig(),
      getReseller(order.dropship_reseller_id),
    ]);
    if (resellerCfg.enabled && dsReseller) {
      const basisNominal = Number(order.final_base_nominal || order.base_nominal) || 0;
      const commAmount = Math.max(
        100,
        Math.round((basisNominal * Number(resellerCfg.dropship_comm_pct || 25)) / 100)
      );
      const updatedResellerSaldo = await addUserSaldo(dsReseller.user_id, commAmount);
      dsReseller.total_sales = (Number(dsReseller.total_sales) || 0) + 1;
      dsReseller.total_commission = (Number(dsReseller.total_commission) || 0) + commAmount;
      await saveReseller(dsReseller);

      await tgRequest(token, "sendMessage", {
        chat_id: dsReseller.user_id,
        text:
          `💸 <b>KOMISI DROPSHIP MASUK! (Order #${order.id})</b>\n\n` +
          `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)}\n` +
          `📦 <b>Paket:</b> ${escapeHtml(deliveredName)}\n` +
          `💰 <b>Komisi (${resellerCfg.dropship_comm_pct}%):</b> +<code>${formatRupiah(commAmount)}</code>\n` +
          `💳 <b>Saldo Reseller Sekarang:</b> <code>${formatRupiah(updatedResellerSaldo)}</code>`,
        parse_mode: "HTML",
      });
    }
  }

  await Promise.all([
    recordPurchaseToLeaderboard(order),
    addKoleksi(order.buyer_id, deliveredName, deliveredLink),
  ]);

  const updatedAllCnt = await redisCommand(["HGET", REDIS_LB_ALLCNT_KEY, String(order.buyer_id)]);
  await sendTestimonialToChannel(token, order, deliveredName, updatedAllCnt);

  await tgRequest(token, "sendMessage", {
    chat_id: order.buyer_id,
    text: buyerText,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📂 Buka Link File Sekarang", url: deliveredLink }],
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
      [{ text: "💰 Saldo & Depo" }, { text: "🤝 Reseller" }],
      [{ text: "🎒 Koleksi Saya" }, { text: "🏆 Leaderboard" }],
    ],
    resize_keyboard: true,
  };
}

// ==========================================
// 4B. MENU & INVOICE RESELLER / DROPSHIP
// ==========================================
async function sendResellerMenu(token, chatId, userId) {
  const [cfg, reseller, saldo] = await Promise.all([
    getResellerConfig(),
    getReseller(userId),
    getUserSaldo(userId),
  ]);

  if (!cfg.enabled) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Sistem Reseller & Dropship sedang dinonaktifkan sementara oleh admin.",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  if (reseller) {
    const me = await tgRequest(token, "getMe", {});
    const botUsername = (me && me.result && me.result.username) || "";
    const dsLink = botUsername
      ? `https://t.me/${botUsername}?start=ds_${reseller.code}`
      : `/dropship ${reseller.code}`;

    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text:
        `🤝 <b>DASHBOARD RESELLER & DROPSHIP RESMI</b>\n\n` +
        `╭─── 🏪 <b>PROFIL PARTNER</b> ───\n` +
        `│ • <b>Nama Toko :</b> ${escapeHtml(reseller.store_name)}\n` +
        `│ • <b>Kode Dropship :</b> <code>${escapeHtml(reseller.code)}</code>\n` +
        `│ • <b>Saldo Kulakan :</b> <code>${formatRupiah(saldo)}</code>\n` +
        `│ • <b>Total Kulakan :</b> ${reseller.total_kulakan || 0}x\n` +
        `│ • <b>Penjualan Dropship :</b> ${reseller.total_sales || 0}x\n` +
        `│ • <b>Total Komisi :</b> <code>${formatRupiah(reseller.total_commission || 0)}</code>\n` +
        `╰─────────────────────\n\n` +
        `🔗 <b>Link Toko Dropship Kamu:</b>\n` +
        `<code>${escapeHtml(dsLink)}</code>\n\n` +
        `📌 <b>Cara Kerja:</b>\n` +
        `• <b>Kulakan Sendiri:</b> Isi saldo (min. <code>${formatRupiah(cfg.min_saldo_kulakan)}</code>) lalu beli set di Katalog untuk otomatis dapat <b>diskon ${cfg.reseller_discount_pct}%</b> (maks. ${cfg.max_same_item_daily}x/judul/hari).\n` +
        `• <b>Dropship ke Buyer:</b> Bagikan Link Toko di atas atau suruh buyer ketik <code>/dropship ${escapeHtml(reseller.code)}</code>. Buyer bayar harga normal, <b>komisi ${cfg.dropship_comm_pct}%</b> otomatis masuk ke saldomu!`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛍️ Kulakan Katalog", callback_data: "menu_katalog" },
            { text: "💰 Isi Saldo", callback_data: "menu_saldo" },
          ],
          [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
        ],
      },
    });
    return;
  }

  const regActionText =
    cfg.reg_fee > 0
      ? `💳 <b>Biaya Aktivasi Lisensi:</b> <code>${formatRupiah(cfg.reg_fee)}</code> <i>(Sekali bayar seumur hidup • Auto-ACC QRIS)</i>`
      : `🔐 <b>Aktivasi Manual Admin:</b> Hubungi @${ADMIN_USERNAME} dengan menyertakan ID Telegram kamu (<code>${userId}</code>).`;

  const buttons = [];
  if (cfg.reg_fee > 0) {
    buttons.push([
      {
        text: `⚡ Daftar Reseller Sekarang (${formatRupiah(cfg.reg_fee)})`,
        callback_data: "reg_reseller",
      },
    ]);
  }
  buttons.push([
    { text: `💬 Hubungi Admin (@${ADMIN_USERNAME})`, url: `https://t.me/${ADMIN_USERNAME}` },
  ]);
  buttons.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `🤝 <b>PROGRAM RESELLER & DROPSHIP LUMINE</b>\n` +
      `<i>Cuan dari jual ulang photopack tanpa ribet stok file!</i>\n\n` +
      `╭─── 🌟 <b>KEUNTUNGAN PARTNER</b> ───\n` +
      `│ ✅ <b>Diskon Kulakan ${cfg.reseller_discount_pct}%</b> (khusus via Saldo)\n` +
      `│ ✅ <b>Komisi Dropship ${cfg.dropship_comm_pct}%</b> per transaksi buyer\n` +
      `│ ✅ <b>Kode & Link Toko Unik</b> atas nama tokomu\n` +
      `│ ✅ <b>Sistem Anti-Curang:</b> Dijamin aman dari pembeli iseng\n` +
      `╰────────────────────────\n\n` +
      `${regActionText}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

async function createAndSendResellerRegInvoice(token, chatId, user) {
  const [cfg, existing] = await Promise.all([
    getResellerConfig(),
    getReseller(user.id),
  ]);

  if (!cfg.enabled) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "⚠️ Pendaftaran reseller sedang ditutup sementara.",
    });
    return;
  }

  if (existing) {
    await sendResellerMenu(token, chatId, user.id);
    return;
  }

  if (cfg.reg_fee <= 0) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `🔐 Pendaftaran mandiri sedang dikunci. Silakan hubungi @${ADMIN_USERNAME} dan kirim ID kamu: <code>${user.id}</code>`,
      parse_mode: "HTML",
    });
    return;
  }

  const qris = await getQris();
  if (!qris || !qris.file_id || !qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ Pembayaran QRIS sedang disiapkan admin. Silakan chat @${ADMIN_USERNAME}.`,
    });
    return;
  }

  const order = await createOrder(
    user,
    "Aktivasi Lisensi Reseller Resmi",
    cfg.reg_fee,
    "RESELLER_ACTIVATION",
    false,
    "",
    { is_reseller_reg: true }
  );

  const invoiceCaption =
    `🤝 <b>INVOICE AKTIVASI RESELLER #${order.id}</b>\n\n` +
    `📦 <b>Paket:</b> Lisensi Reseller & Dropship Resmi\n` +
    `💵 <b>Biaya Aktivasi:</b> <code>${formatRupiah(order.base_nominal)}</code>\n` +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💸 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ <b>AUTO-ACC STATIS:</b> Transfer <b>TEPAT sampai digit terakhir</b> (<b>${formatRupiah(order.total_nominal)}</b>).\n` +
    `Begitu pembayaran masuk, status Reseller & Kode Dropship langsung aktif otomatis!`;

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
            text: "❌ Batalkan Pendaftaran",
            callback_data: `cancel_${order.id}`,
          },
        ],
      ],
    },
  });
      }
async function sendSaldoMenu(token, chatId, userId) {
  const [saldo, reseller] = await Promise.all([
    getUserSaldo(userId),
    getReseller(userId),
  ]);

  const resellerInfo = reseller
    ? `\n🤝 <b>Status Partner:</b> Aktif (${escapeHtml(reseller.store_name)}) — pakai Saldo untuk dapat harga kulakan!`
    : "";

  const text =
    `💰 <b>SALDO & DEPOSIT INSTAN LUMINE</b>\n\n` +
    `💳 <b>Saldo Kamu Saat Ini:</b> <code>${formatRupiah(saldo)}</code>${resellerInfo}\n\n` +
    `<i>Pilih nominal deposit di bawah ini (Auto-ACC via QRIS Statis dengan kode unik):</i>`;

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Depo Rp 5.000", callback_data: "depo_5000" },
          { text: "➕ Depo Rp 10.000", callback_data: "depo_10000" },
        ],
        [
          { text: "➕ Depo Rp 20.000", callback_data: "depo_20000" },
          { text: "➕ Depo Rp 50.000", callback_data: "depo_50000" },
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
      text: `⚠️ QRIS deposit belum diatur admin. Hubungi @${ADMIN_USERNAME}.`,
    });
    return;
  }

  const nominal = Math.max(1000, Number(amount) || 5000);
  const order = await createOrder(
    user,
    `Deposit Saldo ${formatRupiah(nominal)}`,
    nominal,
    "SALDO_DEPOSIT",
    false,
    "",
    { is_deposit: true }
  );

  const caption =
    `💰 <b>INVOICE DEPOSIT SALDO #${order.id}</b>\n\n` +
    `💵 <b>Nominal Saldo:</b> <code>${formatRupiah(order.base_nominal)}</code>\n` +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💸 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ Transfer <b>TEPAT</b> sesuai nominal di atas. Saldo otomatis masuk begitu terverifikasi!`;

  await tgRequest(token, "sendPhoto", {
    chat_id: chatId,
    photo: qris.file_id,
    caption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Konfirmasi Pembayaran", callback_data: `confirm_${order.id}` }],
        [{ text: "❌ Batalkan Deposit", callback_data: `cancel_${order.id}` }],
      ],
    },
  });
}

async function sendMainMenuCard(token, chatId) {
  const banner = await getBanner();
  const caption =
    `✨ <b>LUMINE STORE — KATALOG DIGITAL</b> ✨\n` +
    `<i>Pilih menu di bawah untuk melihat koleksi, promo, saldo & reseller:</i>`;

  const inlineKeyboard = [
    [
      { text: "🛍️ Katalog Lengkap", callback_data: "menu_katalog" },
      { text: "🔥 Bestseller", callback_data: "menu_bestseller" },
    ],
    [
      { text: "🎲 Mystery Box", callback_data: "menu_mystery" },
      { text: "🎁 Promo Bundling 5k", callback_data: "menu_promo" },
    ],
    [
      { text: "💰 Saldo & Depo", callback_data: "menu_saldo" },
      { text: "🤝 Reseller & Dropship", callback_data: "menu_reseller" },
    ],
    [
      { text: "🎒 Koleksi Saya", callback_data: "menu_koleksi" },
      { text: "🏆 Leaderboard", callback_data: "menu_lb" },
    ],
    [
      { text: "🎟️ Pakai Voucher", callback_data: "menu_voucher" },
      { text: "📖 Cara Order", callback_data: "menu_cara" },
    ],
    [
      { text: "⬆️ Upgrade CH", callback_data: "menu_upgrade" },
      { text: "📢 Channel Lainnya", callback_data: "menu_channel" },
    ],
  ];

  if (banner && banner.file_id) {
    await tgRequest(token, "sendPhoto", {
      chat_id: chatId,
      photo: banner.file_id,
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } else {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }
}

async function sendKatalogMenu(token, chatId) {
  const katalogList = await getKatalog();
  if (!katalogList.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "📭 Katalog masih kosong. Hubungi admin untuk info produk terbaru.",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  const rankMap = getRankedKatalog(katalogList);
  const rows = [];
  let text = `🛍️ <b>DAFTAR KATALOG LUMINE</b>\n<i>Klik item untuk melihat detail & opsi bayar:</i>\n\n`;

  katalogList.forEach((item, idx) => {
    const rank = rankMap[String(item.id)];
    const badge = rank === 1 ? " 🥇#1" : rank === 2 ? " 🥈#2" : rank === 3 ? " 🥉#3" : "";
    const soldNum = Number(item.sold) || 0;
    const soldText = soldNum > 0 ? ` • ${soldNum} terjual` : "";
    text += `${idx + 1}. <b>${escapeHtml(item.nama)}</b>${badge} — <code>${escapeHtml(item.harga)}</code>${soldText}\n`;
    rows.push([
      {
        text: `${idx + 1}. ${item.nama} (${item.harga})`,
        callback_data: `detail_${item.id}`,
      },
    ]);
  });

  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendBestsellerMenu(token, chatId) {
  const katalogList = await getKatalog();
  const sorted = [...katalogList]
    .filter((k) => (Number(k.sold) || 0) > 0)
    .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0))
    .slice(0, 10);

  if (!sorted.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🔥 Belum ada data penjualan bestseller saat ini. Cek Katalog Lengkap ya!",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛍️ Katalog Lengkap", callback_data: "menu_katalog" }],
          [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
        ],
      },
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  let text = `🔥 <b>TOP BESTSELLER LUMINE</b>\n<i>Koleksi paling laris pilihan pembeli:</i>\n\n`;
  const rows = [];

  sorted.forEach((item, idx) => {
    const prefix = idx < 3 ? medals[idx] : `<b>${idx + 1}.</b>`;
    text += `${prefix} <b>${escapeHtml(item.nama)}</b> — <code>${escapeHtml(item.harga)}</code> (${Number(item.sold) || 0} terjual)\n`;
    rows.push([
      {
        text: `${idx < 3 ? medals[idx] : `${idx + 1}.`} ${item.nama} (${item.harga})`,
        callback_data: `detail_${item.id}`,
      },
    ]);
  });

  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendMysteryMenu(token, chatId) {
  const cfg = await getMysteryConfig();
  if (!cfg.enabled) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🎲 Mystery Box sedang ditutup sementara oleh admin.",
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  const price = Number(cfg.price) || 3000;
  const text =
    `🎲 <b>MYSTERY BOX LUMINE</b>\n\n` +
    `💰 <b>Harga Gacha:</b> <code>${formatRupiah(price)}</code>\n` +
    `🎁 <b>Isi Hadiah:</b> Salah satu set di Katalog atau Jackpot Promo Bundling!\n` +
    `<i>Hadiah langsung terkirim otomatis setelah pembayaran terverifikasi.</i>`;

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: `⚡ QRIS (${formatRupiah(price)})`, callback_data: "buyqris_mystery" },
          { text: `💳 Saldo (${formatRupiah(price)})`, callback_data: "paysaldo_mystery" },
        ],
        [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
      ],
    },
  });
}

async function sendKoleksiMenu(token, chatId, userId) {
  const list = await getKoleksi(userId);
  if (!list.length) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🎒 <b>KOLEKSI SAYA</b>\n\nKamu belum punya riwayat pembelian tersimpan.",
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

  let text = `🎒 <b>KOLEKSI SAYA (30 Terakhir)</b>\n\n`;
  const rows = [];
  list.slice(0, 15).forEach((item, idx) => {
    const safeUrl = normalizeUrl(item.link);
    text += `${idx + 1}. <b>${escapeHtml(item.nama)}</b> <i>(${escapeHtml(item.date || "-")})</i>\n`;
    rows.push([{ text: `📂 Buka: ${item.nama}`, url: safeUrl }]);
  });
  rows.push([{ text: "🔙 Menu Utama", callback_data: "menu_home" }]);

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
                 }
    async function sendPromoBundling(token, chatId, replyToMessageId = null) {
  const bundle = await getBundle();
  if (!bundle || !bundle.link || !bundle.link.trim()) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: "🎁 Link Promo Bundling 5k belum diatur oleh admin.",
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      reply_markup: {
        inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
      },
    });
    return;
  }

  const text =
    `🎁 <b>PROMO BUNDLING 2 MINI SET</b>\n\n` +
    `💰 <b>Harga Promo:</b> <code>Rp 5.000</code>\n` +
    `<i>Pilih metode pembayaran di bawah ini:</i>`;

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚡ Bayar QRIS (Rp 5.000)", callback_data: "buyqris_bundle" },
          { text: "💳 Bayar Saldo (Rp 5.000)", callback_data: "paysaldo_bundle" },
        ],
        [{ text: "🔙 Menu Utama", callback_data: "menu_home" }],
      ],
    },
  });
}

async function sendCaraOrder(token, chatId) {
  const text =
    `📖 <b>CARA ORDER DI LUMINE STORE</b>\n\n` +
    `1️⃣ Pilih produk di <b>Katalog</b>, <b>Bestseller</b>, <b>Mystery Box</b>, atau <b>Promo 5k</b>.\n` +
    `2️⃣ Pilih bayar pakai <b>QRIS</b> (transfer tepat sampai kode unik) atau <b>Saldo</b>.\n` +
    `3️⃣ Setelah pembayaran terverifikasi, link file otomatis dikirim ke chat ini dan tersimpan di <b>Koleksi Saya</b>.\n\n` +
    `💬 Butuh bantuan? Hubungi admin @${ADMIN_USERNAME}.`;

  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
    },
  });
}

async function sendUpgradeCh(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `⬆️ <b>UPGRADE & CHANNEL CADANGAN</b>\n\n` +
      `Simpan link channel cadangan & channel free berikut agar tidak ketinggalan update:\n` +
      `• Channel Cadangan: ${escapeHtml(LINK_CH_CADANGAN)}\n` +
      `• Channel Free: ${escapeHtml(LINK_CH_FREE)}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
    },
  });
}

async function sendChannelLainnya(token, chatId) {
  await tgRequest(token, "sendMessage", {
    chat_id: chatId,
    text:
      `📢 <b>CHANNEL & INFO RESMI</b>\n\n` +
      `• Channel Free: ${escapeHtml(LINK_CH_FREE)}\n` +
      `• Channel Cadangan: ${escapeHtml(LINK_CH_CADANGAN)}\n` +
      `• Admin Resmi: @${ADMIN_USERNAME}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
    },
  });
}

async function resolvePurchaseTarget(targetKey) {
  if (targetKey === "bundle") {
    const bundle = await getBundle();
    if (!bundle || !bundle.link || !bundle.link.trim()) return null;
    return {
      targetKey: "bundle",
      itemId: "",
      itemNama: "Promo Bundling 2 Mini Set",
      baseNominal: 5000,
      targetLink: bundle.link.trim(),
      isMystery: false,
    };
  }

  if (targetKey === "mystery") {
    const cfg = await getMysteryConfig();
    if (!cfg.enabled) return null;
    return {
      targetKey: "mystery",
      itemId: "",
      itemNama: "Mystery Box",
      baseNominal: Number(cfg.price) || 3000,
      targetLink: "MYSTERY_RANDOM",
      isMystery: true,
    };
  }

  const katalogList = await getKatalog();
  const found = katalogList.find((k) => String(k.id) === String(targetKey));
  if (!found) return null;

  return {
    targetKey: String(found.id),
    itemId: String(found.id),
    itemNama: found.nama,
    baseNominal: parseNominal(found.harga),
    targetLink: found.link,
    isMystery: false,
  };
}

async function sendQrisInvoiceForTarget(token, chatId, user, target) {
  const qris = await getQris();
  if (!qris || !qris.file_id || !qris.admin_chat_id) {
    await tgRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ QRIS belum diatur oleh admin. Hubungi @${ADMIN_USERNAME}.`,
    });
    return;
  }

  const pricing = await evaluateBuyerPricing(user.id, target, "qris");
  const order = await createOrder(
    user,
    target.itemNama,
    target.baseNominal,
    target.targetLink,
    target.isMystery,
    target.itemId,
    {
      preset_discount: pricing.discount,
      preset_voucher_code: pricing.voucherCode,
      is_reseller_price: false,
    }
  );

  let discountLine = "";
  if (order.discount > 0) {
    discountLine = `🎟️ <b>Diskon Voucher (${escapeHtml(order.voucher_code)}):</b> -${formatRupiah(order.discount)}\n`;
  }

  const dsLine = order.dropship_store_name
    ? `🏪 <b>Partner Dropship:</b> ${escapeHtml(order.dropship_store_name)}\n`
    : "";

  const caption =
    `🧾 <b>INVOICE PESANAN #${order.id}</b>\n\n` +
    `${dsLine}` +
    `📦 <b>Produk:</b> ${escapeHtml(order.item_nama)}\n` +
    `💵 <b>Harga Awal:</b> <code>${formatRupiah(order.base_nominal)}</code>\n` +
    `${discountLine}` +
    `🔢 <b>Kode Unik:</b> +${formatRupiah(order.kode_unik)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💸 <b>TOTAL TRANSFER: <code>${formatRupiah(order.total_nominal)}</code></b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚡ Transfer <b>TEPAT</b> sampai digit terakhir (<b>${formatRupiah(order.total_nominal)}</b>).\n` +
    `Setelah transfer, klik <b>Konfirmasi Pembayaran</b> di bawah.`;

  await tgRequest(token, "sendPhoto", {
    chat_id: chatId,
    photo: qris.file_id,
    caption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Konfirmasi Pembayaran", callback_data: `confirm_${order.id}` }],
        [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_${order.id}` }],
      ],
    },
  });
}

// ==========================================
// 5. ENTRY POINT WEBHOOK VERCEL
// ==========================================
module.exports = async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN belum diset." });
  }

  try {
    if (req.method === "GET") {
      if (req.query && req.query.setup === "true") {
        const host = req.headers["x-forwarded-host"] || req.headers.host || "";
        const proto = req.headers["x-forwarded-proto"] || "https";
        const webhookUrl = `${proto}://${host}/api/webhook`;
        const setRes = await fetch(
          `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
        );
        const setJson = await setRes.json();
        return res.status(200).json({ webhook_url: webhookUrl, telegram_response: setJson });
      }
      return res.status(200).json({ ok: true, status: "Lumine Bot Webhook Active" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const update = req.body || {};
    if (update.update_id) {
      await redisCommand(["HSET", REDIS_USERS_KEY, "last_update_id", String(update.update_id)]);
    }

    // ------------------------------------------
    // 0. HANDLER POSTINGAN CHANNEL (/settesti LANGSUNG DI CH)
    // ------------------------------------------
    if (update.channel_post) {
      const cp = update.channel_post;
      const cpText = String(cp.text || cp.caption || "").trim();
      if (cpText.startsWith("/settesti")) {
        const parts = cpText.split(/\s+/);
        const customBot = (parts[1] || "").replace(/^@/, "").trim();
        let botUsername = customBot;
        if (!botUsername) {
          const me = await tgRequest(token, "getMe", {});
          botUsername = (me && me.result && me.result.username) || "";
        }
        await saveTestiConfig({
          channel_id: String(cp.chat.id),
          channel_title: cp.chat.title || "Channel Testimoni",
          bot_username: botUsername,
        });
        await tgRequest(token, "sendMessage", {
          chat_id: cp.chat.id,
          text:
            `✅ <b>CHANNEL TESTIMONI AKTIF!</b>\n\n` +
            `📢 Channel: <b>${escapeHtml(cp.chat.title || cp.chat.id)}</b>\n` +
            `🤖 Bot Tombol: <code>${escapeHtml(botUsername ? `@${botUsername}` : "Tidak diset")}</code>`,
          parse_mode: "HTML",
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------
    // A. HANDLER KLIK TOMBOL INLINE
    // ------------------------------------------
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = String(cq.data || "");
      const chatId = cq.message && cq.message.chat ? cq.message.chat.id : cq.from.id;
      const user = cq.from;

      if (user && user.id) {
        await redisCommand(["HSET", REDIS_USERS_KEY, String(user.id), String(Date.now())]);
      }

      await tgRequest(token, "answerCallbackQuery", {
        callback_query_id: cq.id,
      });

      if (data === "menu_home") {
        await sendMainMenuCard(token, chatId);
      } else if (data === "menu_reseller") {
        await sendResellerMenu(token, chatId, user.id);
      } else if (data === "reg_reseller") {
        await createAndSendResellerRegInvoice(token, chatId, user);
      } else if (data === "menu_saldo") {
        await sendSaldoMenu(token, chatId, user.id);
      } else if (data.startsWith("depo_")) {
        const amount = parseInt(data.replace("depo_", ""), 10) || 5000;
        await createAndSendDepositInvoice(token, chatId, user, amount);
      } else if (data === "menu_katalog") {
        await sendKatalogMenu(token, chatId);
      } else if (data === "menu_bestseller") {
        await sendBestsellerMenu(token, chatId);
      } else if (data === "menu_mystery") {
        await sendMysteryMenu(token, chatId);
      } else if (data === "menu_koleksi") {
        await sendKoleksiMenu(token, chatId, user.id);
      } else if (data === "menu_promo") {
        await sendPromoBundling(token, chatId);
      } else if (data === "menu_cara") {
        await sendCaraOrder(token, chatId);
      } else if (data === "menu_upgrade") {
        await sendUpgradeCh(token, chatId);
      } else if (data === "menu_channel") {
        await sendChannelLainnya(token, chatId);
      } else if (data === "menu_voucher") {
        const activeV = await getActiveUserVoucher(user.id);
        const statusText = activeV
          ? `🎟️ Voucher aktif kamu saat ini: <b>${escapeHtml(activeV.code)}</b> (Diskon <code>${formatRupiah(activeV.discount)}</code>)\n\n`
          : "";
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `🎟️ <b>PAKAI KODE VOUCHER</b>\n\n` +
            `${statusText}` +
            `Ketik perintah:\n<code>/voucher KODE_KAMU</code>\n\n` +
            `<i>Contoh:</i> <code>/voucher LUMINE10</code>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_home" }]],
          },
        });
      } else if (data === "menu_lb") {
        const lbPayload = await buildLeaderboardPayload("month", user.id);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: lbPayload.text,
          parse_mode: "HTML",
          reply_markup: lbPayload.reply_markup,
        });
      } else if (data.startsWith("lb_")) {
        const period = data.replace("lb_", "");
        const validPeriod = ["day", "week", "month"].includes(period) ? period : "month";
        const lbPayload = await buildLeaderboardPayload(validPeriod, user.id);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: lbPayload.text,
          parse_mode: "HTML",
          reply_markup: lbPayload.reply_markup,
        });
      } else if (data.startsWith("detail_")) {
        const targetKey = data.replace("detail_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Item tidak ditemukan atau sudah tidak tersedia.",
          });
          return res.status(200).json({ ok: true });
        }

        const [qrisPricing, saldoPricing, userSaldo, dsReseller] = await Promise.all([
          evaluateBuyerPricing(user.id, target, "qris"),
          evaluateBuyerPricing(user.id, target, "saldo"),
          getUserSaldo(user.id),
          getBuyerDropshipReseller(user.id),
        ]);

        const lines = [
          `📦 <b>${escapeHtml(target.itemNama)}</b>`,
          `💵 <b>Harga Normal:</b> <code>${formatRupiah(target.baseNominal)}</code>`,
          `💳 <b>Saldo Kamu:</b> <code>${formatRupiah(userSaldo)}</code>`,
        ];

        if (qrisPricing.discount > 0) {
          lines.push(
            `🎟️ <b>Bayar QRIS (Voucher ${escapeHtml(qrisPricing.voucherCode)}):</b> <code>${formatRupiah(qrisPricing.finalPrice)}</code> (-${formatRupiah(qrisPricing.discount)})`
          );
        } else {
          lines.push(`⚡ <b>Bayar QRIS:</b> <code>${formatRupiah(qrisPricing.finalPrice)}</code> + kode unik`);
        }

        if (saldoPricing.isResellerPrice) {
          lines.push(
            `🤝 <b>Bayar Saldo (Kulakan Reseller -${saldoPricing.resellerDiscountPct}%):</b> <code>${formatRupiah(saldoPricing.finalPrice)}</code>`
          );
        } else if (saldoPricing.discount > 0) {
          lines.push(
            `💳 <b>Bayar Saldo (Voucher ${escapeHtml(saldoPricing.voucherCode)}):</b> <code>${formatRupiah(saldoPricing.finalPrice)}</code>`
          );
        } else {
          lines.push(`💳 <b>Bayar Saldo:</b> <code>${formatRupiah(saldoPricing.finalPrice)}</code>`);
          if (saldoPricing.resellerNote) {
            lines.push(`<i>${escapeHtml(saldoPricing.resellerNote)}</i>`);
          }
        }

        if (dsReseller) {
          lines.push(`🏪 <b>Partner Dropship Aktif:</b> ${escapeHtml(dsReseller.store_name)}`);
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: lines.join("\n"),
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⚡ QRIS (${formatRupiah(qrisPricing.finalPrice)})`,
                  callback_data: `buyqris_${target.targetKey}`,
                },
                {
                  text: `💳 Saldo (${formatRupiah(saldoPricing.finalPrice)})`,
                  callback_data: `paysaldo_${target.targetKey}`,
                },
              ],
              [
                { text: "🛍️ Kembali ke Katalog", callback_data: "menu_katalog" },
                { text: "🔙 Menu Utama", callback_data: "menu_home" },
              ],
            ],
          },
        });
      } else if (data.startsWith("buyqris_")) {
        const targetKey = data.replace("buyqris_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Produk tidak tersedia.",
          });
          return res.status(200).json({ ok: true });
        }
        await sendQrisInvoiceForTarget(token, chatId, user, target);
      } else if (data.startsWith("paysaldo_")) {
        const targetKey = data.replace("paysaldo_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Produk tidak tersedia.",
          });
          return res.status(200).json({ ok: true });
        }

        const pricing = await evaluateBuyerPricing(user.id, target, "saldo");
        const payNominal = pricing.finalPrice;
        const deduct = await deductUserSaldo(user.id, payNominal);

        if (!deduct.ok) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `❌ <b>SALDO TIDAK MENCUKUPI</b>\n\n` +
              `📦 <b>Produk:</b> ${escapeHtml(target.itemNama)}\n` +
              `💸 <b>Dibutuhkan:</b> <code>${formatRupiah(payNominal)}</code>\n` +
              `💳 <b>Saldo Kamu:</b> <code>${formatRupiah(deduct.balance)}</code>`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "💰 Deposit Saldo Sekarang", callback_data: "menu_saldo" }],
                [{ text: `⚡ Bayar Pakai QRIS`, callback_data: `buyqris_${target.targetKey}` }],
              ],
            },
          });
          return res.status(200).json({ ok: true });
        }

        const order = await createOrder(
          user,
          target.itemNama,
          target.baseNominal,
          target.targetLink,
          target.isMystery,
          target.itemId,
          {
            preset_discount: pricing.discount,
            preset_voucher_code: pricing.voucherCode,
            is_reseller_price: pricing.isResellerPrice,
            skip_unique: true,
            final_base_nominal: payNominal,
            total_nominal: payNominal,
            payment_method: "saldo",
          }
        );

        await processAccOrder(token, order);
                  }
          } else if (data.startsWith("buy_")) {
        const targetKey = data.replace("buy_", "");
        const target = await resolvePurchaseTarget(targetKey);
        if (!target) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Produk tidak tersedia.",
          });
          return res.status(200).json({ ok: true });
        }

        const [qrisPricing, saldoPricing, userSaldo] = await Promise.all([
          evaluateBuyerPricing(user.id, target, "qris"),
          evaluateBuyerPricing(user.id, target, "saldo"),
          getUserSaldo(user.id),
        ]);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `💳 <b>PILIH METODE PEMBAYARAN</b>\n\n` +
            `📦 <b>Produk:</b> ${escapeHtml(target.itemNama)}\n` +
            `💳 <b>Saldo Kamu:</b> <code>${formatRupiah(userSaldo)}</code>\n` +
            `⚡ <b>QRIS:</b> <code>${formatRupiah(qrisPricing.finalPrice)}</code> + kode unik\n` +
            `💰 <b>Saldo:</b> <code>${formatRupiah(saldoPricing.finalPrice)}</code>${saldoPricing.isResellerPrice ? ` <i>(Kulakan Reseller -${saldoPricing.resellerDiscountPct}%)</i>` : ""}`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⚡ QRIS (${formatRupiah(qrisPricing.finalPrice)})`,
                  callback_data: `buyqris_${target.targetKey}`,
                },
                {
                  text: `💳 Saldo (${formatRupiah(saldoPricing.finalPrice)})`,
                  callback_data: `paysaldo_${target.targetKey}`,
                },
              ],
            ],
          },
        });
      } else if (data.startsWith("confirm_")) {
        const orderId = data.replace("confirm_", "");
        const order = await getOrder(orderId);
        if (!order) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Pesanan tidak ditemukan atau sudah kedaluwarsa.",
          });
          return res.status(200).json({ ok: true });
        }

        if (order.status === "acc") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Pesanan #${order.id} sudah di-ACC sebelumnya.`,
          });
          return res.status(200).json({ ok: true });
        }

        order.status = "waiting_acc";
        await saveOrder(order.id, order);

        const qris = await getQris();
        const adminChatId = qris && qris.admin_chat_id;

        if (adminChatId) {
          const buyerTag =
            order.buyer_username && order.buyer_username !== "Tanpa Username"
              ? order.buyer_username
              : `ID <code>${order.buyer_id}</code>`;

          await tgRequest(token, "sendMessage", {
            chat_id: adminChatId,
            text:
              `🔔 <b>KONFIRMASI BAYAR ORDER #${order.id}</b>\n\n` +
              `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (${buyerTag})\n` +
              `📦 <b>Item:</b> ${escapeHtml(order.item_nama)}\n` +
              `💸 <b>Total Transfer:</b> <code>${formatRupiah(order.total_nominal)}</code>\n` +
              `📌 <b>Status:</b> Menunggu ACC`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: `✅ ACC #${order.id}`, callback_data: `acc_${order.id}` },
                  { text: `❌ Tolak #${order.id}`, callback_data: `reject_${order.id}` },
                ],
              ],
            },
          });
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `⏳ <b>Konfirmasi Dikirim! (Order #${order.id})</b>\n\n` +
            `Nominal tagihan: <code>${formatRupiah(order.total_nominal)}</code>.\n` +
            `Pesanan akan diproses otomatis oleh sistem auto-ACC atau admin.`,
          parse_mode: "HTML",
        });
      } else if (data.startsWith("cancel_")) {
        const orderId = data.replace("cancel_", "");
        const order = await getOrder(orderId);
        if (order && order.status !== "acc") {
          order.status = "cancelled";
          await saveOrder(order.id, order);
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `❌ Pesanan #${orderId} dibatalkan.`,
        });
      } else if (data.startsWith("acc_")) {
        const orderId = data.replace("acc_", "");
        const order = await getOrder(orderId);
        if (!order) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Order #${orderId} tidak ditemukan.`,
          });
          return res.status(200).json({ ok: true });
        }

        if (order.status === "acc") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `ℹ️ Order #${orderId} sudah di-ACC sebelumnya.`,
          });
          return res.status(200).json({ ok: true });
        }

        const delivered = await processAccOrder(token, order);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>ORDER #${order.id} DI-ACC</b>\n\n` +
            `📦 <b>Dikirim:</b> ${escapeHtml(delivered.deliveredName)}\n` +
            `👤 <b>Pembeli:</b> ${escapeHtml(order.buyer_name)} (<code>${order.buyer_id}</code>)`,
          parse_mode: "HTML",
        });
      } else if (data.startsWith("reject_")) {
        const orderId = data.replace("reject_", "");
        const order = await getOrder(orderId);
        if (order && order.status !== "acc") {
          order.status = "rejected";
          await saveOrder(order.id, order);
          await tgRequest(token, "sendMessage", {
            chat_id: order.buyer_id,
            text:
              `❌ <b>Pembayaran Order #${order.id} Ditolak</b>\n\n` +
              `Silakan cek kembali nominal transfer atau hubungi @${ADMIN_USERNAME}.`,
            parse_mode: "HTML",
          });
        }
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `❌ Order #${orderId} ditolak.`,
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
      const user = msg.from || { id: chatId, first_name: "User" };
      const rawText = String(msg.text || msg.caption || "").trim();

      if (user && user.id) {
        await redisCommand(["HSET", REDIS_USERS_KEY, String(user.id), String(Date.now())]);
      }

      if (msg.chat && msg.chat.type === "private") {
        // AUTO-ACC DARI NOTIFIKASI MAKRO ANDROID / NOTIFIKASI BANK & E-WALLET
        const macroCfg = await getMacroConfig();
        const secretPrefix = macroCfg.secret ? `${macroCfg.secret}:` : "";
        const isSecretMatched = secretPrefix && rawText.startsWith(secretPrefix);
        const cleanTextForNotif = isSecretMatched
          ? rawText.slice(secretPrefix.length).trim()
          : rawText;

        const looksLikePaymentNotif =
          isSecretMatched ||
          /qris|gopay|ovo|dana|shopeepay|linkaja|bca|bri|bni|mandiri|seabank|jago|pembayaran diterima|dana masuk|transfer masuk|berhasil diterima/i.test(
            cleanTextForNotif
          );

        if (looksLikePaymentNotif && !rawText.startsWith("/")) {
          if (!macroCfg.enabled && !isSecretMatched) {
            return res.status(200).json({ ok: true });
          }

          const nominals = extractNominalsFromNotif(cleanTextForNotif);
          const matchedOrder = await findPendingOrderByNominals(nominals);

          if (matchedOrder) {
            const delivered = await processAccOrder(token, matchedOrder);
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                `⚡ <b>AUTO-ACC MAKRO BERHASIL (#${matchedOrder.id})</b>\n\n` +
                `💰 <b>Nominal Cocok:</b> <code>${formatRupiah(matchedOrder.total_nominal)}</code>\n` +
                `📦 <b>Paket:</b> ${escapeHtml(delivered.deliveredName)}\n` +
                `👤 <b>Pembeli:</b> ${escapeHtml(matchedOrder.buyer_name)}`,
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }
        }
      }

      // ADMIN: /setreseller, /addreseller, /delreseller, /listreseller
      if (rawText.startsWith("/setreseller")) {
        const parts = rawText.split(/\s+/);
        const sub = (parts[1] || "").toLowerCase();
        const val = parts[2];
        const cfg = await getResellerConfig();

        if (!sub || sub === "status" || sub === "info") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `🤝 <b>PENGATURAN RESELLER & DROPSHIP</b>\n\n` +
              `• Status: <b>${cfg.enabled ? "AKTIF" : "NONAKTIF"}</b>\n` +
              `• Biaya Aktivasi (reg_fee): <code>${formatRupiah(cfg.reg_fee)}</code>\n` +
              `• Diskon Kulakan (diskon): <b>${cfg.reseller_discount_pct}%</b>\n` +
              `• Komisi Dropship (komisi): <b>${cfg.dropship_comm_pct}%</b>\n` +
              `• Min Saldo Mengendap (minsaldo): <code>${formatRupiah(cfg.min_saldo_kulakan)}</code>\n` +
              `• Maks Beli Item/Hari (limit): <b>${cfg.max_same_item_daily}x</b>\n\n` +
              `<i>Perintah:</i>\n` +
              `<code>/setreseller on|off</code>\n` +
              `<code>/setreseller reg_fee 15000</code>\n` +
              `<code>/setreseller diskon 30</code>\n` +
              `<code>/setreseller komisi 25</code>\n` +
              `<code>/setreseller minsaldo 5000</code>\n` +
              `<code>/setreseller limit 2</code>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (sub === "on" || sub === "off") {
          cfg.enabled = sub === "on";
          await saveResellerConfig(cfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Sistem Reseller & Dropship di-set ke: <b>${cfg.enabled ? "AKTIF" : "NONAKTIF"}</b>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const num = parseInt(String(val || "").replace(/\D/g, ""), 10);
        if (isNaN(num)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Nilai angka tidak valid.",
          });
          return res.status(200).json({ ok: true });
        }

        if (sub === "reg_fee" || sub === "biaya") cfg.reg_fee = Math.max(0, num);
        else if (sub === "diskon" || sub === "discount") cfg.reseller_discount_pct = Math.min(80, Math.max(0, num));
        else if (sub === "komisi" || sub === "comm") cfg.dropship_comm_pct = Math.min(80, Math.max(0, num));
        else if (sub === "minsaldo" || sub === "min_saldo") cfg.min_saldo_kulakan = Math.max(0, num);
        else if (sub === "limit" || sub === "max_daily") cfg.max_same_item_daily = Math.max(1, num);
        else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Sub-perintah tidak dikenal. Ketik <code>/setreseller</code> untuk bantuan.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await saveResellerConfig(cfg);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Pengaturan <code>${escapeHtml(sub)}</code> diperbarui menjadi <b>${num}</b>.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/addreseller")) {
        const parts = rawText.split(/\s+/);
        const targetUid = String(parts[1] || "").replace(/\D/g, "");
        const customStore = parts.slice(2).join(" ").trim();
        if (!targetUid) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format: <code>/addreseller USER_ID Nama Toko</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const resObj = await registerOrActivateReseller(
          { id: targetUid, first_name: customStore || `Reseller ${targetUid}` },
          customStore
        );
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>RESELLER DIAKTIFKAN</b>\n\n` +
            `• User ID: <code>${resObj.user_id}</code>\n` +
            `• Nama Toko: <b>${escapeHtml(resObj.store_name)}</b>\n` +
            `• Kode Dropship: <code>${escapeHtml(resObj.code)}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/delreseller")) {
        const targetUid = rawText.replace("/delreseller", "").replace(/\D/g, "").trim();
        const existing = targetUid ? await getResellerRaw(targetUid) : null;
        if (!existing) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Data reseller tidak ditemukan.",
          });
          return res.status(200).json({ ok: true });
        }
        existing.active = false;
        await saveReseller(existing);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Reseller <code>${escapeHtml(existing.user_id)}</code> (${escapeHtml(existing.store_name)}) dinonaktifkan.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/listreseller")) {
        const list = await getAllResellers();
        if (!list.length) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "📭 Belum ada reseller aktif.",
          });
          return res.status(200).json({ ok: true });
        }
        const lines = list.map(
          (r, i) =>
            `${i + 1}. <b>${escapeHtml(r.store_name)}</b> (<code>${r.user_id}</code>) • Kode: <code>${escapeHtml(r.code)}</code> • Kulakan: ${r.total_kulakan || 0}x • DS: ${r.total_sales || 0}x`
        );
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `🤝 <b>DAFTAR RESELLER AKTIF (${list.length})</b>\n\n` + lines.join("\n"),
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // USER: /reseller & /dropship
      if (rawText.startsWith("/reseller")) {
        await sendResellerMenu(token, chatId, user.id);
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/dropship")) {
        const code = rawText.replace(/^\/dropship/i, "").trim().toUpperCase();
        if (!code) {
          const currentRef = await getBuyerDropshipReseller(user.id);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: currentRef
              ? `🏪 Partner dropship aktif kamu: <b>${escapeHtml(currentRef.store_name)}</b> (<code>${escapeHtml(currentRef.code)}</code>)`
              : `ℹ️ Gunakan <code>/dropship KODE_RESELLER</code> untuk menautkan partner dropship.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const partner = await getResellerByDropshipCode(code);
        if (!partner) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "❌ Kode dropship tidak ditemukan atau tidak aktif.",
          });
          return res.status(200).json({ ok: true });
        }

        if (String(partner.user_id) === String(user.id)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Tidak bisa menggunakan kode dropship milik sendiri.",
          });
          return res.status(200).json({ ok: true });
        }

        await setBuyerDropshipRef(user.id, partner.user_id);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>PARTNER DROPSHIP TERSAMBUNG</b>\n\n` +
            `🏪 Toko: <b>${escapeHtml(partner.store_name)}</b>\n` +
            `🔑 Kode: <code>${escapeHtml(partner.code)}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // ADMIN: /addsaldo & /ceksaldo
      if (rawText.startsWith("/addsaldo")) {
        const parts = rawText.split(/\s+/);
        const targetUid = String(parts[1] || "").replace(/\D/g, "");
        const amount = parseInt(String(parts[2] || "").replace(/\D/g, ""), 10) || 0;
        if (!targetUid || !amount) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format: <code>/addsaldo USER_ID NOMINAL</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const newSaldo = await addUserSaldo(targetUid, amount);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Saldo user <code>${targetUid}</code> ditambah <code>${formatRupiah(amount)}</code>. Total: <code>${formatRupiah(newSaldo)}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/ceksaldo")) {
        const targetUid = rawText.replace("/ceksaldo", "").replace(/\D/g, "").trim() || String(user.id);
        const bal = await getUserSaldo(targetUid);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `💳 Saldo user <code>${targetUid}</code>: <code>${formatRupiah(bal)}</code>`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // USER: /depo & /saldo
      if (rawText.startsWith("/depo")) {
        const amt = parseInt(rawText.replace("/depo", "").replace(/\D/g, ""), 10);
        if (amt && amt >= 1000) {
          await createAndSendDepositInvoice(token, chatId, user, amt);
        } else {
          await sendSaldoMenu(token, chatId, user.id);
        }
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/saldo")) {
        await sendSaldoMenu(token, chatId, user.id);
        return res.status(200).json({ ok: true });
          }
            // 0A. ADMIN: /setmacro (PENGATURAN & LINK AUTO-ACC MAKRO ANDROID)
      if (rawText.startsWith("/setmacro")) {
        const parts = rawText.split(/\s+/);
        const sub = (parts[1] || "").toLowerCase();
        const val = parts.slice(2).join(" ").trim();
        const cfg = await getMacroConfig();

        if (!sub || sub === "status" || sub === "info") {
          const hostUrl =
            cfg.host ||
            `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host || ""}/api/webhook`;
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `⚡ <b>PENGATURAN AUTO-ACC MAKRO</b>\n\n` +
              `• Status: <b>${cfg.enabled ? "AKTIF" : "NONAKTIF"}</b>\n` +
              `• Secret Key: <code>${escapeHtml(cfg.secret)}</code>\n` +
              `• Endpoint Webhook: <code>${escapeHtml(hostUrl)}</code>\n\n` +
              `<i>Perintah:</i>\n` +
              `<code>/setmacro on|off</code>\n` +
              `<code>/setmacro secret KEY_BARU</code>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (sub === "on" || sub === "off") {
          cfg.enabled = sub === "on";
          await saveMacroConfig(cfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Auto-ACC Makro di-set ke: <b>${cfg.enabled ? "AKTIF" : "NONAKTIF"}</b>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (sub === "secret" && val) {
          cfg.secret = val;
          await saveMacroConfig(cfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Secret Key Makro diperbarui menjadi: <code>${escapeHtml(val)}</code>`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ Format tidak dikenal. Ketik <code>/setmacro</code> untuk bantuan.",
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 0B. ADMIN: /setsold (ATUR / RESET ANGKA TERJUAL BESTSELLER)
      if (rawText.startsWith("/setsold")) {
        const parts = rawText.split(/\s+/);
        const itemId = String(parts[1] || "").trim();
        const num = parseInt(String(parts[2] || "").replace(/\D/g, ""), 10);

        if (!itemId || isNaN(num)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format: <code>/setsold ID_ITEM ANGKA</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const list = await getKatalog();
        const idx = list.findIndex((k) => String(k.id) === itemId);
        if (idx === -1) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Item dengan ID <code>${escapeHtml(itemId)}</code> tidak ditemukan.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        list[idx].sold = Math.max(0, num);
        await saveKatalog(list);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Angka terjual <b>${escapeHtml(list[idx].nama)}</b> diatur ke <b>${list[idx].sold}</b>.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 1. ADMIN: /settesti
      if (rawText.startsWith("/settesti")) {
        const arg = rawText.replace("/settesti", "").trim();
        if (!arg || arg.toLowerCase() === "off" || arg.toLowerCase() === "reset") {
          await saveTestiConfig(null);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "🗑️ Konfigurasi channel testimoni dihapus/dinonaktifkan.",
          });
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split(/\s+/);
        const chId = parts[0];
        const botUser = (parts[1] || "").replace(/^@/, "").trim();
        await saveTestiConfig({
          channel_id: chId,
          channel_title: chId,
          bot_username: botUser,
        });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Channel testimoni diset ke <code>${escapeHtml(chId)}</code>.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 2. ADMIN: /broadcast
      if (rawText.startsWith("/broadcast")) {
        const bcText = rawText.replace(/^\/broadcast\s*/i, "").trim();
        if (!bcText) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format: <code>/broadcast Pesan kamu</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const allUsersRaw = await redisCommand(["HKEYS", REDIS_USERS_KEY]);
        const userIds = Array.isArray(allUsersRaw)
          ? allUsersRaw.filter((k) => /^\d+$/.test(String(k)))
          : [];

        let sent = 0;
        for (const uid of userIds) {
          const r = await tgRequest(token, "sendMessage", {
            chat_id: uid,
            text: bcText,
            parse_mode: "HTML",
          });
          if (r && r.ok) sent += 1;
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `📣 Broadcast selesai. Terkirim ke <b>${sent}</b> dari <b>${userIds.length}</b> user.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 3. ADMIN: /buatvoucher & /hapusvoucher
      if (rawText.startsWith("/buatvoucher")) {
        const parts = rawText.split(/\s+/);
        const code = String(parts[1] || "").trim().toUpperCase();
        const discount = parseInt(String(parts[2] || "").replace(/\D/g, ""), 10) || 0;
        const quota = parseInt(String(parts[3] || "").replace(/\D/g, ""), 10) || 10;

        if (!code || discount <= 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Format: <code>/buatvoucher KODE NOMINAL_DISKON KUOTA</code>\nContoh: <code>/buatvoucher LUMINE10 1000 25</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const vouchers = await getVouchers();
        vouchers[code] = {
          code,
          discount,
          quota,
          used_by: [],
        };
        await saveVouchers(vouchers);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `🎟️ Voucher <code>${escapeHtml(code)}</code> dibuat (Diskon <code>${formatRupiah(discount)}</code>, Kuota <b>${quota}</b>).`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/hapusvoucher")) {
        const code = rawText.replace("/hapusvoucher", "").trim().toUpperCase();
        const vouchers = await getVouchers();
        if (code && vouchers[code]) {
          delete vouchers[code];
          await saveVouchers(vouchers);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `🗑️ Voucher <code>${escapeHtml(code)}</code> dihapus.`,
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

      // ADMIN: /setreseller, /addreseller, /delreseller, /listreseller
      if (rawText.startsWith("/setreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/setreseller\s*/i, "").trim();
        const cfg = await getResellerConfig();

        if (!arg) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🤝 <b>PENGATURAN SISTEM RESELLER & DROPSHIP</b>\n\n" +
              `• Status: ${cfg.enabled ? "✅ <b>AKTIF</b>" : "❌ <b>NONAKTIF</b>"}\n` +
              `• Biaya Aktivasi Daftar: <b>${cfg.reg_fee > 0 ? formatRupiah(cfg.reg_fee) : "Rp 0 (Hanya ACC Admin)"}</b>\n` +
              `• Diskon Kulakan Saldo: <b>${cfg.reseller_discount_pct}%</b>\n` +
              `• Komisi Dropship Buyer: <b>${cfg.dropship_comm_pct}%</b>\n` +
              `• Min. Saldo Kulakan: <b>${formatRupiah(cfg.min_saldo_kulakan)}</b>\n` +
              `• Maks. Beli Judul Sama/Hari: <b>${cfg.max_same_item_daily}x</b>\n\n` +
              "<b>Perintah Pengaturan:</b>\n" +
              "• <code>/setreseller fee 15000</code> (0 = wajib ACC manual)\n" +
              "• <code>/setreseller diskon 30</code> (% diskon kulakan)\n" +
              "• <code>/setreseller komisi 25</code> (% komisi dropship)\n" +
              "• <code>/setreseller minsaldo 5000</code>\n" +
              "• <code>/setreseller limit 2</code> (maks beli item sama/hari)\n" +
              "• <code>/setreseller on</code> / <code>off</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const parts = arg.split(/\s+/);
        const sub = parts[0].toLowerCase();
        const val = parseInt(parts[1], 10);

        if (sub === "on" || sub === "off") {
          cfg.enabled = sub === "on";
          await saveResellerConfig(cfg);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `✅ Sistem Reseller & Dropship ${cfg.enabled ? "<b>DIAKTIFKAN</b>" : "<b>DIMATIKAN</b>"}.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (sub === "fee" && !isNaN(val) && val >= 0) {
          cfg.reg_fee = val;
          await saveResellerConfig(cfg);
        } else if (sub === "diskon" && !isNaN(val) && val >= 0 && val <= 80) {
          cfg.reseller_discount_pct = val;
          await saveResellerConfig(cfg);
        } else if (sub === "komisi" && !isNaN(val) && val >= 0 && val <= 80) {
          cfg.dropship_comm_pct = val;
          await saveResellerConfig(cfg);
        } else if (sub === "minsaldo" && !isNaN(val) && val >= 0) {
          cfg.min_saldo_kulakan = val;
          await saveResellerConfig(cfg);
        } else if (sub === "limit" && !isNaN(val) && val >= 1 && val <= 50) {
          cfg.max_same_item_daily = val;
          await saveResellerConfig(cfg);
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Parameter salah. Ketik <code>/setreseller</code> untuk melihat panduan.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: "✅ Pengaturan Reseller & Dropship berhasil diperbarui!",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/addreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const arg = rawText.replace(/^\/addreseller\s*/i, "").trim();
        const parts = arg.split(/\s+/);
        const targetUid = parts[0];
        const storeName = parts.slice(1).join(" ").trim();

        if (!targetUid || !/^\d+$/.test(targetUid)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ Format salah!\nGunakan: <code>/addreseller [user_id] [Nama Toko Opsional]</code>\n" +
              "<i>Contoh: <code>/addreseller 123456789 Sakura Store</code></i>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const rs = await registerOrActivateReseller(
          { id: targetUid, first_name: storeName || `Reseller ${targetUid}` },
          storeName
        );

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Reseller Resmi Diaktifkan!</b>\n` +
            `• <b>User ID:</b> <code>${escapeHtml(rs.user_id)}</code>\n` +
            `• <b>Nama Toko:</b> ${escapeHtml(rs.store_name)}\n` +
            `• <b>Kode Dropship:</b> <code>${escapeHtml(rs.code)}</code>`,
          parse_mode: "HTML",
        });

        await tgRequest(token, "sendMessage", {
          chat_id: targetUid,
          text:
            `🎉 <b>AKUN RESELLER KAMU SUDAH AKTIF!</b>\n\n` +
            `🏪 <b>Toko:</b> ${escapeHtml(rs.store_name)}\n` +
            `🔑 <b>Kode Dropship:</b> <code>${escapeHtml(rs.code)}</code>\n\n` +
            `Ketik <code>/reseller</code> atau klik tombol di bawah untuk membuka Dashboard Reseller.`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🤝 Buka Panel Reseller", callback_data: "menu_reseller" }]],
          },
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/delreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const targetUid = rawText.replace(/^\/delreseller\s*/i, "").trim();
        const existing = await getResellerRaw(targetUid);
        if (!existing) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ User ID tersebut tidak terdaftar sebagai reseller.",
          });
          return res.status(200).json({ ok: true });
        }
        existing.active = false;
        await saveReseller(existing);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: `✅ Status reseller untuk ID <code>${escapeHtml(targetUid)}</code> (${escapeHtml(existing.store_name)}) telah dicabut.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/listreseller")) {
        if (!isAdmin) return res.status(200).json({ ok: true });
        const list = await getAllResellers();
        if (list.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "🤝 Belum ada reseller aktif saat ini.",
          });
          return res.status(200).json({ ok: true });
        }
        let msgOut = `🤝 <b>DAFTAR RESELLER AKTIF (${list.length})</b>\n\n`;
        list.slice(0, 25).forEach((r, idx) => {
          msgOut +=
            `${idx + 1}. <b>${escapeHtml(r.store_name)}</b> (<code>${escapeHtml(r.user_id)}</code>)\n` +
            `   • Kode: <code>${escapeHtml(r.code)}</code> | Kulakan: ${r.total_kulakan || 0}x | Dropship: ${r.total_sales || 0}x (${formatRupiah(r.total_commission || 0)})\n`;
        });
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text: msgOut,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // USER: /reseller & /dropship
      if (rawText.startsWith("/reseller")) {
        await sendResellerMenu(token, chatId, senderId);
        return res.status(200).json({ ok: true });
      }

      if (rawText.startsWith("/dropship")) {
        const codeArg = rawText.replace(/^\/dropship\s*/i, "").trim().toUpperCase();
        if (!codeArg) {
          const activeDs = await getBuyerDropshipReseller(senderId);
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🏪 <b>MODE DROPSHIP / PARTNER TOKO</b>\n\n" +
              (activeDs
                ? `✅ Terhubung ke Partner: <b>${escapeHtml(activeDs.store_name)}</b> (<code>${escapeHtml(activeDs.code)}</code>)\n\n`
                : "") +
              "Masukkan kode dropship dari reseller sebelum belanja:\n" +
              "<code>/dropship DS-XXXX</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const targetReseller = await getResellerByDropshipCode(codeArg);
        if (!targetReseller) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `❌ Kode dropship <b>${escapeHtml(codeArg)}</b> tidak ditemukan atau sudah nonaktif.`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        // ANTI-CURANG: Blokir jika reseller pakai kode miliknya sendiri
        if (String(targetReseller.user_id) === String(senderId)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "🚫 <b>Anti-Curang:</b> Kamu tidak dapat menggunakan kode dropship milikmu sendiri untuk transaksi pribadi.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        await setBuyerDropshipRef(senderId, targetReseller.user_id);
        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>TERHUBUNG KE PARTNER RESELLER!</b>\n\n` +
            `🏪 <b>Toko:</b> ${escapeHtml(targetReseller.store_name)}\n` +
            `🔑 <b>Kode:</b> <code>${escapeHtml(targetReseller.code)}</code>\n\n` +
            `Silakan pilih paket di Katalog untuk melanjutkan pembelian 👇`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "🛍️ Buka Katalog", callback_data: "menu_katalog" }]],
          },
        });
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
              "<code>/broadcast Halo guys! Mini Set baru sudah rilis!</code>\n" +
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

        if (text === "/start" || text.startsWith("/start ")) {
          const startParam = text.replace(/^\/start\s*/i, "").trim();
          let dsNotice = "";

          if (startParam.toLowerCase().startsWith("ds_")) {
            const dsCode = startParam.slice(3).trim().toUpperCase();
            const targetReseller = await getResellerByDropshipCode(dsCode);
            if (targetReseller) {
              if (String(targetReseller.user_id) === String(senderId)) {
                dsNotice = "\n\n🚫 <i>Anti-Curang: Kode dropship milik sendiri tidak berlaku.</i>";
              } else {
                await setBuyerDropshipRef(senderId, targetReseller.user_id);
                dsNotice = `\n\n🏪 <b>Partner Toko:</b> ${escapeHtml(targetReseller.store_name)} (<code>${escapeHtml(targetReseller.code)}</code>)`;
              }
            }
          }

          const buyerName = escapeHtml((msg.from && msg.from.first_name) || "Kak");
          let headerText = `👋 Halo <b>${buyerName}</b>! Selamat datang di <b>Lumine Photopack Store</b>.${dsNotice}`;

          if (isAdmin) {
            headerText +=
              "\n\n🛠️ <b>Panel Admin Lengkap (Bot Utama):</b>\n" +
              "• <code>/setmacro</code> — Link & Setting Auto-ACC Makro\n" +
              "• <code>/setreseller</code> | <code>/addreseller</code> | <code>/delreseller</code> | <code>/listreseller</code>\n" +
              "• <code>/addsaldo ID NOMINAL</code> | <code>/ceksaldo ID</code> — Kelola Saldo\n" +
              "• <code>/setbanner</code> | <code>/setqris</code> | <code>/settesti</code> | <code>/broadcast</code>\n" +
              "• <code>/buatvoucher KODE | DISKON | KUOTA</code>\n" +
              "• <code>/setmystery HARGA</code> | <code>/setsold</code> | <code>/resetlb</code>\n" +
              "• <code>/tambah</code> | <code>/edit</code> | <code>/hapus</code> | <code>/setbundle</code>";
          }

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: headerText,
            parse_mode: "HTML",
            reply_markup: getCompactReplyKeyboard(),
          });

          await sendMainMenuCard(token, chatId);
        } else if (text === "🤝 Reseller" || text === "🤝 Reseller & Dropship") {
          await sendResellerMenu(token, chatId, senderId);
        } else if (text === "💰 Saldo & Depo" || text === "💰 Saldo & Deposit") {
          await sendSaldoMenu(token, chatId, senderId);
        } else if (text === "🛍️ Katalog" || text === "🛍️ Katalog Mini Set") {
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
        } else {
          if (["reseller", "dropship", "mitra", "partner"].some((k) => lowerText.includes(k))) {
            await sendResellerMenu(token, chatId, senderId);
            return res.status(200).json({ ok: true });
          }

          if (["saldo", "depo", "deposit", "topup", "top up"].some((k) => lowerText.includes(k))) {
            await sendSaldoMenu(token, chatId, senderId);
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
            "Halo! Gunakan tombol menu di bawah atau ketik /start untuk membuka Katalog, 💰 Saldo & Depo, 🤝 Reseller, 🔥 Bestseller, Mystery Box, dan Koleksi Saya.\n" +
            `Butuh bantuan? Hubungi @${ADMIN_USERNAME} 🙏`;

          if (["harga", "berapa", "brp", "list", "daftar"].some((k) => lowerText.includes(k))) {
            replyText =
              "💰 <b>Info Harga Lumine Mini Set:</b>\n" +
              "• Paket Lite (5–7 Foto HD) : <b>Rp 2.000</b>\n" +
              "• Paket Standar (8–10 Foto HD) : <b>Rp 3.000</b>\n" +
              "• 🎁 <b>Promo Bundling 2 Mini Set : Rp 5.000</b>\n" +
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
                                      
