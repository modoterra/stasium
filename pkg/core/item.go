package core

import (
	"fmt"
	"strings"
)

// Kind represents the type of managed item.
type Kind string

const (
	KindSystemd Kind = "systemd"
	KindProcess Kind = "process"
	KindExec    Kind = "exec"
	KindDocker  Kind = "docker"
	KindLog     Kind = "log"
)

// Status represents the current state of an item.
type Status string

const (
	StatusRunning    Status = "running"
	StatusStopped    Status = "stopped"
	StatusFailed     Status = "failed"
	StatusUnknown    Status = "unknown"
	StatusRestarting Status = "restarting"
)

// RestartPolicy defines how a supervised process should be restarted.
type RestartPolicy string

const (
	RestartAlways    RestartPolicy = "always"
	RestartOnFailure RestartPolicy = "on-failure"
	RestartNever     RestartPolicy = "never"
)

// Item represents a managed service, process, container, or log source.
type Item struct {
	ID        string            `json:"id"`
	Kind      Kind              `json:"kind"`
	Name      string            `json:"name"`
	Group     string            `json:"group,omitempty"`
	Status    Status            `json:"status"`
	Score     int               `json:"score"`
	PIDs      []int             `json:"pids,omitempty"`
	CPUPct    float64           `json:"cpu_pct"`
	MemBytes  uint64            `json:"mem_bytes"`
	UptimeSec uint64            `json:"uptime_sec"`
	Ports     []int             `json:"ports,omitempty"`
	Tags      []string          `json:"tags,omitempty"`
	Source    map[string]string `json:"source,omitempty"`
}

// ItemID constructs an item ID from its components.
// Format: kind:provider:native_id
func ItemID(kind Kind, provider, nativeID string) string {
	return fmt.Sprintf("%s:%s:%s", kind, provider, nativeID)
}

// ParseItemID splits an item ID into kind, provider, and native_id.
func ParseItemID(id string) (kind Kind, provider, nativeID string, err error) {
	parts := strings.SplitN(id, ":", 3)
	if len(parts) != 3 {
		return "", "", "", fmt.Errorf("invalid item ID %q: expected kind:provider:native_id", id)
	}
	return Kind(parts[0]), parts[1], parts[2], nil
}
