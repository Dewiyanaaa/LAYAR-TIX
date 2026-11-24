// fnb.js — Kantin F&B, Cart & Multi-Payment (Split Bill) Logic for LayarTix
'use strict';

const user = LT.requireAuth('customer');
const session = LT.getSession();
const isBundling = !!(session.selectedSeats && session.selectedSeats.length > 0);

// Payment State (QRIS, VA, E-Wallet, Split Bill)
let selectedPaymentMethod = 'qris'; // 'qris' | 'va' | 'ewallet' | 'split'
let selectedVA = { name: 'BCA', number: '8214 0812 3456 7890' };
let selectedEwallet = 'GoPay';
let splitCount = 3;
let splitCollected = 0;
let splitContributors = [];
let checkoutCountdownTimer = null;

// Mode Standalone F&B murni untuk katalog dan pengambilan kantin (pickup)
let deliveryType = isBundling ? 'in_seat' : 'pickup';

function autoSyncSeatInfo() {
  const studioInput = document.getElementById('deliveryStudio');
  const seatInput = document.getElementById('deliverySeat');
  const syncBadge = document.getElementById('seatSyncBadge');
  const syncNotice = document.getElementById('seatSyncNotice');

  if (isBundling && session.selectedSeats?.length) {
    if (studioInput) studioInput.value = 'Studio 1';
    if (seatInput) seatInput.value = session.selectedSeats.join(', ');
    if (syncBadge) syncBadge.textContent = 'Auto-Sync Tiket Baru';
    if (syncNotice) syncNotice.textContent = `Tersinkronisasi otomatis dengan pemesanan tiket ${session.movieTitle || 'Film'} (Kursi: ${session.selectedSeats.join(', ')}).`;
    return;
  }

  // Standalone mode: Lookup user's latest active cinema booking from localStorage
  const activeBookings = (typeof LT !== 'undefined' && typeof LT.getUserBookings === 'function')
    ? LT.getUserBookings(user.id).filter(b => b.status === 'active')
    : [];

  if (activeBookings.length > 0) {
    const activeTicket = activeBookings[0];
    const seatsStr = (activeTicket.seats || []).join(', ') || 'D4';
    const studioStr = activeTicket.deliveryStudio || 'Studio 1';

    if (studioInput) studioInput.value = studioStr;
    if (seatInput) seatInput.value = seatsStr;
    if (syncBadge) {
      syncBadge.textContent = 'Auto-Sync Tiket Aktif';
      syncBadge.style.background = 'rgba(34,197,94,0.15)';
      syncBadge.style.color = '#22c55e';
    }
    if (syncNotice) {
      syncNotice.textContent = `Terkunci otomatis ke ${studioStr}, Kursi ${seatsStr} (${activeTicket.movieTitle} - ${activeTicket.cinemaName}).`;
    }

    // Also auto-sync pickup cinema to match the active ticket's cinema
    const select = document.getElementById('pickupCinemaSelect');
    if (select && activeTicket.cinemaId) {
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === activeTicket.cinemaId || select.options[i].textContent.includes(activeTicket.cinemaName)) {
          select.selectedIndex = i;
          break;
        }
      }
    }
  } else {
    // Default fallback if no active tickets
    if (studioInput && !studioInput.value) studioInput.value = 'Studio 1';
    if (seatInput && !seatInput.value) seatInput.value = 'Kursi D4';
    if (syncBadge) {
      syncBadge.textContent = 'Default Bioskop';
      syncBadge.style.background = 'rgba(255,215,0,0.15)';
      syncBadge.style.color = '#ffd700';
    }
  }
}

function setDeliveryType(type) {
  deliveryType = type;
  const btnPickup = document.getElementById('btnDeliveryPickup');
  const btnInSeat = document.getElementById('btnDeliveryInSeat');
  const formBox = document.getElementById('inSeatFormBox');

  if (btnPickup) btnPickup.classList.toggle('active', type === 'pickup');
  if (btnInSeat) btnInSeat.classList.toggle('active', type === 'in_seat');
  if (formBox) {
    formBox.style.display = type === 'in_seat' ? 'block' : 'none';
    if (type === 'in_seat') {
      autoSyncSeatInfo();
    }
  }
}

