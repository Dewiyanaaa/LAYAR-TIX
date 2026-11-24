
// Showtime Countdown, Timezone & Auto-Expire Helpers
function getCityDateObj(dateStr, timeStr, city) {
  if (!dateStr || !timeStr) return null;
  // Parse base date & time string e.g. "2026-11-15 19:00"
  let cleanDate = dateStr.trim();
  let cleanTime = timeStr.trim();
  if (cleanTime.length === 5) cleanTime += ':00';

  const tz = (typeof LT !== 'undefined' && typeof LT.getCityTimeZone === 'function')
    ? LT.getCityTimeZone(city || 'Makassar')
    : 'WITA';
  const offset = tz === 'WIT' ? '+09:00' : (tz === 'WITA' ? '+08:00' : '+07:00');

  const isoStr = `${cleanDate}T${cleanTime}${offset}`;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? new Date(cleanDate + ' ' + cleanTime) : d;
}

function getShowtimeDiff(dateStr, timeStr, city) {
  const target = getCityDateObj(dateStr, timeStr, city);
  if (!target || isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return { target, diffMs, minutesLeft: Math.round(diffMs / 60000) };
}

// Auto-Expire: Mengarsipkan tiket aktif yang jam tayangnya sudah lewat ATAU pembayaran tertunda > 10 menit
function autoExpirePassedTickets() {
  if (typeof LT === 'undefined') return;
  const bookings = LT.getBookings ? LT.getBookings() : [];
  let changed = false;
  const now = Date.now();

  bookings.forEach(b => {
    // 1. Cek batas waktu pembayaran 10 menit untuk tiket yang belum lunas
    const isPendingPayment = (b.paymentStatus === 'unpaid' || b.status === 'pending_payment');
    if (isPendingPayment && b.status !== 'cancelled' && b.status !== 'used') {
      let remainSec = 0;
      if (b.expiresAt) {
        remainSec = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - now) / 1000));
      } else {
        const createdAt = new Date(b.createdAt || b.paidAt || b.bookedAt || now).getTime();
        const diffSec = Math.floor((now - createdAt) / 1000);
        remainSec = Math.max(0, (10 * 60) - diffSec);
      }

      if (remainSec <= 0) {
        b.status = 'cancelled';
        b.paymentStatus = 'expired';
        b.cancelledAt = new Date().toISOString();
        b.cancelReason = 'Batas waktu pembayaran 10 menit telah habis.';
        changed = true;

        // Restock otomatis item F&B karena transaksi kedaluwarsa
        if (Array.isArray(b.fnbItems) && b.fnbItems.length > 0 && typeof LT.restoreFnbStock === 'function') {
          LT.restoreFnbStock(b.fnbItems);
        }
      }
    }

    // 2. Cek jam tayang film yang sudah lewat dari waktu lokal bioskop
    if (b.status === 'active' || !b.status) {
      if (b.date && b.time) {
        const isPassed = LT.isSchedulePassed ? LT.isSchedulePassed(b.date, b.time, b.city) : false;
        if (isPassed) {
          b.status = 'used'; // Otomatis berpindah ke tab Riwayat sebagai Selesai / Kadaluarsa
          b.expiredAt = new Date().toISOString();
          changed = true;
        }
      }
    }
  });

  if (changed) {
    LT.saveBookings(bookings);
  }
}

// Showtime Countdown & Notification Helpers

// In-Seat F&B Delivery Progress Simulator (Real-time tracking: Sedang Disiapkan -> Dalam Perjalanan -> Selesai Diantar)
function getDeliveryProgress(orderOrBooking) {
  const orderTimeStr = orderOrBooking.deliveryStatusTime || orderOrBooking.orderedAt || orderOrBooking.paidAt || new Date().toISOString();
  const orderTime = new Date(orderTimeStr).getTime();
  const elapsedMinutes = Math.max(0, (Date.now() - orderTime) / 60000);

  // Simulation timeline:
  // 0 - 2 mins: Sedang Disiapkan di Kantin F&B
  // 2 - 5 mins: Dalam Perjalanan Pengantaran ke Kursi Studio
  // > 5 mins: Selesai Diantar ke Kursi Penonton
  if (elapsedMinutes < 2) {
    return {
      step: 1,
      progressPercent: 35,
      statusText: 'Sedang Disiapkan di Dapur Kantin',
      badgeText: ' DISIAPKAN',
      badgeBg: 'rgba(245,158,11,0.15)',
      badgeColor: '#f59e0b',
      borderColor: 'rgba(245,158,11,0.3)',
      barGradient: 'linear-gradient(90deg, #f59e0b, #ffd700)',
      estMinutes: '3-4 menit lagi tiba',
      icon: ''
    };
  } else if (elapsedMinutes < 5) {
    return {
      step: 2,
      progressPercent: 75,
      statusText: 'Petugas Menuju ke Kursi Studio Anda',
      badgeText: ' DALAM PENGANTARAN',
      badgeBg: 'rgba(59,130,246,0.15)',
      badgeColor: '#60a5fa',
      borderColor: 'rgba(59,130,246,0.35)',
      barGradient: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
      estMinutes: 'Tiba sesaat lagi (~1 mnt)',
      icon: ''
    };
  } else {
    return {
      step: 3,
      progressPercent: 100,
      statusText: 'Makanan Berhasil Diantar ke Kursi',
      badgeText: ' SELESAI DIANTAR',
      badgeBg: 'rgba(34,197,94,0.15)',
      badgeColor: '#22c55e',
      borderColor: 'rgba(34,197,94,0.35)',
      barGradient: 'linear-gradient(90deg, #22c55e, #10b981)',
      estMinutes: 'Selamat menikmati film!',
      icon: ''
    };
  }
}

function checkShowtimeNotifications() {
  const allBookings = LT.getUserBookings(user.id).filter(b => b.status === 'active');
  const notified1h = JSON.parse(localStorage.getItem('lt_notified_1h') || '[]');
  const notified10m = JSON.parse(localStorage.getItem('lt_notified_10m') || '[]');

  allBookings.forEach(b => {
    const diff = getShowtimeDiff(b.date, b.time);
    if (!diff) return;

    // 1 Hour Alert (between 45 and 65 minutes left)
    if (diff.minutesLeft <= 65 && diff.minutesLeft >= 45 && !notified1h.includes(b.id)) {
      notified1h.push(b.id);
      localStorage.setItem('lt_notified_1h', JSON.stringify(notified1h));
      LT.toast(` PENGINGAT 1 JAM: Film ${b.movieTitle} di ${b.cinemaName} mulai pukul ${b.time}. Harap berangkat lebih awal antisipasi kemacetan!`, 'warning', 7000);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(' LayarTix: Film Dimulai 1 Jam Lagi!', {
          body: `${b.movieTitle} di ${b.cinemaName} pukul ${b.time}. Cek status rute perjalanan Anda!`,
          icon: b.poster || ''
        });
      }
    }

    // 10 Minutes Countdown Alert (<= 12 min)
    if (diff.minutesLeft <= 12 && diff.minutesLeft > 0 && !notified10m.includes(b.id)) {
      notified10m.push(b.id);
      localStorage.setItem('lt_notified_10m', JSON.stringify(notified10m));
      LT.toast(` HITUNGAN MUNDUR 10 MENIT: Pintu teater ${b.movieTitle} segera dibuka! Masuk sekarang ke teater.`, 'error', 8000);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(' LayarTix: 10 Menit Menuju Penayangan!', {
          body: `Pintu teater segera ditutup untuk film ${b.movieTitle}. Segera scan tiket Anda!`,
          icon: b.poster || ''
        });
      }
    }
  });
}

if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
  Notification.requestPermission();
}

// tiket.js — My Tickets & Cancellation Logic for LayarTix
'use strict';

const user = LT.requireAuth('customer');

// Check for new booking from session & ensure it is rendered immediately
try {
  const session = LT.getSession();
  if (session && (session.bookingId || session.booking)) {
    const freshBooking = session.booking || { id: session.bookingId };
    LT.addBooking(freshBooking);
    const banner = document.getElementById('newTicketBanner');
    if (banner) banner.style.display = '';
    const infoEl = document.getElementById('newTicketInfo');
    if (infoEl) {
      const seatsStr = Array.isArray(freshBooking.seats) ? freshBooking.seats.join(', ') : (freshBooking.seats || '');
      infoEl.textContent = `${freshBooking.movieTitle || 'Tiket'} · ${seatsStr} · ${freshBooking.cinemaName || ''}`;
    }
    // Hapus sesi spesifik booking agar tidak memicu add berulang saat refresh
    try {
      const s = LT.getSession();
      delete s.bookingId;
      delete s.booking;
      LT.setSession(s);
    } catch (e) {}
  }
} catch (e) {
  console.warn('Error reading new booking from session:', e);
}

let cancelBookingId = null;

function switchTab(tab, btn) {
  document.getElementById('activeSection').style.display = tab === 'active' ? '' : 'none';
  document.getElementById('historySection').style.display = tab === 'history' ? '' : 'none';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'active') {
    renderActiveTickets();
  }
}

