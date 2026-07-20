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
