"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { BrandIdentity } from "@/server/media/identity";
import { gradientVector, isGradient, type Fill, type FrameSpec } from "@/server/media/spec";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import { createZip, safeEntryName, type ZipEntry } from "@/lib/zip";

// The pack: every composed frame as a real PNG at delivery size, plus the copy to paste,
// in one archive.
//
// Rasterised in the browser rather than on the server, and that is a deliberate reversal of the
// obvious design. Server-side rasterisation needs a native dependency and, worse, needs the font
// available in the runtime — which is exactly where that approach fails quietly, rendering a
// fallback face nobody notices until the file is public. The browser already has the fonts and
// a canvas, so it draws the same frame spec the page is showing, and what you download is what
// you looked at.
//
// The third renderer from one spec. Coordinates and line breaks come from composition, so the
// PNG cannot disagree with the preview about where anything sits.

/**
 * A fill as canvas understands it. The gradient's direction comes from the same shared vector
 * the other two renderers use, so a gradient points the same way in the preview and in the file.
 */
function toCanvasFill(context: CanvasRenderingContext2D, fill: Fill, box: { x: number; y: number; width: number; height: number }) {
  if (!isGradient(fill)) return fill;
  const { x1, y1, x2, y2 } = gradientVector(fill.angle);
  const gradient = context.createLinearGradient(
    box.x + x1 * box.width, box.y + y1 * box.height,
    box.x + x2 * box.width, box.y + y2 * box.height,
  );
  gradient.addColorStop(0, fill.from);
  gradient.addColorStop(1, fill.to);
  return gradient;
}

function drawFrame(spec: FrameSpec, identity: BrandIdentity): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");

  const full = { x: 0, y: 0, width: spec.width, height: spec.height };
  context.fillStyle = toCanvasFill(context, spec.background, full);
  context.fillRect(0, 0, spec.width, spec.height);

  for (const block of spec.blocks) {
    if (block.kind === "rect") {
      context.fillStyle = toCanvasFill(context, block.fill, block);
      context.globalAlpha = block.opacity;
      if (block.radius > 0 && typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(block.x, block.y, block.width, block.height, block.radius);
        context.fill();
      } else {
        context.fillRect(block.x, block.y, block.width, block.height);
      }
      context.globalAlpha = 1;
      continue;
    }

    if (block.kind === "ellipse") {
      context.fillStyle = toCanvasFill(context, block.fill, {
        x: block.cx - block.rx, y: block.cy - block.ry, width: block.rx * 2, height: block.ry * 2,
      });
      context.globalAlpha = block.opacity;
      context.beginPath();
      context.ellipse(block.cx, block.cy, block.rx, block.ry, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      continue;
    }

    context.font = `${block.weight} ${block.size}px ${identity.fontFamily}`;
    context.fillStyle = block.fill;
    context.globalAlpha = block.opacity;
    context.textAlign = block.align === "center" ? "center" : "left";
    context.textBaseline = "alphabetic";
    // Not universally supported; without it the frame is still correct, just a little tighter.
    if ("letterSpacing" in context) context.letterSpacing = `${block.letterSpacing}px`;
    block.lines.forEach((line, index) => {
      context.fillText(line, block.x, block.y + index * block.lineHeight);
    });
    if ("letterSpacing" in context) context.letterSpacing = "0px";
    context.globalAlpha = 1;
  }

  return canvas;
}

async function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png_encoding_failed");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The text a person pastes into the composer. Kept plain so it survives any editor. */
function copyFile(variant: PlatformContentVariant): string {
  const lines = [
    `Plataforma: ${variant.platform}`,
    `Formato: ${variant.format}`,
    "",
    "— CAPTION —",
    variant.caption,
    "",
    "— GANCHO —",
    variant.hook,
    "",
    "— LLAMADO A LA ACCIÓN —",
    variant.cta,
  ];
  if (variant.onScreenText.length > 0) {
    lines.push("", "— TEXTO EN PANTALLA —", ...variant.onScreenText.map((text) => `· ${text}`));
  }
  if (variant.videoDirection) lines.push("", "— DIRECCIÓN DE VIDEO —", variant.videoDirection);
  if (variant.visualDirection) lines.push("", "— DIRECCIÓN VISUAL —", variant.visualDirection);
  lines.push("", "Generado por Spectro. Nada de esto fue publicado.");
  return lines.join("\n");
}

export function FrameExport({ variant, frames, identity, title, audio }: {
  variant: PlatformContentVariant;
  frames: FrameSpec[];
  identity: BrandIdentity;
  title: string;
  /** The produced voiceover, when there is one. Absent is normal, not a failure. */
  audio?: { url: string; mimeType: string } | null;
}) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  // A pack that shipped without its audio is not a failure, but it is not silent either.
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    setState("working");
    setNote(null);
    try {
      const entries: ZipEntry[] = [{ name: "copy.txt", bytes: new TextEncoder().encode(copyFile(variant)) }];
      for (const [index, frame] of frames.entries()) {
        const png = await toPng(drawFrame(frame, identity));
        entries.push({ name: `${variant.platform}-${String(index + 1).padStart(2, "0")}-${frame.label}.png`, bytes: png });
      }

      // The audio belongs in the pack: a piece is not ready to post without the voice that
      // goes with it. A failure to fetch it must not lose the images, so the pack still ships.
      if (audio?.url) {
        try {
          const response = await fetch(audio.url);
          if (response.ok) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            entries.push({ name: `${variant.platform}-voz-en-off.${audio.mimeType.includes("wav") ? "wav" : "mp3"}`, bytes });
          } else {
            setNote("Las imágenes y el texto están; no se pudo agregar el audio al paquete.");
          }
        } catch {
          setNote("Las imágenes y el texto están; no se pudo agregar el audio al paquete.");
        }
      }

      const archive = createZip(entries);
      const url = URL.createObjectURL(new Blob([archive as BlobPart], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeEntryName(`${variant.platform}-${title}.zip`);
      anchor.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="frame-export">
      <button type="button" className="secondary-button" onClick={download} disabled={state === "working"}>
        <Download size={14} />
        {state === "working"
          ? "Armando el paquete…"
          : `Descargar ${frames.length > 0 ? `${frames.length === 1 ? "la pieza" : `las ${frames.length} imágenes`}, ` : ""}${audio?.url ? "la voz y " : ""}el texto`}
      </button>
      {state === "error" && <small className="form-error">No se pudo armar el paquete en este navegador.</small>}
      {note && <small className="form-note">{note}</small>}
    </div>
  );
}
