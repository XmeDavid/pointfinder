import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from './authStore';

export interface WSMessage {
  type: string;
  gameId?: string;
  teamId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface UseWebSocketOptions {
  gameId: string;
  operatorId?: string;
  onMessage?: (message: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  sendMessage: (message: Record<string, unknown>) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket({
  gameId,
  operatorId,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
  autoReconnect = true,
  maxReconnectAttempts = 5,
  reconnectInterval = 3000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnect = useRef(true);
  
  const { user } = useAuthStore();

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'localhost:3001';
    const host = baseUrl.replace(/^https?:\/\//, '');
    const actualOperatorId = operatorId || user?.id || '';
    return `${protocol}//${host}/ws/monitor/${gameId}?operatorId=${actualOperatorId}`;
  }, [gameId, operatorId, user?.id]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      const websocket = new WebSocket(getWebSocketUrl());
      
      websocket.onopen = () => {
        console.log('WebSocket connected to game:', gameId);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;
        onConnect?.();
      };
      
      websocket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        ws.current = null;
        onDisconnect?.();
        
        // Auto-reconnect if enabled and should reconnect
        if (shouldReconnect.current && autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`Reconnecting WebSocket... (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setError(`Failed to reconnect after ${maxReconnectAttempts} attempts`);
        }
      };
      
      websocket.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setIsConnecting(false);
        onError?.(event);
      };
      
      websocket.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          onMessage?.(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      ws.current = websocket;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setError('Failed to create WebSocket connection');
      setIsConnecting(false);
    }
  }, [getWebSocketUrl, gameId, onConnect, onDisconnect, onError, onMessage, autoReconnect, maxReconnectAttempts, reconnectInterval]);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    shouldReconnect.current = true;
    disconnect();
    setTimeout(connect, 100);
  }, [connect, disconnect]);

  // Initialize connection
  useEffect(() => {
    if (gameId && user?.id) {
      shouldReconnect.current = true;
      connect();
    }
    
    return () => {
      shouldReconnect.current = false;
      disconnect();
    };
  }, [gameId, user?.id, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnect.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    sendMessage,
    disconnect,
    reconnect,
  };
}