import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Truck, Loader2, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { addTransporter, updateTransporter, deleteTransporter } from '../services/firestoreService';

export default function Transporters() {
    const { userRole } = useAuth();
    const [transporters, setTransporters] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingTransporter, setEditingTransporter] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '', phone: '', gstin: ''
    });

    useEffect(() => {
        const q = query(collection(db, 'transporters'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const transportersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTransporters(transportersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching transporters:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOpenModal = (transporter = null) => {
        if (transporter) {
            setEditingTransporter(transporter);
            setFormData({
                name: transporter.name,
                phone: transporter.phone || '',
                gstin: transporter.gstin || ''
            });
        } else {
            setEditingTransporter(null);
            setFormData({ name: '', phone: '', gstin: '' });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingTransporter(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // GSTIN Validation (15 digits uppercase alphanumeric)
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (formData.gstin && !gstinRegex.test(formData.gstin)) {
            alert("Please enter a valid 15-digit GSTIN format.");
            return;
        }

        try {
            if (editingTransporter) {
                await updateTransporter(editingTransporter.id, { ...formData, gstin: formData.gstin.toUpperCase() });
            } else {
                await addTransporter({ ...formData, gstin: formData.gstin.toUpperCase() });
            }
            handleCloseModal();
        } catch (error) {
            alert("Error saving transporter: " + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this transporter?")) {
            try {
                await deleteTransporter(id);
            } catch (error) {
                alert("Error deleting transporter: " + error.message);
            }
        }
    };

    const filteredTransporters = transporters.filter(t =>
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.phone?.includes(searchTerm) ||
        t.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Truck className="h-6 w-6 text-blue-600" />
                        Transporters
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Manage your transporter database</p>
                </div>
                {userRole !== 'viewer' && (
                    <button
                        onClick={() => handleOpenModal()}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 sm:py-2.5 rounded-lg font-medium transition-all shadow-md shadow-blue-500/20 active:scale-95"
                    >
                        <Plus className="h-4 w-4" />
                        Add Transporter
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

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Transporter Name</th>
                                <th className="px-6 py-4">GSTIN / Trans. ID</th>
                                <th className="px-6 py-4">Phone Number</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTransporters.map((transporter) => (
                                <tr key={transporter.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{transporter.name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">{transporter.gstin || 'No GSTIN'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Phone className="h-3 w-3 text-slate-400" /> {transporter.phone || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {userRole !== 'viewer' && (
                                            <div className="flex items-center justify-end gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenModal(transporter)} className="p-3 md:p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                    <Edit className="h-5 w-5 md:h-4 md:w-4" />
                                                </button>
                                                <button onClick={() => handleDelete(transporter.id)} className="p-3 md:p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredTransporters.length === 0 && (
                    <div className="p-12 text-center bg-white">
                        <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-slate-900 font-medium">No transporters found</h3>
                        <p className="text-slate-500 text-sm mt-1">Add your first transporter to get started.</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-bold text-lg text-slate-800">{editingTransporter ? 'Edit Transporter' : 'Add New Transporter'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-1 transition-colors">✕</button>
                        </div>
                        <div className="p-6">
                            <form className="space-y-4" onSubmit={handleSubmit}>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Transporter Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        placeholder="e.g., Express Logistics"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">GST Number / Transporter ID (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all uppercase font-mono"
                                        placeholder="15-digit GSTIN"
                                        value={formData.gstin}
                                        onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
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
                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={handleCloseModal} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                                    <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-500/30 transition-all">{editingTransporter ? 'Update' : 'Save'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
