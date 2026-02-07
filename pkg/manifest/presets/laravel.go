package presets

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/modoterra/stasium/pkg/manifest"
)

// GenerateLaravel creates a manifest for a Laravel project at the given root.
func GenerateLaravel(root string) (*manifest.Manifest, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve root: %w", err)
	}

	// Verify it's a Laravel project
	if _, err := os.Stat(filepath.Join(absRoot, "artisan")); err != nil {
		return nil, fmt.Errorf("%s does not appear to be a Laravel project (no artisan file)", absRoot)
	}

	m := &manifest.Manifest{
		Version: 1,
		Project: filepath.Base(absRoot),
		Root:    absRoot,
		Items:   make(map[string]manifest.Item),
	}

	// Exec items — core dev processes
	m.Items["php-serve"] = manifest.Item{
		Kind:    "exec",
		Command: "php artisan serve",
		Dir:     absRoot,
		Restart: "on-failure",
	}

	// Vite if package.json exists
	if _, err := os.Stat(filepath.Join(absRoot, "package.json")); err == nil {
		m.Items["vite"] = manifest.Item{
			Kind:    "exec",
			Command: "npm run dev",
			Dir:     absRoot,
			Restart: "always",
		}
	}

	// Scheduler
	m.Items["scheduler"] = manifest.Item{
		Kind:    "exec",
		Command: "php artisan schedule:work",
		Dir:     absRoot,
		Restart: "always",
	}

	// Queue worker
	m.Items["queue-worker"] = manifest.Item{
		Kind:    "exec",
		Command: "php artisan queue:work",
		Dir:     absRoot,
		Restart: "on-failure",
	}

	// Reverb (check if installed)
	composerLock := filepath.Join(absRoot, "composer.lock")
	if data, err := os.ReadFile(composerLock); err == nil {
		if strings.Contains(string(data), "laravel/reverb") {
			m.Items["reverb"] = manifest.Item{
				Kind:    "exec",
				Command: "php artisan reverb:start",
				Dir:     absRoot,
				Restart: "on-failure",
			}
		}
	}

	// Systemd services — detect what's available
	systemdItems := []struct {
		name string
		units []string
	}{
		{"nginx", []string{"nginx.service"}},
		{"redis", []string{"redis.service", "redis-server.service"}},
		{"mysql", []string{"mysql.service", "mysqld.service", "mariadb.service"}},
	}

	for _, si := range systemdItems {
		for _, unit := range si.units {
			if unitExists(unit) {
				m.Items[si.name] = manifest.Item{
					Kind: "systemd",
					Unit: unit,
				}
				break
			}
		}
	}

	// PHP-FPM — auto-detect version
	for _, ver := range []string{"8.4", "8.3", "8.2", "8.1", "8.0", "7.4"} {
		unit := fmt.Sprintf("php%s-fpm.service", ver)
		if unitExists(unit) {
			m.Items["php-fpm"] = manifest.Item{
				Kind: "systemd",
				Unit: unit,
			}
			break
		}
	}

	// Laravel log file
	logPath := filepath.Join(absRoot, "storage", "logs", "laravel.log")
	m.Items["app-log"] = manifest.Item{
		Kind:  "log",
		Files: []string{logPath},
	}

	// Compose file
	for _, name := range []string{"compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"} {
		if _, err := os.Stat(filepath.Join(absRoot, name)); err == nil {
			m.Compose = &manifest.ComposeRef{
				File: filepath.Join(absRoot, name),
			}
			break
		}
	}

	// Groups
	webItems := []string{"php-serve"}
	if _, ok := m.Items["vite"]; ok {
		webItems = append(webItems, "vite")
	}
	if _, ok := m.Items["nginx"]; ok {
		webItems = append(webItems, "nginx")
	}

	workerItems := []string{"scheduler", "queue-worker"}
	if _, ok := m.Items["reverb"]; ok {
		workerItems = append(workerItems, "reverb")
	}

	var infraItems []string
	for _, name := range []string{"redis", "mysql", "php-fpm"} {
		if _, ok := m.Items[name]; ok {
			infraItems = append(infraItems, name)
		}
	}

	m.Groups = []manifest.Group{
		{Name: "web", Items: webItems},
		{Name: "workers", Items: workerItems},
	}
	if len(infraItems) > 0 {
		m.Groups = append(m.Groups, manifest.Group{Name: "infra", Items: infraItems})
	}
	m.Groups = append(m.Groups, manifest.Group{Name: "logs", Items: []string{"app-log"}})

	// Default rules
	m.Rules = []manifest.Rule{
		{Match: map[string]string{"kind": "systemd"}, Score: 10},
		{Match: map[string]string{"group": "workers"}, Score: 20},
	}

	return m, nil
}

// unitExists checks if a systemd unit is available (loaded).
func unitExists(unit string) bool {
	// Check if unit file exists in common locations
	paths := []string{
		"/etc/systemd/system/" + unit,
		"/lib/systemd/system/" + unit,
		"/usr/lib/systemd/system/" + unit,
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}
