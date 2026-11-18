# Discovery: Survey Kepuasan JP Smart SIM

Tanggal analisis: 18 November 2026  
Lokasi: Z:\03 NEW\2026\33-JP-Survey-Kepuasan\Survey-Kepuasan  
Baseline Git: dfd83de  
Metode: pemeriksaan statis dan sintaks, tanpa menjalankan aplikasi atau mengirim data ke layanan Google.

## Ringkasan

Proyek memiliki alur survei yang jelas dan pemetaan 18 kolom yang konsisten. Risiko utama berada pada kepastian penyimpanan, validasi backend, dan privasi unggahan. Status operasional deployment belum dapat dipastikan dari kode lokal.

Dokumen ini merekam hasil analisis read-only yang telah dilaporkan. Rencana tindak lanjut ada di [improvement.md](improvement.md). Belum ada perbaikan yang diterapkan.

## Struktur dan teknologi

| Berkas | Peran |
| --- | --- |
| [index.html](index.html) | Form survei, CSS, validasi browser, percabangan pertanyaan, preview gambar, dan pengiriman dengan fetch. |
| [code.gs](code.gs) | Google Apps Script: menerima JSON, mengunggah gambar ke Drive, dan menyimpan jawaban ke Sheets. |

Tidak ada framework, package manifest, atau proses build yang ditemukan. Repositori awal hanya melacak dua berkas tersebut.

Konfigurasi URL Apps Script, ID spreadsheet, ID folder Drive, dan nama tab berada langsung dalam kode. Petunjuk deployment berada di komentar code.gs.

## Alur aplikasi dan data

1. Pengguna mengisi nama, WhatsApp, lama penggunaan, paket, dan alamat di Jepang.
2. Pengguna memilih kualitas sinyal.
3. Penilaian Sangat Bagus atau Bagus membuka pertanyaan autodebet, referral, dan saran.
4. Penilaian Kurang Bagus atau Sangat Jelek membuka detail kendala; screenshot speedtest bersifat opsional.
5. Browser mengirim JSON ke Apps Script, termasuk gambar dalam base64 jika tersedia.
6. Backend menggunakan ScriptLock, mencoba mengunggah gambar, lalu menambahkan satu baris ke Sheets.
7. Frontend menampilkan hasil berdasarkan respons backend.

Urutan 18 kolom: Timestamp; Nama Lengkap; No. WhatsApp; Lama Penggunaan; Domisili / Wilayah; Kualitas Sinyal; Tertarik Autodebet; Ada Referral; Nama Referral; WA Referral; Saran; Sejak Kapan Kendala; Lokasi Kendala; Kondisi Area; Jam / Aktivitas Kendala; Merk & Tipe HP; Link Screenshot Speedtest; Paket saat ini.

Timestamp menggunakan Asia/Tokyo. Kolom paket ditambahkan di posisi terakhir, sehingga urutan sebelumnya tetap dipertahankan.

## Temuan

### D01 — Tinggi: respons tidak valid dianggap berhasil

Bukti: index.html:1237-1250.

Frontend tidak memeriksa resp.ok. Jika pembacaan JSON gagal, kode membuat hasil pengganti dengan success: true.

Dampak: respons HTML atau error dari server dapat menghasilkan pesan berhasil tanpa bukti bahwa data tersimpan.

### D02 — Tinggi: payload belum divalidasi di backend

Bukti: code.gs:61-98, code.gs:128-142, code.gs:181-210.

Setelah JSON dibaca, payload langsung diproses. Tidak ditemukan pemeriksaan field wajib, tipe data, pilihan jawaban, panjang teks, maupun batas ukuran dan jenis berkas di server. Batas 5 MB dan pemeriksaan image/ hanya ada di browser. Tidak terlihat mekanisme antispam; komentar deployment mengarahkan akses Anyone.

Dampak: validasi browser dapat dilewati, data tidak lengkap atau tidak sesuai dapat masuk, dan endpoint berpotensi dipakai untuk menghabiskan kuota atau penyimpanan.

Batas kepastian: akses deployment aktual tidak diperiksa.

### D03 — Tinggi: screenshot dibagikan kepada siapa pun yang memiliki tautan

Bukti: code.gs:149-158 dan index.html:888.

Backend memanggil setSharing dengan ANYONE_WITH_LINK. Footer menyatakan survei aman dan rahasia. Jika pengaturan berbagi gagal, kode hanya mencatat peringatan dan tetap mengembalikan URL.

Dampak: screenshot yang memuat informasi pribadi berpotensi dilihat oleh pemegang tautan. Pernyataan privasi pada halaman belum menjelaskan perilaku tersebut.

Batas kepastian: izin Drive aktual dan keberhasilan setSharing belum diperiksa.

### D04 — Sedang: status pembacaan berkas belum dikendalikan

