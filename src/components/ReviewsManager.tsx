import React, { useState } from 'react';
import {
    Plus,
    Edit2,
    Trash2,
    Save,
    X,
    ArrowLeft,
    Star,
    Eye,
    EyeOff,
    Sparkles,
    MessageSquareQuote,
    ImageIcon,
} from 'lucide-react';
import { useReviewsAdmin, Review, ReviewInput } from '../hooks/useReviews';
import { useMenu } from '../hooks/useMenu';
import ImageUpload from './ImageUpload';

interface ReviewsManagerProps {
    onBack?: () => void;
}

const emptyForm: Partial<ReviewInput> = {
    reviewer_name: '',
    review_text: '',
    image_url: null,
    product_id: null,
    rating: null,
    featured: false,
    is_active: true,
    sort_order: 0,
};

const StarRating: React.FC<{ value: number | null; onChange: (v: number | null) => void }> = ({
    value,
    onChange,
}) => (
    <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
            <button
                key={n}
                type="button"
                onClick={() => onChange(value === n ? null : n)}
                className="p-0.5"
                title={`${n} star${n > 1 ? 's' : ''}`}
            >
                <Star
                    className={`w-6 h-6 transition-colors ${value && n <= value
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-300 hover:text-amber-300'
                        }`}
                />
            </button>
        ))}
        {value != null && (
            <button
                type="button"
                onClick={() => onChange(null)}
                className="ml-2 text-xs text-gray-400 hover:text-gray-600"
            >
                clear
            </button>
        )}
    </div>
);

