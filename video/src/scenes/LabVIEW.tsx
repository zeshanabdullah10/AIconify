import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { indicatorFiles } from '../../../src/lib/indicators';
import { buttonState, viIcon, type ButtonSkin, type ButtonState } from '../../../src/lib/labview';
import { Backdrop, Cursor, SceneFade, Svg, Tag, Words, prog, useSpring } from '../kit';
import { BRAND, byName, iconSvg } from '../icons';
import { C, FONT, MONO, ease } from '../theme';
import timeline from '../timeline.json';

const FROM = timeline.scenes.find((s) => s.id === 'labview')!.from;
const CLICKS = timeline.clicks.map((c) => c - FROM);
const BUTTONS = ['Pump', 'Valve', 'Fan', 'Heater', 'Lamp', 'Alarm'].map((n) => ({ name: n, idx: byName(n) }));
const WIDE = [
  { text: 'RUN', idx: byName('Start') },
  { text: 'AUTO', idx: byName('Settings') },
  { text: 'LOG', idx: byName('Log data') },
];
const WIN = { x: 300, y: 330, w: 1320, h: 560 };
const FACE = { x: WIN.x, y: WIN.y + 102 };
const BTN = 112;
const PITCH = 170;
const SKINS: { at: number; id: ButtonSkin; label: string }[] = [
  { at: 0, id: 'isa', label: 'ISA-101' },
  { at: 560, id: 'flat', label: 'Modern' },
  { at: 612, id: 'classic', label: 'Classic' },
  { at: 664, id: 'toggle', label: 'Toggle' },
  { at: 724, id: 'isa', label: 'ISA-101' },
];

function stateAt(frame: number, click: number): ButtonState {
  if (frame < click - 5) return 'false';
  if (frame < click + 5) return 'false-to-true';
  return 'true';
}

const centre = (i: number) => ({ x: FACE.x + 70 + i * PITCH + BTN / 2, y: FACE.y + 92 + BTN / 2 });

function cursorAt(frame: number) {
  const stops = [{ x: 1560, y: 1010 }, ...BUTTONS.map((_, i) => ({ x: centre(i).x + 8, y: centre(i).y + 10 }))];
  let pos = stops[0];
  for (let i = 0; i < CLICKS.length; i++) {
    const t = prog(frame, CLICKS[i] - 44, 34, ease.inOut);
    pos = { x: interpolate(t, [0, 1], [pos.x, stops[i + 1].x]), y: interpolate(t, [0, 1], [pos.y, stops[i + 1].y]) };
  }
  // Leave to the lower right after the last click.
  const out = prog(frame, CLICKS.at(-1)! + 30, 50, ease.inOut);
  return { x: interpolate(out, [0, 1], [pos.x, 1700]), y: interpolate(out, [0, 1], [pos.y, 1120]) };
}

