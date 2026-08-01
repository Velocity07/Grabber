import { Boxes } from "lucide-react";

/**
 * Ambient 3D scene: a slowly rotating wireframe cube built from CSS 3D
 * transforms, plus a soft violet orb. Pure CSS transforms — cheap to render.
 */
export function Scene3D() {
  const faces = [
    "translateZ(46px)",
    "rotateY(180deg) translateZ(46px)",
    "rotateY(90deg) translateZ(46px)",
    "rotateY(-90deg) translateZ(46px)",
    "rotateX(90deg) translateZ(46px)",
    "rotateX(-90deg) translateZ(46px)",
  ];

  return (
    <div className="pointer-events-none relative flex h-32 w-32 shrink-0 items-center justify-center">
      <div
        className="absolute h-32 w-32 rounded-full blur-2xl animate-orb"
        style={{ background: "var(--gradient-violet)" }}
      />
      <div className="scene-3d animate-float">
        <div className="animate-spin-3d relative h-[92px] w-[92px] [transform-style:preserve-3d]">
          {faces.map((t, i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-md border border-primary/45 bg-primary/5"
              style={{ transform: t }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <Boxes className="h-7 w-7 text-primary-glow" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </div>
  );
}