// Mode setup
if (isBundling) {
  const backBtn = document.getElementById('fnbBackBtn');
  if (backBtn) backBtn.style.display = 'none';
  const headerContainer = document.getElementById('headerTitleContainer');
  if (headerContainer) headerContainer.style.display = 'none';
  const modeBanner = document.getElementById('modeBanner');
  if (modeBanner) modeBanner.style.display = 'flex';

  const ht = document.getElementById('headerTitle');
  if (ht) ht.textContent = '';
  const hs = document.getElementById('headerSubtitle');
  if (hs) hs.textContent = '';
  const mt = document.getElementById('modeTitle');
  if (mt) mt.textContent = `Bundling Tiket: ${session.movieTitle || ''}`;
  const md = document.getElementById('modeDesc');
  if (md) md.textContent = `${session.cinemaName || ''} · Kursi: ${session.selectedSeats.join(', ')}`;
  const mb = document.getElementById('modeBadge');
  if (mb) mb.textContent = 'Bundling Nonton';
  const cpr = document.getElementById('cinemaPickRow');
  if (cpr) cpr.style.display = 'none';

  setTimeout(() => {
    autoSyncSeatInfo();
  }, 100);
} else {
  // Mode navigasi tab langsung: bersihkan judul header pengantar
  const backBtn = document.getElementById('fnbBackBtn');
  if (backBtn) backBtn.style.display = 'none';
  const headerContainer = document.getElementById('headerTitleContainer');
  if (headerContainer) headerContainer.style.display = 'none';
  const modeBanner = document.getElementById('modeBanner');
  if (modeBanner) modeBanner.style.display = 'none';

  const ht = document.getElementById('headerTitle');
  if (ht) ht.textContent = '';
  const hs = document.getElementById('headerSubtitle');
  if (hs) hs.textContent = '';
  const mt = document.getElementById('modeTitle');
  if (mt) mt.textContent = '';

  const cpr = document.getElementById('cinemaPickRow');
  if (cpr) cpr.style.display = 'block';

  // Populate cinema select
  const city = LT.load('selected_city') || '';
  const cinemas = city ? LT.cinemas.filter(c => c.city.includes(city)) : LT.cinemas;
  const select = document.getElementById('pickupCinemaSelect');
  if (select) {
    select.innerHTML = (cinemas.length ? cinemas : LT.cinemas).map(c => `
      <option value="${c.id}" data-name="${c.name}" data-mall="${c.mall}" data-city="${c.city}">${c.name} (${c.mall})</option>
    `).join('');
  }

  // Check and auto-sync active ticket right away
  setTimeout(() => {
    autoSyncSeatInfo();
  }, 100);
}

function goBackOrHome() {
  if (isBundling) window.location.href = 'kursi.html';
  else window.location.href = 'beranda.html';
}

// F&B Cart & Split
const cart = {};
let splitEnabled = false;
let splitPeople = 2;

// Category Filter
const cats = ['Semua', 'Popcorn', 'Minuman', 'Makanan', 'Combo'];
let activeCat = 'Semua';
document.getElementById('catFilter').innerHTML = cats.map(c =>
  `<button class="cat-btn ${c === 'Semua' ? 'active' : ''}" onclick="setCat('${c}',this)">${c}</button>`
).join('');

function setCat(cat, btn) {
  activeCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFnbGrid();
}

function renderFnbGrid() {
  const items = activeCat === 'Semua' ? LT.getFnbMenu() : LT.getFnbMenu().filter(f => f.category === activeCat);
  document.getElementById('fnbGrid').innerHTML = items.map(f => {
    const qty = cart[f.id] || 0;
    const stock = f.stock !== undefined ? Number(f.stock) : 200;
    const isOutOfStock = stock <= 0;
    const isMaxReached = qty >= stock;

    let stockBadgeHTML = '';
    if (isOutOfStock) {
      stockBadgeHTML = '<span class="fnb-stock-badge empty">Stok Habis</span>';
    } else if (stock <= 10) {
      stockBadgeHTML = `<span class="fnb-stock-badge low">Sisa: ${stock}</span>`;
    } else {
      stockBadgeHTML = `<span class="fnb-stock-badge">Stok: ${stock}</span>`;
    }

    return `<div class="fnb-item-card ${qty > 0 ? 'has-item' : ''} ${isOutOfStock ? 'out-of-stock' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="fnb-emoji">${f.emoji}</div>
        ${stockBadgeHTML}
      </div>
      <div class="fnb-name">${f.name}</div>
      <div class="fnb-desc">${f.desc}</div>
      <div class="fnb-price">${LT.formatRp(f.price)}</div>
      <div class="fnb-counter">
        <button type="button" class="counter-btn" onclick="changeQty('${f.id}',-1)" ${qty <= 0 ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>−</button>
        <div class="counter-qty">${qty}</div>
        <button type="button" class="counter-btn plus" onclick="changeQty('${f.id}',1)" ${isOutOfStock || isMaxReached ? 'disabled style="opacity:0.3;cursor:not-allowed"' : ''}>+</button>
      </div>
    </div>`;
  }).join('');
  updateCartUI();
}

