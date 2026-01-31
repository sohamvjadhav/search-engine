import React, { useRef, useEffect, useState } from 'react';
import './SearchBar.css';

const HISTORY_KEY = 'searchHistory';
const MAX_HISTORY = 5;

function SearchBar({ query, setQuery, onSearch, loading, isCompact }) {
    const textareaRef = useRef(null);
    const [shake, setShake] = useState(false);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const containerRef = useRef(null);

    // Load search history from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (saved) {
            try {
                setHistory(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse search history:', e);
            }
        }
    }, []);

    // Save search history to localStorage
    const saveHistory = (newHistory) => {
        setHistory(newHistory);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    };

    // Add query to history
    const addToHistory = (searchQuery) => {
        if (!searchQuery.trim()) return;
        const newHistory = [searchQuery, ...history.filter(h => h !== searchQuery)].slice(0, MAX_HISTORY);
        saveHistory(newHistory);
    };

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
    }, [query]);

    // Auto-focus on mount
    useEffect(() => {
        if (textareaRef.current && !isCompact) {
            textareaRef.current.focus();
        }
    }, [isCompact]);

    // Close history when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowHistory(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim() && !loading) {
            addToHistory(query);
            onSearch(query);
            setShowHistory(false);
        } else if (!query.trim()) {
            setShake(true);
            setTimeout(() => setShake(false), 300);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleClear = () => {
        setQuery('');
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    };

    const handleHistorySelect = (item) => {
        setQuery(item);
        setShowHistory(false);
        onSearch(item);
    };

    const handleFocus = () => {
        if (history.length > 0 && !query.trim()) {
            setShowHistory(true);
        }
    };

    const handleInputChange = (e) => {
        setQuery(e.target.value);
        setShowHistory(false);
    };

    return (
        <div ref={containerRef} className="search-bar-wrapper">
            <form
                className={`search-container ${isCompact ? 'compact' : ''} ${shake ? 'shake' : ''}`}
                onSubmit={handleSubmit}
            >
                <button type="button" className="attach-button" title="Attach files (coming soon)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5V19M5 12H19" stroke="#8e8e8e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                <textarea
                    ref={textareaRef}
                    className="search-input"
                    placeholder="Ask anything about your documents..."
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    disabled={loading}
                    rows={1}
                    autoFocus={!isCompact}
                />

                <div className="right-actions">
                    {query.trim() && (
                        <button
                            type="button"
                            className="clear-button"
                            onClick={handleClear}
                            title="Clear search"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6L18 18" stroke="#8e8e8e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    )}
                    <button
                        type="submit"
                        className={`submit-button ${loading ? 'loading' : ''}`}
                        disabled={!query.trim() || loading}
                        title="Search"
                    >
                        {loading ? (
                            <div className="spinner" />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>

            {showHistory && history.length > 0 && (
                <div className="search-history-dropdown">
                    <div className="history-header">Recent searches</div>
                    {history.map((item, idx) => (
                        <button
                            key={idx}
                            className="history-item"
                            onClick={() => handleHistorySelect(item)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="history-text">{item}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SearchBar;
