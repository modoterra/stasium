package manifest

import (
	"strings"
	"testing"
)

func TestParseValidManifest(t *testing.T) {
	yaml := `
version: 1
project: my-app
root: /var/www/my-app
groups:
  - name: web
    items: [nginx, php-serve]
items:
  nginx:
    kind: systemd
    unit: nginx.service
  php-serve:
    kind: exec
    command: "php artisan serve"
    dir: "${root}"
    restart: on-failure
  app-log:
    kind: log
    files:
      - "${root}/storage/logs/laravel.log"
`
	m, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if m.Version != 1 {
		t.Errorf("version: got %d, want 1", m.Version)
	}
	if m.Project != "my-app" {
		t.Errorf("project: got %q", m.Project)
	}
	if len(m.Items) != 3 {
		t.Errorf("items count: got %d, want 3", len(m.Items))
	}
	// Check interpolation
	serve := m.Items["php-serve"]
	if serve.Dir != "/var/www/my-app" {
		t.Errorf("exec dir interpolation: got %q", serve.Dir)
	}
	log := m.Items["app-log"]
	if len(log.Files) != 1 || log.Files[0] != "/var/www/my-app/storage/logs/laravel.log" {
		t.Errorf("log file interpolation: got %v", log.Files)
	}
	errs := Validate(m)
	if len(errs) != 0 {
		t.Errorf("unexpected validation errors: %v", errs)
	}
}

func TestValidateVersionMustBe1(t *testing.T) {
	m := &Manifest{Version: 2, Items: map[string]Item{"x": {Kind: "systemd", Unit: "x.service"}}}
	errs := Validate(m)
	assertHasError(t, errs, "version must be 1")
}

func TestValidateEmptyItems(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{}}
	errs := Validate(m)
	assertHasError(t, errs, "at least one item")
}

func TestValidateSystemdRequiresUnit(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"nginx": {Kind: "systemd"}}}
	errs := Validate(m)
	assertHasError(t, errs, "unit is required")
}

func TestValidateExecRequiresCommand(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"serve": {Kind: "exec"}}}
	errs := Validate(m)
	assertHasError(t, errs, "command is required")
}

func TestValidateExecBadRestart(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"serve": {Kind: "exec", Command: "foo", Restart: "bogus"}}}
	errs := Validate(m)
	assertHasError(t, errs, "restart must be")
}

func TestValidateExecValidRestartPolicies(t *testing.T) {
	for _, policy := range []string{"always", "on-failure", "never", ""} {
		m := &Manifest{Version: 1, Items: map[string]Item{"s": {Kind: "exec", Command: "foo", Restart: policy}}}
		errs := Validate(m)
		if len(errs) != 0 {
			t.Errorf("restart=%q: unexpected errors: %v", policy, errs)
		}
	}
}

func TestValidateDockerRequiresContainerOrCompose(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"db": {Kind: "docker"}}}
	errs := Validate(m)
	assertHasError(t, errs, "container or compose+service")
}

func TestValidateDockerWithContainer(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"db": {Kind: "docker", Container: "mysql"}}}
	errs := Validate(m)
	if len(errs) != 0 {
		t.Errorf("unexpected errors: %v", errs)
	}
}

func TestValidateDockerWithComposeAndService(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"db": {Kind: "docker", ComposeFile: "compose.yml", Service: "mysql"}}}
	errs := Validate(m)
	if len(errs) != 0 {
		t.Errorf("unexpected errors: %v", errs)
	}
}

func TestValidateLogRequiresFiles(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"log": {Kind: "log"}}}
	errs := Validate(m)
	assertHasError(t, errs, "files is required")
}

func TestValidateUnknownKind(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"x": {Kind: "foobar"}}}
	errs := Validate(m)
	assertHasError(t, errs, "unknown kind")
}

func TestValidateMissingKind(t *testing.T) {
	m := &Manifest{Version: 1, Items: map[string]Item{"x": {}}}
	errs := Validate(m)
	assertHasError(t, errs, "kind is required")
}

func TestValidateGroupReferencesUnknownItem(t *testing.T) {
	m := &Manifest{
		Version: 1,
		Items:   map[string]Item{"nginx": {Kind: "systemd", Unit: "nginx.service"}},
		Groups:  []Group{{Name: "web", Items: []string{"nginx", "nonexistent"}}},
	}
	errs := Validate(m)
	assertHasError(t, errs, "references unknown item")
}

