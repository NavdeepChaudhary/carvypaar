import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[80vh] flex-col items-center justify-center pt-24 text-center">
      <p className="font-display text-7xl font-black text-accent sm:text-9xl">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold uppercase">Wrong turn</h1>
      <p className="mt-2 max-w-md text-muted">This road doesn&apos;t exist (yet). Let&apos;s get you back on track.</p>
      <Link href="/" className="mt-8 rounded-xl bg-accent px-6 py-3 font-semibold text-white hover:shadow-glow">
        Back to home
      </Link>
    </div>
  );
}
