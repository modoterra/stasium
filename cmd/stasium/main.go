package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"

	"github.com/modoterra/stasium/internal/buildinfo"
	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/manifest/presets"
	"github.com/modoterra/stasium/pkg/transport/uds"
	tuimodel "github.com/modoterra/stasium/pkg/tui/model"
)

var socketPath string

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "stasium",
	Short: "Service manager TUI for Linux development environments",
	Long:  "Stasium is a TUI + daemon that monitors and manages services, exec processes, Docker containers, and log files.",
	RunE:  runTUI,
}

func init() {
	rootCmd.PersistentFlags().StringVar(&socketPath, "socket", "/tmp/stasium.sock", "daemon socket path")

	rootCmd.AddCommand(pingCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(daemonCmd)
	rootCmd.AddCommand(manifestCmd)
	rootCmd.AddCommand(restartCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(startCmd)
}

// --- Root: TUI ---

func runTUI(_ *cobra.Command, _ []string) error {
	ensureDaemon()
	app := tuimodel.New(socketPath)
	p := tea.NewProgram(app, tea.WithAltScreen())
	_, err := p.Run()
	return err
}

func ensureDaemon() {
	if _, err := os.Stat(socketPath); err == nil {
		return
	}
	cmd := exec.Command("stasiumd")
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Start()
	for i := 0; i < 30; i++ {
		if _, err := os.Stat(socketPath); err == nil {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	fmt.Fprintln(os.Stderr, "warning: could not start daemon, continuing anyway")
}

func dialDaemon() (*uds.Client, error) {
	client, err := uds.Dial(socketPath)
	if err != nil {
		return nil, fmt.Errorf("cannot connect to daemon at %s: %w", socketPath, err)
	}
	return client, nil
}

// --- Ping ---

var pingCmd = &cobra.Command{
	Use:   "ping",
	Short: "Check if daemon is running",
	RunE: func(_ *cobra.Command, _ []string) error {
		client, err := dialDaemon()
		if err != nil {
			return err
		}
		defer client.Close()

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		resp, err := client.Request(ctx, uds.MethodPing, nil)
		if err != nil {
			return err
		}

		var pong uds.PingResponse
		if err := json.Unmarshal(resp.Data, &pong); err != nil {
			return err
		}
		if pong.Pong {
			fmt.Println("pong ✓")
		}
		return nil
	},
}

// --- Version ---

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version information",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Printf("stasium %s (%s) built %s\n", buildinfo.Version, buildinfo.Commit, buildinfo.Date)
	},
}

// --- Daemon ---

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Start daemon in foreground (for debugging)",
	Long:  "Normally the TUI auto-spawns the daemon. Use this to run it manually.",
	RunE: func(_ *cobra.Command, _ []string) error {
		// Just exec stasiumd directly
		args := []string{}
		if manifestFlag != "" {
			args = append(args, "--manifest", manifestFlag)
		}
		cmd := exec.Command("stasiumd", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	},
}

var manifestFlag string

func init() {
	daemonCmd.Flags().StringVar(&manifestFlag, "manifest", "", "path to stasium.yaml")
}

// --- Status ---

var (
	statusJSON  bool
	statusGroup string
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show status of all managed items",
	RunE: func(_ *cobra.Command, _ []string) error {
		client, err := dialDaemon()
		if err != nil {
			return err
		}
		defer client.Close()

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		resp, err := client.Request(ctx, uds.MethodListItems, nil)
		if err != nil {
			return err
		}

		var items []core.Item
		if err := resp.UnmarshalData(&items); err != nil {
			return err
		}

		if statusGroup != "" {
			var filtered []core.Item
			for _, item := range items {
				if item.Group == statusGroup {
					filtered = append(filtered, item)
				}
			}
			items = filtered
		}

		if statusJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(items)
		}

		if len(items) == 0 {
			fmt.Println("no items")
			return nil
		}

		fmt.Printf("%-20s %-10s %-10s %-6s %s\n", "NAME", "KIND", "STATUS", "SCORE", "ID")
		for _, item := range items {
			fmt.Printf("%-20s %-10s %-10s %-6d %s\n", item.Name, item.Kind, item.Status, item.Score, item.ID)
		}
		return nil
	},
}

func init() {
	statusCmd.Flags().BoolVar(&statusJSON, "json", false, "output as JSON")
	statusCmd.Flags().StringVar(&statusGroup, "group", "", "filter by group name")
}

// --- Manifest ---

var manifestCmd = &cobra.Command{
	Use:   "manifest",
	Short: "Manage stasium.yaml manifest",
}

var manifestInitCmd = &cobra.Command{
	Use:   "init [preset]",
	Short: "Generate a stasium.yaml manifest",
	Long:  "Available presets: laravel",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		preset := args[0]
		switch preset {
		case "laravel":
			m, err := presets.GenerateLaravel(manifestInitRoot)
			if err != nil {
				return err
			}
			path := manifestInitOutput
			if err := manifest.Save(m, path); err != nil {
				return err
			}
			fmt.Printf("Generated %s with %d items\n", path, len(m.Items))
			for name, item := range m.Items {
				fmt.Printf("  %s (%s)\n", name, item.Kind)
			}
			return nil
		default:
			return fmt.Errorf("unknown preset: %s (available: laravel)", preset)
		}
	},
}

