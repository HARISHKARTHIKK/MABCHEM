import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Truck, Calendar, MapPin, Search, Loader2, Download, User, FileText } from 'lucide-react';
import { format, startOfDay, eachDayOfInterval, isSameDay } from 'date-fns';
import { exportToExcel } from '../utils/exportToExcel';

export default function Dispatch() {
    const [dispatches, setDispatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        // Query dispatches
        const q = query(collection(db, 'dispatches'), orderBy('createdAt', 'desc'), limit(1000));

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
                (d.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.location || '').toLowerCase().includes(searchTerm.toLowerCase());

            const dispDate = d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : (d.date ? new Date(d.date) : null);
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

    const handleExport = () => {
        const dataToExport = filteredDispatches.map(disp => ({
            'Date': disp.createdAt?.seconds ? format(new Date(disp.createdAt.seconds * 1000), 'dd MMM yyyy, h:mm a') : '-',
            'Invoice No': disp.invoiceNo,
            'Customer': disp.customerName || '-',
            'Product': disp.productName,
            'Origin': disp.location,
            'Quantity (mts)': (Number(disp.quantity) || 0).toFixed(1),
            'Vehicle Number': disp.vehicleNumber || disp.transport?.vehicleNumber || '-',
            'Transport Mode': disp.transport?.mode || '-',
            'LR Number': disp.transport?.lrNumber || '-',
            'LR Date': disp.transport?.date || '-'
        }));
        exportToExcel(`Dispatch_Log_${format(new Date(), 'dd_MMM_yyyy')}.xlsx`, dataToExport);
    };

    // Calculate the range of days to display
    const getDaysRange = () => {
        if (filteredDispatches.length === 0 && !startDate && !endDate) return [];

        let start, end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else if (filteredDispatches.length > 0) {
            const dates = filteredDispatches.map(d => d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000) : null).filter(Boolean);
            start = new Date(Math.min(...dates));
            end = new Date(Math.max(...dates));
        } else {
            return [];
        }

        try {
            const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
            return days.sort((a, b) => b - a); // Descending
        } catch (e) {
            return [];
        }
    };

    const daysToDisplay = getDaysRange();

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
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm active:scale-95"
                >
                    <Download className="h-4 w-4" />
                    Export Excel
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-250px)]">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white shrink-0">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search invoice, customer, product, location..."
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

                {/* Desktop Table with Fixed Header */}
                <div className="hidden lg:block overflow-auto flex-1 relative">
                    <table className="w-full text-left text-sm text-slate-600 border-separate border-spacing-0">
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-slate-50 text-slate-700 font-semibold uppercase text-[11px] tracking-wider shadow-sm">
                                <th className="px-6 py-4 border-b border-slate-100">Date</th>
                                <th className="px-6 py-4 border-b border-slate-100">Invoice No</th>
                                <th className="px-6 py-4 border-b border-slate-100">Customer</th>
                                <th className="px-6 py-4 border-b border-slate-100">Product</th>
                                <th className="px-6 py-4 border-b border-slate-100">Origin</th>
                                <th className="px-6 py-4 border-b border-slate-100 text-right">Qty (mts)</th>
                                <th className="px-6 py-4 border-b border-slate-100">Transport</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {daysToDisplay.map(day => {
                                const dayItems = filteredDispatches.filter(d =>
                                    d.createdAt?.seconds && isSameDay(new Date(d.createdAt.seconds * 1000), day)
                                );

                                if (dayItems.length === 0) {
                                    return (
                                        <tr key={day.toISOString()} className="bg-slate-50/20">
                                            <td className="px-6 py-4 italic text-slate-400 font-medium" colSpan="7">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {format(day, 'dd MMM yyyy')} - No dispatch items
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return dayItems.map((disp, idx) => (
                                    <tr key={disp.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                                            {idx === 0 ? (
                                                <span className="font-bold text-slate-700">{format(new Date(disp.createdAt.seconds * 1000), 'dd MMM yyyy')}</span>
                                            ) : (
                                                <span className="text-[10px] text-slate-300">{format(new Date(disp.createdAt.seconds * 1000), 'h:mm a')}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono font-medium text-blue-600">
                                            {disp.invoiceNo}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <User className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="font-medium text-slate-900 truncate max-w-[200px]" title={disp.customerName}>
                                                    {disp.customerName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {disp.productName}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black uppercase text-slate-600 w-fit">
                                                <MapPin className="h-3 w-3" />
                                                {disp.location}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="font-black text-slate-900">{(Number(disp.quantity) || 0).toFixed(1)}</div>
                                            <div className="text-[9px] text-slate-400 font-bold uppercase">MTS</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs space-y-0.5">
                                                {(disp.vehicleNumber || disp.transport?.vehicleNumber) ? (
                                                    <div className="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{disp.vehicleNumber || disp.transport.vehicleNumber}</div>
                                                ) : (
                                                    <span className="text-slate-300 italic text-[10px]">No Vehicle</span>
                                                )}
                                                {disp.transport?.mode && <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{disp.transport.mode}</div>}
                                            </div>
                                        </td>
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden divide-y divide-slate-100 overflow-y-auto flex-1">
                    {daysToDisplay.map(day => {
                        const dayItems = filteredDispatches.filter(d =>
                            d.createdAt?.seconds && isSameDay(new Date(d.createdAt.seconds * 1000), day)
                        );

                        if (dayItems.length === 0) {
                            return (
                                <div key={day.toISOString()} className="p-4 bg-slate-50/30 text-slate-400 text-xs italic flex items-center gap-2">
                                    <Calendar className="h-3 w-3" />
                                    {format(day, 'dd MMM yyyy')} - No dispatches
                                </div>
                            );
                        }

                        return dayItems.map((disp) => (
                            <div key={disp.id} className="p-4 bg-white flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <div className="font-mono font-bold text-slate-900">{disp.invoiceNo}</div>
                                            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-tighter uppercase">{disp.location}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-tight">
                                            {format(new Date(disp.createdAt.seconds * 1000), 'dd MMM yyyy, h:mm a')}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-indigo-600">{(Number(disp.quantity) || 0).toFixed(1)} mts</div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{disp.productName}</div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <User className="h-3 w-3 text-slate-400 shrink-0" />
                                        <div className="text-[11px] font-bold text-slate-700 truncate" title={disp.customerName}>{disp.customerName}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[10px] font-bold text-slate-600">
                                            {disp.vehicleNumber || disp.transport?.vehicleNumber || 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ));
                    })}
                </div>
            </div>
        </div>
    );
}
