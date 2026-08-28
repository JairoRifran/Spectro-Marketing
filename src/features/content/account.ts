// The account a simulated piece is shown as. Real handles do not exist yet — the social
// presences are still being created by hand — so the placeholder is derived from the
// organization rather than invented, and it is replaced by the connected account at M03.
//
// Deliberately plain module, not part of the mockup component: the pages that render the
// simulation are server components and cannot call into a "use client" module.

export interface MockAccount {
  name: string;
  handle: string;
}

export function accountFor(orgName: string): MockAccount {
  const handle = orgName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return { name: orgName, handle: `@${handle || "spectro"}` };
}
