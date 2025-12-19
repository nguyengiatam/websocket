/**
 * WebSocket Client Singleton Class for Node.js
 * Sử dụng thư viện 'ws'
 * Hỗ trợ tự động kết nối lại, quản lý event handlers, và giao tiếp với server
 */

import WebSocket from 'ws';

interface WebSocketMessage {
    event: string;
    data: any;
}

type EventHandler = (data: any) => void;

export class WebsocketNode {
    private static instance: WebsocketNode;
    private ws: WebSocket | null = null;
    private url: string = '';
    private eventHandlers: Map<string, Set<EventHandler>> = new Map();
    private reconnectInterval: number = 3000; // 3 giây
    private reconnectTimer: NodeJS.Timeout | null = null;
    private shouldReconnect: boolean = true;
    private isConnecting: boolean = false;
    private messageQueue: WebSocketMessage[] = [];
    private maxQueueSize: number = 100;
    private wsOptions: WebSocket.ClientOptions = {};

    /**
     * Private constructor để đảm bảo singleton pattern
     */
    private constructor() { }

    /**
     * Lấy instance duy nhất của WebSocketClient
     */
    public static getInstance(): WebsocketNode {
        if (!WebsocketNode.instance) {
            WebsocketNode.instance = new WebsocketNode();
        }
        return WebsocketNode.instance;
    }

    /**
     * Kết nối tới WebSocket server
     * @param url - URL của WebSocket server
     * @param reconnectInterval - Thời gian chờ giữa các lần reconnect (ms)
     * @param options - WebSocket client options (headers, protocols, etc.)
     */
    public connect(
        url: string,
        reconnectInterval: number = 3000,
        options: WebSocket.ClientOptions = {}
    ): void {
        if (this.isConnecting) {
            console.log('WebSocket đang trong quá trình kết nối...');
            return;
        }

        this.url = url;
        this.reconnectInterval = reconnectInterval;
        this.shouldReconnect = true;
        this.isConnecting = true;
        this.wsOptions = options;

        try {
            this.ws = new WebSocket(url, options);
            this.setupEventListeners();
        } catch (error) {
            console.error('Lỗi khi tạo WebSocket connection:', error);
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    /**
     * Thiết lập các event listeners cho WebSocket
     */
    private setupEventListeners(): void {
        if (!this.ws) return;

        this.ws.on('open', () => {
            console.log('WebSocket đã kết nối thành công');
            this.isConnecting = false;
            this.clearReconnectTimer();

            // Gửi các message đang trong queue
            this.flushMessageQueue();

            // Trigger internal 'open' event
            this.triggerEvent('__connection_open', null);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
            const reasonString = reason.toString();
            console.log('WebSocket đã đóng kết nối', code, reasonString);
            this.isConnecting = false;
            this.ws = null;

            // Trigger internal 'close' event
            this.triggerEvent('__connection_close', { code, reason: reasonString });

            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        });

        this.ws.on('error', (error: Error) => {
            console.error('WebSocket gặp lỗi:', error);
            this.isConnecting = false;

            // Trigger internal 'error' event
            this.triggerEvent('__connection_error', error);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message: WebSocketMessage = JSON.parse(data.toString());

                if (message.event && typeof message.event === 'string') {
                    this.triggerEvent(message.event, message.data);
                } else {
                    console.warn('Message không đúng format:', message);
                }
            } catch (error) {
                console.error('Lỗi khi parse message:', error);
            }
        });

        // Thêm ping/pong handlers để duy trì connection
        this.ws.on('ping', (data: Buffer) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.pong(data);
            }
        });

