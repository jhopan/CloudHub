# ============================================
# Stage 1: Build Go binary
# ============================================
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -X main.version=$(date +%Y%m%d)" \
    -o server \
    ./cmd/server/

# ============================================
# Stage 2: Minimal runtime with rclone
# ============================================
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl tzdata && \
    curl -fsSL https://rclone.org/install.sh | bash && \
    rm -rf /var/cache/apk/* /tmp/*

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy binary and assets from builder
COPY --from=builder /app/server .
COPY --from=builder /app/config.yaml .
COPY --from=builder /app/migrations/ ./migrations/

# rclone config is generated at runtime via OAuth — do NOT copy rclone.conf
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["./server"]
