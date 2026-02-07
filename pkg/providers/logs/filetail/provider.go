package filetail

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/modoterra/stasium/pkg/core"
)

// Provider tails log files for log-type items.
type Provider struct {
	subs   map[string]*subscription
	mu     sync.Mutex
	logger *slog.Logger
}

type subscription struct {
	cancel context.CancelFunc
	ch     chan core.LogLine
}

// New creates a new file tail log provider.
func New(logger *slog.Logger) *Provider {
	return &Provider{
		subs:   make(map[string]*subscription),
		logger: logger,
	}
}

// Subscribe starts tailing the given file.
func (p *Provider) Subscribe(ctx context.Context, itemID string, filePath string) (<-chan core.LogLine, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	key := itemID + ":" + filePath
	if sub, ok := p.subs[key]; ok {
		return sub.ch, nil
	}

	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", filePath, err)
	}

	// Seek to end
	f.Seek(0, io.SeekEnd)

	subCtx, cancel := context.WithCancel(ctx)
	ch := make(chan core.LogLine, 100)

	go func() {
		defer f.Close()
		defer close(ch)

		reader := bufio.NewReader(f)
		for {
			select {
			case <-subCtx.Done():
				return
			default:
			}

			line, err := reader.ReadString('\n')
			if err != nil {
				// No new data — poll
				time.Sleep(250 * time.Millisecond)
				// Check for truncation (file rotation)
				info, serr := f.Stat()
				if serr != nil {
					continue
				}
				pos, _ := f.Seek(0, io.SeekCurrent)
				if info.Size() < pos {
					f.Seek(0, io.SeekStart)
					reader.Reset(f)
				}
				continue
			}

			entry := core.LogLine{
				ItemID:   itemID,
				TsUnixMs: time.Now().UnixMilli(),
				Stream:   "file",
				Line:     line,
			}
			select {
			case ch <- entry:
			default:
			}
		}
	}()

	p.subs[key] = &subscription{cancel: cancel, ch: ch}
	p.logger.Info("tailing file", "path", filePath, "item", itemID)
	return ch, nil
}

// Unsubscribe stops tailing for the given item + file.
func (p *Provider) Unsubscribe(itemID string, filePath string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	key := itemID + ":" + filePath
	sub, ok := p.subs[key]
	if !ok {
		return nil
	}
	sub.cancel()
	delete(p.subs, key)
	return nil
}
