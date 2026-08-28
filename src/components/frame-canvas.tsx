"use client";
import { useId } from "react";
import type { BrandIdentity } from "@/server/media/identity";
import { gradientVector, isGradient, type Fill, type FrameSpec } from "@/server/media/spec";

// The browser renderer for a composed frame.
//
// Same spec as the server SVG renderer, drawn as React elements rather than assembled into a
// string: provider-written text goes through JSX, so it is escaped by construction and there is
// no markup for a headline to break out of.
//
// The frame scales to whatever box it is given. Composition works in real delivery pixels
// (1080 wide and up), so the viewBox does the shrinking and the layout stays identical to the
// asset that will eventually be exported.

export function FrameCanvas({ spec, identity, className, images = {} }: {
  spec: FrameSpec;
  identity: BrandIdentity;
  className?: string;
  /** Links for the picture slots the spec refers to. Absent slots draw their fallback. */
  images?: Record<string, string>;
}) {
  // Gradient ids must be unique across the document: two frames on one page would otherwise
  // define the same id and the second would silently take the first one's colours.
  const scope = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradients: Array<{ id: string; fill: Fill }> = [];

  const paint = (fill: Fill): string => {
    if (!isGradient(fill)) return fill;
    const id = `${scope}g${gradients.length}`;
    gradients.push({ id, fill });
    return `url(#${id})`;
  };

  const background = paint(spec.background);
  const painted = spec.blocks.map((block) => ({
    block,
    fill: block.kind === "text" ? block.fill : paint(block.kind === "image" ? block.fallback : block.fill),
  }));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={spec.label}
    >
      <defs>
        {gradients.map(({ id, fill }) => {
          if (!isGradient(fill)) return null;
          const { x1, y1, x2, y2 } = gradientVector(fill.angle);
          return (
            <linearGradient key={id} id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
              <stop offset="0" stopColor={fill.from} />
              <stop offset="1" stopColor={fill.to} />
            </linearGradient>
          );
        })}
      </defs>

      <rect width={spec.width} height={spec.height} fill={background} />

      {painted.map(({ block, fill }, index) => {
        if (block.kind === "rect") {
          return <rect key={index} x={block.x} y={block.y} width={block.width} height={block.height} rx={block.radius} fill={fill as string} opacity={block.opacity} />;
        }
        if (block.kind === "image") {
          const href = images[block.slot];
          // No picture yet, so the fallback stands in. A frame is never left as a hole.
          if (!href) {
            return <rect key={index} x={block.x} y={block.y} width={block.width} height={block.height} fill={fill as string} opacity={block.opacity} />;
          }
          return (
            <g key={index}>
              <image
                x={block.x} y={block.y} width={block.width} height={block.height}
                href={href}
                preserveAspectRatio="xMidYMid slice"
                opacity={block.opacity}
              />
              {block.veil > 0 && (
                <rect x={block.x} y={block.y} width={block.width} height={block.height} fill={block.veilColour} opacity={block.veil} />
              )}
            </g>
          );
        }
        if (block.kind === "ellipse") {
          return <ellipse key={index} cx={block.cx} cy={block.cy} rx={block.rx} ry={block.ry} fill={fill as string} opacity={block.opacity} />;
        }
        return (
          <text
            key={index}
            fontFamily={identity.fontFamily}
            fontSize={block.size}
            fontWeight={block.weight}
            fill={block.fill}
            opacity={block.opacity}
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
