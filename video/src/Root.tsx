import { Composition, Still } from 'remotion';
import { Film } from './Film';
import timeline from './timeline.json';

export const Root = () => (
  <>
    <Composition id="AIconify" component={Film} durationInFrames={timeline.total} fps={timeline.fps} width={1920} height={1080} defaultProps={{ music: true }} />
    <Composition id="Silent" component={Film} durationInFrames={timeline.total} fps={timeline.fps} width={1920} height={1080} defaultProps={{ music: false }} />
    <Still id="Poster" component={Film} width={1920} height={1080} defaultProps={{ music: false }} />
  </>
);
