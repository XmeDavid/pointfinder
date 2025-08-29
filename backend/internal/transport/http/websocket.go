package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WebSocket message types
const (
	MessageTypeTeamLocation  = "team_location"
	MessageTypeTeamProgress  = "team_progress"
	MessageTypeBaseArrival   = "base_arrival"
	MessageTypeBaseComplete  = "base_complete"
	MessageTypeEnigmaSolved  = "enigma_solved"
	MessageTypeGameEvent     = "game_event"
	MessageTypeError         = "error"
	MessageTypeHeartbeat     = "heartbeat"
)

// WebSocket message structure
type WSMessage struct {
	Type      string      `json:"type"`
	GameID    string      `json:"gameId,omitempty"`
	TeamID    string      `json:"teamId,omitempty"`
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
}

// Client represents a WebSocket connection
type WSClient struct {
	ID         string
	GameID     string
	OperatorID string
	Conn       *websocket.Conn
	Send       chan WSMessage
	Hub        *WSHub
}

// WSHub manages WebSocket connections
type WSHub struct {
	// Game ID -> Client ID -> Client
	gameClients map[string]map[string]*WSClient
	// All clients by ID  
	clients map[string]*WSClient
	
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan WSMessage
	
	mu sync.RWMutex
}

// Global WebSocket hub
var wsHub *WSHub

// Initialize WebSocket hub
func initWebSocketHub() *WSHub {
	if wsHub == nil {
		wsHub = &WSHub{
			gameClients: make(map[string]map[string]*WSClient),
			clients:     make(map[string]*WSClient),
			register:    make(chan *WSClient),
			unregister:  make(chan *WSClient),
			broadcast:   make(chan WSMessage, 256),
		}
		go wsHub.run()
	}
	return wsHub
}

