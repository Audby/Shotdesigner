import * as T from 'three';
import type { CameraKeyframe, Vec3 } from './types';
import { verticalFov } from './model';

export type CameraGesture = 'look' | 'truck' | 'orbit';
export type CameraPose = Pick<CameraKeyframe, 'position' | 'target'> & Partial<Pick<CameraKeyframe, 'roll' | 'lens'>>;
const tuple = (v: T.Vector3) => v.toArray() as Vec3;

/** Screen-relative controls preserve the lens and the distance to the aim point. */
export function moveCamera(pose: CameraPose, mode: CameraGesture, dx: number, dy: number, fov: number, aspect: number): CameraPose {
  const position = new T.Vector3(...pose.position);
  const target = new T.Vector3(...pose.target);
  const offset = target.clone().sub(position);
  const distance = Math.max(0.1, offset.length());
  if (mode === 'truck') {
    const forward = offset.clone().normalize();
    const right = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0)).normalize();
    const up = new T.Vector3().crossVectors(right, forward).normalize();
    const span = 2 * distance * Math.tan(T.MathUtils.degToRad(fov) / 2);
    const shift = right.multiplyScalar(-dx * span * aspect).add(up.multiplyScalar(dy * span));
    position.add(shift);
    target.add(shift);
  } else {
    const spherical = new T.Spherical().setFromVector3(mode === 'orbit' ? offset.negate() : offset);
    const verticalAngle = mode === 'orbit' ? Math.PI : T.MathUtils.degToRad(fov);
    const horizontalAngle = mode === 'orbit' ? Math.PI : 2 * Math.atan(Math.tan(verticalAngle / 2) * aspect);
    spherical.theta -= dx * horizontalAngle;
    // Pan and tilt follow the pointer like a fluid head (drag down to tilt down); orbit drags the
    // scene around the subject instead, like the set view.
    const tilt = mode === 'orbit' ? -dy : dy;
    spherical.phi = T.MathUtils.clamp(spherical.phi + tilt * verticalAngle, 0.02, Math.PI - 0.02);
    const direction = new T.Vector3().setFromSpherical(spherical);
    if (mode === 'orbit') position.copy(target).add(direction);
    else target.copy(position).add(direction);
  }
  return { ...pose, position: tuple(position), target: tuple(target) };
}

/** Dolly physically moves the camera, leaving the aim point fixed. */
export function dollyCamera(pose: CameraPose, amount: number): CameraPose {
  const target = new T.Vector3(...pose.target);
  const offset = new T.Vector3(...pose.position).sub(target);
  const distance = T.MathUtils.clamp(offset.length() * Math.exp(amount), 0.15, 500);
  return { ...pose, position: tuple(target.clone().add(offset.setLength(distance))), target: [...pose.target] };
}

export function frameSubject(pose: CameraPose, center: Vec3, height: number, lens: number, sensor: number, aspect: number): CameraPose {
  const direction = new T.Vector3(...pose.position).sub(new T.Vector3(...pose.target));
  direction.y = 0;
  if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
  const distance = height / (2 * Math.tan(T.MathUtils.degToRad(verticalFov(lens, sensor, aspect)) / 2));
  const target = new T.Vector3(...center);
  return { ...pose, position: tuple(target.clone().add(direction.setLength(distance))), target: [...center] };
}

/** Walk parallel to the floor, regardless of camera pitch; Q/E control elevation. */
export function walkCamera(pose: CameraPose, right: number, forward: number, up: number, distance: number): CameraPose {
  const direction = new T.Vector3(...pose.target).sub(new T.Vector3(...pose.position));
  direction.y = 0;
  if (direction.lengthSq() < 0.00001) direction.set(0, 0, -1);
  direction.normalize();
  const lateral = new T.Vector3().crossVectors(direction, new T.Vector3(0, 1, 0));
  const shift = direction.multiplyScalar(forward).add(lateral.multiplyScalar(right));
  shift.y = up;
  if (shift.lengthSq() > 0) shift.normalize().multiplyScalar(distance);
  return { ...pose, position: tuple(new T.Vector3(...pose.position).add(shift)), target: tuple(new T.Vector3(...pose.target).add(shift)) };
}

/** Aim a camera through its keyframe values, including a Dutch roll around the lens axis. */
export function orientCamera(camera: T.PerspectiveCamera, pose: CameraPose) {
  camera.position.set(...pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new T.Vector3(...pose.target));
  if (pose.roll) camera.rotateZ(T.MathUtils.degToRad(-pose.roll));
  camera.updateMatrixWorld();
}

/** Readouts a camera operator would quote: height, tilt, distance to the aim point. */
export function describePose(pose: CameraPose) {
  const [px, py, pz] = pose.position, [tx, ty, tz] = pose.target;
  const flat = Math.hypot(tx - px, tz - pz);
  return {
    height: py,
    tilt: T.MathUtils.radToDeg(Math.atan2(ty - py, flat)),
    distance: Math.hypot(tx - px, ty - py, tz - pz),
    heading: (T.MathUtils.radToDeg(Math.atan2(tx - px, -(tz - pz))) + 360) % 360,
  };
}
