import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ArrowRight, Truck, MapPin, Package, AlertTriangle, Box, X, TrendingUp } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { addStock } from '../services/firestoreService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const { settings } = useSettings();
    const { userRole } = useAuth();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [dispatches, setDispatches] = useState([]);
    const [recentInwards, setRecentInwards] = useState([]);
    const navigate = useNavigate();

    // Stock Update Modal State
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [stockForm, setStockForm] = useState({ location: '', quantity: '', reason: 'Dashboard Update' });

    useEffect(() => {
        setLoading(true);
        // Products
        const qProducts = query(collection(db, 'products'));
        // Recent Dispatches
        const qDispatches = query(collection(db, 'dispatches'), orderBy('createdAt', 'desc'), limit(10));
        const qImports = query(collection(db, 'imports'), orderBy('createdAt', 'desc'), limit(10));
        const qPurchases = query(collection(db, 'localPurchases'), orderBy('createdAt', 'desc'), limit(10));

        const unsubProducts = onSnapshot(qProducts, (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubDispatches = onSnapshot(qDispatches, (snap) => {
            setDispatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubImports = onSnapshot(qImports, (snap) => {
            const importEntries = snap.docs.map(d => ({ id: d.id, type: 'IMPORT', ...d.data() }));
            updateInwards(importEntries, 'imports');
        });

        const unsubPurchases = onSnapshot(qPurchases, (snap) => {
            const purchaseEntries = snap.docs.map(d => ({ id: d.id, type: 'LOCAL', ...d.data() }));
            updateInwards(purchaseEntries, 'purchases');
        });

        const inwardStore = { imports: [], purchases: [] };
        const updateInwards = (data, category) => {
            inwardStore[category] = data;
            const combined = [...inwardStore.imports, ...inwardStore.purchases]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 10);
            setRecentInwards(combined);
            setLoading(false);
        };

        return () => {
            unsubProducts();
            unsubDispatches();
            unsubImports();
            unsubPurchases();
        };
    }, []);

    const sortedProducts = useMemo(() => {
        return [...products].sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
    }, [products]);

    const handleOpenStockModal = (product) => {
        setSelectedProduct(product);
        setStockForm({ location: '', quantity: '', reason: 'Dashboard Update' });
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e) => {
        e.preventDefault();
        try {
            await addStock({
                productId: selectedProduct.id,
                location: stockForm.location,
                quantity: stockForm.quantity,
                reason: stockForm.reason
            });
            setIsStockModalOpen(false);
        } catch (error) {
            alert(error.message);
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const LOCATIONS = settings?.locations?.filter(l => l.active).map(l => l.name) || ['Warehouse A', 'Warehouse B', 'Store Front', 'Factory'];

    return (
        <div className="space-y-1 animate-fade-in-up">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Dashboard</h2>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                    {userRole !== 'viewer' && (
                        <button
                            onClick={() => navigate('/invoices', { state: { create: true } })}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-5 py-3 sm:py-2.5 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            <Plus className="h-3 w-4" /> New Invoice
                        </button>
                    )}
                </div>
            </div>

            {/* Inventory Status Cards */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        STOCK DETAILS (As on Today)
                    </h3>
                    <button onClick={() => navigate('/inventory')} className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1">
                        View All <ArrowRight className="h-3 w-3" />
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {sortedProducts.map(p => {
                        const totalStock = Object.values(p.locations || {}).reduce((a, b) => {
                            const val = Number(b);
                            return a + (isNaN(val) ? 0 : val);
                        }, 0);
                        const isLow = totalStock < (p.lowStockThreshold || 10);
                        const hasLocations = p.locations && Object.keys(p.locations).length > 0;

                        return (
                            <div key={p.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 flex flex-col justify-between hover:shadow-md dark:hover:shadow-slate-900/50 transition-shadow relative overflow-hidden group">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 truncate pr-4 text-base" title={p.name}>{p.name}</h4>
                                        {isLow && <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                                    </div>

                                    {/* Dashboard: Location Specific Prominent Stock info */}
                                    <div className="mb-2 space-y-1.5">
                                        {hasLocations && Object.entries(p.locations).map(([loc, qty]) => (
                                            <div key={loc} className="flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 px-2 py-1.5 rounded-lg">
                                                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">{loc}</span>
                                                <div className="text-right">
                                                    <span className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">{(Number(qty) || 0).toFixed(1)}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1 uppercase">mts</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-slate-50 dark:border-slate-700/50 mb-2" />
                                    <div className="mb-3">
                                        <div className="flex items-baseline gap-1">
                                            <span className={`text-xs font-bold ${isLow ? 'text-amber-600' : 'text-slate-500'}`}>{totalStock.toFixed(1)}</span>
                                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">TOTAL STOCK (mts)</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        );
                    })}
                    {products.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            No products found. Add products to see inventory status.
                        </div>
                    )}
                </div>
            </section>

            {/* Daily Dispatch Summary */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Truck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        Recent Dispatches
                    </h3>
                    <button onClick={() => navigate('/dispatch')} className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline flex items-center gap-1">
                        View All Log <ArrowRight className="h-3 w-3" />
                    </button>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-slate-700 font-black uppercase text-[11px] tracking-wider">
                                <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Invoice</th>
                                    <th className="px-3 py-2">Customer</th>
                                    <th className="px-3 py-2">Product</th>
                                    <th className="px-3 py-2">No. of Bags</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2 text-right">Basic</th>
                                    <th className="px-3 py-2 text-right">Tax (GST)</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                    <th className="px-3 py-2">Vehicle</th>
                                    <th className="px-3 py-2">Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {dispatches.map(d => (
                                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[14px]">
                                            {d.createdAt?.seconds ? format(new Date(d.createdAt.seconds * 1000), 'dd MMM') : '-'}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 text-[14px]">{d.invoiceNo}</td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 font-bold truncate max-w-[150px] text-[14px]" title={d.customerName}>
                                            {d.customerName || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 text-[14px] leading-tight truncate max-w-[120px]">{d.productName || 'Unknown'}</td>
                                        <td className="px-3 py-2 text-[14px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                            {d.bags ? `${d.bags} x ${d.bagWeight}kg` : '-'}
                                        </td>

                                        <td className="px-3 py-2 text-right text-slate-800 dark:text-slate-200 text-[14px]">
                                            {(Number(d.quantity) || 0).toFixed(1)} <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">mts</span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300 text-[14px] text-nowrap">
                                            ₹{((Number(d.quantity) || 0) * (Number(d.unitPrice) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 text-[14px] text-nowrap">
                                            ₹{(Number(d.taxAmount) || 0).toFixed(0)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100 text-[14px] text-nowrap">
                                            ₹{(Number(d.itemTotal) || 0).toFixed(0)}
                                        </td>
                                        <td className="px-3 py-2 text-[14px] text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                            {d.transport?.vehicleNumber || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-[14px] text-slate-800 dark:text-slate-200 truncate max-w-[180px]" title={d.remarks}>
                                            {d.remarks || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-700">
                        {dispatches.map(d => (
                            <div key={d.id} className="p-3 bg-white dark:bg-slate-800 flex flex-col gap-1.5">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-0.5">
                                        <div className="font-mono text-slate-900 dark:text-slate-400 text-[10px]">{d.invoiceNo}</div>
                                        <div className="text-sm text-slate-900 dark:text-slate-100 font-black uppercase tracking-tight leading-none">{d.customerName || 'No Customer'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-blue-600 dark:text-blue-400">₹{(Number(d.itemTotal) || 0).toFixed(0)}</div>
                                        <div className="text-[8px] text-slate-500 dark:text-slate-500 uppercase mt-0.5">Basic: ₹{((Number(d.quantity) || 0) * (Number(d.unitPrice) || 0)).toFixed(0)}</div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded">
                                    <div className="text-slate-900 dark:text-slate-200 text-[12px] truncate max-w-[150px]">{d.productName || 'Unknown'}</div>
                                    <div className="text-[9px] text-blue-600 dark:text-blue-400">
                                        {d.bags ? `${d.bags} x ${d.bagWeight}kg` : '-'}
                                    </div>
                                </div>
                                <div className="flex justify-between items-end border-t border-slate-50 dark:border-slate-800 pt-1.5">
                                    <div className="space-y-1">
                                        <div className="text-[11px] text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                            <Truck className="h-3 w-3" /> {d.transport?.vehicleNumber || 'NO VEHICLE'}
                                        </div>
                                        <span className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded uppercase w-fit">
                                            <MapPin className="h-2 w-2" /> {d.location}
                                        </span>
                                    </div>
                                    <div className="text-right space-y-0.5">
                                        <div className="text-[10px] text-slate-900 dark:text-slate-300">
                                            {(Number(d.quantity) || 0).toFixed(1)} mts
                                        </div>
                                        {d.remarks && <div className="text-[11px] text-slate-700 dark:text-slate-300 italic mt-0.5 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-100 dark:border-amber-900/30 max-w-[180px]">Note: {d.remarks}</div>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {dispatches.length === 0 && (
                        <div className="px-6 py-12 text-center text-slate-400 bg-white">
                            No recent dispatches today.
                        </div>
                    )}
                </div>
            </section>

            {/* Inward Stock Summary */}
            <section>
                <div className="flex items-center justify-between mb-4 mt-8">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        RECENT INWARDS (Imports/Local)
                    </h3>
                    <button onClick={() => navigate('/stock-management')} className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1">
                        View All <ArrowRight className="h-3 w-3" />
                    </button>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-slate-700 font-black uppercase text-[11px] tracking-wider">
                                <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Vendor/Supplier</th>
                                    <th className="px-3 py-2">Product</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2">Ref No</th>
                                    <th className="px-3 py-2">Vehicle</th>
                                    <th className="px-3 py-2">Warehouse</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {recentInwards.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-[14px]">
                                            {item.createdAt?.seconds ? format(new Date(item.createdAt.seconds * 1000), 'dd MMM') : '-'}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded leading-none ${item.type === 'IMPORT' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 font-bold truncate max-w-[150px] text-[14px]">
                                            {item.supplierName || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 text-[14px] leading-tight truncate max-w-[120px]">
                                            {products.find(p => p.id === item.productId)?.name || 'Unknown'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-800 dark:text-slate-200 text-[14px]">
                                            {(Number(item.quantity) || 0).toFixed(1)} <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">mts</span>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400 text-[12px]">
                                            {item.beNumber || item.invoiceNo || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-[14px] text-blue-600 dark:text-blue-400 font-medium">
                                            {item.vehicleNumber || '-'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded uppercase w-fit">
                                                <MapPin className="h-2 w-2" /> {item.location}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile View */}
                    <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-700">
                        {recentInwards.map(item => (
                            <div key={item.id} className="p-3 bg-white dark:bg-slate-800 flex flex-col gap-1.5">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-2 items-center">
                                        <span className={`text-[8px] font-black px-1 py-0.5 rounded ${item.type === 'IMPORT' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                                            {item.type}
                                        </span>
                                        <div className="text-sm text-slate-900 dark:text-slate-100 font-black uppercase tracking-tight">{item.supplierName || 'Unknown'}</div>
                                    </div>
                                    <div className="text-xs font-black text-slate-900 dark:text-slate-100">{(Number(item.quantity) || 0).toFixed(1)} mts</div>
                                </div>
                                <div className="flex justify-between items-center text-[12px] text-slate-600 dark:text-slate-400">
                                    <span>{products.find(p => p.id === item.productId)?.name || 'Unknown'}</span>
                                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{item.beNumber || item.invoiceNo}</span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1">
                                        <Truck className="h-3 w-3" /> {item.vehicleNumber || 'NO VEHICLE'}
                                    </div>
                                    <span className="text-[8px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded font-bold uppercase text-slate-500 dark:text-slate-400">{item.location}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {recentInwards.length === 0 && (
                        <div className="px-6 py-12 text-center text-slate-400 bg-white">
                            No inward entries yet.
                        </div>
                    )}
                </div>
            </section>

            <div className="h-4" />

            {/* Update Stock Modal */}
            {isStockModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 border dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Update Stock</h3>
                            <button onClick={() => setIsStockModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 p-1">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Updating inventory for: <span className="font-semibold text-slate-800 dark:text-slate-100">{selectedProduct?.name}</span></p>
                        <form onSubmit={handleStockSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Location</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={stockForm.location}
                                    onChange={e => setStockForm({ ...stockForm, location: e.target.value })}
                                    required
                                >
                                    <option value="">Select Location</option>
                                    {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity Adjustment (mts)</label>
                                <input
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                                    type="number"
                                    step="0.001"
                                    placeholder="Enter quantity (e.g. 10.5 or -5)"
                                    value={stockForm.quantity}
                                    onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                                    required
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Positive to add, negative to reduce.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Reason / Note</label>
                                <input
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="e.g. New Batch, Correction"
                                    value={stockForm.reason}
                                    onChange={e => setStockForm({ ...stockForm, reason: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <button type="button" onClick={() => setIsStockModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-blue-600 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-700 font-medium shadow-md">Update</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
