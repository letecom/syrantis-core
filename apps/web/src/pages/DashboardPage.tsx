import { Link } from "react-router-dom";

export function DashboardPage() {
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold uppercase text-accent">Internal console</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">Admin dashboard</h2>
      <p className="mt-4 text-base leading-7 text-slate-600">
        This is the minimal internal admin console for authenticated Syrantis operators. It starts
        with session restore, protected navigation, logout, and read-only pushback lookup.
      </p>
      <Link
        className="mt-6 block max-w-xl rounded-lg border border-line bg-white p-5 shadow-sm transition hover:border-brand"
        to="/app/pushback"
      >
        <span className="text-sm font-semibold uppercase text-brand">Pushback Lookup</span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">
          Inspect the safe pushback status read model for a single email send or draft.
        </span>
      </Link>
    </section>
  );
}
