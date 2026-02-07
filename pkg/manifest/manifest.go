package manifest

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Manifest represents a stasium.yaml configuration file.
type Manifest struct {
	Version int               `yaml:"version" json:"version"`
	Project string            `yaml:"project" json:"project"`
	Root    string            `yaml:"root"    json:"root"`
	Groups  []Group           `yaml:"groups"  json:"groups,omitempty"`
	Items   map[string]Item   `yaml:"items"   json:"items"`
	Compose *ComposeRef       `yaml:"compose" json:"compose,omitempty"`
	Rules   []Rule            `yaml:"rules"   json:"rules,omitempty"`

	// FilePath is the path the manifest was loaded from (not serialized).
	FilePath string `yaml:"-" json:"-"`
}

// Group is a named collection of item references.
type Group struct {
	Name  string   `yaml:"name"  json:"name"`
	Items []string `yaml:"items" json:"items"`
}

// Item is a managed item definition in the manifest.
type Item struct {
	Kind      string            `yaml:"kind"      json:"kind"`
	Unit      string            `yaml:"unit,omitempty"      json:"unit,omitempty"`       // systemd
	Command   string            `yaml:"command,omitempty"   json:"command,omitempty"`    // exec
	Dir       string            `yaml:"dir,omitempty"       json:"dir,omitempty"`        // exec
	Restart   string            `yaml:"restart,omitempty"   json:"restart,omitempty"`    // exec: always|on-failure|never
	Env       map[string]string `yaml:"env,omitempty"       json:"env,omitempty"`        // exec
	Container string            `yaml:"container,omitempty" json:"container,omitempty"`  // docker
	ComposeFile string          `yaml:"compose,omitempty"   json:"compose,omitempty"`    // docker: path to compose.yml
	Service   string            `yaml:"service,omitempty"   json:"service,omitempty"`    // docker: compose service name
	Files     []string          `yaml:"files,omitempty"     json:"files,omitempty"`      // log
}

// ComposeRef points to a compose.yml for auto-importing Docker services.
type ComposeRef struct {
	File string `yaml:"file" json:"file"`
}

// Rule defines a scoring rule for matching items.
type Rule struct {
	Match map[string]string `yaml:"match" json:"match"`
	Score int               `yaml:"score" json:"score"`
}

var interpolateRe = regexp.MustCompile(`\$\{(\w+)\}`)

// Load reads and parses a manifest from a file path.
func Load(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	m, err := Parse(data)
	if err != nil {
		return nil, err
	}
	m.FilePath = path
	return m, nil
}

// Parse parses a manifest from YAML bytes.
func Parse(data []byte) (*Manifest, error) {
	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	interpolate(&m)
	return &m, nil
}

// Save writes the manifest back to its original file (or the given path).
func Save(m *Manifest, path string) error {
	data, err := yaml.Marshal(m)
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}
	header := "# Managed by Stasium — https://github.com/modoterra/stasium\n"
	return os.WriteFile(path, append([]byte(header), data...), 0644)
}

// interpolate replaces ${var} references in string fields.
func interpolate(m *Manifest) {
	vars := map[string]string{
		"root":    m.Root,
		"project": m.Project,
	}
	expand := func(s string) string {
		return interpolateRe.ReplaceAllStringFunc(s, func(match string) string {
			key := strings.TrimSuffix(strings.TrimPrefix(match, "${"), "}")
			if v, ok := vars[key]; ok {
				return v
			}
			return match
		})
	}

	for name, item := range m.Items {
		item.Dir = expand(item.Dir)
		item.ComposeFile = expand(item.ComposeFile)
		for i, f := range item.Files {
			item.Files[i] = expand(f)
		}
		m.Items[name] = item
	}

	if m.Compose != nil {
		m.Compose.File = expand(m.Compose.File)
	}
}
