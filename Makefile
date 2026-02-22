.PHONY: build build-all test lint clean install

VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BINARY := sfk
GO := go
GOFLAGS := -ldflags "-s -w -X main.version=$(VERSION)"

build:
	$(GO) build $(GOFLAGS) -o dist/$(BINARY) ./cmd/sfk

build-linux:
	GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-linux-amd64 ./cmd/sfk
	GOOS=linux GOARCH=arm64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-linux-arm64 ./cmd/sfk

build-darwin:
	GOOS=darwin GOARCH=amd64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-darwin-amd64 ./cmd/sfk
	GOOS=darwin GOARCH=arm64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-darwin-arm64 ./cmd/sfk

build-windows:
	GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-windows-amd64.exe ./cmd/sfk
	GOOS=windows GOARCH=arm64 $(GO) build $(GOFLAGS) -o dist/$(BINARY)-windows-arm64.exe ./cmd/sfk

build-all: build-linux build-darwin build-windows

test:
	$(GO) test -v -race ./...

test-coverage:
	$(GO) test -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html

lint:
	$(GO) vet ./...

fmt:
	$(GO) fmt ./...

tidy:
	$(GO) mod tidy

clean:
	rm -rf dist/
	rm -f coverage.out coverage.html

install: build
	$(GO) install ./cmd/sfk

run:
	$(GO) run ./cmd/sfk $(ARGS)

dev:
	$(GO) run ./cmd/sfk --verbose $(ARGS)
