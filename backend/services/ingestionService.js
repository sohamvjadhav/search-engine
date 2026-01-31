const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const { extractContent, isSupported, getSupportedExtensions } = require('../extractors');
require('dotenv').config();

/**
 * Ingestion Service
 * Handles reading documents from the filesystem and storing them in the database
 */

const DOCUMENTS_PATH = path.resolve(__dirname, '..', process.env.DOCUMENTS_PATH || '../generated_documents');

/**
 * Get all files from the documents directory
 * @returns {Promise<string[]>} - Array of file paths
 */
async function getDocumentFiles() {
    try {
        const files = await fs.readdir(DOCUMENTS_PATH);
        const supportedFiles = files.filter(file => isSupported(file));
        return supportedFiles.map(file => path.join(DOCUMENTS_PATH, file));
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Documents directory not found: ${DOCUMENTS_PATH}`);
            return [];
        }
        throw error;
    }
}

/**
 * Clear all documents from the database
 * @returns {Promise<void>}
 */
async function clearDocuments() {
    await pool.execute('TRUNCATE TABLE documents');
    console.log('✓ Cleared existing documents from database');
}

/**
 * Insert a document into the database
 * @param {string} filename - Name of the file
 * @param {string} filetype - Type of file (txt, pdf, csv, pptx)
 * @param {string} content - Extracted text content
 * @returns {Promise<number>} - Inserted document ID
 */
async function insertDocument(filename, filetype, content) {
    const [result] = await pool.execute(
        'INSERT INTO documents (filename, filetype, content) VALUES (?, ?, ?)',
        [filename, filetype, content]
    );
    return result.insertId;
}

/**
 * Ingest all documents from the documents directory
 * @param {boolean} clearExisting - Whether to clear existing documents first
 * @returns {Promise<{success: number, failed: number, files: string[]}>}
 */
async function ingestDocuments(clearExisting = true) {
    const files = await getDocumentFiles();

    if (files.length === 0) {
        console.log('No documents found to ingest');
        return { success: 0, failed: 0, files: [] };
    }

    if (clearExisting) {
        await clearDocuments();
    }

    let success = 0;
    let failed = 0;
    const processedFiles = [];

    console.log(`\nIngesting ${files.length} documents from ${DOCUMENTS_PATH}...`);
    console.log(`Supported formats: ${getSupportedExtensions().join(', ')}\n`);

    for (const filePath of files) {
        const filename = path.basename(filePath);

        try {
            const { content, type } = await extractContent(filePath);
            await insertDocument(filename, type, content);
            processedFiles.push(filename);
            success++;
            console.log(`  ✓ ${filename} (${type}) - ${content.length} chars`);
        } catch (error) {
            failed++;
            console.error(`  ✗ ${filename} - ${error.message}`);
        }
    }

    console.log(`\nIngestion complete: ${success} succeeded, ${failed} failed`);

    return { success, failed, files: processedFiles };
}

/**
 * Get all documents from the database
 * @returns {Promise<Array<{id: number, filename: string, filetype: string, content: string}>>}
 */
async function getAllDocuments() {
    const [rows] = await pool.execute(
        'SELECT id, filename, filetype, content FROM documents ORDER BY filename'
    );
    return rows;
}

/**
 * Get document count
 * @returns {Promise<number>}
 */
async function getDocumentCount() {
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM documents');
    return rows[0].count;
}

/**
 * Get document statistics
 * @returns {Promise<{total: number, byType: Object}>}
 */
async function getDocumentStats() {
    const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM documents');
    const [typeResult] = await pool.execute(
        'SELECT filetype, COUNT(*) as count FROM documents GROUP BY filetype'
    );

    const byType = {};
    typeResult.forEach(row => {
        byType[row.filetype] = row.count;
    });

    return {
        total: countResult[0].total,
        byType
    };
}

module.exports = {
    ingestDocuments,
    getAllDocuments,
    getDocumentCount,
    getDocumentStats,
    getDocumentFiles,
    DOCUMENTS_PATH
};
