import { useState, useEffect } from 'react';
import { exportToCSV } from '../utils/exportToCSV';
import { Plus, Search, Filter, Edit, Trash2, Package, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where, limit, serverTimestamp } from 'firebase/firestore';
import { addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
export default function Products() {
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingProduct, setEditingProduct] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '', sku: '', hsn: '', price: '', stockQty: '', lowStockThreshold: 10
    });

    // 🔹 FETCH PRODUCTS
    const { currentUser, userRole } = useAuth(); // Use context instead of getAuth directly

    // 🔹 FETCH PRODUCTS
    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'products'),
            // where('userId', '==', currentUser.uid), // Temporarily disabled to show all products
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const productsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setProducts(productsData);
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching products:", error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUser]);

    const handleOpenModal = (product = null) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                sku: product.sku,
                hsn: product.hsn,
                price: product.price,
                stockQty: product.stockQty,
                lowStockThreshold: product.lowStockThreshold || 10
            });
        } else {
            setEditingProduct(null);
            setFormData({ name: '', sku: '', hsn: '', price: '', stockQty: '', lowStockThreshold: 10 });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    // 🔹 ADD OR UPDATE PRODUCT
    const handleSubmit = async (e) => {
        e.preventDefault();
        const auth = getAuth();

        try {
            if (editingProduct) {
                await updateDoc(doc(db, "products", editingProduct.id), {
                    ...formData,
                    price: Number(formData.price),
                    stockQty: Number(formData.stockQty),
                    lowStockThreshold: Number(formData.lowStockThreshold || 10),
                    updatedAt: serverTimestamp()
                });
            } else {
                await addDoc(collection(db, "products"), {
                    ...formData,
                    userId: auth.currentUser.uid,
                    price: Number(formData.price),
                    stockQty: Number(formData.stockQty),
                    lowStockThreshold: Number(formData.lowStockThreshold || 10),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }
            handleCloseModal();
        } catch (error) {
            alert("Error saving product: " + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this product?")) {
            try {
                await deleteDoc(doc(db, "products", id));
            } catch (error) {
                alert("Error deleting product: " + error.message);
            }
        }
    };

    const filteredProducts = products.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    const handleExport = () => {
        const dataToExport = products.map(p => ({
            Name: p.name,
            SKU: p.sku,
            HSN: p.hsn,
            Price: p.price,
            'Stock Quantity': p.stockQty,
            'Low Stock Threshold': p.lowStockThreshold || 10
        }));
        exportToCSV('products_export.csv', dataToExport);
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Package className="h-6 w-6 text-blue-600" />
                        Products
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage your product inventory and pricing</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm active:scale-95"
                    >
                        Export CSV
                    </button>
                    {userRole !== 'viewer' && (
                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-md shadow-blue-500/20 active:scale-95"
                        >
                            <Plus className="h-4 w-4" />
                            Add Product
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, SKU..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="flex items-center gap-2 text-slate-600 hover:bg-white hover:shadow-sm px-3 py-2 rounded-lg border border-transparent hover:border-slate-200 transition-all">
                        <Filter className="h-4 w-4" />
                        <span>Filter</span>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Product Details</th>
                                <th className="px-6 py-4">SKU / HSN</th>
                                <th className="px-6 py-4">Price</th>
                                <th className="px-6 py-4">Stock Status</th>
                                {userRole !== 'viewer' && <th className="px-6 py-4 text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{product.name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-mono text-xs text-slate-600">{product.sku}</span>
                                            <span className="text-xs text-slate-400">HSN: {product.hsn}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-900">₹ {Number(product.price).toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${product.stockQty === 0 ? 'bg-slate-100 text-slate-600' :
                                            product.stockQty < (product.lowStockThreshold || 10) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${product.stockQty === 0 ? 'bg-slate-400' :
                                                product.stockQty < (product.lowStockThreshold || 10) ? 'bg-red-500' : 'bg-emerald-500'
                                                }`}></span>
                                            {product.stockQty === 0 ? 'Out of Stock' : `${product.stockQty} Units`}
                                        </span>
                                    </td>
                                    {userRole !== 'viewer' && (
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenModal(product)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(product.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredProducts.length === 0 && (
                        <div className="p-12 text-center">
                            <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-slate-900 font-medium">No products found</h3>
                            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or add a new product.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-lg text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-1 transition-colors">✕</button>
                        </div>
                        <div className="p-6">
                            <form className="space-y-4" onSubmit={handleSubmit}>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Product Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="e.g., Wireless Mouse"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">SKU</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="e.g., WM-001"
                                            value={formData.sku}
                                            onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">HSN Code</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="8-digit code"
                                            value={formData.hsn}
                                            onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Price (₹)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                                            <input
                                                type="number"
                                                required
                                                min="0"
                                                step="0.01"
                                                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                                placeholder="0.00"
                                                value={formData.price}
                                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Stock Quantity</label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="0"
                                            value={formData.stockQty}
                                            onChange={(e) => setFormData({ ...formData, stockQty: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Low Stock Threshold</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="Default: 10"
                                        value={formData.lowStockThreshold}
                                        onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                                    />
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={handleCloseModal} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                                    <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-500/30 transition-all">{editingProduct ? 'Update Product' : 'Save Product'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