const ReviewsManager: React.FC<ReviewsManagerProps> = ({ onBack }) => {
    const {
        reviews,
        loading,
        addReview,
        updateReview,
        deleteReview,
        toggleFeatured,
        toggleActive,
    } = useReviewsAdmin();
    const { products } = useMenu();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<ReviewInput>>(emptyForm);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const resetForm = () => {
        setFormData({ ...emptyForm, sort_order: reviews.length });
        setEditingId(null);
        setIsFormOpen(false);
        setError(null);
    };

    const openAdd = () => {
        setFormData({ ...emptyForm, sort_order: reviews.length });
        setEditingId(null);
        setError(null);
        setIsFormOpen(true);
    };

    const openEdit = (r: Review) => {
        setFormData({
            reviewer_name: r.reviewer_name,
            review_text: r.review_text ?? '',
            image_url: r.image_url,
            product_id: r.product_id,
            rating: r.rating,
            featured: r.featured,
            is_active: r.is_active,
            sort_order: r.sort_order,
        });
        setEditingId(r.id);
        setError(null);
        setIsFormOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const name = (formData.reviewer_name || '').trim();
        const text = (formData.review_text || '').trim();
        const hasImage = !!(formData.image_url && formData.image_url.trim());

        if (!name) {
            setError('Please enter the reviewer name.');
            return;
        }
        if (!text && !hasImage) {
            setError('A review needs review text and/or an image.');
            return;
        }

        const payload: Partial<ReviewInput> = {
            reviewer_name: name,
            review_text: text || null,
            image_url: hasImage ? formData.image_url : null,
            product_id: formData.product_id || null,
            rating: formData.rating ?? null,
            featured: !!formData.featured,
            is_active: formData.is_active ?? true,
            sort_order: Number(formData.sort_order) || 0,
        };

        try {
            setSaving(true);
            if (editingId) {
                await updateReview(editingId, payload);
            } else {
                await addReview(payload);
            }
            resetForm();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save review');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this review? This cannot be undone.')) return;
        try {
            await deleteReview(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete review');
        }
    };

    const featuredCount = reviews.filter((r) => r.featured).length;
    const activeCount = reviews.filter((r) => r.is_active).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center p-16">
                <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 md:p-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mr-1"
                            title="Go Back"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </button>
                    )}
                    <MessageSquareQuote className="w-6 h-6 text-gray-900" />
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Reviews</h2>
                        <p className="text-xs text-gray-500">
                            {reviews.length} total · {activeCount} visible · {featuredCount} featured
                        </p>
                    </div>
                </div>
                <button
                    onClick={openAdd}
                    className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    New Review
                </button>
            </div>

            {error && !isFormOpen && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* Form */}
            {isFormOpen && (
                <form
                    onSubmit={handleSubmit}
                    className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-900">
                            {editingId ? 'Edit Review' : 'Add Review'}
                        </h3>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Reviewer name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.reviewer_name || ''}
                                onChange={(e) =>
                                    setFormData({ ...formData, reviewer_name: e.target.value })
                                }
                                placeholder="e.g. Maria S."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Attach to product (optional)
                            </label>
                            <select
                                value={formData.product_id || ''}
                                onChange={(e) =>
                                    setFormData({ ...formData, product_id: e.target.value || null })
                                }
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900 bg-white"
                            >
                                <option value="">— Not attached —</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Review text
                            <span className="text-gray-400 font-normal"> (text and/or image required)</span>
                        </label>
                        <textarea
                            value={formData.review_text || ''}
                            onChange={(e) => setFormData({ ...formData, review_text: e.target.value })}
                            rows={4}
                            placeholder="Paste or type the customer's review here…"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900 resize-y"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            Review image / screenshot (optional)
                        </label>
                        <ImageUpload
                            currentImage={formData.image_url || undefined}
                            onImageChange={(url) =>
                                setFormData({ ...formData, image_url: url || null })
                            }
                            folder="review-images"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Rating (optional)
                            </label>
                            <StarRating
                                value={formData.rating ?? null}
                                onChange={(v) => setFormData({ ...formData, rating: v })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Sort order
                            </label>
                            <input
                                type="number"
                                value={formData.sort_order ?? 0}
                                onChange={(e) =>
                                    setFormData({ ...formData, sort_order: Number(e.target.value) })
                                }
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900"
                            />
                            <p className="text-xs text-gray-400 mt-1">Lower shows first.</p>
                        </div>

                        <div className="flex flex-col gap-3 justify-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!formData.featured}
                                    onChange={(e) =>
                                        setFormData({ ...formData, featured: e.target.checked })
                                    }
                                    className="w-4 h-4 rounded accent-amber-500"
                                />
                                <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                                    <Sparkles className="w-4 h-4 text-amber-500" /> Featured
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.is_active ?? true}
                                    onChange={(e) =>
                                        setFormData({ ...formData, is_active: e.target.checked })
                                    }
                                    className="w-4 h-4 rounded accent-green-600"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    Visible on site
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors disabled:opacity-60"
                        >
                            <Save className="w-5 h-5" />
                            {saving ? 'Saving…' : editingId ? 'Update Review' : 'Save Review'}
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-6 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            {reviews.length === 0 && !isFormOpen ? (
                <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-2xl">
                    <MessageSquareQuote className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No reviews yet.</p>
                    <p className="text-gray-400 text-sm">Add your first review to build the review wall.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reviews.map((r) => (
                        <div
                            key={r.id}
                            className={`bg-white border rounded-2xl p-5 shadow-sm transition-all ${r.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-gray-900">{r.reviewer_name}</span>
                                        {r.featured && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                                <Sparkles className="w-3 h-3" /> Featured
                                            </span>
                                        )}
                                        {!r.is_active && (
                                            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                                                Hidden
                                            </span>
                                        )}
                                    </div>
                                    {r.rating != null && (
                                        <div className="flex items-center gap-0.5 mt-1">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <Star
                                                    key={n}
                                                    className={`w-4 h-4 ${n <= r.rating!
                                                        ? 'text-amber-400 fill-amber-400'
                                                        : 'text-gray-200'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {r.product && (
                                        <p className="text-xs text-brand-600 mt-1 truncate">
                                            on {r.product.name}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => toggleFeatured(r)}
                                        title={r.featured ? 'Unfeature' : 'Feature'}
                                        className={`p-2 rounded-lg transition-colors ${r.featured
                                            ? 'text-amber-500 hover:bg-amber-50'
                                            : 'text-gray-400 hover:bg-gray-100'
                                            }`}
                                    >
                                        <Sparkles className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => toggleActive(r)}
                                        title={r.is_active ? 'Hide' : 'Show'}
                                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                                    >
                                        {r.is_active ? (
                                            <Eye className="w-4 h-4" />
                                        ) : (
                                            <EyeOff className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => openEdit(r)}
                                        title="Edit"
                                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(r.id)}
                                        title="Delete"
                                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {r.review_text && (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                    {r.review_text}
                                </p>
                            )}
                            {r.image_url && (
                                <img
                                    src={r.image_url}
                                    alt={`Review by ${r.reviewer_name}`}
                                    loading="lazy"
                                    className="mt-3 max-h-64 w-auto rounded-xl border border-gray-100 object-contain"
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReviewsManager;
