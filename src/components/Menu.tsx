import React, { useState, useRef } from 'react';
import MenuItemCard from './MenuItemCard';
import Hero from './Hero';
import ProductDetailModal from './ProductDetailModal';
import type { Product, ProductVariation, CartItem } from '../types';
import { Search, Filter, Package } from 'lucide-react';

interface MenuProps {
  menuItems: Product[];
  addToCart: (product: Product, variation?: ProductVariation, quantity?: number) => void;
  cartItems: CartItem[];
  updateQuantity: (index: number, quantity: number) => void;
}

const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'purity'>('name');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const productsRef = useRef<HTMLDivElement | null>(null);

  // Filter products based on search
  const filteredProducts = menuItems.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort products - Featured first (Tirzepatide first among featured), then by selected sort
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    // Tirzepatide always first
    if (a.name === 'Tirzepatide') return -1;
    if (b.name === 'Tirzepatide') return 1;

    // Featured products come before non-featured
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;

    // Then apply selected sort
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price':
        return a.base_price - b.base_price;
      case 'purity':
        return b.purity_percentage - a.purity_percentage;
      default:
        return 0;
    }
  });

  const getCartQuantity = (productId: string, variationId?: string) => {
    return cartItems
      .filter(item =>
        item.product.id === productId &&
        (variationId ? item.variation?.id === variationId : !item.variation)
      )
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <>
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(product, variation, quantity) => {
            addToCart(product, variation, quantity);
          }}
        />
      )}

      <div className="min-h-screen bg-theme-bg">
        <Hero
          onShopAll={() => {
            productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />

        <div className="container mx-auto px-4 py-12" ref={productsRef}>
          {/* Search and Filter Controls */}
          <div className="mb-10 flex flex-col sm:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-charcoal-300 w-5 h-5" />
              <input
                type="text"
                placeholder="Search catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-12"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-3 sm:w-auto bg-frost-strong backdrop-blur-md rounded-xl px-4 py-3 border border-gold-300/30">
              <Filter className="text-gold-300 w-5 h-5" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'price' | 'purity')}
                className="focus:outline-none bg-transparent font-medium text-charcoal-100 text-sm [&>option]:text-charcoal-900"
              >
                <option value="name">Sort by Name</option>
                <option value="price">Sort by Price</option>
                <option value="purity">Sort by Purity</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="mb-6 sm:mb-8 flex flex-row items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-charcoal-50 tracking-tight flex items-center gap-3">
              <span className="text-gold-300">🌸</span> The Collection
            </h2>
            <span className="text-xs sm:text-sm font-medium text-charcoal-200 bg-frost px-3 py-1 rounded-full border border-gold-300/30 whitespace-nowrap">
              {sortedProducts.length} Results
            </span>
          </div>

          {/* Products Grid */}
          {sortedProducts.length === 0 ? (
            <div className="text-center py-20">
              <div className="bg-frost-strong backdrop-blur-md rounded-2xl shadow-soft p-12 max-w-md mx-auto border border-gold-300/30">
                <div className="bg-white/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Package className="w-10 h-10 text-gold-300" />
                </div>
                <h3 className="text-xl font-bold text-charcoal-50 mb-2">No products found</h3>
                <p className="text-charcoal-200 mb-6">
                  {searchQuery
                    ? `No products match "${searchQuery}".`
                    : 'No products available.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-charcoal-600 font-semibold hover:underline"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
              {sortedProducts.map((product) => (
                <MenuItemCard
                  key={product.id}
                  product={product}
                  cartQuantity={getCartQuantity(product.id)}
                  onProductClick={setSelectedProduct}
                  onAddToCart={addToCart}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Menu;
