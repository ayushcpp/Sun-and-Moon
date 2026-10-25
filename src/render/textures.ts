import * as THREE from 'three';

const FILES = {
  sky: 'sky.jpg',
  twinkle: 'sky_twinkle.png',
  sun: 'sun.png',
  moon: 'moon.png',
  handSun: 'hand_sun.png',
  handMoon: 'hand_moon.png',
  cloudsLeft: 'clouds_left.png',
  cloudsRight: 'clouds_right.png',
  faces: 'faces.jpg',
  star0: 'star0.png',
  star1: 'star1.png',
  star2: 'star2.png',
  star3: 'star3.png',
} as const;

export type StoryTextures = Record<keyof typeof FILES, THREE.Texture>;

/** Loads the layers made by scripts/prepare_assets.py (public/story). */
export async function loadStoryTextures(renderer: THREE.WebGLRenderer): Promise<StoryTextures> {
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}story/`;
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      // loadAsync rejects with a bare DOM Event; name the file instead.
      const tex = await loader.loadAsync(base + file).catch(() => {
        throw new Error(`could not load story/${file}`);
      });
      tex.colorSpace = key === 'twinkle' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.anisotropy = anisotropy;
      return [key, tex] as const;
    }),
  );
  return Object.fromEntries(entries) as StoryTextures;
}
