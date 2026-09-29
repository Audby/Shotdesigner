import { beforeEach, describe, expect, it } from 'vitest';
import {
  createShot,
  createShotListProject,
  getSavedShotLists,
  saveShotListProject,
} from './shotListUtils';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('browser shot-list persistence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
    });
  });

  it('saves, updates, and reloads normalized projects', () => {
    const project = createShotListProject('Short film');
    project.storageFileName = 'runtime-only.json';
    project.scenes[0].shots.push(createShot('1A'));

    const firstSave = saveShotListProject(project);
    expect(firstSave.project.storageFileName).toBeUndefined();
    expect(getSavedShotLists()[0].scenes[0].shots[0].number).toBe('1A');

    firstSave.project.scenes[0].shots[0].description = 'Updated description';
    saveShotListProject(firstSave.project);
    const savedProjects = getSavedShotLists();
    expect(savedProjects).toHaveLength(1);
    expect(savedProjects[0].scenes[0].shots[0].description).toBe('Updated description');
  });
});

describe('scene sets', () => {
  it('stages shots in their scene set unless they link their own, and survives normalization', async () => {
    const { createShot, createShotListProject, normalizeShotListProject, sceneForSet, shotSetId, shotsInSet } = await import('./shotListUtils');
    const project = createShotListProject();
    const scene = project.scenes[0];
    scene.linkedSceneId = 'workshop';
    const a = { ...createShot('6A'), previsShotId: 'cam-a' };
    const b = { ...createShot('6B'), linkedSceneId: 'exterior' };
    scene.shots.push(a, b);
    expect(shotSetId(scene, a)).toBe('workshop');
    expect(shotSetId(scene, b)).toBe('exterior');
    expect(shotsInSet(scene, 'workshop').map((s) => s.number)).toEqual(['6A']);
    expect(sceneForSet(project, 'exterior')?.id).toBe(scene.id);
    const restored = normalizeShotListProject(JSON.parse(JSON.stringify(project)));
    expect(restored.scenes[0].linkedSceneId).toBe('workshop');
    expect(restored.scenes[0].shots[0].previsShotId).toBe('cam-a');
  });
});
