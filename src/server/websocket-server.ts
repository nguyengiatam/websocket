import * as ws from "ws";
import url from 'url';
import http from "http";
import { SocketLink, WsLink } from "./socket-link.js";
import { SocketConnection, ISocketConnection } from "./socket-connection.js";
import { ParsedUrlQuery } from "querystring";
import { Message } from "./socket-type.js";

export interface IWebsocketServer extends ws.WebSocketServer {
    setAuth(auth: (req: http.IncomingMessage, query: ParsedUrlQuery) => Promise<any> | any): void;
    attachServer(httpServer: http.Server): void;
    toClients<C extends string>(...clientId: Array<C>): WsLink;
    toRooms<R extends string>(...room_ids: Array<R>): WsLink;
    isExistRoom<R extends string>(room_id: R): boolean;
    addClient(client: ISocketConnection): void;
    removeClient(client: ISocketConnection): void;
    filter(callback: (client: ISocketConnection) => boolean): WsLink;
    close(): void;
    toAll<E extends string>(event: E, data?: any): void;
    clientClose(client: ISocketConnection): void;
}

/**
 * @class Máy chủ websocket
 */
export class WebsocketServer extends ws.WebSocketServer implements IWebsocketServer {
    private rooms: Map<string, Set<ISocketConnection>> = new Map();
    private socketClients: Map<string, ISocketConnection> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;
    private auth?: (req: http.IncomingMessage, query: ParsedUrlQuery) => Promise<any> | any;
    private httpServer?: http.Server;
    private static instance: WebsocketServer;
    private static initCallback: (ws: WebsocketServer) => void;

    private constructor(
        option: ws.ServerOptions,
        callback?: () => void
    ) {
        super(option, callback);
    };

    static init(option: ws.ServerOptions, callback?: () => void): WebsocketServer {
        if (!WebsocketServer.instance) {
            WebsocketServer.instance = new WebsocketServer(option, callback);
            if (WebsocketServer.initCallback) {
                WebsocketServer.initCallback(WebsocketServer.instance);
            }
        }
        return WebsocketServer.instance;
    }

    static onInstanceInit(callback: (ws: WebsocketServer) => void): void {
        if (WebsocketServer.instance) {
            callback(WebsocketServer.instance);
            return
        }
        WebsocketServer.initCallback = callback;
    }

    static getInstance(): WebsocketServer {
        if (!WebsocketServer.instance) {
            throw new Error("WsServer is not initialized");
        }
        return WebsocketServer.instance;
    }

    setAuth(auth: (req: http.IncomingMessage, query: ParsedUrlQuery) => Promise<any> | any): WebsocketServer {
        this.auth = auth
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
                const url_parse = url.parse(req.url!, true)
                const authData = this.auth ? await this.auth(req, url_parse.query) : null
                this.handleUpgrade(req, sock, head, (ws) => {
                    this.emit('connection', ws, url_parse.query, authData ?? null)
                })
            } catch (error) {
                sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                sock.destroy()
                return
            }
        })
        return this
    }

    connected(options: {
        connectionHandler: (ws: ISocketConnection, wss?: WebsocketServer) => void,
        errorHandler: (error: Error, ws: ISocketConnection) => void,
        messageHandler?: (data: string | Buffer | ArrayBuffer | Buffer[], ws: ISocketConnection) => Message,
        closeHandler?: (ws: ISocketConnection) => void
    }): void {
        this.on("connection", (ws: ws.WebSocket, query: ParsedUrlQuery, authData: any) => {
            const socketConnection = new SocketConnection(ws, this, query, authData, {
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

    setClientId<C extends string>(newClientId: C, oldClientId: C) {
        const client = this.socketClients.get(oldClientId)
        if (client) {
            this.socketClients.delete(oldClientId)
            this.socketClients.set(newClientId, client)
        }
    }

    isExistRoom<R extends string>(room_id: R): boolean {
        return this.rooms.has(room_id)
    }

    toRooms<R extends string>(...room_ids: Array<R>): WsLink {
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

    toClients<C extends string>(...clientId: Array<C>): WsLink {
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
