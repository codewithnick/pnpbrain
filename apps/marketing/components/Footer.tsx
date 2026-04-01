export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white px-6 py-12">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-gray-500">
        <p className="font-semibold text-gray-700">
          GCFIS{' '}
          <span className="font-normal text-gray-400">
            — General Customer Facing Intelligent System
          </span>
        </p>
        <ul className="flex gap-6">
          <li>
            <a href="#features" className="hover:text-gray-700 transition-colors">
              Features
            </a>
          </li>
          <li>
            <a href="#pricing" className="hover:text-gray-700 transition-colors">
              Pricing
            </a>
          </li>
          <li>
            <a href="mailto:hello@gcfis.com" className="hover:text-gray-700 transition-colors">
              Contact
            </a>
          </li>
        </ul>
        <p>© {new Date().getFullYear()} GCFIS. All rights reserved.</p>
      </div>
    </footer>
  );
}
