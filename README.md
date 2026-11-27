# Tuntutan Oncall – Jabatan Radiologi HCTM

Aplikasi web kalkulator dan penjana Borang Tuntutan Elaun Kerja Lebih Masa (`HCTM/JKIK/KEW/B05`).

## Struktur Fail
- `index.html` – Struktur halaman utama (ringan)
- `style.css` – Penggayaan antaramuka
- `core.js` – Logik kadar (A–E), pecahan slot waktu, susun atur borang & pemprosesan `.docx`
- `app.js` – Interaksi UI, kalendar, kalkulator gaji, sandaran data & janaan Word/PDF
- `template.json` – Templat borang Word B05 (dimuat turun automatik bila menjana `.docx`)
- `pdfbg.json` – Latar belakang borang PDF A4 (dimuat turun automatik bila menjana `.pdf`)
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` – Konfigurasi PWA & ikon aplikasi
