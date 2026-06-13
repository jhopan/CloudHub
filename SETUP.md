# CloudHub Storage Gateway — Setup Guide

## Quick Start

### Option A: Docker (Recommended)

**Requirements:** Docker Engine 24+ and Docker Compose v2

```bash
# Clone and start everything with one command
git clone <repository-url> && cd storage-gateway
docker-compose up -d

# Open http://localhost:3000
```

That's it. PostgreSQL, Redis, Go backend, and Next.js frontend all start automatically.

### Option B: Manual Install

**Requirements:** Go 1.22+, Node.js 20+, PostgreSQL 16+, Redis 7+, rclone

```bash
# Linux / macOS
chmod +x scripts/*.sh
./scripts/install.sh

# Windows
scripts\install.bat
```

Then start:
```bash
# Linux / macOS
./scripts/start.sh

# Windows
scripts\start.bat
```

---

## Docker Setup (Detailed)

### Architecture

```
docker-compose.yml
├── postgres    → PostgreSQL 16 (Alpine) — 128 MB limit
├── redis       → Redis 7 (Alpine)       — 64 MB limit
├── backend     → Go API server           — 256 MB limit
└── frontend    → Next.js standalone      — 128 MB limit
                                      Total: ~576 MB (fits 1 GB VPS)
```

### Commands

| Action | Command |
|---|---|
| Start all services | `docker-compose up -d` |
| Start with rebuild | `docker-compose up -d --build` |
| View logs | `docker-compose logs -f` |
| View backend logs | `docker-compose logs -f backend` |
| Stop all services | `docker-compose down` |
| Stop + delete data | `docker-compose down -v` |
| Restart one service | `docker-compose restart backend` |
| Run migrations | Migrations run automatically on backend start |

### Environment Variables (Docker)

Override any variable in `docker-compose.yml` or create a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `storage_gw_secret_2024` | PostgreSQL password |
| `DATABASE_URL` | `postgres://postgres:***@postgres:5432/storage_gateway?sslmode=disable` | Database connection string |
| `REDIS_ADDR` | `redis:6379` | Redis address (host:port) |
| `JWT_SECRET` | `change-this-to-random-secret-in-production` | Secret for JWT token signing |
| `ENCRYPTION_KEY` | `CloudHub32CharEncryptionKey2026X` | AES-256 encryption key (**exactly 32 chars**) |
| `PORT` | `8080` | Backend API port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api/v1` | API URL for frontend |

### Production Deployment

For production, **always** change these secrets:

```bash
# Generate a random JWT secret
openssl rand -base64 32

# Generate a 32-char encryption key
openssl rand -base64 24 | head -c 32
```

Update `docker-compose.yml` or use a `.env` file:
```env
JWT_SECRET=your-random-secret-here
ENCRYPTION_KEY=YourExactly32CharacterKeyHere
POSTGRES_PASSWORD=strong-db-password
```

### Volumes

| Volume | Purpose |
|---|---|
| `postgres_data` | Persistent PostgreSQL data |
| `rclone_data` | rclone OAuth config and credentials |

---

## Manual Setup (Detailed)

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Go | 1.22+ | [go.dev/dl](https://go.dev/dl/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) |
| Redis | 7+ | [redis.io](https://redis.io/download/) |
| rclone | 1.65+ | [rclone.org](https://rclone.org/install/) |

### Step-by-Step

#### 1. Install & Start Services

```bash
# macOS (Homebrew)
brew install go node postgresql@16 redis rclone
brew services start postgresql@16
brew services start redis

# Ubuntu/Debian
sudo apt install golang-go nodejs npm postgresql redis-server
curl https://rclone.org/install.sh | sudo bash
sudo systemctl enable --now postgresql redis-server

