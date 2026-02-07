package model

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

// Pane identifies which TUI pane is focused.
type Pane int

const (
	PaneList Pane = iota
	PaneDetail
	PaneLogs
)

// Mode identifies the current interaction mode.
type Mode int

const (
	ModeNormal Mode = iota
	ModeSearch
	ModeEditor
	ModeConfirmDelete
)

// App is the root Bubble Tea model.
type App struct {
	// Connection
	client     *uds.Client
	socketPath string
	connected  bool

	// State
	items       []core.Item
	selectedIdx int
	logLines    []core.LogLine
	logPaused   bool

	// UI
	activePane Pane
	mode       Mode
	search     textinput.Model
	width      int
	height     int

	// Editor
	editor *EditorModel

	// Delete confirmation
	deleteTarget string

	// Error display
	statusMsg string
}

// New creates a new TUI app model.
func New(socketPath string) App {
	si := textinput.New()
	si.Placeholder = "search..."
	si.CharLimit = 64

	return App{
		socketPath: socketPath,
		search:     si,
		activePane: PaneList,
		mode:       ModeNormal,
	}
}

// Init connects to the daemon.
func (a App) Init() tea.Cmd {
	return tea.Batch(
		connectCmd(a.socketPath),
		tea.SetWindowTitle("Stasium"),
	)
}

// tickMsg triggers periodic refresh.
type tickMsg time.Time

// connectedMsg indicates successful daemon connection.
type connectedMsg struct{ client *uds.Client }

// itemsMsg carries updated items from daemon.
type itemsMsg struct{ items []core.Item }

// logLineMsg carries a log line from daemon.
type logLineMsg core.LogLine

// errorMsg carries an error to display.
type errorMsg struct{ err error }

// actionResultMsg carries the result of an action.
type actionResultMsg struct{ msg string }

func connectCmd(socketPath string) tea.Cmd {
	return func() tea.Msg {
		client, err := uds.Dial(socketPath)
		if err != nil {
			return errorMsg{err}
		}
		return connectedMsg{client}
	}
}

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func fetchItemsCmd(client *uds.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		resp, err := client.Request(ctx, uds.MethodListItems, nil)
		if err != nil {
			return errorMsg{err}
		}

		var items []core.Item
		if err := resp.UnmarshalData(&items); err != nil {
			return errorMsg{err}
		}

		sort.Slice(items, func(i, j int) bool {
			return items[i].Score > items[j].Score
		})

		return itemsMsg{items}
	}
}

func actionCmd(client *uds.Client, itemID, action string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		_, err := client.Request(ctx, uds.MethodAction, uds.ActionRequest{
			ItemID: itemID,
			Action: action,
		})
		if err != nil {
			return errorMsg{err}
		}
		return actionResultMsg{msg: action + " → " + itemID}
	}
}

// Update handles messages.
func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		a.width = msg.Width
		a.height = msg.Height
		return a, nil

	case connectedMsg:
		a.client = msg.client
		a.connected = true
		a.statusMsg = "connected"

		// Listen for events
		a.client.OnEvent(func(m uds.Message) {
			// Events handled via polling for now
		})

		return a, tea.Batch(tickCmd(), fetchItemsCmd(a.client))

	case tickMsg:
		if a.client != nil {
			return a, tea.Batch(tickCmd(), fetchItemsCmd(a.client))
		}
		return a, tickCmd()

	case itemsMsg:
		a.items = msg.items
		if a.selectedIdx >= len(a.items) {
			a.selectedIdx = max(0, len(a.items)-1)
		}
		return a, nil

	case logLineMsg:
		if !a.logPaused {
			a.logLines = append(a.logLines, core.LogLine(msg))
			if len(a.logLines) > 500 {
				a.logLines = a.logLines[len(a.logLines)-500:]
			}
		}
		return a, nil

	case actionResultMsg:
		a.statusMsg = msg.msg
		return a, nil

	case updateManifestResultMsg:
		if msg.ok {
			a.statusMsg = "manifest updated"
		} else {
			a.statusMsg = "error: " + strings.Join(msg.errors, "; ")
		}
		return a, nil

	case errorMsg:
		a.statusMsg = "error: " + msg.err.Error()
		return a, nil

	case tea.KeyMsg:
		return a.handleKey(msg)
	}

	return a, nil
}

