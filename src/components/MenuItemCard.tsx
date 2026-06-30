import React, { useState } from 'react';
import { Package, Plus } from 'lucide-react';
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
    return selectedVariation
      ? (selectedVariation.discount_active && selectedVariation.discount_price)
        ? selectedVariation.discount_price
        : selectedVariation.price
      : (product.discount_active && product.discount_price)
        ? product.discount_price
        : product.base_price;
  })();

  const hasDiscount = selectedVariation
    ? (selectedVariation.discount_active && selectedVariation.discount_price !== null)
    : (product.discount_active && product.discount_price !== null);

  const originalPrice = selectedVariation ? selectedVariation.price : product.base_price;

  const hasAnyStock = product.variations && product.variations.length > 0
    ? product.variations.some(v => v.stock_quantity > 0)
    : product.stock_quantity > 0;

  const isUnavailable = !product.available || !hasAnyStock;

  const formatPrice = (value: number) =>
    value.toLocaleString('en-PH', { minimumFractionDigits: 0 });

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gold-300/30 bg-charcoal-800/60 backdrop-blur-md transition-all duration-300 hover:border-gold-300/60 hover:shadow-luxury hover:-translate-y-1.5">
      {/* Click overlay for product details */}
      <div
        onClick={() => onProductClick?.(product)}
        className="absolute inset-x-0 top-0 z-10 h-32 cursor-pointer sm:h-48"
        title="View details"
      />

      {/* Product Image */}
      <div className="relative h-32 overflow-hidden bg-gradient-to-b from-charcoal-700 to-charcoal-900 sm:h-48">
        {product.image_url && !imageError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-brand-200">
            <Package className="h-12 w-12 opacity-60" strokeWidth={1.25} />
          </div>
        )}

        {/* Discount badge — the only overlay we keep */}
        {hasDiscount && !isUnavailable && (
          <span className="absolute left-2.5 top-2.5 z-20 rounded-full bg-brand-600 px-2 py-1 text-[10px] font-bold tracking-wide text-white sm:left-3 sm:top-3">
            {Math.round((1 - currentPrice / originalPrice) * 100)}% OFF
          </span>
        )}

        {/* Stock Status Overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-charcoal-900/75 backdrop-blur-[2px]">
            <span className="rounded-full border border-gold-300/30 bg-charcoal-800 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-charcoal-200">
              {!product.available ? 'Unavailable' : 'Out of Stock'}
            </span>
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="flex flex-1 flex-col p-3.5 sm:p-5">
        <h3
          onClick={() => onProductClick?.(product)}
          className="relative z-20 mb-2 line-clamp-2 cursor-pointer font-heading text-base font-semibold leading-tight tracking-tight text-charcoal-50 transition-colors group-hover:text-brand-300 sm:text-xl"
          title="View details"
        >
          {product.name}
        </h3>

        {/* Variations (Sizes) */}
        {product.variations && product.variations.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {product.variations.slice(0, 2).map((variation) => {
              const isOutOfStock = variation.stock_quantity === 0;
              const isSelected = selectedVariation?.id === variation.id && !isOutOfStock;
              return (
                <button
                  key={variation.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isOutOfStock) setSelectedVariation(variation);
                  }}
                  disabled={isOutOfStock}
                  className={`relative z-20 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all duration-200 sm:text-xs ${
                    isSelected
                      ? 'border-transparent bg-brand-500 text-white'
                      : isOutOfStock
                        ? 'cursor-not-allowed border-charcoal-600 bg-charcoal-700 text-charcoal-400 line-through'
                        : 'border-gold-300/30 bg-white/5 text-charcoal-200 hover:border-brand-300'
                  }`}
                >
                  {variation.name}
                </button>
              );
            })}
            {product.variations.length > 2 && (
              <span className="self-center text-[10px] font-medium text-charcoal-300">
                +{product.variations.length - 2}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Price */}
        <div
          onClick={() => onProductClick?.(product)}
          className="relative z-20 mb-3 flex w-fit cursor-pointer items-baseline gap-2"
          title="View details"
        >
          <span className="font-heading text-xl font-semibold tracking-tight text-charcoal-50 sm:text-2xl">
            ₱{formatPrice(currentPrice)}
          </span>
          {hasDiscount && (
            <span className="text-[11px] text-charcoal-300 line-through sm:text-xs">
              ₱{formatPrice(originalPrice)}
            </span>
          )}
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isUnavailable) return;
            if (product.variations && product.variations.length > 0 && !selectedVariation) {
              onProductClick?.(product);
              return;
            }
            onAddToCart?.(product, selectedVariation, 1);
          }}
          disabled={isUnavailable}
          className={`relative z-20 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold tracking-wide transition-all duration-300 sm:text-sm ${
            isUnavailable
              ? 'cursor-not-allowed bg-white/5 text-charcoal-400'
              : 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98]'
          }`}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" strokeWidth={2.5} />
          <span>{cartQuantity > 0 ? `In Cart (${cartQuantity})` : 'Add to Cart'}</span>
        </button>
      </div>
    </div>
  );
};

export default MenuItemCard;
