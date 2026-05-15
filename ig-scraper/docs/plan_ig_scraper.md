# Desain & Rencana Implementasi: Aplikasi Scraper IG Properti

Aplikasi ini akan dibangun dengan pendekatan **Mobile-First** agar optimal dan nyaman digunakan di perangkat seluler. Sesuai permintaan, aplikasi tidak akan menyimpan gambar atau video, hanya data teks esensial dari postingan, yang akan disimpan di serverless database (Supabase/Neon DB).

## 1. Arsitektur Sistem

- **Frontend (UI/UX):** React.js + Vite. Kita akan menggunakan Vanilla CSS dengan desain modern (Glassmorphism, Dark Mode) tanpa Tailwind (kecuali diminta).
- **Backend / Scraper:** Python (Mengingat Anda sudah memiliki folder `backend` dengan file `scraper.py`, `models.py`, `app.py`). Backend ini akan bertugas melakukan scraping data dari Instagram dan menyimpannya ke Database.
- **Database:** Supabase (PostgreSQL) atau Neon DB. Sangat direkomendasikan menggunakan Supabase karena menyediakan fitur API instan (PostgREST) yang dapat langsung diakses oleh Frontend untuk proses filtering data dengan sangat cepat.

## 2. Desain Antarmuka (Mobile-First)

Desain akan mengusung tema **Sleek & Premium (Dark Mode)** dengan aksen warna cerah (vibrant) untuk menonjolkan data. Navigasi akan dibuat sesederhana mungkin.

![Mockup Desain UI](/Users/hoeltzie/.gemini/antigravity/brain/79277d28-50dd-4818-a0da-6d06009fcd7f/ig_scraper_hasil_ui_1778817703300.png)

### Menu Utama (Bottom Navigation / Tab Menu)
Hanya ada dua menu utama:
1. **Target IG** (Halaman untuk mengatur target scraping)
2. **Hasil** (Halaman untuk melihat dan memfilter data)

### Halaman "Target IG"
- **Header:** Judul aplikasi yang elegan.
- **Input Field Target:** Form input minimalis untuk memasukkan *Username* atau *URL Instagram* target yang akan discrape.
- **Pengaturan Akun Viewer (Anti-Ban):** Form input opsional (atau tersimpan di env) untuk memasukkan **IG Username** dan **IG Password** (akun *dummy/viewer*). Kredensial ini digunakan backend untuk login saat melakukan scraping agar terhindar dari blokir/limit algoritma Instagram.
- **Action Button:** Tombol "Mulai Scraping" dengan efek micro-animation saat ditekan.
- **Status Indicator:** Menampilkan status proses scraping (misal: "Sedang mengambil data...", "Selesai").

### Halaman "Hasil"
- **Filter Bar (Horizontal Scroll):** 
  Deretan tombol *pills* untuk memfilter data:
  - 👤 Nama Agen
  - 💰 Rentang Harga
  - 📏 Luas (Tanah/Bangunan)
  - 📍 Lokasi (Jika tersedia dari teks)
- **Data Table / Grid (Editable):**
  Alih-alih kartu statis, data akan ditampilkan dalam bentuk **Tabel Interaktif yang bisa di-scroll secara horizontal** agar muat di layar mobile.
  - Tabel ini berisi kolom-kolom spesifikasi lengkap (Harga, LT, LB, KT, KM, Listrik, Air, SHM, Nama Agen).
  - **Fitur Edit Manual:** Karena hasil ekstraksi teks (Regex) mungkin tidak 100% akurat dari caption IG, pengguna dapat **mengklik *cell* pada tabel untuk mengedit** isinya secara langsung. Perubahan otomatis tersimpan ke database.
  - **Action Kolom:** Terdapat kolom tombol kecil "Buka di IG" untuk melihat postingan asli.

## 3. Skema Database (Serverless DB)

Kita akan membuat tabel `properties` dengan struktur yang komprehensif untuk menampung seluruh detail spesifikasi rumah dan data agen:

| Kolom | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `ig_post_url` | String | Link postingan IG (Unique) |
| `price` | Numeric | Harga properti (jika ada) |
| `land_area` | String | Luas tanah (misal: "180 m2") |
| `building_area` | String | Luas bangunan (misal: "256 m2") |
| `bedrooms` | String | Jumlah Kamar Tidur (misal: "4+1") |
| `bathrooms` | String | Jumlah Kamar Mandi (misal: "4+1") |
| `floors` | String | Jumlah Lantai (misal: "2") |
| `facilities` | Text | Fasilitas ruang (Tamu, Keluarga, Pantry, dll) |
| `carport` | String | Kapasitas Carport (misal: "2 Mobil") |
| `electricity` | String | Listrik (misal: "5500 W") |
| `water` | String | Sumber Air (misal: "PDAM") |
| `certificate` | String | Jenis Sertifikat (misal: "SHM") |
| `agent_name` | String | Nama & No HP Agen (misal: "Yuni (0811-5415-611)") |
| `description` | Text | Teks caption asli (untuk fallback) |
| `scraped_at` | Timestamp | Waktu data diambil |

## 4. Langkah-Langkah Implementasi

1. **Fase 1: Persiapan Database (Supabase / Neon DB)**
   - Membuat project baru.
   - Menjalankan migrasi SQL untuk membuat tabel `properties`.
   - Mendapatkan URL koneksi dan API Key.

2. **Fase 2: Pembaruan Backend (Python) & Parsing Data**
   - Menyesuaikan `scraper.py` agar mengekstrak spesifikasi secara detail (Luas Tanah, Luas Bangunan, KT, KM, Lantai, Carport, Listrik, Air, SHM) menggunakan pola *Regex* dari baris teks deskripsi.
   - **Ekstraksi Agen & Kontak:** Membuat logika *parser* khusus (contoh: regex untuk mendeteksi nomor telepon dan nama agen seperti "Yuni (0811-5415-611)") agar dapat digabung dan disimpan di kolom `agent_name` untuk mempermudah proses filtering.
   - Menambahkan logika penyimpanan langsung ke Supabase/Neon DB menggunakan library klien database Python.

3. **Fase 3: Pembuatan Frontend (React + Vite)**
   - Inisialisasi project: `npx create-vite@latest frontend --template react`
   - Membuat struktur komponen (Layout, TabNavigation, ScraperForm, FilterBar, PropertyCard).
   - Menulis CSS kustom dengan variabel warna, typography modern (Google Font: Inter / Outfit), dan efek glassmorphism.

4. **Fase 4: Integrasi & Fungsionalitas**
   - Menghubungkan Frontend ke Supabase API untuk mengambil data hasil secara *real-time*.
   - Membuat logika filtering di sisi klien atau langsung query ke Supabase (direkomendasikan query ke Supabase agar ringan di mobile).
   - Menghubungkan Frontend ke Backend Python (via API lokal/cloud) untuk memicu proses scraping di halaman "Target IG".

5. **Fase 5: Polishing & Testing**
   - Menguji responsivitas di resolusi mobile.
   - Menambahkan transisi dan animasi yang *smooth*.
   - Deployment Frontend ke Vercel/Netlify.

---
*Silakan berikan feedback pada rencana ini. Jika Anda setuju, kita bisa langsung mulai dengan inisialisasi project React/Vite dan pembuatan struktur UI.*
