import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, DrawIcon, SceneFade, Tile, Wire, Words, prog, useSpring } from '../kit';
import { iconSvg } from '../icons';
import { C, MONO, ease } from '../theme';

/** Cold open: a block-diagram wire runs in, plugs into a tile, and the first icon draws itself. */
export function Intro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const tile = useSpring(40, { damping: 14, stiffness: 110 });
  const wire = prog(frame, 4, 56, ease.inOut);
  const glow = prog(frame, 112, 30);
  const pulse = 0.5 + 0.5 * Math.sin((frame - 112) / 9);
  const lift = interpolate(prog(frame, 118, 50, ease.inOut), [0, 1], [0, -70]);
  return (
    <SceneFade duration={duration} inFrames={10}>
      <Backdrop glow={C.num} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <Wire d={`M -40 ${700 + lift} L 560 ${700 + lift} L 560 ${540 + lift} L 770 ${540 + lift}`} color={C.num} progress={wire} width={5} />
        <circle cx={770} cy={540 + lift} r={9 * prog(frame, 56, 12)} fill={C.num} />
      </svg>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateY(${lift}px)` }}>
        <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: `radial-gradient(circle, ${C.bool}55, transparent 65%)`, opacity: glow * (0.6 + 0.4 * pulse) }} />
        <Tile size={380} style={{ transform: `scale(${tile})` }}>
          <DrawIcon svg={iconSvg(0)} size={270} start={58} dur={46} stagger={11} />
        </Tile>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', top: 770 }}>
        <Words text="Icons for LabVIEW, made from your brand." start={132} size={78} style={{ justifyContent: 'center', width: 1500 }} />
        <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 24, color: C.ink2, letterSpacing: '0.04em', opacity: prog(frame, 172, 30), transform: `translateY(${(1 - prog(frame, 172, 30)) * 16}px)` }}>
          AI draws the set <span style={{ color: C.num }}>→</span> you lock the look <span style={{ color: C.num }}>→</span> real vectors for the front panel
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
