import React, { useState, useEffect, useRef } from 'react';
import './ResultsDisplay.css';

// Typewriter hook for animated text display
function useTypewriter(text, speed = 15, enabled = true) {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const indexRef = useRef(0);
    const timeoutRef = useRef(null);

    useEffect(() => {
        if (!enabled || !text) {
            setDisplayedText(text || '');
            setIsComplete(true);
            return;
        }

        // Reset state when text changes
        setDisplayedText('');
        setIsComplete(false);
        indexRef.current = 0;

        const typeNextChar = () => {
            if (indexRef.current < text.length) {
                const nextChar = text[indexRef.current];
                setDisplayedText(prev => prev + nextChar);
                indexRef.current++;

                // Variable speed for more natural feel
                const delay = nextChar === '\n' ? speed * 3 :
                    nextChar === ' ' ? speed * 0.5 :
                        speed;

                timeoutRef.current = setTimeout(typeNextChar, delay);
            } else {
                setIsComplete(true);
            }
        };

        timeoutRef.current = setTimeout(typeNextChar, speed);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [text, speed, enabled]);

    return { displayedText, isComplete };
}

// Parse markdown-like content into structured sections
function parseStructuredContent(text) {
    if (!text) return null;

    const lines = text.split('\n');
    const sections = [];
    let currentSection = { type: 'paragraph', content: [] };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Empty line - end current section if it has content
        if (trimmedLine === '') {
            if (currentSection.content.length > 0) {
                sections.push({ ...currentSection });
                currentSection = { type: 'paragraph', content: [] };
            }
            continue;
        }

        // Headers (### or ## or #)
        const headerMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
        if (headerMatch) {
            if (currentSection.content.length > 0) {
                sections.push({ ...currentSection });
            }
            sections.push({
                type: 'header',
                level: headerMatch[1].length,
                content: [headerMatch[2]]
            });
            currentSection = { type: 'paragraph', content: [] };
            continue;
        }

        // Bullet points
        if (trimmedLine.match(/^[-*•]\s/)) {
            if (currentSection.type !== 'bullet' && currentSection.content.length > 0) {
                sections.push({ ...currentSection });
                currentSection = { type: 'bullet', content: [] };
            } else if (currentSection.type !== 'bullet') {
                currentSection = { type: 'bullet', content: [] };
            }
            currentSection.content.push(trimmedLine.replace(/^[-*•]\s*/, ''));
            continue;
        }

        // Numbered lists
        const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
            if (currentSection.type !== 'numbered' && currentSection.content.length > 0) {
                sections.push({ ...currentSection });
                currentSection = { type: 'numbered', content: [], startNum: parseInt(numberedMatch[1]) };
            } else if (currentSection.type !== 'numbered') {
                currentSection = { type: 'numbered', content: [], startNum: parseInt(numberedMatch[1]) };
            }
            currentSection.content.push(numberedMatch[2]);
            continue;
        }

        // Blockquote
        if (trimmedLine.startsWith('>')) {
            if (currentSection.type !== 'blockquote' && currentSection.content.length > 0) {
                sections.push({ ...currentSection });
                currentSection = { type: 'blockquote', content: [] };
            } else if (currentSection.type !== 'blockquote') {
                currentSection = { type: 'blockquote', content: [] };
            }
            currentSection.content.push(trimmedLine.replace(/^>\s*/, ''));
            continue;
        }

        // Regular paragraph text
        if (currentSection.type !== 'paragraph' && currentSection.content.length > 0) {
            sections.push({ ...currentSection });
            currentSection = { type: 'paragraph', content: [] };
        }
        currentSection.content.push(line);
    }

    // Don't forget the last section
    if (currentSection.content.length > 0) {
        sections.push(currentSection);
    }

    return sections;
}

// Render a single section
function Section({ section }) {
    const content = section.content.join('\n');

    switch (section.type) {
        case 'header':
            const HeaderTag = `h${section.level}`;
            return <HeaderTag className="rd-header">{content}</HeaderTag>;

        case 'bullet':
            return (
                <ul className="rd-list rd-bullet-list">
                    {section.content.map((item, idx) => (
                        <li key={idx}>{item}</li>
                    ))}
                </ul>
            );

        case 'numbered':
            return (
                <ol className="rd-list rd-numbered-list" start={section.startNum}>
                    {section.content.map((item, idx) => (
                        <li key={idx}>{item}</li>
                    ))}
                </ol>
            );

        case 'blockquote':
            return (
                <blockquote className="rd-blockquote">
                    {content}
                </blockquote>
            );

        case 'paragraph':
        default:
            // Check if it's a bold line (wrapped in **)
            const boldMatch = content.match(/^\*\*(.+?)\*\*$/);
            if (boldMatch) {
                return <p className="rd-paragraph rd-bold-line">{boldMatch[1]}</p>;
            }
            // Check for inline bold
            const parts = content.split(/(\*\*.*?\*\*)/g);
            return (
                <p className="rd-paragraph">
                    {parts.map((part, idx) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={idx}>{part.slice(2, -2)}</strong>;
                        }
                        return part;
                    })}
                </p>
            );
    }
}

// Structured Content Renderer
function StructuredContent({ text }) {
    const sections = parseStructuredContent(text);

    if (!sections || sections.length === 0) {
        return <p className="rd-paragraph">{text}</p>;
    }

    return (
        <div className="rd-structured-content">
            {sections.map((section, idx) => (
                <Section key={idx} section={section} />
            ))}
        </div>
    );
}

function ResultsDisplay({ result, loading, error }) {
    const [enableTypewriter, setEnableTypewriter] = useState(true);

    // Get the response text
    const responseText = result?.response || '';

    // Use typewriter effect
    const { displayedText, isComplete } = useTypewriter(
        responseText,
        0.0001, // typing speed in ms (faster)
        enableTypewriter
    );

    // Disable typewriter after completion to prevent re-triggering
    useEffect(() => {
        if (isComplete) {
            setEnableTypewriter(false);
        }
    }, [isComplete]);

    // Reset typewriter when result changes
    useEffect(() => {
        if (result?.response) {
            setEnableTypewriter(true);
        }
    }, [result?.response]);

    if (loading) {
        return (
            <div className="results-container">
                <div className="loading-state">
                    <div className="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <p>Searching across all documents...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="results-container">
                <div className="error-state">
                    <div className="error-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <h3>Something went wrong</h3>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    if (!result) {
        return null;
    }

    return (
        <div className="results-container">
            <div className="result-card">
                <div className="result-header">
                    <div className="ai-avatar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className="ai-label">AI Response</span>
                    {result.metadata && (
                        <span className="metadata">
                            Searched {result.metadata.documentsSearched} documents in {(result.metadata.processingTimeMs / 1000).toFixed(1)}s
                        </span>
                    )}
                </div>
                <div className="result-content">
                    {enableTypewriter && !isComplete ? (
                        <div className="typewriter-text">
                            <pre className="typewriter-pre">{displayedText}</pre>
                            <span className="typewriter-cursor"></span>
                        </div>
                    ) : (
                        <StructuredContent text={responseText} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default ResultsDisplay;
