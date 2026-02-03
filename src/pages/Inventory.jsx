import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, deleteDoc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { exportToCSV } from '../utils/exportToCSV';
import {
    ClipboardList, Search, Loader2, Package, Plus, MapPin,
    ArrowRightLeft, FileSpreadsheet, ChevronDown, ChevronRight, Edit, Trash2, Box
} from 'lucide-react';
import StockTransferModal from '../components/StockTransferModal';
import { addStock } from '../services/firestoreService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
    const { settings } = useSettings();
    const { userRole } = useAuth();
    const [view, setView] = useState('inventory'); // 'inventory', 'logs', 'summary'
    const [products, setProducts] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modals
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);

    const [editingProduct, setEditingProduct] = useState(null);
    const [selectedProductForStock, setSelectedProductForStock] = useState(null);

    // Form States
    const [productForm, setProductForm] = useState({
        name: '', sku: '', hsn: '', price: '', lowStockThreshold: 10
    });
    const [stockForm, setStockForm] = useState({
        location: '', quantity: '', reason: 'Initial Stock'
    });

    // Dynamic LOCATIONS
    const LOCATIONS = settings?.locations?.filter(l => l.active).map(l => l.name) || ['Warehouse A', 'Warehouse B', 'Store Front', 'Factory'];

    // --- FETCH DATA ---
    useEffect(() => {
        setLoading(true);
        const qProducts = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
        const qLogs = query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc'), limit(100));

        const unsubProducts = onSnapshot(qProducts, (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            if (view === 'inventory' || view === 'summary') setLoading(false);
        });

        const unsubLogs = onSnapshot(qLogs, (snap) => {
            setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            if (view === 'logs') setLoading(false);
        });

        return () => { unsubProducts(); unsubLogs(); };
    }, [view]);

    // --- ACTIONS ---

    // Product Modal
    const handleOpenProductModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setProductForm({
                name: product.name,
                sku: product.sku,
                hsn: product.hsn,
                price: product.price,
                lowStockThreshold: product.lowStockThreshold || 10
            });
        } else {
            setEditingProduct(null);
            setProductForm({ name: '', sku: '', hsn: '', price: '', lowStockThreshold: 10 });
        }
        setIsProductModalOpen(true);
    };

    const handleProductSubmit = async (e) => {
        e.preventDefault();
        const auth = getAuth();
        try {
            if (editingProduct) {
                await updateDoc(doc(db, "products", editingProduct.id), {
                    ...productForm,
                    price: Number(productForm.price),
                    lowStockThreshold: Number(productForm.lowStockThreshold),
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, "products"), {
                    ...productForm,
                    stockQty: 0,
                    locations: {},
                    price: Number(productForm.price),
                    lowStockThreshold: Number(productForm.lowStockThreshold),
                    userId: auth.currentUser.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            setIsProductModalOpen(false);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleDeleteProduct = async (id) => {
        if (confirm("Delete this product?")) {
            await deleteDoc(doc(db, "products", id));
        }
    };

    // Stock Modal
    const handleOpenStockModal = (product) => {
        setSelectedProductForStock(product);
        setStockForm({ location: '', quantity: '', reason: 'Adjustment' });
        setIsStockModalOpen(true);
    };

    const handleStockSubmit = async (e) => {
        e.preventDefault();
        try {
            await addStock({
                productId: selectedProductForStock.id,
                location: stockForm.location,
                quantity: stockForm.quantity,
                reason: stockForm.reason
            });
            setIsStockModalOpen(false);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleExport = () => {
        const dataToExport = [];
        products.forEach(p => {
            const locs = p.locations || {};
            if (Object.keys(locs).length > 0) {
                Object.entries(locs).forEach(([loc, qty]) => {
                    dataToExport.push({
                        'Product Name': p.name,
                        'Location': loc,
                        'Stock Quantity (mts)': Number(qty)
                    });
                });
            } else {
                dataToExport.push({
                    'Product Name': p.name,
                    'Location': 'Unassigned',
                    'Stock Quantity (mts)': 0
                });
            }
        });
        exportToCSV('inventory_export.csv', dataToExport);
    };

    // Filtering
    const filteredProducts = products.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredLogs = logs.filter(log =>
        (log.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.reason?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Grouping for Location Summary (No changes needed, uses p.locations directly)
    const locationSummary = {};
    if (view === 'summary') {
        products.forEach(p => {
            if (p.locations) {
                Object.entries(p.locations).forEach(([loc, qty]) => {
                    if (!locationSummary[loc]) {
                        locationSummary[loc] = { totalStock: 0, items: [] };
                    }
                    if (qty > 0) {
                        const val = Number(qty);
                        const safeVal = isNaN(val) ? 0 : val;
                        locationSummary[loc].items.push({
                            name: p.name,
                            sku: p.sku,
                            qty: safeVal
                        });
                        locationSummary[loc].totalStock += safeVal;
                    }
                });
            }
        });
    }

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* ... Modals (No change) ... */}
            <StockTransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} onSuccess={() => { }} />

            {/* Product Modal */}
            {isProductModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                        <h3 className="text-lg font-bold mb-4">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                        <form onSubmit={handleProductSubmit} className="space-y-4">
                            <input className="w-full p-2 border rounded" placeholder="Product Name" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} required />
                            <div className="grid grid-cols-2 gap-4">
                                <input className="p-2 border rounded" placeholder="SKU" value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} required />
                                <input className="p-2 border rounded" placeholder="HSN" value={productForm.hsn} onChange={e => setProductForm({ ...productForm, hsn: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input className="p-2 border rounded" type="number" placeholder="Price" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} required />
                                <input className="p-2 border rounded" type="number" placeholder="Low Stock Threshold" value={productForm.lowStockThreshold} onChange={e => setProductForm({ ...productForm, lowStockThreshold: e.target.value })} />
                            </div>
                            {!editingProduct && <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded">Note: Stock quantity is added separately via "Add Stock" to ensure location accuracy.</p>}
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingProduct ? 'Update' : 'Create Product'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Stock Modal */}
            {isStockModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold mb-2">Add Stock</h3>
                        <p className="text-sm text-slate-500 mb-4">Adding stock to: <span className="font-semibold text-slate-800">{selectedProductForStock?.name}</span></p>
                        <form onSubmit={handleStockSubmit} className="space-y-4">
                            <select className="w-full p-2 border rounded" value={stockForm.location} onChange={e => setStockForm({ ...stockForm, location: e.target.value })} required>
                                <option value="">Select Location</option>
                                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <input className="w-full p-2 border rounded" type="number" step="0.001" placeholder="Quantity (mts)" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} required />
                            <input className="w-full p-2 border rounded" placeholder="Reason (e.g. Purchase, Initial)" value={stockForm.reason} onChange={e => setStockForm({ ...stockForm, reason: e.target.value })} />
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsStockModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Add Stock</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                        Unified Inventory
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage products, stock, and locations</p>
                </div>
                <div className="flex gap-2 p-1 rounded-lg">
                    {userRole !== 'viewer' && (
                        <button onClick={() => handleOpenProductModal()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow font-medium">
                            <Plus className="h-4 w-4" /> Product
                        </button>
                    )}
                    {settings?.inventory?.allowStockTransfer !== false && userRole !== 'viewer' && (
                        <button onClick={() => setIsTransferModalOpen(true)} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 font-medium">
                            <ArrowRightLeft className="h-4 w-4" /> Transfer
                        </button>
                    )}
                    <div className="flex bg-slate-100 p-1 rounded-lg ml-2">
                        <button onClick={() => setView('inventory')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'inventory' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Inventory</button>
                        <button onClick={() => setView('logs')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'logs' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Logs</button>
                        <button onClick={() => setView('summary')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${view === 'summary' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Summary</button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input type="text" placeholder="Search products, SKU..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button onClick={handleExport} className="ml-auto text-slate-500 hover:text-blue-600 p-2"><FileSpreadsheet className="h-5 w-5" /></button>
                </div>

                {view === 'inventory' && (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Product Details</th>
                                        <th className="px-6 py-4">SKU / HSN</th>
                                        <th className="px-6 py-4">Total Stock</th>
                                        <th className="px-6 py-4">Location Breakdown</th>
                                        {userRole !== 'viewer' && <th className="px-6 py-4 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredProducts.map(p => {
                                        const totalStock = Object.values(p.locations || {}).reduce((a, b) => {
                                            const val = Number(b);
                                            return a + (isNaN(val) ? 0 : val);
                                        }, 0);
                                        const isLow = totalStock < (p.lowStockThreshold || 10);
                                        return (
                                            <tr key={p.id} className="hover:bg-slate-50/50">
                                                <td className="px-6 py-4 font-medium text-slate-900 align-top">
                                                    {p.name}
                                                    <div className="text-xs font-normal text-slate-400 mt-1">Price: ₹{p.price}</div>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-500 align-top">{p.sku} <span className="text-slate-300">|</span> {p.hsn}</td>
                                                <td className="px-6 py-4 align-top">
                                                    <span className={`font-bold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>{totalStock.toFixed(1)} mts</span>
                                                    {isLow && <div className="text-[10px] text-red-500 font-medium bg-red-50 inline-block px-1 rounded mt-1">Low Stock</div>}
                                                </td>
                                                <td className="px-6 py-4 align-top">
                                                    <div className="space-y-1.5">
                                                        {Object.keys(p.locations || {}).length > 0 ? (
                                                            Object.entries(p.locations || {}).sort(([a], [b]) => {
                                                                const order = { 'CHENNAI': 1, 'MUNDRA': 2 };
                                                                const valA = order[a.toUpperCase()] || 99;
                                                                const valB = order[b.toUpperCase()] || 99;
                                                                return valA - valB || a.localeCompare(b);
                                                            }).map(([loc, qty]) => (
                                                                <div key={loc} className="flex justify-between items-center text-xs bg-slate-50 p-1.5 rounded border border-slate-100 max-w-xs">
                                                                    <span className="font-medium text-slate-600 flex items-center gap-1"><MapPin className="h-3 w-3" /> {loc}</span>
                                                                    <span className="font-bold text-slate-800">{(Number(qty) || 0).toFixed(1)} mts</span>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="text-xs text-slate-400 italic">No location assigned</div>
                                                        )}
                                                    </div>
                                                </td>
                                                {userRole !== 'viewer' && (
                                                    <td className="px-6 py-4 text-right flex justify-end gap-2 align-top">
                                                        <button onClick={() => handleOpenStockModal(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Add Stock"><Box className="h-4 w-4" /></button>
                                                        <button onClick={() => handleOpenProductModal(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded" title="Edit"><Edit className="h-4 w-4" /></button>
                                                        <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="lg:hidden divide-y divide-slate-100">
                            {filteredProducts.map(p => {
                                const totalStock = Object.values(p.locations || {}).reduce((a, b) => {
                                    const val = Number(b);
                                    return a + (isNaN(val) ? 0 : val);
                                }, 0);
                                const isLow = totalStock < (p.lowStockThreshold || 10);
                                return (
                                    <div key={p.id} className="p-4 bg-white flex flex-col gap-4">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <h4 className="font-bold text-slate-900">{p.name}</h4>
                                                <div className="flex gap-2 text-[10px] font-mono text-slate-500 uppercase">
                                                    <span>SKU: {p.sku || '-'}</span>
                                                    <span>HSN: {p.hsn || '-'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-lg font-black ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{totalStock.toFixed(1)} <span className="text-[10px] font-medium uppercase">mts</span></div>
                                                {isLow && <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase leading-none">Low Stock</span>}
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Location Breakdown</div>
                                            {Object.keys(p.locations || {}).length > 0 ? (
                                                Object.entries(p.locations || {}).sort(([a], [b]) => {
                                                    const order = { 'CHENNAI': 1, 'MUNDRA': 2 };
                                                    const valA = order[a.toUpperCase()] || 99;
                                                    const valB = order[b.toUpperCase()] || 99;
                                                    return valA - valB || a.localeCompare(b);
                                                }).map(([loc, qty]) => (
                                                    <div key={loc} className="flex justify-between items-center text-xs">
                                                        <span className="text-slate-600 flex items-center gap-1"><MapPin className="h-3 w-3" /> {loc}</span>
                                                        <span className="font-bold text-slate-800">{(Number(qty) || 0).toFixed(1)} mts</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-slate-400 italic">No locations.</div>
                                            )}
                                        </div>

                                        {userRole !== 'viewer' && (
                                            <div className="flex gap-2 pt-2 border-t border-slate-50">
                                                <button onClick={() => handleOpenStockModal(p)} className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-600 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform"><Box className="h-3.5 w-3.5" /> Stock</button>
                                                <button onClick={() => handleOpenProductModal(p)} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-600 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform"><Edit className="h-3.5 w-3.5" /> Edit</button>
                                                <button onClick={() => handleDeleteProduct(p.id)} className="p-2 bg-red-50 text-red-500 rounded-lg active:scale-95 transition-transform"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {view === 'summary' && (
                    <div className="p-6 space-y-8">
                        {Object.keys(locationSummary).length > 0 ? Object.entries(locationSummary).sort(([a], [b]) => {
                            const order = { 'CHENNAI': 1, 'MUNDRA': 2 };
                            const valA = order[a.toUpperCase()] || 99;
                            const valB = order[b.toUpperCase()] || 99;
                            return valA - valB || a.localeCompare(b);
                        }).map(([location, data]) => (
                            <div key={location} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><MapPin className="h-5 w-5 text-blue-600" /> {location}</h3>
                                    <div className="bg-white px-3 py-1 rounded border border-slate-200 text-sm font-semibold text-slate-600">
                                        Total: {data.totalStock.toFixed(1)} mts
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-600">
                                        <thead className="bg-white text-slate-500 font-semibold border-b border-slate-100 text-xs uppercase">
                                            <tr>
                                                <th className="px-6 py-3">Product</th>
                                                <th className="px-6 py-3">SKU</th>
                                                <th className="px-6 py-3 text-right">Quantity (mts)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.items.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="px-6 py-3 font-medium text-slate-800">{item.name}</td>
                                                    <td className="px-6 py-3">{item.sku}</td>
                                                    <td className="px-6 py-3 text-right font-bold text-blue-600">{item.qty.toFixed(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-12 text-slate-400">No stock allocated to locations yet.</div>
                        )}
                    </div>
                )}

                {view === 'logs' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Product</th>
                                    <th className="px-6 py-4">Location</th>
                                    <th className="px-6 py-4">Quantity (mts)</th>
                                    <th className="px-6 py-4">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 whitespace-nowrap">{log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleDateString() : '-'}</td>
                                        <td className="px-6 py-4 font-medium">{log.productName || 'Unknown'}</td>
                                        <td className="px-6 py-4">{log.location || '-'}</td>
                                        <td className={`px-6 py-4 font-bold ${log.changeQty > 0 ? 'text-green-600' : 'text-red-600'}`}>{log.changeQty > 0 ? '+' : ''}{(Number(log.changeQty) || 0).toFixed(1)}</td>
                                        <td className="px-6 py-4 text-slate-500">{log.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
