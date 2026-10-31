// Sun shadow map: an orthographic depth render of the casters (layer 1) in a box ahead of the
// camera, snapped to texels so edges don't shimmer, sampled with hardware PCF in the shaders.
import * as THREE from "./three.module.min.js";
import { DEPTH_VS, DEPTH_FS } from "./shaders.js";

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class SunShadow {
  constructor(renderer, U, size = 2048, radius = 170) {
    this.r = renderer;
    this.U = U;
    this.size = size;
    this.radius = radius;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    const dt = new THREE.DepthTexture(size, size);
    dt.type = THREE.UnsignedIntType;
    dt.compareFunction = THREE.LessEqualCompare;
    dt.minFilter = dt.magFilter = THREE.LinearFilter;
    this.rt.depthTexture = dt;
    this.cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 1, 2400);
    this.cam.layers.set(1);
    this.mat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, side: THREE.DoubleSide, colorWrite: false });
    this.center = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    U.uShadow.value = dt;
    U.uShadowTexel.value = 1 / size;
  }

  setSize(size, radius) {
    if (size === this.size && radius === this.radius) return;
    this.size = size; this.radius = radius;
    this.rt.setSize(size, size);
    this.rt.depthTexture.image.width = this.rt.depthTexture.image.height = size;
    Object.assign(this.cam, { left: -radius, right: radius, top: radius, bottom: -radius });
    this.cam.updateProjectionMatrix();
    this.U.uShadowTexel.value = 1 / size;
  }

  update(scene, camera) {
    const U = this.U;
    const L = U.uLightDir.value;
    // Centre the box a little ahead of the camera, on the ground.
    camera.getWorldDirection(this.tmp);
    this.tmp.y = 0;
    if (this.tmp.lengthSq() < 1e-4) this.tmp.set(0, 0, -1);
    this.tmp.normalize();
    this.center.copy(camera.position).addScaledVector(this.tmp, this.radius * 0.55);
    this.center.y = camera.position.y - 4;
    const cam = this.cam;
    cam.position.copy(this.center).addScaledVector(L, 1100);
    cam.up.set(0, 1, 0);
    if (Math.abs(L.y) > 0.99) cam.up.set(0, 0, 1);
    cam.lookAt(this.center);
    cam.updateMatrixWorld();
    // Snap the box to whole texels in light space.
    const texel = (2 * this.radius) / this.size;
    const p = this.center.clone().applyMatrix4(cam.matrixWorldInverse);
    const dx = Math.round(p.x / texel) * texel - p.x, dy = Math.round(p.y / texel) * texel - p.y;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, -dx).addScaledVector(up, -dy);
    cam.updateMatrixWorld();
    const r = this.r;
    const prevTarget = r.getRenderTarget();
    scene.overrideMaterial = this.mat;
    r.setRenderTarget(this.rt);
    r.clear(true, true, false);
    r.render(scene, cam);
    scene.overrideMaterial = null;
    r.setRenderTarget(prevTarget);
    U.uShadowMat.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }
}
