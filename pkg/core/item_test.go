package core

import "testing"

func TestItemID(t *testing.T) {
	id := ItemID(KindSystemd, "system", "nginx.service")
	if id != "systemd:system:nginx.service" {
		t.Errorf("expected systemd:system:nginx.service, got %s", id)
	}
}

func TestParseItemID(t *testing.T) {
	tests := []struct {
		input     string
		wantKind  Kind
		wantProv  string
		wantNID   string
		wantError bool
	}{
		{"systemd:system:nginx.service", KindSystemd, "system", "nginx.service", false},
		{"process:procfs:12345", KindProcess, "procfs", "12345", false},
		{"exec:supervisor:php-serve", KindExec, "supervisor", "php-serve", false},
		{"docker:compose:mailpit", KindDocker, "compose", "mailpit", false},
		{"log:filetail:/var/log/app.log", KindLog, "filetail", "/var/log/app.log", false},
		{"invalid", "", "", "", true},
		{"only:two", "", "", "", true},
		{"has:colons:in:native:id", Kind("has"), "colons", "in:native:id", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			kind, prov, nid, err := ParseItemID(tt.input)
			if tt.wantError {
				if err == nil {
					t.Errorf("expected error for %q", tt.input)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error for %q: %v", tt.input, err)
				return
			}
			if kind != tt.wantKind {
				t.Errorf("kind: got %q, want %q", kind, tt.wantKind)
			}
			if prov != tt.wantProv {
				t.Errorf("provider: got %q, want %q", prov, tt.wantProv)
			}
			if nid != tt.wantNID {
				t.Errorf("nativeID: got %q, want %q", nid, tt.wantNID)
			}
		})
	}
}

func TestParseItemIDRoundTrip(t *testing.T) {
	original := ItemID(KindExec, "supervisor", "vite")
	kind, prov, nid, err := ParseItemID(original)
	if err != nil {
		t.Fatal(err)
	}
	reconstructed := ItemID(kind, prov, nid)
	if reconstructed != original {
		t.Errorf("round-trip failed: %q != %q", reconstructed, original)
	}
}
