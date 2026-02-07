package uds

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync"
)

// HandlerFunc processes a request and returns a response data payload or error.
type HandlerFunc func(ctx context.Context, req Message) (any, error)

// Server listens on a Unix domain socket and dispatches NDJSON messages.
type Server struct {
	socketPath string
	listener   net.Listener
	handlers   map[string]HandlerFunc
	clients    map[net.Conn]struct{}
	mu         sync.RWMutex
	logger     *slog.Logger
}

// NewServer creates a new UDS server.
func NewServer(socketPath string, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		socketPath: socketPath,
		handlers:   make(map[string]HandlerFunc),
		clients:    make(map[net.Conn]struct{}),
		logger:     logger,
	}
}

// Handle registers a handler for a method.
func (s *Server) Handle(method string, h HandlerFunc) {
	s.handlers[method] = h
}

// Start begins listening. It removes any stale socket file first.
func (s *Server) Start(ctx context.Context) error {
	// Remove stale socket
	if err := os.Remove(s.socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove stale socket: %w", err)
	}

	ln, err := net.Listen("unix", s.socketPath)
	if err != nil {
		return fmt.Errorf("listen %s: %w", s.socketPath, err)
	}
	s.listener = ln
	s.logger.Info("server listening", "socket", s.socketPath)

	go func() {
		<-ctx.Done()
		ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil // shutting down
			}
			s.logger.Error("accept error", "err", err)
			continue
		}
		s.mu.Lock()
		s.clients[conn] = struct{}{}
		s.mu.Unlock()
		go s.handleConn(ctx, conn)
	}
}

// Broadcast sends an event to all connected clients.
func (s *Server) Broadcast(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		s.logger.Error("broadcast marshal error", "err", err)
		return
	}
	line := append(data, '\n')

	s.mu.RLock()
	defer s.mu.RUnlock()
	for conn := range s.clients {
		if _, err := conn.Write(line); err != nil {
			s.logger.Error("broadcast write error", "err", err)
		}
	}
}

// Shutdown cleanly stops the server.
func (s *Server) Shutdown() {
	if s.listener != nil {
		s.listener.Close()
	}
	s.mu.Lock()
	for conn := range s.clients {
		conn.Close()
	}
	s.mu.Unlock()
	os.Remove(s.socketPath)
}

func (s *Server) handleConn(ctx context.Context, conn net.Conn) {
	defer func() {
		conn.Close()
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
	}()

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB max line

	for scanner.Scan() {
		var msg Message
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			s.logger.Error("invalid message", "err", err)
			continue
		}

		if msg.Type != MsgTypeReq {
			continue
		}

		handler, ok := s.handlers[msg.Method]
		if !ok {
			resp := NewErrorResponse(msg.ID, msg.Method, fmt.Sprintf("unknown method: %s", msg.Method))
			s.writeMessage(conn, resp)
			continue
		}

		result, err := handler(ctx, msg)
		var resp Message
		if err != nil {
			resp = NewErrorResponse(msg.ID, msg.Method, err.Error())
		} else {
			resp, _ = NewResponse(msg.ID, msg.Method, result)
		}
		s.writeMessage(conn, resp)
	}
}

func (s *Server) writeMessage(conn net.Conn, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		s.logger.Error("marshal response error", "err", err)
		return
	}
	data = append(data, '\n')
	if _, err := conn.Write(data); err != nil {
		s.logger.Error("write response error", "err", err)
	}
}