Bukti: index.html:1013-1055 dan index.html:1215-1219.

Submit tetap tersedia saat FileReader bekerja. Pemilihan berkas pengganti yang ditolak karena ukuran atau tipe hanya mengosongkan input, tanpa membersihkan base64 dan preview sebelumnya.

Dampak: screenshot dapat belum terlampir saat submit, atau gambar lama terkirim setelah penggantinya ditolak. Callback pembacaan yang terlambat juga belum memiliki pengaman terhadap perubahan pilihan.

### D05 — Sedang: belum ada pencegahan kiriman duplikat

Bukti: code.gs:63-65, code.gs:98-102, code.gs:210, dan index.html:1262-1274.

Tidak ada identitas kiriman atau pemeriksaan idempotensi. ScriptLock mengatur konkurensi, tetapi tidak mendeteksi pengulangan kiriman yang sama.

Dampak: jika penyimpanan berhasil tetapi respons gagal diterima, percobaan ulang dapat menghasilkan baris dan unggahan tambahan.

### D06 — Sedang: header yang berbeda ditimpa otomatis

Bukti: code.gs:217-247.

ensureHeaders_ mengganti judul pada baris pertama saat berbeda dari HEADERS, tanpa memeriksa atau memindahkan data historis di bawahnya.

Dampak: jika kolom spreadsheet pernah dipindahkan, label baru dapat tidak sesuai dengan isi lama. Pemeriksaan kesamaan jumlah kolom tidak mencegah ketidaksesuaian makna data.

### D07 — Catatan kinerja: lock mencakup upload Drive

Bukti: code.gs:63-101.

Lock diperoleh sebelum parsing, upload, dan penyimpanan. Permintaan lain menunggu sampai seluruh pekerjaan tersebut selesai; batas tunggu adalah 20 detik.

Dampak: upload lambat dapat memperpanjang antrean dan menyebabkan permintaan lain mendapat pesan server sibuk. Kapasitas aktual belum diukur.

### D08 — Catatan UX: progress dapat selesai terlalu dini

Bukti: index.html:1078-1095.

Progress hanya menghitung lima informasi dasar dan penilaian sinyal. Detail kendala yang wajib pada jalur sinyal negatif tidak dihitung.

Dampak: indikator dapat mencapai 100% saat form belum memenuhi validasi.

### D09 — Catatan kualitas data: WhatsApp hanya diperiksa tidak kosong

Bukti: index.html:1135-1139.

Tidak ada pemeriksaan format nomor. Input bertipe tel tidak disertai aturan format pada validasi khusus.

Dampak: teks yang bukan nomor dapat lolos dan menghambat tindak lanjut.

### D10 — Catatan pemeliharaan: dokumentasi dan pengujian terbatas

Bukti: daftar berkas terlacak pada baseline serta code.gs:285-350.

Belum ditemukan README, manifest Apps Script, konfigurasi deployment, atau pengujian otomatis. testSubmission dan testBadSignal memanggil doPost yang menulis ke Sheets; testBadSignal juga mengunggah gambar ke Drive.

Dampak: reproduksi konfigurasi dan verifikasi regresi bergantung pada langkah manual. Fungsi tes yang tersedia berisiko mencampurkan data uji dengan data operasional jika dijalankan tanpa isolasi.

## Hal yang sudah baik

- Pemetaan payload ke 18 kolom konsisten; paket ada di kolom terakhir.
- Bagian kondisional dibersihkan ketika pengguna berganti jalur penilaian.
- Kegagalan upload dipisahkan dari penyimpanan jawaban, sehingga jawaban tetap dapat tersimpan.
- ScriptLock menunjukkan perhatian pada akses bersamaan.
- Preview dan penghapusan gambar tersedia; tampilan menggunakan layout yang menyesuaikan lebar layar.

## Verifikasi yang telah dilakukan

- Pemeriksaan sintaks backend melalui node --check: lulus.
- Pemeriksaan sintaks JavaScript frontend melalui node --check: lulus.
- ID HTML duplikat: tidak ditemukan.
- Referensi literal getElementById yang tidak memiliki elemen: tidak ditemukan.
- Working tree Git bersih sebelum dan sesudah analisis awal.

Pemeriksaan sintaks tidak membuktikan kompatibilitas penuh dengan runtime Apps Script atau perilaku di browser.

## Batas analisis

Aplikasi, fungsi tes, endpoint, Sheets, dan Drive tidak dijalankan atau diakses. Tidak dilakukan deployment, uji kiriman, pengukuran beban, atau audit izin akun. Temuan berasal dari kode lokal, bukan hasil pengujian produksi.

Analisis awal tidak mengubah berkas. Pembuatan discovery.md dan improvement.md dilakukan kemudian atas permintaan pengguna; kode aplikasi tetap tidak diubah.