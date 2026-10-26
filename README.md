# Nyambung

Daily word connections dalam bahasa Indonesia. Vite + React + TypeScript + Tailwind/GSAP, Hono pada Node.js, Drizzle + SQLite (`better-sqlite3`). Node **24+** dan npm workspaces.

## Jalankan lokal

```sh
npm ci
npm run demo
npm run dev
```

Buka **http://127.0.0.1:5173**. Vite meneruskan `/api` ke Hono pada port 3000. `npm run demo` menyiapkan 14 paket mulai hari ini dalam WIB; dapat dijalankan ulang pada tanggal yang sama. Tidak ada API key yang dibutuhkan untuk demo. Skor demo berasal dari **contoh kurasi**, bukan embedding. UI selalu menandainya. Kosakata dikenal lain mendapat nol dalam demo.

Development menerima origin `http://localhost:5173` dan `http://127.0.0.1:5173` saat `PUBLIC_ORIGIN` belum diisi. Izin ini tidak berlaku pada produksi. Jika memakai URL preview lain, isi `PUBLIC_ORIGIN` dengan origin persis URL tersebut, lalu restart API. Jangan memakai nilai contoh domain produksi ketika menjalankan lokal.

Untuk tanggal awal yang tetap:

```sh
npm run demo -- --start 2026-10-22
```

Database default ada di `data/nyambung.sqlite`, sama untuk CLI, dev, dan produksi. `DATABASE_PATH` dapat mengarah ke database lain; jangan mencampur demo dan edisi semantik pada tanggal yang sama. Paket yang sudah terbit tidak bisa ditimpa.

## Persiapan edisi semantik

1. Salin `.env.example` menjadi `.env`. Isi `JINA_API_KEY`, model, dan `CONTENT_START_DATE` (tanggal peluncuran yang tetap). Jangan commit `.env`.
2. Tinjau `content/puzzles.ts`: 14 paket / 70 stage original, kosakata Indonesia + slang, alias ejaan, penjelasan dan koreksi koneksi. Kamus semantik menggabungkan sekitar 32 ribu kata dari `content/lexicon.json`; sumber dan lisensinya ada di `content/LEXICON-LICENSE.md`. Demo sengaja tetap memakai kamus kecil editorial, sehingga menambah file kamus saja tidak mengubah paket demo yang sudah tersimpan. Ini **kandidat editorial**, belum dinyatakan direview manusia. Tambahkan kosakata jika ingin menerima lebih banyak kata; v1 sengaja bukan seluruh kamus Indonesia.
3. Siapkan database produksi terpisah; variabel environment yang sudah disetel lebih diutamakan dari `.env`.

```sh
DATABASE_PATH=data/production.sqlite npm run content -- embed
DATABASE_PATH=data/production.sqlite npm run content -- preview --start 2026-11-01
```

CLI memakai **Jina AI**, default `jina-embeddings-v5-text-small`, task simetris `text-matching`, 512 dimensi dan L2 normalization. Semua kata diberi konteks seragam `Kata bahasa Indonesia: KATA` sebelum embedding agar model menangkap bahasa permainan. Format konteks ini termasuk versi cache; vektor kata tanpa konteks tidak dicampur. Endpoint `https://api.jina.ai/v1/embeddings` menerima array kata dan mengembalikan vektor terpisah. CLI mengirim 128 kata per batch dengan concurrency terbatas; hasil diurutkan kembali berdasarkan `index` respons sebelum disimpan agar vektor tidak tertukar. Batch yang tidak lengkap/invalid tidak disimpan.

Cache dipisahkan berdasarkan provider/model/task/dimensi. Cache Gemini lama tidak dibaca atau dicampur dengan Jina. Provider hanya dipakai saat persiapan konten; gameplay tidak memakai API key. Jika Jina membatasi request, saldo token habis, atau jaringan gagal, hasil batch yang sudah lengkap tetap tersimpan. Jalankan embed lagi untuk melanjutkan. Free trial Jina memiliki batas token; periksa saldo di dashboard, jangan menganggapnya gratis tanpa batas. Key dikirim sebagai Bearer header dan tidak dicetak atau disimpan di database.

