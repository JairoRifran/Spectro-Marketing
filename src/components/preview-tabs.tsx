"use client";
import { useState, type ReactNode } from "react";

// Two ways to look at the same piece, because they answer different questions. The simulation
// asks "how will this read where it lands?"; the production view asks "is the craft right?".
// It opens on the simulation: that is the one a person can judge without being briefed.

export function PreviewTabs({ feed, production }: { feed: ReactNode; production: ReactNode }) {
  const [tab, setTab] = useState<"feed" | "production">("feed");
  return (
    <div className="preview-tabs">
      <div className="preview-tablist" role="tablist" aria-label="Modo de vista previa">
        <button type="button" role="tab" aria-selected={tab === "feed"} className={tab === "feed" ? "is-active" : ""} onClick={() => setTab("feed")}>
          Cómo se va a ver
        </button>
        <button type="button" role="tab" aria-selected={tab === "production"} className={tab === "production" ? "is-active" : ""} onClick={() => setTab("production")}>
          Producción
        </button>
      </div>
      <div role="tabpanel">{tab === "feed" ? feed : production}</div>
    </div>
  );
}
