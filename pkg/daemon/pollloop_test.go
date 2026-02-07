package daemon

import (
	"testing"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
)

func TestComputeScore_ManifestBonus(t *testing.T) {
	m := &manifest.Manifest{
		Items: map[string]manifest.Item{
			"nginx": {Kind: "systemd", Unit: "nginx.service"},
		},
	}
	item := core.Item{Kind: core.KindSystemd}
	score := computeScore(item, m)
	if score < 60 {
		t.Errorf("expected at least 60 for manifest item, got %d", score)
	}
}

func TestComputeScore_RuleScore(t *testing.T) {
	m := &manifest.Manifest{
		Items: map[string]manifest.Item{
			"nginx": {Kind: "systemd", Unit: "nginx.service"},
		},
		Rules: []manifest.Rule{
			{Match: map[string]string{"kind": "systemd"}, Score: 10},
		},
	}
	item := core.Item{Kind: core.KindSystemd}
	score := computeScore(item, m)
	if score != 70 { // 60 (manifest) + 10 (rule)
		t.Errorf("expected 70, got %d", score)
	}
}

func TestComputeScore_HeuristicCPU(t *testing.T) {
	item := core.Item{Kind: core.KindProcess, CPUPct: 10.0}
	score := computeScore(item, nil)
	if score != 10 {
		t.Errorf("expected 10 for high CPU, got %d", score)
	}
}

func TestComputeScore_HeuristicMem(t *testing.T) {
	item := core.Item{Kind: core.KindProcess, MemBytes: 200 * 1024 * 1024}
	score := computeScore(item, nil)
	if score != 5 {
		t.Errorf("expected 5 for high mem, got %d", score)
	}
}

func TestComputeDelta_Added(t *testing.T) {
	old := map[string]core.Item{}
	new := map[string]core.Item{"a": {ID: "a", Status: core.StatusRunning}}
	d := computeDelta(old, new)
	if len(d.Added) != 1 {
		t.Errorf("expected 1 added, got %d", len(d.Added))
	}
}

func TestComputeDelta_Removed(t *testing.T) {
	old := map[string]core.Item{"a": {ID: "a"}}
	new := map[string]core.Item{}
	d := computeDelta(old, new)
	if len(d.Removed) != 1 {
		t.Errorf("expected 1 removed, got %d", len(d.Removed))
	}
}

func TestComputeDelta_Updated(t *testing.T) {
	old := map[string]core.Item{"a": {ID: "a", Status: core.StatusRunning}}
	new := map[string]core.Item{"a": {ID: "a", Status: core.StatusStopped}}
	d := computeDelta(old, new)
	if len(d.Updated) != 1 {
		t.Errorf("expected 1 updated, got %d", len(d.Updated))
	}
}

func TestComputeDelta_NoChange(t *testing.T) {
	items := map[string]core.Item{"a": {ID: "a", Status: core.StatusRunning}}
	d := computeDelta(items, items)
	if d.HasChanges() {
		t.Error("expected no changes")
	}
}
