import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SearchBar from './components/SearchBar';
import ResultsDisplay from './components/ResultsDisplay';
import './App.css';

function App() {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    // Fetch document stats on mount
    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await axios.get('/api/health');
            setStats(response.data);
        } catch (err) {
            console.log('Could not fetch stats:', err.message);
        }
    };

    const handleSearch = async (searchQuery) => {
        if (!searchQuery.trim()) return;

        setLoading(true);
        setError(null);
        setHasSearched(true);

        try {
            const response = await axios.post('/api/search', {
                query: searchQuery
            });

            setResult({
                response: response.data.response,
                sources: response.data.sources,
                metadata: response.data.metadata
            });
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || 'An error occurred';
            setError(errorMessage);
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    const handleNewSearch = () => {
        setHasSearched(false);
        setResult(null);
        setError(null);
        setQuery('');
    };

    return (
        <div className="main-wrapper">
            {/* Header */}
            <header className="header">
                <div className="model-selector" onClick={handleNewSearch}>
                    <span>Semantic Search for Documents</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <div className="header-right">
                    {stats && (
                        <div className="doc-count" title={`Storage: ${stats.storageMode} | Groq: ${stats.groqConfigured ? '✓' : '✗'}${stats.cache ? ` | Cache: ${stats.cache.size}` : ''}`}>
                            {stats.documentsIngested} documents indexed
                            {stats.storageMode === 'filesystem' && <span className="mode-badge">FS</span>}
                            {stats.storageMode === 'db' && <span className="mode-badge db">DB</span>}
                        </div>
                    )}
                    <div className="icon-btn" title="About">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="profile-icon">AI</div>
                </div>
            </header>

            {/* Main Content */}
            <main className={`center-content ${hasSearched ? 'has-results' : ''}`}>
                {!hasSearched && (
                    <h1>What can I help you find?</h1>
                )}

                <SearchBar
                    query={query}
                    setQuery={setQuery}
                    onSearch={handleSearch}
                    loading={loading}
                    isCompact={hasSearched}
                />

                {hasSearched && (
                    <ResultsDisplay
                        result={result}
                        loading={loading}
                        error={error}
                    />
                )}
            </main>
        </div>
    );
}

export default App;
