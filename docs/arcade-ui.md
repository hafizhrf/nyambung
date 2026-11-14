# Tampilan arcade Nyambung

Satu tema gelap untuk website, Discord Activity, dan floating/PiP: font pixel tegak Press Start 2P,
bingkai pixel emas, petunjuk hijau/ungu, serta skor bergaya mesin arcade.
Tombol **Efek CRT** tersedia di **Pengaturan**, bersama Motion dan Suara. Tombol ini mengatur vignette, phosphor RGB, scanline statis, bloom berwarna, serta gelombang horizontal pelan.
Judul beranda dan rekap memotong garis bingkai seperti menu konsol lama.
Logo beranda memakai kedip lampu cepat bertahap (2,4–3,1 detik). Logo navbar
tetap menyala stabil; keduanya memakai bloom lokal tiga lapis saat CRT on. Motion off, reduced
motion, CRT off, atau tab tersembunyi menghentikan kedip; bloom tetap ada saat
Motion off. Tidak ada filter blur atau displacement pada konten.

Pergantian halaman Solo, fase Mabar, dan dialog memakai efek power-on CRT
selama sekitar 0,2 detik: panel membuka dari garis horizontal, lalu isi tampil
bertahap seperti phosphor. Angka skor dan perubahan input ke tombol Lanjut
memakai easing langkah pixel. Transform dibersihkan setelah selesai. Animasi
Mabar hanya dipicu perubahan tampilan/fase, tidak oleh tick timer atau pesan
socket; fokus, input, dan kanvas tidak di-remount untuk animasi.
Papan permainan hanya menampilkan kata dan kekuatan koneksi, tanpa label jenis
babak, nomor petunjuk, atau label jawaban. Kata tetap satu baris; kolom dan ukuran
font menyesuaikan lebar kata setelah font lokal selesai dimuat. Rekap memakai
pemisah baris dengan label petunjuk di atas garis, tanpa kotak per babak.
Beranda memakai daftar menu terbuka, rekap memakai lima bar LED. Footer, contoh koneksi
beranda, grafik gelombang, dan keterangan share yang berulang sudah dihapus.
Preferensi CRT tetap berfungsi dalam sesi jika storage diblokir.
Percabangan petunjuk memakai titik kotak dengan sorotan yang meloncat per langkah.
Setiap jalur masuk ke port berbeda di atas kotak jawaban, sehingga jalur tengah
tidak ditumpuk oleh jalur kiri/kanan. Isi kotak jawaban dipusatkan vertikal.
Tinggi kartu permainan mengikuti isinya: papan kata dan panel input/skor
berjarak tetap, tanpa ruang tengah yang meregang di layar tinggi. Layout
landscape pendek tetap memakai dua kolom. Input HP memakai font minimal 16 px.
Saat keyboard virtual menutup setelah submit, status keyboard dipertahankan
sampai tinggi visual viewport pulih, walaupun fokus sudah ke tombol Lanjut.
Skor babak memakai angka dan penyebut pada dua baris terkontrol; `/ 1.000`
tetap satu baris utuh dan ukuran angka mengikuti lebar kolom skor. Peringkat jawaban dipisah ke baris metadata di bawah skor dan jawaban terbaik.
Tombol **Top 5 kata** membuka dialog tersendiri agar kartu permainan tetap ringkas;
setelah selesai, daftar tiap babak bisa dibuka lagi dari rekap.
Daftar hanya tersedia untuk babak yang sudah dijawab/dilewati dan memakai edisi
sesi yang sama, termasuk sesi lama; API tidak mengubah hasil yang tersimpan.
Indikator loading tombol Daily/Random mengikuti request yang dipilih dan pulih
setelah kegagalan request.
Judul rekap
mendapat ruang di atas bingkai serta jarak dari tanggal di dalamnya. Rekap yang
tinggi, termasuk leaderboard Discord, bergulir di area konten tanpa menimpa header.
Jika ruang keyboard sangat pendek, hanya bagian dalam kartu yang bergulir;
input dan tombol aktif dibawa ke area terlihat setelah layout diperbarui.
Tes mencakup visual viewport dan layout viewport yang menyusut, offset viewport,
serta tinggi tersisa 240 px. Pemeriksaan ini memakai simulasi browser; keyboard
pada perangkat fisik tetap dicatat sebagai pengujian terpisah.
Pada rekap Random, tombol Main lagi berada di tengah dan memotong garis bawah;
label Acak yang sebelumnya mendampingi tombol dihapus. Garis bawah terdiri
dari dua segmen di kiri/kanan tombol, sehingga tidak terlihat menembus tombol
saat loading atau animasi. Garis tetap diam saat tombol masuk, dan bayangan
bingkai persegi di bawah garis dihapus.
Pengisian koneksi juga bertahap; panjangnya tetap sesuai persentase setiap petunjuk.
Motion off dan reduced motion menampilkan jalur statis.

