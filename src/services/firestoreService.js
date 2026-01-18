
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    getDoc,
    getDocs,
    runTransaction,
    query,
    where,
    writeBatch
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getAuth } from "firebase/auth";

/* =========================
   PRODUCTS
========================= */

export const addProduct = async (data) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");

    await addDoc(collection(db, "products"), {
        name: data.name,
        sku: data.sku,
        hsn: data.hsn || "",
        price: Number(data.price),
        stockQty: 0, // Initial stock is now always 0, must add via Stock Entry
        locations: {}, // Initialize empty locations map
        lowStockThreshold: Number(data.lowStockThreshold || 10),
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
};

export const updateProduct = async (id, data) => {
    await updateDoc(doc(db, "products", id), {
        name: data.name,
        sku: data.sku,
        hsn: data.hsn || "",
        price: Number(data.price),
        stockQty: Number(data.stockQty),
        lowStockThreshold: Number(data.lowStockThreshold || 10),
        updatedAt: serverTimestamp()
    });
};

export const deleteProduct = async (id) => {
    await deleteDoc(doc(db, "products", id));
};

/* =========================
   CUSTOMERS (FIX)
========================= */

export const addCustomer = async (data) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");

    await addDoc(collection(db, "customers"), {
        ...data,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
    });
};

export const updateCustomer = async (id, data) => {
    await updateDoc(doc(db, "customers", id), {
        ...data,
        updatedAt: serverTimestamp()
    });
};

export const deleteCustomer = (id) => deleteDoc(doc(db, 'customers', id));

/* =========================
   TRANSPORTERS
========================= */

export const addTransporter = async (data) => {
    return addDoc(collection(db, 'transporters'), {
        ...data,
        createdAt: serverTimestamp()
    });
};

export const updateTransporter = (id, data) => updateDoc(doc(db, 'transporters', id), data);

export const deleteTransporter = (id) => deleteDoc(doc(db, 'transporters', id));

/* =========================
   SUPPLIERS
========================= */

export const addSupplier = async (data) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");

    return await addDoc(collection(db, "suppliers"), {
        ...data,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
    });
};

export const updateSupplier = async (id, data) => {
    await updateDoc(doc(db, "suppliers", id), {
        ...data,
        updatedAt: serverTimestamp()
    });
};

export const deleteSupplier = (id) => deleteDoc(doc(db, 'suppliers', id));

/* =========================
   EXPENSES
========================= */

export const addExpense = async (data) => {
    return addDoc(collection(db, 'expenses'), {
        ...data,
        createdAt: serverTimestamp()
    });
};

export const addExpensesBulk = async (expenses) => {
    const batch = writeBatch(db);
    const expensesCol = collection(db, 'expenses');
    expenses.forEach(exp => {
        const newDocRef = doc(expensesCol);
        batch.set(newDocRef, {
            ...exp,
            createdAt: serverTimestamp()
        });
    });
    return batch.commit();
};

export const updateExpense = (id, data) => updateDoc(doc(db, 'expenses', id), {
    ...data,
    updatedAt: serverTimestamp()
});

export const deleteExpense = (id) => deleteDoc(doc(db, 'expenses', id));

/* =========================
   INCOME
========================= */

export const addIncome = async (data) => {
    return addDoc(collection(db, 'income'), {
        ...data,
        createdAt: serverTimestamp()
    });
};

export const updateIncome = (id, data) => updateDoc(doc(db, 'income', id), {
    ...data,
    updatedAt: serverTimestamp()
});

export const deleteIncome = (id) => deleteDoc(doc(db, 'income', id));

/* =========================
   INVOICES
========================= */