function renderBookings() {
  renderActiveTickets();
}

function renderActiveTickets() {
  loadActiveTickets();
}

function loadActiveTickets() {
  // Jalankan auto-expire berbasis zona waktu lokal sebelum memfilter dan me-render tiket
  if (typeof autoExpirePassedTickets === 'function') {
    autoExpirePassedTickets();
  }

  // 1. Baca dan gabungkan secara komprehensif dari seluruh key (layartix_active_tickets & lt_bookings)
  const bookingMap = new Map();

  const sourceArrays = [];
  try {
    const rawActive = localStorage.getItem('layartix_active_tickets');
    if (rawActive) {
      const parsed = JSON.parse(rawActive);
      if (Array.isArray(parsed)) sourceArrays.push(parsed);
    }
  } catch (e) {
    console.warn('Error parse layartix_active_tickets:', e);
  }

  try {
    const rawLt = localStorage.getItem('lt_bookings');
    if (rawLt) {
      const parsed = JSON.parse(rawLt);
      if (Array.isArray(parsed)) sourceArrays.push(parsed);
    }
  } catch (e) {
    console.warn('Error parse lt_bookings:', e);
  }

  if (typeof LT !== 'undefined' && typeof LT.getBookings === 'function') {
    try {
      const ltBookings = LT.getBookings();
      if (Array.isArray(ltBookings)) sourceArrays.push(ltBookings);
    } catch (e) {}
  }

  // Gabungkan semua tiket tanpa duplikasi berdasarkan ID
  sourceArrays.forEach(arr => {
    arr.forEach(item => {
      if (item && item.id) {
        if (!bookingMap.has(item.id)) {
          bookingMap.set(item.id, item);
        } else {
          // Merge field terbaru jika ada
          bookingMap.set(item.id, { ...bookingMap.get(item.id), ...item });
        }
      }
    });
  });

  const allBookings = Array.from(bookingMap.values());

  // Pastikan key sinkron di kedua tempat
  if (allBookings.length > 0) {
    try {
      localStorage.setItem('layartix_active_tickets', JSON.stringify(allBookings));
      if (typeof LT !== 'undefined' && typeof LT.save === 'function') {
        LT.save('bookings', allBookings);
      }
    } catch (e) {}
  }

  // Filter berdasarkan kepemilikan user (jika user login ada)
  const currentUserId = (typeof user !== 'undefined' && user?.id) ? user.id : null;
  const userBookings = allBookings.filter(b => {
    if (!currentUserId) return true;
    return !b.userId || b.userId === currentUserId || b.userId === 'GUEST' || b.userId === 'u_test';
  });

  // Pisahkan tiket aktif dan riwayat
  const active = userBookings.filter(b => b.status === 'active' || !b.status);
  const history = userBookings.filter(b => b.status && b.status !== 'active');

  // Urutkan tiket terbaru di paling atas
  const activeToRender = [...active].reverse();
  const historyToRender = [...history].reverse();

  // Standalone F&B orders
  const fnbOrders = (typeof LT !== 'undefined' && typeof LT.getFnbOrders === 'function')
    ? LT.getFnbOrders().filter(o => !currentUserId || o.userId === currentUserId || !o.userId || o.userId === 'GUEST')
    : [];

  // Render ke container active-tickets-container dan historyList
  renderList('active-tickets-container', activeToRender, fnbOrders, true);
  renderList('activeList', activeToRender, fnbOrders, true);
  renderList('historyList', historyToRender, [], false);
}

// Ekspos ke window agar dapat dipanggil instan kapan saja
window.renderActiveTickets = renderActiveTickets;
window.loadActiveTickets = loadActiveTickets;
window.renderBookings = renderBookings;

// Langsung panggil renderActiveTickets() di awal skrip
renderActiveTickets();

// DOMContentLoaded listener untuk memastikan kartu tiket langsung dirender otomatis saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
  renderActiveTickets();
});

// Event listener storage agar jika ada tab lain / pembayaran selesai, tiket langsung update seketika
window.addEventListener('storage', (e) => {
  if (e.key === 'layartix_active_tickets' || e.key === 'lt_bookings') {
    renderActiveTickets();
  }
});

