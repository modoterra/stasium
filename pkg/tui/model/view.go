package model

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("205"))

	selectedStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("229")).
			Background(lipgloss.Color("57"))

	statusRunning = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	statusStopped = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	statusFailed  = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	statusRestart = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))

	paneStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			Padding(0, 1)

	activePaneStyle = paneStyle.
			BorderForeground(lipgloss.Color("205"))

	dimStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	helpStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
)

// View renders the TUI.
func (a App) View() string {
	if a.width == 0 || a.height == 0 {
		return "loading..."
	}

	// Editor overlay
	if a.mode == ModeEditor && a.editor != nil {
		editorView := a.editor.View(a.width - 4)
		return paneStyle.Width(a.width - 4).Height(a.height - 2).Render(editorView)
	}

	statusBarH := 2
	logPaneH := max(a.height/4, 5)
	mainH := a.height - logPaneH - statusBarH - 2
	listW := a.width*2/5 - 2
	detailW := a.width - listW - 4

	// List pane
	list := a.renderList(listW, mainH)
	listPane := a.paneBox(PaneList, " Items ", list, listW, mainH)

	// Detail pane
	detail := a.renderDetail(detailW, mainH)
	detailPane := a.paneBox(PaneDetail, " Detail ", detail, detailW, mainH)

	// Top row
	topRow := lipgloss.JoinHorizontal(lipgloss.Top, listPane, detailPane)

	// Log pane
	logs := a.renderLogs(a.width-4, logPaneH)
	logPane := a.paneBox(PaneLogs, a.logTitle(), logs, a.width-4, logPaneH)

	// Status bar
	statusBar := a.renderStatusBar()

	return lipgloss.JoinVertical(lipgloss.Left, topRow, logPane, statusBar)
}

func (a App) paneBox(pane Pane, title, content string, w, h int) string {
	style := paneStyle
	if a.activePane == pane {
		style = activePaneStyle
	}
	return style.Width(w).Height(h).Render(
		titleStyle.Render(title) + "\n" + content,
	)
}

func (a App) renderList(w, h int) string {
	items := a.filteredItems()
	if len(items) == 0 {
		return dimStyle.Render("no items")
	}

	var b strings.Builder
	maxVisible := h - 2
	start := 0
	if a.selectedIdx >= maxVisible {
		start = a.selectedIdx - maxVisible + 1
	}

	for i := start; i < len(items) && i-start < maxVisible; i++ {
		item := items[i]
		indicator := statusIndicator(string(item.Status))
		name := truncate(item.Name, w-6)
		line := fmt.Sprintf(" %s %-*s", indicator, w-6, name)

		if i == a.selectedIdx {
			line = selectedStyle.Width(w).Render(line)
		}
		b.WriteString(line + "\n")
	}

	if a.mode == ModeSearch {
		b.WriteString("\n" + a.search.View())
	}

	return b.String()
}

func (a App) renderDetail(w, h int) string {
	item := a.selectedItem()
	if item == nil {
		return dimStyle.Render("select an item")
	}

	var b strings.Builder
	fmt.Fprintf(&b, "Name:    %s\n", item.Name)
	fmt.Fprintf(&b, "ID:      %s\n", dimStyle.Render(item.ID))
	fmt.Fprintf(&b, "Kind:    %s\n", item.Kind)
	fmt.Fprintf(&b, "Status:  %s\n", colorStatus(string(item.Status)))
	fmt.Fprintf(&b, "Score:   %d\n", item.Score)

	if item.Group != "" {
		fmt.Fprintf(&b, "Group:   %s\n", item.Group)
	}
	if len(item.PIDs) > 0 {
		fmt.Fprintf(&b, "PIDs:    %v\n", item.PIDs)
	}
	if item.CPUPct > 0 {
		fmt.Fprintf(&b, "CPU:     %.1f%%\n", item.CPUPct)
	}
	if item.MemBytes > 0 {
		fmt.Fprintf(&b, "Memory:  %s\n", formatBytes(item.MemBytes))
	}
	if item.UptimeSec > 0 {
		fmt.Fprintf(&b, "Uptime:  %s\n", formatDuration(item.UptimeSec))
	}
	if len(item.Ports) > 0 {
		fmt.Fprintf(&b, "Ports:   %v\n", item.Ports)
	}
	if len(item.Tags) > 0 {
		fmt.Fprintf(&b, "Tags:    %s\n", strings.Join(item.Tags, ", "))
	}

	return b.String()
}

func (a App) renderLogs(w, h int) string {
	if len(a.logLines) == 0 {
		return dimStyle.Render("no log output")
	}

	start := 0
	if len(a.logLines) > h-1 {
		start = len(a.logLines) - h + 1
	}

	var b strings.Builder
	for i := start; i < len(a.logLines); i++ {
		line := truncate(a.logLines[i].Line, w)
		b.WriteString(line + "\n")
	}
	return b.String()
}

func (a App) logTitle() string {
	title := " Logs "
	if a.logPaused {
		title += dimStyle.Render("[PAUSED]") + " "
	}
	return title
}

func (a App) renderStatusBar() string {
	left := a.statusMsg
	right := "j/k:nav tab:pane /:search r:restart s:stop t:start e:edit a:add q:quit"
	if a.mode == ModeSearch {
		right = "enter:apply esc:cancel"
	}
	if a.mode == ModeEditor {
		right = "tab:next field enter:save esc:cancel"
	}

	gap := a.width - len(left) - len(right)
	if gap < 1 {
		gap = 1
	}
	return helpStyle.Render(left + strings.Repeat(" ", gap) + right)
}

func statusIndicator(status string) string {
	switch status {
	case "running":
		return statusRunning.Render("●")
	case "stopped":
		return statusStopped.Render("○")
	case "failed":
		return statusFailed.Render("✖")
	case "restarting":
		return statusRestart.Render("↻")
	default:
		return dimStyle.Render("?")
	}
}

func colorStatus(status string) string {
	switch status {
	case "running":
		return statusRunning.Render(status)
	case "stopped":
		return statusStopped.Render(status)
	case "failed":
		return statusFailed.Render(status)
	case "restarting":
		return statusRestart.Render(status)
	default:
		return dimStyle.Render(status)
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}

func formatBytes(b uint64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func formatDuration(sec uint64) string {
	if sec < 60 {
		return fmt.Sprintf("%ds", sec)
	}
	if sec < 3600 {
		return fmt.Sprintf("%dm%ds", sec/60, sec%60)
	}
	return fmt.Sprintf("%dh%dm", sec/3600, (sec%3600)/60)
}