Efek cembung di halaman dihapus: bingkai luar, panel, teks, dan dialog tidak
memakai displacement atau filter geometri. Bloom berwarna memakai text-shadow
dan glow bingkai; vignette, kisi RGB, scanline statis, serta sapuan cahaya tetap
tersedia melalui tombol Efek CRT. Tidak ada blur atau distorsi layar penuh.

Sapuan cahaya selebar 16% tinggi layar bergerak dari atas ke bawah dalam siklus
12 detik melalui transform CSS pada gradasi transparan. Tidak ada backdrop-filter,
mask animasi, atau filter SVG pada seluruh viewport. Motion off, reduced motion, CRT off,
dan tab tersembunyi menghentikan gerakan. Tes memeriksa posisi hover/klik di ujung
header, kemajuan sapuan, pixel cahaya, dan ukuran layout saat CRT diubah.
CRT off menghapus glow, tekstur, vignette, dan sapuan cahaya.
Ekspor gambar tetap memakai pemrosesan pixel tersendiri; tidak membebani interaksi halaman.

Statistik memakai kolom `minmax(0, 1fr)`, ukuran huruf mengikuti lebar dialog,
dan angka dipaskan ke kolom setelah font selesai dimuat. Dialog dapat bergulir
vertikal pada layar pendek, tanpa menggulir atau memotong isi secara horizontal.

PNG share 1080 × 1350 dan kartu Discord diproses langsung melalui `crtImage`
yang sama: lengkungan statis, bloom berwarna, scanline, kisi phosphor, dan vignette.
Efek ikut tersimpan dalam PNG dan tidak bergantung pada tombol CRT di halaman.
Bloom memakai buffer cahaya berukuran seperempat di tiap sumbu dan blur separabel;
pemrosesan hanya berjalan ketika gambar dibuat. Warna skor tetap bertingkat.
Versi desain kartu Discord 4 memicu pembaruan kartu lama pada tick bot setelah
backend diperbarui. Nama Unicode dan avatar tetap dirender sebelum efek diterapkan.


Catatan historis sebelum penghapusan cembung: pengukuran ulang Chromium headless pada 1920 × 1080 memakai fixture yang sama,
satu browser, dan sampel requestAnimationFrame selama 4 detik. Median interval
frame turun dari 483,3 ms menjadi 16,7 ms; p95 dari 699,9 ms menjadi 16,8 ms.
Sampel beranda dengan Mabar aktif menghasilkan 241 callback tanpa interval di atas 25 ms, dibandingkan
10 callback pada versi displacement. Ini pengukuran animasi lokal pada server
bersama, bukan field Core Web Vitals atau jaminan performa perangkat lain.
Papan permainan dengan input fokus dan jalur animasi menghasilkan 149 callback,
median 16,7 ms dan p95 66,6 ms pada software renderer ini; efek panel masih
memiliki biaya saat isinya berubah. Data kedua skenario tersedia di
[hasil perbandingan frame time](screenshots/arcade-crt-frame-performance.json).

## Screenshot

Screenshot memakai konten demo dan mock Discord, bukan data pemain produksi.

| Tampilan | Preview |
| --- | --- |
| Logo lampu reklame | [Video](screenshots/arcade-marquee.webm) |
| Gerakan gelombang CRT | [Video](screenshots/arcade-crt-wave.webm) |
| Judul Daily dan skor responsif | [Rekap Discord](screenshots/arcade-daily-header.png) · [Mobile](screenshots/arcade-daily-header-mobile.png) · [Skor babak](screenshots/arcade-stage-score.png) |
| Kartu permainan rapat | [Panel hasil](screenshots/arcade-compact-result.png) · [Simulasi keyboard](screenshots/arcade-keyboard-compact.png) · [Hasil saat keyboard menutup](screenshots/arcade-keyboard-result.png) |
| Jawaban dan jalur terpisah | [Tiga kata](screenshots/arcade-answer-ports.png) |
| Main lagi memotong bingkai | [Normal](screenshots/arcade-random-replay.png) · [Redup](screenshots/arcade-random-replay-disabled.png) · [Mobile](screenshots/arcade-random-replay-mobile.png) |
| Kata panjang | [Desktop](screenshots/arcade-long-words.png) · [Mobile](screenshots/arcade-long-words-mobile.png) |
| Layout judul pada bingkai | [Rekap](screenshots/arcade-frame-results.png) · [Gameplay](screenshots/arcade-frame-game.png) |
| Percabangan pixel | [Sebelum jawaban](screenshots/arcade-pixel-branches.png) · [Hasil](screenshots/arcade-pixel-branches-result.png) |
| Beranda desktop | [Desktop](screenshots/arcade-desktop.png) |
| Statistik 320 px | [Statistik responsif](screenshots/arcade-stats-mobile.png) |
| Pengaturan | [Suara dan Motion](screenshots/arcade-settings.png) |
| CRT aktif/nonaktif | [Aktif](screenshots/arcade-crt-on.png) · [Nonaktif](screenshots/arcade-crt-off.png) |
| Gameplay 320 × 568 | [Mobile](screenshots/arcade-mobile.png) |
| Rekap 390 × 430 | [Rekap ringkas](screenshots/arcade-recap-short.png) |
| Discord floating 160 × 160 | [PiP](screenshots/arcade-pip.png) |
| Leaderboard dengan nama Unicode panjang | [Skor server](screenshots/arcade-server-scores.png) |
| PNG hasil | [Kartu hasil](screenshots/arcade-share.png) |
| Kartu progres bot | [Kartu bot](screenshots/arcade-live-card.png) |
| Kartu bot tanpa pemain | [Status kosong](screenshots/arcade-live-empty.png) |

