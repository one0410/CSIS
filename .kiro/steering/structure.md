# CSIS Project Structure

## Root Directory Organization
```
├── web/                    # Angular frontend application
├── server/                 # Bun/Express backend API
├── shared/                 # Shared TypeScript interfaces
├── config/                 # Docker and deployment configurations
├── data/                   # Runtime data (logs, uploads, database)
├── ssl/                    # SSL certificates
├── deployment/             # Deployment packages and scripts
└── docker-compose.yml      # Multi-service orchestration
```

## Frontend Structure (web/)
```
web/
├── src/
│   ├── app/
│   │   ├── home/                    # Dashboard and main views
│   │   ├── login/                   # Authentication components
│   │   ├── site-list/               # Site management modules
│   │   │   └── site-detail/         # Individual site details
│   │   │       └── site-daily-report/  # Daily reporting features
│   │   ├── worker-history/          # Personnel management
│   │   ├── visitor-hazard-notice/   # Safety compliance
│   │   ├── services/                # Angular services and HTTP clients
│   │   ├── shared/                  # Reusable components and utilities
│   │   └── model/                   # TypeScript data models
│   ├── assets/                      # Static resources (images, templates)
│   ├── environments/                # Build configuration
│   └── types/                       # TypeScript type definitions
├── public/                          # Public static files
└── dist/                           # Build output
```

## Backend Structure (server/)
```
server/
├── routes/
│   ├── auth.js                     # Authentication endpoints
│   ├── mongodbApi.js               # General database operations
│   ├── mongodbGridfsApi.js         # File storage operations
│   ├── photosApi.js                # Photo management endpoints
│   └── fileApi.js                  # File handling endpoints
├── wwwroot/                        # Static file serving
├── logs/                           # Application logs
├── config.js                       # Configuration management
├── dbConnection.js                 # Database connection setup
├── logger.js                       # Logging configuration
├── mysocket.js                     # WebSocket implementation
└── index.ts                        # Main server entry point
```

## Shared Resources
```
shared/
└── interfaces/                     # TypeScript interfaces used by both frontend and backend

config/
├── serverconfig.json               # Server configuration template
├── nginx-ssl.conf                  # Nginx SSL configuration
├── Dockerfile.ollama-init          # AI model initialization
└── ollama-init.sh                  # Model setup script
```

## Deployment Structure
```
data/                               # Persistent data directory
├── mongodb/                        # Database files
├── uploads/                        # User uploaded files
├── logs/                          # Application logs
└── ollama/                        # AI model data

deployment/                         # Deployment packages
└── csis-deployment-*/             # Timestamped deployment archives
```

## Key Conventions

### File Naming
- **Components**: kebab-case (e.g., `daily-photo-stats.component.ts`)
- **Services**: camelCase with .service suffix
- **Routes**: camelCase JavaScript files
- **Configs**: lowercase with descriptive names

### Directory Patterns
- **Feature Modules**: Group related components in feature directories
- **Shared Code**: Place reusable components in `shared/` directories
- **API Routes**: Organize by functional area (auth, photos, files)
- **Static Assets**: Separate by type in `assets/` subdirectories

### Import Conventions
- **Relative Imports**: Use for same-feature components
- **Absolute Imports**: Use for shared services and models
- **Barrel Exports**: Use index files for clean imports from feature modules