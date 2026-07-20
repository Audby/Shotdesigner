import { v4 as uuidv4 } from 'uuid';
import type { Shot, ShotListGlossaryEntry, ShotListProject, ShotListScene } from '../types';
import { createShot, normalizeShotListProject } from './shotListUtils';

const COLUMN_ALIASES: Record<keyof Omit<Shot, 'id' | 'status' | 'notes' | 'linkedSceneId'>, string[]> = {
  number: ['shot', 'shot number', 'shotnr', 'shot nr'],
  description: ['beskrivelse', 'description'],
  subjects: ['subjekter', 'subjects', 'subject'],
  framing: ['ramme', 'bilde ramme', 'framing', 'frame'],
  angle: ['vinkel', 'angle'],
  movement: ['bevegelse', 'kamerabevegelse', 'movement'],
  equipment: ['utstyr', 'equipment'],
  cameraLens: ['kam og linse', 'kamera og linse', 'camera lens', 'camera and lens'],
  setup: ['oppsett', 'setup'],
};

const normalizeLabel = (value: string): string =>
  value
    .replace(/^\uFEFF/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const countUnquoted = (line: string, character: string): number => {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === character) {
      count += 1;
    }
  }
  return count;
};

export function detectDelimiter(text: string): ',' | ';' {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  return countUnquoted(sample, ';') >= countUnquoted(sample, ',') ? ';' : ',';
}

