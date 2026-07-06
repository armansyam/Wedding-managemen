# Sorehari Wedding Management

Sistem management untuk **1 vendor pribadi**.  
Fokus utama: menangkap inquiry/lead, mengelola booking, memproses data klien, menyimpan setting vendor, dan membantu operasional harian.

## Fitur

- **Landing page** untuk profil vendor, layanan, dan inquiry
- **Inquiry form** untuk input calon klien baru
- **Admin login** dengan session-based authentication
- **Dashboard** ringkasan data operasional
- **Leads management**: lihat, ubah, hapus, convert lead ke booking
- **Bookings management**: kelola booking dan status proses
- **Clients management**: data klien aktif
- **Packages management**: kelola paket layanan
- **Products management**: kelola produk tambahan
- **Freelancers management**: kelola tim/vendor pendukung
- **Sessions management**: jadwal sesi kerja/foto
- **Archive**: data riwayat
- **Settings**: vendor name, phone, logo, template WA, dan konfigurasi lain
- **Invoice / pelunasan**: dukung dokumen pembayaran dan bukti transfer

## Teknologi yang dipakai

- Node.js
- Express
- SQLite (`better-sqlite3`)
- Express Session
- Helmet
- CORS
- PDFKit
- PM2
- HTML / CSS / JavaScript

## Struktur penting

- `server.js` — entry point server
- `db.js` — koneksi database
- `db/` — migration dan seeding
- `routes/` — modul route aplikasi
- `middleware/` — auth middleware
- `helpers/` — helper, termasuk template WhatsApp
- `public/` — file static untuk halaman publik dan admin asset
- `private/admin/` — halaman admin
- `deploy.sh` — script deploy update server

## Prasyarat

Pastikan sudah terpasang:

- Node.js 18+ 
- npm
- Git
- PM2

Cek versi:

```bash
node -v
npm -v
git --version
pm2 -v
```

## Instalasi

### 1. Clone repository

```bash
git clone <repo-url>
cd Wedding-MAnagement
```

### 2. Install dependency

```bash
npm install
```

### 3. Siapkan file `.env`

Buat file `.env` di root project.

Contoh:

```env
PORT=8080
NODE_ENV=production
SESSION_SECRET=isi_dengan_secret_yang_kuat
PBKDF2_ITERATIONS=210000
BASE_URL=https://domain-kamu.com
```

Sesuaikan nilai berikut:

- `PORT` — port server
- `NODE_ENV` — `development` atau `production`
- `SESSION_SECRET` — secret session
- `PBKDF2_ITERATIONS` — parameter hashing password
- `BASE_URL` — domain utama production

### 4. Jalankan migration database

Jika database belum siap, jalankan:

```bash
npm run migrate
```

### 5. Isi data awal

Jika perlu seed data awal:

```bash
npm run seed
```

### 6. Jalankan aplikasi

Mode development:

```bash
npm run dev
```

Atau langsung:

```bash
npm start
```

## Penggunaan

### Akses halaman publik

Buka:

```text
http://localhost:8080
```

Atau domain production:

```text
https://domain-kamu.com
```

Di halaman publik, user bisa:

- lihat landing page
- isi form inquiry
- cek booking / invoice sesuai flow sistem

### Akses halaman admin

Masuk ke halaman login admin:

```text
/login
```

Setelah login, admin dapat mengelola:

- dashboard
- leads
- bookings
- clients
- packages
- products
- freelancers
- sessions
- archive
- settings

## Flow kerja sistem

1. Calon klien isi inquiry form
2. Data masuk sebagai **lead**
3. Admin login ke dashboard
4. Admin review lead
5. Lead bisa di-convert ke booking
6. Sistem membuat booking token dan link booking public
7. Admin lanjut proses booking, pembayaran, dan pelunasan
8. Data yang selesai bisa masuk archive

## Deploy update

Project ini sudah menyediakan `deploy.sh`.

Contoh pemakaian:

```bash
git pull
./deploy.sh
```

Atau deploy tag tertentu:

```bash
git pull
./deploy.sh v2.0.0
```

Perilaku script:

- default deploy ke `main`
- jika argumen tag/branch dikirim, script akan checkout target tersebut
- install dependency
- restart aplikasi lewat PM2

## PM2

Jika aplikasi belum pernah dijalankan di PM2:

```bash
pm2 start server.js --name wedding-management
pm2 save
```

Untuk restart:

```bash
pm2 restart wedding-management
```

## Catatan production

Untuk production, pastikan:

- domain sudah final
- HTTPS aktif
- `BASE_URL` sesuai domain
- session cookie diset aman
- akses login hanya via domain utama, jangan campur dengan IP/localhost

## Lisensi

Private / internal project.