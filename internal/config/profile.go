package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Profile struct {
	Frameworks Frameworks `toml:"frameworks"`
	Data       Data       `toml:"data"`
	Auth       Auth       `toml:"auth"`
	Other      Other      `toml:"other"`
}

type Frameworks struct {
	Frontend string `toml:"frontend"`
	Styling  string `toml:"styling"`
	Backend  string `toml:"backend"`
}

type Data struct {
	Database string `toml:"database"`
}

type Auth struct {
	Provider string `toml:"provider"`
}

type Other struct {
	Testing string `toml:"testing"`
	Linting string `toml:"linting"`
}

func DefaultProfile() *Profile {
	return &Profile{
		Frameworks: Frameworks{
			Frontend: "",
			Styling:  "",
			Backend:  "",
		},
		Data: Data{
			Database: "",
		},
		Auth: Auth{
			Provider: "",
		},
		Other: Other{
			Testing: "",
			Linting: "",
		},
	}
}

func LoadProfile() (*Profile, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	path := filepath.Join(home, ".sfk", "profile.md")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return DefaultProfile(), nil
		}
		return nil, fmt.Errorf("failed to read profile: %w", err)
	}

	return parseProfileMarkdown(string(data))
}

func parseProfileMarkdown(content string) (*Profile, error) {
	profile := DefaultProfile()

	lines := strings.Split(content, "\n")
	var currentSection string

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "## ") {
			currentSection = strings.ToLower(strings.TrimPrefix(line, "## "))
			continue
		}

		if strings.HasPrefix(line, "- ") {
			parts := strings.SplitN(strings.TrimPrefix(line, "- "), ":", 2)
			if len(parts) != 2 {
				continue
			}

			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])

			switch currentSection {
			case "frameworks":
				switch strings.ToLower(key) {
				case "frontend":
					profile.Frameworks.Frontend = value
				case "styling":
					profile.Frameworks.Styling = value
				case "backend":
					profile.Frameworks.Backend = value
				}
			case "data":
				if strings.ToLower(key) == "database" {
					profile.Data.Database = value
				}
			case "auth":
				if strings.ToLower(key) == "provider" {
					profile.Auth.Provider = value
				}
			case "other":
				switch strings.ToLower(key) {
				case "testing":
					profile.Other.Testing = value
				case "linting":
					profile.Other.Linting = value
				}
			}
		}
	}

	return profile, nil
}

func SaveProfile(profile *Profile) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	path := filepath.Join(home, ".sfk", "profile.md")
	dir := filepath.Dir(path)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create profile directory: %w", err)
	}

	content := generateProfileMarkdown(profile)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write profile: %w", err)
	}

	return nil
}

func generateProfileMarkdown(profile *Profile) string {
	var sb strings.Builder

	sb.WriteString("# User Preferences\n\n")

	sb.WriteString("## Frameworks\n")
	if profile.Frameworks.Frontend != "" {
		sb.WriteString(fmt.Sprintf("- Frontend: %s\n", profile.Frameworks.Frontend))
	}
	if profile.Frameworks.Styling != "" {
		sb.WriteString(fmt.Sprintf("- Styling: %s\n", profile.Frameworks.Styling))
	}
	if profile.Frameworks.Backend != "" {
		sb.WriteString(fmt.Sprintf("- Backend: %s\n", profile.Frameworks.Backend))
	}
	sb.WriteString("\n")

	sb.WriteString("## Data\n")
	if profile.Data.Database != "" {
		sb.WriteString(fmt.Sprintf("- Database: %s\n", profile.Data.Database))
	}
	sb.WriteString("\n")

	sb.WriteString("## Auth\n")
	if profile.Auth.Provider != "" {
		sb.WriteString(fmt.Sprintf("- Provider: %s\n", profile.Auth.Provider))
	}
	sb.WriteString("\n")

	sb.WriteString("## Other\n")
	if profile.Other.Testing != "" {
		sb.WriteString(fmt.Sprintf("- Testing: %s\n", profile.Other.Testing))
	}
	if profile.Other.Linting != "" {
		sb.WriteString(fmt.Sprintf("- Linting: %s\n", profile.Other.Linting))
	}
	sb.WriteString("\n")

	return sb.String()
}
