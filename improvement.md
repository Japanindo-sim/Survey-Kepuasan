# Improvement Plan: Survey Kepuasan JP Smart SIM

Tanggal: 18 November 2026  
Sumber: [discovery.md](discovery.md)  
Status: implementasi lokal selesai; integrasi Google dan deployment belum dilakukan.

## Status implementasi

Perbaikan fungsional diselesaikan dan diverifikasi sebelum redesign. Checkpoint awal tersedia pada archive/index.v2-functional.html dan archive/code.v2-functional.gs; koreksi akhir konfigurasi/akses disimpan pada archive/index.v2.1-functional.html dan archive/code.v2.1-functional.gs sebelum komponen desain diterapkan kembali. Versi awal tetap tersimpan pada archive/index.v1.html dan archive/code.v1.gs.

| Pekerjaan | Hasil lokal | Batas verifikasi |
| --- | --- | --- |
| T01 | Respons sukses wajib valid dan cocok dengan requestId; timeout/error tidak dianggap sukses; warning upload ditampilkan; versi backend diperiksa sebelum POST. | Respons layanan Google nyata belum diuji. |
| T02 | Validasi server/browser, batas teks/gambar, normalisasi nomor, signature gambar, dan rate limit cache diterapkan. | Antispam best-effort, bukan autentikasi; challenge eksternal tidak ditambahkan. |
| T03 | Pembukaan tautan publik dihapus; folder/berkas dan reviewer diperiksa; informasi privasi diperjelas. | Izin efektif, akses anonim, reviewer, dan kebijakan retensi perlu verifikasi pengelola. Tidak ada izin historis yang diubah. |
| T04 | Submit diblokir saat membaca gambar; penggantian/penghapusan membersihkan state dan menolak callback lama. | Perilaku Safari/iOS dan preview HEIC perlu uji perangkat. |
| T05 | Ledger persisten, hash, reservasi baris, note penanda, serta nama file deterministik memungkinkan pemulihan retry. | Bukan transaksi lintas layanan; rekonsiliasi nyata dan konkurensi Google perlu uji integrasi. |
| T06 | Schema tidak dikenal ditolak; schema kosong dan versi 17 kolom yang dikenal ditangani tanpa merelabel data lama. | Tidak ada migrasi data produksi yang dijalankan. |
| T07 | Validasi/decode/hash di luar lock; lock dilepas lewat finally; log durasi tanpa PII ditambahkan. | Upload tetap di dalam lock untuk menjaga rekonsiliasi. Hanya batas lock pada mock yang diukur; kapasitas produksi belum diukur. |
| T08 | Progress mulai 0% dan mengikuti field wajib pada jalur aktif. | Diuji pada browser lokal. |
| T09 | README, manifest V8, contoh properti uji, tes backend/browser, serta prosedur rollback tersedia. URL frontend dan Script Properties wajib dikonfigurasi eksplisit. | Lingkungan Apps Script uji nyata belum disiapkan pada akun Google. |

Redesign memakai komponen dari refecence.html dengan CSS biasa. Pemeriksaan browser membandingkan pertanyaan, catatan, urutan kontrol, opsi, dan nilai dengan arsip v1. Rincian verifikasi dan hal yang belum diuji dicatat dalam [verification/final.md](verification/final.md).

Checkbox pada rincian rencana di bawah dipertahankan sebagai checklist penerimaan, bukan pernyataan bahwa uji produksi sudah dilakukan. Gunakan tabel status ini untuk hasil implementasi aktual.

## Tujuan dan batas pekerjaan

Meningkatkan kepastian penyimpanan survei, kualitas data, privasi unggahan, ketahanan percobaan ulang, dan kemudahan pemeliharaan.

Rencana mempertahankan HTML/JavaScript dan Google Apps Script. Urutan 18 kolom serta data historis dipertahankan. Tidak direncanakan migrasi framework atau perubahan desain menyeluruh.

