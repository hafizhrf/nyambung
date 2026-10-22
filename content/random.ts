import type { ContentStage } from '../apps/api/src/scoring.js';
// Separate from scheduled daily puzzles; scores are compiled before use.
const bridges: [string[], string, string][] = [
  [['sepeda', 'karet'], 'ban', 'Ban sepeda biasanya dibuat dari karet.'],
  [['rumah', 'besi'], 'pagar', 'Pagar besi membatasi dan melindungi halaman rumah.'],
  [['pantai', 'matahari'], 'liburan', 'Pantai dan cuaca cerah sering menjadi bagian dari liburan.'],
  [['hotel', 'mimpi'], 'tidur', 'Hotel menyediakan tempat tidur, dan mimpi hadir saat tidur.'],
  [['gelas', 'haus'], 'minum', 'Kita memakai gelas untuk minum ketika haus.'],
  [['hutan', 'petualangan'], 'kemah', 'Kemah adalah salah satu kegiatan petualangan di hutan.'],
  [['bintang', 'angka'], 'lima', 'Bintang sering digambar bersudut lima, salah satu angka.'],
  [['air', 'dingin'], 'es', 'Es adalah air yang membeku karena suhu dingin.'],
  [['bus', 'sekolah'], 'siswa', 'Siswa dapat berangkat ke sekolah dengan bus.'],
  [['pintu', 'keamanan'], 'kunci', 'Kunci mengamankan pintu agar tidak mudah dibuka.'],
  [['cokelat', 'pesta'], 'kue', 'Kue cokelat bisa menjadi hidangan dalam pesta.'],
  [['dokter', 'jantung'], 'stetoskop', 'Dokter memakai stetoskop untuk mendengarkan detak jantung.'],
];
const triples: [string[], string, string][] = [
  [['tangan', 'waktu', 'angka'], 'jam', 'Jam tangan menunjukkan waktu menggunakan angka.'],
  [['tiket', 'rel', 'stasiun'], 'kereta', 'Penumpang bertiket naik kereta di stasiun, lalu berjalan di atas rel.'],
  [['benang', 'jarum', 'kain'], 'jahit', 'Menjahit menyambung kain dengan jarum dan benang.'],
  [['bola', 'lapangan', 'gawang'], 'sepakbola', 'Sepakbola dimainkan dengan bola di lapangan yang memiliki gawang.'],
];
const synonyms: [string, string, string][] = [
  ['letih', 'lelah', 'bugar'], ['susah', 'sulit', 'mudah'],
  ['riang', 'gembira', 'sedih'], ['hening', 'sunyi', 'ramai'],
  ['lekas', 'cepat', 'lambat'], ['cerdas', 'pintar', 'bodoh'],
  ['takut', 'gentar', 'berani'],
  ['gigih', 'tekun', 'malas'], ['luas', 'lapang', 'sempit'],
  ['hemat', 'irit', 'boros'], ['akrab', 'dekat', 'asing'],
  ['tangguh', 'kuat', 'lemah'], ['kotor', 'jorok', 'bersih'],
  ['usang', 'lama', 'baru'], ['cantik', 'jelita', 'jelek'],
];
const synonymAlternatives:Record<string,string[]> = {
  letih:['capek','penat'], susah:['sukar'], riang:['ceria','senang'],
  hening:['sepi','senyap'], lekas:['segera'], cerdas:['pandai','cerdik'],
  takut:['ngeri','khawatir'], gigih:['ulet'], luas:['lebar'], hemat:['ekonomis'],
  akrab:['karib','intim'], tangguh:['kokoh'], kotor:['cemar'],
  usang:['lapuk','kuno'], cantik:['ayu','elok'],
};
export const randomStages: ContentStage[] = [
  ...bridges.map(([clues, best, explanation]) => ({ kind:'bridge2' as const, clues, best, explanation, overrides:{} })),
  ...triples.map(([clues, best, explanation]) => ({ kind:'bridge3' as const, clues, best, explanation, overrides:{} })),
  ...synonyms.map(([clue, best, antonym]) => ({ kind:'closest' as const, clues:[clue], best, explanation:`${best[0].toUpperCase() + best.slice(1)} memiliki makna yang dekat dengan ${clue}.`, overrides:Object.fromEntries((synonymAlternatives[clue] ?? []).map(word=>[word,[.98]])), excluded:[antonym] })),
];
