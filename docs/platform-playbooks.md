# Platform playbooks

A playbook is the maintainable source of truth for how one platform is written for. Playbooks
live in `src/server/content/playbooks/`, one file per platform, as typed data rather than
strings inside React components.

**Everything in a playbook is documented best practice, never a performance promise.** No field
may claim a piece will reach, convert or go viral. Ranking systems are not published and this
module does not model them. A test asserts no playbook contains promise language.

## Shape

`PlatformPlaybook` carries `summary`, `primaryObjectives`, `preferredFormats`, `tone`,
`hookGuidelines`, `lengthGuidelines`, `captionGuidelines`, `ctaGuidelines`, `visualGuidelines`,
`videoGuidelines`, `storytellingPatterns`, `do`, `dont` and `qualityChecks`.

`tone.informalityCeiling` is how far the platform allows a brand to relax. The brand has its own
ceiling, and **the stricter of the two always wins** — a regulated brand stays precise on TikTok.

## Format compatibility

| Platform | Formats |
| --- | --- |
| instagram | reel, carousel, story, static_post |
| facebook | reel, short_video, carousel, story, static_post, text_post |
| tiktok | short_video |
| youtube_shorts | short_video |
| linkedin | text_post, document_post, short_video, static_post |

Planned platforms — `threads`, `x`, `pinterest` — exist in the taxonomy so contracts can name
them, but have no playbook and no adapter. Asking for either throws `platform_not_supported`.

## Instagram

Visual-first. A piece earns its second look through craft and earns distribution through saves
and shares. Reels: the hook is visual and verbal at once, sound off by default, text clear of the
bottom quarter. Carousels: the cover must read at thumbnail size and the visual system must hold
across every slide. Stories: sequence, not a single frame. Static: legibility over decoration.

Hook budget 12 words, caption 80–1400 characters, 7–90 seconds.

## TikTok

Native video. A piece is judged on whether it feels made for the feed rather than adapted into
it, and corporate register is itself a reason to scroll past. The first sentence is the whole
decision: start mid-thought, skip the greeting and the brand name. The visual has to change
inside the opening window, not only the audio. Pace, visual interruption and story progression
are the retention mechanics; nothing here claims a number.

Hook budget 10 words, caption 20–300 characters, 15–60 seconds, opening window 1.5 seconds.

**A TikTok is not an Instagram Reel with the watermark removed.** The register and pacing differ,
and the playbook says so in `dont`.

## YouTube Shorts

Short vertical video inside a search-and-library platform. State what the viewer will know by the
end, then start delivering it. A hook that over-promises costs the payoff. A clean loop back to
the opening line is a legitimate ending. Title and description keep working after the feed has
moved on, so both are prepared as metadata — no YouTube API is integrated.

Hook budget 12 words, caption 40–900 characters, 20–60 seconds, opening window 3 seconds.

## LinkedIn

Credibility is the currency. A piece earns attention by saying something specific and defensible
about work the reader recognises. The first two lines survive truncation and carry the point.
Contrarian angles are welcome when grounded; numbers must be traceable to something the brand
can show, which is why the LinkedIn playbook marks evidence as an `error`-severity check.

Formats: text post, document/carousel, video, case study framing. Hook budget 20 words, body
400–3000 characters.

## Facebook

Its own platform, not an Instagram mirror. A broader and often older audience, where context in
the copy is an asset rather than clutter and community actions are the honest ask. Reels here can
be paced slightly slower with heavier context than the TikTok cut.

Hook budget 15 words, caption 100–2000 characters, 15–120 seconds.

## Extending

Add a platform by creating its playbook file, registering it in `playbooks/index.ts`, adding it
to `SUPPORTED_PLATFORMS` and its format row, and writing an adapter. The taxonomy tests will fail
until the compatibility matrix and the playbook agree.
