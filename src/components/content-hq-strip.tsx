import Link from "next/link";
import { getContentOperationalCounts } from "@/features/content/data";

// Operational counters only. There is deliberately nothing here about reach, engagement,
// impressions or conversion: nothing is published yet, so any such number would be invented.

export async function ContentHqStrip() {
  const counts = await getContentOperationalCounts();
  const total = counts.inCreation + counts.waitingApproval + counts.ready;
  if (total === 0) return null;

  return (
    <section className="content-hq-strip" aria-label="Estado del contenido">
      <div className="strip-heading">
        <span>CONTENIDO</span>
        <Link href="/content">Abrir Content Studio</Link>
      </div>
      <div className="strip-counts">
        <Link href="/content?status=generating"><b>{counts.inCreation}</b><small>en creación</small></Link>
        <Link href="/content?status=waiting_approval"><b>{counts.waitingApproval}</b><small>esperando aprobación</small></Link>
        <Link href="/content?status=approved"><b>{counts.ready}</b><small>listas o aprobadas</small></Link>
      </div>
    </section>
  );
}
