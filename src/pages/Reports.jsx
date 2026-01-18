import { useState } from 'react';
import { BarChart3, FileSpreadsheet, Calendar, Download, CheckSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

export default function Reports() {
    const [dateRange, setDateRange] = useState('month'); // month, year, custom
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [reportType, setReportType] = useState('both'); // 'inventory', 'invoices', 'both'

    // Auto-set dates based on preset
    const handlePresetChange = (preset) => {
        setDateRange(preset);
        const now = new Date();
        if (preset === 'month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(format(firstDay, 'yyyy-MM-dd'));
            setEndDate(format(now, 'yyyy-MM-dd'));
        } else if (preset === 'year') {
            const firstDay = new Date(now.getFullYear(), 0, 1);
            setStartDate(format(firstDay, 'yyyy-MM-dd'));
            setEndDate(format(now, 'yyyy-MM-dd'));
        }
    };

    const generateReport = async () => {
        if (!startDate || !endDate) {
            alert("Please select a valid date range.");
            return;
        }

        setLoading(true);
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // Include entire end day

            const wb = XLSX.utils.book_new();
            let hasData = false;

            // --- 1. INVENTORY REPORT ---
            if (reportType === 'inventory' || reportType === 'both') {
                const productsSnap = await getDocs(collection(db, 'products'));
                const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                const inventoryData = [];

                products.forEach(p => {
                    const locations = p.locations || {};
                    const locEntries = Object.entries(locations);

                    if (locEntries.length > 0) {
                        locEntries.forEach(([loc, qty]) => {
                            inventoryData.push({
                                'Product Name': p.name,
                                'Location': loc,
                                'Stock Quantity (mts)': Number(qty) || 0,
                                'Stock Status': (Number(qty) || 0) < (p.lowStockThreshold || 10) ? 'Low Stock' : 'In Stock',
                                'Last Updated': p.updatedAt?.seconds ? format(new Date(p.updatedAt.seconds * 1000), 'dd-MM-yyyy') : '-'
                            });
                        });
                    } else {
                        // Fallback for products with no location data yet
                        inventoryData.push({
                            'Product Name': p.name,
                            'Location': 'Unassigned',
                            'Stock Quantity (mts)': Number(p.stockQty) || 0,
                            'Stock Status': (Number(p.stockQty) || 0) < (p.lowStockThreshold || 10) ? 'Low Stock' : 'In Stock',
                            'Last Updated': p.updatedAt?.seconds ? format(new Date(p.updatedAt.seconds * 1000), 'dd-MM-yyyy') : '-'
                        });
                    }
                });

                const wsInventory = XLSX.utils.json_to_sheet(inventoryData);
                const wscolsInv = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
                wsInventory['!cols'] = wscolsInv;
                XLSX.utils.book_append_sheet(wb, wsInventory, "Inventory");
                hasData = true;
            }

            // --- 2. INVOICES REPORT ---
            if (reportType === 'invoices' || reportType === 'both') {
                const qInvoices = query(
                    collection(db, 'invoices'),
                    where('createdAt', '>=', Timestamp.fromDate(start)),
                    where('createdAt', '<=', Timestamp.fromDate(end))
                );
                const invoicesSnap = await getDocs(qInvoices);
                const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                const customersSnap = await getDocs(collection(db, 'customers'));
                const customersMap = {};
                customersSnap.docs.forEach(d => {
                    customersMap[d.id] = d.data();
                });

                const invoiceRows = [];

                invoices.forEach(inv => {
                    const cust = customersMap[inv.customerId] || {};
                    const items = inv.itemsSummary || [];

                    // If itemsSummary is empty (old data), try to use legacy fields or show 1 row
                    if (items.length > 0) {
                        items.forEach(item => {
                            invoiceRows.push({
                                'Invoice Number': inv.invoiceNo,
                                'Invoice Date': inv.createdAt?.seconds ? format(new Date(inv.createdAt.seconds * 1000), 'dd-MM-yyyy') : '-',
                                'Customer Name': inv.customerName,
                                'Product Name': item.productName || item.name || 'Unknown',
                                'Quantity (mts)': Number(item.quantity) || 0,
                                'Price': Number(item.price) || 0,
                                'Customer GSTIN': cust.gstin || '',
                                'Transporter GSTIN': inv.transporterGSTIN || '',
                                'Transport Amount': inv.transport?.amount || inv.transportationCost || 0,
                                'Vehicle Number': inv.transport?.vehicleNumber || inv.vehicleNumber || '-',
                                'Taxable Value': (Number(item.quantity) * Number(item.price)) || 0, // Approx line value
                                'Invoice Total Amount': Number(inv.totalAmount) || 0
                            });
                        });
                    } else {
                        // Fallback for old invoices without itemsSummary
                        invoiceRows.push({
                            'Invoice Number': inv.invoiceNo,
                            'Invoice Date': inv.createdAt?.seconds ? format(new Date(inv.createdAt.seconds * 1000), 'dd-MM-yyyy') : '-',
                            'Customer Name': inv.customerName,
                            'Product Name': 'Multiple/Legacy',
                            'Quantity (mts)': 0,
                            'Price': 0,
                            'Customer GSTIN': cust.gstin || '',
                            'Transporter GSTIN': inv.transporterGSTIN || '',
                            'Transport Amount': inv.transport?.amount || inv.transportationCost || 0,
                            'Vehicle Number': inv.transport?.vehicleNumber || inv.vehicleNumber || '-',
                            'Taxable Value': Number(inv.subtotal) || 0,
                            'Invoice Total Amount': Number(inv.totalAmount) || 0
                        });
                    }
                });

                const wsInvoices = XLSX.utils.json_to_sheet(invoiceRows);
                const wscolsInv2 = Object.keys(invoiceRows[0] || {}).map(() => ({ wch: 20 }));
                wsInvoices['!cols'] = wscolsInv2;
                XLSX.utils.book_append_sheet(wb, wsInvoices, "Invoices (GST)");
                hasData = true;
            }

            if (!hasData) {
                alert("No report type selected.");
                return;
            }

            // 3. Export
            const typeLabel = reportType === 'both' ? 'inventory_invoices' : reportType;
            const filename = `${typeLabel}_report_${format(start, 'yyyy_MM')}.xlsx`;
            XLSX.writeFile(wb, filename);

        } catch (error) {
            console.error("Report Generation Error:", error);
            alert("Failed to generate report: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <BarChart3 className="h-6 w-6 text-blue-600" />
                        Reports
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Generate and download standard business reports</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                        <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Excel Export</h3>
                        <p className="text-sm text-slate-500">Inventory status and GST-ready invoice reports</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Report Type</label>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setReportType('inventory')}
                                className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg text-sm font-medium transition-all ${reportType === 'inventory' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                <CheckSquare className={`h-4 w-4 ${reportType === 'inventory' ? 'text-blue-600' : 'text-slate-300'}`} />
                                Inventory
                            </button>
                            <button
                                onClick={() => setReportType('invoices')}
                                className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg text-sm font-medium transition-all ${reportType === 'invoices' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                <CheckSquare className={`h-4 w-4 ${reportType === 'invoices' ? 'text-blue-600' : 'text-slate-300'}`} />
                                Invoices
                            </button>
                            <button
                                onClick={() => setReportType('both')}
                                className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg text-sm font-medium transition-all ${reportType === 'both' ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                <CheckSquare className={`h-4 w-4 ${reportType === 'both' ? 'text-blue-600' : 'text-slate-300'}`} />
                                Both
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">Report Period</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handlePresetChange('month')}
                                className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${dateRange === 'month' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => handlePresetChange('year')}
                                className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${dateRange === 'year' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                Yearly
                            </button>
                            <button
                                onClick={() => setDateRange('custom')}
                                className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${dateRange === 'custom' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                Custom
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={startDate}
                                    onChange={(e) => {
                                        setStartDate(e.target.value);
                                        setDateRange('custom');
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setDateRange('custom');
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={generateReport}
                            disabled={loading || !startDate || !endDate}
                            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-bold shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download className="h-5 w-5" />}
                            {loading ? 'Generating Report...' : 'Download Excel Report'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