export const createInvoice = async (invoice, items, fromLocation) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    if (!fromLocation) throw new Error("Dispatch location is required.");
    if (!invoice.invoiceNo) throw new Error("Invoice Number is required.");

    // Check Uniqueness (Query before transaction)
    const qInvoice = query(collection(db, 'invoices'), where('invoiceNo', '==', invoice.invoiceNo));
    const invoiceSnap = await getDocs(qInvoice);
    if (!invoiceSnap.empty) {
        throw new Error(`Invoice Number "${invoice.invoiceNo}" already exists.`);
    }

    return await runTransaction(db, async (transaction) => {
        // 1. Read all products first
        const productRefs = items.map(item => doc(db, "products", item.productId));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        // 2. Validate Stock & Prepare Updates
        const productUpdates = [];
        const itemsSummary = [];

        items.forEach((item, index) => {
            const snap = productSnaps[index];
            if (!snap.exists()) throw new Error(`Product not found: ${item.name}`);

            const rawQty = item.quantity !== undefined ? item.quantity : item.qty;
            // Prevent String Injection: Strip non-numeric characters (like 'mts' or spaces)
            const sanitizedQty = String(rawQty).replace(/[^0-9.]/g, '');
            let quantity = Number(sanitizedQty);

            // Backend Safety: Force convert to number if type check fails or NaN occurs
            if (typeof quantity !== 'number' || isNaN(quantity)) {
                quantity = Number(sanitizedQty) || 0;
            }

            if (isNaN(quantity) || rawQty === '' || rawQty === null || rawQty === undefined) {
                throw new Error(`Invalid numeric quantity [${rawQty}] for product: ${item.name || 'Unknown'}`);
            }
            if (quantity < 0) throw new Error(`Quantity cannot be negative for product: ${item.name}`);

            const data = snap.data();
            const globalStock = Number(data.stockQty) || 0;
            const locations = data.locations || {};
            const currentLocStock = Number(locations[fromLocation]) || 0;

            if (currentLocStock < quantity) {
                if (quantity > 0) {
                    throw new Error(`Insufficient stock at "${fromLocation}" for ${item.name}. Available: ${currentLocStock.toFixed(1)}, Requested: ${quantity.toFixed(1)}`);
                }
            }

            const newLocStock = Number((currentLocStock - quantity).toFixed(1));

            // Derive new locations map
            const newLocations = { ...locations, [fromLocation]: newLocStock };
            // Calculate new Total Logic directly from locations
            const newTotalStock = Object.values(newLocations).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

            productUpdates.push({
                ref: snap.ref,
                data: {
                    locations: newLocations,
                    stockQty: Number(newTotalStock.toFixed(1)),
                    updatedAt: serverTimestamp()
                }
            });

            itemsSummary.push({
                productId: item.productId,
                productName: item.name || '',
                quantity: quantity,
                price: Number(item.price) || 0,
                bags: Number(item.bags) || 0,
                bagWeight: Number(item.bagWeight) || 0,
                hsnCode: item.hsnCode || ''
            });
        });

        // 3. Write Invoice with itemsSummary
        const invoiceRef = doc(collection(db, "invoices"));
        const taxRate = Number(invoice.taxRate) || 18; // Passed from UI or default

        transaction.set(invoiceRef, {
            ...invoice,
            fromLocation,
            taxRate,
            itemsSummary, // Added for Report Efficiency
            userId: uid,
            createdAt: serverTimestamp()
        });

        // 4. Process Items (InvoiceItems, Stock Updates, Movements, Dispatches)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Invoice Item
            const itemRef = doc(collection(db, "invoiceItems"));
            transaction.set(itemRef, {
                invoiceId: invoiceRef.id,
                productId: item.productId,
                productName: item.name || '',
                quantity: Number(item.quantity),
                price: Number(item.price),
                userId: uid,
                createdAt: serverTimestamp()
            });

            // Product Update
            const update = productUpdates[i];
            transaction.update(update.ref, update.data);

            // Stock Movement Log
            const moveRef = doc(collection(db, "stockMovements"));
            transaction.set(moveRef, {
                productId: item.productId,
                productName: item.name || '',
                location: fromLocation,
                changeQty: -Number(item.quantity),
                type: 'INVOICE',
                reason: `Invoice #${invoice.invoiceNo} `,
                relatedInvoiceId: invoiceRef.id,
                transport: invoice.transport || {},
                userId: uid,
                createdAt: serverTimestamp()
            });

            // Calculate Item specific Financials for Dispatch
            const itemQty = Number(item.quantity) || 0;
            const itemRate = Number(item.price) || 0;
            const itemSubtotal = itemQty * itemRate;
            const itemTax = itemSubtotal * (taxRate / 100);
            const itemTotal = itemSubtotal + itemTax;

            // Dispatch Record (Auto-Create)
            const dispatchRef = doc(collection(db, "dispatches"));
            transaction.set(dispatchRef, {
                invoiceId: invoiceRef.id,
                invoiceNo: invoice.invoiceNo,
                customerName: invoice.customerName || '',
                remarks: invoice.remarks || '',
                productId: item.productId,
                productName: item.name || '',
                quantity: itemQty,
                bags: Number(item.bags) || 0,
                bagWeight: Number(item.bagWeight) || 0,
                unitPrice: itemRate,
                taxRate: taxRate,
                taxAmount: Number(itemTax.toFixed(2)),
                itemTotal: Number(itemTotal.toFixed(2)),
                location: fromLocation,
                transport: invoice.transport || {},
                userId: uid,
                createdAt: serverTimestamp()
            });
        }

        return invoiceRef.id;
    });
};

