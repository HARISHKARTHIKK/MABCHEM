import * as XLSX from 'xlsx';

/**
 * Exports data to an Excel (.xlsx) file.
 * @param {Array<Object>} rows - The data to export as a list of objects.
 * @param {string} filename - The name of the file to save (will be forced to .xlsx).
 */
export function exportToExcel(rows, filename) {
    // Handle old signature (filename, rows) for backward compatibility if needed,
    // though we should ideally update all callers.
    let data = rows;
    let name = filename;

    if (typeof rows === 'string' && Array.isArray(filename)) {
        data = filename;
        name = rows;
    }

    if (!data || !data.length) {
        alert("No data to export");
        return;
    }

    try {
        // Convert JSON to Worksheet
        const worksheet = XLSX.utils.json_to_sheet(data);

        // Create a new Workbook
        const workbook = XLSX.utils.book_new();

        // Append the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Export");

        // Ensure filename ends with .xlsx and remove .csv if present
        let cleanName = (name || 'Export').replace(/\.csv$/i, '');
        if (!cleanName.toLowerCase().endsWith('.xlsx')) {
            cleanName += '.xlsx';
        }

        // Write and download
        XLSX.writeFile(workbook, cleanName);
    } catch (error) {
        console.error("Excel Export Error:", error);
        alert("Failed to export to Excel: " + error.message);
    }
}
