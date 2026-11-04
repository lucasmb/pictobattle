.PHONY: install dev-web dev-server dev test build clean bump-patch bump-minor bump-major

install:
	pnpm install

dev-web:
	pnpm --filter web dev

dev-server:
	pnpm --filter server dev

dev-infra:
	docker compose -f infra/docker-compose.dev.yml up -d

dev-infra-down:
	docker compose -f infra/docker-compose.dev.yml down

dev: dev-infra
	pnpm --filter server dev & pnpm --filter web dev

test:
	pnpm -r test

build:
	pnpm -r build

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

deploy: docker-build docker-up

# Bump the app version (root package.json). Merging to main tags and releases v<version>.
bump-patch bump-minor bump-major:
	@npm version $(subst bump-,,$@) --no-git-tag-version >/dev/null
	@echo "Version is now $$(node -p "require('./package.json').version") - commit it in your PR to main"

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make dev           - Run both apps in dev mode"
	@echo "  make test          - Run all tests"
	@echo "  make build         - Build all apps"
	@echo "  make docker-build  - Build the docker image"
	@echo "  make docker-up     - Start docker containers"
	@echo "  make docker-down   - Stop docker containers"
	@echo "  make clean         - Remove node_modules and dist folders"
	@echo "  make bump-patch    - Bump version (also bump-minor, bump-major)"

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist
