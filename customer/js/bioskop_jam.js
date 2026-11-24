/**
 * LayarTix Customer Bioskop & Jam Tayang Controller
 * customer/js/bioskop_jam.js
 */

const user = LT.requireAuth('customer');
const session = LT.getSession();
if (!session.movieId) window.location.href = 'beranda.html';

LT.initMovies();
let allMovies = LT.getAllMovies();
try {
  const npRaw = localStorage.getItem('layartix_now_playing');
  if (npRaw) {
    const parsed = JSON.parse(npRaw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      allMovies = [...parsed, ...allMovies];
    }
  }
} catch (e) {}

let movie = allMovies.find(m => m.id === session.movieId);
if (!movie && session.movieTitle) {
  movie = {
    id: session.movieId,
    title: session.movieTitle,
    rating: session.movieRating || 'SU',
    genre: session.movieGenre || 'Film',
    duration: session.movieDuration || 120,
    price_base: session.price_base || 65000,
    poster: session.poster || ''
  };
}
if (movie) {
  if (session.poster) {
    movie.poster = session.poster;
  }
}
if (!movie) window.location.href = 'beranda.html';

const city = LT.getSelectedCity() || 'Makassar';
const tz = LT.getCityTimeZone ? LT.getCityTimeZone(city) : 'WITA';
const cityNow = LT.getCityNow ? LT.getCityNow(city) : { timeStr: '12:00', fullFormatted: '12:00 WITA' };

const cityDisplay = document.getElementById('cityDisplay');
if (cityDisplay) {
  cityDisplay.innerHTML = `${city} <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(255,215,0,0.18);color:var(--gold);margin-left:4px">${cityNow.fullFormatted}</span>`;
}

// Movie prominent info banner
const rb = LT.getRatingBadge(movie.rating);
const titleHeader = document.getElementById('movieTitleHeader');
const ratingHeader = document.getElementById('movieRatingHeader');
const miniInfo = document.getElementById('movieMiniInfo');

if (titleHeader) titleHeader.textContent = movie.title;
if (ratingHeader) ratingHeader.textContent = `${movie.genre} · ${movie.duration} mnt`;
if (miniInfo) {
  miniInfo.innerHTML = `
    <img src="${movie.poster}" style="width:72px;height:102px;object-fit:cover;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.5);"
         onerror="this.style.display='none'"/>
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span class="badge" style="background:${rb.bg};color:${rb.color};font-size:10px;padding:2px 8px">${rb.label}</span>
        <span style="font-size:12px;color:var(--muted)">${movie.duration} menit</span>
      </div>
      <div style="font-size:16px;font-weight:800;line-height:1.2;margin-bottom:4px">${movie.title}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px">${movie.genre}</div>
      ${movie.synopsis ? `<div style="font-size:11px;color:rgba(255,255,255,0.72);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${movie.synopsis}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:var(--muted)">Mulai dari</div>
      <div style="font-size:16px;font-weight:800;color:var(--gold)">${LT.formatRp(movie.price_base)}</div>
    </div>
  `;
}

// Date tabs
let selectedDate = '';
let selectedSeatType = 'Regular';
let pendingTime = null;
let pendingCinema = null;

function buildDateTabs() {
  const now = new Date();
  const container = document.getElementById('dateTabs');
  if (!container) return;
  let html = '';
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const val = d.toISOString().split('T')[0];
    const day = d.toLocaleDateString('id-ID', { weekday: 'short' });
    const date = d.getDate();
    const month = d.toLocaleDateString('id-ID', { month: 'short' });
    if (!selectedDate) selectedDate = val;
    html += `<button class="date-tab ${i === 0 ? 'active' : ''}" id="dTab-${val}" onclick="selectDate('${val}',this)">
      <div style="font-size:9px;text-transform:uppercase">${day}</div>
      <div class="date-day">${date}</div>
      <div class="date-mon">${month}</div>
    </button>`;
  }
  container.innerHTML = html;
}

function selectDate(val, btn) {
  selectedDate = val;
  document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderCinemas();
}

function setSeatType(type, btn) {
  selectedSeatType = type;
  document.querySelectorAll('.seat-type-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderCinemas();
}

let cinemaSearchQuery = '';

function renderCinemas() {
  let cinemas = LT.getCinemasForCity ? LT.getCinemasForCity(city) : LT.cinemas.filter(c => !city || c.city.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(c.city.toLowerCase()));
  if (!cinemas || !cinemas.length) cinemas = LT.cinemas;
  const container = document.getElementById('cinemasList');
  if (!container) return;

  // Saring mall/bioskop sesuai kata kunci pencarian real-time (nama bioskop atau mall)
  if (cinemaSearchQuery) {
    cinemas = cinemas.filter(c => 
      (c.name && c.name.toLowerCase().includes(cinemaSearchQuery)) ||
      (c.mall && c.mall.toLowerCase().includes(cinemaSearchQuery))
    );
  }

  // Jika tidak ditemukan mall yang cocok
  if (!cinemas.length) {
    container.innerHTML = `
      <div class="cinema-empty-search col-span-2">
        <div style="font-size:28px;color:rgba(255,255,255,0.25);margin-bottom:8px">∅</div>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:4px">
          Mall tidak ditemukan di kota ${city}
        </div>
        <div style="font-size:12px;color:var(--muted);max-width:320px;margin:0 auto 14px">
          Tidak ada bioskop atau mall yang cocok dengan kata kunci "<strong>${escapeCinemaHtml(cinemaSearchQuery)}</strong>".
        </div>
        <button class="btn btn-outline btn-sm" onclick="clearCinemaSearch()" style="padding:6px 16px;font-size:12px">
          Reset Pencarian Mall
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = cinemas.map(c => {
    const isShowing = LT.isMovieShowingAtCinema(movie.id, c);

    // KONDISI: Jika film tidak sedang tayang di mall ini, tampilkan kartu disabled dengan tulisan jelas
    if (!isShowing) {
      return `<div class="cinema-card unavailable" style="opacity:0.8;background:rgba(239,68,68,0.03);border:1px dashed rgba(239,68,68,0.35);">
        <div class="cinema-header" style="background:rgba(239,68,68,0.06);border-bottom:1px dashed rgba(239,68,68,0.2)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div class="cinema-name" style="color:rgba(255,255,255,0.75)">${c.name}</div>
              <div class="cinema-mall"> ${c.mall}, ${c.city}</div>
            </div>
            <span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">
              TIDAK TAYANG
            </span>
          </div>
          <div class="cinema-facilities" style="opacity:0.6">
            ${c.facilities.map(f => `<span class="facility-tag">${f}</span>`).join('')}
          </div>
        </div>
        <div style="padding:18px 16px;text-align:center;">
          <div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:4px">
             Untuk saat ini film ini tidak tersedia di mall ini
          </div>
          <div style="font-size:11px;color:var(--muted)">
            Film "${movie.title}" saat ini belum dijadwalkan di ${c.name}. Silakan pilih mall lain yang masih menayangkan.
          </div>
        </div>
      </div>`;
    }

    // KONDISI: Film sedang tayang di mall ini
    const hasType = c.facilities.includes(selectedSeatType) || selectedSeatType === 'Regular';
    const availTimes = hasType ? LT.times : [];

    const pm = c.priceMultiplier || { Regular: 1, Premium: 1.4, IMAX: 1.8 };
    const basePrice = Number(movie.price_base) || Number(session.price_base) || 65000;
    let price = Math.round(basePrice * (Number(pm[selectedSeatType]) || 1));
    if (movie && movie.prices) {
      if (selectedSeatType === 'Regular' && movie.prices.regular) {
        price = Number(movie.prices.regular);
      } else if ((selectedSeatType === 'Premiere' || selectedSeatType === 'Premium') && movie.prices.premiere) {
        price = Number(movie.prices.premiere);
      } else if (selectedSeatType === 'IMAX' && movie.prices.imax) {
        price = Number(movie.prices.imax);
      }
    }

    return `<div class="cinema-card">
      <div class="cinema-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="cinema-name">${c.name}</div>
            <div class="cinema-mall"> ${c.mall}, ${c.city}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--muted)">per tiket</div>
            <div style="font-size:14px;font-weight:700;color:var(--gold)">${LT.formatRp(price)}</div>
          </div>
        </div>
        <div class="cinema-facilities">
          ${c.facilities.map(f => `<span class="facility-tag">${f}</span>`).join('')}
        </div>
      </div>

      <div class="cinema-times">
        <div class="times-label">
          Jam Tayang — ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
          <span style="color:var(--gold);margin-left:6px;font-weight:600">(${tz})</span>
        </div>
        ${availTimes.length ? `<div class="time-pills">
          ${LT.times.map((t, i) => {
            const isPassed = LT.isSchedulePassed ? LT.isSchedulePassed(selectedDate, t, c.city || city) : false;

            if (isPassed) {
              return `
              <button class="time-pill disabled" style="opacity:0.4;background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1);color:var(--muted);cursor:not-allowed;pointer-events:none" disabled title="Jadwal ini sudah lewat dari waktu lokal ${tz}">
                <span style="text-decoration:line-through">${t}</span>
                <br><span style="font-size:8px;color:#ef4444;font-weight:600">Sudah Lewat</span>
              </button>`;
            }

            return `
            <button class="time-pill ${i === 3 || i === 4 ? 'almost-full' : ''}" 
                    onclick="selectTime('${c.id}','${t}','${selectedDate}',${price})">
              ${t}
              ${i === 3 || i === 4 ? '<br><span style="font-size:9px;opacity:0.7">hampir habis</span>' : ''}
              ${(t === '01:00' || t === '01.00') ? '<br><span style="font-size:8px;color:var(--gold);font-weight:700;letter-spacing:0.04em">Dini Hari</span>' : ''}
            </button>`;
          }).join('')}
        </div>`
        : `<div style="font-size:13px;color:var(--muted)">Tipe kursi ${selectedSeatType} tidak tersedia di bioskop ini</div>`}
      </div>
    </div>`;
  }).join('');
}

