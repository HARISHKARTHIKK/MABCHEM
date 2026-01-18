import { useState, useEffect } from 'react';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowRightLeft, X, Loader2 } from 'lucide-react';
import { transferStock } from '../services/firestoreService';
import { useSettings } from '../context/SettingsContext';

export default function StockTransferModal({ isOpen, onClose, onSuccess }) {
    const { settings } = useSettings();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [selectedProduct, setSelectedProduct] = useState('');
    const [fromLocation, setFromLocation] = useState('');
    const [toLocation, setToLocation] = useState('');
    const [quantity, setQuantity] = useState('');

    // Dynamic Locations
    const LOCATIONS = settings?.locations?.filter(l => l.active).map(l => l.name) || ['Warehouse A', 'Warehouse B', 'Store Front', 'Factory'];

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
            // Reset form
            setSelectedProduct('');
            setFromLocation('');
            setToLocation('');
            setQuantity('');
        }
    }, [isOpen]);

    const fetchProducts = async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        } catch (error) {
            console.error("Error fetching products:", error);
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedProduct || !fromLocation || !toLocation || !quantity) return;
        if (fromLocation === toLocation) {
            alert("From and To locations must be different.");
            return;
        }

        setSubmitting(true);
        try {
            const product = products.find(p => p.id === selectedProduct);
            await transferStock({
                productId: selectedProduct,
                productName: product?.name || 'Unknown',
                fromLocation,
                toLocation,
                quantity: Number(quantity)
            });
            onSuccess();
            onClose();
        } catch (error) {
            alert(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                        Transfer Stock
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-1 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Select Product</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    value={selectedProduct}
                                    onChange={(e) => setSelectedProduct(e.target.value)}
                                    required
                                >
                                    <option value="">Choose a product...</option>
                                    {products.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} (Total: {p.stockQty})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">From Location</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        value={fromLocation}
                                        onChange={(e) => setFromLocation(e.target.value)}
                                        required
                                    >
                                        <option value="">Origin</option>
                                        {LOCATIONS.map(loc => (
                                            <option key={loc} value={loc} disabled={loc === toLocation}>{loc}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">To Location</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                        value={toLocation}
                                        onChange={(e) => setToLocation(e.target.value)}
                                        required
                                    >
                                        <option value="">Destination</option>
                                        {LOCATIONS.map(loc => (
                                            <option key={loc} value={loc} disabled={loc === fromLocation}>{loc}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Quantity (mts)</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="0.000"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="pt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
                                <p><strong>Note:</strong> Ensure "From Location" has sufficient stock. Total stock quantity remains unchanged.</p>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-70"
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm Transfer'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
