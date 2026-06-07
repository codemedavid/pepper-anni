import React, { useState } from 'react';
import { ArrowLeft, Star, Sparkles, MessageSquareQuote, Quote } from 'lucide-react';
import { useReviews, Review } from '../hooks/useReviews';
import Footer from './Footer';

const Stars: React.FC<{ rating: number | null; className?: string }> = ({ rating, className }) => {
    if (rating == null) return null;
    return (
        <div className={`flex items-center gap-0.5 ${className || ''}`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={`w-4 h-4 ${n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                />
            ))}
        </div>
    );
};

const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('');

const ReviewCard: React.FC<{ review: Review; highlight?: boolean }> = ({ review, highlight }) => (
    <div
        className={`break-inside-avoid mb-5 bg-white rounded-2xl border p-5 shadow-soft transition-all hover:shadow-md ${highlight ? 'border-amber-200 ring-1 ring-amber-100' : 'border-brand-100'
            }`}
    >
        <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                {initials(review.reviewer_name) || '★'}
            </div>
            <div className="min-w-0">
                <p className="font-semibold text-charcoal-800 leading-tight truncate">
                    {review.reviewer_name}
                </p>
                {review.product && (
                    <p className="text-xs text-brand-600 truncate">on {review.product.name}</p>
                )}
            </div>
            {highlight && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                    <Sparkles className="w-3 h-3" /> Featured
                </span>
            )}
        </div>

        {review.rating != null && <Stars rating={review.rating} className="mb-3" />}

        {review.review_text && (
            <div className="relative">
                <Quote className="w-4 h-4 text-brand-200 absolute -left-0.5 -top-1" />
                <p className="text-sm text-charcoal-600 whitespace-pre-wrap break-words pl-5 leading-relaxed">
                    {review.review_text}
                </p>
            </div>
        )}

        {review.image_url && (
            <img
                src={review.image_url}
                alt={`Review by ${review.reviewer_name}`}
                loading="lazy"
                className="mt-3 w-full rounded-xl border border-brand-50 object-contain bg-gray-50"
            />
        )}
    </div>
);

const ReviewWall: React.FC = () => {
    const { reviews, featured, loading } = useReviews();
    const [tab, setTab] = useState<'all' | 'featured'>('all');

    const list = tab === 'featured' ? featured : reviews;

    return (
        <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-white flex flex-col font-inter">
            {/* Header */}
            <div className="bg-white/95 backdrop-blur-sm border-b border-brand-100 sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center gap-4">
                    <a
                        href="/"
                        className="p-2 hover:bg-brand-50 rounded-lg transition-colors"
                        aria-label="Back to home"
                    >
                        <ArrowLeft className="w-5 h-5 text-charcoal-600" />
                    </a>
                    <div className="flex items-center gap-2">
                        <MessageSquareQuote className="w-6 h-6 text-brand-600" />
                        <h1 className="text-xl sm:text-2xl font-heading font-semibold text-charcoal-800">
                            Customer Reviews
                        </h1>
                    </div>
                </div>
            </div>

            <main className="flex-grow container mx-auto px-4 py-8 sm:py-12">
                {/* Hero */}
                <div className="text-center max-w-2xl mx-auto mb-8">
                    <h2 className="text-2xl sm:text-4xl font-heading font-semibold text-pepper-gradient mb-3">
                        What our customers say
                    </h2>
                    <p className="text-charcoal-500 text-sm sm:text-base">
                        Real reviews and screenshots from the PepperAnni community.
                    </p>
                </div>

                {/* Tabs */}
                {featured.length > 0 && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <button
                            onClick={() => setTab('all')}
                            className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide transition-all ${tab === 'all'
                                ? 'bg-brand-600 text-white shadow-glow'
                                : 'bg-white text-charcoal-500 border border-brand-100 hover:bg-brand-50'
                                }`}
                        >
                            All Reviews ({reviews.length})
                        </button>
                        <button
                            onClick={() => setTab('featured')}
                            className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-1.5 ${tab === 'featured'
                                ? 'bg-amber-500 text-white shadow-glow'
                                : 'bg-white text-charcoal-500 border border-brand-100 hover:bg-amber-50'
                                }`}
                        >
                            <Sparkles className="w-4 h-4" /> Featured ({featured.length})
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
                    </div>
                ) : list.length === 0 ? (
                    <div className="text-center py-24">
                        <MessageSquareQuote className="w-12 h-12 text-brand-200 mx-auto mb-4" />
                        <p className="text-charcoal-500 font-medium">No reviews yet — check back soon!</p>
                    </div>
                ) : (
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 max-w-6xl mx-auto">
                        {list.map((r) => (
                            <ReviewCard key={r.id} review={r} highlight={r.featured} />
                        ))}
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default ReviewWall;
