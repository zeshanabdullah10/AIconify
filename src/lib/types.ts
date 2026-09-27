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
}

export interface Project {
  id: string;
  brand: BrandKit;
  style: StyleLock;
  iconNames: string[];
  icons: IconItem[];
  runs: SheetRun[];
  modelId: string;
  quality: Quality;
  candidates: number;
  exportOptions: ExportOptions;
  spent: number;
  updatedAt: number;
}
