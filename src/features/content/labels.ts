// Display names for platforms and formats. Kept out of any component so both the server pages
// and the client mockup can use the same strings instead of drifting into two vocabularies.

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  linkedin: "LinkedIn",
};

export const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel",
  short_video: "Video corto",
  carousel: "Carrusel",
  story: "Stories",
  static_post: "Post estático",
  text_post: "Post de texto",
  document_post: "Documento",
};
