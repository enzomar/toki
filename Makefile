SHELL := /bin/sh

HOST ?= 0.0.0.0
PORT ?= 5173
PREVIEW_PORT ?= 4173
MESSAGE ?= chore: update toki
GIT_BRANCH ?= $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null)

.PHONY: help install dev run build test preview push deploy-pages deploy-prod docker-build docker-run docker-push

help:
	@printf "\n  Toki — Token Cost Calculator\n\n"
	@printf "  Development:\n"
	@printf "    make install         Install dependencies\n"
	@printf "    make dev             Start dev server (http://$(HOST):$(PORT))\n"
	@printf "    make run             Alias for 'make dev'\n"
	@printf "    make build           Production build\n"
	@printf "    make test            Run unit tests\n"
	@printf "    make preview         Preview production build (http://$(HOST):$(PREVIEW_PORT))\n"
	@printf "\n  Deploy:\n"
	@printf "    make deploy-pages    Build and push to gh-pages branch (GitHub Pages)\n"
	@printf "    make deploy-prod     Deploy to Vercel (production)\n"
	@printf "    make docker-build    Build Forge Docker image\n"
	@printf "    make docker-run      Run Docker image locally (:8080)\n"
	@printf "    make docker-push     Push image to Forge Artifactory\n"
	@printf "\n  Git:\n"
	@printf "    make push            Bump version, commit, push\n"
	@printf "\n"

# --- Development ---

install:
	npm install

dev:
	@test -d node_modules || npm install
	npm run dev -- --host $(HOST) --port $(PORT)

run: dev

build:
	npm run build

test:
	npm test

preview: build
	npm run preview -- --host $(HOST) --port $(PREVIEW_PORT)

# --- Git ---

push:
	@test -d .git || (echo "No git repo. Run 'git init' first."; exit 1)
	@git remote get-url origin >/dev/null 2>&1 || (echo "Remote 'origin' missing."; exit 1)
	@test -n "$(GIT_BRANCH)" || (echo "Cannot detect branch."; exit 1)
	npm version minor --no-git-tag-version
	git add -A
	@if ! git diff --cached --quiet; then git commit -m "$(MESSAGE)"; else echo "Nothing to commit."; fi
	git push origin $(GIT_BRANCH)

# --- GitHub Pages (no Actions needed) ---

deploy-pages:
	GITHUB_PAGES=true npm run build
	@test -d dist || (echo "Build failed."; exit 1)
	@echo "Deploying to gh-pages branch..."
	@git stash --include-untracked -q 2>/dev/null || true
	@git branch -D gh-pages 2>/dev/null || true
	git checkout --orphan gh-pages
	git rm -rf . > /dev/null 2>&1 || true
	cp -r dist/* .
	cp dist/index.html 404.html
	git add -A
	git commit -m "deploy: github pages"
	git push origin gh-pages --force
	git checkout $(GIT_BRANCH)
	@git stash pop -q 2>/dev/null || true
	@echo ""
	@echo "✓ Deployed. Set Pages source to 'gh-pages' branch (root) in repo Settings → Pages."

# --- Vercel ---

deploy-prod: build
	npx vercel --prod

# --- Forge (Docker) ---

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
