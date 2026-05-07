import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 text-center text-ink">
      <section>
        <p className="text-sm font-semibold uppercase text-accent">Not found</p>
        <h1 className="mt-2 text-3xl font-semibold">This page does not exist.</h1>
        <Link className="mt-5 inline-block text-sm font-semibold text-brand" to="/app">
          Return to admin
        </Link>
      </section>
    </main>
  );
}
