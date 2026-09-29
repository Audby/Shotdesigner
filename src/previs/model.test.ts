import { describe, expect, it } from 'vitest';
import * as T from 'three';
import {
  createScene,
  createElementFromTemplate,
  duplicateScene,
} from '../utils/sceneUtils';
import {
  createShot,
  createShotListProject,
  normalizeShotListProject,
} from '../utils/shotListUtils';
import type { Shot } from '../types';
import { elementTemplates } from '../data/elementLibrary';
import { previsAssets, assetById, kelvinToHex } from './catalog';
import {
  addAsset,
  applyBlocking,
  cameraAt,
  clearObjectKeys,
  objectPoseAt,
  setObjectKey,
  transformAtTime,
  createPrevisScene,
  matchDiagramFootprints,
  createPrevisShot,
  reconcilePrevis,
  resizeDuration,
  resolveObjects,
  setKeyframe,
  updateObject,
  verticalFov,
} from './model';
import { buildObject, disposeObject } from './geometry';
import { describePose, dollyCamera, moveCamera, orientCamera } from './cameraControls';
import type { PrevisObject } from './types';

const element = (type: string, x = 500, y = 500) =>
  createElementFromTemplate(
    elementTemplates.find((t) => t.type === type)!,
    x,
    y,
    1,
  );

describe('diagram and 3D document synchronization', () => {
  it('converts real wall lengths while ignoring annotations and preserving the source', () => {
    const wall = { ...element('wall'), width: 800, height: 12, rotation: 90 };
    const text = element('text-note');
    const source = JSON.stringify([wall, text]);
    const data = createPrevisScene(createScene(), [wall, text]);
    const resolved = resolveObjects(data, [wall, text]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].dimensions).toEqual([8, 2.8, 0.12]);
    expect(resolved[0].rotation[1]).toBe(-90);
    expect(JSON.stringify([wall, text])).toBe(source);
  });
  it('carries diagram edits into 3D without overwriting elevation or material', () => {
    const el = element('chair');
    const data = createPrevisScene(createScene(), [el]);
    data.objects[0].position[1] = 0.8;
    data.objects[0].color = '#ff0000';
    const moved = {
      ...el,
      x: el.x + 200,
      rotation: 45,
      width: el.width * 2,
      visible: false,
    };
    const o = resolveObjects(data, [moved])[0];
    expect(o.position).toEqual([2, 0.8, 0]);
    expect(o.dimensions[0]).toBeCloseTo(data.objects[0].dimensions[0] * 2);
    expect(o.rotation[1]).toBe(-45);
    expect(o.visible).toBe(false);
    expect(o.color).toBe('#ff0000');
  });
  it('commits 3D transforms back to 2D once and survives repeated resolution', () => {
    const el = element('wall');
    const data = createPrevisScene(createScene(), [el]);
    const o = resolveObjects(data, [el])[0];
    const updated = updateObject(data, [el], o.id, {
      position: [3, 1, -2],
      rotation: [0, -30, 0],
      dimensions: [6, 4, 0.2],
    });
    const result = resolveObjects(updated.previs, updated.elements)[0];
    expect(result.position).toEqual([3, 1, -2]);
    expect(result.dimensions).toEqual([6, 4, 0.2]);
    expect(updated.elements[0].x).toBe(800);
    expect(updated.elements[0].y).toBe(300);
    expect(updated.elements[0].rotation).toBe(30);
    const again = updateObject(updated.previs, updated.elements, o.id, {
      position: [4, 1, -2],
    });
    expect(resolveObjects(again.previs, again.elements)[0].dimensions).toEqual([
      6, 4, 0.2,
    ]);
  });
  it('reconciles additions/deletions without discarding camera motion or 3D-only assets', () => {
    const el = element('chair'),
      next = element('sofa');
    const data = createPrevisScene(createScene(), [el]);
    const standalone: PrevisObject = {
      ...data.objects[0],
      id: 'standalone',
      sourceElementId: undefined,
    };
    data.objects.push(standalone);
    data.shots[0].keyframes.push({
      ...data.shots[0].keyframes[0],
      id: 'end',
      time: 4,
      position: [1, 2, 3],
    });
    const result = reconcilePrevis(data, [next]);
    expect(result.objects).toHaveLength(2);
    expect(result.objects.some((o) => o.id === 'standalone')).toBe(true);
    expect(result.objects.some((o) => o.sourceElementId === el.id)).toBe(false);
    expect(result.shots).toBe(data.shots);
    expect(reconcilePrevis(result, [next])).toBe(result);
  });
  it('projects newly added 3D assets into the diagram with stable dimensions', () => {
    const data = createPrevisScene(createScene(), []);
    const result = addAsset(data, [], assetById.get('wall')!, [2, 0, -3]);
    expect(result.elements[0].width).toBe(300);
    expect(resolveObjects(result.previs, result.elements)[0].position).toEqual([
      2, 0, -3,
    ]);
    expect(
      resolveObjects(result.previs, result.elements)[0].dimensions,
    ).toEqual([3, 2.8, 0.15]);
  });
  it('preserves cameras, thumbnails, and embedded models through scene duplication', () => {
    const scene = createScene();
    scene.previs = createPrevisScene(scene, [element('chair')]);
    scene.previs.objects[0].modelData =
      'data:model/gltf-binary;base64,dGVzdA==';
    scene.previs.shots[0].reference = {
      dataUrl: 'data:image/png;base64,test',
      time: 0,
      createdAt: new Date().toISOString(),
    };
    const copy = duplicateScene(scene);
    expect(copy.id).not.toBe(scene.id);
    expect(copy.previs).toEqual(JSON.parse(JSON.stringify(scene.previs)));
    copy.previs!.objects[0].label = 'Edited copy';
    expect(scene.previs.objects[0].label).not.toBe('Edited copy');
  });
});

