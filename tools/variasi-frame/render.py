"""Render 5 variasi frame dari 2 aset mentah.
Pemakaian: python render.py <out_dir> [--test]
--test  : sumber diganti pola uji (testsrc2) agar tata letak bisa diperiksa tanpa melihat footage asli.
"""
import json, os, subprocess, sys, tempfile

SRC = [r"E:\ASSET MENTAH\trending (1).mp4", r"E:\ASSET MENTAH\trending (2).mp4"]
SRC_DUR = [62.766, 12.42]
OUT = sys.argv[1]
TEST = '--test' in sys.argv
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix='var_')

F = {k: 'C\\:/Windows/Fonts/%s.ttf' % v for k, v in dict(
    impact='impact', arial='arialbd', segoe='seguibl', bahn='bahnschrift', trebuc='trebucbd', georgia='georgiab').items()}


def txt(name, s):
    p = os.path.join(TMP, name + '.txt')
    open(p, 'w', encoding='utf-8').write(s)
    return p.replace('\\', '/').replace(':', '\\:')


def draw(name, s, font, size, color, x, y, extra=''):
    return (f"drawtext=fontfile='{F[font]}':textfile='{txt(name, s)}':fontsize={size}:fontcolor={color}"
            f":x={x}:y={y}{(':' + extra) if extra else ''}")


def inp(src, start, dur):
    if TEST:
        return ['-f', 'lavfi', '-i', f'testsrc2=s=576x1024:r=30:d={dur}',
                '-f', 'lavfi', '-i', f'sine=f={440 + 110 * src}:d={dur}']
    return ['-ss', f'{start}', '-t', f'{dur}', '-i', SRC[src]]


def a(i):  # label audio input ke-i
    return f'{2 * i + 1}:a' if TEST else f'{i}:a'


def v(i):
    return f'{2 * i}:v' if TEST else f'{i}:v'


NORM = 'scale=1080:1920:flags=lanczos,fps=30,format=yuv420p,setsar=1'
LOUD = 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100'

VARIANTS = []

# 1 — Sinematik: latar blur gelap, video di tengah, vignette, bar progres
d = 16
VARIANTS.append(dict(
    id='01', slug='Sinematik', title='Tonton Sampai Akhir', dur=d,
    style='Latar blur gelap dari footage itu sendiri, video 960 px di tengah, vignette, judul Impact putih bergaris hitam, bar progres merah',
    segments=[(0, 0, d)],
    graph=(f"[{v(0)}]split=2[a][b];"
           f"[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.22:saturation=0.55[bg];"
           f"[b]scale=960:-2:flags=lanczos[fg];"
           f"color=c=0xE53935:s=1080x12:r=30:d={d}[bar];"
           f"[bg][fg]overlay=(W-w)/2:(H-h)/2+50,vignette=PI/4[m];"
           f"[m][bar]overlay=x='-w+w*t/{d}':y=H-30,"
           + draw('t1', 'TONTON SAMPAI AKHIR', 'impact', 84, 'white', '(w-text_w)/2', '48', 'borderw=6:bordercolor=black')
           + f",{NORM}[vo];[{a(0)}]{LOUD}[ao]")))

# 2 — Poster kuning: latar warna solid, video berbingkai putih, pita teks atas & bawah
d = 16
VARIANTS.append(dict(
    id='02', slug='Poster_Kuning', title='Simpan Dulu, Tonton Nanti', dur=d,
    style='Latar kuning solid, video 900 px berbingkai putih + bayangan, judul hitam tebal di atas, ajakan di bawah, warna sedikit lebih hidup',
    segments=[(0, 16, d)],
    graph=(f"color=c=0xFFD21F:s=1080x1920:r=30:d={d}[bg];"
           f"color=c=black@0.35:s=860x1530:r=30:d={d},format=rgba[sh];"
           f"[{v(0)}]scale=840:1494:flags=lanczos,eq=saturation=1.2:contrast=1.05,pad=860:1514:10:10:white[fg];"
           f"[bg][sh]overlay=122:272[b1];[b1][fg]overlay=110:260,"
           + draw('t2a', 'SIMPAN DULU,', 'segoe', 78, '0x111111', '(w-text_w)/2', '42')
           + ',' + draw('t2b', 'TONTON NANTI', 'segoe', 78, '0x111111', '(w-text_w)/2', '140')
           + ',' + draw('c2', 'Bagikan ke temanmu  >>', 'arial', 44, '0x111111', '(w-text_w)/2', '1830')
           + f",{NORM}[vo];[{a(0)}]{LOUD}[ao]")))

