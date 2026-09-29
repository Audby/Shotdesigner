import * as T from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Lens blur from real optics: the circle of confusion comes from focal length, f-stop, focus
 * distance and sensor width, so a 85 mm at f/1.4 falls off far faster than a 24 mm at f/8.
 */
export class DepthOfFieldPass extends Pass {
  readonly settings = { focalLength: 35, fStop: 2.8, focusDistance: 3, sensorWidth: 36 };
  private depthTarget: T.WebGLRenderTarget;
  private depthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, blending: T.NoBlending });
  private quad: FullScreenQuad;
  private material: T.ShaderMaterial;

  constructor(private scene: T.Scene, public camera: T.PerspectiveCamera) {
    super();
    this.depthTarget = new T.WebGLRenderTarget(1, 1, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    this.material = new T.ShaderMaterial({
      defines: { SAMPLES: 48 },
      uniforms: {
        tColor: { value: null },
        tDepth: { value: this.depthTarget.texture },
        near: { value: 0.05 },
        far: { value: 2000 },
        cocScale: { value: 0 },
        focus: { value: 3 },
        focal: { value: 0.035 },
        aspect: { value: 16 / 9 },
        maxCoc: { value: 0.02 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform float near; uniform float far; uniform float cocScale; uniform float focus; uniform float focal;
        uniform float aspect; uniform float maxCoc;
        varying vec2 vUv;
        // Circle of confusion as a fraction of frame width.
        float coc(vec2 uv) {
          float d = -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, uv)), near, far);
          return min(cocScale * abs(d - focus) / max(d, focal), maxCoc);
        }
        void main() {
          float center = coc(vUv);
          vec4 sum = texture2D(tColor, vUv);
          float weight = 1.0;
          if (center > 0.0004) {
            for (int i = 1; i < SAMPLES; i++) {
              float r = sqrt(float(i) / float(SAMPLES));
              float a = float(i) * 2.39996323;
              vec2 offset = vec2(cos(a), sin(a) * aspect) * r * center;
              vec2 uv = vUv + offset;
              // Sharp foreground must not smear onto the blurred background behind it.
              float w = smoothstep(0.0, 1.0, coc(uv) / max(center * r, 1e-5));
              sum += texture2D(tColor, uv) * w;
              weight += w;
            }
          }
          gl_FragColor = sum / weight;
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number) {
    this.depthTarget.setSize(width, height);
    this.material.uniforms.aspect.value = width / height;
  }

  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget) {
    const { focalLength, fStop, focusDistance, sensorWidth } = this.settings;
    const f = focalLength / 1000;
    const focus = Math.max(focusDistance, f * 1.05);
    const u = this.material.uniforms;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    u.focus.value = focus;
    u.focal.value = f;
    u.cocScale.value = (f * f) / (fStop * (focus - f)) / (sensorWidth / 1000);
    u.tColor.value = readBuffer.texture;
    const override = this.scene.overrideMaterial, clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha();
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(this.depthTarget);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = override;
    renderer.setClearColor(clear, alpha);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() {
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
