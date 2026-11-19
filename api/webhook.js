// ==========================================
// 1. PENGATURAN UTAMA
// ==========================================
const ADMIN_USERNAME = "Fellstore1"; // Tanpa tanda @
const LINK_CH_CADANGAN = "https://t.me/+0GXaaPyrnd5kMmY1";
const LINK_CH_FREE = "https://t.me/+jf3tLqLIG444MjBI";
const REDIS_KEY = "lumine_miniset_katalog";
const REDIS_BUNDLE_KEY = "lumine_miniset_bundle";

// ==========================================
// 2. FUNGSI DATABASE (UPSTASH REDIS REST API)
// ==========================================
async function redisCommand(commandArray) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL atau TOKEN belum diatur di Vercel.");
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

async function getKatalog() {
  const raw = await redisCommand(["GET", REDIS_KEY]);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveKatalog(katalogList) {
  await redisCommand(["SET", REDIS_KEY, JSON.stringify(katalogList)]);
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

async function saveBundle(bundleObj) {
  await redisCommand(["SET", REDIS_BUNDLE_KEY, JSON.stringify(bundleObj)]);
}

// ==========================================
// 3. FUNGSI HELPER TELEGRAM API
// ==========================================
async function tgRequest(token, method, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMainMenu() {
  return {
    keyboard: [
      [{ text: "🛍️ Katalog Mini Set" }, { text: "🎁 Promo Bundling 5k" }],
      [{ text: "📋 Cara Beli & Aturan" }, { text: "💎 Upgrade CH Utama" }],
      [{ text: "🔗 Channel Lainnya" }],
    ],
    resize_keyboard: true,
  };
}

function buildKatalogKeyboard(katalogList) {
  return {
    inline_keyboard: katalogList.map((item) => [
      {
        text: `📁 ${item.nama} (${item.harga})`,
        callback_data: `detail_${item.id}`,
      },
    ]),
  };
}

function normalizeUrl(rawUrl) {
  const clean = rawUrl.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    return `https://${clean}`;
  }
  return clean;
}

async function sendPromoBundling(token, chatId, replyToMessageId = null) {
  const bundle = await getBundle();

  const promoText =
    "🎁 <b>PROMO BUNDLING HEMAT — 2 MINI SET CUMA Rp 5.000!</b>\n\n" +
    "Mau koleksi lebih dari satu set tapi tetap hemat?\n" +
    "• Harga normal 2 Mini Set : <s>Rp 6.000</s>\n" +
    "• Harga Promo Bundling : <b>Rp 5.000</b> <i>(Hemat Rp 1.000!)</i>\n\n" +
    "📌 <b>Cara Klaim Promo:</b>\n" +
    "1. Cek judul 2 set yang kamu mau di menu <b>🛍️ Katalog Mini Set</b>.\n" +
    "2. Klik tombol di bawah untuk checkout paket bundling atau konfirmasi pilihan set ke admin.\n\n" +
    "<i>Catatan: Nominal Rp 5.000 juga bisa dipakai untuk akses paket dasar di Channel Utama!</i>";

  const buttons = [];
  if (bundle.link && bundle.link.trim() !== "") {
    buttons.push([
      {
        text: "⚡ Ambil Promo 2 Mini Set (Rp 5.000)",
        url: bundle.link.trim(),
      },
    ]);
  }
  buttons.push([
    {
      text: `💬 Pilih Set & Klaim via Admin (@${ADMIN_USERNAME})`,
      url: `https://t.me/${ADMIN_USERNAME}`,
    },
  ]);

  const payload = {
    chat_id: chatId,
    text: promoText,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  };

  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  await tgRequest(token, "sendMessage", payload);
}

// ==========================================
// 4. HANDLER UTAMA SERVERLESS VERCEL
// ==========================================
module.exports = async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "BOT_TOKEN belum diisi di Environment Variables Vercel.",
    });
  }

  // Endpoint cek status & aktivasi Webhook lewat browser
  if (req.method === "GET") {
    if (req.query.setup === "true") {
      const webhookUrl = `https://${req.headers.host}/api/webhook`;
      const result = await tgRequest(token, "setWebhook", {
        url: webhookUrl,
      });
      return res.status(200).json({
        status: "Webhook berhasil diatur",
        webhook_url: webhookUrl,
        database_connected: Boolean(
          process.env.UPSTASH_REDIS_REST_URL &&
            process.env.UPSTASH_REDIS_REST_TOKEN
        ),
        telegram_response: result,
      });
    }
    return res.status(200).send("Bot Lumine Photopack | Mini Set aktif 24 jam!");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const update =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // ------------------------------------------
    // A. HANDLER KLIK TOMBOL INLINE (KATALOG)
    // ------------------------------------------
    if (update.callback_query) {
      const call = update.callback_query;
      const chatId = call.message.chat.id;
      const messageId = call.message.message_id;
      const data = call.data;

      await tgRequest(token, "answerCallbackQuery", {
        callback_query_id: call.id,
      });

      const katalogList = await getKatalog();

      if (data === "back_to_katalog") {
        await tgRequest(token, "deleteMessage", {
          chat_id: chatId,
          message_id: messageId,
        });

        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `📂 Katalog saat ini sedang diperbarui. Hubungi @${ADMIN_USERNAME} untuk info stok terbaru.`,
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "📂 <b>KATALOG LUMINE MINI SET</b>\n" +
              "Pilih set di bawah untuk melihat foto preview, rincian isi, dan link pembelian otomatis:",
            parse_mode: "HTML",
            reply_markup: buildKatalogKeyboard(katalogList),
          });
        }
      } else if (data.startsWith("detail_")) {
        const setId = data.replace("detail_", "");
        const selected = katalogList.find((s) => s.id === setId);

        if (!selected) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⚠️ Maaf, set ini sudah dihapus atau diperbarui. Silakan buka ulang menu <b>🛍️ Katalog Mini Set</b>.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const detailText =
          `✨ <b>${escapeHtml(selected.nama)}</b>\n\n` +
          `📸 <b>Isi:</b> ${escapeHtml(selected.isi)}\n` +
          `💰 <b>Harga:</b> ${escapeHtml(selected.harga)}\n` +
          `📝 <b>Info:</b> ${escapeHtml(selected.catatan)}\n\n` +
          "Klik tombol di bawah untuk langsung menuju halaman pembelian otomatis:";

        const detailMarkup = {
          inline_keyboard: [
            [
              {
                text: `⚡ Beli Set Ini (${selected.harga})`,
                url: selected.link,
              },
            ],
            [
              {
                text: "⬅️ Kembali ke Katalog",
                callback_data: "back_to_katalog",
              },
            ],
          ],
        };

        let sentWithPhoto = false;

        if (selected.preview && selected.preview.trim() !== "") {
          const photoRes = await tgRequest(token, "sendPhoto", {
            chat_id: chatId,
            photo: selected.preview.trim(),
            caption: detailText,
            parse_mode: "HTML",
            reply_markup: detailMarkup,
          });

          if (photoRes.ok) {
            sentWithPhoto = true;
            await tgRequest(token, "deleteMessage", {
              chat_id: chatId,
              message_id: messageId,
            });
          }
        }

        if (!sentWithPhoto) {
          await tgRequest(token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: detailText,
            parse_mode: "HTML",
            reply_markup: detailMarkup,
          });
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ------------------------------------------
    // B. HANDLER PESAN MASUK (ADMIN & PEMBELI)
    // ------------------------------------------
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const senderUsername = (msg.from?.username || "").toLowerCase();
      const isAdmin = senderUsername === ADMIN_USERNAME.toLowerCase();

      const rawText = (msg.text || msg.caption || "").trim();
      const lowerText = rawText.toLowerCase();

      // 1. PERINTAH ADMIN: /tambah
      if (lowerText.startsWith("/tambah")) {
        if (!isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⛔ Perintah ini hanya bisa digunakan oleh admin.",
          });
          return res.status(200).json({ ok: true });
        }

        const payloadStr = rawText.replace(/^\/tambah\s*/i, "").trim();
        const parts = payloadStr.split("|").map((p) => p.trim());

        if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2] || !parts[3]) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "⚠️ <b>Format /tambah kurang lengkap!</b>\n\n" +
              "Gunakan pemisah tanda garis tegak ( <code>|</code> ) seperti ini:\n" +
              "<code>/tambah Nama Set | Isi | Harga | Link</code>\n\n" +
              "<b>Contoh (bisa dikirim bareng foto preview):</b>\n" +
              "<code>/tambah Lumine Casual | 6 Foto HD | Rp 2.000 | https://lynk.id/lumine1</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const [nama, isi, harga, rawLink, customCatatan] = parts;
        const link = normalizeUrl(rawLink);
        const catatan =
          customCatatan ||
          "Paket hemat HD (No Watermark), file otomatis terbuka setelah bayar.";

        let previewFileId = "";
        if (msg.photo && msg.photo.length > 0) {
          previewFileId = msg.photo[msg.photo.length - 1].file_id;
        }

        const katalogList = await getKatalog();
        const newItem = {
          id: `set_${Date.now()}`,
          nama,
          isi,
          harga,
          catatan,
          preview: previewFileId,
          link,
        };

        katalogList.push(newItem);
        await saveKatalog(katalogList);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "✅ <b>Berhasil ditambahkan ke Katalog!</b>\n\n" +
            `📁 <b>Nama:</b> ${escapeHtml(newItem.nama)}\n` +
            `📸 <b>Isi:</b> ${escapeHtml(newItem.isi)}\n` +
            `💰 <b>Harga:</b> ${escapeHtml(newItem.harga)}\n` +
            `🖼️ <b>Foto Preview:</b> ${previewFileId ? "Terpasang ✅" : "Tidak ada"}\n` +
            `🔗 <b>Link:</b> ${escapeHtml(newItem.link)}\n\n` +
            `Total katalog aktif sekarang: <b>${katalogList.length} set</b>.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 2. PERINTAH ADMIN: /edit
      if (lowerText.startsWith("/edit")) {
        if (!isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⛔ Perintah ini hanya bisa digunakan oleh admin.",
          });
          return res.status(200).json({ ok: true });
        }

        const katalogList = await getKatalog();
        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "📂 Katalog masih kosong, belum ada set yang bisa diedit.",
          });
          return res.status(200).json({ ok: true });
        }

        const payloadStr = rawText.replace(/^\/edit\s*/i, "").trim();
        const parts = payloadStr.split("|").map((p) => p.trim());
        const indexNum = parseInt(parts[0], 10);

        if (msg.photo && msg.photo.length > 0) {
          if (isNaN(indexNum) || indexNum < 1 || indexNum > katalogList.length) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                "⚠️ Nomor set tidak valid. Ketik <code>/edit</code> dulu untuk melihat nomor urut set, lalu kirim ulang foto dengan caption <code>/edit [nomor]</code>.",
              parse_mode: "HTML",
            });
            return res.status(200).json({ ok: true });
          }

          const target = katalogList[indexNum - 1];
          target.preview = msg.photo[msg.photo.length - 1].file_id;
          await saveKatalog(katalogList);

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `✅ Foto preview untuk set <b>#${indexNum} (${escapeHtml(target.nama)})</b> berhasil diperbarui!`,
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (
          parts.length < 3 ||
          isNaN(indexNum) ||
          indexNum < 1 ||
          indexNum > katalogList.length ||
          !parts[1] ||
          !parts[2]
        ) {
          const listText = katalogList
            .map(
              (item, idx) =>
                `${idx + 1}. <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})`
            )
            .join("\n");

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "✏️ <b>EDIT DATA KATALOG</b>\n\n" +
              `${listText}\n\n` +
              "<b>Format Edit Teks:</b>\n" +
              "<code>/edit [nomor] | [bagian] | [nilai_baru]</code>\n\n" +
              "<b>Bagian yang bisa diubah:</b> <code>link</code>, <code>harga</code>, <code>nama</code>, <code>isi</code>, <code>catatan</code>\n" +
              "<b>Contoh:</b>\n" +
              "• <code>/edit 1 | link | https://lynk.id/link-baru</code>\n" +
              "• <code>/edit 1 | harga | Rp 3.000</code>\n\n" +
              "<b>Ganti Foto Preview:</b>\n" +
              "Kirim foto baru dengan caption <code>/edit [nomor]</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const field = parts[1].toLowerCase();
        const allowedFields = ["nama", "isi", "harga", "link", "catatan"];

        if (!allowedFields.includes(field)) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              `⚠️ Bagian <code>${escapeHtml(field)}</code> tidak dikenali.\n` +
              "Gunakan salah satu: <code>link</code>, <code>harga</code>, <code>nama</code>, <code>isi</code>, atau <code>catatan</code>.",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const target = katalogList[indexNum - 1];
        const oldValue = target[field];
        const newValue = field === "link" ? normalizeUrl(parts[2]) : parts[2];

        target[field] = newValue;
        await saveKatalog(katalogList);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `✅ <b>Set #${indexNum} (${escapeHtml(target.nama)}) berhasil diperbarui!</b>\n\n` +
            `• <b>Bagian diubah:</b> ${field.toUpperCase()}\n` +
            `• <b>Sebelumnya:</b> ${escapeHtml(oldValue)}\n` +
            `• <b>Sekarang:</b> ${escapeHtml(newValue)}`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 3. PERINTAH ADMIN: /hapus
      if (lowerText.startsWith("/hapus")) {
        if (!isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⛔ Perintah ini hanya bisa digunakan oleh admin.",
          });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/hapus\s*/i, "").trim();
        const katalogList = await getKatalog();

        if (katalogList.length === 0) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "📂 Katalog masih kosong, belum ada set yang bisa dihapus.",
          });
          return res.status(200).json({ ok: true });
        }

        const indexNum = parseInt(arg, 10);

        if (!arg || isNaN(indexNum) || indexNum < 1 || indexNum > katalogList.length) {
          const listText = katalogList
            .map(
              (item, idx) =>
                `${idx + 1}. <b>${escapeHtml(item.nama)}</b> (${escapeHtml(item.harga)})`
            )
            .join("\n");

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🗑️ <b>DAFTAR KATALOG SAAT INI:</b>\n\n" +
              `${listText}\n\n` +
              "Ketik <code>/hapus [nomor]</code> untuk menghapus.\n" +
              "Contoh: <code>/hapus 1</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        const removed = katalogList.splice(indexNum - 1, 1)[0];
        await saveKatalog(katalogList);

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            `🗑️ Set <b>${escapeHtml(removed.nama)}</b> (${escapeHtml(removed.harga)}) berhasil dihapus dari katalog.\n` +
            `Sisa katalog aktif: <b>${katalogList.length} set</b>.`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 4. PERINTAH ADMIN: /setbundle
      if (lowerText.startsWith("/setbundle")) {
        if (!isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "⛔ Perintah ini hanya bisa digunakan oleh admin.",
          });
          return res.status(200).json({ ok: true });
        }

        const arg = rawText.replace(/^\/setbundle\s*/i, "").trim();
        const currentBundle = await getBundle();

        if (!arg) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🎁 <b>PENGATURAN LINK PROMO BUNDLING 5K</b>\n\n" +
              `• <b>Link saat ini:</b> ${
                currentBundle.link
                  ? escapeHtml(currentBundle.link)
                  : "<i>Belum dipasang (tombol langsung arahkan ke chat admin)</i>"
              }\n\n` +
              "<b>Cara pasang link otomatis:</b>\n" +
              "<code>/setbundle https://link-bundling-kamu.com</code>\n\n" +
              "<b>Cara hapus link (kembali ke chat admin):</b>\n" +
              "<code>/setbundle hapuslink</code>",
            parse_mode: "HTML",
          });
          return res.status(200).json({ ok: true });
        }

        if (arg.toLowerCase() === "hapuslink") {
          await saveBundle({ link: "" });
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: "✅ Link promo bundling dihapus. Tombol promo sekarang mengarahkan pembeli langsung ke chat admin.",
          });
          return res.status(200).json({ ok: true });
          }

        const cleanLink = normalizeUrl(arg);
        await saveBundle({ link: cleanLink });

        await tgRequest(token, "sendMessage", {
          chat_id: chatId,
          text:
            "✅ <b>Link Promo Bundling 5k berhasil diperbarui!</b>\n" +
            `🔗 ${escapeHtml(cleanLink)}`,
          parse_mode: "HTML",
        });
        return res.status(200).json({ ok: true });
      }

      // 5. JIKA KIRIM FOTO TANPA /tambah ATAU /edit
      if (msg.photo) {
        if (isAdmin) {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "💡 Gunakan caption berikut saat mengirim foto:\n" +
              "• Tambah set baru: <code>/tambah Nama Set | Isi | Harga | Link</code>\n" +
              "• Ganti foto set lama: <code>/edit [nomor]</code>",
            parse_mode: "HTML",
            reply_to_message_id: msg.message_id,
          });
        } else {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "Pembelian di sini diproses otomatis lewat link di masing-masing set.\n" +
              `Jika ingin mengirim bukti transfer atau ada kendala akses, silakan chat admin langsung di @${ADMIN_USERNAME} 🙏`,
            reply_to_message_id: msg.message_id,
          });
        }
        return res.status(200).json({ ok: true });
      }

      // 6. MENU UTAMA & AUTO-REPLY PEMBELI
      if (msg.text) {
        const text = msg.text.trim();

        if (text === "/start") {
          let welcomeText =
            "✨ <b>Selamat datang di Bot Lumine Photopack | Mini Set!</b> ✨\n\n" +
            "Di sini kamu bisa cek katalog paket hemat & eceran (kualitas tetap HD, tanpa watermark).\n\n" +
            "💰 <b>Daftar Harga:</b>\n" +
            "• Paket Lite (5–7 Foto) : <b>Rp 2.000</b>\n" +
            "• Paket Standar (8–10 Foto) : <b>Rp 3.000</b>\n" +
            "• 🎁 <b>Promo Bundling 2 Mini Set : Rp 5.000</b>\n\n" +
            "⚡ <b>Sistem 1 Link = 1 Set:</b>\n" +
            "Pilih set di katalog, cek foto preview-nya, klik link order, bayar via QRIS/E-Wallet, dan file langsung terbuka otomatis!\n\n" +
            "Silakan pilih menu di bawah ini 👇";

          if (isAdmin) {
            welcomeText +=
              "\n\n🛠️ <b>Mode Admin Aktif:</b>\n" +
              "• <code>/tambah Nama | Isi | Harga | Link</code> (bisa bareng foto)\n" +
              "• <code>/edit</code> untuk ubah link, harga, atau foto set\n" +
              "• <code>/hapus</code> untuk hapus set dari katalog\n" +
              "• <code>/setbundle</code> untuk atur link promo bundling 5k";
          }

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: welcomeText,
            parse_mode: "HTML",
            reply_markup: getMainMenu(),
          });
        } else if (text === "🛍️ Katalog Mini Set") {
          const katalogList = await getKatalog();

          if (katalogList.length === 0) {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                "📂 Katalog Mini Set sedang diperbarui.\n" +
                `Silakan cek berkala atau hubungi admin @${ADMIN_USERNAME} untuk info stok terbaru.`,
            });
          } else {
            await tgRequest(token, "sendMessage", {
              chat_id: chatId,
              text:
                "📂 <b>KATALOG LUMINE MINI SET</b>\n" +
                "Pilih set di bawah untuk melihat foto preview, rincian isi, dan link pembelian otomatis:",
              parse_mode: "HTML",
              reply_markup: buildKatalogKeyboard(katalogList),
            });
          }
        } else if (text === "🎁 Promo Bundling 5k") {
          await sendPromoBundling(token, chatId);
        } else if (text === "📋 Cara Beli & Aturan") {
          const rulesText =
            "📋 <b>PANDUAN & ATURAN PEMBELIAN</b>\n\n" +
            "1️⃣ <b>Sistem 1 Link = 1 Set</b>\n" +
            "Setiap Mini Set memiliki link pembelian khusus masing-masing.\n\n" +
            "2️⃣ <b>Langkah Order Otomatis</b>\n" +
            "• Pilih judul set di menu <b>Katalog Mini Set</b>.\n" +
            "• Cek foto preview lalu klik tombol <b>Beli Set Ini</b>.\n" +
            "• Selesaikan pembayaran (QRIS / E-Wallet).\n" +
            "• Akses file otomatis terbuka setelah pembayaran sukses tanpa perlu menunggu admin.\n\n" +
            "3️⃣ <b>Aturan & Bantuan</b>\n" +
            "• Pastikan nominal transfer sesuai tagihan agar sistem otomatis memproses.\n" +
            "• Dilarang menyebarluaskan ulang konten yang sudah dibeli.\n" +
            `• Ada kendala link atau gagal akses? Hubungi admin: @${ADMIN_USERNAME}`;

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: rulesText,
            parse_mode: "HTML",
          });
        } else if (text === "💎 Upgrade CH Utama") {
          const upgradeText =
            "💎 <b>UPGRADE KE FULL SET (CHANNEL UTAMA)</b>\n\n" +
            "Kurang puas dengan versi mini? Di <b>Channel Utama</b>, kamu bisa dapatkan:\n" +
            "✅ Full Set lengkap (isi <b>20 – 40+ foto HD</b>)\n" +
            "✅ <b>Bonus Video</b> eksklusif\n" +
            "✅ Harga tetap terjangkau: <b>Rp 5.000 – Rp 10.000</b>\n\n" +
            "Klik tombol di bawah untuk langsung chat admin dan minta akses Channel Utama 👇";

          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text: upgradeText,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💬 Chat Admin untuk Join CH Utama",
                    url: `https://t.me/${ADMIN_USERNAME}`,
                  },
                ],
              ],
            },
          });
        } else if (text === "🔗 Channel Lainnya") {
          await tgRequest(token, "sendMessage", {
            chat_id: chatId,
            text:
              "🔗 <b>TAUTAN CHANNEL RESMI LUMINE</b>\n\n" +
              "Jangan lupa join channel cadangan dan channel asupan gratis di bawah ini:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🛡️ Channel Cadangan", url: LINK_CH_CADANGAN }],
                [{ text: "🎁 Channel Asupan Free", url: LINK_CH_FREE }],
                [
                  {
                    text: `👤 Admin Support (@${ADMIN_USERNAME})`,
                    url: `https://t.me/${ADMIN_USERNAME}`,
                  },
                ],
              ],
            },
          });
        } else {
          // AUTO-REPLY KATA KUNCI SESUAI ATURAN
          if (
            ["bundling", "bundle", "promo", "diskon", "2 set"].some((k) =>
              lowerText.includes(k)
            )
          ) {
            await sendPromoBundling(token, chatId, msg.message_id);
            return res.status(200).json({ ok: true });
          }

          let replyText = "";

          if (
            ["harga", "berapa", "brp", "list", "daftar"].some((k) =>
              lowerText.includes(k)
            )
          ) {
            replyText =
              "💰 <b>Info Harga Lumine Mini Set:</b>\n" +
              "• Paket Lite (5–7 Foto HD) : <b>Rp 2.000</b>\n" +
              "• Paket Standar (8–10 Foto HD) : <b>Rp 3.000</b>\n" +
              "• 🎁 <b>Promo Bundling 2 Mini Set : Rp 5.000</b>\n\n" +
              "Untuk versi Full Set (20–40+ foto + video) di Channel Utama harganya <b>Rp 5.000 – Rp 10.000</b>.\n" +
              "Klik menu <b>🛍️ Katalog Mini Set</b> untuk cek foto preview dan pilih set-nya!";
          } else if (
            ["cara", "beli", "order", "bayar", "qris", "link"].some((k) =>
              lowerText.includes(k)
            )
          ) {
            replyText =
              "⚡ <b>Cara Order Otomatis:</b>\n" +
              "Kami memakai sistem <b>1 Link = 1 Set</b>.\n" +
              "1. Buka menu <b>🛍️ Katalog Mini Set</b>.\n" +
              "2. Pilih set yang dimau lalu klik tombol <b>Beli Set Ini</b>.\n" +
              "3. Bayar via QRIS/E-Wallet, dan link file langsung terbuka otomatis setelah lunas!";
          } else if (
            ["utama", "full", "upgrade", "lengkap", "video"].some((k) =>
              lowerText.includes(k)
            )
          ) {
            replyText =
              "💎 <b>Info Channel Utama (Full Set):</b>\n" +
              "Full Set berisi 20–40+ foto HD + bonus video dengan harga <b>Rp 5.000 – Rp 10.000</b>.\n" +
              `Silakan hubungi admin @${ADMIN_USERNAME} untuk info akses Channel Utama.`;
          } else if (
            ["kendala", "error", "gagal", "admin", "cs", "bantuan"].some((k) =>
              lowerText.includes(k)
            )
          ) {
            replyText = `👤 Jika mengalami kendala pada link pembayaran atau akses file, silakan langsung chat admin kami di @${ADMIN_USERNAME}.`;
          } else if (
            ["free", "gratis", "cadangan"].some((k) => lowerText.includes(k))
          ) {
            replyText =
              `🎁 <b>Channel Asupan Free:</b>\n${LINK_CH_FREE}\n\n` +
              `🛡️ <b>Channel Cadangan:</b>\n${LINK_CH_CADANGAN}`;
          } else {
            replyText =
              "Halo! Gunakan tombol menu di bawah untuk melihat katalog, promo bundling 5k, foto preview, dan aturan pembelian.\n" +
              `Jika butuh bantuan langsung, silakan hubungi @${ADMIN_USERNAME} 🙏`;
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
