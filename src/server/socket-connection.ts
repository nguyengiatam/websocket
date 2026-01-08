import * as ws from "ws";
import { WebsocketServer } from "./websocket-server.js";
import crypto from "crypto";
import EventEmitter from "events";
import { Message } from "./socket-type.js";

export type CallBackEvent<T = any, V = any> = (data: T, preHandlerResult: V) => V

/**
 * @interface SocketConnection Kiểu của đối tượng kết nối websocket
 */
export interface ISocketConnection {
    /**
    * Set id cho client
    * @param id Id của client
    */
    setId: <I extends string>(id: I) => void;

    /**
    * Lấy id của client
    */
    getId: <I extends string>() => I;

    /**
    * Lắng nghe sự kiện từ client
    * @param event Tên sự kiện
    * @param callback Hàm sử lý khi có sự kiện từ client
    */
    onS: <E extends string, T = any, V = any>(event: E, ...callback: Array<CallBackEvent<T, V>>) => Promise<void> | void;

    /**
    * Phát sự kiện về client
    * @param event Tên sự kiện
    * @param data Dữ liệu gửi về client
    */
    emitS: <E extends string, T = any>(event: E, data: T) => Promise<void> | void;

    /**
    * Tham gia phòng
    * @param roomId Id của phòng
    */
    join: <R extends string>(roomId: R) => void;

    /**
    * Thoát phòng
    * @param roomId Id của phòng
    */
    leave: <R extends string>(roomId: R) => void;

    /**
    * Set biến
    * @param key Tên biến
    * @param value Giá trị biến
    */
    setVariable: <K extends string, T = any>(key: K, value: T) => void;

    /**
    * Lấy biến
    * @param key Tên biến
    */
    getVariable: <K extends string, T = any>(key: K) => T;

    /**
    * Ping client
    */
    ping: () => void;

    /**
     * Lấy trạng thái kết nối
     * @returns 
     */
    getAlive: () => boolean;

    /**
    * Lấy query
    */
    getQuery: <T = any>() => T;

    /**
    * Lấy thông tin xác thực
    */
    getAuthData: <T = any>() => T;

    /**
    * Đóng kết nối
    */
    close: () => void;

    /**
    * Lấy danh sách phòng
    */
    getRooms: <R extends string>() => Set<R>;
}

class WsEvent extends EventEmitter {
    constructor() {
        super();
    }
}

export class SocketConnection implements ISocketConnection {
    private uuid: string = crypto.randomUUID();
    private isAlive: boolean = true;
    private rooms: Set<string> = new Set<string>();
    private event: WsEvent = new WsEvent();
    private variables: Map<string, any> = new Map<string, any>();

    constructor(
        private ws: ws.WebSocket,
        private wss: WebsocketServer,
        private query: { [key: string]: string | string[] | undefined },
        private authData: any,
        private handler: {
            error: (error: Error, ws: ISocketConnection) => void,
            message?: (data: ws.Data, ws: ISocketConnection) => Message,
            close?: (ws: ISocketConnection) => void
        },
    ) {
        this.wss.addClient(this)
        this.setEvent(this.ws)
    }

    private setEvent(ws: ws.WebSocket) {
        ws.on('pong', () => {
            this.isAlive = true;
        })

        ws.on("ping", () => {
            this.ws.pong()
        })

        ws.on('close', () => {
            this.rooms.forEach(room_id => {
                this.rooms.delete(room_id)
                this.wss.toClients(this.uuid).leave(room_id)
            })
            this.handler.close?.(this)
        })

        ws.on('error', () => {
            this.rooms.forEach(room_id => {
                this.rooms.delete(room_id)
                this.wss.toClients(this.uuid).leave(room_id)
            })
        })

        ws.on("message", (data: ws.Data) => {
            try {
                if (data.toString() === "pong") {
                    this.isAlive = true
                    return
                }

                if (this.handler.message) {
                    const message = this.handler.message(data, this)
                    this.event.emit(message.event, message.data)
                    return
                }

                const dataJson = JSON.parse(data.toString())

                if (!dataJson) {
                    throw new Error("Data format invalid")
                }
                if (!dataJson.event) {
                    throw new Error("Event name invalid")
                }
                this.event.emit(dataJson.event, dataJson.data)
            } catch (error) {
                this.handler.error(error as Error, this)
            }
        })
    }

    getQuery<T = any>() {
        return this.query as T
    }

    getAuthData<T = any>() {
        return this.authData as T
    }

    ping() {
        this.isAlive = false;
        this.ws.ping()
        this.ws.send("ping")
    }

    onS<E extends string, T = any, V = any>(event: E, ...callbacks: Array<CallBackEvent<T, V>>): void {
        this.event.on(event, async (data: any) => {
            let result: V | any
            for (const callback of callbacks) {
                try {
                    result = await callback(data, result)
                } catch (error) {
                    this.handler.error(error as Error, this)
                }
            }
        })
    }

    emitS<E extends string, T = any>(event: E, data?: T): any {
        const data_return = JSON.stringify({
            event: event,
            data: data || null
        })
        this.ws.send(data_return)
    }

    setId<I extends string>(id: I) {
        this.wss.setClientId(this.uuid, id)
        this.uuid = id
    }

    getId<I extends string>() {
        return this.uuid as I
    }

    join<R extends string>(room_id: R): void {
        if (!this.rooms.has(room_id)) {
            this.rooms.add(room_id)
        }
        this.wss.toClients(this.uuid).addClientToRoom(this, room_id)
    }

    leave<R extends string>(room_id: R): void {
        if (this.rooms.has(room_id)) {
            this.rooms.delete(room_id)
        }
        this.wss.toClients(this.uuid).removeClientInRoom(this, room_id)
    }

    setVariable<K extends string, T = any>(key: K, value: T) {
        this.variables.set(key, value)
    }

    getVariable<K extends string, T = any>(key: K) {
        return this.variables.get(key) as T
    }

    close(code?: number, reason?: string) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(code, reason)
        }
        this.wss.clientClose(this)
    }

    getAlive() {
        return this.isAlive
    }

    getRooms<R extends string>() {
        return this.rooms as Set<R>
    }
}