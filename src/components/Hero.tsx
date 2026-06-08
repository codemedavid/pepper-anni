import React, { useEffect, useState } from 'react';
import { ArrowRight, Leaf, Shield, FlaskConical, Award } from 'lucide-react';

interface HeroProps {
  onShopAll: () => void;
}

const trustItems = [
  { icon: Shield, label: '99% Purity Guaranteed' },
  { icon: FlaskConical, label: 'Lab Tested' },
  { icon: Award, label: 'Premium Grade' },
  { icon: Leaf, label: 'Longevity-Focused' },
];

const Hero: React.FC<HeroProps> = ({ onShopAll }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream flex items-center justify-center pt-24 pb-16">

      {/* Brand washes */}
      <div className="absolute inset-0 bg-gradient-to-b from-warm-white via-cream to-blush-light/25" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(50% 45% at 50% 30%, rgba(197,58,110,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Soft concentric brand rings behind the wordmark */}
      <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-[640px] h-[640px] rounded-full border border-brand-200/40" />
        <div className="absolute inset-16 rounded-full border border-brand-200/30" />
        <div className="absolute inset-32 rounded-full border border-brand-100/40" />
      </div>

      {/* Gallery hairline frame */}
      <div className="absolute inset-4 sm:inset-6 lg:inset-8 border border-brand-100/70 rounded-[28px] pointer-events-none" />

      {/* Content */}
      <div
        className={`
          relative z-10 w-full max-w-3xl mx-auto px-6 text-center flex flex-col items-center
          transition-all duration-[1100ms] ease-out transform
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
        `}
      >
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-4 mb-10">
          <span className="h-px w-10 bg-brand-300" />
          <span className="text-[11px] tracking-[0.5em] uppercase text-brand-600 font-medium">
            Biohacking · Est. 2024
          </span>
          <span className="h-px w-10 bg-brand-300" />
        </div>

        {/* Wordmark */}
        <h1 className="font-heading font-medium leading-[0.95] tracking-tight text-6xl md:text-7xl lg:text-[6rem] mb-7">
          <span className="text-pepper-gradient">PepperAnni</span>
        </h1>

        {/* Tagline */}
        <p className="text-xs md:text-sm font-sans font-medium text-charcoal-500 mb-10 tracking-[0.5em] uppercase">
          Glow Smarter &middot; Live Longer
        </p>

        {/* Paragraph */}
        <p className="text-lg md:text-xl text-charcoal-600 leading-relaxed font-light max-w-2xl mb-12">
          Research-grade peptides engineered for biohackers and longevity seekers. Each formulation is lab-tested for purity — so you can glow smarter and live longer.
        </p>

        {/* CTA */}
        <button
          onClick={onShopAll}
          className="btn-primary inline-flex items-center justify-center gap-2 group"
        >
          Explore Peptides
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Trust row */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 max-w-2xl">
          {trustItems.map((item, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="hidden sm:block w-1 h-1 rounded-full bg-brand-300" />}
              <div className="flex items-center gap-2 text-charcoal-700">
                <item.icon className="w-4 h-4 text-brand-500" strokeWidth={1.4} />
                <span className="text-[13px] font-medium tracking-wide">{item.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Hero;