export function parseDelimitedText(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

const getSceneHeading = (row: string[]): { number: string; title: string } | null => {
  const value = row.find((cell) => cell.trim())?.trim() ?? '';
  const match = value.match(/^(?:sc(?:ene)?\.?)\s*([^\s•:–-]+)\s*(?:[•:–-]\s*(.*))?$/i);
  if (!match) return null;
  return {
    number: match[1]?.trim() ?? '',
    title: match[2]?.trim() || 'Untitled Scene',
  };
};

const isShotHeader = (row: string[]): boolean => {
  const labels = row.map(normalizeLabel);
  return labels[0] === 'shot' && labels.some((label) => ['beskrivelse', 'description'].includes(label));
};

const getColumnMap = (header: string[]): Partial<Record<keyof typeof COLUMN_ALIASES, number>> => {
  const labels = header.map(normalizeLabel);
  const result: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
  (Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>).forEach((field) => {
    const index = labels.findIndex((label) => COLUMN_ALIASES[field].includes(label));
    if (index >= 0) result[field] = index;
  });
  return result;
};

const cellAt = (row: string[], index: number | undefined): string =>
  index === undefined ? '' : row[index]?.trim() ?? '';

const rowToShot = (
  row: string[],
  columns: Partial<Record<keyof typeof COLUMN_ALIASES, number>>,
): Shot => {
  const shot = createShot(cellAt(row, columns.number));
  return {
    ...shot,
    description: cellAt(row, columns.description),
    subjects: cellAt(row, columns.subjects),
    framing: cellAt(row, columns.framing),
    angle: cellAt(row, columns.angle),
    movement: cellAt(row, columns.movement),
    equipment: cellAt(row, columns.equipment),
    cameraLens: cellAt(row, columns.cameraLens),
    setup: cellAt(row, columns.setup),
  };
};

const extractGlossary = (rows: string[][]): ShotListGlossaryEntry[] => {
  const entries: ShotListGlossaryEntry[] = [];
  const categoryHeaders: string[] = [];
  let sawOverview = false;

  for (const row of rows) {
    if (getSceneHeading(row) || isShotHeader(row)) break;
    if (row.some((cell) => normalizeLabel(cell) === 'begrepsoversikt')) {
      sawOverview = true;
      continue;
    }
    if (!sawOverview) continue;

    const looksLikeCategoryRow = row.some((cell) => {
      const label = normalizeLabel(cell);
      return ['subjekter', 'bilde ramme', 'kamerabevegelser', 'annet'].includes(label);
    });
    if (looksLikeCategoryRow) {
      row.forEach((cell, index) => {
        if (cell.trim()) categoryHeaders[index] = cell.replace(/:$/, '').trim();
      });
      continue;
    }

    row.forEach((cell, index) => {
      const value = cell.trim();
      if (!value || !categoryHeaders[index]) return;
      const separator = value.indexOf(':');
      const term = (separator >= 0 ? value.slice(0, separator) : value).trim();
      const description = (separator >= 0 ? value.slice(separator + 1) : '').trim();
      if (!term) return;
      entries.push({
        id: uuidv4(),
        category: categoryHeaders[index],
        term,
        description,
      });
    });
  }
  return entries;
};

export function parseShotListCsv(text: string, projectName = 'Imported Shot List'): ShotListProject {
  const rows = parseDelimitedText(text);
  const scenes: ShotListScene[] = [];
  const glossary = extractGlossary(rows);
  let pendingScene: { number: string; title: string } | null = null;
  let currentScene: ShotListScene | null = null;
  let columns: Partial<Record<keyof typeof COLUMN_ALIASES, number>> | null = null;

  const ensureScene = (): ShotListScene => {
    if (currentScene) return currentScene;
    currentScene = {
      id: uuidv4(),
      number: pendingScene?.number ?? String(scenes.length + 1),
      title: pendingScene?.title ?? 'Untitled Scene',
      shots: [],
    };
    scenes.push(currentScene);
    return currentScene;
  };

  rows.forEach((row) => {
    const heading = getSceneHeading(row);
    if (heading) {
      pendingScene = heading;
      currentScene = null;
      columns = null;
      return;
    }
    if (isShotHeader(row)) {
      columns = getColumnMap(row);
      ensureScene();
      return;
    }
    if (!columns || !cellAt(row, columns.number)) return;
    ensureScene().shots.push(rowToShot(row, columns));
  });

  const project = normalizeShotListProject({
    schemaVersion: 1,
    id: uuidv4(),
    name: projectName,
    scenes: scenes.length > 0 ? scenes : undefined,
    glossary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return project;
}

const quoteCell = (value: string, delimiter: string): string => {
  const escaped = value.replace(/"/g, '""');
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${escaped}"` : escaped;
};

const serializeRows = (rows: string[][], delimiter = ';'): string =>
  rows.map((row) => row.map((cell) => quoteCell(cell, delimiter)).join(delimiter)).join('\r\n');

export function shotListToCsv(project: ShotListProject): string {
  const rows: string[][] = [];
  if (project.glossary.length > 0) {
    const categories = Array.from(new Set(project.glossary.map((entry) => entry.category)));
    rows.push(['Begrepsoversikt']);
    rows.push(categories.map((category) => `${category}:`));
    const grouped = categories.map((category) =>
      project.glossary.filter((entry) => entry.category === category),
    );
    const maxRows = Math.max(...grouped.map((entries) => entries.length));
    for (let index = 0; index < maxRows; index += 1) {
      rows.push(grouped.map((entries) => {
        const entry = entries[index];
        return entry ? `${entry.term}: ${entry.description}`.trim() : '';
      }));
    }
    rows.push([]);
  }

  project.scenes.forEach((scene, sceneIndex) => {
    if (sceneIndex > 0 || rows.length > 0) rows.push([]);
    rows.push([`Sc. ${scene.number}${scene.title ? ` • ${scene.title}` : ''}`]);
    rows.push([
      'Shot',
      'Beskrivelse',
      'Subjekter',
      'Ramme',
      'Vinkel',
      'Bevegelse',
      'Utstyr',
      'Kam. og linse',
      'Oppsett',
    ]);
    scene.shots.forEach((shot) => {
      rows.push([
        shot.number,
        shot.description,
        shot.subjects,
        shot.framing,
        shot.angle,
        shot.movement,
        shot.equipment,
        shot.cameraLens,
        shot.setup,
      ]);
    });
  });
  return `\uFEFF${serializeRows(rows)}`;
}

export function exportShotListCsv(project: ShotListProject): void {
  const blob = new Blob([shotListToCsv(project)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export type CsvImportResult =
  | { status: 'ok'; project: ShotListProject; fileName: string }
  | { status: 'canceled' }
  | { status: 'error' };

export function importShotListCsv(): Promise<CsvImportResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve({ status: 'canceled' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const projectName = file.name.replace(/\.csv$/i, '').trim() || 'Imported Shot List';
          const project = parseShotListCsv(loadEvent.target?.result as string, projectName);
          resolve({ status: 'ok', project, fileName: file.name });
        } catch {
          resolve({ status: 'error' });
        }
      };
      reader.onerror = () => resolve({ status: 'error' });
      reader.readAsText(file);
    };
    input.click();
  });
}
