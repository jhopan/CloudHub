package scheduler

import (
	"fmt"
	"math"
	"sort"

	"storage-gateway/internal/model"
)

// Strategy defines the scheduling strategy
type Strategy string

const (
	StrategyLargestFree Strategy = "largest_free"
	StrategyRoundRobin  Strategy = "round_robin"
	StrategyBalanced    Strategy = "balanced"
	StrategyCheapest    Strategy = "cheapest"
)

// Scheduler decides where files should be stored
type Scheduler struct {
	strategy Strategy
}

// NewScheduler creates a new scheduler with the given strategy
func NewScheduler(strategy Strategy) *Scheduler {
	return &Scheduler{strategy: strategy}
}

// SelectAccount selects the best storage account for a file of the given size
func (s *Scheduler) SelectAccount(accounts []*model.StorageAccount, fileSize int64) (*model.StorageAccount, error) {
	if len(accounts) == 0 {
		return nil, fmt.Errorf("no storage accounts available")
	}

	// Filter accounts that have enough space and are active
	var available []*model.StorageAccount
	for _, acc := range accounts {
		if acc.IsActive && acc.AvailableBytes() >= fileSize {
			available = append(available, acc)
		}
	}

	if len(available) == 0 {
		return nil, fmt.Errorf("no storage accounts with enough space (need %d bytes)", fileSize)
	}

	switch s.strategy {
	case StrategyLargestFree:
		return s.largestFree(available), nil
	case StrategyRoundRobin:
		return s.roundRobin(available), nil
	case StrategyBalanced:
		return s.balanced(available), nil
	case StrategyCheapest:
		return s.cheapest(available), nil
	default:
		return s.largestFree(available), nil
	}
}

// largestFree picks the account with the most free space
func (s *Scheduler) largestFree(accounts []*model.StorageAccount) *model.StorageAccount {
	best := accounts[0]
	for _, acc := range accounts[1:] {
		if acc.AvailableBytes() > best.AvailableBytes() {
			best = acc
		}
	}
	return best
}

// roundRobin picks the account with the least usage percentage
func (s *Scheduler) roundRobin(accounts []*model.StorageAccount) *model.StorageAccount {
	sort.Slice(accounts, func(i, j int) bool {
		usageI := s.usagePercent(accounts[i])
		usageJ := s.usagePercent(accounts[j])
		return usageI < usageJ
	})
	return accounts[0]
}

// balanced picks the account that would result in the most balanced usage
func (s *Scheduler) balanced(accounts []*model.StorageAccount) *model.StorageAccount {
	// Calculate current average usage
	var totalUsage float64
	for _, acc := range accounts {
		totalUsage += s.usagePercent(acc)
	}
	avgUsage := totalUsage / float64(len(accounts))

	// Pick the account closest to average (below average preferred)
	best := accounts[0]
	bestDiff := math.Abs(s.usagePercent(best) - avgUsage)

	for _, acc := range accounts[1:] {
		diff := math.Abs(s.usagePercent(acc) - avgUsage)
		if diff < bestDiff {
			bestDiff = diff
			best = acc
		}
	}
	return best
}

// cheapest picks the account with the lowest cost per GB
func (s *Scheduler) cheapest(accounts []*model.StorageAccount) *model.StorageAccount {
	best := accounts[0]
	for _, acc := range accounts[1:] {
		if acc.CostPerGBMonth < best.CostPerGBMonth {
			best = acc
		} else if acc.CostPerGBMonth == best.CostPerGBMonth && acc.AvailableBytes() > best.AvailableBytes() {
			best = acc
		}
	}
	return best
}

func (s *Scheduler) usagePercent(acc *model.StorageAccount) float64 {
	if acc.CapacityBytes == 0 {
		return 0
	}
	return float64(acc.UsedBytes) / float64(acc.CapacityBytes) * 100
}

// GetStrategy returns the current strategy used by the scheduler
func (s *Scheduler) GetStrategy() Strategy {
	return s.strategy
}

// NewSchedulerFromString creates a new scheduler from a strategy name string.
// Falls back to StrategyLargestFree if the string is not recognized.
func NewSchedulerFromString(mode string) *Scheduler {
	switch Strategy(mode) {
	case StrategyLargestFree:
		return NewScheduler(StrategyLargestFree)
	case StrategyRoundRobin:
		return NewScheduler(StrategyRoundRobin)
	case StrategyBalanced:
		return NewScheduler(StrategyBalanced)
	case StrategyCheapest:
		return NewScheduler(StrategyCheapest)
	default:
		return NewScheduler(StrategyLargestFree)
	}
}

// ValidStrategies returns all valid strategy names
func ValidStrategies() []string {
	return []string{
		string(StrategyLargestFree),
		string(StrategyRoundRobin),
		string(StrategyBalanced),
		string(StrategyCheapest),
	}
}

// IsValidStrategy checks if a strategy name is valid
func IsValidStrategy(mode string) bool {
	switch Strategy(mode) {
	case StrategyLargestFree, StrategyRoundRobin, StrategyBalanced, StrategyCheapest:
		return true
	default:
		return false
	}
}
