// Curated factual prompts. Accepted alternatives are explicit, never fuzzy matched.
export const quickQuestions = `
Alat untuk melihat waktu di pergelangan tangan?|jam tangan
Benda untuk melindungi kepala saat naik motor?|helm
Alat untuk memotong kertas?|gunting
Benda untuk menghapus tulisan pensil?|penghapus
Alat untuk mengukur suhu tubuh?|termometer
Alat untuk menunjukkan arah mata angin?|kompas
Alat untuk melihat benda sangat kecil?|mikroskop
Alat untuk melihat bintang yang jauh?|teleskop|teropong bintang
Alat untuk menimbang berat badan?|timbangan
Alat untuk menyapu lantai?|sapu
Tempat menyimpan makanan agar tetap dingin?|kulkas|lemari es
Alat untuk merapikan pakaian dengan panas?|setrika
Alat untuk mengaduk adonan secara elektrik?|mikser|mixer
Benda untuk menyisir rambut?|sisir
Benda untuk membersihkan gigi?|sikat gigi
Alat tulis yang isinya grafit?|pensil
Wadah tinta pada printer disebut apa?|kartrid|cartridge
Benda untuk mengunci pintu dari lubang kunci?|kunci
Alat untuk membuka baut?|kunci pas
Alat untuk menancapkan paku?|palu
Hewan yang memiliki belalai?|gajah
Hewan berkantung yang melompat, khas Australia?|kanguru
Hewan yang lehernya sangat panjang?|jerapah
Hewan laut yang memiliki delapan lengan?|gurita
Mamalia laut bergigi dengan sonar yang sering melompat?|lumba-lumba|lumba lumba
Burung yang dikenal meniru ucapan manusia?|beo
Serangga penghasil madu?|lebah
Hewan yang membawa rumah berupa cangkang spiral?|siput|bekicot
Hewan gurun yang memiliki punuk?|unta
Hewan yang mengubah warna kulit dan memiliki lidah panjang untuk menangkap serangga?|bunglon
Mamalia yang dapat terbang aktif?|kelelawar
Hewan hitam putih pemakan bambu?|panda
Burung besar berkaki panjang yang tidak bisa terbang, berasal dari Afrika?|burung unta
Hewan yang menghasilkan benang untuk membuat jaring?|laba-laba|laba laba
Larva kupu-kupu disebut apa?|ulat
Anak katak yang hidup di air disebut apa?|berudu|kecebong
Hewan dengan duri tajam di punggung untuk pertahanan?|landak
Hewan laut berbentuk bintang?|bintang laut
Reptil dengan tempurung yang hidup di laut?|penyu
Ikan yang bernapas melalui labirin dan dikenal suka bertarung dalam akuarium kecil?|cupang|ikan cupang
Planet tempat manusia tinggal?|bumi
Planet yang terkenal dengan cincin besarnya?|saturnus
Bintang pusat tata surya?|matahari
Satelit alami Bumi?|bulan
Planet terdekat dengan Matahari?|merkurius
Planet terbesar dalam tata surya?|jupiter|yupiter
Peristiwa tertutupnya Matahari oleh Bulan disebut apa?|gerhana matahari
Gaya yang menarik benda ke pusat Bumi?|gravitasi
Air yang berubah menjadi gas mengalami proses apa?|penguapan|evaporasi
Air yang menjadi es mengalami proses apa?|pembekuan|membeku
Gas yang diperlukan manusia untuk bernapas?|oksigen
Gas yang diserap tumbuhan saat fotosintesis?|karbon dioksida|karbondioksida
Proses tumbuhan membuat makanan menggunakan cahaya?|fotosintesis
Bagian tumbuhan yang menyerap air dari tanah?|akar
Bagian tumbuhan tempat utama fotosintesis?|daun
Organ tubuh yang memompa darah?|jantung
Organ tubuh untuk berpikir?|otak
Organ tubuh untuk mendengar?|telinga
Organ tubuh untuk melihat?|mata
Organ utama manusia untuk bernapas?|paru-paru|paru paru
Ibu kota Indonesia sebelum pemindahan ke Nusantara?|jakarta
Ibu kota Jepang?|tokyo|tokio
Ibu kota Thailand?|bangkok
Ibu kota Malaysia?|kuala lumpur
Ibu kota Australia?|canberra
Ibu kota Prancis?|paris
Negara tempat Menara Pisa berada?|italia
Negara tempat Piramida Giza berada?|mesir
Benua tempat Gurun Sahara berada?|afrika
Samudra terluas di dunia?|pasifik|samudra pasifik
Mata uang Jepang?|yen
Mata uang Indonesia?|rupiah
Bahasa resmi Brasil?|portugis
Gunung tertinggi di dunia di atas permukaan laut?|everest|gunung everest
Pulau tempat kota Denpasar berada?|bali
Rumah adat Minangkabau disebut apa?|rumah gadang
Kain tradisional yang dibuat menggunakan malam dan canting?|batik
Alat musik bambu yang dimainkan dengan digoyangkan?|angklung
Alat musik berdawai yang umumnya memiliki enam senar?|gitar
Alat musik bertuts hitam putih dengan senar yang dipukul mekanisme palu?|piano
Jumlah sisi segitiga?|tiga|3
Jumlah sisi persegi?|empat|4
Jumlah sudut pada segilima?|lima|5
Bilangan setelah sembilan?|sepuluh|10
Hasil tujuh ditambah delapan?|lima belas|15
Hasil enam dikali tujuh?|empat puluh dua|42
Hasil seratus dibagi empat?|dua puluh lima|25
Satuan dasar panjang dalam SI?|meter
Satuan arus listrik dalam SI?|ampere
Satuan suhu termodinamika dalam SI?|kelvin
Olahraga dengan raket, kok, dan net?|bulu tangkis|bulutangkis|badminton
Jumlah pemain satu tim sepak bola di lapangan saat mulai?|sebelas|11
Olahraga memasukkan bola ke keranjang?|bola basket|basket
Gaya renang yang meniru gerakan katak?|gaya dada|dada
Permainan papan dengan raja, ratu, benteng, dan pion?|catur
Benda bundar yang ditendang dalam sepak bola?|bola
Pemain yang bertugas menjaga gawang?|kiper|penjaga gawang
Tempat pesawat lepas landas dan mendarat?|bandara|bandar udara
Tempat kereta berhenti menaikkan penumpang?|stasiun
Kendaraan yang berjalan di atas rel?|kereta api|kereta
`
  .trim()
  .split("\n")
  .map((line, index) => {
    const [prompt, ...answers] = line.split("|");
    return { id: `q${index + 1}`, prompt, answers };
  });