function changeQty(id, delta) {
  const item = LT.getFnbMenu().find(f => f.id === id);
  const stock = item ? (item.stock !== undefined ? Number(item.stock) : 200) : 200;
  const current = cart[id] || 0;
  const newQty = current + delta;

  if (delta > 0 && newQty > stock) {
    LT.toast(`Jumlah pesanan tidak bisa melebihi stok yang tersedia (${stock} porsi).`, 'warning');
    return;
  }

  cart[id] = Math.max(0, newQty);
  renderFnbGrid();
  updateSplitCalc();
}

function getFnbSubtotal() {
  return Object.entries(cart).reduce((s, [id, qty]) => {
    const item = LT.getFnbMenu().find(f => f.id === id);
    return s + (item ? item.price * qty : 0);
  }, 0);
}

function calculateTotals() {
  const ticketTotal = isBundling ? (session.totalTicket || 0) : 0;
  const fnbTotal = getFnbSubtotal();
  const subtotal = ticketTotal + fnbTotal;
  const tax = Math.round(subtotal * 0.1);
  const grand = subtotal + tax;
  return { ticketTotal, fnbTotal, subtotal, tax, grand };
}

function updateCartUI() {
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const { grand } = calculateTotals();
  document.getElementById('cartItemCount').textContent = `${totalItems} makanan/minuman dipilih`;
  document.getElementById('cartSubtotal').textContent = LT.formatRp(grand);
}

// Switch View
function switchView(view) {
  if (view === 'checkout') {
    const { grand, fnbTotal } = calculateTotals();
    if (!isBundling && fnbTotal === 0) {
      LT.toast('Silakan pilih minimal 1 menu makanan/minuman', 'warning');
      return;
    }
    document.getElementById('viewMenu').style.display = 'none';
    document.getElementById('viewCheckout').style.display = 'block';
    document.getElementById('bottomCartBar').style.display = 'none';
    const tabsRow = document.getElementById('fnbTabsRow');
    if (tabsRow) tabsRow.style.display = 'flex';
    const btnMenu = document.getElementById('tabBtnMenu');
    if (btnMenu) btnMenu.classList.remove('active');
    const btnCheckout = document.getElementById('tabBtnCheckout');
    if (btnCheckout) btnCheckout.classList.add('active');
    renderCheckoutView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    document.getElementById('viewMenu').style.display = 'block';
    document.getElementById('viewCheckout').style.display = 'none';
    document.getElementById('bottomCartBar').style.display = 'flex';
    const tabsRow = document.getElementById('fnbTabsRow');
    if (tabsRow) tabsRow.style.display = 'none';
    const btnMenu = document.getElementById('tabBtnMenu');
    if (btnMenu) btnMenu.classList.add('active');
    const btnCheckout = document.getElementById('tabBtnCheckout');
    if (btnCheckout) btnCheckout.classList.remove('active');
  }
}

function renderCheckoutView() {
  const { ticketTotal, fnbTotal, tax, grand } = calculateTotals();

  // Ticket rows (if bundling)
  if (isBundling) {
    document.getElementById('ticketSummaryRows').innerHTML = `
      <div class="summary-row">
        <span class="summary-label">Film</span>
        <span class="summary-value">${session.movieTitle || ''}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Bioskop & Jam</span>
        <span class="summary-value">${session.cinemaName || ''} · ${session.time || ''}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Kursi (${session.selectedSeats.length}x ${LT.formatRp(session.seatPrice)})</span>
        <span class="summary-value">${session.selectedSeats.join(', ')}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Subtotal Tiket</span>
        <span class="summary-value">${LT.formatRp(ticketTotal)}</span>
      </div>
    `;
  } else {
    const select = document.getElementById('pickupCinemaSelect');
    const cinemaName = select?.options[select.selectedIndex]?.dataset.name || 'Bioskop Terpilih';
    document.getElementById('ticketSummaryRows').innerHTML = `
      <div class="summary-row">
        <span class="summary-label">Lokasi Pengambilan F&B</span>
        <span class="summary-value">${cinemaName}</span>
      </div>
    `;
  }

  // F&B item rows
  const fnbRows = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => {
    const f = LT.getFnbMenu().find(f => f.id === id);
    return `<div class="summary-row">
      <span class="summary-label">${f.emoji} ${f.name} x${qty}</span>
      <span class="summary-value">${LT.formatRp(f.price * qty)}</span>
    </div>`;
  }).join('');

  document.getElementById('fnbSummaryRows').innerHTML = fnbRows || (isBundling ? '' : '<div class="summary-row"><span class="summary-label">Belum ada makanan dipilih</span></div>');
  document.getElementById('taxDisplay').textContent = LT.formatRp(tax);
  document.getElementById('grandTotalDisplay').textContent = LT.formatRp(grand);

  // If split was enabled in menu, default to split payment method
  if (splitEnabled) {
    setPaymentMethod('split');
  } else {
    setPaymentMethod(selectedPaymentMethod || 'qris');
  }

  // Jalankan timer hitung mundur 10 menit di halaman checkout
  startCheckoutTimer();
}

