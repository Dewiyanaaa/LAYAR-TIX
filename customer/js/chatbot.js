// chatbot.js — Dedicated Chatbot Assistant Page for LayarTix
'use strict';

const user = (typeof LT !== 'undefined' && LT.requireAuth) ? LT.requireAuth('customer') : null;
const CHATBOT_STORAGE_KEY = 'layartix_chatbot_history';

function getChatbotDefaultWelcome() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return [
    {
      id: 'msg_welcome',
      sender: 'bot',
      time: timeStr,
      html: `
        <p>👋 Halo! Selamat datang di <strong>Halaman Asisten Chatbot LayarTix</strong>.</p>
        <p>Saya asisten virtual cerdas yang siap menjawab dan memandu Anda seputar aturan dan fitur resmi aplikasi LayarTix:</p>
        <ul>
          <li>⏱️ <strong>Batas bayar 10 menit</strong> untuk seluruh metode pembayaran &amp; pelepasan kursi/stok jika habis</li>
          <li>📲 <strong>Fitur Share QR</strong> (WhatsApp, Web Share API, salin ringkasan, dan unduh QR) pada tiket aktif</li>
          <li>🚫 <strong>3 Opsi pembatalan pesanan</strong> (Makanan Saja, Tiket Saja, atau Keduanya) &amp; refund 40%</li>
          <li>🍿 <strong>Stok awal Kantin F&amp;B 200</strong> &amp; restorasi otomatis saat dibatalkan / kedaluwarsa</li>
          <li>🕒 <strong>Zona waktu WIB / WITA / WIT</strong> &amp; penguncian otomatis jam tayang yang sudah lewat</li>
          <li>⭐ <strong>Ulasan film sebelum pilih jam</strong> &amp; Spoiler Protection Shield</li>
          <li>💺 <strong>3D Seat Preview bersih</strong> &amp; Group Booking / Patungan Split-Bill</li>
        </ul>
        <p style="margin-top:6px;font-size:11.5px;color:rgba(255,255,255,0.7)">Silakan ketik pertanyaan Anda pada kolom di bawah atau klik salah satu topik pertanyaan cepat!</p>
      `
    }
  ];
}