/* =========================
   BACKFILL / MAINTENANCE
   ========================= */
export const backfillDispatches = async () => {
    const auth = getAuth();
    if (!auth.currentUser) return;

    console.log("Starting Backfill...");
    const invoicesSnap = await getDocs(collection(db, "invoices"));

    let processed = 0;
    for (const invDoc of invoicesSnap.docs) {
        const inv = { id: invDoc.id, ...invDoc.data() };

        // Check if dispatches exist
        const qDisp = query(collection(db, "dispatches"), where("invoiceId", "==", inv.id));
        const dispSnap = await getDocs(qDisp);

        if (dispSnap.empty) {
            // Need to backfill
            // Fetch items
            const qItems = query(collection(db, "invoiceItems"), where("invoiceId", "==", inv.id));
            const itemsSnap = await getDocs(qItems);

            const promises = itemsSnap.docs.map(async (itemDoc) => {
                const item = itemDoc.data();
                const itemQty = Number(item.quantity) || 0;
                const itemRate = Number(item.price) || 0;
                const taxRate = inv.taxRate || 18;
                const itemSubtotal = itemQty * itemRate;
                const itemTax = itemSubtotal * (taxRate / 100);
                const itemTotal = itemSubtotal + itemTax;

                await addDoc(collection(db, "dispatches"), {
                    invoiceId: inv.id,
                    invoiceNo: inv.invoiceNo || "UNKNOWN",
                    productId: item.productId,
                    productName: item.productName || item.name || "Unknown Product",
                    quantity: itemQty,
                    unitPrice: itemRate,
                    taxRate: taxRate,
                    taxAmount: Number(itemTax.toFixed(2)),
                    itemTotal: Number(itemTotal.toFixed(2)),
                    location: inv.fromLocation || "Warehouse A",
                    transport: inv.transport || {},
                    userId: inv.userId || auth.currentUser.uid,
                    createdAt: inv.createdAt // Keep original date!
                });
            });

            await Promise.all(promises);
            processed++;
        }

        // Also update itemsSummary if missing?
        if (!inv.itemsSummary) {
            const qItems = query(collection(db, "invoiceItems"), where("invoiceId", "==", inv.id));
            const itemsSnap = await getDocs(qItems);
            const summary = itemsSnap.docs.map(d => ({
                productName: d.data().productName || d.data().name || '',
                quantity: Number(d.data().quantity),
                price: Number(d.data().price)
            }));

            await updateDoc(doc(db, "invoices", inv.id), {
                itemsSummary: summary
            });
        }
    }
    console.log(`Backfilled ${processed} invoices.`);
    return processed;
};

/* =========================
   ADD STOCK (NEW)
   ========================= */

export const addStock = async ({ productId, location, quantity, reason }) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    const qty = Number(quantity);
    if (isNaN(qty)) throw new Error("Invalid numeric quantity.");
    if (!location) throw new Error("Location is required.");

    await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", productId);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) throw new Error("Product not found.");

        const data = productSnap.data();
        const locations = data.locations || {};
        const currentLocStock = Number(locations[location]) || 0;

        // No checks on negative result, assume allowed or managed by UI warning? 
        // "Stock quantity is allowed to be ZERO".
        // addStock adds to current.

        const newLocStock = Number((currentLocStock + qty).toFixed(1));

        const newLocations = { ...locations, [location]: newLocStock };
        // Recalc total from locations to be safe
        const newTotalStock = Object.values(newLocations).reduce((a, b) => a + (Number(b) || 0), 0);

        transaction.update(productRef, {
            locations: newLocations,
            stockQty: Number(newTotalStock.toFixed(1)),
            updatedAt: serverTimestamp()
        });

        // Log Movement
        const moveRef = doc(collection(db, "stockMovements"));
        transaction.set(moveRef, {
            productId,
            location,
            changeQty: qty,
            reason: reason || "Stock Entry",
            userId: uid,
            createdAt: serverTimestamp()
        });
    });
};

