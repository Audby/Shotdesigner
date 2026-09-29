import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { moveCamera, dollyCamera, walkCamera, frameSubject, type CameraPose } from './cameraControls';
import { verticalFov } from './model';
const pose: CameraPose = { position: [0, 1.6, 5], target: [0, 1.6, 0] };
const distance = (p: CameraPose) => new T.Vector3(...p.position).distanceTo(new T.Vector3(...p.target));

describe('direct camera controls', () => {
  it('pans and tilts in place without changing focus distance', () => {
    const next = moveCamera(pose, 'look', 0.15, 0.1, 40, 16 / 9);
    expect(next.position).toEqual(pose.position);
    expect(next.target).not.toEqual(pose.target);
    expect(distance(next)).toBeCloseTo(distance(pose));
  });
  it('pans and tilts toward the drag on both axes', () => {
    const right = moveCamera(pose, 'look', 0.1, 0, 40, 16 / 9);
    const down = moveCamera(pose, 'look', 0, 0.1, 40, 16 / 9);
    expect(right.target[0]).toBeGreaterThan(pose.target[0]);
    expect(down.target[1]).toBeLessThan(pose.target[1]);
  });
  it('trucks camera and target together in the image plane', () => {
    const next = moveCamera(pose, 'truck', 0.1, -0.1, 40, 16 / 9);
    const deltaCamera = new T.Vector3(...next.position).sub(new T.Vector3(...pose.position));
    const deltaTarget = new T.Vector3(...next.target).sub(new T.Vector3(...pose.target));
    expect(deltaCamera.distanceTo(deltaTarget)).toBeLessThan(1e-10);
    expect(next.position[0]).toBeLessThan(0);
    expect(next.position[1]).toBeLessThan(pose.position[1]);
    expect(distance(next)).toBeCloseTo(distance(pose));
  });
  it('orbits around the subject and clamps extreme tilts', () => {
    const next = moveCamera(pose, 'orbit', 0.25, 20, 40, 16 / 9);
    expect(next.target).toEqual(pose.target);
    expect(distance(next)).toBeCloseTo(distance(pose));
    expect(next.position.every(Number.isFinite)).toBe(true);
  });
  it('dollies without crossing the target or moving the aim point', () => {
    const near = dollyCamera(pose, -100);
    expect(distance(near)).toBeCloseTo(0.15);
    expect(near.target).toEqual(pose.target);
    expect(near.position[2]).toBeGreaterThan(0);
    expect(distance(dollyCamera(pose, 100))).toBeCloseTo(500);
  });
  it.each([16 / 9, 2.39, 9 / 16])('fits a requested subject height at aspect %s', aspect => {
    const next = frameSubject(pose, [2, 1.3, -1], 2.1, 50, 36, aspect);
    const camera = new T.PerspectiveCamera(verticalFov(50, 36, aspect), aspect, 0.05, 1000);
    camera.position.fromArray(next.position);
    camera.lookAt(new T.Vector3(...next.target));
    camera.updateMatrixWorld();
    const top = new T.Vector3(2, 1.3 + 2.1 / 2, -1).project(camera);
    const bottom = new T.Vector3(2, 1.3 - 2.1 / 2, -1).project(camera);
    expect(top.y).toBeCloseTo(1);
    expect(bottom.y).toBeCloseTo(-1);
  });
});

describe('keyboard navigation', () => {
  it('moves on the floor plane while preserving pitch and aim distance', () => {
    const tilted: CameraPose = { position: [0, 4, 5], target: [0, 0, 0] };
    const next = walkCamera(tilted, 0, 1, 0, 2);
    expect(next.position).toEqual([0, 4, 3]);
    expect(next.target).toEqual([0, 0, -2]);
    expect(distance(next)).toBeCloseTo(distance(tilted));
  });
  it('normalizes diagonals and supports elevation and vertical views', () => {
    const next = walkCamera(pose, 1, 1, 0, 2);
    expect(new T.Vector3(...next.position).distanceTo(new T.Vector3(...pose.position))).toBeCloseTo(2);
    expect(walkCamera(pose, 0, 0, 1, 2).position[1]).toBeCloseTo(3.6);
    expect(walkCamera({position:[0,5,0],target:[0,0,0]},0,1,0,1).position.every(Number.isFinite)).toBe(true);
  });
});
