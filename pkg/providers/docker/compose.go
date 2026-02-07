package docker

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// ComposeFile represents a minimal Docker Compose file.
type ComposeFile struct {
	Services map[string]ComposeService `yaml:"services"`
}

// ComposeService is a minimal service definition from a compose file.
type ComposeService struct {
	Image       string            `yaml:"image"`
	Ports       []string          `yaml:"ports"`
	ContainerName string          `yaml:"container_name"`
	Labels      map[string]string `yaml:"labels"`
}

// ParseComposeFile reads a compose.yml and returns service definitions.
func ParseComposeFile(path string) (*ComposeFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read compose file: %w", err)
	}

	var cf ComposeFile
	if err := yaml.Unmarshal(data, &cf); err != nil {
		return nil, fmt.Errorf("parse compose file: %w", err)
	}
	return &cf, nil
}

// ServiceNames returns the list of service names in the compose file.
func (cf *ComposeFile) ServiceNames() []string {
	names := make([]string, 0, len(cf.Services))
	for name := range cf.Services {
		names = append(names, name)
	}
	return names
}

// AutoImport generates containerDefs for compose services not already defined.
func AutoImport(cf *ComposeFile, existing map[string]bool, project string) []containerDef {
	var defs []containerDef
	for name, svc := range cf.Services {
		if existing[name] {
			continue
		}
		containerName := svc.ContainerName
		if containerName == "" && project != "" {
			containerName = fmt.Sprintf("%s-%s-1", project, name)
		}
		defs = append(defs, containerDef{
			Name:      name,
			Container: containerName,
			Service:   name,
		})
	}
	return defs
}
