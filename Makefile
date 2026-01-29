.PHONY: install dev-web dev-server dev test build clean

install:
	pnpm install

dev-web:
	pnpm --filter web dev

dev-server:
	pnpm --filter server dev

dev-infra:
	docker compose -f docker-compose.dev.yml up -d

dev-infra-down:
	docker compose -f docker-compose.dev.yml down

dev: dev-infra
	pnpm --filter server dev & pnpm --filter web dev

test:
	pnpm -r test

build:
	pnpm -r build

docker-build:
	docker compose build --build-arg VITE_SERVER_URL=$(shell grep VITE_SERVER_URL .env | cut -d '=' -f2)

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

deploy: docker-build docker-up

help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make dev           - Run both apps in dev mode"
	@echo "  make test          - Run all tests"
	@echo "  make build         - Build all apps"
	@echo "  make docker-build  - Build docker images"
	@echo "  make docker-up     - Start docker containers"
	@echo "  make docker-down   - Stop docker containers"
	@echo "  make clean         - Remove node_modules and dist folders"

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist
