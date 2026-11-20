import { Composition } from 'remotion'
import { JudulHoror } from './JudulHoror.jsx'

// Motion graphics AutoClipper. Tambah komposisi baru di sini.
// Render: lihat render.bat (urutan PNG -> encode NVENC, supaya CPU laptop tidak dipaksa x264).
export const Root = () => (
  <>
    <Composition
      id="JudulHoror"
      component={JudulHoror}
      durationInFrames={120}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ judul: 'Jangan Jawab Panggilan Jam Tiga Pagi', label: 'CERITA HOROR' }}
    />
  </>
)
