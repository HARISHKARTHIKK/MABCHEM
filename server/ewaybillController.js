import express from 'express';
import axios from 'axios';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

/**
 * TALLY GSP CONFIGURATION
 * These environment variables must be set in your .env file
 */
const TALLY_CONFIG = {
    clientId: process.env.TALLY_CLIENT_ID,
    clientSecret: process.env.TALLY_CLIENT_SECRET,
    username: process.env.TALLY_PORTAL_USERNAME,
    password: process.env.TALLY_PORTAL_PASSWORD,
    myGstin: process.env.MY_GSTIN // Dispatcher's GSTIN
};

/**
 * AUTH HELPER: OAuth2 Login to Tally GSP
 * @returns {Promise<string>} access_token
 */
const getTallyGSPAccessToken = async () => {
    const db = admin.firestore();
    const tokenRef = db.collection('system_config').doc('tally_auth');
    let cachedToken = null;

    try {
        // 1. Attempt to fetch cached token from Firestore (Fail-Safe)
        const tokenSnap = await tokenRef.get().catch(err => {
            console.warn('Firestore Cache Read Failed (Continuing with API Login):', err.message);
            return null;
        });

        if (tokenSnap && tokenSnap.exists) {
            const cachedData = tokenSnap.data();
            const now = Date.now();

            // Check if token is valid (expiry_time is stored as milliseconds)
            if (cachedData.access_token && cachedData.expiry_time > now) {
                console.log('✅ Using Valid Cached Tally GSP Token');
                return cachedData.access_token;
            }
        }
    } catch (cacheErr) {
        console.warn('Cache Check Error (Non-Fatal):', cacheErr.message);
    }

    try {
        console.log('🔄 Fetching New Tally GSP Token - Cache Expired or Missing');
        // 2. Fetch new token from Tally GSP API
        const response = await axios.post('https://api.tallygsp.com/oauth/token', {
            client_id: TALLY_CONFIG.clientId,
            client_secret: TALLY_CONFIG.clientSecret,
            username: TALLY_CONFIG.username,
            password: TALLY_CONFIG.password,
            grant_type: 'password'
        });

        if (!response.data.access_token) {
            throw new Error('Access token not found in API response');
        }

        const newAccessToken = response.data.access_token;
        const expiryTime = Date.now() + (6 * 60 * 60 * 1000); // Current Time + 6 hours

        // 3. Update Firestore cache (Fail-Safe)
        await tokenRef.set({
            access_token: newAccessToken,
            expiry_time: expiryTime,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn('Firestore Cache Write Failed:', err.message));

        return newAccessToken;
    } catch (error) {
        const errorMsg = error.response?.data?.error_description || error.message;
        console.error('❌ Tally GSP Authentication Critical Failure:', errorMsg);
        throw new Error('Tally GSP Auth Error: ' + errorMsg);
    }
};

/**
 * DATA MAPPING: Transform Firestore Invoice + Items into NIC Standard JSON
 * Target fields mapping:
 * - productName <- product_name
 * - quantity <- qty
 * - hsnCode <- hsn
 * - taxableAmount <- qty * price
 * - toGstin <- customer_gst
 */
const mapInvoiceToNICFormat = (invoiceData, itemsData, customerData, settingsData) => {
    // Generate Item List with strict mapping
    const itemList = itemsData.map(item => ({
        productName: item.product_name || item.productName,
        productDesc: item.product_name || item.productName,
        hsnCode: "3824", // Forced for testing
        quantity: Number(item.qty || item.quantity) || 0,
        qtyUnit: "MTS", // Default unit for your inventory
        cgstRate: Number(invoiceData.taxRate / 2 || 0).toFixed(2),
        sgstRate: Number(invoiceData.taxRate / 2 || 0).toFixed(2),
        igstRate: 0.00,
        cessRate: 0.00,
        taxableAmount: Number((Number(item.qty || item.quantity) || 0) * (Number(item.price) || 0)).toFixed(2)
    }));

    // Construct Full NIC Payload
    return {
        supplyType: "O", // Outward
        subSupplyType: "1", // Supply
        docType: "INV", // Tax Invoice
        docNo: invoiceData.invoiceNo,
        docDate: invoiceData.createdAt ? new Date(invoiceData.createdAt._seconds * 1000).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
        fromGstin: TALLY_CONFIG.myGstin,
        fromTrdName: (settingsData.company.name || '').substring(0, 100),
        fromAddr1: (settingsData.company.address || '').substring(0, 100),
        fromAddr2: "",
        fromPlace: invoiceData.fromLocation || "WAREHOUSE",
        fromPincode: 600001,
        fromStateCode: 33, // Default state code (Tamil Nadu)
        toGstin: customerData.gstin || invoiceData.customer_gst,
        toTrdName: (customerData.name || invoiceData.customerName || '').substring(0, 100),
        toAddr1: (customerData.address || "CUSTOMER ADDRESS").substring(0, 100),
        toAddr2: "",
        toPlace: "DESTINATION",
        toPincode: 600002, // Forced for testing
        toStateCode: 33,
        transactionType: 1,
        dispatchFromPincode: 600001,
        shipToPincode: 600002,
        itemList: itemList,
        totalValue: 50000.00, // Forced for testing (Minimum limit)
        cgstValue: Number(invoiceData.taxAmount / 2 || 0).toFixed(2),
        sgstValue: Number(invoiceData.taxAmount / 2 || 0).toFixed(2),
        igstValue: 0.00,
        cessValue: 0.00,
        totInvValue: 50000.00, // Forced for testing
        transMode: "1", // Road
        transDistance: 10, // Forced for testing
        transporterId: invoiceData.transporterGSTIN || "",
        transporterName: invoiceData.transporterName || "",
        transDocNo: "",
        transDocDate: "",
        vehicleNo: (invoiceData.vehicleNumber || '').replace(/\s+/g, '').toUpperCase() || null
    };
};

/**
 * POST /api/ewaybill/generate
 * Dedicated route for Tally GSP Integration
 */
router.post('/generate', async (req, res) => {
    console.log('--- [POST] /api/ewaybill/generate received ---');
    const { invoiceId } = req.body;
    const db = admin.firestore();

    if (!invoiceId) {
        return res.status(400).json({ success: false, error: 'invoiceId is required' });
    }

    try {
        // 1. FETCH INVOICE DATA
        const invoiceRef = db.collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();

        if (!invoiceSnap.exists) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        const invoice = invoiceSnap.data();

        // 2. FETCH CUSTOMER DATA (for additional fields like address/gstin)
        const customerSnap = await db.collection('customers').doc(invoice.customerId).get();
        const customer = customerSnap.exists ? customerSnap.data() : {};

        // 3. FETCH PRODUCT DATA FOR HSN (Mapping fields product_name, qty, hsn, price)
        const items = await Promise.all((invoice.itemsSummary || []).map(async (item) => {
            const productSnap = await db.collection('products').doc(item.productId).get();
            const product = productSnap.exists ? productSnap.data() : {};

            return {
                product_name: item.productName || item.name,
                qty: item.quantity,
                price: item.price,
                hsn: product.hsn || "" // Fetching HSN from product document
            };
        }));

        // 4. FETCH ORGANIZATION SETTINGS
        const settingsSnap = await db.collection('settings').doc('organization_settings').get();
        if (!settingsSnap.exists) {
            return res.status(404).json({ success: false, error: 'Organization settings not found' });
        }
        const settings = settingsSnap.data();

        // 5. VALIDATION: Check for required dynamic fields
        const distance = Number(req.body.distance || invoice.distance);

        const errors = [];
        if (!settings.company?.name) errors.push("Company Name (fromTrdName) missing in settings");
        if (!settings.company?.address) errors.push("Company Address (fromAddr1) missing in settings");
        if (!settings.company?.pincode) errors.push("Company Pincode (fromPincode) missing in settings");
        if (!customer.pincode) errors.push("Customer Pincode (toPincode) missing in customer document");
        if (!distance || distance < 1) errors.push("Approximate distance is required for E-Way Bill");

        // Check for HSN codes in items
        items.forEach(item => {
            if (!item.hsn || item.hsn.trim() === "") {
                errors.push(`HSN code is missing for product ${item.product_name}. Please update product details.`);
            }
        });

        if (errors.length > 0) {
            // If it's only one error, we can make it the primary error message
            const primaryError = errors.length === 1 ? errors[0] : "Validation Failed";
            return res.status(400).json({ success: false, error: primaryError, details: errors });
        }

        // 6. MAP DATA TO NIC FORMAT
        // Allow vehicleNo override from request body
        const finalInvoiceData = {
            ...invoice,
            distance,
            vehicleNo: req.body.vehicleNo || req.body.vehicleNumber || invoice.vehicleNo || invoice.vehicleNumber
        };
        const nicPayload = mapInvoiceToNICFormat(finalInvoiceData, items, customer, settings);

        // 7. AUTHENTICATE WITH TALLY GSP
        let accessToken;
        try {
            accessToken = await getTallyGSPAccessToken();
        } catch (authError) {
            console.error('Tally GSP Auth Failure:', authError.message);
            return res.status(401).json({
                success: false,
                error: 'Invalid Tally Credentials',
                message: authError.message
            });
        }

        console.log('📦 NIC Payload being sent:', JSON.stringify(nicPayload, null, 2));

        // 8. CALL TALLY GSP API
        const generateResponse = await axios.post(
            'https://api.tallygsp.com/ewaybill/v1/generate',
            nicPayload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const ewayBillData = generateResponse.data;

        if (ewayBillData && ewayBillData.ewayBillNo) {
            // 9. SUCCESS: Update Firestore with results
            await invoiceRef.update({
                ewayBillNo: ewayBillData.ewayBillNo,
                ewayBillStatus: 'SUCCESS',
                ewayBillGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                tallyGspResponse: ewayBillData // Log full response for audit
            });

            console.log(`[SUCCESS] E-Way Bill Generated: ${ewayBillData.ewayBillNo} for Invoice ${invoice.invoiceNo}`);

            return res.json({
                success: true,
                ewayBillNo: ewayBillData.ewayBillNo,
                message: 'E-Way Bill generated and updated successfully'
            });
        } else {
            throw new Error('E-Way Bill Number not found in API response');
        }

    } catch (error) {
        console.log('NIC REJECTION REASON:', JSON.stringify(error.response?.data, null, 2));
        const errorDetails = error.response?.data || error.message;
        console.error('E-Way Bill Integration Error:', errorDetails);

        // User-friendly error messages
        let userMessage = 'Failed to generate E-Way Bill. Please try again later.';
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            userMessage = 'Tally GSP Server is taking too long to respond. Please check your internet or try again.';
        } else if (error.response?.status === 503 || error.response?.status === 502) {
            userMessage = 'Tally GSP / NIC Servers are currently down for maintenance.';
        } else if (errorDetails.error) {
            userMessage = errorDetails.error;
        }

        res.status(error.response?.status || 500).json({
            success: false,
            error: userMessage,
            details: errorDetails
        });
    }
});

export default router;
