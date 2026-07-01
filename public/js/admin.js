const API_URL = '/api';

let allBookings = [];
let allPackages = [];
let allFreelancers = [];
let allClients = [];

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-settings') {
        switchSettingsTab('profile');
    }
}

// --- SECTION 1: BOOKINGS & STATE MACHINE ---
let currentClientStatusTab = 'running';

function setClientStatusTab(tab) {
    currentClientStatusTab = tab;
    document.querySelectorAll('#subtab-running, #subtab-selesai, #subtab-batal').forEach(btn => {
        btn.className = "flex-1 px-4 py-2.5 rounded-lg text-xs font-bold transition hover:bg-white/50 text-slate-500";
    });
    const activeBtn = document.getElementById('subtab-' + tab);
    activeBtn.className = "flex-1 px-4 py-2.5 rounded-lg text-xs font-bold transition bg-white shadow-sm text-slate-900";

    // Show/hide filter project status appropriately
    const filterProjectSelect = document.getElementById('filter-project');
    const finFilterContainer = document.getElementById('financial-filter-container');

    if (tab === 'running') {
        filterProjectSelect.classList.add('hidden'); // Always hidden as requested
        // Only show running statuses
        Array.from(filterProjectSelect.options).forEach(opt => {
            if (opt.value === 'Selesai' || opt.value === 'Ditutup' || opt.value === 'Pemberhentian Sepihak') {
                opt.style.display = 'none';
            } else {
                opt.style.display = 'block';
            }
        });
        if (['Selesai', 'Ditutup', 'Pemberhentian Sepihak'].includes(filterProjectSelect.value)) {
            filterProjectSelect.value = '';
        }

        // Show horizontal financial filter tabs
        if (finFilterContainer) finFilterContainer.classList.remove('hidden');
    } else {
        filterProjectSelect.classList.add('hidden');
        filterProjectSelect.value = '';

        // Hide horizontal financial filter tabs
        if (finFilterContainer) {
            finFilterContainer.classList.add('hidden');
        }

        // Reset financial payment filter value
        document.getElementById('filter-payment').value = '';

        // Reset horizontal tab active state styling (active = first button)
        document.querySelectorAll('.payment-filter-btn').forEach((b, idx) => {
            if (idx === 0) {
                b.className = "payment-filter-btn flex-1 min-w-[90px] px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition bg-white shadow-sm text-slate-900";
            } else {
                b.className = "payment-filter-btn flex-1 min-w-[90px] px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition text-slate-500 hover:bg-white/50";
            }
        });
    }

    renderBookings();
}

function setPaymentFilter(val, btn) {
    document.getElementById('filter-payment').value = val;

    // Toggle active classes on buttons
    document.querySelectorAll('.payment-filter-btn').forEach(b => {
        b.className = "payment-filter-btn flex-1 min-w-[90px] px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition text-slate-500 hover:bg-white/50";
    });

    btn.className = "payment-filter-btn flex-1 min-w-[90px] px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition bg-white shadow-sm text-slate-900";

    loadBookings();
}

async function loadBookings() {
    try {
        const res = await fetch(`${API_URL}/bookings`);
        if (!res.ok) throw new Error('Gagal memuat booking');
        allBookings = await res.json();
        renderBookings();
        populateBookingSelectForPortfolio();
    } catch (err) {
        console.error(err);
        alert(err.message);
    }
}

function populateBookingSelectForPortfolio() {
    const select = document.getElementById('client-booking-id');
    select.innerHTML = '<option value="">Pilih Booking Klien</option>';
    allBookings.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.innerText = `${b.client_name} (${formatDate(b.event_date)}) — ${b.project_status}`;
        select.appendChild(opt);
    });
}

