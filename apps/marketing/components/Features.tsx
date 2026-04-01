const features = [
  {
    icon: '🧠',
    title: 'RAG-Powered Knowledge Base',
    description:
      'Upload documents, paste URLs or run Firecrawl to crawl your site. GCFIS chunks, embeds, and retrieves the right context for every answer.',
  },
  {
    icon: '💾',
    title: 'Long-Term Customer Memory',
    description:
      'The agent quietly extracts facts from conversations and remembers them across sessions — so customers never repeat themselves.',
  },
  {
    icon: '🔌',
    title: 'One-Line Embed',
    description:
      'Drop a single <script> tag on any HTML page or install the WordPress plugin. The widget is self-contained and < 50 KB.',
  },
  {
    icon: '🏃',
    title: 'Runs Locally with Ollama',
    description:
      'No cloud API keys required in development. Pull `llama3.1:8b` and start building. Switch to GPT-4 or Claude with one env var.',
  },
  {
    icon: '🔒',
    title: 'Domain-Scoped Web Scraping',
    description:
      'Give Firecrawl permission to index only your approved domains. The agent can never scrape arbitrary URLs at runtime.',
  },
  {
    icon: '📊',
    title: 'Admin Dashboard',
    description:
      'Manage the knowledge base, review conversations, monitor crawl jobs, and tweak the widget appearance — all from one place.',
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 px-6 bg-white">
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">
            Everything your AI assistant needs
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            A full-stack, production-ready platform — not just a chatbot wrapper.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-gray-100 bg-gray-50 p-6 hover:border-brand-200 hover:shadow-md transition-all"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
