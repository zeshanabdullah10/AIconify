import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Backdrop, Wire, Words, prog, useSpring } from '../kit';
import { C, FONT, MONO, ease } from '../theme';

/** The app's mark: a tiny VI icon with a frame, a green banner and a glyph. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#15181d" stroke="rgba(255,255,255,0.14)" strokeWidth={0.4} />
      <rect x="6" y="6" width="20" height="20" rx="2" fill="#ffffff" />
      <rect x="6" y="6" width="20" height="6" rx="2" fill="#2f9e44" />
      <rect x="6" y="10" width="20" height="2" fill="#2f9e44" />
      <path d="M11 16.5h4.5a3 3 0 0 1 0 6H11z" fill="none" stroke="#15181d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18.5 19.5h3" stroke="#e8590c" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Outro({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const mark = useSpring(40, { damping: 12, stiffness: 120 });
  const wire = prog(frame, 0, 44, ease.inOut);
  const black = prog(frame, duration - 40, 40, ease.inOut);
  const name = 'AIconify';
  return (
    <AbsoluteFill style={{ opacity: prog(frame, 0, 14) }}>
      <Backdrop glow={C.bool} />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <Wire d="M -40 470 L 480 470 L 480 420 L 820 420" color={C.num} progress={wire} width={5} />
        <Wire d="M 1960 470 L 1440 470 L 1440 420 L 1100 420" color={C.bool} progress={wire} width={5} />
      </svg>
      <AbsoluteFill style={{ alignItems: 'center', top: 300 }}>
        <div style={{ transform: `scale(${mark}) rotate(${(1 - mark) * -20}deg)`, filter: `drop-shadow(0 30px 50px rgba(0,0,0,0.6))` }}>
          <Mark size={240} />
        </div>
        <div style={{ marginTop: 44, display: 'flex', fontFamily: FONT, fontSize: 132, fontWeight: 650, letterSpacing: '-0.045em', color: C.ink }}>
          {name.split('').map((ch, i) => {
            const p = prog(frame, 70 + i * 4, 30);
            return (
              <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 40}px)`, color: i < 2 ? C.bool : C.ink }}>
                {ch}
              </span>
            );
          })}
        </div>
        <Words text="Your brand in. LabVIEW-ready icons out." start={116} size={44} weight={500} color={C.ink2} style={{ justifyContent: 'center', marginTop: 10 }} tracking={-0.01} />
        <div style={{ marginTop: 44, fontFamily: MONO, fontSize: 24, color: C.ink3, letterSpacing: '0.04em', opacity: prog(frame, 170, 30) }}>
          open source · MIT · <span style={{ color: C.ink2 }}>zeshanabdullah10.github.io/AIconify</span>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#000', opacity: black }} />
    </AbsoluteFill>
  );
}