function renderList(containerId, bookings, fnbOrders, isActive) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';

  // Standalone F&B cards (if active)
  if (isActive && fnbOrders && fnbOrders.length > 0) {
    html += `<div style="padding:0 16px 8px;font-size:13px;font-weight:700;color:var(--gold);display:flex;align-items:center;gap:6px">
       Pesanan &amp; Antar Kursi F&B (${fnbOrders.length})
    </div>`;
    html += fnbOrders.map(o => {
      // Calculate dynamic simulated delivery status based on time
      const statusInfo = getDeliveryProgress(o);

      return `
      <div class="ticket-card" style="border-color:${statusInfo.borderColor};background:linear-gradient(135deg,#121a16,#12121a);margin-bottom:14px">
        <div class="ticket-top">
          <div style="font-size:38px;padding:10px 4px">${statusInfo.icon}</div>
          <div class="ticket-info">
            <div class="ticket-movie">
              ${o.deliveryType === 'in_seat' ? 'Antar ke Kursi Studio (In-Seat)' : 'Pesanan Kantin F&B'}
            </div>
            <div class="ticket-cinema"> Bioskop: ${o.cinemaName}</div>
            ${o.deliveryType === 'in_seat' ? `
              <div style="font-size:11px;font-weight:600;color:var(--gold);margin-top:2px">
                 Tujuan: ${o.deliveryStudio || 'Studio 1'} · Kursi: ${o.deliverySeat || 'Duduk'}
              </div>
            ` : ''}
            <div class="ticket-meta" style="margin-top:4px">
              <span class="ticket-meta-item"> ${LT.formatRp(o.total)}</span>
              <span class="ticket-meta-item"> ${new Date(o.orderedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style="margin-top:8px">
              <span class="ticket-status" style="background:${statusInfo.badgeBg};color:${statusInfo.badgeColor};border:1px solid ${statusInfo.badgeColor}44">
                ${statusInfo.badgeText}
              </span>
            </div>
          </div>
        </div>

        <!-- Real-time In-Seat Delivery Progress Bar -->
        <div style="padding:10px 16px;background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:6px">
            <span style="font-weight:600;color:${statusInfo.badgeColor}">${statusInfo.statusText}</span>
            <span style="font-size:10px;color:var(--muted)">Est: ${statusInfo.estMinutes}</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden">
            <div style="width:${statusInfo.progressPercent}%;height:100%;background:${statusInfo.barGradient};border-radius:4px;transition:width 0.5s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px">
            <span style="color:${statusInfo.step >= 1 ? 'var(--gold)' : ''}">1. Disiapkan</span>
            <span style="color:${statusInfo.step >= 2 ? 'var(--gold)' : ''}">2. Diantar Petugas</span>
            <span style="color:${statusInfo.step >= 3 ? '#22c55e' : ''}">3. Sampai di Kursi</span>
          </div>
        </div>

        <!-- Rincian Item F&B Standalone & Pembatalan Parsial -->
        <div style="padding:10px 16px 6px">
          <div class="fnb-items-list">
            ${(o.items || []).map((it, idx) => {
              const isCancelled = it.status === 'cancelled';
              const itemTotal = Number(it.price || 0) * Number(it.qty || 1);
              const check = isFnbCancellable(o);

              return `
              <div class="fnb-item-row ${isCancelled ? 'fnb-item-cancelled' : ''}">
                <div class="fnb-item-title">
                  <span>${it.emoji || ''}</span>
                  <span>${it.name}</span>
                  <span style="font-size:10px;color:var(--muted)">x${it.qty}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="fnb-item-price">${LT.formatRp(itemTotal)}</span>
                  ${isCancelled ? `
                    <span class="fnb-refund-tag">Dibatalkan</span>
                  ` : (check.cancellable && o.status !== 'cancelled' ? `
                    <button type="button" class="btn-cancel-fnb-item" onclick="openFnbCancelModal('standalone', '${o.id}', ${idx})" title="Batalkan item ini">
                      Batal Item
                    </button>
                  ` : `
                    <span style="font-size:9px;color:var(--muted);background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:4px">Diproses</span>
                  `)}
                </div>
              </div>`;
            }).join('')}
          </div>
          ${o.refundAmount ? `
            <div style="font-size:11px;color:#22c55e;font-weight:600;margin-top:6px;display:flex;justify-content:space-between">
              <span>Total Refund F&B:</span>
              <span>${LT.formatRp(o.refundAmount)}</span>
            </div>
          ` : ''}
        </div>
        <div class="ticket-actions" style="padding:4px 16px 14px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="showFnbQr('${o.id}')"> QR Validasi Petugas</button>
          ${(() => {
            const check = isFnbCancellable(o);
            const hasActiveItems = (o.items || []).some(it => it.status !== 'cancelled');
            if (check.cancellable && hasActiveItems && o.status !== 'cancelled') {
              return `
                <button class="fnb-cancel-all-btn" onclick="openFnbCancelModal('standalone', '${o.id}')">
                  Batal Semua Pesanan F&B
                </button>
              `;
            }
            return '';
          })()}
        </div>
      </div>
    `}).join('');
  }

  // Render tiket bioskop dengan perlindungan try-catch per tiket
  if (bookings && bookings.length > 0) {
    bookings.forEach(b => {
      try {
        html += ticketCardHTML(b);
      } catch (err) {
        console.error('Error rendering ticket card:', b && b.id, err);
      }
    });
  }

  // Jika tidak ada tiket maupun pesanan F&B sama sekali
  if ((!bookings || !bookings.length) && (!fnbOrders || !fnbOrders.length)) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"></div>
      <div class="empty-title">${isActive ? 'Belum Ada Tiket Aktif' : 'Belum Ada Riwayat'}</div>
      <div class="empty-desc">${isActive ? 'Pesan tiket sekarang dan nikmati pengalaman bioskop terbaik!' : 'Tiket yang sudah digunakan atau dibatalkan akan muncul di sini.'}</div>
      ${isActive ? `<a href="beranda.html"><button class="btn btn-primary" style="margin-top:16px;padding:12px 24px"> Pesan Tiket</button></a>` : ''}
    </div>`;
    return;
  }

  container.innerHTML = html;

  // Generate QR mini untuk setiap tiket aktif secara aman (hanya jika sudah lunas / bukan pending)
  if (bookings && bookings.length > 0) {
    bookings.forEach(b => {
      const isPending = (b && (b.paymentStatus === 'unpaid' || b.status === 'pending_payment'));
      if (b && b.status === 'active' && !isPending && b.id) {
        setTimeout(() => {
          const el = document.getElementById('qr-mini-' + b.id);
          if (el && typeof LT !== 'undefined' && typeof LT.generateQR === 'function') {
            el.innerHTML = '';
            LT.generateQR('qr-mini-' + b.id, b.qrData || b.id, 60);
          }
        }, 120);
      }
    });
  }
}

function showFnbQr(orderId) {
  const orders = LT.getFnbOrders();
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  document.getElementById('qrBookingId').textContent = o.id;
  document.getElementById('qrMovieInfo').textContent = 'Voucher Pengambilan Kantin F&B';
  document.getElementById('qrCinemaInfo').textContent = `${o.cinemaName} · Total: ${LT.formatRp(o.total)}`;
  document.getElementById('qrDisplay').innerHTML = '';
  LT.generateQR('qrDisplay', o.qrData, 180);
  document.getElementById('qrModal').classList.add('open');
}

function getResolvedPoster(b) {
  if (b && b.poster) {
    return b.poster;
  }
  try {
    const npRaw = localStorage.getItem('layartix_now_playing');
    if (npRaw) {
      const parsed = JSON.parse(npRaw);
      const found = parsed.find(x => x.id === b.movieId || (x.title && b.movieTitle && x.title.toLowerCase() === b.movieTitle.toLowerCase()));
      if (found && found.poster) {
        return found.poster;
      }
    }
  } catch (e) {}
  try {
    const csRaw = localStorage.getItem('layartix_coming_soon');
    if (csRaw) {
      const parsed = JSON.parse(csRaw);
      const found = parsed.find(x => x.id === b.movieId || (x.title && b.movieTitle && x.title.toLowerCase() === b.movieTitle.toLowerCase()));
      if (found && found.poster) {
        return found.poster;
      }
    }
  } catch (e) {}
  return 'https://picsum.photos/seed/' + (b?.movieId || 'movie') + '/400/600';
}

function ticketCardHTML(b) {
  if (!b) return "";
  const rawStatus = (b.status || 'active').toLowerCase().trim();
  const rawPaymentStatus = (b.paymentStatus || '').toLowerCase().trim();

  // Deteksi status tertunda (unpaid / pending)
  const isPendingPayment = (
    rawPaymentStatus === 'unpaid' ||
    rawPaymentStatus === 'pending' ||
    rawStatus === 'pending_payment' ||
    rawStatus === 'pending'
  );

  // Normalisasi status siap dipakai / aktif (termasuk status: active, paid, lunas, Siap Dipakai)
  const isReady = (
    !isPendingPayment &&
    rawStatus !== 'cancelled' &&
    rawStatus !== 'used' &&
    rawStatus !== 'expired' &&
    (rawStatus === 'active' || rawStatus === 'paid' || rawStatus === 'lunas' || rawStatus === 'siap dipakai' || rawPaymentStatus === 'paid' || !b.status)
  );

  const isTicketOnlyCancelled = b.ticketOnlyCancelled || b.ticketCancelled;
  
  let statusClass = "status-active";
  let statusLabel = "SIAP DIPAKAI";

  if (isPendingPayment) {
    statusClass = "status-pending";
    statusLabel = "PEMBAYARAN BELUM SELESAI";
  } else if (isTicketOnlyCancelled) {
    statusClass = "status-used";
    statusLabel = "TIKET BATAL (F&B AKTIF)";
  } else if (rawStatus === 'used' || rawStatus === 'expired') {
    statusClass = "status-used";
    statusLabel = "SELESAI";
  } else if (rawStatus === 'cancelled') {
    statusClass = "status-cancelled";
    statusLabel = "DIBATALKAN";
  } else if (isReady) {
    statusClass = "status-ready";
    statusLabel = "SIAP DIPAKAI";
  }

  const refund40 = Math.round(((b.totalTicket || b.grandTotal) || 0) * 0.4);
  const screenStudio = b.deliveryStudio || b.studio || "Studio 1";
  const seatNumbers = isTicketOnlyCancelled 
    ? "Dilepas (Batal)" 
    : (Array.isArray(b.seats) ? b.seats.join(", ") : (b.seats || "F21"));
  const posterSrc = getResolvedPoster(b);
  const tz = (typeof LT !== "undefined" && typeof LT.getCityTimeZone === "function")
    ? LT.getCityTimeZone(b.city || "Makassar")
    : "WITA";
  const movieTitleSafe = b.movieTitle || "Film Bioskop";
  const cinemaNameSafe = b.cinemaName || "LayarTix Cinema";
  const bookingIdSafe = b.id || "LTX-" + Date.now();
  const dateSafe = b.date || "Hari Ini";
  const timeSafe = b.time || "19:00";
  const movieRatingSafe = b.movieRating || "13+";
  const seatTypeSafe = b.seatType || "Regular";
  const fnbItemsSafe = Array.isArray(b.fnbItems) ? b.fnbItems : [];

  return `
  <div class="classic-ticket-wrapper">
    <!-- Classic Admit One Cinema Ticket Shape -->
    <div class="classic-ticket-card">
      <!-- Scalloped punch holes / notches -->
      <div class="ticket-notch notch-left-top"></div>
      <div class="ticket-notch notch-left-bottom"></div>
      <div class="ticket-notch notch-right-top"></div>
      <div class="ticket-notch notch-right-bottom"></div>
      <div class="ticket-notch notch-middle-top"></div>
      <div class="ticket-notch notch-middle-bottom"></div>

      <!-- SISI KIRI: Deep Cinematic Blue (Area Utama Film & Waktu) -->
      <div class="ticket-main-blue">
        <div class="ticket-inner-border"></div>

        <!-- Top Header & Stars -->
        <div class="ticket-cinema-header">
          <div class="ticket-stars">    </div>
          <div class="ticket-brand-tag">LAYARTIX CINEMA</div>
        </div>

        <!-- Movie Details -->
        <div class="ticket-movie-content">
          <img class="ticket-mini-poster" src="${posterSrc}" alt="${movieTitleSafe}"
               onerror="this.style.display='none'"/>
          <div class="ticket-movie-info">
            <h3 class="ticket-vintage-title">${movieTitleSafe}</h3>
            <div class="ticket-cinema-name">${cinemaNameSafe}</div>
            <div class="ticket-badges-row">
              <span class="ticket-pill-badge">${movieRatingSafe}</span>
              <span class="ticket-pill-badge" style="color:#ffffff;border-color:rgba(255,255,255,0.3)">${seatTypeSafe}</span>
              ${b.splitBill ? `<span class="ticket-pill-badge" style="color:#fca5a5;border-color:#ef4444">Split Bill (${b.splitPeople || 2})</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Bottom Specs Strip: DATE/TIME, SCREEN, SEAT -->
        <div class="ticket-specs-strip">
          <div class="spec-block">
            <span class="spec-label">DATE / TIME</span>
            <span class="spec-val">${dateSafe} · ${timeSafe} ${tz}</span>
          </div>
          <div class="spec-block" style="text-align:center">
            <span class="spec-label">SCREEN</span>
            <span class="spec-val gold">${screenStudio}</span>
          </div>
          <div class="spec-block" style="text-align:right">
            <span class="spec-label">SEAT</span>
            <span class="spec-val gold">${seatNumbers}</span>
          </div>
        </div>
      </div>

      <!-- Garis Perforasi Vertikal di Tengah (Punched Dashed Line) -->
      <div class="ticket-perforation-divider"></div>

      <!-- SISI KANAN: Vintage Cream / Light Beige Stub (QR & ADMIT ONE) -->
      <div class="ticket-stub-cream">
        ${isTicketOnlyCancelled ? `
          <div style="font-size:11px;font-weight:700;color:#ef4444;text-align:center;padding:12px 6px">
            TIKET KURSI DIBATALKAN
          </div>
          <div style="font-size:9px;color:#64748b;text-align:center">QR Code Dinonaktifkan</div>
        ` : (isPendingPayment ? `
          <div style="font-size:11px;font-weight:700;color:#f59e0b;text-align:center;padding:12px 6px">
            MENUNGGU BAYAR
          </div>
          <div style="font-size:9px;color:#64748b;text-align:center">QR Terkunci Sesaat</div>
        ` : `
          <div class="stub-qr-box" id="qr-mini-${bookingIdSafe}"></div>
          <div class="stub-booking-id">${bookingIdSafe}</div>
          <div class="stub-admit-one">ADMIT ONE</div>
          <div style="font-size:9px;color:#64748b;margin-top:6px;font-weight:600;letter-spacing:0.05em">SCAN DI PINTU STUDIO</div>
        `)}
      </div>
    </div>

    <!-- Panel Status, Lalu Lintas & Aksi Tiket di Bawah Tiket Klasik -->
    <div class="ticket-card-footer-box">
      <div class="ticket-status-row">
        <span style="font-size:12px;color:rgba(255,255,255,0.7)">
          Total Pembayaran: <strong style="color:var(--gold)">${LT.formatRp(b.grandTotal || b.totalTicket || 0)}</strong>
        </span>
        <span class="ticket-status ${statusClass}">
          ${statusLabel}
        </span>
      </div>

      <!-- Kotak Hitung Mundur 10 Menit jika pembayaran belum selesai -->
      ${isPendingPayment ? `
        <div class="pending-payment-box">
          <div class="pending-timer-row">
            <span style="color:#f59e0b;font-weight:600">Selesaikan pembayaran dalam:</span>
            <span class="pending-timer-val" id="countdown-${bookingIdSafe}">10:00</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px">
            <span style="font-size:11px;color:rgba(255,255,255,0.6)">Metode: ${b.paymentMethod || 'QRIS / VA / E-Wallet'}</span>
            <button type="button" class="btn-pay-now" onclick="resumePayment('${bookingIdSafe}')">
              Lanjutkan Pembayaran
            </button>
          </div>
        </div>
      ` : ''}

      ${fnbItemsSafe.length ? (() => {
        const isDelivery = b.inSeatDelivery;
        const statusInfo = getDeliveryProgress(b);
        const check = isFnbCancellable(b);
        const hasActiveItems = fnbItemsSafe.some(f => f && f.status !== 'cancelled');

        return `
        <div class="fnb-addon-box">
          <div class="fnb-addon-header">
            <div class="fnb-addon-title">
               ${isDelivery ? 'In-Seat Delivery (Antar ke Kursi)' : 'Pesanan Kantin F&B'}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10px;padding:2px 8px;border-radius:12px;background:${statusInfo.badgeBg};color:${statusInfo.badgeColor};border:1px solid ${statusInfo.badgeColor}44">
                ${statusInfo.badgeText}
              </span>
              ${(check.cancellable && hasActiveItems && b.status === 'active' && !isPendingPayment) ? `
                <button type="button" class="fnb-cancel-all-btn" onclick="openFnbCancelModal('bundling', '${b.id}')" title="Batalkan seluruh pesanan makanan">
                  Batal Semua F&B
                </button>
              ` : ''}
            </div>
          </div>

          ${isDelivery && hasActiveItems ? `
            <div style="font-size:11px;font-weight:600;color:var(--gold);margin-bottom:6px">
               Diantar ke: ${screenStudio} · Kursi: ${seatNumbers}
            </div>
            <div style="width:100%;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-bottom:6px">
              <div style="width:${statusInfo.progressPercent}%;height:100%;background:${statusInfo.barGradient};border-radius:3px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:8px">
              <span>1. Disiapkan</span>
              <span>2. Diantar Petugas</span>
              <span>3. Sampai di Kursi</span>
            </div>
          ` : ''}

          <!-- Rincian Item F&B dengan Tombol Pembatalan Parsial per Item -->
          <div class="fnb-items-list">
            ${fnbItemsSafe.map((f, idx) => { if (!f) return "";
              const isCancelled = f.status === 'cancelled';
              const itemTotal = Number(f.price || 0) * Number(f.qty || 1);

              return `
              <div class="fnb-item-row ${isCancelled ? 'fnb-item-cancelled' : ''}">
                <div class="fnb-item-title">
                  <span>${f.emoji || ''}</span>
                  <span>${f.name}</span>
                  <span style="font-size:10px;color:var(--muted)">x${f.qty}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="fnb-item-price">${LT.formatRp(itemTotal)}</span>
                  ${isCancelled ? `
                    <span class="fnb-refund-tag">Dibatalkan</span>
                  ` : (check.cancellable && b.status === 'active' && !isPendingPayment ? `
                    <button type="button" class="btn-cancel-fnb-item" onclick="openFnbCancelModal('bundling', '${b.id}', ${idx})" title="Batalkan item ini">
                      Batal Item
                    </button>
                  ` : `
                    <span style="font-size:9px;color:var(--muted);background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:4px">Diproses</span>
                  `)}
                </div>
              </div>`;
            }).join('')}
          </div>

          ${b.fnbRefundAmount ? `
            <div style="font-size:11px;color:#22c55e;font-weight:600;margin-top:6px;display:flex;justify-content:space-between">
              <span>Total Refund F&B:</span>
              <span>${LT.formatRp(b.fnbRefundAmount)}</span>
            </div>
          ` : ''}
        </div>`;
      })() : ''}

      <!-- Tombol Aksi Tiket, Share QR & Pembatalan -->
      <div class="ticket-actions-grid">
        ${isReady ? `
          <button type="button" class="btn btn-outline btn-sm" onclick="showFullscreenTicket('${bookingIdSafe}')"> Tampilan Layar Penuh</button>
          <button type="button" class="btn-share-qr" onclick="openShareQrModal('${bookingIdSafe}')" title="Bagikan QR Code & Detail Tiket">
            <svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span>Share QR</span>
          </button>
          <button type="button" class="btn-inseat-order" onclick="orderFnbToMySeat('${bookingIdSafe}')">
             Pesan Makanan ke Kursi Saya (In-Seat Delivery)
          </button>
          <button type="button" class="btn btn-danger btn-sm" onclick="openCancelOptionModal('${bookingIdSafe}')">
             Batalkan Pesanan
          </button>
        ` : ''}
        ${isPendingPayment ? `
          <button type="button" class="btn btn-danger btn-sm" onclick="cancelPendingPayment('${bookingIdSafe}')">
            Batalkan Transaksi Ini
          </button>
        ` : ''}
        ${(rawStatus === 'used' || rawStatus === 'expired') ? `
          <div style="font-size:12px;color:#22c55e;font-weight:600;display:flex;align-items:center;gap:6px">
            Jadwal Selesai / Kadaluarsa (${b.date || 'Tanggal Nonton Terlampir'})
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            Waktu penayangan telah lewat. Tombol aksi dan pembatalan dinonaktifkan.
          </div>
        ` : ''}
        ${rawStatus === 'cancelled' ? `
          <div style="font-size:12px;color:var(--muted)">Refund ${LT.formatRp(b.refundAmount || refund40)} → Rekening/E-Wallet Asal (Flexi-Ticket)</div>
        ` : ''}
      </div>
    </div>
  </div>`;
}

// Fullscreen E-Ticket Utuh (Gaya Klasik Admit One Sisi Biru & Krem Lengkap)
function showFullscreenTicket(bookingId) {
  const bookings = LT.getUserBookings(user.id);
  const b = bookings.find(b => b.id === bookingId);
  if (!b) return;

  const target = document.getElementById('fullscreenCardTarget');
  if (!target) return;

  const screenStudio = b.deliveryStudio || 'Studio 1';
  const seatNumbers = Array.isArray(b.seats) ? b.seats.join(', ') : (b.seats || 'F21');
  const tz = LT.getCityTimeZone(b.city || 'Makassar');
  const posterSrc = getResolvedPoster(b);

  target.innerHTML = `
    <div class="classic-ticket-wrapper" style="margin:0;filter:drop-shadow(0 25px 50px rgba(0,0,0,0.9))">
      <div class="classic-ticket-card">
        <!-- Notches -->
        <div class="ticket-notch notch-left-top"></div>
        <div class="ticket-notch notch-left-bottom"></div>
        <div class="ticket-notch notch-right-top"></div>
        <div class="ticket-notch notch-right-bottom"></div>
        <div class="ticket-notch notch-middle-top"></div>
        <div class="ticket-notch notch-middle-bottom"></div>

        <!-- SISI KIRI: Deep Cinematic Blue -->
        <div class="ticket-main-blue">
          <div class="ticket-inner-border"></div>
          <div class="ticket-cinema-header">
            <div class="ticket-stars"></div>
            <div class="ticket-brand-tag">LAYARTIX CINEMA PASS</div>
          </div>
          <div class="ticket-movie-content">
            <img class="ticket-mini-poster" src="${posterSrc}" alt="${b.movieTitle}"
                 onerror="this.style.display='none'"/>
            <div class="ticket-movie-info">
              <h3 class="ticket-vintage-title" style="font-size:18px">${b.movieTitle}</h3>
              <div class="ticket-cinema-name">${b.cinemaName || 'LayarTix XXI'} (${b.city || 'Makassar'})</div>
              <div class="ticket-badges-row">
                <span class="ticket-pill-badge">${b.movieRating || '13+'}</span>
                <span class="ticket-pill-badge" style="color:#ffffff;border-color:rgba(255,255,255,0.3)">${b.seatType || 'Regular'}</span>
                <span class="ticket-pill-badge" style="color:#60a5fa;border-color:#3b82f6">${tz}</span>
              </div>
            </div>
          </div>
          <div class="ticket-specs-strip">
            <div class="spec-block">
              <span class="spec-label">DATE / TIME</span>
              <span class="spec-val">${b.date || 'Hari Ini'} · ${b.time || '19:00'} ${tz}</span>
            </div>
            <div class="spec-block" style="text-align:center">
              <span class="spec-label">SCREEN</span>
              <span class="spec-val gold">${screenStudio}</span>
            </div>
            <div class="spec-block" style="text-align:right">
              <span class="spec-label">SEAT</span>
              <span class="spec-val gold">${seatNumbers}</span>
            </div>
          </div>
        </div>

        <!-- Perforation -->
        <div class="ticket-perforation-divider"></div>

        <!-- SISI KANAN: Vintage Cream Stub -->
        <div class="ticket-stub-cream">
          <div class="stub-qr-box" id="qr-fullscreen-${b.id}"></div>
          <div class="stub-booking-id" style="font-size:12px;letter-spacing:1px">${b.id}</div>
          <div class="stub-admit-one">ADMIT ONE</div>
          <div style="font-size:9px;color:#64748b;margin-top:6px;font-weight:600;letter-spacing:0.05em">SCAN DI PINTU STUDIO</div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => { LT.generateQR(`qr-fullscreen-${b.id}`, b.qrData, 170); }, 50);

  // Request browser fullscreen on the modal container
  const modal = document.getElementById('fullscreenTicketModal');
  if (modal && modal.requestFullscreen) {
    modal.requestFullscreen().catch(err => console.warn('Fullscreen request failed:', err));
  }

  toggleFullscreenBrightness(false);
  if (modal) modal.classList.add('open');
}

function closeFullscreenTicket() {
  const modal = document.getElementById('fullscreenTicketModal');
  if (modal) modal.classList.remove('open');
  toggleFullscreenBrightness(false);
}

document.getElementById('fullscreenTicketModal')?.addEventListener('click', e => {
  if (e.target.id === 'fullscreenTicketModal') closeFullscreenTicket();
});

function toggleFullscreenBrightness(boost) {
  const modal = document.getElementById('fullscreenTicketModal');
  const btnMax = document.getElementById('btnFsMaxBright');
  const btnNorm = document.getElementById('btnFsNormBright');
  if (boost) {
    if (modal) modal.style.filter = 'brightness(1.3) contrast(1.1)';
    if (btnMax) btnMax.style.display = 'none';
    if (btnNorm) btnNorm.style.display = 'inline-block';
    LT.toast('Kecerahan layar ditingkatkan maksimal untuk scan e-ticket petugas bioskop!', 'info', 2000);
  } else {
    if (modal) modal.style.filter = 'none';
    if (btnMax) btnMax.style.display = 'inline-block';
    if (btnNorm) btnNorm.style.display = 'none';
  }
}

// QR Modal & Brightness booster
function showQr(bookingId) {
  const bookings = (typeof LT !== 'undefined' && typeof LT.getBookings === 'function') ? LT.getBookings() : [];
  const b = bookings.find(b => b.id === bookingId);
  if (!b) return;
  const seatStr = Array.isArray(b.seats) ? b.seats.join(', ') : (b.seats || 'F21');
  document.getElementById('qrBookingId').textContent = b.id;
  document.getElementById('qrMovieInfo').textContent = b.movieTitle;
  document.getElementById('qrCinemaInfo').textContent = `${b.cinemaName} · ${b.date} ${b.time} · ${seatStr}`;
  document.getElementById('qrDisplay').innerHTML = '';
  LT.generateQR('qrDisplay', b.qrData, 180);
  toggleBrightness(false);
  document.getElementById('qrModal').classList.add('open');
}

function closeQrModal() {
  document.getElementById('qrModal').classList.remove('open');
  toggleBrightness(false);
}

document.getElementById('qrModal').addEventListener('click', e => {
  if (e.target.id === 'qrModal') closeQrModal();
});

function toggleBrightness(boost) {
  const modal = document.querySelector('#qrModal .modal');
  const btnMax = document.getElementById('btnMaxBright');
  const btnNorm = document.getElementById('btnNormalBright');
  if (boost) {
    if (modal) modal.style.filter = 'brightness(1.3) contrast(1.1)';
    if (btnMax) btnMax.style.display = 'none';
    if (btnNorm) btnNorm.style.display = 'inline-block';
    LT.toast('Kecerahan ditingkatkan untuk kemudahan scan QR petugas bioskop! ', 'info', 2000);
  } else {
    if (modal) modal.style.filter = 'none';
    if (btnMax) btnMax.style.display = 'inline-block';
    if (btnNorm) btnNorm.style.display = 'none';
  }
}

// ── SISTEM PEMBATALAN PESANAN FLEKSIBEL (3 OPSI) ──
let activeCancelBooking = null;
let activeCancelChoice = null; // 'fnb' | 'ticket' | 'both'
let pendingCancellationData = null;

function openCancelOptionModal(bookingId) {
  const bookings = LT.getBookings();
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;

  activeCancelBooking = b;
  document.getElementById('cancelOptionBookingId').textContent = b.id;

  const fnbItems = Array.isArray(b.fnbItems) ? b.fnbItems : [];
  const hasActiveFnb = fnbItems.some(it => it && it.status !== 'cancelled');
  const fnbCheck = isFnbCancellable(b);

  const optFnb = document.getElementById('optCancelFnb');
  const optTicket = document.getElementById('optCancelTicket');
  const optBoth = document.getElementById('optCancelBoth');

  // Evaluasi Opsi 1: Makanan Saja
  if (!hasActiveFnb || !fnbCheck.cancellable) {
    optFnb.classList.add('disabled-choice');
    optFnb.querySelector('.cancel-option-desc').textContent = !hasActiveFnb
      ? 'Tidak ada pesanan makanan aktif dalam transaksi ini.'
      : fnbCheck.reason;
  } else {
    optFnb.classList.remove('disabled-choice');
    optFnb.querySelector('.cancel-option-desc').textContent = 'Batalkan pesanan snack/minuman saja. Kursi dan tiket bioskop Anda tetap 100% aktif dan valid.';
  }

  // Evaluasi Opsi 2: Tiket Bioskop Saja
  // Cek apakah jam tayang film sudah lewat
  let ticketCancellable = true;
  let ticketReason = '';
  if (b.date && b.time) {
    const diff = getShowtimeDiff(b.date, b.time, b.city);
    if (diff && diff.diffMs <= 0) {
      ticketCancellable = false;
      ticketReason = 'Jam penayangan film sudah dimulai atau terlewati.';
    }
  }

  if (!ticketCancellable) {
    optTicket.classList.add('disabled-choice');
    optTicket.querySelector('.cancel-option-desc').textContent = ticketReason;
    optBoth.classList.add('disabled-choice');
    optBoth.querySelector('.cancel-option-desc').textContent = ticketReason;
  } else {
    optTicket.classList.remove('disabled-choice');
    optTicket.querySelector('.cancel-option-desc').textContent = 'Batalkan tiket nonton bioskop. Kursi otomatis dilepas, sedangkan makanan tetap dapat diambil di bioskop.';
    optBoth.classList.remove('disabled-choice');
    optBoth.querySelector('.cancel-option-desc').textContent = hasActiveFnb
      ? 'Batalkan seluruh transaksi bioskop dan kantin F&B sekaligus. Seluruh pesanan dipindahkan ke riwayat.'
      : 'Batalkan transaksi tiket bioskop Anda (tidak ada pesanan makanan terlampir).';
  }

  const modal = document.getElementById('cancelOptionModal');
  if (modal) modal.classList.add('open');
}

function closeCancelOptionModal() {
  const modal = document.getElementById('cancelOptionModal');
  if (modal) modal.classList.remove('open');
}

document.getElementById('cancelOptionModal')?.addEventListener('click', e => {
  if (e.target.id === 'cancelOptionModal') closeCancelOptionModal();
});

function selectCancelAction(choice) {
  if (!activeCancelBooking) return;
  const b = activeCancelBooking;
  activeCancelChoice = choice;

  closeCancelOptionModal();

  if (choice === 'fnb') {
    // Arahkan langsung ke modal detail pembatalan F&B
    openFnbCancelModal('bundling', b.id);
    return;
  }

  // Persiapan data untuk Tiket Saja atau Keduanya
  const fnbItems = Array.isArray(b.fnbItems) ? b.fnbItems : [];
  const activeFnbTotal = fnbItems
    .filter(it => it && it.status !== 'cancelled')
    .reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 1)), 0);

  const ticketPriceBase = Number(b.totalTicket || b.grandTotal || 0);
  const ticketRefund = Math.round(ticketPriceBase * 0.4);

  let totalRefund = 0;
  let typeLabel = '';
  let explanation = '';
  let warningNote = '';

  if (choice === 'ticket') {
    totalRefund = ticketRefund;
    typeLabel = 'Tiket Bioskop Saja (Kursi Dilepas)';
    explanation = fnbItems.length > 0
      ? `Anda membatalkan tiket film <strong>${b.movieTitle}</strong>. Kursi Anda akan dibuka kembali. Pesanan makanan (F&B) tetap aktif dan dapat diambil di konter bioskop.`
      : `Anda membatalkan tiket film <strong>${b.movieTitle}</strong>. Kursi Anda akan dibuka kembali untuk penonton lain.`;
    warningNote = 'Kebijakan Flexi-Ticket: Pengembalian dana tiket sebesar 40% dari harga tiket bioskop akan ditransfer ke rekening/e-wallet asal.';
  } else if (choice === 'both') {
    const fnbRefund = activeFnbTotal;
    totalRefund = ticketRefund + fnbRefund;
    typeLabel = 'Seluruh Transaksi (Tiket Bioskop + Kantin F&B)';
    explanation = `Anda membatalkan seluruh pesanan untuk film <strong>${b.movieTitle}</strong> beserta seluruh pesanan F&B. Seluruh transaksi akan diarsipkan ke riwayat pembatalan.`;
    warningNote = `Pengembalian dana gabungan: Refund 40% tiket (${LT.formatRp(ticketRefund)}) + Refund 100% makanan (${LT.formatRp(fnbRefund)}) = ${LT.formatRp(totalRefund)} akan diproses otomatis ke rekening/e-wallet Anda.`;
  }

  pendingCancellationData = {
    bookingId: b.id,
    choice,
    totalRefund,
    ticketRefund,
    fnbRefund: activeFnbTotal
  };

  document.getElementById('cancelModalTitle').textContent = 'Konfirmasi Pembatalan';
  document.getElementById('cancelMovieName').textContent = `${b.movieTitle} (${Array.isArray(b.seats) ? b.seats.join(', ') : b.seats})`;
  document.getElementById('cancelExplanation').innerHTML = explanation;
  document.getElementById('cancelTypeLabel').textContent = typeLabel;
  document.getElementById('cancelRefundAmt').textContent = LT.formatRp(totalRefund);
  document.getElementById('cancelWarningNote').textContent = warningNote;

  const confirmModal = document.getElementById('cancelModal');
  if (confirmModal) confirmModal.classList.add('open');
}

function closeCancelModal() {
  document.getElementById('cancelModal').classList.remove('open');
  pendingCancellationData = null;
}

document.getElementById('cancelModal').addEventListener('click', e => {
  if (e.target.id === 'cancelModal') closeCancelModal();
});

function confirmCancel() {
  if (!pendingCancellationData) return;
  const { bookingId, choice, totalRefund, ticketRefund, fnbRefund } = pendingCancellationData;

  const bookings = LT.getBookings();
  const idx = bookings.findIndex(b => b.id === bookingId);
  if (idx < 0) return;

  const b = bookings[idx];
  const nowIso = new Date().toISOString();

  if (choice === 'ticket') {
    // Batalkan tiket bioskop saja
    b.ticketCancelled = true;
    b.ticketCancelledAt = nowIso;
    b.refundAmount = (b.refundAmount || 0) + ticketRefund;

    // Cek apakah ada F&B aktif
    const fnbItems = Array.isArray(b.fnbItems) ? b.fnbItems : [];
    const hasActiveFnb = fnbItems.some(it => it && it.status !== 'cancelled');

    if (hasActiveFnb) {
      // Tiket nonton batal, tapi makanan tetap aktif (berubah status)
      b.status = 'active'; // Tetap aktif untuk memantau F&B
      b.ticketOnlyCancelled = true;
    } else {
      b.status = 'cancelled';
      b.cancelledAt = nowIso;
    }
  } else if (choice === 'both') {
    // Batalkan seluruh transaksi
    b.status = 'cancelled';
    b.cancelledAt = nowIso;
    b.refundAmount = (b.refundAmount || 0) + totalRefund;

    if (Array.isArray(b.fnbItems)) {
      b.fnbItems.forEach(it => {
        if (it) {
          it.status = 'cancelled';
          it.cancelledAt = nowIso;
        }
      });
      b.fnbStatus = 'cancelled';
      b.inSeatDelivery = false;

      // Restock otomatis item F&B yang dibatalkan
      if (typeof LT.restoreFnbStock === 'function') {
        LT.restoreFnbStock(b.fnbItems);
      }
    }
  }

  // Simpan pembaruan ke storage
  LT.saveBookings(bookings);

  // Restore movie seats / now playing jika ada film
  const allMovies = LT.getAllMovies ? LT.getAllMovies() : [];
  const movieToRestore = allMovies.find(m => m.id === b.movieId);
  if (movieToRestore && LT.restoreNowPlayingMovie) {
    LT.restoreNowPlayingMovie(movieToRestore);
  }

  closeCancelModal();
  LT.toast(`Pembatalan berhasil diproses. Estimasi pengembalian dana ${LT.formatRp(totalRefund)} segera ditransfer ke rekening/e-wallet asal.`, 'success', 4500);
  renderBookings();
}

// In-Seat Quick Order shortcut from Active Ticket card
function orderFnbToMySeat(bookingId) {
  const bookings = LT.getUserBookings(user.id);
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;

  // Save selected session cinema and seats for In-Seat delivery
  LT.save('selected_city', b.city || 'Makassar');
  const tempSession = {
    cinemaId: b.cinemaId,
    cinemaName: b.cinemaName,
    mall: b.mall || b.cinemaName,
    city: b.city || 'Makassar',
    selectedSeats: b.seats || ['E5'],
    movieTitle: b.movieTitle,
    date: b.date,
    time: b.time
  };
  LT.setSession(tempSession);
  LT.toast(`Membuka Kantin untuk ${b.cinemaName} (Kursi: ${(b.seats || []).join(', ')})... `, 'info', 2000);
  setTimeout(() => window.location.href = 'fnb.html', 400);
}

renderBookings();


// Poll reminders every 30 seconds
setInterval(checkShowtimeNotifications, 30000);
setTimeout(checkShowtimeNotifications, 1500);

// Admin header link check
if (user.role === 'admin') {
  const adminLink = document.getElementById('adminHeaderLink');
  if (adminLink) adminLink.style.display = 'inline-flex';
}




// ─────────────────────────────────────────────────────────────────────────────
// FITUR PEMBATALAN PESANAN MAKANAN/MINUMAN (F&B / SNACK ADD-ON)
// ─────────────────────────────────────────────────────────────────────────────

let pendingFnbCancel = {
  type: null,        // 'bundling' or 'standalone'
  targetId: null,    // bookingId or orderId
  itemIndex: null,   // null = cancel all, number = specific item index
  itemsToCancel: [], // [{ name, price, qty, originalIndex }]
  totalRefund: 0
};

/**
 * Memeriksa apakah pesanan makanan masih memenuhi syarat untuk dibatalkan.
 * Syarat:
 * 1. Status pengantaran/pemrosesan masih 'disiapkan' / step 1 (belum diantar/selesai).
 * 2. Untuk tiket bundling, film belum melewati jam mulai tayang.
 */
function isFnbCancellable(targetObj) {
  if (!targetObj) return { cancellable: false, reason: 'Pesanan tidak ditemukan.' };
  
  // Jika order/tiket sudah dibatalkan atau selesai
  if (targetObj.status === 'cancelled') {
    return { cancellable: false, reason: 'Pesanan sudah dibatalkan.' };
  }
  if (targetObj.status === 'used') {
    return { cancellable: false, reason: 'Pesanan sudah selesai digunakan.' };
  }

  // Cek progress pengantaran
  const progress = getDeliveryProgress(targetObj);
  if (progress.step > 1) {
    return { 
      cancellable: false, 
      reason: 'Makanan/minuman sedang diantar atau sudah diterima di kursi bioskop, sehingga tidak dapat dibatalkan.' 
    };
  }

  // Jika bundling tiket film, cek jam mulai tayang
  if (targetObj.date && targetObj.time) {
    const diff = getShowtimeDiff(targetObj.date, targetObj.time, targetObj.city);
    if (diff && diff.diffMs <= 0) {
      return { 
        cancellable: false, 
        reason: 'Jam tayang film sudah dimulai. Dapur bioskop sudah menutup pesanan ini.' 
      };
    }
  }

  return { cancellable: true };
}

/**
 * Membuka Modal Konfirmasi Pembatalan Item F&B (Sebagian atau Seluruhnya)
 * @param {string} type - 'bundling' | 'standalone'
 * @param {string} targetId - booking.id atau order.id
 * @param {number|null} itemIndex - indeks spesifik item, atau null jika membatalkan semua
 */
function openFnbCancelModal(type, targetId, itemIndex = null) {
  let targetObj = null;
  let rawItems = [];

  if (type === 'bundling') {
    const bookings = LT.getBookings();
    targetObj = bookings.find(b => b.id === targetId);
    rawItems = targetObj ? (targetObj.fnbItems || []) : [];
  } else {
    const orders = LT.getFnbOrders();
    targetObj = orders.find(o => o.id === targetId);
    rawItems = targetObj ? (targetObj.items || []) : [];
  }

  if (!targetObj) {
    LT.toast('Data pesanan makanan tidak ditemukan.', 'error');
    return;
  }

  // Validasi syarat pembatalan
  const check = isFnbCancellable(targetObj);
  if (!check.cancellable) {
    LT.toast(check.reason, 'warning', 4000);
    return;
  }

  let itemsToCancel = [];
  if (itemIndex !== null) {
    const item = rawItems[itemIndex];
    if (!item || item.status === 'cancelled') {
      LT.toast('Item ini sudah dibatalkan sebelumnya.', 'info');
      return;
    }
    const price = Number(item.price || 0);
    const qty = Number(item.qty || 1);
    itemsToCancel.push({
      originalIndex: itemIndex,
      name: item.name,
      emoji: item.emoji || '',
      price: price,
      qty: qty,
      subtotal: price * qty
    });
  } else {
    // Batalkan seluruh item yang belum dibatalkan
    rawItems.forEach((item, idx) => {
      if (item.status !== 'cancelled') {
        const price = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        itemsToCancel.push({
          originalIndex: idx,
          name: item.name,
          emoji: item.emoji || '',
          price: price,
          qty: qty,
          subtotal: price * qty
        });
      }
    });
  }

  if (!itemsToCancel.length) {
    LT.toast('Tidak ada item makanan aktif yang dapat dibatalkan.', 'info');
    return;
  }

  const totalRefund = itemsToCancel.reduce((sum, it) => sum + it.subtotal, 0);

  // Simpan state pembatalan
  pendingFnbCancel = {
    type,
    targetId,
    itemIndex,
    itemsToCancel,
    totalRefund
  };

  // Render detail ke dalam modal
  const listEl = document.getElementById('fnbCancelItemList');
  if (listEl) {
    listEl.innerHTML = itemsToCancel.map(it => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px">
        <span style="font-size:12px;color:#fff;font-weight:600">
          ${it.name} <span style="color:var(--muted);font-size:11px">x${it.qty}</span>
        </span>
        <span style="font-size:12px;font-weight:700;color:var(--gold)">
          ${LT.formatRp(it.subtotal)}
        </span>
      </div>
    `).join('');
  }

  const refundEl = document.getElementById('fnbCancelRefundTotal');
  if (refundEl) {
    refundEl.textContent = LT.formatRp(totalRefund);
  }

  const modal = document.getElementById('fnbCancelModal');
  if (modal) modal.classList.add('open');
}

