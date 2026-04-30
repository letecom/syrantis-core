.PHONY: install typecheck lint build format format-check

install:
	pnpm install

typecheck:
	pnpm typecheck

lint:
	pnpm lint

build:
	pnpm build

format:
	pnpm format

format-check:
	pnpm format:check
