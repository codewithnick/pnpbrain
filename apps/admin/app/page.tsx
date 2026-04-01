import Link from 'next/link';

export default async function Page() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden px-6 py-10 md:px-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-8rem] top-[-7rem] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[-10rem] top-1/3 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <section className="mx-auto max-w-6xl rounded-3xl border border-white/15 bg-slate-900/65 p-7 shadow-[0_24px_80px_rgba(2,6,23,0.6)] backdrop-blur-xl md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          PNPBrain Admin Command Center
        </p>
        <h1 className="mt-4 max-w-3xl font-[var(--font-space-grotesk)] text-4xl font-bold leading-tight text-white md:text-6xl">
          Run your AI support operations from one control room.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-200 md:text-lg">
          Monitor conversations, tune your assistant, and ship updates to your
          customer-facing widget without leaving this dashboard.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/invitations"
            className="rounded-xl border border-slate-500/70 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:bg-slate-800/60"
          >
            Invite Team Members
          </Link>
          <Link
            href="/dashboard/knowledge"
            className="rounded-xl border border-cyan-400/50 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/10"
          >
            Update Knowledge Base
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Speed</p>
            <p className="mt-2 text-xl font-semibold text-white">Launch in minutes</p>
            <p className="mt-1 text-sm text-slate-300">
              Manage onboarding, widget deployment, and settings from one place.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Visibility</p>
            <p className="mt-2 text-xl font-semibold text-white">Live analytics</p>
            <p className="mt-1 text-sm text-slate-300">
              Track usage and conversation quality before issues reach customers.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Control</p>
            <p className="mt-2 text-xl font-semibold text-white">Policy-safe AI</p>
            <p className="mt-1 text-sm text-slate-300">
              Keep responses aligned to your content and business guardrails.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-7 grid max-w-6xl gap-4 md:grid-cols-3">
        <Link
          href="/dashboard/firecrawl"
          className="group rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-5 transition hover:border-emerald-300/50 hover:bg-emerald-500/20"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Data Refresh</p>
          <p className="mt-2 text-lg font-semibold text-white">Run Firecrawl Sync</p>
          <p className="mt-2 text-sm text-emerald-100/90">
            Re-crawl approved pages and keep your assistant answers current.
          </p>
          <p className="mt-4 text-sm font-semibold text-emerald-200 group-hover:text-emerald-100">
            Open crawler -&gt;
          </p>
        </Link>

        <Link
          href="/dashboard/agent"
          className="group rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-5 transition hover:border-cyan-300/50 hover:bg-cyan-500/20"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Quality</p>
          <p className="mt-2 text-lg font-semibold text-white">Tune Assistant Behavior</p>
          <p className="mt-2 text-sm text-cyan-100/90">
            Adjust model, prompts, and response style for better outcomes.
          </p>
          <p className="mt-4 text-sm font-semibold text-cyan-200 group-hover:text-cyan-100">
            Open agent settings -&gt;
          </p>
        </Link>

        <Link
          href="/dashboard/widget"
          className="group rounded-2xl border border-blue-300/20 bg-blue-500/10 p-5 transition hover:border-blue-300/50 hover:bg-blue-500/20"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Deploy</p>
          <p className="mt-2 text-lg font-semibold text-white">Publish Widget</p>
          <p className="mt-2 text-sm text-blue-100/90">
            Copy embed code, verify domain rules, and go live on your site.
          </p>
          <p className="mt-4 text-sm font-semibold text-blue-200 group-hover:text-blue-100">
            Open widget tools -&gt;
          </p>
        </Link>
      </section>

      <section className="mx-auto mt-7 max-w-6xl rounded-3xl border border-white/10 bg-slate-900/55 p-6 backdrop-blur-xl md:p-8">
        <h2 className="font-[var(--font-space-grotesk)] text-2xl font-semibold text-white md:text-3xl">
          First-week launch checklist
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-600/70 bg-slate-950/45 p-4 text-sm text-slate-200">
            1. Complete onboarding and verify your business profile.
          </div>
          <div className="rounded-xl border border-slate-600/70 bg-slate-950/45 p-4 text-sm text-slate-200">
            2. Add at least one knowledge source with docs or crawl jobs.
          </div>
          <div className="rounded-xl border border-slate-600/70 bg-slate-950/45 p-4 text-sm text-slate-200">
            3. Invite teammates to manage support quality and content.
          </div>
          <div className="rounded-xl border border-slate-600/70 bg-slate-950/45 p-4 text-sm text-slate-200">
            4. Deploy widget and review first real conversations daily.
          </div>
        </div>
      </section>
    </main>
  );
}