function closeFnbCancelModal() {
  const modal = document.getElementById('fnbCancelModal');
  if (modal) modal.classList.remove('open');
  pendingFnbCancel = {
    type: null,
    targetId: null,
    itemIndex: null,
    itemsToCancel: [],
    totalRefund: 0
  };
}

document.getElementById('fnbCancelModal')?.addEventListener('click', e => {
  if (e.target.id === 'fnbCancelModal') closeFnbCancelModal();
});

/**
 * Eksekusi Pembatalan Makanan/Minuman secara Real-Time
 * - Mengubah status item menjadi 'cancelled'
 * - Menghitung ulang grandTotal & refund
 * - Menyimpan ke database localStorage
 * - Validitas tiket bioskop tetap 100% terjaga (status: 'active')
 */
function executeFnbCancellation() {
  const { type, targetId, itemsToCancel, totalRefund } = pendingFnbCancel;
  if (!targetId || !itemsToCancel.length) return;

  const nowIso = new Date().toISOString();

  if (type === 'bundling') {
    const bookings = LT.getBookings();
    const idx = bookings.findIndex(b => b.id === targetId);
    if (idx < 0) return;

    const b = bookings[idx];
    if (!b.fnbItems) b.fnbItems = [];

    // Tandai status item yang dibatalkan
    itemsToCancel.forEach(it => {
      if (b.fnbItems[it.originalIndex]) {
        b.fnbItems[it.originalIndex].status = 'cancelled';
        b.fnbItems[it.originalIndex].cancelledAt = nowIso;
        b.fnbItems[it.originalIndex].refundAmount = it.subtotal;
      }
    });

    // Cek apakah semua item F&B sudah dibatalkan
    const allCancelled = b.fnbItems.every(it => it.status === 'cancelled');
    if (allCancelled) {
      b.fnbStatus = 'cancelled';
      b.inSeatDelivery = false;
    } else {
      b.fnbStatus = 'partially_cancelled';
    }

    // Kalkulasi ulang subtotal F&B aktif & grand total
    const activeFnbTotal = b.fnbItems
      .filter(it => it.status !== 'cancelled')
      .reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 1)), 0);

    b.totalFnb = activeFnbTotal;
    b.fnbRefundAmount = (b.fnbRefundAmount || 0) + totalRefund;
    b.grandTotal = (b.totalTicket || 0) + activeFnbTotal;

    // Restock otomatis item F&B yang dibatalkan
    if (typeof LT.restoreFnbStock === 'function') {
      LT.restoreFnbStock(itemsToCancel);
    }

    // Simpan pembaruan ke localStorage
    LT.saveBookings(bookings);

    // Sinkronisasi juga ke layartix_active_tickets
    try {
      const activeRaw = localStorage.getItem('layartix_active_tickets');
      if (activeRaw) {
        let activeList = JSON.parse(activeRaw);
        const aIdx = activeList.findIndex(x => x.id === targetId);
        if (aIdx >= 0) {
          activeList[aIdx] = b;
          localStorage.setItem('layartix_active_tickets', JSON.stringify(activeList));
        }
      }
    } catch(e) {}

  } else {
    // Standalone F&B Order
    const orders = LT.getFnbOrders();
    const idx = orders.findIndex(o => o.id === targetId);
    if (idx < 0) return;

    const o = orders[idx];
    if (!o.items) o.items = [];

    itemsToCancel.forEach(it => {
      if (o.items[it.originalIndex]) {
        o.items[it.originalIndex].status = 'cancelled';
        o.items[it.originalIndex].cancelledAt = nowIso;
        o.items[it.originalIndex].refundAmount = it.subtotal;
      }
    });

    const allCancelled = o.items.every(it => it.status === 'cancelled');
    if (allCancelled) {
      o.status = 'cancelled';
    } else {
      o.status = 'partially_cancelled';
    }

    const activeFnbTotal = o.items
      .filter(it => it.status !== 'cancelled')
      .reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 1)), 0);

    o.subtotal = activeFnbTotal;
    o.total = activeFnbTotal;
    o.refundAmount = (o.refundAmount || 0) + totalRefund;

    // Restock otomatis item F&B yang dibatalkan
    if (typeof LT.restoreFnbStock === 'function') {
      LT.restoreFnbStock(itemsToCancel);
    }

    LT.saveFnbOrders(orders);
  }

  closeFnbCancelModal();
  LT.toast(`Pesanan makanan berhasil dibatalkan. Estimasi refund ${LT.formatRp(totalRefund)} diproses otomatis!`, 'success', 4000);

  // Render ulang UI tiket aktif
  renderBookings();
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMER 10 MENIT PEMBAYARAN & SISTEM SHARE QR CODE
// ─────────────────────────────────────────────────────────────────────────────