Preview menulis **data/review.json** berisi 30 kandidat teratas per stage dan hash persetujuan. Review semua 70 stage: jawaban terbaik, asosiasi yang tidak sengaja, antonim, slang dan kata alternatif. Perbarui `overrides` untuk menaikkan kredit koneksi yang model remehkan; semua nilainya 0–1. Kata valid pada `excluded` tetap diterima tetapi diberi nol poin, misalnya antonim yang kebetulan dekat dalam embedding. Ulangi preview setelah perubahan.

```sh
DATABASE_PATH=data/production.sqlite npm run content -- publish --start 2026-11-01 --approve HASH_DARI_PREVIEW
```

Publikasi memverifikasi hash isi paket lalu menulis 14 hari secara atomik. Tidak ada overwrite, rolling regeneration, atau panggilan Jina saat bermain. Jika satu tanggal bertabrakan dengan snapshot berbeda, seluruh publikasi dibatalkan. Jika daily tidak tersedia, API/UI mengembalikan status belum tersedia. Siapkan batch berikutnya dengan tanggal awal berikutnya sebelum stok habis; content CLI memakai kandidat sumber yang saat ini tersedia, jadi edit sumber untuk membuat soal baru.

Untuk mengganti **edisi demo saja** dengan paket semantik yang sudah direview, gunakan hash preview:

```sh
npm run content -- upgrade-demo --start 2026-10-22 --approve HASH_DARI_PREVIEW
```

Perintah ini menolak perubahan atas edisi semantik yang sudah terbit. Migrasi v2 menyimpan snapshot run lama, sehingga skor/jawaban demo tidak dihapus. Setelah upgrade, beranda menawarkan “Main edisi semantik”; start membuat run aktif baru dan mengarsipkan run demo sebelumnya. Retry dari tab lama tetap mengembalikan versi dan hasil demo asli. Statistik hanya menghitung run aktif supaya tanggal yang sama tidak dihitung dua kali.

**Model dan kalibrasi:** kurangi mean vektor korpus untuk menghilangkan komponen konteks bahasa yang sama; provider vectors asli tetap tersimpan. Cosine per clue dihitung pada ruang yang sudah dipusatkan ini, baseline persentil ke-10 kosakata, dinormalisasi terhadap maksimum similarity jawaban terbaik dan persentil ke-99,9 (mencegah acuan yang diremehkan model membuat ribuan kata mendapat nilai penuh), dipotong ke 0–1, lalu pangkat 0,55 untuk memberi kredit parsial yang lebih halus. Harmonic mean menggabungkan koneksi; pada tiga clue, koneksi terlemah mendapat kredit awal 0,25 sehingga menghubungkan dua clue dengan kuat masih memberi sekitar 500 poin. Kedekatan makna memakai satu koneksi. Override hanya menaikkan kredit. Setiap paket membekukan versi formula, model, hash kosakata, alias, larangan, serta seluruh tabel skor. Hasil memuat peringkat di antara kata valid serta cosine similarity per petunjuk. Peringkat menggunakan competition ranking: kata dengan skor sama memiliki peringkat yang sama. Perubahan embedding di kemudian hari tidak memengaruhi paket terbit.

Referensi API: https://docs.jina.ai/ dan https://jina.ai/embeddings/. Harga/kuota free tier tergantung akun dan dapat berubah. V1 tidak memerlukan vector database atau model lokal.

## Kontrak permainan

