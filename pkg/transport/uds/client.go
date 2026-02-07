package uds

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"
)

// EventHandler is called when the server pushes an event.
type EventHandler func(msg Message)

// Client connects to a stasiumd server over a Unix domain socket.
type Client struct {
	conn     net.Conn
	scanner  *bufio.Scanner
	mu       sync.Mutex
	pending  map[string]chan Message
	events   EventHandler
	done     chan struct{}
}

// Dial connects to the daemon socket.
func Dial(socketPath string) (*Client, error) {
	conn, err := net.DialTimeout("unix", socketPath, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", socketPath, err)
	}
	c := &Client{
		conn:    conn,
		scanner: bufio.NewScanner(conn),
		pending: make(map[string]chan Message),
		done:    make(chan struct{}),
	}
	c.scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	go c.readLoop()
	return c, nil
}

// OnEvent registers a handler for server-pushed events.
func (c *Client) OnEvent(h EventHandler) {
	c.events = h
}

// Request sends a request and waits for the correlated response.
func (c *Client) Request(ctx context.Context, method string, data any) (Message, error) {
	msg, err := NewRequest(method, data)
	if err != nil {
		return Message{}, err
	}

	ch := make(chan Message, 1)
	c.mu.Lock()
	c.pending[msg.ID] = ch
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pending, msg.ID)
		c.mu.Unlock()
	}()

	raw, err := json.Marshal(msg)
	if err != nil {
		return Message{}, err
	}
	raw = append(raw, '\n')

	if _, err := c.conn.Write(raw); err != nil {
		return Message{}, fmt.Errorf("write: %w", err)
	}

	select {
	case resp := <-ch:
		if resp.Error != "" {
			return resp, fmt.Errorf("server error: %s", resp.Error)
		}
		return resp, nil
	case <-ctx.Done():
		return Message{}, ctx.Err()
	case <-c.done:
		return Message{}, fmt.Errorf("connection closed")
	}
}

// Close closes the connection.
func (c *Client) Close() error {
	close(c.done)
	return c.conn.Close()
}

func (c *Client) readLoop() {
	for c.scanner.Scan() {
		var msg Message
		if err := json.Unmarshal(c.scanner.Bytes(), &msg); err != nil {
			continue
		}

		switch msg.Type {
		case MsgTypeRes:
			c.mu.Lock()
			ch, ok := c.pending[msg.ID]
			c.mu.Unlock()
			if ok {
				ch <- msg
			}
		case MsgTypeEvt:
			if c.events != nil {
				c.events(msg)
			}
		}
	}
}
