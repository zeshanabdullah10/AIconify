import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, SceneFade, Svg, Tag, Tile, Words, prog } from '../kit';
import { byName, iconSvg } from '../icons';
import { C, FONT, MONO, ease } from '../theme';
import type { IconStyle } from '../../../src/lib/types';

const ROW = ['Pump', 'Valve', 'Lamp', 'Fan', 'Gauge', 'Alarm'].map(byName);
const STYLES: { id: IconStyle; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'filled', label: 'Filled' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'badge', label: 'Badge' },
  { id: 'schematic', label: 'Schematic' },
];
const STEP = 62;
const START = 40;
const SWEEP = START + STEP * STYLES.length; // weight sweep after the last style, back on outline

/** The whole set changes style together, then its line weight sweeps from light to bold. */
export function Styles({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const at = Math.max(0, Math.min(STYLES.length, Math.floor((frame - START) / STEP)));
  const sweep = prog(frame, SWEEP + 10, 110, ease.inOut);
  const weight = 2 + Math.sin(sweep * Math.PI * 1.5) * 1.1 * (1 - prog(frame, SWEEP + 110, 20));
  const pill = interpolate(frame, STYLES.map((_, i) => START + i * STEP), STYLES.map((_, i) => i), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.inOut });
  const showSlider = prog(frame, SWEEP, 20);
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.int} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="03" label="LOOK" start={6} color={C.int} />
        <div style={{ height: 22 }} />
        <Words text="Lock one look for the whole set." start={12} size={84} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 400, display: 'flex', justifyContent: 'center', gap: 36 }}>
        {ROW.map((idx, k) => {
          const enter = prog(frame, 16 + k * 5, 30);
          // Each tile switches a beat after its neighbour, so the change ripples across the row.
          const local = frame - k * 4;
          const cur = Math.max(0, Math.min(STYLES.length, Math.floor((local - START) / STEP)));
          const within = local - START - cur * STEP;
          const bump = cur > 0 ? interpolate(within, [0, 6, 18], [0.9, 1.06, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
          const svg = cur === STYLES.length ? iconSvg(idx, 'outline', { strokeWeight: weight }) : iconSvg(idx, STYLES[cur].id);
          return (
            <div key={idx} style={{ opacity: enter, transform: `translateY(${(1 - enter) * 40}px) scale(${bump})` }}>
              <Tile size={200}>
                <Svg svg={svg} size={138} />
              </Tile>
            </div>
          );
        })}
      </div>

      {/* Style control */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 700, display: 'flex', justifyContent: 'center', opacity: prog(frame, 30, 24) * (1 - showSlider * 0.6) }}>
        <div style={{ position: 'relative', display: 'flex', padding: 6, borderRadius: 18, background: C.bg2, border: `1px solid ${C.line}` }}>
          <div style={{ position: 'absolute', top: 6, left: 6 + pill * 180, width: 180, height: 58, borderRadius: 13, background: '#2a303a', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }} />
          {STYLES.map((s, i) => (
            <div key={s.id} style={{ position: 'relative', width: 180, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 22, fontWeight: 500, color: i === Math.round(pill) && at < STYLES.length ? C.ink : C.ink3 }}>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Weight dial */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 800, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, opacity: showSlider, transform: `translateY(${(1 - showSlider) * 20}px)` }}>
        <span style={{ fontFamily: FONT, fontSize: 22, color: C.ink2 }}>Line weight</span>
        <div style={{ position: 'relative', width: 520, height: 8, borderRadius: 4, background: '#252a33' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${((weight - 0.9) / 2.2) * 100}%`, borderRadius: 4, background: C.int }} />
          <div style={{ position: 'absolute', top: -11, left: `calc(${((weight - 0.9) / 2.2) * 100}% - 15px)`, width: 30, height: 30, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 24, color: C.ink, width: 110 }}>{weight.toFixed(1)} px</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center', fontFamily: MONO, fontSize: 19, color: C.ink3, opacity: showSlider }}>
        real strokes, so weight changes without redrawing
      </div>
    </SceneFade>
  );
}
