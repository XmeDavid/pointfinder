#!/bin/bash
# Backend restart script

echo "Stopping backend server..."
pkill -f "./server"

echo "Rebuilding backend..."
go build -o server ./cmd/server

echo "Starting backend server..."
./server > server.log 2>&1 &

echo "Backend restarted successfully!"
echo "New PID: $(pgrep -f "./server")"
echo "Check logs: tail -f server.log"