require('dotenv').config();
const Groq = require('groq-sdk');

/**
 * LLM Service
 * Handles communication with Groq API with two-stage retrieval and caching
 */

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Timeout for Groq API calls (30 seconds)
const GROQ_TIMEOUT_MS = 30000;

// System prompt for Stage A: Document selection
const SELECTOR_SYSTEM_PROMPT = `You are a document relevance selector. Your task is to analyze a list of documents and select the most relevant ones for a given query.

Instructions:
1. Review the filename, filetype, and content preview for each document
2. Select the top N most relevant documents that would help answer the query
3. Return ONLY a JSON array of filenames, like: ["file1.txt", "file2.pdf"]
4. If no documents are relevant, return an empty array: []
5. Be selective - only include documents that are clearly relevant to the query`;

// System prompt for Stage B: Answer generation
const ANSWER_SYSTEM_PROMPT = `You are an AI document search assistant. Answer the user's query based ONLY on the provided documents.

Rules:
1. Answer ONLY using information from the provided documents
2. If the answer is not found in the documents, say "Not found in documents"
3. Add citations like ([filename]) next to each claim or fact
4. Be concise and accurate
5. Do not make up information or hallucinate`;

/**
 * Simple in-memory LRU cache for search responses
 */
class SearchCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.corpusVersion = null;
    }

    getKey(query, corpusVersion) {
        // Normalize query: lowercase, trim extra spaces
        const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
        return `${normalizedQuery}::${corpusVersion}`;
    }

    get(query, corpusVersion) {
        const key = this.getKey(query, corpusVersion);
        const entry = this.cache.get(key);
        if (entry) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, entry);
            return entry;
        }
        return null;
    }

    set(query, corpusVersion, value) {
        const key = this.getKey(query, corpusVersion);

        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

// Global cache instance
const searchCache = new SearchCache(100);

/**
 * Calculate a simple keyword relevance score for documents
 * @param {string} query - The search query
 * @param {Array} documents - Array of documents with content
 * @returns {Array} - Documents sorted by relevance score (descending)
 */
function scoreDocumentsByKeywords(query, documents) {
    // Tokenize query: split on whitespace and punctuation, filter out short words
    const queryTokens = query.toLowerCase()
        .split(/[\s\W_]+/)
        .filter(token => token.length > 2);

    if (queryTokens.length === 0) {
        // If no meaningful tokens, return documents as-is with score 0
        return documents.map(doc => ({ ...doc, relevanceScore: 0 }));
    }

    const scoredDocs = documents.map(doc => {
        const contentLower = doc.content.toLowerCase();
        const filenameLower = doc.filename.toLowerCase();
        let score = 0;
        let matchPositions = [];

        for (const token of queryTokens) {
            // Score for content matches
            const contentRegex = new RegExp(token, 'g');
            const contentMatches = (contentLower.match(contentRegex) || []).length;
            score += contentMatches * 2;

            // Bonus for filename matches (higher weight)
            const filenameMatches = (filenameLower.match(contentRegex) || []).length;
            score += filenameMatches * 5;

            // Record match positions for snippet extraction
            let pos = contentLower.indexOf(token);
            while (pos !== -1) {
                matchPositions.push(pos);
                pos = contentLower.indexOf(token, pos + 1);
            }
        }

        // Normalize by document length to avoid bias toward long documents
        const normalizedScore = score / Math.sqrt(doc.content.length || 1);

        return {
            ...doc,
            relevanceScore: normalizedScore,
            matchPositions: matchPositions.sort((a, b) => a - b)
        };
    });

    // Sort by relevance score descending
    return scoredDocs.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Extract the best matching window from document content
 * @param {Object} doc - Document with matchPositions
 * @param {number} windowSize - Size of the window in characters
 * @returns {string} - Best matching content window
 */
function extractBestWindow(doc, windowSize = 1000) {
    if (!doc.matchPositions || doc.matchPositions.length === 0) {
        // No matches, return beginning of document
        return doc.content.substring(0, windowSize);
    }

    // Find the region with the most matches (simple density approach)
    const positions = doc.matchPositions;
    let bestStart = positions[0];
    let maxMatchesInWindow = 1;

    for (let i = 0; i < positions.length; i++) {
        const start = positions[i];
        const end = start + windowSize;
        let matchesInWindow = 1;

        for (let j = i + 1; j < positions.length && positions[j] <= end; j++) {
            matchesInWindow++;
        }

        if (matchesInWindow > maxMatchesInWindow) {
            maxMatchesInWindow = matchesInWindow;
            bestStart = start;
        }
    }

    // Expand window around best position with some padding
    const padding = Math.floor(windowSize / 4);
    const startPos = Math.max(0, bestStart - padding);
    const endPos = Math.min(doc.content.length, startPos + windowSize);

    // Adjust start if we're at the end
    const finalStart = endPos - startPos < windowSize
        ? Math.max(0, endPos - windowSize)
        : startPos;

    let window = doc.content.substring(finalStart, endPos);

    // Add ellipsis if truncated
    if (finalStart > 0) window = '...' + window;
    if (endPos < doc.content.length) window = window + '...';

    return window;
}

/**
 * Format documents for the LLM context with dynamic snippets based on relevance
 * @param {Array} documents - Array of documents
 * @param {string} query - The search query for relevance scoring
 * @param {number} maxDocs - Maximum number of documents to include
 * @param {number} maxChars - Maximum characters in context
 * @returns {Object} - { context: string, selectedDocs: Array }
 */
function formatDocumentsForContext(documents, query, maxDocs = 8, maxChars = 10000) {
    // Score and rank documents by keyword relevance
    const scoredDocs = scoreDocumentsByKeywords(query, documents);

    // Take top K documents
    const topDocs = scoredDocs.slice(0, maxDocs);

    let context = '=== DOCUMENTS ===\n\n';
    let charCount = context.length;
    const selectedDocs = [];

    for (const doc of topDocs) {
        const docHeader = `[${doc.filename}]\n`;
        // Extract best matching window instead of just first 1000 chars
        const docContent = extractBestWindow(doc, 1000);
        const docBlock = docHeader + docContent + '\n\n';

        if (charCount + docBlock.length > maxChars) {
            context += `\n[More documents available but omitted due to context limit]\n`;
            break;
        }

        context += docBlock;
        charCount += docBlock.length;
        selectedDocs.push({
            filename: doc.filename,
            filetype: doc.filetype,
            relevanceScore: doc.relevanceScore
        });
    }

    return { context, selectedDocs };
}

/**
 * Stage A: Select relevant documents using LLM
 * @param {string} query - User query
 * @param {Array} documents - Array of documents (with preview only)
 * @param {number} topN - Number of documents to select
 * @returns {Promise<Array>} - Array of selected filenames
 */
async function selectRelevantDocuments(query, documents, topN = 5) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('GROQ_API_KEY not configured');
    }

    if (documents.length === 0) {
        return [];
    }

    // Build preview context with filename, type, and content preview
    let previewContext = '=== AVAILABLE DOCUMENTS ===\n\n';
    for (const doc of documents) {
        const preview = doc.contentPreview || doc.content.substring(0, 300);
        previewContext += `File: ${doc.filename}\n`;
        previewContext += `Type: ${doc.filetype}\n`;
        previewContext += `Preview: ${preview}${doc.content.length > 300 ? '...' : ''}\n\n`;
    }

    const userMessage = `${previewContext}
Query: "${query}"

Select the top ${topN} most relevant documents for this query.
Return ONLY a JSON array of filenames, e.g.: ["doc1.txt", "doc2.pdf"]
If no documents are relevant, return: []`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SELECTOR_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            model: 'llama-3.1-8b-instant',  // Use smaller model for selection
            temperature: 0.1,
            max_tokens: 256,
            response_format: { type: 'json_object' }
        }, { signal: controller.signal });

        clearTimeout(timeoutId);

        const text = response.choices[0]?.message?.content || '[]';

        // Parse the JSON response
        let selectedFiles;
        try {
            const parsed = JSON.parse(text);
            // Handle both array directly and {files: [...]} format
            selectedFiles = Array.isArray(parsed) ? parsed : (parsed.files || parsed.documents || []);
        } catch (e) {
            // Fallback: extract filenames using regex
            const matches = text.match(/["']([^"']+\.(txt|pdf|csv|pptx))["']/gi);
            selectedFiles = matches ? matches.map(m => m.replace(/["']/g, '')) : [];
        }

        // Validate selected files exist in documents
        const validFiles = documents.map(d => d.filename);
        return selectedFiles.filter(f => validFiles.includes(f)).slice(0, topN);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('Document selection timeout');
        } else {
            console.error('Document selection error:', error.message);
        }
        // Fallback: return top documents by keyword score
        const scored = scoreDocumentsByKeywords(query, documents);
        return scored.slice(0, topN).map(d => d.filename);
    }
}

