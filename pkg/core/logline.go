package core

// LogLine represents a single log entry from any log source.
type LogLine struct {
	ItemID   string `json:"item_id"`
	TsUnixMs int64  `json:"ts_unix_ms"`
	Stream   string `json:"stream"` // "stdout", "stderr", "journal", etc.
	Line     string `json:"line"`
}
