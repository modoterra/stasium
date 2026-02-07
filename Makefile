BINARY_CLIENT = stasium
BINARY_DAEMON = stasiumd
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  = -ldflags "-X github.com/modoterra/stasium/internal/buildinfo.Version=$(VERSION) \
                      -X github.com/modoterra/stasium/internal/buildinfo.Commit=$(COMMIT) \
                      -X github.com/modoterra/stasium/internal/buildinfo.Date=$(DATE)"

.PHONY: build test lint clean install setup

build:
	go build $(LDFLAGS) -o bin/$(BINARY_CLIENT) ./cmd/stasium
	go build $(LDFLAGS) -o bin/$(BINARY_DAEMON) ./cmd/stasiumd

test:
	go test ./... -timeout 30s

lint:
	go vet ./...

clean:
	rm -rf bin/

install: build
	cp bin/$(BINARY_CLIENT) $(GOPATH)/bin/ 2>/dev/null || cp bin/$(BINARY_CLIENT) ~/go/bin/
	cp bin/$(BINARY_DAEMON) $(GOPATH)/bin/ 2>/dev/null || cp bin/$(BINARY_DAEMON) ~/go/bin/

setup:
	git config core.hooksPath .githooks
	@echo "Git hooks configured (.githooks/)"
