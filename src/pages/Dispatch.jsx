import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Truck, Calendar, MapPin, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Dispatch() {
    const [dispatches, setDispatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        // Query dispatches
        const q = query(collection(db, 'dispatches'), orderBy('createdAt', 'desc'), limit(200));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDispatches(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching dispatches:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filteredDispatches = dispatches
        .filter(d => {
            const matchesSearch =
                (d.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.invoiceNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.location || '').toLowerCase().includes(searchTerm.toLowerCase());

            const dispDate = d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : null;
            let matchesDate = true;

            if (dispDate) {
                if (startDate) {
                    const s = new Date(startDate);
                    s.setHours(0, 0, 0, 0);
                    if (dispDate < s) matchesDate = false;
                }
                if (endDate) {
                    const e = new Date(endDate);
                    e.setHours(23, 59, 59, 999);
                    if (dispDate > e) matchesDate = false;
                }
            }

            return matchesSearch && matchesDate;
        })
        .sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Truck className="h-6 w-6 text-blue-600" />
                        Dispatch Log
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Track all inventory dispatches via invoices</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search invoice, product, location..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <input
                                type="date"
                                className="outline-none text-sm text-slate-600 bg-transparent"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                            <span className="text-slate-300 text-xs text-center px-1">to</span>
                            <input
                                type="date"
                                className="outline-none text-sm text-slate-600 bg-transparent"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        {(startDate || endDate) && (
                            <button
                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Invoice No</th>
                                <th className="px-6 py-4">Product</th>
                                <th className="px-6 py-4">Origin</th>
                                <th className="px-6 py-4 text-right">Quantity (mts)</th>
                                <th className="px-6 py-4">Transport</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredDispatches.map((disp) => (
                                <tr key={disp.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                                        {disp.createdAt?.seconds ? format(new Date(disp.createdAt.seconds * 1000), 'dd MMM yyyy, h:mm a') : '-'}
                                    </td>
                                    <td className="px-6 py-4 font-mono font-medium text-slate-700">
                                        {disp.invoiceNo}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {disp.productName}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-600 w-fit">
                                            <MapPin className="h-3 w-3" />
                                            {disp.location}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-800">
                                        {(Number(disp.quantity) || 0).toFixed(1)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-xs space-y-1">
                                            {(disp.vehicleNumber || disp.transport?.vehicleNumber) ? (
                                                <div className="font-semibold text-slate-700">{disp.vehicleNumber || disp.transport.vehicleNumber}</div>
                                            ) : (
                                                <span className="text-slate-400 italic">No Vehicle Info</span>
                                            )}
                                            {disp.transport?.mode && <div className="text-slate-500">{disp.transport.mode}</div>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden divide-y divide-slate-100">
                    {filteredDispatches.map((disp) => (
                        <div key={disp.id} className="p-4 bg-white flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="font-mono font-bold text-slate-900">{disp.invoiceNo}</div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-tight">
                                        {disp.createdAt?.seconds ? format(new Date(disp.createdAt.seconds * 1000), 'dd MMM yyyy, h:mm a') : '-'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-indigo-600">{(Number(disp.quantity) || 0).toFixed(1)} mts</div>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase mt-1">
                                        <MapPin className="h-2 w-2" /> {disp.location}
                                    </span>
                                </div>
                            </div>

                            <div className="flex justify-between items-end pt-2 border-t border-slate-50">
                                <div className="font-medium text-slate-800 text-sm">{disp.productName}</div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Vehicle</div>
                                    <div className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                        {disp.vehicleNumber || disp.transport?.vehicleNumber || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
