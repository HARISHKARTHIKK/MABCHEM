import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { addExpense, deleteExpense, addIncome, deleteIncome, addExpensesBulk } from '../services/firestoreService';
import { Loader2, Plus, Trash2, Calendar, Receipt, TrendingDown, Filter, Download, Wallet, ArrowUpCircle, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

const CATEGORIES = ['Labour', 'Fuel', 'Overtime', 'Other OVERHEADS'];
const CATEGORY_COLORS = {
    'Labour': 'bg-blue-100 text-blue-700 border-blue-200',
    'Fuel': 'bg-orange-100 text-orange-700 border-orange-200',
    'Overtime': 'bg-purple-100 text-purple-700 border-purple-200',
    'Other OVERHEADS': 'bg-slate-100 text-slate-700 border-slate-200'
};

export default function Expenses() {
    const { userRole } = useAuth();
    const [expenses, setExpenses] = useState([]);
    const [income, setIncome] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [dateFilter, setDateFilter] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const years = [2024, 2025, 2026];

    useEffect(() => {
        const date = new Date(selectedYear, selectedMonth, 1);
        setDateFilter({
            start: format(startOfMonth(date), 'yyyy-MM-dd'),
            end: format(endOfMonth(date), 'yyyy-MM-dd')
        });
    }, [selectedMonth, selectedYear]);

    const [selectedTab, setSelectedTab] = useState('All');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Dynamic Multi-Row State
    const [entryRows, setEntryRows] = useState([{
        id: Date.now(),
        date: format(new Date(), 'yyyy-MM-dd'),
        amounts: { Fuel: '', 'Other OVERHEADS': '' },
        descriptions: { Labour: '', Fuel: '', Overtime: '', 'Other OVERHEADS': '' },
        labourQty: '',
        labourRate: '',
        overtimeHeads: '',
        overtimeRate: ''
    }]);

    const addRow = () => {
        setEntryRows(prev => [...prev, {
            id: Date.now(),
            date: format(new Date(), 'yyyy-MM-dd'),
            amounts: { Fuel: '', 'Other OVERHEADS': '' },
            descriptions: { Labour: '', Fuel: '', Overtime: '', 'Other OVERHEADS': '' },
            labourQty: '',
            labourRate: '',
            overtimeHeads: '',
            overtimeRate: ''
        }]);
    };

    const removeRow = (id) => {
        if (entryRows.length > 1) {
            setEntryRows(prev => prev.filter(row => row.id !== id));
        }
    };

    const updateRow = (id, updates) => {
        setEntryRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
    };

    const [incomeFormData, setIncomeFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        description: ''
    });

    useEffect(() => {
        const qE = query(collection(db, 'expenses'), orderBy('date', 'desc'));
        const unsubE = onSnapshot(qE, (snapshot) => {
            setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const qI = query(collection(db, 'income'), orderBy('date', 'desc'));
        const unsubI = onSnapshot(qI, (snapshot) => {
            setIncome(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubE();
            unsubI();
        };
    }, []);

    const handleIncomeSubmit = async (e) => {
        e.preventDefault();
        try {
            await addIncome({
                ...incomeFormData,
                amount: Number(incomeFormData.amount)
            });
            setIncomeFormData({
                date: format(new Date(), 'yyyy-MM-dd'),
                amount: '',
                description: ''
            });
            setIsIncomeModalOpen(false);
        } catch (error) {
            alert("Error adding income: " + error.message);
        }
    };

    const handleIncomeDelete = async (id) => {
        if (window.confirm("Delete this income entry?")) {
            try {
                await deleteIncome(id);
            } catch (error) {
                alert("Error deleting income: " + error.message);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const validEntries = [];
        entryRows.forEach(row => {
            CATEGORIES.forEach(cat => {
                let amount = 0;
                if (cat === 'Labour') {
                    amount = (Number(row.labourQty) || 0) * (Number(row.labourRate) || 0);
                } else if (cat === 'Overtime') {
                    amount = (Number(row.overtimeHeads) || 0) * (Number(row.overtimeRate) || 0);
                } else {
                    amount = Number(row.amounts[cat]) || 0;
                }

                const description = row.descriptions[cat];
                if (amount > 0) {
                    validEntries.push({
                        date: row.date,
                        category: cat,
                        amount: amount,
                        description: description || ''
                    });
                }
            });
        });

        if (validEntries.length === 0) {
            alert("No valid expenses to save. Please enter amounts for at least one category.");
            return;
        }

        setIsSaving(true);
        try {
            await addExpensesBulk(validEntries);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

            // Clear entries
            setEntryRows([{
                id: Date.now(),
                date: format(new Date(), 'yyyy-MM-dd'),
                amounts: { Fuel: '', 'Other OVERHEADS': '' },
                descriptions: { Labour: '', Fuel: '', Overtime: '', 'Other OVERHEADS': '' },
                labourQty: '',
                labourRate: '',
                overtimeHeads: '',
                overtimeRate: ''
            }]);
        } catch (error) {
            alert("Error saving bulk expenses: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this expense?")) {
            try {
                await deleteExpense(id);
            } catch (error) {
                alert("Error deleting expense: " + error.message);
            }
        }
    };

    const filteredByDate = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return isWithinInterval(expDate, {
            start: startOfDay(new Date(dateFilter.start)),
            end: endOfDay(new Date(dateFilter.end))
        });
    });

    const categoryTotals = CATEGORIES.reduce((acc, cat) => {
        acc[cat] = filteredByDate
            .filter(exp => exp.category === cat)
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);
        return acc;
    }, {});

    const totalExpense = filteredByDate.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const filteredIncomeByDate = income.filter(inc => {
        const incDate = new Date(inc.date);
        return isWithinInterval(incDate, {
            start: startOfDay(new Date(dateFilter.start)),
            end: endOfDay(new Date(dateFilter.end))
        });
    });

    const totalIncome = filteredIncomeByDate.reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const balance = totalIncome - totalExpense;

    const displayExpenses = selectedTab === 'All'
        ? filteredByDate
        : filteredByDate.filter(exp => exp.category === selectedTab);

    const handleExcelExport = () => {
        const expenseData = filteredByDate.map(exp => ({
            'Type': 'EXPENSE',
            'Date': format(new Date(exp.date), 'dd-MM-yyyy'),
            'Category': exp.category,
            'Amount': exp.amount,
            'Description': exp.description || '-'
        }));

        const incomeData = filteredIncomeByDate.map(inc => ({
            'Type': 'INCOME',
            'Date': format(new Date(inc.date), 'dd-MM-yyyy'),
            'Category': 'Cash In',
            'Amount': inc.amount,
            'Description': inc.description || '-'
        }));

        const fullData = [...expenseData, ...incomeData];

        // Add Summary Section
        fullData.push({});
        fullData.push({ 'Type': 'CASH FLOW SUMMARY' });
        CATEGORIES.forEach(cat => {
            fullData.push({ 'Category': `${cat} Expense`, 'Amount': categoryTotals[cat] });
        });
        fullData.push({ 'Type': 'SUMMARY', 'Category': 'Total Expenses', 'Amount': totalExpense });
        fullData.push({ 'Type': 'SUMMARY', 'Category': 'Total Income', 'Amount': totalIncome });
        fullData.push({ 'Type': 'SUMMARY', 'Category': 'CASH IN HAND', 'Amount': balance });

        const worksheet = XLSX.utils.json_to_sheet(fullData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Flow Report");
        XLSX.writeFile(workbook, `Cash_Flow_Report_${dateFilter.start}_to_${dateFilter.end}.xlsx`);
    };

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="h-6 w-6 text-indigo-600" />
                        Finances & Expenses
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Track cash flow, overheads and income</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-transparent border-none text-xs font-black text-slate-700 focus:ring-0 cursor-pointer outline-none px-2"
                        >
                            {months.map((m, i) => (
                                <option key={m} value={i}>{m}</option>
                            ))}
                        </select>
                        <div className="w-px h-4 bg-slate-300 mx-1" />
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-transparent border-none text-xs font-black text-slate-700 focus:ring-0 cursor-pointer outline-none px-2"
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleExcelExport}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 text-xs"
                    >
                        <Download className="h-4 w-4" /> Export
                    </button>
                    {userRole !== 'viewer' && (
                        <button
                            onClick={() => setIsIncomeModalOpen(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-3 sm:py-2.5 rounded-xl font-bold transition-all shadow-md shadow-green-500/20 active:scale-95 text-xs"
                        >
                            <ArrowUpCircle className="h-4 w-4" /> Income
                        </button>
                    )}
                </div>
            </div>

            {/* Combined Financial & Division Summary Bar (Adaptive Grid) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3">
                {/* Main Stats */}
                <div className="bg-white p-2.5 md:p-3 rounded-xl border border-green-100 shadow-sm flex flex-col items-center justify-center min-h-[60px] md:min-h-[70px]">
                    <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Income</span>
                    <span className="text-[11px] md:text-xs font-medium text-green-600 truncate w-full text-center">₹{totalIncome.toLocaleString()}</span>
                </div>
                <div className="bg-white p-2.5 md:p-3 rounded-xl border border-orange-100 shadow-sm flex flex-col items-center justify-center min-h-[60px] md:min-h-[70px]">
                    <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Exp.</span>
                    <span className="text-[11px] md:text-xs font-medium text-orange-600 truncate w-full text-center">₹{totalExpense.toLocaleString()}</span>
                </div>
                <div className={`p-2.5 md:p-3 rounded-xl border shadow-sm flex flex-col items-center justify-center min-h-[60px] md:min-h-[70px] ${balance >= 0 ? 'bg-green-50 border-green-200' : 'bg-rose-50 border-rose-200'}`}>
                    <span className="text-[8px] md:text-[9px] font-black text-slate-400 tracking-widest mb-0.5">CASH</span>
                    <span className={`text-[11px] md:text-lg font-black ${balance >= 0 ? 'text-green-800' : 'text-rose-800'} truncate w-full text-center`}>₹{balance.toLocaleString()}</span>
                </div>

                {/* Category Stats - Matching Design */}
                {CATEGORIES.map(cat => (
                    <div key={cat} className="bg-white p-2.5 md:p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center min-h-[60px] md:min-h-[70px] relative overflow-hidden">
                        <div className={`absolute left-0 top-0 w-1 h-full ${cat === 'Labour' ? 'bg-blue-500' :
                            cat === 'Fuel' ? 'bg-orange-500' :
                                cat === 'Overtime' ? 'bg-purple-500' :
                                    'bg-slate-400'
                            }`} />
                        <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 truncate w-full text-center">{cat.split(' ')[0]}</span>
                        <span className={`text-[11px] md:text-xs font-medium ${cat === 'Labour' ? 'text-blue-600' :
                            cat === 'Fuel' ? 'text-orange-600' :
                                cat === 'Overtime' ? 'text-purple-600' :
                                    'text-slate-700'
                            } truncate w-full text-center`}>₹{categoryTotals[cat].toLocaleString()}</span>
                    </div>
                ))}
            </div>

            {/* Dynamic Multi-Row Bulk Entry Card */}
            {userRole !== 'viewer' && (
                <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-200 relative overflow-hidden">
                    {isSaving && (
                        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                            <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-2" />
                            <p className="font-black text-indigo-900 uppercase tracking-widest text-xs">Saving Entries...</p>
                        </div>
                    )}
                    {saveSuccess && (
                        <div className="absolute inset-0 z-50 bg-emerald-50 bg-opacity-95 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                            <CheckCircle2 className="h-12 w-12 text-emerald-600 mb-2" />
                            <p className="font-black text-emerald-900 uppercase tracking-widest text-sm">Success! Expenses Saved</p>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-rose-50 rounded-xl"><Receipt className="h-5 w-5 text-rose-600" /></div>
                            <div>
                                <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Bulk Expense Entry</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Add multiple records in one go</p>
                            </div>
                        </div>
                        <button
                            onClick={addRow}
                            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
                        >
                            <Plus className="h-4 w-4" /> Add Another Row
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {entryRows.map((row, index) => (
                            <div
                                key={row.id}
                                className="bg-slate-50 border border-slate-200 p-3 sm:p-4 rounded-2xl flex flex-col xl:flex-row gap-3 md:gap-4 relative group"
                            >
                                {/* Mobile Delete Button */}
                                <button
                                    onClick={() => removeRow(row.id)}
                                    className="absolute -top-2 -right-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 p-2 rounded-full shadow-lg transition-all xl:hidden z-10"
                                >
                                    <X className="h-4 w-4" />
                                </button>

                                {/* Row Serial & Date */}
                                <div className="xl:w-40 shrink-0 flex flex-row xl:flex-col gap-2 items-center xl:items-start">
                                    <span className="bg-slate-200 text-slate-500 w-8 h-8 md:w-6 md:h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{index + 1}</span>
                                    <input
                                        type="date"
                                        required
                                        className="flex-1 md:w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-rose-500 outline-none"
                                        value={row.date}
                                        onChange={e => updateRow(row.id, { date: e.target.value })}
                                    />
                                </div>

                                {/* Category Grid - Multi-Entry Allowed */}
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    {CATEGORIES.map(cat => {
                                        let amount = 0;
                                        if (cat === 'Labour') amount = (Number(row.labourQty) || 0) * (Number(row.labourRate) || 0);
                                        else if (cat === 'Overtime') amount = (Number(row.overtimeHeads) || 0) * (Number(row.overtimeRate) || 0);
                                        else amount = Number(row.amounts[cat]) || 0;

                                        const description = row.descriptions[cat];
                                        const hasData = amount > 0 || description;

                                        return (
                                            <div
                                                key={cat}
                                                className={`flex flex-col p-2 rounded-xl border-2 transition-all ${hasData
                                                    ? 'bg-white shadow-sm ring-1 ring-inset ' + (
                                                        cat === 'Labour' ? 'ring-blue-100 border-blue-200' :
                                                            cat === 'Fuel' ? 'ring-orange-100 border-orange-200' :
                                                                cat === 'Overtime' ? 'ring-purple-100 border-purple-200' :
                                                                    'ring-slate-100 border-slate-200'
                                                    )
                                                    : 'bg-white/50 border-transparent hover:border-slate-200'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1.5 px-0.5">
                                                    <span className={`text-[9px] font-black uppercase tracking-tight ${hasData
                                                        ? (cat === 'Labour' ? 'text-blue-600' : cat === 'Fuel' ? 'text-orange-600' : cat === 'Overtime' ? 'text-purple-600' : 'text-slate-700')
                                                        : 'text-slate-400'
                                                        }`}>{cat}</span>
                                                </div>

                                                <input
                                                    type="text"
                                                    placeholder="DESCRIPTION..."
                                                    className="w-full bg-slate-100/50 border-none px-2 py-1.5 rounded-lg text-[10px] font-bold placeholder:text-slate-300 focus:ring-1 focus:ring-rose-400 outline-none mb-2"
                                                    value={row.descriptions[cat]}
                                                    onChange={e => updateRow(row.id, {
                                                        descriptions: { ...row.descriptions, [cat]: e.target.value.toUpperCase() }
                                                    })}
                                                />

                                                {cat === 'Labour' ? (
                                                    <div className="grid grid-cols-3 gap-1">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1">Qty (Tons)</span>
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-[10px] font-black text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                value={row.labourQty}
                                                                onChange={e => updateRow(row.id, { labourQty: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1">Rate</span>
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-[10px] font-black text-slate-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                value={row.labourRate}
                                                                onChange={e => updateRow(row.id, { labourRate: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1 text-center">Total</span>
                                                            <input
                                                                value={`₹${(Number(row.labourQty) * Number(row.labourRate)).toLocaleString()}`}
                                                                readOnly
                                                                tabIndex="-1"
                                                                className="w-full bg-slate-100 border border-slate-200 px-1 py-1.5 rounded-lg text-[10px] font-black text-blue-700 text-center cursor-not-allowed focus:ring-0 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : cat === 'Overtime' ? (
                                                    <div className="grid grid-cols-3 gap-1">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1">Heads</span>
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-[10px] font-black text-slate-700 focus:ring-1 focus:ring-purple-500 outline-none"
                                                                value={row.overtimeHeads}
                                                                onChange={e => updateRow(row.id, { overtimeHeads: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1">Rate</span>
                                                            <input
                                                                type="number"
                                                                placeholder="0"
                                                                className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-[10px] font-black text-slate-700 focus:ring-1 focus:ring-purple-500 outline-none"
                                                                value={row.overtimeRate}
                                                                onChange={e => updateRow(row.id, { overtimeRate: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[7px] font-bold text-slate-400 uppercase ml-1 text-center">Total</span>
                                                            <input
                                                                value={`₹${(Number(row.overtimeHeads) * Number(row.overtimeRate)).toLocaleString()}`}
                                                                readOnly
                                                                tabIndex="-1"
                                                                className="w-full bg-slate-100 border border-slate-200 px-1 py-1.5 rounded-lg text-[10px] font-black text-purple-700 text-center cursor-not-allowed focus:ring-0 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">₹</span>
                                                        <input
                                                            type="number"
                                                            placeholder="AMOUNT"
                                                            className="w-full bg-white border border-slate-200 px-5 py-1.5 rounded-lg text-[11px] font-black text-slate-700 focus:ring-1 focus:ring-rose-500 outline-none"
                                                            value={row.amounts[cat]}
                                                            onChange={e => updateRow(row.id, {
                                                                amounts: { ...row.amounts, [cat]: e.target.value }
                                                            })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Desktop Actions */}
                                <div className="hidden xl:flex items-end pb-1.5">
                                    <button
                                        onClick={() => removeRow(row.id)}
                                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                        title="Remove Row"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
                            <AlertCircle className="h-3 w-3" /> Only rows with an amount will be saved
                        </p>
                        <button
                            onClick={handleSubmit}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-black px-12 py-4 rounded-2xl shadow-xl shadow-rose-200 transition-all active:scale-95 flex items-center gap-3 w-full sm:w-auto sticky bottom-4 sm:relative"
                        >
                            <Plus className="h-5 w-5" /> Save All Entries
                        </button>
                    </div>
                </div>
            )}

            {/* Expense History Section (Relocated below the form) */}
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {['All', ...CATEGORIES].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setSelectedTab(tab)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${selectedTab === tab
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <Calendar className="h-4 w-4 text-slate-400 ml-2" />
                        <input
                            type="date"
                            value={dateFilter.start}
                            onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                            className="text-xs border-none focus:ring-0 bg-transparent p-1 font-bold"
                        />
                        <span className="text-slate-400 text-xs">to</span>
                        <input
                            type="date"
                            value={dateFilter.end}
                            onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                            className="text-xs border-none focus:ring-0 bg-transparent p-1 font-bold"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600 min-w-[600px]">
                            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4">Description</th>
                                    <th className="px-6 py-4 text-right">Amount</th>
                                    <th className="px-6 py-4 w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs md:text-sm">
                                {displayExpenses.map((exp) => (
                                    <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-500 text-xs">
                                            {format(new Date(exp.date), 'dd MMM yyyy')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-tighter border ${CATEGORY_COLORS[exp.category] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                                {exp.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 truncate max-w-[200px]">
                                            {exp.description || 'No description'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-rose-600">
                                            ₹{exp.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {userRole !== 'viewer' && (
                                                <button onClick={() => handleDelete(exp.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90">
                                                    <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {displayExpenses.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-20 text-center">
                                            <TrendingDown className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                                            <p className="text-slate-400 font-bold">No {selectedTab !== 'All' ? selectedTab.toLowerCase() : ''} expenses found for this period.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Income Overlay / Modal */}
            {isIncomeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 transform transition-all animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-green-50 rounded-2xl"><ArrowUpCircle className="h-6 w-6 text-green-600" /></div>
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Add Income</h3>
                            </div>
                            <button onClick={() => setIsIncomeModalOpen(false)} className="text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 p-2"><X className="h-5 w-5" /></button>
                        </div>
                        <form onSubmit={handleIncomeSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Source / Description</label>
                                <input
                                    required
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none"
                                    placeholder="e.g. Sales Collection, GST Refund"
                                    value={incomeFormData.description}
                                    onChange={e => setIncomeFormData({ ...incomeFormData, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none"
                                        value={incomeFormData.date}
                                        onChange={e => setIncomeFormData({ ...incomeFormData, date: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount (₹)</label>
                                    <input
                                        type="number"
                                        required
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none"
                                        placeholder="0.00"
                                        value={incomeFormData.amount}
                                        onChange={e => setIncomeFormData({ ...incomeFormData, amount: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-200 transition-all active:scale-95 flex items-center justify-center gap-2 mt-2">
                                <Plus className="h-5 w-5" /> Save Income
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Income History (Optional Mini List) */}
            {selectedTab === 'All' && filteredByDate.length === 0 && filteredIncomeByDate.length > 0 && (
                <div className="bg-green-50/50 rounded-2xl border border-green-100 p-6">
                    <h4 className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-4">Recent Income Entries</h4>
                    <div className="space-y-3">
                        {filteredIncomeByDate.map(inc => (
                            <div key={inc.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-800 text-sm">{inc.description}</p>
                                    <p className="text-[10px] text-slate-500">{format(new Date(inc.date), 'dd MMM yyyy')}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="font-black text-green-600">₹{inc.amount.toLocaleString()}</span>
                                    {userRole !== 'viewer' && (
                                        <button onClick={() => handleIncomeDelete(inc.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
