import EditListing from "./EditListing";

// A static export (the GitHub Pages preview) must know every URL at build time, but listing ids
// only exist in the database. One placeholder keeps the route buildable there; normal
// deployments render any id on demand. The listing editor UI itself is a client component.
export function generateStaticParams() {
  return process.env.GITHUB_PAGES === "true" ? [{ id: "0" }] : [];
}

export default function Page() {
  return <EditListing />;
}
