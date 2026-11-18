# Survey Kepuasan JP Smart SIM

Form survei berbahasa Indonesia untuk pelanggan di Jepang. Frontend menggunakan HTML/CSS/JavaScript tanpa proses build. Backend Google Apps Script menyimpan 18 kolom jawaban ke Sheets dan screenshot opsional ke Drive.

Versi 2.0.0 mencakup perbaikan fungsional berdasarkan [discovery.md](discovery.md) dan [improvement.md](improvement.md), dilanjutkan pembaruan komponen UI berdasarkan refecence.html. Implementasi lokal bukan deployment produksi.

## Berkas

| Berkas | Kegunaan |
| --- | --- |
| index.html | Halaman survei aktif; JavaScript dan CSS inline. |
| code.gs | Backend Apps Script V8. |
| appsscript.json | Manifest runtime, zona waktu, dan scope. |
| config/script-properties.example.json | Contoh properti untuk lingkungan uji; tidak memuat ID produksi. |
| archive/index.v1.html, archive/code.v1.gs | Salinan versi awal, sebelum perubahan fungsional. |
| archive/index.v2-functional.html, archive/code.v2-functional.gs | Checkpoint setelah perbaikan fungsional, sebelum redesign. |
| archive/index.v2.1-functional.html, archive/code.v2.1-functional.gs | Checkpoint fungsional terakhir, termasuk guard konfigurasi/versi dan pemeriksaan identitas akses. |
| tests/ | Pengujian backend dengan mock dan browser dengan semua koneksi luar dicegat. |

## Menyiapkan lingkungan uji

1. Gunakan spreadsheet uji, folder Drive uji, serta proyek Apps Script terpisah dari produksi. Jangan menggunakan ID lama dari arsip saat pengujian.
2. Buat folder khusus dengan akses General access: Restricted. Berikan akses hanya ke pemilik dan akun peninjau yang diizinkan; periksa juga folder induk, grup, dan kebijakan organisasi. Aplikasi tidak mengubah izin folder atau unggahan historis.
3. Salin code.gs dan appsscript.json ke editor Apps Script. Isi Script Properties mengikuti config/script-properties.example.json. ENVIRONMENT wajib test atau production; ID spreadsheet dan folder wajib. Tidak ada fallback otomatis ke ID produksi. ENVIRONMENT adalah penanda konfigurasi, bukan pemisah akun atau jaminan bahwa ID benar.
4. UPLOAD_REVIEWER_EMAILS adalah daftar email akun eksplisit yang dipisahkan koma, selain pemilik. Kosong berarti tidak ada peninjau tambahan. Daftar ini hanya memvalidasi akses yang sudah ada; tidak memberikan izin secara otomatis. Grup dan Shared Drive belum didukung oleh pemeriksaan akses konservatif ini.
5. Deploy backend uji sebagai Web App sesuai kebutuhan survei publik, execute as pemilik yang memiliki akses. Tinjau scope spreadsheet dan Drive pada manifest; tidak diperlukan layanan API tambahan.
6. Pada salinan HTML uji, letakkan konfigurasi berikut sebelum script aplikasi, kemudian layani halaman melalui localhost/HTTPS. Pada produksi, isi dengan URL deployment v2 yang sudah diverifikasi:

```html
<script>
window.JP_SURVEY_CONFIG = { gasUrl: 'PASTE_TEST_WEB_APP_URL' };
</script>
```

Tidak ada URL produksi default di index.html. Halaman tanpa konfigurasi tidak mengirim data. Frontend memeriksa GET status active dan versi 2.0.0 sebelum setiap POST; backend v1 diblokir sebelum penulisan. Health check ini tidak membuktikan konfigurasi atau izin Sheets/Drive benar.

## Kontrak data dan respons

Frontend mengirim POST dengan Content-Type text/plain;charset=utf-8 berisi JSON. requestId wajib UUID v4. Field pertanyaan sama dengan v1: nama, whatsapp, lamaUse, paket, domisili, sinyal, autodebet, adaReferral, namaReferral, waReferral, saran, sejakkendala, lokasiKendala, kondisiArea, jamAktivitas, merkHP. Screenshot opsional memakai imageBase64, imageType, dan imageName. Field asing ditolak.

