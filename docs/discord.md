# Discord Activity beta

Nyambung memakai satu Discord Application untuk Activity dan bot. Website biasa
masih berjalan tanpa Discord ketika `DISCORD_ENABLED=false` (default).

## 1. Siapkan aplikasi dan hosting

1. Deploy build Hono/Vite pada **satu origin HTTPS** dengan volume SQLite persisten.
   Untuk pengujian lokal, build dan jalankan server produksi di port 3000 lalu
   gunakan tunnel HTTPS. Petakan tunnel ke Hono, bukan hanya Vite, agar API ikut tersedia.
2. Buat aplikasi Nyambung di [Developer Portal](https://discord.com/developers/applications).
   Aktifkan Activities dan biarkan default Entry Point **Launch** memakai handler
   Discord. Saat beta, batasi akses aplikasi/tester melalui pengaturan Portal.
   Pada OAuth2 → Redirects, tambahkan `https://127.0.0.1` lalu simpan. Discord
   mensyaratkan sebuah redirect terdaftar; SDK menangani alur kembali ke Activity,
   sehingga placeholder ini tidak memerlukan server HTTPS lokal.
3. Pada Activities → URL Mappings, petakan `/` ke **hostname origin HTTPS** aplikasi
   (tanpa `https://`). Tambahkan `/discord-cdn` → `cdn.discordapp.com` untuk avatar.
   Aset game, font dan audio disajikan dari aplikasi sendiri. API mendukung URL
   Activity biasa maupun prefix `/.proxy/` pada klien Discord.
4. Buat bot, salin token ke environment server. Instal ke server beta dengan scope
   `bot` dan `applications.commands`. Berikan **View Channel**, **Send Messages**,
   **Read Message History** hanya pada channel pengingat; izin terakhir dipakai
   untuk memeriksa pesan ketika hasil pengiriman tidak pasti. Tidak membutuhkan
   privileged intents, Administrator, atau proses Gateway.
5. Salin Application ID, Public Key dan OAuth2 Client Secret ke environment server.
   Aktifkan Developer Mode Discord untuk menyalin ID server beta.

```dotenv
PUBLIC_ORIGIN=https://game.example.com
DISCORD_ENABLED=true
DISCORD_APPLICATION_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
DISCORD_BETA_GUILD_ID=...
```

Jangan memakai prefix `VITE_` untuk rahasia. Frontend mengambil application ID dari
endpoint bootstrap; secret dan bot token tidak dibundel ke browser. Compose sudah
meneruskan variabel tersebut. Restart/redeploy setelah mengubah konfigurasi.
Ambil backup dengan `npm run backup` sebelum deploy; migrasi Discord bersifat
aditif dan tidak menulis ulang paket atau hasil permainan lama.

## 2. Pasang interaction endpoint dan perintah

Jalankan `npm run build` lalu `npm start`, atau deploy ulang container. Atur
**Interactions Endpoint URL** di General Information menjadi:

```
https://game.example.com/api/discord/interactions
```

Portal akan melakukan PING bertanda tangan; endpoint menjawab tanpa cookie.
Request dengan signature salah, body berubah atau timestamp lebih dari lima menit
ditolak. Batasi reverse proxy agar mempertahankan body dan header signature asli.
Jangan menambahkan aturan `X-Frame-Options: DENY/SAMEORIGIN` atau CSP `frame-ancestors`
yang memblokir Discord pada halaman game.

Preview perintah (tidak mengubah Discord):

```sh
npm run discord:register
```

Daftarkan perintah ke **server beta saja**:

```sh
npm run discord:register -- --apply
```

Perintah ini meng-upsert `/nyambung`; tidak menghapus command lain atau Entry Point
Activity global. Jalankan di environment dengan `.env` lengkap. Tidak perlu API
key Jina/Gemini untuk menjalankan bot atau permainan.

## 3. Gunakan dan periksa

- `/nyambung main` atau **Launch** membuka Activity. Pemain memberi izin `identify`
  dan `rpc.activities.write`, kemudian langsung masuk daily yang tersedia.
- Anggota Activity bermain dengan jawaban masing-masing. Tombol peserta di header
  membuka nama/avatar, progres babak dan skor akhir. Progres yang terlihat adalah
  **daily tanggal WIB saat ini**, termasuk saat pemain sedang memainkan mode acak.
- **Undang teman** membuka dialog Discord jika pemain mempunyai Create Invite.
  Rich Presence menampilkan mode/babak atau total skor akhir, tanpa clue/jawaban.
  Visibilitas serta Ask to Join tetap mengikuti izin dan pengaturan Discord.
- Pemain Discord memakai identitas persisten lintas perangkat. Riwayat anonim di
  website tidak digabung. Sesi aplikasi berlaku maksimal satu jam dan diperbarui
  lewat SDK tanpa reload. Token OAuth dan token sesi hanya berada di memori klien;
  server menyimpan hash token sesi, tidak menyimpan OAuth access/refresh token.

Dengan izin **Manage Server** (atau Administrator):

```
/nyambung pengingat atur channel:#daily
/nyambung pengingat status
/nyambung pengingat tes
/nyambung pengingat matikan
```

Pengaturan memeriksa channel, keanggotaan bot dan permission overwrites. Tes hanya
mengirim saat daily semantik tersedia, ditandai sebagai contoh, dan tidak menandai
pengiriman daily sebagai selesai. Tombol Play Now juga tersedia pada pesan tes.
Pesan pengingat lama selalu membuka daily saat ini, bukan archive.

## 4. Scheduler dan operasi

- Worker berjalan bersama proses Hono, memeriksa setiap 30 detik. Server harus
  tetap hidup: hosting yang menidurkan aplikasi tidak menjamin jadwal 00.05 WIB.
- Pengiriman berlangsung pada 00.05–01.59 WIB, hanya jika paket daily non-demo
  tersedia. Tidak mengganti puzzle kosong dengan soal acak.
- Tabel `discord_deliveries` memiliki kunci unik server/tanggal dan lease 3 menit.
  Nonce stabil dipakai pada pengiriman. Jika POST timeout atau proses berhenti,
  worker memeriksa pesan bot sebelum mencoba lagi. Pesan contoh tidak dianggap
  sebagai pengiriman harian.
- Pemeriksaan riwayat dibatasi 1.000 pesan. Jika riwayat terlalu ramai untuk
  memastikan hasil, worker mempertahankan status `uncertain` dan mencoba memeriksa
  kembali; tidak mengirim ulang tanpa kepastian. Sesudah 02.00, hanya pemeriksaan
  pengiriman tidak pasti yang berjalan, tanpa mengirim pesan baru.
- Status `blocked` berarti hasil kirim belum pasti dan riwayat tidak dapat dibaca.
  Pulihkan izin riwayat pada channel sebelumnya sebelum mengaktifkan lagi; jangan
  menghapus catatan delivery untuk memaksa pengiriman ulang.
- 429 ditunda dengan `retry_after` dan backoff. 401/403/404 mematikan pengingat
  channel; cek `/nyambung pengingat status`, perbaiki token/izin, lalu atur lagi.
- Satu server beta diizinkan oleh backend. Jangan menambah replika aplikasi yang
  memakai salinan SQLite terpisah. Pertahankan backup harian database.
- Pesan tanpa `@everyone`, `@here`, atau mention role. Notifikasi perangkat mengikuti
  preferensi channel pengguna; integrasi ini tidak memaksa push notification.

Pemeriksaan database untuk diagnosis, tanpa membuka token atau jawaban:

```sql
SELECT guild_id, channel_id, enabled, last_error FROM discord_reminders;
SELECT guild_id, date, status, attempts, message_id, last_error FROM discord_deliveries;
```

## 5. Verifikasi beta sebelum dipakai

Tes otomatis: `npm test`, `npm run build`, `npm run test:e2e`.

Di Discord desktop **dan** mobile, gunakan dua akun yang boleh mengakses beta:

1. Jalankan Activity, selesaikan satu babak, keluar dan masuk kembali; progres sama.
2. Masuk pada Activity yang sama dengan akun kedua; jawaban/run terpisah, progres
   terlihat, skor hanya muncul setelah selesai, tidak ada jawaban yang bocor.
3. Coba Undang teman dan Bagikan hasil. Pastikan undangan menuju Activity.
4. Periksa status profil tanpa clue/jawaban; pengaturan privasi Discord dihormati.
5. Jalankan pengingat tes, klik Play Now, lalu periksa pengiriman 00.05 WIB.
6. Cabut izin channel: game tetap berfungsi, pengingat berhenti dengan status jelas.
7. Uji keyboard mobile, layout sempit dan reduced motion tanpa page scroll.

Pengujian SDK dengan mock dan integrasi REST tidak menggantikan pengujian langsung
pada klien Discord. Belum termasuk DM, native mobile app, App Directory, atau
penggabungan akun browser.

Referensi resmi:
[Activity lifecycle](https://docs.discord.com/developers/activities/how-activities-work),
[Networking](https://docs.discord.com/developers/activities/development-guides/networking),
[Rich Presence](https://docs.discord.com/developers/rich-presence/using-with-the-embedded-app-sdk),
[Multiplayer](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience).
