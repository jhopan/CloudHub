package middleware

import (
	"fmt"
	"net/http"
	"time"

	apierrors "storage-gateway/internal/errors"

	"github.com/redis/go-redis/v9"
)

// RateLimiter implements a sliding window rate limiter using Redis
type RateLimiter struct {
	redis      *redis.Client
	maxReqs    int
	window     time.Duration
	keyPrefix  string
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(redisClient *redis.Client, maxReqs int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		redis:     redisClient,
		maxReqs:   maxReqs,
		window:    window,
		keyPrefix: "ratelimit:",
	}
}

// Handler returns an HTTP middleware that enforces rate limits per user
func (rl *RateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get user ID from context (set by auth middleware)
		userIDStr, ok := r.Context().Value("user_id").(string)
		if !ok {
			// No user ID (public endpoint or auth failed) - use IP
			userIDStr = r.RemoteAddr
		}

		key := fmt.Sprintf("%s%s", rl.keyPrefix, userIDStr)
		ctx := r.Context()

		// Get current count
		count, err := rl.redis.Get(ctx, key).Int()
		if err != nil && err != redis.Nil {
			// Redis error - allow request (fail open)
			next.ServeHTTP(w, r)
			return
		}

		if count >= rl.maxReqs {
			apierrors.WriteError(w, http.StatusTooManyRequests,
				"Rate limit exceeded",
				fmt.Sprintf("Maximum %d requests per %v", rl.maxReqs, rl.window))
			return
		}

		// Increment counter
		pipe := rl.redis.Pipeline()
		incr := pipe.Incr(ctx, key)
		pipe.Expire(ctx, key, rl.window)
		_, err = pipe.Exec(ctx)
		if err != nil {
			// Redis error - allow request (fail open)
			next.ServeHTTP(w, r)
			return
		}

		// Set rate limit headers
		remaining := rl.maxReqs - int(incr.Val())
		if remaining < 0 {
			remaining = 0
		}
		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", rl.maxReqs))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(rl.window).Unix()))

		next.ServeHTTP(w, r)
	})
}

// RateLimitPerUser creates a rate limiter middleware with default settings
// 100 requests per minute per user
func RateLimitPerUser(redisClient *redis.Client) func(http.Handler) http.Handler {
	limiter := NewRateLimiter(redisClient, 100, 1*time.Minute)
	return limiter.Handler
}

// RateLimitStrict creates a stricter rate limiter for sensitive endpoints
// 10 requests per minute per user
func RateLimitStrict(redisClient *redis.Client) func(http.Handler) http.Handler {
	limiter := NewRateLimiter(redisClient, 10, 1*time.Minute)
	return limiter.Handler
}

// RateLimitUpload creates a rate limiter for upload endpoints
// 30 requests per minute per user
func RateLimitUpload(redisClient *redis.Client) func(http.Handler) http.Handler {
	limiter := NewRateLimiter(redisClient, 30, 1*time.Minute)
	return limiter.Handler
}
