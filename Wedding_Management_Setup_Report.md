# Laporan Debug & Setup `Wedding-Management` (V3)

**Tanggal:** 2026-07-07
**Project:** `Wedding-Management`
**Versi:** `V3` (commit `08bfe61`)
**Target Deploy:** LXC 102 (`192.168.100.83`)
**Akses Web:** `http://192.168.100.83:8080`
**Status:** **BERHASIL DEPLOY & BERFUNGSI PENUH**

---

## 1. Masalah yang Terjadi Selama Setup Awal

Proses setup awal `Wedding-Management` mengalami beberapa hambatan yang membuat instalasi pertama kali sangat membingungkan dan tidak efisien. Berikut rincian masalahnya:

1.  **Repo Sudah Ada / Konflik Clone:**
    *   **Masalah:** Percobaan `git clone` pertama kali gagal karena direktori target (`/DATA/AppData/Wedding-Management-V3`) sudah ada dan tidak kosong.
    *   **Dampak:** Membutuhkan intervensi manual untuk menghapus folder lama.

2.  **Direktori Database `db/data` Tidak Ada:**
    *   **Masalah:** Aplikasi menggunakan SQLite (`better-sqlite3`), yang file `db.js` mencoba membuat `sorehari.db` di `db/data/`. Namun, direktori `db/data` tidak ada di awal deployment.
    *   **Dampak:** Aplikasi gagal startup dengan error `TypeError: Cannot open database because the directory does not exist`. Port 8080 tidak listening, aplikasi tidak bisa diakses. File `db.js` tidak memiliki logic untuk membuat direktori induknya.

3.  **File `.env` Hilang / Tidak Terdeteksi:**
    *   **Masalah:** Setelah clone, file `.env` tidak ada di direktori project.
    *   **Dampak:** Aplikasi tidak memiliki konfigurasi penting seperti `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, dll. Aplikasi berjalan dengan nilai default atau `undefined`.

4.  **`dotenv` Tidak Dimuat Otomatis oleh PM2:**
    *   **Masalah:** Meskipun `server.js` memiliki `require('dotenv').config();` di baris ke-7, PM2 tidak secara otomatis memuat variabel-variabel dari `.env` ke `process.env`.
    *   **Dampak:** Variabel seperti `ADMIN_PASSWORD` tetap kosong di `process.env`, menyebabkan aplikasi menggunakan nilai fallback atau default yang tidak diinginkan.

5.  **Fallback Password Hardcode di `server.js`:**
    *   **Masalah:** `server.js` memiliki baris `const ADMIN_PASS_PLAIN = process.env.ADMIN_PASSWORD || 'sorehari2026';`.
    *   **Dampak:** Ketika `ADMIN_PASSWORD` dari `.env` gagal dimuat PM2, aplikasi akan fallback ke `sorehari2026`. Ini menyebabkan kebingungan serius karena password `sorehari` yang diharapkan dari `.env` tidak berfungsi, sedangkan `sorehari2026` (yang seharusnya hanya fallback) malah berfungsi.

6.  **Nama Database Hardcode ke Vendor (`sorehari.db`):**
    *   **Masalah:** Nama file database di `db.js` adalah `sorehari.db`.
    *   **Dampak:** Jika sistem ini dimaksudkan sebagai sistem manajemen vendor wedding yang generik (untuk berbagai vendor), nama database yang terikat ke "Sorehari" menjadi tidak fleksibel dan tidak profesional untuk vendor lain.

7.  **`pm2 setenv` Command Not Found:**
    *   **Masalah:** PM2 versi yang terinstal di LXC 102 tidak mendukung perintah `pm2 setenv`.
    *   **Dampak:** Opsi cepat untuk menyuntikkan environment variables ke proses PM2 tidak dapat dilakukan, membutuhkan metode lain.

---

## 2. Solusi yang Telah Diterapkan (Saat Ini)

Untuk membuat aplikasi berfungsi, langkah-langkah berikut telah dilakukan:

1.  **Clean Install:** Direktori `Wedding-Management-V3` dihapus total (`rm -rf`) dan repository di-clone ulang (`git clone ... .`) untuk memastikan instalasi bersih.
2.  **Checkout Tag V3:** Repository diatur ke versi `V3` yang diminta.
3.  **Eksekusi `deploy.sh`:** Skrip deployment dijalankan untuk menginstal dependensi (`npm install`) dan menambahkan aplikasi ke PM2.
4.  **Pembuatan Direktori DB Manual:** Direktori `db/data` dibuat secara manual (`mkdir -p /DATA/AppData/Wedding-Management-V3/db/data`) untuk mengatasi masalah database tidak ditemukan.
5.  **Pembuatan File `.env` Manual:** File `.env` dibuat secara manual di root project dengan konten yang Anda berikan.
6.  **Injeksi Environment Variables PM2 Secara Eksplisit:**
    *   Aplikasi `wedding-management` dihapus dari PM2 (`pm2 delete wedding-management`).
    *   Aplikasi kemudian di-start ulang dengan PM2 (`pm2 start server.js --name wedding-management ...`) dengan menyertakan semua variabel `.env` sebagai `---env KEY=VALUE` di command line PM2. Ini memastikan PM2 memuat env vars ke `process.env` sebelum aplikasi berjalan.
7.  **Penghapusan `wa-bot` dari PM2:** Proses `wa-bot` yang tidak relevan dihapus dari PM2.

---

## 3. Rekomendasi Perbaikan Permanen (untuk Diskusi Tim & Antigravity)

Agar proses setup mudah, cepat, dan _robust_ (tahan banting) untuk developer baru atau deployment di lingkungan lain, sangat direkomendasikan untuk menerapkan perbaikan di level kode dan deployment script:

1.  **Perbaikan `deploy.sh`:**
    *   **Otomatisasi Pembuatan Direktori DB:** Tambahkan baris `mkdir -p db/data` di awal `deploy.sh` untuk menjamin direktori database selalu ada.
    *   **Pengelolaan `.env`:**
        *   Sertakan file **`.env.example`** di root repository.
        *   Tambahkan logic di `deploy.sh` untuk: `cp .env.example .env` (jika `.env` belum ada) dan instruksi untuk mengeditnya.
    *   **Integrasi PM2 Standard:**
        *   Ubah cara PM2 men-deploy dari `pm2 start server.js` menjadi menggunakan file **`ecosystem.config.js`**. File ini harus disimpan di repository.
        *   `ecosystem.config.js` harus mendefinisikan aplikasi, dan di dalamnya bisa memuat variabel `.env` secara standar (misal dengan `env_file: '.env'` atau langsung mendefinisikan `env: {}`).
        *   Dengan ini, command `deploy.sh` cukup `pm2 start ecosystem.config.js` (atau `pm2 reload ecosystem.config.js --env development` untuk update).

2.  **Perbaikan `db.js` (Generikkan Nama Database):**
    *   Ubah `db.js` agar mengambil nama file database dari `process.env.DB_FILENAME`.
    *   Jika `DB_FILENAME` tidak diset (misal di `.env` atau `ecosystem.config.js`), gunakan nama generik sebagai fallback, contoh:
        ```javascript
        const dbPath = path.join(__dirname, 'db', 'data', process.env.DB_FILENAME || 'app.db');
        ```
    *   Tambahkan `DB_FILENAME` ke `ecosystem.config.js` atau `.env.example`.

3.  **Perbaikan `server.js` (Hapus Fallback Password Hardcode):**
    *   Edit baris `const ADMIN_PASS_PLAIN = process.env.ADMIN_PASSWORD || 'sorehari2026';`
    *   Hapus bagian `|| 'sorehari2026'` agar menjadi `const ADMIN_PASS_PLAIN = process.env.ADMIN_PASSWORD;`.
    *   Ini memaksa aplikasi untuk selalu mengambil `ADMIN_PASSWORD` dari environment, dan mencegah kebingungan fallback.

---

**Prioritas Perbaikan (Minta Agent AI di Lokal untuk Melakukan Perbaikan yang Mudah & Cepat):**

Kepada Agent AI di lokal:

"Tolong fokus pada perbaikan yang paling mudah dan cepat untuk meningkatkan pengalaman setup `Wedding-Management`. Mohon buatkan Pull Request dengan perubahan berikut, dengan prioritas ini:

1.  **Update `deploy.sh`:**
    *   Tambahkan `mkdir -p db/data` di awal `deploy.sh`. (Ini mudah dan fundamental).
    *   Tambahkan langkah `cp .env.example .env` (jika `.env` belum ada) setelah clone, untuk panduan awal pengguna.
2.  **Buatkan `ecosystem.config.js`:**
    *   Buat file `ecosystem.config.js` yang berisi konfigurasi PM2 yang benar untuk aplikasi `wedding-management`, termasuk semua `env` variables yang saat ini kita set manual. Gunakan `env_file: '.env'` jika memungkinkan, atau langsung `env: {}` jika itu lebih stabil.
    *   Update `deploy.sh` untuk menggunakan `pm2 start ecosystem.config.js` setelah `npm install`.
3.  **Generikan nama database di `db.js`:**
    *   Ubah `sorehari.db` menjadi `app.db` (atau generik lain) dan gunakan `process.env.DB_FILENAME || 'app.db'`.
    *   Tambahkan `DB_FILENAME` ke `ecosystem.config.js` atau `.env.example`.

Perubahan ini akan sangat meningkatkan pengalaman setup bagi developer baru. Terima kasih."