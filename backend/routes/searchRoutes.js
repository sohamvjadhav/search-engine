const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { ingestDocuments, getAllDocuments, getDocumentStats, DOCUMENTS_PATH } = require('../services/ingestionService');
const { searchDocuments, estimateTokens } = require('../services/llmService');
const { extractContent, isSupported } = require('../extractors');

/**
 * Fallback: Load documents directly from filesystem when DB is unavailable
 */
async function loadDocumentsFromFilesystem() {
    try {
        const files = await fs.readdir(DOCUMENTS_PATH);
        const supportedFiles = files.filter(file => isSupported(file));

        const documents = [];
        for (const file of supportedFiles) {
            try {
                const filePath = path.join(DOCUMENTS_PATH, file);
                const { content, type } = await extractContent(filePath);
                documents.push({
                    id: documents.length + 1,
                    filename: file,
                    filetype: type,
                    content
                });
            } catch (err) {
                console.log(`  Skipping ${file}: ${err.message}`);
            }
        }
        return documents;
    } catch (error) {
        console.log('[Filesystem] Could not read documents folder:', error.message);
        return [];
    }
}

/**
 * Get documents - try DB first, fallback to filesystem
 */
async function getDocumentsWithFallback() {
    try {
        const docs = await getAllDocuments();
        if (docs.length > 0) {
            console.log('[Search] Using documents from database');
            return docs;
        }
    } catch (error) {
        console.log('[Search] Database unavailable, using filesystem fallback');
    }

    // Fallback to filesystem
    console.log('[Search] Loading documents from filesystem...');
    return await loadDocumentsFromFilesystem();
}

/**
 * POST /api/search
 * Main search endpoint - sends query + all documents to LLM
 */
router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid query',
                message: 'Please provide a non-empty query string'
            });
        }

        console.log(`\n[Search] Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);

        // Fetch all documents (with DB fallback)
        const documents = await getDocumentsWithFallback();
        console.log(`[Search] Loaded ${documents.length} documents`);

        if (documents.length === 0) {
            return res.json({
                success: true,
                query: query.trim(),
                response: 'No documents found. Please add documents to the `generated_documents` folder and try again.',
                metadata: { documentsSearched: 0, processingTimeMs: 0 }
            });
        }

        // Estimate tokens for logging
        const estimatedTokens = estimateTokens(documents);
        console.log(`[Search] Estimated context tokens: ~${estimatedTokens.toLocaleString()}`);

        // Send to LLM for search and synthesis
        const startTime = Date.now();
        const response = await searchDocuments(query.trim(), documents);
        const duration = Date.now() - startTime;

        console.log(`[Search] Response generated in ${duration}ms`);

        res.json({
            success: true,
            query: query.trim(),
            response,
            metadata: {
                documentsSearched: documents.length,
                processingTimeMs: duration
            }
        });

    } catch (error) {
        console.error('[Search] Error:', error.message);
        res.status(500).json({
            error: 'Search failed',
            message: error.message
        });
    }
});

/**
 * POST /api/ingest
 * Trigger document ingestion from the documents folder
 */
router.post('/ingest', async (req, res) => {
    try {
        console.log('\n[Ingest] Starting document ingestion...');

        const result = await ingestDocuments(true);

        res.json({
            success: true,
            message: `Ingested ${result.success} documents`,
            ...result,
            documentsPath: DOCUMENTS_PATH
        });

    } catch (error) {
        console.error('[Ingest] Error:', error.message);

        // Check for specific database errors
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ECONNREFUSED') {
            return res.status(500).json({
                error: 'Database not available',
                message: 'MySQL is not running. The search will still work using filesystem mode.'
            });
        }

        res.status(500).json({
            error: 'Ingestion failed',
            message: error.message
        });
    }
});

/**
 * GET /api/documents
 * List all ingested documents (without full content)
 */
router.get('/documents', async (req, res) => {
    try {
        const documents = await getDocumentsWithFallback();

        // Return documents with truncated content for listing
        const documentList = documents.map(doc => ({
            id: doc.id,
            filename: doc.filename,
            filetype: doc.filetype,
            contentPreview: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
            contentLength: doc.content.length
        }));

        res.json({
            success: true,
            stats: { total: documents.length },
            documents: documentList
        });

    } catch (error) {
        console.error('[Documents] Error:', error.message);
        res.status(500).json({
            error: 'Failed to fetch documents',
            message: error.message
        });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
    try {
        const documents = await getDocumentsWithFallback();
        res.json({
            status: 'ok',
            documentsIngested: documents.length,
            mode: 'filesystem'
        });
    } catch (error) {
        res.json({
            status: 'ok',
            documentsIngested: 0,
            mode: 'filesystem',
            note: 'No documents loaded'
        });
    }
});

module.exports = router;
