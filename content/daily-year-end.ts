import type {ContentStage} from '../apps/api/src/scoring.js';

export const yearEndStart='2026-11-05';
export const yearEndEnd='2026-12-31';
// Original editorial clues and explanations. The publisher validates every
// association against the frozen edition; it never samples random gameplay.
const pairRows=`
haus,plastik|galon|Galon menampung air minum untuk menghilangkan haus dan banyak dibuat dari plastik.
liburan,roda|koper|Koper membawa barang saat liburan dan sering dilengkapi roda.
sekolah,bahu|tas|Tas membawa perlengkapan sekolah dan talinya dapat disampirkan di bahu.
rias,spion|cermin|Cermin membantu merias wajah dan menjadi bagian utama spion kendaraan.
negara,kertas|peta|Peta menggambarkan wilayah negara dan dapat dicetak di atas kertas.
petualangan,magnet|kompas|Kompas membantu menentukan arah saat petualangan dengan jarum bermagnet.
pidato,band|panggung|Panggung menjadi tempat menyampaikan pidato maupun pertunjukan band.
serat,bungkus|kertas|Kertas dibuat dari serat dan dapat dipakai sebagai pembungkus.
begadang,biji|kopi|Kopi diseduh dari biji yang diolah dan sering diminum saat begadang.
kenangan,lensa|kamera|Kamera memakai lensa untuk merekam foto yang menyimpan kenangan.
telur,rumah|sarang|Sarang menjadi rumah hewan dan tempat burung meletakkan telur.
perbatasan,identitas|paspor|Paspor adalah dokumen identitas untuk perjalanan melintasi perbatasan negara.
kampus,hening|perpustakaan|Perpustakaan kampus menyediakan ruang membaca yang biasanya hening.
sembunyi,kayu|topeng|Topeng menyembunyikan wajah dan dapat dibuat dari kayu.
jarum,merah|benang|Benang dimasukkan ke jarum saat menjahit; benang merah berarti hubungan utama.
kristal,awet|garam|Garam berbentuk kristal dan digunakan untuk membuat bahan makanan lebih awet.
kue,gelap|lilin|Lilin dipasang di kue ulang tahun dan dapat menerangi tempat gelap.
daun,pagi|embun|Embun sering tampak sebagai titik air pada daun di pagi hari.
berita,mobil|radio|Radio menyiarkan berita dan dapat didengarkan di dalam mobil.
nomor,jarak|telepon|Nomor telepon menghubungkan percakapan antara orang yang berjauhan.
kendali,habis|baterai|Baterai memasok daya pada pengendali jarak jauh dan perlu diganti atau diisi saat habis.
saklar,jalan|lampu|Lampu dinyalakan dengan saklar dan membantu menerangi jalan.
angin,tangan|kipas|Kipas mengalirkan angin dan dapat digerakkan dengan tangan.
beku,dapur|kulkas|Kulkas di dapur menyimpan makanan pada suhu dingin, termasuk kompartemen beku.
papan,panas|setrika|Setrika yang panas digunakan merapikan pakaian di atas papan setrika.
produksi,gerak|mesin|Mesin menghasilkan gerak yang membantu pekerjaan produksi.
program,pabrik|robot|Robot menjalankan program untuk membantu pekerjaan di pabrik.
orbit,cuaca|satelit|Satelit bergerak di orbit dan dapat digunakan untuk memantau cuaca.
kapal,pantulan|radar|Radar pada kapal mendeteksi objek melalui pantulan gelombang.
situs,kabel|internet|Situs diakses melalui internet yang jaringannya dapat menggunakan kabel.
huruf,keamanan|sandi|Sandi memakai susunan huruf atau simbol untuk menjaga keamanan informasi.
riset,simpan|data|Data dikumpulkan dalam riset dan disimpan untuk dianalisis.
tirai,udara|jendela|Jendela dapat ditutup tirai dan dibuka untuk pertukaran udara.
pegas,istirahat|kasur|Kasur menjadi tempat beristirahat dan sebagian jenisnya memakai pegas.
kepala,sarung|bantal|Bantal menopang kepala dan dapat dibungkus dengan sarung bantal.
ijuk,sampah|sapu|Sapu dapat dibuat dari ijuk dan dipakai mengumpulkan sampah.
sumur,pegangan|ember|Ember berpegangan dapat digunakan untuk mengambil air dari sumur.
busa,kuman|sabun|Sabun dapat menghasilkan busa dan membantu membersihkan kotoran serta kuman dari permukaan.
serap,kamar|handuk|Handuk menyerap air dan menjadi perlengkapan yang disediakan di kamar hotel.
cekung,gula|sendok|Sendok mempunyai bagian cekung untuk mengambil atau menakar gula.
gagang,buah|pisau|Pisau dipegang pada gagangnya untuk memotong atau mengupas buah.
tutup,rebus|panci|Panci dipakai merebus makanan dan biasanya mempunyai tutup.
kopi,lubang|saringan|Saringan berlubang memisahkan ampas dari seduhan kopi.
panas,dapur|kompor|Kompor menghasilkan panas untuk memasak di dapur.
roti,suhu|oven|Roti dipanggang dalam oven dengan suhu yang diatur.
tutup,dingin|termos|Termos bertutup membantu mempertahankan suhu minuman dingin maupun panas.
uang,lipat|dompet|Dompet menyimpan uang dan banyak modelnya dapat dilipat.
proyek,kepala|helm|Helm melindungi kepala pekerja di lokasi proyek.
sol,tali|sepatu|Sepatu mempunyai sol dan sebagian modelnya dikencangkan dengan tali.
katun,gambar|kaus|Kaus sering dibuat dari katun dan dihias dengan gambar.
jari,tunangan|cincin|Cincin dikenakan pada jari dan dapat menjadi tanda pertunangan.
rantai,mutiara|kalung|Kalung dapat tersusun dari rantai atau rangkaian mutiara.
bingkai,baca|kacamata|Kacamata mempunyai bingkai dan dapat membantu penglihatan saat membaca.
identitas,kompak|seragam|Seragam menunjukkan identitas kelompok dan membuat anggotanya tampak kompak.
petik,panggung|gitar|Gitar dimainkan dengan memetik senar dan sering tampil di panggung musik.
jari,senar|piano|Jari menekan tuts piano yang menggerakkan mekanisme pemukul senar.
napas,bambu|seruling|Seruling dapat dibuat dari bambu dan dibunyikan dengan tiupan napas.
kanvas,kuas|lukisan|Lukisan dapat dibuat di atas kanvas menggunakan kuas.
kayu,monumen|patung|Patung dapat dipahat dari kayu dan dibuat sebagai monumen peringatan.
tokoh,buku|novel|Novel adalah buku cerita yang mengisahkan kehidupan tokoh-tokohnya.
bait,perasaan|puisi|Puisi disusun dalam bait dan sering mengungkapkan perasaan.
arti,buku|kamus|Kamus adalah buku atau sumber rujukan yang menjelaskan arti kata.
wartawan,pagi|koran|Koran memuat berita karya wartawan dan sering dibaca pada pagi hari.
amplop,tulis|surat|Surat ditulis untuk menyampaikan pesan dan dapat dikirim di dalam amplop.
pesawat,konser|tiket|Tiket dibutuhkan untuk naik pesawat maupun masuk konser.
sejarah,kunjungan|museum|Museum menyimpan peninggalan sejarah yang dapat dilihat saat kunjungan.
dokumen,lama|arsip|Arsip menyimpan dokumen lama agar dapat ditemukan kembali.
semir,bulu|sikat|Sikat berbulu dipakai meratakan semir dan membersihkan sepatu.
rasa,pasir|gula|Gula memberi rasa manis; gula pasir berbentuk butiran kecil.
gandum,halus|tepung|Tepung dapat dibuat dari gandum yang digiling menjadi serbuk halus.
tape,jamur|ragi|Ragi mengandung mikroorganisme, termasuk jamur, yang digunakan dalam pembuatan tape.
kambing,kalsium|susu|Susu kambing merupakan minuman yang mengandung kalsium.
lebah,kental|madu|Lebah menghasilkan madu yang terasa manis dan kental.
pohon,parut|kelapa|Kelapa tumbuh pada pohon dan daging buahnya dapat diparut.
panda,seruling|bambu|Bambu menjadi makanan panda dan bahan untuk membuat seruling.
kain,pancasila|kapas|Kapas menjadi bahan kain dan bagian lambang sila kelima Pancasila.
pohon,lentur|karet|Karet dapat diperoleh dari getah pohon dan dikenal sebagai bahan yang lentur.
kepompong,mahal|sutra|Serat sutra berasal dari kepompong dan diolah menjadi kain bernilai tinggi.
domba,hangat|wol|Wol berasal dari bulu domba dan digunakan untuk pakaian hangat.
kerang,bulat|mutiara|Mutiara dapat terbentuk di dalam kerang dan sering berbentuk bulat.
gurun,butir|pasir|Pasir tersusun dari butir-butir kecil dan banyak ditemukan di gurun.
akar,keramik|tanah|Akar tumbuh di tanah; tanah liat diolah menjadi keramik.
rel,magnet|besi|Besi dipakai pada rel dan dapat ditarik oleh magnet.
tambang,juara|emas|Emas ditambang dari bumi dan menjadi lambang medali bagi juara.
tarik,kompas|magnet|Magnet mempunyai gaya tarik pada bahan tertentu dan digunakan pada kompas.
demam,raksa|termometer|Termometer mengukur suhu saat demam; sebagian model lama menggunakan raksa.
badan,dagangan|timbangan|Timbangan mengukur berat badan dan berat barang dagangan.
sekolah,panjang|penggaris|Penggaris dipakai di sekolah untuk mengukur panjang.
ban,sumur|pompa|Pompa memasukkan udara ke ban dan dapat menaikkan air dari sumur.
pipa,jantung|katup|Katup mengatur aliran di dalam pipa dan juga terdapat pada jantung.
kamera,udara|filter|Filter dapat dipasang pada kamera atau digunakan untuk menyaring udara.
kamera,fokus|lensa|Lensa kamera membiaskan cahaya untuk membentuk gambar yang terfokus.
pelangi,segitiga|prisma|Prisma dapat berbentuk segitiga dan menguraikan cahaya menjadi warna pelangi.
hujan,lengkung|pelangi|Pelangi tampak sebagai lengkung warna ketika cahaya berinteraksi dengan tetesan hujan.
gunung,dingin|kabut|Kabut sering terbentuk di daerah pegunungan yang dingin dan lembap.
putih,uap|awan|Awan tersusun dari tetes air atau kristal es hasil pengembunan uap dan sering terlihat putih.
kristal,musim|salju|Salju berupa kristal es dan turun pada musim dingin di wilayah tertentu.
kipas,layar|angin|Kipas menghasilkan aliran angin; angin mendorong layar perahu.
buih,pantai|ombak|Ombak datang ke pantai dan dapat menghasilkan buih saat pecah.
tahun,panen|musim|Musim membagi keadaan dalam setahun dan dapat menandai waktu panen.
padi,hasil|panen|Panen adalah pengambilan hasil tanaman, misalnya padi.
kompos,subur|pupuk|Kompos merupakan pupuk yang membantu menjaga kesuburan tanah.
sampah,daun|kompos|Sampah organik seperti daun diolah menjadi kompos.
sawah,saluran|irigasi|Irigasi mengalirkan air ke sawah melalui saluran.
turbin,banjir|bendungan|Bendungan menampung air untuk mengendalikan aliran banjir dan dapat memasok turbin pembangkit.
angin,pembangkit|turbin|Turbin mengubah energi gerak angin menjadi putaran pada pembangkit listrik.
pelabuhan,besi|jangkar|Jangkar kapal biasanya berbahan logam seperti besi dan membantu menahan kapal di perairan pelabuhan.
perahu,tangan|dayung|Dayung digerakkan dengan tangan untuk mengayuh perahu.
berlabuh,barang|dermaga|Dermaga menjadi tempat kapal berlabuh untuk menaikkan atau menurunkan barang.
menara,malam|mercusuar|Mercusuar adalah menara bercahaya yang membantu navigasi kapal pada malam hari.
bawah,rel|terowongan|Terowongan menyediakan jalur di bawah tanah atau gunung dan dapat dilalui rel kereta.
pejalan,kota|trotoar|Trotoar menyediakan jalur bagi pejalan kaki di kota.
rute,tunggu|halte|Halte adalah tempat menunggu kendaraan umum yang mengikuti suatu rute.
darurat,kendaraan|ambulans|Ambulans adalah kendaraan untuk membawa pasien, termasuk dalam keadaan darurat.
cedera,bawa|tandu|Tandu dipakai membawa orang yang mengalami cedera.
balut,obat|perban|Perban digunakan untuk membalut luka dalam perawatan medis.
suntik,cegah|vaksin|Vaksin membantu mencegah penyakit dan sebagian diberikan melalui suntikan.
protein,lawan|antibodi|Antibodi adalah protein dalam sistem imun yang membantu melawan sasaran tertentu.
reaksi,pencernaan|enzim|Enzim mempercepat reaksi kimia, termasuk dalam proses pencernaan.
buah,suplemen|vitamin|Vitamin terdapat dalam berbagai buah dan juga dapat menjadi kandungan suplemen.
hitung,olahraga|kalori|Kalori dihitung sebagai satuan energi makanan dan dipakai saat berolahraga.
gerak,protein|otot|Otot menghasilkan gerak tubuh dan tersusun dari berbagai protein.
ukur,darah|nadi|Denyut nadi diukur untuk merasakan gelombang aliran darah dari kerja jantung.
paru,tarik|napas|Napas ditarik untuk memasukkan udara ke paru-paru.
gua,ulang|gema|Gema adalah suara pantulan yang terdengar berulang, misalnya di dalam gua.
siluet,pikiran|bayangan|Bayangan dapat berupa siluet karena cahaya maupun gambaran yang muncul dalam pikiran.
tujuan,situs|alamat|Alamat menunjukkan tujuan pengiriman surat maupun lokasi situs di internet.
awal,bisnis|modal|Modal menjadi bekal awal untuk menjalankan bisnis.
kepemilikan,harga|saham|Saham menyatakan kepemilikan pada perusahaan dan mempunyai harga yang diperdagangkan.
negara,bayar|pajak|Pajak dibayarkan kepada negara menurut ketentuan yang berlaku.
polis,kendaraan|asuransi|Asuransi kendaraan memberikan perlindungan sesuai ketentuan dalam polis.
palu,barang|lelang|Lelang menawarkan barang kepada penawar dan dapat ditandai dengan ketukan palu.
potong,promosi|diskon|Diskon adalah potongan harga yang sering dipakai dalam promosi.
rincian,kertas|nota|Nota dapat berupa kertas yang memuat rincian transaksi.
janji,bank|utang|Utang dapat berupa pinjaman dari bank yang disertai janji pengembalian.
bank,rencana|tabungan|Tabungan disimpan di bank dan dapat dipakai untuk mewujudkan rencana.
waktu,komitmen|janji|Janji adalah komitmen yang dapat mencakup waktu untuk bertemu atau melakukan sesuatu.
larang,adil|aturan|Aturan memuat hal yang boleh atau dilarang agar kegiatan berlangsung adil.
penjelasan,uji|teori|Teori memberikan penjelasan yang dapat diuji dengan bukti.
matematika,kesempatan|peluang|Peluang dapat berarti kesempatan maupun ukuran kemungkinan dalam matematika.
catur,bisnis|strategi|Strategi menyusun langkah untuk mencapai tujuan dalam catur maupun bisnis.
lingkaran,waktu|jangka|Jangka dapat menjadi alat menggambar lingkaran dan menyatakan rentang waktu.
darah,kota|jantung|Jantung memompa darah; jantung kota berarti kawasan pusat kota.
mulut,nyala|lidah|Lidah terdapat di mulut dan juga dipakai dalam istilah lidah api untuk nyala yang menjulur.
gunung,sampul|punggung|Punggung dapat menyebut bagian memanjang gunung dan bagian penjilidan buku di dekat sampul.
lowongan,rumput|lapangan|Lapangan dapat berupa tempat berumput atau kesempatan kerja yang dicari melalui lowongan.
jari,kontrak|tangan|Tangan memiliki jari dan dipakai membubuhkan tanda tangan pada kontrak.
ayam,perasaan|hati|Hati adalah organ yang dapat diolah dari ayam dan juga kiasan untuk perasaan.
pohon,gagasan|buah|Buah tumbuh pada pohon; buah pikiran berarti gagasan.
kucing,antrean|ekor|Kucing mempunyai ekor; bagian paling belakang antrean juga disebut ekor.
burung,organisasi|sayap|Sayap membantu burung terbang dan menjadi sebutan untuk bagian pendukung organisasi.
botol,kalung|leher|Leher adalah bagian tubuh tempat kalung dikenakan dan bagian sempit pada botol.
lengan,darurat|bahu|Bahu berada di dekat lengan; bahu jalan dapat dipakai untuk keadaan darurat sesuai aturan.
renang,ayam|dada|Dada adalah bagian tubuh ayam dan nama salah satu gaya renang.
hadiah,tenggorokan|pita|Pita menghias hadiah; pita suara terdapat di tenggorokan.
spora,palu|paku|Paku ditancapkan dengan palu; tumbuhan paku berkembang biak menggunakan spora.
ikan,gawang|jaring|Jaring menangkap ikan dan dipasang pada gawang permainan bola.
donor,kanguru|kantong|Kantong darah dipakai dalam donor; kanguru mempunyai kantong untuk anaknya.
lansia,estafet|tongkat|Tongkat membantu sebagian lansia berjalan dan dipakai dalam lomba estafet.
pertandingan,jalan|peluit|Peluit digunakan wasit saat pertandingan dan polisi saat mengatur jalan.
hakim,penawaran|palu|Palu diketukkan hakim dalam persidangan dan dipakai dalam proses penawaran lelang.
televisi,usus|saluran|Saluran dapat menyebut kanal televisi maupun jalur pencernaan yang melibatkan usus.
tamu,geometri|ruang|Ruang tamu menjadi bagian rumah; ruang dalam geometri mempunyai ukuran tiga dimensi.
keahlian,tanah|bidang|Bidang dapat berarti ranah keahlian atau sebidang tanah.
derajat,pendapat|sudut|Sudut diukur dalam derajat; sudut pandang memengaruhi pendapat.
keturunan,finis|garis|Garis menyatakan hubungan keturunan dan penanda finis perlombaan.
didih,koordinat|titik|Titik didih menandai suhu perubahan menjadi gas; koordinat menentukan posisi titik.
intonasi,layar|datar|Intonasi dapat terdengar datar dan layar televisi dapat berbentuk datar.
kilogram,pencemaran|berat|Berat sehari-hari dinyatakan melalui ukuran kilogram; logam berat berkaitan dengan pencemaran.
bulu,camilan|ringan|Bulu mempunyai bobot ringan; camilan juga disebut makanan ringan.
wartawan,listrik|sumber|Wartawan mempunyai sumber berita; listrik berasal dari sumber energi.
`.trim().split('\n');

