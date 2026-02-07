// Package service manages the stasiumd systemd user service unit.
package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const unitName = "stasiumd.service"

// UnitContents returns the systemd unit file contents for the given binary path.
func UnitContents(binaryPath string) string {
	return fmt.Sprintf(`[Unit]
Description=Stasium daemon — service monitor for development environments
Documentation=https://github.com/modoterra/stasium

[Service]
Type=simple
ExecStart=%s
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`, binaryPath)
}

// UnitPath returns the path to the systemd user unit file.
func UnitPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine user config directory: %w", err)
	}
	return filepath.Join(configDir, "systemd", "user", unitName), nil
}

// Install writes the unit file, reloads systemd, and enables+starts the service.
func Install() error {
	binaryPath, err := exec.LookPath("stasiumd")
	if err != nil {
		return fmt.Errorf("stasiumd not found in PATH: %w", err)
	}
	binaryPath, err = filepath.Abs(binaryPath)
	if err != nil {
		return fmt.Errorf("cannot resolve stasiumd path: %w", err)
	}

	unitPath, err := UnitPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(unitPath), 0o755); err != nil {
		return fmt.Errorf("cannot create directory: %w", err)
	}

	contents := UnitContents(binaryPath)
	if err := os.WriteFile(unitPath, []byte(contents), 0o644); err != nil {
		return fmt.Errorf("cannot write unit file: %w", err)
	}

	if err := systemctl("daemon-reload"); err != nil {
		return err
	}
	if err := systemctl("enable", "--now", unitName); err != nil {
		return err
	}
	return nil
}

// Uninstall stops+disables the service, removes the unit file, and reloads systemd.
func Uninstall() error {
	// Best-effort stop and disable; ignore errors if not running.
	_ = systemctl("stop", unitName)
	_ = systemctl("disable", unitName)

	unitPath, err := UnitPath()
	if err != nil {
		return err
	}

	if err := os.Remove(unitPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("cannot remove unit file: %w", err)
	}

	return systemctl("daemon-reload")
}

// Status returns a human-readable status string.
func Status(socketPath string) string {
	var lines []string

	// Socket check
	if _, err := os.Stat(socketPath); err == nil {
		lines = append(lines, "socket: active ("+socketPath+")")
	} else {
		lines = append(lines, "socket: inactive ("+socketPath+")")
	}

	// Systemd unit check
	unitPath, err := UnitPath()
	if err == nil {
		if _, statErr := os.Stat(unitPath); statErr == nil {
			out, runErr := exec.Command("systemctl", "--user", "is-active", unitName).Output()
			state := strings.TrimSpace(string(out))
			if runErr != nil && state == "" {
				state = "unknown"
			}
			lines = append(lines, "systemd user service: "+state)
		} else {
			lines = append(lines, "systemd user service: not installed")
		}
	}

	return strings.Join(lines, "\n")
}

func systemctl(args ...string) error {
	cmd := exec.Command("systemctl", append([]string{"--user"}, args...)...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("systemctl --user %s: %w", strings.Join(args, " "), err)
	}
	return nil
}
