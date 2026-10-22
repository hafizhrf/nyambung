# Kosakata Nyambung

`lexicon.json` berisi 85.306 entri satu kata dari gabungan daftar sebelumnya, keseluruhan sumber public domain, dan lemma Wordnet Bahasa. Format huruf kecil a–z, panjang 2–32 karakter; frasa, angka, serta kata bertanda baca tidak dimasukkan. Kosakata permainan menambahkan kata editorial dan alias lalu mengeluarkan daftar larangan. Daftar ini bukan KBBI resmi, dan tidak diklaim mencakup seluruh entri KBBI.

- **za/id-wordlist**: Public Domain, berasal dari Geovedi Indonesian Wordlist. https://github.com/za/id-wordlist . Seluruh kata yang lolos format sekarang dipakai, bukan hanya 32 ribu pilihan.
- Prioritas frekuensi daftar awal: **Hermit Dave / FrequencyWords**, `content/2018/id/id_50k.txt`, dari OpenSubtitles2018 / OPUS; CC BY-SA 4.0. https://github.com/hermitdave/FrequencyWords — https://opus.nlpl.eu/OpenSubtitles2018.php . Daftar awal tetap dipertahankan di `common-words.json` untuk memilih clue yang lebih lazim. Daftar kosakata gabungan disediakan dengan CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . Perubahan: pencocokan, penyaringan format, penggabungan, deduplikasi, serta pengurutan alfabet.
- **Wordnet Bahasa**, Francis Bond dan kontributor (2011–2015): MIT. https://github.com/omwn/omw-data/tree/main/wns/msa . Notis lengkap di `licenses/WORDNET-BAHASA.txt`.
- **Princeton WordNet 3.0**: relasi synset, hipernim, meronim, dan antonim dipadankan ke lemma Indonesia menggunakan ID synset yang sama. https://wordnet.princeton.edu/ . Lisensi lengkap di `licenses/PRINCETON-WORDNET.txt`.

`wordnet-relations.json` menyimpan kandidat relasi beserta sumber dan ID sense; `wordnet-synonyms.json` menyimpan kelompok sinonim serta antonim dari sumber tersebut. Keduanya hasil olahan otomatis, bukan kumpulan soal yang seluruhnya telah direview manusia. Pipeline memeriksa keberadaan di kamus, frekuensi, kemiripan embedding, duplikasi, dan bentuk turunan sebelum publikasi. Relasi dari sense berbeda tidak dicampur dalam satu soal. Hub kurasi manusia di `relations.ts` tetap terpisah dan mendapat prioritas sebagai sumber.

`lexicon-import.json` mencatat jumlah dan SHA-256 bahan sumber. Jalankan `npm run import:lexicon` setelah menyiapkan `data/sources/id-wordlist.txt`, `wn-data-ind.tab`, dan direktori `wordnet/` dari WordNet 3.0. Skrip hanya menggabungkan kata yang benar-benar terdapat pada sumber; tidak membentuk imbuhan, mengarang entri, atau memecah frasa untuk menambah angka.

Lisensi data terpisah dari kode aplikasi. Referensi ilmiah: Noor, Sapuan & Bond (2011), *Creating the Open Wordnet Bahasa*; Fellbaum (1998), *WordNet: An Electronic Lexical Database*, MIT Press.
