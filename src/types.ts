export interface SceneElement {
  id: string;
  type: string;
  category: string;
  label: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  color: string;
  opacity: number;
  locked: boolean;
  visible: boolean;
  iconPath: string;
  width: number;
  height: number;
  zIndex: number;
  showLabel: boolean;
  labelOffsetX: number;
  labelOffsetY: number;
  labelWidth?: number;
  labelAutoWidth?: boolean;
  labelFontSize?: number;
  labelTextColor?: string;
  labelBackgroundColor?: string;
  labelBackgroundOpacity?: number;
  labelPaddingX?: number;
  labelPaddingY?: number;
  labelCornerRadius?: number;
  labelShadowColor?: string;
  labelShadowBlur?: number;
  labelShadowOpacity?: number;
  labelShadowOffsetX?: number;
  labelShadowOffsetY?: number;
  showCone: boolean;
  coneAngle: number;
  coneLength: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOpacity?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  bendOffset?: number;
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlign?: string;
}

export interface Scene {
  id: string;
  name: string;
  elements: SceneElement[];
  storageFileName?: string;
  /** Absolute path when the scene lives outside the scenes folder (via Save As / Browse) */
  storageFilePath?: string;
  stageWidth: number;
  stageHeight: number;
  backgroundColor: string;
  gridSize: number;
  showGrid: boolean;
  gridStyle: 'lines' | 'dots' | 'none';
  gridColor: string;
  createdAt: string;
  updatedAt: string;
}

export type ShotStatus = 'planned' | 'ready' | 'shot' | 'cut';

export interface Shot {
  id: string;
  number: string;
  description: string;
  subjects: string;
  framing: string;
  angle: string;
  movement: string;
  equipment: string;
  cameraLens: string;
  setup: string;
  status: ShotStatus;
  notes: string;
  linkedSceneId?: string;
}

export interface ShotListScene {
  id: string;
  number: string;
  title: string;
  shots: Shot[];
}

export interface ShotListGlossaryEntry {
  id: string;
  category: string;
  term: string;
  description: string;
}

export interface ShotListSubject {
  id: string;
  name: string;
}

export interface ShotListProject {
  schemaVersion: 1;
  id: string;
  name: string;
  scenes: ShotListScene[];
  glossary: ShotListGlossaryEntry[];
  subjects: ShotListSubject[];
  storageFileName?: string;
  /** Absolute path when the shot list lives outside the shotlists folder. */
  storageFilePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ElementTemplate {
  type: string;
  category: string;
  label: string;
  iconPath: string;
  width: number;
  height: number;
  defaultColor: string;
  showCone: boolean;
  coneAngle: number;
  coneLength: number;
}

export interface CategoryInfo {
  id: string;
  label: string;
  icon: string;
}

export type Tool = 'select' | 'pan' | 'measure';
export type WorkspaceMode = 'canvas' | 'shotList';
