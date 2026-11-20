// Validasi aset "3D Isometrik". Pakai: node tools/office-iso3d/validate-assets.mjs
// Memeriksa: (1) setiap file di manifest ada, (2) tidak ada file model yang tidak terdaftar,
// (3) anggaran segitiga & ukuran file, (4) model karakter punya kerangka + klip yang dipakai,
// (5) tekstur luar yang dirujuk ada, (6) setiap file tercantum di LICENSES.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pub = path.join(root, 'public/office-iso3d')
const manifest = fs.readFileSync(path.join(root, 'src/officeIso3d/manifest/assets.ts'), 'utf8')
const licenses = fs.readFileSync(path.join(pub, 'LICENSES.md'), 'utf8')

const num = (re, fallback) => Number((manifest.match(re) || [])[1] ?? fallback)
const MAX_TRIS = num(/maxTrianglesPerModel:\s*(\d+)/, 2000)
const MAX_KB = num(/maxFileKB:\s*(\d+)/, 400)
const clips = [...manifest.matchAll(/(idle|walk|sit):\s*'([^']+)'/g)].map((m) => m[2])
const listed = [...manifest.matchAll(/\$\{BASE\}\/([\w/.-]+\.glb)/g)].map((m) => m[1])

function readGlb(file) {
  const b = fs.readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'glTF') throw new Error('bukan file GLB')
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'))
  let tris = 0
  for (const m of json.meshes || []) for (const p of m.primitives) tris += json.accessors[p.indices ?? p.attributes.POSITION].count / 3
  return { json, tris: Math.round(tris), kb: Math.round(b.length / 1024) }
}

const problems = []
const rows = []
for (const rel of listed) {
  const file = path.join(pub, rel)
  if (!fs.existsSync(file)) { problems.push(`TIDAK ADA: ${rel} (terdaftar di manifest)`); continue }
  const { json, tris, kb } = readGlb(file)
  const anims = (json.animations || []).map((a) => a.name)
  rows.push({ file: rel, kB: kb, segitiga: tris, material: (json.materials || []).length, sendi: json.skins?.[0]?.joints.length ?? 0, klip: anims.length })
  if (tris > MAX_TRIS) problems.push(`ANGGARAN: ${rel} ${tris} segitiga > ${MAX_TRIS}`)
  if (kb > MAX_KB) problems.push(`ANGGARAN: ${rel} ${kb} kB > ${MAX_KB}`)
  for (const img of json.images || []) {
    if (img.uri && !img.uri.startsWith('data:') && !fs.existsSync(path.join(path.dirname(file), decodeURI(img.uri)))) problems.push(`TEKSTUR TIDAK ADA: ${rel} -> ${img.uri}`)
  }
  if (rel.startsWith('characters/')) {
    if (!json.skins?.length) problems.push(`KERANGKA: ${rel} tidak punya skin`)
    for (const c of clips) if (!anims.includes(c)) problems.push(`KLIP: ${rel} tidak punya klip "${c}"`)
  }
  if (!licenses.includes(path.basename(rel))) problems.push(`LISENSI: ${path.basename(rel)} tidak tercantum di LICENSES.md`)
}
const onDisk = fs.readdirSync(pub, { recursive: true }).map((f) => String(f).replace(/\\/g, '/')).filter((f) => f.endsWith('.glb'))
for (const f of onDisk) if (!listed.includes(f)) problems.push(`TIDAK TERDAFTAR: ${f} ada di folder tapi tidak di manifest`)

console.table(rows)
console.log(`Anggaran: ≤ ${MAX_TRIS} segitiga, ≤ ${MAX_KB} kB per model · klip wajib karakter: ${clips.join(', ')}`)
console.log(`Total: ${rows.length} model, ${rows.reduce((s, r) => s + r.kB, 0)} kB, ${rows.reduce((s, r) => s + r.segitiga, 0)} segitiga`)
if (problems.length) { console.error('\nMASALAH:\n- ' + problems.join('\n- ')); process.exit(1) }
console.log('Semua pemeriksaan lolos.')
