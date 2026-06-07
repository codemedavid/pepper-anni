import React, { useState } from 'react';
import { ShoppingCart, Menu, X, FlaskConical, HelpCircle, Truck, Calculator, Shield, ClipboardList, Star } from 'lucide-react';

interface HeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onMenuClick }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="bg-white/95 backdrop-blur-sm sticky top-0 z-50 border-b border-brand-100">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo - Rectangular */}
            <button
              onClick={() => { onMenuClick(); setMobileMenuOpen(false); }}
              className="flex items-center hover:opacity-90 transition-opacity"
            >
              <img
                src="/logo.png"
                alt="PepperAnni"
                className="h-11 sm:h-14 w-auto object-contain rounded-full"
              />
              <span className="ml-2 sm:ml-3 flex flex-col leading-none">
                <span className="text-lg sm:text-3xl font-heading font-semibold text-pepper-gradient tracking-wide">
                  PepperAnni
                </span>
                <span className="text-[8px] sm:text-[9px] font-sans font-medium text-brand-600 tracking-[0.18em] mt-0.5">
                  BIOHACKING · GLOW SMARTER · LIVE LONGER
                </span>
              </span>
            </button>

            {/* Right Side Navigation */}
            <div className="flex items-center gap-2 md:gap-6 ml-auto">
              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1 lg:gap-2">
                <button
                  onClick={onMenuClick}
                  className="text-sm font-medium text-charcoal-700 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <FlaskConical className="w-4 h-4" />
                  Products
                </button>
                <a
                  href="/assessment"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <ClipboardList className="w-4 h-4" />
                  Assessment
                </a>
                <a
                  href="/calculator"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Calculator
                </a>
                <a
                  href="/protocols"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <FlaskConical className="w-4 h-4" />
                  Protocols
                </a>
                <a
                  href="/reviews"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Star className="w-4 h-4" />
                  Reviews
                </a>
                <a
                  href="/track-order"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  Track
                </a>
                <a
                  href="/faq"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <HelpCircle className="w-4 h-4" />
                  FAQ
                </a>
                <a
                  href="/coa"
                  className="text-sm font-medium text-charcoal-600 hover:text-brand-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Lab Reports
                </a>
              </nav>

              {/* Cart Button */}
              <button
                onClick={onCartClick}
                className="relative p-2.5 text-charcoal-700 hover:bg-brand-50 rounded-xl transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {cartItemsCount > 99 ? '99+' : cartItemsCount}
                  </span>
                )}
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2.5 text-charcoal-700 hover:bg-brand-50 rounded-xl transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-charcoal-900/30 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sidebar Drawer */}
          <div
            className="absolute top-0 right-0 bottom-0 w-[300px] bg-white shadow-2xl border-l border-brand-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-brand-100">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="PepperAnni"
                  className="h-9 w-auto object-contain rounded-full"
                />
                <span className="flex flex-col leading-none">
                  <span className="text-xl font-heading font-semibold text-pepper-gradient tracking-wide">
                    PepperAnni
                  </span>
                  <span className="text-[8px] font-sans font-medium text-brand-600 tracking-[0.15em] mt-0.5">
                    GLOW SMARTER · LIVE LONGER
                  </span>
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-charcoal-500 hover:text-rose-500 transition-colors rounded-lg hover:bg-brand-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col space-y-1">
                <button
                  onClick={() => {
                    onMenuClick();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <FlaskConical className="w-[18px] h-[18px]" />
                  </div>
                  Products
                </button>

                <a
                  href="/assessment"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <ClipboardList className="w-[18px] h-[18px]" />
                  </div>
                  Assessment
                </a>

                <a
                  href="/calculator"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <Calculator className="w-[18px] h-[18px]" />
                  </div>
                  Calculator
                </a>

                <a
                  href="/protocols"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <FlaskConical className="w-[18px] h-[18px]" />
                  </div>
                  Protocols
                </a>

                <a
                  href="/reviews"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <Star className="w-[18px] h-[18px]" />
                  </div>
                  Reviews
                </a>

                <a
                  href="/track-order"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <Truck className="w-[18px] h-[18px]" />
                  </div>
                  Track Order
                </a>

                <a
                  href="/faq"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <HelpCircle className="w-[18px] h-[18px]" />
                  </div>
                  FAQ
                </a>

                <a
                  href="/coa"
                  className="flex items-center gap-3 p-4 rounded-xl text-left font-medium text-charcoal-800 hover:bg-brand-50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                    <Shield className="w-[18px] h-[18px]" />
                  </div>
                  Lab Reports
                </a>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
