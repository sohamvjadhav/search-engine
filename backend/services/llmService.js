require('dotenv').config();
const Groq = require('groq-sdk');

/**
 * LLM Service
 * Handles communication with Groq API
 */

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const SYSTEM_PROMPT = `You are an AI document search assistant. Search the provided documents and answer the user's query based on their content. Be thorough and confident in your responses.`;

/**
 * Format documents for the LLM context - optimized for Groq free tier (12k TPM)
 */
function formatDocumentsForContext(documents, maxChars = 10000) {
    let context = '=== DOCUMENTS ===\n\n';
    let charCount = context.length;

    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const docHeader = `[${doc.filename}]\n`;
        // Include up to 1000 chars per document
        const docContent = doc.content.substring(0, 1000) + (doc.content.length > 1000 ? '...' : '');
        const docBlock = docHeader + docContent + '\n\n';

        if (charCount + docBlock.length > maxChars) {
            context += `\n[${documents.length - i} more documents available]\n`;
            break;
        }

        context += docBlock;
        charCount += docBlock.length;
    }

    return context;
}

/**
 * Search documents using Groq API
 */
async function searchDocuments(query, documents) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        throw new Error('GROQ_API_KEY not configured. Get your free key at console.groq.com');
    }

    if (documents.length === 0) {
        return 'No documents have been ingested yet. Please add documents to the generated_documents folder.';
    }

    try {
        const documentContext = formatDocumentsForContext(documents, 10000);

        const userMessage = `${documentContext}

Query: ${query}

Provide a comprehensive answer based on the documents above.`;

        console.log(`Calling Groq API - Context size: ${documentContext.length} chars`);

        const response = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            model: 'llama-3.3-70b-versatile',  // Current active model
            temperature: 0.3,
            max_tokens: 1024
        });

        const text = response.choices[0]?.message?.content || '';
        return text;

    } catch (error) {
        console.error('Groq API Error:', error.message);

        // If rate limit, fall back to smaller request
        if (error.message.includes('rate_limit') || error.message.includes('413')) {
            console.log('Rate limit hit, retrying with smaller context...');
            return await searchDocumentsSmall(query, documents);
        }

        throw new Error(`Failed to get response from AI: ${error.message}`);
    }
}

/**
 * Fallback with smaller context if rate limited
 */
async function searchDocumentsSmall(query, documents) {
    const smallContext = formatDocumentsForContext(documents, 5000);

    const response = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `${smallContext}\n\nQuery: ${query}` }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 512
    });

    return response.choices[0]?.message?.content || '';
}

/**
 * Get token estimate for documents
 */
function estimateTokens(documents) {
    const totalChars = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    return Math.ceil(totalChars / 4);
}

module.exports = {
    searchDocuments,
    formatDocumentsForContext,
    estimateTokens,
    SYSTEM_PROMPT
};
