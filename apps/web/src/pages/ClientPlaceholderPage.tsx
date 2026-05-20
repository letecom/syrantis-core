type ClientPlaceholderPageProps = {
  title: string;
  children: string;
};

export function ClientPlaceholderPage({ title, children }: ClientPlaceholderPageProps) {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-6">
      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{children}</p>
      </div>
    </section>
  );
}