// Interval hitung mundur 10 menit untuk tiket yang belum selesai dibayar
setInterval(updatePendingPaymentTimers, 1000);

function updatePendingPaymentTimers() {
  const bookings = LT.getBookings ? LT.getBookings() : [];
  const now = Date.now();
  let hasExpired = false;

  bookings.forEach(b => {
    const isPending = (b.paymentStatus === 'unpaid' || b.status === 'pending_payment');
    if (isPending && b.status !== 'cancelled' && b.status !== 'used') {
      const el = document.getElementById('countdown-' + b.id);
      let remainSec = 0;
      if (b.expiresAt) {
        remainSec = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - now) / 1000));
      } else {
        const createdAt = new Date(b.createdAt || b.paidAt || b.bookedAt || now).getTime();
        const diffSec = Math.floor((now - createdAt) / 1000);
        remainSec = Math.max(0, (10 * 60) - diffSec);
      }

      if (el) {
        const m = Math.floor(remainSec / 60);
        const s = remainSec % 60;
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      if (remainSec <= 0) {
        b.status = 'cancelled';
        b.paymentStatus = 'expired';
        b.cancelledAt = new Date().toISOString();
        b.cancelReason = 'Batas waktu pembayaran 10 menit telah habis.';
        hasExpired = true;

        // Restock otomatis item F&B karena transaksi kedaluwarsa
        if (Array.isArray(b.fnbItems) && b.fnbItems.length > 0 && typeof LT.restoreFnbStock === 'function') {
          LT.restoreFnbStock(b.fnbItems);
        }
      }
    }
  });

  if (hasExpired) {
    LT.saveBookings(bookings);
    LT.toast('Batas waktu pembayaran tiket telah habis. Kursi telah dilepas kembali.', 'error', 4500);
    renderBookings();
  }
}

