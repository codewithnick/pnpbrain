import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    period: '/ month',
    description: 'Perfect for trying GCFIS on one site.',
    features: [
      '1 website',
      '100 conversations / month',
      '5 MB knowledge base',
      'Ollama local dev',
      'Community support',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$29',
    period: '/ month',
    description: 'For businesses ready to scale.',
    features: [
      '5 websites',
      'Unlimited conversations',
      '100 MB knowledge base',
      'Firecrawl auto-refresh',
      'Long-term memory',
      'Email support',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Dedicated infrastructure, SLA, SSO.',
    features: [
      'Unlimited websites',
      'Unlimited everything',
      'Custom LLM provider',
      'Self-hosted option',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 bg-white">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">Simple, transparent pricing</h2>
          <p className="mt-4 text-lg text-gray-500">Start free. Upgrade when you're ready.</p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlighted
                  ? 'border-brand-500 bg-brand-500 text-white shadow-xl scale-105'
                  : 'border-gray-200 bg-white text-gray-900'
              }`}
            >
              <h3
                className={`text-lg font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}
              >
                {plan.name}
              </h3>
              <p className={`text-sm mb-6 ${plan.highlighted ? 'text-brand-100' : 'text-gray-500'}`}>
                {plan.description}
              </p>

              <div className="mb-6">
                <span className="text-4xl font-extrabold">{plan.price}</span>
                <span
                  className={`text-sm ml-1 ${plan.highlighted ? 'text-brand-100' : 'text-gray-400'}`}
                >
                  {plan.period}
                </span>
              </div>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className={`flex items-center gap-2 text-sm ${
                      plan.highlighted ? 'text-brand-50' : 'text-gray-600'
                    }`}
                  >
                    <span className="text-green-400 font-bold">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.name === 'Enterprise' ? 'mailto:hello@gcfis.com' : `${adminBaseUrl}/signup`}
                className={`block rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-white text-brand-600 hover:bg-brand-50'
                    : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
