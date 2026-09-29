import * as T from 'three';

/** A rounded name tag drawn into a sprite, used for cameras and actors. */
export function makeLabelSprite(text: string, sizeAttenuation = true) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 30px system-ui, sans-serif';
  const w = Math.min(248, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(20,24,24,0.82)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 46, 12);
  ctx.fill();
  ctx.fillStyle = '#f1e6d2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32, 230);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation }));
  sprite.renderOrder = 5;
  sprite.userData.text = text;
  return sprite;
}

const ACTIVE = new T.Color('#e8b86a');
const IDLE = new T.Color('#9aa5a2');

/**
 * The shot camera as it appears on set: a camera body you can click and move, and a frustum
 * shaped like the frame that reaches toward the aim point, so blocking can be judged from above.
 */
export class CameraRig {
  readonly root = new T.Group();
  readonly body = new T.Group();
  private frustum: T.LineSegments;
  private fill: T.Mesh;
  private bodyMaterial = new T.MeshStandardMaterial({ color: '#2b3033', roughness: 0.5, metalness: 0.3 });
  private accentMaterial = new T.MeshStandardMaterial({ color: ACTIVE, emissive: ACTIVE, emissiveIntensity: 0.35, roughness: 0.5 });
  private lineMaterial = new T.LineBasicMaterial({ color: ACTIVE, transparent: true, opacity: 0.9, depthTest: true });
  private fillMaterial = new T.MeshBasicMaterial({ color: ACTIVE, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false });
  private label?: T.Sprite;

  constructor(readonly shotId: string) {
    const add = (g: T.BufferGeometry, x: number, y: number, z: number, m: T.Material = this.bodyMaterial) => {
      const mesh = new T.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.userData.shotId = shotId;
      this.body.add(mesh);
      return mesh;
    };
    // Looks down -Z like a three.js camera.
    add(new T.BoxGeometry(0.16, 0.18, 0.28), 0, 0, 0.04);
    add(new T.CylinderGeometry(0.055, 0.06, 0.16, 20), 0, 0, -0.17).rotation.x = Math.PI / 2;
    add(new T.BoxGeometry(0.2, 0.15, 0.03), 0, 0, -0.27, this.accentMaterial);
    add(new T.CylinderGeometry(0.07, 0.07, 0.05, 20), 0, 0.14, 0.08).rotation.z = Math.PI / 2;
    add(new T.CylinderGeometry(0.07, 0.07, 0.05, 20), 0, 0.14, -0.06).rotation.z = Math.PI / 2;
    add(new T.BoxGeometry(0.02, 0.08, 0.12), 0.1, 0.02, 0.08);
    this.body.traverse((n) => { if (n instanceof T.Mesh) n.castShadow = false; });
    const lines = new T.BufferGeometry();
    lines.setAttribute('position', new T.Float32BufferAttribute(new Array(16 * 3).fill(0), 3));
    this.frustum = new T.LineSegments(lines, this.lineMaterial);
    const plane = new T.BufferGeometry();
    plane.setAttribute('position', new T.Float32BufferAttribute(new Array(15 * 3).fill(0), 3));
    this.fill = new T.Mesh(plane, this.fillMaterial);
    this.frustum.frustumCulled = this.fill.frustumCulled = false;
    this.root.add(this.body, this.frustum, this.fill);
  }

  setLabel(text: string) {
    if (this.label?.userData.text === text) return;
    if (this.label) {
      this.root.remove(this.label);
      (this.label.material as T.SpriteMaterial).map?.dispose();
      this.label.material.dispose();
    }
    this.label = makeLabelSprite(text);
    this.label.scale.set(0.8, 0.2, 1);
    this.root.add(this.label);
  }

  /** Place the rig from a posed camera; the frustum ends at the aim point (capped for long lenses). */
  update(camera: T.PerspectiveCamera, aimDistance: number, active: boolean) {
    this.body.position.copy(camera.position);
    this.body.quaternion.copy(camera.quaternion);
    this.body.scale.setScalar(active ? 1 : 0.8);
    const color = active ? ACTIVE : IDLE;
    this.accentMaterial.color.copy(color);
    this.accentMaterial.emissive.copy(color);
    this.lineMaterial.color.copy(color);
    this.lineMaterial.opacity = active ? 0.95 : 0.45;
    this.fillMaterial.color.copy(color);
    this.fillMaterial.opacity = active ? 0.035 : 0.015;
    const depth = T.MathUtils.clamp(aimDistance, 0.6, active ? 30 : 3);
    const h = Math.tan(T.MathUtils.degToRad(camera.fov) / 2) * depth;
    const w = h * camera.aspect;
    const o = new T.Vector3(0, 0, -0.26).applyQuaternion(camera.quaternion).add(camera.position);
    const corners = [[-w, h], [w, h], [w, -h], [-w, -h]].map(([x, y]) =>
      new T.Vector3(x, y, -depth).applyQuaternion(camera.quaternion).add(camera.position),
    );
    const up = new T.Vector3(0, h * 1.18, -depth).applyQuaternion(camera.quaternion).add(camera.position);
    const pts: T.Vector3[] = [];
    for (let i = 0; i < 4; i++) pts.push(o, corners[i], corners[i], corners[(i + 1) % 4]);
    // A small notch above the frame marks "up", which matters once a Dutch angle is applied.
    const lp = this.frustum.geometry.attributes.position as T.BufferAttribute;
    pts.forEach((p, i) => lp.setXYZ(i, p.x, p.y, p.z));
    lp.needsUpdate = true;
    this.frustum.geometry.setDrawRange(0, 16);
    const fp = this.fill.geometry.attributes.position as T.BufferAttribute;
    const tris = [o, corners[0], corners[1], o, corners[1], corners[2], o, corners[2], corners[3], o, corners[3], corners[0], corners[0], corners[1], up];
    tris.forEach((p, i) => fp.setXYZ(i, p.x, p.y, p.z));
    fp.needsUpdate = true;
    if (this.label) {
      this.label.position.copy(camera.position).add(new T.Vector3(0, 0.32, 0));
      this.label.visible = true;
    }
  }

  dispose() {
    this.root.traverse((n) => {
      if (n instanceof T.Mesh || n instanceof T.LineSegments || n instanceof T.Sprite) {
        n.geometry.dispose();
        const m = n.material as T.Material & { map?: T.Texture };
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
