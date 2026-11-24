// ══════════════════════════════════════════════════════════════
//  LayarTix – Shared Data & Utility Layer
//  Digunakan oleh semua halaman via <script src="../../data.js">
// ══════════════════════════════════════════════════════════════

const LT = {

  // ── CITIES ──────────────────────────────────────────────────
  cities: [
    'Ambon', 'Balikpapan', 'Banda Aceh', 'Bandar Lampung', 'Bandung', 'Banjarmasin', 'Batam',
    'Bekasi', 'Binjai', 'Bitung', 'Bogor', 'Cirebon', 'Denpasar', 'Depok', 'Gorontalo',
    'Jakarta Barat', 'Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Timur', 'Jakarta Utara',
    'Jayapura', 'Kediri', 'Kendari', 'Kupang', 'Langsa', 'Lhokseumawe', 'Makassar', 'Malang',
    'Manado', 'Mataram', 'Medan', 'Merauke', 'Padang', 'Palembang', 'Palu', 'Pekanbaru',
    'Pematangsiantar', 'Pontianak', 'Samarinda', 'Semarang', 'Solo', 'Sorong', 'Surabaya',
    'Tangerang', 'Tasikmalaya', 'Tebing Tinggi', 'Ternate', 'Timika', 'Yogyakarta'
  ],

  // ── INDONESIAN TIMEZONE HELPER ─────────────────────────────
  getCityTimeZone: function (city) {
    if (!city) return 'WIB';
    const c = city.trim().toLowerCase();
    const witaCities = [
      'makassar', 'denpasar', 'balikpapan', 'samarinda', 'manado',
      'banjarmasin', 'palu', 'kendari', 'mataram', 'kupang', 'gorontalo', 'bitung',
      'singkawang', 'palangkaraya', 'tarakan', 'banjarbaru', 'bontang'
    ];
    const witCities = [
      'ambon', 'jayapura', 'sorong', 'merauke', 'timika', 'ternate', 'manokwari', 'biak'
    ];
    if (witaCities.some(function (x) { return c.includes(x); })) return 'WITA';
    if (witCities.some(function (x) { return c.includes(x); })) return 'WIT';
    return 'WIB';
  },

  getCityOffsetHours: function (city) {
    const tz = this.getCityTimeZone(city);
    if (tz === 'WIT') return 9;
    if (tz === 'WITA') return 8;
    return 7;
  },

  getCityTimeZoneId: function (city) {
    const tz = this.getCityTimeZone(city);
    if (tz === 'WIT') return 'Asia/Jayapura';
    if (tz === 'WITA') return 'Asia/Makassar';
    return 'Asia/Jakarta';
  },

  /**
   * Mengembalikan objek tanggal/waktu saat ini yang diselaraskan dengan waktu lokal kota bioskop
   */
  getCityNow: function (city) {
    const tzId = this.getCityTimeZoneId(city);
    try {
      const now = new Date();
      // Dapatkan string ISO di timezone target menggunakan Intl
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tzId,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const map = {};
      parts.forEach(p => { map[p.type] = p.value; });
      const year = map.year;
      const month = map.month;
      const day = map.day;
      let hour = map.hour === '24' ? '00' : map.hour;
      const minute = map.minute;
      const second = map.second;

      const dateStr = `${year}-${month}-${day}`;
      const timeStr = `${hour}:${minute}`;
      return {
        dateStr,
        timeStr,
        fullFormatted: `${timeStr} ${this.getCityTimeZone(city)}`,
        dateObj: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
      };
    } catch (e) {
      // Fallback manual offset UTC
      const nowUtc = Date.now() + (new Date().getTimezoneOffset() * 60000);
      const offset = this.getCityOffsetHours(city);
      const localDate = new Date(nowUtc + (offset * 3600000));
      const y = localDate.getFullYear();
      const m = String(localDate.getMonth() + 1).padStart(2, '0');
      const d = String(localDate.getDate()).padStart(2, '0');
      const h = String(localDate.getHours()).padStart(2, '0');
      const mi = String(localDate.getMinutes()).padStart(2, '0');
      return {
        dateStr: `${y}-${m}-${d}`,
        timeStr: `${h}:${mi}`,
        fullFormatted: `${h}:${mi} ${this.getCityTimeZone(city)}`,
        dateObj: localDate
      };
    }
  },

  /**
   * Memeriksa apakah jadwal tayang bioskop tertentu sudah lewat
   * @param {string} scheduleDate - YYYY-MM-DD
   * @param {string} scheduleTime - HH:MM
   * @param {string} city - Nama kota bioskop
   * @param {number} graceMinutes - toleransi menit sebelum dianggap lewat (default 0)
   */
  isSchedulePassed: function (scheduleDate, scheduleTime, city, graceMinutes = 0) {
    if (!scheduleDate || !scheduleTime) return false;
    const cityNow = this.getCityNow(city);
    
    // Normalisasi format jam tayang (dukung format '01.00' maupun '01:00')
    const normSchedTime = String(scheduleTime).replace('.', ':');
    const normNowTime = String(cityNow.timeStr).replace('.', ':');
    const [schedH, schedM] = normSchedTime.split(':').map(Number);
    const [nowH, nowM] = normNowTime.split(':').map(Number);

    // Penanganan jam tayang dini hari / midnight show (pukul 00:00 - 05:00):
    // Dalam operasional bioskop, sesi 01:00 pada tanggal tayang X terlaksana pada dini hari berikutnya (X+1).
    let targetDateStr = scheduleDate;
    if (schedH >= 0 && schedH < 6) {
      const d = new Date(scheduleDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      targetDateStr = d.toISOString().split('T')[0];
    }

    // Jika tanggal pelaksanaan sebelum tanggal hari ini di kota bioskop
    if (targetDateStr < cityNow.dateStr) return true;
    // Jika tanggal pelaksanaan setelah tanggal hari ini di kota bioskop
    if (targetDateStr > cityNow.dateStr) return false;

    // Jika tanggal sama, bandingkan jam dan menit dari waktu lokal
    const nowTotalMinutes = (nowH * 60) + nowM;
    const schedTotalMinutes = (schedH * 60) + schedM + graceMinutes;

    return nowTotalMinutes >= schedTotalMinutes;
  },

  // Dynamic Mall list per City helper
  getCinemasForCity: function (city) {
    if (!city) city = this.getSelectedCity() || 'Makassar';
    const filtered = this.cinemas.filter(function (c) {
      return c.city.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(c.city.toLowerCase());
    });
    if (filtered.length > 0) return filtered;

    // Realistic auto-generated cinema malls for any selected city in Indonesia
    return [
      {
        id: 'c_' + city.toLowerCase().replace(/\s+/g, '_') + '_1',
        name: 'XXI ' + city + ' Town Square',
        mall: city + ' Town Square Mall',
        city: city,
        facilities: ['IMAX', 'Premiere', 'Regular'],
        priceMultiplier: { Regular: 0.9, Premium: 1.3, IMAX: 1.7 },
        unavailableMovies: []
      },
      {
        id: 'c_' + city.toLowerCase().replace(/\s+/g, '_') + '_2',
        name: 'CGV ' + city + ' City Center',
        mall: city + ' Central Plaza',
        city: city,
        facilities: ['Dolby Atmos', 'Regular', '4DX'],
        priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.55 },
        unavailableMovies: []
      },
      {
        id: 'c_' + city.toLowerCase().replace(/\s+/g, '_') + '_3',
        name: 'Cinépolis ' + city + ' Icon Mall',
        mall: city + ' Grand Icon Walk',
        city: city,
        facilities: ['Regular', 'Dolby Atmos'],
        priceMultiplier: { Regular: 0.8, Premium: 1.2, IMAX: 1.5 },
        unavailableMovies: ['m_agaklaen2']
      }
    ];
  },

  // ── DEFAULT MOVIES DATA (PERSISTED IN LOCALSTORAGE) ──────────
  defaultNowPlaying: [
    { id: 'm_clayface', title: 'Clayface', genre: 'Thriller, Horror, Drama, Sci-fi', rating: 'D17+', duration: 105, status: 'now_playing', price_base: 65000, poster: '../assets/images/clayface.jpg', synopsis: 'Transformasi mengerikan seorang aktor yang terobsesi dengan kesempurnaan hingga berubah menjadi entitas mematikan.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-11-01' },
    { id: 'm_kuasagelap', title: 'Kuasa Gelap: Perjanjian Darah', genre: 'Horror', rating: 'D17+', duration: 120, status: 'now_playing', price_base: 65000, poster: '../assets/images/kuasa-gelap.jpg', synopsis: 'Teror supranatural mencekam dari masa lalu yang menagih janji darah kelam dan mengancam keselamatan seluruh anggota keluarga.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-09-15' },
    { id: 'm_pirunduk', title: 'Pirunduk', genre: 'Horror', rating: 'D17+', duration: 96, status: 'now_playing', price_base: 60000, poster: '../assets/images/pirunduk.png', synopsis: 'Kisah horor menegangkan tentang sekumpulan remaja yang terjebak di gedung terlarang.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-10-10' },
    { id: 'm_bapakjujur', title: 'Bapak Paling Jujur', genre: 'Comedy', rating: 'SU / 13+', duration: 103, status: 'now_playing', price_base: 60000, poster: '../assets/images/bapak-paling-jujur.jpg', synopsis: 'Kisah komedi keluarga yang hangat dan mengocok perut tentang kejujuran seorang ayah yang justru memicu kekacauan lucu dalam kesehariannya.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-10-01' },
    { id: 'm_streetfighter', title: 'Street Fighter', genre: 'Action, Drama', rating: 'D17+', duration: 125, status: 'now_playing', price_base: 65000, poster: '../assets/images/street-fighter.jpg', synopsis: 'Pertarungan jalanan yang epik antara legenda beladiri.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-10-15' },
    { id: 'm_ibu', title: 'Ibu, Bagaimana Aku Tanpamu?', genre: 'Drama, Family', rating: 'SU / 13+', duration: 111, status: 'now_playing', price_base: 55000, poster: '../assets/images/ibu-bagaimana-aku-tanpamu.jpg', synopsis: 'Drama emosional tentang ikatan ibu\u2011anak yang diuji oleh waktu.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-10-20' },
    { id: 'm_sitivampir', title: 'Siti Si Vampir', genre: 'Horror, Comedy', rating: '13+', duration: 98, status: 'now_playing', price_base: 55000, poster: 'https://picsum.photos/seed/sitivampir2026/400/600', synopsis: 'Kisah humor gelap tentang vampir muda yang mencari identitas.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-10-25' },
    { id: 'm_othermommy', title: 'Other Mommy', genre: 'Horror, Thriller', rating: 'D17+', duration: 104, status: 'now_playing', price_base: 60000, poster: 'https://picsum.photos/seed/othermommy2026/400/600', synopsis: 'Misteri mengerikan di balik peran seorang ibu.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-10-28' },
    { id: 'm_residentevil', title: 'Resident Evil (2026)', genre: 'Action, Sci-fi, Horror', rating: 'D17+', duration: 118, status: 'now_playing', price_base: 70000, poster: 'https://picsum.photos/seed/residentevil2026/400/600', synopsis: 'Kelanjutan epik melawan wabah bioteror.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-11-01' },
    { id: 'm_beautifulpain', title: 'Beautiful Pain', genre: 'Romance, Drama', rating: '13+', duration: 110, status: 'now_playing', price_base: 55000, poster: 'https://picsum.photos/seed/beautifulpain2026/400/600', synopsis: 'Cinta yang tumbuh di tengah penderitaan.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-11-05' },
    { id: 'm_wargarusan', title: 'Warga Rusun 609', genre: 'Comedy, Horror', rating: 'D17+', duration: 95, status: 'now_playing', price_base: 55000, poster: 'https://picsum.photos/seed/wargarusan2026/400/600', synopsis: 'Komedi horor tentang penghuni apartemen seram.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-11-08' },
    { id: 'm_verity', title: 'Verity', genre: 'Thriller, Mystery', rating: 'D17+', duration: 115, status: 'now_playing', price_base: 65000, poster: 'https://picsum.photos/seed/verity2026/400/600', synopsis: 'Intrik misteri yang mengungkap kebenaran tersembunyi.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-11-10' },
    { id: 'm_henryfirstdate', title: "Henry's First Date", genre: 'Romance, Comedy', rating: '13+', duration: 97, status: 'now_playing', price_base: 55000, poster: 'https://picsum.photos/seed/henryfirstdate2026/400/600', synopsis: 'Kencan pertama Henry yang lucu dan canggung.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-11-12' },
    { id: 'm_empatmusim', title: 'Empat Musim Pertiwi', genre: 'Family Drama', rating: 'SU / 13+', duration: 115, status: 'now_playing', price_base: 62000, poster: 'https://picsum.photos/seed/empatmusim2026/400/600', synopsis: 'Drama keluarga puitis tentang kepulangan Pertiwi ke kampung halaman, merajut kembali luka lama dan kehangatan rumah melewati pergantian empat musim.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-11-14' }
  ],

  defaultComingSoon: [
    { id: 'm_whalefall', title: 'Whalefall', genre: 'Adventure, Drama, Horror, Thriller', rating: 'D17+', duration: 106, status: 'coming_soon', price_base: 65000, poster: '../assets/images/whalefall.jpg', synopsis: 'Petualangan mistik di kedalaman laut yang menyingkap rahasia kuno.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-11-28' },
    { id: 'm_lingsirwengi', title: 'Lingsir Wengi: Motel Malioboro', genre: 'Horror, Adventure', rating: 'D17+', duration: 102, status: 'coming_soon', price_base: 60000, poster: '../assets/images/lingsir-wengi-motel-malioboro.jpg', synopsis: 'Malam menakutkan di motel yang menyimpan kutukan gelap.', cast: '', director: '', language: 'Indonesia', releaseDate: '2026-12-05' },
    { id: 'm_dune_messiah', title: 'Dune: Messiah', genre: 'Sci-fi, Adventure', rating: 'D17+', duration: 130, status: 'coming_soon', price_base: 85000, poster: '../assets/images/dune-messiah.jpg', synopsis: 'Kelanjutan epik saga Dune, mengikuti pemberontakan dan takdir Paul Atreides.', cast: 'Timothée Chalamet, Zendaya, Florence Pugh', director: 'Denis Villeneuve', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-12-18' },
    { id: 'm_toystory5', title: 'Toy Story 5', genre: 'Animasi, Petualangan, Keluarga', rating: 'SU', duration: 104, status: 'coming_soon', price_base: 60000, poster: '../assets/images/toy-story-5.jpg', synopsis: 'Woody, Buzz Lightyear, dan kawan-kawan menghadapi tantangan era modern bersaing dengan layar gawai.', cast: 'Tom Hanks, Tim Allen, Joan Cusack', director: 'Andrew Stanton', language: 'Inggris / Subtitle Indonesia', releaseDate: '2026-12-25' },
    { id: 'm_aplikasiblis', title: 'Aplikasi Iblis', genre: 'Horror, Techno-Thriller', rating: 'D17+', duration: 102, status: 'coming_soon', price_base: 60000, poster: 'https://picsum.photos/seed/aplikasiblis2026/400/600', synopsis: 'Aplikasi misterius yang mengendalikan pikiran penggunanya.', cast: '', director: '', language: 'Indonesia', releaseDate: '2027-01-08' },
    { id: 'm_avengersendgame', title: 'Avengers Endgame: Encore', genre: 'Action, Superhero', rating: 'SU / 13+', duration: 185, status: 'coming_soon', price_base: 70000, poster: 'https://picsum.photos/seed/avengers2026/400/600', synopsis: 'Kemunculan kembali para pahlawan dalam pertempuran akhir.', cast: '', director: '', language: 'Inggris / Subtitle Indonesia', releaseDate: '2027-01-15' }
  ],

  // ── LOCALSTORAGE MOVIE MANAGEMENT ───────────────────────────
  initMovies(force = false) {
    try {
      const np = localStorage.getItem('layartix_now_playing');
      const npArr = np ? JSON.parse(np) : [];
      if (force || !np || npArr.length === 0) {
        localStorage.setItem('layartix_now_playing', JSON.stringify(this.defaultNowPlaying));
      }
    } catch (e) {
      localStorage.setItem('layartix_now_playing', JSON.stringify(this.defaultNowPlaying));
    }

    try {
      const cs = localStorage.getItem('layartix_coming_soon');
      const csArr = cs ? JSON.parse(cs) : [];
      if (force || !cs || csArr.length === 0) {
        localStorage.setItem('layartix_coming_soon', JSON.stringify(this.defaultComingSoon));
      }
    } catch (e) {
      localStorage.setItem('layartix_coming_soon', JSON.stringify(this.defaultComingSoon));
    }
  },

  getNowPlaying() {
    try {
      const d = localStorage.getItem('layartix_now_playing');
      return d ? JSON.parse(d) : [...this.defaultNowPlaying];
    } catch (e) {
      return [...this.defaultNowPlaying];
    }
  },

  getComingSoon() {
    try {
      const d = localStorage.getItem('layartix_coming_soon');
      return d ? JSON.parse(d) : [...this.defaultComingSoon];
    } catch (e) {
      return [...this.defaultComingSoon];
    }
  },

  removeNowPlayingMovie(movieId) {
    try {
      let np = this.getNowPlaying();
      np = np.filter(m => m.id !== movieId);
      this.saveNowPlaying(np);
    } catch (e) {
      console.error('Failed to remove purchased movie:', e);
    }
  },

  restoreNowPlayingMovie(movie) {
    try {
      let np = this.getNowPlaying();
      if (!np.some(m => m.id === movie.id)) {
        np.unshift(movie);
        this.saveNowPlaying(np);
      }
    } catch (e) {
      console.error('Failed to restore movie:', e);
    }
  },

  getAllMovies() {
    return [...this.getNowPlaying(), ...this.getComingSoon()];
  },

  get movies() {
    return this.getAllMovies();
  },

  saveNowPlaying(list) {
    try { localStorage.setItem('layartix_now_playing', JSON.stringify(list)); } catch (e) { }
  },

  saveComingSoon(list) {
    try { localStorage.setItem('layartix_coming_soon', JSON.stringify(list)); } catch (e) { }
  },

  saveMovie(movie) {
    let np = this.getNowPlaying();
    let cs = this.getComingSoon();

    // Remove any existing entry with same ID
    np = np.filter(m => m.id !== movie.id);
    cs = cs.filter(m => m.id !== movie.id);

    if (movie.status === 'coming_soon') {
      cs.unshift(movie);
    } else {
      movie.status = 'now_playing';
      np.unshift(movie);
    }

    this.saveNowPlaying(np);
    this.saveComingSoon(cs);
    return movie;
  },

  toggleMovieStatus(movieId) {
    let np = this.getNowPlaying();
    let cs = this.getComingSoon();

    const npIdx = np.findIndex(m => m.id === movieId);
    if (npIdx >= 0) {
      const [m] = np.splice(npIdx, 1);
      m.status = 'coming_soon';
      cs.unshift(m);
      this.saveNowPlaying(np);
      this.saveComingSoon(cs);
      return m;
    }

    const csIdx = cs.findIndex(m => m.id === movieId);
    if (csIdx >= 0) {
      const [m] = cs.splice(csIdx, 1);
      m.status = 'now_playing';
      np.unshift(m);
      this.saveNowPlaying(np);
      this.saveComingSoon(cs);
      return m;
    }
    return null;
  },

  deleteMovie(movieId) {
    let np = this.getNowPlaying().filter(m => m.id !== movieId);
    let cs = this.getComingSoon().filter(m => m.id !== movieId);
    this.saveNowPlaying(np);
    this.saveComingSoon(cs);
  },

  // ── CINEMAS (LENGKAP DI SETIAP KOTA BESAR) ───────────────────
  cinemas: [
    // ── MAKASSAR (Mall Nyata) ──
    { id: 'c_mks_1', name: 'XXI Trans Studio Mall Makassar', mall: 'Trans Studio Mall', city: 'Makassar', facilities: ['IMAX', 'Premiere', 'Regular'], priceMultiplier: { Regular: 0.9, Premium: 1.3, IMAX: 1.8 }, unavailableMovies: [] },
    { id: 'c_mks_2', name: 'XXI Mal Panakkukang', mall: 'Mal Panakkukang', city: 'Makassar', facilities: ['Premiere', 'Regular', 'Dolby Atmos'], priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c_mks_3', name: 'XXI Mall Ratu Indah (MaRI)', mall: 'Mall Ratu Indah', city: 'Makassar', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c_mks_4', name: 'XXI Nipah Park', mall: 'Nipah Park Mall', city: 'Makassar', facilities: ['Premiere', 'Regular', 'Dolby Atmos'], priceMultiplier: { Regular: 0.9, Premium: 1.3, IMAX: 1.6 }, unavailableMovies: [] },
    { id: 'c_mks_5', name: 'XXI Phinisi Point (PIPO)', mall: 'Phinisi Point', city: 'Makassar', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c_mks_6', name: 'CGV Daya Grand Square', mall: 'Daya Grand Square', city: 'Makassar', facilities: ['4DX', 'Regular'], priceMultiplier: { Regular: 0.8, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: [] },

    // ── JAKARTA ──
    { id: 'c1', name: 'CGV Grand Indonesia', mall: 'Grand Indonesia', city: 'Jakarta Pusat', facilities: ['IMAX', 'Dolby Atmos', '4DX'], priceMultiplier: { Regular: 1, Premium: 1.4, IMAX: 1.9 }, unavailableMovies: [] },
    { id: 'c2', name: 'XXI Plaza Senayan', mall: 'Plaza Senayan', city: 'Jakarta Selatan', facilities: ['Premiere', 'Dolby Atmos'], priceMultiplier: { Regular: 1, Premium: 1.4, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c3', name: 'Cinépolis Lippo Mall Puri', mall: 'Lippo Mall Puri', city: 'Jakarta Barat', facilities: ['4DX', 'ScreenX', 'Regular'], priceMultiplier: { Regular: 1, Premium: 1.3, IMAX: 1.6 }, unavailableMovies: ['m_cintahujan'] },
    { id: 'c_jkt_4', name: 'XXI Kota Kasablanka', mall: 'Kota Kasablanka Mall', city: 'Jakarta Selatan', facilities: ['IMAX', 'Premiere'], priceMultiplier: { Regular: 1, Premium: 1.35, IMAX: 1.85 }, unavailableMovies: [] },
    { id: 'c_jkt_5', name: 'XXI Mall Kelapa Gading', mall: 'Mall Kelapa Gading', city: 'Jakarta Utara', facilities: ['IMAX', 'Premiere', 'Dolby Atmos'], priceMultiplier: { Regular: 1, Premium: 1.35, IMAX: 1.85 }, unavailableMovies: ['m_agaklaen2'] },
    { id: 'c_jkt_6', name: 'CGV Central Park', mall: 'Central Park Mall', city: 'Jakarta Barat', facilities: ['4DX', 'Regular'], priceMultiplier: { Regular: 1, Premium: 1.3, IMAX: 1.7 }, unavailableMovies: [] },

    // ── SURABAYA ──
    { id: 'c5', name: 'XXI Tunjungan Plaza', mall: 'Tunjungan Plaza', city: 'Surabaya', facilities: ['IMAX', 'Premiere', 'Dolby Atmos'], priceMultiplier: { Regular: 1, Premium: 1.3, IMAX: 1.8 }, unavailableMovies: [] },
    { id: 'c_sby_2', name: 'XXI Pakuwon Mall', mall: 'Pakuwon Mall', city: 'Surabaya', facilities: ['IMAX', 'Premiere'], priceMultiplier: { Regular: 1, Premium: 1.35, IMAX: 1.85 }, unavailableMovies: [] },
    { id: 'c_sby_3', name: 'CGV Marvell City', mall: 'Marvell City Mall', city: 'Surabaya', facilities: ['4DX', 'Regular'], priceMultiplier: { Regular: 0.9, Premium: 1.25, IMAX: 1.6 }, unavailableMovies: ['m_pengabdisetan3'] },
    { id: 'c_sby_4', name: 'XXI Galaxy Mall', mall: 'Galaxy Mall', city: 'Surabaya', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.95, Premium: 1.3, IMAX: 1.65 }, unavailableMovies: ['m_cintahujan'] },

    // ── BANDUNG ──
    { id: 'c6', name: 'CGV Paris Van Java', mall: 'Paris Van Java Mall', city: 'Bandung', facilities: ['4DX', 'Dolby Atmos'], priceMultiplier: { Regular: 0.9, Premium: 1.3, IMAX: 1.6 }, unavailableMovies: [] },
    { id: 'c_bdg_2', name: 'XXI 23 Paskal', mall: '23 Paskal Shopping Center', city: 'Bandung', facilities: ['IMAX', 'Regular'], priceMultiplier: { Regular: 0.95, Premium: 1.3, IMAX: 1.75 }, unavailableMovies: [] },
    { id: 'c_bdg_3', name: 'XXI Trans Studio Mall Bandung', mall: 'Trans Studio Mall', city: 'Bandung', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.9, Premium: 1.25, IMAX: 1.6 }, unavailableMovies: ['m_venom'] },
    { id: 'c_bdg_4', name: 'XXI Cihampelas Walk', mall: 'Cihampelas Walk (Ciwalk)', city: 'Bandung', facilities: ['Regular', 'Dolby Atmos'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: ['m_agaklaen2'] },

    // ── MEDAN ──
    { id: 'c8', name: 'CGV Focal Point Medan', mall: 'Focal Point Mall', city: 'Medan', facilities: ['Dolby Atmos', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c_mdn_2', name: 'XXI Centre Point Medan', mall: 'Centre Point Mall', city: 'Medan', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.9, Premium: 1.25, IMAX: 1.6 }, unavailableMovies: [] },
    { id: 'c_mdn_3', name: 'XXI Sun Plaza Medan', mall: 'Sun Plaza', city: 'Medan', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.9, Premium: 1.25, IMAX: 1.6 }, unavailableMovies: ['m_cintahujan'] },

    // ── YOGYAKARTA ──
    { id: 'c9', name: 'XXI Pakuwon Mall Jogja', mall: 'Pakuwon Mall Jogja', city: 'Yogyakarta', facilities: ['IMAX', 'Premiere'], priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.6 }, unavailableMovies: [] },
    { id: 'c_jog_2', name: 'CGV JWalk Jogja', mall: 'Sahid J-Walk', city: 'Yogyakarta', facilities: ['4DX', 'Regular'], priceMultiplier: { Regular: 0.8, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: ['m_venom'] },
    { id: 'c_jog_3', name: 'XXI Empire XXI', mall: 'Empire Mall Jogja', city: 'Yogyakarta', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: ['m_agaklaen2'] },

    // ── SEMARANG ──
    { id: 'c10', name: 'CGV Paragon Mall Semarang', mall: 'Paragon Mall', city: 'Semarang', facilities: ['4DX', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: [] },
    { id: 'c_smg_2', name: 'XXI DP Mall Semarang', mall: 'DP Mall Semarang', city: 'Semarang', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.25, IMAX: 1.55 }, unavailableMovies: ['m_pengabdisetan3'] },
    { id: 'c_smg_3', name: 'XXI The Park Mall Semarang', mall: 'The Park Mall', city: 'Semarang', facilities: ['Regular', 'Dolby Atmos'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: ['m_cintahujan'] },

    // ── DENPASAR / BALI ──
    { id: 'c_dps_1', name: 'XXI Beachwalk Kuta', mall: 'Beachwalk Shopping Center', city: 'Denpasar', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 1, Premium: 1.4, IMAX: 1.7 }, unavailableMovies: [] },
    { id: 'c_dps_2', name: 'XXI Level 21 Mall Denpasar', mall: 'Level 21 Mall', city: 'Denpasar', facilities: ['Premiere', 'Regular'], priceMultiplier: { Regular: 0.95, Premium: 1.35, IMAX: 1.65 }, unavailableMovies: [] },
    { id: 'c_dps_3', name: 'Cinépolis Plaza Renon', mall: 'Plaza Renon', city: 'Denpasar', facilities: ['Regular'], priceMultiplier: { Regular: 0.85, Premium: 1.2, IMAX: 1.5 }, unavailableMovies: ['m_venom'] }
  ],

  // Cek apakah film tersedia di bioskop tertentu
  isMovieShowingAtCinema(movieId, cinema) {
    if (!cinema.unavailableMovies || !Array.isArray(cinema.unavailableMovies)) return true;
    return !cinema.unavailableMovies.includes(movieId);
  },

  // ── SHOWTIMES ───────────────────────────────────────────────
  times: ['09:00', '11:30', '14:00', '16:30', '19:00', '21:30', '01:00'],

  // ── F&B MENU ────────────────────────────────────────────────
  fnbMenu: [
    { id: 'f1', name: 'Popcorn Reguler', emoji: '', price: 25000, category: 'Popcorn', desc: 'Popcorn renyah ukuran reguler', stock: 200, status: 'tersedia' },
    { id: 'f2', name: 'Popcorn Large', emoji: '', price: 35000, category: 'Popcorn', desc: 'Popcorn renyah ukuran jumbo', stock: 200, status: 'tersedia' },
    { id: 'f3', name: 'Cola Reguler', emoji: '', price: 20000, category: 'Minuman', desc: 'Minuman cola segar ukuran medium', stock: 200, status: 'tersedia' },
    { id: 'f4', name: 'Cola Large', emoji: '', price: 25000, category: 'Minuman', desc: 'Minuman cola segar ukuran besar', stock: 200, status: 'tersedia' },
    { id: 'f5', name: 'Hot Dog', emoji: '', price: 30000, category: 'Makanan', desc: 'Hot dog panggang dengan saus spesial', stock: 200, status: 'tersedia' },
    { id: 'f6', name: 'Nachos & Cheese', emoji: '', price: 28000, category: 'Makanan', desc: 'Nachos garing dengan saus keju cair', stock: 200, status: 'tersedia' },
    { id: 'f7', name: 'Air Mineral', emoji: '', price: 15000, category: 'Minuman', desc: 'Air mineral dingin 600ml', stock: 200, status: 'tersedia' },
    { id: 'f8', name: 'Es Teh Manis', emoji: '', price: 10000, category: 'Minuman', desc: 'Es teh manis segar', stock: 200, status: 'tersedia' },
    { id: 'f9', name: 'Mie Goreng', emoji: '', price: 35000, category: 'Makanan', desc: 'Mie goreng panas dengan telur', stock: 200, status: 'tersedia' },
    { id: 'f10', name: 'Combo A – Hemat', emoji: '', price: 40000, category: 'Combo', desc: '1 Popcorn Reguler + 1 Cola Reguler (hemat 5rb)', stock: 200, status: 'tersedia' },
    { id: 'f11', name: 'Combo B – Couple', emoji: '', price: 70000, category: 'Combo', desc: '2 Popcorn Reguler + 2 Cola Reguler (hemat 10rb)', stock: 200, status: 'tersedia' },
    { id: 'f12', name: 'Combo C – Premium', emoji: '', price: 95000, category: 'Combo', desc: '2 Popcorn Large + 2 Cola Large (hemat 20rb)', stock: 200, status: 'tersedia' }
  ],


  // ── F&B MENU — localStorage-backed methods ──────────────────
  getFnbMenu() {
    try {
      const d = localStorage.getItem('layartix_fnb_menu');
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Pastikan setiap item memiliki properti stock (default 200)
          return parsed.map(item => ({
            ...item,
            stock: item.stock !== undefined ? Number(item.stock) : 200,
            status: (item.stock !== undefined ? Number(item.stock) : 200) > 0 ? (item.status || 'tersedia') : 'habis'
          }));
        }
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(this.fnbMenu)); // fallback ke default
  },

  saveFnbMenu(menu) {
    try {
      localStorage.setItem('layartix_fnb_menu', JSON.stringify(menu));
    } catch (e) {}
  },

  initFnbMenu() {
    try {
      const existing = localStorage.getItem('layartix_fnb_menu');
      const arr = existing ? JSON.parse(existing) : null;
      if (!Array.isArray(arr) || arr.length === 0) {
        // Beri default stok 200 pada setiap item
        const defaultWithStock = this.fnbMenu.map(item => ({
          ...item,
          stock: item.stock !== undefined ? item.stock : 200,
          status: item.status || 'tersedia'
        }));
        this.saveFnbMenu(defaultWithStock);
      } else {
        // Normalisasi item lama yang belum memiliki properti stock
        let changed = false;
        const normalized = arr.map(item => {
          if (item.stock === undefined) {
            changed = true;
            return { ...item, stock: 200, status: item.status || 'tersedia' };
          }
          return item;
        });
        if (changed) this.saveFnbMenu(normalized);
      }
    } catch (e) {
      this.saveFnbMenu(this.fnbMenu);
    }
  },

  // Kurangi stok F&B saat pembelian/checkout
  decreaseFnbStock(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    let menu = this.getFnbMenu();
    let updated = false;

    items.forEach(it => {
      const itemId = it.id;
      const qty = Number(it.qty || 1);
      const target = menu.find(x => x.id === itemId);
      if (target) {
        const currentStock = target.stock !== undefined ? Number(target.stock) : 200;
        target.stock = Math.max(0, currentStock - qty);
        target.status = target.stock > 0 ? 'tersedia' : 'habis';
        updated = true;
      }
    });

    if (updated) {
      this.saveFnbMenu(menu);
      try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
    }
  },

  // Pulihkan/kembalikan stok F&B saat pembatalan atau transaksi kedaluwarsa (maksimal 200)
  restoreFnbStock(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    let menu = this.getFnbMenu();
    let updated = false;

    items.forEach(it => {
      const itemId = it.id;
      const qty = Number(it.qty || 1);
      const target = menu.find(x => x.id === itemId);
      if (target) {
        const currentStock = target.stock !== undefined ? Number(target.stock) : 200;
        target.stock = Math.min(200, currentStock + qty);
        target.status = target.stock > 0 ? 'tersedia' : 'habis';
        updated = true;
      }
    });

    if (updated) {
      this.saveFnbMenu(menu);
      try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
    }
  },

  saveFnbItem(item) {
    let menu = this.getFnbMenu();
    const idx = menu.findIndex(x => x.id === item.id);
    if (idx >= 0) menu[idx] = item;
    else menu.push(item);
    this.saveFnbMenu(menu);
    try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
    return item;
  },

  deleteFnbItem(id) {
    let menu = this.getFnbMenu().filter(x => x.id !== id);
    this.saveFnbMenu(menu);
    try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
  },

  updateFnbStock(id, newStock, status) {
    let menu = this.getFnbMenu();
    const item = menu.find(x => x.id === id);
    if (item) {
      item.stock = Math.max(0, Number(newStock) || 0);
      item.status = status || (item.stock > 0 ? 'tersedia' : 'habis');
      this.saveFnbMenu(menu);
      try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
    }
    return item;
  },

  // ── CINEMAS / CABANG MULTI-BIOSKOP (LOCALSTORAGE-BACKED) ────
  getCinemas() {
    try {
      const d = localStorage.getItem('layartix_cinemas');
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(this.cinemas));
  },

  saveCinemas(list) {
    try {
      localStorage.setItem('layartix_cinemas', JSON.stringify(list));
      localStorage.setItem('layartix_admin_update', Date.now().toString());
    } catch (e) {}
  },

  addCinema(c) {
    const list = this.getCinemas();
    list.push(c);
    this.saveCinemas(list);
    return c;
  },

  updateCinema(c) {
    let list = this.getCinemas();
    const idx = list.findIndex(x => x.id === c.id);
    if (idx >= 0) list[idx] = c;
    else list.push(c);
    this.saveCinemas(list);
    return c;
  },

  initCinemas() {
    try {
      const existing = localStorage.getItem('layartix_cinemas');
      if (!existing || JSON.parse(existing).length === 0) {
        this.saveCinemas(this.cinemas);
      }
    } catch (e) {
      this.saveCinemas(this.cinemas);
    }
  },

  // ── KODE PROMO & VOUCHER DISKON ─────────────────────────────
  defaultPromos: [
    { id: 'p_1', code: 'LAYARHEMAT10', type: 'fixed', value: 10000, minSpend: 50000, quota: 100, used: 14, status: 'active', desc: 'Potongan Rp 10.000 (Min. transaksi Rp 50.000)' },
    { id: 'p_2', code: 'NONTONSERU20', type: 'percent', value: 20, maxDiscount: 25000, minSpend: 60000, quota: 50, used: 9, status: 'active', desc: 'Diskon 20% maks. Rp 25.000 (Min. Rp 60.000)' },
    { id: 'p_3', code: 'LAYARTIXVIP', type: 'fixed', value: 25000, minSpend: 100000, quota: 30, used: 5, status: 'active', desc: 'Diskon Spesial VIP Rp 25.000 (Min. Rp 100.000)' }
  ],

  getPromos() {
    try {
      const d = localStorage.getItem('layartix_promos');
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(this.defaultPromos));
  },

  savePromos(list) {
    try {
      localStorage.setItem('layartix_promos', JSON.stringify(list));
      localStorage.setItem('layartix_admin_update', Date.now().toString());
    } catch (e) {}
  },

  savePromo(promo) {
    let list = this.getPromos();
    const idx = list.findIndex(p => p.id === promo.id);
    if (idx >= 0) list[idx] = promo;
    else list.unshift(promo);
    this.savePromos(list);
    return promo;
  },

  deletePromo(id) {
    let list = this.getPromos().filter(p => p.id !== id);
    this.savePromos(list);
  },

  initPromos() {
    try {
      const existing = localStorage.getItem('layartix_promos');
      if (!existing || JSON.parse(existing).length === 0) {
        this.savePromos(this.defaultPromos);
      }
    } catch (e) {
      this.savePromos(this.defaultPromos);
    }
  },

  applyPromo(code, subtotal) {
    const promos = this.getPromos();
    const p = promos.find(x => x.code.toUpperCase() === (code || '').trim().toUpperCase() && x.status === 'active');
    if (!p) return { success: false, message: 'Kode promo tidak valid atau sudah tidak aktif.' };
    if (p.quota !== undefined && p.used !== undefined && p.used >= p.quota) {
      return { success: false, message: 'Kuota penggunaan kode promo ini sudah habis.' };
    }
    if (p.minSpend && subtotal < p.minSpend) {
      return { success: false, message: `Minimal belanja Rp ${p.minSpend.toLocaleString('id-ID')} untuk menggunakan promo ini.` };
    }
    let discount = 0;
    if (p.type === 'fixed') {
      discount = p.value;
    } else if (p.type === 'percent') {
      discount = Math.round((subtotal * p.value) / 100);
      if (p.maxDiscount) discount = Math.min(discount, p.maxDiscount);
    }
    return { success: true, discount, promo: p };
  },

  usePromo(code) {
    let promos = this.getPromos();
    const p = promos.find(x => x.code.toUpperCase() === (code || '').trim().toUpperCase());
    if (p) {
      p.used = (p.used || 0) + 1;
      this.savePromos(promos);
    }
  },

  // ── MULTI-CABANG ADMIN SCOPE HELPER ────────────────────────
  getCurrentAdminScope() {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return {
        isSuperAdmin: true,
        isBranchAdmin: false,
        branchId: null,
        branchName: 'Semua Cabang (Super Admin)',
        city: null,
        user: null
      };
    }
    const isBranch = !!(user.branchId && user.branchId !== 'all');
    return {
      isSuperAdmin: !isBranch,
      isBranchAdmin: isBranch,
      branchId: isBranch ? user.branchId : null,
      branchName: isBranch ? (user.branchName || 'Cabang Bioskop') : 'Semua Cabang',
      city: isBranch ? (user.city || 'Semua Kota') : 'Semua Kota',
      user
    };
  },

  setAdminBranchScope(branchId, branchName, city) {
    let user = this.getCurrentUser();
    if (!user || user.role !== 'admin') {
      user = { id: 'u_admin', name: 'Administrator', email: 'admin@layartix.com', role: 'admin' };
    }
    if (!branchId || branchId === 'all') {
      user.adminRole = 'super_admin';
      user.branchId = null;
      user.branchName = 'Semua Cabang';
      user.city = null;
    } else {
      user.adminRole = 'branch_admin';
      user.branchId = branchId;
      user.branchName = branchName;
      user.city = city;
    }
    this.setCurrentUser(user);
    try { localStorage.setItem('layartix_admin_update', Date.now().toString()); } catch(e) {}
    return user;
  },

  // ── SEAT RESET & MONITORING ────────────────────────────────
  getResetSeats() {
    try {
      const d = localStorage.getItem('layartix_reset_seats');
      return d ? JSON.parse(d) : [];
    } catch (e) { return []; }
  },

  resetSeatBooking(cinemaId, date, time, seatId) {
    let resets = this.getResetSeats();
    const key = `${cinemaId}_${date}_${time}_${seatId}`;
    if (!resets.includes(key)) {
      resets.push(key);
      localStorage.setItem('layartix_reset_seats', JSON.stringify(resets));
    }
    // Hapus juga kursi dari transaksi aktif jika ada
    let bookings = this.getBookings();
    let changed = false;
    bookings.forEach(b => {
      if (b.cinemaId === cinemaId && b.date === date && b.time === time && Array.isArray(b.seats)) {
        if (b.seats.includes(seatId)) {
          b.seats = b.seats.filter(s => s !== seatId);
          changed = true;
        }
      }
    });
    if (changed) this.saveBookings(bookings);
    localStorage.setItem('layartix_admin_update', Date.now().toString());
    return true;
  },
  // ── UTILITY FUNCTIONS ───────────────────────────────────────
  formatRp(amount) {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return 'Rp 0';
    // Bulatkan bilangan bulat agar tidak menghasilkan angka desimal pecahan seperti .50 atau desimal cents
    const rounded = Math.round(Number(amount));
    return 'Rp ' + rounded.toLocaleString('id-ID');
  },

  generateId(prefix) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${ts}-${rand}`;
  },

  getRatingBadge(rating) {
    const map = {
      'SU': { label: 'SU', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
      'D13': { label: 'D13', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
      'D17': { label: '17+', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
      'D21': { label: '21+', color: '#dc2626', bg: 'rgba(220,38,38,0.2)' },
      'R13': { label: 'R13', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    };
    return map[rating] || map['SU'];
  },

  needsAgeWarning(rating) {
    return rating === 'D17' || rating === 'D21';
  },

  getContentAdvisory(rating, genre = '') {
    const isHorror = genre.toLowerCase().includes('horor') || genre.toLowerCase().includes('misteri');
    const isAction = genre.toLowerCase().includes('aksi') || genre.toLowerCase().includes('petualangan');

    if (rating === 'D21' || rating === '21+') {
      return {
        badge: '21+',
        label: 'Dewasa 21+ (Khusus 21 Tahun Ke Atas)',
        color: '#dc2626',
        bg: 'rgba(220,38,38,0.18)',
        items: [
          { tag: ' Kekerasan Grafis Ekstrem', level: 'Tinggi', desc: 'Adegan perkelahian brutal, luka terbuka, dan adegan berdarah intens.' },
          { tag: ' Bahasa Kasar & Vulgar', level: 'Tinggi', desc: 'Penggunaan umpatan dan kata-kata kasar yang sering dan eksplisit.' },
          { tag: ' Ketakutan & Teror Psikologis', level: 'Maksimal', desc: 'Ketegangan audio-visual mengerikan yang dapat memicu ketidaknyamanan bagi anak.' }
        ]
      };
    }
    if (rating === 'D17' || rating === '17+') {
      return {
        badge: '17+',
        label: 'Dewasa 17+ (Bimbingan Keras)',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.18)',
        items: [
          { tag: ' Kekerasan & Laga', level: 'Sedang-Tinggi', desc: 'Pertarungan fisik sengit, senjata tajam, atau efek tembakan realistis.' },
          { tag: ' Unsur Horor & Jump Scare', level: isHorror ? 'Tinggi' : 'Sedang', desc: 'Nuansa supranatural, jumpscare berulang, dan ketegangan mencekam.' },
          { tag: ' Bahasa Kasar & Konflik', level: 'Sedang', desc: 'Dialog bertema dewasa dan kata-kata kasar yang tidak pantas untuk anak di bawah umur.' }
        ]
      };
    }
    if (rating === 'D13' || rating === 'R13' || rating === '13+') {
      return {
        badge: '13+',
        label: 'Remaja 13+ (Bimbingan Orang Tua)',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.18)',
        items: [
          { tag: ' Laga Fantasi & Ledakan', level: 'Sedang', desc: isAction ? 'Koreografi aksi laga superhero dan adegan kehancuran berskala besar.' : 'Ketegangan drama ringan.' },
          { tag: ' Bahasa Gaul & Ringan', level: 'Ringan', desc: 'Bahasa sehari-hari remaja tanpa umpatan ekstrem.' },
          { tag: ' Unsur Ketegangan Sci-Fi', level: 'Ringan', desc: 'Efek visual futuristik dengan kejutan ringan.' }
        ]
      };
    }
    return {
      badge: 'SU',
      label: 'Semua Umur (General Audience)',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.18)',
      items: [
        { tag: ' Konten Ramah Keluarga', level: 'Aman', desc: 'Tidak ada kekerasan grafis, bahasa kasar, atau konten dewasa berbahaya.' },
        { tag: ' Edukatif & Menghibur', level: 'Positif', desc: 'Cocok ditonton oleh anak-anak, remaja, dan seluruh anggota keluarga.' }
      ]
    };
  },

  getAgeWarningText(rating) {
    if (rating === 'D21') return {
      age: '21+',
      title: 'KHUSUS DEWASA 21+',
      text: 'Film ini mengandung konten dewasa yang hanya sesuai untuk penonton berusia 21 TAHUN KE ATAS. Pastikan Anda memiliki identitas resmi untuk diverifikasi petugas bioskop.',
      color: '#dc2626'
    };
    return {
      age: '17+',
      title: 'BATAS USIA 17+',
      text: 'Film ini hanya diperuntukkan bagi penonton berusia 17 TAHUN KE ATAS. Mohon tunjukkan Kartu Tanda Penduduk (KTP) atau identitas resmi lainnya kepada petugas di pintu masuk studio.',
      color: '#ef4444'
    };
  },

  getSeatErgonomics(row) {
    const map = {
      'A': { icon: '', level: 'Kurang Nyaman', color: '#ef4444', text: 'Terlalu dekat layar. Sudut pandang >65°. Leher harus mendongak tajam. Tidak disarankan untuk film panjang.' },
      'B': { icon: '', level: 'Kurang Nyaman', color: '#f97316', text: 'Dekat layar. Sudut pandang ~60°. Mungkin kurang nyaman untuk leher dalam waktu lama.' },
      'C': { icon: '', level: 'Sangat Baik', color: '#22c55e', text: 'Sudut pandang ideal ~50°. Posisi leher optimal dan nyaman. Sangat direkomendasikan!' },
      'D': { icon: '', level: 'Terbaik', color: '#22c55e', text: 'Sudut pandang sempurna ~45°. Posisi leher paling rileks. Pilihan terbaik untuk kenyamanan maksimal!' },
      'E': { icon: '', level: 'Baik', color: '#84cc16', text: 'Sudut pandang ~38°. Nyaman untuk nonton film panjang. Sedikit jauh tapi masih jelas.' },
      'F': { icon: '', level: 'Cukup Baik', color: '#a3e635', text: 'Sudut pandang ~32°. Jarak sedikit jauh namun nyaman untuk leher. Baik untuk pengguna kacamata.' },
      'G': { icon: '', level: 'Paling Santai', color: '#ffd700', text: 'Sudut pandang paling lebar ~28°. Dapat melihat seluruh layar sekaligus. Ideal untuk yang suka pemandangan penuh.' }
    };
    return map[row] || map['D'];
  },

  // ── ROTASI SUDUT PANDANG & SIMULASI LEHER MATA ──────────────
  getSeatViewSimulation(row, col) {
    const colNum = parseInt(col) || 5;
    const center = 5.5;
    const delta = colNum - center;
    const yawAngle = Math.round(Math.abs(delta) * 5.6);
    let yawText = '';
    let yawDir = 'center';
    if (delta < -0.6) {
      yawText = `${yawAngle}° ke Kanan`;
      yawDir = 'right';
    } else if (delta > 0.6) {
      yawText = `${yawAngle}° ke Kiri`;
      yawDir = 'left';
    } else {
      yawText = '0° Tegak Lurus (Presisi Tengah)';
      yawDir = 'center';
    }

    const rowPitchMap = {
      'A': { pitch: 34, elev: 'Mendongak (+34°)', neckStatus: 'Beban Leher Berat', color: '#ef4444' },
      'B': { pitch: 25, elev: 'Mendongak (+25°)', neckStatus: 'Sedikit Pegal', color: '#f97316' },
      'C': { pitch: 17, elev: 'Mendongak Nyaman (+17°)', neckStatus: 'Nyaman Ergonomis', color: '#84cc16' },
      'D': { pitch: 11, elev: 'Sudut Emas (+11°)', neckStatus: 'Sangat Rileks / Sweet Spot', color: '#22c55e' },
      'E': { pitch: 8, elev: 'Sudut Emas (+8°)', neckStatus: 'Sangat Rileks / Sweet Spot', color: '#22c55e' },
      'F': { pitch: 4, elev: 'Sejajar Rileks (+4°)', neckStatus: 'Pandangan Santai', color: '#10b981' },
      'G': { pitch: 1, elev: 'Pandangan Datar (+1°)', neckStatus: 'Tanpa Beban Leher', color: '#ffd700' }
    };
    const rowInfo = rowPitchMap[row] || rowPitchMap['D'];

    let score = 'SANGAT IDEAL (SWEET SPOT)';
    let summary = '';
    if (['D', 'E'].includes(row) && Math.abs(delta) <= 2) {
      score = 'SANGAT IDEAL (SWEET SPOT)';
      summary = 'Posisi terbaik di studio bioskop! Pandangan tegak lurus layar dengan sudut pandang mata dan kenyamanan leher paling sempurna.';
    } else if (['C', 'F'].includes(row) && Math.abs(delta) <= 3) {
      score = 'IDEAL & NYAMAN';
      summary = 'Kenyamanan mata sangat baik, jarak layar proporsional dengan rotasi leher minimal.';
    } else if (['A', 'B'].includes(row)) {
      score = 'PERHATIAN SUDUT TINGGI';
      summary = 'Posisi dekat dengan layar. Otot leher perlu mendongak ke atas selama menonton film.';
    } else {
      score = 'SUDUT PANDANG SAMPING';
      summary = `Posisi di sisi samping. Penonton perlu sedikit menoleh (${yawText}) menghadap layar bioskop.`;
    }

    return {
      row,
      col: colNum,
      seatId: `${row}${colNum}`,
      yawAngle,
      yawText,
      yawDir,
      pitchAngle: rowInfo.pitch,
      pitchText: rowInfo.elev,
      neckStatus: rowInfo.neckStatus,
      color: rowInfo.color,
      score,
      summary
    };
  },

  // ── LocalStorage Helpers ────────────────────────────────────
  save(key, data) {
    try { localStorage.setItem('lt_' + key, JSON.stringify(data)); } catch (e) { }
  },

  load(key, fallback = null) {
    try {
      const d = localStorage.getItem('lt_' + key);
      return d ? JSON.parse(d) : fallback;
    } catch (e) { return fallback; }
  },

  getSelectedCity() {
    return this.load('selected_city') || 'Makassar';
  },

  setSelectedCity(city) {
    this.save('selected_city', city);
  },

  // ── Auth Helpers ────────────────────────────────────────────
  getCurrentUser() {
    let u = this.load('current_user');
    if (!u) {
      try {
        const raw = localStorage.getItem('layartix_session') || localStorage.getItem('layartix_user');
        if (raw) u = JSON.parse(raw);
      } catch (e) {}
    }
    return u;
  },

  setCurrentUser(user) {
    this.save('current_user', user);
    try {
      localStorage.setItem('layartix_user', JSON.stringify(user));
      const roleStr = user ? (user.adminRole || user.role || 'customer') : 'customer';
      const sessionObj = {
        id: user?.id,
        name: user?.name,
        username: user?.username || user?.email,
        email: user?.email,
        phone: user?.phone,
        role: roleStr,
        isAdmin: user?.role === 'admin',
        branchId: user?.branchId || null,
        branchName: user?.branchName || (user?.role === 'admin' ? 'Semua Cabang' : null),
        city: user?.city || null,
        loggedInAt: new Date().toISOString()
      };
      localStorage.setItem('layartix_session', JSON.stringify(sessionObj));
    } catch (e) {}
  },

  getSession() {
    try {
      const s = localStorage.getItem('layartix_session');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },

  logout() {
    localStorage.removeItem('lt_current_user');
    localStorage.removeItem('layartix_user');
    localStorage.removeItem('layartix_session');
  },

  requireAuth(role = 'customer') {
    const user = this.getCurrentUser();
    if (!user) {
      // Direct always to unified login page
      window.location.href = role === 'admin' ? '../../customer/html/login.html' : 'login.html';
      return null;
    }
    if (role && user.role !== role) {
      window.location.href = role === 'admin' ? '../../customer/html/login.html' : 'login.html';
      return null;
    }
    return user;
  },

  getUsers() {
    return this.load('users', []);
  },

  saveUsers(users) {
    this.save('users', users);
  },

  updateUserWallet(userId, newBalance) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) {
      users[idx].wallet = newBalance;
      this.saveUsers(users);
      const cu = this.getCurrentUser();
      if (cu && cu.id === userId) {
        cu.wallet = newBalance;
        this.setCurrentUser(cu);
      }
    }
  },

  // ── Bookings & Global Ticket Storage ───────────────────────
  saveTicketToStorage(ticketData) {
    if (!ticketData) return;
    try {
      let activeTickets = [];
      const raw = localStorage.getItem('layartix_active_tickets');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) activeTickets = parsed;
        } catch (e) { }
      }
      // Pastikan status active
      if (!ticketData.status) ticketData.status = 'active';
      // Cek apakah ID sudah ada: update jika ada, push ke array jika baru (tidak menimpa data lain)
      const idx = activeTickets.findIndex(t => t.id === ticketData.id);
      if (idx >= 0) {
        activeTickets[idx] = ticketData;
      } else {
        activeTickets.push(ticketData);
      }
      localStorage.setItem('layartix_active_tickets', JSON.stringify(activeTickets));
      this.save('bookings', activeTickets);
    } catch (err) {
      console.error('saveTicketToStorage error:', err);
    }
  },

  getBookings() {
    // Membaca langsung dari layartix_active_tickets dan fallback lt_bookings
    try {
      const activeTicketsRaw = localStorage.getItem('layartix_active_tickets');
      if (activeTicketsRaw) {
        const parsed = JSON.parse(activeTicketsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) { }
    return this.load('bookings', []);
  },

  saveBookings(bookings) {
    this.save('bookings', bookings);
    try {
      localStorage.setItem('layartix_active_tickets', JSON.stringify(bookings));
    } catch (e) { }
  },

  addBooking(booking) {
    const bookings = this.getBookings();
    this.saveTicketToStorage(booking);
  },

  getUserBookings(userId) {
    const all = this.getBookings();
    if (!userId) return all;
    return all.filter(b => b.userId === userId || !b.userId || b.userId === 'GUEST' || b.userId === 'u_test');
  },

  // ── F&B Orders ──────────────────────────────────────────────
  getFnbOrders() {
    return this.load('fnb_orders', []);
  },

  saveFnbOrders(orders) {
    this.save('fnb_orders', orders);
  },

  addFnbOrder(order) {
    const orders = this.getFnbOrders();
    orders.unshift(order);
    this.save('fnb_orders', orders);
  },

  // ── Movie Reviews with Spoiler Protection & Media Attachment ─────────
  getReviews(movieId) {
    if (!movieId) return [];
    // Cek localStorage spesifik key 'layartix_reviews_' + movieId
    const directKey = 'layartix_reviews_' + movieId;
    const directData = localStorage.getItem(directKey);
    if (directData) {
      try {
        const parsed = JSON.parse(directData);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }

    const all = this.load('movie_reviews', {}) || {};
    if (all[movieId] && Array.isArray(all[movieId]) && all[movieId].length > 0) {
      return all[movieId];
    }

    // Default seed review khusus per film agar tidak tercampur
    const movieSeedReviews = {
      'm_clayface': [
        {
          id: 'rev_clayface_1',
          userName: 'Dion Saputra',
          userAvatar: '',
          rating: 5,
          date: '2 hari yang lalu',
          text: 'Efek riasan dan CGI Clayface beneran juara! Ketegangan psikologisnya dapet banget dari menit awal.',
          isSpoiler: false,
          likes: 31
        },
        {
          id: 'rev_clayface_2',
          userName: 'Siti Rahma',
          userAvatar: '',
          rating: 4,
          date: 'Kemarin',
          text: 'Adegan akhir saat sang aktor bertarung melawan bayangan dirinya sendiri memberikan twist mengejutkan yang gak disangka!',
          isSpoiler: true,
          likes: 19
        }
      ],
      'm_kuasagelap': [
        {
          id: 'rev_kuasa_1',
          userName: 'Rian Pratama',
          userAvatar: '',
          rating: 5,
          date: '1 hari yang lalu',
          text: 'Nuansa horor eksorsisme yang sangat mencekam dan berkelas. Sound design di studio Dolby Atmos bikin merinding!',
          isSpoiler: false,
          likes: 27
        },
        {
          id: 'rev_kuasa_2',
          userName: 'Budi Santoso',
          userAvatar: '',
          rating: 4,
          date: '2 hari yang lalu',
          text: 'Ternyata sosok yang kerasukan di awal cerita adalah kunci dari perjanjian kutukan keluarga sejak 30 tahun lalu.',
          isSpoiler: true,
          likes: 14
        }
      ],
      'm_pirunduk': [
        {
          id: 'rev_pirunduk_1',
          userName: 'Maya Anggraini',
          userAvatar: '',
          rating: 4,
          date: '3 hari yang lalu',
          text: 'Jumpscare-nya pas dan cerita folklor lokalnya dikemas sangat rapi dan menegangkan!',
          isSpoiler: false,
          likes: 15
        }
      ],
      'm_bapakjujur': [
        {
          id: 'rev_bapak_1',
          userName: 'Andi Wijaya',
          userAvatar: '',
          rating: 5,
          date: 'Kemarin',
          text: 'Komedi keluarga paling segar tahun ini! Satu studio ketawa terbahak-bahak melihat kelakuan si bapak.',
          isSpoiler: false,
          likes: 42
        }
      ],
      'm_streetfighter': [
        {
          id: 'rev_sf_1',
          userName: 'Fajar Nugraha',
          userAvatar: '',
          rating: 5,
          date: '2 hari yang lalu',
          text: 'Koreografi aksi bertarung dan visual hadoken luar biasa epik! Nostalgia masa kecil terbayar lunas.',
          isSpoiler: false,
          likes: 35
        }
      ]
    };

    const initial = movieSeedReviews[movieId] || [
      {
        id: 'rev_' + movieId + '_1',
        userName: 'Rian Pratama',
        userAvatar: '',
        rating: 5,
        date: '2 hari yang lalu',
        text: 'Pengalaman menonton yang sangat memuaskan di layar lebar. Sinematografi dan musik latarnya luar biasa!',
        isSpoiler: false,
        likes: 24
      },
      {
        id: 'rev_' + movieId + '_2',
        userName: 'Anisa Melati',
        userAvatar: '',
        rating: 4,
        date: 'Kemarin',
        text: 'Klimaks di babak ketiga menyimpan pengungkapan cerita rahasia yang sangat emosional dan tak terduga.',
        isSpoiler: true,
        likes: 18
      }
    ];

    all[movieId] = initial;
    this.save('movie_reviews', all);
    try {
      localStorage.setItem(directKey, JSON.stringify(initial));
    } catch (e) {}
    return initial;
  },

  addReview(movieId, review) {
    if (!movieId || !review) return [];
    const directKey = 'layartix_reviews_' + movieId;
    const current = this.getReviews(movieId);
    const updated = [review, ...current];
    
    // Simpan ke dictionary dan key individual
    const all = this.load('movie_reviews', {}) || {};
    all[movieId] = updated;
    this.save('movie_reviews', all);
    try {
      localStorage.setItem(directKey, JSON.stringify(updated));
    } catch (e) {}

    return updated;
  },

  getMovieRatingSummary(movieId) {
    const revs = this.getReviews(movieId);
    if (!revs || !revs.length) {
      return { average: 5.0, count: 0, formattedAvg: '5.0', starsText: '★★★★★' };
    }
    const sum = revs.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const avg = sum / revs.length;
    const rounded = Math.round(avg);
    const starsText = '★'.repeat(rounded) + '☆'.repeat(Math.max(0, 5 - rounded));
    return {
      average: avg,
      count: revs.length,
      formattedAvg: avg.toFixed(1),
      starsText: starsText
    };
  },

  // ── Traffic & Cinema Logistics Route ────────────────────────
  getCinemaTrafficInfo(cinema) {
    // Simulasi live traffic berdasarkan mall dan waktu
    const hour = new Date().getHours();
    const isRushHour = (hour >= 11 && hour <= 13) || (hour >= 16 && hour <= 20);
    const trafficLevels = ['Lancar', 'Padat Merayap', 'Macet'];

    // Deterministic traffic per cinema name
    const hash = (cinema.name || '').length % 3;
    const currentCondition = isRushHour ? (hash === 0 ? 'Macet Parah' : 'Padat Merayap') : (hash === 2 ? 'Ramai Lancar' : 'Lancar');
    const delayMinutes = isRushHour ? (hash === 0 ? 35 : 20) : 5;
    const statusColor = currentCondition.includes('Macet') ? '#ef4444' : (currentCondition.includes('Padat') ? '#f59e0b' : '#22c55e');


    return {
      status: currentCondition,
      color: statusColor,
      delayMinutes,
      isCongested: currentCondition.includes('Macet') || currentCondition.includes('Padat'),
      routeSummary: `Via Jalur Utama Mall ${cinema.mall}`,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((cinema.name || '') + ' ' + (cinema.mall || '') + ' ' + (cinema.city || ''))}`
    };
  },

  // ── Seed Data ───────────────────────────────────────────────
  seedIfEmpty() {
    let users = this.getUsers();
    // Default system users jika belum ada
    const defaultSuperAdmin = {
      id: 'u_admin', name: 'Super Administrator', email: 'admin@layartix.com', username: 'admin',
      phone: '081200000000', password: 'admin123', role: 'admin', adminRole: 'super_admin',
      branchId: null, branchName: 'Semua Cabang (Super Admin)', city: null,
      wallet: 0, avatar: '', createdAt: new Date().toISOString()
    };
    const defaultBranchAdminNipah = {
      id: 'u_admin_nipah', name: 'Admin Nipah Mall XXI', email: 'nipah@layartix.com', username: 'admin_nipah',
      phone: '081211111111', password: 'nipah123', role: 'admin', adminRole: 'branch_admin',
      branchId: 'c_mks_4', branchName: 'XXI Nipah Park', city: 'Makassar',
      wallet: 0, avatar: '', createdAt: new Date().toISOString()
    };
    const defaultBranchAdminGorontalo = {
      id: 'u_admin_gorontalo', name: 'Admin Gorontalo Mall', email: 'gorontalo@layartix.com', username: 'admin_gorontalo',
      phone: '081222222222', password: 'gorontalo123', role: 'admin', adminRole: 'branch_admin',
      branchId: 'c_gorontalo_1', branchName: 'XXI Gorontalo Mall', city: 'Gorontalo',
      wallet: 0, avatar: '', createdAt: new Date().toISOString()
    };
    const defaultCustomer = {
      id: 'u_test', name: 'Budi Santoso', email: 'user@test.com', username: 'budi',
      phone: '081234567890', password: 'user123', role: 'customer',
      wallet: 500000, avatar: '', createdAt: new Date().toISOString()
    };

    if (users.length === 0) {
      users = [defaultSuperAdmin, defaultBranchAdminNipah, defaultBranchAdminGorontalo, defaultCustomer];
      this.saveUsers(users);

      // Seed sample bookings for test user
      const now = new Date();
      const sampleBookings = [
        {
          id: 'LTX-SAMPLE-001',
          userId: 'u_test',
          movieId: 'm1',
          movieTitle: 'Nusantara: Rise of the Dragon',
          movieRating: 'D13',
          cinemaId: 'c1',
          cinemaName: 'CGV Grand Indonesia',
          mall: 'Grand Indonesia',
          city: 'Jakarta Pusat',
          date: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          time: '19:00',
          seats: ['D5', 'D6'],
          seatType: 'Regular',
          ticketPrice: 65000,
          totalTicket: 130000,
          fnbItems: [
            { id: 'f10', name: 'Combo A – Hemat', price: 40000, qty: 2 }
          ],
          totalFnb: 80000,
          tax: 21000,
          grandTotal: 231000,
          status: 'active',
          splitBill: false,
          paymentMethod: 'QRIS Standar (BCA/GoPay)',
          paidAt: new Date().toISOString(),
          qrData: 'LTX-SAMPLE-001|Nusantara|CGV Grand Indonesia|D5,D6|19:00',
          poster: 'https://picsum.photos/seed/dragon2024/300/450'
        },
        {
          id: 'LTX-SAMPLE-002',
          userId: 'u_test',
          movieId: 'm2',
          movieTitle: 'Cinta di Bawah Hujan',
          movieRating: 'SU',
          cinemaId: 'c2',
          cinemaName: 'XXI Plaza Senayan',
          mall: 'Plaza Senayan',
          city: 'Jakarta Selatan',
          date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          time: '16:30',
          seats: ['E3'],
          seatType: 'Regular',
          ticketPrice: 55000,
          totalTicket: 55000,
          fnbItems: [],
          totalFnb: 0,
          tax: 5500,
          grandTotal: 60500,
          status: 'used',
          splitBill: false,
          paymentMethod: 'Transfer Bank VA (BCA)',
          paidAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          qrData: 'LTX-SAMPLE-002|Cinta di Bawah Hujan|XXI Plaza Senayan|E3|16:30',
          poster: 'https://picsum.photos/seed/romance2024/300/450'
        }
      ];
      this.saveBookings(sampleBookings);
    }
  },

  // ── Booking Session (for checkout flow) ──────────────────────
  setSession(data) { this.save('session', data); },
  getSession() { return this.load('session', {}); },
  clearSession() { localStorage.removeItem('lt_session'); },

  // ── Toast Notification ───────────────────────────────────────
  toast(message, type = 'success', duration = 3000) {
    const existing = document.getElementById('lt-toast');
    if (existing) existing.remove();

    const colors = {
      success: { bg: '#22c55e', icon: '' },
      error: { bg: '#ef4444', icon: '' },
      info: { bg: '#3b82f6', icon: '' },
      warning: { bg: '#f59e0b', icon: '' }
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'lt-toast';
    toast.style.cssText = `
      position:fixed; bottom:90px; left:50%; transform:translateX(-50%) translateY(20px);
      background:${c.bg}; color:#fff; padding:12px 20px; border-radius:12px;
      font-size:14px; font-weight:500; z-index:99999; opacity:0;
      transition:all 0.3s; max-width:90vw; text-align:center;
      box-shadow:0 4px 20px rgba(0,0,0,0.4); display:flex; align-items:center; gap:8px;
      font-family:'Inter',sans-serif;
    `;
    toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; }, 10);
    setTimeout(() => {
      toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ── QR Code Generator ────────────────────────────────────────
  generateQR(containerId, data, size = 160) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (window.QRCode) {
      new QRCode(container, {
        text: data || 'LTX-TICKET',
        width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // Fallback: show text QR placeholder
      container.style.cssText = `width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center;border-radius:8px;padding:8px;`;
      container.innerHTML = `<div style="font-size:9px;color:#000;word-break:break-all;text-align:center">${data}</div>`;
    }
  }
};

// Auto-initialize movies and seed data on load
LT.initMovies();
LT.seedIfEmpty();
LT.initFnbMenu();

// Global function to save ticket and redirect immediately without loading delay
window.saveAndRedirectToTickets = function (ticketData) {
  try {
    if (!ticketData) return;

    // Ensure all critical fields exist
    const bookingId = ticketData.id || ('LTX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase());
    const movieTitle = ticketData.movieTitle || 'Avatar: Fire & Ash';
    const cinemaName = ticketData.cinemaName || 'XXI Trans Studio Mall Makassar';
    const city = ticketData.city || 'Makassar';
    const date = ticketData.date || new Date().toISOString().split('T')[0];
    const time = ticketData.time || '19:00';
    const deliveryStudio = ticketData.deliveryStudio || ticketData.studio || 'Studio 1';
    let seats = ticketData.seats || ['C5', 'C6'];
    if (typeof seats === 'string') {
      seats = seats.split(',').map(s => s.trim()).filter(Boolean);
    }
    const poster = ticketData.poster || 'https://picsum.photos/seed/' + (ticketData.movieId || 'avatar3') + '/400/600';
    const status = ticketData.status || 'active';
    const paidAt = ticketData.paidAt || new Date().toISOString();
    const qrData = ticketData.qrData || `LAYARTIX|${bookingId}|${movieTitle}|${cinemaName}|${seats.join(',')}`;

    const completeBooking = {
      ...ticketData,
      id: bookingId,
      movieTitle,
      cinemaName,
      city,
      date,
      time,
      deliveryStudio,
      seats,
      poster,
      status,
      paidAt,
      qrData
    };

    // 1. Ambil array tiket yang sudah ada
    let activeTickets = [];
    const raw = localStorage.getItem('layartix_active_tickets');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) activeTickets = parsed;
      } catch (e) {
        console.error('Error parse layartix_active_tickets:', e);
      }
    }

    // 2. Append to array (push) jika baru, atau perbarui jika ID sama (tidak menimpa data lama)
    const existingIdx = activeTickets.findIndex(t => t.id === completeBooking.id);
    if (existingIdx >= 0) {
      activeTickets[existingIdx] = completeBooking;
    } else {
      activeTickets.push(completeBooking);
    }

    // 3. Simpan langsung ke localStorage layartix_active_tickets
    localStorage.setItem('layartix_active_tickets', JSON.stringify(activeTickets));

    // Sinkronkan ke LT Data Store jika tersedia & simpan notifikasi session
    if (typeof LT !== 'undefined') {
      if (typeof LT.save === 'function') LT.save('bookings', activeTickets);
      if (typeof LT.setSession === 'function') {
        LT.setSession({ bookingId: completeBooking.id, booking: completeBooking });
      }
    }

    // 4. Jika fungsi render tiket tersedia di window, panggil instan
    if (typeof window.renderActiveTickets === 'function') {
      window.renderActiveTickets();
    } else if (typeof window.loadActiveTickets === 'function') {
      window.loadActiveTickets();
    }

    // 5. Langsung redirect ke halaman tiket tanpa loading macet
    window.location.href = 'tiket.html';
  } catch (err) {
    console.error('saveAndRedirectToTickets error:', err);
    window.location.href = 'tiket.html';
  }
};

// ── Global Smart Navigation Helper ────────────────────────────
function handleSmartBack(fallbackUrl = 'beranda.html') {
  // Jika sedang di tampilan checkout pada fnb.html, kembali ke tampilan menu katalog F&B
  if (typeof switchView === 'function' && document.getElementById('viewCheckout') && document.getElementById('viewCheckout').style.display !== 'none') {
    switchView('menu');
    return;
  }

  // Jika ada riwayat sebelumnya dalam domain aplikasi yang sama
  if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
    window.history.back();
  } else {
    window.location.href = fallbackUrl;
  }
}
window.handleSmartBack = handleSmartBack;
function syncAllUserAvatars() {
  const saved = localStorage.getItem('layartix_user_avatar');
  document.querySelectorAll('.user-avatar-img').forEach(img => {
    if (saved) {
      img.src = saved;
      img.style.display = 'block';
    } else {
      img.src = '';
      img.style.display = 'none';
    }
  });

  document.querySelectorAll('.user-avatar-fallback').forEach(el => {
    el.style.display = saved ? 'none' : 'inline-block';
  });

  document.querySelectorAll('.user-avatar-svg').forEach(svg => {
    svg.style.display = saved ? 'none' : 'block';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAllUserAvatars);
  } else {
    syncAllUserAvatars();
  }
}


