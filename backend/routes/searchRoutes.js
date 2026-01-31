const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { ingestDocuments, getAllDocuments, getDocumentStats, DOCUMENTS_PATH } = require('../services/ingestionService');
const { searchDocuments, estimateTokens, getCache } = require('../services/llmService');
const { extractContent, isSupported } = require('../extractors');
const { testConnection } = require('../config/database');

// Configuration
const MAX_QUERY_LENGTH = 2000;  // Max query length in characters
const RATE_LIMIT_WINDOW_MS = 60000;  // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 10;  // Max requests per IP per window

// In-memory rate limiting store
const rateLimitStore = new Map();

// In-memory document index for filesystem mode
let documentIndex = null;
let indexLastUpdated = null;
let corpusVersion = null;

/**
 * Generate corpus version based on document count and latest mtime
 */
async function generateCorpusVersion() {
    try {
        const files = await fs.readdir(DOCUMENTS_PATH);
        const supportedFiles = files.filter(file => isSupported(file));

        if (supportedFiles.length === 0) {
            return 'empty';
        }

        let latestMtime = 0;
        for (const file of supportedFiles) {
            const filePath = path.join(DOCUMENTS_PATH, file);
            const stats = await fs.stat(filePath);
            if (stats.mtimeMs > latestMtime) {
                latestMtime = stats.mtimeMs;
            }
        }

        return `${supportedFiles.length}-${latestMtime}`;
    } catch (error) {
        return `error-${Date.now()}`;
    }
}

/**
 * Build in-memory document index for filesystem mode
 */
async function buildDocumentIndex() {
    console.log('[Index] Building in-memory document index...');
    const startTime = Date.now();

    try {
        const files = await fs.readdir(DOCUMENTS_PATH);
        const supportedFiles = files.filter(file => isSupported(file));

        const index = [];
        for (const file of supportedFiles) {
            try {
                const filePath = path.join(DOCUMENTS_PATH, file);
                const { content, type } = await extractContent(filePath);
                index.push({
                    id: index.length + 1,
                    filename: file,
                    filetype: type,
                    content,
                    contentPreview: content.substring(0, 350),
                    contentLength: content.length
                });
            } catch (err) {
                console.log(`  Skipping ${file}: ${err.message}`);
            }
        }

        documentIndex = index;
        indexLastUpdated = new Date().toISOString();
        corpusVersion = await generateCorpusVersion();

        console.log(`[Index] Built index with ${index.length} documents in ${Date.now() - startTime}ms`);
        console.log(`[Index] Corpus version: ${corpusVersion}`);

        return index;
    } catch (error) {
        console.error('[Index] Failed to build index:', error.message);
        return [];
    }
}

/**
 * Get documents from index or build it
 */
async function getIndexedDocuments() {
    // Rebuild index if empty
    if (!documentIndex) {
        await buildDocumentIndex();
    }
    return documentIndex || [];
}

/**
 * Invalidate document index (call after ingestion)
 */
function invalidateDocumentIndex() {
    documentIndex = null;
    corpusVersion = null;
    console.log('[Index] Document index invalidated');
}

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
 * Get documents - try DB first, fallback to filesystem index
 */
async function getDocumentsWithFallback() {
    try {
        const docs = await getAllDocuments();
        if (docs.length > 0) {
            console.log('[Search] Using documents from database');
            // Update corpus version for DB mode
            if (!corpusVersion) {
                corpusVersion = `db-${docs.length}-${Date.now()}`;
            }
            return docs;
        }
    } catch (error) {
        console.log('[Search] Database unavailable, using filesystem index');
    }

    // Fallback to filesystem index
    console.log('[Search] Loading documents from in-memory index...');
    return await getIndexedDocuments();
}

/**
 * Rate limiting middleware
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Get or create rate limit entry
    let entry = rateLimitStore.get(ip);
    if (!entry) {
        entry = { requests: [], blocked: false, blockedUntil: 0 };
        rateLimitStore.set(ip, entry);
    }

    // Check if currently blocked
    if (entry.blocked && now < entry.blockedUntil) {
        const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
        return { allowed: false, retryAfter, reason: 'blocked' };
    }

    // Clear expired block
    if (entry.blocked && now >= entry.blockedUntil) {
        entry.blocked = false;
        entry.requests = [];
    }

    // Clean old requests outside window
    entry.requests = entry.requests.filter(time => time > windowStart);

    // Check if over limit
    if (entry.requests.length >= RATE_LIMIT_MAX_REQUESTS) {
        entry.blocked = true;
        entry.blockedUntil = now + RATE_LIMIT_WINDOW_MS;
        return { allowed: false, retryAfter: RATE_LIMIT_WINDOW_MS / 1000, reason: 'rate_limit' };
    }

    // Record request
    entry.requests.push(now);
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.requests.length };
}

/**
 * POST /api/search
 * Main search endpoint with two-stage retrieval, caching, and rate limiting
 */
