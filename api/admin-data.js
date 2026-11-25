// Endpoint data dashboard admin (READ-ONLY).
// Dilindungi password lewat env ADMIN_DASH_PASSWORD di Vercel.
// Akses: GET /api/admin-data dengan header "x-dash-key: <password>"
const crypto = require("crypto");

const REDIS_ORDER_PREFIX = "lumine_main_order_";
const REDIS_PENDING_MAP_KEY = "lumine_main_pending_orders";
const REDIS_STORE_OMSET_KEY = "lumine_main_store_omset";
const REDIS_STORE_OMSET_CNT_KEY = "lumine_main_store_omset_cnt";
const REDIS_OMSET_DAY_PREFIX = "lumine_main_omset_day_";
const REDIS_KATALOG_KEY = "lumine_main_katalog";

async function redisCommand(commandArray) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Variabel database Redis belum terhubung di Vercel.");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commandArray),
  });
  const data = await res.json();
  return data.result;
}

// Sama dengan fungsi di webhook.js: tanggal WIB (UTC+7) berformat YYYY-MM-DD
function wibDayKey(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function hgetallToMap(raw) {
  const map = {};
  if (Array.isArray(raw)) for (let i = 0; i < raw.length; i += 2) map[raw[i]] = raw[i + 1];
  return map;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const expected = process.env.ADMIN_DASH_PASSWORD;
  if (!expected) return res.status(500).json({ error: "ADMIN_DASH_PASSWORD belum diset di Vercel." });
  if (!safeEqual(req.headers["x-dash-key"] || "", expected)) {
    return res.status(401).json({ error: "Password salah." });
  }

  try {
    const now = Date.now();
    const todayKey = wibDayKey(now);
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(wibDayKey(now - i * 86400000));

    const [totalRaw, cntRaw, katalogRaw, pendingRaw, ...dayRaws] = await Promise.all([
      redisCommand(["GET", REDIS_STORE_OMSET_KEY]),
      redisCommand(["GET", REDIS_STORE_OMSET_CNT_KEY]),
      redisCommand(["GET", REDIS_KATALOG_KEY]),
      redisCommand(["HGETALL", REDIS_PENDING_MAP_KEY]),
      ...days.map((d) => redisCommand(["HGETALL", REDIS_OMSET_DAY_PREFIX + d])),
    ]);

    const chart = days.map((d, i) => {
      const m = hgetallToMap(dayRaws[i]);
      return { day: d, rupiah: parseInt(m.rupiah, 10) || 0, count: parseInt(m.count, 10) || 0 };
    });
    const today = chart.find((c) => c.day === todayKey) || { rupiah: 0, count: 0 };

    let katalogCount = 0;
    try {
      const k = katalogRaw ? JSON.parse(katalogRaw) : [];
      katalogCount = Array.isArray(k) ? k.length : 0;
    } catch {
      katalogCount = 0;
    }

    // Pesanan pending (ambil maksimal 30 untuk ditampilkan)
    const pendingMap = hgetallToMap(pendingRaw);
    const pendingIds = Object.keys(pendingMap).slice(0, 30);
    const pending = await Promise.all(
      pendingIds.map(async (id) => {
        let info = { buyer_name: "-", item_nama: "-", status: "-" };
        try {
          const raw = await redisCommand(["GET", REDIS_ORDER_PREFIX + id]);
          if (raw) {
            const o = JSON.parse(raw);
            info = {
              buyer_name: o.buyer_name || "-",
              item_nama: o.item_nama || "-",
              status: o.status || "-",
            };
          }
        } catch {
          // data order mungkin sudah kedaluwarsa (disimpan 48 jam)
        }
        return { id, nominal: parseInt(pendingMap[id], 10) || 0, ...info };
      })
    );

    return res.status(200).json({
      generated_at: new Date(now).toISOString(),
      summary: {
        omset_total: parseInt(totalRaw, 10) || 0,
        order_total: parseInt(cntRaw, 10) || 0,
        omset_today: today.rupiah,
        order_today: today.count,
        katalog_count: katalogCount,
        pending_count: Object.keys(pendingMap).length,
      },
      chart,
      pending,
    });
  } catch (err) {
    console.error("Admin dashboard error:", err && err.message);
    return res.status(500).json({ error: "Gagal mengambil data." });
  }
};
