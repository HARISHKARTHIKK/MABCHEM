/**
 * Utility to validate NIC E-Invoice/E-Way Bill JSON before upload
 */

export const validateEInvoice = (jsonData) => {
    const errors = [];

    // Mapping technical fields to human readable names
    const fieldMapping = {
        'docNo': 'Invoice Number',
        'docDate': 'Invoice Date',
        'fromGstin': 'Seller GSTIN',
        'toGstin': 'Buyer GSTIN',
        'itemList': 'Item List',
        'totalValue': 'Taxable Amount',
        'totInvValue': 'Total Invoice Value',
        'fromStateCode': 'Seller State Code',
        'toStateCode': 'Buyer State Code',
        'hsnCode': 'HSN Code',
        'taxableAmount': 'Taxable Amount',
        'taxRate': 'GST Rate',
        'igstRate': 'IGST Rate',
        'cgstRate': 'CGST/SGST Rate'
    };

    // Helper to add error
    const addError = (field, message) => {
        const friendlyField = fieldMapping[field] || field;
        errors.push({ field: friendlyField, techField: field, message });
    };

    // 1. Mandatory Fields & Basic Schema
    const mandatoryFields = ['docNo', 'docDate', 'fromGstin', 'toGstin', 'itemList', 'totalValue', 'totInvValue'];
    mandatoryFields.forEach(field => {
        if (!jsonData[field]) {
            addError(field, `This field is missing but required for E-Invoice`);
        }
    });

    if (!jsonData.itemList || !Array.isArray(jsonData.itemList) || jsonData.itemList.length === 0) {
        addError('itemList', 'At least one item is required in the invoice');
    }

    // 2. GSTIN Validation
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (jsonData.fromGstin) {
        if (jsonData.fromGstin.length !== 15) {
            addError('fromGstin', 'Seller GSTIN must be exactly 15 characters');
        } else if (!gstinRegex.test(jsonData.fromGstin) && jsonData.fromGstin !== 'DUMMY_GSTIN') {
            addError('fromGstin', 'Seller GSTIN format is incorrect');
        }
    }

    if (jsonData.toGstin) {
        if (jsonData.toGstin.length !== 15) {
            addError('toGstin', 'Buyer GSTIN must be exactly 15 characters');
        } else if (!gstinRegex.test(jsonData.toGstin) && jsonData.toGstin !== 'DUMMY_GSTIN') {
            addError('toGstin', 'Buyer GSTIN format is incorrect');
        }
    }

    if (jsonData.fromGstin && jsonData.toGstin && jsonData.fromGstin === jsonData.toGstin) {
        addError('toGstin', 'Buyer and Seller GSTIN cannot be the same');
    }

    // 3. State Code Validation
    if (jsonData.fromGstin && jsonData.fromStateCode) {
        const derivedStateCode = jsonData.fromGstin.substring(0, 2);
        if (derivedStateCode !== String(jsonData.fromStateCode).padStart(2, '0')) {
            addError('fromStateCode', 'Seller state code mapping mismatch with GSTIN');
        }
    }

    if (jsonData.toGstin && jsonData.toStateCode) {
        const derivedStateCode = jsonData.toGstin.substring(0, 2);
        if (derivedStateCode !== String(jsonData.toStateCode).padStart(2, '0')) {
            addError('toStateCode', 'Buyer state code mapping mismatch with GSTIN');
        }
    }

    // 4. Date Validation
    if (jsonData.docDate) {
        const [day, month, year] = jsonData.docDate.split('/');
        const docDate = new Date(`${year}-${month}-${day}`);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Allow same day

        if (isNaN(docDate.getTime())) {
            addError('docDate', 'Invalid date format (Expected DD/MM/YYYY)');
        } else if (docDate > today) {
            addError('docDate', 'Invoice date cannot be a future date');
        }
    }

    // 5. Item Level Validation
    let calculatedTotalTaxable = 0;
    jsonData.itemList?.forEach((item, index) => {
        const prefix = `Item ${index + 1}`;

        // HSN Validation
        const hsn = String(item.hsnCode);
        if (![4, 6, 8].includes(hsn.length)) {
            addError(`${prefix} HSN Code`, 'HSN code length must be 4, 6, or 8 digits');
        }

        // Taxable Amount
        if (item.taxableAmount < 0) {
            addError(`${prefix} Taxable Amount`, 'Taxable value cannot be negative');
        }
        calculatedTotalTaxable += Number(item.taxableAmount);

        // Tax Rates
        const allowedRates = [0, 5, 12, 18, 28];
        const itemTotalRate = (item.cgstRate || 0) + (item.sgstRate || 0) + (item.igstRate || 0);
        if (!allowedRates.includes(itemTotalRate)) {
            addError(`${prefix} GST Rate`, `Invalid GST Rate: ${itemTotalRate}%`);
        }

        // CGST/SGST vs IGST Logic
        const isIntrastate = jsonData.fromStateCode === jsonData.toStateCode;
        if (isIntrastate) {
            if (item.igstRate > 0) {
                addError(`${prefix} IGST Rate`, 'IGST cannot be charged for Intrastate supply');
            }
        } else {
            if (item.cgstRate > 0 || item.sgstRate > 0) {
                addError(`${prefix} CGST/SGST Rate`, 'CGST/SGST cannot be charged for Interstate supply');
            }
        }
    });

    // 6. Math Validation
    const totalTax = (Number(jsonData.cgstValue) || 0) + (Number(jsonData.sgstValue) || 0) + (Number(jsonData.igstValue) || 0);
    const calculatedTotalValue = Number(jsonData.totalValue) + totalTax;

    const tolerance = 2.0; // Allow small rounding differences
    if (Math.abs(calculatedTotalValue - Number(jsonData.totInvValue)) > tolerance) {
        addError('totInvValue', `Invoice total calculation is incorrect: Calculated ${calculatedTotalValue.toFixed(2)}, Found ${jsonData.totInvValue}`);
    }

    if (Math.abs(calculatedTotalTaxable - Number(jsonData.totalValue)) > tolerance) {
        addError('totalValue', `Taxable amount mismatch: Sum of items ${calculatedTotalTaxable.toFixed(2)}, Found ${jsonData.totalValue}`);
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};
