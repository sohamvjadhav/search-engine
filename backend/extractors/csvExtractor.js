const fs = require('fs');
const csv = require('csv-parser');

/**
 * Extract text content from a CSV file
 * Converts CSV to readable text format with headers
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractCsv(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        let headers = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headerRow) => {
                headers = headerRow;
            })
            .on('data', (row) => {
                rows.push(row);
            })
            .on('end', () => {
                // Convert to readable text format
                let textContent = '';

                if (headers.length > 0) {
                    textContent += `Columns: ${headers.join(', ')}\n\n`;
                }

                textContent += `Data (${rows.length} rows):\n`;

                rows.forEach((row, index) => {
                    const rowParts = Object.entries(row)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    textContent += `Row ${index + 1}: ${rowParts}\n`;
                });

                resolve(textContent.trim());
            })
            .on('error', (error) => {
                console.error(`Error extracting CSV ${filePath}:`, error.message);
                reject(error);
            });
    });
}

module.exports = { extractCsv };
