export function exportToCSV(filename, rows) {
    if (!rows || !rows.length) {
        alert("No data to export");
        return;
    }

    const separator = ',';
    const keys = Object.keys(rows[0]);

    // Create CSV content
    const csvContent = [
        keys.join(separator), // Header row
        ...rows.map(row =>
            keys.map(key => {
                let cell = row[key] === null || row[key] === undefined ? '' : row[key];
                // Handle strings with commas or quotes
                if (typeof cell === 'string') {
                    cell = `"${cell.replace(/"/g, '""')}"`; // Escape quotes and wrap in quotes
                }
                return cell;
            }).join(separator)
        )
    ].join('\n');

    // Create blobs and simple download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}
