package ui

import (
	"fmt"
	"io"
	"log/slog"
	"os"
)

var logger *slog.Logger
var verbose bool

func InitLogger(v bool) {
	verbose = v
	level := slog.LevelWarn
	if v {
		level = slog.LevelDebug
	}

	opts := &slog.HandlerOptions{
		Level: level,
	}

	handler := slog.NewTextHandler(os.Stderr, opts)
	logger = slog.New(handler)
	slog.SetDefault(logger)
}

func Debug(format string, args ...any) {
	if verbose && logger != nil {
		logger.Debug(fmt.Sprintf(format, args...))
	}
}

func Info(format string, args ...any) {
	if logger != nil {
		logger.Info(fmt.Sprintf(format, args...))
	}
	fmt.Printf(format+"\n", args...)
}

func Warn(format string, args ...any) {
	if logger != nil {
		logger.Warn(fmt.Sprintf(format, args...))
	}
	fmt.Printf("\033[33mWarning: "+format+"\033[0m\n", args...)
}

func Error(format string, args ...any) {
	if logger != nil {
		logger.Error(fmt.Sprintf(format, args...))
	}
	fmt.Fprintf(os.Stderr, "\033[31mError: "+format+"\033[0m\n", args...)
}

func Success(format string, args ...any) {
	if logger != nil {
		logger.Info(fmt.Sprintf(format, args...))
	}
	fmt.Printf("\033[32m"+format+"\033[0m\n", args...)
}

func Spinner(message string) func() {
	fmt.Printf("\033[36m⠋ %s\033[0m", message)
	return func() {
		fmt.Printf("\r\033[K")
	}
}

func Section(title string) {
	fmt.Printf("\n\033[1m\033[36m══ %s ══\033[0m\n", title)
}

func Divider() {
	fmt.Println("───────────────────────────────────────────────────────────────")
}

func SetOutput(w io.Writer) {
	if logger != nil {
		opts := &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}
		handler := slog.NewTextHandler(w, opts)
		logger = slog.New(handler)
	}
}
