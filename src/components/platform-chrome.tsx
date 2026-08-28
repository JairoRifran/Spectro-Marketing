"use client";
import type { ReactNode } from "react";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music2, Repeat2, Send } from "lucide-react";
import type { MockAccount } from "@/features/content/account";

// The interface a platform lays over a piece.
//
// Extracted so the static simulation and the assembled playback wrap their media in the same
// chrome. Two copies would drift the first time one of them gained a control, and the whole
// point of both views is that what you see is what the platform will show.
//
// The affordances are drawn because they change how a piece reads — a caption is truncated in a
// feed, an action rail covers the right edge of a vertical video. No counts appear on any of
// them: nothing is published, so a like or a view here would be invented.

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "SP";
}

/** A full-screen vertical video: TikTok, Reels, Shorts, Stories. */
export function VerticalChrome({ account, caption, platform, children, footer }: {
  account: MockAccount;
  caption: string;
  platform: string;
  /** The picture the chrome sits over. */
  children: ReactNode;
  footer?: ReactNode;
}) {
  const isYouTube = platform === "youtube_shorts";
  return (
    <div className="mock-frame has-art">
      <div className="mock-frame-art">{children}</div>

      <div className="mock-rail" aria-hidden="true">
        <span><Heart size={19} /></span>
        <span><MessageCircle size={19} /></span>
        <span>{isYouTube ? <Repeat2 size={19} /> : <Bookmark size={19} />}</span>
        <span><Send size={19} /></span>
      </div>

      <div className="mock-vertical-foot">
        <p className="mock-handle"><span className="mock-avatar" aria-hidden="true">{initials(account.name)}</span> {account.handle}</p>
        <p className="mock-vertical-caption">{caption}</p>
        <p className="mock-sound"><Music2 size={11} /> Audio original · {account.name}</p>
        {footer}
      </div>
    </div>
  );
}

/** A post in a feed: Instagram, Facebook. */
export function PostChrome({ account, children, dots, caption }: {
  account: MockAccount;
  children: ReactNode;
  dots?: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="mock-post">
      <header className="mock-post-head">
        <span className="mock-avatar" aria-hidden="true">{initials(account.name)}</span>
        <div><strong>{account.handle}</strong><small>{account.name}</small></div>
        <MoreHorizontal size={16} aria-hidden="true" />
      </header>
      {children}
      {dots}
      <div className="mock-actions" aria-hidden="true">
        <Heart size={19} /><MessageCircle size={19} /><Send size={19} /><Bookmark size={19} className="mock-actions-end" />
      </div>
      {caption}
    </div>
  );
}
