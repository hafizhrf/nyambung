# Mabar Nyambung

Mabar memiliki empat mode dan tidak menulis ke run, statistik, atau leaderboard Daily solo.
Website menyediakan Solo/Mabar, profil guest, avatar, daftar room publik, room tidak terdaftar,
password, dan link `/?room=KODE`. Guest mengikuti cookie browser; menghapus cookie membuat
identitas baru. Password room bukan akun pengguna.

## Aturan

| Mode | Pemain | Pengaturan | Penilaian |
| --- | --- | --- | --- |
| Rantai Gambar | 3–12 | Teks/gambar 20/40, 30/60, atau 45/90 detik | Semua memulai rantai; operan melingkar, galeri, voting 30 detik; tidak boleh memilih rantai sendiri |
| Tebak Cepat | 2–12 | 5/10/15 soal, 15/20/30 detik | Jawaban pasti dari 100 soal lokal, 500–1.000 poin menurut waktu server; satu percobaan/detik |
| Nyambung Bareng | 2–12 | 5/10 babak, 20/30/45 detik | Paket pool Acak terversi; satu jawaban valid; skor semantik 0–1.000 tanpa bonus kecepatan |
| Sambung Kata | 2–12 | 3/5/7 putaran, 7/10/15 detik | Huruf terakhir, kamus lokal, tanpa pengulangan; 100 poin/kata; timeout melewati giliran |

Skor sama berbagi peringkat. Pemain yang bergabung di tengah pertandingan menonton hingga
pertandingan berikutnya. Semua pemain aktif harus siap sebelum host mulai. Chat hanya tersedia
di lobby/rekap; mute berlaku lokal. Host dapat kick, ban selama umur room, dan memindahkan host.
Draft rantai bersifat privat; tugas sebelumnya baru dikirim kepada penerima berikutnya. Server
menyimpan draft maksimal sekali/detik, bukan setiap gerakan pointer. Canvas interaktif dirender
di luar filter CRT dengan clipping ke viewport arena supaya koordinat sentuhan akurat dan
tidak menutupi bingkai saat digulir; HUD dan galeri tetap memakai CRT/bloom.

Satu sesi permainan hanya memiliki satu koneksi pengendali. Koneksi baru menutup yang lama.
Heartbeat 15 detik, koneksi dianggap putus setelah 45 detik; host berpindah setelah 60 detik
terputus. Reconnect memulihkan tahap, draft, dan skor. Restart server membatalkan pertandingan
yang sedang berjalan, tanpa memberi pemenang, lalu kembali ke lobby. Room web kosong kedaluwarsa
setelah 15 menit; room Discord kosong diperiksa setelah satu menit dan hanya ditutup setelah Discord mengonfirmasi
instance berakhir. Gangguan API Discord tidak menghapus room.

## Discord

Dengan mabar aktif, Activity membuka lobby otomatis; Solo tetap ada di menu. Room dikunci ke
`applicationId:instanceId`, guild/channel diverifikasi dari Activity Instance API. Hanya pengguna
yang mengautentikasi Activity tersebut yang mendapat kursi. Anggota voice channel yang belum
membuka Activity tidak otomatis menjadi pemain. Nama/avatar mengikuti akun Discord, bukan profil
guest. Sesi dan keanggotaan diperiksa ulang saat koneksi hidup; sesi kedaluwarsa meminta koneksi
baru melalui refresh SDK. Instance baru membuat lobby baru. Room tidak menerima guest web atau
muncul di listing web.

Kartu channel memakai pengiriman durable yang sama dengan kartu Daily, tanpa menambahkan worker
atau pesan per-frame. Status mabar hanya berisi mode, jumlah pemain dan tahap. Skor baru masuk
kartu setelah selesai; jawaban dan gambar tidak disertakan. PiP hanya ringkasan tanpa tugas rahasia.
Kembali ke Activity penuh melanjutkan draft. Tombol Simpan gambar mengekspor PNG 1080 × 1350
dengan font lokal, Unicode, avatar, CRT, dan bloom.

## Menjalankan dan mengaktifkan

`MABAR_ENABLED=false` adalah default. Migrasi SQLite v10 menambahkan profil, room, dan pertandingan
secara aditif. Jalankan satu proses aplikasi dengan volume data persisten; jangan menjalankan
beberapa replika dengan SQLite terpisah.

1. Backup data sebelum deploy, lalu build image baru.
2. Pastikan `./data` dapat ditulis UID 1000. Avatar berada di `data/uploads/avatars`; `UPLOAD_DIR`
   dapat mengganti direktori uploads. Compose sudah memasang volume data persisten.
3. Pastikan reverse proxy meneruskan upgrade WebSocket `/api/mabar/ws`, mempertahankan Origin,
   dan memberi timeout idle setidaknya 60 detik. Mapping `/` Discord yang ada harus menuju origin
   aplikasi yang sama; klien memakai WSS pada origin proxy dan mendukung prefix `/.proxy/`.
