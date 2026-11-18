# Verifikasi akhir — 18 November 2026

## Urutan pengerjaan

1. Arsip v1 disalin dari berkas awal dan diverifikasi SHA-256.
2. Perbaikan fungsional dikerjakan dan diuji: 21 tes backend dan 17 tes browser lulus sebelum redesign.
3. Checkpoint v2-functional disimpan ke proyek.
4. Komponen UI refecence.html diadaptasi ke index.html. Berkas referensi tidak diubah; pertanyaan tidak diambil dari referensi.
5. Verifikasi akhir menambahkan round trip browser ke kode Apps Script dengan layanan Google tiruan dan pemulihan respons yang hilang.

## Pemeriksaan

Hasil akhir: 22/22 tes backend dan 22/22 tes browser lulus (44 tes). Pemeriksaan browser mencakup guard konfigurasi/versi sebelum POST, selain skenario di bawah. Pemeriksaan sintaks, manifest, dan referensi DOM juga lulus.

- Sintaks code.gs dan script inline index.html; manifest JSON; ID HTML dan referensi literal DOM.
- Backend: kontrak 18 kolom, validasi input, ukuran gambar, nomor Indonesia/Jepang, teks literal pada Sheets, schema, privasi, rate limit, lock, serta pemulihan pada tujuh titik kegagalan.
- Browser: isi/catatan pertanyaan, urutan kontrol, opsi dropdown, nilai radio, cabang penilaian, referral, error, timeout, acknowledgment, persistensi ID retry, state FileReader, dan peringatan upload.
- Round trip: form positif dan negatif melalui fungsi doPost aktual dengan mock Sheets/Drive, termasuk respons hilang setelah commit dan retry tanpa baris/file kedua.
- Responsif: 320, 390, 768, 1024, dan 1440 piksel tanpa overflow horizontal pada jalur kendala.
- Keyboard: pilihan sinyal menerima fokus yang terlihat, Space dan ArrowRight mengubah pilihan dan cabang.
- Screenshot mobile dan desktop diperiksa secara visual; lihat survey-mobile.png dan survey-desktop.png.
- JavaScript fungsional pada index.html identik dengan checkpoint v2.1-functional setelah komponen desain diterapkan kembali. Review akhir menambahkan guard versi sebelum POST dan penolakan upload jika pemilik atau identitas kolaborator tidak dapat dikenali; pertanyaan, schema, dan field payload tetap sama.

## Lingkungan dan isolasi

Tes backend memakai node:test, vm, dan mock layanan, tanpa jaringan. Tes browser memakai Puppeteer 25.1.0, Chrome headless, server 127.0.0.1, dan intersepsi semua permintaan. Respons Apps Script disimulasikan; permintaan luar lain diblokir. Tidak ada POST ke Google produksi.

## Hal yang belum diverifikasi

- Izin efektif Drive pada folder induk, grup, dan kebijakan organisasi; akses anonim dan akun reviewer nyata.
- Deployment Apps Script, konfigurasi Script Properties nyata, serta penulisan Sheets/Drive pada akun Google.
- Throughput/kuota Google dan dua proses Apps Script bersamaan; tes lock menggunakan simulasi.
- Safari/iOS, pembaca layar pada perangkat, dan preview HEIC lintas browser. Pemeriksaan keyboard/semantik bukan sertifikasi aksesibilitas penuh.
- Kebijakan retensi dan penanganan screenshot historis; tidak ada penghapusan data atau perubahan izin massal.

README.md memuat konfigurasi dan checklist integrasi. URL backend harus dikonfigurasi eksplisit. Pasangan frontend/backend v2 harus dipasang bersama; frontend v2 memeriksa versi backend sebelum POST dan menolak respons penyimpanan yang tidak memiliki requestId dan warnings.
