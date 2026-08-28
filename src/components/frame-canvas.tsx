"use client";
import type { BrandIdentity } from "@/server/media/identity";
import type { FrameSpec } from "@/server/media/spec";

// The browser renderer for a composed frame.
//
// Same spec as the server SVG renderer, drawn as React elements rather than assembled into a
// string: provider-written text goes through JSX, so it is escaped by construction and there is
// no markup for a headline to break out of.
//
// The frame scales to whatever box it is given. Composition works in real delivery pixels
// (1080 wide and up), so the viewBox does the shrinking and the layout stays identical to the
// asset that will eventually be exported.

export function FrameCanvas({ spec, identity, className }: { spec: FrameSpec; identity: BrandIdentity; className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={spec.label}
    >
      <rect width={spec.width} height={spec.height} fill={spec.background} />
      {spec.blocks.map((block, index) => {
        if (block.kind === "rect") {
          return <rect key={index} x={block.x} y={block.y} width={block.width} height={block.height} rx={block.radius} fill={block.fill} opacity={block.opacity} />;
        }
        return (
          <text
            key={index}
            fontFamily={identity.fontFamily}
            fontSize={block.size}
            fontWeight={block.weight}
            fill={block.fill}
            letterSpacing={block.letterSpacing}
            textAnchor={block.align === "center" ? "middle" : "start"}
          >
            {block.lines.map((line, lineIndex) => (
              <tspan key={lineIndex} x={block.x} y={block.y + lineIndex * block.lineHeight}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
