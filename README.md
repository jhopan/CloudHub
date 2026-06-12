# CloudHub - Storage Gateway

A self-hosted cloud storage gateway platform that aggregates multiple cloud storage providers into a single virtual storage pool.

## 🎯 Overview

CloudHub allows users to connect multiple cloud storage accounts (Google Drive, Mega, OneDrive, Dropbox, Cloudflare R2, S3, Backblaze B2, WebDAV, etc.) and manage them as one unified storage pool. The system intelligently manages file placement using a pluggable scheduler while keeping the physical storage location transparent to users.

## 🏗️ Architecture

```
┌─────────────────┐
│   Next.js UI    │
│   (Frontend)    │
└────────┬────────┘
         │ REST API
┌────────▼────────┐
│   Go Backend    │
│   (API Server)  │
└────────┬────────┘
         │
    ┌────┴─────┬──────────┐
    │          │          │
┌───▼──┐  ┌───▼───┐  ┌───▼────┐
│PostgreSQL│ Redis  │  │ rclone │
│ (DB)   │ (Cache) │  │(Engine)│
└────────┘  └───────┘  └───┬────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────▼────┐  ┌───▼────┐  ┌───▼────┐
         │ GDrive  │  │ Mega   │  │ OneDrive│
         └─────────┘  └────────┘  └────────┘
              ... more providers ...
```

## 📁 Project Structure

```
storage-gateway/
├── frontend/          # Next.js + TypeScript + TailwindCSS + shadcn/ui
├── backend/           # Go API server
├── infra/             # Infrastructure configs
│   ├── docker/        # Dockerfiles
│   ├── nginx/         # Nginx configuration
│   └── scripts/       # Deployment scripts
├── docs/              # Documentation
│   ├── plan.md        # Project roadmap
│   ├── ssd.md         # System Design Document
│   └── tdd.md         # Technical Design Document
└── README.md          # This file
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Go 1.22+, Chi Router, PostgreSQL, Redis
- **Storage Engine**: rclone 1.65+
- **Containerization**: Docker, Docker Compose
- **Deployment**: Linux VPS

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for frontend development)
- Go 1.22+ (for backend development)
- rclone 1.65+

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd storage-gateway

# Copy environment file
cp .env.example .env

# Start services with Docker Compose
docker-compose up -d

# Access the application
# Frontend: http://localhost:3000
# Backend:  http://localhost:8080
```

## 📊 Features

### Current Features (MVP)
- ✅ Multi-provider support (Google Drive, Mega, OneDrive, Dropbox, R2, S3, B2, WebDAV)
- ✅ Unified storage pool with aggregated capacity
- ✅ Intelligent file placement scheduler
- ✅ Encrypted credential storage (AES-256-GCM)
- ✅ Virtual filesystem abstraction
- ✅ Transfer logs and monitoring
- ✅ Background workers for health checks and capacity refresh

### Planned Features
- 🔄 File chunking across providers
- 🔄 Multi-copy replication
- 🔄 Client-side encryption
- 🔄 Deduplication
- 🔄 Shared links with expiration
- 🔄 Admin panel

## 🔐 Security

- Passwords hashed with bcrypt
- JWT authentication with refresh tokens
- AES-256-GCM encryption for provider credentials
- Rate limiting per user
- CORS protection
- HSTS headers

## 📝 License

MIT License - see LICENSE file for details

## 👥 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📧 Support

For support, please open an issue on GitHub or contact the maintainers.
