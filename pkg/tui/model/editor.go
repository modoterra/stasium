package model

import (
	"context"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/bubbles/textinput"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

// EditorField is a named text input in the editor form.
type EditorField struct {
	Label string
	Input textinput.Model
}

// EditorModel is the inline manifest item editor.
type EditorModel struct {
	fields    []EditorField
	kindIdx   int // index of the "kind" field
	activeIdx int
	isNew     bool
	itemName  string
}

// NewEditorForItem creates an editor pre-filled with an existing item.
func NewEditorForItem(item core.Item) *EditorModel {
	fields := baseFields(item.Name, string(item.Kind))

	fields = appendKindFields(fields, string(item.Kind), item.Source)

	fields[0].Input.Focus()
	return &EditorModel{fields: fields, itemName: item.Name, kindIdx: 1}
}

// NewEditorForNew creates a blank editor for adding a new item.
func NewEditorForNew() *EditorModel {
	fields := baseFields("", "exec")
	fields = appendKindFields(fields, "exec", nil)
	fields[0].Input.Focus()
	return &EditorModel{fields: fields, isNew: true, kindIdx: 1}
}

func baseFields(name, kind string) []EditorField {
	return []EditorField{
		newField("name", name),
		newField("kind", kind),
		newField("group", ""),
	}
}

func appendKindFields(fields []EditorField, kind string, source map[string]string) []EditorField {
	get := func(key string) string {
		if source != nil {
			return source[key]
		}
		return ""
	}
	switch kind {
	case "systemd":
		fields = append(fields, newField("unit", get("unit")))
	case "exec":
		fields = append(fields,
			newField("command", get("command")),
			newField("dir", get("dir")),
			newField("restart", orDefault(get("restart"), "on-failure")),
		)
	case "docker":
		fields = append(fields,
			newField("container", get("container")),
			newField("service", get("service")),
			newField("compose", get("compose")),
		)
	case "log":
		fields = append(fields, newField("files", get("files")))
	}
	return fields
}

func orDefault(val, def string) string {
	if val != "" {
		return val
	}
	return def
}

func newField(label, value string) EditorField {
	ti := textinput.New()
	ti.Placeholder = label
	ti.SetValue(value)
	ti.CharLimit = 256
	return EditorField{Label: label, Input: ti}
}

// updateManifestResultMsg carries the result of a manifest update.
type updateManifestResultMsg struct {
	ok     bool
	errors []string
}

func updateManifestCmd(client *uds.Client, req uds.UpdateManifestRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		resp, err := client.Request(ctx, uds.MethodUpdateManifest, req)
		if err != nil {
			return updateManifestResultMsg{ok: false, errors: []string{err.Error()}}
		}
		var res uds.UpdateManifestResponse
		if err := resp.UnmarshalData(&res); err != nil {
			return updateManifestResultMsg{ok: false, errors: []string{err.Error()}}
		}
		return updateManifestResultMsg{ok: res.OK, errors: res.Errors}
	}
}

// HandleKey processes key events in editor mode.
func (e *EditorModel) HandleKey(a App, msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		a.mode = ModeNormal
		a.editor = nil
		return a, nil

	case "enter":
		return e.save(a)

	case "tab":
		e.fields[e.activeIdx].Input.Blur()
		e.activeIdx = (e.activeIdx + 1) % len(e.fields)
		e.fields[e.activeIdx].Input.Focus()

		// Detect kind change and rebuild fields
		if e.activeIdx != e.kindIdx {
			e.maybeRebuildKindFields()
		}
		return a, textinput.Blink

	case "shift+tab":
		e.fields[e.activeIdx].Input.Blur()
		e.activeIdx = (e.activeIdx - 1 + len(e.fields)) % len(e.fields)
		e.fields[e.activeIdx].Input.Focus()
		if e.activeIdx != e.kindIdx {
			e.maybeRebuildKindFields()
		}
		return a, textinput.Blink

	default:
		var cmd tea.Cmd
		e.fields[e.activeIdx].Input, cmd = e.fields[e.activeIdx].Input.Update(msg)
		return a, cmd
	}
}

// maybeRebuildKindFields checks if the kind field changed and rebuilds kind-specific fields.
func (e *EditorModel) maybeRebuildKindFields() {
	if e.kindIdx >= len(e.fields) {
		return
	}
	newKind := strings.TrimSpace(e.fields[e.kindIdx].Input.Value())
	validKinds := map[string]bool{"systemd": true, "exec": true, "docker": true, "log": true}
	if !validKinds[newKind] {
		return
	}

	// Check current kind-specific fields
	baseCount := 3 // name, kind, group
	currentKindFields := e.fields[baseCount:]
	currentKind := detectCurrentKind(currentKindFields)
	if currentKind == newKind {
		return
	}

	// Preserve base fields, rebuild kind-specific ones
	base := e.fields[:baseCount]
	e.fields = appendKindFields(base, newKind, nil)
	if e.activeIdx >= len(e.fields) {
		e.activeIdx = len(e.fields) - 1
	}
}

func detectCurrentKind(fields []EditorField) string {
	if len(fields) == 0 {
		return ""
	}
	switch fields[0].Label {
	case "unit":
		return "systemd"
	case "command":
		return "exec"
	case "container":
		return "docker"
	case "files":
		return "log"
	}
	return ""
}

func (e *EditorModel) save(a App) (tea.Model, tea.Cmd) {
	name := strings.TrimSpace(e.fields[0].Input.Value())
	if name == "" {
		a.statusMsg = "error: name is required"
		return a, nil
	}

	kind := strings.TrimSpace(e.fields[1].Input.Value())
	itemMap := map[string]any{"kind": kind}

	for _, f := range e.fields[2:] {
		val := strings.TrimSpace(f.Input.Value())
		if val == "" {
			continue
		}
		switch f.Label {
		case "group":
			// group is not part of the item itself
		case "files":
			itemMap["files"] = strings.Split(val, ",")
		default:
			itemMap[f.Label] = val
		}
	}

	a.mode = ModeNormal
	a.editor = nil

	if a.client == nil {
		a.statusMsg = "not connected"
		return a, nil
	}

	patch := &uds.ItemPatch{Name: name, Item: itemMap}
	var req uds.UpdateManifestRequest
	if e.isNew {
		req.AddItem = patch
	} else {
		req.UpdateItem = patch
	}

	a.statusMsg = "saving " + name + "..."
	return a, updateManifestCmd(a.client, req)
}

// View renders the editor form.
func (e *EditorModel) View(width int) string {
	title := "Edit Item"
	if e.isNew {
		title = "New Item"
	}

	s := titleStyle.Render(" "+title+" ") + "\n\n"
	for i, f := range e.fields {
		prefix := "  "
		if i == e.activeIdx {
			prefix = "▸ "
		}
		s += prefix + dimStyle.Render(f.Label+": ") + f.Input.View() + "\n"
	}
	s += "\n" + helpStyle.Render("  tab:next  shift+tab:prev  enter:save  esc:cancel")
	return s
}
