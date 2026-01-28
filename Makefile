.PHONY: install dev-web dev-server dev test build clean

install:
	pnpm install

dev-web:
	pnpm --filter web dev

dev-server:
	pnpm --filter server dev

dev:
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

deploy: docker-build docker-up

clean:
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist
