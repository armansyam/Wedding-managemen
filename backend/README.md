# Sorehari - Portfolio Landing Page with Admin Dashboard

## 📋 Struktur Project

```
/Volumes/Sorehari II/
├── image/                      # Frontend (landing page)
│   ├── index.html             # Home page
│   ├── portfolio.html         # Portfolio gallery page
│   ├── image/                 # Gambar asli
│   └── optimized/             # Gambar teroptimasi (untuk loading page)
│
├── backend/                    # Backend server (Node.js + Express)
│   ├── server.js              # Main server file
│   ├── db.js                  # Database config & functions
│   ├── package.json           # Dependencies
│   ├── sorehari.db            # SQLite database (auto-created)
│   ├── uploads/               # Folder untuk menyimpan foto dari admin
│   └── public/
│       └── admin.html         # Admin dashboard
```

---

## 🚀 Cara Setup & Jalankan

### 1. **Install Node.js Dependencies**
```bash
cd '/Volumes/Sorehari II/backend'
npm install
```

### 2. **Jalankan Backend Server**
```bash
npm start
```

Output yang akan keluar:
```
🚀 Sorehari server running on http://localhost:3000
```

**Backend akan membuat database otomatis di `backend/sorehari.db` saat startup.**

### 3. **Akses Admin Dashboard**
Buka browser:
```
http://localhost:3000/admin.html
```

### 4. **Akses Frontend Landing Page**
Frontend bisa dibuka langsung:
- File lokal: Buka `image/index.html` di browser
- Atau bisa di-serve via VSCode Live Server

---

## 📝 Fitur Admin Dashboard

1. **Tambah Client Baru**
   - Input nama client (contoh: "Budi & Rina")
   - Tambah deskripsi (contoh: "Wedding Jakarta")

2. **Upload Foto per Client**
   - Max 5 foto per client
   - Foto otomatis dioptimasi (resize + compress dengan Sharp)
   - Bisa upload multiple files sekaligus

3. **Hapus Foto**
   - Hover di foto, klik icon ×
   - Foto akan dihapus dari database dan storage

4. **Hapus Client**
   - Klik "Hapus" di setiap client
   - Semua foto client akan otomatis dihapus

---

## 🎬 Portfolio Page Features

1. **Auto-Carousel per Client**
   - Setiap client punya carousel foto sendiri
   - Auto-play setiap 5 detik
   - Manual navigation dengan arrow buttons
   - Dots indicator untuk navigasi

2. **Responsive Design**
   - Layout sempurna di mobile, tablet, desktop
   - Aspect ratio tetap konsisten

3. **Fetch dari API**
   - Portfolio otomatis load data dari backend
   - Tidak perlu upload manual ke folder

---

## 🛠️ API Endpoints

### Clients
```
GET    /api/clients              # Ambil semua clients
GET    /api/clients/:slug        # Ambil 1 client by slug
POST   /api/clients              # Buat client baru
PUT    /api/clients/:id          # Update client
DELETE /api/clients/:id          # Hapus client
```

### Photos
```
POST   /api/clients/:clientId/photos   # Upload photo (max 5)
DELETE /api/photos/:id                 # Hapus photo
POST   /api/photos/reorder             # Reorder photos
```

---

## 📦 Optimization

### Image Optimization
- Original images: ~27MB (img1, img2, img3)
- Optimized versions: ~118KB-133KB per file
- Format: JPEG quality 85
- Max size: 1200x1200px

### Auto-Generated Responsive Images
Backend menggunakan `Sharp` untuk:
- Resize image agar max 1200x1200
- Compress ke JPEG quality 85
- Hapus file temp otomatis

---

## ⚙️ Konfigurasi

### Upload Limits
- Max file size per upload: **10MB**
- Max photos per client: **5**
- Allowed formats: JPEG, PNG, WebP

### Server Port
Default: `3000`  
Bisa diubah via environment variable: `PORT=4000 npm start`

---

## 🔒 Notes for Production

1. **Enable HTTPS** - Gunakan SSL certificate
2. **Environment Variables** - Setup `.env` file untuk sensitive config
3. **Database Backup** - Regular backup `sorehari.db`
4. **Upload Folder** - Setup proper permissions untuk `uploads/`
5. **Rate Limiting** - Add rate limiter untuk API
6. **Authentication** - Add auth system untuk admin panel

### Admin Authentication (Basic Auth)

This project includes a simple HTTP Basic Auth protection for the admin dashboard and related admin API endpoints. To enable it, create a `.env` file inside the `backend/` folder (copy from `.env.example`) and set secure credentials:

```
ADMIN_USER=youradmin
ADMIN_PASS=yourpassword
```

Restart the server and open the admin page — the browser will prompt for username/password when you visit:

```
http://localhost:3000/admin.html
```

Note: For production, replace this with a proper auth system (sessions, OAuth, or identity provider) and enable HTTPS.

---

## 📱 Mobile Support

✅ Admin dashboard fully responsive
✅ Portfolio page fully responsive
✅ Touch-friendly carousel controls
✅ Optimized images untuk mobile loading

---

## 🎯 Next Steps (Optional)

1. **Auth system** - Add login untuk admin panel
2. **Image compression** - Add WebP format untuk better compression
3. **CDN** - Upload ke CloudStorage (AWS S3, Google Cloud Storage)
4. **Search/Filter** - Add search di portfolio page
5. **Lightbox** - Add image lightbox untuk detail view
6. **Multi-language** - Support EN/ID

---

## 🐛 Troubleshooting

### Backend tidak jalan
```bash
# Clear node_modules & reinstall
rm -rf node_modules package-lock.json
npm install
npm start
```

### CORS error di browser
- Backend sudah config CORS di line `app.use(cors())`
- Jika masih error, cek URL di portfolio.html harus `http://localhost:3000`

### Database error
- Delete `backend/sorehari.db`
- Restart server (auto-create database)

---

**Sekarang siap untuk manage portfolio dengan mudah! 🎉**