// Run the WebSocket hub
func (h *WSHub) run() {
	ticker := time.NewTicker(30 * time.Second) // Heartbeat every 30 seconds
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			
			if h.gameClients[client.GameID] == nil {
				h.gameClients[client.GameID] = make(map[string]*WSClient)
			}
			h.gameClients[client.GameID][client.ID] = client
			h.mu.Unlock()
			
			log.Printf("WebSocket client %s registered for game %s", client.ID, client.GameID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				if gameClients, exists := h.gameClients[client.GameID]; exists {
					delete(gameClients, client.ID)
					if len(gameClients) == 0 {
						delete(h.gameClients, client.GameID)
					}
				}
				close(client.Send)
			}
			h.mu.Unlock()
			
			log.Printf("WebSocket client %s unregistered from game %s", client.ID, client.GameID)

		case message := <-h.broadcast:
			h.mu.RLock()
			var targetClients map[string]*WSClient
			if message.GameID != "" {
				targetClients = h.gameClients[message.GameID]
			} else {
				targetClients = h.clients
			}
			
			for _, client := range targetClients {
				select {
				case client.Send <- message:
				default:
					// Client's send channel is full, close it
					close(client.Send)
					delete(h.clients, client.ID)
					if gameClients, exists := h.gameClients[client.GameID]; exists {
						delete(gameClients, client.ID)
					}
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			// Send heartbeat to all clients
			heartbeat := WSMessage{
				Type:      MessageTypeHeartbeat,
				Timestamp: time.Now(),
			}
			
			h.mu.RLock()
			for _, client := range h.clients {
				select {
				case client.Send <- heartbeat:
				default:
					// Remove unresponsive clients
					close(client.Send)
					delete(h.clients, client.ID)
					if gameClients, exists := h.gameClients[client.GameID]; exists {
						delete(gameClients, client.ID)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToGame sends a message to all clients monitoring a specific game
func (h *WSHub) BroadcastToGame(gameID string, message WSMessage) {
	message.GameID = gameID
	message.Timestamp = time.Now()
	select {
	case h.broadcast <- message:
	default:
		log.Printf("WebSocket broadcast channel is full, dropping message")
	}
}

// BroadcastToAll sends a message to all connected clients
func (h *WSHub) BroadcastToAll(message WSMessage) {
	message.Timestamp = time.Now()
	select {
	case h.broadcast <- message:
	default:
		log.Printf("WebSocket broadcast channel is full, dropping message")
	}
}

// Handle WebSocket client connection
func (c *WSClient) handleConnection() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	// Set up ping/pong handlers
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start goroutine to handle outgoing messages
	go c.writePump()

	// Handle incoming messages (mainly pong responses)
	for {
		messageType, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
		
		// Handle ping/pong
		if messageType == websocket.PongMessage {
			c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		}
	}
}

// Write pump sends messages to the WebSocket connection
func (c *WSClient) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteJSON(message); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func RegisterWebSocket(app *fiber.App, pool *pgxpool.Pool, cfg *config.Config) {
	// Initialize WebSocket hub
	hub := initWebSocketHub()

	// WebSocket upgrade handler
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// WebSocket endpoint for real-time monitoring (operators only)
	app.Get("/ws/monitor/:gameId", websocket.New(func(c *websocket.Conn) {
		// Extract game ID from URL
		gameID := c.Params("gameId")
		
		// Validate game ID format
		if !middleware.ValidateUUID(gameID) {
			c.WriteJSON(WSMessage{
				Type: MessageTypeError,
				Data: fiber.Map{
					"error":   "invalid_game_id",
					"message": "Game ID format is invalid",
				},
				Timestamp: time.Now(),
			})
			c.Close()
			return
		}

		// Get operator ID from query parameter (in a real app, this would come from JWT)
		operatorID := c.Query("operatorId")
		if operatorID == "" {
			c.WriteJSON(WSMessage{
				Type: MessageTypeError,
				Data: fiber.Map{
					"error":   "missing_operator_id",
					"message": "Operator ID is required",
				},
				Timestamp: time.Now(),
			})
			c.Close()
			return
		}

		// Verify operator has access to this game
		var hasAccess bool
		err := pool.QueryRow(context.Background(), `
			select exists(
				select 1 from operator_games 
				where operator_id = $1 and game_id = $2
			)`, operatorID, gameID).Scan(&hasAccess)
		if err != nil || !hasAccess {
			c.WriteJSON(WSMessage{
				Type: MessageTypeError,
				Data: fiber.Map{
					"error":   "game_access_denied",
					"message": "You don't have access to this game",
				},
				Timestamp: time.Now(),
			})
			c.Close()
			return
		}

		// Create new client
		clientID := operatorID + "-" + gameID + "-" + time.Now().Format("20060102150405")
		client := &WSClient{
			ID:         clientID,
			GameID:     gameID,
			OperatorID: operatorID,
			Conn:       c,
			Send:       make(chan WSMessage, 256),
			Hub:        hub,
		}

		// Register client
		hub.register <- client

		// Send initial game state
		go func() {
			// Get current team locations
			rows, err := pool.Query(context.Background(), `
				select t.id::text, t.name, tl.latitude, tl.longitude, tl.created_at
				from teams t
				join team_locations tl on t.id = tl.team_id
				where t.game_id = $1 
				and tl.created_at = (
					select max(created_at) 
					from team_locations 
					where team_id = t.id
				)`, gameID)
			if err == nil {
				defer rows.Close()
				
				var locations []fiber.Map
				for rows.Next() {
					var teamID, teamName string
					var lat, lng float64
					var timestamp time.Time
					if rows.Scan(&teamID, &teamName, &lat, &lng, &timestamp) == nil {
						locations = append(locations, fiber.Map{
							"teamId":    teamID,
							"teamName":  teamName,
							"latitude":  lat,
							"longitude": lng,
							"timestamp": timestamp,
						})
					}
				}

				if len(locations) > 0 {
					client.Send <- WSMessage{
						Type:   MessageTypeTeamLocation,
						GameID: gameID,
						Data: fiber.Map{
							"locations": locations,
							"initial":   true,
						},
						Timestamp: time.Now(),
					}
				}
			}
		}()

		// Handle the connection
		client.handleConnection()
	}))

	// Helper function to broadcast team events (called from other endpoints)
	app.Use(func(c *fiber.Ctx) error {
		// Add WebSocket hub to context for other handlers to use
		c.Locals("wsHub", hub)
		return c.Next()
	})
}

// Helper functions for broadcasting events from other endpoints

// BroadcastTeamLocation broadcasts team location updates
func BroadcastTeamLocation(hub *WSHub, gameID, teamID string, latitude, longitude float64) {
	if hub != nil {
		hub.BroadcastToGame(gameID, WSMessage{
			Type:   MessageTypeTeamLocation,
			TeamID: teamID,
			Data: fiber.Map{
				"teamId":    teamID,
				"latitude":  latitude,
				"longitude": longitude,
			},
		})
	}
}

// BroadcastBaseArrival broadcasts when team arrives at base
func BroadcastBaseArrival(hub *WSHub, gameID, teamID, baseID, baseName string) {
	if hub != nil {
		hub.BroadcastToGame(gameID, WSMessage{
			Type:   MessageTypeBaseArrival,
			TeamID: teamID,
			Data: fiber.Map{
				"teamId":   teamID,
				"baseId":   baseID,
				"baseName": baseName,
				"action":   "arrived",
			},
		})
	}
}

// BroadcastBaseComplete broadcasts when team completes base
func BroadcastBaseComplete(hub *WSHub, gameID, teamID, baseID, baseName string, score int) {
	if hub != nil {
		hub.BroadcastToGame(gameID, WSMessage{
			Type:   MessageTypeBaseComplete,
			TeamID: teamID,
			Data: fiber.Map{
				"teamId":   teamID,
				"baseId":   baseID,
				"baseName": baseName,
				"score":    score,
				"action":   "completed",
			},
		})
	}
}

// BroadcastEnigmaSolved broadcasts when team solves enigma
func BroadcastEnigmaSolved(hub *WSHub, gameID, teamID, baseID, enigmaID string) {
	if hub != nil {
		hub.BroadcastToGame(gameID, WSMessage{
			Type:   MessageTypeEnigmaSolved,
			TeamID: teamID,
			Data: fiber.Map{
				"teamId":   teamID,
				"baseId":   baseID,
				"enigmaId": enigmaID,
				"action":   "solved",
			},
		})
	}
}