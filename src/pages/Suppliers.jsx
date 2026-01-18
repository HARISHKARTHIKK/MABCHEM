import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
    Users,
    Plus,
    Search,
    MoreVertical,
    Edit2,
    Trash2,
    Phone,
    MapPin,
    User,
    FileText,
    Loader2,
    X,
    Save
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { addSupplier, updateSupplier, deleteSupplier } from '../services/firestoreService';

export default function Suppliers() {
    const { userRole } = useAuth();
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        gstin: '',
        contactPerson: '',
        phone: '',
        address: ''
    });

    useEffect(() => {
        const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setSuppliers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            if (editingSupplier) {
                await updateSupplier(editingSupplier.id, formData);
            } else {
                await addSupplier(formData);
            }
            setIsModalOpen(false);
            resetForm();
        } catch (error) {
            alert(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setFormData({ name: '', gstin: '', contactPerson: '', phone: '', address: '' });
        setEditingSupplier(null);
    };

    const handleEdit = (supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            name: supplier.name,
            gstin: supplier.gstin || '',
            contactPerson: supplier.contactPerson || '',
            phone: supplier.phone || '',
            address: supplier.address || ''
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this supplier?')) {
            try {
                await deleteSupplier(id);
            } catch (error) {
                alert(error.message);
            }
        }
    };

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-600" />
                        Suppliers Database
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage your international and local vendors</p>
                </div>
                {userRole !== 'viewer' && (
                    <button
                        onClick={() => { resetForm(); setIsModalOpen(true); }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        <Plus className="h-5 w-5" />
                        Add Supplier
                    </button>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name or GSTIN..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase text-[10px] tracking-widest border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Supplier Name</th>
                                <th className="px-6 py-4">GSTIN</th>
                                <th className="px-6 py-4">Contact Person</th>
                                <th className="px-6 py-4">Phone</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredSuppliers.map((supplier) => (
                                <tr key={supplier.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-900">{supplier.name}</div>
                                        <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{supplier.address}</div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-500">{supplier.gstin || '-'}</td>
                                    <td className="px-6 py-4 text-slate-600">{supplier.contactPerson || '-'}</td>
                                    <td className="px-6 py-4 font-bold text-blue-600">{supplier.phone || '-'}</td>
                                    <td className="px-6 py-4 text-right">
                                        {userRole !== 'viewer' && (
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEdit(supplier)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors">
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(supplier.id)} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                    {filteredSuppliers.map((supplier) => (
                        <div key={supplier.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-slate-900">{supplier.name}</h3>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{supplier.gstin || 'No GSTIN'}</p>
                                </div>
                                {userRole !== 'viewer' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(supplier)} className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => handleDelete(supplier.id)} className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div className="flex items-center gap-2 text-slate-500">
                                    <User className="h-3.5 w-3.5" />
                                    <span className="truncate">{supplier.contactPerson || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-blue-600 font-bold">
                                    <Phone className="h-3.5 w-3.5" />
                                    <span>{supplier.phone || 'N/A'}</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span className="leading-relaxed">{supplier.address || 'No address provided'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">
                                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="h-5 w-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier Name</label>
                                <input
                                    required
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">GSTIN</label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm uppercase"
                                        value={formData.gstin}
                                        onChange={e => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                    <input
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Person</label>
                                <input
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                    value={formData.contactPerson}
                                    onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Office Address</label>
                                <textarea
                                    rows="3"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {editingSupplier ? 'Update Changes' : 'Save Supplier'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