- Reset pukul 00.00 WIB, otoritatif dari server. Tiga stage dua clue, satu tiga clue, satu kedekatan makna.
- Satu jawaban valid per stage. Input di luar kosakata, clue/alias clue, kata larangan, dan multiword tidak menghabiskan kesempatan. Input dinormalisasi tanpa stemming. Lewati berarti nol.
- Jawaban terbaik hanya dibuka setelah submit; clue berikutnya dan tabel skor tidak dikirim lebih awal.
- Cookie acak HttpOnly, SameSite=Lax, Secure pada produksi. Pemain anonim hanya bisa mengakses run miliknya. Progres tersimpan di SQLite; localStorage hanya menyimpan draft input dan preferensi motion.
- Unique constraint dan transaksi `IMMEDIATE` mengunci satu run aktif per pemain/tanggal dan satu jawaban per stage. Run menunjuk versi paket yang dibekukan; versi lama disimpan sekali dan tidak disalin per pemain. Retry/dua tab mengembalikan jawaban asli yang sudah disimpan, meskipun body berbeda.
- Sesi lama tetap dapat diselesaikan setelah tengah malam. Streak dihitung dari tanggal puzzle, bukan tanggal submit. Menghapus cookie atau perangkat berbeda membuat pemain baru; v1 tidak memiliki recovery akun.

| API | Perilaku |
| --- | --- |
| `GET /api/daily` | Tanggal WIB, waktu server/reset, ketersediaan dan progres hari ini |
| `GET /api/archive` | Daily terbitan sebelum hari ini beserta status progres sendiri; cursor `?before=YYYY-MM-DD` |
| `POST /api/runs` | Membuat/melanjutkan run hari ini; `{date:"YYYY-MM-DD"}` untuk Daily lama yang sudah terbit |
| `GET /api/runs/:id` | Progres milik pemain, hasil terbuka, satu prompt aktif |
| `POST /api/runs/:id/answers` | `{stage: 0..4, word?: string, skip?: boolean}`; hasil run terbaru |
| `GET /api/me/stats` | Selesai, streak, terbaik, rata-rata |

Validasi gagal: 400, bukan pemilik/tidak tersedia: 404, stage melompat: 409, rate limit cookie: 429. Error memakai `{error: string}`. Mutasi memeriksa Origin, body dibatasi 1 KB, respons API tidak di-cache. Rate limit per identitas bukan proteksi bot menyeluruh; reverse proxy dapat menambahkan pembatasan IP jika diperlukan.

## Verifikasi

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest menguji scoring, batas WIB, validasi, dua identitas, retry, urutan stage, snapshot/publikasi atomik dan streak. Playwright menjalankan alur lima stage, draft/resume, dua tab, skip dan share tanpa spoiler pada desktop dan mobile reduced motion, memakai server dan database memori terpisah.

**Bagikan hasil** membuka pratinjau kartu PNG 1080 × 1350 berisi skor total, skor per babak, tanggal, dan mode. Petunjuk, tebakan, dan jawaban terbaik tidak dimasukkan ke gambar. **Bagikan gambar** memakai file PNG melalui Web Share API bila didukung, dan mengunduh PNG sebagai fallback. **Unduh gambar** selalu tersedia. Gambar dibuat di browser; hasil tidak diunggah ke layanan gambar. Bagian biru pada gelombang hasil mengikuti proporsi poin, dengan sisa garis abu-abu.

## Produksi dan backup

```sh
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PUBLIC_ORIGIN=https://nyambung.example.com DATABASE_PATH=data/production.sqlite npm start
```

Satu proses Hono melayani frontend dan API pada origin sama. Tempatkan di belakang reverse proxy HTTPS; cookie Secure produksi membutuhkan HTTPS dari sisi browser. Set `PUBLIC_ORIGIN` ke origin HTTPS publik yang persis sama (tanpa trailing slash), agar validasi Origin tetap benar di belakang TLS termination. Header Host saja tidak membuktikan origin publik. Untuk Docker, set `PUBLIC_ORIGIN` pada `.env`, lalu `docker compose up --build -d` memakai `./data` dan `./backups` sebagai volume persisten. Pastikan direktori dapat ditulis UID 1000. Isi database menggunakan CLI sebelum peluncuran. Docker tetap menyertakan CLI untuk persiapan dan backup; gunakan key hanya untuk perintah persiapan, bukan environment layanan gameplay.

