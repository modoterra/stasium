package docker

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/moby/moby/api/types/container"
)

func TestParseComposeFile(t *testing.T) {
	content := `
services:
  redis:
    image: redis:7
    ports:
      - "6379:6379"
  mailpit:
    image: axllent/mailpit
    container_name: mailpit
    ports:
      - "8025:8025"
      - "1025:1025"
  mysql:
    image: mysql:8
    ports:
      - "3306:3306"
`
	path := filepath.Join(t.TempDir(), "compose.yml")
	os.WriteFile(path, []byte(content), 0644)

	cf, err := ParseComposeFile(path)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(cf.Services) != 3 {
		t.Errorf("services: got %d, want 3", len(cf.Services))
	}

	if cf.Services["mailpit"].ContainerName != "mailpit" {
		t.Errorf("mailpit container_name: got %q", cf.Services["mailpit"].ContainerName)
	}

	names := cf.ServiceNames()
	if len(names) != 3 {
		t.Errorf("service names: got %d", len(names))
	}
}

func TestAutoImport(t *testing.T) {
	cf := &ComposeFile{
		Services: map[string]ComposeService{
			"redis":   {Image: "redis:7"},
			"mailpit": {Image: "axllent/mailpit", ContainerName: "mailpit"},
			"mysql":   {Image: "mysql:8"},
		},
	}

	// redis is already defined in manifest
	existing := map[string]bool{"redis": true}

	defs := AutoImport(cf, existing, "myapp")
	if len(defs) != 2 {
		t.Fatalf("expected 2 auto-imports, got %d", len(defs))
	}

	// Check that redis was skipped
	for _, d := range defs {
		if d.Name == "redis" {
			t.Error("redis should have been skipped")
		}
	}

	// Check mailpit uses explicit container_name
	for _, d := range defs {
		if d.Name == "mailpit" && d.Container != "mailpit" {
			t.Errorf("mailpit container: got %q, want 'mailpit'", d.Container)
		}
	}

	// Check mysql gets generated name
	for _, d := range defs {
		if d.Name == "mysql" && d.Container != "myapp-mysql-1" {
			t.Errorf("mysql container: got %q, want 'myapp-mysql-1'", d.Container)
		}
	}
}

func TestAutoImport_NoProject(t *testing.T) {
	cf := &ComposeFile{
		Services: map[string]ComposeService{
			"app": {Image: "myapp:latest"},
		},
	}
	defs := AutoImport(cf, nil, "")
	if len(defs) != 1 {
		t.Fatalf("expected 1, got %d", len(defs))
	}
	// With empty project and no container_name, container should be empty
	if defs[0].Container != "" {
		t.Errorf("expected empty container name, got %q", defs[0].Container)
	}
}

func TestMapContainerState(t *testing.T) {
	tests := []struct {
		state container.ContainerState
		want  string
	}{
		{container.StateRunning, "running"},
		{container.StateExited, "stopped"},
		{container.StateDead, "stopped"},
		{container.StateRestarting, "restarting"},
		{container.StateCreated, "stopped"},
		{container.StatePaused, "stopped"},
		{container.ContainerState("bogus"), "unknown"},
	}
	for _, tt := range tests {
		got := mapContainerState(tt.state)
		if string(got) != tt.want {
			t.Errorf("mapContainerState(%q) = %q, want %q", tt.state, got, tt.want)
		}
	}
}
