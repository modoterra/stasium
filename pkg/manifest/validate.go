package manifest

import "fmt"

// Validate checks the manifest for structural correctness.
func Validate(m *Manifest) []error {
	var errs []error

	if m.Version != 1 {
		errs = append(errs, fmt.Errorf("version must be 1, got %d", m.Version))
	}

	if len(m.Items) == 0 {
		errs = append(errs, fmt.Errorf("manifest must define at least one item"))
	}

	// Validate items
	for name, item := range m.Items {
		switch item.Kind {
		case "systemd":
			if item.Unit == "" {
				errs = append(errs, fmt.Errorf("item %q (systemd): unit is required", name))
			}
		case "exec":
			if item.Command == "" {
				errs = append(errs, fmt.Errorf("item %q (exec): command is required", name))
			}
			if item.Restart != "" && item.Restart != "always" && item.Restart != "on-failure" && item.Restart != "never" {
				errs = append(errs, fmt.Errorf("item %q (exec): restart must be always, on-failure, or never; got %q", name, item.Restart))
			}
		case "docker":
			if item.Container == "" && (item.ComposeFile == "" || item.Service == "") {
				errs = append(errs, fmt.Errorf("item %q (docker): container or compose+service is required", name))
			}
		case "log":
			if len(item.Files) == 0 {
				errs = append(errs, fmt.Errorf("item %q (log): files is required", name))
			}
		case "":
			errs = append(errs, fmt.Errorf("item %q: kind is required", name))
		default:
			errs = append(errs, fmt.Errorf("item %q: unknown kind %q", name, item.Kind))
		}
	}

	// Validate group references
	for _, g := range m.Groups {
		for _, ref := range g.Items {
			if _, ok := m.Items[ref]; !ok {
				errs = append(errs, fmt.Errorf("group %q references unknown item %q", g.Name, ref))
			}
		}
	}

	return errs
}