Backup SQLite memakai online backup API agar WAL yang belum di-checkpoint tetap ikut:

```sh
DATABASE_PATH=data/production.sqlite npm run backup
```

Jadwalkan setiap hari, misalnya cron dengan **path absolut** ke node, checkout, dan database:

```cron
0 2 * * * cd /srv/nyambung && DATABASE_PATH=/srv/nyambung/data/production.sqlite /usr/bin/node --import tsx scripts/backup.ts >> /srv/nyambung/backups/backup.log 2>&1
```

Perintah backup menghasilkan `.sqlite.gz` dan menyisakan satu backup Nyambung terbaru setelah file baru selesai dibuat. Backup lama tetap ada jika backup atau kompresi gagal. File sementara dan file lain tidak ikut retensi. Untuk restore, dekompresi `.sqlite.gz` menjadi `.sqlite` terlebih dahulu. Simpan salinan terpisah jika memerlukan arsip jangka panjang. Untuk restore, hentikan layanan, pindahkan file database beserta `-wal`/`-shm` lama ke lokasi cadangan, lalu salin backup konsisten ke path database dan jalankan lagi. Jangan menyalin file database aktif secara manual. Periksa `PRAGMA integrity_check` dan jumlah paket/run setelah restore. Pantau error HTTP, disk/backup harian, dan stok tanggal daily; perintah CLI keluar nonzero saat gagal.

## Discord berikutnya

`PlatformAdapter` di frontend memisahkan bootstrap identitas dan share; adapter browser memakai cookie. Layanan permainan tidak tergantung React atau Discord SDK. Integrasi Activity berikutnya menambah Embedded App SDK, URL mapping/proxy dan autentikasi server dengan identitas Discord terverifikasi. Cookie browser tidak diasumsikan bekerja lintas iframe; identitas Discord harus ditangani adapter/server tersendiri. V1 belum memasang SDK, bot, leaderboard, atau sinkronisasi multiplayer.

Audio antarmuka memakai enam efek dari **Kenney UI SFX Set** (CC0), dikonversi ke WAV mono untuk browser desktop dan mobile. Aset dan lisensi aslinya ada di `apps/web/public/audio/kenney/`. Suara baru diaktifkan setelah interaksi pemain; toggle **Suara** menyimpan pilihan di browser. Audio yang gagal dimuat tidak menghalangi permainan.

Beranda selalu menampilkan Daily. Tombol **Random Play** berwarna hijau di bawah tombol Main langsung membuka mode acak; bila ada sesi acak yang belum selesai, tombolnya menjadi **Lanjutkan Random Play**. Kembali ke beranda atau refresh menampilkan Daily lagi, sementara progres kedua mode tetap tersimpan secara terpisah.

Tombol **Arsip Daily** di sebelah tanggal membuka Daily yang sudah lewat, dengan status Main, Lanjutkan, atau Lihat hasil. Progres dan hasil tersimpan per tanggal pada identitas pemain yang sama. Memainkan arsip tidak mengganti progres hari ini; statistik tetap menghitung tanggal puzzle. Arsip hanya memuat tanggal yang sudah diterbitkan sebelum hari ini dalam WIB, dan API menolak tanggal mendatang. Daftar dipaginasi 50 tanggal tanpa mengirim petunjuk atau jawaban.

Mode **Acak** menggunakan bank soal terpisah dari daily terjadwal: tiga jembatan dua kata dan satu jembatan tiga kata dibentuk server dari hub kurasi dan relasi leksikal Wordnet Bahasa saat permainan dimulai. Babak kedekatan makna tetap dipilih dari pasangan sinonim yang direview. Sesi yang belum selesai dilanjutkan; setelah selesai, **Main lagi** membuat sesi baru. Urutan soal dan versi skor tersimpan, sehingga refresh dan pembaruan bank tidak mengubah permainan yang sedang berjalan. Mode ini tetap tersedia ketika daily tanggal aktif belum diterbitkan dan tidak dihitung dalam streak/statistik daily.

