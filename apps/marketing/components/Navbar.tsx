import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-brand-600">
          <span className="h-7 w-7 rounded-lg bg-brand-500 text-white text-sm flex items-center justify-center">
            G
          </span>
          <span>GCFIS</span>
        </Link>

        {/* Links */}
        <ul className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <li>
            <a href="#features" className="hover:text-brand-600 transition-colors">
              Features
            </a>
          </li>
          <li>
            <a href="#how-it-works" className="hover:text-brand-600 transition-colors">
              How it works
            </a>
          </li>
          <li>
            <a href="#pricing" className="hover:text-brand-600 transition-colors">
              Pricing
            </a>
          </li>
        </ul>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link
            href={`${adminBaseUrl}/login`}
            className="hidden md:block text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
          >
            Log in
          </Link>
          <Link
            href={`${adminBaseUrl}/signup`}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>
    </header>
  );
}