describe('film camera and motion', () => {
  it('computes perspective from lens, sensor and frame format', () => {
    expect(verticalFov(50, 36, 16 / 9)).toBeCloseTo(22.895, 2);
    expect(verticalFov(24, 36, 16 / 9)).toBeGreaterThan(
      verticalFov(50, 36, 16 / 9),
    );
    expect(verticalFov(50, 24, 16 / 9)).toBeLessThan(
      verticalFov(50, 36, 16 / 9),
    );
  });
  it('holds a single frame and interpolates camera position, aim and lens', () => {
    const shot = createPrevisShot('Dolly', [0, 2, 0], [0, 1, 0]);
    expect(cameraAt(shot, 3).position).toEqual([0, 2, 0]);
    shot.ease = false;
    shot.keyframes.push({
      id: 'end',
      time: 4,
      position: [4, 2, 0],
      target: [4, 1, 0],
      lens: 85,
    });
    expect(cameraAt(shot, 2).position).toEqual([2, 2, 0]);
    expect(cameraAt(shot, 2).target).toEqual([2, 1, 0]);
    expect(cameraAt(shot, 2).lens).toBe(60);
    expect(cameraAt(shot, -1).position).toEqual([0, 2, 0]);
    expect(cameraAt(shot, 100).position).toEqual([4, 2, 0]);
  });
  it('replaces a frame at the same time and scales timing when duration changes', () => {
    const shot = createPrevisShot('Move');
    const updated = setKeyframe(shot, {
      ...shot.keyframes[0],
      id: 'new',
      time: 0.01,
      lens: 50,
    });
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes[0].lens).toBe(50);
    const withEnd = setKeyframe(shot, {
      ...shot.keyframes[0],
      id: 'end',
      time: 4,
    });
    expect(resizeDuration(withEnd, 8).keyframes[1].time).toBe(8);
    expect(resizeDuration(withEnd, 0).duration).toBe(0.5);
  });
  it('supports a curved path with finite positions at every sample', () => {
    const shot = createPrevisShot('Arc', [0, 2, 0]);
    shot.path = 'smooth';
    shot.ease = false;
    shot.keyframes.push(
      { ...shot.keyframes[0], id: 'mid', time: 2, position: [2, 2, 3] },
      { ...shot.keyframes[0], id: 'end', time: 4, position: [4, 2, 0] },
    );
    expect(cameraAt(shot, 2).position).toEqual([2, 2, 3]);
    expect(cameraAt(shot, 1).position[2]).toBeGreaterThan(1.5);
    for (let t = 0; t <= 4; t += 0.1)
      expect(cameraAt(shot, t).position.every(Number.isFinite)).toBe(true);
  });
});

