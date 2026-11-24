import { clsx } from "clsx";
import Image from "next/image";
import Link from "next/link";

import logoDark from "../../public/brand/carvypaar-logo-dark.png";
import logoLight from "../../public/brand/carvypaar-logo.png";

/**
 * Brand logo. The navy lettering version is for light backgrounds; the white lettering one is
 * for dark backgrounds. `inverted` always uses the white one (e.g. the navy footer); otherwise
 * it follows the site theme.
 */
export function Logo({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  const size = clsx("h-11 w-auto sm:h-12", className);
  return (
    <Link href="/" className="flex shrink-0 items-center" aria-label="CarvyPaar home">
      {inverted ? (
        <Image src={logoDark} alt="CarvyPaar" sizes="240px" className={size} priority />
      ) : (
        <>
          <Image src={logoLight} alt="CarvyPaar" sizes="240px" className={clsx(size, "dark:hidden")} priority />
          <Image src={logoDark} alt="CarvyPaar" sizes="240px" className={clsx(size, "hidden dark:block")} priority />
        </>
      )}
    </Link>
  );
}
