/**
 * Utility to generate NIC E-Way Bill Bulk Upload JSON
 * Mandatory fields as per request: 
 * supplyType, subSupplyType, docType, docNo, docDate, fromGstin, fromPincode, 
 * toGstin, toPincode, hsnCode, taxableAmount, cgstValue, sgstValue, igstValue, 
 * transDistance, vehicleNo
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
        taxRate
    } = invoiceData;

    const company = settings?.company || {};

    // Format date as DD/MM/YYYY
    const docDate = createdAt?.seconds ?
        new Date(createdAt.seconds * 1000).toLocaleDateString('en-GB') :
        new Date().toLocaleDateString('en-GB');

    // NIC Bulk Upload expect numbers as numbers (no quotes)
    const payload = {
        supplyType: "O", // Outward
        subSupplyType: "1", // Supply
        docType: "INV", // Tax Invoice
        docNo: invoiceNo,
        docDate: docDate,
        fromGstin: company.gstin || import.meta.env.VITE_COMPANY_GSTIN || "",
        fromPincode: Number(company.pincode) || Number(company.pinCode) || 600001,
        toGstin: customerGSTIN || "",
        toPincode: Number(destinationPincode) || 0,
        transactionType: 1, // Regular
        dispatchFromPincode: Number(company.pincode) || Number(company.pinCode) || 600001,
        shipToPincode: Number(destinationPincode) || 0,

        // Items mapping
        itemList: (itemsSummary || []).map(item => {
            const itemTaxable = Number(item.quantity) * Number(item.price);
            const rate = Number(taxRate) || 18;
            return {
                productName: item.productName || item.name,
                productDesc: item.productName || item.name,
                hsnCode: Number(item.hsnCode) || 0,
                quantity: Number(item.quantity),
                qtyUnit: "MTS",
                cgstRate: Number((rate / 2).toFixed(2)),
                sgstRate: Number((rate / 2).toFixed(2)),
                igstRate: 0,
                cessRate: 0,
                taxableAmount: Number(itemTaxable.toFixed(2))
            };
        }),

        totalValue: Number(Number(taxableValue || 0).toFixed(2)),
        cgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)),
        sgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)),
        igstValue: 0,
        cessValue: 0,
        totInvValue: Number(Number(totalAmount || 0).toFixed(2)),

        // Transportation
        transMode: "1", // Road
        transDistance: Number(distance) || 0,
        transporterId: transporterGSTIN || "",
        transporterName: transporterName || "",
        vehicleNo: (vehicleNumber || "").replace(/\s+/g, "").toUpperCase(),
        vehicleType: "R" // Regular
    };

    return payload;
};

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