function renderBookings() {
    const tbody = document.getElementById('bookings-table-body');
    tbody.innerHTML = '';

    const filterPay = document.getElementById('filter-payment').value;
    const filterProj = document.getElementById('filter-project').value;

    let filtered = allBookings.filter(b => {
        // Apply main sub-tab filtering
        if (currentClientStatusTab === 'running') {
            if (b.project_status === 'Selesai' || b.project_status === 'Ditutup' || b.project_status === 'Pemberhentian Sepihak') {
                return false;
            }
        } else if (currentClientStatusTab === 'selesai') {
            if (b.project_status !== 'Selesai' || b.payment_status === 'DP Hangus') {
                return false; // Show only completed, excluding cancelled (DP Hangus)
            }
        } else if (currentClientStatusTab === 'batal') {
            if (b.project_status !== 'Ditutup' && b.project_status !== 'Pemberhentian Sepihak' && !(b.project_status === 'Selesai' && b.payment_status === 'DP Hangus')) {
                return false;
            }
        }

        // Apply explicit dropdown filters
        if (filterPay && b.payment_status !== filterPay) return false;
        if (filterProj && b.project_status !== filterProj) return false;
        return true;
    });

    filtered.sort((a, b) => {
        if (a.project_status === 'Selesai' && b.project_status !== 'Selesai') return 1;
        if (a.project_status !== 'Selesai' && b.project_status === 'Selesai') return -1;
        return new Date(a.event_date) - new Date(b.event_date);
    });

    document.getElementById('booking-count-lbl').innerText = `Daftar Transaksi (${filtered.length})`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Tidak ada data booking dengan filter ini.</td></tr>';
        return;
    }

    filtered.forEach(b => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100 transition";

        // Payment Status Styling
        let payBadge = '';
        if (b.payment_status === 'Menunggu DP') payBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">Menunggu DP</span>';
        else if (b.payment_status === 'Menunggu Pelunasan') payBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">Menunggu Lunas</span>';
        else if (b.payment_status === 'Lunas') payBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Lunas</span>';
        else if (b.payment_status === 'DP Hangus') payBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">DP Hangus</span>';

        // Project Status Styling
        let projBadge = '';
        if (b.payment_status === 'Menunggu DP') {
            projBadge = `
                        <select disabled class="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed focus:outline-none transition">
                            <option value="Pending" selected>Pending</option>
                        </select>
                    `;
        } else {
            const statusOptions = [
                { value: 'On Progress', label: 'On Progress', color: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' },
                { value: 'Post-Prod: Editing', label: 'Editing', color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
                { value: 'Post-Prod: Review', label: 'Review', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                { value: 'Post-Prod: Cetak Album', label: 'Cetak Album', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
                { value: 'Selesai', label: 'Selesai', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' }
            ];
            if (b.project_status === 'Ditutup') {
                statusOptions.push({ value: 'Ditutup', label: 'Ditutup', color: 'bg-slate-100 text-slate-700' });
            } else if (b.project_status === 'Pemberhentian Sepihak') {
                statusOptions.push({ value: 'Pemberhentian Sepihak', label: 'Batal (Sepihak)', color: 'bg-red-50 text-red-700' });
            }

            const currentOpt = statusOptions.find(o => o.value === b.project_status) || statusOptions[0];
            const currentBadgeColor = currentOpt.color.split(' ').slice(0, 2).join(' ');
            projBadge = `
                        <select onchange="updateProjectStatus(${b.id}, this.value)" class="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer transition ${currentBadgeColor}">
                            ${statusOptions.map(o => {
                const needsLunas = (o.value === 'Post-Prod: Cetak Album' || o.value === 'Selesai') && b.payment_status !== 'Lunas';
                return `<option value="${o.value}" ${b.project_status === o.value ? 'selected' : ''} ${needsLunas ? 'disabled title="Verifikasi pelunasan terlebih dahulu"' : ''}>${o.label}${needsLunas ? ' 🔒' : ''}</option>`;
            }).join('')}
                        </select>
                    `;
        }

        // Action Column Logic (Modul 4 - A)
        let actionBtns = `<button onclick="openBookingDetailModal(${b.id})" class="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold hover:bg-indigo-100 transition text-[10px] uppercase tracking-wider">Preview</button>`;

        if (b.project_status === 'Selesai') {
            actionBtns += `<button onclick="openInvoiceModal(${b.id})" class="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 transition text-[10px] uppercase tracking-wider ml-1">Detail Faktur</button>`;
        }


        // Crew listing details - manual assignment by admin
        let crewList = '';
        const assignedFg = b.freelancers ? b.freelancers.filter(f => f.role === 'FG').length : 0;
        const assignedVg = b.freelancers ? b.freelancers.filter(f => f.role === 'VG').length : 0;
        const reqFg = b.required_fg || 0;
        const reqVg = b.required_vg || 0;
        const isCrewComplete = (assignedFg >= reqFg) && (assignedVg >= reqVg);
        const totalAssigned = (b.freelancers ? b.freelancers.length : 0);

        if (totalAssigned > 0) {
            const btnClass = isCrewComplete
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100';
            const dotClass = isCrewComplete ? 'bg-emerald-500' : 'bg-rose-500';

            crewList = `<button onclick="openCrewModal(${b.id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${btnClass} transition">
                        <span class="h-1.5 w-1.5 rounded-full ${dotClass}"></span>
                        ${totalAssigned} Kru Ditugaskan
                    </button>`;
        } else if (b.project_status !== 'Ditutup' && b.project_status !== 'Selesai' && b.payment_status !== 'Menunggu DP') {
            // Check if there are any active freelancers at all
            const hasActiveCrew = allFreelancers.some(f => f.status === 'Aktif');
            if (hasActiveCrew) {
                const btnClass = isCrewComplete
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100';
                const dotClass = isCrewComplete ? 'bg-emerald-500' : 'bg-rose-500';
                const labelText = isCrewComplete ? 'Kru Terpenuhi' : 'Pilih Kru (Belum Ada)';

                crewList = `<button onclick="openCrewModal(${b.id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${btnClass} transition">
                            <span class="h-1.5 w-1.5 rounded-full ${dotClass} animate-pulse"></span>
                            ${labelText}
                        </button>`;
            } else {
                crewList = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-500 border border-red-200">
                            <span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>
                            Kru Belum Tersedia
                        </span>`;
            }
        } else if (b.payment_status === 'Menunggu DP') {
            crewList = `<span class="text-[10px] text-slate-400 font-medium">Menunggu DP diverifikasi</span>`;
        } else {
            crewList = `<span class="text-slate-400 text-[10px]">—</span>`;
        }

        tr.innerHTML = `
                    <td class="p-4 align-middle whitespace-nowrap">
                        <div class="font-semibold text-slate-900 truncate max-w-[130px]" title="${escapeHtml(b.client_name)}">${escapeHtml(b.client_name)}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5 whitespace-nowrap flex items-center gap-1">
                            ${formatDate(b.event_date)}
                            <button onclick="editEventDate(${b.id}, '${b.event_date}')" class="text-slate-400 hover:text-indigo-600 transition" title="Ubah Jadwal">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                        </div>
                    </td>
                    <td class="p-4 align-middle whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span class="font-medium truncate max-w-[110px] text-slate-800" title="${escapeHtml(b.package_name)}">${escapeHtml(b.package_name)}</span>
                            <button onclick="openChangePackageModal(${b.id}, ${b.package_id}, ${b.total_deal_price})" class="text-slate-400 hover:text-indigo-600 transition animate-pulse" title="Ubah Paket">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                        </div>
                        <div class="text-[10px] font-bold text-slate-500 whitespace-nowrap mt-0.5">Deal: Rp ${b.total_deal_price.toLocaleString('id-ID')}</div>
                    </td>
                    <td class="p-4 align-middle whitespace-nowrap">${payBadge}</td>
                    <td class="p-4 align-middle whitespace-nowrap">${crewList}</td>
                    <td class="p-4 align-middle whitespace-nowrap">${projBadge}</td>
                    <td class="p-4 align-middle text-right whitespace-nowrap">
                        <div class="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <div class="inline-flex items-center gap-1 flex-shrink-0 whitespace-nowrap">${actionBtns}</div>
                        </div>
                    </td>
                `;
        tbody.appendChild(tr);
    });
}

function toggleStatusPopup(bookingId) {
    const popup = document.getElementById(`status-popup-${bookingId}`);
    const isHidden = popup.classList.contains('hidden');
    // Close all other popups first
    document.querySelectorAll('[id^="status-popup-"]').forEach(el => el.classList.add('hidden'));
    if (isHidden) popup.classList.remove('hidden');
}

// Close popups when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="status-popup-"]') && !e.target.closest('[id^="status-btn-"]')) {
        document.querySelectorAll('[id^="status-popup-"]').forEach(el => el.classList.add('hidden'));
    }
});

async function updateProjectStatus(bookingId, status) {
    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/update-project-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_status: status })
        });
        if (!res.ok) throw new Error('Gagal update status proyek');
        alert('Status Proyek berhasil diperbarui!');
        loadBookings();
        if (typeof loadWaLogs === 'function') loadWaLogs();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

let currentCancelBookingId = null;

async function cancelBooking(bookingId) {
    const b = allBookings.find(bk => bk.id === bookingId);
    if (!b) return;

    currentCancelBookingId = bookingId;
    document.getElementById('cancel-client-name').innerText = b.client_name || '-';
    document.getElementById('cancel-event-date').innerText = formatDate(b.event_date);
    document.getElementById('cancel-booking-reason').value = '';

    const tbody = document.getElementById('cancel-crew-list');
    tbody.innerHTML = '';

    if (b.freelancers && b.freelancers.length > 0) {
        b.freelancers.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-100';
            tr.innerHTML = `
                        <td class="p-3 font-semibold text-slate-800">${escapeHtml(f.name)}</td>
                        <td class="p-3 text-slate-600">${escapeHtml(f.role || '-')}</td>
                        <td class="p-3 text-right font-medium text-slate-500">Rp ${(f.fee_per_project || 0).toLocaleString('id-ID')}</td>
                        <td class="p-3 text-right">
                            <input type="number" min="0" value="0" data-id="${f.id}" 
                                class="cancel-comp-input w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right focus:outline-none focus:border-indigo-600"
                                oninput="calculateCancelCompensation()">
                        </td>
                    `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Tidak ada kru lapangan yang ditugaskan pada proyek ini.</td></tr>`;
    }

    calculateCancelCompensation();
    document.getElementById('cancel-booking-modal').classList.remove('hidden');
}

function calculateCancelCompensation() {
    const b = allBookings.find(bk => bk.id === currentCancelBookingId);
    if (!b) return;

    const dpAmt = b.dp_paid_amount || 0;
    let compTotal = 0;

    const inputs = document.querySelectorAll('.cancel-comp-input');
    inputs.forEach(input => {
        compTotal += parseFloat(input.value) || 0;
    });

    const profit = dpAmt - compTotal;

    document.getElementById('cancel-dp-display').innerText = `Rp ${dpAmt.toLocaleString('id-ID')}`;
    document.getElementById('cancel-comp-total-display').innerText = `Rp ${compTotal.toLocaleString('id-ID')}`;

    const profitEl = document.getElementById('cancel-profit-display');
    profitEl.innerText = `Rp ${Math.max(0, profit).toLocaleString('id-ID')}`;

    const warningEl = document.getElementById('cancel-warning-message');
    if (profit < 0) {
        warningEl.innerText = 'Peringatan: Total kompensasi melebihi DP masuk!';
        warningEl.classList.remove('hidden');
        profitEl.className = 'text-red-600 font-extrabold text-sm';
    } else {
        warningEl.classList.add('hidden');
        profitEl.className = 'text-slate-900 font-extrabold text-sm';
    }
}

async function submitCancelBooking() {
    if (!currentCancelBookingId) return;

    const cancelReason = document.getElementById('cancel-booking-reason').value.trim();
    if (!cancelReason) {
        alert('Alasan pembatalan wajib diisi.');
        return;
    }

    const compensation = [];
    const inputs = document.querySelectorAll('.cancel-comp-input');
    inputs.forEach(input => {
        const freelancerId = parseInt(input.getAttribute('data-id'));
        const amount = parseFloat(input.value) || 0;
        compensation.push({ freelancer_id: freelancerId, amount: amount });
    });

    if (!confirm('Apakah Anda yakin ingin membatalkan proyek ini dan memproses kompensasi yang ditentukan? Tindakan ini tidak dapat dibatalkan.')) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/bookings/${currentCancelBookingId}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cancel_reason: cancelReason,
                compensation: compensation
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Gagal memproses pembatalan');
        }

        const result = await res.json();
        alert(`Proyek berhasil dibatalkan.\nDP: Rp ${result.dp_amount.toLocaleString('id-ID')}\nTotal Kompensasi: Rp ${result.compensation_total.toLocaleString('id-ID')}\nProfit Bersih: Rp ${result.profit_total.toLocaleString('id-ID')}`);

        closeCancelBookingModal();
        loadBookings();
        if (typeof loadWaLogs === 'function') loadWaLogs();
        if (typeof loadDisbursements === 'function') {
            loadDisbursements();
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function closeCancelBookingModal() {
    document.getElementById('cancel-booking-modal').classList.add('hidden');
    currentCancelBookingId = null;
}

let currentInvoiceBookingId = null;

function openClientInvoiceModal(bookingId) {
    currentInvoiceBookingId = bookingId;
    const b = allBookings.find(bk => bk.id === bookingId);
    if (!b) return;

    const dateClean = b.event_date.replace(/-/g, '');
    const invoiceNum = `INV-${dateClean}-${b.id}`;
    document.getElementById('print-invoice-num').innerText = invoiceNum;

    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1;
    let dd = today.getDate();
    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;
    document.getElementById('print-invoice-date').innerText = `Tanggal: ${dd}-${mm}-${yyyy}`;

    document.getElementById('print-client-name').innerText = b.client_name || '-';
    document.getElementById('print-client-phone').innerText = b.client_phone ? `Phone: ${b.client_phone}` : 'Phone: -';
    document.getElementById('print-event-date').innerText = `Tanggal Acara: ${formatDate(b.event_date)}`;
    document.getElementById('print-event-location').innerText = `Lokasi: ${b.location || '-'}`;

    const tbody = document.getElementById('print-invoice-items');
    tbody.innerHTML = '';

    const baseTr = document.createElement('tr');
    baseTr.className = 'border-b border-slate-100';
    baseTr.innerHTML = `
                <td class="py-2.5 font-semibold text-slate-900">${escapeHtml(b.package_name)}</td>
                <td class="py-2.5 text-right">Rp ${(b.base_price || 0).toLocaleString('id-ID')}</td>
                <td class="py-2.5 text-center">1</td>
                <td class="py-2.5 text-right font-semibold">Rp ${(b.base_price || 0).toLocaleString('id-ID')}</td>
            `;
    tbody.appendChild(baseTr);

    if (b.additional_services && b.additional_services.length > 0) {
        b.additional_services.forEach(ads => {
            const adsTr = document.createElement('tr');
            adsTr.className = 'border-b border-slate-100';
            const qty = ads.quantity || 1;
            const price = ads.price || 0;
            const sub = qty * price;
            adsTr.innerHTML = `
                        <td class="py-2.5 text-slate-600">${escapeHtml(ads.name)} <span class="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded font-mono">${escapeHtml(ads.category)}</span></td>
                        <td class="py-2.5 text-right text-slate-600">Rp ${price.toLocaleString('id-ID')}</td>
                        <td class="py-2.5 text-center text-slate-600">${qty}</td>
                        <td class="py-2.5 text-right text-slate-600 font-semibold">Rp ${sub.toLocaleString('id-ID')}</td>
                    `;
            tbody.appendChild(adsTr);
        });
    }

    const totalDeal = b.total_deal_price || 0;
    const dpPaid = b.dp_paid_amount || 0;
    const finalPaid = b.final_paid_amount || 0;
    const sisa = b.payment_status === 'Lunas' ? 0 : Math.max(0, totalDeal - dpPaid - finalPaid);

    document.getElementById('print-total-deal').innerText = `Rp ${totalDeal.toLocaleString('id-ID')}`;
    document.getElementById('print-dp-paid').innerText = `- Rp ${dpPaid.toLocaleString('id-ID')}`;

    const pelunasanRow = document.getElementById('print-pelunasan-row');
    if (finalPaid > 0 || b.payment_status === 'Lunas') {
        pelunasanRow.classList.remove('hidden');
        document.getElementById('print-pelunasan-paid').innerText = `- Rp ${finalPaid.toLocaleString('id-ID')}`;
    } else {
        pelunasanRow.classList.add('hidden');
    }

    const statusLabel = document.getElementById('print-status-label');
    const sisaEl = document.getElementById('print-sisa-pelunasan');
    if (b.payment_status === 'Lunas') {
        statusLabel.innerText = 'Status Pembayaran';
        sisaEl.innerText = 'LUNAS ✓';
        sisaEl.className = 'text-emerald-600 text-base font-black';
    } else {
        statusLabel.innerText = 'Sisa Pelunasan';
        sisaEl.innerText = `Rp ${sisa.toLocaleString('id-ID')}`;
        sisaEl.className = 'text-indigo-600 text-base font-black';
    }

    const specReqContainer = document.getElementById('print-special-requests-container');
    if (b.special_requests) {
        document.getElementById('print-special-requests-val').innerText = b.special_requests;
        specReqContainer.classList.remove('hidden');
    } else {
        specReqContainer.classList.add('hidden');
    }

    document.getElementById('client-invoice-modal').classList.remove('hidden');
}

function closeClientInvoiceModal() {
    document.getElementById('client-invoice-modal').classList.add('hidden');
    currentInvoiceBookingId = null;
}

async function sendInvoiceWa() {
    if (!currentInvoiceBookingId) return;
    const bookingId = currentInvoiceBookingId;
    const b = allBookings.find(bk => bk.id === bookingId);
    if (!b) return;

    try {
        // Get wa.me link from backend (phone normalized + message pre-filled)
        const res = await fetch(`/api/bookings/${bookingId}/send-invoice-wa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal membuka WhatsApp');

        if (data.waLink) {
            window.open(data.waLink, '_blank');
        } else {
            throw new Error('Nomor WhatsApp klien tidak tersedia.');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function openBookingDetailModal(bookingId) {
    const b = allBookings.find(bk => bk.id === bookingId);
    if (!b) {
        try {
            const res = await fetch('/api/bookings');
            const data = await res.json();
            const bk = data.find(item => item.id === bookingId);
            if (bk) {
                await populateAndShowDetailModal(bk);
            } else {
                alert("Detail booking tidak ditemukan.");
            }
        } catch (err) {
            alert("Gagal mengambil data booking: " + err.message);
        }
        return;
    }
    await populateAndShowDetailModal(b);
}

async function populateAndShowDetailModal(b) {
    document.getElementById('detail-client-name').innerText = b.client_name || '-';
    document.getElementById('detail-client-phone').innerText = b.client_phone || '-';
    document.getElementById('detail-event-date').innerText = formatDate(b.event_date) || '-';
    document.getElementById('detail-location').innerText = b.location || '-';

    // Package Details
    document.getElementById('detail-package-name').innerText = b.package_name || '-';
    document.getElementById('detail-deal-price').innerText = `Rp ${(b.total_deal_price || 0).toLocaleString('id-ID')}`;
    document.getElementById('detail-base-price').innerText = `Rp ${(b.base_price || 0).toLocaleString('id-ID')}`;

    // Special Requests
    let specialReqVal = b.special_requests || '';
    try {
        const parsed = JSON.parse(specialReqVal);
        if (typeof parsed === 'string') {
            specialReqVal = parsed;
        } else if (Array.isArray(parsed)) {
            specialReqVal = parsed.join(', ');
        } else if (typeof parsed === 'object' && parsed !== null) {
            specialReqVal = JSON.stringify(parsed);
        }
    } catch (e) {
        // Keep as is
    }

    const cleanReqText = (specialReqVal || '').trim();
    if (cleanReqText) {
        document.getElementById('detail-special-requests').innerText = cleanReqText;
        document.getElementById('detail-special-requests-container').classList.remove('hidden');
    } else {
        document.getElementById('detail-special-requests').innerText = 'Tidak ada catatan khusus.';
        document.getElementById('detail-special-requests-container').classList.remove('hidden');
    }

    // Fetch booking sessions
    let bookingSessions = [];
    try {
        const sRes = await fetch(`${API_URL}/bookings/${b.id}/sessions`);
        const sData = await sRes.json();
        bookingSessions = sData.data || [];
    } catch (e) {
        console.error('Error fetching booking sessions:', e);
    }

    // Crew assignments
    const crewContainer = document.getElementById('detail-crew-list');
    crewContainer.innerHTML = '';
    let totalCrewExpenditure = 0;

    if (b.freelancers && b.freelancers.length > 0) {
        b.freelancers.forEach(f => {
            const assignedSessions = f.assigned_sessions !== null
                ? JSON.parse(f.assigned_sessions || '[]')
                : bookingSessions.map(s => s.session_id);

            // Calculate total fee for this freelancer based on checked sessions
            let freelancerTotalFee = 0;
            const assignedSessionItems = [];

            bookingSessions.forEach(s => {
                const isChecked = assignedSessions.includes(s.session_id);
                if (isChecked) {
                    const feeObj = (f.fees || []).find(ff => ff.session_id === s.session_id);
                    const feeAmount = feeObj ? feeObj.fee_amount : (f.fee_per_project > 0 ? f.fee_per_project : 200000);
                    freelancerTotalFee += feeAmount;
                    assignedSessionItems.push({
                        name: s.session_name,
                        fee: feeAmount
                    });
                }
            });

            const sessionRowsHtml = assignedSessionItems.length > 0
                ? assignedSessionItems.map(item => `
                    <div class="flex justify-between items-center p-2.5 rounded-lg bg-white border border-slate-200/60 text-slate-700">
                        <span class="font-semibold text-[11px]">${escapeHtml(item.name)}</span>
                        <span class="font-bold text-indigo-600 text-[11px]">Rp ${item.fee.toLocaleString('id-ID')}</span>
                    </div>
                `).join('')
                : '<p class="text-[10px] text-slate-400 italic col-span-2">Tidak ada sesi yang diikuti.</p>';

            totalCrewExpenditure += freelancerTotalFee;

            const li = document.createElement('li');
            li.className = 'bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-xs flex flex-col w-full';
            li.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-bold text-sm text-slate-800">${escapeHtml(f.name)}</span>
                        <span class="text-[10px] text-slate-400 block">${escapeHtml(f.role)} — Fee Proyek Fallback: Rp ${(f.fee_per_project || 0).toLocaleString('id-ID')}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${escapeHtml(f.status)}</span>
                        <span class="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-extrabold text-[10px]">Total Sesi: Rp ${freelancerTotalFee.toLocaleString('id-ID')}</span>
                    </div>
                </div>
                
                ${bookingSessions.length > 0 ? `
                    <div class="space-y-1.5 pt-2 border-t border-slate-200/60">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sesi & Fee</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            ${sessionRowsHtml}
                        </div>
                    </div>
                ` : '<p class="text-[10px] text-slate-400 italic">Belum ada detail sesi untuk booking ini.</p>'}
            `;
            crewContainer.appendChild(li);
        });

        // Display total crew expenditure at the bottom of the crew section
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'flex justify-between items-center bg-indigo-50 border border-indigo-100 rounded-xl p-3 mt-3 text-xs font-bold text-indigo-900 w-full';
        summaryDiv.innerHTML = `
            <span>Total Pengeluaran Kru (Fee Freelance):</span>
            <span class="font-black text-sm text-indigo-700">Rp ${totalCrewExpenditure.toLocaleString('id-ID')}</span>
        `;
        crewContainer.appendChild(summaryDiv);

    } else {
        crewContainer.innerHTML = '<li class="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border border-slate-100 text-center w-full">Belum ada kru yang ditugaskan.</li>';
    }

    // Add-ons / Additional Services
    const addonsTbody = document.getElementById('detail-addons-list');
    addonsTbody.innerHTML = '';
    if (b.additional_services && b.additional_services.length > 0) {
        document.getElementById('detail-addons-container').classList.remove('hidden');
        b.additional_services.forEach(ads => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-50 text-xs';
            const qty = ads.quantity || 1;
            const price = ads.price || 0;
            const subtotal = price * qty;
            tr.innerHTML = `
                        <td class="py-2.5 text-slate-800 font-medium">${escapeHtml(ads.name)} <span class="text-[10px] text-slate-400">(${escapeHtml(ads.category)})</span></td>
                        <td class="py-2.5 text-center text-slate-600">x${qty}</td>
                        <td class="py-2.5 text-right text-slate-700">Rp ${price.toLocaleString('id-ID')}</td>
                        <td class="py-2.5 text-right font-bold text-slate-900">Rp ${subtotal.toLocaleString('id-ID')}</td>
                    `;
            addonsTbody.appendChild(tr);
        });
    } else {
        document.getElementById('detail-addons-container').classList.add('hidden');
    }

    // Payment breakdown
    let payBadge = '';
    if (b.payment_status === 'Menunggu DP') payBadge = '<span class="px-2.5 py-1 rounded text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">Menunggu DP</span>';
    else if (b.payment_status === 'Menunggu Pelunasan') payBadge = '<span class="px-2.5 py-1 rounded text-xs font-bold bg-purple-50 text-purple-600 border border-purple-200">Menunggu Lunas</span>';
    else if (b.payment_status === 'Lunas') payBadge = '<span class="px-2.5 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Lunas</span>';
    else if (b.payment_status === 'DP Hangus') payBadge = '<span class="px-2.5 py-1 rounded text-xs font-bold bg-red-50 text-red-600 border border-red-200">DP Hangus</span>';

    document.getElementById('detail-pay-status-badge').innerHTML = payBadge;

    const totalDeal = b.total_deal_price || 0;
    const dpPaid = b.dp_paid_amount || 0;
    const finalPaid = b.final_paid_amount || 0;
    const discAmt = b.discount_amount || 0;
    const remaining = b.payment_status === 'Lunas' ? 0 : Math.max(0, totalDeal - dpPaid - finalPaid);

    document.getElementById('detail-total-deal').innerText = `Rp ${totalDeal.toLocaleString('id-ID')}`;
    document.getElementById('detail-dp-paid').innerText = `Rp ${dpPaid.toLocaleString('id-ID')}`;

    const finalPaidRow = document.getElementById('detail-final-paid-row');
    if (finalPaid > 0 || b.payment_status === 'Lunas') {
        finalPaidRow.classList.remove('hidden');
        document.getElementById('detail-final-paid').innerText = `Rp ${finalPaid.toLocaleString('id-ID')}`;
    } else {
        finalPaidRow.classList.add('hidden');
    }

    const discountRow = document.getElementById('detail-discount-row');
    if (discAmt > 0) {
        discountRow.classList.remove('hidden');
        document.getElementById('detail-discount').innerText = `Rp ${discAmt.toLocaleString('id-ID')}`;
    } else {
        discountRow.classList.add('hidden');
    }

    const remainingEl = document.getElementById('detail-remaining-balance');
    if (b.payment_status === 'Lunas') {
        remainingEl.innerText = 'LUNAS ✓';
        remainingEl.className = 'text-emerald-600 text-base font-black';
    } else {
        remainingEl.innerText = `Rp ${remaining.toLocaleString('id-ID')}`;
        remainingEl.className = 'text-indigo-600 text-base font-black';
    }

    // Populate Rincian Pengeluaran & Profit
    const expContainer = document.getElementById('detail-expenses-container');
    if (b.freelancers && b.freelancers.length > 0) {
        if (expContainer) expContainer.classList.remove('hidden');

        let totalPackageProductsCost = 0;
        let packageCostBreakdownHtml = '';

        if (b.package_description) {
            try {
                const services = JSON.parse(b.package_description);
                if (Array.isArray(services)) {
                    services.forEach(s => {
                        const qty = s.qty || 1;
                        const basePrice = s.price || 0;
                        const itemCost = basePrice * qty;
                        totalPackageProductsCost += itemCost;
                        packageCostBreakdownHtml += `
                            <div class="flex justify-between items-center text-slate-600 pl-3 border-l-2 border-rose-300">
                                <span>${escapeHtml(s.name)} (x${qty})</span>
                                <span class="font-semibold text-slate-800">Rp ${itemCost.toLocaleString('id-ID')}</span>
                            </div>
                        `;
                    });
                }
            } catch (e) {
                console.error('Error parsing package_description:', e);
            }
        }

        const logistics = b.operational_cost || 0;
        const totalExp = totalPackageProductsCost + logistics + totalCrewExpenditure;
        const profit = totalDeal - totalExp;

        const listContainer = document.getElementById('detail-package-costs-list');
        if (listContainer) {
            listContainer.innerHTML = packageCostBreakdownHtml || `
                <div class="flex justify-between items-center text-slate-400">
                    <span>Produk & Layanan Paket</span>
                    <span>Rp 0</span>
                </div>
            `;
        }

        const elLogistics = document.getElementById('detail-exp-logistics');
        const elStaff = document.getElementById('detail-exp-staff');
        const elTotal = document.getElementById('detail-exp-total');
        const elProfit = document.getElementById('detail-exp-profit');

        if (elLogistics) elLogistics.innerText = `Rp ${logistics.toLocaleString('id-ID')}`;
        if (elStaff) elStaff.innerText = `Rp ${totalCrewExpenditure.toLocaleString('id-ID')}`;
        if (elTotal) elTotal.innerText = `Rp ${totalExp.toLocaleString('id-ID')}`;
        if (elProfit) elProfit.innerText = `Rp ${profit.toLocaleString('id-ID')}`;
    } else {
        if (expContainer) expContainer.classList.add('hidden');
    }

    // Detail Lokasi Acara
    const locationContainer = document.getElementById('detail-location-container');
    const locationText = b.location ? escapeHtml(b.location.trim()) : '';

    let waPhone = b.client_phone ? b.client_phone.replace(/\\D/g, '') : '';
    if (waPhone.startsWith('0')) waPhone = '62' + waPhone.slice(1);

    const waMsg = encodeURIComponent(`Halo ${b.client_name}, kami dari tim admin Sorehari. Boleh minta tolong dikirimkan *titik lokasi (Share Location Google Maps)* untuk acara nanti agar kru kami bisa sampai dengan akurat?\n\n(Jika ada beberapa lokasi berbeda untuk tiap sesi acara, mohon dikirimkan titik lokasinya masing-masing ya Kak 🙏)`);
    const waLink = `https://wa.me/${waPhone}?text=${waMsg}`;

    const waBtnHtml = `
                    <a href="${waLink}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-lg text-[10px] font-bold hover:bg-emerald-600 transition shadow-sm w-fit">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        Tanya Lokasi Rinci via WA
                    </a>
                `;

    if (locationText && locationText.toLowerCase() !== 'belum diisi') {
        locationContainer.innerHTML = `
                        <div class="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-3">
                            <p class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">${locationText}</p>
                            ${waBtnHtml}
                        </div>
                    `;
    } else {
        locationContainer.innerHTML = `
                        <div class="p-4 bg-orange-50 border border-orange-100 rounded-xl text-center flex flex-col items-center gap-3">
                            <p class="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Alamat Rinci Belum Ada</p>
                            ${waBtnHtml}
                        </div>
                    `;
    }

    document.getElementById('booking-detail-modal').classList.remove('hidden');
}

async function updateCrewSessionAssignment(checkbox) {
    const bookingId = checkbox.dataset.bookingId;
    const freelancerId = checkbox.dataset.freelancerId;

    const siblingCbs = document.querySelectorAll(`input.crew-session-cb[data-booking-id="${bookingId}"][data-freelancer-id="${freelancerId}"]`);
    const checkedSessionIds = [];
    siblingCbs.forEach(cb => {
        if (cb.checked) {
            checkedSessionIds.push(parseInt(cb.dataset.sessionId));
        }
    });

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/freelancers/${freelancerId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: checkedSessionIds })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Gagal menyimpan penugasan sesi');
        }

        // Reload bookings and refresh modal
        await loadBookings();
        const updatedBooking = allBookings.find(bk => bk.id == bookingId);
        if (updatedBooking) {
            await populateAndShowDetailModal(updatedBooking);
        }
        if (typeof loadDisbursements === 'function') loadDisbursements();
    } catch (err) {
        alert('Error: ' + err.message);
        checkbox.checked = !checkbox.checked;
    }
}

function closeBookingDetailModal() {
    document.getElementById('booking-detail-modal').classList.add('hidden');
}

function printInvoice() {
    window.print();
}

async function editEventDate(bookingId, currentDate) {
    const newDate = prompt('Masukkan tanggal acara yang baru (Format: YYYY-MM-DD)', currentDate);
    if (!newDate) return;

    // Simple validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('Format tanggal salah! Gunakan YYYY-MM-DD.');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/update-event-date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_date: newDate })
        });
        if (!res.ok) throw new Error('Gagal merubah jadwal acara');
        alert('Jadwal acara berhasil diperbarui!');
        loadBookings();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// --- PACKAGE EDIT SYSTEM ---
function openChangePackageModal(bookingId, currentPackageId, currentDealPrice) {
    document.getElementById('edit-pkg-booking-id').value = bookingId;
    document.getElementById('edit-pkg-price').value = currentDealPrice;

    const select = document.getElementById('edit-pkg-select');
    select.innerHTML = '';

    allPackages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.price = p.price;
        opt.innerText = `${p.package_name} (Rp ${p.price.toLocaleString('id-ID')})`;
        if (p.id == currentPackageId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    document.getElementById('change-package-modal').classList.remove('hidden');
}

function closeChangePackageModal() {
    document.getElementById('change-package-modal').classList.add('hidden');
}

function onPackageSelectChange() {
    const select = document.getElementById('edit-pkg-select');
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt) {
        const price = selectedOpt.dataset.price;
        document.getElementById('edit-pkg-price').value = price;
    }
}

async function saveBookingPackage() {
    const bookingId = document.getElementById('edit-pkg-booking-id').value;
    const packageId = document.getElementById('edit-pkg-select').value;
    const dealPrice = document.getElementById('edit-pkg-price').value;

    if (!packageId || !dealPrice) {
        alert('Pilih paket dan masukkan harga deal!');
        return;
    }

    try {
        const res = await fetch(`/api/bookings/${bookingId}/update-package`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                package_id: packageId,
                total_deal_price: parseFloat(dealPrice)
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal mengubah paket booking');
        }

        alert('Paket booking berhasil diperbarui!');
        closeChangePackageModal();
        loadBookings();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// --- PAYMENT MODAL SYSTEM ---
let currentActiveBookingId = null;
let currentActivePayType = 'dp';

function openPaymentModal(bookingId, type) {
    currentActiveBookingId = bookingId;
    currentActivePayType = type;

    const b = allBookings.find(booking => booking.id == bookingId);
    if (!b) return;

    document.getElementById('payment-modal-client-name').innerText = b.client_name;
    document.getElementById('payment-modal-deal-price').innerText = `Harga Deal: Rp ${b.total_deal_price.toLocaleString('id-ID')}`;

    const badge = document.getElementById('payment-modal-badge');
    const input = document.getElementById('payment-modal-amount-input');

    const receiptView = document.getElementById('payment-receipt-view');
    const invoiceView = document.getElementById('payment-invoice-view');
    const titleLeft = document.getElementById('payment-left-title');
    const waBtn = document.getElementById('payment-modal-wa-btn');

    if (type === 'dp') {
        badge.innerText = 'Verifikasi Pembayaran DP';
        badge.className = 'inline-block bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-blue-150';
        input.value = b.dp_claimed_amount && b.dp_claimed_amount > 0 ? b.dp_claimed_amount : 2000000;

        titleLeft.innerText = 'Berkas Struk Transfer DP';
        receiptView.classList.remove('hidden');
        invoiceView.classList.add('hidden');
        waBtn.classList.add('hidden');

        // Show dp_claimed_amount from client
        const dpClaimedRow = document.getElementById('payment-modal-dp-claimed-row');
        const dpClaimedEl = document.getElementById('payment-modal-dp-claimed');
        if (b.dp_claimed_amount && b.dp_claimed_amount > 0) {
            dpClaimedEl.innerText = `Rp ${b.dp_claimed_amount.toLocaleString('id-ID')}`;
            dpClaimedRow.classList.remove('hidden');
        } else {
            dpClaimedRow.classList.add('hidden');
        }
        const img = document.getElementById('receipt-preview-img');
        const empty = document.getElementById('receipt-preview-empty');
        if (b.payment_receipt_path) {
            img.src = b.payment_receipt_path;
            img.classList.remove('hidden');
            empty.classList.add('hidden');
        } else {
            img.src = '';
            img.classList.add('hidden');
            empty.classList.remove('hidden');
        }

        // Handle discount section for DP modal
        const discountSection = document.getElementById('payment-discount-section');
        const discountAmountEl = document.getElementById('payment-discount-amount');
        const discountStatusEl = document.getElementById('payment-discount-status');
        const discountConfirmBtn = document.getElementById('payment-modal-confirm-discount-btn');

        if (b.discount_amount && b.discount_amount > 0) {
            discountSection.classList.remove('hidden');
            discountAmountEl.innerText = `Rp ${b.discount_amount.toLocaleString('id-ID')}`;
            if (b.discount_confirmed) {
                discountStatusEl.innerText = '✓ Sudah Dikonfirmasi';
                discountStatusEl.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700';
                discountConfirmBtn.classList.add('hidden');
            } else {
                discountStatusEl.innerText = '⚠ Belum Dikonfirmasi';
                discountStatusEl.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-700';
                discountConfirmBtn.classList.remove('hidden');
            }
        } else {
            discountSection.classList.add('hidden');
            discountConfirmBtn.classList.add('hidden');
        }
    } else {
        badge.innerText = 'Verifikasi Pembayaran Pelunasan';
        badge.className = 'inline-block bg-purple-50 text-purple-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-purple-150';

        const sisa = b.total_deal_price - b.dp_paid_amount;
        input.value = sisa; // final payment remaining

        titleLeft.innerText = 'Rincian Penagihan Pelunasan';
        receiptView.classList.add('hidden');
        invoiceView.classList.remove('hidden');
        waBtn.classList.remove('hidden');

        document.getElementById('inv-total').innerText = `Rp ${b.total_deal_price.toLocaleString('id-ID')}`;
        document.getElementById('inv-dp').innerText = `- Rp ${b.dp_paid_amount.toLocaleString('id-ID')}`;
        document.getElementById('inv-sisa').innerText = `Rp ${sisa.toLocaleString('id-ID')}`;

        // Setup WA button
        const message = `Halo Kak ${b.client_name},\n\nTerima kasih telah mempercayakan dokumentasi pernikahan Kakak kepada Sorehari.\n\nSesuai dengan tagihan proyek Kakak:\nTotal Deal: Rp ${b.total_deal_price.toLocaleString('id-ID')}\nDP Diterima: Rp ${b.dp_paid_amount.toLocaleString('id-ID')}\n\nSisa Pelunasan: *Rp ${sisa.toLocaleString('id-ID')}*\n\nSilakan melakukan pembayaran ke rekening:\nBank BCA - 3420-1111-99 a.n. Sorehari Photography\n\nTerima kasih!`;
        waBtn.onclick = () => {
            let waNumber = '';
            if (b.client_phone) {
                // Format number: ensure it starts with country code, e.g. 62
                waNumber = b.client_phone.replace(/\D/g, '');
                if (waNumber.startsWith('0')) waNumber = '62' + waNumber.substring(1);
            }
            window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank');
        };
    }

    // Show or hide cancel project button dynamically inside payment modal
    const cancelSection = document.getElementById('payment-cancel-section');
    if (cancelSection) {
        if (b.project_status === 'Ditutup' || b.project_status === 'Selesai' || b.payment_status === 'Lunas' || b.payment_status === 'DP Hangus') {
            cancelSection.classList.add('hidden');
        } else {
            cancelSection.classList.remove('hidden');
        }
    }

    document.getElementById('payment-modal').classList.remove('hidden');
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    currentActiveBookingId = null;
}

document.getElementById('payment-modal-confirm-btn').addEventListener('click', async () => {
    if (!currentActiveBookingId) return;
    const amount = parseFloat(document.getElementById('payment-modal-amount-input').value);
    if (isNaN(amount) || amount < 0) {
        alert('Nominal uang masuk harus valid!');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/bookings/${currentActiveBookingId}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paid_amount: amount })
        });

        if (!res.ok) throw new Error('Gagal memverifikasi pembayaran');
        const data = await res.json();

        alert('Pembayaran berhasil dikonfirmasi! ' + (data.message || ''));
        if (data.waLink) {
            window.open(data.waLink, '_blank');
        }
        closePaymentModal();
        loadBookings();
        loadPaymentV11();
        if (typeof loadWaLogs === 'function') loadWaLogs();
    } catch (err) {
        alert('Error: ' + err.message);
    }
});

document.getElementById('payment-modal-confirm-discount-btn').addEventListener('click', async () => {
    if (!currentActiveBookingId) return;
    if (!confirm('Konfirmasi potongan harga ini? Total deal akan dikurangi sesuai nilai potongan.')) return;

    try {
        const res = await fetch(`${API_URL}/bookings/${currentActiveBookingId}/confirm-discount`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal mengkonfirmasi potongan harga');
        }
        const data = await res.json();
        alert('✓ ' + data.message);
        closePaymentModal();
        loadBookings();
    } catch (err) {
        alert('Error: ' + err.message);
    }
});

// --- CREW MANUAL ASSIGNMENT MODAL ---
let crewModalBookingId = null;

async function openCrewModal(bookingId) {
    crewModalBookingId = bookingId;
    const b = allBookings.find(booking => booking.id == bookingId);
    if (!b) return;

    document.getElementById('crew-modal-subtitle').innerText = `Klien: ${b.client_name} — ${formatDate(b.event_date)}`;

    const list = document.getElementById('crew-modal-list');
    list.innerHTML = '<p class="text-center text-slate-400 py-4 text-xs">Memuat data kru...</p>';
    const summary = document.getElementById('crew-modal-summary');
    summary.innerHTML = '';

    document.getElementById('crew-modal').classList.remove('hidden');

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/available-crew`);
        if (!res.ok) throw new Error('Gagal memuat data kru');
        const data = await res.json();

        // Store booking sessions for use by createCrewToggleItem
        window._crewModalBookingSessions = data.booking_sessions || [];

        // FG Status styling
        const fgIsUnder = data.assigned_fg < data.required_fg;
        const fgIsMet = data.assigned_fg >= data.required_fg;
        const fgBg = fgIsUnder ? 'bg-rose-50' : (fgIsMet && data.required_fg > 0 ? 'bg-emerald-50' : 'bg-blue-50');
        const fgBorder = fgIsUnder ? 'border-rose-200' : (fgIsMet && data.required_fg > 0 ? 'border-emerald-200' : 'border-blue-200');
        const fgText = fgIsUnder ? 'text-rose-700' : (fgIsMet && data.required_fg > 0 ? 'text-emerald-700' : 'text-blue-700');
        const fgLabel = fgIsUnder ? 'text-rose-500' : (fgIsMet && data.required_fg > 0 ? 'text-emerald-500' : 'text-blue-500');
        const fgSubtext = fgIsUnder
            ? `<span class="block text-[10px] font-bold text-rose-600 mt-1">⚠️ Kurang ${data.required_fg - data.assigned_fg} Kru</span>`
            : (fgIsMet && data.required_fg > 0
                ? `<span class="block text-[10px] font-bold text-emerald-600 mt-1">✓ Terpenuhi</span>`
                : `<span class="block text-[10px] font-bold text-slate-400 mt-1">-</span>`);

        // VG Status styling
        const vgIsUnder = data.assigned_vg < data.required_vg;
        const vgIsMet = data.assigned_vg >= data.required_vg;
        const vgBg = vgIsUnder ? 'bg-rose-50' : (vgIsMet && data.required_vg > 0 ? 'bg-emerald-50' : 'bg-purple-50');
        const vgBorder = vgIsUnder ? 'border-rose-200' : (vgIsMet && data.required_vg > 0 ? 'border-emerald-200' : 'border-purple-200');
        const vgText = vgIsUnder ? 'text-rose-700' : (vgIsMet && data.required_vg > 0 ? 'text-emerald-700' : 'text-purple-700');
        const vgLabel = vgIsUnder ? 'text-rose-500' : (vgIsMet && data.required_vg > 0 ? 'text-emerald-500' : 'text-purple-500');
        const vgSubtext = vgIsUnder
            ? `<span class="block text-[10px] font-bold text-rose-600 mt-1">⚠️ Kurang ${data.required_vg - data.assigned_vg} Kru</span>`
            : (vgIsMet && data.required_vg > 0
                ? `<span class="block text-[10px] font-bold text-emerald-600 mt-1">✓ Terpenuhi</span>`
                : `<span class="block text-[10px] font-bold text-slate-400 mt-1">-</span>`);

        // Show requirement summary badges
        summary.innerHTML = `
                    <div class="flex-1 ${fgBg} border ${fgBorder} rounded-xl p-3 text-center transition-colors">
                        <p class="text-[10px] font-bold ${fgLabel} uppercase tracking-wider">Fotografer (FG)</p>
                        <p class="text-lg font-extrabold ${fgText}">${data.assigned_fg} / ${data.required_fg}</p>
                        ${fgSubtext}
                    </div>
                    <div class="flex-1 ${vgBg} border ${vgBorder} rounded-xl p-3 text-center transition-colors">
                        <p class="text-[10px] font-bold ${vgLabel} uppercase tracking-wider">Videografer (VG)</p>
                        <p class="text-lg font-extrabold ${vgText}">${data.assigned_vg} / ${data.required_vg}</p>
                        ${vgSubtext}
                    </div>
                `;

        list.innerHTML = '';

        if (data.available_crew.length === 0) {
            list.innerHTML += `
                        <div class="text-center py-6 space-y-2">
                            <p class="text-sm font-semibold text-red-500">Tidak ada kru aktif tersedia</p>
                            <p class="text-[11px] text-slate-500">Tambahkan freelancer baru di tab <strong>Kru Freelance</strong> terlebih dahulu.</p>
                        </div>
                    `;
            return;
        }

        // Group by role
        const fgCrew = data.available_crew.filter(f => f.role === 'FG');
        const vgCrew = data.available_crew.filter(f => f.role === 'VG');

        if (fgCrew.length > 0) {
            const header = document.createElement('p');
            header.className = 'text-[10px] font-bold uppercase tracking-widest text-blue-500 pt-2';
            header.innerText = '📸 FOTOGRAFER (FG)';
            list.appendChild(header);
            fgCrew.forEach(f => list.appendChild(createCrewToggleItem(f, bookingId)));
        }

        if (vgCrew.length > 0) {
            const header = document.createElement('p');
            header.className = 'text-[10px] font-bold uppercase tracking-widest text-purple-500 pt-3';
            header.innerText = '🎥 VIDEOGRAFER (VG)';
            list.appendChild(header);
            vgCrew.forEach(f => list.appendChild(createCrewToggleItem(f, bookingId)));
        }

    } catch (err) {
        list.innerHTML = `<p class="text-center text-red-500 py-4 text-xs">Error: ${err.message}</p>`;
    }
}

function createCrewToggleItem(freelancer, bookingId) {
    const bookingSessions = window._crewModalBookingSessions || [];

    // For assigned crew: parse which sessions they're assigned to
    let assignedSessionIds = [];
    if (freelancer.assigned && freelancer.assigned_sessions) {
        try {
            assignedSessionIds = JSON.parse(freelancer.assigned_sessions);
        } catch (e) { assignedSessionIds = bookingSessions.map(s => s.session_id); }
    } else if (freelancer.assigned) {
        assignedSessionIds = bookingSessions.map(s => s.session_id);
    }

    const div = document.createElement('div');
    div.className = `flex flex-col gap-2 p-3 rounded-xl text-xs border transition ${freelancer.assigned
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
        }`;
    div.id = `crew-item-${freelancer.id}`;

    // For ASSIGNED crew: show which sessions they cover (editable)
    const assignedSessionsHtml = freelancer.assigned && bookingSessions.length > 0 ? `
        <div class="mt-2 pt-2 border-t border-emerald-200/70">
            <p class="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5">Sesi yang Diikuti:</p>
            <div class="flex flex-wrap gap-1.5">
                ${bookingSessions.map(s => {
        const isChecked = assignedSessionIds.includes(s.session_id);
        return `<label class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer transition select-none ${isChecked ? 'bg-emerald-100 border border-emerald-300 text-emerald-700' : 'bg-white border border-slate-200 text-slate-400 opacity-60'
            }">
                        <input type="checkbox"
                            class="crew-assign-session-cb w-3 h-3 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                            data-session-id="${s.session_id}"
                            data-freelancer-id="${freelancer.id}"
                            ${isChecked ? 'checked' : ''}
                            onchange="onAssignedCrewSessionChange(this, ${bookingId})"
                        />
                        <span class="font-semibold text-[10px]">${escapeHtml(s.session_name)}</span>
                    </label>`;
    }).join('')}
            </div>
        </div>
    ` : '';

    // For UNASSIGNED crew: hidden session picker that appears on "Tugaskan" click
    const sessionPickerHtml = !freelancer.assigned && bookingSessions.length > 0 ? `
        <div id="session-picker-${freelancer.id}" class="hidden mt-2 pt-2 border-t border-slate-200/70">
            <p class="text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1.5">Pilih Sesi yang Akan Diikuti:</p>
            <div class="flex flex-wrap gap-1.5 mb-2">
                ${bookingSessions.map(s => `
                    <label class="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 transition select-none">
                        <input type="checkbox"
                            class="crew-assign-session-cb w-3 h-3 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                            data-session-id="${s.session_id}"
                            data-freelancer-id="${freelancer.id}"
                            checked
                        />
                        <span class="font-semibold text-slate-700 text-[10px]">${escapeHtml(s.session_name)}</span>
                    </label>
                `).join('')}
            </div>
            <div class="flex gap-2">
                <button onclick="assignCrewWithSessions(${bookingId}, ${freelancer.id})"
                    class="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition text-[11px]">
                    ✓ Konfirmasi Tugaskan
                </button>
                <button onclick="cancelCrewAssignPicker(${freelancer.id})"
                    class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition text-[11px]">
                    Batal
                </button>
            </div>
        </div>
    ` : '';

    div.innerHTML = `
        <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full flex items-center justify-center font-bold text-[10px] ${freelancer.assigned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
        }">
                    ${freelancer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-bold text-slate-800">${escapeHtml(freelancer.name)}</p>
                    <p class="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                        <span>${escapeHtml(freelancer.whatsapp_number)}</span>
                        <a href="${(freelancer.assigned && freelancer.waLink) ? freelancer.waLink : getWaMeLink(freelancer.whatsapp_number)}" target="_blank" class="inline-flex items-center justify-center p-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 transition" title="Kirim WhatsApp">
                            <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.62.962 3.21 1.6 5.366 1.6 5.434 0 9.85-4.384 9.853-9.774.002-2.611-1.006-5.066-2.845-6.91C17.13 2.228 14.678.995 12.008.995c-5.44 0-9.857 4.387-9.86 9.778-.001 1.957.518 3.864 1.503 5.568L2.61 21.688l5.59-1.464-.553-.33z"/></svg>
                        </a>
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                ${freelancer.assigned
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Ditugaskan</span>
                       <button onclick="toggleCrewAssignment(${bookingId}, ${freelancer.id}, false)"
                           class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100 transition text-[11px]">Lepas</button>`
            : `<button id="btn-tugaskan-${freelancer.id}" onclick="showCrewAssignPicker(${freelancer.id})"
                           class="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-700 transition text-[11px]">Tugaskan</button>`
        }
            </div>
        </div>
        ${assignedSessionsHtml}
        ${sessionPickerHtml}
    `;
    return div;
}

function showCrewAssignPicker(freelancerId) {
    // Hide the Tugaskan button and show the session picker
    const btn = document.getElementById(`btn-tugaskan-${freelancerId}`);
    if (btn) btn.classList.add('hidden');
    const picker = document.getElementById(`session-picker-${freelancerId}`);
    if (picker) picker.classList.remove('hidden');
}

function cancelCrewAssignPicker(freelancerId) {
    // Hide picker, show Tugaskan button again
    const picker = document.getElementById(`session-picker-${freelancerId}`);
    if (picker) picker.classList.add('hidden');
    const btn = document.getElementById(`btn-tugaskan-${freelancerId}`);
    if (btn) btn.classList.remove('hidden');
}

async function assignCrewWithSessions(bookingId, freelancerId) {
    // Collect checked session IDs from the session picker
    const crewItem = document.getElementById(`crew-item-${freelancerId}`);
    const checkedBoxes = crewItem ? crewItem.querySelectorAll('.crew-assign-session-cb:checked') : [];
    const sessionIds = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.sessionId));
    await toggleCrewAssignment(bookingId, freelancerId, true, sessionIds);
}

async function onAssignedCrewSessionChange(checkbox, bookingId) {
    const freelancerId = checkbox.dataset.freelancerId;
    // Collect all checked sessions for this freelancer in the crew modal
    const crewItem = document.getElementById(`crew-item-${freelancerId}`);
    const allBoxes = crewItem ? crewItem.querySelectorAll('.crew-assign-session-cb') : [];
    const checkedIds = Array.from(allBoxes).filter(cb => cb.checked).map(cb => parseInt(cb.dataset.sessionId));
    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/freelancers/${freelancerId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: checkedIds })
        });
        if (!res.ok) throw new Error('Gagal memperbarui sesi');
        await loadBookings();
        await openCrewModal(bookingId); // Reload the modal view to recalculate the wa.me link with new sessions
    } catch (err) {
        console.error('Error updating crew session assignment:', err);
        alert(err.message);
    }
}

async function toggleCrewAssignment(bookingId, freelancerId, assign, sessionIds = null) {
    const endpoint = assign ? 'assign-crew' : 'unassign-crew';
    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ freelancer_id: freelancerId, ...(assign && sessionIds ? { session_ids: sessionIds } : {}) })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Gagal mengubah penugasan kru');
        }

        const data = await res.json();

        // Refresh booking data and re-render modal
        await loadBookings();
        await openCrewModal(bookingId);

        // If crew was just assigned, offer to open wa.me notification link
        if (assign && data.waLink) {
            const confirm = window.confirm(`✅ ${data.freelancerName || 'Kru'} berhasil ditugaskan!\n\nKlik OK untuk membuka WhatsApp dan memberitahu ${data.freelancerName || 'kru'} jadwal mereka.`);
            if (confirm) {
                window.open(data.waLink, '_blank');
            }
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function closeCrewModal() {
    document.getElementById('crew-modal').classList.add('hidden');
    crewModalBookingId = null;
}



function openInvoiceModal(bookingId) {
    const b = allBookings.find(bk => bk.id === bookingId);
    if (!b) return;

    const content = document.getElementById('invoice-content');
    const totalDeal = b.total_deal_price || 0;

    // Calculate dynamic package items production cost
    let totalPackageProductsCost = 0;
    let packageCostBreakdownHtml = '';
    if (b.package_description) {
        try {
            const services = JSON.parse(b.package_description);
            if (Array.isArray(services)) {
                services.forEach(s => {
                    const qty = s.qty || 1;
                    const basePrice = s.price || 0; // base price
                    const itemCost = basePrice * qty;
                    totalPackageProductsCost += itemCost;
                    packageCostBreakdownHtml += `
                        <div class="flex justify-between items-center text-sm pl-3 border-l-2 border-slate-200">
                            <p>${escapeHtml(s.name)} (x${qty})</p>
                            <p>Rp ${itemCost.toLocaleString('id-ID')}</p>
                        </div>
                    `;
                });
            }
        } catch (e) {
            console.error('Error parsing package_description:', e);
        }
    }

    // Calculate dynamic crew fees from currently assigned crew sessions
    let totalCrewExpenditure = 0;
    if (b.freelancers && b.freelancers.length > 0) {
        b.freelancers.forEach(f => {
            const assignedSessions = f.assigned_sessions !== null
                ? JSON.parse(f.assigned_sessions || '[]')
                : [];
            let freelancerTotalFee = 0;
            if (assignedSessions.length > 0) {
                assignedSessions.forEach(sId => {
                    const feeObj = (f.fees || []).find(ff => ff.session_id === sId);
                    const feeAmount = feeObj ? feeObj.fee_amount : (f.fee_per_project > 0 ? f.fee_per_project : 200000);
                    freelancerTotalFee += feeAmount;
                });
            } else {
                freelancerTotalFee = f.fee_per_project > 0 ? f.fee_per_project : 200000;
            }
            totalCrewExpenditure += freelancerTotalFee;
        });
    } else {
        totalCrewExpenditure = b.expense_staff_fee || 0;
    }

    const logis = b.operational_cost || 0;
    const totalExpense = totalPackageProductsCost + logis + totalCrewExpenditure;
    const profit = totalDeal - totalExpense;

    const crewNames = (b.freelancers && b.freelancers.length > 0)
        ? b.freelancers.map(f => f.name).join(', ')
        : '-';

    const specialRequestsDiv = b.special_requests
        ? `<div class="space-y-1 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-slate-800">
                     <p class="text-[9px] text-amber-600 font-bold uppercase tracking-widest">Catatan Khusus Client</p>
                     <p class="font-medium text-xs">${escapeHtml(b.special_requests)}</p>
                   </div>`
        : '';

    content.innerHTML = `
                <div class="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                    <div>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Klien</p>
                        <p class="font-bold text-slate-900">${b.client_name}</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Tanggal Acara</p>
                        <p class="font-bold text-slate-900">${formatDate(b.event_date)}</p>
                    </div>
                </div>
                ${specialRequestsDiv}
                <div class="space-y-2 border-b border-slate-100 pb-4">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Kru Bertugas</p>
                    <p class="font-semibold text-indigo-700">${crewNames}</p>
                </div>
                <div class="space-y-2 border-b border-slate-100 pb-4">
                    <div class="flex justify-between items-center">
                        <p class="font-medium">Total Nilai Proyek (Deal)</p>
                        <p class="font-bold">Rp ${totalDeal.toLocaleString('id-ID')}</p>
                    </div>
                </div>
                <div class="space-y-2 border-b border-slate-100 pb-4 text-slate-600">
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Rincian Pengeluaran</p>
                    ${packageCostBreakdownHtml || `
                        <div class="flex justify-between items-center text-sm pl-3 border-l-2 border-slate-200">
                            <p>Produk & Layanan Paket</p>
                            <p>Rp 0</p>
                        </div>
                    `}
                    <div class="flex justify-between items-center text-sm">
                        <p>Akomodasi & Logistik (Biaya Ops)</p><p>Rp ${logis.toLocaleString('id-ID')}</p>
                    </div>
                    <div class="flex justify-between items-center text-sm">
                        <p>Total Fee Kru Lapangan</p><p>Rp ${totalCrewExpenditure.toLocaleString('id-ID')}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center pt-2">
                    <p class="font-bold text-emerald-700">Profit Bersih Perusahaan</p>
                    <p class="font-black text-xl text-emerald-600">Rp ${profit.toLocaleString('id-ID')}</p>
                </div>
            `;

    document.getElementById('invoice-modal').classList.remove('hidden');
}

function closeInvoiceModal() {
    document.getElementById('invoice-modal').classList.add('hidden');
}

// --- SECTION 3: FREELANCERS CRUD ---
async function loadFreelancers() {
    try {
        const res = await fetch(`${API_URL}/freelancers`);
        allFreelancers = await res.json();

        const tbody = document.getElementById('freelancers-table-body');
        tbody.innerHTML = '';

        if (allFreelancers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center">Belum ada freelancer terdaftar.</td></tr>';
            return;
        }

        const searchInput = document.getElementById('search-freelancer-input');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const filteredFreelancers = allFreelancers.filter(f => f.name.toLowerCase().includes(searchTerm));

        if (filteredFreelancers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">Tidak ada hasil ditemukan.</td></tr>';
            return;
        }

        filteredFreelancers.forEach(f => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b border-slate-100 transition";

            let statusBadge = f.status === 'Aktif'
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Aktif</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">Tidak Aktif</span>';

            const bankAcc = f.bank_account ? escapeHtml(f.bank_account) : '<span class="text-slate-300 italic">Belum disetel</span>';

            tr.innerHTML = `
                        <td class="p-4 font-semibold text-slate-900">${escapeHtml(f.name)}</td>
                        <td class="p-4"><span class="px-2 py-1 bg-slate-100 rounded text-slate-700 font-bold">${f.role}</span></td>
                        <td class="p-4 font-mono text-slate-600">
                            <div class="flex items-center gap-1.5">
                                <span>${escapeHtml(f.whatsapp_number)}</span>
                                <a href="${getWaMeLink(f.whatsapp_number)}" target="_blank" class="inline-flex items-center justify-center p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 hover:border-emerald-300 transition" title="Kirim WhatsApp">
                                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.62.962 3.21 1.6 5.366 1.6 5.434 0 9.85-4.384 9.853-9.774.002-2.611-1.006-5.066-2.845-6.91C17.13 2.228 14.678.995 12.008.995c-5.44 0-9.857 4.387-9.86 9.778-.001 1.957.518 3.864 1.503 5.568L2.61 21.688l5.59-1.464-.553-.33z"/>
                                    </svg>
                                </a>
                            </div>
                        </td>
                        <td class="p-4 font-mono text-[10px] text-slate-600">${bankAcc}</td>
                        <td class="p-4">
                            <div class="font-bold text-slate-700">Rp ${(f.avg_session_fee || 0).toLocaleString('id-ID')}</div>
                            <div class="text-[9px] font-normal text-slate-400 mt-0.5">Rata-rata / Sesi</div>
                        </td>
                        <td class="p-4">${statusBadge}</td>
                        <td class="p-4 text-right whitespace-nowrap">

                            <button onclick="viewFreelancerBookings(${f.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition mr-1">List Client</button>
                            <button onclick="openFreelancerModal(${f.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition mr-1">Edit</button>
                            <button onclick="deleteFreelancer(${f.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition">Hapus</button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

function closeFreelancerClientsModal() {
    document.getElementById('freelancer-clients-modal').classList.add('hidden');
}

function viewFreelancerBookings(freelancerId) {
    const f = allFreelancers.find(item => item.id == freelancerId);
    if (!f) return;

    document.getElementById('freelancer-clients-modal-title').innerText = f.name;
    const content = document.getElementById('freelancer-clients-modal-content');
    content.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Memuat data...</p>';

    Promise.all([
        fetch('/api/disbursements').then(res => res.json()),
        fetch('/api/services').then(res => res.json())
    ])
        .then(([disbData, servicesData]) => {
            const freelancerDisbursements = (disbData.data || []).filter(d => d.freelancer_id == freelancerId);
            const allServices = servicesData.data || [];

            // Filter allBookings for this freelancer, excluding completed projects that have already had their freelance fee paid
            const assignedBookings = allBookings.filter(b => {
                const isAssigned = b.freelancers && b.freelancers.some(crew => crew.id == freelancerId);
                if (!isAssigned) return false;

                const matchDisb = freelancerDisbursements.find(d => d.booking_id == b.id);
                const feeStatus = matchDisb ? matchDisb.fee_status : 'Pending';
                return !(b.project_status === 'Selesai' && feeStatus === 'Paid');
            });

            content.innerHTML = '';
            if (assignedBookings.length === 0) {
                content.innerHTML = `
                        <div class="text-center py-8 text-slate-400">
                            <p class="text-sm font-medium">Belum ada agenda client aktif yang perlu dikerjakan.</p>
                            <p class="text-xs mt-1">Semua tugas selesai telah dibayarkan gajinya, atau alokasikan kru ini melalui tab Client Status.</p>
                        </div>
                    `;
                return;
            }

            assignedBookings.forEach(b => {
                const dateStr = formatDate(b.event_date) || b.event_date;
                const statusColors = {
                    'Menunggu DP': 'bg-blue-50 text-blue-600 border-blue-200',
                    'Menunggu Pelunasan': 'bg-purple-50 text-purple-600 border-purple-200',
                    'Lunas': 'bg-emerald-50 text-emerald-600 border-emerald-200',
                    'DP Hangus': 'bg-red-50 text-red-600 border-red-200',
                    'Selesai': 'bg-slate-100 text-slate-600 border-slate-200',
                    'Batal': 'bg-red-50 text-red-600 border-red-200'
                };
                const statusText = b.project_status || b.payment_status || 'Aktif';
                const badgeClass = statusColors[statusText] || 'bg-slate-50 text-slate-600 border-slate-200';

                // Calculate sessions in this package as fallback
                let fallbackSessionsCount = 0;
                try {
                    const services = JSON.parse(b.package_description || '[]');
                    services.forEach(s => {
                        const serviceInfo = allServices.find(item => item.id == s.service_id);
                        if (serviceInfo && serviceInfo.category === 'Sesi') {
                            fallbackSessionsCount += (s.qty || 1);
                        }
                    });
                } catch (e) { }
                if (fallbackSessionsCount === 0) fallbackSessionsCount = 1;

                // Look up the specific freelancer record inside this booking
                const b_freelancer = (b.freelancers || []).find(crew => crew.id == freelancerId);
                let totalFee = 0;

                if (b_freelancer) {
                    const assignedSessionsStr = b_freelancer.assigned_sessions;
                    if (assignedSessionsStr !== null && assignedSessionsStr !== undefined) {
                        try {
                            const assignedSessions = JSON.parse(assignedSessionsStr || '[]');
                            if (assignedSessions.length > 0) {
                                assignedSessions.forEach(sessionId => {
                                    const feeObj = (b_freelancer.fees || []).find(ff => ff.session_id == sessionId);
                                    const feeAmount = feeObj ? feeObj.fee_amount : (b_freelancer.fee_per_project > 0 ? b_freelancer.fee_per_project : 200000);
                                    totalFee += feeAmount;
                                });
                            } else {
                                totalFee = (f.avg_session_fee || f.fee_per_project || 0) * fallbackSessionsCount;
                            }
                        } catch(e) {
                            totalFee = (f.avg_session_fee || f.fee_per_project || 0) * fallbackSessionsCount;
                        }
                    } else {
                        // If null, they are assigned to all sessions in the booking
                        totalFee = (f.avg_session_fee || f.fee_per_project || 0) * fallbackSessionsCount;
                    }
                } else {
                    totalFee = (f.avg_session_fee || f.fee_per_project || 0) * fallbackSessionsCount;
                }

                // Find matching disbursement to get fee status
                const matchDisb = freelancerDisbursements.find(d => d.booking_id == b.id);
                const feeStatus = matchDisb ? matchDisb.fee_status : 'Pending';

                const feeStatusLabels = {
                    'Pending': '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Belum Lunas</span>',
                    'Paid': '<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Lunas</span>',
                    'Cancelled': '<span class="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">Batal</span>'
                };
                const feeStatusBadge = feeStatusLabels[feeStatus] || `<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">${feeStatus}</span>`;

                const item = document.createElement('div');
                item.className = 'p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 transition flex items-center justify-between gap-4';
                item.innerHTML = `
                        <div class="space-y-1">
                            <p class="text-xs font-bold text-slate-900">${escapeHtml(b.client_name)}</p>
                            <p class="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                📅 ${dateStr} • 📍 ${escapeHtml(b.location || '-')}
                            </p>
                            <p class="text-[10px] text-slate-500 font-medium">
                                📦 Paket: ${escapeHtml(b.package_name || '-')}
                            </p>
                            <div class="pt-1.5 flex flex-wrap items-center gap-1.5">
                                <span class="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">
                                    Total Fee: Rp ${totalFee.toLocaleString('id-ID')}
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span class="px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${badgeClass}">${statusText}</span>
                            ${feeStatusBadge}
                        </div>
                    `;
                content.appendChild(item);
            });
        })
        .catch(err => {
            content.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal memuat detail fee: ${err.message}</p>`;
        });

    document.getElementById('freelancer-clients-modal').classList.remove('hidden');
}

async function openFreelancerModal(id = null) {
    const form = document.getElementById('freelancer-form');
    form.reset();
    document.getElementById('freelancer-modal-id').value = id || '';

    // Fetch sessions if not loaded
    if (allSessions.length === 0) {
        try {
            const res = await fetch('/api/sessions');
            const data = await res.json();
            allSessions = data.data || [];
        } catch (e) { }
    }

    const feeContainer = document.getElementById('freelancer-session-fees');
    feeContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Memuat...</p>';

    let specificFees = [];
    if (id) {
        document.getElementById('freelancer-modal-title').innerText = 'Edit Kru Lepas';
        const f = allFreelancers.find(freelancer => freelancer.id == id);
        if (f) {
            document.getElementById('freelancer-modal-name').value = f.name;
            document.getElementById('freelancer-modal-role').value = f.role;
            document.getElementById('freelancer-modal-phone').value = f.whatsapp_number;
            document.getElementById('freelancer-modal-status').value = f.status;
            document.getElementById('freelancer-modal-bank').value = f.bank_account || '';
        }

        try {
            const fres = await fetch(`/api/freelancers/${id}/fees`);
            const fdata = await fres.json();
            specificFees = fdata.data || [];
        } catch (e) { }
    } else {
        document.getElementById('freelancer-modal-title').innerText = 'Tambah Kru Lepas';
    }

    if (allSessions.length === 0) {
        feeContainer.innerHTML = '<p class="text-[10px] text-slate-400">Belum ada Master Sesi.</p>';
    } else {
        feeContainer.innerHTML = allSessions.filter(s => s.is_active || specificFees.some(sf => sf.session_id === s.id)).map(s => {
            const existing = specificFees.find(sf => sf.session_id === s.id);
            const val = existing ? existing.fee_amount : '';
            return `
                        <div class="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100">
                            <label class="text-[11px] font-semibold text-slate-600 flex-1 truncate">${escapeHtml(s.name)}</label>
                            <div class="relative w-28">
                                <span class="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
                                <input type="number" class="freelancer-session-fee-input w-full rounded-md border border-slate-300 bg-white pl-6 pr-2 py-1.5 text-[11px] focus:ring-1 focus:ring-slate-900 focus:outline-none" placeholder="Default" data-session-id="${s.id}" value="${val}">
                            </div>
                        </div>
                    `;
        }).join('');
    }

    document.getElementById('freelancer-modal').classList.remove('hidden');
}

function closeFreelancerModal() {
    document.getElementById('freelancer-modal').classList.add('hidden');
}

async function saveFreelancer(e) {
    e.preventDefault();
    const id = document.getElementById('freelancer-modal-id').value;
    const name = document.getElementById('freelancer-modal-name').value.trim();
    const role = document.getElementById('freelancer-modal-role').value;
    const whatsapp_number = document.getElementById('freelancer-modal-phone').value.trim();
    const bank_account = document.getElementById('freelancer-modal-bank').value.trim();
    const status = document.getElementById('freelancer-modal-status').value;
    const fee_per_project = 0; // Removed from UI

    const url = id ? `${API_URL}/freelancers/${id}` : `${API_URL}/freelancers`;
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, role, status, whatsapp_number, fee_per_project, bank_account })
        });

        if (!res.ok) throw new Error('Gagal menyimpan kru');
        const data = await res.json();
        const newId = id || data.id;

        if (newId) {
            const feeInputs = document.querySelectorAll('.freelancer-session-fee-input');
            const fees = [];
            feeInputs.forEach(input => {
                const amt = input.value;
                if (amt && amt.trim() !== '') {
                    fees.push({ session_id: parseInt(input.dataset.sessionId), fee_amount: parseFloat(amt) });
                }
            });

            await fetch(`/api/freelancers/${newId}/fees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fees })
            });
        }

        alert('Data kru berhasil disimpan!');
        closeFreelancerModal();
        loadFreelancers();
        loadBookings(); // update booking table if crew status changed
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteFreelancer(id) {
    if (!confirm('Hapus kru ini?')) return;
    try {
        const res = await fetch(`${API_URL}/freelancers/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus kru');
        alert('Kru berhasil dihapus!');
        loadFreelancers();
        loadBookings(); // update booking table if crew availability changed
    } catch (err) {
        alert('Error: ' + err.message);
    }
}


// --- MASTER LAYANAN: SESI & PAKET ---

function switchMasterSubTab(tab) {
    ['sessions', 'packages'].forEach(t => {
        const btn = document.getElementById('mlab-btn-' + t);
        const panel = document.getElementById('mlab-' + t);
        if (btn) {
            if (t === tab) {
                btn.className = 'flex-1 px-4 py-2 rounded-xl text-xs font-bold bg-white shadow text-slate-900 transition';
            } else {
                btn.className = 'flex-1 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 transition';
            }
        }
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'sessions') loadSessions();
    else if (tab === 'packages') loadPackages();
}

// --- SECTION 3.5: MASTER SESI CRUD ---
let allSessions = [];
async function loadSessions() {
    try {
        const res = await fetch(`${API_URL}/sessions`);
        const data = await res.json();
        allSessions = data.data || [];

        const tbody = document.getElementById('sessions-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (allSessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Belum ada sesi.</td></tr>';
            return;
        }

        allSessions.forEach((s, idx) => {
            const statusHtml = s.is_active
                ? `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">Aktif</span>`
                : `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Nonaktif</span>`;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
            tr.innerHTML = `
                        <td class="p-4 text-center font-bold text-slate-500">${idx + 1}</td>
                        <td class="p-4 font-bold text-slate-800">${escapeHtml(s.name)}</td>
                        <td class="p-4 text-slate-500 text-[11px] truncate max-w-[200px]">${escapeHtml(s.description || '-')}</td>
                        <td class="p-4 text-center">${statusHtml}</td>
                        <td class="p-4 text-right whitespace-nowrap">
                            <button onclick="editSession(${s.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 transition mr-1">Edit</button>
                            <button onclick="deleteSession(${s.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition">Hapus</button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
}

function openSessionModal() {
    document.getElementById('session-modal-title').innerText = 'Tambah Sesi Baru';
    document.getElementById('session-form').reset();
    document.getElementById('session-modal-id').value = '';
    document.getElementById('session-modal-active').value = '1';
    document.getElementById('session-modal').classList.remove('hidden');
}

function editSession(id) {
    const s = allSessions.find(x => x.id === id);
    if (!s) return;
    document.getElementById('session-modal-title').innerText = 'Edit Sesi';
    document.getElementById('session-form').reset();
    document.getElementById('session-modal-id').value = s.id;
    document.getElementById('session-modal-name').value = s.name;
    document.getElementById('session-modal-desc').value = s.description || '';
    document.getElementById('session-modal-order').value = s.default_order;
    document.getElementById('session-modal-active').value = s.is_active;
    document.getElementById('session-modal').classList.remove('hidden');
}

function closeSessionModal() {
    document.getElementById('session-modal').classList.add('hidden');
}

async function saveSession(e) {
    e.preventDefault();
    const id = document.getElementById('session-modal-id').value;
    const name = document.getElementById('session-modal-name').value;
    const description = document.getElementById('session-modal-desc').value;
    const default_order = document.getElementById('session-modal-order').value || 0;
    const is_active = document.getElementById('session-modal-active').value;

    try {
        const url = id ? `/api/sessions/${id}` : '/api/sessions';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, default_order, is_active })
        });
        if (!res.ok) throw new Error('Gagal menyimpan sesi');
        closeSessionModal();
        loadSessions();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteSession(id) {
    if (!confirm('Yakin ingin menonaktifkan sesi ini?')) return;
    try {
        const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus sesi');
        loadSessions();
    } catch (err) {
        alert(err.message);
    }
}

// --- SECTION 4: PACKAGES CRUD (Integrated with Master Pricing Services) ---

// Cached services for picker
let _allServicesForPicker = [];

async function loadPackages() {
    try {
        const res = await fetch(`${API_URL}/packages?all=true`);
        allPackages = await res.json();

        const tbody = document.getElementById('packages-table-body');
        tbody.innerHTML = '';

        if (allPackages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">Belum ada paket. Klik "Buat Paket Baru" untuk memulai.</td></tr>';
            return;
        }

        allPackages.forEach(p => {
            // Parse services from description JSON if available
            let serviceItems = [];
            try { serviceItems = JSON.parse(p.description || '[]'); } catch (e) { serviceItems = []; }
            const isNewFormat = Array.isArray(serviceItems) && serviceItems.length > 0;

            const servicePreview = isNewFormat
                ? serviceItems.slice(0, 3).map(s => `<span class="inline-block bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded mr-1 mb-1">${escapeHtml(s.name)} ×${s.qty}</span>`).join('') + (serviceItems.length > 3 ? `<span class="text-[10px] text-slate-400">+${serviceItems.length - 3} lainnya</span>` : '')
                : (p.description ? `<span class="text-[10px] text-slate-500">${escapeHtml(p.description).substring(0, 60)}${p.description.length > 60 ? '...' : ''}</span>` : '<span class="text-[10px] text-slate-400">—</span>');

            // Estimate modal cost from services if available (base, will be updated via API with crew+ops)
            const modalCost = isNewFormat ? serviceItems.reduce((sum, s) => sum + (s.price * s.qty), 0) : 0;

            const statusHtml = (p.is_active === undefined || p.is_active === 1)
                ? `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">Aktif</span>`
                : `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold">Nonaktif</span>`;

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition';
            tr.innerHTML = `
                        <td class="p-4 font-semibold text-slate-900">${escapeHtml(p.package_name)}</td>
                        <td class="p-4 font-bold text-emerald-700">Rp ${p.price.toLocaleString('id-ID')}</td>
                        <td class="p-4 font-medium text-red-500" data-estimate-cell="${p.id}">${modalCost > 0 ? 'Rp ' + modalCost.toLocaleString('id-ID') + ' <span class="text-[9px] text-slate-400 font-normal">memuat...</span>' : '<span class="text-slate-400">—</span>'}</td>
                        <td class="p-4 text-slate-600">${p.required_fg} FG / ${p.required_vg} VG</td>
                        <td class="p-4 max-w-xs">${servicePreview}</td>
                        <td class="p-4 text-center">${statusHtml}</td>
                        <td class="p-4 text-right whitespace-nowrap">
                            <button onclick="previewPackage(${p.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition mr-1">Preview</button>
                            <button onclick="openPackageModal(${p.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition mr-1">Edit</button>
                            <button onclick="deletePackage(${p.id})" class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition">Hapus</button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });

        // Update estimates with crew + operational cost from API
        _updatePackageEstimates();
    } catch (err) {
        console.error(err);
    }
}

async function _updatePackageEstimates() {
    for (const p of allPackages) {
        let svcItems = [];
        try { svcItems = JSON.parse(p.description || '[]'); } catch (e) { svcItems = []; }
        const is_new = Array.isArray(svcItems) && svcItems.length > 0;
        if (!is_new || !p.session_ids || p.session_ids.length === 0) continue;

        try {
            const res = await fetch(`${API_URL}/packages/calculate-estimate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_items: svcItems,
                    session_ids: p.session_ids,
                    fg_count: p.required_fg,
                    vg_count: p.required_vg
                })
            });
            const data = await res.json();
            if (data.success) {
                const totalExpense = data.modal_produk + data.estimasi_modal_jasa + (p.operational_cost || 0);
                const cell = document.querySelector(`[data-estimate-cell="${p.id}"]`);
                if (cell) cell.innerText = `Rp ${totalExpense.toLocaleString('id-ID')}`;
            }
        } catch (e) { console.error('Estimate update error:', e); }
    }
}

