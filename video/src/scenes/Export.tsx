import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, SceneFade, Tag, Words, prog } from '../kit';
import { C, FONT, MONO } from '../theme';

const TARGETS = [
  { label: 'LabVIEW', hint: 'Buttons, VI icons, EMF, @2x', color: C.bool, at: 24 },
  { label: 'HMI / SCADA', hint: 'Equipment states, indicators', color: C.num, at: 62 },
  { label: 'Web & apps', hint: 'SVG, React, PNG', color: C.int, at: 100 },
  { label: 'Design tools', hint: 'Figma layers, large PNGs', color: C.str, at: 138 },
];

// The real zip for this set: 16 icons exported for LabVIEW and HMI (counted with the app's exporter).
const TOTAL = 1459;
const TREE: [string, string, string][] = [
  ['emf/', 'pump.emf', '16'],
  ['png/48/', 'pump@2x.png', '64'],
  ['labview/buttons/pump/', 'false.png  true.png  …', '256'],
  ['labview/buttons/pump/', 'true.emf', '64'],
  ['labview/vi-icons/', 'pump.png  pump.emf', '32'],
  ['labview/glyphs/', 'pump.png  pump.emf', '32'],
  ['labview/indicators/', 'round-led-green-on.emf', '12'],
  ['states/alarm/', 'pump.svg  pump.emf', '32'],
  ['states/on/48/', 'pump@2x.png', '96'],
  ['svg/', 'pump.svg', '16'],
  ['labview/', 'README.md   import guide', '1'],
];

/** Say where the icons go; the zip builds itself, file by file, in the browser. */
export function Export({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [150, 380], [0, TOTAL], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 }));
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.str} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="06" label="EXPORT" start={6} color={C.str} />
        <div style={{ height: 22 }} />
        <Words text="Everything, ready to import." start={12} size={84} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 140, top: 340, width: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TARGETS.map((t) => {
          const enter = prog(frame, 14 + TARGETS.indexOf(t) * 5, 24);
          const on = t.label === 'LabVIEW' || t.label === 'HMI / SCADA' ? prog(frame, t.at, 14) : 0;
          return (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', borderRadius: 18, background: on ? `rgba(79,130,255,${0.1 * on})` : C.bg2, border: `1.5px solid ${on > 0.5 ? C.accent : C.line}`, opacity: enter, transform: `translateX(${(1 - enter) * -30}px)` }}>
              <span style={{ width: 12, height: 44, borderRadius: 6, background: t.color, boxShadow: `0 0 16px ${t.color}88` }} />
              <span style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 600, color: C.ink }}>{t.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 20, color: C.ink2 }}>{t.hint}</div>
              </span>
              <span style={{ width: 34, height: 34, borderRadius: 9, border: `2px solid ${on > 0.5 ? C.accent : C.ink3}`, background: on > 0.5 ? C.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.2 * Math.sin(on * Math.PI)})` }}>
                {on > 0.5 ? (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', left: 820, top: 340, width: 960, height: 560, borderRadius: 22, background: '#0e1115', border: `1px solid ${C.line}`, padding: '26px 32px', fontFamily: MONO, boxShadow: '0 60px 120px -40px rgba(0,0,0,0.9)', opacity: prog(frame, 120, 24) }}>
        <div style={{ display: 'flex', fontSize: 22, color: C.ink, marginBottom: 18 }}>
          <span style={{ flex: 1 }}>fernleaf-instruments-icons.zip</span>
          <span style={{ color: C.ink2 }}>
            <span style={{ color: C.ink }}>{count.toLocaleString('en-US')}</span> files
          </span>
        </div>
        {TREE.map(([dir, file, n], i) => {
          const p = prog(frame, 150 + i * 14, 18);
          return (
            <div key={dir + file} style={{ display: 'flex', fontSize: 19, lineHeight: '37px', opacity: p, transform: `translateX(${(1 - p) * 20}px)` }}>
              <span style={{ width: 330, color: '#8ab4ff' }}>{dir}</span>
              <span style={{ flex: 1, color: '#c9ced6' }}>{file}</span>
              <span style={{ color: C.ink3 }}>{n}</span>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', left: 140, top: 890, display: 'flex', gap: 12 }}>
        {['EMF', 'PNG @2x', 'SVG', 'VI icons', 'States', 'React'].map((f, i) => {
          const p = prog(frame, 300 + i * 6, 20);
          return (
            <span key={f} style={{ fontFamily: MONO, fontSize: 19, padding: '7px 14px', borderRadius: 10, color: C.ink, background: C.bg2, border: `1px solid ${C.line}`, opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
              {f}
            </span>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 820, top: 930, fontFamily: FONT, fontSize: 24, color: C.ink2, opacity: prog(frame, 360, 26) }}>
        Built in your browser. No server, and your key never leaves it.
      </div>
    </SceneFade>
  );
}