Aturan: nama/tipe HP/nama teman maksimal 120 karakter; alamat dan detail kendala masing-masing 500; saran 2000. Nomor menerima +62 dan +81 dengan spasi/tanda hubung, lalu dinormalisasi. Format lokal Indonesia 08… dan Jepang 070/080/090 dengan 11 digit diterima; gunakan kode negara untuk menghindari ambiguitas nomor lokal. Nomor teman hanya divalidasi bila diisi; field opsional tetap opsional. Cabang yang tidak aktif tidak boleh memuat jawaban.

Screenshot maksimal 5 MiB hasil decode, MIME hanya JPEG, PNG, HEIC/HEIF. Header/signature diperiksa; ini bukan pemindaian malware atau decoder gambar penuh. File SVG/GIF/PDF ditolak. Preview HEIC bergantung dukungan browser; file tetap dapat dipilih.

```json
{
  "success": true,
  "message": "Data berhasil disimpan.",
  "requestId": "UUID_YANG_SAMA_DENGAN_KIRIMAN",
  "warnings": [],
  "duplicate": false
}
```

Frontend hanya mengakui sukses setelah status HTTP berhasil, JSON valid, success boolean true, requestId cocok, dan warnings berupa array string. Warning upload ditampilkan secara permanen bersama hasil sukses jawaban. Timeout/kegagalan jaringan/non-JSON berarti hasil belum pasti; retry tanpa mengubah isian menggunakan ID yang sama. Tidak ada pengiriman otomatis di latar belakang. sessionStorage hanya menyimpan requestId dan hash, bukan jawaban atau gambar.

Kegagalan backend memberikan success false, message aman, code, requestId jika sudah valid, dan warnings. Apps Script ContentService tidak menyediakan kontrol status HTTP khusus di implementasi ini; kode aplikasi diperiksa di JSON. Error internal dan data responden tidak dimasukkan ke log.

## Schema dan pemulihan retry

Urutan 18 kolom tetap: Timestamp; Nama Lengkap; No. WhatsApp; Lama Penggunaan; Domisili / Wilayah; Kualitas Sinyal; Tertarik Autodebet; Ada Referral; Nama Referral; WA Referral; Saran; Sejak Kapan Kendala; Lokasi Kendala; Kondisi Area; Jam / Aktivitas Kendala; Merk & Tipe HP; Link Screenshot Speedtest; Paket saat ini.

Sheet kosong dibuat headernya. Satu-satunya schema lama yang dikenali adalah 17 kolom pertama yang persis sesuai; kolom paket ditambahkan di ujung. Mismatch lainnya ditolak tanpa mengganti judul atau memindahkan data lama.

Tab ledger _JP_SURVEY_REQUESTS_V2 menyimpan requestId, hash payload, nomor baris reservasi, status, ID file, warning, timestamp, dan ID tab jawaban. Ledger tidak menyimpan salinan jawaban atau base64. Setiap ID terikat pada satu hash dan satu baris. Nama file memakai requestId; retry menemukan file yang sama bila respons pembuatan file hilang. Catatan pada sel Timestamp menandai pemilik reservasi sebelum penulisan. Retry setelah penulisan berhasil dapat menyelesaikan ledger tanpa append kedua.

Jangan mengurutkan, menghapus, menyisipkan, atau memindahkan baris pada tab jawaban/ledger selama kiriman aktif. Jangan menghapus catatan reservasi. Gunakan filter view atau salinan untuk analisis. Penulis lain tidak mengikuti ScriptLock aplikasi; konflik baris ditolak untuk mencegah penimpaan. Backup kedua tab sebelum migrasi atau perbaikan manual. Deduplikasi berlaku selama ledger dipertahankan; tidak ada penghapusan otomatis ledger maupun screenshot.

Saat STORAGE_UNCERTAIN: retry dengan payload sama. Saat ROW_CONFLICT/LEDGER_INVALID/SCHEMA_MISMATCH: hentikan perubahan manual, backup kedua tab, cocokkan requestId, hash, note Timestamp, baris, dan file; perbaiki pemetaan sebelum retry. Jangan menghapus ledger untuk memaksa pengiriman. Tidak ada klaim transaksi tunggal atau exactly-once lintas Drive/Sheets; kegagalan parsial diuji dengan fault injection dan tetap membutuhkan pemeriksaan integrasi Google.

Jika folder sudah diketahui tidak sesuai akses sebelum upload, jawaban dapat tersimpan tanpa file dan warnings menjelaskan kegagalan. Jika hasil createFile atau pemeriksaan file belum dapat dipastikan, aplikasi tidak mengklaim sukses; retry merekonsiliasi file dengan nama deterministik.

## Antispam, kinerja, dan privasi

