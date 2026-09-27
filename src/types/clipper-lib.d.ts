declare module 'clipper-lib' {
  interface IntPoint {
    X: number;
    Y: number;
  }
  type Path = IntPoint[];
  type Paths = Path[];
  interface Clipper {
    AddPaths(paths: Paths, type: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths, subjFill: number, clipFill: number): boolean;
  }
  interface ClipperOffset {
    AddPath(path: Path, join: number, end: number): void;
    Execute(solution: Paths, delta: number): void;
  }
  const ClipperLib: {
    Clipper: new () => Clipper;
    ClipperOffset: new (miterLimit?: number, arcTolerance?: number) => ClipperOffset;
    PolyType: { ptSubject: number; ptClip: number };
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
    PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: { etOpenSquare: number; etOpenRound: number; etOpenButt: number; etClosedLine: number; etClosedPolygon: number };
  };
  export default ClipperLib;
}
