package core

import "context"

// Provider is the interface all item providers must implement.
type Provider interface {
	// Name returns the provider's identifier (e.g., "systemd", "exec", "docker").
	Name() string

	// List returns all items this provider currently knows about.
	List(ctx context.Context) ([]Item, error)

	// Action performs an action on the given item.
	// Supported actions depend on the provider (start, stop, restart, term, kill).
	Action(ctx context.Context, itemID string, action string) error
}

// LogProvider is the interface for providers that can stream logs.
type LogProvider interface {
	// Subscribe starts streaming log lines for the given item.
	Subscribe(ctx context.Context, itemID string) (<-chan LogLine, error)

	// Unsubscribe stops streaming log lines for the given item.
	Unsubscribe(itemID string) error
}
