/**
 * Utility to validate NIC E-Invoice JSON (Nested Format) before upload
 */

export const validateEInvoice = (invoiceArray) => {
    // Check if input is array (NIC Bulk format is an array of invoices)
    const isArray = Array.isArray(invoiceArray);
    const jsonData = isArray ? invoiceArray[0] : invoiceArray;

    if (!jsonData) {
        return { isValid: false, errors: [{ field: 'File', message: 'No invoice data found' }] };
    }

    const errors = [];

    // Mapping technical fields to human readable names for nested structure
    const fieldMapping = {
        'DocDtls.No': 'Invoice Number',
        'DocDtls.Dt': 'Invoice Date',
        'SellerDtls.Gstin': 'Seller GSTIN',
        'BuyerDtls.Gstin': 'Buyer GSTIN',
        'ItemList': 'Item List',
        'ValDtls.AssVal': 'Taxable Amount',
        'ValDtls.TotInvVal': 'Total Invoice Value',
        'SellerDtls.Stcd': 'Seller State Code',
        'BuyerDtls.Stcd': 'Buyer State Code',
        'HsnCd': 'HSN Code',
        'AssAmt': 'Taxable Amount',
        'GstRt': 'GST Rate',
        'IgstAmt': 'IGST Amount',
        'CgstAmt': 'CGST Amount'
    };

    // Helper to add error
    const addError = (field, message) => {
        const friendlyField = fieldMapping[field] || field;
        errors.push({ field: friendlyField, techField: field, message });
    };

    // 1. Mandatory Fields & Basic Schema (Nested)
    if (jsonData.Version !== "1.1") {
        addError('Version', 'Standard E-Invoice Version must be 1.1');
    }

    if (!jsonData.DocDtls?.No) addError('DocDtls.No', 'Invoice Number is missing');
    if (!jsonData.DocDtls?.Dt) addError('DocDtls.Dt', 'Invoice Date is missing');
    if (!jsonData.SellerDtls?.Gstin) addError('SellerDtls.Gstin', 'Seller GSTIN is missing');
    if (!jsonData.BuyerDtls?.Gstin) addError('BuyerDtls.Gstin', 'Buyer GSTIN is missing');

    if (!jsonData.ItemList || !Array.isArray(jsonData.ItemList) || jsonData.ItemList.length === 0) {
        addError('ItemList', 'At least one item is required in the invoice');
    }

    // 2. GSTIN Validation
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    const sellerGst = jsonData.SellerDtls?.Gstin;
    if (sellerGst) {
        if (sellerGst.length !== 15) {
            addError('SellerDtls.Gstin', 'Seller GSTIN must be exactly 15 characters');
        } else if (!gstinRegex.test(sellerGst) && sellerGst !== 'DUMMY_GSTIN') {
            addError('SellerDtls.Gstin', 'Seller GSTIN format is incorrect');
        }
    }

    const buyerGst = jsonData.BuyerDtls?.Gstin;
    if (buyerGst && buyerGst !== "URP") {
        if (buyerGst.length !== 15) {
            addError('BuyerDtls.Gstin', 'Buyer GSTIN must be exactly 15 characters');
        } else if (!gstinRegex.test(buyerGst) && buyerGst !== 'DUMMY_GSTIN') {
            addError('BuyerDtls.Gstin', 'Buyer GSTIN format is incorrect');
        }
    }

    if (sellerGst && buyerGst && sellerGst === buyerGst) {
        addError('BuyerDtls.Gstin', 'Buyer and Seller GSTIN cannot be the same');
    }

    // 3. State Code Validation
    if (sellerGst && jsonData.SellerDtls?.Stcd) {
        const derivedStateCode = sellerGst.substring(0, 2);
        if (derivedStateCode !== String(jsonData.SellerDtls.Stcd).padStart(2, '0')) {
            addError('SellerDtls.Stcd', 'Seller state code mapping mismatch with GSTIN');
        }
    }

    if (buyerGst && buyerGst !== "URP" && jsonData.BuyerDtls?.Stcd) {
        const derivedStateCode = buyerGst.substring(0, 2);
        if (derivedStateCode !== String(jsonData.BuyerDtls.Stcd).padStart(2, '0')) {
            addError('BuyerDtls.Stcd', 'Buyer state code mapping mismatch with GSTIN');
        }
    }

    // 4. Date Validation
    if (jsonData.DocDtls?.Dt) {
        const [day, month, year] = jsonData.DocDtls.Dt.split('/');
        const docDate = new Date(`${year}-${month}-${day}`);
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        if (isNaN(docDate.getTime())) {
            addError('DocDtls.Dt', 'Invalid date format (Expected DD/MM/YYYY)');
        } else if (docDate > today) {
            addError('DocDtls.Dt', 'Invoice date cannot be a future date');
        }
    }

    // 5. Item Level Validation
    let calculatedTotalTaxable = 0;
    jsonData.ItemList?.forEach((item, index) => {
        const prefix = `Item ${index + 1}`;

        // HSN Validation
        const hsn = String(item.HsnCd);
        if (![4, 6, 8].includes(hsn.length)) {
            addError(`${prefix} HSN Code`, 'HSN code length must be 4, 6, or 8 digits');
        }

        // Taxable Value
        if (item.AssAmt < 0) {
            addError(`${prefix} Taxable Amount`, 'Taxable value cannot be negative');
        }
        calculatedTotalTaxable += Number(item.AssAmt);

        // Tax Rates
        const allowedRates = [0, 5, 12, 18, 28];
        if (!allowedRates.includes(item.GstRt)) {
            addError(`${prefix} GST Rate`, `Invalid GST Rate: ${item.GstRt}%`);
        }

        // IGST vs CGST/SGST Logic
        const isIntrastate = jsonData.SellerDtls?.Stcd === jsonData.BuyerDtls?.Stcd;
        if (isIntrastate) {
            if (item.IgstAmt > 0) {
                addError(`${prefix} IGST`, 'IGST cannot be charged for Intrastate supply');
            }
        } else {
            if (item.CgstAmt > 0 || item.SgstAmt > 0) {
                addError(`${prefix} CGST/SGST`, 'CGST/SGST cannot be charged for Interstate supply');
            }
        }
    });

    // 6. Math Validation
    const val = jsonData.ValDtls || {};
    const totalTax = (Number(val.CgstVal) || 0) + (Number(val.SgstVal) || 0) + (Number(val.IgstVal) || 0);
    const calculatedTotalValue = Number(val.AssVal) + totalTax;

    const tolerance = 2.0;
    if (Math.abs(calculatedTotalValue - Number(val.TotInvVal)) > tolerance) {
        addError('ValDtls.TotInvVal', `Invoice total mismatch: Calculated ${calculatedTotalValue.toFixed(2)}, Found ${val.TotInvVal}`);
    }

    if (Math.abs(calculatedTotalTaxable - Number(val.AssVal)) > tolerance) {
        addError('ValDtls.AssVal', `Taxable amount mismatch: Sum of items ${calculatedTotalTaxable.toFixed(2)}, Found ${val.AssVal}`);
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};