Kandidat hubungan tambahan ada di `content/relations-extra.ts`, mencakup makna ganda, idiom, benda, kegiatan, dan konsep sehari-hari. Kompilasi Wordnet mempertahankan setiap sense yang lolos filter untuk satu kata; petunjuk dari sense berbeda tidak dicampur. Perubahan sumber baru berlaku untuk sesi baru setelah preview dan publikasi bank, dengan embedding tersimpan melalui `--reuse-published`.

Siapkan bank acak dengan `npm run content -- preview-random`, review `data/random-review.json`, lalu jalankan `npm run content -- publish-random --approve HASH`. Edisi v4 memakai 85.308 kata yang bisa ditebak, 178 hub editorial ditambah lebih dari seribu hub leksikal yang lolos filter, serta sekitar enam ribu clue kedekatan makna. Hub tambahan berasal dari Wordnet Bahasa yang dipadankan dengan relasi Princeton WordNet 3.0. Hanya sinonim, hipernim langsung, bagian/keanggotaan, serta turunan konsep langsung dalam sense yang sama yang digunakan; hubungan saudara yang hanya berbagi kategori tidak cukup sebagai bukti. Hub leksikal disaring secara otomatis, bukan diklaim semuanya telah direview manusia. Clue yang terlalu umum, regional bermasalah, dan kata yang hanya berbeda bentuk karakter disaring. Source/sense disimpan di setiap hub. Lisensi dan langkah impor ada di `content/LEXICON-LICENSE.md`.

Embedding Jina seluruh kosakata disimpan sebelum publish. Gameplay tidak menghubungi API embedding. Vektor yang telah dikurangi komponen rata-rata dikemas sebagai int8 bertanda dengan skala unit 127 dan norma aktual saat perhitungan cosine; representasi ini dibekukan dalam snapshot v4. Profil setiap clue dibuat sesuai kebutuhan, dicache maksimal 12 profil, lalu tabel skor babak dicache di server. Ini menghindari matriks semua clue × semua kata; bank besar tidak lagi memuat tabel penuh ribuan sinonim sekaligus. Descriptor babak terakhir menyimpan jawaban dan koreksi, lalu skornya dihitung dari indeks beku saat babak dibuka. V1–v3 tetap memakai format/formula semula.

Jawaban sumber mendapat koreksi koneksi minimal 0,94; harmonic mean menentukan skor relatif terhadap penghubung yang dipilih dengan bukti relasi. Seluruh kamus tetap dinilai secara kontinu dari embedding (0–949 untuk jawaban tanpa bukti kurasi/leksikal). Sinonim tambahan dibatasi pada anggota synset yang lolos filter similarity dan antonim dikecualikan. Model tidak mengarang kata atau memaksakan imbuhan untuk memperbesar kamus. Hub kata baru dan ID sense yang belum pernah dilihat diprioritaskan; variasi sinonim dari konsep yang sama tidak dianggap kebaruan penuh. Babak terakhir juga menghindari 20 kelompok makna terakhir bila ada alternatif, sembari mempertahankan rotasi clue. Skor dan sesi lama tetap tersimpan dan dapat diselesaikan.

Perbandingan daily di rekap menampilkan jumlah sesi selesai, rata-rata, dan peringkat pada **tanggal dan versi soal yang sama**. Peringkat seri dibagi; persentase menghitung pemain lain dengan skor lebih rendah, tidak memasukkan diri sendiri. Sesi acak, demo, belum selesai, dan sesi yang digantikan tidak ikut dihitung. Statistik memakai identitas cookie anonim, sehingga menghapus cookie dapat membuat identitas baru. Data kosong tidak diisi dengan angka contoh.

