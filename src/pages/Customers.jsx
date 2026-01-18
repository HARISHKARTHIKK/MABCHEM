import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Trash2, Users, Loader2, Mail, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { addCustomer, updateCustomer, deleteCustomer } from '../services/firestoreService';

export default function Customers() {
    const { userRole } = useAuth();
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingCustomer, setEditingCustomer] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '', gstin: '', email: '', phone: '', address: ''
    });

    useEffect(() => {
        const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const customersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setCustomers(customersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching customers:", error);
            // Don't leave the user stuck on loading
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOpenModal = (customer = null) => {
        if (customer) {
            setEditingCustomer(customer);
            setFormData({
                name: customer.name,
                gstin: customer.gstin,
                email: customer.email,
                phone: customer.phone,
                address: customer.address
            });
        } else {
            setEditingCustomer(null);
            setFormData({ name: '', gstin: '', email: '', phone: '', address: '' });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingCustomer(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCustomer) {
                await updateCustomer(editingCustomer.id, formData);
            } else {
                await addCustomer(formData);
            }
            handleCloseModal();
        } catch (error) {
            alert("Error saving customer: " + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this customer?")) {
            try {
                await deleteCustomer(id);
            } catch (error) {
                alert("Error deleting customer: " + error.message);
            }
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.gstin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm)
    );

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-600" />
                        Customers
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage your customer database</p>
                </div>
                {userRole !== 'viewer' && (
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-md shadow-blue-500/20 active:scale-95"
                    >
                        <Plus className="h-4 w-4" />
                        Add Customer
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, phone, GSTIN..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Customer Details</th>
                                <th className="px-6 py-4">Contact Info</th>
                                <th className="px-6 py-4">GSTIN / Address</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCustomers.map((customer) => (
                                <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{customer.name}</div>
                                        <div className="text-xs text-slate-500">ID: {customer.id.slice(0, 8)}...</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            {customer.email && (
                                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                                    <Mail className="h-3 w-3 text-slate-400" /> {customer.email}
                                                </div>
                                            )}
                                            {customer.phone && (
                                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                                    <Phone className="h-3 w-3 text-slate-400" /> {customer.phone}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded w-fit">{customer.gstin || 'N/A'}</span>
                                            {customer.address && (
                                                <div className="flex items-start gap-1 text-xs text-slate-500 max-w-[200px] truncate">
                                                    <MapPin className="h-3 w-3 text-slate-400 mt-0.5 flex-shrink-0" /> {customer.address}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {userRole !== 'viewer' && (
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenModal(customer)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(customer.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
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
                <div className="sm:hidden divide-y divide-slate-100">
                    {filteredCustomers.map((customer) => (
                        <div key={customer.id} className="p-4 bg-white flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h4 className="font-bold text-slate-900 leading-tight">{customer.name}</h4>
                                    <div className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 w-fit uppercase tracking-wider">
                                        GST: {customer.gstin || 'N/A'}
                                    </div>
                                </div>
                                {userRole !== 'viewer' && (
                                    <div className="flex gap-2">
                                        <button onClick={() => handleOpenModal(customer)} className="p-2 text-blue-600 bg-blue-50 rounded-lg active:scale-90 transition-transform"><Edit className="h-4 w-4" /></button>
                                        <button onClick={() => handleDelete(customer.id)} className="p-2 text-red-500 bg-red-50 rounded-lg active:scale-90 transition-transform"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center gap-2 text-slate-600 bg-slate-50/50 p-1.5 rounded truncate"><Phone className="h-3 w-3 text-slate-400" /> {customer.phone || '-'}</div>
                                <div className="flex items-center gap-2 text-slate-600 bg-slate-50/50 p-1.5 rounded truncate"><Mail className="h-3 w-3 text-slate-400" /> {customer.email || '-'}</div>
                            </div>
                            {customer.address && (
                                <div className="text-[11px] text-slate-500 flex items-start gap-1.5 p-2 bg-slate-50 rounded border border-slate-100/50">
                                    <MapPin className="h-3 w-3 mt-0.5 text-slate-400 flex-shrink-0" /> {customer.address}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {filteredCustomers.length === 0 && (
                    <div className="p-12 text-center bg-white">
                        <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-slate-900 font-medium">No customers found</h3>
                        <p className="text-slate-500 text-sm mt-1">Add your first customer to get started.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-lg text-slate-800">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-1 transition-colors">✕</button>
                        </div>
                        <div className="p-6">
                            <form className="space-y-4" onSubmit={handleSubmit}>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Customer Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="e.g., John Doe Enterprises"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">GSTIN</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="GST Number"
                                            value={formData.gstin}
                                            onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700">Phone</label>
                                        <input
                                            type="tel"
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            placeholder="Phone Number"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Email</label>
                                    <input
                                        type="email"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="email@example.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Address</label>
                                    <textarea
                                        rows="3"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                                        placeholder="Full Billing Address"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={handleCloseModal} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                                    <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-500/30 transition-all">{editingCustomer ? 'Update Customer' : 'Save Customer'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
