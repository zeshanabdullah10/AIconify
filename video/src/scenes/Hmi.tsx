import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { statusVariant, type StatusId } from '../../../src/lib/labview';
import { Backdrop, SceneFade, Svg, Tag, Words, prog } from '../kit';
import { byName, iconSvg } from '../icons';
import { C, FONT, MONO } from '../theme';

const GREY = '#4d4d4d';
const EQUIP: { name: string; changes: [number, StatusId][] }[] = [
  { name: 'Pump', changes: [[60, 'on']] },
  { name: 'Valve', changes: [[150, 'warning']] },
  { name: 'Heater', changes: [[240, 'alarm']] },
  { name: 'Tank', changes: [] },
  { name: 'Fan', changes: [[330, 'manual']] },
];
const LABEL: Record<StatusId, string> = { normal: 'Normal', on: 'Running', off: 'Stopped', warning: 'Warning', alarm: 'Alarm', manual: 'Manual', disabled: 'Disabled', offline: 'Offline' };
const SCREEN = { x: 260, y: 330, w: 1400, h: 470 };

/** An ISA-101 overview: calm grey equipment, and only what changed stands out. */
export function Hmi({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const states = EQUIP.map((e) => [...e.changes].reverse().find(([at]) => frame >= at)?.[1] ?? 'normal');
  const alarms = states.filter((s) => s === 'alarm').length;
  const warnings = states.filter((s) => s === 'warning').length;
  const flowing = frame >= 60;
  const enter = prog(frame, 14, 30);
  const pitch = SCREEN.w / EQUIP.length;
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.num} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="05" label="HMI" start={6} />
        <div style={{ height: 22 }} />
        <Words text="States that mean something." start={12} size={84} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: SCREEN.x, top: SCREEN.y, width: SCREEN.w, height: SCREEN.h, borderRadius: 14, overflow: 'hidden', background: '#dcdcdc', fontFamily: FONT, color: '#1d1d1f', opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`, boxShadow: '0 60px 120px -40px rgba(0,0,0,0.85)' }}>
        <div style={{ height: 62, display: 'flex', alignItems: 'center', padding: '0 26px', background: '#c8c8c8', fontSize: 22 }}>
          <span style={{ flex: 1, fontWeight: 600 }}>Unit 1 · Overview</span>
          <span style={{ display: 'flex', gap: 12, fontSize: 20 }}>
            <span style={{ padding: '4px 14px', borderRadius: 8, background: alarms ? (Math.floor(frame / 16) % 2 ? '#d62d20' : '#b71c1c') : '#bdbdbd', color: alarms ? '#fff' : '#555', fontWeight: 600 }}>{alarms} alarm</span>
            <span style={{ padding: '4px 14px', borderRadius: 8, background: warnings ? '#e8a200' : '#bdbdbd', color: warnings ? '#1d1d1f' : '#555', fontWeight: 600 }}>{warnings} warning</span>
          </span>
        </div>
        <svg width={SCREEN.w} height={SCREEN.h - 62} style={{ position: 'absolute', top: 62, left: 0 }}>
          <line x1={pitch / 2} y1={160} x2={SCREEN.w - pitch / 2} y2={160} stroke="#8e8e93" strokeWidth={8} strokeLinecap="round" />
          {flowing ? <line x1={pitch / 2} y1={160} x2={SCREEN.w - pitch / 2} y2={160} stroke="#5f6166" strokeWidth={4} strokeDasharray="14 26" strokeDashoffset={-frame * 2.2} /> : null}
        </svg>
        {EQUIP.map((e, i) => {
          const st = states[i];
          const since = frame - ([...e.changes].reverse().find(([at]) => frame >= at)?.[0] ?? -999);
          const pop = interpolate(since, [0, 6, 20], [0.85, 1.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const loud = st === 'alarm' || st === 'warning';
          return (
            <div key={e.name} style={{ position: 'absolute', left: i * pitch, width: pitch, top: 62 + 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ padding: 10, borderRadius: 16, background: '#dcdcdc', transform: `scale(${pop})` }}>
                <Svg svg={statusVariant(iconSvg(byName(e.name), 'outline', { primary: GREY, accent: GREY, colorMode: 'mono' }), st)} size={140} />
              </div>
              <span style={{ fontSize: 24, fontWeight: 600 }}>{e.name}</span>
              <span style={{ fontSize: 21, color: loud ? '#1d1d1f' : '#6e6e73', fontWeight: loud ? 700 : 400 }}>{LABEL[st]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 850, display: 'flex', justifyContent: 'center', gap: 44, fontFamily: MONO, fontSize: 21, color: C.ink2, opacity: prog(frame, 380, 26) }}>
        <span>▲ warning</span>
        <span>◆ alarm</span>
        <span>M manual</span>
        <span style={{ color: C.ink3 }}>shape carries the meaning, not just colour</span>
      </div>
    </SceneFade>
  );
}
