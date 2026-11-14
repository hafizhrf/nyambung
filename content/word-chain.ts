import {randomClueWords} from './random-words.js';
import {reviewedBridges} from './relations.js';
import {closestGroups} from './closest.js';
// Extra everyday continuations for word-chain play, beyond editorial clue words.
// A difficult suffix must have several familiar choices, not just a rare entry.
export const wordChainCommonWords=`
mahir mahasiswa mahar mahkota ahli akhir ajar ajaib ajakan
janji jantung janin janda januari anjing anak angin angka antre antena
ngengat ngeri ngilu nganga ngarai luka lurus luas lunak lulus
kangen kuda katering kata kantong kampung karung kancing
bangun bangga bangkit bangsa bangku bangunan bangkrut
terbang lubang gerbang kembang seberang sekarang kadang
ringan ringkih ringkas ringgit miring kering piring
ungkap unggul ungu unta untung undang undangan untuk
rumah hujan hidung halaman hadiah hari hangat harapan haus
tunggu tunggal tungku tunggakan tunggul tunggang tungging
daun danau darat datang dagang damar daging dahulu
nasib nasi nanas nama napas nada nadi nyaman nyamuk nyata nyala
sapu satu sabun salah sawah sarapan sarang sayang sakit
`.trim().split(/\s+/);

export const wordChainFamiliarWords=[...new Set([...wordChainCommonWords,...randomClueWords,...closestGroups.flat(),...reviewedBridges.flatMap(row=>[row.answer,...row.facets.flat()])])];