Implementasi dibatasi pada berkas proyek dan pengujian lokal. Perubahan data Google, izin Drive aktual, migrasi produksi, serta deployment belum dilakukan.

## Prioritas dan urutan

| Tahap | Pekerjaan | Temuan |
| --- | --- | --- |
| 1 | T01: respons penyimpanan yang tegas | D01 |
| 1 | T02: validasi payload dan nomor | D02, D09 |
| 1 | T03: pengamanan akses unggahan | D03 |
| 2 | T04: state pembacaan berkas | D04 |
| 2 | T05: idempotensi kiriman | D05 |
| 2 | T06: perlindungan schema spreadsheet | D06 |
| 3 | T07: pengukuran antrean dan pengurangan durasi lock | D07 |
| 3 | T08: progress sesuai jalur form | D08 |
| 3 | T09: dokumentasi dan verifikasi terisolasi | D10 |

T01-T03 mengatasi risiko tertinggi. T05 menjadi prasyarat sebelum mempersempit lock pada T07. Verifikasi setiap tahap dilakukan sebelum melanjutkan tahap berikutnya.

## T01 — Pastikan pesan sukses berasal dari hasil penyimpanan

Rujukan: D01.  
Berkas: index.html, code.gs.  
Dependensi: tidak ada.  
Ukuran: kecil.

Rencana:
- Hapus fallback yang menganggap respons non-JSON sebagai sukses.
- Periksa status HTTP dan struktur respons; sukses hanya jika backend secara eksplisit mengonfirmasi penyimpanan jawaban.
- Pertahankan field success dan message untuk kompatibilitas. Bedakan kegagalan pasti dari hasil yang belum dapat dipastikan akibat gangguan respons. Beri peringatan terpisah jika jawaban tersimpan tetapi upload gagal.
- Tambahkan batas waktu permintaan; jelaskan bahwa timeout tidak membuktikan server membatalkan penyimpanan.

Kriteria penerimaan:
- [ ] Respons HTML, JSON rusak, HTTP gagal, atau success yang bukan boolean true tidak menampilkan kartu sukses.
- [ ] Kegagalan mempertahankan isian pengguna dan mengembalikan kontrol form.
- [ ] Upload gagal tidak disamarkan sebagai upload berhasil; hasil penyimpanan jawaban tetap jelas.

Verifikasi: simulasi respons sukses, gagal, non-JSON, struktur tidak sesuai, dan timeout tanpa menghubungi endpoint produksi.

## T02 — Validasi data sebelum akses Drive atau Sheets

Rujukan: D02, D09.  
Berkas: code.gs, index.html.  
Dependensi: T01.  
Ukuran: kecil hingga menengah.

Rencana:
- Tetapkan kontrak field: payload harus objek, tipe harus benar, field dasar wajib, nilai pilihan harus sesuai opsi, dan detail kendala wajib hanya pada jalur negatif.
- Batasi panjang teks dan ukuran payload. Terapkan batas gambar 5 MB pada hasil decode, allowlist MIME, serta pemeriksaan kesesuaian konten berkas; jangan hanya mempercayai imageType.
- Normalisasi nomor WhatsApp Indonesia/Jepang dengan aturan yang menerima format tampilan wajar, lalu selaraskan validasi browser dan backend.
- Evaluasi antispam yang cocok untuk endpoint publik, termasuk pembatasan frekuensi dan challenge yang diverifikasi server bila diperlukan. Jangan menggunakan token rahasia yang ditanam di HTML publik sebagai autentikasi.

Kriteria penerimaan:
- [ ] Payload kosong, tipe salah, opsi tidak dikenal, teks melampaui batas, dan berkas tidak sesuai ditolak sebelum ada penulisan.
- [ ] Kedua jalur survei yang valid tetap diterima; aturan nomor menerima contoh format +62 dan +81 pada form.
- [ ] Strategi antispam mendokumentasikan mekanisme, batas, dan keterbatasannya; pengujian dilakukan pada lingkungan terisolasi.

