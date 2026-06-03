SHELL := /bin/sh

HOST ?= 0.0.0.0
PORT ?= 5173
PREVIEW_PORT ?= 4173
MESSAGE ?= chore: update toki
GIT_BRANCH ?= $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null)

.PHONY: help install dev build preview vercel-login vercel-link deploy-preview deploy-prod deploy push push-auto auto-push

help:
	@printf "Targets:\n"
	@printf "  make install         Install dependencies\n"
	@printf "  make dev             Start Vite in local dev mode\n"
	@printf "  make build           Run the production build\n"
	@printf "  make preview         Preview the production build locally\n"
	@printf "  make vercel-login    Log in to Vercel CLI\n"
	@printf "  make vercel-link     Link this folder to a Vercel project\n"
	@printf "  make deploy-preview  Create a Vercel preview deployment\n"
	@printf "  make deploy-prod     Create a Vercel production deployment\n"
	@printf "  make push            Git add/commit/push current branch\n"
	@printf "  make push-auto       Alias for make push with auto-commit\n"

install:
	npm install

dev:
	npm run dev -- --host $(HOST) --port $(PORT)

build:
	npm run build

preview:
	npm run preview -- --host $(HOST) --port $(PREVIEW_PORT)

vercel-login:
	npx vercel login

vercel-link:
	npx vercel link

deploy-preview:
	npx vercel

deploy-prod: build
	npx vercel --prod

deploy: deploy-prod

push:
	@test -d .git || (echo "No git repository initialized in this folder. Run 'git init' and add a remote first."; exit 1)
	@git remote get-url origin >/dev/null 2>&1 || (echo "Remote 'origin' is missing. Add it before using 'make push'."; exit 1)
	@test -n "$(GIT_BRANCH)" || (echo "Could not detect the current git branch."; exit 1)
	npm version minor --no-git-tag-version
	git add -A
	@if ! git diff --cached --quiet; then git commit -m "$(MESSAGE)"; else echo "No staged changes to commit."; fi
	git push origin $(GIT_BRANCH)

push-auto: push

auto-push: push-auto

# --- Forge (Amadeus) deployment ---

FORGE_REGISTRY ?= docker-prod-toki-nce.dockerhub.rnd.amadeus.net
FORGE_IMAGE ?= toki
FORGE_TAG ?= $(shell node -p "require('./package.json').version")

docker-build:
	docker build -t $(FORGE_REGISTRY)/$(FORGE_IMAGE):$(FORGE_TAG) .
	docker tag $(FORGE_REGISTRY)/$(FORGE_IMAGE):$(FORGE_TAG) $(FORGE_REGISTRY)/$(FORGE_IMAGE):latest

docker-run:
	docker run -it --rm -p 8080:8080 $(FORGE_REGISTRY)/$(FORGE_IMAGE):$(FORGE_TAG)

docker-push: docker-build
	docker push $(FORGE_REGISTRY)/$(FORGE_IMAGE):$(FORGE_TAG)
	docker push $(FORGE_REGISTRY)/$(FORGE_IMAGE):latest

# --- GitHub Pages (manual deploy) ---

deploy-pages:
	GITHUB_PAGES=true npm run build
	@echo "dist/ is ready. Push to main to trigger GitHub Actions, or use 'gh-pages' manually."
