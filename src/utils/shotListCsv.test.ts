import { describe, expect, it } from 'vitest';
import { normalizeShotListProject } from './shotListUtils';
import { parseDelimitedText, parseShotListCsv, shotListToCsv } from './shotListCsv';

const sampleCsv = `Begrepsoversikt;;;;;
Subjekter:;Bilde/ramme:;Kamerabevegelser:;;;
Mar: Marco;ENB: Ekstremt nærbilde;Truck: Langs motiv;;;
;;;;;
Sc. 7 • Hangar;;;;;
Shot;Beskrivelse;Subjekter;Ramme;Vinkel;Bevegelse;Utstyr;Kam. og linse;Oppsett
7A;"Etablering; rust og aura";TBD;VVB;Forfra;Truck;Gimbal;P6K, 18-35mm;7A
7B;"Første linje
andre linje";Mar;ENB;Direkte;Stasjonært;Stativ;P6K, 50-100mm;`;

describe('shot-list CSV parsing', () => {
  it('handles quoted delimiters, escaped quotes, and line breaks', () => {
    const rows = parseDelimitedText('A;B\r\n1;"two; ""quoted"" words"\r\n2;"line one\nline two"');
    expect(rows).toEqual([
      ['A', 'B'],
      ['1', 'two; "quoted" words'],
      ['2', 'line one\nline two'],
    ]);
  });

  it('extracts glossary, scene grouping, and Norwegian shot columns', () => {
    const project = parseShotListCsv(sampleCsv, 'Mafiafilm');
    expect(project.name).toBe('Mafiafilm');
    expect(project.glossary).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'Subjekter', term: 'Mar', description: 'Marco' }),
      expect.objectContaining({ category: 'Bilde/ramme', term: 'ENB' }),
    ]));
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0]).toMatchObject({ number: '7', title: 'Hangar' });
    expect(project.scenes[0].shots).toHaveLength(2);
    expect(project.scenes[0].shots[0]).toMatchObject({
      number: '7A',
      description: 'Etablering; rust og aura',
      equipment: 'Gimbal',
      cameraLens: 'P6K, 18-35mm',
      setup: '7A',
    });
    expect(project.scenes[0].shots[1].description).toBe('Første linje\nandre linje');
  });

  it('round-trips project shot fields through CSV', () => {
    const original = parseShotListCsv(sampleCsv, 'Mafiafilm');
    const roundTripped = parseShotListCsv(shotListToCsv(original), 'Round trip');
    expect(roundTripped.scenes[0].shots.map((shot) => ({
      number: shot.number,
      description: shot.description,
      cameraLens: shot.cameraLens,
    }))).toEqual(original.scenes[0].shots.map((shot) => ({
      number: shot.number,
      description: shot.description,
      cameraLens: shot.cameraLens,
    })));
    expect(roundTripped.glossary.map((entry) => entry.term)).toEqual(
      original.glossary.map((entry) => entry.term),
    );
  });
});

describe('shot-list normalization', () => {
  it('fills missing legacy fields and keeps a usable scene', () => {
    const project = normalizeShotListProject({
      name: 'Legacy',
      scenes: [{
        number: '2',
        title: 'Workshop',
        shots: [{ number: '2A', subjects: 'Martin, Konrad' }],
      }],
    });
    expect(project.schemaVersion).toBe(1);
    expect(project.id).toBeTruthy();
    expect(project.scenes[0].shots[0]).toMatchObject({
      number: '2A',
      description: '',
      status: 'planned',
      notes: '',
    });
    expect(project.subjects.map((subject) => subject.name)).toEqual(['Martin', 'Konrad']);
  });
});
