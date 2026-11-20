# Checklist Sutradara — Horor Pendek Studio Clip

Ditulis sendiri untuk Studio Clip (bukan salinan panduan pihak lain). Dipakai di tiga tempat:
prompt penulis (`praproduksi.py` tahap 5, 6a, 6b, 7b), prompt editor (tahap 7), dan pemeriksa otomatis (`cek_mesin`).
Tanda **[otomatis]** = dicek kode tanpa AI; pelanggarannya memotong nilai naskah.

## A. Cerita
1. **Hook 3 detik.** Kalimat pertama paling banyak 10 kata dan langsung berisi larangan, ancaman, atau kejanggalan yang konkret. Dilarang membuka dengan pengantar ("Pada suatu malam", "Halo", "Cerita ini"). **[otomatis]**
2. **Satu informasi baru per adegan.** Tiap adegan harus menambah sesuatu: petunjuk, bahaya, atau keputusan tokoh. Adegan yang hanya mengulang suasana dibuang.
3. **Tunjukkan, jangan jelaskan.** Jangan menyebut perasaan secara umum ("seram", "menakutkan", "suasana horor", "merinding"). Ganti dengan bunyi, benda, atau tindakan ("Tok. Tok." / "Senternya mati."). **[otomatis]**
4. **Jangan mengulang ancaman yang sama.** Frasa yang sama (mis. "lampu berkedip") paling banyak dua kali. Ketegangan naik lewat hal baru, bukan pengulangan. **[otomatis]**
5. **Sebab-akibat.** Tiap kejadian dipicu kejadian atau keputusan sebelumnya ("karena itu..."), bukan "lalu... lalu...".
6. **Twist ditunjukkan, bukan diterangkan.** Satu-dua kalimat yang membalik makna cerita. Paling kuat kalau berupa satu kalimat dialog yang mudah diingat.
7. **Penutup bertanya spesifik.** Pertanyaannya terkait isi cerita ("Kamu kasih bintang berapa?"), bukan "gimana menurut kalian?".
8. **Kata teknis dilarang di narasi:** jumpscare, scene, adegan, shot, sfx, twist, pov, glitch. **[otomatis]**

## B. Ritme & suara
9. **Hening sebelum klimaks.** Adegan tepat sebelum twist harus punya jeda "..." dan efek suaranya tenang (none / heartbeat / breath / drip), supaya hentakan twist terasa. **[otomatis]**
10. **Suara mendahului gambar (J-cut).** Efek suara pembuka adegan mulai sepersekian detik sebelum gambar berganti. Ini dikerjakan mesin (`horor_video.py`), penulis tidak perlu mengaturnya.
11. **Kalimat pendek tapi utuh.** Enak dibacakan, bukan gaya telegram.

## C. Kamera & visual
12. **Makhluk ditahan sampai twist.** Sebelum twist makhluk hanya boleh samar (jauh/lewat) atau tidak terlihat. Wujud jelas (dekat/depan) hanya di twist dan sesudahnya. **[otomatis]**
13. **Variasi shot.** Minimal tiga jenis shot dalam satu video, dan shot yang sama tidak dipakai tiga kali berturut-turut. Twist memakai shot dekat atau pov. **[otomatis]**
14. **Tiap shot punya alasan.** Setiap adegan menulis `alasan_shot`, yaitu kenapa shot itu dipilih (mis. "pov: penonton ikut terjebak"). Kalau kosong, adegannya ditolak. **[otomatis]**
15. **Visual sesuai kalimat.** Yang diucapkan narator terlihat di layar pada saat yang sama.

## D. Format panjang (8–10 menit, `--format panjang`)
16. **Dibagi 5–6 bab.** Tiap bab sekitar 1,5–2 menit, punya klimaks kecil, dan diakhiri kait supaya penonton lanjut. **[otomatis: bab tanpa klimaks]**
17. **Ketegangan paling lambat tiap ~90 detik** (sekitar 140 kata) lewat kejadian, makhluk, atau klimaks bab. **[otomatis]**
18. **Titik tengah membalik keadaan.** Wujud jelas makhluk baru boleh di klimaks bab sesudah titik tengah, lalu di twist. **[otomatis]**
19. **Twist di 15% terakhir**, dan ajakan komentar hanya di adegan terakhir. **[otomatis]**
20. **Batas pengulangan ikut panjang naskah**, dan kembali ke lokasi lama boleh kalau ada alasan cerita.
