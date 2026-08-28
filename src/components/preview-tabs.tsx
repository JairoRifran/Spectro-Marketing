"use client";
import { useState, type ReactNode } from "react";

// Three ways to look at the same piece, because they answer different questions. The simulation
// asks "how will this read where it lands?"; the assembled view asks "does it hold for its whole
// length, and does the voice land on the beat it was written for?"; the production view asks "is
// the craft right?". It opens on the simulation: that is the one a person can judge without
// being briefed.

export function PreviewTabs({ feed, assembled, production }: { feed: ReactNode; assembled?: ReactNode; production: ReactNode }) {
  const [tab, setTab] = useState<"feed" | "assembled" | "production">("feed");
  return (
    <div className="preview-tabs">
      <div className="preview-tablist" role="tablist" aria-label="Modo de vista previa">
        <button type="button" role="tab" aria-selected={tab === "feed"} className={tab === "feed" ? "is-active" : ""} onClick={() => setTab("feed")}>
          Cómo se va a ver
        </button>
        {assembled && (
          <button type="button" role="tab" aria-selected={tab === "assembled"} className={tab === "assembled" ? "is-active" : ""} onClick={() => setTab("assembled")}>
            Ensamblado
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === "production"} className={tab === "production" ? "is-active" : ""} onClick={() => setTab("production")}>
          Producción
        </button>
      </div>
      <div role="tabpanel">{tab === "feed" ? feed : tab === "assembled" ? assembled : production}</div>
    </div>
  );
}