async function openPackageModal(id = null) {
    const form = document.getElementById('pack-form');
    form.reset();
    document.getElementById('pack-modal-id').value = id || '';
    document.getElementById('pack-modal-cost').innerText = 'Rp 0';
    document.getElementById('pack-modal-sell').innerText = 'Rp 0';
    document.getElementById('pack-modal-margin').innerText = 'Rp 0';

    if (id) {
        document.getElementById('pack-modal-title').innerText = 'Edit Paket Layanan';
        const p = allPackages.find(pack => pack.id == id);
        if (p) {
            document.getElementById('pack-modal-name').value = p.package_name;
            document.getElementById('pack-modal-price').value = p.price;
            document.getElementById('pack-modal-fg').value = p.required_fg;
            document.getElementById('pack-modal-vg').value = p.required_vg;
            document.getElementById('pack-modal-desc').value = p.description || '';
            document.getElementById('pack-modal-operational').value = p.operational_cost || 0;
            document.getElementById('pack-modal-negotiable').checked = p.is_negotiable === 1;
            document.getElementById('pack-modal-active').value = (p.is_active === undefined || p.is_active === 1) ? '1' : '0';
            document.getElementById('pack-modal-sell').innerText = `Rp ${p.price.toLocaleString('id-ID')}`;
        }
    } else {
        document.getElementById('pack-modal-title').innerText = 'Buat Paket Layanan Baru';
        document.getElementById('pack-modal-operational').value = 0;
        document.getElementById('pack-modal-negotiable').checked = false;
        document.getElementById('pack-modal-active').value = '1';
    }

    // Load services for picker
    await _loadServicesForPicker(id);

    document.getElementById('pack-modal').classList.remove('hidden');

    // Listen to price input changes for live margin update
    document.getElementById('pack-modal-price').oninput = _updatePackageMargin;
    document.getElementById('pack-modal-operational').oninput = _updatePackageMargin;
}

async function _loadServicesForPicker(packageId) {
    const picker = document.getElementById('pack-service-picker');
    picker.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Memuat daftar layanan...</p>';

    try {
        // Fetch sessions if not loaded
        if (allSessions.length === 0) {
            const sres = await fetch('/api/sessions');
            const sdata = await sres.json();
            allSessions = sdata.data || [];
        }
        const sessionPicker = document.getElementById('pack-session-picker');
        const p = allPackages.find(pack => pack.id == packageId);
        const existingSessions = p ? (p.session_ids || []) : [];

        sessionPicker.innerHTML = allSessions.filter(s => s.is_active || existingSessions.includes(s.id)).map(s => `
                    <label class="flex items-start gap-2 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
                        <input type="checkbox" class="pack-session-cb mt-0.5 rounded text-indigo-600 focus:ring-indigo-500" value="${s.id}" ${existingSessions.includes(s.id) ? 'checked' : ''} onchange="_updatePackageMargin()">
                        <div>
                            <div class="text-[11px] font-bold text-slate-700">${escapeHtml(s.name)}</div>
                        </div>
                    </label>
                `).join('');

        const res = await fetch('/api/services');
        const data = await res.json();
        _allServicesForPicker = data.data || [];

        if (_allServicesForPicker.length === 0) {
            picker.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Belum ada layanan. Tambah dulu di tab <strong>Master Pricing → Biaya Modal & Jasa</strong>.</p>';
            return;
        }

        // Parse existing selection if editing
        let existingItems = [];
        const currentDesc = document.getElementById('pack-modal-desc').value;
        try { existingItems = JSON.parse(currentDesc || '[]'); } catch (e) { existingItems = []; }
        const existingMap = {};
        existingItems.forEach(s => { existingMap[s.service_id] = s.qty; });

        // Group by category
        const categories = {};
        _allServicesForPicker.forEach(s => {
            if (!categories[s.category]) categories[s.category] = [];
            categories[s.category].push(s);
        });

        const catLabels = {
            'Output Fisik': '📚 Output Fisik (Album, Bingkai, Cetakan, dll.)',
            'Output Digital': '💾 Output Digital (Flashdisk, Link Download, Video Highlight, dll.)',
            'Jasa': '🎥 Jasa (Layanan Tambahan, Extra Crew)',
            'Produk Foto': '📚 Output Fisik (Album, Bingkai, Cetakan)',
            'Digital': '💾 Output Digital (Flashdisk, Link Download, Video Highlight)'
        };

        picker.innerHTML = '';
        const sortedCats = ['Output Fisik', 'Output Digital', 'Jasa', 'Produk Foto', 'Digital'];
        const keys = Object.keys(categories).sort((a, b) => {
            let idxA = sortedCats.indexOf(a);
            let idxB = sortedCats.indexOf(b);
            if (idxA === -1) idxA = 999;
            if (idxB === -1) idxB = 999;
            return idxA - idxB;
        });

        keys.forEach(cat => {
            const catDiv = document.createElement('div');
            catDiv.className = 'mb-4';
            catDiv.innerHTML = `<p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">${catLabels[cat] || cat}</p>`;

            categories[cat].forEach(s => {
                const isChecked = existingMap[s.id] !== undefined;
                const qty = existingMap[s.id] || 1;
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between gap-3 p-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 transition group';
                item.innerHTML = `
                            <label class="flex items-center gap-3 flex-1 cursor-pointer">
                                <input type="checkbox" class="pack-svc-cb rounded w-4 h-4 accent-slate-900" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-price="${s.base_price}" ${isChecked ? 'checked' : ''} onchange="_updatePackageMargin()">
                                <div>
                                    <p class="text-xs font-semibold text-slate-800">${escapeHtml(s.name)}</p>
                                    <p class="text-[10px] text-slate-500">Biaya modal: Rp ${s.base_price.toLocaleString('id-ID')}/unit</p>
                                </div>
                            </label>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <label class="text-[10px] text-slate-400">Jml:</label>
                                <input type="number" class="pack-svc-qty w-14 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-slate-400" data-id="${s.id}" value="${qty}" min="1" oninput="_updatePackageMargin()">
                            </div>
                        `;
                catDiv.appendChild(item);
            });
            picker.appendChild(catDiv);
        });

        _updatePackageMargin();
    } catch (err) {
        picker.innerHTML = `<p class="text-red-500 text-xs text-center py-4">Gagal memuat layanan: ${err.message}</p>`;
    }
}

