import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PrevisScene } from './types';

/** Gradient dome: a readable horizon instead of a flat void, tinted by the scene background. */
function createSky() {
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new T.Color() },
      horizon: { value: new T.Color() },
      bottom: { value: new T.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.55, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, 0.08, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(900, 32, 16), material);
  sky.frustumCulled = false;
  sky.userData.noAO = true;
  sky.renderOrder = -10;
  return sky;
}

/** Anti-aliased metre grid with 5 m major lines that fades toward the horizon. */
function createGrid() {
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: {
      color: { value: new T.Color('#ffffff') },
      opacity: { value: 0.16 },
      fadeDistance: { value: 60 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity; uniform float fadeDistance;
      varying vec3 vWorld;
      float line(vec2 p, float size) {
        vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float minor = line(vWorld.xz, 1.0) * 0.55;
        float major = line(vWorld.xz, 5.0);
        vec2 axis = abs(vWorld.xz) / fwidth(vWorld.xz);
        float fade = 1.0 - smoothstep(fadeDistance * 0.35, fadeDistance, distance(cameraPosition.xz, vWorld.xz));
        float a = max(minor, major) * opacity * fade;
        vec3 c = color;
        if (axis.y < 1.2) { c = vec3(0.86, 0.42, 0.36); a = max(a, 0.45 * fade); }
        if (axis.x < 1.2) { c = vec3(0.4, 0.58, 0.86); a = max(a, 0.45 * fade); }
        if (a < 0.003) discard;
        gl_FragColor = vec4(c, a);
      }`,
  });
  const grid = new T.Mesh(new T.PlaneGeometry(400, 400), material);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.002;
  grid.renderOrder = 1;
  return grid;
}

export class StageEnvironment {
  readonly root = new T.Group();
  readonly grid = createGrid();
  readonly sun = new T.DirectionalLight('#fff1dc', 2);
  private sky = createSky();
  private hemi = new T.HemisphereLight('#dfe8f0', '#57524a', 0.6);
  private bounce = new T.DirectionalLight('#d5e3f0', 0.4);
  private floor: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private ground: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private envMap?: T.Texture;
  private focus = new T.Vector3();
  private radius = 12;

  constructor(renderer: T.WebGLRenderer, private world: T.Scene) {
    const pmrem = new T.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    room.traverse((n) => { if (n instanceof T.Mesh) { n.geometry.dispose(); (n.material as T.Material).dispose(); } });
    pmrem.dispose();
    world.environment = this.envMap;
    this.floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ roughness: 0.88 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.004;
    this.floor.receiveShadow = true;
    this.ground = new T.Mesh(new T.PlaneGeometry(1200, 1200), new T.MeshStandardMaterial({ roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.012;
    this.ground.receiveShadow = true;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2.5;
    this.bounce.position.set(-6, 4, -8);
    this.root.add(this.sky, this.ground, this.floor, this.hemi, this.sun, this.sun.target, this.bounce);
    world.add(this.root);
  }

  /** Aim the sun's shadow frustum at the set, so large diagrams keep crisp contact shadows. */
  fitShadows(bounds: T.Box3) {
    if (bounds.isEmpty()) bounds = new T.Box3(new T.Vector3(-5, 0, -5), new T.Vector3(5, 3, 5));
    bounds.getCenter(this.focus);
    this.radius = Math.max(6, bounds.getSize(new T.Vector3()).length() * 0.6);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -this.radius;
    cam.right = cam.top = this.radius;
    cam.near = 0.5;
    cam.far = this.radius * 4 + 60;
    cam.updateProjectionMatrix();
  }

  apply(data: PrevisScene) {
    const bg = new T.Color(data.backgroundColor);
    const floor = new T.Color(data.floorColor);
    const sky = this.sky.material as T.ShaderMaterial;
    const hsl = { h: 0, s: 0, l: 0 };
    bg.getHSL(hsl);
    sky.uniforms.horizon.value.copy(bg).lerp(new T.Color('#ffffff'), 0.12);
    sky.uniforms.top.value.setHSL(hsl.h, Math.min(1, hsl.s * 1.1), hsl.l * 0.55);
    sky.uniforms.bottom.value.copy(bg).multiplyScalar(0.7);
    this.world.fog = this.world.fog instanceof T.Fog ? this.world.fog : new T.Fog(bg, 40, 220);
    this.world.fog.color.copy(sky.uniforms.horizon.value);
    this.floor.material.color.copy(floor);
    this.floor.scale.set(data.floorSize[0], data.floorSize[1], 1);
    // The surrounding ground recedes toward the horizon colour so the set floor reads as a stage.
    this.ground.material.color.copy(floor).lerp(bg, 0.55).multiplyScalar(0.85);
    const ambient = data.ambientIntensity;
    this.world.environmentIntensity = 0.35 * ambient;
    this.hemi.intensity = 0.45 * ambient;
    this.bounce.intensity = 0.25 * ambient;
    this.sun.intensity = data.daylightIntensity * 1.4;
    const azimuth = T.MathUtils.degToRad(data.sunAzimuth ?? 225);
    const elevation = T.MathUtils.degToRad(data.sunElevation ?? 50);
    const dir = new T.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    // A low sun warms up; a high sun stays neutral.
    this.sun.color.setHSL(0.09, 0.6, 0.93 - 0.2 * (1 - Math.min(1, elevation / 0.6)));
    this.sun.position.copy(this.focus).addScaledVector(dir, this.radius * 2 + 20);
    this.sun.target.position.copy(this.focus);
    this.sun.target.updateMatrixWorld();
    this.grid.visible = true;
  }

  dispose() {
    this.envMap?.dispose();
  }
}
