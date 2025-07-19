---
inclusion: always
---

# CSIS Technology Stack & Development Guidelines

## Core Architecture
- **Multi-service containerized deployment** with Docker Compose
- **Angular 20+ SPA** frontend with **Bun/Express.js** backend
- **MongoDB 7.0** with GridFS for large file storage
- **Ollama local LLM** (gemma2:9b) for AI features
- **Nginx SSL termination** and reverse proxy

## Technology Constraints & Conventions

### Package Management Rules
- **Frontend (web/)**: Always use `yarn` - lockfile is committed
- **Backend (server/)**: Always use `bun` for runtime and packages
- **Never mix package managers** within the same workspace

### Code Style & Patterns
- **TypeScript everywhere** - no plain JavaScript in new code
- **Async/await preferred** over Promise chains
- **Mongoose schemas** for all MongoDB models
- **JWT authentication** - store tokens securely
- **Winston logging** with daily rotation for all server logs

### File Handling Architecture
- **GridFS mandatory** for files >16MB (photos, documents)
- **Sharp for thumbnails**, Jimp for image manipulation
- **Multer middleware** for all file uploads
- **Always generate thumbnails** for uploaded images

### Frontend Patterns
- **Angular standalone components** preferred for new features
- **Bootstrap 5.3.6 classes** for styling consistency
- **AG Grid** for data tables, Chart.js for visualizations
- **Socket.IO client** for real-time features
- **dayjs** for all date operations (not moment.js)

### Backend Patterns
- **Express.js routes** organized by feature in `/routes`
- **Middleware-first approach** for authentication and validation
- **Socket.IO server** for real-time communication
- **Error handling middleware** for consistent API responses

## Development Commands

### Frontend Development
```bash
cd web/
yarn install          # Install dependencies
yarn start           # Dev server (http://localhost:4200)
yarn build           # Production build
yarn test            # Run unit tests
```

### Backend Development
```bash
cd server/
bun install          # Install dependencies
bun run watch        # Development with hot reload
bun run start        # Production mode
bun run build        # Build Windows executable
```

### Docker Operations
```bash
docker compose up -d              # Start all services
docker compose logs -f [service]  # View logs
docker compose down               # Stop services
docker compose build             # Rebuild images
```

## Critical Libraries & Usage

### Image Processing
- **Sharp**: Server-side thumbnails and optimization
- **Jimp**: Client-side image manipulation
- **html2canvas**: Screenshot generation

### Document Generation
- **ExcelJS**: Excel file creation and parsing
- **jsPDF**: PDF generation from HTML
- **docxtemplater**: Word document templates

### File Operations
- **JSZip**: Archive creation for bulk downloads
- **GridFS**: MongoDB file storage for large files
- **Multer**: Express file upload middleware

## Architecture Decisions
- **Bun runtime** chosen for performance over Node.js
- **GridFS over filesystem** for scalability and Docker compatibility
- **Local Ollama** instead of cloud AI for data privacy
- **Socket.IO** for real-time features over WebSockets directly