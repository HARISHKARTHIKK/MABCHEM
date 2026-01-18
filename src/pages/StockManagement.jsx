import { useState, useEffect, useMemo, Fragment } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
    Box,
    Plus,
    TrendingUp,
    Loader2,
    Search,
    AlertTriangle,
    Globe,
    Briefcase,
    Calendar,
    Save,
    LayoutDashboard,
    Package,
    ChevronDown,
    ChevronRight,
    Building2,
    Truck,
    History,
    CreditCard
} from 'lucide-react';
import { format } from 'date-fns';
import { addImportEntry, addLocalPurchase } from '../services/firestoreService';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

export default function StockManagement() {
    const { settings } = useSettings();
    const { userRole } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [products, setProducts] = useState([]);
    const [imports, setImports] = useState([]);
    const [localPurchases, setLocalPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [transporters, setTransporters] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubImports = onSnapshot(query(collection(db, 'imports'), orderBy('date', 'desc')), (snap) => {
            setImports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubLocal = onSnapshot(query(collection(db, 'localPurchases'), orderBy('date', 'desc')), (snap) => {
            setLocalPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubSuppliers = onSnapshot(query(collection(db, 'suppliers'), orderBy('name', 'asc')), (snap) => {
            setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubTransporters = onSnapshot(query(collection(db, 'transporters'), orderBy('name', 'asc')), (snap) => {
            setTransporters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snap) => {
            setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => {
            unsubProducts();
            unsubImports();
            unsubLocal();
            unsubSuppliers();
            unsubTransporters();
            unsubInvoices();
        };
    }, []);

    const stockSummary = useMemo(() => {
        const currentLocations = settings?.locations?.map(l => l.name) || ['CHENNAI', 'MUNDRA'];
        const locationNames = currentLocations.filter(name =>
            !['STORE FRONT', 'FACTORY'].includes(name.toUpperCase())
        );

        return products.map(p => {
            const prodImports = imports.filter(i => i.productId === p.id);
            const prodLocal = localPurchases.filter(l => l.productId === p.id);

            const totalImports = prodImports.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
            const totalLocal = prodLocal.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

            let totalOut = 0;
            invoices.forEach(inv => {
                (inv.itemsSummary || []).forEach(item => {
                    if (item.productId === p.id || (!item.productId && item.productName === p.name)) {
                        totalOut += Number(item.quantity) || 0;
                    }
                });
            });

            const currentBalance = Number(p.stockQty) || 0;
            const openingStock = currentBalance - ((totalImports + totalLocal) - totalOut);

            // Per Location Breakdown
            const locDetails = {};
            locationNames.forEach(locName => {
                const locInImports = prodImports.filter(i => i.location === locName).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
                const locInLocal = prodLocal.filter(l => l.location === locName).reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

                let locOut = 0;
                invoices.filter(inv => inv.fromLocation === locName).forEach(inv => {
                    (inv.itemsSummary || []).forEach(item => {
                        if (item.productId === p.id || (!item.productId && item.productName === p.name)) {
                            locOut += Number(item.quantity) || 0;
                        }
                    });
                });

                locDetails[locName] = {
                    in: Number((locInImports + locInLocal).toFixed(1)),
                    out: Number(locOut.toFixed(1)),
                    balance: Number((p.locations?.[locName] || 0).toFixed(1))
                };
            });

            return {
                id: p.id,
                name: p.name,
                openingStock: Number(openingStock.toFixed(1)),
                totalIn: Number((totalImports + totalLocal).toFixed(1)),
                totalOut: Number(totalOut.toFixed(1)),
                balance: Number(currentBalance.toFixed(1)),
                lowStock: currentBalance < 10,
                locationDetails: locDetails,
                recentTransactions: [...prodImports, ...prodLocal]
                    .sort((a, b) => b.date.localeCompare(a.date)) // Fallback to date sorting if createdAt not yet synced
                    .slice(0, 5)
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [products, imports, localPurchases, invoices, settings]);

    const stats = useMemo(() => {
        const totalUnits = products.reduce((sum, p) => sum + (Number(p.stockQty) || 0), 0);
        const totalValue = products.reduce((sum, p) => sum + ((Number(p.stockQty) || 0) * (Number(p.price) || 0)), 0);
        return { totalUnits, totalValue };
    }, [products]);

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    const availableLocations = (settings?.locations?.map(l => l.name) || ['CHENNAI', 'MUNDRA'])
        .filter(name => !['STORE FRONT', 'FACTORY'].includes(name.toUpperCase()));

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Box className="h-6 w-6 text-blue-600" />
                        Stock Management
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Multi-location tracking & Supplier entries</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all text-xs border ${activeTab === 'dashboard' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </button>
                    {userRole !== 'viewer' && (
                        <>
                            <button
                                onClick={() => setActiveTab('import')}
                                className={`flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all text-xs border ${activeTab === 'import' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            >
                                <Globe className="h-4 w-4" /> Import Entry
                            </button>
                            <button
                                onClick={() => setActiveTab('local')}
                                className={`flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all text-xs border ${activeTab === 'local' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            >
                                <Briefcase className="h-4 w-4" /> Local Purchase
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5">
                    <div className="bg-blue-50 p-4 rounded-2xl">
                        <Package className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Units In-Hand</p>
                        <p className="text-3xl font-black text-slate-900">{stats.totalUnits.toFixed(1)} <span className="text-sm font-bold text-slate-400 tracking-normal ml-1">MTS</span></p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5">
                    <div className="bg-emerald-50 p-4 rounded-2xl">
                        <TrendingUp className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Stock Value</p>
                        <p className="text-3xl font-black text-emerald-600">₹{stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                    </div>
                </div>
            </div>

            {activeTab === 'dashboard' && <StockDashboard summary={stockSummary} imports={imports} localPurchases={localPurchases} products={products} />}
            {activeTab === 'import' && <ImportForm products={products} suppliers={suppliers} transporters={transporters} settings={settings} locations={availableLocations} onSuccess={() => setActiveTab('dashboard')} />}
            {activeTab === 'local' && <LocalPurchaseForm products={products} suppliers={suppliers} transporters={transporters} settings={settings} locations={availableLocations} onSuccess={() => setActiveTab('dashboard')} />}
        </div>
    );
}

function StockDashboard({ summary, imports, localPurchases, products }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState(new Set());

    const toggleRow = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    const filteredSummary = summary.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search product..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
                    <thead className="bg-slate-50 text-slate-700 font-black uppercase text-[10px] tracking-[0.2em] border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 w-10"></th>
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4 text-center">Opening</th>
                            <th className="px-6 py-4 text-center">Total In</th>
                            <th className="px-6 py-4 text-center">Total Out</th>
                            <th className="px-6 py-4 text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredSummary.map((item) => (
                            <Fragment key={item.id}>
                                <tr
                                    onClick={() => toggleRow(item.id)}
                                    className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${item.lowStock ? 'bg-rose-50/30' : ''}`}
                                >
                                    <td className="px-6 py-4">
                                        {expandedRows.has(item.id) ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <span className={`font-bold ${item.lowStock ? 'text-rose-700' : 'text-slate-900'}`}>{item.name}</span>
                                            {item.lowStock && <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase">Low</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-slate-400">{item.openingStock.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-center font-bold text-emerald-600">+{item.totalIn.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-center font-bold text-rose-400">-{item.totalOut.toFixed(1)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`text-base font-black ${item.lowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                                            {item.balance.toFixed(1)}
                                        </span>
                                    </td>
                                </tr>
                                {expandedRows.has(item.id) && (
                                    <tr className="bg-slate-50/50">
                                        <td colSpan="6" className="px-6 py-6 border-b border-slate-200">
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {Object.entries(item.locationDetails).map(([locName, data]) => (
                                                        <div key={locName} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                                                            <div className="flex items-center gap-2 mb-3 border-b border-slate-50 pb-2">
                                                                <Building2 className="h-4 w-4 text-blue-600" />
                                                                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{locName}</span>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase">Input</span>
                                                                    <span className="text-sm font-bold text-emerald-600">+{data.in}</span>
                                                                </div>
                                                                <div className="flex flex-col border-x border-slate-100 px-2 text-center">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase">Output</span>
                                                                    <span className="text-sm font-bold text-rose-500">-{data.out}</span>
                                                                </div>
                                                                <div className="flex flex-col text-right">
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase">Stock</span>
                                                                    <span className="text-sm font-black text-slate-900">{data.balance}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Inward History for this Product */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2 mb-2 px-1">
                                                        <History className="h-3.5 w-3.5 text-slate-400" />
                                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Latest Inward Ledger</h4>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {item.recentTransactions.map(tx => (
                                                            <div key={tx.id} className="bg-white px-4 py-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm">
                                                                <div className="flex items-center gap-4">
                                                                    <div className={`p-1.5 rounded-lg ${tx.beNumber ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                        {tx.beNumber ? <Globe className="h-3.5 w-3.5" /> : <Briefcase className="h-3.5 w-3.5" />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs font-black text-slate-900">{tx.quantity} MTs</span>
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-50 px-1.5 py-0.5 rounded italic">@{tx.location}</span>
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                                                                            <Truck className="h-3 w-3 text-blue-500" />
                                                                            {tx.transporterName || 'Self Transport'}
                                                                            <span className="text-slate-300">•</span>
                                                                            {tx.vehicleNumber || 'N/A'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[10px] font-black text-slate-800 uppercase">{tx.supplierName}</div>
                                                                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">{tx.date}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {item.recentTransactions.length === 0 && (
                                                            <div className="text-center py-4 text-xs font-bold text-slate-400 italic">No recent inward entries.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Recent Activity Feed */}
            <div className="mt-8 p-6 bg-slate-50/50 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                    <History className="h-5 w-5 text-slate-500" />
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Recent Inward Activity</h3>
                </div>
                <div className="space-y-3">
                    {[...imports, ...localPurchases]
                        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                        .slice(0, 10)
                        .map(item => {
                            const isImport = item.beNumber !== undefined;
                            const productName = products.find(p => p.id === item.productId)?.name || 'Unknown';

                            return (
                                <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-blue-200 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-xl ${isImport ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {isImport ? <Globe className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900">{productName}</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${isImport ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {isImport ? 'Import' : 'Local'}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] font-bold text-slate-400">
                                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {item.date}</span>
                                                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {item.location}</span>
                                                <span className="text-slate-900 font-extrabold truncate max-w-[120px]">{item.supplierName}</span>
                                                <span className="flex items-center gap-1 text-blue-600"><Truck className="h-3 w-3" /> {item.transporterName || 'Self'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-6 md:gap-12">
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Quantity</p>
                                            <p className="text-lg font-black text-slate-900">{(Number(item.quantity) || 0).toFixed(1)} <span className="text-[10px] text-slate-400">MT</span></p>
                                        </div>

                                        {item.vehicleNumber && (
                                            <div className="text-right border-l border-slate-100 pl-6">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p>
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <Truck className="h-3 w-3 text-blue-500" />
                                                    <p className="text-sm font-black text-blue-600 uppercase">{item.vehicleNumber}</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="text-right border-l border-slate-100 pl-6">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Payment</p>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.paymentType === 'Payable' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {item.paymentType || 'Payable'}
                                            </span>
                                        </div>

                                        <div className="text-right border-l border-slate-100 pl-6">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Ref No</p>
                                            <p className="text-sm font-mono font-bold text-slate-600 uppercase">{item.beNumber || item.invoiceNo}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                    {[...imports, ...localPurchases].length === 0 && (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm italic">
                            No inward records found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ImportForm({ products, suppliers, transporters, settings, locations, onSuccess }) {
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        supplierId: '',
        beNumber: '',
        blNumber: '',
        productId: '',
        quantity: '',
        currency: 'USD',
        rate: '',
        location: locations[0] || 'Warehouse A',
        vehicleNumber: '',
        transporterId: '',
        transporterGSTIN: '',
        transportMode: 'By Road',
        transportCost: '',
        transportAdvance: '',
        transportPaymentType: 'Payable',
        transportPricing: 'Included',
        remarks: '',
        paymentStatus: 'Pending',
        paymentMode: 'Bank Transfer',
        amountPaid: '',
        bags: '',
        weightPerBag: '50',
    });

    const calculateTotals = () => {
        const qty = Number(formData.quantity) || 0;
        const rate = Number(formData.rate) || 0;
        const transportCost = Number(formData.transportCost) || 0;
        const transportAdvance = Number(formData.transportAdvance) || 0;
        const amountPaid = Number(formData.amountPaid) || 0;

        const totalPrice = qty * rate;
        const balanceDue = totalPrice - amountPaid;
        const balanceFreight = transportCost - transportAdvance;

        return { totalPrice, balanceDue, balanceFreight };
    };

    const handleFieldChange = (field, value) => {
        let newFormData = { ...formData, [field]: value };

        if (field === 'bags' || field === 'weightPerBag') {
            const bagsCount = Number(newFormData.bags) || 0;
            const weightPerBag = Number(newFormData.weightPerBag) || 0;
            if (bagsCount > 0 && weightPerBag > 0) {
                newFormData.quantity = String((bagsCount * weightPerBag) / 1000);
            }
        }

        setFormData(newFormData);
    };

    const totals = calculateTotals();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const supplier = suppliers.find(s => s.id === formData.supplierId);
            const transporter = transporters.find(t => t.id === formData.transporterId);
            await addImportEntry({
                ...formData,
                supplierName: supplier?.name || 'Unknown',
                transporterName: transporter?.name || '',
                beNumber: formData.beNumber.toUpperCase(),
                blNumber: formData.blNumber.toUpperCase(),
                totalPrice: Number(totals.totalPrice.toFixed(2)),
                balanceDue: Number(totals.balanceDue.toFixed(2)),
                transportAdvance: Number(formData.transportAdvance) || 0,
                balanceFreight: Number(totals.balanceFreight.toFixed(2)),
                transportType: 'INWARD'
            });
            onSuccess();
        } catch (error) {
            alert(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-xl"><Globe className="h-5 w-5 text-indigo-600" /></div>
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">International Import Entry</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Arrival Date</label>
                        <input type="date" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    </div>

                    <div className="space-y-1.5 lg:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier (Import)</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
                            <option value="">Select Supplier...</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.gstin || 'N/A'})</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">BE# (Bill of Entry)</label>
                        <input type="text" required placeholder="BE-XXXXXX" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm uppercase" value={formData.beNumber} onChange={e => setFormData({ ...formData, beNumber: e.target.value.toUpperCase() })} />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">BL# (Bill of Lading)</label>
                        <input type="text" required placeholder="BL-XXXXXX" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm uppercase" value={formData.blNumber} onChange={e => setFormData({ ...formData, blNumber: e.target.value.toUpperCase() })} />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Storage Location (Target)</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm appearance-none cursor-pointer" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={formData.productId} onChange={e => setFormData({ ...formData, productId: e.target.value })}>
                            <option value="">Choose Product...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bags</label>
                                <input type="number" placeholder="0" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={formData.bags} onChange={e => handleFieldChange('bags', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Wt (kg)</label>
                                <input type="number" placeholder="50" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={formData.weightPerBag} onChange={e => handleFieldChange('weightPerBag', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity (MTs)</label>
                        <input
                            type="number"
                            step="any"
                            readOnly
                            tabIndex="-1"
                            placeholder="0.00"
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-black text-indigo-600 dark:text-indigo-400 cursor-not-allowed"
                            value={formData.quantity}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit Price ({formData.currency})</label>
                        <div className="flex gap-2">
                            <select className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs font-bold" value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })}>
                                <option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option>
                            </select>
                            <input type="number" step="any" required placeholder="0.00" className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
                        </div>
                    </div>

                    <div className="lg:col-span-3 border-t border-slate-100 pt-6 mt-4">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-6 w-1 bg-indigo-600 rounded-full"></div>
                            <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Transportation, Logistics & Notes</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Column 1: Vehicle & Transporter */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Select Transporter</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                                        value={formData.transporterId}
                                        onChange={(e) => {
                                            const tId = e.target.value;
                                            const selectedT = transporters.find(t => t.id === tId);
                                            setFormData({
                                                ...formData,
                                                transporterId: tId,
                                                transporterGSTIN: selectedT?.gstin || ''
                                            });
                                        }}
                                    >
                                        <option value="">Select Transporter...</option>
                                        {transporters.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} {t.gstin ? `(${t.gstin})` : '(No GSTIN)'}</option>
                                        ))}
                                    </select>
                                    {formData.transporterId && !formData.transporterGSTIN && (
                                        <p className="mt-1 text-[9px] text-amber-600 font-bold flex items-center gap-1 leading-tight">
                                            <AlertTriangle className="h-2.5 w-2.5" /> Warning: Transporter missing GSTIN.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Vehicle / Truck Number</label>
                                    <input
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
                                        placeholder="MH-XX-XX-XXXX"
                                        value={formData.vehicleNumber}
                                        onChange={e => setFormData({ ...formData, vehicleNumber: e.target.value.toUpperCase() })}
                                    />
                                </div>
                            </div>

                            {/* Column 2: Cost & Payment */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Freight Cost (₹)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={formData.transportCost}
                                            onChange={e => setFormData({ ...formData, transportCost: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Advance Paid</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={formData.transportAdvance}
                                            onChange={e => setFormData({ ...formData, transportAdvance: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Balance Freight</label>
                                        <input
                                            readOnly
                                            tabIndex="-1"
                                            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-blue-600 dark:text-blue-400 cursor-not-allowed outline-none"
                                            value={`₹${totals.balanceFreight.toLocaleString()}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Payment Type</label>
                                        <select
                                            className={`w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-colors ${formData.transportPaymentType === 'Payable' ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}
                                            value={formData.transportPaymentType}
                                            onChange={(e) => setFormData({ ...formData, transportPaymentType: e.target.value })}
                                        >
                                            <option value="Payable">Payable</option>
                                            <option value="Paid">Paid</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Method</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={formData.transportMode}
                                            onChange={e => setFormData({ ...formData, transportMode: e.target.value })}
                                        >
                                            <option value="">N/A</option>
                                            {(settings?.transport?.modes || ['By Road', 'By Sea', 'By Air']).map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Pricing</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={formData.transportPricing}
                                            onChange={e => setFormData({ ...formData, transportPricing: e.target.value })}
                                        >
                                            <option value="Included">Included</option>
                                            <option value="Excluded">Excluded</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Remarks */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Remarks / Internal Notes</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] resize-none"
                                    placeholder="Add notes about this import..."
                                    value={formData.remarks}
                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payment Details Section */}
                    <div className="lg:col-span-3 border-t border-slate-50 pt-6 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard className="h-4 w-4 text-indigo-500" />
                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Payment Details</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Status</label>
                                <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs" value={formData.paymentStatus} onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}>
                                    <option value="Pending">Pending</option>
                                    <option value="Partially Paid">Partially Paid</option>
                                    <option value="Paid">Paid</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Mode</label>
                                <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs" value={formData.paymentMode} onChange={e => setFormData({ ...formData, paymentMode: e.target.value })}>
                                    <option value="Cash">Cash</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Credit">Credit</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount Paid ({formData.currency})</label>
                                <input type="number" step="any" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-xs" value={formData.amountPaid} onChange={e => setFormData({ ...formData, amountPaid: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Balance Due ({formData.currency})</label>
                                <input
                                    readOnly
                                    tabIndex="-1"
                                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-slate-600 dark:text-slate-400 cursor-not-allowed outline-none"
                                    value={totals.balanceDue.toFixed(2)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Purchase Amount</span>
                        <input
                            readOnly
                            tabIndex="-1"
                            className="bg-transparent border-none text-2xl font-black text-slate-900 dark:text-white outline-none cursor-not-allowed"
                            value={`${formData.currency} ${totals.totalPrice.toLocaleString()}`}
                        />
                    </div>
                    <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Import Entry
                    </button>
                </div>
            </form>
        </div>
    );
}

function LocalPurchaseForm({ products, suppliers, transporters, settings, locations, onSuccess }) {
    const [isSaving, setIsSaving] = useState(false);
    const [addToExpense, setAddToExpense] = useState(true);
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        supplierId: '',
        invoiceNo: '',
        productId: '',
        quantity: '',
        pricePerUnit: '',
        location: locations[0] || 'Warehouse A',
        vehicleNumber: '',
        transporterId: '',
        transporterGSTIN: '',
        transportMode: 'By Road',
        transportCost: '',
        transportAdvance: '',
        transportPaymentType: 'Payable',
        transportPricing: 'Included',
        remarks: '',
        paymentStatus: 'Pending',
        paymentMode: 'Bank Transfer',
        amountPaid: '',
        bags: '',
        weightPerBag: '50',
    });

    const calculateTotals = () => {
        const qty = Number(formData.quantity) || 0;
        const pricePerUnit = Number(formData.pricePerUnit) || 0;
        const transportCost = Number(formData.transportCost) || 0;
        const transportAdvance = Number(formData.transportAdvance) || 0;
        const amountPaid = Number(formData.amountPaid) || 0;

        const totalPrice = qty * pricePerUnit;
        const balanceDue = totalPrice - amountPaid;
        const balanceFreight = transportCost - transportAdvance;

        return { totalPrice, balanceDue, balanceFreight };
    };

    const handleFieldChange = (field, value) => {
        let newFormData = { ...formData, [field]: value };

        if (field === 'bags' || field === 'weightPerBag') {
            const bagsCount = Number(newFormData.bags) || 0;
            const weightPerBag = Number(newFormData.weightPerBag) || 0;
            if (bagsCount > 0 && weightPerBag > 0) {
                newFormData.quantity = String((bagsCount * weightPerBag) / 1000);
            }
        }

        setFormData(newFormData);
    };

    const totals = calculateTotals();

    const totalPrice = (Number(formData.quantity) || 0) * (Number(formData.pricePerUnit) || 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const supplier = suppliers.find(s => s.id === formData.supplierId);
            const transporter = transporters.find(t => t.id === formData.transporterId);
            await addLocalPurchase({
                ...formData,
                supplierName: supplier?.name || 'Unknown',
                transporterName: transporter?.name || '',
                totalPrice: Number(totals.totalPrice.toFixed(2)),
                balanceDue: Number(totals.balanceDue.toFixed(2)),
                transportAdvance: Number(formData.transportAdvance) || 0,
                balanceFreight: Number(totals.balanceFreight.toFixed(2)),
                transportType: 'INWARD'
            }, addToExpense);
            onSuccess();
        } catch (error) {
            alert(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-xl"><Briefcase className="h-5 w-5 text-emerald-600" /></div>
                <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Domestic Local Purchase</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Purchase Date</label>
                        <input type="date" required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    </div>

                    <div className="space-y-1.5 lg:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supplier (Domestic)</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
                            <option value="">Select Supplier...</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.gstin || 'N/A'})</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Inv# (Tax Invoice)</label>
                        <input type="text" required placeholder="INV-XXXX" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm uppercase" value={formData.invoiceNo} onChange={e => setFormData({ ...formData, invoiceNo: e.target.value.toUpperCase() })} />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Storage Location (Target)</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}>
                            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product</label>
                        <select required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.productId} onChange={e => setFormData({ ...formData, productId: e.target.value })}>
                            <option value="">Choose Product...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bags</label>
                                <input type="number" placeholder="0" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.bags} onChange={e => handleFieldChange('bags', e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Wt (kg)</label>
                                <input type="number" placeholder="50" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-sm" value={formData.weightPerBag} onChange={e => handleFieldChange('weightPerBag', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantity (MTs)</label>
                        <input
                            type="number"
                            step="any"
                            readOnly
                            tabIndex="-1"
                            placeholder="0.00"
                            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-black text-emerald-600 dark:text-emerald-400 cursor-not-allowed"
                            value={formData.quantity}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Price Per Ton (INR)</label>
                        <input type="number" step="any" required placeholder="₹ 0.00" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold" value={formData.pricePerUnit} onChange={e => setFormData({ ...formData, pricePerUnit: e.target.value })} />
                    </div>

                    <div className="lg:col-span-3 border-t border-slate-100 pt-6 mt-4">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-6 w-1 bg-emerald-600 rounded-full"></div>
                            <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Transportation, Logistics & Notes</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {/* Column 1: Vehicle & Transporter */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Select Transporter</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                                        value={formData.transporterId}
                                        onChange={(e) => {
                                            const tId = e.target.value;
                                            const selectedT = transporters.find(t => t.id === tId);
                                            setFormData({
                                                ...formData,
                                                transporterId: tId,
                                                transporterGSTIN: selectedT?.gstin || ''
                                            });
                                        }}
                                    >
                                        <option value="">Select Transporter...</option>
                                        {transporters.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} {t.gstin ? `(${t.gstin})` : '(No GSTIN)'}</option>
                                        ))}
                                    </select>
                                    {formData.transporterId && !formData.transporterGSTIN && (
                                        <p className="mt-1 text-[9px] text-amber-600 font-bold flex items-center gap-1 leading-tight">
                                            <AlertTriangle className="h-2.5 w-2.5" /> Warning: Transporter missing GSTIN.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Vehicle / Truck Number</label>
                                    <input
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono"
                                        placeholder="MH-XX-XX-XXXX"
                                        value={formData.vehicleNumber}
                                        onChange={e => setFormData({ ...formData, vehicleNumber: e.target.value.toUpperCase() })}
                                    />
                                </div>
                            </div>

                            {/* Column 2: Cost & Payment */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Freight Cost (₹)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={formData.transportCost}
                                            onChange={e => setFormData({ ...formData, transportCost: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Advance Paid</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={formData.transportAdvance}
                                            onChange={e => setFormData({ ...formData, transportAdvance: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Balance Freight</label>
                                        <input
                                            readOnly
                                            tabIndex="-1"
                                            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-blue-600 dark:text-blue-400 cursor-not-allowed outline-none"
                                            value={`₹${totals.balanceFreight.toLocaleString()}`}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Payment Type</label>
                                        <select
                                            className={`w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer transition-colors ${formData.transportPaymentType === 'Payable' ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}
                                            value={formData.transportPaymentType}
                                            onChange={(e) => setFormData({ ...formData, transportPaymentType: e.target.value })}
                                        >
                                            <option value="Payable">Payable</option>
                                            <option value="Paid">Paid</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Method</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={formData.transportMode}
                                            onChange={e => setFormData({ ...formData, transportMode: e.target.value })}
                                        >
                                            <option value="">N/A</option>
                                            {(settings?.transport?.modes || ['By Road', 'By Sea', 'By Air']).map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Pricing</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={formData.transportPricing}
                                            onChange={e => setFormData({ ...formData, transportPricing: e.target.value })}
                                        >
                                            <option value="Included">Included</option>
                                            <option value="Excluded">Excluded</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3: Remarks */}
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Remarks / Internal Notes</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none min-h-[120px] resize-none"
                                    placeholder="Add notes about this purchase..."
                                    value={formData.remarks}
                                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Payment Details Section */}
                    <div className="lg:col-span-3 border-t border-slate-50 pt-6 mt-4">
                        <div className="flex items-center gap-2 mb-4">
                            <CreditCard className="h-4 w-4 text-emerald-500" />
                            <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Payment Details</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Status</label>
                                <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-xs" value={formData.paymentStatus} onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}>
                                    <option value="Pending">Pending</option>
                                    <option value="Partially Paid">Partially Paid</option>
                                    <option value="Paid">Paid</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Mode</label>
                                <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-xs" value={formData.paymentMode} onChange={e => setFormData({ ...formData, paymentMode: e.target.value })}>
                                    <option value="Cash">Cash</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Credit">Credit</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount Paid (₹)</label>
                                <input type="number" step="any" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-xs" value={formData.amountPaid} onChange={e => setFormData({ ...formData, amountPaid: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Balance Due (INR)</label>
                                <input
                                    readOnly
                                    tabIndex="-1"
                                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs text-slate-600 dark:text-slate-400 cursor-not-allowed outline-none"
                                    value={totals.balanceDue.toFixed(2)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Purchase Amount</span>
                            <input
                                readOnly
                                tabIndex="-1"
                                className="bg-transparent border-none text-2xl font-black text-slate-900 dark:text-white outline-none cursor-not-allowed"
                                value={`INR ${totals.totalPrice.toLocaleString()}`}
                            />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer select-none border-l border-slate-200 pl-6">
                            <input type="checkbox" className="w-4 h-4 rounded text-emerald-500" checked={addToExpense} onChange={e => setAddToExpense(e.target.checked)} /><span className="text-xs font-black text-slate-600 uppercase tracking-tighter">Add to Expenses?</span>
                        </label>
                    </div>
                    <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Purchase Entry
                    </button>
                </div>
            </form>
        </div>
    );
}