API tambahan: `GET /api/random`, `POST /api/random/runs`, dan `GET /api/runs/:id/comparison`. Semua sesi tetap memakai endpoint pemulihan dan jawaban yang sama. Migrasi database v3 mempertahankan ID sesi/jawaban, memisahkan constraint sesi daily dan acak, serta memeriksa foreign key dalam transaksi. Backup database sebelum pembaruan produksi.

Migrasi v4 memperbaiki instalasi awal v3 yang belum memiliki kolom `runs.stage_order`. Perbaikan ini menambah kolom hanya bila belum ada dan tidak membangun ulang tabel atau mengubah progres sesi. Tes migrasi mencakup database v3 tersebut beserta pemulihan daily dan pembuatan sesi acak.

Pilihan clue dan versi profil untuk setiap sesi disimpan dalam `runs.stage_order`; skor dapat direkonstruksi identik setelah restart. Tabel skor babak hasil generator dicache di server, sementara API hanya membuka babak aktif dan hasil yang sudah dijawab. Edisi lama tetap dapat diselesaikan. `data/random-review.json` memuat contoh kombinasi hasil generator beserta kandidat teratas untuk review. Generator hanya menjalankan perhitungan angka dari profil yang telah dipublikasikan; tidak memanggil Jina saat bermain.


Pemilih adaptif yang diperkenalkan pada v3 dan dipakai v4 memakai retrieval dua sumber: relasi kurasi sebagai bukti hubungan dan profil embedding terbitan sebagai sinyal kedekatan. Setiap kandidat tetap wajib memiliki penghubung yang disetujui. Reranking menyeimbangkan kedekatan, perkiraan skor pemain, dan penalti penggunaan ulang clue/pola. Shortlist dibuat per jawaban agar hub dengan banyak kombinasi tidak mendominasi; 20% pemilihan mengeksplorasi hub lain. Jawaban yang belum pernah dilihat diprioritaskan, lalu jawaban paling lama digunakan jika bank habis. Tiga babak pertama menargetkan perkiraan skor 800, 700, dan 600; babak tiga clue menargetkan 650. Ini perkiraan seleksi, bukan skor yang diberikan secara otomatis.

