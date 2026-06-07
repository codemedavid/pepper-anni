import React, { useState } from 'react';
import { Search, Package, Truck, CheckCircle, Clock, AlertCircle, ArrowRight, ExternalLink, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import posthog from '../lib/posthog';

interface TrackingOrder {
    id: string;
    order_number: string | null;
    order_status: string;
    payment_status: string;
    tracking_number: string | null;
    shipping_provider: string | null;
    shipping_note: string | null;
    total_price: number;
    shipping_fee: number;
    order_items: {
        product_name: string;
        quantity: number;
    }[];
    created_at: string;
    promo_code: string | null;
    discount_applied: number | null;
}

const OrderTracking: React.FC = () => {
    const [orderId, setOrderId] = useState('');
    const [order, setOrder] = useState<TrackingOrder | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const handleTrack = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderId.trim()) return;

        setLoading(true);
        setError(null);
        setOrder(null);
        setHasSearched(true);

        try {
            // Use secure RPC function to fetch order
            const { data, error } = await supabase
                .rpc('get_order_details', {
                    order_id_input: orderId.trim()
                })
                .single();

            if (error) {
                // If no rows returned by function, it usually returns a different error or null data depending on setup,
                // but .single() will throw if 0 rows.
                if (error.code === 'PGRST116') {
                    setError('Order not found. Please check your Order ID and try again.');
                } else {
                    throw error;
                }
            } else if (data) {
                // RPC returns the row directly when using single()
                setOrder(data as TrackingOrder);
                posthog.capture('tbs_order_tracked', {
                    order_number: data.order_number,
                    order_status: data.order_status,
                });
            } else {
                setError('Order not found.');
            }
        } catch (err) {
            console.error('Error fetching order:', err);
            setError('An error occurred while fetching your order. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusStep = (status: string) => {
        const steps = ['new', 'confirmed', 'processing', 'shipped', 'delivered'];
        const statusIndex = steps.indexOf(status);
        // If cancelled, it's a special state
        if (status === 'cancelled') return -1;
        return statusIndex;
    };

    const currentStep = order ? getStatusStep(order.order_status) : 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-gold-50/10 to-white py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Back Button */}
                <a
                    href="/"
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-navy-900 mb-6 group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">Back to Shop</span>
                </a>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-navy-900 mb-4">Track Your Order</h1>
                    <p className="text-gray-600">Enter your Order Number to check the current status of your package.</p>
                </div>

                {/* Search Box */}
                <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8 border-2 border-navy-700/30">
                    <form onSubmit={handleTrack} className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <input
                                type="text"
                                value={orderId}
                                onChange={(e) => setOrderId(e.target.value)}
                                placeholder="Enter Order Number (e.g., PPA-1234)"
                                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-navy-900 focus:ring-2 focus:ring-gold-500/20 outline-none transition-all text-lg text-gray-900"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !orderId.trim()}
                            className="bg-teal-500 hover:bg-teal-600 text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    Track Order
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Results */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-fade-in">
                        <AlertCircle className="w-5 h-5" />
                        <p>{error}</p>
                    </div>
                )}

                {hasSearched && order && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Status Card */}
                        <div className="bg-white rounded-2xl shadow-xl border-2 border-navy-700/30 overflow-hidden">
                            <div className="bg-navy-900 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white">
                                <div>
                                    <p className="text-white text-sm font-semibold uppercase tracking-wider mb-1">Order Status</p>
                                    <h2 className="text-2xl font-bold capitalize flex items-center gap-2 text-white">
                                        {order.order_status === 'new' && <Clock className="w-6 h-6" />}
                                        {order.order_status === 'confirmed' && <CheckCircle className="w-6 h-6 text-gold-400" />}
                                        {order.order_status === 'processing' && <Package className="w-6 h-6 text-blue-400" />}
                                        {order.order_status === 'shipped' && <Truck className="w-6 h-6 text-green-400" />}
                                        {order.order_status === 'delivered' && <CheckCircle className="w-6 h-6 text-green-500" />}
                                        {order.order_status === 'cancelled' && <AlertCircle className="w-6 h-6 text-red-500" />}
                                        {order.order_status}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-400 text-sm">Order Number</p>
                                    <p className="font-mono text-lg">{order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
                                </div>
                            </div>

                            <div className="p-6 md:p-8">
                                {/* Progress Bar */}
                                {order.order_status !== 'cancelled' ? (
                                    <div className="mb-8">
                                        <div className="relative">
                                            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 rounded-full" />
                                            <div
                                                className="absolute top-1/2 left-0 h-1 bg-gold-500 -translate-y-1/2 rounded-full transition-all duration-500"
                                                style={{ width: `${Math.min(100, Math.max(0, currentStep * 25))}%` }}
                                            />

                                            <div className="relative flex justify-between">
                                                {['Placed', 'Confirmed', 'Processing', 'Shipped', 'Delivered'].map((step, index) => {
                                                    const isCompleted = index <= currentStep;
                                                    const isCurrent = index === currentStep;

                                                    return (
                                                        <div key={step} className="flex flex-col items-center gap-2">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 bg-white ${isCompleted ? 'border-navy-900 text-gold-600' : 'border-gray-300 text-gray-300'
                                                                } ${isCurrent ? 'ring-4 ring-gold-500/20 scale-110' : ''}`}>
                                                                {index < currentStep ? (
                                                                    <CheckCircle className="w-5 h-5 fill-gold-50" />
                                                                ) : (
                                                                    <div className={`w-3 h-3 rounded-full ${isCompleted ? 'bg-gold-500' : 'bg-gray-300'}`} />
                                                                )}
                                                            </div>
                                                            <span className={`text-xs md:text-sm font-medium ${isCompleted ? 'text-navy-900' : 'text-gray-400'
                                                                }`}>{step}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-red-800 mb-6 flex items-center gap-3">
                                        <AlertCircle className="w-6 h-6 text-red-600" />
                                        <div>
                                            <p className="font-bold">Order Cancelled</p>
                                            <p className="text-sm">This order has been cancelled. Please contact support if you think this is a mistake.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Tracking Details Block */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                                        <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
                                            <Truck className="w-5 h-5 text-gold-600" />
                                            Tracking Information
                                        </h3>

                                        {order.tracking_number ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                                                        Tracking {order.shipping_provider === 'lbc' ? 'Number' : 'ID'} ({
                                                            order.shipping_provider === 'lbc' ? 'LBC Express' :
                                                                order.shipping_provider === 'lalamove' ? 'Lalamove' :
                                                                    order.shipping_provider === 'maxim' ? 'Maxim' :
                                                                        order.shipping_provider === 'spx' ? 'SPX Express' : 'J&T Express'
                                                        })
                                                    </p>
                                                    <p className="text-xl font-mono font-bold text-navy-900 tracking-wide">{order.tracking_number}</p>
                                                </div>

                                                {order.shipping_provider === 'lbc' ? (
                                                    <a
                                                        href={`https://www.lbcexpress.com/track/?tracking_no=${order.tracking_number}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700"
                                                    >
                                                        Track on LBC Express
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : order.shipping_provider === 'lalamove' ? (
                                                    <a
                                                        href="https://web.lalamove.com/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600"
                                                    >
                                                        Open Lalamove App/Web
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : order.shipping_provider === 'maxim' ? (
                                                    <a
                                                        href="https://taximaxim.com/"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black"
                                                    >
                                                        Open Maxim App/Web
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                ) : (
                                                    <a
                                                        href={order.shipping_provider === 'spx'
                                                            ? `https://spx.ph/track`
                                                            : `https://www.jtexpress.ph/trajectoryQuery?bills=${order.tracking_number}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`block w-full py-3 text-white text-center rounded-lg font-bold transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${order.shipping_provider === 'spx' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                                                            }`}
                                                    >
                                                        Track on {order.shipping_provider === 'spx' ? 'SPX Express' : 'J&T Express'}
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4 text-gray-500">
                                                <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                                <p>No tracking number available yet.</p>
                                                <p className="text-xs mt-1">Check back later when your order is shipped.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        {order.shipping_note && (
                                            <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                                                <h3 className="font-bold text-navy-900 mb-2 flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-blue-600" />
                                                    Shipping Update
                                                </h3>
                                                <p className="text-gray-700 text-sm leading-relaxed">{order.shipping_note}</p>
                                            </div>
                                        )}

                                        <div className="bg-white rounded-xl p-5 border-2 border-gray-100">
                                            <h3 className="font-bold text-navy-900 mb-3 text-sm uppercase tracking-wider border-b pb-2">Order Summary</h3>
                                            <div className="space-y-2 mb-4">
                                                {order.order_items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm">
                                                        <span className="text-gray-600">{item.quantity}x {item.product_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-100 font-bold text-lg text-navy-900">
                                                <span>Total</span>
                                                <span>₱{(order.total_price + (order.shipping_fee || 0)).toLocaleString()}</span>
                                            </div>
                                            {order.discount_applied && order.discount_applied > 0 && (
                                                <div className="flex justify-between items-center pt-2 text-sm text-green-600 font-medium">
                                                    <span>Discount ({order.promo_code || 'Promo'}):</span>
                                                    <span>-₱{order.discount_applied.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderTracking;
