/**
 * Utility to generate NIC E-Invoice / E-Way Bill Bulk Upload JSON
 */

/**
 * Generates E-Invoice JSON following NIC Standard Schema (Standard Nested Format)
 * Returns an ARRAY as requested for bulk upload compatibility.
 */
export const generateEInvoiceJSON = (invoiceData, settings) => {
    const {
        invoiceNo,
        createdAt,
        totalAmount,
        taxableValue,
        taxAmount,
        destinationPincode,
        itemsSummary,
        customerGSTIN,
        customerName,
        taxRate,
        fromLocation
    } = invoiceData;

    const company = settings?.company || {};
    const sellerGstin = invoiceData.sellerGSTIN || company.gstin || "DUMMY_GSTIN";
    const buyerGstin = customerGSTIN || "URP";

    const isIntrastate = sellerGstin.substring(0, 2) === (buyerGstin !== "URP" ? buyerGstin.substring(0, 2) : "33");

    // Format date as DD/MM/YYYY
    const docDate = createdAt?.seconds ?
        new Date(createdAt.seconds * 1000).toLocaleDateString('en-GB') :
        new Date().toLocaleDateString('en-GB');

    const invoice = {
        Version: "1.1",
        TranDtls: {
            TaxSch: "GST",
            SupTyp: buyerGstin === "URP" ? "B2C" : "B2B",
            RegRev: "N",
            EcmGstin: null,
            IgstOnIntra: "N"
        },
        DocDtls: {
            Typ: "INV",
            No: invoiceNo,
            Dt: docDate
        },
        SellerDtls: {
            Gstin: sellerGstin,
            LglNm: (company.name || "MAB CHEM").substring(0, 100),
            TrdNm: (company.name || "MAB CHEM").substring(0, 100),
            Addr1: (company.address || "OFFICE ADDRESS").substring(0, 100),
            Loc: fromLocation || "WAREHOUSE",
            Pin: Number(company.pincode) || 600001,
            Stcd: sellerGstin.substring(0, 2)
        },
        BuyerDtls: {
            Gstin: buyerGstin,
            LglNm: (customerName || "CUSTOMER").substring(0, 100),
            TrdNm: (customerName || "CUSTOMER").substring(0, 100),
            Addr1: (invoiceData.customerAddress || "CUSTOMER ADDRESS").substring(0, 100),
            Loc: "DESTINATION",
            Pin: Number(destinationPincode) || 600001,
            Stcd: buyerGstin !== "URP" ? buyerGstin.substring(0, 2) : "33",
            Pos: buyerGstin !== "URP" ? buyerGstin.substring(0, 2) : "33"
        },
        ItemList: (itemsSummary || []).map((item, index) => {
            const qty = Number(item.quantity) || 0;
            const rate = Number(item.price) || 0;
            const itemTaxable = Number((qty * rate).toFixed(2));
            const itemTaxRate = Number(item.taxRate) || Number(taxRate) || 18;

            return {
                SlNo: String(index + 1),
                PrdDesc: item.productName || item.name,
                IsServc: "N",
                HsnCd: String(item.hsnCode || "3824"),
                Qty: qty,
                Unit: "MTS",
                UnitPrice: rate,
                TotAmt: itemTaxable,
                AssAmt: itemTaxable,
                GstRt: itemTaxRate,
                CgstAmt: isIntrastate ? Number((itemTaxable * itemTaxRate / 200).toFixed(2)) : 0,
                SgstAmt: isIntrastate ? Number((itemTaxable * itemTaxRate / 200).toFixed(2)) : 0,
                IgstAmt: !isIntrastate ? Number((itemTaxable * itemTaxRate / 100).toFixed(2)) : 0,
                CesRt: 0,
                CesAmt: 0,
                CesNonAdvlAmt: 0,
                StateCesRt: 0,
                StateCesAmt: 0,
                StateCesNonAdvlAmt: 0,
                OthChrg: 0,
                TotItemVal: Number((itemTaxable * (1 + itemTaxRate / 100)).toFixed(2))
            };
        }),
        ValDtls: {
            AssVal: Number(Number(taxableValue || 0).toFixed(2)),
            CgstVal: isIntrastate ? Number((Number(taxAmount || 0) / 2).toFixed(2)) : 0,
            SgstVal: isIntrastate ? Number((Number(taxAmount || 0) / 2).toFixed(2)) : 0,
            IgstVal: !isIntrastate ? Number(Number(taxAmount || 0).toFixed(2)) : 0,
            CesVal: 0,
            StCesVal: 0,
            Discount: 0,
            OthChrg: 0,
            RndOffAmt: 0,
            TotInvVal: Number(Number(totalAmount || 0).toFixed(2))
        }
    };

    return [invoice]; // Root as Array
};

/**
 * Original flat E-Way Bill JSON (kept for compatibility)
 */
export const generateEwayBillJSON = (invoiceData, settings) => {
    // Current flat format implementation (remains same for now)
    const {
        invoiceNo, createdAt, totalAmount, taxableValue, taxAmount,
        distance, vehicleNumber, destinationPincode, transporterGSTIN,
        transporterName, itemsSummary, customerGSTIN, customerName,
        taxRate, fromLocation
    } = invoiceData;

    const company = settings?.company || {};
    const docDate = createdAt?.seconds ?
        new Date(createdAt.seconds * 1000).toLocaleDateString('en-GB') :
        new Date().toLocaleDateString('en-GB');

    const payload = {
        supplyType: "O", subSupplyType: "1", docType: "INV", docNo: invoiceNo, docDate: docDate,
        fromGstin: invoiceData.sellerGSTIN || company.gstin || "DUMMY_GSTIN",
        fromTrdName: (company.name || "MAB CHEM").substring(0, 100),
        fromAddr1: (company.address || "OFFICE").substring(0, 100), fromPlace: fromLocation || "WAREHOUSE",
        fromPincode: Number(company.pincode) || 600001,
        fromStateCode: Number((invoiceData.sellerGSTIN || company.gstin || "33").substring(0, 2)) || 33,
        toGstin: customerGSTIN || "DUMMY_GSTIN", toTrdName: (customerName || "CUSTOMER").substring(0, 100),
        toAddr1: (invoiceData.customerAddress || "ADDR").substring(0, 100), toPlace: "DESTINATION",
        toPincode: Number(destinationPincode) || 600001, toStateCode: Number((customerGSTIN || "33").substring(0, 2)) || 33,
        transactionType: 1, dispatchFromPincode: Number(company.pincode) || 600001, shipToPincode: Number(destinationPincode) || 600001,
        itemList: (itemsSummary || []).map((item, index) => ({
            itemNo: index + 1, productName: item.productName || item.name, hsnCode: Number(item.hsnCode) || 3824,
            quantity: Number(item.quantity), qtyUnit: "MTS", cgstRate: Number(((Number(taxRate) || 18) / 2).toFixed(2)),
            sgstRate: Number(((Number(taxRate) || 18) / 2).toFixed(2)), igstRate: 0, taxableAmount: Number((Number(item.quantity) * Number(item.price)).toFixed(2))
        })),
        totalValue: Number(Number(taxableValue || 0).toFixed(2)),
        cgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)), sgstValue: Number((Number(taxAmount || 0) / 2).toFixed(2)),
        totInvValue: Number(Number(totalAmount || 0).toFixed(2)),
        transMode: "1", transDistance: Number(distance) || 0, transporterId: transporterGSTIN || "", vehicleNo: (vehicleNumber || "").replace(/\s+/g, "").toUpperCase()
    };

    return payload; // Flat object
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
