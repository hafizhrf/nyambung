import { dailyBridges } from './daily-bridges.js';
import lexicon from './lexicon.json';
import type { ContentStage } from '../apps/api/src/scoring.js';
// Original Indonesian editorial candidates. Publication requires reviewing CLI preview.
// Each tuple: clues | best | explanation | alternative=connection strengths.
const days = [
  [
    'makanan,mall|restoran|Restoran menyajikan makanan dan sering kita temukan di dalam mall.|nongkrong=.72,.82;kafe=.88,.92',
    'hujan,panas|payung|Payung melindungi kita dari hujan maupun terik matahari.|atap=.87,.8;teduh=.8,.84',
    'buku,pohon|kertas|Kertas adalah lembaran buku yang bisa dibuat dari serat pohon.|daun=.82,.95;pulp=.96,.95',
    'laut,langit,cat|biru|Biru menjadi warna yang menghubungkan laut, langit, dan cat.|warna=.9,.9,.98;cerah=.72,.83,.5',
    'gembira|senang|Senang dan gembira sama-sama menggambarkan perasaan bahagia.|bahagia=1;riang=.97;ceria=.94',
  ],
  [
    'kopi,pagi|sarapan|Secangkir kopi sering menemani sarapan di pagi hari.|roti=.82,.9;kafe=.9,.65',
    'musik,telinga|suara|Musik hadir sebagai suara yang didengar telinga.|lagu=.95,.9;nada=.96,.87',
    'sekolah,tulis|pensil|Pensil dipakai untuk menulis saat belajar di sekolah.|pena=.96,1;buku=.92,.85',
    'roda,jalan,mesin|mobil|Mobil berjalan di jalan dengan roda dan mesin.|motor=1,1,1;bus=.95,.98,.98',
    'cepat|lekas|Lekas berarti cepat atau segera.|segera=.98;kilat=.84',
  ],
  [
    'bulan,tidur|malam|Bulan terlihat di malam hari, waktu kebanyakan orang tidur.|gelap=.88,.75;mimpi=.68,.95',
    'pasir,ombak|pantai|Di pantai, ombak bertemu hamparan pasir.|laut=.85,.98;pesisir=.97,.98',
    'uang,belanja|dompet|Dompet menyimpan uang yang dibawa untuk berbelanja.|kartu=.85,.95;kasir=.9,.98',
    'akar,daun,buah|pohon|Pohon memiliki akar, daun, dan dapat menghasilkan buah.|tanaman=1,1,.95;kebun=.8,.84,.9',
    'indah|cantik|Cantik dan indah sama-sama berarti bagus dipandang.|elok=1;menawan=.94',
  ],
  [
    'dingin,manis|puding|Puding bisa disajikan dingin dengan rasa manis.|es=.98,.73;sirup=.85,.98',
    'surat,jarak|pos|Layanan pos mengantarkan surat melintasi jarak.|kurir=.95,.88;paket=.85,.8',
    'layar,cerita|film|Film menyajikan cerita melalui layar.|bioskop=.98,.88;televisi=.95,.8',
    'api,dapur,makanan|kompor|Kompor menyediakan api di dapur untuk memasak makanan.|masak=.92,.98,1;oven=.9,.98,.98',
    'sunyi|sepi|Sepi dan sunyi menggambarkan keadaan tanpa keramaian atau suara.|hening=1;senyap=.98',
  ],
  [
    'burung,pesawat|terbang|Burung dan pesawat sama-sama bisa terbang.|sayap=1,1;udara=.94,.94',
    'foto,kenangan|album|Album menyimpan foto yang mengabadikan kenangan.|kamera=.98,.78;potret=.95,.9',
    'sepatu,lari|kaki|Sepatu dipakai di kaki, yang kita gunakan untuk berlari.|olahraga=.88,.98;sol=.9,.68',
    'tepung,oven,sarapan|roti|Roti dibuat dari tepung, dipanggang di oven, dan dimakan saat sarapan.|kue=.98,1,.8;panggang=.8,.98,.65',
    'pintar|cerdas|Cerdas dan pintar berarti memiliki kemampuan berpikir yang baik.|pandai=1;cerdik=.93',
  ],
  [
    'bunga,hadiah|buket|Buket merangkai bunga menjadi hadiah.|mawar=.98,.85;kado=.72,1',
    'kapal,mobil|kemudi|Kemudi mengarahkan kapal maupun mobil.|setir=.9,1;sopir=.65,.98',
    'air,haus|minum|Minum air membantu menghilangkan haus.|botol=.85,.82;segar=.82,.9',
    'gitar,piano,lagu|nada|Gitar dan piano memainkan nada untuk membentuk lagu.|musik=1,1,1;melodi=.97,.97,.98',
    'lelah|letih|Letih berarti lelah setelah melakukan kegiatan.|capek=1;lesu=.9',
  ],
  [
    'internet,teman|chat|Chat menghubungkan percakapan antarteman melalui internet.|pesan=.9,.9;discord=.95,.95',
    'gunung,jalan|mendaki|Mendaki adalah berjalan naik, misalnya menuju puncak gunung.|tanjakan=.95,.92;pendakian=1,.98',
    'jam,janji|waktu|Jam menunjukkan waktu yang disepakati dalam janji.|tepat=.9,.9;menit=.95,.82',
    'garam,laut,lidah|asin|Garam dan air laut terasa asin di lidah.|rasa=.9,.75,1;mineral=.9,.9,.45',
    'berani|pemberani|Pemberani menggambarkan orang yang memiliki keberanian.|nekat=.9;gagah=.85',
  ],
  [
    'hujan,warna|pelangi|Pelangi memperlihatkan warna-warni setelah hujan terkena cahaya.|langit=.9,.75;cahaya=.85,.95',
    'dokter,sakit|obat|Dokter meresepkan obat untuk mengatasi sakit.|klinik=.98,.98;sembuh=.9,.95',
    'bola,gawang|gol|Gol terjadi saat bola masuk ke gawang.|sepak=.98,.9;kiper=.92,1',
    'malam,terang,listrik|lampu|Lampu memakai listrik untuk memberi terang saat malam.|bohlam=1,1,1;cahaya=.9,1,.85',
    'mudah|gampang|Gampang adalah padanan sehari-hari untuk mudah.|enteng=.9;praktis=.8',
  ],
  [
    'tanah,air|lumpur|Lumpur terbentuk ketika tanah bercampur air.|becek=.98,.9;lempung=.92,.78',
    'kunci,rumah|pintu|Pintu rumah dibuka atau dikunci menggunakan kunci.|gembok=.95,.82;gerbang=.9,.9',
    'benang,pakaian|jahit|Menjahit menggunakan benang untuk membuat atau memperbaiki pakaian.|jarum=1,.95;kain=.88,1',
    'mata,buku,cahaya|baca|Membaca buku membutuhkan mata dan cahaya yang cukup.|melihat=.98,.8,.92;kacamata=.98,.88,.85',
    'kawan|teman|Teman dan kawan sama-sama menyebut orang yang dekat dengan kita.|sahabat=1;sobat=1',
  ],
  [
    'susu,fermentasi|yoghurt|Yoghurt dihasilkan dari fermentasi susu.|keju=1,1;yakult=.95,.95',
    'jalan,merah|lampu|Lampu lalu lintas merah memberi tanda berhenti di jalan.|berhenti=.9,.95;lalu=.9,.65',
    'pantai,libur|wisata|Wisata ke pantai adalah salah satu kegiatan saat libur.|piknik=.95,.98;rekreasi=.95,1',
    'keyboard,layar,kode|komputer|Komputer menggabungkan keyboard dan layar untuk mengerjakan kode.|laptop=1,1,1;program=.8,.85,1',
    'marah|kesal|Kesal dekat dengan marah, dengan intensitas yang sering lebih ringan.|geram=1;jengkel=.97',
  ],
  [
    'nasi,daun|lontong|Lontong dibuat dari beras dan dibungkus daun.|ketupat=1,1;bungkus=.8,.9',
    'rambut,gigi|sisir|Sisir merapikan rambut menggunakan deretan giginya.|rapi=.9,.65;sikat=.85,.95',
    'hidung,bunga|harum|Hidung mencium aroma harum dari bunga.|wangi=1,1;aroma=.98,.95',
    'kereta,pesawat,pergi|tiket|Tiket dipakai untuk bepergian dengan kereta maupun pesawat.|penumpang=.98,.98,.9;perjalanan=1,1,1',
    'jujur|tulus|Tulus dekat dengan jujur dalam menyatakan sesuatu dari hati.|terus terang=.9;terbuka=.92',
  ],
  [
    'lebah,manis|madu|Lebah menghasilkan madu yang terasa manis.|nektar=.98,.95;gula=.7,1',
    'jendela,udara|ventilasi|Ventilasi seperti jendela membantu pertukaran udara.|angin=.92,.98;terbuka=.85,.8',
    'laut,kail|ikan|Ikan di laut bisa ditangkap dengan kail.|pancing=.98,1;nelayan=.98,.92',
    'dingin,hujan,tubuh|jaket|Jaket membantu menjaga tubuh saat cuaca dingin dan hujan.|mantel=1,1,1;hangat=1,.8,.9',
    'tenang|damai|Damai dan tenang sama-sama menyiratkan keadaan tenteram.|tenteram=1;santai=.9',
  ],
  [
    'gula,panas|karamel|Gula yang dipanaskan dapat berubah menjadi karamel.|leleh=.9,.95;masak=.78,.95',
    'kota,arah|peta|Peta membantu mencari arah di dalam kota.|navigasi=.95,1;kompas=.8,1',
    'suara,gunung|gema|Gema adalah pantulan suara yang bisa terdengar di pegunungan.|pantul=.95,.8;gaung=1,.95',
    'kertas,warna,tangan|gambar|Gambar bisa dibuat dengan tangan menggunakan warna di atas kertas.|lukis=1,1,1;krayon=.95,1,.9',
    'besar|raksasa|Raksasa menggambarkan ukuran yang sangat besar.|akbar=.97;luas=.85',
  ],
  [
    'roda,kaki|sepeda|Sepeda memiliki roda dan digerakkan dengan kayuhan kaki.|pedal=1,1;kayuh=.95,1',
    'telur,pagi|omelet|Omelet adalah olahan telur yang bisa dinikmati di pagi hari.|sarapan=.9,1;dadar=1,.9',
    'bulan,laut|pasang|Gaya gravitasi bulan memengaruhi pasang air laut.|surut=.98,1;ombak=.75,.98',
    'kata,halaman,cerita|buku|Buku menyusun kata-kata di halaman untuk menyampaikan cerita.|novel=1,1,1;bacaan=.98,.95,1',
    'rindu|kangen|Kangen adalah padanan sehari-hari untuk rindu.|merindu=1;ingin=.7',
  ],
];
const antonyms = [['sedih', 'kecewa'], ['lambat', 'cepa', 'cepak', 'cepit', 'cepol'], ['buruk'], ['ramai', 'ribut'], ['bodoh'], ['segar'], ['takut'], ['sulit'], ['musuh'], ['senang', 'bahagia'], ['bohong'], ['ribut'], ['kecil', 'bigair'], ['benci']];
export const introductoryPuzzles: ContentStage[][] = days.map((rows, day) => rows.map((row, index) => {
  const [clues, best, explanation, alt] = row.split('|');
  const overrides = Object.fromEntries((alt || '').split(';').filter(Boolean).map(pair => { const [word, scores] = pair.split('='); return [word, scores.split(',').map(Number)]; }));
  // Multiword alternatives are editorial notes, not playable entries.
  for (const word of Object.keys(overrides)) if (!/^[a-z]+$/.test(word)) delete overrides[word];
  return { kind: index < 3 ? 'bridge2' : index === 3 ? 'bridge3' : 'closest', clues: clues.split(','), best, explanation, overrides, ...(index === 4 ? { excluded: antonyms[day] } : {}) };
}));
export const puzzles: ContentStage[][] = dailyBridges.map((stages, day) => [...stages, introductoryPuzzles[day][4]]);
export const aliases: Record<string, string> = { mal: 'mall', resto: 'restoran', cafe: 'kafe', yogurt: 'yoghurt', telor: 'telur', tentram: 'tenteram', omlet: 'omelet' };
export const blocked = ['kontol', 'memek'];
const extra = 'bodoh musuh benci nongkrong rumah kucing anjing meja kursi makan minuman nongol teman kerja belajar nasi goreng angkasa bintang matahari tanah bumi main bermain sendok garpu piring sendal sepatu tas jam tangan batu mobil motor uang kopi teh susu sapu bersih senyum sedih bahagia kecewa lambat kecil buruk ramai ribut bohong takut malas sulit gelap terang sehat penyakit'.split(' ');
export const demoVocabulary = [...new Set([...extra, ...Object.values(aliases), ...[...puzzles, ...introductoryPuzzles].flatMap(day => day.flatMap(stage => [...stage.clues, stage.best, ...Object.keys(stage.overrides)]))])].filter(word => /^[a-z]+$/.test(word) && !blocked.includes(word)).sort();

export const vocabulary = [...new Set([...demoVocabulary, ...lexicon])].filter(word => !blocked.includes(word)).sort();