describe('3D library', () => {
  it('provides finite, ground-pivoted models for every catalog entry', () => {
    for (const asset of previsAssets) {
      const root = buildObject({
        ...asset,
        id: asset.id,
        assetId: asset.id,
        label: asset.name,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        visible: true,
        locked: false,
      });
      const bounds = new T.Box3().setFromObject(root),
        size = bounds.getSize(new T.Vector3());
      expect(
        size
          .toArray()
          .every((n) => Number.isFinite(n) && Math.abs(n - 1) < 0.01),
        asset.name,
      ).toBe(true);
      expect(bounds.min.y, asset.name).toBeCloseTo(0, 3);
      disposeObject(root);
    }
  });
});

describe('shot list compatibility', () => {
  it('retains the camera link through normalization and accepts legacy shots', () => {
    const project = createShotListProject();
    const shot: Shot = {
      ...createShot('1A'),
      linkedSceneId: 'set',
      previsShotId: 'camera',
    };
    project.scenes[0].shots.push(shot);
    expect(
      normalizeShotListProject(JSON.parse(JSON.stringify(project))).scenes[0]
        .shots[0].previsShotId,
    ).toBe('camera');
    // A shot staged through its scene's set keeps its camera without a link of its own.
    delete shot.linkedSceneId;
    expect(
      normalizeShotListProject(project).scenes[0].shots[0].previsShotId,
    ).toBe('camera');
    expect(
      normalizeShotListProject({ scenes: [{ shots: [{ number: 'old' }] }] })
        .scenes[0].shots[0].number,
    ).toBe('old');
  });
});


describe('real scene proportions', () => {
  it('orients the actor face toward the same direction as its plan notch', () => {
    const asset = assetById.get('actor-male')!;
    const root = buildObject({ ...asset, id:'person',assetId:asset.id,label:'Person',position:[0,0,0],rotation:[0,0,0],visible:true,locked:false });
    root.updateMatrixWorld(true);
    let noseZ = 0;
    root.traverse(node => {
      if (node instanceof T.Mesh && node.geometry instanceof T.SphereGeometry && node.geometry.parameters.radius === 0.019) noseZ = node.getWorldPosition(new T.Vector3()).z;
    });
    expect(noseZ).toBeLessThan(0);
    disposeObject(root);
  });

  it('fits the Verksted car and workbench to their measured plan footprint', () => {
    const car = { ...element('car'), width: 276.98885, height: 404.8771, rotation: -90 };
    const wall = { ...element('wall'), width: 1182.578, height: 12 };
    const bench = { ...element('workbench'), width: 543.83, height: 62.605 };
    const actor = element('actor-male');
    const data = createPrevisScene(createScene(), [car, wall, bench, actor]);
    expect(data.objects[0].dimensions[0]).toBeCloseTo(2.7698885);
    expect(data.objects[0].dimensions[2]).toBeCloseTo(4.048771);
    expect(data.objects[2].dimensions[0]).toBeCloseTo(5.4383);
    expect(data.objects[2].dimensions[2]).toBeCloseTo(0.62605);
    for (const o of data.objects) {
      const model = buildObject(o);
      model.scale.fromArray(o.dimensions);
      model.rotation.set(...o.rotation.map(n => n * Math.PI / 180) as [number, number, number]);
      const bounds = new T.Box3().setFromObject(model);
      expect(bounds.min.y).toBeCloseTo(0, 5);
      expect(bounds.max.y).toBeCloseTo(o.dimensions[1], 4);
      disposeObject(model);
    }
  });
  it('supports cave treatment without altering plan geometry or making the override permanent', () => {
    const wall = element('wall');
    const data = createPrevisScene({ ...createScene(), wallStyle: 'cave' }, [wall]);
    const resolved = resolveObjects(data, [wall])[0];
    expect(resolved.assetId).toBe('cave-wall');
    const moved = updateObject(data, [wall], resolved.id, {position: [1,0,1]});
    expect(resolveObjects({...moved.previs, wallStyle:'built'}, moved.elements)[0].assetId).toBe('wall');
    expect(createPrevisScene(createScene(), [element('cave-wall')]).objects[0].assetId).toBe('cave-wall');
  });
  it('repairs old footprints without losing cameras, heights, elevation or custom material', () => {
    const car = { ...element('car'), width: 277, height: 405 };
    const data = createPrevisScene(createScene(), [car]);
    data.objects[0].dimensions = [20, 1.8, 30];
    data.objects[0].position[1] = 0.2;
    data.objects[0].color = '#123456';
    const repaired = matchDiagramFootprints(data, [car]);
    expect(repaired.objects[0].dimensions).toEqual([2.77,1.8,4.05]);
    expect(repaired.objects[0].position[1]).toBe(0.2);
    expect(repaired.objects[0].color).toBe('#123456');
    expect(repaired.shots).toBe(data.shots);
  });
  it('projects new cars at actual plan scale and retimes longer camera moves', () => {
    const data = createPrevisScene(createScene(), []);
    const result = addAsset(data, [], assetById.get('car')!, [0,0,0]);
    expect(result.elements[0].width).toBe(180);
    expect(result.elements[0].height).toBe(430);
    const shot = createPrevisShot('Long take');
    shot.keyframes.push({...shot.keyframes[0], id:'end',time:4});
    expect(resizeDuration(shot,120).keyframes[1].time).toBe(120);
    expect(resizeDuration(shot,NaN).duration).toBe(4);
  });
});