router.post('/search', async (req, res) => {
    const startTime = Date.now();

    try {
        const { query } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

        // Check rate limit
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: `Too many requests. Please try again in ${rateLimit.retryAfter} seconds.`,
                retryAfter: rateLimit.retryAfter
            });
        }

        // Validate query
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid query',
                message: 'Please provide a non-empty query string'
            });
        }

        // Check query length
        if (query.length > MAX_QUERY_LENGTH) {
            return res.status(400).json({
                error: 'Query too long',
                message: `Query must be less than ${MAX_QUERY_LENGTH} characters`
            });
        }

        const trimmedQuery = query.trim();
        console.log(`\n[Search] Query: "${trimmedQuery.substring(0, 100)}${trimmedQuery.length > 100 ? '...' : ''}"`);
        console.log(`[Search] Client IP: ${clientIp}, Remaining requests: ${rateLimit.remaining}`);

        // Fetch all documents (with DB fallback)
        const documents = await getDocumentsWithFallback();
        console.log(`[Search] Loaded ${documents.length} documents`);

        if (documents.length === 0) {
            return res.json({
                success: true,
                query: trimmedQuery,
                response: 'No documents found. Please add documents to the `generated_documents` folder and try again.',
                sources: [],
                metadata: {
                    documentsSearched: 0,
                    documentsSelected: 0,
                    processingTimeMs: Date.now() - startTime,
                    cached: false
                }
            });
        }

        // Check cache
        const cache = getCache();
        const currentCorpusVersion = corpusVersion || await generateCorpusVersion();
        const cachedResult = cache.get(trimmedQuery, currentCorpusVersion);

        if (cachedResult) {
            console.log('[Search] Cache hit! Returning cached response');
            return res.json({
                success: true,
                query: trimmedQuery,
                response: cachedResult.answer,
                sources: cachedResult.sources,
                metadata: {
                    documentsSearched: documents.length,
                    documentsSelected: cachedResult.documentsSelected,
                    processingTimeMs: Date.now() - startTime,
                    cached: true
                }
            });
        }

        // Estimate tokens for logging
        const estimatedTokens = estimateTokens(documents);
        console.log(`[Search] Estimated context tokens: ~${estimatedTokens.toLocaleString()}`);

        // Two-stage search
        const searchStartTime = Date.now();
        const { answer, sources, documentsSelected } = await searchDocuments(trimmedQuery, documents);
        const searchDuration = Date.now() - searchStartTime;

        // Cache the result
        cache.set(trimmedQuery, currentCorpusVersion, {
            answer,
            sources,
            documentsSelected
        });

        const totalDuration = Date.now() - startTime;
        console.log(`[Search] Total response time: ${totalDuration}ms`);

        res.json({
            success: true,
            query: trimmedQuery,
            response: answer,
            sources,
            metadata: {
                documentsSearched: documents.length,
                documentsSelected,
                processingTimeMs: totalDuration,
                cached: false
            }
        });

    } catch (error) {
        console.error('[Search] Error:', error.message);

        // Handle specific error types
        if (error.message.includes('timeout')) {
            return res.status(504).json({
                error: 'Request timeout',
                message: 'The search took too long to complete. Please try again.'
            });
        }

        if (error.message.includes('GROQ_API_KEY')) {
            return res.status(503).json({
                error: 'Service unavailable',
                message: error.message
            });
        }

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

        // Invalidate the in-memory index after ingestion
        invalidateDocumentIndex();

        // Clear cache since corpus has changed
        getCache().clear();
        console.log('[Ingest] Cache cleared due to corpus update');

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
 * Health check endpoint with truthful mode and stats
 */
router.get('/health', async (req, res) => {
    try {
        const startTime = Date.now();

        // Check database connection
        const dbConnected = await testConnection();

        // Get document count
        let documentsIngested = 0;
        let storageMode = 'filesystem';
        let lastIngestTime = null;

        if (dbConnected) {
            try {
                const stats = await getDocumentStats();
                documentsIngested = stats.total;
                storageMode = 'db';
            } catch (error) {
                // Fall back to filesystem
                const docs = await getIndexedDocuments();
                documentsIngested = docs.length;
                lastIngestTime = indexLastUpdated;
            }
        } else {
            const docs = await getIndexedDocuments();
            documentsIngested = docs.length;
            lastIngestTime = indexLastUpdated;
        }

        // Check Groq configuration
        const groqConfigured = !!(
            process.env.GROQ_API_KEY &&
            process.env.GROQ_API_KEY !== 'your_groq_api_key_here'
        );

        // Get cache stats
        const cacheStats = getCache().getStats();

        res.json({
            status: 'ok',
            storageMode,
            documentsIngested,
            groqConfigured,
            lastIngestTime,
            corpusVersion: corpusVersion || 'unknown',
            cache: cacheStats,
            responseTimeMs: Date.now() - startTime
        });
    } catch (error) {
        res.json({
            status: 'degraded',
            storageMode: 'unknown',
            documentsIngested: 0,
            groqConfigured: false,
            error: error.message
        });
    }
});

/**
 * POST /api/index/rebuild
 * Manually rebuild the in-memory document index
 */
router.post('/index/rebuild', async (req, res) => {
    try {
        console.log('[Index] Manual rebuild requested');
        invalidateDocumentIndex();
        const docs = await buildDocumentIndex();

        res.json({
            success: true,
            message: `Index rebuilt with ${docs.length} documents`,
            corpusVersion,
            lastUpdated: indexLastUpdated
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to rebuild index',
            message: error.message
        });
    }
});

// Build index on module load (async)
buildDocumentIndex().catch(err => {
    console.error('[Index] Initial build failed:', err.message);
});

module.exports = router;
