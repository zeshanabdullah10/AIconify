import { Easing } from 'remotion';

export const C = {
  bg: '#0a0c0f',
  bg2: '#11141a',
  grid: 'rgba(255,255,255,0.045)',
  gridStrong: 'rgba(255,255,255,0.08)',
  ink: '#eef0f3',
  ink2: '#9aa3ad',
  ink3: '#636b76',
  line: 'rgba(255,255,255,0.1)',
  accent: '#4f82ff',
  paper: '#ffffff',
  paper2: '#f4f5f7',
  face: '#e2e3e5',
  faceGrid: '#d2d4d8',
  bool: '#3fbf5f',
  num: '#ff7a2f',
  int: '#3b8cff',
  str: '#ff4f8b',
  hmiGrey: '#4d4d4d',
  hmiBg: '#dcdcdc',
};

export const FONT = "'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, sans-serif";
export const MONO = "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace";

/** The house curves: a quick, confident ease-out, and a softer one for big moves. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
};
