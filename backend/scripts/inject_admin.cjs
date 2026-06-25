const fs = require('fs');

const adminHtmlPath = 'public/admin.html';
let html = fs.readFileSync(adminHtmlPath, 'utf8');

// 1. Inject Tab Buttons
const newTabButtons = `
            <button onclick="switchTab('tab-pricing');"
                class="tab-btn px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 hover:text-slate-900 text-slate-500"
                id="btn-tab-pricing">
                📦 Master Pricing
            </button>
            <button onclick="switchTab('tab-payment');"
                class="tab-btn px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 hover:text-slate-900 text-slate-500"
                id="btn-tab-payment">
                💳 Pembayaran
            </button>
            <button onclick="switchTab('tab-audit');"
                class="tab-btn px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 hover:text-slate-900 text-slate-500"
                id="btn-tab-audit">
                📝 Audit Log
            </button>
`;

// Insert after btn-tab-settings
html = html.replace(/(<button[^>]+id="btn-tab-settings"[^>]*>[\s\S]*?<\/button>)/, '$1' + newTabButtons);

// 2. Inject Tab Contents (Pricing, Payment, Audit)
// Find the end of tab-settings section
const endOfSettingsRegex = /(<\/section>[\s\n]*)(?=<\/div>\s*<!-- MODAL: PAYMENT VERIFICATION)/;

const newSections = `

        <!-- TAB CONTENT: MASTER PRICING -->
        <section id="tab-pricing" class="tab-content hidden space-y-6">
            <div>
                <h2 class="serif-title text-2xl font-bold text-slate-900">📦 Master Pricing</h2>
            </div>
            <div class="tabs flex gap-2">
                <button class="pricing-tab active px-3 py-1 bg-slate-200 rounded" data-tab="services">📋 Services</button>
                <button class="pricing-tab px-3 py-1 bg-slate-200 rounded" data-tab="packages_v11">📁 Packages</button>
                <button class="pricing-tab px-3 py-1 bg-slate-200 rounded" data-tab="calculator">🧮 Kalkulator</button>
            </div>

            <!-- Services -->
            <div id="pricing-services" class="pricing-tab-content space-y-4">
                <button onclick="openAddServiceModal()" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded">+ Tambah Service</button>
                <table class="w-full text-left text-xs bg-white shadow rounded-lg overflow-hidden">
                    <thead class="bg-slate-100"><tr><th class="p-2">Nama</th><th class="p-2">Kategori</th><th class="p-2">Harga</th><th class="p-2">Aksi</th></tr></thead>
                    <tbody id="services-tbody"></tbody>
                </table>
            </div>

            <!-- Packages -->
            <div id="pricing-packages_v11" class="pricing-tab-content hidden space-y-4">
                <button onclick="openAddPackageV11Modal()" class="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded">+ Buat Paket Baru</button>
                <table class="w-full text-left text-xs bg-white shadow rounded-lg overflow-hidden">
                    <thead class="bg-slate-100"><tr><th class="p-2">Nama</th><th class="p-2">Total Harga</th><th class="p-2">Nego?</th><th class="p-2">Aksi</th></tr></thead>
                    <tbody id="packages-v11-tbody"></tbody>
                </table>
            </div>

            <!-- Calculator -->
            <div id="pricing-calculator" class="pricing-tab-content hidden space-y-4">
                <div id="calc-services-list" class="space-y-2 bg-white p-4 shadow rounded-lg"></div>
                <div class="font-bold">Total: <span id="calc-total">Rp 0</span></div>
                <button onclick="calculateSelectedServices()" class="px-4 py-2 bg-green-600 text-white text-xs rounded">Hitung</button>
            </div>
        </section>

        <!-- TAB CONTENT: PAYMENT -->
        <section id="tab-payment" class="tab-content hidden space-y-6">
            <div>
                <h2 class="serif-title text-2xl font-bold text-slate-900">💳 Pembayaran (Manual & Verify)</h2>
            </div>
            <table class="w-full text-left text-xs bg-white shadow rounded-lg overflow-hidden">
                <thead class="bg-slate-100">
                    <tr><th class="p-2">Klien</th><th class="p-2">Tgl</th><th class="p-2">Deal</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr>
                </thead>
                <tbody id="payment-v11-tbody"></tbody>
            </table>
        </section>

        <!-- TAB CONTENT: AUDIT LOG -->
        <section id="tab-audit" class="tab-content hidden space-y-6">
            <div>
                <h2 class="serif-title text-2xl font-bold text-slate-900">📝 Audit Log</h2>
            </div>
            <div class="flex gap-2">
                <select id="audit-table-filter" class="border p-1 rounded text-xs"><option value="">Semua Tabel</option><option value="bookings">Bookings</option><option value="services">Services</option></select>
                <button onclick="loadAuditLogs()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded">Filter</button>
            </div>
            <table class="w-full text-left text-xs bg-white shadow rounded-lg overflow-hidden">
                <thead class="bg-slate-100"><tr><th class="p-2">Waktu</th><th class="p-2">Tabel</th><th class="p-2">Aksi</th><th class="p-2">Admin</th><th class="p-2">Detail</th></tr></thead>
                <tbody id="audit-tbody"></tbody>
            </table>
        </section>
`;

html = html.replace(endOfSettingsRegex, '$1' + newSections + '\n');

// 3. Inject JS Logic
const endOfScriptRegex = /(<\/script>)([\s\n]*<\/body>)/;
const newScript = `
// ================== V1.1 FRONTEND LOGIC ================== //

// Simple Tab Switcher for Master Pricing
document.querySelectorAll('.pricing-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.pricing-tab').forEach(b => b.classList.remove('active', 'bg-blue-200'));
        e.target.classList.add('active', 'bg-blue-200');
        document.querySelectorAll('.pricing-tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById('pricing-' + e.target.dataset.tab).classList.remove('hidden');
        if(e.target.dataset.tab === 'services') loadServices();
        if(e.target.dataset.tab === 'packages_v11') loadPackagesV11();
        if(e.target.dataset.tab === 'calculator') loadCalcServices();
    });
});

async function loadServices() {
    const res = await fetch('/api/services');
    const data = await res.json();
    const tbody = document.getElementById('services-tbody');
    tbody.innerHTML = '';
    if(data.data) {
        data.data.forEach(s => {
            tbody.innerHTML += \`<tr>
                <td class="p-2">\${s.name}</td>
                <td class="p-2">\${s.category}</td>
                <td class="p-2">Rp \${s.base_price.toLocaleString()}</td>
                <td class="p-2"><button onclick="deleteService(\${s.id})" class="text-red-600">Hapus</button></td>
            </tr>\`;
        });
    }
}

async function deleteService(id) {
    if(confirm('Hapus service ini?')) {
        await fetch('/api/services/' + id, { method: 'DELETE' });
        loadServices();
    }
}

async function loadPackagesV11() {
    const res = await fetch('/api/packages_v11');
    const data = await res.json();
    const tbody = document.getElementById('packages-v11-tbody');
    tbody.innerHTML = '';
    if(data.data) {
        data.data.forEach(p => {
            tbody.innerHTML += \`<tr>
                <td class="p-2">\${p.name}</td>
                <td class="p-2">Rp \${(p.total_price||0).toLocaleString()}</td>
                <td class="p-2">\${p.is_negotiable ? 'Ya' : 'Tidak'}</td>
                <td class="p-2"><button onclick="deletePackageV11(\${p.id})" class="text-red-600">Hapus</button></td>
            </tr>\`;
        });
    }
}

async function deletePackageV11(id) {
    if(confirm('Hapus paket ini?')) {
        await fetch('/api/packages_v11/' + id, { method: 'DELETE' });
        loadPackagesV11();
    }
}

async function loadCalcServices() {
    const res = await fetch('/api/services');
    const data = await res.json();
    const list = document.getElementById('calc-services-list');
    list.innerHTML = '';
    if(data.data) {
        data.data.forEach(s => {
            list.innerHTML += \`<div><label><input type="checkbox" class="calc-svc-cb" value="\${s.id}"> \${s.name} (Rp \${s.base_price.toLocaleString()})</label> <input type="number" id="calc-qty-\${s.id}" value="1" class="w-12 border rounded text-xs ml-2"></div>\`;
        });
    }
}

async function calculateSelectedServices() {
    const checked = document.querySelectorAll('.calc-svc-cb:checked');
    const services = Array.from(checked).map(cb => ({
        service_id: cb.value,
        quantity: parseInt(document.getElementById('calc-qty-'+cb.value).value) || 1
    }));
    const res = await fetch('/api/packages_v11/calculate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ services })
    });
    const data = await res.json();
    document.getElementById('calc-total').innerText = 'Rp ' + (data.total_price||0).toLocaleString();
}

async function loadAuditLogs() {
    const table = document.getElementById('audit-table-filter').value;
    const res = await fetch('/api/audit?table=' + table);
    const data = await res.json();
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = '';
    if(data.data) {
        data.data.forEach(a => {
            tbody.innerHTML += \`<tr>
                <td class="p-2">\${a.changed_at}</td>
                <td class="p-2">\${a.table_name} (#\${a.row_id})</td>
                <td class="p-2">\${a.action}</td>
                <td class="p-2">\${a.changed_by}</td>
                <td class="p-2"><button onclick="alert('Before: '+JSON.stringify(\${a.before_json || ''})+'\\n\\nAfter: '+JSON.stringify(\${a.after_json || ''}))" class="text-blue-600 underline">Lihat Detail</button></td>
            </tr>\`;
        });
    }
}

async function loadPaymentV11() {
    const res = await fetch('/api/bookings');
    const bookings = await res.json();
    const tbody = document.getElementById('payment-v11-tbody');
    tbody.innerHTML = '';
    bookings.forEach(b => {
        tbody.innerHTML += \`<tr>
            <td class="p-2">\${b.client_name}</td>
            <td class="p-2">\${b.event_date}</td>
            <td class="p-2">Rp \${(b.total_deal_price||0).toLocaleString()}</td>
            <td class="p-2">\${b.payment_status}</td>
            <td class="p-2 flex gap-1">
                <button onclick="verifyDpV11(\${b.id})" class="text-[10px] bg-green-500 text-white px-2 py-1 rounded">Verify DP</button>
                <button onclick="verifyFinalV11(\${b.id})" class="text-[10px] bg-blue-500 text-white px-2 py-1 rounded">Verify Lunas</button>
                <button onclick="cancelV11(\${b.id})" class="text-[10px] bg-red-500 text-white px-2 py-1 rounded">Batal & Kompensasi</button>
            </td>
        </tr>\`;
    });
}

async function verifyDpV11(id) {
    const path = prompt("Masukkan path receipt DP (contoh: /uploads/receipts/dp.jpg):");
    if(path) {
        await fetch('/api/bookings/' + id + '/verify-dp', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ receipt_path: path })
        });
        loadPaymentV11();
    }
}

async function verifyFinalV11(id) {
    const path = prompt("Masukkan path receipt Lunas (contoh: /uploads/receipts/final.jpg):");
    if(path) {
        await fetch('/api/bookings/' + id + '/verify-final', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ receipt_path: path })
        });
        loadPaymentV11();
    }
}

async function cancelV11(id) {
    const reason = prompt("Alasan pembatalan:");
    if(reason) {
        // dummy comp
        await fetch('/api/bookings/' + id + '/cancel_v11', {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cancel_reason: reason, compensation: [] })
        });
        loadPaymentV11();
    }
}

// Hook into existing switchTab to trigger load
const oldSwitchTab = window.switchTab;
window.switchTab = function(tabId) {
    oldSwitchTab ? oldSwitchTab(tabId) : (() => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(tabId).classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active', 'bg-white', 'text-slate-900'));
        document.getElementById('btn-'+tabId).classList.add('active', 'bg-white', 'text-slate-900');
    })();
    if(tabId === 'tab-pricing') loadServices();
    if(tabId === 'tab-payment') loadPaymentV11();
    if(tabId === 'tab-audit') loadAuditLogs();
};
`;

html = html.replace(endOfScriptRegex, newScript + '\n$1$2');

fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('Successfully injected V1.1 code into admin.html');