function getChatbotHistory() {
  try {
    const raw = localStorage.getItem(CHATBOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return getChatbotDefaultWelcome();
}

function saveChatbotHistory(history) {
  try {
    localStorage.setItem(CHATBOT_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {}
}

function getChatbotKnowledgeResponse(query) {
  const q = (query || '').toLowerCase().trim();

  // 1. Batas Waktu Pembayaran 10 Menit & Status Tiket
  if (
    q.includes('10 menit') || q.includes('batas waktu') || q.includes('bayar') ||
    q.includes('kedaluwarsa') || q.includes('kadaluarsa') || q.includes('habis waktu') ||
    q.includes('status tiket') || q.includes('belum selesai') || q.includes('siap dipakai') ||
    q.includes('lepas kursi') || q.includes('countdown') || q.includes('metode')
  ) {
    return `
      <p>⏱️ <strong>Batas Waktu Pembayaran 10 Menit &amp; Status Tiket:</strong></p>
      <ul>
        <li><strong>Batas Waktu Wajib 10 Menit:</strong> Setiap transaksi pesanan yang dibuat—baik menggunakan QRIS Standar, Transfer Bank VA, E-Wallet Reguler, maupun Patungan / Split Bill—memiliki batas waktu pembayaran maksimal <strong>10 menit</strong> (<code>expiresAt = createdAt + 10 menit</code>).</li>
        <li><strong>Timer Hitung Mundur Real-Time:</strong> Ditampilkan dalam format <em>MM:SS</em> baik di halaman pembayaran maupun kartu pesanan di menu <em>Tiket Anda</em> (<code>customer/html/tiket.html</code>).</li>
        <li><strong>Perubahan Status Otomatis:</strong>
          <ul>
            <li>Saat pesanan belum dibayar: status <strong>"Pembayaran Belum Selesai"</strong>.</li>
            <li>Setelah pembayaran lunas sebelum 10 menit: status langsung menjadi <strong>"Siap Dipakai"</strong>.</li>
            <li>Jika 10 menit habis tanpa konfirmasi bayar: status otomatis berubah menjadi <strong>"Kedaluwarsa / Waktu Pembayaran Habis"</strong>, tombol bayar dinonaktifkan, kursi yang sempat dikunci dilepas kembali ke publik, dan tiket dipindahkan ke tab Riwayat.</li>
          </ul>
        </li>
      </ul>
    `;
  }

  // 2. Fitur Share QR
  if (
    q.includes('share qr') || q.includes('bagikan qr') || q.includes('bagi qr') ||
    q.includes('whatsapp') || q.includes('unduh qr') || q.includes('salin qr') ||
    q.includes('web share') || q.includes('share')
  ) {
    return `
      <p>📲 <strong>Panduan Fitur "Share QR" LayarTix:</strong></p>
      <ul>
        <li><strong>Kapan Muncul:</strong> Tombol <strong>"Share QR"</strong> muncul jelas dan aktif pada setiap kartu tiket yang berstatus <strong>"Siap Dipakai"</strong> di halaman <em>Tiket Anda</em> (<code>customer/html/tiket.html</code>) serta di halaman checkout pembayaran.</li>
        <li><strong>4 Opsi Berbagi Lengkap:</strong>
          <ol>
            <li><strong>WhatsApp:</strong> Membuka aplikasi WhatsApp dengan pesan terformat rapi berisi judul film, mall/bioskop, studio, nomor kursi, jadwal (WIB/WITA/WIT), dan link/kode tiket.</li>
            <li><strong>Aplikasi Lain:</strong> Memanggil Web Share API bawaan sistem browser/ponsel.</li>
            <li><strong>Salin Info / Ringkasan:</strong> Menyalin seluruh rincian tiket ke clipboard untuk ditempelkan ke aplikasi pesan lain.</li>
            <li><strong>Unduh Gambar QR:</strong> Mengunduh gambar QR Code resmi tiket untuk disimpan langsung di galeri foto.</li>
          </ol>
        </li>
      </ul>
    `;
  }

  // 3. Aturan Pembatalan 3 Opsi
  if (
    q.includes('batal') || q.includes('pembatalan') || q.includes('refund') ||
    q.includes('cancel') || q.includes('makanan saja') || q.includes('tiket saja') ||
    q.includes('keduanya') || q.includes('40%')
  ) {
    return `
      <p>🚫 <strong>Aturan 3 Opsi Pembatalan Pesanan di LayarTix:</strong></p>
      <ul>
        <li>Pembatalan dapat diajukan secara mandiri melalui tombol <strong>"Batalkan Pesanan"</strong> pada kartu tiket aktif sebelum jadwal film tayang dimulai.</li>
        <li><strong>3 Pilihan Pembatalan Fleksibel:</strong>
          <ol>
            <li><strong>Makanan Saja:</strong> Membatalkan pesanan F&B saja (stok F&B otomatis dikembalikan ke kantin), sedangkan tiket bioskop tetap aktif digunakan menonton.</li>
            <li><strong>Tiket Saja:</strong> Membatalkan tiket nonton saja (mendapatkan refund 40%), pesanan F&B tetap bisa diambil dan dinikmati di bioskop.</li>
            <li><strong>Keduanya:</strong> Membatalkan tiket nonton (refund 40%) sekaligus seluruh pesanan makanan/minuman (stok F&B dikembalikan penuh).</li>
          </ol>
        </li>
        <li>Dana refund 40% langsung diproses kembali dalam waktu 1x24 jam ke rekening atau e-wallet asal transaksi.</li>
      </ul>
    `;
  }

  // 4. Manajemen Stok F&B (Default 200)
  if (
    q.includes('stok') || q.includes('f&b') || q.includes('makanan') ||
    q.includes('minuman') || q.includes('kantin') || q.includes('popcorn') ||
    q.includes('200')
  ) {
    return `
      <p>🍿 <strong>Sistem Manajemen Stok Kantin F&B:</strong></p>
      <ul>
        <li><strong>Stok Awal 200 per Item:</strong> Setiap item menu makanan dan minuman memiliki kuota awal sebanyak <strong>200 porsi</strong> yang tersimpan persisten di sistem.</li>
        <li><strong>Pengurangan Otomatis:</strong> Stok berkurang secara real-time saat pesanan dibuat dan dibayar oleh pengguna.</li>
        <li><strong>Proteksi Habis:</strong> Jika stok suatu item mencapai 0, menu otomatis berstatus <em>"Stok Habis"</em> dan tombol pemesanan dinonaktifkan.</li>
        <li><strong>Pemulihan Stok Otomatis:</strong> Apabila pesanan F&B dibatalkan oleh pengguna atau transaksi kedaluwarsa (10 menit habis), stok item akan otomatis <strong>dikembalikan</strong> ke inventaris kantin.</li>
      </ul>
    `;
  }

  // 5. Penyesuaian Zona Waktu (WIB / WITA / WIT) & Penguncian Jadwal Lewat
  if (
    q.includes('zona waktu') || q.includes('wib') || q.includes('wita') ||
    q.includes('wit') || q.includes('jadwal lewat') || q.includes('jam tayang') ||
    q.includes('terkunci') || q.includes('sudah lewat')
  ) {
    return `
      <p>🕒 <strong>Zona Waktu Bioskop &amp; Penguncian Jadwal Lewat:</strong></p>
      <ul>
        <li><strong>Penyesuaian Otomatis Kota:</strong> Jam tayang bioskop diselaraskan langsung dengan zona waktu kota bioskop yang dipilih:
          <ul>
            <li><strong>WIB (UTC+7):</strong> Jakarta, Bandung, Surabaya, Medan, dll.</li>
            <li><strong>WITA (UTC+8):</strong> Makassar, Denpasar, Balikpapan, Manado, dll.</li>
            <li><strong>WIT (UTC+9):</strong> Jayapura, Ambon, Sorong, dll.</li>
          </ul>
        </li>
        <li><strong>Penguncian Otomatis:</strong> Jam tayang yang telah lewat dari waktu lokal kota saat ini akan otomatis berstatus <strong>"Sudah Lewat"</strong> (dicoret &amp; dinonaktifkan) untuk mencegah kesalahan pemesanan tiket yang sudah berlalu.</li>
      </ul>
    `;
  }

  // 6. Ulasan per Film & Spoiler Protection Shield
  if (
    q.includes('ulasan') || q.includes('review') || q.includes('rating') ||
    q.includes('bintang') || q.includes('spoiler') || q.includes('shield')
  ) {
    return `
      <p>⭐ <strong>Fitur Ulasan per Film &amp; Spoiler Protection:</strong></p>
      <ul>
        <li><strong>Letak Panel:</strong> Panel ulasan tampil langsung di halaman detail film (<code>bioskop_jam.html</code>) tepat setelah informasi film dan <strong>sebelum</strong> Anda memilih mall &amp; jam tayang.</li>
        <li><strong>Isolasi Data per Film:</strong> Ulasan dan rating rata-rata disimpan terpisah per film (<code>movieId</code>) sehingga tidak tercampur dengan film lain.</li>
        <li><strong>Form Ulasan Baru:</strong> Anda dapat memberikan rating bintang 1–5 yang interaktif, nama (opsional), dan teks ulasan pengalaman nonton.</li>
        <li><strong>Spoiler Protection Shield:</strong> Ulasan yang ditandai spoiler akan otomatis di-blur secara aman dan dilengkapi tombol <em>"👁️ Buka Spoiler"</em> agar tidak merusak pengalaman penonton lain.</li>
      </ul>
    `;
  }

  // 7. 3D Seat Preview & Group Booking / Split-Bill
  if (
    q.includes('3d') || q.includes('seat preview') || q.includes('kursi') ||
    q.includes('group booking') || q.includes('split bill') || q.includes('patungan')
  ) {
    return `
      <p>💺 <strong>3D Seat Preview &amp; Group Booking:</strong></p>
      <ul>
        <li><strong>3D Seat Preview Bersih:</strong> Layar bioskop 3D melengkung mensimulasikan sudut pandang realistis posisi duduk Anda ke layar utama bioskop tanpa tampilan teks teknis sudut/elevasi POV yang mengganggu.</li>
        <li><strong>Group Booking:</strong> Anda dapat memesan banyak kursi sekaligus dalam satu transaksi untuk menonton bersama teman atau rombongan keluarga.</li>
        <li><strong>Patungan / Split Bill:</strong> Tersedia opsi patungan dengan 1 QR Code pembayaran terpusat yang praktis.</li>
      </ul>
    `;
  }

  // 8. Pencarian Film & Mall
  if (
    q.includes('cari film') || q.includes('cari mall') || q.includes('search') ||
    q.includes('mall') || q.includes('bioskop') || q.includes('cari')
  ) {
    return `
      <p>🔍 <strong>Pencarian Film &amp; Mall di LayarTix:</strong></p>
      <ul>
        <li><strong>Pencarian Film:</strong> Tersedia di halaman beranda untuk menyaring judul film, genre, dan status penayangan.</li>
        <li><strong>Pencarian Mall/Bioskop:</strong> Di halaman pemilihan jadwal (<code>bioskop_jam.html</code>), tersedia kotak pencarian live untuk mencari nama bioskop atau mall di kota pilihan Anda secara instan.</li>
      </ul>
    `;
  }

  // 9. Penegasan Tidak Ada Fitur Parkir
  if (
    q.includes('parkir') || q.includes('parking') || q.includes('kendaraan') ||
    q.includes('mobil') || q.includes('motor') || q.includes('karcis')
  ) {
    return `
      <p>🅿️ <strong>Penegasan Fitur Parkir:</strong></p>
      <p>Aplikasi web LayarTix <strong>TIDAK memiliki fitur informasi maupun reservasi parkir</strong>. Seluruh menu dan tautan terkait parkir telah dihapus penuh dari sistem.</p>
      <p>Untuk kebutuhan parkir kendaraan, silakan mengikuti aturan dan tarif resmi pengelola mall lokasi bioskop masing-masing.</p>
    `;
  }

  // Fallback Respons Umum
  return `
    <p>Halo! Saya <strong>Asisten LayarTix</strong>. Saya siap menjawab pertanyaan seputar fitur resmi aplikasi:</p>
    <ul>
      <li>⏱️ <strong>Batas bayar 10 menit</strong> &amp; status tiket "Siap Dipakai" vs "Pembayaran Belum Selesai"</li>
      <li>📲 <strong>Cara Share QR</strong> tiket ke WhatsApp / Web Share</li>
      <li>🚫 <strong>Aturan 3 opsi pembatalan</strong> (Makanan / Tiket / Keduanya)</li>
      <li>🍿 <strong>Stok Kantin F&amp;B 200</strong> &amp; pengembalian stok otomatis</li>
      <li>🕒 <strong>Zona waktu WIB / WITA / WIT</strong> &amp; kunci jadwal lewat</li>
      <li>⭐ <strong>Ulasan film</strong> &amp; Spoiler Protection Shield</li>
      <li>💺 <strong>3D Seat Preview</strong> &amp; Group Booking</li>
    </ul>
    <p>Silakan klik salah satu tombol pertanyaan cepat di atas atau ketik pertanyaan Anda!</p>
  `;
}

function renderChatbotMessages() {
  const container = document.getElementById('chatbotMessages');
  if (!container) return;

  const history = getChatbotHistory();
  container.innerHTML = history.map(msg => {
    const isBot = msg.sender === 'bot';
    return `
      <div class="chat-bubble-row ${isBot ? 'bot' : 'user'}">
        <div class="chat-msg-avatar">${isBot ? '🤖' : '👤'}</div>
        <div class="chat-msg-bubble">
          ${msg.html}
          <div class="chat-bubble-time">${msg.time || ''}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function handleChatbotSubmit(event) {
  if (event) event.preventDefault();

  const inputEl = document.getElementById('chatbotInputText');
  if (!inputEl) return;
  const userText = inputEl.value.trim();
  if (!userText) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Escape HTML
  const safeUserText = userText.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);

  const history = getChatbotHistory();
  history.push({
    id: 'msg_' + Date.now(),
    sender: 'user',
    time: timeStr,
    html: `<p>${safeUserText}</p>`
  });
  saveChatbotHistory(history);
  renderChatbotMessages();

  inputEl.value = '';

  // Tampilkan Typing Indicator
  const container = document.getElementById('chatbotMessages');
  if (container) {
    const typingEl = document.createElement('div');
    typingEl.id = 'chatTypingIndicator';
    typingEl.className = 'chat-bubble-row bot';
    typingEl.innerHTML = `
      <div class="chat-msg-avatar">🤖</div>
      <div class="chat-msg-bubble">
        <div class="typing-indicator-row">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;
    container.appendChild(typingEl);
    container.scrollTop = container.scrollHeight;
  }

  // Berikan respon bot setelah delay alami
  setTimeout(() => {
    const typingEl = document.getElementById('chatTypingIndicator');
    if (typingEl) typingEl.remove();

    const botResponseHtml = getChatbotKnowledgeResponse(userText);
    const updatedHistory = getChatbotHistory();
    const botNow = new Date();
    const botTimeStr = botNow.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    updatedHistory.push({
      id: 'msg_' + Date.now(),
      sender: 'bot',
      time: botTimeStr,
      html: botResponseHtml
    });
    saveChatbotHistory(updatedHistory);
    renderChatbotMessages();
  }, 450);
}

function sendQuickQuery(queryText) {
  const inputEl = document.getElementById('chatbotInputText');
  if (inputEl) {
    inputEl.value = queryText;
  }
  handleChatbotSubmit();
}

function clearChatbotHistory() {
  const welcome = getChatbotDefaultWelcome();
  saveChatbotHistory(welcome);
  renderChatbotMessages();
  if (typeof LT !== 'undefined' && LT.toast) {
    LT.toast('Riwayat obrolan asisten telah dibersihkan.', 'info', 3000);
  }
}

// Inisialisasi awal saat halaman dibuka
renderChatbotMessages();

// Window bindings
window.handleChatbotSubmit = handleChatbotSubmit;
window.sendQuickQuery = sendQuickQuery;
window.clearChatbotHistory = clearChatbotHistory;
