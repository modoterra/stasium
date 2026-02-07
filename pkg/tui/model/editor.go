package model

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/bubbles/textinput"

	"github.com/modoterra/stasium/pkg/core"
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

	switch item.Kind {
	case core.KindSystemd:
		fields = append(fields, newField("unit", item.Source["unit"]))
	case core.KindExec:
		fields = append(fields,
			newField("command", item.Source["command"]),
			newField("dir", item.Source["dir"]),
			newField("restart", item.Source["restart"]),
		)
	case core.KindDocker:
		fields = append(fields,
			newField("container", item.Source["container"]),
			newField("service", item.Source["service"]),
			newField("compose", item.Source["compose"]),
		)
	case core.KindLog:
		fields = append(fields, newField("files", item.Source["files"]))
	}

	fields[0].Input.Focus()
	return &EditorModel{fields: fields, itemName: item.Name}
}

// NewEditorForNew creates a blank editor for adding a new item.
func NewEditorForNew() *EditorModel {
	fields := baseFields("", "exec")
	fields = append(fields,
		newField("command", ""),
		newField("dir", ""),
		newField("restart", "on-failure"),
	)
	fields[0].Input.Focus()
	return &EditorModel{fields: fields, isNew: true}
}

func baseFields(name, kind string) []EditorField {
	return []EditorField{
		newField("name", name),
		newField("kind", kind),
		newField("group", ""),
	}
}

func newField(label, value string) EditorField {
	ti := textinput.New()
	ti.Placeholder = label
	ti.SetValue(value)
	ti.CharLimit = 256
	return EditorField{Label: label, Input: ti}
}

// HandleKey processes key events in editor mode.
func (e *EditorModel) HandleKey(a App, msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		a.mode = ModeNormal
		a.editor = nil
		return a, nil

	case "enter":
		// Save — collect values and send UpdateManifest
		a.mode = ModeNormal
		a.statusMsg = "saved: " + e.fields[0].Input.Value()
		a.editor = nil
		// TODO: send UpdateManifest to daemon
		return a, nil

	case "tab":
		e.fields[e.activeIdx].Input.Blur()
		e.activeIdx = (e.activeIdx + 1) % len(e.fields)
		e.fields[e.activeIdx].Input.Focus()
		return a, textinput.Blink

	case "shift+tab":
		e.fields[e.activeIdx].Input.Blur()
		e.activeIdx = (e.activeIdx - 1 + len(e.fields)) % len(e.fields)
		e.fields[e.activeIdx].Input.Focus()
		return a, textinput.Blink

	default:
		var cmd tea.Cmd
		e.fields[e.activeIdx].Input, cmd = e.fields[e.activeIdx].Input.Update(msg)
		return a, cmd
	}
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