Pembatasan best-effort: maksimal 30 kiriman baru per bucket satu menit secara global, dan 3 per nomor ternormalisasi per bucket sepuluh menit. Pemeriksaan dan increment di bawah ScriptLock; retry ID yang sudah tercatat tidak memakan jatah baru. Cache dapat dievikt dan bucket dapat menghasilkan lonjakan pada batas waktu. Nomor dapat dipalsukan: ini bukan autentikasi atau perlindungan bot terdistribusi. Challenge eksternal tidak ditambahkan; tinjau jika volume penyalahgunaan memerlukannya.

Parsing, validasi, decode, dan hashing dilakukan sebelum lock. Upload dan commit tetap dikunci untuk mencegah dua eksekusi menciptakan efek samping bersamaan. Log hanya berisi kode dan durasi validasi/tunggu/upload/lock. Tes menggunakan durasi mock untuk membuktikan batas lock; throughput produksi belum diukur. Jangan mengartikan pengujian mock sebagai benchmark Google.

Tidak ada panggilan ANYONE_WITH_LINK. Folder dan berkas harus memiliki akses PRIVATE serta daftar pengguna yang sesuai konfigurasi. Pemeriksaan Apps Script ini tidak menggantikan audit izin efektif, pewarisan folder, grup, atau kebijakan organisasi. Verifikasi akses anonim dan akun peninjau pada lingkungan uji sebelum deployment. Akun pemilik dan admin platform tetap memiliki akses sesuai kebijakan akun. Tentukan kebijakan retensi dengan pengelola sebelum menghapus data; aplikasi tidak mengarang jadwal retensi dan tidak mengubah izin historis.

## Pengujian lokal

Node.js dibutuhkan untuk tests, bukan untuk menjalankan halaman. Backend mock memakai modul bawaan Node, tanpa akun atau jaringan Google:

```powershell
node tests/check.cjs
node --test tests/backend.test.cjs
```

Pengujian browser memakai dependency pengembangan Puppeteer dan Chrome lokal:

```powershell
npm install
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test tests/browser.test.cjs
```

Jika Chrome ada di lokasi lain, sesuaikan CHROME_PATH. Browser tests membuat server hanya pada 127.0.0.1 dengan port sementara dan memblokir koneksi di luar origin uji selain respons Apps Script yang dimock. Tidak ada POST ke Google. Perbandingan pertanyaan menggunakan archive/index.v1.html; jangan mengubah baseline agar tes lulus. Aktifkan SURVEY_SCREENSHOTS=1 untuk menyimpan tampilan uji ke verification/.

Integrasi uji manual: jalur positif/negatif; gambar dan tanpa gambar; akses anonim ditolak; akun reviewer dapat membuka; upload gagal menunjukkan warning; retry requestId sama; dua kiriman serentak; schema tidak sesuai tidak ditimpa; tampilan ponsel, keyboard, dan Safari/iOS. Kriteria ini belum otomatis terbukti oleh mock.

## Deployment dan rollback

1. Backup Sheets, ledger, konfigurasi, dan versi deployment saat ini; selesaikan checklist integrasi di atas.
2. Pasang konfigurasi produksi secara eksplisit setelah ID dan izin diverifikasi. Gunakan folder khusus yang sudah restricted, bukan mengubah folder historis secara otomatis.
3. Publikasikan versi backend yang kompatibel dengan kontrak v2, lalu frontend v2 dalam jendela pemeliharaan. Frontend lama tidak mengirim requestId dan akan ditolak backend baru; jangan mencampur pasangan versi saat layanan dibuka.
4. Verifikasi satu kiriman yang memang diizinkan pada lingkungan tujuan; jangan menjalankan fungsi testSubmission/testBadSignal dari arsip pada produksi.
5. Jika rollback diperlukan, arahkan deployment ke pasangan frontend/backend v1 dari arsip atau versi deployment lama. V1 mengandung risiko yang dicatat discovery.md, termasuk pembagian tautan publik; hentikan penerimaan sementara bila risiko itu tidak dapat diterima.

Rollback kode tidak boleh menghapus jawaban, ledger, atau berkas. Catat rentang waktu versi aktif dan tinjau kiriman yang hasilnya belum pasti sebelum menerima ulang.

## Referensi implementasi

- [Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Drive Folder dan akses](https://developers.google.com/apps-script/reference/drive/folder)
- [Spreadsheet Range dan catatan sel](https://developers.google.com/apps-script/reference/spreadsheet/range)
- [Apps Script manifest](https://developers.google.com/apps-script/manifest)