# 3 — Split layar: dua aset atas-bawah, pita judul di tengah
d = 12.4
VARIANTS.append(dict(
    id='03', slug='Split_Layar', title='Dua Momen, Satu Layar', dur=d,
    style='Split atas-bawah (aset 2 di atas, aset 1 di bawah), pita gelap 160 px di tengah dengan judul putih + garis aksen biru, audio dari panel atas',
    segments=[(1, 0, d), (0, 50.3, d)],
    graph=(f"[{v(0)}]scale=1080:-2:flags=lanczos,crop=1080:880,setsar=1[top];"
           f"[{v(1)}]scale=1080:-2:flags=lanczos,crop=1080:880,setsar=1[bot];"
           f"color=c=0x101418:s=1080x160:r=30:d={d},"
           f"drawbox=x=0:y=0:w=iw:h=6:color=0x29B6F6:t=fill,drawbox=x=0:y=ih-6:w=iw:h=6:color=0x29B6F6:t=fill,"
           + draw('t3', 'DUA MOMEN, SATU LAYAR', 'segoe', 64, 'white', '(w-text_w)/2', '(h-text_h)/2')
           + f"[mid];[top][mid][bot]vstack=inputs=3,{NORM}[vo];[{a(0)}]{LOUD}[ao]")))

# 4 — Zoom dinamis: layar penuh, zoom pelan, grade kontras, grain, judul muncul lalu memudar
d = 16
VARIANTS.append(dict(
    id='04', slug='Zoom_Dinamis', rate=['-maxrate', '12M', '-bufsize', '24M'], title='Lihat Lebih Dekat', dur=d,
    style='Layar penuh dengan zoom-in pelan 0-12%, kontras & saturasi naik, film grain, vignette, judul tengah yang memudar setelah 2,5 dtk, label kecil di bawah',
    segments=[(0, 32, d)],
    graph=(f"[{v(0)}]scale=w='2*trunc(1080*(1+0.12*t/{d})/2)':h='2*trunc(1920*(1+0.12*t/{d})/2)':eval=frame:flags=bicubic,"
           f"crop=1080:1920,eq=contrast=1.12:saturation=1.18,noise=alls=7:allf=t,vignette=PI/5,"
           + draw('t4', 'LIHAT LEBIH DEKAT', 'impact', 110, 'white', '(w-text_w)/2', '(h-text_h)/2',
                  f"borderw=7:bordercolor=black:alpha='if(lt(t,2.5),1,max(0,1-(t-2.5)/0.6))'")
           + ',' + draw('l4', 'lihat lebih dekat', 'trebuc', 40, 'white', '(w-text_w)/2', 'h-150',
                        'box=1:boxcolor=black@0.55:boxborderw=18')
           + f",{NORM}[vo];[{a(0)}]{LOUD}[ao]")))

# 5 — Rangkuman cepat: potongan pendek dari kedua aset, transisi kilat putih, bingkai polaroid
clips = [(1, 0, 3.0), (0, 3, 2.5), (0, 19, 2.5), (0, 35, 2.5), (0, 49, 2.5), (0, 58, 2.5), (1, 9, 3.4)]
X = 0.25
total = sum(c[2] for c in clips) - X * (len(clips) - 1)
g = []
for i in range(len(clips)):
    g.append(f"[{v(i)}]scale=880:1564:flags=lanczos,fps=30,format=yuv420p,setsar=1,settb=AVTB[c{i}]")
    g.append(f"[{a(i)}]aresample=44100,aformat=channel_layouts=stereo[s{i}]")
