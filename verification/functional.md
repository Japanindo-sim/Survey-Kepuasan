# Functional checkpoint — 18 November 2026

Tahap fungsional diselesaikan sebelum perubahan desain. Backend: 21/21 tes lulus. Browser: 17/17 tes lulus, memakai Puppeteer 25.1.0 dan Chrome lokal. Pengujian tidak mengirim data ke Google.

Yang diperiksa: kontrak 18 kolom; validasi tipe, opsi, panjang, nomor dan signature gambar; batas ukuran; pemulihan retry pada tujuh titik kegagalan; konflik baris; schema 17/18 kolom; akses folder; antispam; lock; respons rusak/HTTP gagal/timeout; state FileReader; reset cabang; kesamaan teks, urutan dan opsi pertanyaan dengan v1.

Durasi lock pada mock: validasi/hash 25 ms di luar lock, pekerjaan dalam lock 525 ms termasuk upload mock 500 ms. Batas sebelumnya mencakup tambahan 25 ms tersebut. Ini pengujian batas kritis deterministik, bukan hasil benchmark Apps Script. Upload tetap di dalam lock untuk menjaga rekonsiliasi.

Keterbatasan: tes konkurensi menirukan penolakan saat lock sedang dimiliki, bukan dua proses Google sesungguhnya. Izin efektif Drive, akses anonim/reviewer, throughput, Safari/iOS, serta deployment belum diuji. Checklist integrasi ada pada README.md.

Arsip checkpoint: archive/index.v2-functional.html dan archive/code.v2-functional.gs. Arsip v1 adalah salinan byte-identik sebelum perubahan.
