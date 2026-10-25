// MP3 copies of the soundtrack (public/audio/*.m4a -> *.mp3) for browsers that cannot decode AAC,
// such as VS Code's built-in browsers; soundtrack.ts falls back to them (SOUND.files in config.ts).
// Run again after re-cutting a clip:  npm run audio:mp3   (needs ffmpeg with libmp3lame)
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/audio/', import.meta.url));
for (const m4a of readdirSync(dir).filter((f) => f.endsWith('.m4a'))) {
  const mp3 = m4a.replace(/\.m4a$/, '.mp3');
  // LAME VBR -V2: 32-38 dB SNR against the AAC here; its gapless header keeps every sample in place.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', dir + m4a, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', '2', dir + mp3]);
  console.log(`${m4a} -> ${mp3}`);
}