        this.ws.on('pong', () => {
            // Connection is alive
            this.triggerEvent('__pong_received', null);
        });
    }

    /**
     * Lên lịch reconnect
     */
    private scheduleReconnect(): void {
        this.clearReconnectTimer();

        console.log(`Sẽ thử kết nối lại sau ${this.reconnectInterval}ms...`);
        this.reconnectTimer = setTimeout(() => {
            if (this.shouldReconnect && this.url) {
                console.log('Đang thử kết nối lại...');
                this.connect(this.url, this.reconnectInterval, this.wsOptions);
            }
        }, this.reconnectInterval);
    }

    /**
     * Xóa timer reconnect
     */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Gửi message tới server
     * @param event - Tên event
     * @param data - Dữ liệu gửi kèm
     */
    public emit<E extends string, D = any>(event: E, data: D): void {
        const message: WebSocketMessage = { event, data };

        if (this.isConnected()) {
            try {
                this.ws!.send(JSON.stringify(message), (error) => {
                    if (error) {
                        console.error('Lỗi khi gửi message:', error);
                        this.addToQueue(message);
                    }
                });
            } catch (error) {
                console.error('Lỗi khi gửi message:', error);
                this.addToQueue(message);
            }
        } else {
            console.warn('WebSocket chưa kết nối, message được thêm vào queue');
            this.addToQueue(message);
        }
    }

    /**
     * Thêm message vào queue
     */
    private addToQueue(message: WebSocketMessage): void {
        if (this.messageQueue.length >= this.maxQueueSize) {
            console.warn('Message queue đã đầy, loại bỏ message cũ nhất');
            this.messageQueue.shift();
        }
        this.messageQueue.push(message);
    }

    /**
     * Gửi tất cả messages trong queue
     */
    private flushMessageQueue(): void {
        if (this.messageQueue.length === 0) return;

        console.log(`Đang gửi ${this.messageQueue.length} messages trong queue...`);

        while (this.messageQueue.length > 0 && this.isConnected()) {
            const message = this.messageQueue.shift();
            if (message) {
                try {
                    this.ws!.send(JSON.stringify(message), (error) => {
                        if (error) {
                            console.error('Lỗi khi gửi queued message:', error);
                            // Thêm lại vào đầu queue nếu gửi thất bại
                            this.messageQueue.unshift(message);
                        }
                    });
                } catch (error) {
                    console.error('Lỗi khi gửi queued message:', error);
                    // Thêm lại vào queue nếu gửi thất bại
                    this.messageQueue.unshift(message);
                    break;
                }
            }
        }
    }

    /**
     * Đăng ký handler cho một event
     * @param event - Tên event
     * @param handler - Function xử lý event
     */
    public on<E extends string>(event: E, handler: EventHandler): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event)!.add(handler);
    }

    /**
     * Hủy đăng ký handler cho một event
     * @param event - Tên event
     * @param handler - Function cần hủy đăng ký
     */
    public off<E extends string>(event: E, handler?: EventHandler): void {
        if (!handler) {
            // Xóa tất cả handlers của event này
            this.eventHandlers.delete(event);
        } else {
            // Xóa một handler cụ thể
            const handlers = this.eventHandlers.get(event);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    this.eventHandlers.delete(event);
                }
            }
        }
    }

    /**
     * Đăng ký handler chỉ chạy một lần
     * @param event - Tên event
     * @param handler - Function xử lý event
     */
    public once<E extends string>(event: E, handler: EventHandler): void {
        const onceHandler: EventHandler = (data) => {
            handler(data);
            this.off(event, onceHandler);
        };
        this.on(event, onceHandler);
    }

    /**
     * Trigger các handlers của một event
     * @param event - Tên event
     * @param data - Dữ liệu truyền cho handlers
     */
    private triggerEvent<E extends string>(event: E, data: any): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Lỗi trong handler của event '${event}':`, error);
                }
            });
        }
    }

    /**
     * Kiểm tra trạng thái kết nối
     */
    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Lấy trạng thái hiện tại của WebSocket
     * 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
     */
    public getReadyState(): number {
        return this.ws?.readyState ?? WebSocket.CLOSED;
    }

    /**
     * Ngắt kết nối WebSocket
     * @param shouldReconnect - Có tự động kết nối lại không
     * @param code - Close code (mặc định 1000 - normal closure)
     * @param reason - Lý do đóng kết nối
     */
    public disconnect(
        shouldReconnect: boolean = false,
        code: number = 1000,
        reason: string = 'Client disconnect'
    ): void {
        this.shouldReconnect = shouldReconnect;
        this.clearReconnectTimer();

        if (this.ws) {
            this.ws.close(code, reason);
            this.ws = null;
        }
    }

    /**
     * Gửi ping tới server
     * @param data - Dữ liệu kèm theo (optional)
     */
    public ping(data?: Buffer | string): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping(data);
        }
    }

    /**
     * Đặt kích thước tối đa của message queue
     */
    public setMaxQueueSize(size: number): void {
        this.maxQueueSize = size;
    }

    /**
     * Lấy số lượng messages trong queue
     */
    public getQueueSize(): number {
        return this.messageQueue.length;
    }

    /**
     * Xóa tất cả event handlers
     */
    public clearAllHandlers(): void {
        this.eventHandlers.clear();
    }

    /**
     * Lấy danh sách các events đã đăng ký
     */
    public getRegisteredEvents<E extends string>(): E[] {
        return Array.from(this.eventHandlers.keys()) as E[];
    }

    /**
     * Lấy WebSocket instance (sử dụng cẩn thận)
     */
    public getWebSocketInstance(): WebSocket | null {
        return this.ws;
    }

    /**
     * Thiết lập heartbeat tự động
     * @param interval - Thời gian giữa các lần ping (ms)
     */
    public setupHeartbeat(interval: number = 30000): NodeJS.Timeout {
        const heartbeatTimer = setInterval(() => {
            if (this.isConnected()) {
                this.ping();
            }
        }, interval);

        // Cleanup khi disconnect
        this.once('__connection_close', () => {
            clearInterval(heartbeatTimer);
        });

        return heartbeatTimer;
    }
}

// Export singleton instance
export default WebsocketNode.getInstance();