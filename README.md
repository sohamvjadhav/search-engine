# AI-Powered Document Search System

An intelligent document search and analysis system that uses AI to understand and search across your entire document collection. Built for academic demonstration and real-world document understanding.

![Search Interface](https://via.placeholder.com/800x400/F5F0EB/2D2D2D?text=AI+Document+Search)

## 🚀 What It Does

This application:
- **Ingests documents** from multiple formats (TXT, PDF, CSV, PPTX)
- **Understands all documents together** using a large language model
- **Answers queries in natural language** with comprehensive, synthesized responses
- **Feels like a smart AI search engine** that deeply understands your content

## 🧠 How AI Is Used

Unlike traditional keyword search, this system uses **Google Gemini AI** (with a 1M token context window) to:

1. **Load ALL documents into context** - Every document is sent to the AI simultaneously
2. **Understand semantic meaning** - The AI understands concepts, not just keywords
3. **Synthesize information** - Combines insights from multiple documents
4. **Generate natural responses** - Answers in fluent, helpful language

The AI acts as an intelligent assistant that has "read" every document and can answer questions about the entire collection.

## 📄 Supported Document Formats

| Format | Extension | Extraction Method |
|--------|-----------|-------------------|
| Plain Text | `.txt` | Direct file read |
| PDF Documents | `.pdf` | pdf-parse library |
| CSV Data | `.csv` | csv-parser (converts to readable text) |
| PowerPoint | `.pptx` | officeparser library |

## 🛠️ Tech Stack

- **Frontend**: React 18 with glassmorphism UI
- **Backend**: Node.js + Express
- **Database**: MySQL (XAMPP/Oracle Cloud compatible)
- **AI**: Google Gemini 1.5 Flash API

## 📁 Project Structure

```
search engine/
├── backend/
│   ├── server.js           # Express server
│   ├── config/             # Database configuration
│   ├── extractors/         # File format extractors
│   ├── services/           # Business logic
│   └── routes/             # API endpoints
├── frontend/
│   ├── public/             # Static assets
│   └── src/                # React components
├── generated_documents/    # Your documents go here
├── schema.sql              # Database setup
└── README.md
```

## 🏃 Quick Start (Local Setup)

### Prerequisites

- Node.js 18+ installed
- MySQL running (XAMPP recommended)
- Google Gemini API key ([Get one free](https://aistudio.google.com/app/apikey))

### 1. Set Up Database

```bash
# Start XAMPP MySQL, then run:
mysql -u root < schema.sql
```

Or import `schema.sql` via phpMyAdmin.

### 2. Configure Backend

```bash
cd backend

# Install dependencies
npm install

# Edit .env file with your API key
# GEMINI_API_KEY=your_actual_api_key_here

# Start server
npm start
```

### 3. Start Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start React app
npm start
```

### 4. Add Documents

Place your documents in the `generated_documents/` folder, then trigger ingestion:

```bash
curl -X POST http://localhost:5000/api/ingest
```

### 5. Search!

Open [http://localhost:3000](http://localhost:3000) and start asking questions.

## ☁️ Oracle Cloud Deployment

### Always Free Tier Compatible

This application runs on Oracle Cloud's Always Free ARM instances:

1. **Create VM** - Use the Ampere A1 (ARM) shape
2. **Install dependencies**:
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm mysql-server
   ```
3. **Clone and configure** the application
4. **Set up MySQL** and import schema
5. **Configure firewall** to allow ports 3000 and 5000
6. **Use PM2** for process management:
   ```bash
   npm install -g pm2
   pm2 start backend/server.js
   cd frontend && npm run build
   pm2 serve frontend/build 3000
   ```

## 📝 Example Queries

Try these sample queries to see the AI in action:

- "What are the main topics covered in these documents?"
- "Summarize all the project requirements"
- "Find any mentions of budget or costs"
- "What deadlines are mentioned across all documents?"
- "Compare the different proposals"
- "What are the key findings from the research papers?"

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | POST | Search with AI (body: `{query: "..."}`) |
| `/api/ingest` | POST | Ingest documents from folder |
| `/api/documents` | GET | List all ingested documents |
| `/api/health` | GET | Check system status |

## ⚙️ Configuration

Edit `backend/.env`:

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=document_search

# Server
PORT=5000

# AI API Key
GEMINI_API_KEY=your_key_here

# Documents folder
DOCUMENTS_PATH=../generated_documents
```

## 🎨 UI Design

The interface features:
- **Pastel gradient background** with soft peach, mint, and blue tones
- **Glassmorphism effects** with backdrop blur
- **Smooth animations** and micro-interactions
- **ChatGPT-inspired layout** for familiarity
- **Responsive design** for all screen sizes

## 📊 Limitations

- **Context window**: While Gemini supports 1M tokens, very large document collections may need to be summarized
- **Real-time updates**: Documents must be re-ingested after changes
- **API costs**: Heavy usage may incur API charges (Gemini has generous free tier)

## 🤝 Contributing

This is an academic demonstration project. Feel free to fork and extend!

## 📜 License

MIT License - use freely for academic and personal projects.

---

Built with ❤️ for demonstrating AI-powered document understanding
