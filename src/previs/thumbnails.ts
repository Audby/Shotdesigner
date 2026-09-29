import * as T from 'three';
import { buildObject, disposeObject } from './geometry';
import { previsAssets } from './catalog';

let cached: Record<string, string> | undefined;
export function createThumbnails(): Record<string, string> {
  if (cached) return cached;
  const result: Record<string, string> = {};
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(160, 110);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 160 / 110, 0.01, 100);
  scene.add(new T.HemisphereLight('#e5eeff', '#8a7764', 2));
  const sun = new T.DirectionalLight('#fff4e0', 3);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  try {
    for (const a of previsAssets) {
      const root = buildObject({
        id: a.id,
        assetId: a.id,
        label: a.name,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        dimensions: a.dimensions,
        color: a.color,
        visible: true,
        locked: false,
        pose: a.pose,
        lightIntensity: a.light?.intensity,
        lightColor: a.light?.color,
      });
      const max = Math.max(...a.dimensions);
      root.scale.set(
        ...(a.dimensions.map((n) => n / max) as [number, number, number]),
      );
      scene.add(root);
      const target = new T.Vector3(0, a.dimensions[1] / max / 2, 0);
      camera.position.copy(target).add(new T.Vector3(1.7, 1.2, 2.2));
      camera.lookAt(target);
      renderer.render(scene, camera);
      result[a.id] = renderer.domElement.toDataURL('image/png');
      scene.remove(root);
      disposeObject(root);
    }
    cached = result;
    return result;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
