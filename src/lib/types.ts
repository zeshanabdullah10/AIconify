/** A decoded RGBA bitmap. Mirrors the shape of the DOM ImageData so pure code runs in Node too. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PaletteColor {
  role: string;
  hex: string;
}

export interface BrandKit {
  name: string;
  logo?: { dataUrl: string; fileName: string };
  guidelines?: { fileName: string; pages: number; text: string };
  notes: string;
  palette: PaletteColor[];
  traits: string[];
  dos: string[];
  donts: string[];
  fonts: { display?: string; body?: string };
  analyzed: boolean;
}

export type IconStyle = 'outline' | 'filled' | 'duotone' | 'badge';
export type Corners = 'rounded' | 'sharp';
export type ColorMode = 'mono' | 'brand';
export type Quality = 'low' | 'medium';

export interface StyleLock {
  style: IconStyle;
  strokeWeight: number;
  corners: Corners;
  colorMode: ColorMode;
  primary: string;
  accent: string;
  /** Industrial HMI look (ISA-101): muted, functional symbols; colour only for alarms. */
  hmi?: boolean;
}

export type IconStatus = 'draft' | 'flagged' | 'approved';

export interface IconVersion {
  svg: string;
  png: string;
  note: string;
  at: number;
}

export interface IconItem {
  id: string;
  name: string;
  description?: string;
  status: IconStatus;
  svg?: string;
  /** Transparent PNG crop (data URL) that the SVG was traced from. */
  png?: string;
  flags: string[];
  history: IconVersion[];
  /** Sheet run and cell this icon was cut from, so another candidate can replace it. */
  runId?: string;
  cell?: number;
}

export interface SheetCandidate {
  dataUrl: string;
  cost: number;
}

export interface SheetRun {
  id: string;
  modelId: string;
  quality: Quality;
  cols: number;
  rows: number;
  names: string[];
  candidates: SheetCandidate[];
  chosen: number;
  createdAt: number;
}

export interface ExportOptions {
  svg: boolean;
  png: boolean;
  pngSizes: number[];
  react: boolean;
  sprite: boolean;
  figma: boolean;
  naming: 'kebab' | 'pascal' | 'snake';
  prefix: string;
  /** Extra PNG densities for high-DPI screens; 1 is always the base size. */
  pngScales: number[];
  /** Snap edges to whole pixels for PNGs up to 64 px. */
  pixelSnap: boolean;
  emf: boolean;
  buttons: boolean;
  buttonSize: number;
  viIcons: boolean;
  bannerText: string;
  bannerColor: string;
  states: boolean;
  indicators: boolean;
  indicatorKinds: string[];
  indicatorColors: string[];
  indicatorSize: number;
}

/** An icon from the user's existing set, used as a style reference for new sheets. */
export interface ReferenceIcon {
  id: string;
  name: string;
  /** 256×256 transparent PNG data URL. */
  png: string;
}

export interface Project {
  id: string;
  brand: BrandKit;
  style: StyleLock;
  iconNames: string[];
  icons: IconItem[];
  references: ReferenceIcon[];
  runs: SheetRun[];
  modelId: string;
  quality: Quality;
  candidates: number;
  exportOptions: ExportOptions;
  spent: number;
  updatedAt: number;
}
