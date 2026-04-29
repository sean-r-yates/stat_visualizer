import Link from "next/link";
import { notFound } from "next/navigation";

import { buildDashboardSnapshot } from "@/lib/dashboard";
import { isSecretSlugMatch } from "@/lib/env";

import { DashboardClient } from "./dashboard-client";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ secret: string }>;
};

export const dynamic = "force-dynamic";

export default async function SecretDashboardPage({ params }: PageProps) {
  const { secret } = await params;

  if (!isSecretSlugMatch(secret)) {
    notFound();
  }

  const snapshot = await buildDashboardSnapshot();

  return (
    <main className={styles.pageShell}>
      <nav className={styles.navRail} aria-label="Dashboard pages">
        <Link className={`${styles.navLink} ${styles.navLinkActive}`} href={`/r/${secret}`}>
          Winners
        </Link>
        <Link className={styles.navLink} href={`/r/${secret}/frankenstiener`}>
          Frankenstiener
        </Link>
      </nav>
      <DashboardClient secret={secret} initialSnapshot={snapshot} />
    </main>
  );
}
