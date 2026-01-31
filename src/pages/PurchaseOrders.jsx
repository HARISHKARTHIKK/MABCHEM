import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
    Plus, Search, FileText, Calendar, Users, Package,
    CheckCircle2, Clock, AlertCircle, X, Loader2, List
} from 'lucide-react';
import { format } from 'date-fns';
import { addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '../services/firestoreService';

export default function PurchaseOrders() {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        poNumber: '',
        customerId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        items: [{ productId: '', totalQty: '', deliveredQty: 0, remainingQty: 0, rate: '' }],
        remarks: ''
    });

    useEffect(() => {
        const unsubPOs = onSnapshot(query(collection(db, 'purchaseOrders'), orderBy('createdAt', 'desc')), (snap) => {
            setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubPOs();
            unsubProducts();
            unsubCustomers();
        };
    }, []);

    const filteredPOs = useMemo(() => {
        return purchaseOrders.filter(po =>
            po.poNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            po.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [purchaseOrders, searchTerm]);

    const handleAddItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { productId: '', totalQty: '', deliveredQty: 0, remainingQty: 0, rate: '' }]
        });
    };

    const handleRemoveItem = (index) => {
        const newItems = [...formData.items];
        newItems.splice(index, 1);
        setFormData({ ...formData, items: newItems });
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        if (field === 'totalQty') {
            newItems[index].remainingQty = Number(value);
        }
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const customer = customers.find(c => c.id === formData.customerId);
            const poData = {
                ...formData,
                customerName: customer?.name || 'Unknown',
                items: formData.items.map(item => ({
                    ...item,
                    productName: products.find(p => p.id === item.productId)?.name || 'Unknown',
                    totalQty: Number(item.totalQty),
                    rate: Number(item.rate) || 0,
                    deliveredQty: 0,
                    remainingQty: Number(item.totalQty)
                }))
            };
            await addPurchaseOrder(poData);
            setIsModalOpen(false);
            setFormData({
                poNumber: '',
                customerId: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                items: [{ productId: '', totalQty: '', deliveredQty: 0, remainingQty: 0, rate: '' }],
                remarks: ''
            });
        } catch (error) {
            alert(error.message);
        }
    };

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <FileText className="h-6 w-6 text-blue-600" />
                        Purchase Orders
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage customer orders and tracking</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
                >
                    <Plus className="h-4 w-4" /> Create PO
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by PO# or Customer..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 font-black uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">PO Details</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Items Summary</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredPOs.map((po) => (
                                <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${po.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                            po.status === 'Partially Fulfilled' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                            {po.status === 'Completed' ? <CheckCircle2 className="h-3 w-3" /> :
                                                po.status === 'Partially Fulfilled' ? <Clock className="h-3 w-3" /> :
                                                    <AlertCircle className="h-3 w-3" />}
                                            {po.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-900 dark:text-white uppercase">{po.poNumber}</div>
                                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1 mt-1 uppercase">
                                            <Calendar className="h-3 w-3" /> {po.date}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-tight">
                                            <Users className="h-4 w-4 text-blue-500" />
                                            {po.customerName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {po.items?.map((item, idx) => (
                                            <div key={idx} className="mb-2 last:mb-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        {item.productName}
                                                        <span className="ml-2 text-[10px] text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">₹ {item.rate || 0}</span>
                                                    </span>
                                                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase">{item.deliveredQty} / {item.totalQty} MTS</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${item.remainingQty <= 0 ? 'bg-emerald-500' : 'bg-blue-500'
                                                            }`}
                                                        style={{ width: `${(item.deliveredQty / item.totalQty) * 100}%` }}
                                                    />
                                                </div>
                                                {item.fulfillments && item.fulfillments.length > 0 && (
                                                    <div className="mt-1 pl-2 border-l-2 border-slate-100 dark:border-slate-700">
                                                        {item.fulfillments.slice(-2).map((f, fidx) => (
                                                            <div key={fidx} className="text-[9px] text-slate-500 font-medium">
                                                                Inv: {f.invoiceNo} • {f.quantity} MTS • {f.date}
                                                            </div>
                                                        ))}
                                                        {item.fulfillments.length > 2 && <div className="text-[8px] text-blue-500 font-bold italic mt-0.5">+{item.fulfillments.length - 2} more shipments</div>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => {
                                                if (confirm('Are you sure you want to delete this PO?')) deletePurchaseOrder(po.id);
                                            }}
                                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredPOs.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                            No Purchase Orders found.
                        </div>
                    )}
                </div>
            </div>

            {/* Create PO Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 transform transition-all scale-100 dark:border dark:border-slate-700 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Plus className="h-5 w-5 text-blue-600" />
                                Create Purchase Order
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PO Number (Customer Reference)</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. PO/2024/001"
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm uppercase"
                                        value={formData.poNumber}
                                        onChange={e => setFormData({ ...formData, poNumber: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PO Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Customer</label>
                                    <select
                                        required
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                        value={formData.customerId}
                                        onChange={e => setFormData({ ...formData, customerId: e.target.value })}
                                    >
                                        <option value="">Choose Customer...</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <List className="h-4 w-4" /> Product Items
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={handleAddItem}
                                        className="text-xs font-bold text-blue-600 hover:underline"
                                    >
                                        + Add Product
                                    </button>
                                </div>

                                {formData.items.map((item, idx) => (
                                    <div key={idx} className="flex gap-4 items-end bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 relative group">
                                        <div className="flex-1 space-y-1.5">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Product</label>
                                            <select
                                                required
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold"
                                                value={item.productId}
                                                onChange={e => handleItemChange(idx, 'productId', e.target.value)}
                                            >
                                                <option value="">Select Product...</option>
                                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-32 space-y-1.5">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Rate (₹)</label>
                                            <input
                                                type="number"
                                                required
                                                step="any"
                                                placeholder="0.00"
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold"
                                                value={item.rate}
                                                onChange={e => handleItemChange(idx, 'rate', e.target.value)}
                                            />
                                        </div>
                                        <div className="w-32 space-y-1.5">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">Total Qty (MTS)</label>
                                            <input
                                                type="number"
                                                required
                                                step="any"
                                                placeholder="0.00"
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold"
                                                value={item.totalQty}
                                                onChange={e => handleItemChange(idx, 'totalQty', e.target.value)}
                                            />
                                        </div>
                                        {formData.items.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(idx)}
                                                className="p-2 text-slate-300 hover:text-red-500"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Internal Remarks</label>
                                <textarea
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[100px]"
                                    placeholder="Add any additional notes here..."
                                    value={formData.remarks}
                                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-2.5 text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-10 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20"
                                >
                                    Save PO
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