// Melanjutkan pembayaran tiket tertunda
function resumePayment(bookingId) {
  const bookings = LT.getBookings ? LT.getBookings() : [];
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;

  // Set session agar fnb.html langsung memuat pemesanan ini
  LT.setSession({
    movieId: b.movieId,
    movieTitle: b.movieTitle,
    movieRating: b.movieRating,
    cinemaId: b.cinemaId,
    cinemaName: b.cinemaName,
    mall: b.mall,
    city: b.city,
    date: b.date,
    time: b.time,
    selectedSeats: b.seats,
    seatType: b.seatType,
    seatPrice: b.ticketPrice,
    ticketPrice: b.ticketPrice,
    existingBookingId: b.id
  });

  LT.toast('Mengarahkan ke halaman penyelesaian pembayaran...', 'info', 1500);
  setTimeout(() => {
    window.location.href = 'fnb.html';
  }, 400);
}

// Membatalkan transaksi tiket yang belum selesai dibayar
function cancelPendingPayment(bookingId) {
  const bookings = LT.getBookings ? LT.getBookings() : [];
  const idx = bookings.findIndex(x => x.id === bookingId);
  if (idx < 0) return;

  bookings[idx].status = 'cancelled';
  bookings[idx].paymentStatus = 'cancelled';
  bookings[idx].cancelledAt = new Date().toISOString();
  LT.saveBookings(bookings);

  LT.toast('Transaksi pembayaran tertunda berhasil dibatalkan. Kursi telah dibuka kembali.', 'info', 3000);
  renderBookings();
}

