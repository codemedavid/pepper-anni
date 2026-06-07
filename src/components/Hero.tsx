import React, { useEffect, useState } from 'react';
import { ArrowRight, Leaf, Shield, FlaskConical, Award } from 'lucide-react';

interface HeroProps {
  onShopAll: () => void;
}

const Hero: React.FC<HeroProps> = ({ onShopAll }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative min-h-[92vh] overflow-hidden bg-cream flex items-center justify-center pt-20 pb-16">

      {/* Background — botanical zen veil */}
      <div className="absolute inset-0 bg-gradient-to-b from-cream via-brand-50/40 to-cream" />
      <div className="absolute inset-0 pointer-events-none opacity-[0.08]" style={{
        backgroundImage: 'radial-gradient(circle at 20% 20%, #C53A6E 0px, transparent 1px), radial-gradient(circle at 80% 60%, #8A1E49 0px, transparent 1px)',
        backgroundSize: '48px 48px, 64px 64px',
      }} />

      {/* Floating botanical strokes */}
      <svg className="absolute top-10 right-10 w-64 h-64 text-brand-300 opacity-20 hidden md:block" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round">
        <path d="M100 10 C 90 60, 110 100, 100 190" />
        <path d="M100 40 C 80 50, 70 60, 60 70" />
        <path d="M100 60 C 120 70, 130 80, 140 90" />
        <path d="M100 90 C 80 100, 70 110, 60 120" />
        <path d="M100 120 C 120 130, 130 140, 140 150" />
        <circle cx="60" cy="70" r="3" />
        <circle cx="140" cy="90" r="3" />
        <circle cx="60" cy="120" r="3" />
        <circle cx="140" cy="150" r="3" />
      </svg>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">

        {/* Left Column: Content */}
        <div className={`
          flex flex-col text-left max-w-2xl
          transition-all duration-1000 ease-out transform
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
        `}>

          <div className="inline-flex items-center gap-2 mb-6 self-start">
            <span className="h-px w-8 bg-brand-500" />
            <span className="text-[11px] tracking-[0.3em] uppercase text-brand-600 font-medium">Biohacking · Est. 2024</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-medium mb-4 leading-[1.05] tracking-tight">
            <span className="text-pepper-gradient">PepperAnni</span>
          </h1>
          <h2 className="text-base md:text-lg font-sans font-medium text-charcoal-700 mb-8 tracking-[0.35em] uppercase">
            Glow Smarter &middot; Live Longer
          </h2>

          <p className="text-lg md:text-xl text-charcoal-600 mb-10 leading-relaxed font-light max-w-xl">
            Research-grade peptides engineered for biohackers and longevity seekers. Each formulation is lab-tested for purity — so you can glow smarter and live longer.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <button
              onClick={onShopAll}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 group"
            >
              Explore Peptides
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-brand-100 pt-8">
            {[
              { icon: Shield, label: '99% Purity Guaranteed' },
              { icon: FlaskConical, label: 'Lab Tested' },
              { icon: Award, label: 'Premium Grade' },
              { icon: Leaf, label: 'Longevity-Focused' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm font-medium text-charcoal-700">
                <item.icon className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Brand mark / Visual */}
        <div className={`
          relative hidden md:flex justify-center items-center h-full min-h-[520px]
          transition-all duration-1000 delay-300 ease-out
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}>
          {/* Soft glow */}
          <div className="absolute inset-0 bg-gradient-radial from-brand-200/40 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />

          {/* Concentric rings */}
          <div className="absolute inset-12 border border-brand-200/60 rounded-full" />
          <div className="absolute inset-20 border border-brand-100 rounded-full" />
          <div className="absolute inset-28 border border-brand-100/60 rounded-full" />

          <div className="relative z-10 w-[360px] h-[460px] flex items-center justify-center animate-float">
            <div className="absolute inset-0 bg-gradient-to-b from-charcoal-900 via-brand-700 to-brand-500 rounded-[40px] shadow-2xl opacity-95" />
            <div className="absolute inset-[1px] rounded-[39px] bg-gradient-to-b from-charcoal-900 via-brand-700 to-brand-500" />

            {/* Botanical line art overlay */}
            <svg className="absolute inset-0 w-full h-full text-white/30" viewBox="0 0 300 400" fill="none" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round">
              <path d="M150 60 C 140 140, 160 220, 150 360" />
              <path d="M150 100 C 130 110, 115 120, 100 130" />
              <path d="M150 140 C 170 150, 185 160, 200 170" />
              <path d="M150 180 C 130 190, 115 200, 100 210" />
              <path d="M150 220 C 170 230, 185 240, 200 250" />
              <path d="M150 260 C 130 270, 115 280, 100 290" />
              <circle cx="100" cy="130" r="2.5" />
              <circle cx="200" cy="170" r="2.5" />
              <circle cx="100" cy="210" r="2.5" />
              <circle cx="200" cy="250" r="2.5" />
              <circle cx="100" cy="290" r="2.5" />
            </svg>

            <div className="relative z-10 flex flex-col items-center text-center px-8">
              <div className="font-heading text-[120px] leading-none font-medium text-white tracking-tight">
                PA
              </div>
              <div className="mt-8 font-heading text-3xl text-white tracking-[0.2em]">
                PepperAnni
              </div>
              <div className="mt-2 text-[11px] text-brand-100 tracking-[0.3em] font-medium">
                GLOW SMARTER · LIVE LONGER
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Hero;
