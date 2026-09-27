import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { parseD, parseSvg, type FillPath } from '../../src/lib/paths';
import { C, FONT, MONO, ease } from './theme';

/** 0 → 1 over [start, start + dur], eased. */
export function prog(frame: number, start: number, dur: number, curve = ease.out): number {
  return interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: curve });
}

export function useSpring(start: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - start, fps, config: { damping: 18, stiffness: 120, mass: 0.9, ...config } });
}

/** Dark workbench background: grid paper, a soft light from above, and a vignette. */
export function Backdrop({ glow = C.accent, drift = 0 }: { glow?: string; drift?: number }) {
  const frame = useCurrentFrame();
  const shift = (frame * 0.15 + drift) % 40;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), linear-gradient(${C.gridStrong} 1px, transparent 1px), linear-gradient(90deg, ${C.gridStrong} 1px, transparent 1px)`,
          backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
          backgroundPosition: `${-shift}px ${-shift * 0.5}px`,
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black 30%, transparent 100%)',
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 45% at 50% 0%, ${glow}22, transparent 70%)` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
}

/** Words rise out of a mask one after another. */
export function Words({ text, start, size = 72, weight = 600, color = C.ink, stagger = 3, style, tracking = -0.03 }: { text: string; start: number; size?: number; weight?: number; color?: string; stagger?: number; style?: CSSProperties; tracking?: number }) {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, color, letterSpacing: `${tracking}em`, lineHeight: 1.08, display: 'flex', flexWrap: 'wrap', gap: `0 ${size * 0.26}px`, ...style }}>
      {words.map((w, i) => {
        const p = prog(frame, start + i * stagger, 28);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 110}%)`, opacity: p }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Small monospace scene tag: "02 — DRAW", with a wire-coloured tick. */
export function Tag({ n, label, start, color = C.num }: { n: string; label: string; start: number; color?: string }) {
  const frame = useCurrentFrame();
  const p = prog(frame, start, 24);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 20, letterSpacing: '0.18em', color: C.ink2, opacity: p, transform: `translateX(${(1 - p) * -20}px)` }}>
      <span style={{ width: 28 * p, height: 3, borderRadius: 2, background: color, boxShadow: `0 0 12px ${color}` }} />
      <span style={{ color: C.ink }}>{n}</span>
      <span>{label}</span>
    </div>
  );
}

/** An SVG string from the app, drawn at a size. */
export function Svg({ svg, size, h, style }: { svg: string; size: number; h?: number; style?: CSSProperties }) {
  return <div style={{ width: size, height: h ?? size, flexShrink: 0, ...style }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', `<svg width="100%" height="100%" `) }} />;
}

/**
 * An icon that draws itself: every path is traced along its length, strokes as lines and
 * fills as an outline that then floods in.
 */
export function DrawIcon({ svg, size, start, dur = 50, stagger = 8 }: { svg: string; size: number; start: number; dur?: number; stagger?: number }) {
  const frame = useCurrentFrame();
  const { width, height, paths } = parseSvg(svg);
  return (
    <svg width={size} height={(size * height) / width} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {paths.map((p: FillPath, i) => {
        const t = prog(frame, start + i * stagger, dur, ease.inOut);
        const color = p.stroke ?? p.fill;
        if (p.stroke)
          return <path key={i} d={p.d} fill="none" stroke={color} strokeWidth={p.width ?? 1} strokeLinecap={p.cap ?? 'round'} strokeLinejoin={p.cap === 'square' ? 'miter' : 'round'} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - t} />;
        const flood = prog(frame, start + i * stagger + dur * 0.6, dur * 0.6);
        return (
          <g key={i}>
            <path d={p.d} fill={color} fillOpacity={flood} />
            <path d={p.d} fill="none" stroke={color} strokeWidth={0.6} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - t} opacity={1 - flood} />
          </g>
        );
      })}
    </svg>
  );
}

/** Anchor points of an icon's paths, as small squares: what "traced to vectors" looks like. */
export function Anchors({ svg, size, opacity }: { svg: string; size: number; opacity: number }) {
  const { width, paths } = parseSvg(svg);
  const pts: [number, number][] = [];
  for (const p of paths) for (const s of parseD(p.d)) if (s.c !== 'Z') pts.push([s.p[s.p.length - 2], s.p[s.p.length - 1]]);
  const k = size / width;
  return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0, opacity, overflow: 'visible' }}>
      {pts.map(([x, y], i) => (
        <rect key={i} x={x * k - 3.5} y={y * k - 3.5} width={7} height={7} fill="#fff" stroke={C.accent} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

/** A LabVIEW-style wire: drawn along its route, with a soft glow. */
export function Wire({ d, color, progress, width = 4, glow = true }: { d: string; color: string; progress: number; width?: number; glow?: boolean }) {
  return (
    <g>
      {glow ? <path d={d} fill="none" stroke={color} strokeWidth={width * 4} strokeOpacity={0.18} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} style={{ filter: 'blur(6px)' }} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} />
    </g>
  );
}

/** A white "paper" tile an icon sits on. */
export function Tile({ size, children, style, radius = 0.18 }: { size: number; children: ReactNode; style?: CSSProperties; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * radius,
        background: C.paper,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Fade a whole scene in and out at its edges. */
export function SceneFade({ duration, children, inFrames = 18, outFrames = 18 }: { duration: number; children: ReactNode; inFrames?: number; outFrames?: number }) {
  const frame = useCurrentFrame();
  const o = Math.min(prog(frame, 0, inFrames, ease.inOut), 1 - prog(frame, duration - outFrames, outFrames, ease.inOut));
  const z = interpolate(frame, [0, duration], [1.0, 1.035]);
  return <AbsoluteFill style={{ opacity: o, transform: `scale(${z})` }}>{children}</AbsoluteFill>;
}

export function Cursor({ x, y, press }: { x: number; y: number; press: number }) {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" style={{ position: 'absolute', left: x, top: y, transform: `scale(${1 - press * 0.15})`, transformOrigin: '0 0', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))', zIndex: 20 }}>
      <path d="M4 2L4 19L8.5 14.8L11.5 21.5L14.2 20.3L11.3 13.8L17.5 13.8Z" fill="#fff" stroke="#111" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}