const tripleRows=`
kantor,celah,peserta|rapat|Rapat di kantor diikuti peserta; rapat juga berarti hampir tanpa celah.
kilometer,minyak,rindu|jarak|Jarak diukur dalam kilometer, menjadi nama tanaman penghasil minyak, dan memisahkan orang yang rindu.
sisik,gonggong,manis|salak|Salak adalah buah manis berkulit menyerupai sisik dan juga sebutan untuk gonggong anjing.
cinta,pewarna,daun|pacar|Pacar berkaitan dengan pasangan cinta dan tanaman yang daunnya diolah menjadi pewarna.
sungai,komponen,bambu|rakit|Rakit bambu dipakai di sungai; merakit berarti menyusun komponen.
karet,jeda,pemadam|selang|Selang dapat dibuat dari karet untuk pemadam dan juga berarti jeda waktu.
goreng,informasi,sumedang|tahu|Tahu dapat digoreng dan dikenal dari Sumedang; tahu juga berarti mempunyai informasi.
bacaan,bambu,sendi|buku|Buku menjadi bahan bacaan, ruas pada bambu, dan bagian pada sendi jari.
taman,api,gadis|kembang|Kembang tumbuh di taman, muncul pada kembang api, dan menjadi kiasan gadis pujaan desa.
terumbu,cerita,pemuda|karang|Karang terdapat pada terumbu laut; mengarang menghasilkan cerita; karang taruna adalah organisasi pemuda.
oksidasi,kemurnian,cokelat|karat|Karat dapat terbentuk karena oksidasi dengan warna kecokelatan; karat juga menyatakan kadar kemurnian emas.
atap,krisis,liat|genting|Genting menutup atap dan dapat dibuat dari tanah liat; genting juga berarti keadaan krisis.
suhu,rekening,diplomasi|beku|Suhu rendah dapat membuat air beku; rekening dan hubungan diplomasi juga dapat dibekukan.
wujud,dana,akrab|cair|Cair adalah wujud zat, keadaan dana yang dapat digunakan, dan kiasan suasana yang akrab.
ranting,kecewa,semangat|patah|Ranting dapat patah; rasa kecewa dapat membuat seseorang patah semangat.
gunting,perpisahan,sambungan|putus|Gunting dapat membuat tali putus; putus juga menggambarkan perpisahan dan sambungan yang terhenti.
ukuran,lomba,pengawasan|ketat|Pakaian dapat berukuran ketat, lomba berlangsung ketat, dan pengawasan diterapkan secara ketat.
baju,jadwal,aturan|longgar|Baju dapat longgar, jadwal memiliki waktu longgar, dan aturan dapat diterapkan lebih longgar.
gang,wawasan,kesempatan|sempit|Gang dapat sempit; wawasan yang terbatas dan kesempatan yang sedikit juga disebut sempit.
jalan,senyum,rentang|lebar|Lebar menggambarkan ukuran jalan, senyum yang terbuka, dan rentang sayap.
sumur,perasaan,negeri|dalam|Sumur dapat dalam, seseorang mempunyai perasaan mendalam, dan dalam negeri berarti wilayah negara sendiri.
batu,pendirian,perangkat|keras|Batu bersifat keras; pendirian keras sulit berubah; perangkat keras adalah bagian fisik komputer.
bubur,komputer,hukuman|lunak|Bubur bertekstur lunak; komputer memakai perangkat lunak; hukuman lunak berarti relatif ringan.
sutra,sopan,gaib|halus|Sutra terasa halus, tutur halus berarti sopan, dan makhluk halus berkaitan dengan kepercayaan pada yang gaib.
tekstur,perilaku,perkiraan|kasar|Kasar dapat menggambarkan tekstur, perilaku tidak sopan, atau hitungan yang masih berupa perkiraan.
halaman,uang,kabut|tebal|Buku dengan banyak halaman dapat tebal; dompet berisi uang dan kabut pekat juga disebut tebal.
lembar,selisih,peluang|tipis|Lembar kertas dapat tipis; selisih kecil dan peluang sedikit juga digambarkan tipis.
gunung,kampus,sombong|tinggi|Gunung mempunyai ketinggian; kampus menyelenggarakan pendidikan tinggi; tinggi hati berarti sombong.
lembah,sopan,harga|rendah|Lembah berada di tempat rendah, rendah hati mencerminkan sikap sopan, dan harga dapat rendah.
meter,doa,pencuri|panjang|Panjang diukur dengan meter, panjang umur menjadi harapan dalam doa, dan panjang tangan berarti suka mencuri.
rambut,durasi,korsleting|pendek|Rambut dan durasi dapat pendek; sirkuit pendek merupakan istilah untuk korsleting.
lingkaran,suara,tekad|bulat|Lingkaran berbentuk bulat; suara bulat berarti sepakat dan tekad bulat berarti mantap.
serpihan,penyebut,nominal|pecahan|Pecahan dapat berupa serpihan benda, bilangan dengan penyebut, atau satuan nominal uang.
retak,kepercayaan,kalsium|rapuh|Benda rapuh mudah retak, kepercayaan dapat rapuh, dan tulang memerlukan kalsium agar tetap kuat.
tempel,kenangan,kantuk|lekat|Lem membuat benda lekat, kenangan dapat lekat di ingatan, dan mata lekat menggambarkan kantuk.
serambi,inti,pimpinan|teras|Teras dapat berarti serambi rumah, bagian inti kayu, atau jajaran pimpinan suatu organisasi.
tamu,navigasi,depan|beranda|Beranda adalah bagian depan rumah untuk menerima tamu dan halaman awal navigasi situs.
tumpuk,latihan,kepemilikan|lembar|Kertas ditumpuk per lembar, latihan ditulis pada lembar kerja, dan saham dihitung dalam lembar kepemilikan.
gula,remi,belah|wajik|Wajik adalah makanan manis bergula dan bentuk belah ketupat pada kartu remi.
gosong,geologi,betawi|kerak|Kerak muncul pada panci gosong, menjadi lapisan bumi dalam geologi, dan terdapat pada nama kerak telur Betawi.
lipstik,cangkir,tepi|bibir|Bibir dapat memakai lipstik, menyebut bagian tepi cangkir, dan menjadi kiasan untuk tepian.
saraf,gagasan,dalang|otak|Otak merupakan bagian sistem saraf, tempat mengolah gagasan, dan sebutan untuk dalang suatu tindakan.
darah,pola,tegang|urat|Urat dapat membawa darah, membentuk pola pada kayu, dan muncul pada ungkapan tegang urat saraf.
tubuh,daun,nafkah|tulang|Tulang menopang tubuh, membentuk struktur daun, dan menjadi kiasan pencari nafkah dalam tulang punggung.
tanam,konflik,gagasan|benih|Benih ditanam untuk tumbuh dan menjadi kiasan awal munculnya konflik atau gagasan.
pucuk,pramuka,generasi|tunas|Tunas adalah pucuk tanaman baru, lambang Pramuka, dan kiasan generasi muda.
akar,organ,luka|cangkok|Cangkok dapat merangsang akar tanaman dan menyebut pemindahan organ atau kulit untuk perawatan luka.
listrik,permainan,persahabatan|sambung|Sambung menghubungkan kabel listrik, menjadi kegiatan dalam permainan kata, dan menjaga hubungan persahabatan.
senar,panen,kutipan|petik|Senar dipetik saat bermain musik, buah dipetik saat panen, dan kalimat dapat dipetik sebagai kutipan.
sumur,wawancara,sejarah|gali|Sumur digali di tanah; wawancara menggali keterangan dan penelitian menggali sejarah.
kayu,kalori,pidato|bakar|Kayu dibakar dengan api, kalori dibakar saat bergerak, dan pidato dapat membakar semangat.
wajan,spekulasi,sensasi|goreng|Menggoreng dilakukan dengan wajan; menggoreng saham berkaitan dengan spekulasi dan menggoreng berita mengejar sensasi.
kulit,masalah,berita|kupas|Kulit buah dapat dikupas, sedangkan masalah dan berita dikupas melalui pembahasan.
bangunan,rahasia,muatan|bongkar|Bangunan dapat dibongkar, rahasia dibongkar agar terungkap, dan muatan kapal dibongkar saat tiba.
barang,uang,diskusi|tukar|Tukar menukar barang disebut barter, uang dapat ditukar dengan mata uang lain, dan diskusi menjadi ajang bertukar pikiran.
sawah,informasi,penyakit|sebar|Benih disebar di sawah, informasi disebar kepada orang lain, dan penyakit dapat menyebar.
pos,kesehatan,sepakbola|jaga|Seseorang berjaga di pos, menjaga kesehatan tubuh, dan menjaga gawang dalam sepakbola.
`.trim().split('\n');

