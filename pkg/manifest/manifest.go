package manifest

// Manifest represents a stasium.yaml configuration file.
type Manifest struct {
	Version int               `yaml:"version" json:"version"`
	Project string            `yaml:"project" json:"project"`
	Root    string            `yaml:"root"    json:"root"`
	Groups  []Group           `yaml:"groups"  json:"groups,omitempty"`
	Items   map[string]Item   `yaml:"items"   json:"items"`
	Compose *ComposeRef       `yaml:"compose" json:"compose,omitempty"`
	Rules   []Rule            `yaml:"rules"   json:"rules,omitempty"`
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
	Compose   string            `yaml:"compose,omitempty"   json:"compose,omitempty"`    // docker: path to compose.yml
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
