const fs = require('fs').promises;
const pdfParse = require('pdf-parse');

/**
 * Extract text content from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractPdf(filePath) {
    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text.trim();
    } catch (error) {
        console.error(`Error extracting PDF ${filePath}:`, error.message);
        throw error;
    }
}

module.exports = { extractPdf };