describe('plan icons and real-world scale', () => {
  it('gives untouched library icons real-world sizes but keeps resized icons and walls as drawn', () => {
    const car = element('car');
    const measured = { ...element('car'), width: 190, height: 450 };
    const wall = { ...element('wall'), width: 600 };
    const data = createPrevisScene(createScene(), [car, measured, wall]);
    expect(data.objects[0].dimensions).toEqual(assetById.get('car')!.dimensions);
    expect(data.objects[1].dimensions[0]).toBeCloseTo(1.9);
    expect(data.objects[1].dimensions[2]).toBeCloseTo(4.5);
    expect(data.objects[2].dimensions[0]).toBeCloseTo(6);
  });
  it('upgrades older conversions that shrank untouched icons, once, without touching cameras', () => {
    const car = element('car'), wall = { ...element('wall'), width: 600 };
    const data = createPrevisScene(createScene(), [car, wall]);
    const legacy = { ...data, sizing: undefined, objects: data.objects.map((o, i) => (i === 0 ? { ...o, dimensions: [0.6, 1.45, 1] as [number, number, number] } : o)) };
    const upgraded = reconcilePrevis(legacy, [car, wall]);
    expect(upgraded.sizing).toBe(2);
    expect(upgraded.objects[0].dimensions).toEqual([1.8, 1.45, 4.3]);
    expect(upgraded.objects[1].dimensions[0]).toBeCloseTo(6);
    expect(upgraded.shots).toBe(legacy.shots);
    expect(reconcilePrevis(upgraded, [car, wall])).toBe(upgraded);
  });
  it('maps plan-only workshop symbols to real models instead of grey boxes', () => {
    for (const type of ['car-lift', 'tarp-covered', 'oil-stain', 'scrap-metal', 'spare-engine', 'toilet'])
      expect(createPrevisScene(createScene(), [element(type)]).objects[0].assetId, type).not.toBe('placeholder');
  });
});

describe('camera operator controls', () => {
  it('interpolates a Dutch angle and treats older keyframes as level', () => {
    const shot = createPrevisShot('Dutch', [0, 1.6, 0], [0, 1.6, -4]);
    shot.ease = false;
    shot.keyframes.push({ ...shot.keyframes[0], id: 'end', time: 4, roll: 20 });
    expect(cameraAt(shot, 0).roll ?? 0).toBe(0);
    expect(cameraAt(shot, 2).roll).toBeCloseTo(10);
  });
  it('rolls the camera around its lens axis and reports height, tilt and distance', () => {
    const camera = new T.PerspectiveCamera();
    orientCamera(camera, { position: [0, 1.6, 0], target: [0, 1.6, -4], roll: 15 });
    const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(up.x).toBeCloseTo(Math.sin(T.MathUtils.degToRad(15)), 4);
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(forward.z).toBeCloseTo(-1, 4);
    const pose = describePose({ position: [0, 2, 0], target: [0, 1, -1] });
    expect(pose.height).toBe(2);
    expect(pose.tilt).toBeCloseTo(-45);
    expect(pose.distance).toBeCloseTo(Math.SQRT2);
  });
  it('keeps roll through pan, truck and dolly gestures', () => {
    const pose = { position: [0, 1.6, 0] as [number, number, number], target: [0, 1.6, -4] as [number, number, number], roll: 12 };
    expect(moveCamera(pose, 'look', 0.1, 0, 40, 16 / 9).roll).toBe(12);
    expect(dollyCamera(pose, 0.2).roll).toBe(12);
  });
});