func (a App) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Search mode
	if a.mode == ModeSearch {
		switch msg.String() {
		case "esc":
			a.mode = ModeNormal
			a.search.SetValue("")
			a.search.Blur()
			return a, nil
		case "enter":
			a.mode = ModeNormal
			a.search.Blur()
			return a, nil
		default:
			var cmd tea.Cmd
			a.search, cmd = a.search.Update(msg)
			return a, cmd
		}
	}

	// Editor mode
	if a.mode == ModeEditor && a.editor != nil {
		return a.editor.HandleKey(a, msg)
	}

	// Delete confirmation mode
	if a.mode == ModeConfirmDelete {
		switch msg.String() {
		case "y", "Y":
			name := a.deleteTarget
			a.mode = ModeNormal
			a.deleteTarget = ""
			if a.client == nil {
				a.statusMsg = "not connected"
				return a, nil
			}
			a.statusMsg = "deleting " + name + "..."
			return a, updateManifestCmd(a.client, uds.UpdateManifestRequest{RemoveItem: name})
		default:
			a.mode = ModeNormal
			a.deleteTarget = ""
			a.statusMsg = "delete cancelled"
			return a, nil
		}
	}

	// Normal mode
	switch msg.String() {
	case "q", "ctrl+c":
		return a, tea.Quit

	case "j", "down":
		if a.activePane == PaneList && len(a.items) > 0 {
			a.selectedIdx = min(a.selectedIdx+1, len(a.filteredItems())-1)
		}
	case "k", "up":
		if a.activePane == PaneList && a.selectedIdx > 0 {
			a.selectedIdx--
		}

	case "tab":
		a.activePane = (a.activePane + 1) % 3

	case "/":
		a.mode = ModeSearch
		a.search.Focus()
		return a, textinput.Blink

	case "r":
		return a.doAction("restart")
	case "s":
		return a.doAction("stop")
	case "t":
		return a.doAction("start")
	case "x":
		return a.doAction("term")
	case "X":
		return a.doAction("kill")

	case "l":
		a.activePane = PaneLogs

	case " ":
		if a.activePane == PaneLogs {
			a.logPaused = !a.logPaused
		}

	case "e":
		if len(a.items) > 0 {
			items := a.filteredItems()
			if a.selectedIdx < len(items) {
				a.editor = NewEditorForItem(items[a.selectedIdx])
				a.mode = ModeEditor
			}
		}

	case "a":
		a.editor = NewEditorForNew()
		a.mode = ModeEditor

	case "d":
		if len(a.items) > 0 {
			items := a.filteredItems()
			if a.selectedIdx < len(items) {
				a.deleteTarget = items[a.selectedIdx].Name
				a.mode = ModeConfirmDelete
				a.statusMsg = "Delete " + a.deleteTarget + "? (y/n)"
			}
		}
	}

	return a, nil
}

func (a App) doAction(action string) (tea.Model, tea.Cmd) {
	items := a.filteredItems()
	if a.client == nil || len(items) == 0 || a.selectedIdx >= len(items) {
		return a, nil
	}
	item := items[a.selectedIdx]
	return a, actionCmd(a.client, item.ID, action)
}

func (a App) filteredItems() []core.Item {
	q := strings.ToLower(a.search.Value())
	if q == "" {
		return a.items
	}
	var filtered []core.Item
	for _, item := range a.items {
		if strings.Contains(strings.ToLower(item.Name), q) ||
			strings.Contains(strings.ToLower(item.Group), q) ||
			strings.Contains(strings.ToLower(string(item.Kind)), q) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func (a App) selectedItem() *core.Item {
	items := a.filteredItems()
	if a.selectedIdx < len(items) {
		return &items[a.selectedIdx]
	}
	return nil
}
