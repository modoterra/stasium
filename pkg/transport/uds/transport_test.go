package uds

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPingRoundTrip(t *testing.T) {
	dir := t.TempDir()
	sock := filepath.Join(dir, "test.sock")
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	// Start server
	srv := NewServer(sock, logger)
	srv.Handle(MethodPing, func(_ context.Context, _ Message) (any, error) {
		return PingResponse{Pong: true}, nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start(ctx)
	}()

	// Wait for socket to appear
	for i := 0; i < 50; i++ {
		if _, err := os.Stat(sock); err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	// Connect client
	client, err := Dial(sock)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer client.Close()

	// Send Ping
	reqCtx, reqCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer reqCancel()

	resp, err := client.Request(reqCtx, MethodPing, nil)
	if err != nil {
		t.Fatalf("ping request: %v", err)
	}

	var pong PingResponse
	if err := json.Unmarshal(resp.Data, &pong); err != nil {
		t.Fatalf("unmarshal pong: %v", err)
	}
	if !pong.Pong {
		t.Error("expected pong=true")
	}

	// Cleanup
	cancel()
	srv.Shutdown()
}

func TestUnknownMethod(t *testing.T) {
	dir := t.TempDir()
	sock := filepath.Join(dir, "test.sock")
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	srv := NewServer(sock, logger)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go srv.Start(ctx)

	for i := 0; i < 50; i++ {
		if _, err := os.Stat(sock); err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	client, err := Dial(sock)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer client.Close()

	reqCtx, reqCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer reqCancel()

	_, err = client.Request(reqCtx, "NoSuchMethod", nil)
	if err == nil {
		t.Error("expected error for unknown method")
	}

	cancel()
	srv.Shutdown()
}

func TestBroadcastEvent(t *testing.T) {
	dir := t.TempDir()
	sock := filepath.Join(dir, "test.sock")
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	srv := NewServer(sock, logger)
	srv.Handle(MethodPing, func(_ context.Context, _ Message) (any, error) {
		return PingResponse{Pong: true}, nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go srv.Start(ctx)

	for i := 0; i < 50; i++ {
		if _, err := os.Stat(sock); err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	client, err := Dial(sock)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer client.Close()

	evtCh := make(chan Message, 1)
	client.OnEvent(func(msg Message) {
		evtCh <- msg
	})

	// Ensure connection is established by doing a ping first
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer pingCancel()
	if _, err := client.Request(pingCtx, MethodPing, nil); err != nil {
		t.Fatalf("ping: %v", err)
	}

	// Broadcast an event
	evt, _ := NewEvent(EventItemsDelta, map[string]string{"test": "data"})
	srv.Broadcast(evt)

	select {
	case msg := <-evtCh:
		if msg.Method != EventItemsDelta {
			t.Errorf("expected method %s, got %s", EventItemsDelta, msg.Method)
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for broadcast event")
	}

	cancel()
	srv.Shutdown()
}
