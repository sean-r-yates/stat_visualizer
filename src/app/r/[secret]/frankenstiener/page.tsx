import Link from "next/link";
import { notFound } from "next/navigation";

import { buildFrankenstienerSnapshot } from "@/lib/frankenstiener";
import { isSecretSlugMatch } from "@/lib/env";

import pageStyles from "../page.module.css";
import { FrankenstienerClient } from "./frankenstiener-client";

type PageProps = {
  params: Promise<{ secret: string }>;
};

export const dynamic = "force-dynamic";

export default async function FrankenstienerPage({ params }: PageProps) {
  const { secret } = await params;

  if (!isSecretSlugMatch(secret)) {
    notFound();
  }

  const snapshot = await buildFrankenstienerSnapshot();

  return (
    <main className={pageStyles.pageShell}>
      <nav className={pageStyles.navRail} aria-label="Dashboard pages">
        <Link className={pageStyles.navLink} href={`/r/${secret}`}>
          Winners
        </Link>
        <Link className={`${pageStyles.navLink} ${pageStyles.navLinkActive}`} href={`/r/${secret}/frankenstiener`}>
          Frankenstiener
        </Link>
      </nav>
      <FrankenstienerClient secret={secret} initialSnapshot={snapshot} />
    </main>
  );
}
