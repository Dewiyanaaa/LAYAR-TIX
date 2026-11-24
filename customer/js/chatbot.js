// chatbot.js — Dedicated Full-Screen Chatbot for LayarTix
// Respon ketikan manual instan, deteksi kota/lokasi pintar, bebas 3D & parkir
'use strict';

const user = (typeof LT !== 'undefined' && LT.requireAuth) ? LT.requireAuth('customer') : null;
const CHATBOT_STORAGE_KEY = 'layartix_chatbot_history';

/* ══════════════════════════════════════════════════════════
   0️⃣  QUICK-REPLY CHIPS (TANPA 3D & PARKIR)
   ══════════════════════════════════════════════════════════ */
const QUICK_CHIPS = [
  { label: '📍 Kota & Zona Saya',               query: 'Sekarang saya lagi di kota apa' },
  { label: '⏱️ Bayar 10 Menit',                 query: 'Aturan batas bayar 10 menit' },
  { label: '🤝 Patungan / Split Bill',          query: 'Bagaimana aturan patungan split bill' },
  { label: '🚫 Batas Pembatalan Tiket',         query: 'Batas pembatalan tiket 2 jam 3 opsi' },
  { label: '📲 Cara Share QR',                  query: 'Cara menggunakan share QR tiket' },
  { label: '🍿 Stok F&B (200)',                 query: 'Stok F&B awal 200 dan pemulihan' },
  { label: '🕒 Zona Waktu Bioskop',             query: 'Zona waktu bioskop WIB WITA WIT' },
  { label: '⭐ Ulasan & Spoiler Shield',        query: 'Fitur ulasan film dan spoiler protection' },
  { label: '🔍 Cari Film & Mall',               query: 'Cara cari film dan mall bioskop' }
];

/* ══════════════════════════════════════════════════════════
   1️⃣  KAMUS LENGKAP SINGKATAN & TYPO BAHASA SEHARI-HARI
   ══════════════════════════════════════════════════════════ */
const SHORTCUT_MAP = {
  // Subjek & Orang
  'sy': 'saya', 'ak': 'saya', 'aku': 'saya', 'gw': 'saya', 'gua': 'saya', 'gue': 'saya', 'w': 'saya',
  'km': 'kamu', 'kmu': 'kamu', 'lu': 'kamu', 'loe': 'kamu', 'lo': 'kamu',
  
  // Kata Tanya & Tempat
  'mn': 'mana', 'mna': 'mana', 'dmn': 'dimana', 'dimn': 'dimana', 'dmana': 'dimana',
  'kmn': 'kemana', 'kmana': 'kemana', 'k': 'di',
  'ap': 'apa', 'apaan': 'apa', 'pa': 'apa',
  'gmn': 'bagaimana', 'gmna': 'bagaimana', 'bgmn': 'bagaimana', 'bap': 'bagaimana',
  'knp': 'kenapa', 'knp2': 'kenapa', 'ngapa': 'kenapa',
  
  // Waktu & Status Keadaan
  'lg': 'lagi', 'lgi': 'lagi', 'lag': 'lagi',
  'skrg': 'sekarang', 'skrang': 'sekarang', 'skg': 'sekarang', 'now': 'sekarang', 'saat': 'sekarang',
  'blm': 'belum', 'blom': 'belum', 'belom': 'belum', 'lum': 'belum',
  'sdh': 'sudah', 'udh': 'sudah', 'udah': 'sudah', 'dah': 'sudah',
  
  // Lokasi, Kota, Bioskop
  'kt': 'kota', 'kta': 'kota', 'kot': 'kota', 'city': 'kota',
  'bsk': 'bioskop', 'bskop': 'bioskop', 'cinema': 'bioskop', 'teater': 'bioskop', 'theater': 'bioskop',
  'lok': 'lokasi', 'lokas': 'lokasi', 'pos': 'posisi', 'possi': 'posisi', 'tmpt': 'tempat', 'tmpat': 'tempat',
  'zon': 'zona', 'zn': 'zona', 'zone': 'zona',
  
  // Transaksi & Tiket
  'tkt': 'tiket', 'tket': 'tiket', 'tix': 'tiket', 'tik': 'tiket',
  'byr': 'bayar', 'byar': 'bayar', 'byaran': 'pembayaran', 'pmbayaran': 'pembayaran', 'pembayarn': 'pembayaran',
  'lns': 'lunas', 'luns': 'lunas',
  'mnt': 'menit', 'mnts': 'menit', 'min': 'menit', 'mins': 'menit',
  'jm': 'jam', 'jm2': 'jam',
  
  // Patungan & Batal
  'ptg': 'patungan', 'ptgn': 'patungan', 'patung': 'patungan',
  'splt': 'split', 'splitt': 'split', 'bl': 'bill',
  'btl': 'batal', 'btlin': 'batalkan', 'cancel': 'batal', 'cncel': 'batal', 'cncl': 'batal', 'rfnd': 'refund',
  
  // F&B & Lainnya
  'mkn': 'makanan', 'mkan': 'makanan', 'mnm': 'minuman', 'mnum': 'minuman', 'popcorn': 'fnb', 'f&b': 'fnb',
  'qr': 'qr', 'barcode': 'qr', 'shr': 'share', 'shar': 'share', 'bagi': 'share', 'bagikan': 'share',
  'bs': 'bisa', 'dpt': 'dapat', 'hrs': 'harus', 'krn': 'karena', 'krna': 'karena',
  'ga': 'tidak', 'gak': 'tidak', 'gk': 'tidak', 'tdk': 'tidak', 'g': 'tidak', 'nggak': 'tidak',
  'yg': 'yang', 'utk': 'untuk', 'tuk': 'untuk', 'bwt': 'buat'
};

