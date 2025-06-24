# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

This is an Angular 20 application with a Node.js backend. Use these commands for development:

- `npm start` - Start development server (runs prestart script to generate version)
- `npm run build` - Build for production (runs prebuild script to generate version)
- `npm run watch` - Build in watch mode for development
- `npm test` - Run unit tests with Karma/Jasmine
- `bun ./src/environments/generateVersion.ts` - Generate build version timestamp

The project uses Yarn as the package manager (see packageManager field in package.json).

## Architecture Overview

### Project Structure
This is a construction site safety management system (CSIS) with the following main areas:

**Frontend (Angular 20):**
- `src/app/login/` - Authentication system
- `src/app/home/` - Main dashboard and admin features (user management, settings, etc.)
- `src/app/site-list/` - Construction site management
- `src/app/site-selector/` - Site selection interface
- `src/app/worker-history/` - Worker tracking and history
- `src/app/services/` - Core services (auth, MongoDB, photo, weather, GridFS)
- `src/app/model/` - TypeScript data models
- `src/app/shared/` - Reusable components (signature pad, top bar, side menu)

**Backend (Node.js):**
- Located in `../server/` relative to web directory
- Express.js server with MongoDB integration
- GridFS for file storage
- Authentication and API routes in `routes/` directory
- Build output goes to `../server/wwwroot/`

### Key Features
- Construction site project management
- Worker and talent management with certification tracking
- Safety forms and permits (work permits, toolbox meetings, safety checklists)
- QR code generation for form signatures
- Photo management and progress tracking
- Dashboard with weather integration and statistics
- Gantt charts and calendar views for project scheduling

### Technology Stack
- **Frontend:** Angular 20, Bootstrap 5, ag-Grid, Chart.js, FullCalendar, signature_pad
- **Backend:** Node.js/Express (inferred from server structure)
- **Database:** MongoDB with GridFS
- **Styling:** SCSS, Bootstrap 5, Bootstrap Icons
- **Build:** Angular CLI, Bun for scripts

### Authentication & Routing
- Uses `AuthGuard` for protected routes
- Two-tier routing: main app routes and nested site-specific routes
- Special public routes for worker signatures (no auth required)
- Site selection flow after login

### Data Models
Key entities include User, Worker, Equipment, Feedback, and SignatureData located in `src/app/model/`.

### File Organization
- Components follow Angular feature module pattern
- Each major feature has its own directory with components, services, and models
- Shared utilities in `src/app/shared/`
- Environment-specific configuration in `src/environments/`

## Development Notes

- Uses SCSS for styling with Bootstrap 5 integration
- Project builds to `../server/wwwroot/` for integrated deployment
- Version generation happens automatically during build/start
- Grid components use ag-Grid for data tables
- Weather integration and dashboard analytics are key features
- Photo upload and management system integrated
- QR code functionality for mobile worker interactions