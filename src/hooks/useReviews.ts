import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Review {
    id: string;
    product_id: string | null;
    reviewer_name: string;
    review_text: string | null;
    image_url: string | null;
    rating: number | null;
    featured: boolean;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
    // Optional embedded product (when selected with a join)
    product?: { id: string; name: string; image_url: string | null } | null;
}

export type ReviewInput = Omit<Review, 'id' | 'created_at' | 'updated_at' | 'product'>;

const PRODUCT_SELECT = '*, product:products(id, name, image_url)';

/**
 * Public hook — only active reviews, ordered for the review wall.
 * Optionally filter to a single product (used on product detail pages).
 */
export const useReviews = (productId?: string) => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReviews = useCallback(async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('reviews')
                .select(PRODUCT_SELECT)
                .eq('is_active', true)
                .order('featured', { ascending: false })
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: false });

            if (productId) {
                query = query.eq('product_id', productId);
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            setReviews((data as Review[]) || []);
            setError(null);
        } catch (err) {
            console.warn('Reviews unavailable:', err instanceof Error ? err.message : err);
            setReviews([]);
            setError(err instanceof Error ? err.message : 'Failed to load reviews');
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        fetchReviews();

        const channel = supabase
            .channel(`reviews-realtime-${productId || 'all'}-${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reviews' },
                () => fetchReviews()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchReviews, productId]);

    const featured = reviews.filter((r) => r.featured);

    return { reviews, featured, loading, error, refetch: fetchReviews };
};

/**
 * Admin hook — all reviews (active + hidden) with full CRUD.
 */
export const useReviewsAdmin = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('reviews')
                .select(PRODUCT_SELECT)
                .order('featured', { ascending: false })
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;
            setReviews((data as Review[]) || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching reviews:', err);
            setError(err instanceof Error ? err.message : 'Failed to load reviews');
            setReviews([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const addReview = async (review: Partial<ReviewInput>) => {
        const { data, error } = await supabase
            .from('reviews')
            .insert([review])
            .select(PRODUCT_SELECT)
            .single();
        if (error) throw error;
        await fetchAll();
        return data as Review;
    };

    const updateReview = async (id: string, updates: Partial<ReviewInput>) => {
        const { data, error } = await supabase
            .from('reviews')
            .update(updates)
            .eq('id', id)
            .select(PRODUCT_SELECT)
            .single();
        if (error) throw error;
        await fetchAll();
        return data as Review;
    };

    const deleteReview = async (id: string) => {
        const { error } = await supabase.from('reviews').delete().eq('id', id);
        if (error) throw error;
        await fetchAll();
    };

    const toggleFeatured = async (review: Review) =>
        updateReview(review.id, { featured: !review.featured });

    const toggleActive = async (review: Review) =>
        updateReview(review.id, { is_active: !review.is_active });

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    return {
        reviews,
        loading,
        error,
        addReview,
        updateReview,
        deleteReview,
        toggleFeatured,
        toggleActive,
        refetch: fetchAll,
    };
};