prev, prevA, off = 'c0', 's0', 0.0
for i in range(1, len(clips)):
    off += clips[i - 1][2] - X
    g.append(f"[{prev}][c{i}]xfade=transition=fadewhite:duration={X}:offset={off:.3f}[x{i}]")
    g.append(f"[{prevA}][s{i}]acrossfade=d={X}[y{i}]")
    prev, prevA = f'x{i}', f'y{i}'
g.append(f"[{prev}]pad=920:1740:20:20:0xFAFAF5[pol]")
g.append(f"color=c=0x0E3B43:s=1080x1920:r=30:d={total:.3f},"
         f"drawbox=x=0:y=0:w=iw:h=ih:color=0x0B2E34@0.0:t=fill[bg]")
g.append("[bg][pol]overlay=80:70,"
         + draw('t5', 'RANGKUMAN CEPAT', 'trebuc', 64, '0x1B1B1B', '(w-text_w)/2', '1666')
         + ',' + draw('c5', '7 potongan  |  %d detik' % round(total), 'georgia', 38, '0xE0F2F1', '(w-text_w)/2', '1838')
         + f",{NORM}[vo]")
g.append(f"[{prevA}]{LOUD}[ao]")
VARIANTS.append(dict(
    id='05', slug='Rangkuman_Cepat', title='Rangkuman Cepat', dur=round(total, 2),
    style='Montase 7 potongan pendek dari kedua aset, transisi kilat putih 0,25 dtk, bingkai polaroid krem di atas latar teal tua, judul di kaki polaroid',
    segments=clips, graph=';'.join(g)))

CAPTION = {
    '01': 'Tonton sampai akhir ya. Kalau suka, simpan dan bagikan.',
    '02': 'Simpan dulu biar nggak hilang, tonton lagi nanti.',
    '03': 'Dua momen dalam satu layar. Mana yang lebih kamu suka, atas atau bawah?',
    '04': 'Coba lihat lebih dekat.',
    '05': 'Rangkuman cepat dalam hitungan detik.',
}
TAGS = '#shorts #fyp #trending #reels'

only = [x.split('=')[1] for x in sys.argv if x.startswith('--only=')]
report = []
for V in VARIANTS:
    if only and V['id'] not in only:
        continue
    name = f"V{V['id']}_{V['slug']}"
    out = os.path.join(OUT, name + '.mp4')
    gp = os.path.join(TMP, name + '.fg')
    open(gp, 'w', encoding='utf-8').write(V['graph'])
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
    for s in V['segments']:
        cmd += inp(*s)
    cmd += ['-/filter_complex', gp, '-map', '[vo]', '-map', '[ao]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', *V.get('rate', []),
            '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', f"{V['dur']}", '-movflags', '+faststart', out]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    ok = r.returncode == 0
    print(name, 'OK' if ok else 'GAGAL', r.stderr[-1500:] if not ok else '')
    if ok:
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-ss', '1.2', '-i', out,
                        '-frames:v', '1', '-q:v', '2', os.path.join(OUT, name + '_thumbnail.jpg')])
    report.append(dict(file=name + '.mp4', thumbnail=name + '_thumbnail.jpg', title=V['title'],
                       caption=CAPTION[V['id']] + '\n\n' + TAGS, style=V['style'], target_duration=V['dur'],
                       source_segments=[dict(aset=s[0] + 1, mulai=s[1], durasi=s[2]) for s in V['segments']],
                       rendered=ok))
json.dump(report, open(os.path.join(OUT, 'metadata.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
