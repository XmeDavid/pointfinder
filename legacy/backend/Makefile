SHELL := /bin/bash

.PHONY: tidy build run dev

tidy:
	go mod tidy

build:
	go build -o server ./cmd/server

run:
	go run ./cmd/server

dev:
	nodemon --exec 'go run ./cmd/server' --ext go,sql --signal SIGTERM || go run ./cmd/server