function startCheckoutTimer() {
  if (checkoutCountdownTimer) clearInterval(checkoutCountdownTimer);

  // Periksa apakah ada batas waktu yang sudah tersimpan di session atau tiket yang dilanjutkan
  let expireTimestamp = null;
  const currentSession = (typeof LT !== 'undefined' && typeof LT.getSession === 'function') ? LT.getSession() : {};
  if (currentSession.existingBookingId) {
    const bookings = (typeof LT !== 'undefined' && typeof LT.getBookings === 'function') ? LT.getBookings() : [];
    const existing = bookings.find(x => x.id === currentSession.existingBookingId);
    if (existing && existing.expiresAt) {
      expireTimestamp = new Date(existing.expiresAt).getTime();
    }
  }

  if (!expireTimestamp) {
    // 10 menit dari sekarang
    const sessionTimerStart = sessionStorage.getItem('layartix_checkout_expire');
    if (sessionTimerStart) {
      expireTimestamp = parseInt(sessionTimerStart, 10);
    } else {
      expireTimestamp = Date.now() + (10 * 60 * 1000);
      sessionStorage.setItem('layartix_checkout_expire', expireTimestamp.toString());
    }
  }

  function tick() {
    const now = Date.now();
    const remainMs = expireTimestamp - now;
    const remainSec = Math.max(0, Math.floor(remainMs / 1000));
    const displayEl = document.getElementById('checkoutCountdownDisplay');

    if (displayEl) {
      const m = Math.floor(remainSec / 60);
      const s = remainSec % 60;
      displayEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    if (remainSec <= 0) {
      clearInterval(checkoutCountdownTimer);
      sessionStorage.removeItem('layartix_checkout_expire');
      const payBtn = document.getElementById('payFinalBtn');
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.style.opacity = '0.5';
        payBtn.textContent = 'Waktu Pembayaran Habis (Kedaluwarsa)';
      }
      LT.toast('Batas waktu pembayaran 10 menit telah habis. Kursi telah dilepaskan kembali.', 'error', 4000);
    }
  }

  tick();
  checkoutCountdownTimer = setInterval(tick, 1000);
}

// PAYMENT METHODS IMPLEMENTATION
function setPaymentMethod(method) {
  selectedPaymentMethod = method;
  ['qris', 'va', 'ewallet', 'split'].forEach(m => {
    const pill = document.getElementById('pm_' + m);
    if (pill) pill.classList.toggle('active', m === method);
    const box = document.getElementById('payBox_' + m);
    if (box) box.style.display = (m === method) ? 'block' : 'none';
  });

  const { grand } = calculateTotals();
  const payBtn = document.getElementById('payFinalBtn');

  if (method === 'qris') {
    LT.generateQR('qrisContainer', `LAYARTIX-QRIS|ID:${Date.now()}|TOTAL:${grand}`, 160);
    payBtn.textContent = ' Konfirmasi Pembayaran QRIS';
    payBtn.style.opacity = '1';
    payBtn.style.pointerEvents = 'auto';
  } else if (method === 'va') {
    payBtn.textContent = ` Salin VA & Bayar (${selectedVA.name})`;
    payBtn.style.opacity = '1';
    payBtn.style.pointerEvents = 'auto';
  } else if (method === 'ewallet') {
    payBtn.textContent = ` Bayar via ${selectedEwallet}`;
    payBtn.style.opacity = '1';
    payBtn.style.pointerEvents = 'auto';
  } else if (method === 'split') {
    initSplitTracker(grand);
  }
}

function selectVA(name, num, btn) {
  selectedVA = { name, number: num };
  document.querySelectorAll('#payBox_va .va-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const disp = document.getElementById('vaNumberDisplay');
  if (disp) disp.textContent = num;
  const payBtn = document.getElementById('payFinalBtn');
  if (selectedPaymentMethod === 'va') {
    payBtn.textContent = `Salin VA & Bayar (${selectedVA.name})`;
  }
}

function copyAndSimulateVA() {
  const num = selectedVA.number;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num.replace(/\s+/g, '')).catch(() => { });
  }
  LT.toast(`Nomor VA ${selectedVA.name} (${num}) berhasil disalin! Memverifikasi...`, 'info', 1000);
  const statusEl = document.getElementById('vaStatusText');
  if (statusEl) statusEl.textContent = 'Nomor VA disalin. Pembayaran diverifikasi...';

  // Verifikasi cepat tanpa delay berbelit
  setTimeout(() => {
    simulateVAPaymentSuccess();
  }, 400);
}

function simulateVAPaymentSuccess() {
  const statusEl = document.getElementById('vaStatusText');
  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#22c55e;font-weight:700">Pembayaran VA Berhasil Diverifikasi! Status: LUNAS</span>';
  }
  processPayment(`Transfer Bank VA (${selectedVA.name} Lunas)`);
}

