import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line/60 py-10">
      <div className="container-page flex flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
        <Logo />
        <p>&copy; {new Date().getFullYear()} CarvyPaar. Built for people who love cars.</p>
      </div>
    </footer>
  );
}
