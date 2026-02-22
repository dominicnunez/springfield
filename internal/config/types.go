package config

type Config struct {
	Paths    Paths    `toml:"paths"`
	Defaults Defaults `toml:"defaults"`
	Skinner  Skinner  `toml:"skinner"`
	Models   Models   `toml:"models"`
}

type Paths struct {
	Audit  string `toml:"audit"`
	Memory string `toml:"memory"`
}

type Defaults struct {
	Engine string `toml:"engine"`
}

type Skinner struct {
	MaxRalphKickbacks int `toml:"maxRalphKickbacks"`
}

type Models struct {
	Lisa    string `toml:"lisa"`
	Frank   string `toml:"frank"`
	Ralph   string `toml:"ralph"`
	Skinner string `toml:"skinner"`
	Martin  string `toml:"martin"`
}

func Default() *Config {
	return &Config{
		Paths: Paths{
			Audit:  ".sfk/audit",
			Memory: ".sfk/memory",
		},
		Defaults: Defaults{
			Engine: "opencode",
		},
		Skinner: Skinner{
			MaxRalphKickbacks: 3,
		},
		Models: Models{
			Lisa:    "opus",
			Frank:   "sonnet",
			Ralph:   "sonnet",
			Skinner: "haiku",
			Martin:  "opus",
		},
	}
}
