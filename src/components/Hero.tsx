import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Shield, FlaskConical, Award, Activity } from 'lucide-react';

interface HeroProps {
  onShopAll: () => void;
}

const trustItems = [
  { icon: Shield, label: 'Lab Verified' },
  { icon: Award, label: 'Research Grade' },
  { icon: FlaskConical, label: 'Expert Verified' },
  { icon: Activity, label: 'Cold-Chain Shipped' },
];

const Hero: React.FC<HeroProps> = ({ onShopAll }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="px-4 sm:px-7 pt-6">
      {/* ============ HERO CARD ============ */}
      <div
        className={`relative overflow-hidden rounded-[32px] border border-gold-300/40 shadow-frost transition-all duration-[1100ms] ease-out
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        style={{
          background:
            'radial-gradient(120% 140% at 88% 8%, rgba(255,111,165,.40), transparent 55%),' +
            'radial-gradient(90% 120% at 4% 96%, rgba(214,69,126,.30), transparent 52%),' +
            'linear-gradient(135deg, var(--glacier), var(--glacier-2))',
        }}
      >
        {/* sparkle glints */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(2px 2px at 18% 30%,rgba(255,255,255,.9),transparent),' +
              'radial-gradient(2px 2px at 64% 18%,rgba(255,205,228,.85),transparent),' +
              'radial-gradient(1.5px 1.5px at 40% 70%,rgba(255,255,255,.8),transparent),' +
              'radial-gradient(2px 2px at 84% 60%,rgba(255,185,215,.85),transparent),' +
              'radial-gradient(1.5px 1.5px at 30% 88%,rgba(255,255,255,.7),transparent)',
          }}
        />

        {/* giant kanji watermark */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 -bottom-14 select-none font-jp font-extrabold leading-none text-white/5"
          style={{ fontSize: 'clamp(180px, 22vw, 300px)' }}
        >
          雪
        </span>

        {/* ---- CENTERED CONTENT ---- */}
        <div className="relative z-[2] flex flex-col items-center px-7 py-16 text-center sm:px-12 sm:py-20">
          {/* kicker */}
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-300/40 bg-brand-300/15 px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.14em] text-blush-light backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-brand-300 shadow-[0_0_12px_2px_var(--pink)]" />
            Now Open · Research Grade
          </span>

          {/* headline */}
          <h1 className="mt-5 font-jp font-extrabold leading-[1.06] tracking-tight text-white" style={{ fontSize: 'clamp(40px,4.6vw,68px)' }}>
            A cooler kind<br />of <span className="text-pepper-gradient">glow.</span>
          </h1>

          {/* subtitle */}
          <p className="mt-5 max-w-[44ch] text-base leading-relaxed text-blush-light/85 sm:text-lg">
            Lab-verified research peptides, frozen at purity and shipped cold. Built for
            biohackers and longevity seekers who don&rsquo;t compromise.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={onShopAll}
              className="group inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 font-display text-base font-bold text-[#2a1604] transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: 'linear-gradient(180deg,#f6dd9a,#c79b3f)',
                boxShadow: '0 16px 36px -14px rgba(247,116,168,.7),0 0 0 1px rgba(255,255,255,.6) inset',
              }}
            >
              Explore Peptides
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.2} />
            </button>
            <a
              href="/protocols"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3.5 text-[15.5px] font-semibold text-blush-light transition-all duration-200 hover:bg-white/15"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
              View Protocols
            </a>
          </div>
        </div>
      </div>

      {/* ============ TRUST BAR ============ */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 rounded-2xl border border-gold-300/40 bg-frost px-5 py-4 shadow-soft backdrop-blur-md">
          {trustItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 text-sm font-semibold text-charcoal-200">
              <item.icon className="h-[22px] w-[22px] text-brand-700" strokeWidth={1.8} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Hero;