describe('blocking: objects that move during a shot', () => {
  const setup = () => {
    const actor = element('actor-male');
    const data = createPrevisScene(createScene(), [actor]);
    return { actor, data, id: data.objects[0].id, shotId: data.shots[0].id };
  };
  it('keeps the set untouched at the first frame and keys moves later in the shot', () => {
    const { actor, data, id, shotId } = setup();
    const start = transformAtTime(data, [actor], shotId, 0, id, { position: [1, 0, 0] }, true);
    expect(start.previs.shots[0].blocking).toBeUndefined();
    expect(resolveObjects(start.previs, start.elements)[0].position).toEqual([1, 0, 0]);
    const moved = transformAtTime(start.previs, start.elements, shotId, 4, id, { position: [3, 0, 2] }, true);
    const shot = moved.previs.shots[0];
    expect(shot.blocking![id].map((k) => k.time)).toEqual([0, 4]);
    expect(resolveObjects(moved.previs, moved.elements)[0].position).toEqual([1, 0, 0]);
    shot.ease = false;
    const mid = applyBlocking(resolveObjects(moved.previs, moved.elements), shot, 2)[0];
    expect(mid.position).toEqual([2, 0, 1]);
  });
  it('edits the shared set when auto-key is off and the object has no movement', () => {
    const { actor, data, id, shotId } = setup();
    const result = transformAtTime(data, [actor], shotId, 3, id, { position: [2, 0, 0] }, false);
    expect(result.previs.shots[0].blocking).toBeUndefined();
    expect(resolveObjects(result.previs, result.elements)[0].position).toEqual([2, 0, 0]);
  });
  it('turns the short way round, retimes with the shot, and leaves other objects untouched', () => {
    const { data, id } = setup();
    let shot = setObjectKey(data.shots[0], id, { time: 0, position: [0, 0, 0], rotation: [0, 170, 0] });
    shot = setObjectKey(shot, id, { time: 4, position: [0, 0, 0], rotation: [0, -170, 0] });
    shot.ease = false;
    expect(Math.abs(objectPoseAt(shot.blocking![id], 2, false).rotation[1])).toBeCloseTo(180);
    expect(resizeDuration(shot, 8).blocking![id][1].time).toBe(8);
    const other = { ...data.objects[0], id: 'other' };
    expect(applyBlocking([other], shot, 2)[0]).toBe(other);
    expect(clearObjectKeys(shot, id).blocking![id]).toBeUndefined();
  });
});

describe('blocking identity', () => {
  it('never replaces an object id with a keyframe id', () => {
    const actor = element('actor-male');
    const data = createPrevisScene(createScene(), [actor]);
    const id = data.objects[0].id;
    const shot = setObjectKey(data.shots[0], id, { time: 1, position: [1, 0, 0], rotation: [0, 0, 0] });
    for (const t of [0, 1, 3]) expect(applyBlocking(resolveObjects(data, [actor]), shot, t)[0].id).toBe(id);
  });
});

describe('lighting library', () => {
  it('recognizes named light tubes and builds every fixture lit and ground-pivoted', () => {
    const lyssabel = { ...element('key-light'), label: 'Lyssabel' };
    expect(createPrevisScene(createScene(), [lyssabel]).objects[0].assetId).toBe('light-tube');
    for (const a of previsAssets.filter((item) => item.light)) {
      const root = buildObject({ ...a, id: a.id, assetId: a.id, label: a.name, position: [0, 0, 0], rotation: [0, 0, 0], visible: true, locked: false, lightIntensity: a.light!.intensity, lightColor: a.light!.color });
      const bounds = new T.Box3().setFromObject(root);
      expect(bounds.min.y, a.name).toBeCloseTo(0, 3);
      disposeObject(root);
    }
  });
  it('converts colour temperature to the familiar warm-to-cool range', () => {
    const rgb = (k: number) => new T.Color(kelvinToHex(k));
    expect(rgb(3200).r).toBeGreaterThan(rgb(3200).b);
    expect(rgb(10000).b).toBeGreaterThan(rgb(10000).r);
    expect(Math.abs(rgb(6500).r - rgb(6500).b)).toBeLessThan(0.08);
  });
  it('places hanging fixtures at working height', () => {
    const result = addAsset(createPrevisScene(createScene(), []), [], assetById.get('pendant')!, [1, 0, 1]);
    expect(result.previs.objects[0].position[1]).toBe(1.6);
  });
});
