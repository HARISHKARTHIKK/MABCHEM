/**
 * Utility to generate NIC E-Way Bill Bulk Upload JSON
 * This function replicates the logic previously handled by the Node.js backend
 * to support a pure Static Site deployment.
 */

export const generateEwayBillJSON = (invoiceData, settings) => {
    const {
        invoiceNo,
        createdAt,
        totalAmount,
        taxableValue,
        taxAmount,
        distance,
        vehicleNumber,
        destinationPincode,
        transporterGSTIN,
        transporterName,
        itemsSummary,
        customerGSTIN,
        customerName,
        taxRate,
        fromLocation
    } = invoiceData;

    const company = settings?.company || {};

    // Format date as DD/MM/YYYY for NIC Bulk Upload format
    const docDate = createdAt?.seconds ?
        new Date(createdAt.seconds * 1000).toLocaleDateString('en-GB') :
        new Date().toLocaleDateString('en-GB');

    // NIC Bulk Upload expect numeric values as numbers (no quotes)
    const payload = {
        supplyType: "O", // Outward
        subSupplyType: "1", // Supply
        docType: "INV", // Tax Invoice
        docNo: invoiceNo,
        docDate: docDate,

        // Dispatcher Details (from Invoice/Settings)
        fromGstin: invoiceData.sellerGSTIN || company.gstin || import.meta.env.VITE_COMPANY_GSTIN || "DUMMY_GSTIN",
        fromTrdName: (company.name || "MAB CHEM").substring(0, 100),
        fromAddr1: (company.address || "OFFICE ADDRESS").substring(0, 100),
        fromAddr2: "",
        fromPlace: fromLocation || "WAREHOUSE",
        fromPincode: Number(company.pincode) || Number(company.pinCode) || 600001,
        fromStateCode: Number((invoiceData.sellerGSTIN || company.gstin || "33").substring(0, 2)) || 33,

        // Recipient Details (from Invoice/Customer)
        toGstin: customerGSTIN || "DUMMY_GSTIN",
        toTrdName: (customerName || "CUSTOMER").substring(0, 100),
        toAddr1: (invoiceData.customerAddress || "CUSTOMER ADDRESS").substring(0, 100),
        toAddr2: "",
        toPlace: "DESTINATION",
        toPincode: Number(destinationPincode) || 600001,
        toStateCode: Number((customerGSTIN || "33").substring(0, 2)) || 33,

        transactionType: 1, // Regular
        dispatchFromPincode: Number(company.pincode) || Number(company.pinCode) || 600001,
        shipToPincode: Number(destinationPincode) || 600001,

        // Items mapping - Strictly ensuring all IDs/HSNs are numeric for NIC
        itemList: (itemsSummary || []).map((item, index) => {
            const itemTaxable = Number(item.quantity) * Number(item.price);
            const rate = Number(taxRate) || 18;
            return {
                itemNo: index + 1,
                productName: item.productName || item.name,
                productDesc: item.productName || item.name,
                hsnCode: Number(item.hsnCode) || 3824, // Fallback to common HSN if missing
                quantity: Number(item.quantity),
                qtyUnit: "MTS",
                cgstRate: Number((rate / 2).toFixed(2)),
                sgstRate: Number((rate / 2).toFixed(2)),
                igstRate: 0,
                cessRate: 0,
                taxableAmount: Number(itemTaxable.toFixed(2))
            };
        }),

        // Summary Values
        totalValue: Number(Number(taxableValue || 0).toFixed(2)),
        cgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)),
        sgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)),
        igstValue: 0,
        cessValue: 0,
        totInvValue: Number(Number(totalAmount || 0).toFixed(2)),

        // Transportation Details
        transMode: "1", // Road
        transDistance: Number(distance) || 0,
        transporterId: transporterGSTIN || "",
        transporterName: transporterName || "",
        transDocNo: "",
        transDocDate: "",
        vehicleNo: (vehicleNumber || "").replace(/\s+/g, "").toUpperCase(),
        vehicleType: "R" // Regular
    };

    return payload;
};

/**
 * Helper to trigger a browser download of the generated JSON
 */
export const downloadJSON = (filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