/**
 * Stage B: Generate answer using selected documents
 * @param {string} query - User query
 * @param {Array} selectedDocs - Full documents selected in Stage A
 * @returns {Promise<Object>} - { answer: string, sources: Array }
 */
async function generateAnswer(query, selectedDocs) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('GROQ_API_KEY not configured. Get your free key at console.groq.com');
    }

    if (selectedDocs.length === 0) {
        return {
            answer: 'No relevant documents found for this query.',
            sources: []
        };
    }

    const { context } = formatDocumentsForContext(selectedDocs, query, selectedDocs.length, 12000);

    const userMessage = `${context}

Query: ${query}

Provide a comprehensive answer based on the documents above.
Remember to:
1. Only use information from the provided documents
2. Say "Not found in documents" if the answer isn't available
3. Add citations like ([filename]) next to claims`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    try {
        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: ANSWER_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 1024
        }, { signal: controller.signal });

        clearTimeout(timeoutId);

        const answer = response.choices[0]?.message?.content || '';

        const sources = selectedDocs.map(doc => ({
            filename: doc.filename,
            filetype: doc.filetype
        }));

        return { answer, sources };

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error('Request timeout - the LLM took too long to respond');
        }

        // If rate limit, try with smaller context
        if (error.message.includes('rate_limit') || error.message.includes('413')) {
            console.log('Rate limit hit, retrying with smaller context...');
            return await generateAnswerSmall(query, selectedDocs);
        }

        throw new Error(`Failed to get response from AI: ${error.message}`);
    }
}

