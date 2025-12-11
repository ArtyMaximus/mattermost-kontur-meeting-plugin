.PHONY: all build dist clean

PLUGIN_ID := com.skyeng.kontur-meeting
PLUGIN_VERSION := 1.0.0

# Build settings
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

all: build

## Build the plugin
build: server webapp

## Build server component
server:
	@echo "Building server for $(GOOS)/$(GOARCH)..."
	cd server && \
	go mod download && \
	go build -o dist/plugin-$(GOOS)-$(GOARCH) plugin.go

## Build webapp component
webapp:
	@echo "Building webapp..."
	cd webapp && \
	npm install && \
	npm run build

## Build for all platforms
dist: clean
	@echo "Building for all platforms..."
	@$(MAKE) build GOOS=linux GOARCH=amd64
	@$(MAKE) build GOOS=darwin GOARCH=amd64
	@$(MAKE) build GOOS=darwin GOARCH=arm64
	@$(MAKE) build GOOS=windows GOARCH=amd64
	@echo "Building webapp..."
	cd webapp && npm install && npm run build
	@echo "Creating tar.gz package..."
	@tar -czf kontur-meeting.tar.gz plugin.json server/dist/ webapp/dist/ assets/
	@echo "Package created: kontur-meeting.tar.gz"

## Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf server/dist/
	@rm -rf webapp/dist/
	@rm -f kontur-meeting.tar.gz



