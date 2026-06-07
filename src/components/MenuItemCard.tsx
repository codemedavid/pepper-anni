import React, { useState } from 'react';
import { Package } from 'lucide-react';
import type { Product, ProductVariation } from '../types';

interface MenuItemCardProps {
  product: Product;
  onAddToCart?: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartQuantity?: number;
  onUpdateQuantity?: (index: number, quantity: number) => void;
  onProductClick?: (product: Product) => void;
}

const MenuItemCard: React.FC<MenuItemCardProps> = ({
  product,
  onAddToCart,
  cartQuantity = 0,
  onProductClick,
}) => {
  const [imageError, setImageError] = useState(false);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | undefined>(
    product.variations && product.variations.length > 0 ? product.variations[0] : undefined
  );

  // Calculate current price considering both product and variation discounts
  const currentPrice = (() => {
    // Falls back to variation or product price
    return selectedVariation
      ? (selectedVariation.discount_active && selectedVariation.discount_price)
        ? selectedVariation.discount_price
        : selectedVariation.price
      : (product.discount_active && product.discount_price)
        ? product.discount_price
        : product.base_price;
  })();

  // Check if there's an active discount
  const hasDiscount = selectedVariation
    ? (selectedVariation.discount_active && selectedVariation.discount_price !== null)
    : (product.discount_active && product.discount_price !== null);

  // Get original price for strikethrough
  const originalPrice = selectedVariation ? selectedVariation.price : product.base_price;

  // Check if product has any available stock (either in variations or product itself)
  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  return (
    <div className="card h-full flex flex-col group relative">
      {/* Click overlay for product details */}
      <div
        onClick={() => onProductClick?.(product)}
        className="absolute inset-x-0 top-0 h-28 sm:h-44 z-10 cursor-pointer"
        title="View details"
      />

      {/* Product Image */}
      <div className="relative h-28 sm:h-44 bg-secondary-50 overflow-hidden border-b border-gray-50">
        {product.image_url && !imageError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-charcoal-200 bg-charcoal-50">
            <Package className="w-16 h-16 opacity-50" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none z-20">
          {product.featured && (
            <span className="px-2 py-1 bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wider rounded shadow-sm">
              Featured
            </span>
          )}
          {hasDiscount && (
            <span className="px-2 py-1 bg-brand-600 text-white text-[10px] font-bold rounded shadow-sm">
              {Math.round((1 - currentPrice / originalPrice) * 100)}% OFF
            </span>
          )}
        </div>

        {/* Stock Status Overlay */}
        {(!product.available || !hasAnyStock) && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center z-20">
            <span className="bg-gray-100 text-gray-500 px-3 py-1 text-xs font-bold rounded border border-gray-200 uppercase tracking-wide">
              {!product.available ? 'Unavailable' : 'Out of Stock'}
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        <h3
          onClick={() => onProductClick?.(product)}
          className="font-heading font-semibold text-charcoal-900 text-sm sm:text-base mb-1 line-clamp-2 tracking-tight cursor-pointer relative z-20"
          title="View details"
        >
          {product.name}
        </h3>
        <p className="text-[10px] sm:text-xs text-gray-500 mb-2 sm:mb-3 line-clamp-2 min-h-[1.5rem] sm:min-h-[2.5rem] leading-relaxed">
          {product.description}
        </p>

        {/* Variations (Sizes) */}
        <div className="mb-2 sm:mb-4 min-h-[1.5rem] sm:min-h-[2rem]">
          {product.variations && product.variations.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {product.variations.slice(0, 2).map((variation) => {
                const isOutOfStock = variation.stock_quantity === 0;
                return (
                  <button
                    key={variation.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isOutOfStock) {
                        setSelectedVariation(variation);
                      }
                    }}
                    disabled={isOutOfStock}
                    className={`
                      px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-medium rounded-lg border transition-all duration-200 relative z-20
                      ${selectedVariation?.id === variation.id && !isOutOfStock
                        ? 'bg-brand-50 border-brand-400 text-brand-700'
                        : isOutOfStock
                          ? 'bg-charcoal-50 text-charcoal-300 border-charcoal-100 cursor-not-allowed'
                          : 'bg-white text-charcoal-600 border-charcoal-200 hover:border-brand-300 hover:text-brand-600'
                      }
                    `}
                  >
                    {variation.name}
                  </button>
                );
              })}
              {product.variations.length > 2 && (
                <span className="text-[9px] sm:text-[10px] text-gray-400 self-center">
                  +{product.variations.length - 2}
                </span>
              )}
            </div>
          )}
        </div>



        <div className="flex-1" />

        {/* Price and Cart Actions */}
        <div className="flex flex-col gap-2 sm:gap-3 mt-auto">
          {hasDiscount ? (
            <div
              onClick={() => onProductClick?.(product)}
              className="flex items-baseline gap-1 sm:gap-2 cursor-pointer relative z-20"
              title="View details"
            >
              <span className="text-base sm:text-lg font-semibold text-charcoal-900">
                ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </span>
              <span className="text-[10px] sm:text-xs text-charcoal-400 line-through">
                ₱{originalPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </span>
            </div>
          ) : (
            <div
              onClick={() => onProductClick?.(product)}
              className="flex items-baseline cursor-pointer relative z-20 w-fit"
              title="View details"
            >
              <span className="text-base sm:text-lg font-semibold text-charcoal-900">
                ₱{currentPrice.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
              </span>
            </div>
          )}

          <div className="flex w-full pt-2">
            {/* Add to Cart Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!product.available || !hasAnyStock) return;

                // If it has variations, ensure one is selected
                if (product.variations && product.variations.length > 0 && !selectedVariation) {
                  onProductClick?.(product);
                  return;
                }

                onAddToCart?.(product, selectedVariation, 1);
              }}
              disabled={!product.available || !hasAnyStock}
              className={`w-full py-2 sm:py-3 px-2 text-[11px] sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 font-semibold whitespace-nowrap transition-all
                ${(!product.available || !hasAnyStock)
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed rounded'
                  : 'btn-primary'}
              `}
            >
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Add to Cart</span>
            </button>
          </div>

          {/* Cart Status */}
          {cartQuantity > 0 && (
            <div className="text-center text-[10px] text-emerald-600 font-medium bg-emerald-100/50 rounded py-1">
              {cartQuantity} in cart
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MenuItemCard;
