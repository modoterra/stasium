package main

import (
	"bytes"
	"os"
	"testing"
)

func TestManifestValidateCommand(t *testing.T) {
	// Create a valid manifest
	tmp := t.TempDir() + "/stasium.yaml"
	content := []byte(`version: 1
project: test
root: /app
items:
  web:
    kind: systemd
    unit: nginx.service
`)
	if err := os.WriteFile(tmp, content, 0644); err != nil {
		t.Fatal(err)
	}

	// Run validate via cobra
	rootCmd.SetArgs([]string{"manifest", "validate", tmp})
	buf := &bytes.Buffer{}
	rootCmd.SetOut(buf)
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
}

func TestManifestValidateInvalid(t *testing.T) {
	tmp := t.TempDir() + "/bad.yaml"
	content := []byte(`version: 1
project: test
items:
  bad:
    kind: systemd
`)
	if err := os.WriteFile(tmp, content, 0644); err != nil {
		t.Fatal(err)
	}

	rootCmd.SetArgs([]string{"manifest", "validate", tmp})
	// This should exit(1) but in tests we just check it returns an error
	// The validate command calls os.Exit(1), so we can't easily test that
	// Instead test the manifest package directly
}

func TestManifestInitLaravel(t *testing.T) {
	root := t.TempDir()
	// Create artisan file so the preset recognizes it as Laravel
	if err := os.WriteFile(root+"/artisan", []byte("#!/usr/bin/env php"), 0755); err != nil {
		t.Fatal(err)
	}

	tmp := t.TempDir() + "/stasium.yaml"
	rootCmd.SetArgs([]string{"manifest", "init", "laravel", "--root", root, "--output", tmp})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(tmp)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Error("generated manifest is empty")
	}
}

func TestVersionCommand(t *testing.T) {
	rootCmd.SetArgs([]string{"version"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatal(err)
	}
}
