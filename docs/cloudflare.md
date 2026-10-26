# Deployment Cloudflare

Domain publik `nyambung.web.id` dilayani Worker `nyambung` pada akun
`79477aeccee7a008b586ce8a8efa266d`. Worker meneruskan request melalui HTTPS
ke `nyambung-origin.hafizhrf.me`, yang dihubungkan Cloudflare Tunnel ke
backend Node.js pada server. SQLite tetap memakai disk persisten server;
database dan embedding tidak disertakan dalam bundle Worker.

## Persiapan origin

- Build aplikasi dengan `npm run build` dan verifikasi dengan `npm test`.
- Layanan `nyambung.service` harus menjalankan `apps/api/dist/server.js`
  dengan `NODE_ENV=production`, `PUBLIC_ORIGIN=https://nyambung.web.id`,
  `HOST=127.0.0.1`, `PORT=3000`, dan path database persisten.
- Tambahkan ingress Cloudflare Tunnel untuk `nyambung-origin.hafizhrf.me`
  menuju `http://127.0.0.1:3000` sebelum aturan fallback 404.
- Hubungkan DNS hostname origin ke tunnel tersebut. Jangan mengubah
  ingress aplikasi lain yang memakai tunnel yang sama.
- Restart layanan yang diperbarui dan periksa `/api/daily` pada origin.

## Publikasi Worker

```sh
wrangler login
wrangler whoami
wrangler deploy --dry-run
wrangler deploy
```

Wrangler memakai `wrangler.jsonc` untuk memilih akun dan custom domain.
Pastikan akun aktif mempunyai akses Workers dan zona `nyambung.web.id`.
Verifikasi beranda, `/api/daily`, cookie sesi, dan pembuatan run melalui
`https://nyambung.web.id` setelah deploy. Backend harus tetap hidup untuk
melayani request. Perubahan backend memerlukan build dan restart
`nyambung.service`; perubahan Worker memerlukan `wrangler deploy`.

Backup SQLite dengan `npm run backup` sebelum migrasi database. Tidak ada
perubahan atau penerbitan ulang konten puzzle sebagai bagian deploy Worker.
