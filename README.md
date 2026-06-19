# ☁️ CloudHub — Cloud Storage Gateway

Self-hosted cloud storage gateway that aggregates multiple cloud storage providers into a single virtual storage pool.

## Features

### Core
- **135+ Cloud Providers** — 7 Direct API + 128 via rclone
- **OAuth 1-Click Login** — Google Drive, OneDrive, Dropbox, Yandex
- **WebSocket Upload Progress** — Real-time upload tracking
- **Video Streaming** — Range request support for direct playback
- **File Manager** — Browse, upload, download, rename, delete
- **Smart Scheduler** — round_robin, least_used, most_free, weighted, manual

### Providers
| Type | Providers |
|------|-----------|
| **Direct API** | Google Drive, OneDrive, Dropbox, MEGA, S3, pCloud, Yandex |
| **rclone** | WebDAV, Nextcloud, FTP, SFTP, Backblaze B2, Proton Drive, + 120 more |

### Advanced
- **Shared Links** — Generate temporary links with optional password + expiry
- **Transfer Logs** — Track all file operations with stats dashboard
- **Health Checks** — Auto-check accounts every 30 minutes
- **Encrypted Credentials** — AES-256 encryption for stored tokens

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + Express |
| Frontend | Vue.js 3 + Vite + TailwindCSS |
| Database | SQLite |
| Storage Engine | Direct API + rclone CLI |

## Requirements

- Node.js 18+
- rclone (installed on system)
- ~100 MB RAM

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your OAuth credentials
npm install
npm run dev
# → http://localhost:8787
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Environment Variables

```env
# Backend (.env)
PORT=8787
APP_MODE=hosted
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Security
CLOUDHUB_SECRET_HALF=*** secret

# OAuth (configure per provider)
GOOGLE_CLIENT_ID=***
GOOGLE_CLIENT_SECRET=***
ONEDRIVE_CLIENT_ID=***
ONEDRIVE_CLIENT_SECRET=***
DROPBOX_CLIENT_ID=***
DROPBOX_CLIENT_SECRET=***
```

## VPS Deploy

```bash
# Backend: just run node
cd backend && npm install && node src/server.js

# Frontend: build static
cd frontend && npm install && npm run build
# Serve dist/ with nginx/caddy
```

**Minimum VPS: 512 MB RAM**

## Architecture

```
┌──────────┐    ┌──────────┐    ┌──────────────────┐
│  Vue.js  │───→│ Express  │───→│  Adapter Router  │
│ Frontend │    │ Backend  │    │                  │
└──────────┘    └──────────┘    │  ┌─ Direct API ─┐│
                    │           │  │ GDrive       ││
                ┌───┴───┐      │  │ OneDrive     ││
                │SQLite │      │  │ Dropbox      ││
                └───────┘      │  │ MEGA/S3/...  ││
                               │  └──────────────┘│
                               │  ┌─ rclone ─────┐│
                               │  │ WebDAV       ││
                               │  │ Nextcloud    ││
                               │  │ FTP/SFTP     ││
                               │  │ B2/Proton    ││
                               │  │ + 120 more   ││
                               │  └──────────────┘│
                               └──────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| GET | `/api/accounts` | List storage accounts |
| GET | `/api/files` | File browser |
| POST | `/api/upload` | Upload file |
| GET | `/api/files/:id/download` | Download file |
| POST | `/api/shared-links` | Create shared link |
| GET | `/api/public/:token` | Public download |
| GET | `/api/transfers` | Transfer logs |
| GET | `/api/health/accounts` | Health status |

## License

MIT (forked from [OmniCloud](https://github.com/omnicloud/omnicloud))
