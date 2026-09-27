import '@fontsource-variable/ibm-plex-sans/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile } from 'remotion';
import { Brand } from './scenes/Brand';
import { Export } from './scenes/Export';
import { Hmi } from './scenes/Hmi';
import { Intro } from './scenes/Intro';
import { LabVIEW } from './scenes/LabVIEW';
import { Outro } from './scenes/Outro';
import { Sheet } from './scenes/Sheet';
import { Styles } from './scenes/Styles';
import { C } from './theme';
import timeline from './timeline.json';

const SCENES = { intro: Intro, brand: Brand, sheet: Sheet, styles: Styles, labview: LabVIEW, hmi: Hmi, export: Export, outro: Outro } as const;

/** Wait for the fonts, so no frame renders in a fallback face. */
function useFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([document.fonts.load('600 40px "IBM Plex Sans Variable"'), document.fonts.load('400 20px "JetBrains Mono Variable"')])
      .then(() => document.fonts.ready)
      .then(() => continueRender(handle));
  }, [handle]);
}

export function Film({ music = true }: { music?: boolean }) {
  useFonts();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {timeline.scenes.map((s) => {
        const Scene = SCENES[s.id as keyof typeof SCENES];
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
            <Scene duration={s.duration} />
          </Sequence>
        );
      })}
      {music ? <Audio src={staticFile('music.wav')} /> : null}
    </AbsoluteFill>
  );
}
