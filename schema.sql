-- AI-Powered Document Search System
-- Database Schema

CREATE DATABASE IF NOT EXISTS document_search;

USE document_search;

-- Documents table for storing extracted text content
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  filetype VARCHAR(10) NOT NULL,
  content LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_filename (filename),
  INDEX idx_filetype (filetype)
);

-- Optional: Clear existing documents before re-ingestion
-- TRUNCATE TABLE documents;
