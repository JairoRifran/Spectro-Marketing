"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

// A value that has to arrive somewhere else exactly.
//
// Every one of these is pasted into a form on another site that matches it character for
// character. A redirect URI with a trailing slash, or http where the portal expects https, fails
// with the same unhelpful "redirect_uri mismatch" hours later — so these are copied, never read
// off the screen and retyped.

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused, and a silent failure would look like a successful copy
      // and produce a mismatch nobody could explain. Selecting the text is the honest fallback.
      setCopied(false);
    }
  }

  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <code>{value}</code>
      <button type="button" onClick={copy} aria-label={`Copiar ${label}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