export const updateStockLevel = async ({ productId, location, newQuantity, reason }) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    const newQty = Number(newQuantity);
    if (isNaN(newQty)) throw new Error("Invalid numeric quantity.");
    if (newQty < 0) throw new Error("Stock cannot be negative."); // Basic sanity, though "Allow 0" implies not negative? 
    // Requirement "Stock quantity allowed to be ZERO". Usually inventory constraint is >= 0.

    if (!location) throw new Error("Location is required.");

    await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", productId);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) throw new Error("Product not found.");

        const data = productSnap.data();
        const locations = data.locations || {};
        const currentLocStock = Number(locations[location]) || 0;

        const diff = newQty - currentLocStock;

        if (diff === 0) return; // No change

        const newLocations = { ...locations, [location]: Number(newQty.toFixed(1)) };
        const newTotalStock = Object.values(newLocations).reduce((a, b) => a + (Number(b) || 0), 0);

        transaction.update(productRef, {
            locations: newLocations,
            stockQty: Number(newTotalStock.toFixed(1)),
            updatedAt: serverTimestamp()
        });

        // Log Movement
        const moveRef = doc(collection(db, "stockMovements"));
        transaction.set(moveRef, {
            productId,
            location,
            changeQty: Number(diff.toFixed(1)),
            reason: reason || "Stock Correction",
            userId: uid,
            createdAt: serverTimestamp()
        });
    });
};

/* =========================
   STOCK TRANSFER
   ========================= */

export const transferStock = async ({ productId, productName, fromLocation, toLocation, quantity }) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    if (quantity <= 0) throw new Error("Transfer quantity must be greater than zero.");
    if (fromLocation === toLocation) throw new Error("Source and destination cannot be the same.");

    // Transaction to ensure atomicity
    await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", productId);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) throw new Error("Product not found.");

        const data = productSnap.data();
        const locations = data.locations || {};

        // Check source stock
        // If location stock doesn't accept "From" (because it's undefined), assume all stock is in 'Warehouse A' or similar default if not set?
        // But requirement says: "Maintain location-level stock logically".
        // If locations map doesn't exist yet, we must initialize it IF the current stockQty > 0.
        // We can assume if no map exists, all stock is in "Warehouse A" (or user must pick from where).
        // Let's rely on what's in the map. If key misses, it's 0.

        const currentFromStock = locations[fromLocation] || 0;

        // Strict Validation:
        if (currentFromStock < quantity) {
            // Fallback: If map is empty BUT global `stockQty` matches what they want, 
            // maybe we haven't migrated to location-based yet.
            // But to be safe and strict:
            throw new Error(`Insufficient stock at ${fromLocation}.Available: ${currentFromStock} mts.`);
        }

        const newFromStock = currentFromStock - quantity;
        const currentToStock = locations[toLocation] || 0;
        const newToStock = currentToStock + quantity;

        // Updates
        const newLocations = { ...locations, [fromLocation]: newFromStock, [toLocation]: newToStock };

        // Verify total wasn't messed up (floating point limit)
        // const newTotal = Object.values(newLocations).reduce((a, b) => a + b, 0); 
        // We don't touch global stockQty because it's just a transfer.

        transaction.update(productRef, {
            locations: newLocations,
            updatedAt: serverTimestamp()
        });

        // Logs - create new ref for logs to key them
        const transferRef = doc(collection(db, "stockTransfers"));
        transaction.set(transferRef, {
            productId,
            productName,
            fromLocation,
            toLocation,
            quantity,
            userId: uid,
            createdAt: serverTimestamp()
        });

        const moveOutRef = doc(collection(db, "stockMovements"));
        transaction.set(moveOutRef, {
            productId,
            location: fromLocation,
            changeQty: -quantity,
            reason: "Transfer Out",
            referenceId: transferRef.id,
            userId: uid,
            createdAt: serverTimestamp()
        });

        const moveInRef = doc(collection(db, "stockMovements"));
        transaction.set(moveInRef, {
            productId,
            location: toLocation,
            changeQty: quantity,
            reason: "Transfer In",
            referenceId: transferRef.id,
            userId: uid,
            createdAt: serverTimestamp()
        });
    });
};

/* =========================
   STOCK MANAGEMENT (IMPORT & LOCAL)
   ========================= */

