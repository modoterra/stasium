package daemon

import (
	"testing"
	"time"
)

func TestBackoff(t *testing.T) {
	tests := []struct {
		failures int
		want     time.Duration
	}{
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 30 * time.Second},
		{10, 30 * time.Second},
	}
	for _, tt := range tests {
		got := backoff(tt.failures)
		if got != tt.want {
			t.Errorf("backoff(%d) = %v, want %v", tt.failures, got, tt.want)
		}
	}
}
