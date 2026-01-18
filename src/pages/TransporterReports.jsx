import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { Loader2, FileText, Calendar, Truck, TrendingUp, Download, AlertTriangle, FileJson } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

export default function TransporterReports() {
    const [invoices, setInvoices] = useState([]);
    const [imports, setImports] = useState([]);
    const [localPurchases, setLocalPurchases] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    useEffect(() => {
        // Fetch transporters
        const qT = query(collection(db, 'transporters'));
        const unsubscribeT = onSnapshot(qT, (snapshot) => {
            const tData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransporters(tData);
        });

        // Fetch invoices (outgoing)
        const qI = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
        const unsubscribeI = onSnapshot(qI, (snapshot) => {
            const iData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'Dispatch',
                docDate: doc.data().createdAt?.toDate() || new Date(),
                docValue: Number(doc.data().invoiceAmount) || 0,
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

        // Sum transportation costs
        // For Outward (Dispatch): 'To Pay' is pending. 'Payable' is often pre-arranged or paid via account.
        // For Inward (Import/Local): 'Payable' is pending. 'Paid' is already settled.
        const sumPaid = transporterRecords
            .filter(rec => {
                if (rec.type === 'Dispatch') return rec.transportPaymentType !== 'To Pay';
                return rec.transportPaymentType === 'Paid';
            })
            .reduce((sum, rec) => sum + (rec.transportationCost || 0), 0);

        const sumToPay = transporterRecords
            .filter(rec => {
                if (rec.type === 'Dispatch') return rec.transportPaymentType === 'To Pay';
                return rec.transportPaymentType === 'Payable';
            })
            .reduce((sum, rec) => sum + (rec.transportationCost || 0), 0);

        // Sum document values
        const totalDocValue = transporterRecords.reduce((sum, rec) => sum + (rec.docValue || 0), 0);

        return {
            name: transporter.name,
            gstin: transporter.gstin,
            count,
            sumPaid,
            sumToPay,
            totalDocValue
        };
    }).filter(data => data.count > 0);

    const handleJsonExport = (rec) => {
        const transporter = transporters.find(t => t.id === rec.transporterId);
        const gstin = rec.transporterGSTIN || transporter?.gstin;

        if (!gstin) {
            alert(`Missing GSTIN for ${rec.transporterName}. e-Way bill cannot be generated without a Transporter ID.`);
            return;
        }

        // NIC e-Way Bill JSON Format (Basic Schema)
        const eWayBillData = {
            version: "1.0.0421",
            billLists: [
                {
                    userGstin: "YOUR_COMPANY_GSTIN", // Should ideally come from settings
                    supplyType: rec.type === 'Dispatch' ? "O" : "I",
                    subSupplyType: "1",
                    docType: "INV",
                    docNo: rec.docNo,
                    docDate: format(rec.docDate, 'dd/MM/yyyy'),
                    fromGstin: "YOUR_COMPANY_GSTIN", // Placeholder
                    fromTrdName: "YOUR_COMPANY_NAME", // Placeholder
                    toGstin: rec.partyName === 'Local Purchase' ? "YOUR_COMPANY_GSTIN" : "CUSTOMER_GSTIN", // Placeholder
                    toTrdName: rec.partyName,
                    totalValue: rec.docValue,
                    cgstValue: (rec.docValue * 0.09), // Placeholder 18% split
                    sgstValue: (rec.docValue * 0.09),
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
                'Document Value': rec.docValue || 0,
                'Transportation Cost': rec.transportationCost || 0,
                'Transport Payment': rec.transportPaymentType || '-'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Logistics Report");
        XLSX.writeFile(workbook, `Transporter_Report_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
    };

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                        Transporter Reports
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Unified logistics summary for Purchases & Sales</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExcelExport}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 sm:py-2.5 rounded-lg font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 text-xs"
                    >
                        <Download className="h-4 w-4" />
                        Export Detailed
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
                    <p className="text-2xl md:text-3xl font-bold text-indigo-600">₹{reportData.reduce((sum, d) => sum + d.sumPaid, 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-orange-50 rounded-lg"><Truck className="h-5 w-5 text-orange-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Trans. To Pay</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-orange-600">₹{reportData.reduce((sum, d) => sum + d.sumToPay, 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-2 md:mb-4">
                        <div className="p-2 bg-emerald-50 rounded-lg"><FileText className="h-5 w-5 text-emerald-600" /></div>
                        <h3 className="font-semibold text-slate-700 text-sm">Total Doc Value</h3>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-emerald-600">₹{reportData.reduce((sum, d) => sum + d.totalDocValue, 0).toLocaleString()}</p>
                </div>
            </div>

            {/* Summary Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Transporter Performance Summary</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                        <thead className="bg-slate-50/50 text-slate-700 font-semibold uppercase text-[10px] tracking-widest">
                            <tr>
                                <th className="px-6 py-4">Transporter Name</th>
                                <th className="px-6 py-4">Count of Trips</th>
                                <th className="px-6 py-4 text-emerald-600">Sum of Doc Value</th>
                                <th className="px-6 py-4 text-indigo-600">Sum of Transport Payable</th>
                                <th className="px-6 py-4 text-orange-600">Sum of Transport To-Pay</th>
                                <th className="px-6 py-4 text-right">Total Business</th>
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
                                    <td className="px-6 py-4 text-emerald-600 font-bold">₹{data.totalDocValue.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-indigo-600 font-medium">₹{data.sumPaid.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-orange-600 font-medium">₹{data.sumToPay.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900">₹{(data.sumPaid + data.sumToPay).toLocaleString()}</td>
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
                                        <div className="text-[9px] font-mono text-slate-400">
                                            {rec.transporterGSTIN || transporters.find(t => t.id === rec.transporterId)?.gstin || (
                                                <span className="text-amber-500 font-bold flex items-center gap-1">
                                                    <AlertTriangle className="h-2 w-2" /> GSTIN MISSING
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900">₹{rec.docValue.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-medium text-indigo-600">{rec.transportationCost ? `₹${rec.transportationCost.toLocaleString()}` : '-'}</td>
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

                {filteredRecords.length === 0 && (
                    <div className="p-12 text-center bg-white">
                        <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <h3 className="text-slate-900 font-medium">No records found</h3>
                        <p className="text-slate-500 text-sm mt-1">Check your date filters or add new entries with transporter info.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
