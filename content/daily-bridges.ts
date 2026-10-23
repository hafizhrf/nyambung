import type { ContentStage } from '../apps/api/src/scoring.js';

// Each answer bridges distinct uses or contexts. The original introductory set
// remains a demo fixture; these are the scheduled semantic editions.
const rows = [
  [
    'bank,taman|bunga|Bunga tumbuh di taman; bunga bank dihitung dari simpanan atau pinjaman.',
    'musik,pintu|kunci|Kunci membuka pintu, sedangkan kunci musik menentukan susunan nada.',
    'kapal,bioskop|layar|Kapal dapat memakai layar; bioskop menampilkan film pada layar.',
    'tanah,kuadrat,masalah|akar|Akar tumbuh di tanah, dipakai dalam hitungan kuadrat, dan berarti asal masalah.',
  ],
  [
    'kursor,padi|tikus|Tikus komputer menggerakkan kursor; tikus hewan menjadi hama tanaman padi.',
    'lantai,nada|tangga|Tangga menghubungkan lantai; tangga nada menyusun tinggi-rendah bunyi.',
    'catur,pemerintahan|menteri|Menteri adalah nama buah catur dan jabatan dalam pemerintahan.',
    'hotel,langit,aktor|bintang|Bintang tampak di langit, menandai kelas hotel, dan menyebut aktor terkenal.',
  ],
  [
    'upacara,buah|apel|Apel adalah buah sekaligus kegiatan berkumpul resmi sebelum bertugas.',
    'pakaian,fisika|gaya|Gaya dapat berarti cara berpakaian atau besaran yang mengubah gerak benda.',
    'rumah,buku|halaman|Rumah punya halaman di luar; buku mempunyai halaman yang dibaca.',
    'jarum,sumber,badai|mata|Mata jarum adalah lubang benang, mata air adalah sumber, dan badai mempunyai mata.',
  ],
  [
    'jahit,utara|jarum|Jarum dipakai menjahit; jarum kompas membantu menunjukkan utara.',
    'gunung,karier|puncak|Puncak adalah bagian tertinggi gunung dan kiasan pencapaian karier.',
    'dokter,masakan|resep|Dokter menuliskan resep obat, sedangkan masakan dibuat mengikuti resep.',
    'rambut,pemimpin,surat|kepala|Kepala ditumbuhi rambut, berarti pemimpin, dan muncul pada istilah kepala surat.',
  ],
  [
    'ranting,ilmu|cabang|Cabang pohon ditumbuhi ranting; ilmu juga berkembang menjadi berbagai cabang.',
    'kamera,pengadilan|bukti|Foto kamera dapat menjadi bukti; pengadilan menimbang bukti dalam perkara.',
    'hukum,hujan|payung|Payung melindungi dari hujan; payung hukum menjadi dasar perlindungan aturan.',
    'pohon,pintu,meja|daun|Daun tumbuh di pohon; pintu dan meja juga mempunyai bagian yang disebut daun.',
  ],
  [
    'radio,rambut|gelombang|Radio memakai gelombang elektromagnetik; rambut dapat berbentuk gelombang.',
    'mesin,mulut|gigi|Gigi di mulut membantu mengunyah; gigi mesin saling mengait untuk memindahkan gerak.',
    'biologi,penjara|sel|Sel adalah unit penyusun makhluk hidup dan ruang tahanan dalam penjara.',
    'internet,tubuh,bisnis|jaringan|Jaringan menghubungkan komputer, menyusun tubuh, dan membangun relasi bisnis.',
  ],
  [
    'kaki,sejarah|jejak|Kaki meninggalkan jejak; peninggalan juga menjadi jejak sejarah.',
    'himpunan,roti|irisan|Irisan menyatakan anggota bersama dua himpunan dan potongan roti.',
    'mesin,demokrasi|suara|Mesin menghasilkan suara; suara juga diberikan saat pemilihan demokratis.',
    'kalender,satelit,madu|bulan|Bulan menjadi satuan kalender, satelit Bumi, dan bagian dari ungkapan bulan madu.',
  ],
  [
    'musik,tubuh|organ|Organ adalah alat musik bertuts sekaligus bagian tubuh dengan fungsi tertentu.',
    'botol,perasaan|isi|Botol mempunyai isi; isi hati mengungkapkan perasaan seseorang.',
    'kaca,hati|pecah|Kaca dapat pecah; hati yang pecah menggambarkan perasaan yang sangat terluka.',
    'duduk,jabatan,roda|kursi|Kursi dipakai duduk, melambangkan jabatan, dan dapat dilengkapi roda.',
  ],
  [
    'matahari,buku|terbit|Matahari terbit di pagi hari; buku terbit ketika dipublikasikan.',
    'kail,pertanyaan|umpan|Umpan menarik ikan; pertanyaan pancingan menjadi umpan agar orang menanggapi.',
    'kapal,politik|haluan|Haluan adalah bagian depan kapal dan arah kebijakan dalam politik.',
    'pekarangan,buku,situs|halaman|Halaman dapat berupa pekarangan rumah, lembar buku, atau tampilan situs.',
  ],
  [
    'uang,prinsip|nilai|Uang mempunyai nilai tukar; prinsip mencerminkan nilai yang dipegang seseorang.',
    'fisika,demonstrasi|massa|Massa adalah besaran fisika dan sebutan untuk kumpulan orang yang berunjuk rasa.',
    'pintu,sepakbola|palang|Palang dapat menutup pintu; palang gawang menjadi bagian permainan sepakbola.',
    'mesin,mulut,sisir|gigi|Gigi mengait pada mesin, tumbuh di mulut, dan berderet pada sisir.',
  ],
  [
    'bambu,leher|ruas|Bambu terbagi atas ruas; leher ditopang oleh ruas tulang belakang.',
    'sekolah,kereta|kelas|Kelas membagi kelompok belajar dan jenis layanan penumpang kereta.',
    'buah,sepatu|kulit|Kulit membungkus buah dan dapat diolah menjadi bahan sepatu.',
    'pohon,olahraga,perusahaan|cabang|Cabang tumbuh dari pohon, membagi jenis olahraga, dan menyebut unit perusahaan.',
  ],
  [
    'listrik,sungai|arus|Arus mengalir sebagai listrik dalam penghantar dan sebagai air di sungai.',
    'bangunan,argumen|dasar|Dasar menopang bangunan; dasar argumen menjadi landasan penalaran.',
    'wabah,komputer|virus|Virus dapat menyebabkan wabah penyakit dan menjadi program yang mengganggu komputer.',
    'rambut,radio,laut|gelombang|Gelombang menggambarkan bentuk rambut, rambatan sinyal radio, dan gerak permukaan laut.',
  ],
  [
    'hotel,langit|bintang|Bintang tampak di langit dan dipakai untuk menandai kelas hotel.',
    'tabungan,tidur|bunga|Bunga dapat bertambah pada tabungan; bunga tidur adalah sebutan untuk mimpi.',
    'kuadrat,masalah|akar|Akar muncul dalam operasi kuadrat dan menyebut asal suatu masalah.',
    'pintu,musik,jawaban|kunci|Kunci membuka pintu, menentukan susunan nada, dan menunjukkan jawaban soal.',
  ],
  [
    'jabatan,duduk|kursi|Kursi dipakai untuk duduk dan juga menjadi kiasan bagi suatu jabatan.',
    'tong,irama|drum|Drum dapat berarti tong penyimpanan atau alat pukul yang menjaga irama.',
    'kapal,komputer|layar|Layar menangkap angin pada kapal dan menampilkan informasi pada komputer.',
    'taman,tabungan,tidur|bunga|Bunga tumbuh di taman, menambah nilai tabungan, dan menjadi kiasan mimpi saat tidur.',
  ],
];
export const dailyBridges: ContentStage[][] = rows.map(day => day.map((row, i) => {
  const [clues, best, explanation] = row.split('|');
  return { kind: i === 3 ? 'bridge3' : 'bridge2', clues: clues.split(','), best, explanation, overrides: {} };
}));