func TestValidateGroupReferencesValid(t *testing.T) {
	m := &Manifest{
		Version: 1,
		Items:   map[string]Item{"nginx": {Kind: "systemd", Unit: "nginx.service"}},
		Groups:  []Group{{Name: "web", Items: []string{"nginx"}}},
	}
	errs := Validate(m)
	if len(errs) != 0 {
		t.Errorf("unexpected errors: %v", errs)
	}
}

func TestInterpolationProject(t *testing.T) {
	yaml := `
version: 1
project: testproj
root: /opt/${project}
items:
  serve:
    kind: exec
    command: run
    dir: "${root}"
`
	m, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	// Note: root itself contains ${project} which won't be expanded in root itself,
	// but items using ${root} will get the literal value of root.
	serve := m.Items["serve"]
	if serve.Dir != "/opt/${project}" {
		t.Errorf("dir: got %q", serve.Dir)
	}
}

func TestInterpolationComposeRef(t *testing.T) {
	yaml := `
version: 1
project: app
root: /var/www/app
compose:
  file: "${root}/compose.yml"
items:
  db:
    kind: docker
    container: mysql
`
	m, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatal(err)
	}
	if m.Compose.File != "/var/www/app/compose.yml" {
		t.Errorf("compose file: got %q", m.Compose.File)
	}
}

func TestFullLaravelManifest(t *testing.T) {
	yaml := `
version: 1
project: my-laravel-app
root: /var/www/my-app
groups:
  - name: web
    items: [nginx, php-serve, vite]
  - name: workers
    items: [scheduler, queue-worker]
  - name: infra
    items: [redis]
items:
  nginx:
    kind: systemd
    unit: nginx.service
  redis:
    kind: systemd
    unit: redis.service
  php-serve:
    kind: exec
    command: "php artisan serve"
    dir: "${root}"
    restart: on-failure
  vite:
    kind: exec
    command: "npm run dev"
    dir: "${root}"
    restart: always
  scheduler:
    kind: exec
    command: "php artisan schedule:work"
    dir: "${root}"
    restart: always
  queue-worker:
    kind: exec
    command: "php artisan queue:work"
    dir: "${root}"
    restart: on-failure
  mailpit:
    kind: docker
    container: mailpit
  app-log:
    kind: log
    files:
      - "${root}/storage/logs/laravel.log"
rules:
  - match: { kind: systemd }
    score: 10
  - match: { group: workers }
    score: 20
`
	m, err := Parse([]byte(yaml))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	errs := Validate(m)
	if len(errs) != 0 {
		t.Errorf("validation errors: %v", errs)
	}
	if len(m.Items) != 8 {
		t.Errorf("items: got %d, want 8", len(m.Items))
	}
	if len(m.Groups) != 3 {
		t.Errorf("groups: got %d, want 3", len(m.Groups))
	}
}

func assertHasError(t *testing.T, errs []error, substr string) {
	t.Helper()
	for _, e := range errs {
		if strings.Contains(e.Error(), substr) {
			return
		}
	}
	t.Errorf("expected error containing %q, got: %v", substr, errs)
}

func TestSaveRoundTrip(t *testing.T) {
	input := `
version: 1
project: roundtrip
root: /app
items:
  web:
    kind: systemd
    unit: nginx.service
  serve:
    kind: exec
    command: "php artisan serve"
    dir: /app
    restart: always
  redis:
    kind: docker
    container: redis-1
    service: redis
`
	m, err := Parse([]byte(input))
	if err != nil {
		t.Fatal(err)
	}

	tmpFile := t.TempDir() + "/stasium.yaml"
	m.FilePath = tmpFile

	if err := Save(m, tmpFile); err != nil {
		t.Fatal("save:", err)
	}

	m2, err := Load(tmpFile)
	if err != nil {
		t.Fatal("reload:", err)
	}

	if m2.Version != 1 {
		t.Errorf("version: got %d, want 1", m2.Version)
	}
	if m2.Project != "roundtrip" {
		t.Errorf("project: got %q, want 'roundtrip'", m2.Project)
	}
	if len(m2.Items) != 3 {
		t.Fatalf("items: got %d, want 3", len(m2.Items))
	}
	if m2.Items["web"].Unit != "nginx.service" {
		t.Errorf("web.unit: got %q, want 'nginx.service'", m2.Items["web"].Unit)
	}
	if m2.Items["serve"].Command != "php artisan serve" {
		t.Errorf("serve.command: got %q", m2.Items["serve"].Command)
	}
	if m2.Items["serve"].Restart != "always" {
		t.Errorf("serve.restart: got %q, want 'always'", m2.Items["serve"].Restart)
	}
	if m2.Items["redis"].Container != "redis-1" {
		t.Errorf("redis.container: got %q", m2.Items["redis"].Container)
	}
}