function selectTime(cinemaId, time, date, price) {
  // Validasi real-time sebelum memilih
  const cinemaCity = city;
  if (LT.isSchedulePassed && LT.isSchedulePassed(date, time, cinemaCity)) {
    const tzLabel = LT.getCityTimeZone ? LT.getCityTimeZone(cinemaCity) : 'WITA';
    LT.toast(`Jadwal tayang ${time} ${tzLabel} sudah lewat dari waktu saat ini. Silakan pilih jadwal berikutnya!`, 'error', 4000);
    renderCinemas();
    return;
  }

  const currentCityCinemas = LT.getCinemasForCity ? LT.getCinemasForCity(city) : [];
  let cinema = LT.cinemas.find(c => c.id === cinemaId) || currentCityCinemas.find(c => c.id === cinemaId);
  if (!cinema) {
    cinema = {
      id: cinemaId,
      name: 'Cinema ' + city,
      mall: 'Mall ' + city,
      city: city
    };
  }
  const numericPrice = Number(price) || Number(movie.price_base) || 65000;
  pendingCinema = cinema;
  pendingTime = { time, date, price: numericPrice };

  // Check age warning
  if (LT.needsAgeWarning(movie.rating)) {
    const warn = LT.getAgeWarningText(movie.rating);
    const box = document.getElementById('ageModalBox');
    if (box) box.style.borderColor = warn.color;
    document.getElementById('ageBadge').textContent = warn.age;
    document.getElementById('ageBadge').style.color = warn.color;
    document.getElementById('ageTitle').textContent = warn.title;
    document.getElementById('ageTitle').style.color = warn.color;
    document.getElementById('ageText').textContent = warn.text;
    document.getElementById('ageModal').classList.add('open');
  } else {
    proceedToSeat();
  }
}

function confirmAge() {
  closeAgeModal();
  proceedToSeat();
}

function closeAgeModal() {
  const modal = document.getElementById('ageModal');
  if (modal) modal.classList.remove('open');
}

function proceedToSeat() {
  const session = LT.getSession();
  const ticketPrice = Number(pendingTime.price) || 65000;
  LT.setSession({
    ...session,
    cinemaId: pendingCinema.id,
    cinemaName: pendingCinema.name,
    mall: pendingCinema.mall,
    city: pendingCinema.city,
    date: pendingTime.date,
    time: pendingTime.time,
    seatType: selectedSeatType,
    seatPrice: ticketPrice,
    ticketPrice: ticketPrice
  });
  window.location.href = 'kursi.html';
}

buildDateTabs();
renderCinemas();
renderMovieReviews();

// ── Live Search Mall / Bioskop Controller ──
const cinemaSearchInput = document.getElementById('cinemaSearchInput');
const cinemaSearchClearBtn = document.getElementById('cinemaSearchClearBtn');

if (cinemaSearchInput) {
  cinemaSearchInput.addEventListener('input', () => {
    cinemaSearchQuery = (cinemaSearchInput.value || '').trim().toLowerCase();
    if (cinemaSearchClearBtn) {
      cinemaSearchClearBtn.style.display = cinemaSearchQuery.length > 0 ? 'inline-flex' : 'none';
    }
    renderCinemas();
  });
}

function clearCinemaSearch() {
  if (cinemaSearchInput) {
    cinemaSearchInput.value = '';
    cinemaSearchInput.focus();
  }
  cinemaSearchQuery = '';
  if (cinemaSearchClearBtn) {
    cinemaSearchClearBtn.style.display = 'none';
  }
  renderCinemas();
}

function escapeCinemaHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// ── Movie Reviews & Spoiler Protection Controller ──
let currentFormRating = 0;