4. Setelah pengujian konfigurasi, set `MABAR_ENABLED=true` dan restart aplikasi. Untuk menonaktifkan,
   ubah kembali flag; data solo tidak berubah dan data mabar tetap tersimpan.

Avatar menerima JPEG/PNG/WebP maksimal 2 MB dan 16 megapiksel; server menghapus metadata dan
mengonversi ke WebP 256 × 256. Hanya hasil konversi yang dilayani. File yang tidak direferensikan
profil dibersihkan setelah 24 jam. Original tidak disimpan. Batas upload terpisah dari body API
solo 1 KB. Password di-hash dengan scrypt dan salt. Tiket WebSocket sekali pakai berlaku 30 detik;
token sesi utama tidak masuk URL socket. Command dan snapshot privat divalidasi di server.

### Backup dan restore

`npm run backup` sekarang menghasilkan `nyambung-*.tar.gz` berisi snapshot SQLite konsisten
`nyambung.sqlite` dan hanya avatar yang direferensikan snapshot tersebut dalam `uploads/avatars`.
Jika file yang direferensikan hilang, backup gagal dan backup lama dipertahankan. Retensi tetap
menyimpan satu backup terbaru, termasuk format `.sqlite.gz` lama.

Untuk memulihkan backup buatan aplikasi: hentikan container, ekstrak arsip ke direktori sementara,
periksa integritas SQLite (`PRAGMA integrity_check`) dan keberadaan avatar, lalu pulihkan
`nyambung.sqlite` beserta `uploads/` ke volume data. Pindahkan database lama beserta file WAL/SHM
ke tempat cadangan, atur kepemilikan UID 1000, lalu jalankan aplikasi. Jangan menimpa database
ketika aplikasi masih berjalan. Backup lama `.sqlite.gz` tetap dapat dipulihkan sebagai SQLite,
namun tidak membawa avatar.

## API dan pengujian

HTTP `/api/mabar`: `GET config`, `GET/POST profile`, `POST avatar` (body biner; kosong menghapus
foto), `GET media/:file`, `GET/POST rooms`, `POST rooms/:id/join`, `POST rooms/:id/leave`,
`GET rooms/:id`, `POST rooms/:id/ticket`, dan `POST discord` untuk lobby Activity.

WebSocket `/api/mabar/ws?ticket=...` mengirim `snapshot`, `ack`, atau `error`. Command mempunyai
UUID unik, `type`, payload, dan untuk aksi pertandingan `matchId` serta `stage`. Duplikasi tidak
diproses dua kali; input tahap lama atau melewati deadline ditolak. Snapshot tidak memuat password,
bank jawaban, seluruh rantai sebelum galeri, maupun jawaban pemain lain sebelum reveal.
ID publik guest berasal dari hash terpisah; ID sesi/cookie tidak dikirim ke anggota room.
Pemain Discord memakai snowflake publik Discord, bukan ID pemain internal.

```sh
npm run build
npm test
MABAR_ENABLED=true npm run test:e2e -- tests/e2e/mabar.spec.ts
MABAR_ENABLED=false npm run test:e2e -- --grep-invert 'multiplayer|web lobby creates'
node --import tsx scripts/mabar-load.ts
```

Endpoint percepatan waktu hanya terdapat dalam `scripts/e2e-server.ts`, bukan server produksi.
Uji beban lokal: 20 room, 240 koneksi, 100 command chat hingga diterima klien terakhir; p95 1,83 ms,
maksimum 9,80 ms, RSS 249 MiB. Mesin: macOS x64 Intel i7-9750H 2,60 GHz, Node v24.18.0.
Ini mengukur overhead room/broadcast; bukan benchmark jaringan internet atau seluruh sesi menggambar.

Pengujian Discord desktop/mobile asli, WSS melalui proxy produksi, dan keyboard virtual pada
perangkat fisik masih perlu dilakukan di deployment. Mock SDK dan viewport browser dicatat terpisah.

### Hasil verifikasi lokal

Build/typecheck dan 142 tes Vitest lolos. Dua belas tes browser mabar lolos, termasuk SDK Discord
mock dengan dua akun, empat mode, canvas sentuh, keyboard virtual, PiP empat ukuran, dan pemulihan draft.
Regresi solo/Discord mencakup 60 skenario dengan dua tes keyboard desktop dilewati; ekspor PNG mobile
yang melewati waktu tunggu awal berhasil pada pemeriksaan ulang dengan batas rasterisasi 15 detik.

Preview: [lobby](screenshots/mabar-lobby.png), [mobile](screenshots/mabar-mobile.png),
[canvas](screenshots/mabar-canvas.png), dan [PNG hasil](screenshots/mabar-share.png).

Daily solo juga lolos pengujian lima babak dan ekspor saat flag mabar aktif pada desktop/mobile.
Batas canvas diuji ulang melalui permainan rantai lengkap pada kedua layout.
