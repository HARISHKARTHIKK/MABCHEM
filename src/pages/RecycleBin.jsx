import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, addDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { Trash2, RotateCcw, Search, Calendar, FileText, Loader2, Info } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';

export default function RecycleBin() {
    const { userRole } = useAuth();
    const [deletedItems, setDeletedItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [restoringId, setRestoringId] = useState(null);

    useEffect(() => {
        const q = query(collection(db, 'recycleBin'), orderBy('deletedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setDeletedItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleRestore = async (item) => {
        if (userRole !== 'admin') {
            alert("Only administrators can restore items.");
            return;
        }

        if (!window.confirm(`Are you sure you want to restore this ${item.type}? This will adjust stock levels again.`)) {
            return;
        }

        setRestoringId(item.id);
        try {
            if (item.type === 'INVOICE') {
                const invoiceData = item.data;
                const items = invoiceData.items || [];

                await runTransaction(db, async (transaction) => {
                    // 1. Check if invoice number is still unique
                    // (Omitted for brevity in this step, but in production we should check if invoiceNo exists)

                    // 2. Adjust Stock (Subtract quantity as we are restoring an invoice)
                    for (const line of items) {
                        const productRef = doc(db, "products", line.productId);
                        const productSnap = await transaction.get(productRef);
                        if (productSnap.exists()) {
                            const pData = productSnap.data();
                            const locations = { ...pData.locations };
                            const fromLoc = invoiceData.fromLocation;
                            locations[fromLoc] = Number(((Number(locations[fromLoc]) || 0) - Number(line.quantity)).toFixed(1));
                            const newTotal = Object.values(locations).reduce((a, b) => a + (Number(b) || 0), 0);
                            transaction.update(productRef, {
                                locations,
                                stockQty: Number(newTotal.toFixed(1)),
                                updatedAt: serverTimestamp()
                            });
                        }
                    }

                    // 3. Restore PO progress if applicable
                    // (Note: This is complex to perfectly reverse, but we'll restore delivered quantities)
                    const poIds = [...new Set(items.filter(i => i.purchaseOrderId).map(i => i.purchaseOrderId))];
                    for (const poId of poIds) {
                        const poRef = doc(db, "purchaseOrders", poId);
                        const poSnap = await transaction.get(poRef);
                        if (poSnap.exists()) {
                            const poData = poSnap.data();
                            const poItems = JSON.parse(JSON.stringify(poData.items));
                            items.filter(i => i.purchaseOrderId === poId).forEach(line => {
                                const poItemIndex = poItems.findIndex(pi => pi.productId === line.productId);
                                if (poItemIndex !== -1) {
                                    poItems[poItemIndex].deliveredQty = Number((Number(poItems[poItemIndex].deliveredQty || 0) + Number(line.quantity)).toFixed(2));
                                    poItems[poItemIndex].remainingQty = Number((Number(poItems[poItemIndex].totalQty) - poItems[poItemIndex].deliveredQty).toFixed(2));
                                    if (!poItems[poItemIndex].fulfillments) poItems[poItemIndex].fulfillments = [];
                                    poItems[poItemIndex].fulfillments.push({
                                        invoiceNo: invoiceData.invoiceNo,
                                        quantity: Number(line.quantity),
                                        date: format(new Date(), 'yyyy-MM-dd')
                                    });
                                }
                            });
                            transaction.update(poRef, {
                                items: poItems,
                                status: poItems.every(i => Number(i.remainingQty) <= 0) ? 'Completed' : 'Partially Fulfilled',
                                updatedAt: serverTimestamp()
                            });
                        }
                    }

                    // 4. Restore Movements and Dispatches
                    if (invoiceData.movements) {
                        invoiceData.movements.forEach(m => {
                            const moveRef = doc(collection(db, "stockMovements"));
                            transaction.set(moveRef, { ...m, createdAt: serverTimestamp() });
                        });
                    }
                    if (invoiceData.dispatches) {
                        invoiceData.dispatches.forEach(d => {
                            const dispRef = doc(collection(db, "dispatches"));
                            transaction.set(dispRef, { ...d, createdAt: serverTimestamp() });
                        });
                    }
                    if (invoiceData.items) {
                        invoiceData.items.forEach(it => {
                            const itemRef = doc(collection(db, "invoiceItems"));
                            transaction.set(itemRef, { ...it, createdAt: serverTimestamp() });
                        });
                    }

                    // 5. Restore Invoice
                    const finalInvoiceData = { ...invoiceData };
                    delete finalInvoiceData.items;
                    delete finalInvoiceData.movements;
                    delete finalInvoiceData.dispatches;

                    const invRef = doc(db, "invoices", item.originalId);
                    transaction.set(invRef, { ...finalInvoiceData, updatedAt: serverTimestamp() });

                    // 6. Delete from Recycle Bin
                    transaction.delete(doc(db, 'recycleBin', item.id));
                });
                alert("Invoice restored successfully.");
            }
        } catch (error) {
            console.error("Restore Error:", error);
            alert("Failed to restore: " + error.message);
        } finally {
            setRestoringId(null);
        }
    };

    const handlePermanentDelete = async (id) => {
        if (userRole !== 'admin') {
            alert("Only administrators can permanently delete items.");
            return;
        }

        if (window.confirm("Are you sure? This item will be gone forever.")) {
            try {
                await deleteDoc(doc(db, 'recycleBin', id));
            } catch (error) {
                alert("Failed to delete: " + error.message);
            }
        }
    };

    const filteredItems = deletedItems.filter(item => {
        const str = JSON.stringify(item).toLowerCase();
        return str.includes(searchTerm.toLowerCase());
    });

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Trash2 className="h-6 w-6 text-rose-500" /> Recycle Bin
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Recently deleted items. Admin can restore them.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search in recycle bin..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold uppercase text-[11px] tracking-wider">
                            <tr>
                                <th className="px-6 py-3">Deleted Date</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Details</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                            {item.deletedAt?.seconds ? format(new Date(item.deletedAt.seconds * 1000), 'dd MMM yyyy HH:mm') : '-'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter">
                                            {item.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-md">
                                            {item.type === 'INVOICE' && (
                                                <div className="space-y-1">
                                                    <div className="font-bold text-slate-800 dark:text-slate-100">#{item.data.invoiceNo} - {item.data.customerName}</div>
                                                    <div className="text-xs text-slate-500">Amount: ₹{item.data.totalAmount?.toLocaleString()} | Items: {item.data.items?.length || 0}</div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {userRole === 'admin' && (
                                                <>
                                                    <button
                                                        onClick={() => handleRestore(item)}
                                                        disabled={restoringId === item.id}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-md font-bold transition-all disabled:opacity-50"
                                                        title="Restore"
                                                    >
                                                        {restoringId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                                        Restore
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermanentDelete(item.id)}
                                                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-colors"
                                                        title="Delete Permanently"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                                        <Info className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                        Recycle bin is empty
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