/**
 * Fallback with smaller context if rate limited
 */
async function generateAnswerSmall(query, selectedDocs) {
    const { context } = formatDocumentsForContext(selectedDocs, query, 3, 5000);

    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: ANSWER_SYSTEM_PROMPT },
            { role: 'user', content: `${context}\n\nQuery: ${query}` }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 512
    });

    const answer = response.choices[0]?.message?.content || '';
    const sources = selectedDocs.slice(0, 3).map(doc => ({
        filename: doc.filename,
        filetype: doc.filetype
    }));

    return { answer, sources };
}

/**
 * Two-stage search: Stage A (select) -> Stage B (answer)
 * @param {string} query - User query
 * @param {Array} documents - All available documents
 * @returns {Promise<Object>} - { answer: string, sources: Array, documentsSelected: number }
 */
async function searchDocuments(query, documents) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('GROQ_API_KEY not configured. Get your free key at console.groq.com');
    }

    if (documents.length === 0) {
        return {
            answer: 'No documents have been ingested yet. Please add documents to the generated_documents folder.',
            sources: [],
            documentsSelected: 0
        };
    }

    console.log(`\n[Search] Starting two-stage search for: "${query.substring(0, 80)}..."`);
    console.log(`[Search] Total documents available: ${documents.length}`);

    // Stage A: Select relevant documents (using previews)
    const startTimeStageA = Date.now();
    const docsWithPreviews = documents.map(doc => ({
        ...doc,
        contentPreview: doc.content.substring(0, 350)
    }));

    const selectedFilenames = await selectRelevantDocuments(query, docsWithPreviews, 5);
    const stageADuration = Date.now() - startTimeStageA;

    console.log(`[Search] Stage A complete: selected ${selectedFilenames.length} documents in ${stageADuration}ms`);
    console.log(`[Search] Selected: ${selectedFilenames.join(', ')}`);

    // Get full content for selected documents
    const selectedDocs = documents.filter(doc => selectedFilenames.includes(doc.filename));

    // Stage B: Generate answer using selected documents
    const startTimeStageB = Date.now();
    const { answer, sources } = await generateAnswer(query, selectedDocs);
    const stageBDuration = Date.now() - startTimeStageB;

    console.log(`[Search] Stage B complete: answer generated in ${stageBDuration}ms`);
    console.log(`[Search] Total time: ${stageADuration + stageBDuration}ms`);

    return {
        answer,
        sources,
        documentsSelected: selectedDocs.length
    };
}

/**
 * Get token estimate for documents
 */
function estimateTokens(documents) {
    const totalChars = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    return Math.ceil(totalChars / 4);
}

/**
 * Get cache instance and stats
 */
function getCache() {
    return searchCache;
}

module.exports = {
    searchDocuments,
    selectRelevantDocuments,
    generateAnswer,
    formatDocumentsForContext,
    scoreDocumentsByKeywords,
    extractBestWindow,
    estimateTokens,
    getCache,
    SELECTOR_SYSTEM_PROMPT,
    ANSWER_SYSTEM_PROMPT
};
