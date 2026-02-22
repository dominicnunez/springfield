package main

import (
	"context"
	"fmt"
	"os"

	"github.com/dominicnunez/springfield/internal/config"
	"github.com/dominicnunez/springfield/internal/ui"
	"github.com/urfave/cli/v3"
)

var version = "dev"

func main() {
	cmd := &cli.Command{
		Name:    "sfk",
		Usage:   "Springfield Kit - Parallel Autonomous AI Coding Toolkit",
		Version: version,
		Commands: []*cli.Command{
			{
				Name:    "lisa",
				Usage:   "Run Lisa (Planner) - Creates PRD, asks questions if needed",
				Action:  runLisa,
				Flags: []cli.Flag{
					&cli.BoolFlag{
						Name:    "interactive",
						Aliases: []string{"i"},
						Usage:   "Force interactive mode",
					},
					&cli.BoolFlag{
						Name:    "exit",
						Aliases: []string{"x"},
						Usage:   "Exit after current phase (no loop)",
					},
					&cli.IntFlag{
						Name:    "loops",
						Usage:   "Number of loops to run (0 = infinite)",
						Value:   0,
					},
					&cli.BoolFlag{
						Name:    "full-audit",
						Aliases: []string{"fa"},
						Usage:   "Full codebase audit every loop",
					},
				},
			},
			{
				Name:    "frank",
				Usage:   "Run Frank (Architect) - Designs solution, produces technical spec",
				Action:  runFrank,
				Flags: []cli.Flag{
					&cli.BoolFlag{
						Name:    "exit",
						Aliases: []string{"x"},
						Usage:   "Exit after current phase (no loop)",
					},
					&cli.IntFlag{
						Name:    "loops",
						Usage:   "Number of loops to run (0 = infinite)",
						Value:   0,
					},
					&cli.BoolFlag{
						Name:    "full-audit",
						Aliases: []string{"fa"},
						Usage:   "Full codebase audit every loop",
					},
				},
			},
			{
				Name:    "ralph",
				Usage:   "Run Ralph (Builder) - Implements code from spec",
				Action:  runRalph,
				Flags: []cli.Flag{
					&cli.BoolFlag{
						Name:    "exit",
						Aliases: []string{"x"},
						Usage:   "Exit after current phase (no loop)",
					},
					&cli.IntFlag{
						Name:    "loops",
						Usage:   "Number of loops to run (0 = infinite)",
						Value:   0,
					},
					&cli.BoolFlag{
						Name:    "full-audit",
						Aliases: []string{"fa"},
						Usage:   "Full codebase audit every loop",
					},
				},
			},
			{
				Name:    "skinner",
				Usage:   "Run Skinner (Verifier) - Lint + Verify + AC Check",
				Action:  runSkinner,
				Flags: []cli.Flag{
					&cli.BoolFlag{
						Name:    "interactive",
						Aliases: []string{"i"},
						Usage:   "Force interactive mode",
					},
					&cli.BoolFlag{
						Name:    "exit",
						Aliases: []string{"x"},
						Usage:   "Exit after current phase (no loop)",
					},
					&cli.IntFlag{
						Name:    "loops",
						Usage:   "Number of loops to run (0 = infinite)",
						Value:   0,
					},
					&cli.BoolFlag{
						Name:    "full-audit",
						Aliases: []string{"fa"},
						Usage:   "Full codebase audit every loop",
					},
				},
			},
			{
				Name:    "martin",
				Usage:   "Run Martin (Auditor) - Finds bugs, passes back to lisa",
				Action:  runMartin,
				Flags: []cli.Flag{
					&cli.BoolFlag{
						Name:    "interactive",
						Aliases: []string{"i"},
						Usage:   "Force interactive mode",
					},
					&cli.BoolFlag{
						Name:    "exit",
						Aliases: []string{"x"},
						Usage:   "Exit after current phase (no loop)",
					},
					&cli.IntFlag{
						Name:    "loops",
						Usage:   "Number of loops to run (0 = infinite)",
						Value:   0,
					},
					&cli.BoolFlag{
						Name:    "full-audit",
						Aliases: []string{"fa"},
						Usage:   "Full codebase audit every loop",
					},
				},
			},
			{
				Name:    "bart",
				Usage:   "Initial project setup with AI-assisted preference collection",
				Action:  runBart,
			},
			{
				Name:    "worktree",
				Usage:   "Manage git worktrees",
				Commands: []*cli.Command{
					{
						Name:   "list",
						Usage:  "List all worktrees",
						Action: listWorktrees,
					},
					{
						Name:   "create",
						Usage:  "Create a new worktree",
						Action: createWorktree,
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "name",
								Usage:    "Worktree name",
								Required: true,
							},
							&cli.StringFlag{
								Name:    "branch",
								Usage:   "Branch to base worktree on",
								Value:   "main",
							},
						},
					},
					{
						Name:   "delete",
						Usage:  "Delete a worktree",
						Action: deleteWorktree,
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:     "name",
								Usage:    "Worktree name",
								Required: true,
							},
						},
					},
				},
			},
		},
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:    "config",
				Aliases: []string{"c"},
				Usage:   "Path to config file",
				Value:   "",
			},
			&cli.StringFlag{
				Name:    "engine",
				Aliases: []string{"e"},
				Usage:   "Engine to use (opencode, codex)",
				Value:   "",
			},
			&cli.BoolFlag{
				Name:    "verbose",
				Aliases: []string{"v"},
				Usage:   "Enable verbose output",
				Value:   false,
			},
		},
		Before: loadConfig,
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func loadConfig(ctx context.Context, cmd *cli.Command) (context.Context, error) {
	configPath := cmd.String("config")
	verbose := cmd.Bool("verbose")

	cfg, err := config.Load(configPath)
	if err != nil {
		return ctx, fmt.Errorf("failed to load config: %w", err)
	}

	if engine := cmd.String("engine"); engine != "" {
		cfg.Defaults.Engine = engine
	}

	ui.InitLogger(verbose)

	return context.WithValue(ctx, "config", cfg), nil
}

func runLisa(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Lisa (Planner)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: lisa agent")
}

func runFrank(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Frank (Architect)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: frank agent")
}

func runRalph(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Ralph (Builder)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: ralph agent")
}

func runSkinner(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Skinner (Verifier)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: skinner agent")
}

func runMartin(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Martin (Auditor)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: martin agent")
}

func runBart(ctx context.Context, cmd *cli.Command) error {
	cfg := ctx.Value("config").(*config.Config)
	ui.Info("Running Bart (Setup)")
	ui.Debug("Config: %+v", cfg)
	return fmt.Errorf("not implemented: bart setup")
}

func listWorktrees(ctx context.Context, cmd *cli.Command) error {
	ui.Info("Listing worktrees")
	return fmt.Errorf("not implemented: worktree list")
}

func createWorktree(ctx context.Context, cmd *cli.Command) error {
	name := cmd.String("name")
	branch := cmd.String("branch")
	ui.Info("Creating worktree: %s from branch: %s", name, branch)
	return fmt.Errorf("not implemented: worktree create")
}

func deleteWorktree(ctx context.Context, cmd *cli.Command) error {
	name := cmd.String("name")
	ui.Info("Deleting worktree: %s", name)
	return fmt.Errorf("not implemented: worktree delete")
}
