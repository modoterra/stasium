package service

import (
	"os"
	"strings"
	"testing"
)

func TestUnitContents(t *testing.T) {
	got := UnitContents("/usr/local/bin/stasiumd")

	if !strings.Contains(got, "ExecStart=/usr/local/bin/stasiumd") {
		t.Error("unit file missing ExecStart with binary path")
	}
	if !strings.Contains(got, "Type=simple") {
		t.Error("unit file missing Type=simple")
	}
	if !strings.Contains(got, "Restart=on-failure") {
		t.Error("unit file missing Restart=on-failure")
	}
	if !strings.Contains(got, "[Install]") {
		t.Error("unit file missing [Install] section")
	}
}

func TestUnitPath(t *testing.T) {
	path, err := UnitPath()
	if err != nil {
		t.Fatalf("UnitPath() error: %v", err)
	}
	if !strings.HasSuffix(path, "systemd/user/stasiumd.service") {
		t.Errorf("UnitPath() = %q, want suffix systemd/user/stasiumd.service", path)
	}
}

func TestStatusNoSocket(t *testing.T) {
	// Use a path that doesn't exist
	got := Status("/tmp/stasium-test-nonexistent.sock")
	if !strings.Contains(got, "socket: inactive") {
		t.Errorf("Status() should report inactive socket, got: %s", got)
	}
}

func TestStatusWithSocket(t *testing.T) {
	// Create a temporary file to simulate a socket
	f, err := os.CreateTemp("", "stasium-test-*.sock")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	f.Close()

	got := Status(f.Name())
	if !strings.Contains(got, "socket: active") {
		t.Errorf("Status() should report active socket, got: %s", got)
	}
}