var (
	manifestInitRoot   string
	manifestInitOutput string
)

func init() {
	manifestInitCmd.Flags().StringVar(&manifestInitRoot, "root", ".", "project root directory")
	manifestInitCmd.Flags().StringVar(&manifestInitOutput, "output", "stasium.yaml", "output file path")
	manifestCmd.AddCommand(manifestInitCmd)
	manifestCmd.AddCommand(manifestValidateCmd)
}

var manifestValidateCmd = &cobra.Command{
	Use:   "validate [file]",
	Short: "Validate a stasium.yaml manifest",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		path := "stasium.yaml"
		if len(args) > 0 {
			path = args[0]
		}

		m, err := manifest.Load(path)
		if err != nil {
			return err
		}

		errs := manifest.Validate(m)
		if len(errs) == 0 {
			fmt.Printf("%s: valid (%d items)\n", path, len(m.Items))
			return nil
		}

		fmt.Fprintf(os.Stderr, "%s: %d error(s)\n", path, len(errs))
		for _, e := range errs {
			fmt.Fprintf(os.Stderr, "  • %s\n", e)
		}
		os.Exit(1)
		return nil
	},
}

// --- Restart ---

var restartCmd = &cobra.Command{
	Use:   "restart",
	Short: "Restart items or groups",
}

var restartItemCmd = &cobra.Command{
	Use:   "item <name>",
	Short: "Restart a single item by name",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doItemAction(args[0], "restart")
	},
}

var restartGroupCmd = &cobra.Command{
	Use:   "group <name>",
	Short: "Restart all items in a group",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doGroupAction(args[0], "restart")
	},
}

func init() {
	restartCmd.AddCommand(restartItemCmd)
	restartCmd.AddCommand(restartGroupCmd)
}

// --- Stop ---

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop items or groups",
}

var stopItemCmd = &cobra.Command{
	Use:   "item <name>",
	Short: "Stop a single item by name",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doItemAction(args[0], "stop")
	},
}

var stopGroupCmd = &cobra.Command{
	Use:   "group <name>",
	Short: "Stop all items in a group",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doGroupAction(args[0], "stop")
	},
}

func init() {
	stopCmd.AddCommand(stopItemCmd)
	stopCmd.AddCommand(stopGroupCmd)
}

// --- Start ---

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start items or groups",
}

var startItemCmd = &cobra.Command{
	Use:   "item <name>",
	Short: "Start a single item by name",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doItemAction(args[0], "start")
	},
}

var startGroupCmd = &cobra.Command{
	Use:   "group <name>",
	Short: "Start all items in a group",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		return doGroupAction(args[0], "start")
	},
}

func init() {
	startCmd.AddCommand(startItemCmd)
	startCmd.AddCommand(startGroupCmd)
}

// --- Action helpers ---

func doItemAction(name, action string) error {
	client, err := dialDaemon()
	if err != nil {
		return err
	}
	defer client.Close()

	itemID, err := findItemIDByName(client, name)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = client.Request(ctx, uds.MethodAction, uds.ActionRequest{
		ItemID: itemID,
		Action: action,
	})
	if err != nil {
		return err
	}

	fmt.Printf("%s → %s ✓\n", action, name)
	return nil
}

func doGroupAction(groupName, action string) error {
	client, err := dialDaemon()
	if err != nil {
		return err
	}
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp, err := client.Request(ctx, uds.MethodListItems, nil)
	if err != nil {
		return err
	}

	var items []core.Item
	if err := resp.UnmarshalData(&items); err != nil {
		return err
	}

	var matched []core.Item
	for _, item := range items {
		if item.Group == groupName {
			matched = append(matched, item)
		}
	}

	if len(matched) == 0 {
		return fmt.Errorf("no items in group %q", groupName)
	}

	var errs []string
	for _, item := range matched {
		actCtx, actCancel := context.WithTimeout(context.Background(), 10*time.Second)
		_, err := client.Request(actCtx, uds.MethodAction, uds.ActionRequest{
			ItemID: item.ID,
			Action: action,
		})
		actCancel()
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", item.Name, err))
		} else {
			fmt.Printf("%s → %s ✓\n", action, item.Name)
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errors:\n  %s", strings.Join(errs, "\n  "))
	}
	return nil
}

func findItemIDByName(client *uds.Client, name string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp, err := client.Request(ctx, uds.MethodListItems, nil)
	if err != nil {
		return "", err
	}

	var items []core.Item
	if err := resp.UnmarshalData(&items); err != nil {
		return "", err
	}

	for _, item := range items {
		if item.Name == name {
			return item.ID, nil
		}
	}
	return "", fmt.Errorf("item not found: %s", name)
}