Model `difficulty-ridge-v1` adalah regresi ridge dengan delapan fitur: bias, jumlah clue, rata-rata/minimum cosine penghubung, ketimpangan koneksi, kedekatan antar-clue, jumlah penghubung yang masuk akal, serta panjang kata. Model dilatih ulang saat permainan acak baru dibuat dari maksimal 1.200 jawaban pemain dan 800 jawaban pemain lain. Skor sah menjadi target 0–1; skip menjadi nol, dengan bobot riwayat sendiri tiga kali lebih besar. Model memakai prior saat data sedikit. Ini supervised learning dari hasil permainan, bukan penilaian kebenaran jawaban oleh suara mayoritas, dan belum ada bukti eksperimen bahwa kesulitan yang diprediksi selalu akurat. Rumus ridge mengikuti [dokumentasi regresi linear scikit-learn](https://scikit-learn.org/stable/modules/linear_model.html#ridge-regression-and-classification); implementasinya TypeScript tanpa layanan model tambahan.

Bobot model, jumlah sampel, jumlah eksplorasi, fitur dan target penghubung untuk setiap sesi disimpan di `runs.stage_order`, hanya di server. Riwayat diambil dari jawaban yang telah committed sehingga retry tidak menggandakan sampel. Pembaruan model hanya memilih soal sesi acak berikutnya: daily dan skor sesi lama tetap identik. Identitas mengikuti cookie anonim yang sudah ada; tidak menambah pelacakan perangkat. Model tidak menerima kata pemain sebagai bukti hubungan baru dan tidak menerbitkan pasangan tanpa kurasi.

Jalankan `npm run audit:random` setelah publikasi untuk mengukur sepuluh permainan mode acak tanpa menambah sesi/identitas/jawaban ke database. Audit melatih model dari riwayat nyata, menulis `data/random-audit.json`, dan gagal jika 40 babak jembatan tidak menghasilkan 40 jawaban serta 40 kombinasi berbeda. Audit ini memeriksa keragaman, bukan evaluasi kualitas prediksi pada data uji. Snapshot edisi v1/v2/v3 tetap dapat diselesaikan dengan formula aslinya.


Filter `word-family.ts` dipakai saat publikasi dan saat retrieval, termasuk untuk snapshot bank yang sudah tersedia. Semua pasangan clue–clue dan clue–target diperiksa untuk keluarga kata berimbuhan, peluluhan konsonan (meninju → tinju, menyapu → sapu), serta ekstensi serapan seperti intelek–intelektual. Pemeriksaan ini hanya menyaring pembentukan soal; input, validitas kamus, dan skor jawaban pemain tetap menggunakan kata utuh. Audit juga gagal bila ada benturan keluarga kata dalam babak baru. Sesi yang telah dimulai tetap memakai deskriptor dan skor semula.

### Discord Activity (beta)

Activity, akun Discord, progres peserta, Rich Presence, serta bot pengingat daily
tersedia sebagai integrasi opsional. Default tetap nonaktif. Ikuti
[setup Discord](docs/discord.md) untuk konfigurasi Developer Portal, environment,
URL mapping, instalasi bot dan pengujian dua akun. `npm run discord:register`
menampilkan preview; tambahkan `-- --apply` untuk mendaftarkan command ke server beta.

### Kualitas jembatan kata

Pemilihan jembatan menolak kata serumpun, sinonim, dan hubungan langsung Wordnet
antar-clue. Kedekatan embedding antar-clue juga dibatasi, lalu kandidat diberi
prioritas berdasarkan jarak konteks, variasi, dan hasil permainan. Hubungan ke
jawaban tetap harus mempunyai bukti kurasi; clue tidak diacak tanpa hubungan.
Filter ini dipakai saat memilih soal baru, sehingga skor sesi lama tetap identik.

`npm run audit:random` memeriksa 10 permainan untuk pengulangan dan clue terlalu
dekat, serta menghitung kombinasi yang benar-benar lolos. Bank aktif bisa diberi
kebijakan baru tanpa meminta embedding lagi menggunakan
`npm run content -- preview-random --reuse-published`, lalu
`publish-random --reuse-published --approve HASH`. Sesi bermasalah yang sama sekali
belum dijawab dipensiunkan saat publikasi; sesi yang sudah dijawab dipertahankan.

Daily semantik memakai kurasi lintas konteks; soal pengantar hanya dipakai untuk
demo. Setelah `preview`, `refresh-upcoming --approve HASH` dapat merevisi tanggal
**setelah hari ini** yang belum mempunyai sesi. Operasi ditolak secara atomik bila
salah satu tanggal tersebut sudah pernah dimulai. Daily hari ini tidak berubah.
Ambil `npm run backup` sebelum revisi database yang sudah digunakan.

Mode acak mengambil sampel berbobot dari seluruh kandidat yang lolos, dengan
rotasi jawaban, konteks, dan pasangan clue. Pasangan yang baru muncul juga
dihindari saat menjadi bagian soal tiga clue; jika bank menyempit, kebijakan
kembali memakai kandidat valid yang tersedia. Kurasi memuat makna ganda, idiom,
kegiatan, dan konsep abstrak, selain benda dan bahan. Audit preview tanpa
mengganti bank aktif: `npm run audit:random -- --preview`. Laporan mencakup jumlah
puzzle yang lolos, pola konteks, clue unik, dan pasangan berulang. Untuk memperbarui
bank dengan embedding tersimpan, gunakan `preview-random --reuse-published`, lalu
`publish-random --reuse-published --approve HASH` sesuai hash preview.