async function _updatePackageMargin() {
    // Collect checked services
    const service_ids = [];
    const serviceItems = [];
    document.querySelectorAll('.pack-svc-cb:checked').forEach(cb => {
        const id = parseInt(cb.dataset.id);
        service_ids.push(id);

        const price = parseFloat(cb.dataset.price) || 0;
        const qtyInput = document.querySelector(`.pack-svc-qty[data-id="${id}"]`);
        const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;

        const s = _allServicesForPicker.find(x => x.id === id);
        if (s) {
            serviceItems.push({
                service_id: s.id,
                name: s.name,
                price: s.base_price,
                qty: qty
            });
        }
    });

    // Update hidden desc for save
    document.getElementById('pack-modal-desc').value = JSON.stringify(serviceItems);

    // Collect checked sessions
    const session_ids = Array.from(document.querySelectorAll('.pack-session-cb:checked')).map(cb => parseInt(cb.value));

    const fg_count = parseInt(document.getElementById('pack-modal-fg').value) || 0;
    const vg_count = parseInt(document.getElementById('pack-modal-vg').value) || 0;

    // Call estimate API
    let estimasi_modal_jasa = 0;
    let modal_produk = 0;
    try {
        const res = await fetch('/api/packages/calculate-estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_ids, service_items: serviceItems, session_ids, fg_count, vg_count })
        });
        const data = await res.json();
        if (data.success) {
            estimasi_modal_jasa = data.estimasi_modal_jasa;
            modal_produk = data.modal_produk;
        }
    } catch (e) {
        console.error(e);
    }

    const operationalCost = parseFloat(document.getElementById('pack-modal-operational').value) || 0;
    const sellPrice = parseFloat(document.getElementById('pack-modal-price').value) || 0;
    const totalExpense = modal_produk + estimasi_modal_jasa + operationalCost;
    const margin = sellPrice - totalExpense;

    document.getElementById('pack-modal-cost').innerText = `Rp ${totalExpense.toLocaleString('id-ID')} (incl. Ops)`;
    document.getElementById('pack-modal-sell').innerText = `Rp ${sellPrice.toLocaleString('id-ID')}`;

    const marginEl = document.getElementById('pack-modal-margin');
    marginEl.innerText = `Rp ${Math.abs(margin).toLocaleString('id-ID')}${margin < 0 ? ' (RUGI)' : ''}`;
    marginEl.className = margin >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold';
}



function closePackageModal() {
    document.getElementById('pack-modal').classList.add('hidden');
}

function previewPackage(id) {
    const p = allPackages.find(pack => pack.id == id);
    if (!p) return;
    document.getElementById('preview-pack-name').innerText = p.package_name;
    document.getElementById('preview-pack-price').innerText = `Rp ${p.price.toLocaleString('id-ID')}`;
    document.getElementById('preview-pack-fg').innerText = p.required_fg;
    document.getElementById('preview-pack-vg').innerText = p.required_vg;

    const descSection = document.getElementById('preview-pack-desc-section');
    let serviceItems = [];
    try { serviceItems = JSON.parse(p.description || '[]'); } catch (e) { serviceItems = []; }

    if (Array.isArray(serviceItems) && serviceItems.length > 0) {
        // Show structured service list
        document.getElementById('preview-pack-desc').innerHTML = serviceItems.map(s =>
            `<div class="flex justify-between py-1 border-b border-slate-100 last:border-0">
                        <span>${escapeHtml(s.name)}</span>
                        <span class="font-bold text-slate-700">${s.qty} unit · Rp ${(s.price * s.qty).toLocaleString('id-ID')}</span>
                    </div>`
        ).join('');
        descSection.classList.remove('hidden');
    } else if (p.description && p.description.trim()) {
        document.getElementById('preview-pack-desc').innerText = p.description;
        descSection.classList.remove('hidden');
    } else {
        descSection.classList.add('hidden');
    }
    document.getElementById('pack-preview-modal').classList.remove('hidden');
}

function closePackPreview() {
    document.getElementById('pack-preview-modal').classList.add('hidden');
}

