import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white px-6 py-24 text-center">
      {/* Decorative blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-brand-100 opacity-40 blur-3xl"
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-1.5 text-sm font-medium text-brand-600 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Powered by local Ollama &amp; LangGraph.js
        </div>

        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
          Your customers deserve{' '}
          <span className="text-brand-600">an intelligent assistant</span>
        </h1>

        <p className="mt-6 text-xl text-gray-500 leading-relaxed">
          GCFIS embeds a RAG-powered AI chat widget on your website in minutes.
          It learns from your knowledge base, remembers customers, and handles
          questions 24 / 7 — without you lifting a finger.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`${adminBaseUrl}/signup`}
            className="rounded-xl bg-brand-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-brand-600 transition-colors"
          >
            Start for free →
          </Link>
          <a
            href="#how-it-works"
            className="rounded-xl border border-gray-200 bg-white px-8 py-3.5 text-base font-semibold text-gray-700 hover:border-brand-300 transition-colors"
          >
            See how it works
          </a>
        </div>
      </div>

      {/* Fake widget preview */}
      <div className="relative mx-auto mt-20 max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden text-left">
        <div className="flex items-center gap-3 bg-brand-500 px-4 py-3 text-white">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
            G
          </div>
          <div>
            <p className="text-sm font-semibold">GCFIS Assistant</p>
            <p className="text-xs opacity-70">Online</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-gray-700 max-w-[80%]">
            Hi! How can I help you today?
          </div>
          <div className="ml-auto rounded-xl bg-brand-500 px-3 py-2 text-sm text-white max-w-[80%]">
            What are your business hours?
          </div>
          <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-gray-700 max-w-[80%]">
            We're open Monday–Friday 9AM–6PM and Saturday 10AM–4PM.
          </div>
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">
            Type a message…
          </div>
        </div>
      </div>
    </section>
  );
}
