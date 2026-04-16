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
  showCone: boolean;
  coneAngle: number;
  coneLength: number;
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