## Aset dan perilaku

Aset `dungeonmode.zip` yang disediakan tetap disimpan lokal: TTF, atlas, pemetaan
karakter, dan palet berada di `apps/web/public/assets/dungeon`. Ikon menggunakan
atlas tersebut dan sprite SVG. Font tegak Press Start 2P (SIL OFL) berada di
`apps/web/public/assets/arcade` beserta lisensinya. Label kartu bot memakai atlas
yang diraster dari font tegak tersebut agar bentuk pixel
konsisten lintas host; nama pemain memakai fallback Unicode dan avatar Discord.
Atlas label dapat dibuat ulang lewat `node --import tsx scripts/arcade-atlas.ts`.

Tema terang/gelap lama tidak digunakan. API, scoring, autentikasi, progres,
dan draft tetap memakai kontrak sebelumnya. PiP menampilkan ringkasan, lalu
memulihkan babak serta draft saat kembali ke Activity penuh. Keyboard mobile
menggunakan layout penuh dan safe area Discord tetap dihormati.

## Verifikasi

Perbaikan jarak judul dan format skor diverifikasi dengan 12 tes gameplay,
rekap, leaderboard Discord, serta keyboard. Penyebut skor diperiksa tetap satu
baris, judul terpisah dari header/tanggal, dan setiap kontrol rekap bisa dijangkau
pada layar sempit maupun pendek. Dua tes keyboard mobile dilewati pada desktop.

Perbaikan Main lagi diverifikasi dengan empat tes layout/random desktop-mobile.
Tes pixel memeriksa bahwa garis tidak tersisa di celah tombol saat opacity nol,
dan tombol tetap membuat run baru.

Perbaikan jarak kartu diverifikasi dengan 20 tes layout/interaksi, lalu enam
tes terkait layout dan keyboard diulang setelah penyesuaian input 16 px serta
scroll internal pada viewport 240 px. Semuanya lolos; tes keyboard mobile
dilewati pada proyek desktop.

Hasil verifikasi: build dan typecheck lolos, 117 tes Vitest lolos, serta 60 tes
Playwright lolos (dua tes keyboard khusus mobile dilewati pada proyek desktop).
Setelah penambahan kedip logo, delapan tes tema desktop/mobile diulang dan lolos.
Preview manual juga memeriksa logo 320 px, Motion off, dan reduced motion.
Setelah perbaikan sapuan, 22 tes terkait CRT, interaksi, layout, dan mock Discord
diulang dan lolos (dua tes keyboard khusus mobile dilewati pada desktop).
Tes gerakan memeriksa posisi pada frame berurutan, bukan hanya jumlah frame,
agar pembaruan gelombang yang melompat tidak lolos sebagai animasi halus.
Regresi mencakup lengkungan yang diperkuat, garis sapuan saat Motion on, port
percabangan terpisah, posisi Main lagi di tengah bingkai, statistik sempit dengan
angka enam digit, serta ekspor PNG dengan efek CRT.
Pemeriksaan layout/Discord diulang setelah penghapusan footer serta penyesuaian
kolom skor, termasuk memastikan seluruh digit skor terbaca.

Vitest memeriksa kartu bot kosong,
delapan pemain, Unicode, avatar, dan privasi skor. Playwright mencakup gameplay,
arsip, random, share, CRT aktif/nonaktif, storage diblokir, reduced motion,
keyboard, viewport pendek, safe area, peserta, dan leaderboard.

Tes Discord memakai mock SDK. Pengujian langsung pada klien Discord desktop,
iOS, dan Android belum dilakukan; langkahnya tersedia di [setup Discord](discord.md).

Pada sandbox macOS ini, Vitest memakai `FONTCONFIG_FILE` sementara yang menunjuk
font sistem dan cache di `/tmp`; konfigurasi aplikasi tidak diubah.

Teks footer promosi/keterangan seperti “Tanpa bocoran jawaban” tidak ditampilkan
di kartu bot maupun gambar share. Perubahan versi desain kartu memicu render
ulang pesan channel yang sudah ada pada tick bot setelah backend diperbarui.

## Mabar

Empat arena mabar memakai token arcade yang sama, dengan lobby, roster, timer, chat, galeri,
dan podium. Canvas input berada di luar distorsi CRT agar sentuhan/pointer tetap tepat.
Galeri dan PNG hasil tetap mendapat CRT/bloom. Detail room, identitas, dan deployment:
[Mabar](mabar.md).
