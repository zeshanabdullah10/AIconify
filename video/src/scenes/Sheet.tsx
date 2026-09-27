import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { Anchors, Backdrop, SceneFade, Svg, Tag, Words, prog } from '../kit';
import { SET, iconSvg } from '../icons';
import { C, MONO, ease } from '../theme';

const SHEET = 600;
const CELL = SHEET / 4;
const [SX, SY] = [960 - SHEET / 2, 330];
// Where the tiles land once cut apart: two rows of eight across the frame.
const TILE = 168;
const PITCH = 196;
const [GX, GY] = [960 - (PITCH * 8 - (PITCH - TILE)) / 2, 470];

/**
 * One generated image holds the whole set. It arrives rough (a model's raster, slightly off
 * grid), is cut along its gutters, and every cell is traced into clean vector strokes.
 */
export function Sheet({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const cut = prog(frame, 214, 50, ease.inOut);
  const sheetBg = 1 - prog(frame, 290, 40);
  const typed = 'gpt-image-2.5-flare · one 4×4 sheet · one call · $0.009';
  const chars = Math.floor(interpolate(frame, [24, 90], [0, typed.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const doneLabel = prog(frame, 470, 30);
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.num} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="02" label="DRAW" start={6} />
        <div style={{ height: 22 }} />
        <Words text="One sheet. Sixteen icons." start={12} size={84} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 1180, top: 150, fontFamily: MONO, fontSize: 20, color: C.ink2, opacity: 1 - prog(frame, 280, 30) }}>
        <span style={{ color: C.num }}>›</span> {typed.slice(0, chars)}
        <span style={{ opacity: Math.floor(frame / 15) % 2 && chars < typed.length ? 1 : 0 }}>▍</span>
      </div>

      {/* The sheet: paper that fades once its cells are cut out */}
      <div style={{ position: 'absolute', left: SX, top: SY, width: SHEET, height: SHEET, borderRadius: 22, background: '#fff', opacity: sheetBg * prog(frame, 20, 24), boxShadow: '0 40px 80px -30px rgba(0,0,0,0.7)' }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: sheetBg }}>
        {[1, 2, 3].map((k) => (
          <g key={k}>
            <line x1={SX + k * CELL} y1={SY - 10} x2={SX + k * CELL} y2={SY - 10 + (SHEET + 20) * cut} stroke={C.num} strokeWidth={3} style={{ filter: `drop-shadow(0 0 6px ${C.num})` }} />
            <line x1={SX - 10} y1={SY + k * CELL} x2={SX - 10 + (SHEET + 20) * cut} y2={SY + k * CELL} stroke={C.num} strokeWidth={3} style={{ filter: `drop-shadow(0 0 6px ${C.num})` }} />
          </g>
        ))}
      </svg>

      {SET.map((_, i) => {
        const [r, c] = [Math.floor(i / 4), i % 4];
        // The model's drawing: a little off-centre and tilted, soft at the edges.
        const jx = (random(`x${i}`) - 0.5) * 16;
        const jy = (random(`y${i}`) - 0.5) * 16;
        const rot = (random(`r${i}`) - 0.5) * 8;
        const order = (r + c) * 2 + random(`o${i}`) * 3;
        const appear = prog(frame, 40 + order * 9, 40);
        const move = prog(frame, 292 + i * 4, 70, ease.inOut);
        const trace = prog(frame, 380 + i * 5, 36);
        const anchors = interpolate(frame - (372 + i * 5), [0, 14, 40, 60], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const from = { x: SX + c * CELL + CELL / 2, y: SY + r * CELL + CELL / 2, s: CELL * 0.78 };
        const to = { x: GX + (i % 8) * PITCH + TILE / 2, y: GY + Math.floor(i / 8) * PITCH + TILE / 2, s: TILE };
        const x = interpolate(move, [0, 1], [from.x, to.x]);
        const y = interpolate(move, [0, 1], [from.y, to.y]);
        const box = interpolate(move, [0, 1], [from.s, to.s]);
        const ic = interpolate(move, [0, 1], [96, 118]);
        const blur = interpolate(appear, [0, 1], [16, 1.6]) * (1 - trace);
        return (
          <div key={i} style={{ position: 'absolute', left: x - box / 2, top: y - box / 2, width: box, height: box, borderRadius: box * 0.16, background: `rgba(255,255,255,${move})`, boxShadow: move > 0.02 ? `0 24px 40px -22px rgba(0,0,0,${0.7 * move})` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: ic, height: ic, opacity: appear, transform: `translate(${jx * (1 - trace)}px, ${jy * (1 - trace)}px) rotate(${rot * (1 - trace)}deg) scale(${1 + 0.06 * Math.sin(trace * Math.PI)})`, filter: `blur(${blur}px) contrast(${1 + 0.25 * (1 - trace)})` }}>
              <Svg svg={iconSvg(i)} size={ic} />
              <Anchors svg={iconSvg(i)} size={ic} opacity={anchors} />
            </div>
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: 0, right: 0, top: 900, display: 'flex', justifyContent: 'center', gap: 48, fontFamily: MONO, fontSize: 22, color: C.ink2, opacity: doneLabel, transform: `translateY(${(1 - doneLabel) * 14}px)` }}>
        <span><span style={{ color: C.bool }}>✓</span> cut on the gutters</span>
        <span><span style={{ color: C.bool }}>✓</span> traced to SVG centerlines</span>
        <span><span style={{ color: C.bool }}>✓</span> every line exactly 2 px</span>
      </div>
    </SceneFade>
  );
}
