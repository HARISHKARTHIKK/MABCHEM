import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { exportToCSV } from '../utils/exportToCSV';
import { generateEInvoiceJSON, generateEwayBillJSON, downloadJSON } from '../utils/ewaybillExport';
import { Plus, Search, FileText, User, Calendar, Trash2, ArrowLeft, Loader2, CheckCircle, MapPin, AlertTriangle, Info, Zap, Copy, Check, ExternalLink, Download, LogIn, Clock, Edit2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, getDocs, limit, where } from 'firebase/firestore';
import { createInvoice, updateInvoice, deleteInvoice } from '../services/firestoreService';
import { format } from 'date-fns';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { validateEInvoice } from '../utils/eInvoiceValidator';

export default function Invoices() {
    const { userRole } = useAuth();
    const { settings } = useSettings();
    const [view, setView] = useState('list'); // 'list', 'create', or 'edit'
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [generatingEway, setGeneratingEway] = useState({}); // Tracking loading by ID
    const [copiedId, setCopiedId] = useState(null);
    const [toast, setToast] = useState(null);
    const [validationErrors, setValidationErrors] = useState(null);
    const location = useLocation();

    const showToast = (message) => {
        setToast(message);
        setTimeout(() => setToast(null), 5000);
    };

    // Check for navigation state to open Create Invoice automatically
    useEffect(() => {
        if (location.state?.create && userRole !== 'viewer') {
            setView('create');
        }
    }, [location.state, userRole]);

    // Real-time invoices fetch
    useEffect(() => {
        const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(100));

        try {
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInvoices(data);
                setLoading(false);
            }, (err) => {
                console.error("Invoices Fetch Error:", err);
                setLoading(false);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Invoices Setup Error:", error);
            setLoading(false);
        }
    }, []);

    const filteredInvoices = invoices
        .filter(inv => {
            const matchesSearch = inv.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase());

            const invDate = inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000) : null;
            let matchesDate = true;

            if (invDate) {
                if (startDate) {
                    const s = new Date(startDate);
                    s.setHours(0, 0, 0, 0);
                    if (invDate < s) matchesDate = false;
                }
                if (endDate) {
                    const e = new Date(endDate);
                    e.setHours(23, 59, 59, 999);
                    if (invDate > e) matchesDate = false;
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
        const dataToExport = invoices.map(inv => ({
            'Invoice Number': inv.invoiceNo,
            'Customer Name': inv.customerName,
            'Subtotal': inv.subtotal || 0,
            'Transport Amount': inv.transport?.amount || 0,
            'Transport Included': inv.transport?.isExtra ? 'No' : 'Yes',
            'Vehicle Number': inv.vehicleNumber || inv.transport?.vehicleNumber || '-',
            'GST Amount': inv.taxAmount || 0,
            'Total Amount': inv.totalAmount,
            'Invoice Date': inv.createdAt?.seconds ? format(new Date(inv.createdAt.seconds * 1000), 'dd MMM yyyy') : '-'
        }));
        exportToCSV('invoices_export.csv', dataToExport);
    };

    const handleExportJSON = async (e, inv) => {
        e.stopPropagation();
        if (generatingEway[inv.id]) return;

        setGeneratingEway(prev => ({ ...prev, [inv.id]: true }));

        // Small delay to simulate processing and give visual feedback (UX requirement)
        await new Promise(resolve => setTimeout(resolve, 600));

        try {
            const jsonData = generateEInvoiceJSON(inv, settings);

            // Smart validation layer with mapped error messages (NIC ARRAY FORMAT)
            const validation = validateEInvoice(jsonData);
            if (!validation.isValid) {
                setValidationErrors({
                    invoiceNo: inv.invoiceNo,
                    errors: validation.errors
                });
                return;
            }

            // Smart Auto File Naming
            // Name format: EINV_<InvoiceNo>_<BuyerGSTIN>.json
            const buyerGst = jsonData[0]?.BuyerDtls?.Gstin || 'NO_GSTIN';
            const fileName = `EINV_${inv.invoiceNo}_${buyerGst}.json`;

            downloadJSON(fileName, jsonData);
            showToast('E-Invoice JSON ready. Upload to IRP portal.');
        } catch (error) {
            console.error("JSON Export Error:", error);
            alert("Failed to export JSON: " + error.message);
        } finally {
            setGeneratingEway(prev => ({ ...prev, [inv.id]: false }));
        }
    };

    const copyToClipboard = (e, text, id) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDelete = async (e, inv) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete Invoice ${inv.invoiceNo}? This will revert stock and PO changes.`)) {
            try {
                await deleteInvoice(inv.id);
                showToast(`Invoice ${inv.invoiceNo} deleted successfully.`);
            } catch (error) {
                console.error("Delete Error:", error);
                alert("Failed to delete invoice: " + error.message);
            }
        }
    };

    if (view === 'create') {
        return <CreateInvoice onCancel={() => setView('list')} onSuccess={() => setView('list')} />;
    }

    if (view === 'edit' && editingInvoice) {
        return <CreateInvoice invoice={editingInvoice} onCancel={() => { setView('list'); setEditingInvoice(null); }} onSuccess={() => { setView('list'); setEditingInvoice(null); }} />;
    }

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        Invoices
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage and generate tax invoices</p>
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
                            onClick={() => setView('create')}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-all shadow-md shadow-blue-500/20 active:scale-95"
                        >
                            <Plus className="h-4 w-4" />
                            New Invoice
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search invoice no, customer..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
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

                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[1000px]">
                        <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Invoice No</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Origin</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                                <th className="px-6 py-4 text-center">E-Way Bill</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredInvoices.map((inv) => (
                                <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 font-mono font-medium text-slate-700">{inv.invoiceNo}</td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {inv.date ? format(new Date(inv.date), 'dd MMM yyyy') : (inv.createdAt?.seconds ? format(new Date(inv.createdAt.seconds * 1000), 'dd MMM yyyy') : '-')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{inv.customerName}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit">
                                            <MapPin className="h-3 w-3" /> {inv.fromLocation || '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-slate-600">
                                        ₹ {(Number(inv.subtotal) || 0).toFixed(0)}
                                    </td>
                                    <td className="px-6 py-4 text-right font-black text-slate-900 border-l border-slate-50">
                                        ₹ {(Number(inv.totalAmount) || 0).toFixed(0)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col items-center gap-1">
                                            {inv.ewayBillNo ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 animate-fadeIn">
                                                        <CheckCircle className="h-2.5 w-2.5" /> Generated
                                                    </span>
                                                    <button
                                                        onClick={(e) => copyToClipboard(e, inv.ewayBillNo, inv.id)}
                                                        className="mt-1 flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-blue-600 transition-colors"
                                                    >
                                                        {inv.ewayBillNo}
                                                        {copiedId === inv.id ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
                                                    </button>
                                                </div>
                                            ) : inv.ewayBillStatus === 'FAILED' ? (
                                                <div className="group relative flex flex-col items-center">
                                                    <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                                                        <AlertTriangle className="h-2.5 w-2.5" /> Failed
                                                    </span>
                                                    <div className="absolute bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl z-50 leading-tight">
                                                        {inv.tallyGspResponse?.error || 'Registration failed at NIC. Check HSN/GSTIN.'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1.5 min-w-[140px]">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Manual Upload</span>
                                                    {userRole !== 'viewer' && (
                                                        <div className="flex flex-row gap-1.5">
                                                            <button
                                                                onClick={(e) => handleExportJSON(e, inv)}
                                                                disabled={generatingEway[inv.id]}
                                                                title="Export E-Invoice JSON"
                                                                className={`flex items-center justify-center p-2 rounded-lg transition-all shadow-sm bg-amber-50 text-amber-600 hover:bg-amber-100 hover:shadow-amber-100/50 hover:scale-105 active:scale-95 ${generatingEway[inv.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                {generatingEway[inv.id] ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Download className="h-4 w-4 fill-amber-500 text-amber-500" />
                                                                )}
                                                            </button>
                                                            <a
                                                                href="https://einvoice1.gst.gov.in/"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Go to E-Invoice Portal"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="flex items-center justify-center p-2 rounded-lg transition-all shadow-sm bg-blue-50 text-blue-700 hover:bg-blue-100 hover:shadow-blue-200 hover:scale-105 active:scale-95 no-underline border border-blue-100"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            {userRole !== 'viewer' && (!settings?.invoice?.lockAfterDispatch) && (
                                                <>
                                                    <button
                                                        onClick={() => { setEditingInvoice(inv); setView('edit'); }}
                                                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                                                        title="Edit Invoice"
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(e, inv)}
                                                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                                                        title="Delete Invoice"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                onClick={() => setSelectedInvoice(inv)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                title="View Invoice"
                                            >
                                                <FileText className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                                        No invoices found. Create one to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="sm:hidden grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredInvoices.map((inv) => (
                        <div
                            key={inv.id}
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-4 bg-white dark:bg-slate-800 active:bg-slate-50 dark:active:bg-slate-700/50 transition-colors flex flex-col gap-3"
                        >
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-slate-900 dark:text-white">{inv.invoiceNo}</span>
                                        {inv.ewayBillNo ? (
                                            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter flex items-center gap-0.5">
                                                <Zap className="h-2 w-2 fill-green-500" /> E-WAY
                                            </span>
                                        ) : inv.ewayBillStatus === 'FAILED' && (
                                            <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter">
                                                Failed
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {inv.date ? format(new Date(inv.date), 'dd MMM yyyy') : (inv.createdAt?.seconds ? format(new Date(inv.createdAt.seconds * 1000), 'dd MMM yyyy') : '-')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-blue-600 dark:text-blue-400">₹{(Number(inv.totalAmount) || 0).toFixed(0)}</div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">Basic: ₹{(Number(inv.subtotal) || 0).toFixed(0)}</div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center">
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                                    {inv.customerName}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded uppercase tracking-tighter">
                                        <MapPin className="h-3 w-3 text-blue-500" /> {inv.fromLocation || '-'}
                                    </span>
                                    {userRole !== 'viewer' && (!settings?.invoice?.lockAfterDispatch) && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setEditingInvoice(inv); setView('edit'); }}
                                                className="p-1.5 text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg transition-colors"
                                            >
                                                <Edit2 className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(e, inv)}
                                                className="p-1.5 text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredInvoices.length === 0 && (
                        <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
                            No invoices found.
                        </div>
                    )}
                </div>
            </div>

            {selectedInvoice && (
                <InvoiceViewModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
            )}

            {validationErrors && (
                <ValidationErrorModal
                    data={validationErrors}
                    onClose={() => setValidationErrors(null)}
                />
            )}

            {toast && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in-up border border-slate-700/50 backdrop-blur-md">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-bold tracking-wide">{toast}</span>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.4s ease-out;
                }
            `}} />
        </div>
    );
}

function CreateInvoice({ onCancel, onSuccess, invoice }) {
    const { settings, updateSettings } = useSettings();
    const { userData } = useAuth();
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(invoice?.customerId || '');
    const [fromLocation, setFromLocation] = useState(invoice?.fromLocation || 'CHENNAI');
    const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo || '');
    const [lines, setLines] = useState(invoice?.itemsSummary?.map(item => ({
        productId: item.productId,
        name: item.productName,
        qty: String(item.quantity),
        price: String(item.price),
        bags: String(item.bags || ''),
        bagWeight: String(item.bagWeight || ''),
        purchaseOrderId: item.purchaseOrderId || ''
    })) || [{ productId: '', qty: '0', price: '0', stock: 0, bags: '', bagWeight: '', purchaseOrderId: '' }]);
    const [remarks, setRemarks] = useState(invoice?.remarks || '');
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [invoiceDate, setInvoiceDate] = useState(
        invoice?.date || (invoice?.createdAt?.seconds ? format(new Date(invoice.createdAt.seconds * 1000), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
    );

    // New Logistics State
    const [transporters, setTransporters] = useState([]);
    const [transporterId, setTransporterId] = useState(invoice?.transporterId || '');
    const [transporterGSTIN, setTransporterGSTIN] = useState(invoice?.transporterGSTIN || '');
    const [vehicleNumber, setVehicleNumber] = useState(invoice?.vehicleNumber || invoice?.transport?.vehicleNumber || '');
    const [paymentType, setPaymentType] = useState(invoice?.paymentType || 'Payable');
    const [distance, setDistance] = useState(invoice?.distance || '');
    const [destinationPincode, setDestinationPincode] = useState(invoice?.destinationPincode || '');
    const [vehicleError, setVehicleError] = useState(false);
    const [isBlinking, setIsBlinking] = useState(false);

    // Transport details
    const [transport, setTransport] = useState(invoice?.transport || {
        vehicleNumber: '',
        amount: 0,
        mode: 'By Road',
        isExtra: false
    });

    const validateVehicleNumber = (val) => {
        const regex = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
        if (val && !regex.test(val)) {
            setVehicleError(true);
        } else {
            setVehicleError(false);
        }
    };

    const handlePincodeBlur = () => {
        if (destinationPincode.length === 6) {
            setDistance('100');
            setIsBlinking(true);
            setTimeout(() => setIsBlinking(false), 5000);
        }
    };

    const baseLocations = settings?.locations?.filter(l => l.active).map(l => l.name) || ['CHENNAI', 'Warehouse A', 'Warehouse B', 'Store Front', 'Factory'];
    const LOCATIONS = [...new Set([...baseLocations, userData?.location].filter(Boolean))];

    useEffect(() => {
        if (fromLocation && settings?.locations && !invoice) {
            const loc = settings.locations.find(l => l.name === fromLocation);
            if (loc) {
                const prefix = loc.prefix || 'INV';
                const num = loc.nextNumber || 1;
                const newNo = `${prefix}-${num}`;
                if (!settings.invoice?.manualNo || !invoiceNo || invoiceNo.includes('-')) {
                    setInvoiceNo(newNo);
                }
            }
        }
    }, [fromLocation, settings, invoice]);

    useEffect(() => {
        const qCustomers = query(collection(db, 'customers'), orderBy('name'));
        const qProducts = query(collection(db, 'products'), orderBy('name'));

        const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
            setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubProducts = onSnapshot(qProducts, (snapshot) => {
            setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qTransporters = query(collection(db, 'transporters'), orderBy('name'));
        const unsubTransporters = onSnapshot(qTransporters, (snapshot) => {
            setTransporters(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qPOs = query(collection(db, 'purchaseOrders'), where('status', 'in', ['Open', 'Partially Fulfilled']));
        const unsubPOs = onSnapshot(qPOs, (snapshot) => {
            setPurchaseOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubCustomers();
            unsubProducts();
            unsubTransporters();
            unsubPOs();
        };
    }, []);

    const getStockAtLocation = (product) => {
        if (!product) return 0;
        return Object.values(product.locations || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    };

    const addLine = () => {
        setLines([...lines, { productId: '', qty: '0', price: '0', stock: 0, bags: '', bagWeight: '', purchaseOrderId: '' }]);
    };

    const updateLine = (index, field, value) => {
        const newLines = [...lines];
        const updatedLine = { ...newLines[index] };

        let processedValue = value;
        if (field === 'qty' || field === 'price' || field === 'bags' || field === 'bagWeight') {
            processedValue = String(value).replace(/,/g, '.');
            processedValue = processedValue.replace(/[^0-9.]/g, '');
            const dots = (processedValue.match(/\./g) || []).length;
            if (dots > 1) {
                const parts = processedValue.split('.');
                processedValue = parts[0] + '.' + parts.slice(1).join('');
            }
        }

        if (field === 'productId') {
            const prod = products.find(p => p.id === String(value));
            updatedLine.productId = String(value);
            updatedLine.name = prod?.name || '';
            updatedLine.price = String(prod?.price || '0');
            updatedLine.qty = String(updatedLine.qty || '0');
            updatedLine.stock = Number(getStockAtLocation(prod));
            updatedLine.bags = '';
            updatedLine.bagWeight = '';
            updatedLine.purchaseOrderId = '';
        } else {
            updatedLine[field] = processedValue;
        }

        // Auto-fill price from PO Rate if linking to a PO
        if (field === 'purchaseOrderId' && value) {
            const po = purchaseOrders.find(p => p.id === value);
            if (po) {
                const poItem = po.items.find(i => i.productId === updatedLine.productId);
                if (poItem && poItem.rate) {
                    updatedLine.price = String(poItem.rate);
                }
            }
        }

        if (field === 'bags' || field === 'bagWeight') {
            const bagsCount = Number(updatedLine.bags) || 0;
            const weightPerBag = Number(updatedLine.bagWeight) || 0;
            if (bagsCount > 0 && weightPerBag > 0) {
                updatedLine.qty = String((bagsCount * weightPerBag) / 1000);
            }
        }

        newLines[index] = updatedLine;
        setLines(newLines);
    };

    const removeLine = (index) => {
        setLines(lines.filter((_, i) => i !== index));
    };

    const calculateTotals = () => {
        const linesTotal = lines.reduce((acc, line) => {
            const qty = Number(String(line.qty || 0).replace(/,/g, '.'));
            const price = Number(String(line.price || 0).replace(/,/g, '.'));
            return acc + (qty * price);
        }, 0);

        const taxRate = settings?.invoice?.tax ?? 18;
        const totalTax = linesTotal * (taxRate / 100);

        // GST Splitting Logic
        const selectedLocationObj = settings?.locations?.find(l => l.name === fromLocation);
        const companyGST = selectedLocationObj?.gstin || settings?.company?.gstin || '';
        const selectedCustomerObj = customers.find(c => c.id === selectedCustomer);
        const customerGST = selectedCustomerObj?.gstin || '';

        const companyStateCode = companyGST.substring(0, 2);
        const customerStateCode = customerGST.substring(0, 2);

        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        let isIntrastate = false;

        if (companyStateCode && customerStateCode && companyStateCode === customerStateCode) {
            cgst = totalTax / 2;
            sgst = totalTax / 2;
            isIntrastate = true;
        } else {
            igst = totalTax;
            isIntrastate = false;
        }

        const transportAmt = Number(transport.amount) || 0;
        let total = linesTotal + totalTax;
        if (transport.isExtra) {
            total += transportAmt;
        }
        if (settings?.invoice?.roundOff) {
            total = Math.round(total);
        }
        const taxableValue = linesTotal;
        return {
            linesTotal,
            tax: totalTax,
            total,
            taxableValue,
            cgst,
            sgst,
            igst,
            isIntrastate,
            companyGST
        };
    };

    const handleSubmit = async () => {
        const validLines = lines.filter(l => l.productId && l.qty && parseFloat(String(l.qty).replace(/,/g, '.')) > 0);

        if (!invoiceNo || !selectedCustomer || !fromLocation || validLines.length === 0) {
            alert("Please provide Invoice Number, Customer, Dispatch Location, and at least one valid Item.");
            return;
        }

        for (const line of validLines) {
            const qtyVal = Number(String(line.qty).replace(/,/g, '.'));
            if (isNaN(qtyVal) || qtyVal <= 0) {
                alert(`Please enter a valid quantity greater than 0 for ${line.name || 'Selected Item'}`);
                return;
            }
            const prod = products.find(p => p.id === line.productId);
            let globalStock = getStockAtLocation(prod);

            // If editing, add back the quantity already "used" by this invoice for validation
            if (invoice?.itemsSummary) {
                const originalItem = invoice.itemsSummary.find(i => i.productId === line.productId);
                if (originalItem) {
                    globalStock += Number(originalItem.quantity);
                }
            }

            if (globalStock < qtyVal) {
                alert(`Insufficient global stock for ${line.name}. Available: ${globalStock.toFixed(1)}, Requested: ${qtyVal.toFixed(1)}`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const { linesTotal, tax, total, taxableValue, cgst, sgst, igst, isIntrastate, companyGST } = calculateTotals();
            const customerObj = customers.find(c => c.id === selectedCustomer);

            const preparedItems = validLines.map(l => {
                const prod = products.find(p => p.id === l.productId);
                return {
                    ...l,
                    quantity: Number(String(l.qty).replace(/[^0-9.]/g, '')),
                    bags: Number(l.bags) || 0,
                    bagWeight: Number(l.bagWeight) || 0,
                    price: Number(String(l.price).replace(/[^0-9.]/g, '')),
                    hsnCode: prod?.hsn || ''
                };
            });

            const invoiceData = {
                invoiceNo: invoiceNo,
                customerId: selectedCustomer,
                customerName: customerObj?.name || 'Unknown',
                customerGSTIN: customerObj?.gstin || '',
                sellerGSTIN: companyGST,
                fromLocation: fromLocation,
                subtotal: Number(linesTotal) || 0,
                taxAmount: Number(tax) || 0,
                cgst: Number(cgst) || 0,
                sgst: Number(sgst) || 0,
                igst: Number(igst) || 0,
                taxType: isIntrastate ? 'CGST_SGST' : 'IGST',
                totalAmount: Number(total) || 0,
                taxableValue: Number(taxableValue) || 0,
                taxRate: settings?.invoice?.tax ?? 18,
                remarks: remarks,
                transport: {
                    vehicleNumber: (vehicleNumber || '').replace(/\s+/g, '').toUpperCase(),
                    amount: Number(transport.amount) || 0,
                    mode: transport.mode,
                    isExtra: transport.isExtra
                },
                transporterId: transporterId,
                transporterName: transporters.find(t => t.id === transporterId)?.name || '',
                transporterGSTIN: transporterGSTIN,
                vehicleNumber: (vehicleNumber || '').replace(/\s+/g, '').toUpperCase(),
                paymentType: paymentType,
                distance: Number(distance) || 100,
                destinationPincode: destinationPincode,
                transportationCost: Number(transport.amount) || 0,
                status: invoice?.status || 'paid',
                date: invoiceDate
            };

            if (invoice?.id) {
                await updateInvoice(invoice.id, invoiceData, preparedItems, fromLocation);
            } else {
                await createInvoice(invoiceData, preparedItems, fromLocation);

                if (settings?.locations) {
                    const locIndex = settings.locations.findIndex(l => l.name === fromLocation);
                    if (locIndex >= 0) {
                        const newSettings = JSON.parse(JSON.stringify(settings));
                        const currentNext = newSettings.locations[locIndex].nextNumber || 1;
                        newSettings.locations[locIndex].nextNumber = currentNext + 1;
                        await updateSettings(newSettings);
                    }
                }
            }

            onSuccess();
        } catch (error) {
            alert("Failed to save invoice: " + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const { linesTotal, tax, total, cgst, sgst, igst, isIntrastate } = calculateTotals();

    return (
        <div className="max-w-[1600px] mx-auto space-y-3 animate-fade-in-up pb-20">
            {/* Header / Navigation */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-slate-200 gap-3">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors flex-shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h2 className="text-lg md:text-xl font-black text-slate-900 leading-tight">Create Invoice</h2>
                    </div>
                </div>
                <div className="flex flex-row items-center gap-3 md:gap-6 w-full md:w-auto justify-end">
                    <div className="text-right">
                        <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-0.5">Invoice Date</label>
                        <input
                            type="date"
                            className="bg-slate-50 border-none rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-right font-mono font-bold text-xs md:text-sm text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none w-28 md:w-40"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                        />
                    </div>
                    <div className="text-right">
                        <label className="block text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-0.5">Invoice Number</label>
                        <input
                            type="text"
                            className="bg-slate-50 border-none rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-right font-mono font-bold text-sm md:text-base text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none w-32 md:w-48"
                            value={invoiceNo}
                            onChange={(e) => setInvoiceNo(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Primary Details Bar - Lighter Professional Style */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-1.5 p-1">
                    <label className="text-slate-400 text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-blue-500" /> Dispatch Location
                    </label>
                    <div className="relative">
                        <select
                            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-bold text-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                            value={fromLocation}
                            onChange={(e) => setFromLocation(e.target.value)}
                        >
                            <option value="" className="text-slate-900">Select Warehouse...</option>
                            {LOCATIONS.map(loc => (
                                <option key={loc} value={loc} className="text-slate-900">{loc}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                            <Plus className="h-4 w-4 rotate-45" />
                        </div>
                    </div>
                </div>
                <div className="space-y-1.5 p-1">
                    <label className="text-slate-400 text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-500" /> Select Customer
                    </label>
                    <div className="relative">
                        <select
                            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-bold text-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                            value={selectedCustomer}
                            onChange={(e) => {
                                const cId = e.target.value;
                                setSelectedCustomer(cId);
                                if (cId) {
                                    // Trigger default distance logic when a valid customer (and thus pincode) is select
                                    setDistance('100');
                                }
                            }}
                        >
                            <option value="" className="text-slate-900">Choose Customer...</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                            <Plus className="h-4 w-4 rotate-45" />
                        </div>
                    </div>
                </div>
            </div>

            {selectedCustomer && purchaseOrders.filter(po => po.customerId === selectedCustomer).length > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-indigo-700 font-black text-[10px] uppercase tracking-wider">
                        <Clock className="h-3 w-3" /> Active Purchase Orders for this Customer
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {purchaseOrders.filter(po => po.customerId === selectedCustomer).map(po => (
                            <div key={po.id} className="bg-white border border-indigo-200 px-3 py-1.5 rounded-xl flex items-center gap-3 shadow-sm">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">PO# {po.poNumber}</div>
                                <div className="flex gap-2">
                                    {po.items.map((item, i) => (
                                        <div key={i} className="text-[10px] font-bold text-slate-700">
                                            {item.productName}: <span className="text-indigo-600">{item.remainingQty} MTS</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">E-Way Bill Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-slate-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-blue-500" /> Destination Pincode
                        </label>
                        <input
                            type="text"
                            maxLength="6"
                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                            placeholder=""
                            value={destinationPincode}
                            onChange={(e) => setDestinationPincode(e.target.value.replace(/\D/g, ''))}
                            onBlur={handlePincodeBlur}
                        />
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 italic leading-tight">Required for E-way Bill</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-slate-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                            Approx Distance (KMs)
                            <div className="group relative">
                                <Info className="h-3 w-3 text-blue-400 cursor-help" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl z-50 leading-tight font-normal normal-case">
                                    Auto-calculated based on pincode. Please verify for accuracy.
                                </div>
                            </div>
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                className={`w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300 ${isBlinking ? 'animate-blink-yellow border-2' : ''}`}
                                placeholder="0"
                                value={distance}
                                onChange={(e) => setDistance(e.target.value)}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] font-black text-slate-400 uppercase">
                                KM
                            </div>
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 italic leading-tight">Auto-fills to 100km</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-slate-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                            Vehicle Number
                        </label>
                        <input
                            type="text"
                            className={`w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300 uppercase font-mono ${vehicleError ? 'animate-shake border-rose-500 ring-2 ring-rose-100' : ''}`}
                            placeholder="TN 01 AB 1234"
                            value={vehicleNumber}
                            onChange={(e) => {
                                setVehicleNumber(e.target.value.toUpperCase());
                                if (vehicleError) setVehicleError(false);
                            }}
                            onBlur={(e) => validateVehicleNumber(e.target.value.toUpperCase())}
                        />
                        {vehicleError ? (
                            <p className="text-[9px] text-rose-500 font-bold uppercase mt-1 leading-tight">Invalid format. Example: TN01AB1234</p>
                        ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 italic leading-tight">Format: ST-00-AA-0000</p>
                        )}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes blink-yellow {
                    0%, 100% { border-color: #e2e8f0; }
                    50% { border-color: #facc15; }
                }
                .animate-blink-yellow {
                    animation: blink-yellow 1s infinite;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.2s ease-in-out infinite;
                    animation-iteration-count: 3;
                }
            `}} />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
                <div className="lg:col-span-3 space-y-3">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Line Items</h3>
                            <button onClick={addLine} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
                                <Plus className="h-3.5 w-3.5" /> Add Item
                            </button>
                        </div>
                        <div className="p-0">
                            {/* Desktop Table View */}
                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full min-w-[800px]">
                                    <thead className="bg-slate-50/50 text-[11px] font-black uppercase text-slate-400 border-b">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Product Selection</th>
                                            <th className="px-2 py-3 text-center w-24">Bags</th>
                                            <th className="px-2 py-3 text-center w-24">Wt (kg)</th>
                                            <th className="px-2 py-3 text-center w-32" title="Quantity in MTS">Quantity</th>
                                            <th className="px-2 py-3 text-center w-48 text-indigo-600">Link to PO</th>
                                            <th className="px-2 py-3 text-center w-32">Rate (₹)</th>
                                            <th className="px-4 py-3 text-right w-36">Line Total</th>
                                            <th className="px-4 py-3 w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {lines.map((line, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <select
                                                        className="w-full bg-slate-100/50 border-none rounded-lg px-2.5 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={line.productId}
                                                        onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                                                        disabled={!fromLocation}
                                                    >
                                                        <option value="">{fromLocation ? 'Select Product' : 'Select Location'}</option>
                                                        {products.map(p => {
                                                            const totalStock = Object.values(p.locations || {}).reduce((a, b) => a + (Number(b) || 0), 0);
                                                            return (
                                                                <option key={p.id} value={String(p.id)}>
                                                                    {p.name} ({totalStock.toFixed(1)} mts)
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-slate-100/50 border-none rounded-lg px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        placeholder="0"
                                                        value={line.bags}
                                                        onChange={(e) => updateLine(idx, 'bags', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-slate-100/50 border-none rounded-lg px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        placeholder="50"
                                                        value={line.bagWeight}
                                                        onChange={(e) => updateLine(idx, 'bagWeight', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            readOnly
                                                            tabIndex="-1"
                                                            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-2 pr-8 py-2 text-center text-sm font-black text-indigo-600 dark:text-indigo-400 cursor-not-allowed outline-none"
                                                            value={line.qty}
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">MTS</span>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <select
                                                        className={`w-full bg-slate-100/50 border-none rounded-lg px-2 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${line.purchaseOrderId ? 'text-blue-600 bg-blue-50/50' : ''}`}
                                                        value={line.purchaseOrderId}
                                                        onChange={(e) => updateLine(idx, 'purchaseOrderId', e.target.value)}
                                                        disabled={!selectedCustomer || !line.productId}
                                                    >
                                                        <option value="">No PO Link</option>
                                                        {purchaseOrders
                                                            .filter(po => po.customerId === selectedCustomer)
                                                            .flatMap(po =>
                                                                po.items
                                                                    .filter(item => item.productId === line.productId && item.remainingQty > 0)
                                                                    .map(item => ({
                                                                        id: po.id,
                                                                        poNumber: po.poNumber,
                                                                        remaining: item.remainingQty
                                                                    }))
                                                            )
                                                            .map(poItem => (
                                                                <option key={`${poItem.id}-${line.productId}`} value={poItem.id}>
                                                                    {poItem.poNumber} (Bal: {poItem.remaining} MTS)
                                                                </option>
                                                            ))
                                                        }
                                                    </select>
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-slate-100/50 border-none rounded-lg px-2 py-2 text-center text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        placeholder="0"
                                                        value={line.price}
                                                        onChange={(e) => updateLine(idx, 'price', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <input
                                                        readOnly
                                                        tabIndex="-1"
                                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-2 text-right text-sm font-black text-slate-900 dark:text-slate-100 cursor-not-allowed outline-none"
                                                        value={`₹ ${(Number(String(line.qty || 0).replace(/[^0-9.]/g, '')) * Number(String(line.price || 0).replace(/[^0-9.]/g, ''))).toLocaleString('en-IN', { minimumFractionDigits: 1 })}`}
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button onClick={() => removeLine(idx)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {lines.length === 0 && (
                                            <tr>
                                                <td colSpan="8" className="px-6 py-20 text-center text-slate-400 font-bold">No items listed. Start adding products.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="lg:hidden divide-y divide-slate-100">
                                {lines.map((line, idx) => (
                                    <div key={idx} className="p-4 space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 mr-2">
                                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Product Selection</label>
                                                <select
                                                    className="w-full bg-slate-100/50 border-none rounded-lg px-2.5 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                    value={line.productId}
                                                    onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                                                    disabled={!fromLocation}
                                                >
                                                    <option value="">{fromLocation ? 'Select Product' : 'Select Location'}</option>
                                                    {products.map(p => {
                                                        const totalStock = Object.values(p.locations || {}).reduce((a, b) => a + (Number(b) || 0), 0);
                                                        return (
                                                            <option key={p.id} value={String(p.id)}>
                                                                {p.name} ({totalStock.toFixed(1)} mts)
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                            <button onClick={() => removeLine(idx)} className="p-2.5 text-rose-500 bg-rose-50 rounded-xl transition-all active:scale-95">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Bags</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-100/50 border-none rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                                    placeholder="0"
                                                    value={line.bags}
                                                    onChange={(e) => updateLine(idx, 'bags', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Wt (kg)</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-100/50 border-none rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                                    placeholder="50"
                                                    value={line.bagWeight}
                                                    onChange={(e) => updateLine(idx, 'bagWeight', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Rate (₹)</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-100/50 border-none rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                                    placeholder="0"
                                                    value={line.price}
                                                    onChange={(e) => updateLine(idx, 'price', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-black text-indigo-600 uppercase mb-1 font-black">Link to PO</label>
                                                <select
                                                    className={`w-full bg-slate-100/50 border-none rounded-lg px-2 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${line.purchaseOrderId ? 'text-blue-600 bg-blue-50/50' : ''}`}
                                                    value={line.purchaseOrderId}
                                                    onChange={(e) => updateLine(idx, 'purchaseOrderId', e.target.value)}
                                                    disabled={!selectedCustomer || !line.productId}
                                                >
                                                    <option value="">No PO Link</option>
                                                    {purchaseOrders
                                                        .filter(po => po.customerId === selectedCustomer)
                                                        .flatMap(po =>
                                                            po.items
                                                                .filter(item => item.productId === line.productId && item.remainingQty > 0)
                                                                .map(item => ({
                                                                    id: po.id,
                                                                    poNumber: po.poNumber,
                                                                    remaining: item.remainingQty
                                                                }))
                                                        )
                                                        .map(poItem => (
                                                            <option key={`${poItem.id}-${line.productId}`} value={poItem.id}>
                                                                {poItem.poNumber} ({poItem.remaining} M)
                                                            </option>
                                                        ))
                                                    }
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Total Qty</p>
                                                <p className="text-sm font-black text-indigo-600">{line.qty} MTS</p>
                                            </div>
                                            <div className="text-right space-y-0.5">
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Subtotal</p>
                                                <p className="text-sm font-black text-slate-900 dark:text-white">₹ {(Number(String(line.qty || 0).replace(/[^0-9.]/g, '')) * Number(String(line.price || 0).replace(/[^0-9.]/g, ''))).toLocaleString('en-IN')}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {lines.length === 0 && (
                                    <div className="px-6 py-20 text-center text-slate-400 font-bold">No items listed. Start adding products.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                            <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Transportation, Logistics & Notes</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Column 1: Vehicle & Transporter */}
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Select Transporter</label>
                                    <select
                                        className="w-full bg-slate-50 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                                        value={transporterId}
                                        onChange={(e) => {
                                            const tId = e.target.value;
                                            setTransporterId(tId);
                                            const selectedT = transporters.find(t => t.id === tId);
                                            setTransporterGSTIN(selectedT?.gstin || '');
                                        }}
                                    >
                                        <option value="">Select Transporter...</option>
                                        {transporters.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} {t.gstin ? `(${t.gstin})` : '(No GSTIN)'}</option>
                                        ))}
                                    </select>
                                    {transporterId && !transporterGSTIN && (
                                        <p className="mt-1 text-[9px] text-amber-600 font-bold flex items-center gap-1 leading-tight">
                                            <AlertTriangle className="h-2.5 w-2.5" /> Warning: Transporter missing GSTIN. e-Way Bill might fail.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    {/* Vehicle number moved to E-way Bill section */}
                                </div>
                            </div>

                            {/* Column 2: Cost & Payment */}
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Cost (₹)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={transport.amount}
                                            onChange={e => setTransport({ ...transport, amount: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Payment Type</label>
                                        <select
                                            className={`w-full border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer transition-colors ${paymentType === 'Payable' ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}
                                            value={paymentType}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setPaymentType(val);
                                                setTransport(prev => ({
                                                    ...prev,
                                                    isExtra: val === 'To Pay'
                                                }));
                                            }}
                                        >
                                            <option value="Payable">Payable</option>
                                            <option value="To Pay">To Pay</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Method</label>
                                        <select
                                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={transport.mode}
                                            onChange={e => setTransport({ ...transport, mode: e.target.value })}
                                        >
                                            <option value="">N/A</option>
                                            {(settings?.transport?.modes || ['By Road', 'By Sea', 'By Air']).map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">Pricing</label>
                                        <select
                                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={transport.isExtra ? 'Extra' : 'Included'}
                                            onChange={e => setTransport({ ...transport, isExtra: e.target.value === 'Extra' })}
                                        >
                                            <option value="Included">Included</option>
                                            <option value="Extra">Extra Cost</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Remarks */}
                            <div className="space-y-3">
                                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">Remarks / Internal Notes</label>
                                <textarea
                                    className="w-full bg-slate-50 border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px] resize-none"
                                    placeholder="Add notes about this dispatch..."
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6">
                    <div className="bg-white p-5 rounded-[1.5rem] shadow-lg border border-slate-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-5 opacity-[0.03] pointer-events-none">
                            <FileText className="h-16 w-16 rotate-12 text-slate-900" />
                        </div>
                        <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Billing Summary</h4>
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <span className="text-slate-500 text-xs font-bold">Subtotal</span>
                                <input
                                    readOnly
                                    tabIndex="-1"
                                    className="w-28 bg-slate-50 dark:bg-slate-800 border-none text-right text-base font-bold text-slate-800 dark:text-slate-200 tracking-tighter cursor-not-allowed outline-none rounded-lg px-2 py-0.5"
                                    value={`₹ ${linesTotal.toFixed(1)}`}
                                />
                            </div>
                            {transport.isExtra && (
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span className="text-slate-500 text-xs font-bold">Transport</span>
                                    <input
                                        readOnly
                                        tabIndex="-1"
                                        className="w-28 bg-blue-50 dark:bg-blue-900/30 border-none text-right text-base font-bold text-blue-600 dark:text-blue-400 tracking-tighter cursor-not-allowed outline-none rounded-lg px-2 py-0.5"
                                        value={`+ ₹ ${Number(transport.amount).toFixed(1)}`}
                                    />
                                </div>
                            )}
                            {isIntrastate ? (
                                <>
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 text-xs font-bold">CGST (9%)</span>
                                        <input
                                            readOnly
                                            tabIndex="-1"
                                            className="w-28 bg-amber-50 dark:bg-amber-900/30 border-none text-right text-base font-bold text-amber-600 dark:text-amber-400 tracking-tighter cursor-not-allowed outline-none rounded-lg px-2 py-0.5"
                                            value={`+ ₹ ${cgst.toFixed(1)}`}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                        <span className="text-slate-500 text-xs font-bold">SGST (9%)</span>
                                        <input
                                            readOnly
                                            tabIndex="-1"
                                            className="w-28 bg-amber-50 dark:bg-amber-900/30 border-none text-right text-base font-bold text-amber-600 dark:text-amber-400 tracking-tighter cursor-not-allowed outline-none rounded-lg px-2 py-0.5"
                                            value={`+ ₹ ${sgst.toFixed(1)}`}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <span className="text-slate-500 text-xs font-bold">IGST (18%)</span>
                                    <input
                                        readOnly
                                        tabIndex="-1"
                                        className="w-28 bg-amber-50 dark:bg-amber-900/30 border-none text-right text-base font-bold text-amber-600 dark:text-amber-400 tracking-tighter cursor-not-allowed outline-none rounded-lg px-2 py-0.5"
                                        value={`+ ₹ ${igst.toFixed(1)}`}
                                    />
                                </div>
                            )}
                            <div className="pt-2 flex flex-col gap-1">
                                <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest text-center">Grand Total</span>
                                <div className="text-3xl font-black text-center text-slate-900 dark:text-white tracking-tighter whitespace-nowrap bg-slate-50 dark:bg-slate-800 py-3 rounded-2xl border border-slate-100 dark:border-slate-700 cursor-not-allowed">
                                    <span className="text-blue-600 dark:text-blue-400 text-xl mr-1">₹</span>
                                    {total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    <span className="text-slate-300 dark:text-slate-500 text-lg font-light">.{total.toFixed(1).split('.')[1]}</span>
                                </div>
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className={`w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-base shadow-xl shadow-blue-100 active:scale-[0.98] transition-all flex justify-center items-center gap-2 ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                                {submitting ? 'PROCESSING...' : 'FINAL DISPATCH'}
                            </button>
                            <p className="text-[9px] text-slate-400 text-center font-bold uppercase tracking-widest mt-2">Safe & Secure Entry</p>
                        </div>
                    </div>
                    {!fromLocation && (
                        <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-2xl flex items-start gap-4">
                            <MapPin className="h-6 w-6 text-amber-500 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Select Warehouse</p>
                                <p className="text-[10px] text-amber-600 font-bold leading-relaxed">You must select a dispatch location before adding products to verify available stock levels.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InvoiceViewModal({ invoice, onClose }) {
    const { settings } = useSettings();
    if (!invoice) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:p-0 print:bg-white print:fixed print:inset-0">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] print:max-w-none print:shadow-none print:max-h-none print:h-full print:rounded-none">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:hidden">
                    <h3 className="font-bold text-lg text-slate-800">Invoice Details</h3>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            <FileText className="h-4 w-4" /> Print
                        </button>
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">
                            Close
                        </button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto print:overflow-visible">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">INVOICE</h1>
                            <p className="text-slate-500 mt-1">#{invoice.invoiceNo}</p>
                            <p className="text-sm text-slate-500 mt-2">
                                Date: {invoice.date ? format(new Date(invoice.date), 'dd MMM yyyy') : (invoice.createdAt?.seconds ? format(new Date(invoice.createdAt.seconds * 1000), 'dd MMM yyyy') : '-')}
                            </p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-lg font-bold text-slate-800 uppercase">{settings?.company?.name || 'MAB CHEMICALS PVT. LTD.'}</h2>
                            <p className="text-sm text-slate-500">GSTIN: {invoice.sellerGSTIN || settings?.company?.gstin || '27ABCDE1234F1Z5'}</p>
                            <p className="text-sm text-slate-500 whitespace-pre-wrap max-w-[200px] ml-auto">{settings?.company?.address || 'Maharashtra, India'}</p>
                        </div>
                    </div>

                    <div className="mb-8 p-4 bg-slate-50 rounded-lg print:border print:border-slate-200">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</h3>
                        <p className="font-bold text-slate-800 text-lg">{invoice.customerName}</p>
                    </div>

                    <table className="w-full text-left text-sm mb-8">
                        <thead className="border-b-2 border-slate-200 text-slate-700">
                            <tr>
                                <th className="py-3 font-bold">Item Description</th>
                                <th className="py-3 text-right">Qty (mts)</th>
                                <th className="py-3 text-right">Rate</th>
                                <th className="py-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <InvoiceItemsLoader invoiceId={invoice.id} />
                        </tbody>
                    </table>

                    {invoice.transport && (
                        <div className="mb-6 p-4 rounded border border-dashed border-slate-300">
                            <h4 className="font-bold text-sm text-slate-700 mb-2">Transport / Delivery</h4>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500 block text-xs">Vehicle No</span>
                                    <span className="font-mono">{invoice.vehicleNumber || invoice.transport?.vehicleNumber || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Mode</span>
                                    <span>{invoice.transport.mode || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block text-xs">Payment</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${invoice.paymentType === 'Payable' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                        {invoice.paymentType || 'Payable'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <div className="w-64 space-y-2 text-sm text-right">
                            <div className="flex justify-between text-slate-600">
                                <span>Basic Amount</span>
                                <span>₹ {Number(invoice.subtotal).toFixed(1)}</span>
                            </div>
                            {invoice.transport?.isExtra && (
                                <div className="flex justify-between text-slate-600">
                                    <span>Transport</span>
                                    <span>₹ {Number(invoice.transport.amount).toFixed(1)}</span>
                                </div>
                            )}
                            {invoice.taxType === 'CGST_SGST' ? (
                                <>
                                    <div className="flex justify-between text-slate-600">
                                        <span>CGST (9%)</span>
                                        <span>₹ {Number(invoice.cgst || 0).toFixed(1)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>SGST (9%)</span>
                                        <span>₹ {Number(invoice.sgst || 0).toFixed(1)}</span>
                                    </div>
                                </>
                            ) : invoice.taxType === 'IGST' ? (
                                <div className="flex justify-between text-slate-600">
                                    <span>IGST (18%)</span>
                                    <span>₹ {Number(invoice.igst || 0).toFixed(1)}</span>
                                </div>
                            ) : (
                                <div className="flex justify-between text-slate-600">
                                    <span>GST (18%)</span>
                                    <span>₹ {Number(invoice.taxAmount || 0).toFixed(1)}</span>
                                </div>
                            )}
                            <div className="pt-3 border-t border-slate-200 flex justify-between font-bold text-xl text-slate-900">
                                <span>Total</span>
                                <span>₹ {Number(invoice.totalAmount).toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ValidationErrorModal({ data, onClose }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-rose-100 dark:border-rose-900/30 animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-rose-50 dark:border-rose-900/20 flex justify-between items-center bg-rose-50 dark:bg-rose-900/10">
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="h-5 w-5" />
                        <h3 className="font-black text-sm uppercase tracking-wider">Validation Failed</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-full transition-colors">
                        <X className="h-5 w-5 text-rose-500" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Invoice Number</p>
                        <p className="font-mono text-lg font-bold text-slate-700 dark:text-slate-200">{data.invoiceNo}</p>
                    </div>

                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {data.errors.map((err, idx) => (
                            <div key={idx} className="bg-rose-50 dark:bg-rose-900/20 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 flex gap-3">
                                <div className="h-5 w-5 rounded-full bg-rose-200 dark:bg-rose-800 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-[10px] font-black text-rose-700 dark:text-rose-300">{idx + 1}</span>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-rose-400 uppercase tracking-tight leading-none">{err.field}</p>
                                    <p className="text-xs font-bold text-rose-900 dark:text-rose-200 leading-tight">{err.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                        >
                            Review & Fix Errors
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InvoiceItemsLoader({ invoiceId }) {
    const [items, setItems] = useState([]);

    useEffect(() => {
        const fetchItems = async () => {
            const finalQ = query(collection(db, 'invoiceItems'), where('invoiceId', '==', invoiceId));
            const snap = await getDocs(finalQ);
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchItems();
    }, [invoiceId]);

    return (
        <>
            {items.map((item, idx) => (
                <tr key={idx}>
                    <td className="py-3 font-medium text-slate-800">
                        {item.productName || item.name || item.productId || 'Unknown Item'}
                    </td>
                    <td className="py-3 text-right">{Number(item.quantity).toFixed(3)}</td>
                    <td className="py-3 text-right">₹ {Number(item.price).toFixed(2)}</td>
                    <td className="py-3 text-right">₹ {(Number(item.quantity) * Number(item.price)).toFixed(2)}</td>
                </tr>
            ))}
        </>
    );
}
