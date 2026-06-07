import React, { useState } from 'react';
import { X, Package, Beaker, ShoppingCart, Plus, Minus, Sparkles, ArrowLeft, Star, MessageSquareQuote } from 'lucide-react';
import type { Product, ProductVariation } from '../types';
import { useReviews } from '../hooks/useReviews';

const ProductReviews: React.FC<{ productId: string }> = ({ productId }) => {
  const { reviews, loading } = useReviews(productId);

  if (loading || reviews.length === 0) return null;

  return (
    <div className="mt-4 sm:mt-6 border-t border-gray-100 pt-4 sm:pt-6">
      <h3 className="font-heading text-sm sm:text-base md:text-lg font-bold text-charcoal-900 mb-3 flex items-center gap-1.5 sm:gap-2">
        <MessageSquareQuote className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-brand-600" />
        Customer Reviews
        <span className="text-xs font-medium text-gray-400">({reviews.length})</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reviews.map((r) => (
          <div key={r.id} className="bg-gray-50 rounded p-3 border border-gray-100">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold text-charcoal-800 text-sm">{r.reviewer_name}</span>
              {r.rating != null && (
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`w-3.5 h-3.5 ${n <= r.rating! ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
              )}
            </div>
            {r.review_text && (
              <p className="text-xs text-gray-600 whitespace-pre-wrap break-words leading-relaxed">
                {r.review_text}
              </p>
            )}
            {r.image_url && (
              <img
                src={r.image_url}
                alt={`Review by ${r.reviewer_name}`}
                loading="lazy"
                className="mt-2 w-full rounded border border-gray-100 object-contain bg-white"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product, variation: ProductVariation | undefined, quantity: number) => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onAddToCart }) => {
  // Select first available variation, or first variation if all are out of stock
  const getFirstAvailableVariation = () => {
    if (!product.variations || product.variations.length === 0) return undefined;
    const available = product.variations.find(v => v.stock_quantity > 0);
    return available || product.variations[0];
  };

  const [imageError, setImageError] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    getFirstAvailableVariation()
  );
  const [quantity, setQuantity] = useState(1);

  const hasDiscount = product.discount_active && product.discount_price;

  // Calculate price based on selected variation
  const calculatePrice = () => {
    if (!selectedVariation) return product.base_price;
    return selectedVariation.price;
  }

  const currentPrice = calculatePrice();
  const showPurity = Boolean(product.purity_percentage);

  // Check if product has any available stock
  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => prev > 1 ? prev - 1 : 1);

  const handleAddToCart = () => {
    onAddToCart(product, selectedVariation, quantity);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-charcoal-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] overflow-hidden border border-gray-100 animate-slide-up sm:animate-none flex flex-col"
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="bg-white text-charcoal-900 p-3 sm:p-4 md:p-6 relative border-b border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 p-1.5 sm:p-2 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
          </button>
          <div className="pr-10 sm:pr-12">
            <h2 className="font-heading text-base sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1.5 sm:mb-2 text-charcoal-900 tracking-tight">{product.name}</h2>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-wrap">
              {showPurity && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-emerald-600/20 border border-emerald-600/30 text-emerald-600">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {product.purity_percentage}% Pure
                </span>
              )}
              {product.featured && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-brand-600 border border-brand-500 text-white">
                  Featured
                </span>
              )}
              {hasDiscount && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-semibold bg-emerald-600/20 border border-emerald-600/30 text-emerald-100">
                  Sale
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="p-3 sm:p-4 md:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
            {/* Left Column */}
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Product Image */}
              <div className="relative h-40 sm:h-48 md:h-56 lg:h-64 bg-gray-50 rounded overflow-hidden border border-gray-100 shadow-inner">
                {product.image_url && !imageError ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 bg-brand-50/50">
                    <Package className="w-16 h-16 sm:w-20 sm:h-20 opacity-50" />
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h3 className="font-heading text-sm sm:text-base md:text-lg font-bold text-charcoal-900 mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-brand-600" />
                  Product Description
                </h3>
                <p className="text-xs sm:text-sm md:text-base text-gray-600 leading-relaxed font-sans">{product.description}</p>
              </div>

              {/* Complete Set Inclusions */}
              {product.inclusions && product.inclusions.length > 0 && (
                <div className="bg-brand-50 rounded p-3 sm:p-4 border border-brand-100">
                  <h3 className="font-heading text-sm sm:text-base md:text-lg font-bold text-charcoal-900 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-brand-600" />
                    Kit Inclusions
                  </h3>
                  <ul className="space-y-1.5 sm:space-y-2">
                    {product.inclusions.map((inclusion, idx) => (
                      <li key={idx} className="text-[11px] sm:text-xs md:text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-emerald-600 font-bold mt-0.5">✓</span>
                        <span className="flex-1">{inclusion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scientific Details */}
              <div className="bg-gray-50 rounded p-3 sm:p-4 border border-gray-200">
                <h3 className="font-heading text-sm sm:text-base md:text-lg font-bold text-charcoal-900 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-brand-600" />
                  Technical Specifications
                </h3>
                <div className="space-y-1.5 sm:space-y-2">
                  {showPurity && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 text-[11px] sm:text-xs md:text-sm">Purity Analysis:</span>
                      <span className="font-semibold text-brand-700 text-[11px] sm:text-xs md:text-sm">{product.purity_percentage}% (HPLC Verified)</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-[11px] sm:text-xs md:text-sm">Storage:</span>
                    <span className="font-medium text-gray-700 text-[11px] sm:text-xs md:text-sm">{product.storage_conditions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-[11px] sm:text-xs md:text-sm">Availability:</span>
                    <span className={`font-medium text-[11px] sm:text-xs md:text-sm ${(product.variations && product.variations.length > 0
                      ? product.variations.some(v => v.stock_quantity > 0)
                      : product.stock_quantity > 0)
                      ? 'text-emerald-600'
                      : 'text-red-500'
                      }`}>
                      {product.variations && product.variations.length > 0
                        ? product.variations.reduce((sum, v) => sum + v.stock_quantity, 0)
                        : product.stock_quantity} units
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Purchase Section */}
            <div className="space-y-3 sm:space-y-4 md:space-y-6">
              {/* Price */}
              <div className="bg-white rounded p-3 sm:p-4 md:p-6 border border-gray-100 shadow-clinical">
                <div className="text-center mb-3 sm:mb-4">
                  {hasDiscount ? (
                    <>
                      {/* Original Price - Strikethrough */}
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <span className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-400 line-through font-medium">
                          ₱{product.base_price.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-600 bg-emerald-100/30 px-2 py-1 rounded">
                          {Math.round((1 - product.discount_price! / product.base_price) * 100)}% OFF
                        </span>
                      </div>
                      {/* Sale Price */}
                      <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal-900 mb-2">
                        ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </div>
                      <div className="inline-block bg-emerald-100 text-emerald-700 px-2 py-0.5 sm:px-2.5 sm:py-1 md:px-3 md:py-1 rounded text-[10px] sm:text-xs md:text-sm font-bold border border-emerald-200">
                        Savings: ₱{(product.base_price - product.discount_price!).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </div>
                    </>
                  ) : (
                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-charcoal-900">
                      ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </div>
                  )}
                </div>

                {/* Size Selection */}
                {product.variations && product.variations.length > 0 && (
                  <div className="mb-3 sm:mb-4">
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2 uppercase tracking-wide">
                      Select Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {product.variations.map((variation) => {
                        const isOutOfStock = variation.stock_quantity === 0;
                        const isSelected = selectedVariation?.id === variation.id;
                        return (
                          <button
                            key={variation.id}
                            onClick={() => {
                              if (variation.stock_quantity > 0) {
                                setSelectedVariation(variation);
                              }
                            }}
                            disabled={isOutOfStock}
                            className={`
                                p-3 rounded border text-sm text-left transition-all
                                ${isSelected
                                ? 'border-brand-500 bg-brand-50 text-charcoal-900 ring-1 ring-brand-500'
                                : 'border-gray-200 hover:border-brand-300 text-gray-700 bg-white'
                              }
                                ${isOutOfStock ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}
                              `}
                          >
                            <div className="font-bold">{variation.name}</div>
                            <div className="text-xs opacity-80">₱{variation.price.toLocaleString('en-PH')}</div>
                            {isOutOfStock && <div className="text-xs text-red-500 font-bold mt-1">Out of Stock</div>}
                          </button>
                        )
                      })}
                    </div>
                    {selectedVariation && selectedVariation.stock_quantity === 0 && (
                      <p className="text-xs text-red-600 mt-1.5 font-semibold">
                        This format is currently unavailable.
                      </p>
                    )}
                  </div>
                )}



                {/* Quantity */}
                <div className="mb-3 sm:mb-4">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2 uppercase tracking-wide">
                    Quantity
                  </label>
                  <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-5">
                    <button
                      onClick={decrementQuantity}
                      className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 rounded transition-all active:scale-95 text-gray-600"
                      disabled={!product.available}
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <span className="text-xl sm:text-2xl font-bold text-charcoal-900 min-w-[50px] text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={incrementQuantity}
                      className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 rounded transition-all active:scale-95 text-gray-600"
                      disabled={!product.available}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Total */}
                <div className="bg-gray-50 rounded p-3 mb-4 border border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-medium text-sm">Total Estimate:</span>
                    <span className="text-xl font-bold text-charcoal-900">
                      ₱{(currentPrice * quantity).toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <button
                  onClick={handleAddToCart}
                  disabled={!product.available || !hasAnyStock || (selectedVariation && selectedVariation.stock_quantity === 0) || (!selectedVariation && product.stock_quantity === 0)}
                  className="w-full btn-primary py-3 md:py-4 text-sm md:text-base flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {!product.available
                    ? 'Unavailable'
                    : (!hasAnyStock || (selectedVariation && selectedVariation.stock_quantity === 0) || (!selectedVariation && product.stock_quantity === 0)
                      ? 'Out of Stock'
                      : 'Add to Cart')}
                </button>

                {/* Return to Shop Button */}
                <button
                  onClick={onClose}
                  className="w-full mt-3 py-3 text-sm md:text-base font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Shop
                </button>
              </div>

              {/* Stock Alert */}
              {product.available && (product.variations && product.variations.length > 0
                ? product.variations.some(v => v.stock_quantity > 0 && v.stock_quantity < 10)
                : product.stock_quantity < 10 && product.stock_quantity > 0) && (
                  <div className="bg-orange-50 border border-orange-100 rounded p-3">
                    <p className="text-xs text-orange-700 font-medium flex items-center gap-2">
                      <span className="font-bold">！</span>
                      Low stock: Only {product.variations && product.variations.length > 0
                        ? product.variations.reduce((sum, v) => sum + v.stock_quantity, 0)
                        : product.stock_quantity} units remaining
                    </p>
                  </div>
                )}
            </div>
          </div>

          {/* Customer Reviews attached to this product */}
          <ProductReviews productId={product.id} />
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;

