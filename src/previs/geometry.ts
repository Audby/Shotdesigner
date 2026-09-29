import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { assetShape } from './model';
import type { PrevisObject } from './types';

const architectural = ['wall', 'door', 'open-door', 'window', 'stairs', 'arch', 'ramp', 'roller'];

/** Deterministic pseudo-random numbers keep procedural detail stable between rebuilds. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Small, recognizable models with a ground-level pivot and dimensions in metres. */
export function buildObject(object: PrevisObject): T.Group {
  const group = new T.Group();
  const shape = assetShape(object.assetId);
  const random = seeded(object.assetId + object.id);
  const glowing = (object.lightIntensity ?? 0) > 0;
  const glowColor = new T.Color(object.lightColor ?? '#ffe5b3');
  const main = new T.MeshStandardMaterial({ color: object.color, roughness: 0.62, metalness: 0.02 });
  const metal = new T.MeshStandardMaterial({ color: '#8b949b', metalness: 0.85, roughness: 0.32 });
  const dark = new T.MeshStandardMaterial({ color: '#2f3534', roughness: 0.75 });
  const rubber = new T.MeshStandardMaterial({ color: '#1f2223', roughness: 0.92 });
  const pale = new T.MeshStandardMaterial({ color: '#e2ddd0', roughness: 0.8 });
  const glass = new T.MeshPhysicalMaterial({
    color: '#9fb8c2', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.38,
    envMapIntensity: 1.4, depthWrite: false,
  });
  const skin = new T.MeshStandardMaterial({ color: '#c9a58c', roughness: 0.72 });
  const cloth = new T.MeshStandardMaterial({ color: '#33383d', roughness: 0.9 });
  const hair = new T.MeshStandardMaterial({ color: '#3a2c24', roughness: 0.85 });
  const wood = new T.MeshStandardMaterial({ color: '#8a6848', roughness: 0.78 });
  const glow = new T.MeshStandardMaterial({
    color: glowing ? glowColor : '#d9d4c8',
    emissive: glowing ? glowColor : '#000000',
    emissiveIntensity: glowing ? 2.2 : 0,
    roughness: 0.4,
  });
  const materials = [main, metal, dark, rubber, pale, glass, skin, cloth, hair, wood, glow];
  const add = (geometry: T.BufferGeometry, x: number, y: number, z: number, mat: T.Material = main) => {
    const m = new T.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.castShadow = mat !== glass && mat !== glow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0, mat: T.Material = main) =>
    add(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * (architectural.includes(shape) ? 0.008 : 0.08)),
      x, y, z, mat,
    );
  const cyl = (r: number, h: number, x = 0, y = h / 2, z = 0, mat: T.Material = main, top = r, segments = 28) =>
    add(new T.CylinderGeometry(top, r, h, segments), x, y, z, mat);
  const sphere = (r: number, x: number, y: number, z: number, mat: T.Material = main) =>
    add(new T.SphereGeometry(r, 28, 20), x, y, z, mat);
  const rod = (a: T.Vector3, b: T.Vector3, r = 0.03, mat: T.Material = metal) => {
    const m = cyl(r, a.distanceTo(b), 0, 0, 0, mat, r, 12);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };
  const capsule = (a: T.Vector3, b: T.Vector3, r: number, mat: T.Material) => {
    const m = add(new T.CapsuleGeometry(r, Math.max(0.005, a.distanceTo(b)), 8, 18), 0, 0, 0, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };
  const legs = (w: number, h: number, d: number, thickness = 0.06, mat: T.Material = main) => {
    for (const x of [-w / 2 + thickness, w / 2 - thickness])
      for (const z of [-d / 2 + thickness, d / 2 - thickness]) box(thickness, h, thickness, x, h / 2, z, mat);
  };
  const wheel = (r: number, width: number, x: number, y: number, z: number) => {
    const tyre = add(new T.TorusGeometry(r * 0.78, r * 0.26, 14, 32), x, y, z, rubber);
    tyre.rotation.y = Math.PI / 2;
    tyre.scale.z = width / (r * 0.5);
    const hub = cyl(r * 0.55, width * 0.9, x, y, z, metal);
    hub.rotation.z = Math.PI / 2;
  };
  const wheels = (w: number, length: number, r: number, y = r) => {
    for (const x of [-w / 2, w / 2]) for (const z of [-length / 2, length / 2]) wheel(r, 0.2, x, y, z);
  };
  const tripod = (top: number, spread: number) => {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
      rod(new T.Vector3(0, top, 0), new T.Vector3(Math.cos(a) * spread, 0.015, Math.sin(a) * spread), 0.016);
    }
  };
  /** A soft, lumpy mass for tarps, rocks and piles. */
  const blob = (w: number, h: number, d: number, bumps: number, flat: boolean, mat: T.Material = main, y = 0) => {
    const g = new T.SphereGeometry(0.5, 40, 24);
    const p = g.attributes.position;
    const phase = [random() * 6, random() * 6, random() * 6];
    for (let i = 0; i < p.count; i++) {
      const v = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const n = 1 + bumps * (Math.sin(v.x * 9 + phase[0]) * Math.cos(v.z * 7 + phase[1]) + 0.5 * Math.sin(v.y * 13 + phase[2]));
      v.multiplyScalar(n);
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.15; // settled on the ground
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    if (flat) (mat as T.MeshStandardMaterial).flatShading = true;
    const m = add(g, 0, 0, 0, mat);
    m.scale.set(w, h, d);
    m.position.y = y + 0.3 * h;
    return m;
  };

  switch (shape) {
    case 'person': {
      const pose = object.pose ?? 'standing';
      const seated = pose === 'sitting', walking = pose === 'walking';
      // An artist's mannequin: 7.5 heads tall, jointed, with hair marking the back of the head.
      const hip = seated ? 0.5 : 0.93;
      const shoulderY = hip + 0.5;
      const head = shoulderY + 0.2;
      const profile = [[0, 0], [0.13, 0.005], [0.155, 0.07], [0.135, 0.19], [0.155, 0.3], [0.19, 0.42], [0.2, 0.47], [0.16, 0.51], [0.06, 0.53], [0, 0.535]];
      const torso = add(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 36), 0, hip, 0, main);
      torso.scale.z = 0.6;
      sphere(0.155, 0, hip + 0.02, 0, cloth).scale.set(1.02, 0.62, 0.7);
      cyl(0.052, 0.1, 0, shoulderY + 0.06, 0, skin);
      sphere(0.113, 0, head, 0, skin).scale.set(0.9, 1.16, 1);
      sphere(0.064, 0, head - 0.07, 0.03, skin).scale.set(1, 0.72, 1.05);
      sphere(0.019, 0, head - 0.012, 0.1, skin).scale.set(0.7, 1.2, 1.1);
      // Hair wraps the crown and the back of the head, leaving the face clear.
      const cap = add(new T.SphereGeometry(0.121, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.56), 0, head + 0.006, -0.008, hair);
      cap.scale.set(0.95, 1.2, 1.07);
      cap.rotation.x = -0.48;
      for (const s of [-1, 1]) {
        // Walking swings each arm opposite its leg.
        const stride = walking ? s * 0.24 : 0;
        const shoulder = new T.Vector3(s * 0.19, shoulderY - 0.04, 0);
        const elbow = new T.Vector3(s * 0.22, shoulderY - 0.3, seated ? 0.12 : -stride * 0.55 + 0.01);
        const hand = new T.Vector3(s * (seated ? 0.2 : 0.235), shoulderY - 0.55, seated ? 0.33 : -stride * 0.9 + 0.06);
        sphere(0.06, shoulder.x, shoulder.y, shoulder.z, main);
        capsule(shoulder, elbow, 0.052, main);
        capsule(elbow, hand, 0.042, main);
        sphere(0.044, elbow.x, elbow.y, elbow.z, main);
        sphere(0.048, hand.x, hand.y - 0.03, hand.z, skin).scale.set(0.7, 1.25, 1);
        const top = new T.Vector3(s * 0.095, hip, 0);
        const knee = new T.Vector3(s * 0.11, seated ? hip : 0.49, seated ? 0.44 : stride * 0.55);
        const ankle = new T.Vector3(s * 0.115, 0.085, seated ? 0.46 : stride);
        capsule(top, knee, 0.075, cloth);
        capsule(knee, ankle, 0.056, cloth);
        sphere(0.06, knee.x, knee.y, knee.z, cloth);
        box(0.11, 0.08, 0.27, ankle.x, 0.04, ankle.z + 0.06, rubber);
      }
      if (pose === 'lying') group.rotation.x = Math.PI / 2;
      group.rotation.y = Math.PI; // Match the plan symbol's facing notch (-Y maps to -Z).
      break;
    }
    case 'cave-wall': {
      // Rock relief is modelled in real metres so long and short walls share the same grain.
      const [L, H, D] = object.dimensions.map((n) => Math.max(0.2, n));
      const depth = Math.max(D, 0.5);
      const geometry = new T.BoxGeometry(L, H, depth, Math.ceil(L / 0.22), Math.ceil(H / 0.22), 3);
      const p = geometry.attributes.position;
      const colors: number[] = [];
      const base = new T.Color(object.color);
      const offset = random() * 100;
      const noise = (x: number, y: number) =>
        Math.sin(x * 1.1 + offset) * Math.cos(y * 1.4 - offset) * 0.55 +
        Math.sin(x * 2.9 + y * 2.1 + offset) * Math.cos(x * 1.7 - y) * 0.45 +
        Math.sin(x * 6.3 - y * 5.1) * 0.2 +
        Math.sin(x * 13.1 + y * 11.7) * 0.08;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i) + H / 2, z = p.getZ(i);
        const side = Math.sign(z) || 1;
        const n = noise(x + side * 13, y);
        const taper = 1 - 0.35 * (y / H); // walls lean in toward the top
        const top = y > H - 0.01 ? noise(x * 0.8, 3) * 0.35 : 0;
        p.setXYZ(i, x + n * 0.06, p.getY(i) + top, z * taper + side * n * 0.3);
        const shade = 0.78 + 0.22 * (n * 0.5 + 0.5);
        colors.push(base.r * shade, base.g * shade, base.b * shade);
      }
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      main.color.set('#ffffff');
      main.vertexColors = true;
      main.roughness = 0.97;
      main.flatShading = true;
      add(geometry, 0, H / 2, 0);
      break;
    }
    case 'wall':
      main.roughness = 0.9;
      box(1, 1, 1);
      break;
    case 'door':
    case 'open-door': {
      box(0.06, 1, 0.15, -0.47, 0.5, 0, pale);
      box(0.06, 1, 0.15, 0.47, 0.5, 0, pale);
      box(1, 0.06, 0.15, 0, 0.97, 0, pale);
      const leaf = new T.Group();
      const panel = box(0.87, 0.94, 0.045, 0.435, 0.47);
      const inset = box(0.6, 0.35, 0.052, 0.435, 0.7);
      const inset2 = box(0.6, 0.35, 0.052, 0.435, 0.27);
      const handle = sphere(0.022, 0.8, 0.48, 0.045, metal);
      leaf.add(panel, inset, inset2, handle);
      leaf.position.x = -0.435;
      if (shape === 'open-door') leaf.rotation.y = -Math.PI * 0.38;
      group.add(leaf);
      break;
    }
    case 'window':
      box(0.05, 1, 0.15, -0.475, 0.5, 0, pale);
      box(0.05, 1, 0.15, 0.475, 0.5, 0, pale);
      box(1, 0.05, 0.15, 0, 0.025, 0, pale);
      box(1, 0.05, 0.15, 0, 0.975, 0, pale);
      box(0.025, 1, 0.09, 0, 0.5, 0, pale);
      box(1, 0.025, 0.09, 0, 0.5, 0, pale);
      box(0.94, 0.94, 0.02, 0, 0.5, 0, glass);
      break;
    case 'arch':
      box(0.18, 0.85, 0.8, -0.41);
      box(0.18, 0.85, 0.8, 0.41);
      box(1, 0.15, 0.8, 0, 0.925);
      break;
    case 'column':
      cyl(0.5, 0.06, 0, 0.03, 0, main, 0.5);
      cyl(0.42, 0.88, 0, 0.5);
      cyl(0.5, 0.06, 0, 0.97, 0, main, 0.5);
      break;
    case 'stairs':
      for (let i = 0; i < 8; i++) box(1, (i + 1) / 8, 1 / 8, 0, (i + 1) / 16, -0.5 + (i + 0.5) / 8);
      break;
    case 'ramp': {
      // Rises toward -Z, the back of the plan symbol.
      const profile = new T.Shape([new T.Vector2(0, 0), new T.Vector2(1, 0), new T.Vector2(0, 1)]);
      add(new T.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false }), 0, 0, 0).rotation.y = Math.PI / 2;
      break;
    }
    case 'curtain': {
      const g = new T.PlaneGeometry(1, 1, 60, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * Math.PI * 16) * 0.04);
      g.computeVertexNormals();
      main.side = T.DoubleSide;
      main.roughness = 0.95;
      add(g, 0, 0.5, 0);
      rod(new T.Vector3(-0.52, 1, 0), new T.Vector3(0.52, 1, 0), 0.012);
      break;
    }
    case 'fence':
      for (let i = 0; i < 12; i++) box(0.045, 1, 0.08, -0.5 + i / 11, 0.5, 0, wood);
      box(1, 0.08, 0.07, 0, 0.25, 0.05, wood);
      box(1, 0.08, 0.07, 0, 0.75, 0.05, wood);
      break;
    case 'table':
    case 'desk':
      box(1.6, 0.06, 0.9, 0, 0.73);
      legs(1.5, 0.7, 0.8, 0.055);
      if (shape === 'desk') {
        box(0.4, 0.62, 0.8, -0.58, 0.39);
        for (let i = 0; i < 3; i++) box(0.22, 0.02, 0.03, -0.58, 0.22 + i * 0.18, 0.41, metal);
      }
      break;
    case 'round-table':
      cyl(0.55, 0.05, 0, 0.735);
      cyl(0.06, 0.7, 0, 0.36, 0, dark);
      cyl(0.28, 0.04, 0, 0.02, 0, dark);
      break;
    case 'chair':
      box(0.46, 0.05, 0.46, 0, 0.46);
      legs(0.44, 0.44, 0.44, 0.04);
      box(0.46, 0.4, 0.04, 0, 0.72, -0.21);
      break;
    case 'sofa':
    case 'armchair': {
      const width = shape === 'sofa' ? 2.1 : 0.85;
      box(width, 0.26, 0.84, 0, 0.3);
      box(width, 0.5, 0.2, 0, 0.62, -0.33);
      box(0.16, 0.36, 0.84, -width / 2 + 0.08, 0.5);
      box(0.16, 0.36, 0.84, width / 2 - 0.08, 0.5);
      const seats = shape === 'sofa' ? 3 : 1;
      for (let i = 0; i < seats; i++)
        box((width - 0.34) / seats - 0.02, 0.13, 0.62, -(width - 0.34) / 2 + ((i + 0.5) * (width - 0.34)) / seats, 0.49, 0.07);
      legs(width - 0.1, 0.18, 0.75, 0.06, dark);
      break;
    }
    case 'stool':
      cyl(0.2, 0.05, 0, 0.635);
      legs(0.3, 0.61, 0.3, 0.035, metal);
      break;
    case 'bed':
      box(1.6, 0.25, 2.1, 0, 0.22, 0, wood);
      box(1.55, 0.2, 2, 0, 0.44, 0, pale);
      box(1.6, 0.9, 0.08, 0, 0.45, -1.02, wood);
      box(1.52, 0.04, 1.3, 0, 0.56, 0.32);
      box(0.6, 0.12, 0.38, -0.38, 0.6, -0.68, pale);
      box(0.6, 0.12, 0.38, 0.38, 0.6, -0.68, pale);
      break;
    case 'shelf': {
      box(0.04, 2, 0.35, -0.43);
      box(0.04, 2, 0.35, 0.43);
      for (let y = 0.05; y <= 2; y += 0.48) box(0.9, 0.03, 0.35, 0, y);
      const book = [pale, dark, wood, cloth];
      for (let i = 0; i < 18; i++)
        box(0.05, 0.2 + random() * 0.06, 0.22, -0.36 + (i % 9) * 0.075, 0.18 + Math.floor(i / 9) * 0.96, 0, book[i % 4]);
      break;
    }
    case 'cabinet':
    case 'counter':
    case 'fridge':
      box(1, 1, 1);
      box(1.03, 0.04, 1.03, 0, 0.98, 0, shape === 'counter' ? pale : main);
      box(0.008, 0.86, 0.015, 0, 0.48, 0.505, dark);
      box(0.022, 0.14, 0.03, -0.05, 0.6, 0.52, metal);
      box(0.022, 0.14, 0.03, 0.05, 0.6, 0.52, metal);
      if (shape === 'fridge') box(1, 0.01, 0.02, 0, 0.7, 0.505, dark);
      break;
    case 'rug':
    case 'water': {
      main.roughness = shape === 'water' ? 0.05 : 1;
      if (shape === 'water') main.metalness = 0.3;
      box(1, 0.02, 1);
      break;
    }
    case 'decal': {
      const outline = Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2;
        const k = 0.5 * (0.72 + 0.28 * Math.abs(Math.sin(a * 3 + random() * 2)));
        return new T.Vector2(Math.cos(a) * k, Math.sin(a) * k);
      });
      main.roughness = 0.12;
      const m = add(new T.ExtrudeGeometry(new T.Shape(outline), { depth: 0.01, bevelEnabled: false }), 0, 0, 0);
      m.rotation.x = -Math.PI / 2;
      m.castShadow = false;
      break;
    }
    case 'lamp':
      cyl(0.17, 0.035, 0, 0.018, 0, dark);
      cyl(0.016, 1.3, 0, 0.66, 0, metal);
      cyl(0.24, 0.34, 0, 1.43, 0, glowing ? glow : main, 0.13);
      if (glowing) sphere(0.07, 0, 1.36, 0, glow);
      break;
    case 'bulb':
      sphere(0.1, 0, 0.16, 0, glow);
      cyl(0.045, 0.09, 0, 0.045, 0, metal);
      break;
    case 'torch': {
      cyl(0.03, 1.3, 0, 0.65, 0, wood);
      cyl(0.07, 0.14, 0, 1.33, 0, dark, 0.09);
      const flame = add(new T.ConeGeometry(0.08, 0.26, 12), 0, 1.5, 0, glow);
      flame.castShadow = false;
      break;
    }
    case 'spot':
    case 'softbox':
    case 'panel': {
      cyl(0.02, 1.7, 0, 0.87, 0, metal);
      tripod(0.4, 0.34);
      rod(new T.Vector3(-0.08, 1.72, 0), new T.Vector3(0.08, 1.72, 0), 0.03, dark);
      if (shape === 'spot') {
        const m = cyl(0.13, 0.34, 0.02, 1.85, 0, dark, 0.16);
        m.rotation.z = Math.PI / 2;
        const lens = cyl(0.13, 0.02, 0.2, 1.85, 0, glow);
        lens.rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) box(0.01, 0.2, 0.2, 0.24, 1.85, s * 0.18, dark).rotation.y = s * 0.5;
      } else {
        const tall = shape === 'softbox' ? 0.65 : 0.36;
        box(0.12, tall, 0.65, 0, 1.85, 0, dark);
        box(0.012, tall - 0.05, 0.6, 0.066, 1.85, 0, glow);
      }
      break;
    }
    case 'fresnel':
    case 'hmi':
    case 'par': {
      const top = shape === 'hmi' ? 2.05 : shape === 'par' ? 1.3 : 1.85;
      const r = shape === 'hmi' ? 0.2 : shape === 'par' ? 0.06 : 0.14;
      const len = shape === 'hmi' ? 0.42 : shape === 'par' ? 0.2 : 0.3;
      cyl(0.02, top - 0.1, 0, (top - 0.1) / 2, 0, metal);
      tripod(0.45, shape === 'par' ? 0.25 : 0.38);
      // Yoke, body with cooling fins, glowing lens and four barn doors.
      rod(new T.Vector3(0, top - 0.12, 0), new T.Vector3(0, top - 0.12, r + 0.05), 0.012, dark);
      rod(new T.Vector3(0, top - 0.12, 0), new T.Vector3(0, top - 0.12, -r - 0.05), 0.012, dark);
      for (const z of [-1, 1]) rod(new T.Vector3(0, top - 0.12, z * (r + 0.05)), new T.Vector3(0, top, z * (r + 0.05)), 0.012, dark);
      const body = cyl(r, len, 0, top, 0, main, r * 0.9);
      body.rotation.z = Math.PI / 2;
      for (let i = 0; i < 3; i++) cyl(r * 1.05, 0.012, -len / 2 + 0.05 + i * 0.05, top, 0, dark).rotation.z = Math.PI / 2;
      const lens = cyl(r * 0.85, 0.015, len / 2 + 0.005, top, 0, glowing ? glow : glass);
      lens.rotation.z = Math.PI / 2;
      const door = r * 1.1;
      box(0.008, door, door * 1.6, len / 2 + door / 2, top + r + door * 0.2, 0, dark).rotation.z = -0.9;
      box(0.008, door, door * 1.6, len / 2 + door / 2, top - r - door * 0.2, 0, dark).rotation.z = 0.9;
      box(0.008, door * 1.6, door, len / 2 + door / 2, top, r + door * 0.2, dark).rotation.y = 0.9;
      box(0.008, door * 1.6, door, len / 2 + door / 2, top, -r - door * 0.2, dark).rotation.y = -0.9;
      if (shape === 'hmi') box(0.35, 0.22, 0.25, 0.25, 0.11, 0.25, pale);
      break;
    }
    case 'skypanel':
    case 'kino':
    case 'ring': {
      const top = shape === 'ring' ? 1.62 : 1.78;
      cyl(0.02, top - 0.1, 0, (top - 0.1) / 2, 0, metal);
      tripod(0.45, 0.38);
      if (shape === 'ring') {
        const ring = add(new T.TorusGeometry(0.2, 0.035, 12, 48), 0.02, top, 0, glowing ? glow : pale);
        ring.rotation.y = Math.PI / 2;
        rod(new T.Vector3(0, top - 0.25, 0), new T.Vector3(0, top - 0.2, 0), 0.02, dark);
        break;
      }
      const wide = shape === 'kino' ? 1.25 : 0.72;
      box(0.08, 0.36, wide, 0, top, 0, main);
      if (shape === 'kino')
        for (let i = 0; i < 4; i++) cyl(0.02, wide - 0.1, 0.05, top - 0.12 + i * 0.08, 0, glowing ? glow : pale).rotation.x = Math.PI / 2;
      else box(0.01, 0.32, wide - 0.06, 0.045, top, 0, glowing ? glow : pale);
      rod(new T.Vector3(0, top - 0.25, 0), new T.Vector3(0, top - 0.18, 0), 0.025, dark);
      break;
    }
    case 'tube': {
      // A handheld LED rod: glowing diffuser between two end caps.
      const tube = cyl(0.5, 0.9, 0, 0.5, 0, glowing ? glow : pale);
      tube.castShadow = false;
      cyl(0.55, 0.05, 0, 0.025, 0, dark);
      cyl(0.55, 0.05, 0, 0.975, 0, dark);
      break;
    }
    case 'china-ball': {
      cyl(0.02, 1.4, -0.45, 0.7, 0, metal);
      tripod(0.4, 0.34);
      rod(new T.Vector3(-0.45, 1.4, 0), new T.Vector3(0.55, 2.3, 0), 0.018);
      rod(new T.Vector3(0.55, 2.3, 0), new T.Vector3(0.55, 2.12, 0), 0.004, dark);
      sphere(0.3, 0.55, 1.82, 0, glowing ? glow : pale).castShadow = false;
      break;
    }
    case 'space-light':
      pale.side = T.DoubleSide;
      add(new T.CylinderGeometry(0.45, 0.45, 0.9, 32, 1, true), 0, 0.55, 0, pale);
      cyl(0.2, 0.2, 0, 0.3, 0, glowing ? glow : pale);
      rod(new T.Vector3(0, 1, 0), new T.Vector3(0, 1.2, 0), 0.01, dark);
      break;
    case 'pendant': {
      rod(new T.Vector3(0, 0.25, 0), new T.Vector3(0, 1, 0), 0.006, dark);
      const shade = add(new T.CylinderGeometry(0.06, 0.22, 0.2, 32, 1, true), 0, 0.18, 0, main);
      (shade.material as T.MeshStandardMaterial).side = T.DoubleSide;
      sphere(0.055, 0, 0.1, 0, glowing ? glow : pale);
      break;
    }
    case 'batten':
      box(1, 0.6, 1, 0, 0.3, 0, pale);
      box(0.96, 0.2, 0.8, 0, 0.08, 0, glowing ? glow : pale);
      break;
    case 'neon': {
      // Glowing tube lettering on a dark backing plate.
      box(1, 1, 0.3, 0, 0.5, -0.35, dark);
      const neon = new T.MeshStandardMaterial({ color: object.color, emissive: object.lightColor ?? object.color, emissiveIntensity: glowing ? 3 : 0.2, roughness: 0.3 });
      materials.push(neon);
      const path = new T.CurvePath<T.Vector3>();
      const pts = [[-0.42, 0.12], [-0.42, 0.88], [0.42, 0.88], [0.42, 0.12], [-0.42, 0.12]];
      for (let i = 0; i < 4; i++) path.add(new T.LineCurve3(new T.Vector3(pts[i][0], pts[i][1], 0.1), new T.Vector3(pts[i + 1][0], pts[i + 1][1], 0.1)));
      add(new T.TubeGeometry(path, 64, 0.025, 8, true), 0, 0, 0, neon).castShadow = false;
      const script = new T.CatmullRomCurve3([[-0.3, 0.4], [-0.18, 0.62], [-0.05, 0.38], [0.08, 0.64], [0.2, 0.4], [0.3, 0.6]].map(([x, y]) => new T.Vector3(x, y, 0.1)));
      add(new T.TubeGeometry(script, 64, 0.022, 8, false), 0, 0, 0, neon).castShadow = false;
      break;
    }
    case 'string-lights': {
      const sag = (x: number) => 0.95 - 0.8 * (1 - (2 * x) ** 2);
      const wire = new T.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => new T.Vector3(-0.5 + i / 12, sag(-0.5 + i / 12), 0)));
      add(new T.TubeGeometry(wire, 48, 0.004, 4, false), 0, 0, 0, dark);
      for (let i = 0; i <= 12; i++) {
        const x = -0.48 + (i / 12) * 0.96;
        sphere(0.02, x, sag(x) - 0.03, 0, glowing ? glow : pale).castShadow = false;
      }
      break;
    }
    case 'candle':
      cyl(0.5, 0.75, 0, 0.375, 0, pale);
      add(new T.ConeGeometry(0.22, 0.25, 12), 0, 0.88, 0, glow).castShadow = false;
      break;
    case 'street-lamp':
      cyl(0.07, 4.7, 0, 2.35, 0, main, 0.05);
      cyl(0.12, 0.3, 0, 0.15, 0, main);
      rod(new T.Vector3(0, 4.6, 0), new T.Vector3(0, 4.8, 0.55), 0.04, main);
      box(0.3, 0.12, 0.5, 0, 4.82, 0.72, main);
      box(0.24, 0.02, 0.42, 0, 4.75, 0.72, glowing ? glow : glass);
      break;
    case 'flashlight': {
      const body = cyl(0.3, 0.7, -0.1, 0.5, 0, main, 0.3);
      body.rotation.z = Math.PI / 2;
      const head = cyl(0.5, 0.25, 0.35, 0.5, 0, main, 0.4);
      head.rotation.z = Math.PI / 2;
      cyl(0.45, 0.02, 0.48, 0.5, 0, glowing ? glow : glass).rotation.z = Math.PI / 2;
      break;
    }
    case 'campfire': {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const stone = add(new T.DodecahedronGeometry(0.1, 0), Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42, dark);
        stone.scale.set(1.2, 0.7, 1);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        rod(new T.Vector3(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3), new T.Vector3(-Math.cos(a) * 0.05, 0.28, -Math.sin(a) * 0.05), 0.045, wood);
      }
      for (let i = 0; i < 3; i++) add(new T.ConeGeometry(0.12 - i * 0.02, 0.35 + i * 0.12, 8), (i - 1) * 0.06, 0.28 + i * 0.05, (i % 2) * 0.05, glow).castShadow = false;
      break;
    }
    case 'v-flat': {
      const black = new T.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.95 });
      materials.push(black);
      // Two hinged boards, white inside for bounce and black outside for negative fill.
      for (const side of [-1, 1]) {
        const board = new T.Group();
        const inside = box(1.2, 2.4, 0.02, 0.6, 1.2, 0.012, main);
        const outside = box(1.2, 2.4, 0.02, 0.6, 1.2, -0.012, black);
        group.remove(inside, outside);
        board.add(inside, outside);
        board.rotation.y = side * Math.PI / 4 + (side < 0 ? Math.PI : 0);
        group.add(board);
      }
      break;
    }
    case 'diff-frame': {
      for (const x of [-0.9, 0.9]) rod(new T.Vector3(x, 0, 0), new T.Vector3(x, 2.4, 0), 0.02);
      rod(new T.Vector3(-0.9, 0.6, 0), new T.Vector3(0.9, 0.6, 0), 0.02);
      rod(new T.Vector3(-0.9, 2.4, 0), new T.Vector3(0.9, 2.4, 0), 0.02);
      const silk = new T.MeshStandardMaterial({ color: '#f4f3ee', transparent: true, opacity: 0.55, side: T.DoubleSide, roughness: 1 });
      materials.push(silk);
      add(new T.PlaneGeometry(1.8, 1.8), 0, 1.5, 0, silk).castShadow = false;
      for (const x of [-0.9, 0.9]) {
        for (const a of [-0.6, 0.6]) rod(new T.Vector3(x, 0.02, 0), new T.Vector3(x + Math.sin(a) * 0.3, 0.02, Math.cos(a) * 0.3), 0.015);
      }
      break;
    }
    case 'board':
      box(1, 0.8, 0.025, 0, 0.6);
      legs(0.8, 0.2, 0.2, 0.025, metal);
      break;
    case 'crate':
      box(1, 1, 1);
      for (const y of [0.1, 0.9]) box(1.03, 0.08, 1.03, 0, y, 0, dark);
      break;
    case 'barrel':
      cyl(0.3, 0.9, 0, 0.45, 0, main, 0.3, 32);
      for (const y of [0.1, 0.45, 0.8]) cyl(0.305, 0.03, 0, y, 0, metal);
      cyl(0.27, 0.005, 0, 0.9, 0, dark);
      break;
    case 'bottle':
      cyl(0.045, 0.2, 0, 0.1, 0, glass);
      cyl(0.02, 0.1, 0, 0.25, 0, glass, 0.016);
      cyl(0.022, 0.02, 0, 0.305, 0, metal);
      break;
    case 'cup':
      cyl(0.055, 0.12, 0, 0.06, 0, main, 0.06);
      add(new T.TorusGeometry(0.035, 0.01, 8, 16), 0.065, 0.06, 0).rotation.y = Math.PI / 2;
      break;
    case 'laptop':
      box(0.35, 0.015, 0.25, 0, 0.0075, 0, metal);
      box(0.35, 0.22, 0.012, 0, 0.12, -0.12, metal).rotation.x = -0.2;
      box(0.31, 0.18, 0.005, 0, 0.12, -0.11, dark).rotation.x = -0.2;
      break;
    case 'screen':
      box(1, 1, 0.06, 0, 0.5, 0, dark);
      box(0.94, 0.92, 0.01, 0, 0.5, 0.032, glass);
      break;
    case 'frame':
      box(1, 1, 0.5, 0, 0.5, 0, wood);
      box(0.82, 0.78, 0.55, 0, 0.5, 0.02, pale);
      break;
    case 'plant':
      cyl(0.18, 0.32, 0, 0.16, 0, new T.MeshStandardMaterial({ color: '#9d7660', roughness: 0.9 }), 0.23);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = 0.12 + random() * 0.1;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        rod(new T.Vector3(0, 0.3, 0), new T.Vector3(x, 0.62 + i * 0.03, z), 0.01, main);
        const leaf = sphere(0.13, x, 0.66 + i * 0.03, z);
        leaf.scale.set(0.5, 1.4, 0.3);
        leaf.rotation.set(random() - 0.5, a, (random() - 0.5) * 0.8);
      }
      break;
    case 'stove':
      box(0.6, 0.9, 0.6);
      box(0.48, 0.4, 0.02, 0, 0.4, 0.31, dark);
      for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15]) cyl(0.1, 0.015, x, 0.91, z, dark);
      break;
    case 'sink':
      box(0.6, 0.8, 0.5);
      box(0.5, 0.02, 0.4, 0, 0.81, 0, metal);
      rod(new T.Vector3(0, 0.82, -0.17), new T.Vector3(0, 1, -0.17), 0.02);
      rod(new T.Vector3(0, 1, -0.17), new T.Vector3(0, 1, 0), 0.02);
      break;
    case 'tub':
      box(0.8, 0.55, 1.7, 0, 0.275, 0, pale);
      box(0.65, 0.025, 1.4, 0, 0.53, 0, glass);
      break;
    case 'toilet':
      box(0.36, 0.4, 0.5, 0, 0.2, 0.05, pale);
      cyl(0.19, 0.06, 0, 0.42, 0.1, pale);
      box(0.4, 0.4, 0.18, 0, 0.6, -0.26, pale);
      break;
    case 'washer':
      box(1, 1, 1);
      cyl(0.3, 0.03, 0, 0.5, 0.5, glass).rotation.x = Math.PI / 2;
      add(new T.TorusGeometry(0.3, 0.04, 10, 32), 0, 0.5, 0.51, metal);
      box(0.9, 0.12, 0.02, 0, 0.9, 0.5, dark);
      break;
    case 'radiator':
      for (let i = 0; i < 12; i++) box(0.07, 0.95, 1, -0.46 + i * 0.084, 0.5);
      break;
    case 'coat-rack':
      cyl(0.02, 1.8, 0, 0.9, 0, wood);
      tripod(0.25, 0.22);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        rod(new T.Vector3(0, 1.62, 0), new T.Vector3(Math.cos(a) * 0.14, 1.75, Math.sin(a) * 0.14), 0.012, wood);
      }
      break;
    case 'fireplace':
      box(0.2, 1.1, 0.4, -0.55);
      box(0.2, 1.1, 0.4, 0.55);
      box(1.4, 0.2, 0.5, 0, 1.15);
      box(1, 0.85, 0.02, 0, 0.45, -0.18, dark);
      break;
    case 'piano':
      box(1.5, 1.1, 0.3, 0, 0.65, -0.15);
      box(1.5, 0.12, 0.65, 0, 0.7);
      legs(1.4, 0.64, 0.5);
      for (let i = 0; i < 28; i++) box(0.045, 0.025, 0.22, -0.67 + i * 0.05, 0.78, 0.19, i % 3 === 1 ? dark : pale);
      break;
    case 'cart':
      box(0.7, 0.6, 0.45, 0, 0.55);
      for (let i = 0; i < 3; i++) box(0.72, 0.01, 0.02, 0, 0.4 + i * 0.15, 0.23, dark);
      wheels(0.62, 0.3, 0.08);
      box(0.74, 0.04, 0.49, 0, 0.86, 0, metal);
      break;
    case 'pallet':
      for (const x of [-0.48, 0, 0.48]) box(0.1, 0.1, 0.8, x, 0.05, 0, wood);
      for (let i = 0; i < 6; i++) box(1.2, 0.025, 0.1, 0, 0.125, -0.35 + i * 0.14, wood);
      break;
    case 'tires':
      for (let i = 0; i < 4; i++) {
        const t = add(new T.TorusGeometry(0.25, 0.09, 12, 28), (random() - 0.5) * 0.04, 0.09 + i * 0.18, 0, rubber);
        t.rotation.x = Math.PI / 2;
      }
      break;
    case 'ladder':
      box(0.04, 2.2, 0.07, -0.23);
      box(0.04, 2.2, 0.07, 0.23);
      for (let i = 1; i <= 8; i++) box(0.46, 0.035, 0.05, 0, i * 0.24);
      break;
    case 'roller':
      box(0.06, 1, 0.2, -0.47, 0.5, 0, dark);
      box(0.06, 1, 0.2, 0.47, 0.5, 0, dark);
      box(1, 0.1, 0.22, 0, 0.95, 0, dark);
      box(0.88, 0.9, 0.06, 0, 0.45);
      for (let i = 0; i < 18; i++) box(0.88, 0.006, 0.075, 0, 0.03 + i * 0.05, 0, metal);
      break;
    case 'car':
    case 'van':
    case 'truck': {
      const tall = shape !== 'car';
      const lights = new T.MeshStandardMaterial({ color: '#fff6dd', emissive: '#fff1c8', emissiveIntensity: 0.6 });
      const tail = new T.MeshStandardMaterial({ color: '#a2362c', emissive: '#6a1a12', emissiveIntensity: 0.5 });
      materials.push(lights, tail);
      // Tinted automotive glass reads as windows rather than panels.
      glass.color.set('#2a3a44');
      glass.transparent = false;
      glass.opacity = 1;
      glass.depthWrite = true;
      glass.roughness = 0.08;
      glass.metalness = 0.6;
      main.metalness = 0.35;
      main.roughness = 0.35;
      box(1.76, 0.5, 4.05, 0, 0.62);
      box(1.72, 0.12, 3.9, 0, 0.36, 0, dark);
      if (tall) {
        box(1.6, 1.3, 3, 0, 1.5, -0.35);
        box(1.44, 0.62, 0.02, 0, 1.64, 1.16, glass);
        for (const x of [-0.8, 0.8]) box(0.02, 0.5, 2.6, x, 1.7, -0.2, glass);
        box(1.6, 0.35, 0.9, 0, 1.03, 1.3);
      } else {
        // A solid, tinted greenhouse reads as a car from any distance; pillars break up the glass.
        const profile = new T.Shape([
          new T.Vector2(-1.2, 0.86), new T.Vector2(1.22, 0.86), new T.Vector2(0.5, 1.42), new T.Vector2(-0.74, 1.42),
        ]);
        const cabin = add(new T.ExtrudeGeometry(profile, { depth: 1.46, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), 0.73, 0, 0, glass);
        cabin.rotation.y = -Math.PI / 2;
        cabin.castShadow = true;
        box(1.4, 0.05, 1.22, 0, 1.45, -0.11);
        for (const side of [-1, 1]) {
          box(0.04, 0.6, 0.12, side * 0.79, 1.14, -0.05);
          box(0.1, 0.08, 0.18, side * 0.88, 0.95, 0.75);
        }
      }
      wheels(1.62, 2.65, 0.33);
      box(1.7, 0.1, 0.1, 0, 0.5, 2.03, dark);
      box(1.7, 0.1, 0.1, 0, 0.5, -2.03, dark);
      for (const x of [-0.6, 0.6]) {
        box(0.3, 0.12, 0.03, x, 0.75, 2.03, lights);
        box(0.3, 0.1, 0.03, x, 0.74, -2.03, tail);
      }
      box(0.6, 0.14, 0.02, 0, 0.62, 2.035, dark);
      group.rotation.y = Math.PI;
      break;
    }
    case 'forklift':
      box(1.1, 0.8, 1.7, 0, 0.7, -0.25);
      box(1, 0.5, 0.6, 0, 1.3, -0.85);
      for (const x of [-0.5, 0.5]) {
        rod(new T.Vector3(x, 1.2, -0.8), new T.Vector3(x, 2.15, -0.3), 0.035, dark);
        rod(new T.Vector3(x, 1.2, 0.2), new T.Vector3(x, 2.15, -0.1), 0.035, dark);
        box(0.08, 2.15, 0.1, x * 0.6, 1.08, 0.72, dark);
        box(0.12, 0.05, 1.1, x * 0.5, 0.08, 1.2, metal);
      }
      box(1.1, 0.06, 1, 0, 2.18, -0.25, dark);
      box(0.3, 0.3, 0.3, 0, 1.05, -0.2, cloth);
      wheels(1.1, 1.4, 0.3, 0.3);
      break;
    case 'car-lift':
      for (const x of [-1.5, 1.5]) {
        box(0.25, 2.2, 0.25, x, 1.1, 0, main);
        box(0.5, 0.04, 0.5, x, 0.02, 0, dark);
        for (const z of [-1, 1]) rod(new T.Vector3(x, 0.35, 0), new T.Vector3(x * 0.55, 0.3, z * 0.75), 0.04, dark);
      }
      box(3.25, 0.12, 0.2, 0, 2.15, 0, main);
      break;
    case 'tarp':
      main.roughness = 0.95;
      blob(1, 1, 1, 0.09, false);
      break;
    case 'scrap': {
      for (let i = 0; i < 14; i++) {
        const w = 0.15 + random() * 0.6, h = 0.02 + random() * 0.14, d = 0.08 + random() * 0.4;
        const m = box(w, h, d, (random() - 0.5) * 1.1, h / 2 + random() * 0.25, (random() - 0.5) * 0.7, [main, metal, rubber, dark][i % 4]);
        m.rotation.set((random() - 0.5) * 0.7, random() * Math.PI, (random() - 0.5) * 0.7);
      }
      for (let i = 0; i < 4; i++)
        rod(new T.Vector3((random() - 0.5) * 1.2, 0.02, (random() - 0.5) * 0.7), new T.Vector3((random() - 0.5) * 1.2, 0.4 * random() + 0.05, (random() - 0.5) * 0.7), 0.02, metal);
      break;
    }
    case 'engine':
      box(0.55, 0.42, 0.5, 0, 0.3);
      box(0.45, 0.16, 0.42, 0, 0.58, 0, dark);
      for (let i = 0; i < 4; i++) cyl(0.04, 0.12, -0.18 + i * 0.12, 0.7, 0, metal);
      cyl(0.13, 0.08, 0.3, 0.3, 0, metal).rotation.z = Math.PI / 2;
      box(0.6, 0.08, 0.55, 0, 0.04, 0, dark);
      break;
    case 'hoist':
      box(0.1, 0.1, 1.6, -0.4, 0.08, 0);
      box(0.1, 0.1, 1.6, 0.4, 0.08, 0, main);
      box(0.9, 0.1, 0.1, 0, 0.08, -0.75);
      box(0.12, 1.7, 0.12, 0, 0.9, -0.7);
      rod(new T.Vector3(0, 1.7, -0.7), new T.Vector3(0, 1.95, 0.8), 0.06, main);
      rod(new T.Vector3(0, 0.5, -0.7), new T.Vector3(0, 1.4, -0.1), 0.035, metal);
      rod(new T.Vector3(0, 1.93, 0.8), new T.Vector3(0, 1.3, 0.8), 0.01, dark);
      for (const [x, z] of [[-0.4, 0.75], [0.4, 0.75], [-0.4, -0.75], [0.4, -0.75]]) wheel(0.05, 0.04, x, 0.05, z);
      break;
    case 'compressor':
      cyl(0.22, 0.9, 0, 0.35, 0, main).rotation.x = Math.PI / 2;
      box(0.35, 0.25, 0.4, 0, 0.66, -0.15, dark);
      cyl(0.06, 0.1, 0, 0.66, 0.2, metal);
      for (const z of [-0.35, 0.35]) wheel(0.08, 0.05, 0.22, 0.08, z);
      break;
    case 'jerry-can':
      box(1, 0.86, 1, 0, 0.43);
      box(0.3, 0.12, 0.6, 0, 0.92, -0.05, main);
      cyl(0.12, 0.1, 0, 0.92, 0.35, dark).rotation.x = 0.6;
      break;
    case 'scaffold':
      for (const x of [-1.2, 1.2]) for (const z of [-0.55, 0.55]) rod(new T.Vector3(x, 0, z), new T.Vector3(x, 2.5, z), 0.025);
      for (const y of [0.05, 1.25, 2.45]) {
        for (const z of [-0.55, 0.55]) rod(new T.Vector3(-1.2, y, z), new T.Vector3(1.2, y, z), 0.02);
        for (const x of [-1.2, 1.2]) rod(new T.Vector3(x, y, -0.55), new T.Vector3(x, y, 0.55), 0.02);
      }
      rod(new T.Vector3(-1.2, 0.05, 0.55), new T.Vector3(1.2, 1.25, 0.55), 0.018);
      box(2.4, 0.04, 1.05, 0, 1.27, 0, wood);
      break;
    case 'bike':
      for (const z of [-0.7, 0.7]) {
        const w = add(new T.TorusGeometry(0.3, 0.03, 10, 32), 0, 0.33, z, rubber);
        w.rotation.y = Math.PI / 2;
      }
      rod(new T.Vector3(0, 0.33, -0.7), new T.Vector3(0, 0.85, 0), 0.035, main);
      rod(new T.Vector3(0, 0.85, 0), new T.Vector3(0, 0.33, 0.7), 0.035, main);
      rod(new T.Vector3(0, 0.33, -0.7), new T.Vector3(0, 0.4, 0.4), 0.035, main);
      box(0.14, 0.05, 0.26, 0, 0.88, -0.1, dark);
      rod(new T.Vector3(-0.3, 1.02, 0.55), new T.Vector3(0.3, 1.02, 0.55));
      break;
    case 'tree':
    case 'palm': {
      const bark = new T.MeshStandardMaterial({ color: '#6f5d48', roughness: 0.95 });
      materials.push(bark);
      cyl(shape === 'palm' ? 0.1 : 0.14, 3, 0, 1.5, 0, bark, 0.08);
      if (shape === 'tree') {
        main.flatShading = true;
        for (let i = 0; i < 6; i++) {
          const leaf = add(new T.IcosahedronGeometry(0.75 + random() * 0.3, 1), (random() - 0.5) * 1.2, 3 + random() * 0.9, (random() - 0.5) * 1.2);
          leaf.rotation.set(random(), random(), random());
        }
      } else
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI * 2) / 8;
          const leaf = sphere(0.6, Math.cos(a) * 0.7, 2.95, Math.sin(a) * 0.7);
          leaf.scale.set(1.8, 0.12, 0.45);
          leaf.rotation.set(0, -a, -0.35);
        }
      break;
    }
    case 'bush':
      main.flatShading = true;
      for (let i = 0; i < 5; i++) add(new T.IcosahedronGeometry(0.35 + random() * 0.2, 1), (random() - 0.5) * 0.9, 0.35 + random() * 0.2, (random() - 0.5) * 0.6);
      break;
    case 'rock':
      blob(1.2, 0.8, 1, 0.12, true);
      break;
    case 'spike':
      main.flatShading = true;
      add(new T.ConeGeometry(0.5, 1, 7, 3), 0, 0.5, 0);
      add(new T.ConeGeometry(0.22, 0.45, 6), 0.3, 0.22, 0.1);
      break;
    case 'crystal': {
      const gem = new T.MeshPhysicalMaterial({ color: object.color, roughness: 0.1, transmission: 0.3, emissive: object.color, emissiveIntensity: 0.25, flatShading: true });
      materials.push(gem);
      for (let i = 0; i < 6; i++) {
        const c = add(new T.ConeGeometry(0.06 + random() * 0.05, 0.3 + random() * 0.35, 6), (random() - 0.5) * 0.3, 0.2, (random() - 0.5) * 0.3, gem);
        c.rotation.set((random() - 0.5) * 0.9, 0, (random() - 0.5) * 0.9);
      }
      break;
    }
    case 'log':
      cyl(0.25, 2, 0, 0.25, 0, wood).rotation.x = Math.PI / 2;
      break;
    case 'camera':
      tripod(1.2, 0.35);
      box(0.18, 0.08, 0.18, 0, 1.24, 0, dark);
      box(0.3, 0.2, 0.18, -0.02, 1.38, 0, dark);
      cyl(0.055, 0.2, 0.22, 1.38, 0, rubber).rotation.z = Math.PI / 2;
      cyl(0.08, 0.06, 0.34, 1.38, 0, dark, 0.06).rotation.z = Math.PI / 2;
      box(0.12, 0.08, 0.08, 0.02, 1.52, 0, dark);
      break;
    case 'stand':
    case 'boom':
      cyl(0.02, 2, 0, 1, 0, metal);
      tripod(0.28, 0.34);
      if (shape === 'boom') {
        rod(new T.Vector3(0, 2, 0), new T.Vector3(1.5, 2.3, 0), 0.02);
        cyl(0.03, 0.2, 1.55, 2.22, 0, cloth).rotation.z = Math.PI / 2;
      }
      break;
    default:
      box(1, 1, 1);
  }
  group.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(group),
    size = bounds.getSize(new T.Vector3());
  // Normalize each model into a 1m cube, with its pivot at the bottom centre.
  const center = bounds.getCenter(new T.Vector3());
  group.position.set(-center.x, -bounds.min.y, -center.z);
  const scaled = new T.Group();
  scaled.add(group);
  scaled.scale.set(1 / Math.max(size.x, 0.001), 1 / Math.max(size.y, 0.001), 1 / Math.max(size.z, 0.001));
  const normalized = new T.Group();
  normalized.add(scaled);
  // Dispose materials unused by the selected model.
  const used = new Set<T.Material>();
  group.traverse((n) => {
    if (n instanceof T.Mesh) for (const m of Array.isArray(n.material) ? n.material : [n.material]) used.add(m);
  });
  for (const m of materials) if (!used.has(m)) m.dispose();
  return normalized;
}

export function disposeObject(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.LineSegments) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof T.Texture) textures.add(value);
      }
    }
    if (o instanceof T.DirectionalLight || o instanceof T.SpotLight || o instanceof T.PointLight) o.shadow.dispose();
  });
  textures.forEach((t) => {
    const bitmap = t.image;
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
    t.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