/* ══════════════════════════════════════════════════════════
   2️⃣  NORMALISASI INPUT KETIKAN MANUAL
   ══════════════════════════════════════════════════════════ */
function normalize(text) {
  let t = (text || '')
    .toLowerCase()
    .replace(/[^\w\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pemetaan token per kata
  t = t.split(' ').map(w => SHORTCUT_MAP[w] || w).join(' ');

  // Perapihan frase gabungan umum
  t = t.replace(/\bdi\s+mana\b/g, 'dimana');
  t = t.replace(/\bdi\s+kota\s+mana\b/g, 'dikotamana');
  t = t.replace(/\bdi\s+kota\s+apa\b/g, 'dikotaapa');
  t = t.replace(/\bkota\s+apa\b/g, 'kotaapa');
  t = t.replace(/\bkota\s+mana\b/g, 'kotamana');
  t = t.replace(/\blagi\s+dimana\b/g, 'lagidimana');

  return t;
}

/* ══════════════════════════════════════════════════════════
   3️⃣  JAWABAN DINAMIS: PERTANYAAN KOTA & ZONA WAKTU
   ══════════════════════════════════════════════════════════ */
function answerLocation() {
  let city = null, zone = null, mall = null;

  // Baca dari LT core API (data.js) jika tersedia
  if (typeof LT !== 'undefined') {
    if (typeof LT.getSelectedCity === 'function') {
      city = LT.getSelectedCity();
    }
    if (city && typeof LT.getCityTimeZone === 'function') {
      zone = LT.getCityTimeZone(city);
    }
  }

  // Fallback cek langsung dari localStorage
  if (!city) {
    city = localStorage.getItem('lt_city') ||
           localStorage.getItem('selected_city') ||
           localStorage.getItem('user_city') ||
           null;
  }
  if (!zone && city && typeof LT !== 'undefined' && typeof LT.getCityTimeZone === 'function') {
    zone = LT.getCityTimeZone(city);
  }
  if (!zone) {
    zone = localStorage.getItem('lt_zone') ||
           localStorage.getItem('selected_zone') ||
           null;
  }
  mall = localStorage.getItem('lt_mall') ||
         localStorage.getItem('selected_cinema') ||
         null;

  if (city) {
    zone = zone || (typeof LT !== 'undefined' && LT.getCityTimeZone ? LT.getCityTimeZone(city) : 'WITA');
    const mallInfo = mall ? `, di mall/bioskop <strong>${mall}</strong>` : '';
    return `
      <p>📍 <strong>Konteks Kota &amp; Lokasi Anda di LayarTix:</strong></p>
      <ul>
        <li><strong>Kota Anda Saat Ini:</strong> <strong>${city}</strong>${mallInfo}</li>
        <li><strong>Zona Waktu Bioskop:</strong> <strong>${zone}</strong></li>
      </ul>
      <p style="font-size:11.5px;color:rgba(255,255,255,0.68);margin-top:7px;line-height:1.5;">
        <em>Penjelasan:</em> LayarTix <strong>tidak melacak koordinat GPS perangkat ponsel</strong> Anda secara otomatis demi menjaga privasi. Konteks kota ini mengikuti kota bioskop yang sedang Anda pilih di aplikasi. Anda dapat mengganti kota kapan pun melalui tombol pemilih kota di bagian atas halaman <strong>Beranda</strong>!
      </p>
    `;
  }

  // Jika belum ada pilihan tersimpan di state/storage
  return `
    <p>📍 <strong>Konteks Kota &amp; Lokasi Anda:</strong></p>
    <p>Aplikasi belum mencatat kota bioskop pilihan Anda. Secara default, sistem LayarTix menggunakan kota <strong>Makassar</strong> dengan zona waktu <strong>WITA</strong>.</p>
    <p style="font-size:11.5px;color:rgba(255,255,255,0.68);margin-top:7px;line-height:1.5;">
      <em>Catatan:</em> Asisten virtual kami tidak melacak posisi GPS perangkat Anda secara otomatis. Silakan tentukan kota bioskop yang Anda tuju dengan mengklik tombol pilihan kota di header halaman <strong>Beranda</strong>.
    </p>
  `;
}

/* ══════════════════════════════════════════════════════════
   4️⃣  INTENT DEFINITIONS (MURNI FITUR RESMI LAYARTIX)
   ══════════════════════════════════════════════════════════ */
const intents = [
  /* ── 1. Lokasi & Pertanyaan Kota ── */
  {
    name: 'location_city',
    keywords: [
      'kota', 'kotaapa', 'kotamana', 'dikotaapa', 'dikotamana',
      'dimana', 'lagidimana', 'lokasi saya', 'posisi saya', 'kota saya',
      'zona saya', 'saya dimana', 'lagi dimana', 'tempat saya',
      'zona waktu saya', 'di mana', 'posisi'
    ],
    answer: () => answerLocation()
  },

  /* ── 2. Batas Bayar 10 Menit & Keluar Beranda ── */
  {
    name: 'payment_timeout',
    keywords: [
      '10 menit', 'batas bayar', 'batas waktu', 'batas pembayaran',
      'kedaluwarsa', 'kadaluarsa', 'habis waktu', 'countdown',
      'pembayaran belum selesai', 'belum lunas', 'expires',
      'keluar beranda belum bayar', 'aktif mendatang', 'beranda belum lunas',
      'keluar beranda', 'klik beranda'
    ],
    answer: `
      <p>⏱️ <strong>Batas Waktu Pembayaran 10 Menit &amp; Status Tiket:</strong></p>
      <ul>
        <li><strong>Timer 10 Menit Sejak Transaksi Dibuat:</strong> Seluruh transaksi (QRIS, Transfer Bank VA, E-Wallet, maupun Patungan/Split Bill) memiliki batas pelunasan maksimal 10 menit (<code>expiresAt = createdAt + 10 menit</code>).</li>
        <li><strong>Keluar / Klik Beranda Saat Belum Lunas:</strong> Pesanan langsung tersimpan otomatis dengan status <strong>"Pembayaran Belum Selesai"</strong> dan wajib masuk tab <strong>"Aktif &amp; Mendatang"</strong> (bukan "Riwayat"). Timer 10 menit tidak diulang dari awal saat Anda membuka kembali.</li>
        <li><strong>Lunas Sebelum 10 Menit:</strong> Pesanan otomatis berubah menjadi <strong>"Siap Dipakai"</strong> dan QR e-ticket studio resmi diterbitkan.</li>
        <li><strong>Jika Waktu 10 Menit Habis:</strong> Transaksi otomatis kedaluwarsa, kursi dilepas kembali ke publik, stok F&B dikembalikan, dan baru dipindahkan ke tab <strong>"Riwayat"</strong>.</li>
      </ul>
    `
  },

  /* ── 3. Patungan / Split Bill ── */
  {
    name: 'split_bill',
    keywords: [
      'split bill', 'patungan', 'split', 'splitbill', 'bagikan pembayaran',
      'bayar bareng', 'bayar bersama', 'belum lunas semua', 'sebagian bayar',
      'sebagian lunas', 'patungan belum selesai'
    ],
    answer: `
      <p>🤝 <strong>Ketentuan Patungan / Split Bill LayarTix:</strong></p>
      <ul>
        <li><strong>Prinsip "Belum Lunas = Ditahan":</strong> Selama masih ada bagian anggota patungan yang belum melunasi pembayarannya, tiket <strong>tidak diproses</strong> menjadi tiket lunas ("Siap Dipakai") dan QR studio belum aktif. Transaksi berstatus <strong>"Pembayaran Belum Selesai"</strong> di tab <strong>"Aktif &amp; Mendatang"</strong>.</li>
        <li><strong>Semua Bagian Lunas Sebelum 10 Menit:</strong> Begitu seluruh anggota membayar lunas, tiket otomatis terbit penuh berstatus <strong>"Siap Dipakai"</strong>.</li>
        <li><strong>Lewat 10 Menit &amp; Baru Sebagian Bayar:</strong> Bagian yang sudah lunas dibayar menjadi tiket aktif sah di tab <strong>"Aktif &amp; Mendatang"</strong>, sedangkan kursi dari bagian yang belum dibayar dibatalkan, kursinya dilepas ke publik, dan stok F&B-nya dikembalikan.</li>
      </ul>
    `
  },

  /* ── 4. Pembatalan Tiket & 3 Opsi Refund ── */
  {
    name: 'cancel_policy',
    keywords: [
      'batal', 'pembatalan', 'cancel', 'refund', '2 jam',
      'batas pembatalan', 'makanan saja', 'tiket saja', 'keduanya',
      '3 opsi', 'tiga opsi', 'batalkan'
    ],
    answer: `
      <p>🚫 <strong>Batas Pembatalan Tiket &amp; 3 Opsi Refund:</strong></p>
      <ul>
        <li><strong>Batas Pembatalan Maksimal 2 Jam:</strong> Pembatalan tiket hanya dapat dilakukan maksimal <strong>2 jam sebelum jadwal film dimulai</strong>. Jika waktu film kurang dari 2 jam, tombol pembatalan dinonaktifkan.</li>
        <li><strong>3 Pilihan Pembatalan Fleksibel:</strong>
          <ol>
            <li><strong>Makanan Saja:</strong> Membatalkan pesanan F&B saja (stok otomatis dikembalikan ke kantin), tiket nonton Anda tetap aktif.</li>
            <li><strong>Tiket Saja:</strong> Membatalkan tiket nonton bioskop (mendapat refund 40%), pesanan F&B tetap bisa diambil dan dinikmati di bioskop.</li>
            <li><strong>Keduanya:</strong> Membatalkan tiket nonton (refund 40%) sekaligus seluruh pesanan makanan/minuman (stok F&B dikembalikan penuh).</li>
          </ol>
        </li>
      </ul>
    `
  },

  /* ── 5. Stok F&B (Default 200) ── */
  {
    name: 'fnb_stock',
    keywords: [
      'stok', 'fnb', 'makanan', 'minuman', 'kantin', '200', 'jumlah makanan', 'stok habis',
      'kembali stok', 'restock'
    ],
    answer: `
      <p>🍿 <strong>Sistem Manajemen Stok Kantin F&amp;B:</strong></p>
      <ul>
        <li><strong>Stok Awal 200 per Item:</strong> Setiap produk makanan dan minuman memiliki kuota awal <strong>200 porsi</strong> yang tersimpan persisten di sistem.</li>
        <li><strong>Pengurangan Real-Time:</strong> Stok berkurang saat pesanan dibayar. Jika mencapai 0, menu otomatis berstatus <em>"Stok Habis"</em> dan tombol beli dinonaktifkan.</li>
        <li><strong>Pemulihan Stok Otomatis:</strong> Stok F&B otomatis <strong>dikembalikan</strong> ke inventaris kantin apabila pesanan dibatalkan pengguna atau transaksi kedaluwarsa (lewat batas 10 menit).</li>
      </ul>
    `
  },

  /* ── 6. Zona Waktu & Jam Tayang 01.00 ── */
  {
    name: 'timezone',
    keywords: [
      'zona waktu', 'wib', 'wita', 'wit', 'jam tayang', '01 00', '01.00',
      'zona', 'waktu kota', 'jadwal lewat', 'terkunci', 'sudah lewat', 'midnight'
    ],
    answer: `
      <p>🕒 <strong>Zona Waktu Bioskop &amp; Penguncian Jadwal:</strong></p>
      <ul>
        <li><strong>Zona Waktu Kota:</strong> Jadwal tayang bioskop diselaraskan langsung dengan waktu lokal kota bioskop:
          <ul>
            <li><strong>WIB (UTC+7):</strong> Jakarta, Bandung, Surabaya, Medan, dll.</li>
            <li><strong>WITA (UTC+8):</strong> Makassar, Denpasar, Balikpapan, Manado, dll.</li>
            <li><strong>WIT (UTC+9):</strong> Jayapura, Ambon, Sorong, dll.</li>
          </ul>
        </li>
        <li><strong>Penguncian Otomatis:</strong> Jadwal tayang yang sudah lewat dari jam lokal saat ini otomatis <strong>dikunci &amp; dicoret</strong> agar tidak salah dipesan.</li>
        <li><strong>Jam Tayang 01.00:</strong> LayarTix mendukung penayangan film midnight hingga pukul <strong>01.00 dinihari</strong>.</li>
      </ul>
    `
  },

  /* ── 7. Fitur Share QR ── */
  {
    name: 'share_qr',
    keywords: [
      'share qr', 'bagikan qr', 'bagi qr', 'qr tiket', 'whatsapp',
      'unduh qr', 'salin qr', 'web share', 'share tiket', 'barcode tiket'
    ],
    answer: `
      <p>📲 <strong>Fitur "Share QR" pada Tiket Siap Pakai:</strong></p>
      <ul>
        <li>Tombol <strong>"Share QR"</strong> muncul aktif pada kartu tiket berstatus <strong>"Siap Dipakai"</strong> di menu <em>Tiket Anda</em>.</li>
        <li><strong>4 Metode Berbagi:</strong>
          <ol>
            <li><strong>WhatsApp:</strong> Mengirim pesan berformat rapi (film, bioskop, studio, nomor kursi, jadwal).</li>
            <li><strong>Aplikasi Lain:</strong> Memanggil Web Share API ponsel/browser.</li>
            <li><strong>Salin Ringkasan:</strong> Menyalin ringkasan tiket ke clipboard.</li>
            <li><strong>Unduh Gambar QR:</strong> Menyimpan barcode QR e-ticket langsung ke galeri foto.</li>
          </ol>
        </li>
      </ul>
    `
  },

  /* ── 8. Ulasan Film & Spoiler Protection ── */
  {
    name: 'review_spoiler',
    keywords: [
      'ulasan', 'review', 'rating', 'bintang', 'spoiler', 'shield', 'spoiler protection',
      'buka spoiler', 'komentar film'
    ],
    answer: `
      <p>⭐ <strong>Ulasan Film &amp; Spoiler Protection Shield:</strong></p>
      <ul>
        <li>Panel ulasan tampil di halaman detail film (<code>bioskop_jam.html</code>) <strong>sebelum</strong> Anda memilih mall &amp; jam nonton.</li>
        <li>Menampilkan rating rata-rata bintang 1–5 serta ulasan dari penonton asli.</li>
        <li><strong>Spoiler Protection Shield:</strong> Ulasan yang terindikasi membocorkan cerita (spoiler) otomatis di-blur dengan tombol <em>"👁️ Buka Spoiler"</em> agar sensasi menonton Anda tidak berkurang.</li>
      </ul>
    `
  },

  /* ── 9. Pencarian Film & Mall ── */
  {
    name: 'movie_search',
    keywords: [
      'cari film', 'cari mall', 'search', 'temukan', 'film apa', 'mall', 'bioskop', 'pencarian',
      'cari bioskop', 'filter film'
    ],
    answer: `
      <p>🔍 <strong>Pencarian Film &amp; Mall di LayarTix:</strong></p>
      <ul>
        <li><strong>Cari Film:</strong> Di halaman Beranda, gunakan bilah pencarian terpadu untuk menyaring judul film yang sedang tayang maupun akan tayang.</li>
        <li><strong>Cari Mall/Bioskop:</strong> Di halaman jadwal film (<code>bioskop_jam.html</code>), tersedia kotak filter pencarian nama bioskop dan mall di kota pilihan Anda.</li>
      </ul>
    `
  },

  /* ── 10. Cara Pesan Tiket (Umum) ── */
  {
    name: 'order_ticket',
    keywords: [
      'pesan tiket', 'cara pesan', 'beli tiket', 'booking', 'cara beli', 'pesan kursi',
      'langkah pesan', 'alur pesan'
    ],
    answer: `
      <p>🎬 <strong>Langkah Mudah Pesan Tiket di LayarTix:</strong></p>
      <ol>
        <li>Pilih judul film di halaman Beranda.</li>
        <li>Baca ulasan penonton dan pilih kota, mall bioskop, serta jam tayang.</li>
        <li>Pilih nomor kursi studio bioskop (tersedia juga Group Booking untuk banyak kursi).</li>
        <li>Pilih menu F&amp;B untuk diantar ke kursi studio atau diambil di kantin (opsional).</li>
        <li>Pilih metode pembayaran dan selesaikan sebelum batas 10 menit berakhir.</li>
        <li>Tiket berstatus "Siap Dipakai" siap di-scan langsung di pintu teater studio!</li>
      </ol>
    `
  }
];

/* ══════════════════════════════════════════════════════════
   5️⃣  PENCOCOKAN INTENT KETIKAN MANUAL
   ══════════════════════════════════════════════════════════ */
function matchIntent(userText) {
  const norm = normalize(userText);
  const tokens = norm.split(' ');
  let best = { score: 0, intent: null };

  intents.forEach(intent => {
    let score = 0;
    intent.keywords.forEach(kw => {
      const kwNorm = normalize(kw);

      // 1. Pencocokan substring langsung pada teks yang dinormalisasi
      if (norm.includes(kwNorm)) {
        score += 3;
      }

      // 2. Pencocokan kata per kata dalam token
      const kwWords = kwNorm.split(' ');
      const allPresent = kwWords.every(w => tokens.includes(w));
      if (allPresent) {
        score += 2;
      }
    });

    if (score > best.score) {
      best = { score, intent };
    }
  });

  return best.score > 0 ? best.intent : null;
}

/* ══════════════════════════════════════════════════════════
   6️⃣  PESAN SAMBUTAN DEFAULT
   ══════════════════════════════════════════════════════════ */
function getWelcomeMessage() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return [{
    id: 'msg_welcome',
    sender: 'bot',
    time: timeStr,
    html: `
      <p>👋 Halo! Selamat datang di <strong>Asisten Virtual LayarTix</strong>.</p>
      <p>Saya asisten siaga 24/7 yang siap menjawab pertanyaan manual Anda seputar aturan dan fitur aplikasi LayarTix:</p>
      <ul>
        <li>📍 <strong>Cek kota &amp; zona Anda</strong> (ketik: <em>"sekarang saya lagi di kota apa"</em> atau <em>"sy lg di kota apa"</em>)</li>
        <li>⏱️ <strong>Batas bayar 10 menit</strong> &amp; status "Pembayaran Belum Selesai" di tab "Aktif &amp; Mendatang"</li>
        <li>🤝 <strong>Patungan / Split Bill</strong> (selama belum lunas ditahan, pelunasan parsial)</li>
        <li>🚫 <strong>Batas pembatalan 2 jam</strong> &amp; 3 opsi refund (Makanan / Tiket / Keduanya)</li>
        <li>🍿 <strong>Stok F&amp;B 200</strong> &amp; pemulihan stok otomatis saat batal/kedaluwarsa</li>
        <li>🕒 <strong>Zona waktu bioskop (WIB/WITA/WIT)</strong> &amp; jadwal lewat terkunci</li>
        <li>📲 <strong>Fitur Share QR</strong>, ulasan film &amp; pencarian film/mall</li>
      </ul>
      <p style="font-size:11.5px;color:rgba(255,255,255,0.68);margin-top:7px;">
        Ketik pertanyaan bebas Anda di kolom input bawah atau klik salah satu chip topik di atas!
      </p>
    `
  }];
}

/* ══════════════════════════════════════════════════════════
   7️⃣  PENYIMPANAN RIWAYAT DI LOCALSTORAGE
   ══════════════════════════════════════════════════════════ */
function loadHistory() {
  try {
    const raw = localStorage.getItem(CHATBOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return getWelcomeMessage();
}

function saveHistory(hist) {
  try { localStorage.setItem(CHATBOT_STORAGE_KEY, JSON.stringify(hist)); } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   8️⃣  DOM RENDERING & EVENT HANDLERS
   ══════════════════════════════════════════════════════════ */
const chatBody = document.getElementById('chatBody');
const txtInput = document.getElementById('txtInput');
const btnSend  = document.getElementById('btnSend');
const btnClear = document.getElementById('btnClear');
const btnBack  = document.getElementById('btnBack');
const chipBar  = document.getElementById('chipBar');

function renderMessage(msg) {
  const isBot = msg.sender === 'bot';
  const row = document.createElement('div');
  row.className = `msg-row ${isBot ? 'bot' : 'user'}`;
  row.innerHTML = `
    <div class="msg-avatar">${isBot ? '🤖' : '👤'}</div>
    <div>
      <div class="msg-bubble">${msg.html}</div>
      <div class="msg-time">${msg.time || ''}</div>
    </div>
  `;
  chatBody.appendChild(row);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function renderAll() {
  chatBody.innerHTML = '';
  loadHistory().forEach(renderMessage);
}

function addMessage(html, sender) {
  const now = new Date();
  const msg = {
    id: 'msg_' + Date.now(),
    sender,
    time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    html
  };
  const hist = loadHistory();
  hist.push(msg);
  saveHistory(hist);
  renderMessage(msg);
}

function renderChips() {
  chipBar.innerHTML = '';
  QUICK_CHIPS.forEach(c => {
    const el = document.createElement('button');
    el.className = 'chip';
    el.textContent = c.label;
    el.onclick = () => handleUserInput(c.query);
    chipBar.appendChild(el);
  });
}

function showTyping() {
  const row = document.createElement('div');
  row.id = 'typingRow';
  row.className = 'typing-row';
  row.innerHTML = `
    <div class="msg-avatar" style="background:linear-gradient(135deg,#6b0c2c,#f5c242);border:1px solid rgba(245,194,66,0.3);">🤖</div>
    <div class="typing-dots">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  chatBody.appendChild(row);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typingRow');
  if (el) el.remove();
}

function autoResize() {
  txtInput.style.height = 'auto';
  txtInput.style.height = Math.min(txtInput.scrollHeight, 130) + 'px';
}

function handleUserInput(rawText) {
  const text = (rawText || '').trim();
  if (!text) return;

  txtInput.value = '';
  btnSend.disabled = true;
  autoResize();

  const safe = text.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
  addMessage(`<p>${safe}</p>`, 'user');

  showTyping();

  setTimeout(() => {
    hideTyping();

    const intent = matchIntent(text);
    let answer;
    if (intent) {
      answer = (typeof intent.answer === 'function') ? intent.answer() : intent.answer;
    } else {
      answer = `
        <p>Maaf, saya belum memahami pertanyaan manual tersebut secara spesifik. 😊</p>
        <p>Sebagai <strong>Asisten LayarTix</strong>, saya fokus membantu operasional resmi aplikasi LayarTix. Anda dapat bertanya langsung tentang:</p>
        <ul>
          <li>📍 Kota &amp; lokasi bioskop (misal: <em>"sekarang saya lagi di kota apa"</em>, <em>"sy lg di kota apa"</em>, <em>"kota saya apa"</em>)</li>
          <li>⏱️ Batas bayar 10 menit &amp; status tiket ("Pembayaran Belum Selesai")</li>
          <li>🤝 Patungan / Split Bill</li>
          <li>🚫 Pembatalan tiket (maksimal 2 jam sebelum film dimulai, 3 opsi refund)</li>
          <li>🍿 Kuota stok Kantin F&amp;B (200)</li>
          <li>🕒 Zona waktu bioskop (WIB / WITA / WIT) &amp; jam lewat terkunci</li>
          <li>📲 Fitur Share QR, ulasan film &amp; pencarian mall</li>
        </ul>
        <p style="font-size:11.5px;color:rgba(255,255,255,0.68);margin-top:7px;">
          Silakan ketik ulang kalimat Anda dengan kata kunci yang lebih spesifik atau pilih tombol pertanyaan cepat di atas!
        </p>
      `;
    }
    addMessage(answer, 'bot');
  }, 350);
}

txtInput.addEventListener('input', () => {
  btnSend.disabled = txtInput.value.trim().length === 0;
  autoResize();
});

txtInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!btnSend.disabled) btnSend.click();
  }
});

btnSend.addEventListener('click', () => {
  handleUserInput(txtInput.value);
});

btnClear.addEventListener('click', () => {
  if (confirm('Yakin ingin menghapus seluruh riwayat percakapan asisten?')) {
    const welcome = getWelcomeMessage();
    saveHistory(welcome);
    renderAll();
    if (typeof LT !== 'undefined' && LT.toast) {
      LT.toast('Riwayat percakapan telah dibersihkan.', 'info', 3000);
    }
  }
});

btnBack.addEventListener('click', () => {
  if (document.referrer && (document.referrer.includes('akun.html') || document.referrer.includes('beranda.html'))) {
    window.history.back();
  } else {
    window.location.href = 'akun.html';
  }
});

/* ── Inisialisasi ── */
renderAll();
renderChips();
txtInput.focus();

window.handleChatbotSubmit = function(e) { if (e) e.preventDefault(); handleUserInput(txtInput.value); };
window.sendQuickQuery = function(q) { handleUserInput(q); };
window.clearChatbotHistory = function() { btnClear.click(); };
