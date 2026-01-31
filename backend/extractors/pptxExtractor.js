const officeparser = require('officeparser');

/**
 * Extract text content from a PowerPoint (.pptx) file
 * @param {string} filePath - Path to the PPTX file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractPptx(filePath) {
    try {
        const text = await officeparser.parseOfficeAsync(filePath);
        return text.trim();
    } catch (error) {
        console.error(`Error extracting PPTX ${filePath}:`, error.message);
        throw error;
    }
}

module.exports = { extractPptx };