/** A LabVIEW front panel: buttons are clicked true one by one, then the whole panel changes skin. */
export function LabVIEW({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const fly = useSpring(14, { damping: 20, stiffness: 90 });
  const skin = [...SKINS].reverse().find((s) => frame >= s.at)!;
  const skinChange = frame - skin.at;
  const flash = skin.at > 0 ? interpolate(skinChange, [0, 4, 16], [0.94, 1.03, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const banner = 'DAQ'.slice(0, Math.max(0, Math.min(3, Math.floor((frame - 104) / 10))));
  const press = Math.max(0, ...CLICKS.map((c) => interpolate(frame, [c - 6, c, c + 8], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const cur = cursorAt(frame);
  const running = frame >= CLICKS[0] + 5;
  const tank = indicatorFiles('tank', '#1c7ed6');
  const level = Math.min(4, Math.max(0, Math.floor(interpolate(frame, [CLICKS[0] + 20, CLICKS[0] + 360], [0, 4.99], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))));
  const alarmOn = frame >= CLICKS[5] + 5;
  const opts = (shape: 'square' | 'wide') => ({ skin: skin.id, shape, primary: BRAND.primary, stateColor: '#2fb344' });
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.bool} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="04" label="LABVIEW" start={6} color={C.bool} />
        <div style={{ height: 22 }} />
        <Words text="Made for the front panel." start={12} size={84} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', inset: 0, perspective: 1800 }}>
        <div
          style={{
            position: 'absolute',
            left: WIN.x,
            top: WIN.y,
            width: WIN.w,
            height: WIN.h,
            borderRadius: 14,
            overflow: 'hidden',
            background: '#f3f3f3',
            boxShadow: '0 60px 120px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12)',
            transform: `translateY(${(1 - fly) * 160}px) rotateX(${(1 - fly) * 24}deg) scale(${0.94 + 0.06 * fly})`,
            transformOrigin: '50% 100%',
            opacity: Math.min(1, fly * 1.6),
            fontFamily: FONT,
            color: '#1d1d1f',
          }}
        >
          <div style={{ height: 46, display: 'flex', alignItems: 'center', padding: '0 18px', background: '#fbfbfb', borderBottom: '1px solid #d6d6d6', fontSize: 19, fontWeight: 500 }}>
            <span style={{ display: 'flex', gap: 8 }}>
              {[0, 1, 2].map((k) => (
                <span key={k} style={{ width: 13, height: 13, borderRadius: '50%', background: '#d0d0d0' }} />
              ))}
            </span>
            <span style={{ flex: 1, textAlign: 'center' }}>Pump Station.vi Front Panel</span>
            <span style={{ width: 60 }} />
          </div>
          <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 26, padding: '0 12px 0 18px', fontSize: 16, color: '#444', borderBottom: '1px solid #dadada' }}>
            {['File', 'Edit', 'View', 'Project', 'Operate', 'Tools', 'Window', 'Help'].map((m) => (
              <span key={m}>{m}</span>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ width: 46, height: 46, border: '1px solid #bdbdbd', background: '#fff', borderRadius: 2, boxShadow: frame > 100 && frame < 190 ? `0 0 0 4px ${C.int}88` : 'none' }}>
              <Svg svg={viIcon(iconSvg(0), { banner, bannerColor: '#2f9e44' })} size={44} />
            </span>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 102,
              bottom: 0,
              backgroundColor: C.face,
              backgroundImage: `linear-gradient(${C.faceGrid} 1px, transparent 1px), linear-gradient(90deg, ${C.faceGrid} 1px, transparent 1px)`,
              backgroundSize: '16px 16px',
            }}
          >
            {BUTTONS.map((b, i) => {
              const st = stateAt(frame, CLICKS[i]);
              return (
                <div key={b.name} style={{ position: 'absolute', left: 70 + i * PITCH, top: 56, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18 }}>{b.name}</span>
                  <div style={{ transform: `scale(${flash})` }}>
                    <Svg svg={buttonState(iconSvg(b.idx), st, opts('square'))} size={BTN} />
                  </div>
                </div>
              );
            })}
            {WIDE.map((w, i) => {
              const st = stateAt(frame, CLICKS[i] + 24);
              return (
                <div key={w.text} style={{ position: 'absolute', left: 70 + i * 290, top: 290, transform: `scale(${flash})`, transformOrigin: '0 50%' }}>
                  <Svg svg={buttonState(iconSvg(w.idx), st, opts('wide'))} size={252} h={90} />
                  {skin.id !== 'toggle' ? (
                    <span style={{ position: 'absolute', left: 102, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 600, letterSpacing: '0.04em' }}>{w.text}</span>
                  ) : null}
                </div>
              );
            })}
            {/* Indicators */}
            <div style={{ position: 'absolute', left: 1110, top: 56, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Running', svg: indicatorFiles('round-led', '#2fb344')[running ? 1 : 0].svg },
                { label: 'Alarm', svg: indicatorFiles('round-led', '#d62d20')[alarmOn && Math.floor(frame / 12) % 2 ? 1 : 0].svg },
              ].map((l) => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 18 }}>
                  <Svg svg={l.svg} size={46} />
                  {l.label}
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', left: 1110, top: 220, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 18 }}>
              Level
              <Svg svg={tank[level].svg} size={120} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: WIN.x + WIN.w - 330, top: WIN.y + WIN.h + 22, width: 330, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 19, color: C.ink2, opacity: prog(frame, 540, 20) }}>
        Button style
        <span style={{ padding: '6px 14px', borderRadius: 10, background: C.bg2, border: `1px solid ${C.line}`, color: C.ink, transform: `scale(${flash})` }}>{skin.label}</span>
      </div>
      <div style={{ position: 'absolute', left: WIN.x, top: WIN.y + WIN.h + 22, display: 'flex', gap: 14 }}>
        {[
          { at: 250, color: C.bool, text: 'Only the moving part lights up' },
          { at: 330, color: C.int, text: 'VI icons, 32×32, pixel-snapped' },
          { at: 420, color: C.num, text: 'Every picture as PNG @2x and EMF' },
        ].map((c) => {
          const p = prog(frame, c.at, 26);
          return (
            <span key={c.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: 12, background: C.bg2, border: `1px solid ${C.line}`, fontFamily: FONT, fontSize: 20, color: C.ink, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
              {c.text}
            </span>
          );
        })}
      </div>
      <Cursor x={cur.x} y={cur.y} press={press} />
    </SceneFade>
  );
}