const closestRows=`
hening|sunyi|Hening dan sunyi sama-sama menggambarkan suasana tanpa suara yang mengganggu.
gigih|tekun|Gigih dan tekun menggambarkan keteguhan dalam melakukan usaha.
cerdas|pintar|Cerdas dan pintar berarti mempunyai kemampuan berpikir yang baik.
lekas|cepat|Lekas dan cepat menyatakan tindakan yang tidak lambat.
riang|gembira|Riang dan gembira menggambarkan perasaan senang.
akrab|dekat|Akrab dan dekat menggambarkan hubungan yang erat antara orang.
tangguh|kokoh|Tangguh dan kokoh menggambarkan sesuatu yang kuat menghadapi tekanan.
usang|lama|Usang dapat menggambarkan sesuatu yang sudah lama atau tidak baru lagi.
cantik|elok|Cantik dan elok sama-sama berarti indah dipandang.
cemas|khawatir|Cemas dan khawatir menggambarkan rasa tidak tenang terhadap sesuatu.
sedih|pilu|Sedih dan pilu menggambarkan perasaan duka.
geram|marah|Geram dan marah menggambarkan perasaan kesal yang kuat.
tenteram|damai|Tenteram dan damai menggambarkan keadaan tenang tanpa gangguan.
ramah|bersahabat|Ramah dan bersahabat menggambarkan sikap hangat dalam bergaul.
angkuh|sombong|Angkuh dan sombong menggambarkan sikap merasa diri lebih tinggi.
lembut|halus|Lembut dan halus menggambarkan tekstur yang tidak kasar.
kasar|kesat|Kasar dan kesat menggambarkan permukaan yang tidak halus.
licin|mulus|Licin dan mulus menggambarkan permukaan yang halus tanpa hambatan.
rapuh|ringkih|Rapuh dan ringkih menggambarkan sesuatu yang mudah rusak atau patah.
kuat|kukuh|Kuat dan kukuh menggambarkan sesuatu yang teguh dan tidak mudah goyah.
lemah|loyo|Lemah dan loyo menggambarkan keadaan kurang bertenaga.
sehat|bugar|Sehat dan bugar menggambarkan kondisi tubuh yang baik.
sakit|nyeri|Sakit dan nyeri menggambarkan rasa tidak nyaman pada tubuh.
dingin|sejuk|Dingin dan sejuk menggambarkan suhu yang rendah atau terasa menyegarkan.
gerah|panas|Gerah menggambarkan rasa tidak nyaman karena panas.
terang|cerah|Terang dan cerah menggambarkan keadaan yang mendapatkan banyak cahaya.
gelap|kelam|Gelap dan kelam menggambarkan keadaan kurang atau tanpa cahaya.
redup|suram|Redup dan suram menggambarkan cahaya yang kurang terang.
kering|gersang|Kering dan gersang menggambarkan keadaan yang kekurangan air.
wangi|harum|Wangi dan harum sama-sama berarti berbau sedap.
lezat|enak|Lezat dan enak sama-sama menggambarkan rasa makanan yang nikmat.
pahit|getir|Pahit dan getir menggambarkan rasa yang berlawanan dengan manis.
lapar|keroncongan|Lapar dan keroncongan menggambarkan keadaan ingin makan.
akbar|besar|Akbar berarti besar atau agung sesuai konteks penggunaannya.
mungil|kecil|Mungil berarti kecil dan biasanya tampak elok atau menarik.
jangkung|tinggi|Jangkung menggambarkan tubuh yang tinggi.
sesak|sempit|Sesak dan sempit menggambarkan ruang yang terasa tidak lapang.
lapang|luas|Lapang dan luas menggambarkan tempat yang mempunyai banyak ruang.
memadai|cukup|Memadai dan cukup berarti dapat memenuhi kebutuhan.
penuh|sarat|Penuh dan sarat menggambarkan keadaan terisi banyak atau seluruhnya.
kosong|hampa|Kosong dan hampa menggambarkan keadaan tanpa isi.
lamban|lambat|Lamban dan lambat sama-sama menggambarkan gerak yang tidak cepat.
gampang|mudah|Gampang dan mudah menggambarkan sesuatu yang tidak sulit dilakukan.
rumit|pelik|Rumit dan pelik menggambarkan sesuatu yang sulit dipahami atau diselesaikan.
sederhana|simpel|Sederhana dan simpel menggambarkan sesuatu yang tidak rumit.
penting|utama|Penting dan utama dapat menggambarkan hal yang perlu didahulukan.
tepat|akurat|Tepat dan akurat menggambarkan hasil yang sesuai dengan keadaan sebenarnya.
keliru|salah|Keliru dan salah menggambarkan sesuatu yang tidak benar.
betul|benar|Betul dan benar sama-sama menyatakan kesesuaian dengan fakta.
tentu|pasti|Tentu dan pasti menyatakan sesuatu yang tidak diragukan.
mungkin|barangkali|Mungkin dan barangkali menyatakan kemungkinan yang belum pasti.
sering|kerap|Sering dan kerap menyatakan kejadian yang berulang banyak kali.
jarang|langka|Jarang dan langka menggambarkan sesuatu yang tidak banyak dijumpai.
abadi|kekal|Abadi dan kekal menggambarkan sesuatu yang berlangsung tanpa akhir.
sebentar|sejenak|Sebentar dan sejenak sama-sama berarti dalam waktu singkat.
dahulu|dulu|Dahulu dan dulu sama-sama menunjuk waktu yang telah berlalu.
kini|sekarang|Kini dan sekarang sama-sama menunjuk waktu saat ini.
`.trim().split('\n');

function parse(row:string,kind:ContentStage['kind']):ContentStage {
  const [clues,best,explanation]=row.split('|');
  return {kind,clues:clues.split(','),best,explanation,overrides:{}};
}
if(pairRows.length!==171||tripleRows.length!==57||closestRows.length!==57)throw Error('Kurasi akhir tahun belum lengkap.');
export const yearEndPuzzles:ContentStage[][]=Array.from({length:57},(_,i)=>[
  parse(pairRows[i],'bridge2'),parse(pairRows[i+57],'bridge2'),parse(pairRows[i+114],'bridge2'),
  parse(tripleRows[i],'bridge3'),parse(closestRows[i],'closest'),
]);
