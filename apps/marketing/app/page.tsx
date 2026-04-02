import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import WhyChoose from '@/components/WhyChoose';
import Pricing from '@/components/Pricing';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <WhyChoose />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