function selectEwallet(name, btn) {
  selectedEwallet = name;
  document.querySelectorAll('#payBox_ewallet .va-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const payBtn = document.getElementById('payFinalBtn');
  if (selectedPaymentMethod === 'ewallet') {
    payBtn.textContent = `Buka & Bayar via ${selectedEwallet}`;
  }

  // Simulasi deep linking instan ketika logo/nama e-wallet diklik
  triggerEwalletDeepLink(name);
}

function triggerEwalletDeepLink(name) {
  LT.toast(`Membuka ${name}... Pembayaran terverifikasi otomatis.`, 'info', 800);
  setTimeout(() => {
    processPayment(`E-Wallet (${name} Terverifikasi)`);
  }, 300);
}

function changeSplitCount(delta) {
  splitCount = Math.max(2, Math.min(8, splitCount + delta));
  const el = document.getElementById('splitCountVal');
  if (el) el.textContent = splitCount;
  const { grand } = calculateTotals();
  initSplitTracker(grand);
}

function initSplitTracker(grand) {
  const cu = LT.getCurrentUser();
  const perPerson = Math.ceil(grand / splitCount);
  const tag = document.getElementById('splitPerPersonTag');
  if (tag) tag.textContent = LT.formatRp(perPerson);
  const targetDisp = document.getElementById('splitTargetDisplay');
  if (targetDisp) targetDisp.textContent = LT.formatRp(grand);

  // 1 QR CODE GABUNGAN
  LT.generateQR('splitQrContainer', `LAYARTIX-SPLIT-1QR|PEOPLE:${splitCount}|TOTAL:${grand}|CODE:${Date.now()}`, 160);

  // Host pays 1 share initially
  splitCollected = perPerson;
  splitContributors = [];
  splitContributors.push({
    name: (cu?.name || 'Anda') + ' (Host Pemesan)',
    amount: perPerson,
    status: 'lunas',
    time: 'Baru saja'
  });

  for (let i = 2; i <= splitCount; i++) {
    splitContributors.push({
      name: `Teman #${i}`,
      amount: perPerson,
      status: 'pending',
      time: '-'
    });
  }

  renderSplitTracker(grand);
}

function renderSplitTracker(grand) {
  const pct = Math.min(100, Math.round((splitCollected / grand) * 100));
  const pctEl = document.getElementById('splitStatusPercent');
  if (pctEl) pctEl.textContent = pct + '%';
  const bar = document.getElementById('splitProgressBar');
  if (bar) bar.style.width = pct + '%';
  const colEl = document.getElementById('splitCollectedDisplay');
  if (colEl) colEl.textContent = LT.formatRp(splitCollected);

  const list = document.getElementById('splitContributorsList');
  if (list) {
    list.innerHTML = splitContributors.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:8px;background:${c.status === 'lunas' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${c.status === 'lunas' ? 'rgba(34,197,94,0.3)' : 'transparent'}">
        <div style="display:flex;align-items:center;gap:6px">
          <span>${c.status === 'lunas' ? '' : ''}</span>
          <span style="font-weight:600;color:${c.status === 'lunas' ? '#22c55e' : 'var(--text)'}">${c.name}</span>
        </div>
        <div style="text-align:right">
          <span style="font-weight:700;color:${c.status === 'lunas' ? '#22c55e' : 'var(--muted)'}">${LT.formatRp(c.amount)}</span>
          <span style="font-size:10px;display:block;color:${c.status === 'lunas' ? '#22c55e' : '#ef4444'}">${c.status === 'lunas' ? 'LUNAS' : 'Belum bayar'}</span>
        </div>
      </div>
    `).join('');
  }

  const btnSim = document.getElementById('btnSimulateFriend');
  if (btnSim) {
    const hasPending = splitContributors.some(c => c.status === 'pending');
    btnSim.style.display = hasPending ? 'block' : 'none';
  }

  updateSplitPayBtn();
}

function simulateFriendPayment() {
  const { grand } = calculateTotals();
  const nextFriend = splitContributors.find(c => c.status === 'pending');
  if (!nextFriend) {
    LT.toast('Semua teman sudah melunasi patungan!', 'success');
    return;
  }
  nextFriend.status = 'lunas';
  nextFriend.time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  splitCollected = Math.min(grand, splitCollected + nextFriend.amount);

  LT.toast(` ${nextFriend.name} berhasil scan 1 QR & membayar ${LT.formatRp(nextFriend.amount)}!`, 'success');
  renderSplitTracker(grand);

  if (splitCollected >= grand) {
    setTimeout(() => {
      LT.toast(' Seluruh patungan lunas 100%! Tiket diterbitkan...', 'success');
      setTimeout(() => processPayment('Split Bill (1 QR Gabungan Lunas)'), 1200);
    }, 600);
  }
}

function updateSplitPayBtn() {
  const { grand } = calculateTotals();
  const payBtn = document.getElementById('payFinalBtn');
  if (selectedPaymentMethod !== 'split') return;

  if (splitCollected >= grand) {
    payBtn.textContent = '🎉 Patungan Lunas! Terbitkan Tiket Siap Dipakai';
    payBtn.style.opacity = '1';
    payBtn.style.pointerEvents = 'auto';
  } else {
    payBtn.textContent = `📋 Proses Tiket Patungan (Menunggu ${LT.formatRp(grand - splitCollected)} Lagi)`;
    payBtn.style.opacity = '1';
    payBtn.style.pointerEvents = 'auto';
  }
}

function processPayment(overrideMethod) {
  const { ticketTotal, fnbTotal, tax, grand } = calculateTotals();
  const cu = LT.getCurrentUser();

  const method = overrideMethod || (
    selectedPaymentMethod === 'qris' ? 'QRIS Standar (BCA/Mandiri/GoPay/OVO)' :
      selectedPaymentMethod === 'va' ? `Transfer Bank VA (${selectedVA.name})` :
        selectedPaymentMethod === 'ewallet' ? `E-Wallet (${selectedEwallet})` :
          'Split Bill (1 QR Gabungan)'
  );

  const fnbItems = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => {
    const f = LT.getFnbMenu().find(f => f.id === id);
    return { id: f.id, name: f.name, emoji: f.emoji, price: f.price, qty };
  });

  const studioInput = document.getElementById('deliveryStudio')?.value.trim();
  const seatInput = document.getElementById('deliverySeat')?.value.trim();
  const isInSeatDelivery = (deliveryType === 'in_seat');

  if (isBundling) {
    // Complete Movie Ticket + Bundling Booking
    const bookingId = LT.generateId('LTX');
    const movieTitleVal = session.movieTitle || 'Avatar: Fire & Ash';
    const cinemaNameVal = session.cinemaName || 'XXI Trans Studio Mall Makassar';
    const mallVal = session.mall || 'Trans Studio Mall';
    const cityVal = session.city || 'Makassar';
    const dateVal = session.date || new Date().toISOString().split('T')[0];
    const timeVal = session.time || '19:00';
    const seatsVal = (session.selectedSeats && session.selectedSeats.length) ? session.selectedSeats : ['C5', 'C6'];
    let posterVal = session.poster;
    if (!posterVal) {
      try {
        const npRaw = localStorage.getItem('layartix_now_playing');
        if (npRaw) {
          const parsed = JSON.parse(npRaw);
          const foundM = parsed.find(x => x.id === session.movieId);
          if (foundM && foundM.poster) posterVal = foundM.poster;
        }
      } catch (e) {}
    }
    const currentUserId = cu?.id || (user ? user.id : 'GUEST');
    const screenStudio = studioInput || session.screenStudio || 'Studio 1';

    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const isSplit = (selectedPaymentMethod === 'split');
    const isSplitFullyPaid = isSplit ? (splitCollected >= grand) : true;
    const initialStatus = isSplitFullyPaid ? 'active' : 'pending';
    const initialPaymentStatus = isSplitFullyPaid ? 'paid' : 'unpaid';

    const booking = {
      id: bookingId,
      userId: currentUserId,
      movieId: session.movieId || 'm_avatar3',
      movieTitle: movieTitleVal,
      movieRating: session.movieRating || 'D13',
      cinemaId: session.cinemaId || 'c_mks_1',
      cinemaName: cinemaNameVal,
      mall: mallVal,
      city: cityVal,
      date: dateVal,
      time: timeVal,
      seats: seatsVal,
      seatType: session.seatType || 'Regular',
      ticketPrice: session.seatPrice || 75000,
      totalTicket: ticketTotal || (seatsVal.length * (session.seatPrice || 75000)),
      fnbItems,
      totalFnb: fnbTotal,
      tax,
      grandTotal: grand,
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
      splitBill: isSplit,
      splitPeople: isSplit ? splitCount : null,
      splitCollected: isSplit ? splitCollected : grand,
      splitContributors: isSplit ? JSON.parse(JSON.stringify(splitContributors)) : null,
      isSplitFullyPaid: isSplitFullyPaid,
      paymentMethod: method,
      createdAt: nowIso,
      expiresAt: expiresAtIso,
      paidAt: isSplitFullyPaid ? nowIso : null,
      qrData: `LAYARTIX|${bookingId}|${movieTitleVal}|${cinemaNameVal}|${seatsVal.join(',')}`,
      poster: posterVal,
      inSeatDelivery: fnbItems.length > 0 && isInSeatDelivery,
      deliveryStudio: screenStudio,
      deliverySeat: seatInput || seatsVal.join(', '),
      deliveryStatus: fnbItems.length > 0 && isInSeatDelivery ? 'preparing' : null,
      deliveryStatusTime: nowIso
    };

    // Kurangi stok F&B di database localStorage sesuai pesanan
    if (fnbItems && fnbItems.length > 0 && typeof LT.decreaseFnbStock === 'function') {
      LT.decreaseFnbStock(fnbItems);
    }

    // Bersihkan batas waktu checkout di sessionStorage
    sessionStorage.removeItem('layartix_checkout_expire');

    // Pastikan notifikasi tiket tersimpan di session
    if (typeof LT !== 'undefined' && typeof LT.setSession === 'function') {
      LT.setSession({ bookingId: booking.id, booking });
    }

    // Gunakan fungsi helper global saveAndRedirectToTickets
    if (typeof window.saveAndRedirectToTickets === 'function') {
      window.saveAndRedirectToTickets(booking);
    } else {
      LT.addBooking(booking);
      window.location.href = 'tiket.html';
    }
  } else {
    // Standalone Kantin F&B Order
    // Kurangi stok F&B di database localStorage sesuai pesanan
    if (fnbItems && fnbItems.length > 0 && typeof LT.decreaseFnbStock === 'function') {
      LT.decreaseFnbStock(fnbItems);
    }

    const select = document.getElementById('pickupCinemaSelect');
    const opt = select ? select.options[select.selectedIndex] : null;
    const orderId = LT.generateId('FNB');
    const order = {
      id: orderId,
      userId: cu?.id || 'GUEST',
      cinemaId: select ? select.value : 'C1',
      cinemaName: opt?.dataset.name || 'Bioskop',
      items: fnbItems,
      subtotal: fnbTotal,
      tax,
      total: grand,
      paymentMethod: method,
      orderedAt: new Date().toISOString(),
      status: isInSeatDelivery ? 'preparing' : 'ready_for_pickup',
      deliveryType: isInSeatDelivery ? 'in_seat' : 'pickup',
      deliveryStudio: studioInput || 'Studio 1',
      deliverySeat: seatInput || 'Kursi Penonton',
      deliveryStatus: isInSeatDelivery ? 'preparing' : null,
      deliveryStatusTime: new Date().toISOString(),
      qrData: `FNB-ORDER|${orderId}|${cu?.name || 'Customer'}|${grand}`
    };
    LT.addFnbOrder(order);
    window.location.href = 'tiket.html';
  }
}

renderFnbGrid();


// ── Cross-tab sync: perubahan menu F&B atau kursi dari Admin/tab lain ──
window.addEventListener('storage', (e) => {
  if (e.key === 'layartix_fnb_menu') {
    renderFnbGrid();
  }
  if (e.key === 'layartix_active_tickets' || e.key === 'lt_bookings') {
    if (typeof autoSyncSeatInfo === 'function') autoSyncSeatInfo();
  }
});

// ── SHARE QR & TAGIHAN PEMBAYARAN (CHECKOUT SHARE) ──
function openCheckoutShareModal() {
  const { grand } = calculateTotals();
  const movieTitle = isBundling ? (session.movieTitle || 'Film Bioskop') : 'Pemesanan Kantin F&B';
  const cinemaName = isBundling ? (session.cinemaName || 'LayarTix Cinema') : 'Kantin Bioskop';
  const seats = (session.selectedSeats && session.selectedSeats.length) ? session.selectedSeats.join(', ') : '';
  const date = session.date || 'Hari Ini';
  const time = session.time || '19:00';
  const tz = (typeof LT !== 'undefined' && typeof LT.getCityTimeZone === 'function') ? LT.getCityTimeZone(session.city || 'Makassar') : 'WITA';

  const movieEl = document.getElementById('checkoutShareMovie');
  const detailsEl = document.getElementById('checkoutShareDetails');
  const totalEl = document.getElementById('checkoutShareTotal');
  const qrBox = document.getElementById('checkoutShareQrDisplay');
  const btnWa = document.getElementById('btnShareCheckoutWa');
  const btnNative = document.getElementById('btnShareCheckoutNative');

  if (movieEl) movieEl.textContent = movieTitle;
  if (detailsEl) detailsEl.textContent = isBundling ? `${cinemaName} · Kursi: ${seats} (${date} ${time} ${tz})` : cinemaName;
  if (totalEl) totalEl.textContent = `Total Tagihan: ${LT.formatRp(grand)}`;

  // Render QR Code untuk tagihan pembayaran
  const qrDataPayload = (selectedPaymentMethod === 'split')
    ? `LAYARTIX-SPLIT-BILL|PEOPLE:${splitCount}|TOTAL:${grand}|CODE:${Date.now()}`
    : `LAYARTIX-QRIS-BILL|TITLE:${movieTitle}|TOTAL:${grand}|CODE:${Date.now()}`;

  if (qrBox) {
    qrBox.innerHTML = '';
    if (typeof LT !== 'undefined' && typeof LT.generateQR === 'function') {
      LT.generateQR('checkoutShareQrDisplay', qrDataPayload, 140);
    }
  }

  // Format Pesan Teks WhatsApp
  const waText = 
    `*TAGIHAN PEMBAYARAN TIKET LAYARTIX*\n` +
    `-----------------------------------\n` +
    `*Pemesanan:* ${movieTitle}\n` +
    `*Bioskop:* ${cinemaName}\n` +
    (isBundling ? `*Jadwal:* ${date} · ${time} ${tz}\n*Kursi:* ${seats}\n` : '') +
    `*Metode:* ${selectedPaymentMethod === 'split' ? 'Patungan / Split Bill' : 'QRIS Standar'}\n` +
    `*Total Tagihan:* ${LT.formatRp(grand)}\n` +
    (selectedPaymentMethod === 'split' ? `*Patungan per Orang:* ${LT.formatRp(Math.ceil(grand / splitCount))}\n` : '') +
    `-----------------------------------\n` +
    `Mohon bantu scan QR Code atau lakukan pembayaran sebelum batas waktu 10 menit berakhir ya!\n` +
    `Terima kasih.`;

  if (btnWa) {
    btnWa.href = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  }

  if (btnNative) {
    btnNative.style.display = navigator.share ? 'flex' : 'none';
  }

  const modal = document.getElementById('checkoutShareModal');
  if (modal) modal.classList.add('open');
}

function closeCheckoutShareModal() {
  const modal = document.getElementById('checkoutShareModal');
  if (modal) modal.classList.remove('open');
}

document.getElementById('checkoutShareModal')?.addEventListener('click', e => {
  if (e.target.id === 'checkoutShareModal') closeCheckoutShareModal();
});

// Web Share API di Halaman Checkout
async function triggerCheckoutNativeShare() {
  const { grand } = calculateTotals();
  const movieTitle = isBundling ? (session.movieTitle || 'Film Bioskop') : 'Pemesanan Kantin F&B';
  const seats = (session.selectedSeats && session.selectedSeats.length) ? session.selectedSeats.join(', ') : '';

  const shareData = {
    title: `Tagihan LayarTix: ${movieTitle}`,
    text: `Tagihan Tiket LayarTix: ${movieTitle} (Kursi: ${seats}) sebesar ${LT.formatRp(grand)}. Selesaikan dalam 10 menit.`,
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      LT.toast('Tagihan berhasil dibagikan!', 'success', 3000);
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('Share error:', err);
  }
}

// Salin Teks Tagihan
function copyCheckoutBillText() {
  const { grand } = calculateTotals();
  const movieTitle = isBundling ? (session.movieTitle || 'Film Bioskop') : 'Pemesanan Kantin F&B';
  const cinemaName = isBundling ? (session.cinemaName || 'LayarTix Cinema') : 'Kantin Bioskop';
  const seats = (session.selectedSeats && session.selectedSeats.length) ? session.selectedSeats.join(', ') : '';
  const date = session.date || 'Hari Ini';
  const time = session.time || '19:00';
  const tz = (typeof LT !== 'undefined' && typeof LT.getCityTimeZone === 'function') ? LT.getCityTimeZone(session.city || 'Makassar') : 'WITA';

  const textToCopy = 
    `TAGIHAN PEMBAYARAN LAYARTIX\n` +
    `Item: ${movieTitle}\n` +
    `Lokasi: ${cinemaName}\n` +
    (isBundling ? `Jadwal: ${date} ${time} ${tz} (Kursi: ${seats})\n` : '') +
    `Total: ${LT.formatRp(grand)}\n` +
    `Batas waktu: 10 Menit dari sekarang`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      LT.toast('Rincian tagihan berhasil disalin ke papan klip!', 'success', 3000);
    }).catch(() => fallbackCopyCheckoutText(textToCopy));
  } else {
    fallbackCopyCheckoutText(textToCopy);
  }
}

function fallbackCopyCheckoutText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  LT.toast('Rincian tagihan berhasil disalin ke papan klip!', 'success', 3000);
}

// Unduh Gambar QR Pembayaran PNG
function downloadCheckoutQrPng() {
  const qrBox = document.getElementById('checkoutShareQrDisplay');
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
    a.download = `QRIS-Tagihan-LayarTix-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    LT.toast('QR Code tagihan berhasil diunduh!', 'success', 3000);
  } else {
    LT.toast('Gagal mengunduh gambar QR. Silakan gunakan tangkapan layar.', 'warning', 3000);
  }
}
