const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');
const searchRoutes = require('./routes/searchRoutes');

const app = express();
const PORT = process.env.PORT || 5001; // 5001 to avoid macOS AirPlay conflict

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api', searchRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'AI Document Search API',
        version: '1.0.0',
        endpoints: {
            search: 'POST /api/search',
            ingest: 'POST /api/ingest',
            documents: 'GET /api/documents',
            health: 'GET /api/health'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
});

// Start server
async function startServer() {
    console.log('\n========================================');
    console.log('  AI Document Search API');
    console.log('========================================\n');

    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.log('\n⚠️  Warning: Database connection failed.');
        console.log('   Make sure MySQL/XAMPP is running and');
        console.log('   the database schema has been created.\n');
    }

    // Check for API key
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        console.log('⚠️  Warning: GROQ_API_KEY not configured.');
        console.log('   Get your free key at: console.groq.com\n');
    } else {
        console.log('✓ Groq API key configured');
    }

    app.listen(PORT, () => {
        console.log(`\n🚀 Server running at http://localhost:${PORT}`);
        console.log('\nAvailable endpoints:');
        console.log(`   GET  http://localhost:${PORT}/`);
        console.log(`   GET  http://localhost:${PORT}/api/health`);
        console.log(`   GET  http://localhost:${PORT}/api/documents`);
        console.log(`   POST http://localhost:${PORT}/api/ingest`);
        console.log(`   POST http://localhost:${PORT}/api/search`);
        console.log('\n========================================\n');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ Port ${PORT} is already in use.`);
            console.error(`   Try: lsof -ti:${PORT} | xargs kill -9\n`);
        } else {
            console.error('Server error:', err);
        }
        process.exit(1);
    });
}

startServer();