Verifikasi: uji tabel kasus valid/tidak valid memakai mock layanan; pastikan tidak ada pemanggilan penulisan untuk input ditolak.

## T03 — Batasi akses screenshot dan perjelas informasi privasi

Rujukan: D03.  
Berkas: code.gs, index.html.  
Dependensi: T01.  
Ukuran: kecil.

Rencana:
- Usulkan akses terbatas kepada tim berwenang sebagai default; hentikan pembukaan ANYONE_WITH_LINK secara otomatis pada unggahan baru.
- Periksa juga izin folder induk di lingkungan uji, karena izin efektif berkas tidak dapat disimpulkan hanya dari kode.
- Sesuaikan keterangan halaman dengan tujuan pengumpulan, pihak yang dapat mengakses, dan kebijakan retensi yang disepakati.
- Pisahkan peninjauan unggahan lama sebagai pekerjaan tersendiri; jangan mengubah izin massal secara otomatis.

Kriteria penerimaan:
- [ ] Pengguna yang berwenang dapat membuka screenshot uji, sedangkan akses anonim ditolak.
- [ ] Keterangan privasi sesuai dengan pengaturan akses efektif dan kebijakan yang disepakati.
- [ ] Kegagalan upload atau pengaturan akses memberikan hasil yang jelas tanpa klaim kerahasiaan yang tidak terverifikasi.

Verifikasi: akun penguji berwenang dan sesi anonim pada folder serta deployment uji, setelah tersedia kewenangan untuk pengujian tersebut.

Checkpoint tahap 1: respons sukses tidak lagi ambigu, validasi server menolak input tidak sesuai, dan kebijakan akses unggahan teruji.

## T04 — Kelola state unggahan secara eksplisit

Rujukan: D04.  
Berkas: index.html.  
Dependensi: T01, T02.  
Ukuran: kecil.

Rencana:
- Gunakan state kosong, membaca, siap, dan gagal; blokir submit selama pembacaan aktif.
- Bersihkan base64, nama, MIME, dan preview saat penggantian berkas dimulai atau berkas ditolak.
- Abaikan callback pembacaan lama dengan identitas pembacaan atau pembatalan, termasuk ketika gambar dihapus atau jalur sinyal diganti.

Kriteria penerimaan:
- [ ] Berkas lama tidak terkirim setelah pilihan penggantinya ditolak.
- [ ] Submit menunggu pembacaan selesai.
- [ ] Ganti cepat, hapus, dan pergantian jalur tidak menghidupkan kembali gambar lama.

Verifikasi: uji interaksi dengan FileReader yang sengaja diperlambat dan beberapa pilihan berkas berturut-turut.

## T05 — Jadikan percobaan ulang idempoten

Rujukan: D05.  
Berkas: index.html, code.gs; pengujian baru sesuai kebutuhan.  
Dependensi: T01, T02, T04.  
Ukuran: menengah.

Rencana:
- Berikan requestId pada satu kiriman logis dan gunakan kembali untuk retry dengan payload yang sama; perubahan payload menjadi kiriman baru.
- Simpan requestId dan hasil secara persisten di backend; jangan bergantung hanya pada cache sementara.
- Pertahankan 18 kolom utama melalui ledger terpisah atau usulan perubahan schema yang eksplisit. Pemeriksaan duplikat dan commit perlu sinkronisasi.
- Rancang pemulihan untuk kegagalan di antara upload, append baris, dan penyimpanan ledger. Hubungkan requestId dengan hasil upload dan bukti baris tersimpan agar retry dapat direkonsiliasi.
- Jelaskan bahwa operasi Drive dan Sheets bukan satu transaksi; jangan mengklaim exactly-once sebelum skenario kegagalan parsial teruji.

Kriteria penerimaan:
- [ ] Retry setelah respons hilang tidak menambah baris atau file kedua.
- [ ] Dua request serentak dengan requestId sama menghasilkan satu hasil tersimpan; ID sama dengan isi berbeda ditolak.
- [ ] Kegagalan pada setiap batas operasi dapat dipulihkan atau direkonsiliasi tanpa sukses palsu.

