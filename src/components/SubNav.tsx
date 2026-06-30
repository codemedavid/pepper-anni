import React from 'react';
import { useCategories } from '../hooks/useCategories';

interface SubNavProps {
    selectedCategory: string;
    onCategoryClick: (categoryId: string) => void;
}

const SubNav: React.FC<SubNavProps> = ({ selectedCategory, onCategoryClick }) => {
    const { categories, loading } = useCategories();

    if (loading) {
        return (
            <div className="hidden md:block px-4 sm:px-7 mt-3.5">
                <div className="flex gap-2.5 overflow-x-auto rounded-[18px] border border-gold-300/40 bg-frost p-2.5 backdrop-blur-md">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="animate-pulse bg-white/10 h-10 w-32 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <nav className="sticky top-[64px] md:top-[80px] lg:top-[88px] z-40 px-4 sm:px-7 mt-3.5">
            <div
                className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide rounded-[18px] border border-gold-300/40 bg-frost p-2.5 backdrop-blur-md shadow-soft snap-x snap-mandatory"
            >
                {categories.map((category) => {
                    const isSelected = selectedCategory === category.id;

                    return (
                        <button
                            key={category.id}
                            onClick={() => onCategoryClick(category.id)}
                            className={`
                  shrink-0 snap-start flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl font-semibold whitespace-nowrap
                  transition-all duration-200 text-xs sm:text-[14.5px]
                  ${isSelected
                                    ? 'text-white shadow-glow border border-white/30'
                                    : 'text-charcoal-200 hover:text-charcoal-50 hover:bg-white/5 border border-transparent'
                                }
                `}
                            style={
                                isSelected
                                    ? { background: 'linear-gradient(180deg,var(--ice),var(--ice-deep))' }
                                    : undefined
                            }
                        >
                            <span>{category.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Hide scrollbar for better aesthetics */}
            <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
        </nav>
    );
};

export default SubNav;
