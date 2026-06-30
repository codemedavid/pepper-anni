import React from 'react';
import { HelpCircle, Truck, FlaskConical, Shield } from 'lucide-react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative bg-gradient-to-b from-charcoal-900 via-charcoal-800 to-brand-700 pt-20 pb-8 overflow-hidden">
      {/* Botanical decoration */}
      <svg className="absolute -top-8 right-12 w-48 h-48 text-brand-200/20 hidden md:block" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round">
        <path d="M100 10 C 90 80, 110 140, 100 200" />
        <path d="M100 50 C 80 60, 70 70, 60 80" />
        <path d="M100 80 C 120 90, 130 100, 140 110" />
        <path d="M100 120 C 80 130, 70 140, 60 150" />
        <circle cx="60" cy="80" r="2.5" />
        <circle cx="140" cy="110" r="2.5" />
        <circle cx="60" cy="150" r="2.5" />
      </svg>

      <div className="container mx-auto px-4 relative">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">

          {/* Brand Section */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="PepperAnni"
                className="h-16 w-auto object-contain bg-white rounded-full p-1"
              />
              <div className="flex flex-col leading-none">
                <span className="text-3xl font-heading font-medium text-white tracking-wide">PepperAnni</span>
                <span className="text-[9px] text-brand-100 tracking-[0.2em] mt-1 font-medium">BIOHACKING · GLOW SMARTER · LIVE LONGER</span>
              </div>
            </div>
            <p className="text-charcoal-200 text-sm max-w-xs text-center md:text-left font-light leading-relaxed">
              Research-grade peptides for biohacking and longevity. Lab-tested, high-purity formulations to help you glow smarter and live longer.
            </p>
          </div>

          {/* Contact Us */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <h3 className="text-white font-medium text-xs uppercase tracking-[0.3em] mb-3">Contact</h3>

            <a
              href="mailto:Pepperanni2026@gmail.com"
              className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Pepperanni2026@gmail.com
            </a>

            <a
              href="tel:+639475067148"
              className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              0947 506 7148
            </a>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <h3 className="text-white font-medium text-xs uppercase tracking-[0.3em] mb-3">Explore</h3>
            <a href="#" className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm">
              <FlaskConical className="w-4 h-4" strokeWidth={1.5} />
              Products
            </a>
            <a href="/track-order" className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4" strokeWidth={1.5} />
              Track Order
            </a>
            <a href="/faq" className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm">
              <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
              FAQ
            </a>
            <a href="/coa" className="text-charcoal-200 hover:text-brand-100 transition-colors flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4" strokeWidth={1.5} />
              Lab Reports
            </a>
          </div>

        </div>

        {/* Zen divider */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-300/30 to-transparent" />
          <span className="px-4 text-brand-200/60 text-xs tracking-[0.4em] font-serif italic">glow</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-brand-300/30 to-transparent" />
        </div>

        {/* Footer Bottom */}
        <div className="text-center">
          <p className="text-xs text-charcoal-300 tracking-wide">
            © {currentYear} PepperAnni. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
