import React, { useRef, useEffect } from 'react';
import './SearchBar.css';

function SearchBar({ query, setQuery, onSearch, loading, isCompact }) {
    const textareaRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        }
    }, [query]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim() && !loading) {
            onSearch(query);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <form
            className={`search-container ${isCompact ? 'compact' : ''}`}
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
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
            />

            <div className="right-actions">
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
    );
}

export default SearchBar;
