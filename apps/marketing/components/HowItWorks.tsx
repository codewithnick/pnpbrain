const steps = [
  {
    number: '01',
    title: 'Sign up & connect your site',
    description:
      'Create an account, name your assistant, and paste your website URL. GCFIS is ready in under 2 minutes.',
  },
  {
    number: '02',
    title: 'Build your knowledge base',
    description:
      'Upload PDFs, paste content, or let Firecrawl automatically crawl approved pages. Content is chunked and embedded automatically.',
  },
  {
    number: '03',
    title: 'Embed the widget',
    description:
      'Copy one <script> tag into your HTML, or install the WordPress plugin. The widget appears instantly on your site.',
  },
  {
    number: '04',
    title: 'Watch it work',
    description:
      'Customers get accurate, instant answers 24/7. You monitor conversations and refine the knowledge base from the admin dashboard.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6 bg-brand-50">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">How it works</h2>
          <p className="mt-4 text-lg text-gray-500">Four steps from signup to live AI assistant.</p>
        </div>

        <div className="space-y-8">
          {steps.map((step, i) => (
            <div key={step.number} className="flex items-start gap-6">
              <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white font-bold text-sm">
                {step.number}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-1 text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
