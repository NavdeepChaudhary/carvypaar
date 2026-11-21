import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2" aria-label="CarvyPaar home">
      <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-accent font-display text-sm font-black text-white shadow-glow transition-transform group-hover:-rotate-6">
        CP
      </span>
      <span className="font-display text-lg font-bold tracking-[0.2em]">
        CARVY<span className="text-accent">PAAR</span>
      </span>
    </Link>
  );
}
