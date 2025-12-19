import * as ws from "ws"; import url from 'url';
import http from "http";
import { SocketLink, WsLink } from "./socket-link.ts";
import { SocketConnection, ISocketConnection } from "./socket-connection.ts";
import { ParsedUrlQuery } from "querystring";
import { Message } from "./socket-type.ts";

export interface IWebsocketServer extends ws.WebSocketServer {
    toClients(...clientId: Array<string>): WsLink;
    toRooms(...room_ids: string[]): WsLink;
    isExistRoom(room_id: string): boolean;
    addClient(client: ISocketConnection): void;
    removeClient(client: ISocketConnection): void;
    filter(callback: (client: ISocketConnection) => boolean): WsLink;
    close(): void;
    toAll(event: string, data?: any): void;
    clientClose(client: ISocketConnection): void;
}

/**
 * @class Máy chủ websocket
 */
export class WebsocketServer extends ws.WebSocketServer implements IWebsocketServer {
    private rooms: Map<string, Set<ISocketConnection>> = new Map();
    private socketClients: Map<string, ISocketConnection> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;
    private auth?: (req: http.IncomingMessage) => Promise<boolean> | boolean;
    private httpServer?: http.Server;
    private static instance: WebsocketServer;

    private constructor(
        option: ws.ServerOptions,
        callback?: () => void
    ) {
        super(option, callback);
    };

    static init(option: ws.ServerOptions, callback?: () => void): WebsocketServer {
        if (!WebsocketServer.instance) {
            WebsocketServer.instance = new WebsocketServer(option, callback);
        }
        return WebsocketServer.instance;
    }

    static getInstance(): WebsocketServer {
        if (!WebsocketServer.instance) {
            throw new Error("WsServer is not initialized");
        }
        return WebsocketServer.instance;
    }

    setAuth(auth: (req: http.IncomingMessage) => Promise<boolean> | boolean): WebsocketServer {
        this.auth = auth
        if (!this.httpServer) {
            console.warn("Http server is not attached")
        }
        return this
    }

    attachServer(httpServer: http.Server): WebsocketServer {
        this.httpServer = httpServer
        this.httpServer.on('close', () => {
            this.close();
        });

        this.httpServer.on('error', () => {
            this.close();
        });

        this.httpServer.on('upgrade', async (req: http.IncomingMessage, sock, head) => {
            try {
                if (this.auth) {
                    const is_valid = await this.auth(req);
                    if (!is_valid) {
                        sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                        sock.destroy()
                        return
                    }
                }
            } catch (error) {
                console.error(error)
                sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                sock.destroy()
                return
            }

            const url_parse = url.parse(req.url!, true)
            this.handleUpgrade(req, sock, head, (ws) => {
                this.emit('connection', ws, url_parse.query)
            })
        })
        return this
    }

    connected(options: {
        connectionHandler: (ws: ISocketConnection, wss: WebsocketServer) => void,
        errorHandler: (error: Error, ws: ISocketConnection) => void,
        messageHandler?: (data: string | Buffer | ArrayBuffer | Buffer[], ws: ISocketConnection) => Message,
        closeHandler?: (ws: ISocketConnection) => void
    }): void {
        this.on("connection", (ws: ws.WebSocket, query: ParsedUrlQuery) => {
            const socketConnection = new SocketConnection(ws, this, query, {
                error: options.errorHandler,
                message: options.messageHandler,
                close: options.closeHandler
            })
            options.connectionHandler(socketConnection, this)
        })

        this.pingInterval = setInterval(() => {
            if (this.clients.size) {
                this.socketClients.forEach((client: ISocketConnection) => {
                    if (client.getAlive() === false) {
                        client.close()
                        return this.toClients(client.getId()).close()
                    }
                    client.ping()
                })
            }
        }, 1000 * 60);
    }

    addClient(client: ISocketConnection) {
        this.socketClients.set(client.getId(), client)
    }

    removeClient(client: ISocketConnection) {
        this.socketClients.delete(client.getId())
    }

    setClientId(newClientId: string, oldClientId: string) {
        const client = this.socketClients.get(oldClientId)
        if (client) {
            this.socketClients.delete(oldClientId)
            this.socketClients.set(newClientId, client)
        }
    }

    isExistRoom(room_id: string): boolean {
        return this.rooms.has(room_id)
    }

    toRooms(...room_ids: string[]): WsLink {
        let clients = new Set<ISocketConnection>();
        room_ids.forEach((room_id: string, index: number) => {
            if (index === 0) {
                clients = this.rooms.get(room_id) || new Set<ISocketConnection>();
            } else {
                this.rooms.get(room_id)?.forEach(val => clients.add(val))
            }
        })
        return new SocketLink(clients, this.rooms)
    }

    toClients(...clientId: Array<string>): WsLink {
        const clients = new Set<ISocketConnection>();
        clientId.forEach(id => {
            const client = this.socketClients.get(id)
            if (client) {
                clients.add(client)
            }
        })
        return new SocketLink(clients, this.rooms)
    }

    toAll(): WsLink {
        return new SocketLink(this.socketClients, this.rooms)
    }

    filter(callback: (client: ISocketConnection) => boolean): WsLink {
        const clients = new Set<ISocketConnection>();
        this.socketClients.forEach(client => {
            if (callback(client)) {
                clients.add(client)
            }
        })
        return new SocketLink(clients, this.rooms)
    }

    clientClose(client: ISocketConnection) {
        this.removeClient(client)
        this.toClients(client.getId()).removeClientInRoom(client, ...client.getRooms())
    }

    close(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // Close all WebSocket connections
        this.socketClients.forEach(client => {
            client.close()
        });

        // Clear all collections
        this.socketClients.clear();
        this.rooms.clear();

        // Close the WebSocket server
        super.close(() => {
            console.log('WebSocket server closed');
        });
    }
}