// ── SHARE QR CODE (WHATSAPP, WEB SHARE API, CLIPBOARD) ──
let activeShareTicket = null;

function openShareQrModal(bookingId) {
  let b = null;
  // Cari di getUserBookings, getBookings, dan localStorage
  if (typeof LT !== 'undefined' && typeof LT.getUserBookings === 'function') {
    const list = LT.getUserBookings(user.id);
    b = list.find(x => x && x.id === bookingId);
  }
  if (!b && typeof LT !== 'undefined' && typeof LT.getBookings === 'function') {
    const list = LT.getBookings();
    b = list.find(x => x && x.id === bookingId);
  }
  if (!b) {
    try {
      const raw = localStorage.getItem('layartix_active_tickets') || localStorage.getItem('lt_bookings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) b = parsed.find(x => x && x.id === bookingId);
      }
    } catch (e) {}
  }
  if (!b) {
    LT.toast('Data tiket tidak ditemukan.', 'error');
    return;
  }

  activeShareTicket = b;

  const titleEl = document.getElementById('shareMovieTitle');
  const codeEl = document.getElementById('shareBookingCode');
  const infoEl = document.getElementById('shareCinemaSeatInfo');
  const btnWa = document.getElementById('btnShareWhatsApp');

  const movieTitle = b.movieTitle || 'Film Bioskop';
  const cinemaName = b.cinemaName || 'LayarTix XXI';
  const seats = Array.isArray(b.seats) ? b.seats.join(', ') : b.seats;
  const date = b.date || 'Hari Ini';
  const time = b.time || '19:00';
  const tz = LT.getCityTimeZone ? LT.getCityTimeZone(b.city) : 'WITA';
  const bookingIdSafe = b.id;

  if (titleEl) titleEl.textContent = movieTitle;
  if (codeEl) codeEl.textContent = `KODE BOOKING: ${bookingIdSafe}`;
  if (infoEl) infoEl.textContent = `${cinemaName} · ${b.deliveryStudio || 'Studio 1'} · Kursi: ${seats} (${date} ${time} ${tz})`;

  // Render preview QR Code di dalam modal share
  const qrBox = document.getElementById('shareQrDisplay');
  if (qrBox) {
    qrBox.innerHTML = '';
    if (typeof LT !== 'undefined' && typeof LT.generateQR === 'function') {
      LT.generateQR('shareQrDisplay', b.qrData || b.id, 140);
    }
  }

  // Format pesan WhatsApp yang rapi dan profesional
  const waMessage = 
    `*TIKET NONTON LAYARTIX CINEMA*\n` +
    `----------------------------------\n` +
    `*Film:* ${movieTitle}\n` +
    `*Bioskop:* ${cinemaName}\n` +
    `*Jadwal:* ${date} · ${time} ${tz}\n` +
    `*Studio/Kursi:* ${b.deliveryStudio || 'Studio 1'} / ${seats}\n` +
    `*Kode Booking:* ${bookingIdSafe}\n` +
    `*Status:* SIAP DIPAKAI (Lunas)\n` +
    `----------------------------------\n` +
    `Tunjukkan pesan ini atau scan QR Code langsung di pintu studio bioskop!\n` +
    `Terima kasih telah memesan melalui LayarTix.`;

  if (btnWa) {
    btnWa.href = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;
  }

  // Sembunyikan atau tampilkan tombol native share jika didukung browser
  const btnNative = document.getElementById('btnNativeWebShare');
  if (btnNative) {
    btnNative.style.display = navigator.share ? 'flex' : 'none';
  }

  const modal = document.getElementById('shareQrModal');
  if (modal) modal.classList.add('open');
}

function closeShareQrModal() {
  const modal = document.getElementById('shareQrModal');
  if (modal) modal.classList.remove('open');
  activeShareTicket = null;
}

document.getElementById('shareQrModal')?.addEventListener('click', e => {
  if (e.target.id === 'shareQrModal') closeShareQrModal();
});

function trackShareClick(channel) {
  LT.toast(`Membuka WhatsApp untuk membagikan tiket ${activeShareTicket?.id || ''}...`, 'success', 2500);
}

// Web Share API
async function triggerNativeShare() {
  if (!activeShareTicket) return;
  const b = activeShareTicket;
  const seats = Array.isArray(b.seats) ? b.seats.join(', ') : b.seats;

  const shareData = {
    title: `Tiket LayarTix: ${b.movieTitle}`,
    text: `E-Ticket Nonton ${b.movieTitle} di ${b.cinemaName} (Kursi: ${seats}) pada ${b.date} ${b.time}. Kode: ${b.id}`,
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      LT.toast('Tiket berhasil dibagikan!', 'success', 3000);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Share error:', err);
    }
  }
}

// Salin teks ringkasan tiket ke clipboard
function copyTicketShareText() {
  if (!activeShareTicket) return;
  const b = activeShareTicket;
  const seats = Array.isArray(b.seats) ? b.seats.join(', ') : b.seats;
  const tz = LT.getCityTimeZone ? LT.getCityTimeZone(b.city) : 'WITA';

  const textToCopy = 
    `TIKET LAYARTIX: ${b.movieTitle}\n` +
    `Bioskop: ${b.cinemaName} (${b.deliveryStudio || 'Studio 1'})\n` +
    `Jadwal: ${b.date} · ${b.time} ${tz}\n` +
    `Kursi: ${seats}\n` +
    `Kode Booking: ${b.id}\n` +
    `Status: Siap Dipakai (Scan QR di pintu studio)`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      LT.toast('Detail tiket berhasil disalin ke papan klip!', 'success', 3000);
    }).catch(() => {
      fallbackCopyText(textToCopy);
    });
  } else {
    fallbackCopyText(textToCopy);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  LT.toast('Detail tiket berhasil disalin ke papan klip!', 'success', 3000);
}

// Unduh Gambar QR Code sebagai file PNG
function downloadTicketQrPng() {
  if (!activeShareTicket) return;
  const b = activeShareTicket;
  const qrBox = document.getElementById('shareQrDisplay');
  if (!qrBox) return;

  const img = qrBox.querySelector('img');
  const canvas = qrBox.querySelector('canvas');

  let dataUrl = null;
  if (img && img.src) {
    dataUrl = img.src;
  } else if (canvas) {
    dataUrl = canvas.toDataURL('image/png');
  }

  if (dataUrl) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR-Tiket-${b.id}-${(b.movieTitle || 'LayarTix').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    LT.toast('Gambar QR Code berhasil diunduh!', 'success', 3000);
  } else {
    LT.toast('Gagal mengunduh gambar QR Code. Silakan gunakan tangkapan layar.', 'warning', 3000);
  }
}