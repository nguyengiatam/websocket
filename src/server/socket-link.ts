import { ISocketConnection } from "./socket-connection.ts";

/**
 * @interface WsLink Kiểu tương tác với client của ws-server
 */
export interface WsLink {
    /**
     * Tham gia phòng
     * @param roomId Id của phòng
     */
    join: (roomId: string) => WsLink;

    /**
     * Thêm client vào phòng
     * @param client Client
     * @param roomId Id của phòng
     */
    addClientToRoom: (client: ISocketConnection, roomId: string) => WsLink;

    /**
     * Thoát phòng
     * @param roomId Id của phòng
     */
    leave: (roomId: string) => WsLink;

    /**
     * Đóng kết nối
     */
    close: () => WsLink;

    /**
     * Phát sự kiện về client
     * @param event Tên sự kiện
     * @param data Dữ liệu gửi về client
     */
    emitS: (event: string, data?: any) => WsLink;

    /**
     * Xóa client khỏi phòng
     * @param client Client
     * @param roomIds Danh sách Id phòng
     */
    removeClientInRoom: (client: ISocketConnection, ...roomIds: Array<string>) => WsLink;

}

export class SocketLink implements WsLink {
    constructor(
        private clients: Set<ISocketConnection> | Map<string, ISocketConnection>,
        private rooms: Map<string, Set<ISocketConnection>>,
    ) { }

    public join(roomId: string): WsLink {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set<ISocketConnection>())
        }
        this.clients.forEach(client => {
            if (!client.getRooms().has(roomId)) {
                client.join(roomId)
            }
        })
        return this
    }

    public addClientToRoom(client: ISocketConnection, roomId: string): WsLink {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set<ISocketConnection>())
        }
        this.rooms.get(roomId)?.add(client)
        if (!client.getRooms().has(roomId)) {
            client.join(roomId)
        }
        return this
    }

    public leave(roomId: string): WsLink {
        this.clients.forEach(val => {
            val.leave(roomId)
            this.rooms.get(roomId)?.delete(val)
        })
        return this
    }

    public close(): WsLink {
        this.clients.forEach(val => {
            val.close()
        })
        return this
    }

    public emitS(event: string, data?: any): WsLink {
        this.clients.forEach(val => val.emitS(event, data))
        return this
    }

    public removeClientInRoom(client: ISocketConnection, ...roomIds: Array<string>): WsLink {
        roomIds.forEach(roomId => {
            this.rooms.get(roomId)?.delete(client)
            if (this.rooms.get(roomId)?.size === 0) {
                this.rooms.delete(roomId)
            }
        })
        return this
    }
}