Verifikasi: uji request serentak dan injeksi kegagalan setelah upload, setelah append, dan sebelum respons, menggunakan layanan tiruan serta lingkungan uji.

## T06 — Cegah perubahan header yang merusak makna data

Rujukan: D06.  
Berkas: code.gs; fixture schema untuk pengujian bila diperlukan.  
Dependensi: T01, T02.  
Ukuran: kecil.

Rencana:
- Bedakan sheet kosong, schema sesuai, penambahan kolom di akhir yang dikenali, dan schema tidak dikenal.
- Tetap buat header pada sheet kosong. Pada mismatch yang tidak dikenal, hentikan penulisan dengan pesan operasional; jangan menimpa header.
- Jadikan migrasi schema tindakan terpisah dengan backup, pemetaan kolom, dan verifikasi data historis.

Kriteria penerimaan:
- [ ] Sheet kosong dan schema yang sesuai tetap dapat menerima data.
- [ ] Kolom dipindah, hilang, atau header tidak dikenal tidak diubah otomatis dan tidak menerima penulisan yang salah.
- [ ] Penambahan kolom akhir yang didukung tidak menggeser 18 kolom historis.

Verifikasi: fixture sheet kosong, schema normal, schema lama yang dikenali, dan kolom tertukar; bandingkan data sebelum/sesudah.

Checkpoint tahap 2: state unggahan aman, retry dapat direkonsiliasi, dan mismatch schema tidak mengubah data historis.

## T07 — Ukur dan kurangi antrean secara aman

Rujukan: D07.  
Berkas: code.gs.  
Dependensi: T02, T05, T06.  
Ukuran: kecil hingga menengah.

Rencana:
- Ukur waktu validasi, tunggu lock, upload, dan penulisan di lingkungan uji.
- Pindahkan validasi yang tidak membutuhkan state bersama ke luar lock.
- Evaluasi pemisahan upload dari bagian yang dikunci setelah reservasi requestId dan pemulihan kegagalan tersedia.
- Pertahankan sinkronisasi untuk ledger, pemeriksaan schema, dan commit. Lepaskan lock melalui finally sesuai kepemilikan lock.

Kriteria penerimaan:
- [ ] Durasi lock sebelum/sesudah tercatat pada skenario uji yang sama.
- [ ] Tidak ada duplikat, header tertimpa, atau file tanpa rekonsiliasi akibat perubahan urutan.
- [ ] Perilaku timeout lock dan target kapasitas ditetapkan dari pengukuran, bukan asumsi.

Verifikasi: simulasi beberapa kiriman dengan upload lambat; bandingkan waktu tunggu, hasil data, dan pemulihan kegagalan.

## T08 — Selaraskan progress dengan validasi aktif

Rujukan: D08.  
Berkas: index.html.  
Dependensi: T02, T04.  
Ukuran: kecil.

Rencana: hitung kemajuan berdasarkan field wajib pada jalur aktif, mulai dari 0%, dan perbarui ketika isian atau pilihan sinyal berubah. Field opsional tidak menghalangi selesai.

Kriteria penerimaan:
- [ ] Form kosong menunjukkan 0%.
- [ ] Jalur negatif tidak menunjukkan 100% sebelum seluruh detail wajib valid.
- [ ] Perubahan jalur menghitung ulang progress secara konsisten.

Verifikasi: pemeriksaan manual kedua jalur, termasuk pergantian pilihan dan isian tidak valid.

## T09 — Dokumentasikan konfigurasi dan pisahkan pengujian

Rujukan: D10.  
Berkas: README.md, dokumentasi/config contoh, dan pengujian seperlunya.  
Dependensi: mengikuti hasil T01-T08; dokumentasi awal dapat disiapkan lebih dulu.  
Ukuran: menengah.

Rencana:
- Tulis panduan arsitektur, konfigurasi, schema, kontrak respons, deployment manual, verifikasi, dan rollback.
- Siapkan manifest Apps Script serta konfigurasi nonproduksi yang dapat direproduksi setelah runtime dan scope dikonfirmasi.
- Pisahkan ID spreadsheet/folder dan URL uji dari produksi; jelaskan bahwa fungsi tes lama menulis data.
- Tambahkan pengujian perilaku untuk respons, validasi, unggahan, retry, dan schema dengan mock, serta checklist integrasi pada layanan uji.
- Tambahkan pemeriksaan sintaks sederhana tanpa memperkenalkan proses build yang tidak diperlukan.

Kriteria penerimaan:
- [ ] Pengembang dapat menyiapkan lingkungan uji dari dokumentasi tanpa menebak konfigurasi.
- [ ] Pengujian lokal tidak mengakses atau menulis layanan Google produksi.
- [ ] Prosedur verifikasi dan rollback sesuai dengan implementasi akhir.

Verifikasi: ikuti README pada lingkungan uji baru dan jalankan pemeriksaan yang terdokumentasi.

Checkpoint akhir: seluruh kriteria yang relevan lulus, perubahan ditinjau, dan hasil pengujian dicatat. Deployment produksi merupakan pekerjaan lanjutan tersendiri.

## Keputusan yang perlu ditetapkan sebelum implementasi terkait

- Tim/akun yang boleh melihat screenshot, kebijakan retensi, dan penanganan unggahan lama untuk T03.
- Batas panjang field, format nomor yang didukung, dan volume kiriman yang diharapkan untuk T02/T07.
- Strategi antispam sesuai kemampuan Apps Script dan layanan tambahan yang boleh digunakan untuk T02.
- Penyimpanan ledger, jangka waktu deduplikasi, dan mekanisme rekonsiliasi untuk T05.
- Ketersediaan spreadsheet, folder, dan deployment uji untuk verifikasi integrasi.

Default implementasi dan batasnya dicatat pada README.md. Akun reviewer, retensi, lingkungan integrasi nyata, dan target kapasitas tetap harus ditetapkan sebelum penggunaan produksi.

## Risiko dan mitigasi

| Risiko | Mitigasi yang direncanakan |
| --- | --- |
| Akses tim terputus setelah privasi diperketat | Uji izin efektif folder dan berkas dengan akun berwenang sebelum perubahan produksi. |
| Validasi terlalu ketat menolak data sah | Gunakan contoh nyata yang sudah dianonimkan, termasuk nomor Indonesia/Jepang dan tulisan Jepang. |
| Lock dipersempit terlalu awal | Selesaikan idempotensi dan rekonsiliasi terlebih dahulu. |
| Schema berubah dan data historis salah label | Tolak mismatch tidak dikenal; lakukan migrasi terpisah dengan backup. |
| Data uji masuk ke produksi | Gunakan konfigurasi uji terpisah dan mock sebagai default. |
| Drive dan Sheets hanya berhasil sebagian | Catat fase operasi dan requestId, uji kegagalan parsial, serta sediakan rekonsiliasi. |

## Definisi selesai untuk implementasi mendatang

- [ ] Pesan sukses hanya muncul setelah konfirmasi penyimpanan valid.
- [ ] Input tidak sesuai ditolak sebelum penulisan.
- [ ] Akses screenshot sesuai kebijakan yang telah diuji.
- [ ] Retry dan kegagalan parsial ditangani tanpa duplikasi yang tidak terdeteksi.
- [ ] Schema dan data historis terlindungi.
- [ ] Unggahan dan progress konsisten dengan state form.
- [ ] Dokumentasi serta verifikasi dapat diulang pada lingkungan uji.

Status implementasi lokal ada pada tabel di awal dokumen. Checkbox yang bergantung pada izin efektif, integrasi, atau kapasitas Google belum dapat dinyatakan terpenuhi oleh pengujian mock. Data Google, izin Drive aktual, dan deployment tidak diubah.
