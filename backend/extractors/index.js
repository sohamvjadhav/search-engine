const path = require('path');
const { extractText } = require('./textExtractor');
const { extractPdf } = require('./pdfExtractor');
const { extractCsv } = require('./csvExtractor');
const { extractPptx } = require('./pptxExtractor');

/**
 * Supported file extensions and their extractors
 */
const EXTRACTORS = {
    '.txt': extractText,
    '.pdf': extractPdf,
    '.csv': extractCsv,
    '.pptx': extractPptx
};

/**
 * Get the appropriate extractor for a file
 * @param {string} filePath - Path to the file
 * @returns {Function|null} - Extractor function or null if unsupported
 */
function getExtractor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return EXTRACTORS[ext] || null;
}

/**
 * Extract content from a file based on its extension
 * @param {string} filePath - Path to the file
 * @returns {Promise<{content: string, type: string}>} - Extracted content and file type
 */
async function extractContent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const extractor = getExtractor(filePath);

    if (!extractor) {
        throw new Error(`Unsupported file type: ${ext}`);
    }

    const content = await extractor(filePath);
    return {
        content,
        type: ext.replace('.', '')
    };
}

/**
 * Check if a file type is supported
 * @param {string} filePath - Path to the file
 * @returns {boolean} - Whether the file type is supported
 */
function isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext in EXTRACTORS;
}

/**
 * Get list of supported extensions
 * @returns {string[]} - Array of supported extensions
 */
function getSupportedExtensions() {
    return Object.keys(EXTRACTORS);
}

module.exports = {
    extractContent,
    getExtractor,
    isSupported,
    getSupportedExtensions
};
