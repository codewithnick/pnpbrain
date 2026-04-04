import { Fragment } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Integrations from '@/components/Integrations';
import HowItWorks from '@/components/HowItWorks';
import WhyChoose from '@/components/WhyChoose';
import Pricing from '@/components/Pricing';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <Fragment>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Integrations />
        <HowItWorks />
        <WhyChoose />
        <Pricing />
      </main>
      <Footer />
    </Fragment>
  );
}
