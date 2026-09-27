import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, SceneFade, Tag, Words, prog, useSpring } from '../kit';
import { BRAND } from '../icons';
import { C, FONT, MONO, ease } from '../theme';

const PALETTE = [
  { role: 'Primary', hex: BRAND.primary },
  { role: 'Accent', hex: BRAND.accent },
  { role: 'Ink', hex: '#15181d' },
  { role: 'Surface', hex: '#f4f5f7' },
];
const TRAITS = ['Precise', 'Calm', 'Industrial', 'Trustworthy'];

function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={50} cy={50} r={44} fill={BRAND.primary} />
      <path d="M50 22C66 32 70 52 50 78C30 52 34 32 50 22Z" fill={BRAND.accent} />
      <path d="M50 34L50 70" stroke={BRAND.primary} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** The brand goes in: a logo drops, is scanned, and its colours, personality and rules come out. */
export function Brand({ duration }: { duration: number }) {
  const frame = useCurrentFrame();
  const drop = useSpring(34, { damping: 11, stiffness: 140 });
  const scan = prog(frame, 92, 60, ease.inOut);
  const scanOn = frame > 90 && frame < 156;
  const [lx, ly] = [180 + 200, 380 + 200]; // logo centre
  return (
    <SceneFade duration={duration}>
      <Backdrop glow={C.bool} />
      <AbsoluteFill style={{ padding: '110px 140px' }}>
        <Tag n="01" label="BRAND" start={6} color={C.bool} />
        <div style={{ height: 22 }} />
        <Words text="Start with your brand." start={12} size={84} />
      </AbsoluteFill>

      {/* Drop zone with the logo */}
      <div style={{ position: 'absolute', left: 180, top: 380, width: 400, height: 400, borderRadius: 28, border: `2px dashed ${C.ink3}`, opacity: prog(frame, 18, 20), background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ position: 'absolute', inset: 16, borderRadius: 18, background: '#fff', opacity: drop, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div style={{ transform: `translateY(${(1 - drop) * -260}px) rotate(${(1 - drop) * -14}deg)` }}>
            <Logo size={250} />
          </div>
          {scanOn ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 3, background: C.accent, boxShadow: `0 0 24px 8px ${C.accent}88` }} />
          ) : null}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 180,
          top: 810,
          width: 400,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          borderRadius: 16,
          background: C.bg2,
          border: `1px solid ${C.line}`,
          fontFamily: FONT,
          color: C.ink,
          fontSize: 20,
          opacity: prog(frame, 64, 22),
          transform: `translateY(${(1 - prog(frame, 64, 22)) * 24}px)`,
        }}
      >
        <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth={1.8} strokeLinejoin="round">
          <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6" />
        </svg>
        <div>
          <div style={{ fontWeight: 600 }}>brand-guidelines.pdf</div>
          <div style={{ fontFamily: MONO, fontSize: 15, color: C.ink2 }}>12 pages · read in your browser</div>
        </div>
      </div>

      {/* What was found */}
      <div style={{ position: 'absolute', left: 760, top: 380, fontFamily: MONO, fontSize: 18, letterSpacing: '0.16em', color: C.ink2, opacity: prog(frame, 150, 20) }}>WHAT WE FOUND</div>
      {PALETTE.map((c, i) => {
        const t = prog(frame, 158 + i * 9, 40, ease.out);
        const [tx, ty] = [760 + i * 238, 424];
        const x = interpolate(t, [0, 1], [lx - 100, tx]);
        const y = interpolate(t, [0, 1], [ly - 70, ty]);
        return (
          <div
            key={c.role}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 216,
              borderRadius: 18,
              overflow: 'hidden',
              background: C.bg2,
              border: `1px solid ${C.line}`,
              opacity: Math.min(1, t * 3),
              transform: `scale(${0.6 + 0.4 * t})`,
              boxShadow: '0 20px 40px -18px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ height: 96, background: c.hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', borderRadius: '18px 18px 0 0' }} />
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontFamily: FONT, fontSize: 21, fontWeight: 600, color: C.ink }}>{c.role}</div>
              <div style={{ fontFamily: MONO, fontSize: 17, color: C.ink2 }}>{c.hex.toUpperCase()}</div>
            </div>
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: 760, top: 650, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontFamily: FONT, fontSize: 22, color: C.ink2, width: 150, opacity: prog(frame, 236, 16) }}>Personality</span>
        {TRAITS.map((t, i) => {
          const s = prog(frame, 242 + i * 7, 22, ease.out);
          return (
            <span key={t} style={{ fontFamily: FONT, fontSize: 22, fontWeight: 500, color: '#9fe3a4', background: 'rgba(63,191,95,0.14)', border: '1px solid rgba(63,191,95,0.35)', padding: '8px 18px', borderRadius: 12, opacity: s, transform: `scale(${0.7 + 0.3 * s})` }}>
              {t}
            </span>
          );
        })}
      </div>
      {[
        { mark: '✓', color: C.bool, text: 'Rounded corners and 2 px lines' },
        { mark: '✕', color: C.str, text: 'No gradients, no drop shadows' },
      ].map((r, i) => {
        const s = prog(frame, 290 + i * 12, 26);
        return (
          <div key={r.text} style={{ position: 'absolute', left: 760, top: 730 + i * 54, display: 'flex', gap: 16, alignItems: 'center', fontFamily: FONT, fontSize: 24, color: C.ink, opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
            <span style={{ width: 150, color: C.ink2, fontSize: 22 }}>{i ? 'Don’t' : 'Do'}</span>
            <span style={{ color: r.color, fontWeight: 700, width: 20 }}>{r.mark}</span>
            {r.text}
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 760, top: 870, fontFamily: MONO, fontSize: 19, color: C.ink3, opacity: prog(frame, 340, 24) }}>
        read by a vision model in ~2 s · <span style={{ color: C.ink2 }}>${(0.0004 * prog(frame, 340, 50)).toFixed(4)}</span>
      </div>
    </SceneFade>
  );
}