export const addImportEntry = async (data) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    return await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", data.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found");

        const productData = productSnap.data();
        const locations = productData.locations || {};
        const targetLocation = data.location || 'Warehouse A';
        const currentLocStock = Number(locations[targetLocation]) || 0;
        const addQty = Number(data.quantity);

        const newLocStock = Number((currentLocStock + addQty).toFixed(1));
        const newLocations = { ...locations, [targetLocation]: newLocStock };
        const newTotalStock = Object.values(newLocations).reduce((a, b) => a + (Number(b) || 0), 0);

        const beNumber = String(data.beNumber || "").toUpperCase();
        const blNumber = String(data.blNumber || "").toUpperCase();

        const importRef = doc(collection(db, "imports"));
        transaction.set(importRef, {
            ...data,
            beNumber,
            blNumber,
            userId: uid,
            createdAt: serverTimestamp()
        });

        transaction.update(productRef, {
            locations: newLocations,
            stockQty: Number(newTotalStock.toFixed(1)),
            updatedAt: serverTimestamp()
        });

        const moveRef = doc(collection(db, "stockMovements"));
        transaction.set(moveRef, {
            productId: data.productId,
            productName: productData.name,
            location: targetLocation,
            changeQty: addQty,
            type: 'IMPORT',
            reason: `Import BE: ${beNumber}`,
            referenceId: importRef.id,
            userId: uid,
            createdAt: serverTimestamp()
        });

        // Sync purchase with Expenses if Amount Paid > 0
        if (Number(data.amountPaid) > 0) {
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: data.date,
                category: 'Purchase/Stock In',
                amount: Number(data.amountPaid),
                description: `IMPORT PURCHASE: ${data.supplierName} (BE: ${beNumber})`.toUpperCase(),
                mode: data.paymentMode || 'Bank Transfer',
                userId: uid,
                createdAt: serverTimestamp()
            });
        }

        // Sync Logistics Cost to Expenses if Cost > 0
        if (Number(data.transportCost) > 0) {
            const transportExpenseRef = doc(collection(db, "expenses"));
            transaction.set(transportExpenseRef, {
                date: data.date,
                category: 'Logistics',
                amount: Number(data.transportCost),
                description: `INWARD FREIGHT (IMPORT): ${data.transporterName} (BE: ${beNumber})`.toUpperCase(),
                mode: data.transportPaymentType === 'Paid' ? 'Bank Transfer' : 'CREDIT',
                userId: uid,
                createdAt: serverTimestamp()
            });
        }
    });
};

export const addLocalPurchase = async (data, addToExpense = false) => {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("User not authenticated");
    const uid = auth.currentUser.uid;

    return await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", data.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found");

        const productData = productSnap.data();
        const locations = productData.locations || {};
        const targetLocation = data.location || 'Warehouse A';
        const currentLocStock = Number(locations[targetLocation]) || 0;
        const addQty = Number(data.quantity);

        const newLocStock = Number((currentLocStock + addQty).toFixed(1));
        const newLocations = { ...locations, [targetLocation]: newLocStock };
        const newTotalStock = Object.values(newLocations).reduce((a, b) => a + (Number(b) || 0), 0);

        const purchaseRef = doc(collection(db, "localPurchases"));
        transaction.set(purchaseRef, {
            ...data,
            userId: uid,
            createdAt: serverTimestamp()
        });

        transaction.update(productRef, {
            locations: newLocations,
            stockQty: Number(newTotalStock.toFixed(1)),
            updatedAt: serverTimestamp()
        });

        const moveRef = doc(collection(db, "stockMovements"));
        transaction.set(moveRef, {
            productId: data.productId,
            productName: productData.name,
            location: targetLocation,
            changeQty: addQty,
            type: 'LOCAL_PURCHASE',
            reason: `Local Purchase Inv: ${data.invoiceNo}`,
            referenceId: purchaseRef.id,
            userId: uid,
            createdAt: serverTimestamp()
        });

        // Sync purchase with Expenses if Amount Paid > 0
        if (Number(data.amountPaid) > 0) {
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: data.date,
                category: 'Purchase/Stock In',
                amount: Number(data.amountPaid),
                description: `LOCAL PURCHASE: ${data.supplierName} (INV: ${data.invoiceNo})`.toUpperCase(),
                mode: data.paymentMode || 'Bank Transfer',
                userId: uid,
                createdAt: serverTimestamp()
            });
        } else if (addToExpense) {
            // Fallback for legacy "Add to Expenses" checkbox if amountPaid is 0
            const expenseRef = doc(collection(db, "expenses"));
            transaction.set(expenseRef, {
                date: data.date,
                category: 'Other OVERHEADS',
                amount: Number(data.totalPrice),
                description: `LOCAL PURCHASE (Legacy): ${data.supplierName} (INV: ${data.invoiceNo})`.toUpperCase(),
                userId: uid,
                createdAt: serverTimestamp()
            });
        }

        // Sync Logistics Cost to Expenses if Cost > 0
        if (Number(data.transportCost) > 0) {
            const transportExpenseRef = doc(collection(db, "expenses"));
            transaction.set(transportExpenseRef, {
                date: data.date,
                category: 'Logistics',
                amount: Number(data.transportCost),
                description: `INWARD FREIGHT (LOCAL): ${data.transporterName} (INV: ${data.invoiceNo})`.toUpperCase(),
                mode: data.transportPaymentType === 'Paid' ? 'Bank Transfer' : 'CREDIT',
                userId: uid,
                createdAt: serverTimestamp()
            });
        }
    });
};