function renderMovieReviews() {
  const movieId = (movie && movie.id) ? movie.id : (session && session.movieId);
  if (!movieId) return;

  const reviews = LT.getReviews ? LT.getReviews(movieId) : [];
  const summary = LT.getMovieRatingSummary ? LT.getMovieRatingSummary(movieId) : {
    formattedAvg: '5.0',
    count: reviews.length,
    starsText: '★★★★★'
  };

  // Update ringkasan rating
  const avgValEl = document.getElementById('avgRatingDisplay');
  const avgStarsEl = document.getElementById('avgStarsDisplay');
  const countSubEl = document.getElementById('reviewsCountDisplay');

  if (avgValEl) avgValEl.textContent = summary.formattedAvg;
  if (avgStarsEl) avgStarsEl.textContent = summary.starsText;
  if (countSubEl) {
    countSubEl.textContent = `${summary.count} ulasan penonton terverifikasi`;
  }

  // Render daftar ulasan
  const listEl = document.getElementById('movieReviewsList');
  if (!listEl) return;

  if (!reviews || !reviews.length) {
    listEl.innerHTML = `
      <div class="empty-review-state">
        <div style="font-size:24px;margin-bottom:4px">🎬</div>
        <div>Belum ada ulasan untuk film ini.</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Jadilah penonton pertama yang memberikan ulasan!</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = reviews.map(r => {
    const isSpoiler = Boolean(r.isSpoiler);
    const starCount = Number(r.rating) || 5;
    const stars = '★'.repeat(Math.max(1, Math.min(5, starCount))) + '☆'.repeat(Math.max(0, 5 - starCount));
    const initial = (r.userName || 'P').trim().charAt(0).toUpperCase();

    return `
      <div class="review-card-item ${isSpoiler ? 'is-spoiler-card' : ''}" id="card-${r.id}">
        <div class="review-meta-row">
          <div class="reviewer-profile">
            <div class="reviewer-avatar-circle">${escapeHtml(initial)}</div>
            <div class="reviewer-name-box">
              <span class="reviewer-name">${escapeHtml(r.userName || 'Penonton LayarTix')}</span>
              <span class="review-time">${escapeHtml(r.date || 'Baru saja')}</span>
            </div>
          </div>
          <div class="review-stars-val" title="${starCount} dari 5 bintang">${stars}</div>
        </div>

        ${isSpoiler ? `
          <div class="spoiler-shield-bar">
            <div class="shield-badge">
              <span>🛡️ SPOILER ALERT</span>
              <span class="spoiler-warn-desc">• Mengandung bocoran adegan</span>
            </div>
            <button type="button" class="btn-reveal-spoiler" id="btnSpoiler-${r.id}" onclick="toggleSpoilerReveal('${r.id}')">
              👁️ Buka Spoiler
            </button>
          </div>
        ` : ''}

        <div class="review-text-content ${isSpoiler ? 'spoiler-blurred' : ''}" id="revText-${r.id}">
          ${escapeHtml(r.text || '')}
        </div>
      </div>
    `;
  }).join('');
}

function toggleSpoilerReveal(revId) {
  const textEl = document.getElementById('revText-' + revId);
  const btnEl = document.getElementById('btnSpoiler-' + revId);
  if (!textEl) return;

  if (textEl.classList.contains('spoiler-blurred')) {
    textEl.classList.remove('spoiler-blurred');
    if (btnEl) {
      btnEl.innerHTML = '🙈 Tutup Spoiler';
      btnEl.style.background = 'rgba(255,255,255,0.1)';
      btnEl.style.borderColor = 'rgba(255,255,255,0.3)';
      btnEl.style.color = '#e5e7eb';
    }
  } else {
    textEl.classList.add('spoiler-blurred');
    if (btnEl) {
      btnEl.innerHTML = '👁️ Buka Spoiler';
      btnEl.style.background = 'rgba(245, 158, 11, 0.25)';
      btnEl.style.borderColor = '#fbbf24';
      btnEl.style.color = '#fef3c7';
    }
  }
}

function toggleReviewForm(show) {
  const formEl = document.getElementById('reviewFormContainer');
  const btnEl = document.getElementById('btnToggleWriteReview');
  if (!formEl) return;

  const willShow = (typeof show === 'boolean') ? show : (formEl.style.display === 'none');
  formEl.style.display = willShow ? 'block' : 'none';

  if (btnEl) {
    btnEl.style.display = willShow ? 'none' : 'inline-flex';
  }

  if (willShow) {
    const nameInput = document.getElementById('reviewerNameInput');
    if (nameInput && !nameInput.value) {
      const activeUser = (typeof LT !== 'undefined' && LT.getUser) ? LT.getUser() : null;
      if (activeUser && activeUser.name) {
        nameInput.value = activeUser.name;
      }
    }
    const textInput = document.getElementById('reviewContentInput');
    if (textInput) textInput.focus();
  }
}

function selectFormStar(rating) {
  currentFormRating = Number(rating);
  const starBtns = document.querySelectorAll('.star-pick-btn');
  starBtns.forEach((btn, idx) => {
    if (idx < currentFormRating) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const labels = [
    '',
    '1/5 ★ (Sangat Buruk)',
    '2/5 ★★ (Kurang Memuaskan)',
    '3/5 ★★★ (Cukup Menghibur)',
    '4/5 ★★★★ (Sangat Bagus)',
    '5/5 ★★★★★ (Masterpiece / Wajib Nonton!)'
  ];
  const labelEl = document.getElementById('starPickLabel');
  if (labelEl) {
    labelEl.textContent = labels[currentFormRating] || 'Pilih bintang (1–5)';
  }
}

function submitMovieReview() {
  const movieId = (movie && movie.id) ? movie.id : (session && session.movieId);
  if (!movieId) {
    LT.toast('ID Film tidak valid!', 'error');
    return;
  }

  // Validasi rating bintang
  if (!currentFormRating || currentFormRating < 1 || currentFormRating > 5) {
    LT.toast('Silakan pilih rating bintang (1–5) terlebih dahulu!', 'warning', 3500);
    return;
  }

  // Validasi teks ulasan
  const textInput = document.getElementById('reviewContentInput');
  const text = (textInput ? textInput.value : '').trim();
  if (!text) {
    LT.toast('Silakan ketik teks ulasan Anda sebelum mengirim!', 'warning', 3500);
    if (textInput) textInput.focus();
    return;
  }

  // Nama pengulas
  const nameInput = document.getElementById('reviewerNameInput');
  let userName = (nameInput ? nameInput.value : '').trim();
  if (!userName) {
    const activeUser = (typeof LT !== 'undefined' && LT.getUser) ? LT.getUser() : null;
    userName = (activeUser && activeUser.name) ? activeUser.name : 'Penonton LayarTix';
  }

  // Spoiler checkbox
  const spoilerCheck = document.getElementById('reviewSpoilerCheckbox');
  const isSpoiler = Boolean(spoilerCheck && spoilerCheck.checked);

  // Buat objek ulasan baru
  const newReview = {
    id: 'rev_' + Date.now(),
    movieId: movieId,
    userName: userName,
    rating: currentFormRating,
    date: 'Baru saja',
    createdAt: new Date().toISOString(),
    text: text,
    isSpoiler: isSpoiler,
    likes: 0
  };

  // Simpan secara persisten ke localStorage melalui LT.addReview
  if (typeof LT !== 'undefined' && LT.addReview) {
    LT.addReview(movieId, newReview);
  } else {
    const current = (typeof LT !== 'undefined' && LT.getReviews) ? LT.getReviews(movieId) : [];
    const updated = [newReview, ...current];
    localStorage.setItem('layartix_reviews_' + movieId, JSON.stringify(updated));
  }

  // Reset form
  if (textInput) textInput.value = '';
  if (spoilerCheck) spoilerCheck.checked = false;
  selectFormStar(0);
  const labelEl = document.getElementById('starPickLabel');
  if (labelEl) labelEl.textContent = 'Pilih bintang (1–5)';
  toggleReviewForm(false);

  // Re-render ulasan & rating secara real-time
  renderMovieReviews();

  LT.toast('Ulasan Anda berhasil dikirim! Terima kasih atas ulasannya.', 'success', 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// Window bindings for inline onclick handlers
window.renderMovieReviews = renderMovieReviews;
window.toggleSpoilerReveal = toggleSpoilerReveal;
window.toggleReviewForm = toggleReviewForm;
window.selectFormStar = selectFormStar;
window.submitMovieReview = submitMovieReview;
window.escapeHtml = escapeHtml;




// ── Cross-tab sync: perubahan film/harga dari Admin ──
window.addEventListener('storage', (e) => {
  if (
    e.key === 'layartix_now_playing' ||
    e.key === 'layartix_admin_update'
  ) {
    // Reload data film terbaru (harga bisa berubah dari Admin)
    LT.initMovies();
    allMovies = LT.getAllMovies();
    try {
      const npRaw = localStorage.getItem('layartix_now_playing');
      if (npRaw) {
        const parsed = JSON.parse(npRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allMovies = [...parsed, ...allMovies.filter(m => !parsed.find(p => p.id === m.id))];
        }
      }
    } catch (ex) {}
    renderCinemas();
  }
});