async function savePackage(e) {
    e.preventDefault();
    const id = document.getElementById('pack-modal-id').value;
    const package_name = document.getElementById('pack-modal-name').value;
    const price = document.getElementById('pack-modal-price').value;
    const required_fg = document.getElementById('pack-modal-fg').value;
    const required_vg = document.getElementById('pack-modal-vg').value;
    const operational_cost = document.getElementById('pack-modal-operational').value;
    const is_negotiable = document.getElementById('pack-modal-negotiable').checked ? 1 : 0;
    const is_active = parseInt(document.getElementById('pack-modal-active').value);
    const description = document.getElementById('pack-modal-desc').value;

    const session_ids = Array.from(document.querySelectorAll('.pack-session-cb:checked')).map(cb => parseInt(cb.value));

    try {
        const url = id ? `/api/packages/${id}` : '/api/packages';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package_name, description, price, required_fg, required_vg, is_negotiable, operational_cost, is_active, session_ids })
        });

        if (!res.ok) throw new Error('Gagal menyimpan paket');
        closePackageModal();
        loadPackages();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deletePackage(id) {
    if (!confirm('Hapus paket ini?')) return;
    try {
        const res = await fetch(`${API_URL}/packages/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus paket');
        loadPackages();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}


// --- SECTION 5: FINANCIAL REPORTS (NEW) ---
function toggleFinMonth() {
    const type = document.getElementById('fin-report-type').value;
    document.getElementById('fin-month-wrap').classList.toggle('hidden', type === 'yearly');
}

function initFinYearSelect() {
    const sel = document.getElementById('fin-report-year');
    const now = new Date();
    const currentYear = now.getFullYear();
    sel.innerHTML = '';
    for (let y = currentYear; y >= currentYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.innerText = y;
        if (y === currentYear) opt.selected = true;
        sel.appendChild(opt);
    }
    // Set current month
    document.getElementById('fin-report-month').value = now.getMonth() + 1;
}

async function loadFinancialReport() {
    const type = document.getElementById('fin-report-type').value;
    const month = document.getElementById('fin-report-month').value;
    const year = document.getElementById('fin-report-year').value;
    const fmt = v => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

    try {
        const res = await fetch(`${API_URL}/reports/financial?type=${type}&month=${month}&year=${year}`);
        if (!res.ok) throw new Error('Gagal memuat laporan keuangan');
        const data = await res.json();

        // ── Period info ────────────────────────────────────────────
        document.getElementById('fin-period-label').textContent = data.period?.label || '—';
        document.getElementById('fin-period-dates').textContent = data.period ? `(${data.period.startDate} s/d ${data.period.endDate})` : '';
        const closedBadge = document.getElementById('fin-period-closed-badge');
        if (data.period?.isClosed) {
            closedBadge.classList.remove('hidden');
            closedBadge.textContent = `🔒 Periode Dikunci — ${data.period.closedAt ? new Date(data.period.closedAt).toLocaleDateString('id-ID') : ''}`;
        } else {
            closedBadge.classList.add('hidden');
        }

        // ── KPI Cards ──────────────────────────────────────────────
        document.getElementById('fin-total-revenue').textContent = fmt(data.kasMasuk);
        document.getElementById('fin-kas-dp').textContent = fmt(data.kasDP);
        document.getElementById('fin-kas-final').textContent = fmt(data.kasFinal);
        document.getElementById('fin-piutang').textContent = fmt(data.piutang);
        document.getElementById('fin-nilai-kontrak').textContent = fmt(data.nilaiKontrak);
        document.getElementById('fin-total-expenses').textContent = fmt(data.totalExpense);
        document.getElementById('fin-total-diskon').textContent = fmt(data.totalDiskon);
        document.getElementById('fin-net-profit').textContent = fmt(data.labaKotor);
        document.getElementById('fin-laba-proyeksi').textContent = fmt(data.labaProyeksi);
        document.getElementById('fin-capital-balance').textContent = fmt(data.saldoModal);
        document.getElementById('fin-minimum-capital').textContent = fmt(data.minimumCapital);
        document.getElementById('fin-total-withdrawals').textContent = fmt(data.totalWithdrawals);
        document.getElementById('fin-available-withdrawal').textContent = fmt(data.availableForWithdrawal);

        // Color laba bersih based on positive/negative
        const labaNeg = (data.labaKotor || 0) < 0;
        document.getElementById('fin-net-profit').className = `serif-title text-lg font-extrabold mt-2 ${labaNeg ? 'text-red-400' : 'text-emerald-400'}`;

        // ── Expense Breakdown ──────────────────────────────────────
        document.getElementById('fin-exp-postprod').textContent = fmt(data.breakdown?.post_prod);
        document.getElementById('fin-exp-album').textContent = fmt(data.breakdown?.album);
        document.getElementById('fin-exp-frame').textContent = fmt(data.breakdown?.frame);
        document.getElementById('fin-exp-logistics').textContent = fmt(data.breakdown?.logistics);
        document.getElementById('fin-exp-staff').textContent = fmt(data.breakdown?.staff_fee);
        document.getElementById('fin-exp-total').textContent = fmt(data.totalExpense);

        // ── Withdrawals list ───────────────────────────────────────
        const wList = document.getElementById('withdrawals-list');
        wList.innerHTML = '';
        if (!data.withdrawals || data.withdrawals.length === 0) {
            wList.innerHTML = '<p class="text-slate-400 text-center py-4 text-xs">Belum ada penarikan pada periode ini</p>';
        } else {
            data.withdrawals.forEach(w => {
                const typeMap = { dividend: 'Dividen', operational: 'Operasional', capital_return: 'Bagi Modal', other: 'Lainnya' };
                const div = document.createElement('div');
                div.className = 'flex justify-between items-center p-2.5 bg-slate-50 rounded-xl';
                div.innerHTML = `
                            <div>
                                <p class="font-bold text-slate-800 text-xs">${fmt(w.amount)}</p>
                                <p class="text-[10px] text-slate-400">${typeMap[w.withdrawal_type] || w.withdrawal_type} · ${w.recipient || ''} · ${w.withdrawal_date || ''}</p>
                                ${w.description ? `<p class="text-[10px] text-slate-500">${escapeHtml(w.description)}</p>` : ''}
                            </div>
                            <button onclick="deleteWithdrawal(${w.id})" class="text-red-400 hover:text-red-600 text-[10px] font-bold transition ml-2">✕</button>
                        `;
                wList.appendChild(div);
            });
        }

        // ── Per-Booking Table ──────────────────────────────────────
        const tbody = document.getElementById('fin-table-body');
        const tfoot = document.getElementById('fin-table-footer');
        tbody.innerHTML = '';

        if (!data.bookings || data.bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Tidak ada booking pada periode ini</td></tr>';
            tfoot.classList.add('hidden');
            document.getElementById('fin-table-count').textContent = '';
        } else {
            document.getElementById('fin-table-count').textContent = `${data.bookings.length} proyek`;
            const payColors = {
                'Lunas': 'bg-emerald-50 text-emerald-700',
                'Menunggu DP': 'bg-blue-50 text-blue-700',
                'Menunggu Pelunasan': 'bg-purple-50 text-purple-700',
                'DP Hangus': 'bg-red-50 text-red-700'
            };
            data.bookings.forEach(b => {
                const kasMasukB = (b.dp_paid_amount || 0) + (b.final_paid_amount || 0);
                const totalExpB = (b.post_prod_expense || 0) + (b.expense_album || 0) + (b.expense_frame || 0) + (b.expense_logistics || 0) + (b.expense_staff_fee || 0);
                const labaB = kasMasukB - totalExpB;
                const payColor = payColors[b.payment_status] || 'bg-slate-100 text-slate-600';
                const labaColor = labaB < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold';
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition';
                tr.innerHTML = `
                            <td class="p-3">
                                <div class="font-semibold text-slate-800">${escapeHtml(b.client_name)}</div>
                                <div class="text-[10px] text-slate-400">${formatDate ? formatDate(b.event_date) : b.event_date}</div>
                            </td>
                            <td class="p-3 text-slate-500 max-w-[100px] truncate" title="${escapeHtml(b.package_name || '')}">${escapeHtml(b.package_name || '-')}</td>
                            <td class="p-3 text-right text-slate-700">${fmt(b.total_deal_price)}</td>
                            <td class="p-3 text-right text-slate-600">${fmt(b.dp_paid_amount)}</td>
                            <td class="p-3 text-right text-slate-600">${fmt(b.final_paid_amount)}</td>
                            <td class="p-3 text-right font-semibold text-slate-900">${fmt(kasMasukB)}</td>
                            <td class="p-3 text-right text-red-500">${fmt(totalExpB)}</td>
                            <td class="p-3 text-right ${labaColor}">${fmt(labaB)}</td>
                            <td class="p-3 text-center"><span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${payColor}">${b.payment_status}</span></td>
                        `;
                tbody.appendChild(tr);
            });

            // Footer totals
            tfoot.classList.remove('hidden');
            document.getElementById('fin-foot-kontrak').textContent = fmt(data.nilaiKontrak);
            document.getElementById('fin-foot-dp').textContent = fmt(data.kasDP);
            document.getElementById('fin-foot-final').textContent = fmt(data.kasFinal);
            document.getElementById('fin-foot-kas').textContent = fmt(data.kasMasuk);
            document.getElementById('fin-foot-exp').textContent = fmt(data.totalExpense);
            document.getElementById('fin-foot-laba').textContent = fmt(data.labaKotor);
        }

        // Load settings
        await loadFinancialSettings();
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    }
}

async function loadWithdrawals() {
    // Now handled inside loadFinancialReport; kept as stub for backward compat
}

async function loadFinancialSettings() {
    try {
        const res = await fetch(`${API_URL}/financial-settings`);
        if (!res.ok) return;
        const s = await res.json();
        document.getElementById('fin-min-capital-input').value = s.minimum_capital || 0;
        document.getElementById('fin-business-name').value = s.business_name || '';
        document.getElementById('fin-bank-account').value = s.bank_account || '';
        document.getElementById('fin-minimum-capital').textContent = 'Rp ' + Number(s.minimum_capital || 0).toLocaleString('id-ID');
    } catch (err) {
        console.error('Error loading financial settings:', err);
    }
}

async function saveFinancialSettings() {
    const minimum_capital = parseFloat(document.getElementById('fin-min-capital-input').value) || 0;
    const business_name = document.getElementById('fin-business-name').value.trim();
    const bank_account = document.getElementById('fin-bank-account').value.trim();
    try {
        const res = await fetch(`${API_URL}/financial-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minimum_capital, business_name, bank_account })
        });
        if (!res.ok) throw new Error('Gagal menyimpan pengaturan');
        alert('✓ Pengaturan keuangan berhasil disimpan!');
        await loadFinancialSettings();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function openWithdrawalModal() {
    // Build inline modal
    const existing = document.getElementById('_withdrawal-inline-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = '_withdrawal-inline-modal';
    modal.className = 'fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4';
    modal.innerHTML = `
                <div class="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-5">
                    <div class="flex justify-between items-center">
                        <h3 class="serif-title text-xl font-bold text-slate-900">💸 Tarik Dana</h3>
                        <button onclick="document.getElementById('_withdrawal-inline-modal').remove()" class="text-slate-400 hover:text-slate-700 text-2xl">&times;</button>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Jumlah (Rp)</label>
                            <input type="number" id="_wd-amount" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:border-slate-900" placeholder="0">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Jenis Penarikan</label>
                            <select id="_wd-type" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-slate-50 focus:outline-none">
                                <option value="dividend">Dividen / Bagi Hasil</option>
                                <option value="operational">Biaya Operasional</option>
                                <option value="capital_return">Pengembalian Modal</option>
                                <option value="other">Lainnya</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Penerima</label>
                            <input type="text" id="_wd-recipient" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-slate-50 focus:outline-none" placeholder="Nama penerima">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Keterangan</label>
                            <input type="text" id="_wd-desc" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-slate-50 focus:outline-none" placeholder="Contoh: Operasional Juni 2026">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Tanggal</label>
                            <input type="date" id="_wd-date" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-slate-50 focus:outline-none" value="${new Date().toISOString().slice(0, 10)}">
                        </div>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button onclick="submitWithdrawal()" class="flex-1 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition">Simpan Penarikan</button>
                        <button onclick="document.getElementById('_withdrawal-inline-modal').remove()" class="px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition">Batal</button>
                    </div>
                </div>
            `;
    document.body.appendChild(modal);
}

async function submitWithdrawal() {
    const amount = parseFloat(document.getElementById('_wd-amount').value);
    const withdrawal_type = document.getElementById('_wd-type').value;
    const recipient = document.getElementById('_wd-recipient').value.trim();
    const description = document.getElementById('_wd-desc').value.trim();
    const withdrawal_date = document.getElementById('_wd-date').value;

    if (!amount || amount <= 0) { alert('Masukkan jumlah yang valid!'); return; }
    if (!withdrawal_date) { alert('Masukkan tanggal penarikan!'); return; }

    try {
        const res = await fetch(`${API_URL}/financial/withdrawal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ withdrawal_type, amount, description, recipient, withdrawal_date })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal menarik dana');
        }
        document.getElementById('_withdrawal-inline-modal').remove();
        alert('✓ Penarikan dana berhasil dicatat!');
        await loadFinancialReport();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteWithdrawal(id) {
    if (!confirm('Hapus catatan penarikan ini?')) return;
    try {
        const res = await fetch(`${API_URL}/financial/withdrawal/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus');
        await loadFinancialReport();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function openClosePeriodModal() {
    const type = document.getElementById('fin-report-type').value;
    const month = document.getElementById('fin-report-month').value;
    const year = document.getElementById('fin-report-year').value;
    const label = document.getElementById('fin-period-label').textContent || `${type} ${year}`;

    if (!confirm(`🔒 Tutup Buku: ${label}\n\nTindakan ini akan:\n• Menyimpan snapshot angka keuangan periode ini\n• Menandai periode sebagai SELESAI / DIKUNCI\n\nData booking TIDAK dihapus dan TIDAK diubah.\nAnda masih bisa melihat laporan periode ini kapan saja.\n\nLanjutkan?`)) return;

    fetch(`${API_URL}/financial/close-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, month: parseInt(month), year: parseInt(year) })
    }).then(async res => {
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal menutup buku');
        }
        alert(`✓ Buku ${label} berhasil ditutup & dikunci!`);
        await loadFinancialReport();
    }).catch(err => alert('Error: ' + err.message));
}

function exportFinancialReport() {
    const type = document.getElementById('fin-report-type').value;
    const month = document.getElementById('fin-report-month').value;
    const year = document.getElementById('fin-report-year').value;
    window.open(`${API_URL}/reports/financial/export?type=${type}&month=${month}&year=${year}`, '_blank');
}


// --- SECTION 6: GLOBAL SETTINGS ---
function switchSettingsTab(tab) {
    ['profile', 'wa', 'libur', 'operasional', 'keuangan'].forEach(t => {
        const btn = document.getElementById('stab-btn-' + t);
        const panel = document.getElementById('stab-' + t);
        if (btn) {
            if (t === tab) {
                btn.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-white shadow text-slate-900 transition';
            } else {
                btn.className = 'px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 transition';
            }
        }
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'profile') loadStudioProfile();
    else if (tab === 'wa') loadWaTemplates();
    else if (tab === 'libur') loadBlockedDates();
    else if (tab === 'operasional') loadGlobalSettings();
    else if (tab === 'keuangan') loadFinancialSettings();
}

async function loadStudioProfile() {
    try {
        const res = await fetch(`${API_URL}/studio-profile`);
        if (!res.ok) throw new Error('Gagal memuat profil studio');
        const data = await res.json();
        document.getElementById('prof-studio-name').value = data.studio_name || '';
        document.getElementById('prof-tagline').value = data.tagline || '';
        document.getElementById('prof-whatsapp').value = data.whatsapp_number || '';
        document.getElementById('prof-email').value = data.email || '';
        document.getElementById('prof-address').value = data.address || '';
        document.getElementById('prof-instagram').value = data.instagram || '';
        document.getElementById('prof-website').value = data.website || '';
        document.getElementById('prof-logo-url').value = data.logo_url || '';

        if (data.logo_url) {
            document.getElementById('prof-logo-preview').src = data.logo_url;
            document.getElementById('prof-logo-preview').classList.remove('hidden');
            document.getElementById('prof-logo-placeholder').classList.add('hidden');
        } else {
            document.getElementById('prof-logo-preview').classList.add('hidden');
            document.getElementById('prof-logo-placeholder').classList.remove('hidden');
        }
    } catch (err) {
        console.error('Error loading studio profile:', err);
    }
}

async function previewAndUploadLogo(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Client-side quick preview
    const reader = new FileReader();
    reader.onload = function (e) {
        document.getElementById('prof-logo-preview').src = e.target.result;
        document.getElementById('prof-logo-preview').classList.remove('hidden');
        document.getElementById('prof-logo-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Upload to server
    const formData = new FormData();
    formData.append('logo', file);

    try {
        const res = await fetch(`${API_URL}/studio-profile/logo`, {
            method: 'POST',
            body: formData
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Gagal mengupload logo');

        document.getElementById('prof-logo-url').value = resData.logo_url;
        alert('✓ Logo studio berhasil diupload dan dikompres!');
    } catch (err) {
        alert('Gagal mengupload logo: ' + err.message);
        // Reset preview if upload failed
        const oldLogo = document.getElementById('prof-logo-url').value;
        if (oldLogo) {
            document.getElementById('prof-logo-preview').src = oldLogo;
        } else {
            document.getElementById('prof-logo-preview').classList.add('hidden');
            document.getElementById('prof-logo-placeholder').classList.remove('hidden');
        }
    }
}

async function saveStudioProfile() {
    const body = {
        studio_name: document.getElementById('prof-studio-name').value.trim(),
        tagline: document.getElementById('prof-tagline').value.trim(),
        whatsapp_number: document.getElementById('prof-whatsapp').value.trim(),
        email: document.getElementById('prof-email').value.trim(),
        address: document.getElementById('prof-address').value.trim(),
        instagram: document.getElementById('prof-instagram').value.trim(),
        website: document.getElementById('prof-website').value.trim(),
        logo_url: document.getElementById('prof-logo-url').value.trim()
    };

    try {
        const res = await fetch(`${API_URL}/studio-profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Gagal memperbarui profil studio');
        alert('✓ Profil studio berhasil disimpan!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function safeDecodeTemplate(val) {
    if (!val) return '';
    try { return decodeURIComponent(val); } catch (e) { return val; }
}

async function loadWaTemplates() {
    try {
        const res = await fetch(`${API_URL}/global-settings`);
        if (!res.ok) throw new Error('Gagal memuat template WhatsApp');
        const data = await res.json();

        document.getElementById('wa-temp-booking').value = safeDecodeTemplate(data.wa_template_booking);
        document.getElementById('wa-temp-h3-client').value = safeDecodeTemplate(data.wa_template_h3_client);
        document.getElementById('wa-temp-h1-crew').value = safeDecodeTemplate(data.wa_template_h1_crew);
        document.getElementById('wa-temp-crew-assignment').value = safeDecodeTemplate(data.wa_template_crew_assignment);
    } catch (err) {
        console.error('Error loading WA templates:', err);
    }
}

async function saveWaTemplates() {
    // Store plain text - JSON handles all special chars natively
    const body = {
        wa_template_booking: document.getElementById('wa-temp-booking').value,
        wa_template_h3_client: document.getElementById('wa-temp-h3-client').value,
        wa_template_h1_crew: document.getElementById('wa-temp-h1-crew').value,
        wa_template_crew_assignment: document.getElementById('wa-temp-crew-assignment').value
    };

    try {
        const res = await fetch(`${API_URL}/global-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Gagal menyimpan template WhatsApp');
        }
        alert('✓ Template WhatsApp berhasil disimpan!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function insertPlaceholder(textareaId, placeholder) {
    const el = document.getElementById(textareaId);
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    el.value = val.substring(0, start) + placeholder + val.substring(end);
    el.focus();
    el.selectionStart = el.selectionEnd = start + placeholder.length;
}

async function loadBlockedDates() {
    const list = document.getElementById('blocked-dates-list');
    if (!list) return;
    list.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400 text-xs">Memuat data...</td></tr>`;
    try {
        const res = await fetch(`${API_URL}/blocked-dates`);
        if (!res.ok) throw new Error('Gagal memuat tanggal terblokir');
        const data = await res.json();
        if (data.length === 0) {
            list.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400 text-xs">Tidak ada tanggal terblokir</td></tr>`;
            return;
        }
        list.innerHTML = data.map(d => {
            const formattedDate = new Date(d.blocked_date).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            return `
                <tr class="hover:bg-slate-50 transition text-xs">
                    <td class="py-3 pl-2 font-semibold text-slate-700">${escapeHtml(formattedDate)}</td>
                    <td class="py-3 text-slate-500">${escapeHtml(d.reason || '-')}</td>
                    <td class="py-3 pr-2 text-right">
                        <button onclick="deleteBlockedDate(${d.id})" class="text-xs font-bold text-red-500 hover:text-red-700 transition">Hapus</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-rose-500 text-xs">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function addBlockedDate() {
    const blocked_date = document.getElementById('block-date-input').value;
    const reason = document.getElementById('block-reason-input').value.trim();
    if (!blocked_date) {
        alert('Silakan pilih tanggal terlebih dahulu!');
        return;
    }
    try {
        const res = await fetch(`${API_URL}/blocked-dates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocked_date, reason })
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || 'Gagal memblokir tanggal');
        document.getElementById('block-date-input').value = '';
        document.getElementById('block-reason-input').value = '';
        alert('✓ Tanggal berhasil diblokir!');
        await loadBlockedDates();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteBlockedDate(id) {
    if (!confirm('Apakah Anda yakin ingin membuka blokir tanggal ini?')) return;
    try {
        const res = await fetch(`${API_URL}/blocked-dates/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Gagal membuka blokir tanggal');
        alert('✓ Tanggal berhasil dibuka blokir!');
        await loadBlockedDates();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function loadGlobalSettings() {
    try {
        const res = await fetch(`${API_URL}/global-settings`);
        const data = await res.json();
        document.getElementById('max-slots-input').value = data.max_slots_per_day;
    } catch (err) {
        console.error(err);
    }
}

async function saveGlobalSettings() {
    const val = parseInt(document.getElementById('max-slots-input').value);
    if (isNaN(val) || val < 1) {
        alert('Batas kuota minimal adalah 1 slot!');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/global-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_slots_per_day: val })
        });

        if (!res.ok) throw new Error('Gagal update settings');
        alert('✓ Kuota harian berhasil diperbarui!');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}


// --- SECTION 7: PORTFOLIO & UPLOAD FOTO (Fitur Lama yang Diintegrasikan) ---
async function loadClients() {
    try {
        const res = await fetch(`${API_URL}/clients`);
        allClients = await res.json();
        renderClients();
    } catch (err) {
        console.error('Error loading clients:', err);
        alert('Gagal memuat clients');
    }
}

function renderClients() {
    const container = document.getElementById('clients-container');
    container.innerHTML = '';

    if (allClients.length === 0) {
        container.innerHTML = '<p class="text-slate-500 col-span-full">Belum ada portofolio klien. Gunakan form di atas untuk menambahkan.</p>';
        return;
    }

    allClients.forEach(client => {
        const clientEl = document.createElement('div');
        clientEl.className = 'rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between';

        // Show link booking info if connected
        let bookingLinkInfo = '';
        if (client.booking_id) {
            bookingLinkInfo = `<span class="mt-1 block text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Linked Booking ID: #${client.booking_id}</span>`;
        }

        clientEl.innerHTML = `
                    <div>
                        <div class="flex items-start justify-between mb-4">
                            <div>
                                <h3 class="text-base font-bold text-slate-900 truncate pr-2 max-w-[180px]" title="${client.name}">${client.name}</h3>
                                <p class="text-xs text-slate-500 font-semibold mt-1">${client.location || '-'} • ${formatDate(client.event_date) || '-'}</p>
                                ${bookingLinkInfo}
                            </div>
                            <button onclick="deleteClient(${client.id})" class="text-red-600 hover:text-red-800 text-[10px] font-bold uppercase tracking-wider bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-xl transition">
                                Hapus
                            </button>
                        </div>
                        
                        ${client.description ? `<p class="text-xs text-slate-500 italic mb-4 line-clamp-2">"${client.description}"</p>` : ''}

                        <!-- Rating & testimonial from linked booking if available -->
                        ${client.rating ? `
                            <div class="mb-4 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs space-y-1">
                                <div class="flex items-center text-amber-400 font-bold">
                                    ${'★'.repeat(client.rating)}${'☆'.repeat(5 - client.rating)}
                                    <span class="ml-1 text-slate-500 font-medium text-[10px] uppercase">(${client.rating} Stars)</span>
                                </div>
                                <p class="text-slate-600 italic text-[11px] line-clamp-2">"${client.testimonial_text}"</p>
                            </div>
                        ` : ''}

                        <div class="mb-4 space-y-2">
                            <p class="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Foto Portofolio (${client.photos?.length || 0}/5)</p>
                            ${client.photos && client.photos.length > 0 ? `
                                <div class="flex flex-wrap gap-2">
                                    ${client.photos.map(photo => `
                                        <div class="relative group">
                                            <img src="${photo.url}" alt="Foto" class="h-16 w-16 rounded-xl object-cover border border-slate-150 shadow-sm">
                                            <button onclick="deletePhoto(${photo.id})" class="absolute -top-1.5 -right-1.5 hidden group-hover:flex bg-red-600 text-white w-5 h-5 rounded-full items-center justify-center text-[10px] shadow-sm">
                                                ×
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p class="text-xs text-slate-400">Belum ada foto. Silakan upload di bawah.</p>'}
                        </div>
                    </div>

                    <form class="upload-form mt-auto pt-4 border-t border-slate-100" data-client-id="${client.id}">
                        <input type="file" name="photos" multiple accept="image/*" required 
                            class="mb-3 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-900 hover:file:bg-slate-200 transition">
                        <button type="submit" class="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition">
                            Upload Foto
                        </button>
                    </form>
                `;
        container.appendChild(clientEl);
    });

    // Add upload form listeners
    document.querySelectorAll('.upload-form').forEach(form => {
        form.addEventListener('submit', handlePhotoUpload);
    });
}

async function createNewPortfolio(e) {
    e.preventDefault();
    const name = document.getElementById('client-name').value.trim();
    const location = document.getElementById('client-location').value.trim();
    const event_date = document.getElementById('client-date').value;
    const booking_id = document.getElementById('client-booking-id').value;

    try {
        const res = await fetch(`${API_URL}/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, location, event_date, description: document.getElementById('client-description').value.trim(), booking_id })
        });

        if (!res.ok) throw new Error('Gagal menambah portofolio client');
        alert('Portofolio Client berhasil dibuat! Silakan upload foto pada card di bawah.');
        document.getElementById('add-client-form').reset();
        loadClients();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function handlePhotoUpload(e) {
    e.preventDefault();
    const form = e.target;
    const clientId = form.dataset.clientId;
    const fileInput = form.querySelector('input[type="file"]');
    const files = fileInput.files;

    if (files.length === 0) {
        alert('Pilih minimal satu foto');
        return;
    }

    if (files.length > 5) {
        alert('Maksimal 5 foto per client.');
        return;
    }

    const formData = new FormData();
    for (let file of files) {
        formData.append('photos', file);
    }

    try {
        const res = await fetch(`${API_URL}/clients/${clientId}/photos`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload gagal');
        }

        alert('Foto portofolio berhasil diupload!');
        form.reset();
        loadClients();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deletePhoto(photoId) {
    if (!confirm('Hapus foto ini dari portofolio?')) return;
    try {
        const res = await fetch(`${API_URL}/photos/${photoId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus foto');
        alert('Foto berhasil dihapus!');
        loadClients();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteClient(clientId) {
    if (!confirm('Hapus portofolio client ini beserta semua fotonya?')) return;
    try {
        const res = await fetch(`${API_URL}/clients/${clientId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus portofolio client');
        alert('Portofolio client berhasil dihapus!');
        loadClients();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}


// --- SECTION 8: AUTH & GENERAL INITIALIZATION ---
async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (err) {
        console.error('Logout error:', err);
        alert('Gagal logout. Silakan refresh.');
    }
}

async function checkSession() {
    try {
        const res = await fetch('/api/check-session');
        if (!res.ok) {
            window.location.href = '/login.html';
        }
    } catch (err) {
        window.location.href = '/login.html';
    }
}

// Helper formatting functions
function formatDate(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
    }
    return dateString;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getWaMeLink(phoneNumber) {
    if (!phoneNumber) return '';
    let clean = phoneNumber.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    return `https://wa.me/${clean}`;
}

// --- ADMIN LOGIN MODAL ---
let adminToken = localStorage.getItem('admin_token') || '';

function openAdminLogin() {
    document.getElementById('admin-login-modal').classList.remove('hidden');
    document.getElementById('admin-login-error').classList.add('hidden');
    document.getElementById('admin-login-form').reset();
    if (adminToken) {
        document.getElementById('admin-login-error').innerText = 'Anda sudah login. Tekan Login untuk sesi baru.';
        document.getElementById('admin-login-error').className = 'text-xs text-amber-600 font-semibold';
        document.getElementById('admin-login-error').classList.remove('hidden');
    }
}

function closeAdminLogin() {
    document.getElementById('admin-login-modal').classList.add('hidden');
}

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-login-username').value.trim();
    const password = document.getElementById('admin-login-password').value;
    const errEl = document.getElementById('admin-login-error');
    errEl.classList.add('hidden');

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.innerText = data.error || 'Login gagal';
            errEl.className = 'text-xs text-red-500 font-semibold';
            errEl.classList.remove('hidden');
            return;
        }
        adminToken = data.token;
        localStorage.setItem('admin_token', adminToken);
        alert('Login berhasil! Sesi admin aktif.');
        closeAdminLogin();
    } catch (err) {
        errEl.innerText = 'Koneksi gagal. Coba lagi.';
        errEl.className = 'text-xs text-red-500 font-semibold';
        errEl.classList.remove('hidden');
    }
});

// Helper to add auth headers
function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (adminToken) h['Authorization'] = 'Bearer ' + adminToken;
    return h;
}

// On Load initialization
window.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    initFinYearSelect();
    await loadGlobalSettings();
    await loadPackages();
    await loadFreelancers();
    await loadBookings();
    await loadClients();
    loadDashboard();


});

// ================== V1.1 FRONTEND LOGIC — FIXED & POLISHED ================== //

// ── Pricing Sub-tab Switcher ──────────────────────────────────────────
function switchPricingTab(tab) {
    ['services', 'calculator'].forEach(t => {
        const btn = document.getElementById('ptab-btn-' + t);
        const panel = document.getElementById('ptab-' + t);
        if (btn) {
            if (t === tab) {
                btn.className = 'flex-1 px-4 py-2 rounded-xl text-xs font-bold bg-white shadow text-slate-900 transition';
            } else {
                btn.className = 'flex-1 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 transition';
            }
        }
        if (panel) panel.classList.toggle('hidden', t !== tab);
    });
    if (tab === 'services') loadServices();
    else if (tab === 'calculator') loadCalcServices();
}

// ── Services ─────────────────────────────────────────────────────────
let _allServices = [];
let currentServiceCategoryFilter = 'Output Fisik';

function filterServiceCategory(cat) {
    currentServiceCategoryFilter = cat;

    // Update button UI styles to match Sorehari's aesthetics
    const filterTypes = ['Output Fisik', 'Output Digital', 'Jasa'];
    filterTypes.forEach(t => {
        let btnId = '';
        if (t === 'Output Fisik') btnId = 'service-cat-fisik';
        else if (t === 'Output Digital') btnId = 'service-cat-digital';
        else if (t === 'Jasa') btnId = 'service-cat-jasa';

        const btn = document.getElementById(btnId);
        if (btn) {
            if (t === cat) {
                btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white shadow-sm text-slate-900 transition';
            } else {
                btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 transition';
            }
        }
    });

    renderServicesTable();
}

async function loadServices() {
    const tbody = document.getElementById('services-tbody');
    try {
        const res = await fetch('/api/services');
        const data = await res.json();
        _allServices = data.data || [];
        renderServicesTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Gagal memuat: ${err.message}</td></tr>`;
    }
}

function renderServicesTable() {
    const tbody = document.getElementById('services-tbody');
    tbody.innerHTML = '';

    const filtered = _allServices.filter(s => {
        if (currentServiceCategoryFilter === 'all') return true;
        return s.category === currentServiceCategoryFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Belum ada layanan di kategori ini.</td></tr>';
        return;
    }

    filtered.forEach(s => {
        const categoryColors = {
            'Output Fisik': 'bg-blue-50 text-blue-600',
            'Output Digital': 'bg-amber-50 text-amber-600',
            'Jasa': 'bg-purple-50 text-purple-600',
            'Produk Foto': 'bg-blue-50 text-blue-600',
            'Digital': 'bg-amber-50 text-amber-600'
        };
        const cc = categoryColors[s.category] || 'bg-slate-50 text-slate-600';
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition';
        tr.innerHTML = `
                    <td class="p-4 font-semibold text-slate-800">${escapeHtml(s.name)}</td>
                    <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cc}">${escapeHtml(s.category)}</span></td>
                    <td class="p-4 font-bold text-slate-700">Rp ${s.base_price.toLocaleString('id-ID')}</td>
                    <td class="p-4 text-right whitespace-nowrap">
                        <button onclick="editService(${s.id})" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 transition mr-1">Edit</button>
                        <button onclick="deleteService(${s.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition">Hapus</button>
                    </td>
                `;
        tbody.appendChild(tr);
    });
}

function openAddServiceModal() {
    document.getElementById('service-modal-title').innerText = 'Tambah Item Baru';
    document.getElementById('service-modal-id').value = '';
    document.getElementById('service-form').reset();
    document.getElementById('service-modal').classList.remove('hidden');
}

function editService(id) {
    const s = _allServices.find(item => item.id === id);
    if (!s) return;
    document.getElementById('service-modal-title').innerText = 'Edit Harga & Info Item';
    document.getElementById('service-modal-id').value = s.id;
    document.getElementById('service-modal-name').value = s.name;
    document.getElementById('service-modal-category').value = s.category;
    document.getElementById('service-modal-price').value = s.base_price;
    document.getElementById('service-modal-desc').value = s.description || '';
    document.getElementById('service-modal').classList.remove('hidden');
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.add('hidden');
}

async function saveService(e) {
    e.preventDefault();
    const id = document.getElementById('service-modal-id').value;
    const name = document.getElementById('service-modal-name').value.trim();
    const category = document.getElementById('service-modal-category').value;
    let base_price = parseFloat(document.getElementById('service-modal-price').value);
    const description = document.getElementById('service-modal-desc').value.trim();

    if (!name || isNaN(base_price)) { alert('Isi semua field yang wajib!'); return; }

    try {
        const url = id ? `/api/services/${id}` : '/api/services';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, base_price, description })
        });
        if (!res.ok) throw new Error('Gagal menyimpan layanan');
        closeServiceModal();
        loadServices();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteService(id) {
    if (!confirm('Hapus layanan ini? Layanan akan dinonaktifkan.')) return;
    try {
        const res = await fetch('/api/services/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus');
        loadServices();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ── Packages V11 ─────────────────────────────────────────────────────
async function loadPackagesV11() {
    const tbody = document.getElementById('packages-v11-tbody');
    try {
        const res = await fetch('/api/packages_v11');
        const data = await res.json();
        tbody.innerHTML = '';
        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Belum ada paket bundling. Buat paket baru.</td></tr>';
            return;
        }
        data.data.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition';
            tr.innerHTML = `
                        <td class="p-4 font-semibold text-slate-800">${escapeHtml(p.name)}${p.is_custom ? ' <span class="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold ml-1">Custom</span>' : ''}</td>
                        <td class="p-4 font-bold text-slate-700">Rp ${(p.total_price || 0).toLocaleString('id-ID')}</td>
                        <td class="p-4">${p.is_negotiable ? '<span class="text-emerald-600 font-bold">✓ Ya</span>' : '<span class="text-slate-400">Tidak</span>'}</td>
                        <td class="p-4 text-right">
                            <button onclick="deletePackageV11(${p.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition">Hapus</button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Gagal memuat: ${err.message}</td></tr>`;
    }
}

function openAddPackageV11Modal() {
    document.getElementById('pkg-v11-modal-id').value = '';
    document.getElementById('package-v11-form').reset();
    document.getElementById('package-v11-modal').classList.remove('hidden');
}

function closePackageV11Modal() {
    document.getElementById('package-v11-modal').classList.add('hidden');
}

async function savePackageV11(e) {
    e.preventDefault();
    const name = document.getElementById('pkg-v11-modal-name').value.trim();
    const description = document.getElementById('pkg-v11-modal-desc').value.trim();
    const is_negotiable = document.getElementById('pkg-v11-modal-negotiable').checked ? 1 : 0;
    const is_custom = document.getElementById('pkg-v11-modal-custom').checked ? 1 : 0;

    if (!name) { alert('Nama paket wajib diisi!'); return; }
    try {
        const res = await fetch('/api/packages_v11', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, is_negotiable, is_custom, services: [] })
        });
        if (!res.ok) throw new Error('Gagal menyimpan paket');
        closePackageV11Modal();
        loadPackagesV11();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deletePackageV11(id) {
    if (!confirm('Hapus paket ini?')) return;
    try {
        const res = await fetch('/api/packages_v11/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Gagal menghapus paket');
        loadPackagesV11();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ── Calculator ───────────────────────────────────────────────────────
async function loadCalcServices() {
    const list = document.getElementById('calc-services-list');
    try {
        const res = await fetch('/api/services');
        const data = await res.json();
        list.innerHTML = '';
        if (!data.data || data.data.length === 0) {
            list.innerHTML = '<p class="text-slate-400 text-xs text-center py-4">Belum ada layanan untuk dihitung. Tambah layanan terlebih dahulu.</p>';
            return;
        }
        data.data.forEach(s => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl';
            div.innerHTML = `
                        <label class="flex items-center gap-3 flex-1 cursor-pointer">
                            <input type="checkbox" class="calc-svc-cb rounded" value="${s.id}">
                            <div>
                                <p class="text-xs font-semibold text-slate-800">${escapeHtml(s.name)}</p>
                                <p class="text-[10px] text-slate-500">Rp ${s.base_price.toLocaleString('id-ID')} / unit</p>
                            </div>
                        </label>
                        <div class="flex items-center gap-2">
                            <label class="text-[10px] text-slate-500">Qty:</label>
                            <input type="number" id="calc-qty-${s.id}" value="1" min="1" class="w-14 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-slate-400">
                        </div>
                    `;
            list.appendChild(div);
        });
    } catch (err) {
        list.innerHTML = `<p class="text-red-500 text-xs text-center py-4">Gagal memuat: ${err.message}</p>`;
    }
}

async function calculateSelectedServices() {
    const checked = document.querySelectorAll('.calc-svc-cb:checked');
    if (checked.length === 0) { alert('Pilih minimal satu layanan terlebih dahulu!'); return; }
    const services = Array.from(checked).map(cb => ({
        service_id: cb.value,
        quantity: parseInt(document.getElementById('calc-qty-' + cb.value).value) || 1
    }));
    try {
        const res = await fetch('/api/packages_v11/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ services })
        });
        const data = await res.json();
        document.getElementById('calc-total').innerText = 'Rp ' + (data.total_price || 0).toLocaleString('id-ID');
    } catch (err) {
        alert('Gagal menghitung: ' + err.message);
    }
}

// ── Payment V1.1 ─────────────────────────────────────────────────────
async function loadPaymentV11() {
    const tbody = document.getElementById('payment-v11-tbody');
    const filterStatus = document.getElementById('pay-v11-filter') ? document.getElementById('pay-v11-filter').value : '';
    try {
        const res = await fetch('/api/bookings');
        if (!res.ok) throw new Error('Gagal memuat bookings');
        const bookings = await res.json();
        allBookings = bookings;

        // Filter by status
        const filtered = filterStatus ? bookings.filter(b => b.payment_status === filterStatus) : bookings;

        const countEl = document.getElementById('pay-v11-count');
        if (countEl) countEl.innerText = `${filtered.length} transaksi`;

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Tidak ada transaksi dengan filter ini.</td></tr>';
            return;
        }

        filtered.forEach(b => {
            const payColors = {
                'Menunggu DP': 'bg-blue-50 text-blue-600 border-blue-200',
                'Menunggu Pelunasan': 'bg-purple-50 text-purple-600 border-purple-200',
                'Lunas': 'bg-emerald-50 text-emerald-600 border-emerald-200',
                'DP Hangus': 'bg-red-50 text-red-600 border-red-200'
            };
            const pc = payColors[b.payment_status] || 'bg-slate-50 text-slate-600 border-slate-200';

            // Only show relevant action buttons based on status
            let actionBtns = '';
            if (b.payment_status === 'Menunggu DP') {
                actionBtns = `<button onclick="openPaymentModal(${b.id}, 'dp')" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition whitespace-nowrap">✓ Konfirmasi DP</button>`;
            } else if (b.payment_status === 'Menunggu Pelunasan') {
                actionBtns = `<button onclick="openPaymentModal(${b.id}, 'final')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition whitespace-nowrap">✓ Konfirmasi Lunas</button>`;
            } else if (b.payment_status === 'Lunas') {
                actionBtns = `<span class="text-[10px] text-emerald-600 font-bold whitespace-nowrap">✓ Selesai</span>`;
            } else if (b.payment_status === 'DP Hangus') {
                actionBtns = `<span class="text-[10px] text-red-500 font-bold whitespace-nowrap">Dibatalkan</span>`;
            }

            let printInvoiceBtn = '';
            if (b.payment_status !== 'Menunggu DP') {
                printInvoiceBtn = `<button onclick="openClientInvoiceModal(${b.id})" class="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold hover:bg-amber-100 transition text-[10px] uppercase tracking-wider whitespace-nowrap">Cetak Invoice</button>`;
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition';
            tr.innerHTML = `
                        <td class="p-4">
                            <div class="font-semibold text-slate-800 whitespace-nowrap">${escapeHtml(b.client_name)}</div>
                            <div class="text-[10px] text-slate-500 whitespace-nowrap">${b.client_phone || '-'}</div>
                        </td>
                        <td class="p-4 text-slate-600 whitespace-nowrap">${formatDate(b.event_date)}</td>
                        <td class="p-4 font-bold text-slate-700 whitespace-nowrap">Rp ${(b.total_deal_price || 0).toLocaleString('id-ID')}</td>
                        <td class="p-4 text-emerald-700 font-semibold whitespace-nowrap">Rp ${(b.dp_paid_amount || b.dp_claimed_amount || 0).toLocaleString('id-ID')}</td>
                        <td class="p-4 whitespace-nowrap"><span class="px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${pc}">${b.payment_status}</span></td>
                        <td class="p-4 text-right"><div class="inline-flex items-center gap-1.5 justify-end flex-nowrap whitespace-nowrap"><button onclick="openBookingDetailModal(${b.id})" class="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold hover:bg-indigo-100 transition text-[10px] uppercase tracking-wider whitespace-nowrap">Preview</button>${printInvoiceBtn}${actionBtns}</div></td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500">Gagal memuat: ${err.message}</td></tr>`;
    }
}

// ── Audit Log ────────────────────────────────────────────────────────
async function loadAuditLogs() {
    const tbody = document.getElementById('audit-tbody');
    const table = document.getElementById('audit-table-filter').value;
    try {
        const res = await fetch('/api/audit?table=' + encodeURIComponent(table) + '&limit=100');
        if (!res.ok) throw new Error('Gagal memuat audit log');
        const data = await res.json();

        const countEl = document.getElementById('audit-count');
        if (countEl) countEl.innerText = data.data ? `${data.data.length} entri` : '';

        tbody.innerHTML = '';
        if (!data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Belum ada entri audit log.</td></tr>';
            return;
        }

        const actionColors = {
            INSERT: 'bg-emerald-50 text-emerald-700',
            UPDATE: 'bg-amber-50 text-amber-700',
            DELETE: 'bg-red-50 text-red-700'
        };

        // Store audit data for modal access
        window._auditData = {};
        data.data.forEach((a, idx) => {
            window._auditData[idx] = a;
            const ac = actionColors[a.action] || 'bg-slate-50 text-slate-700';
            const timeStr = a.changed_at ? new Date(a.changed_at).toLocaleString('id-ID') : '-';
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition';
            tr.innerHTML = `
                        <td class="p-4 text-slate-600 whitespace-nowrap">${timeStr}</td>
                        <td class="p-4">
                            <span class="font-semibold text-slate-800">${escapeHtml(a.table_name)}</span>
                            <span class="ml-1 text-slate-400 text-[10px]">#${a.row_id}</span>
                        </td>
                        <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ac}">${escapeHtml(a.action)}</span></td>
                        <td class="p-4 text-slate-600">${escapeHtml(a.changed_by || 'system')}</td>
                        <td class="p-4 text-right">
                            <button onclick="openAuditDetailModal(${idx})" class="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 transition">Lihat Detail</button>
                        </td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Gagal memuat: ${err.message}</td></tr>`;
    }
}

function openAuditDetailModal(idx) {
    const a = window._auditData ? window._auditData[idx] : null;
    if (!a) return;
    try {
        const before = a.before_json ? JSON.stringify(JSON.parse(a.before_json), null, 2) : '(kosong)';
        const after = a.after_json ? JSON.stringify(JSON.parse(a.after_json), null, 2) : '(kosong)';
        document.getElementById('audit-before-json').innerText = before;
        document.getElementById('audit-after-json').innerText = after;
    } catch (e) {
        document.getElementById('audit-before-json').innerText = a.before_json || '(kosong)';
        document.getElementById('audit-after-json').innerText = a.after_json || '(kosong)';
    }
    document.getElementById('audit-detail-modal').classList.remove('hidden');
}

function closeAuditDetailModal() {
    document.getElementById('audit-detail-modal').classList.add('hidden');
}

// ── Gaji & Fee Freelancer (Disbursements) ────────────────────────────
let _allDisbursements = [];

async function loadDisbursements() {
    const filterSelect = document.getElementById('disb-status-filter');
    const filterStatus = filterSelect ? filterSelect.value : '';
    const tbody = document.getElementById('disb-tbody');
    try {
        // Fetch stats/summary
        const summaryRes = await fetch('/api/disbursements/summary');
        const summaryData = await summaryRes.json();
        if (summaryData.success) {
            const s = summaryData.data;
            document.getElementById('disb-total-count').innerText = s.total || 0;
            document.getElementById('disb-pending-count').innerText = s.pending_count || 0;
            document.getElementById('disb-paid-count').innerText = s.paid_count || 0;
            document.getElementById('disb-total-unpaid').innerText = 'Rp ' + (s.total_unpaid || 0).toLocaleString('id-ID');
            document.getElementById('disb-total-paid').innerText = 'Rp ' + (s.total_paid || 0).toLocaleString('id-ID');
            document.getElementById('disb-total-unpaid-amount').innerText = 'Rp ' + (s.total_unpaid || 0).toLocaleString('id-ID');
        }

        // Fetch disbursement list
        let url = '/api/disbursements';
        const filterValue = filterSelect ? filterSelect.value : '';
        if (filterValue) {
            url += '?status=' + filterValue;
        }
        const res = await fetch(url);
        const data = await res.json();
        let list = data.data || [];

        // Sort: unpaid first (by event_date ASC), paid last (by event_date ASC)
        list.sort((a, b) => {
            const aIsPaid = a.fee_status === 'Paid' ? 1 : 0;
            const bIsPaid = b.fee_status === 'Paid' ? 1 : 0;
            if (aIsPaid !== bIsPaid) return aIsPaid - bIsPaid;
            // Same payment status: sort by event_date ascending
            return new Date(a.event_date) - new Date(b.event_date);
        });

        _allDisbursements = list;

        const countEl = document.getElementById('disb-count-label');
        if (countEl) countEl.innerText = `${_allDisbursements.length} entri`;

        tbody.innerHTML = '';
        if (_allDisbursements.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Tidak ada data fee freelancer ditemukan.</td></tr>`;
            return;
        }

        let lastStatus = null;
        _allDisbursements.forEach((d, idx) => {
            const isPaid = d.fee_status === 'Paid';
            const currentStatus = isPaid ? 'paid' : 'unpaid';

            // Insert divider row when transitioning from unpaid to paid
            if (lastStatus === 'unpaid' && currentStatus === 'paid') {
                const dividerRow = document.createElement('tr');
                dividerRow.innerHTML = `
                    <td colspan="8" class="px-4 py-2 bg-slate-50 border-y border-slate-200">
                        <div class="flex items-center gap-2">
                            <div class="h-px flex-1 bg-slate-200"></div>
                            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">✓ Sudah Dibayar</span>
                            <div class="h-px flex-1 bg-slate-200"></div>
                        </div>
                    </td>`;
                tbody.appendChild(dividerRow);
            }
            lastStatus = currentStatus;


            const statusBadge = isPaid
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">✓ Sudah Dibayar</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Belum Dibayar</span>';

            const projectStatusColors = {
                'Pending': 'bg-slate-100 text-slate-700',
                'On Progress': 'bg-blue-50 text-blue-700',
                'Selesai': 'bg-emerald-50 text-emerald-700',
            };
            const pColor = projectStatusColors[d.project_status] || 'bg-slate-50 text-slate-600';

            const fileStatusColors = {
                'Belum Setor': 'bg-amber-50 text-amber-600 border-amber-200',
                'Sudah Setor': 'bg-emerald-50 text-emerald-600 border-emerald-200'
            };
            const fColor = fileStatusColors[d.file_status] || 'bg-slate-50 text-slate-600 border-slate-200';
            const fileBadge = `
                        <select onchange="updateFileStatus(${d.id}, this.value)" class="px-2 py-1 rounded text-[10px] font-bold border border-slate-200 bg-white cursor-pointer focus:outline-none transition ${fColor}">
                            <option value="Belum Setor" ${d.file_status === 'Belum Setor' ? 'selected' : ''}>Belum Setor</option>
                            <option value="Sudah Setor" ${d.file_status === 'Sudah Setor' ? 'selected' : ''}>Sudah Setor</option>
                        </select>
                    `;

            let actionBtn = '';
            if (!isPaid) {
                const canPay = d.file_status === 'Sudah Setor';
                const btnClass = canPay
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed";
                const btnDisabled = canPay ? "" : "disabled title=\"Freelancer belum setor file\"";

                actionBtn = `
                            <button onclick="openDisbPayModal(${d.id})" ${btnDisabled} class="px-3 py-1.5 rounded-lg ${btnClass} text-[10px] font-bold transition mr-1">Bayar Fee</button>
                            <button onclick="deleteDisb(${d.id})" class="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition">Hapus</button>
                        `;
            } else {
                actionBtn = `
                            <button onclick="openDisbReceiptModal(${d.id})" class="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold hover:bg-indigo-100 transition">Lihat Struk</button>
                        `;
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition';
            tr.innerHTML = `
                        <td class="p-4 font-semibold text-slate-900">
                            <div class="flex items-center gap-1.5">
                                <span>${escapeHtml(d.freelancer_name)}</span>
                                <a href="${getWaMeLink(d.freelancer_wa)}" target="_blank" class="inline-flex items-center justify-center p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 hover:border-emerald-300 transition animate-pulse" title="Kirim WhatsApp">
                                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.62.962 3.21 1.6 5.366 1.6 5.434 0 9.85-4.384 9.853-9.774.002-2.611-1.006-5.066-2.845-6.91C17.13 2.228 14.678.995 12.008.995c-5.44 0-9.857 4.387-9.86 9.778-.001 1.957.518 3.864 1.503 5.568L2.61 21.688l5.59-1.464-.553-.33z"/>
                                    </svg>
                                </a>
                            </div>
                        </td>
                        <td class="p-4 text-slate-800">
                            <div>${escapeHtml(d.client_name)}</div>
                            <div class="text-[10px] text-slate-400">${formatDate(d.event_date)}</div>
                        </td>
                        <td class="p-4 font-medium text-slate-600">${escapeHtml(d.role)}</td>
                        <td class="p-4 font-bold text-slate-950">Rp ${d.fee_amount.toLocaleString('id-ID')}</td>
                        <td class="p-4"><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pColor}">${escapeHtml(d.project_status)}</span></td>
                        <td class="p-4">${fileBadge}</td>
                        <td class="p-4">${statusBadge}</td>
                        <td class="p-4 text-right whitespace-nowrap">${actionBtn}</td>
                    `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">Gagal memuat: ${err.message}</td></tr>`;
    }
}

async function updateFileStatus(id, newStatus) {
    try {
        const res = await fetch(`/api/disbursements/${id}/file-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_status: newStatus })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Gagal mengubah status file');
        }
        loadDisbursements();
    } catch (err) {
        alert('Error: ' + err.message);
        loadDisbursements();
    }
}

async function openAddDisbursementModal() {
    const select = document.getElementById('disb-booking-select');
    select.innerHTML = '<option value="">-- Pilih Booking --</option>';
    document.getElementById('disb-freelancer-select').innerHTML = '<option value="">-- Pilih booking dahulu --</option>';
    document.getElementById('disb-add-form').reset();

    try {
        // Fetch bookings
        const res = await fetch('/api/bookings');
        const bookings = await res.json();

        // Show bookings
        bookings.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.dataset.json = JSON.stringify(b);
            opt.innerText = `${b.client_name} - ${formatDate(b.event_date)} (${b.project_status})`;
            select.appendChild(opt);
        });

        document.getElementById('disb-add-modal').classList.remove('hidden');
    } catch (err) {
        alert('Gagal memuat booking: ' + err.message);
    }
}

function closeAddDisbursementModal() {
    document.getElementById('disb-add-modal').classList.add('hidden');
}

function onDisbBookingChange() {
    const select = document.getElementById('disb-booking-select');
    const freelancerSelect = document.getElementById('disb-freelancer-select');
    freelancerSelect.innerHTML = '<option value="">-- Pilih Freelancer --</option>';

    const opt = select.options[select.selectedIndex];
    if (!opt || !opt.value) return;

    const b = JSON.parse(opt.dataset.json);
    if (b.freelancers && b.freelancers.length > 0) {
        b.freelancers.forEach(f => {
            const fOpt = document.createElement('option');
            fOpt.value = f.id;
            fOpt.dataset.role = f.role;
            fOpt.dataset.fee = f.fee_per_project || 500000;
            fOpt.innerText = `${f.name} (${f.role})`;
            freelancerSelect.appendChild(fOpt);
        });
    } else {
        freelancerSelect.innerHTML = '<option value="">(Tidak ada kru ditugaskan)</option>';
    }
}

// Set default fee and role when freelancer is chosen
const flSelect = document.getElementById('disb-freelancer-select');
if (flSelect) {
    flSelect.addEventListener('change', function () {
        const opt = this.options[this.selectedIndex];
        if (opt && opt.value) {
            document.getElementById('disb-role').value = opt.dataset.role === 'FG' ? 'Fotografer' : 'Videografer';
            document.getElementById('disb-fee-amount').value = opt.dataset.fee;
        }
    });
}

async function saveDisbursement(e) {
    e.preventDefault();
    const booking_id = parseInt(document.getElementById('disb-booking-select').value);
    const freelancer_id = parseInt(document.getElementById('disb-freelancer-select').value);
    const role = document.getElementById('disb-role').value.trim();
    const fee_amount = parseFloat(document.getElementById('disb-fee-amount').value);
    const payment_note = document.getElementById('disb-note').value.trim();

    if (!booking_id || !freelancer_id || isNaN(fee_amount)) {
        alert('Pilih booking, freelancer, dan nominal fee!');
        return;
    }

    try {
        const res = await fetch('/api/disbursements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id, freelancer_id, role, fee_amount, payment_note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tagihan');
        alert('Tagihan fee berhasil ditambahkan!');
        closeAddDisbursementModal();
        loadDisbursements();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function openDisbPayModal(id) {
    const d = _allDisbursements.find(item => item.id === id);
    if (!d) return;

    document.getElementById('disb-pay-id').value = d.id;
    document.getElementById('disb-pay-freelancer').innerText = d.freelancer_name;
    document.getElementById('disb-pay-role').innerText = d.role;
    document.getElementById('disb-pay-client').innerText = d.client_name;
    document.getElementById('disb-pay-date').innerText = formatDate(d.event_date);
    document.getElementById('disb-pay-amount').innerText = 'Rp ' + d.fee_amount.toLocaleString('id-ID');
    document.getElementById('disb-pay-note').value = '';

    document.getElementById('disb-pay-modal').classList.remove('hidden');
}

function closeDisbPayModal() {
    document.getElementById('disb-pay-modal').classList.add('hidden');
}

async function confirmPayFee() {
    const id = document.getElementById('disb-pay-id').value;
    const payment_note = document.getElementById('disb-pay-note').value.trim();
    try {
        const res = await fetch(`/api/disbursements/${id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal melakukan pembayaran');

        closeDisbPayModal();
        alert('✓ Pembayaran fee berhasil diverifikasi!');

        // Show receipt modal
        document.getElementById('disb-receipt-text').innerText = data.receipt;
        document.getElementById('disb-receipt-modal').classList.remove('hidden');

        loadDisbursements();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function openDisbReceiptModal(id) {
    const d = _allDisbursements.find(item => item.id === id);
    if (!d || !d.receipt_note) return;

    const receiptText = d.receipt_note;
    document.getElementById('disb-receipt-text').innerText = receiptText;

    let waPhone = d.freelancer_wa ? d.freelancer_wa.replace(/\\D/g, '') : '';
    if (waPhone.startsWith('0')) waPhone = '62' + waPhone.slice(1);

    const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(receiptText)}`;
    document.getElementById('btn-wa-receipt').href = waLink;

    document.getElementById('disb-receipt-modal').classList.remove('hidden');
}

function closeDisbReceiptModal() {
    document.getElementById('disb-receipt-modal').classList.add('hidden');
}

function printDisbReceipt() {
    const text = document.getElementById('disb-receipt-text').innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('Salin Struk berhasil! Struk telah disalin ke clipboard.');
    }).catch(err => {
        alert('Gagal menyalin struk: ' + err.message);
    });
}

async function deleteDisb(id) {
    if (!confirm('Hapus tagihan fee ini?')) return;
    try {
        const res = await fetch(`/api/disbursements/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menghapus');
        alert('Tagihan berhasil dihapus!');
        loadDisbursements();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ── Tab Hook: load data when switching to v1.1 tabs ──────────────────
const _origSwitchTab = window.switchTab;
window.switchTab = function (tabId) {
    if (typeof _origSwitchTab === 'function') _origSwitchTab(tabId);
    if (tabId === 'tab-dashboard') { loadDashboard(); }
    if (tabId === 'tab-pricing') { switchPricingTab('services'); }
    if (tabId === 'tab-payment') { loadPaymentV11(); }
    if (tabId === 'tab-audit') { loadAuditLogs(); }
    if (tabId === 'tab-disbursement') { loadDisbursements(); }
    if (tabId === 'tab-packages') { switchMasterSubTab('packages'); }
};

// ── Dashboard Logic ──────────────────────────────────────────────────
async function loadDashboard() {
    try {
        // Use already-loaded allBookings & allFreelancers
        const bookings = (typeof allBookings !== 'undefined') ? allBookings : [];
        const freelancers = (typeof allFreelancers !== 'undefined') ? allFreelancers : [];

        // KPI: Total Clients
        const totalClients = bookings.length;
        const runningCount = bookings.filter(b => b.project_status !== 'Selesai' && b.project_status !== 'Ditutup' && b.project_status !== 'Pemberhentian Sepihak').length;
        const doneCount = bookings.filter(b => b.project_status === 'Selesai').length;
        const lunasCount = bookings.filter(b => b.payment_status === 'Lunas').length;
        const activeFreelancers = freelancers.filter(f => f.status === 'Aktif').length;

        document.getElementById('dash-kpi-total-clients').textContent = totalClients;
        document.getElementById('dash-badge-running').textContent = runningCount + ' aktif';
        document.getElementById('dash-kpi-lunas').textContent = lunasCount;
        document.getElementById('dash-badge-done').textContent = doneCount + ' selesai';
        document.getElementById('dash-kpi-freelancers').textContent = freelancers.length;
        document.getElementById('dash-badge-crew').textContent = activeFreelancers + ' aktif';

        // Upcoming Weddings (next 5 by event_date, not completed/cancelled)
        const upcoming = bookings
            .filter(b => b.project_status !== 'Selesai' && b.project_status !== 'Ditutup' && b.project_status !== 'Pemberhentian Sepihak')
            .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
            .slice(0, 6);

        const upcomingList = document.getElementById('dash-upcoming-list');
        if (upcoming.length === 0) {
            upcomingList.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">Tidak ada jadwal mendatang.</p>';
        } else {
            const payColors = {
                'Lunas': 'bg-emerald-50 text-emerald-700',
                'Menunggu DP': 'bg-blue-50 text-blue-700',
                'Menunggu Pelunasan': 'bg-purple-50 text-purple-700',
                'DP Hangus': 'bg-red-50 text-red-700'
            };
            upcomingList.innerHTML = upcoming.map(b => {
                const payColor = payColors[b.payment_status] || 'bg-slate-100 text-slate-600';
                const dateStr = formatDate ? formatDate(b.event_date) : b.event_date;
                return `<div class="dash-activity-row">
                            <div class="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xs flex-shrink-0">${escapeHtml(b.client_name[0] || '?')}</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-semibold text-slate-900 text-xs truncate">${escapeHtml(b.client_name)}</div>
                                <div class="text-[10px] text-slate-500">${dateStr} · ${escapeHtml(b.package_name || '-')}</div>
                            </div>
                            <span class="dash-badge ${payColor} flex-shrink-0">${b.payment_status}</span>
                        </div>`;
            }).join('');
        }

        // Payment Status Breakdown
        const payStatuses = ['Menunggu DP', 'Menunggu Pelunasan', 'Lunas', 'DP Hangus'];
        const payIcons = { 'Lunas': '✅', 'Menunggu DP': '🔵', 'Menunggu Pelunasan': '🟣', 'DP Hangus': '❌' };
        const payColorsBreak = { 'Lunas': 'bg-emerald-500', 'Menunggu DP': 'bg-blue-500', 'Menunggu Pelunasan': 'bg-purple-500', 'DP Hangus': 'bg-red-400' };
        const payBreakdown = document.getElementById('dash-payment-breakdown');
        const total = bookings.filter(b => b.project_status !== 'Ditutup').length || 1;
        payBreakdown.innerHTML = payStatuses.map(status => {
            const count = bookings.filter(b => b.payment_status === status && b.project_status !== 'Ditutup').length;
            const pct = Math.round(count / total * 100);
            return `<div>
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-xs font-semibold text-slate-700">${payIcons[status] || ''} ${status}</span>
                            <span class="text-xs font-bold text-slate-500">${count} (${pct}%)</span>
                        </div>
                        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full ${payColorsBreak[status] || 'bg-slate-400'} transition-all" style="width:${pct}%"></div>
                        </div>
                    </div>`;
        }).join('');

        // Project Pipeline
        const pipelineStatuses = [
            { value: 'Pending', label: 'Pending', color: 'bg-slate-400' },
            { value: 'On Progress', label: 'On Progress', color: 'bg-indigo-500' },
            { value: 'Post-Prod: Editing', label: 'Editing', color: 'bg-pink-500' },
            { value: 'Post-Prod: Review', label: 'Review', color: 'bg-amber-500' },
            { value: 'Post-Prod: Cetak Album', label: 'Cetak Album', color: 'bg-purple-500' },
            { value: 'Selesai', label: 'Selesai', color: 'bg-emerald-500' }
        ];
        const pipelineContainer = document.getElementById('dash-pipeline');
        const totalAll = bookings.length || 1;
        pipelineContainer.innerHTML = pipelineStatuses.map(({ value, label, color }) => {
            const count = bookings.filter(b => b.project_status === value).length;
            const pct = Math.round(count / totalAll * 100);
            return `<div class="flex items-center gap-3">
                        <span class="text-xs font-semibold text-slate-600 w-28 flex-shrink-0">${label}</span>
                        <div class="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full ${color} transition-all" style="width:${pct}%"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-500 w-8 text-right">${count}</span>
                    </div>`;
        }).join('');

        // Financial snapshot from API
        try {
            const finRes = await fetch('/api/financial/summary');
            if (finRes.ok) {
                const fin = await finRes.json();
                const fmt = v => 'Rp ' + Number(v).toLocaleString('id-ID');
                document.getElementById('dash-kpi-revenue').textContent = fmt(fin.totalRevenue);
                document.getElementById('dash-fin-revenue').textContent = fmt(fin.totalRevenue);
                document.getElementById('dash-fin-expenses').textContent = fmt(fin.totalExpenses);
                document.getElementById('dash-fin-profit').textContent = fmt(fin.netProfit);
                document.getElementById('dash-fin-bookings').textContent = fin.totalBookings + ' booking';
            }
        } catch (e) { /* silently ignore */ }

        // Unpaid freelancer monitor
        try {
            await renderUnpaidFreelancers('dash-unpaid-freelancers', true);
        } catch (e) { /* silently ignore */ }

    } catch (err) {
        console.error('Dashboard error:', err);
    }
}

async function renderUnpaidFreelancers(containerId, compact = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Find outer container to show/hide (only for disbursements tab yellow box)
    let outerContainer = null;
    if (containerId === 'disb-unpaid-per-freelancer') {
        outerContainer = document.getElementById('disb-unpaid-container');
    }

    try {
        const res = await fetch('/api/disbursements/unpaid-by-freelancer');
        const data = await res.json();
        const list = data.data || [];

        if (list.length === 0) {
            if (outerContainer) {
                outerContainer.classList.add('hidden');
            } else {
                container.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 flex items-center justify-center gap-1.5"><span class="text-emerald-500 font-bold">✓</span> Semua freelance sudah terbayar (0)</p>`;
            }
            return;
        }

        if (outerContainer) {
            outerContainer.classList.remove('hidden');
        }

        if (compact) {
            // Dashboard compact view: horizontal chips
            container.innerHTML = `
                            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                ${list.map(f => `
                                    <div class="bg-white rounded-2xl border border-amber-200 p-4 flex flex-col gap-1.5">
                                        <div class="flex items-center gap-2">
                                            <div class="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-black text-xs flex-shrink-0">${escapeHtml(f.freelancer_name[0] || '?')}</div>
                                            <div class="flex-1 min-w-0">
                                                <div class="font-bold text-slate-800 text-xs truncate">${escapeHtml(f.freelancer_name)}</div>
                                                <div class="text-[10px] text-slate-500">${escapeHtml(f.freelancer_role)}</div>
                                            </div>
                                        </div>
                                        <div class="flex justify-between items-end mt-1">
                                            <span class="text-[10px] text-slate-500">${f.pending_count} tagihan</span>
                                            <span class="font-black text-amber-600 text-xs">Rp ${Number(f.total_unpaid).toLocaleString('id-ID')}</span>
                                        </div>
                                        <div class="text-[10px] text-slate-400 truncate">📋 ${escapeHtml(f.clients || '-')}</div>
                                    </div>
                                `).join('')}
                            </div>`;
        } else {
            // Full view: table rows
            container.innerHTML = `
                            <table class="w-full text-xs">
                                <thead>
                                    <tr class="text-[10px] uppercase font-bold tracking-wider text-amber-700 border-b border-amber-200">
                                        <th class="pb-2 text-left">Freelancer</th>
                                        <th class="pb-2 text-left">Peran</th>
                                        <th class="pb-2 text-center">Jml Tagihan</th>
                                        <th class="pb-2 text-right">Total Belum Dibayar</th>
                                        <th class="pb-2 text-left pl-4">Untuk Klien</th>
                                        <th class="pb-2"></th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-amber-100">
                                    ${list.map(f => `
                                        <tr class="hover:bg-amber-100/50 transition">
                                            <td class="py-3 font-semibold text-slate-800">
                                                <div class="flex items-center gap-2">
                                                    <div class="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 font-black text-[10px] flex items-center justify-center">${escapeHtml(f.freelancer_name[0] || '?')}</div>
                                                    ${escapeHtml(f.freelancer_name)}
                                                </div>
                                            </td>
                                            <td class="py-3 text-slate-500">${escapeHtml(f.freelancer_role)}</td>
                                            <td class="py-3 text-center">
                                                <span class="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-bold text-[10px]">${f.pending_count}</span>
                                            </td>
                                            <td class="py-3 text-right font-black text-amber-600">Rp ${Number(f.total_unpaid).toLocaleString('id-ID')}</td>
                                            <td class="py-3 text-slate-400 pl-4 text-[10px]">${escapeHtml(f.clients || '-')}</td>
                                            <td class="py-3 text-right">
                                                <button onclick="document.getElementById('disb-status-filter').value='Pending'; loadDisbursements();" class="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold transition">Bayar</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>`;
        }
    } catch (e) {
        container.innerHTML = `<p class="text-xs text-red-400 text-center py-2">Gagal memuat data.</p>`;
    }
}



// --- SECTION: WHATSAPP REMINDERS ---
async function fetchPendingReminders() {
    try {
        const res = await fetch('/api/reminders/pending');
        const data = await res.json();
        const count = data.data ? data.data.length : 0;
        const badge = document.getElementById('reminder-badge');
        if (badge) {
            badge.innerText = count;
            if (count > 0) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        }
    } catch (e) { console.error('Error fetching reminders:', e); }
}

async function openReminderModal() {
    document.getElementById('reminder-modal').classList.remove('hidden');
    const listContainer = document.getElementById('reminder-list');
    listContainer.innerHTML = '<p class="text-xs text-center text-slate-400 py-8">Memuat reminder...</p>';

    try {
        const res = await fetch('/api/reminders/pending');
        const data = await res.json();
        const reminders = data.data || [];

        if (reminders.length === 0) {
            listContainer.innerHTML = `
    <div class="bg-white border border-slate-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                            <span class="text-4xl mb-3">🎉</span>
                            <p class="text-slate-800 font-bold text-sm">Semua Aman!</p>
                            <p class="text-[10px] text-slate-400 mt-1">Tidak ada jadwal dalam 7 hari ke depan.</p>
                        </div>
    `;
        } else {
            listContainer.innerHTML = reminders.map(r => {
                const isClient = r.target_type === 'client';
                const targetLabel = isClient ? 'Klien' : 'Kru Freelance';
                const badgeColor = isClient
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200';
                const typeIcon = isClient ? '👤' : '📸';

                // Encode reminder data for onclick
                const safeData = encodeURIComponent(JSON.stringify({
                    booking_id: r.booking_id,
                    session_id: r.session_id,
                    freelancer_id: r.freelancer_id,
                    reminder_type: r.reminder_type,
                    target_name: r.target_name,
                    target_phone: r.target_phone,
                    message_text: r.message_template
                }));

                const waLink = r.wa_link || '';
                const hasWa = !!waLink;

                return `
                            <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
                                <div class="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                                    <div>
                                        <p class="text-sm font-bold text-slate-800">${typeIcon} ${escapeHtml(r.target_name)} <span class="px-2 py-0.5 ml-2 rounded text-[9px] font-bold uppercase tracking-wider ${badgeColor}">${targetLabel}</span></p>
                                        <p class="text-[10px] text-slate-400 mt-0.5">Sesi: <b>${escapeHtml(r.session_name)}</b> • Jadwal: ${formatDate(r.scheduled_for)}</p>
                                        ${r.target_phone ? `<p class="text-[10px] text-slate-400">📞 ${escapeHtml(r.target_phone)}</p>` : ''}
                                    </div>
                                    <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${isClient ? 'bg-orange-50 text-orange-500 border border-orange-200' : 'bg-purple-50 text-purple-500 border border-purple-200'}">${isClient ? 'H-3' : 'H-1'}</span>
                                </div>
                                <div class="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">
                                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                                        <svg class="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.573-.187-.981-.342-1.714-.651-2.822-2.404-2.909-2.522-.087-.118-.696-.925-.696-1.764s.434-1.26.586-1.419c.152-.158.33-.198.44-.198.11 0 .22.001.314.005.099.004.229-.039.359.273.134.321.458 1.121.5 1.21.042.089.069.193.016.298-.053.105-.08.169-.159.262-.079.094-.167.206-.237.288-.076.089-.156.187-.066.342.089.155.397.658.852 1.063.585.522 1.083.682 1.238.771.155.089.245.074.337-.03.092-.104.397-.465.502-.624.105-.159.21-.133.351-.08.141.054.894.42 1.047.498.153.078.255.117.292.182.037.065.037.373-.107.778z"/></svg>
                                        Pesan WA:
                                    </p>
                                    <p class="text-xs text-slate-600 whitespace-pre-wrap font-mono">${escapeHtml(r.message_template)}</p>
                                </div>
                                <div class="flex gap-2">
                                    ${hasWa ? `<a href="${waLink}" target="_blank"
                                        onclick="markReminderSent('${safeData}')"
                                        class="flex-1 text-center py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold shadow-sm transition flex justify-center items-center gap-1.5">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.573-.187-.981-.342-1.714-.651-2.822-2.404-2.909-2.522-.087-.118-.696-.925-.696-1.764s.434-1.26.586-1.419c.152-.158.33-.198.44-.198.11 0 .22.001.314.005.099.004.229-.039.359.273.134.321.458 1.121.5 1.21.042.089.069.193.016.298-.053.105-.08.169-.159.262-.079.094-.167.206-.237.288-.076.089-.156.187-.066.342.089.155.397.658.852 1.063.585.522 1.083.682 1.238.771.155.089.245.074.337-.03.092-.104.397-.465.502-.624.105-.159.21-.133.351-.08.141.054.894.42 1.047.498.153.078.255.117.292.182.037.065.037.373-.107.778z"/></svg>
                                        Kirim via WhatsApp
                                    </a>` : `<span class="flex-1 text-center py-2.5 bg-slate-100 text-slate-400 rounded-xl text-xs font-medium">Nomor WA tidak tersedia</span>`}
                                    <button onclick="skipReminder('${safeData}')" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-medium transition">Lewati</button>
                                </div>
                            </div>
                        `;
            }).join('');
        }
    } catch (e) {
        listContainer.innerHTML = `<p class="text-xs text-center text-red-500 py-8">Error: ${e.message}</p>`;
    }
}

function closeReminderModal() {
    document.getElementById('reminder-modal').classList.add('hidden');
}

async function markReminderSent(encodedData) {
    try {
        const payload = JSON.parse(decodeURIComponent(encodedData));
        await fetch('/api/reminders/sent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        setTimeout(() => {
            fetchPendingReminders();
            if (!document.getElementById('reminder-modal').classList.contains('hidden')) {
                openReminderModal();
            }
        }, 1500);
    } catch (e) { console.error('Failed to mark reminder sent', e); }
}

async function skipReminder(encodedData) {
    // Mark as sent without opening WA - admin chooses to skip
    await markReminderSent(encodedData);
}

// Initialize Reminders
document.addEventListener('DOMContentLoaded', fetchPendingReminders);
// Refresh reminder badge every 5 minutes
setInterval(fetchPendingReminders, 5 * 60 * 1000);

// ============================================================
// --- SECTION: KALENDER SOREHARI ---
// ============================================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based
let calBookingsData = []; // cache all bookings for current month

const CAL_MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

async function loadCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    await fetchAndRenderCalendar();
}

function calNavigate(direction) {
    calMonth += direction;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0) { calMonth = 11; calYear--; }
    fetchAndRenderCalendar();
}

async function fetchAndRenderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('cal-month-label');
    if (!grid) return;

    label.textContent = `${CAL_MONTHS_ID[calMonth]} ${calYear}`;
    grid.innerHTML = `
        <div class="col-span-7 flex items-center justify-center py-20 text-slate-400 text-sm">
            <svg class="w-6 h-6 animate-spin mr-2 text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Memuat...
        </div>`;

    try {
        const res = await fetch(`/api/calendar/bookings?year=${calYear}&month=${calMonth + 1}`);
        const data = await res.json();
        calBookingsData = data.data || [];
        renderCalendarGrid();
    } catch(e) {
        grid.innerHTML = `<div class="col-span-7 text-center py-20 text-red-400 text-sm">Gagal memuat data: ${e.message}</div>`;
    }
}

function renderCalendarGrid() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    // Build a map: date string (YYYY-MM-DD) -> array of bookings
    const bookingMap = {};
    calBookingsData.forEach(b => {
        const d = b.event_date ? b.event_date.split('T')[0] : null;
        if (!d) return;
        if (!bookingMap[d]) bookingMap[d] = [];
        bookingMap[d].push(b);
    });

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    // First day of month (0=Sun)
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    let cells = '';

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        cells += `<div class="border-b border-r border-slate-100 min-h-[90px] bg-slate-50/40 p-1"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayBookings = bookingMap[dateStr] || [];
        const isToday = dateStr === todayStr;
        const hasBookings = dayBookings.length > 0;
        const dayOfWeek = (firstDay + day - 1) % 7;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const dayNumStyle = isToday
            ? 'w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold'
            : `text-xs font-bold ${isWeekend ? 'text-rose-400' : 'text-slate-700'}`;

        // Status color dots
        const dotsHtml = dayBookings.slice(0, 4).map(b => {
            let dotColor = 'bg-slate-300';
            const ps = b.project_status || '';
            const pay = b.payment_status || '';
            if (ps === 'On Progress') dotColor = 'bg-emerald-500';
            else if (pay === 'Menunggu Pelunasan') dotColor = 'bg-blue-500';
            else if (pay === 'Menunggu DP') dotColor = 'bg-amber-500';
            else if (ps === 'Selesai') dotColor = 'bg-slate-400';
            return `<span class="w-2 h-2 rounded-full ${dotColor} inline-block flex-shrink-0"></span>`;
        }).join('');

        const moreHtml = dayBookings.length > 4
            ? `<span class="text-[9px] text-slate-400 font-bold">+${dayBookings.length - 4}</span>` : '';

        const clickHandler = hasBookings ? `onclick="openCalDatePopup('${dateStr}', ${day})"` : '';
        const hoverClass = hasBookings ? 'hover:bg-indigo-50 cursor-pointer' : '';
        const highlightBorder = hasBookings ? 'border-indigo-100' : 'border-slate-100';

        cells += `
            <div ${clickHandler} class="border-b border-r ${highlightBorder} min-h-[90px] p-2 flex flex-col gap-1 transition ${hoverClass} ${isToday ? 'bg-indigo-50/30' : ''}">
                <div class="flex justify-between items-center">
                    <span class="${dayNumStyle}">${isToday ? `<span>${day}</span>` : day}</span>
                    ${hasBookings ? `<span class="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">${dayBookings.length}</span>` : ''}
                </div>
                ${hasBookings ? `
                <div class="flex flex-wrap gap-0.5 mt-1">${dotsHtml}${moreHtml}</div>
                <div class="space-y-0.5 mt-0.5">
                    ${dayBookings.slice(0, 2).map(b => `
                        <div class="text-[10px] text-slate-600 font-medium truncate leading-tight">${escapeHtml(b.client_name || '-')}</div>
                    `).join('')}
                    ${dayBookings.length > 2 ? `<div class="text-[9px] text-slate-400 font-bold">+${dayBookings.length - 2} lainnya</div>` : ''}
                </div>` : ''}
            </div>`;
    }

    // Fill remaining cells to complete last row
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remainingCells; i++) {
        cells += `<div class="border-b border-r border-slate-100 min-h-[90px] bg-slate-50/40 p-1"></div>`;
    }

    grid.innerHTML = cells;
}

function openCalDatePopup(dateStr, day) {
    const popup = document.getElementById('cal-popup');
    const title = document.getElementById('cal-popup-title');
    const count = document.getElementById('cal-popup-count');
    const list = document.getElementById('cal-popup-list');

    const bookings = calBookingsData.filter(b => {
        const d = b.event_date ? b.event_date.split('T')[0] : null;
        return d === dateStr;
    });

    const dateLabel = `${day} ${CAL_MONTHS_ID[calMonth]} ${calYear}`;
    title.textContent = `📅 ${dateLabel}`;
    count.textContent = `${bookings.length} klien dijadwalkan`;

    const statusConfig = {
        'On Progress': { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '🟢' },
        'Selesai': { color: 'bg-slate-100 text-slate-600 border-slate-200', icon: '✅' },
        'Menunggu Pelunasan': { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '💳' },
        'Menunggu DP': { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⏳' },
        'DP Hangus': { color: 'bg-red-100 text-red-700 border-red-200', icon: '❌' },
    };

    list.innerHTML = bookings.map(b => {
        const status = b.project_status || b.payment_status || '-';
        const cfg = statusConfig[status] || { color: 'bg-slate-100 text-slate-600 border-slate-200', icon: '📌' };
        return `
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${escapeHtml(b.client_name || '-')}</p>
                        <p class="text-[11px] text-slate-500 mt-0.5">📦 ${escapeHtml(b.package_name || '-')}</p>
                        ${b.location ? `<p class="text-[11px] text-slate-500">📍 ${escapeHtml(b.location)}</p>` : ''}
                    </div>
                    <span class="px-2 py-1 rounded-lg text-[10px] font-bold border ${cfg.color} whitespace-nowrap">${cfg.icon} ${status}</span>
                </div>
                <div class="flex gap-2 pt-1">
                    <button onclick="openBookingDetailModal(${b.id}); closeCalPopup();"
                        class="flex-1 text-center py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition">
                        Lihat Detail
                    </button>
                    ${b.client_phone ? `
                    <a href="https://wa.me/${b.client_phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}" target="_blank"
                        class="flex items-center justify-center px-3 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl transition">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.573-.187-.981-.342-1.714-.651-2.822-2.404-2.909-2.522-.087-.118-.696-.925-.696-1.764s.434-1.26.586-1.419c.152-.158.33-.198.44-.198.11 0 .22.001.314.005.099.004.229-.039.359.273.134.321.458 1.121.5 1.21.042.089.069.193.016.298-.053.105-.08.169-.159.262-.079.094-.167.206-.237.288-.076.089-.156.187-.066.342.089.155.397.658.852 1.063.585.522 1.083.682 1.238.771.155.089.245.074.337-.03.092-.104.397-.465.502-.624.105-.159.21-.133.351-.08.141.054.894.42 1.047.498.153.078.255.117.292.182.037.065.037.373-.107.778z"/></svg>
                    </a>` : ''}
                </div>
            </div>`;
    }).join('');

    popup.classList.remove('hidden');
}

function closeCalPopup() {
    document.getElementById('cal-popup').classList.add('hidden');
}

// Close popup on outside click
document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('cal-popup');
    if (popup) {
        popup.addEventListener('click', (e) => {
            if (e.target === popup) closeCalPopup();
        });
    }
});