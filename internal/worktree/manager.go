package worktree

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Worktree struct {
	Name   string
	Path   string
	Branch string
}

type Manager struct {
	repoPath string
}

func NewManager(repoPath string) *Manager {
	return &Manager{repoPath: repoPath}
}

func (m *Manager) Create(ctx context.Context, name string, fromBranch string) (*Worktree, error) {
	branchName := fmt.Sprintf("sfk/%s", name)
	worktreePath := filepath.Join(filepath.Dir(m.repoPath), fmt.Sprintf("%s-%s", filepath.Base(m.repoPath), name))

	args := []string{"worktree", "add", "-b", branchName, worktreePath, fromBranch}
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = m.repoPath

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to create worktree: %w, output: %s", err, string(output))
	}

	return &Worktree{
		Name:   name,
		Path:   worktreePath,
		Branch: branchName,
	}, nil
}

func (m *Manager) List(ctx context.Context) ([]*Worktree, error) {
	cmd := exec.CommandContext(ctx, "git", "worktree", "list", "--porcelain")
	cmd.Dir = m.repoPath

	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list worktrees: %w", err)
	}

	return parseWorktreeList(string(output)), nil
}

func (m *Manager) Delete(ctx context.Context, name string) error {
	worktrees, err := m.List(ctx)
	if err != nil {
		return err
	}

	var target *Worktree
	for _, wt := range worktrees {
		if wt.Name == name {
			target = wt
			break
		}
	}

	if target == nil {
		return fmt.Errorf("worktree not found: %s", name)
	}

	cmd := exec.CommandContext(ctx, "git", "worktree", "remove", target.Path)
	cmd.Dir = m.repoPath

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to remove worktree: %w, output: %s", err, string(output))
	}

	deleteCmd := exec.CommandContext(ctx, "git", "branch", "-D", target.Branch)
	deleteCmd.Dir = m.repoPath
	deleteCmd.Run()

	return nil
}

func (m *Manager) GetPath(name string) string {
	return filepath.Join(filepath.Dir(m.repoPath), fmt.Sprintf("%s-%s", filepath.Base(m.repoPath), name))
}

func (m *Manager) Exists(ctx context.Context, name string) (bool, error) {
	worktrees, err := m.List(ctx)
	if err != nil {
		return false, err
	}

	for _, wt := range worktrees {
		if wt.Name == name {
			return true, nil
		}
	}

	return false, nil
}

func parseWorktreeList(output string) []*Worktree {
	var worktrees []*Worktree
	var current *Worktree

	lines := strings.Split(output, "\n")

	for _, line := range lines {
		if strings.HasPrefix(line, "worktree ") {
			if current != nil {
				worktrees = append(worktrees, current)
			}
			path := strings.TrimPrefix(line, "worktree ")
			name := extractWorktreeName(path)
			current = &Worktree{
				Path: path,
				Name: name,
			}
		} else if strings.HasPrefix(line, "branch ") {
			if current != nil {
				current.Branch = strings.TrimPrefix(line, "branch ")
			}
		}
	}

	if current != nil {
		worktrees = append(worktrees, current)
	}

	return worktrees
}

func extractWorktreeName(path string) string {
	base := filepath.Base(path)
	if strings.Contains(base, "-") {
		parts := strings.SplitN(base, "-", 2)
		if len(parts) > 1 {
			return parts[1]
		}
	}
	return base
}

func IsGitRepo(path string) bool {
	gitDir := filepath.Join(path, ".git")
	info, err := os.Stat(gitDir)
	return err == nil && info.IsDir()
}
