import json, os, re, subprocess, sys, hashlib
D = sys.argv[1]
meta = json.load(open(os.path.join(D, 'metadata.json'), encoding='utf-8'))
def run(c): return subprocess.run(c, capture_output=True, text=True, encoding='utf-8', errors='replace')
rep, sigs = [], {}
for m in meta:
    f = os.path.join(D, m['file'])
    p = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height,r_frame_rate', '-of', 'json', f]).stdout)
    vs = [s for s in p['streams'] if s['codec_type'] == 'video'][0]; au = any(s['codec_type'] == 'audio' for s in p['streams'])
    dur = float(p['format']['duration'])
    e = run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-vf', 'blackdetect=d=0.5:pix_th=0.08,freezedetect=n=0.003:d=2', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    I = re.findall(r'I:\s+(-?[\d.]+) LUFS', e); TP = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)
    black = len(re.findall(r'black_start', e)); freeze = len(re.findall(r'freeze_start', e))
    sig = hashlib.md5(run(['ffmpeg', '-v', 'error', '-i', f, '-vf', 'fps=1,scale=16:28,format=gray', '-f', 'rawvideo', '-']).stdout.encode('utf-8', 'replace')).hexdigest()
    checks = {
        'resolusi_1080x1920': (vs['width'], vs['height']) == (1080, 1920),
        'fps_30': vs['r_frame_rate'] == '30/1',
        'ada_audio': au,
        'durasi_sesuai': abs(dur - m['target_duration']) < 0.35,
        'loudness_-14_±1.5': bool(I) and abs(float(I[-1]) + 14) <= 1.5,
        'true_peak_<=-1': bool(TP) and float(TP[-1]) <= -1.0,
        'tanpa_frame_hitam': black == 0,
        'tanpa_frame_beku_>2dtk': freeze == 0,
        'tidak_duplikat': sig not in sigs,
        'thumbnail_ada': os.path.exists(os.path.join(D, m['thumbnail'])),
    }
    sigs[sig] = m['file']
    r = dict(file=m['file'], durasi=round(dur, 2), ukuran_MB=round(int(p['format']['size']) / 1e6, 1),
             loudness_LUFS=float(I[-1]) if I else None, true_peak_dBFS=float(TP[-1]) if TP else None,
             frame_hitam=black, frame_beku=freeze, cek=checks, lolos=all(checks.values()))
    rep.append(r)
    print(f"{m['file']:28s} {dur:5.1f}s {r['ukuran_MB']:5.1f}MB I={r['loudness_LUFS']} TP={r['true_peak_dBFS']} hitam={black} beku={freeze} -> {'LOLOS' if r['lolos'] else 'GAGAL ' + str([k for k,v in checks.items() if not v])}")
json.dump(dict(dibuat='2026-11-15', jumlah_target=5, jumlah_lolos=sum(r['lolos'] for r in rep), video=rep,
               catatan='QC otomatis (teknis). Isi footage tidak diperiksa secara visual atas permintaan pemilik; tata letak diverifikasi dengan pola uji.'),
          open(os.path.join(D, 'production_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
