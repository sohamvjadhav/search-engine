const fs = require('fs').promises;
const path = require('path');

/**
 * Extract text content from a .txt file
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} - Extracted text content
 */
async function extractText(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content.trim();
    } catch (error) {
        console.error(`Error reading text file ${filePath}:`, error.message);
        throw error;
    }
}

module.exports = { extractText };