# Windows
# Install via: winget, scoop, or download installers
# Start PostgreSQL and Redis services
```

#### 2. Run Install Script

```bash
# Linux / macOS
chmod +x scripts/*.sh
./scripts/install.sh

# Windows
scripts\install.bat
```

The script will:
1. ✅ Verify all prerequisites
2. ✅ Create the `storage_gateway` database
3. ✅ Run all SQL migrations
4. ✅ Build the Go backend binary
5. ✅ Build the Next.js frontend
6. ✅ Generate `config.yaml`

#### 3. Configure

Edit `backend/config.yaml` if needed:

```yaml
port: 8080
database_url: postgres://postgres:***@localhost:5432/storage_gateway?sslmode=disable
redis_addr: localhost:6379
jwt_secret: change-this-to-a-random-secret
encryption_key: CloudHub32CharEncryptionKey2026X  # Must be 32 characters
```

#### 4. Start

```bash
# Option A: Use the start script
./scripts/start.sh       # Linux/macOS
scripts\start.bat        # Windows

# Option B: Manual terminals
# Terminal 1 - Backend
cd backend && ./server        # Linux/macOS
cd backend && server.exe      # Windows

# Terminal 2 - Frontend
cd frontend && npm start
```

#### 5. Stop

```bash
./scripts/stop.sh         # Linux/macOS
scripts\stop.bat          # Windows
# Or just Ctrl+C in each terminal
```

---

## Environment Variables Reference

The backend uses [Viper](https://github.com/spf13/viper) for configuration. Environment variables override `config.yaml` values.

| Config Key | Env Variable | Default | Required | Description |
|---|---|---|---|---|
| `port` | `PORT` | `8080` | No | HTTP server port |
| `environment` | `ENVIRONMENT` | `development` | No | `development` or `production` |
| `database_url` | `DATABASE_URL` | — | **Yes** | PostgreSQL connection string |
| `redis_addr` | `REDIS_ADDR` | `localhost:6379` | No | Redis host:port |
| `redis_password` | `REDIS_PASSWORD` | `""` | No | Redis password |
| `redis_db` | `REDIS_DB` | `0` | No | Redis database number |
| `jwt_secret` | `JWT_SECRET` | — | **Yes** | JWT signing secret |
| `jwt_access_token_ttl` | `JWT_ACCESS_TOKEN_TTL` | `900` | No | Access token TTL (seconds) |
| `jwt_refresh_token_ttl` | `JWT_REFRESH_TOKEN_TTL` | `604800` | No | Refresh token TTL (seconds) |
| `encryption_key` | `ENCRYPTION_KEY` | — | **Yes** | AES-256 key (**exactly 32 chars**) |
| `rclone_path` | `RCLONE_PATH` | `rclone` | No | Path to rclone binary |
| `rclone_config_path` | `RCLONE_CONFIG_PATH` | `/etc/rclone/rclone.conf` | No | rclone config file path |
| `max_upload_size` | `MAX_UPLOAD_SIZE` | `10737418240` | No | Max upload size (bytes, default 10 GB) |
| `upload_concurrency` | `UPLOAD_CONCURRENCY` | `10` | No | Parallel upload workers |

---

## Development Mode

For active development with hot reload:

```bash
# Terminal 1 - Backend (with air for hot reload)
cd backend
go install github.com/air-verse/air@latest
air

# Terminal 2 - Frontend (Next.js dev server)
cd frontend
npm run dev

# PostgreSQL and Redis must be running locally
```

---

## Troubleshooting

### Docker

| Problem | Solution |
|---|---|
| `port 5432 already in use` | Stop local PostgreSQL: `sudo systemctl stop postgresql` |
| `port 6379 already in use` | Stop local Redis: `sudo systemctl stop redis` |
| Backend can't connect to DB | Wait for postgres healthcheck — it takes ~10s on first start |
| Out of memory | Increase Docker memory limit or reduce `deploy.resources.limits` |
| Build cache stale | `docker-compose build --no-cache` |
| Reset everything | `docker-compose down -v && docker-compose up -d --build` |

### Manual Install

| Problem | Solution |
|---|---|
| `database_url is required` | Check `backend/config.yaml` exists and has `database_url` set |
| `encryption_key must be exactly 32 characters` | Count your key — must be exactly 32 chars |
| `connection refused :5432` | PostgreSQL not running — start it |
| `connection refused :6379` | Redis not running — start it |
| `rclone: not found` | Install rclone: `curl https://rclone.org/install.sh \| sudo bash` |
| Frontend can't reach API | Ensure backend is running on port 8080 |
| `npm run build` fails | Delete `frontend/node_modules` and `frontend/.next`, then `npm install` |

### Common Issues

**Database connection fails in Docker:**
The backend waits for PostgreSQL's healthcheck to pass. If it still fails:
```bash
docker-compose logs postgres    # Check postgres logs
docker-compose restart backend  # Restart after postgres is healthy
```

**Frontend shows "API unreachable":**
- Docker: Ensure `NEXT_PUBLIC_API_URL` matches how you access the backend
- If accessing from another machine, change `localhost` to your server's IP

**rclone OAuth not working in Docker:**
The rclone config is stored in the `rclone_data` volume. OAuth tokens persist across restarts.

---

## Project Structure

```
storage-gateway/
├── docker-compose.yml          # Docker orchestration
├── SETUP.md                    # This file
├── README.md                   # Project overview
├── backend/
│   ├── Dockerfile              # Multi-stage Go build + rclone
│   ├── .dockerignore
│   ├── config.yaml             # Local dev configuration
│   ├── go.mod / go.sum
│   ├── cmd/server/main.go      # Entry point
│   ├── internal/               # Application code
│   └── migrations/             # SQL migration files
├── frontend/
│   ├── Dockerfile              # Multi-stage Next.js standalone build
│   ├── .dockerignore
│   ├── next.config.ts          # Next.js config (output: standalone)
│   ├── package.json
│   └── src/                    # Application code
└── scripts/
    ├── install.sh              # Manual install (Linux/macOS)
    ├── install.bat             # Manual install (Windows)
    ├── start.sh                # Start all services (Linux/macOS)
    ├── start.bat               # Start all services (Windows)
    ├── stop.sh                 # Stop all services (Linux/macOS)
    └── stop.bat                # Stop all services (Windows)
```

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Change `ENCRYPTION_KEY` to a unique 32-character key
- [ ] Change `POSTGRES_PASSWORD` to a strong password
- [ ] Set `ENVIRONMENT: production`
- [ ] Configure HTTPS (nginx reverse proxy or Cloudflare)
- [ ] Set up database backups (`pg_dump` cron job)
- [ ] Restrict exposed ports (remove `ports:` for postgres/redis in production)
- [ ] Set up log aggregation
- [ ] Configure firewall rules
