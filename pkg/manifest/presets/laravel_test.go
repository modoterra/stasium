package presets

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/modoterra/stasium/pkg/manifest"
)

func TestGenerateLaravel_MinimalProject(t *testing.T) {
	dir := t.TempDir()

	// Create minimal Laravel structure
	os.WriteFile(filepath.Join(dir, "artisan"), []byte("#!/usr/bin/env php"), 0755)
	os.MkdirAll(filepath.Join(dir, "storage", "logs"), 0755)

	m, err := GenerateLaravel(dir)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if m.Version != 1 {
		t.Errorf("version: got %d", m.Version)
	}

	// Should have php-serve, scheduler, queue-worker, app-log at minimum
	required := []string{"php-serve", "scheduler", "queue-worker", "app-log"}
	for _, name := range required {
		if _, ok := m.Items[name]; !ok {
			t.Errorf("missing required item: %s", name)
		}
	}

	// Validate
	errs := manifest.Validate(m)
	if len(errs) != 0 {
		t.Errorf("validation errors: %v", errs)
	}
}

func TestGenerateLaravel_WithPackageJson(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "artisan"), []byte("#!/usr/bin/env php"), 0755)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"test"}`), 0644)
	os.MkdirAll(filepath.Join(dir, "storage", "logs"), 0755)

	m, err := GenerateLaravel(dir)
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := m.Items["vite"]; !ok {
		t.Error("expected vite item when package.json exists")
	}
}

func TestGenerateLaravel_WithCompose(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "artisan"), []byte("#!/usr/bin/env php"), 0755)
	os.WriteFile(filepath.Join(dir, "compose.yml"), []byte("services:\n  redis:\n    image: redis\n"), 0644)
	os.MkdirAll(filepath.Join(dir, "storage", "logs"), 0755)

	m, err := GenerateLaravel(dir)
	if err != nil {
		t.Fatal(err)
	}

	if m.Compose == nil {
		t.Error("expected compose ref")
	}
}

func TestGenerateLaravel_NotLaravel(t *testing.T) {
	dir := t.TempDir()
	_, err := GenerateLaravel(dir)
	if err == nil {
		t.Error("expected error for non-Laravel directory")
	}
}
