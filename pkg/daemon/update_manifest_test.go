package daemon

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"testing"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

func newTestDaemon(t *testing.T) *Daemon {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	d := &Daemon{
		items:  make(map[string]core.Item),
		logger: logger,
	}
	return d
}

func makeMsg(t *testing.T, req any) uds.Message {
	t.Helper()
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	return uds.Message{Data: data}
}

func TestUpdateManifest_AddItem(t *testing.T) {
	d := newTestDaemon(t)

	tmp := t.TempDir() + "/stasium.yaml"
	m := &manifest.Manifest{
		Version:  1,
		Project:  "test",
		Root:     "/app",
		Items:    map[string]manifest.Item{},
		FilePath: tmp,
	}
	d.manifest = m

	req := uds.UpdateManifestRequest{
		AddItem: &uds.ItemPatch{
			Name: "serve",
			Item: map[string]any{
				"kind":    "exec",
				"command": "php artisan serve",
				"dir":     "/app",
				"restart": "always",
			},
		},
	}

	result, err := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	if err != nil {
		t.Fatal(err)
	}

	resp := result.(uds.UpdateManifestResponse)
	if !resp.OK {
		t.Fatalf("expected OK, got errors: %v", resp.Errors)
	}

	if _, ok := m.Items["serve"]; !ok {
		t.Error("item 'serve' not added to manifest")
	}

	// Verify file was written
	data, err := os.ReadFile(tmp)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Error("manifest file is empty")
	}
}

func TestUpdateManifest_AddDuplicateItem(t *testing.T) {
	d := newTestDaemon(t)

	m := &manifest.Manifest{
		Version: 1,
		Project: "test",
		Items: map[string]manifest.Item{
			"serve": {Kind: "exec", Command: "php artisan serve"},
		},
		FilePath: t.TempDir() + "/s.yaml",
	}
	d.manifest = m

	req := uds.UpdateManifestRequest{
		AddItem: &uds.ItemPatch{
			Name: "serve",
			Item: map[string]any{"kind": "exec", "command": "other"},
		},
	}

	result, err := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	if err != nil {
		t.Fatal(err)
	}
	resp := result.(uds.UpdateManifestResponse)
	if resp.OK {
		t.Error("expected error for duplicate item")
	}
}

func TestUpdateManifest_RemoveItem(t *testing.T) {
	d := newTestDaemon(t)

	tmp := t.TempDir() + "/stasium.yaml"
	m := &manifest.Manifest{
		Version: 1,
		Project: "test",
		Items: map[string]manifest.Item{
			"serve": {Kind: "exec", Command: "php artisan serve", Dir: "/app"},
		},
		FilePath: tmp,
	}
	d.manifest = m

	req := uds.UpdateManifestRequest{RemoveItem: "serve"}
	result, err := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	if err != nil {
		t.Fatal(err)
	}

	resp := result.(uds.UpdateManifestResponse)
	if !resp.OK {
		t.Fatalf("expected OK, got errors: %v", resp.Errors)
	}

	if _, ok := m.Items["serve"]; ok {
		t.Error("item 'serve' should have been removed")
	}
}

func TestUpdateManifest_UpdateItem(t *testing.T) {
	d := newTestDaemon(t)

	tmp := t.TempDir() + "/stasium.yaml"
	m := &manifest.Manifest{
		Version: 1,
		Project: "test",
		Items: map[string]manifest.Item{
			"serve": {Kind: "exec", Command: "php artisan serve", Dir: "/app"},
		},
		FilePath: tmp,
	}
	d.manifest = m

	req := uds.UpdateManifestRequest{
		UpdateItem: &uds.ItemPatch{
			Name: "serve",
			Item: map[string]any{
				"kind":    "exec",
				"command": "php artisan serve --port=9000",
				"dir":     "/app",
			},
		},
	}

	result, err := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	if err != nil {
		t.Fatal(err)
	}

	resp := result.(uds.UpdateManifestResponse)
	if !resp.OK {
		t.Fatalf("expected OK, got errors: %v", resp.Errors)
	}

	if m.Items["serve"].Command != "php artisan serve --port=9000" {
		t.Errorf("command not updated: got %q", m.Items["serve"].Command)
	}
}

func TestUpdateManifest_NoManifest(t *testing.T) {
	d := newTestDaemon(t)

	req := uds.UpdateManifestRequest{RemoveItem: "foo"}
	result, err := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	if err != nil {
		t.Fatal(err)
	}

	resp := result.(uds.UpdateManifestResponse)
	if resp.OK {
		t.Error("expected error when no manifest loaded")
	}
}

func TestUpdateManifest_RemoveFromGroup(t *testing.T) {
	d := newTestDaemon(t)

	tmp := t.TempDir() + "/stasium.yaml"
	m := &manifest.Manifest{
		Version: 1,
		Project: "test",
		Groups: []manifest.Group{
			{Name: "web", Items: []string{"serve", "nginx"}},
		},
		Items: map[string]manifest.Item{
			"serve": {Kind: "exec", Command: "php artisan serve", Dir: "/app"},
			"nginx": {Kind: "systemd", Unit: "nginx.service"},
		},
		FilePath: tmp,
	}
	d.manifest = m

	req := uds.UpdateManifestRequest{RemoveItem: "serve"}
	result, _ := d.handleUpdateManifest(context.Background(), makeMsg(t, req))
	resp := result.(uds.UpdateManifestResponse)
	if !resp.OK {
		t.Fatalf("expected OK, got errors: %v", resp.Errors)
	}

	// Check group was updated
	if len(m.Groups[0].Items) != 1 || m.Groups[0].Items[0] != "nginx" {
		t.Errorf("group not cleaned up: %v", m.Groups[0].Items)
	}
}
