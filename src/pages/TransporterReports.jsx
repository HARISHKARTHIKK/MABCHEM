import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import {
    Loader2, FileText, Calendar, Truck, TrendingUp, Download,
    AlertTriangle, FileJson, CreditCard, Plus, Trash2, History, X
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { addTransporterPayment, deleteTransporterPayment } from '../services/firestoreService';

export default function TransporterReports() {
    const [invoices, setInvoices] = useState([]);
    const [imports, setImports] = useState([]);
    const [localPurchases, setLocalPurchases] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // UI State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedTransporter, setSelectedTransporter] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        paymentMode: 'Bank Transfer',
        reference: ''
    });

    useEffect(() => {
        // Fetch transporters
        const qT = query(collection(db, 'transporters'));
        const unsubscribeT = onSnapshot(qT, (snapshot) => {
            const tData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransporters(tData);
        });

        // Fetch payments
        const qP = query(collection(db, 'transporterPayments'), orderBy('date', 'desc'));
        const unsubscribeP = onSnapshot(qP, (snapshot) => {
            const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPayments(pData);
        });

        // Fetch invoices (outgoing)
        const qI = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
        const unsubscribeI = onSnapshot(qI, (snapshot) => {
            const iData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'Dispatch',
                docDate: doc.data().createdAt?.toDate() || new Date(),
                docValue: Number(doc.data().totalAmount || doc.data().invoiceAmount) || 0,
                partyName: doc.data().customerName || '-',
                locationName: doc.data().fromLocation || '-',
                transporterId: doc.data().transporterId,
                transportationCost: Number(doc.data().transportationCost) || 0,
                transportPaymentType: doc.data().paymentType
            }));
            setInvoices(iData);
        });

        // Fetch Imports (incoming)
        const qImp = query(collection(db, 'imports'), orderBy('createdAt', 'desc'));
        const unsubscribeImp = onSnapshot(qImp, (snapshot) => {
            const impData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'Import',
                docDate: doc.data().createdAt?.toDate() || new Date(),
                docValue: Number(doc.data().totalPrice) || 0,
                partyName: doc.data().supplierName || '-',
                locationName: doc.data().location || '-',
                transporterId: doc.data().transporterId,
                transportationCost: Number(doc.data().transportCost) || 0,
                transportPaymentType: doc.data().transportPaymentType
            }));
            setImports(impData);
        });

        // Fetch Local Purchases (incoming)
        const qLoc = query(collection(db, 'localPurchases'), orderBy('createdAt', 'desc'));
        const unsubscribeLoc = onSnapshot(qLoc, (snapshot) => {
            const locData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'Local Purchase',
                docDate: doc.data().createdAt?.toDate() || new Date(),
                docValue: Number(doc.data().totalPrice) || 0,
                partyName: doc.data().supplierName || '-',
                locationName: doc.data().location || '-',
                transporterId: doc.data().transporterId,
                transportationCost: Number(doc.data().transportCost) || 0,
                transportPaymentType: doc.data().transportPaymentType
            }));
            setLocalPurchases(locData);
            setLoading(false);
        });

        return () => {
            unsubscribeT();
            unsubscribeP();
            unsubscribeI();
            unsubscribeImp();
            unsubscribeLoc();
        };
    }, []);

    const allRecords = [...invoices, ...imports, ...localPurchases];

    const filteredRecords = allRecords.filter(rec => {
        const recDate = rec.docDate;
        return isWithinInterval(recDate, {
            start: new Date(dateFilter.start),
            end: new Date(dateFilter.end + 'T23:59:59')
        });
    });

    const reportData = transporters.map(transporter => {
        const transporterRecords = filteredRecords.filter(rec => rec.transporterId === transporter.id);
        const count = transporterRecords.length;

        // ORIGINAL LOGIC RE-SYNC:
        // Sum transport costs where WE are responsible for payment (Old 'sumPaid')
        const sumPayableDocs = transporterRecords
            .filter(rec => {
                if (rec.type === 'Dispatch') return rec.transportPaymentType !== 'To Pay';
                return rec.transportPaymentType === 'Paid';
            })
            .reduce((sum, rec) => sum + (rec.transportationCost || 0), 0);

        // Sum transport costs that are strictly "To Pay" (Receiver pays / Pending liability)
        const sumToPayDocs = transporterRecords
            .filter(rec => {
                if (rec.type === 'Dispatch') return rec.transportPaymentType === 'To Pay';
                return rec.transportPaymentType === 'Payable';
            })
            .reduce((sum, rec) => sum + (rec.transportationCost || 0), 0);

        // Sum manual payments made to this transporter
        const totalManualPayments = payments
            .filter(p => p.transporterId === transporter.id)
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const balanceDue = sumPayableDocs - totalManualPayments;

        return {
            id: transporter.id,
            name: transporter.name,
            gstin: transporter.gstin,
            count,
            sumPayableDocs,
            sumToPayDocs,
            totalManualPayments,
            balanceDue,
            totalDocValue: transporterRecords.reduce((sum, rec) => sum + (rec.docValue || 0), 0)
        };
    }).filter(data => data.count > 0 || data.totalManualPayments > 0);

    const handleAddPayment = async (e) => {
        e.preventDefault();

        const tId = selectedTransporter?.id || paymentForm.transporterId;
        const tName = selectedTransporter?.name || paymentForm.transporterName;

        if (!tId || !paymentForm.amount) {
            alert("Please select a transporter and enter an amount.");
            return;
        }

        setIsSaving(true);
        try {
            await addTransporterPayment({
                transporterId: tId,
                transporterName: tName,
                amount: paymentForm.amount,
                date: paymentForm.date,
                paymentMode: paymentForm.paymentMode,
                reference: paymentForm.reference
            });
            setIsPaymentModalOpen(false);
            setPaymentForm({
                amount: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                paymentMode: 'Bank Transfer',
                reference: '',
                transporterId: '',
                transporterName: ''
            });
        } catch (error) {
            alert("Error adding payment: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeletePayment = async (id) => {
        if (!window.confirm("Are you sure you want to delete this payment record?")) return;
        try {
            await deleteTransporterPayment(id);
        } catch (error) {
            alert("Error deleting payment: " + error.message);
        }
    };

    const handleJsonExport = (rec) => {
        const transporter = transporters.find(t => t.id === rec.transporterId);
        const gstin = rec.transporterGSTIN || transporter?.gstin;

        if (!gstin) {
            alert(`Missing GSTIN for ${rec.transporterName}. e-Way bill cannot be generated without a Transporter ID.`);
            return;
        }

        const eWayBillData = {
            version: "1.0.0421",
            billLists: [
                {
                    userGstin: "YOUR_COMPANY_GSTIN",
                    supplyType: rec.type === 'Dispatch' ? "O" : "I",
                    subSupplyType: "1",
                    docType: "INV",
                    docNo: rec.docNo,
                    docDate: format(rec.docDate, 'dd/MM/yyyy'),
                    fromGstin: "YOUR_COMPANY_GSTIN",
                    fromTrdName: "YOUR_COMPANY_NAME",
                    toGstin: rec.partyName === 'Local Purchase' ? "YOUR_COMPANY_GSTIN" : "CUSTOMER_GSTIN",
                    toTrdName: rec.partyName,
                    totalValue: rec.docValue,
                    cgstValue: (rec.docValue * 0.09),
                    sgstValue: (rec.docValue * 0.18), // Correcting the split mapping
                    igstValue: 0,
                    totInvValue: rec.docValue * 1.18,
                    transporterId: gstin,
                    transMode: "1",
                    transDistance: "0",
                    transporterName: rec.transporterName,
                    vehicleNo: rec.vehicleNumber || "",
                    vehicleType: "R",
                    itemList: [
                        {
                            productName: "Goods",
                            productDesc: "Goods",
                            hsnCode: "0000",
                            quantity: 1,
                            qtyUnit: "MTS",
                            taxableAmount: rec.docValue,
                            cgstRate: 9,
                            sgstRate: 9,
                            igstRate: 0,
                        }
                    ]
                }
            ]
        };

        const blob = new Blob([JSON.stringify(eWayBillData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `eWayBill_${rec.docNo}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExcelExport = () => {
        const data = filteredRecords.map(rec => {
            return {
                'Date': format(rec.docDate, 'dd-MM-yyyy'),
                'Type': rec.type,
                'Reference ID': rec.invoiceNo || rec.beNumber || rec.id,
                'Party (Supplier/Customer)': rec.partyName,
                'Location': rec.locationName,
                'Transporter Name': rec.transporterName || '-',
                'Transporter GSTIN': rec.transporterGSTIN || '-',
                'Vehicle Number': rec.vehicleNumber || '-',
                'Document Value': rec.docValue || 0,
                'Transportation Cost': rec.transportationCost || 0,
                'Transport Payment': rec.transportPaymentType || '-',
                'LR Number': rec.lrNumber || '-'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Logistics Report");
        XLSX.writeFile(workbook, `Transporter_Report_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
    };

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    const totalPayableBase = reportData.reduce((sum, d) => sum + d.sumPayableDocs, 0);
    const totalManualPaid = reportData.reduce((sum, d) => sum + d.totalManualPayments, 0);
    const totalToPayDocs = reportData.reduce((sum, d) => sum + d.sumToPayDocs, 0);
    const totalDocVal = reportData.reduce((sum, d) => sum + d.totalDocValue, 0);
    const netBalanceDue = totalPayableBase - totalManualPaid;

    return (
        <div className="space-y-6 animate-fade-in-up pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                        Transporter Reports
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Unified logistics summary & Payment tracking</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleExcelExport}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 sm:py-2.5 rounded-lg font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 text-xs"
                    >
                        <Download className="h-4 w-4" />
                        Export Detailed
                    </button>

                    <button
                        onClick={() => { setSelectedTransporter(null); setIsPaymentModalOpen(true); }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 sm:py-2.5 rounded-lg font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 text-xs"
                    >
                        <Plus className="h-4 w-4" />
                        Record Payment
                    </button>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm w-full sm:w-auto">
                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                            <Calendar className="h-4 w-4 text-slate-400 ml-2" />
                            <input
                                type="date"
                                value={dateFilter.start}
                                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                                className="text-xs md:text-sm border-none focus:ring-0 p-1 bg-transparent w-full"
                            />
                        </div>
                        <span className="text-slate-400 text-xs text-center">to</span>
                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                            <input
                                type="date"
                                value={dateFilter.end}
                                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                                className="text-xs md:text-sm border-none focus:ring-0 p-1 bg-transparent w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-blue-50 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Total Trips</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-slate-900">{filteredRecords.length}</p>
                </div>
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-indigo-50 rounded-lg"><TrendingUp className="h-5 w-5 text-indigo-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Trans. Payable</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-indigo-600">₹{netBalanceDue.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-orange-50 rounded-lg"><Truck className="h-5 w-5 text-orange-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Trans. To Pay</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-orange-600">₹{totalToPayDocs.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-emerald-50 rounded-lg"><FileText className="h-5 w-5 text-emerald-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Total Doc Value</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-emerald-600">₹{totalDocVal.toLocaleString('en-IN')}</p>
                </div>
            </div>

            {/* Summary Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Transporter Ledger Summary</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[900px]">
                        <thead className="bg-slate-50/50 text-slate-700 font-semibold uppercase text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Transporter Name</th>
                                <th className="px-6 py-4">Trips</th>
                                <th className="px-6 py-4 text-emerald-600">Sum of Doc Value</th>
                                <th className="px-6 py-4 text-indigo-600">Sum of Trans. Payable</th>
                                <th className="px-6 py-4 text-orange-600">Sum of Trans. To-Pay</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {reportData.map((data, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{data.name}</div>
                                        <div className="text-[10px] font-mono text-slate-400 font-bold">{data.gstin || 'NO GSTIN'}</div>
                                    </td>
                                    <td className="px-6 py-4">{data.count}</td>
                                    <td className="px-6 py-4 text-emerald-600 font-bold">₹{data.totalDocValue.toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-indigo-600 font-medium">₹{data.balanceDue.toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-orange-600 font-medium">₹{data.sumToPayDocs.toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => { setSelectedTransporter(data); setIsPaymentModalOpen(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-all"
                                                title="Add Payment"
                                            >
                                                <Plus className="h-3.5 w-3.5" /> Pay
                                            </button>
                                            <button
                                                onClick={() => { setSelectedTransporter(data); setIsHistoryModalOpen(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold transition-all"
                                                title="Payment History"
                                            >
                                                <History className="h-3.5 w-3.5" /> History
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Detailed Logistics Records</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[1000px]">
                        <thead className="bg-slate-50/50 text-slate-700 font-semibold uppercase text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Party (Supplier/Customer)</th>
                                <th className="px-6 py-4">Location</th>
                                <th className="px-6 py-4">Transporter</th>
                                <th className="px-6 py-4 text-right">Doc Value</th>
                                <th className="px-6 py-4 text-right">Trans. Cost</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-center">Export</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRecords.sort((a, b) => b.docDate - a.docDate).map((rec, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">{format(rec.docDate, 'dd-MM-yyyy')}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${rec.type === 'Dispatch' ? 'bg-blue-50 text-blue-600' :
                                            rec.type === 'Import' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                                            }`}>
                                            {rec.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-900">{rec.partyName}</td>
                                    <td className="px-6 py-4">{rec.locationName}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{rec.transporterName || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900">₹{rec.docValue.toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-right font-medium text-indigo-600">{rec.transportationCost ? `₹${rec.transportationCost.toLocaleString('en-IN')}` : '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${(rec.type === 'Dispatch' && rec.transportPaymentType === 'To Pay') ||
                                            (rec.type !== 'Dispatch' && rec.transportPaymentType === 'Payable')
                                            ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                            {rec.transportPaymentType || 'Paid'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => handleJsonExport(rec)}
                                            title="Export JSON for e-Way Bill"
                                            className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                                        >
                                            <FileJson className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-xl"><Plus className="h-5 w-5 text-blue-600" /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Record Payment</h3>
                                    <p className="text-xs text-slate-500">{selectedTransporter?.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><X className="h-5 w-5 text-slate-400" /></button>
                        </div>

                        <form onSubmit={handleAddPayment} className="space-y-4">
                            {!selectedTransporter && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Select Transporter</label>
                                    <select
                                        required
                                        className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        value={paymentForm.transporterId || ''}
                                        onChange={e => {
                                            const t = transporters.find(trans => trans.id === e.target.value);
                                            setPaymentForm({ ...paymentForm, transporterId: e.target.value, transporterName: t?.name });
                                        }}
                                    >
                                        <option value="">Choose Transporter...</option>
                                        {transporters.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Payment Amount (₹)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="Enter amount"
                                    value={paymentForm.amount}
                                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Payment Date</label>
                                <input
                                    type="date"
                                    required
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={paymentForm.date}
                                    onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Payment Mode</label>
                                <select
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={paymentForm.paymentMode}
                                    onChange={e => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                                >
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="UPI">UPI</option>
                                    <option value="TDS">TDS Deduction</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Reference / Remarks</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Chq No, Transaction ID"
                                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    value={paymentForm.reference}
                                    onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4 mx-auto" /> : 'Confirm Payment'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 rounded-xl"><History className="h-5 w-5 text-indigo-600" /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Payment History</h3>
                                    <p className="text-xs text-slate-500">{selectedTransporter?.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><X className="h-5 w-5 text-slate-400" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-widest">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Mode</th>
                                        <th className="px-4 py-3">Reference</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {payments.filter(p => p.transporterId === selectedTransporter?.id).length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="py-10 text-center text-slate-400 italic">No payments recorded yet.</td>
                                        </tr>
                                    ) : (
                                        payments.filter(p => p.transporterId === selectedTransporter?.id).map((p, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 whitespace-nowrap">{format(new Date(p.date), 'dd MMM yyyy')}</td>
                                                <td className="px-4 py-3">
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{p.paymentMode}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">{p.reference || '-'}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => handleDeletePayment(p.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                            <div className="text-xs text-slate-400 uppercase tracking-widest font-black">Total Manual Payments</div>
                            <div className="text-lg font-bold text-indigo-600">
                                ₹{payments.filter(p => p.transporterId === selectedTransporter?.id).reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('en-IN')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
