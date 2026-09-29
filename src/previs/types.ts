export type Vec3 = [number, number, number];
export type ActorPose = 'standing' | 'sitting' | 'walking' | 'lying';

export interface PrevisObject {
  id: string;
  assetId: string;
  label: string;
  sourceElementId?: string;
  /** Diagram footprint at the time dimensions were set; used for live 2D scale sync. */
  diagramSize?: [number, number];
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  color: string;
  visible: boolean;
  locked: boolean;
  pose?: ActorPose;
  lightIntensity?: number;
  lightAngle?: number;
  lightColor?: string;
  /** Colour temperature the light colour was dialled from, if any. */
  lightKelvin?: number;
  /** Embedded self-contained GLB so moving a scene file does not break its assets. */
  modelData?: string;
}

export interface CameraKeyframe {
  id: string;
  time: number;
  position: Vec3;
  target: Vec3;
  lens: number;
  /** Dutch angle in degrees; positive rolls the frame clockwise. */
  roll?: number;
}

/** Where an object is at a moment in one shot: its blocking. */
export interface ObjectKeyframe {
  id: string;
  time: number;
  position: Vec3;
  rotation: Vec3;
}

export interface DepthOfField {
  enabled: boolean;
  fStop: number;
  /** Metres from the lens; omitted to hold focus on the camera's aim point. */
  focusDistance?: number;
}

export interface PrevisShot {
  id: string;
  name: string;
  sensorWidth: number;
  aspectRatio: number;
  duration: number;
  path: 'linear' | 'smooth';
  ease: boolean;
  keyframes: CameraKeyframe[];
  /** Per-object movement during this shot, keyed by object id. Unkeyed objects stay put. */
  blocking?: Record<string, ObjectKeyframe[]>;
  dof?: DepthOfField;
  reference?: { dataUrl: string; time: number; createdAt: string };
}

export interface PrevisScene {
  schemaVersion: 1;
  /** 2: unresized plan icons use real-world sizes. */
  sizing?: number;
  wallStyle?: 'built' | 'cave';
  /** Close interiors with a ceiling at wall height; seen from inside only. */
  ceiling?: boolean;
  ceilingColor?: string;
  unitsPerMeter: number;
  origin: [number, number];
  floorSize: [number, number];
  floorColor: string;
  backgroundColor: string;
  ambientIntensity: number;
  daylightIntensity: number;
  /** Sun direction in degrees: compass azimuth and elevation above the horizon. */
  sunAzimuth?: number;
  sunElevation?: number;
  objects: PrevisObject[];
  shots: PrevisShot[];
}

export interface LightSpec {
  /** spot: aimed beam · point: omni bulb · area: soft rectangle · tube: glowing rod lit on all sides */
  kind: 'spot' | 'point' | 'area' | 'tube';
  intensity: number;
  color: string;
  angle?: number;
  /** Emitter position inside the model's unit box (x, y, z in -0.5…0.5, 0…1, -0.5…0.5). */
  at: Vec3;
  /** Emitting face in metres for area lights. */
  size?: [number, number];
  aim?: 'forward' | 'down';
}

export interface PrevisAsset {
  id: string;
  name: string;
  category: string;
  shape: string;
  dimensions: Vec3;
  color: string;
  diagramType: string;
  tags?: string;
  pose?: ActorPose;
  light?: LightSpec;
  /** Default height above the floor when placed (hanging and wall-mounted fixtures). */
  elevation?: number;
}
