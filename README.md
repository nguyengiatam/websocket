# @maxsida/websocket

Thư viện WebSocket mạnh mẽ được viết bằng TypeScript, hỗ trợ cả Server và Client cho Node.js và trình duyệt.

## 📦 Cài đặt

```bash
npm install @maxsida/websocket
```

## ✨ Tính năng

### Server
- ✅ Singleton pattern - Quản lý server duy nhất
- ✅ Tích hợp HTTP server
- ✅ Xác thực (Authentication) tùy chỉnh
- ✅ Quản lý phòng (Room) và client
- ✅ Middleware pattern với throw error handling
- ✅ Ping/Pong tự động để duy trì kết nối
- ✅ Gửi tin nhắn đến nhiều client/phòng
- ✅ Hỗ trợ query parameters từ URL

### Client
- ✅ Hỗ trợ cả Node.js và Browser
- ✅ Tự động kết nối lại khi mất kết nối
- ✅ Queue tin nhắn khi offline
- ✅ Event-driven architecture
- ✅ Singleton pattern
- ✅ Heartbeat/Ping tự động

## 🚀 Sử dụng

### WebSocket Server

#### 1. Khởi tạo Server cơ bản

```typescript
import { Server } from '@maxsida/websocket';
import http from 'http';
import express from 'express';

const app = express();
const httpServer = http.createServer(app);

// Khởi tạo WebSocket server
const wsServer = Server.WebsocketServer.init({
  noServer: true
});

// Gắn server vào HTTP server
wsServer.attachServer(httpServer);

// Xử lý kết nối
wsServer.connected({
  connectionHandler: (ws, wss) => {
    console.log('Client đã kết nối');
    
    // Lắng nghe sự kiện từ client
    ws.onS('message', (data) => {
      console.log('Nhận tin nhắn:', data);
      // Gửi phản hồi
      ws.emitS('response', { status: 'ok' });
    });
  },
  errorHandler: (error, ws) => {
    console.error('Lỗi:', error);
    ws.emitS('error', { message: error.message });
  },
  closeHandler: (ws) => {
    console.log('Client đã ngắt kết nối');
  }
});

httpServer.listen(8080, () => {
  console.log('Server đang chạy trên cổng 8080');
});
```

#### 2. Xác thực (Authentication)

```typescript
wsServer.setAuth(async (req: http.IncomingMessage) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    throw new Error('Token không hợp lệ');
  }
  
  // Xác thực token của bạn
  try {
    const userInfo = await verifyToken(token);
    if (!userInfo) {
      throw new Error('Token không hợp lệ');
    }
    return userInfo;
  } catch (error) {
    throw error;
  }
});
```

#### 3. Sử dụng onInstanceInit (cho NestJS hoặc Module Isolation)

`onInstanceInit` cho phép đăng ký callback sẽ được gọi ngay sau khi WebSocket server được khởi tạo. Điều này hữu ích khi:
- Sử dụng framework như **NestJS** với dependency injection
- Muốn tách biệt logic khởi tạo server và cấu hình
- Tránh export chéo giữa các module

**Kịch bản 1: Sử dụng với NestJS**

```typescript
// websocket.module.ts
import { Module } from '@nestjs/common';
import { Server } from '@maxsida/websocket';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  providers: [WebsocketGateway]
})
export class WebsocketModule {
  constructor(private wsGateway: WebsocketGateway) {
    // Đăng ký callback trước khi server được init
    Server.WebsocketServer.onInstanceInit((wsServer) => {
      // Callback này sẽ chạy ngay sau khi server được khởi tạo
      this.wsGateway.setupWebsocket(wsServer);
    });
  }
}

// websocket.gateway.ts
import { Injectable } from '@nestjs/common';
import { Server } from '@maxsida/websocket';

@Injectable()
export class WebsocketGateway {
  setupWebsocket(wsServer: Server.IWebsocketServer) {
    wsServer.connected({
      connectionHandler: (ws, wss) => {
        console.log('Client connected');
        ws.onS('message', (data) => {
          // Xử lý message
        });
      },
      errorHandler: (error, ws) => {
        console.error('Error:', error);
      }
    });
  }
}

// main.ts hoặc app.module.ts - nơi khởi tạo server
import { Server } from '@maxsida/websocket';
import http from 'http';

const httpServer = http.createServer(app);
const wsServer = Server.WebsocketServer.init({ noServer: true });
wsServer.attachServer(httpServer);
// Callback đã đăng ký sẽ tự động chạy tại đây
```

**Kịch bản 2: Tách biệt module để tránh circular dependency**

```typescript
// websocket-config.ts
import { Server } from '@maxsida/websocket';

// Đăng ký cấu hình mà không cần import server instance
Server.WebsocketServer.onInstanceInit((wsServer) => {
  wsServer.setAuth(async (req, query) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Unauthorized');
    
    const user = await verifyToken(token);
    return user;
  });
  
  wsServer.connected({
    connectionHandler: (ws, wss) => {
      const authData = ws.getAuthData();
      console.log('User connected:', authData);
      
      ws.setId(authData.userId);
      ws.join(authData.userId);
    },
    errorHandler: (error, ws) => {
      ws.emitS('error', { message: error.message });
    }
  });
});

// server.ts
import './websocket-config'; // Import để đăng ký callback
import { Server } from '@maxsida/websocket';
import express from 'express';
import http from 'http';

const app = express();
const httpServer = http.createServer(app);

// Khởi tạo server - callback sẽ tự động chạy
const wsServer = Server.WebsocketServer.init({ noServer: true });
wsServer.attachServer(httpServer);

httpServer.listen(8080);
```

**Lưu ý quan trọng:**
- Nếu server đã được khởi tạo, callback sẽ được gọi **ngay lập tức**
- Nếu server chưa khởi tạo, callback sẽ được gọi **sau khi** `init()` được gọi
- Callback chỉ được gọi **một lần duy nhất**

#### 4. Sử dụng Query Parameters

```typescript
wsServer.connected({
  connectionHandler: (ws, wss) => {
    // Lấy query từ URL: ws://localhost:8080?user_id=123&room=general
    const query = ws.getQuery();
    const userId = query.user_id;
    const roomId = query.room;
    
    // Đặt ID cho client
    ws.setId(userId as string);
    
    // Tham gia phòng
    ws.join(roomId as string);
  },
  // ...
});
```

#### 4. Middleware Pattern với Throw Error

```typescript
import { Server } from '@maxsida/websocket';

// Tạo custom Error class để phân biệt validation errors
class WsError extends Error {
  public code: number;
  public statusCode: number;
  
  constructor(message: string, code: number = 400) {
    super(message);
    this.name = 'WsError';
    this.code = code;
    this.statusCode = code;
  }
}

// Tạo middleware validation - throw WsError cho lỗi validation
const validateRoomId = (data: { room_id?: string }) => {
  if (!data?.room_id) {
    throw new WsError("Room ID là bắt buộc", 400);
  }
  
  if (!wsServer.isExistRoom(data.room_id)) {
    throw new WsError("Phòng không tồn tại", 404);
  }
  
  // Nếu không throw error, middleware tiếp tục
};

const validateMessage = (data: { message?: string }) => {
  if (!data?.message || data.message.trim() === '') {
    throw new WsError("Tin nhắn không được để trống", 400);
  }
  
  if (data.message.length > 1000) {
    throw new WsError("Tin nhắn quá dài (tối đa 1000 ký tự)", 400);
  }
  // Pass - tiếp tục middleware tiếp theo
};

const sanitizeMessage = (data: { message: string }) => {
  // Làm sạch message trước khi xử lý
  data.message = data.message.trim();
  
  // Có thể throw lỗi ngoài ý muốn (unexpected error)
  if (someUnexpectedCondition) {
    throw new Error("Lỗi không mong muốn trong quá trình xử lý");
  }
};

// Sử dụng nhiều middleware - chạy tuần tự từ trái sang phải
wsServer.connected({
  connectionHandler: (ws, wss) => {
    ws.onS(
      'send_message', 
      validateRoomId,      // Chạy đầu tiên
      validateMessage,     // Chạy tiếp nếu không có lỗi
      sanitizeMessage,     // Chạy tiếp nếu không có lỗi
      (data: { room_id: string, message: string }) => {
        // Handler chính - chỉ chạy khi tất cả middleware pass
        wss.toRooms(data.room_id).emitS('new_message', {
          message: data.message,
          from: ws.getId()
        });
      }
    );
  },
  errorHandler: (error, ws) => {
    // Phân biệt xử lý giữa validation errors và unexpected errors
    if (error instanceof WsError) {
      // Validation error - gửi thông báo rõ ràng cho client
      ws.emitS('validation_error', {
        message: error.message,
        code: error.code
      });
    } else {
      // Unexpected error - log chi tiết, gửi thông báo chung cho client
      console.error('Unexpected error:', error);
      ws.emitS('server_error', {
        message: 'Đã xảy ra lỗi không mong muốn'
      });
    }
  }
});
```

#### 5. Quản lý Phòng (Room)

```typescript
wsServer.connected({
  connectionHandler: (ws, wss) => {
    // Tham gia phòng
    ws.onS('join_room', (data: { room_id: string }) => {
      ws.join(data.room_id);
      ws.emitS('joined', { room: data.room_id });
    });
    
    // Rời phòng
    ws.onS('leave_room', (data: { room_id: string }) => {
      ws.leave(data.room_id);
      ws.emitS('left', { room: data.room_id });
    });
    
    // Gửi tin nhắn đến phòng
    ws.onS('room_message', (data: { room_id: string, message: string }) => {
      wss.toRooms(data.room_id).emitS('message', {
        from: ws.getId(),
        message: data.message
      });
    });
  },
  // ...
});
```

#### 6. Gửi tin nhắn đến Client/Phòng cụ thể

```typescript
// Gửi đến tất cả clients
wsServer.toAll().emitS('broadcast', { message: 'Hello everyone!' });

// Gửi đến client cụ thể
wsServer.toClients('user_123', 'user_456').emitS('private', { 
  message: 'Private message' 
});

// Gửi đến các phòng
wsServer.toRooms('room_1', 'room_2').emitS('room_broadcast', { 
  message: 'Message to rooms' 
});

// Lọc clients theo điều kiện
wsServer.filter((client) => {
  return client.getVariable('premium') === true;
}).emitS('premium_offer', { discount: 50 });
```

#### 7. Lưu trữ biến tùy chỉnh

```typescript
wsServer.connected({
  connectionHandler: (ws, wss) => {
    // Lưu biến
    ws.setVariable('username', 'John Doe');
    ws.setVariable('premium', true);
    ws.setVariable('lastActive', Date.now());
    
    // Lấy biến
    ws.onS('get_profile', () => {
      ws.emitS('profile', {
        username: ws.getVariable('username'),
        premium: ws.getVariable('premium')
      });
    });
  },
  // ...
});
```

#### 8. Tích hợp với Express API

```typescript
app.post('/api/notify', (req, res) => {
  const { userId, message } = req.body;
  
  // Gửi thông báo đến user cụ thể qua WebSocket
  wsServer.toClients(userId).emitS('notification', { message });
  
  res.json({ success: true });
});

app.post('/api/room/broadcast', (req, res) => {
  const { roomId, message } = req.body;
  
  // Gửi tin nhắn đến tất cả người trong phòng
  wsServer.toRooms(roomId).emitS('announcement', { message });
  
  res.json({ success: true });
});
```

### WebSocket Client

#### 1. Client cho Browser

```typescript
import { Client } from '@maxsida/websocket';

// Lấy instance singleton
const wsClient = Client.WebsocketBrowser.getInstance();

// Kết nối đến server
wsClient.connect('ws://localhost:8080?user_id=123', 3000);

// Lắng nghe sự kiện kết nối
wsClient.on('__connection_open', () => {
  console.log('Đã kết nối đến server');
});

wsClient.on('__connection_close', (data) => {
  console.log('Mất kết nối:', data);
});

wsClient.on('__connection_error', (error) => {
  console.error('Lỗi kết nối:', error);
});

// Lắng nghe sự kiện từ server
wsClient.on('message', (data) => {
  console.log('Nhận tin nhắn:', data);
});

wsClient.on('notification', (data) => {
  console.log('Thông báo mới:', data);
});

// Gửi tin nhắn đến server
wsClient.emit('send_message', {
  room_id: 'general',
  message: 'Hello from browser!'
});

// Ngắt kết nối
wsClient.disconnect(false);
```

#### 2. Client cho Node.js

```typescript
import { Client } from '@maxsida/websocket';

const wsClient = Client.WebsocketNode.getInstance();

// Kết nối với options (headers, protocols...)
wsClient.connect(
  'ws://localhost:8080?user_id=456',
  3000,
  {
    headers: {
      'Authorization': 'Bearer your-token-here'
    }
  }
);

// Lắng nghe sự kiện
wsClient.on('message', (data) => {
  console.log('Nhận tin nhắn:', data);
});

// Gửi tin nhắn
wsClient.emit('chat', {
  room: 'tech',
  message: 'Hello from Node.js!'
});

// Thiết lập heartbeat tự động (ping mỗi 30 giây)
wsClient.setupHeartbeat(30000);

// Ngắt kết nối với code và lý do
wsClient.disconnect(false, 1000, 'Client closing');
```

#### 3. Event Handlers nâng cao

```typescript
const wsClient = Client.WebsocketBrowser.getInstance();

// Lắng nghe một lần duy nhất
wsClient.once('welcome', (data) => {
  console.log('Chào mừng:', data);
});

// Hủy đăng ký handler
const messageHandler = (data) => {
  console.log('Message:', data);
};

wsClient.on('message', messageHandler);

// Sau này muốn hủy
wsClient.off('message', messageHandler);

// Hủy tất cả handlers của một event
wsClient.off('message');

// Xóa tất cả event handlers
wsClient.clearAllHandlers();

// Lấy danh sách events đã đăng ký
const events = wsClient.getRegisteredEvents();
console.log('Registered events:', events);
```

#### 4. Quản lý Message Queue

```typescript
const wsClient = Client.WebsocketBrowser.getInstance();

// Đặt kích thước tối đa của queue
wsClient.setMaxQueueSize(200);

// Kiểm tra số lượng messages trong queue
const queueSize = wsClient.getQueueSize();
console.log('Messages trong queue:', queueSize);

// Kiểm tra trạng thái kết nối
if (wsClient.isConnected()) {
  console.log('Đang kết nối');
} else {
  console.log('Chưa kết nối - tin nhắn sẽ được queue');
}

// Lấy ready state
// 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
const state = wsClient.getReadyState();
```

## 📚 Ví dụ đầy đủ - Ứng dụng Chat

### Server

```typescript
import { Server } from '@maxsida/websocket';
import express from 'express';
import http from 'http';

const app = express();
const httpServer = http.createServer(app);

// Custom Error cho validation
class WsError extends Error {
  public code: number;
  
  constructor(message: string, code: number = 400) {
    super(message);
    this.name = 'WsError';
    this.code = code;
  }
}

// Khởi tạo WebSocket server
const wsServer = Server.WebsocketServer.init({ noServer: true });
wsServer.attachServer(httpServer);

// Xác thực
wsServer.setAuth(async (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  const userInfo = await verifyToken(token); // Thực hiện logic xác thực token
  if (!userInfo) {
    throw new Error('Token không hợp lệ');
  }
  return userInfo;
});

// Middleware validation - sử dụng WsError
const validateRoomData = (data: { room_id?: string }) => {
  if (!data?.room_id) {
    throw new WsError("Room ID bắt buộc", 400);
  }
  // Không throw error = pass
};

const validateMessage = (data: { message?: string }) => {
  if (!data?.message || data.message.trim() === '') {
    throw new WsError("Tin nhắn không được để trống", 400);
  }
  
  if (data.message.length > 500) {
    throw new WsError("Tin nhắn quá dài", 400);
  }
  // Pass - tiếp tục
};

// Xử lý kết nối
wsServer.connected({
  connectionHandler: (ws, wss) => {
    const query = ws.getQuery();
    const userId = query.user_id as string;
    
    // Thiết lập client
    ws.setId(userId);
    ws.setVariable('username', query.username || 'Anonymous');
    ws.setVariable('joinedAt', new Date().toISOString());
    
    console.log(`User ${userId} đã kết nối`);
    
    // Tham gia phòng (có middleware validation)
    ws.onS('join_room', validateRoomData, (data: { room_id: string }) => {
      ws.join(data.room_id);
      
      // Thông báo cho phòng
      wss.toRooms(data.room_id).emitS('user_joined', {
        room_id: data.room_id,
        user_id: userId,
        username: ws.getVariable('username')
      });
      
      ws.emitS('joined_room', { room_id: data.room_id });
    });
    
    // Rời phòng
    ws.onS('leave_room', validateRoomData, (data: { room_id: string }) => {
      ws.leave(data.room_id);
      
      wss.toRooms(data.room_id).emitS('user_left', {
        room_id: data.room_id,
        user_id: userId
      });
      
      ws.emitS('left_room', { room_id: data.room_id });
    });
    
    // Gửi tin nhắn
    ws.onS(
      'send_message',
      validateRoomData,
      validateMessage,
      (data: { room_id: string; message: string }) => {
        wss.toRooms(data.room_id).emitS('new_message', {
          room_id: data.room_id,
          user_id: userId,
          username: ws.getVariable('username'),
          message: data.message,
          timestamp: Date.now()
        });
      }
    );
    
    // Typing indicator
    ws.onS('typing', validateRoomData, (data: { room_id: string }) => {
      wss.toRooms(data.room_id).emitS('user_typing', {
        room_id: data.room_id,
        user_id: userId,
        username: ws.getVariable('username')
      });
    });
  },
  
  errorHandler: (error, ws) => {
    // Phân biệt validation errors và unexpected errors
    if (error instanceof WsError) {
      // Validation error - client có thể hiển thị trực tiếp
      console.log('Validation error:', error.message);
      ws.emitS('error', {
        type: 'validation',
        message: error.message,
        code: error.code
      });
    } else {
      // Unexpected error - không tiết lộ chi tiết cho client
      console.error('Unexpected error:', error);
      ws.emitS('error', {
        type: 'server',
        message: 'Đã xảy ra lỗi trên server',
        code: 500
      });
    }
  },
  
  closeHandler: (ws) => {
    const userId = ws.getId();
    const rooms = Array.from(ws.getRooms());
    
    console.log(`User ${userId} đã ngắt kết nối`);
    
    // Thông báo cho các phòng
    rooms.forEach(roomId => {
      wsServer.toRooms(roomId).emitS('user_disconnected', {
        room_id: roomId,
        user_id: userId
      });
    });
  }
});

// REST API
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

httpServer.listen(8080, () => {
  console.log('Server đang chạy trên port 8080');
});
```

### Client (Browser)

```typescript
import { Client } from '@maxsida/websocket';

class ChatApp {
  private wsClient: Client.WebsocketBrowser;
  
  constructor() {
    this.wsClient = Client.WebsocketBrowser.getInstance();
    this.setupEventHandlers();
  }
  
  connect(userId: string, username: string) {
    const url = `ws://localhost:8080?user_id=${userId}&username=${username}`;
    this.wsClient.connect(url, 3000);
  }
  
  setupEventHandlers() {
    // Kết nối thành công
    this.wsClient.on('__connection_open', () => {
      console.log('Đã kết nối đến chat server');
      this.updateConnectionStatus('connected');
    });
    
    // Mất kết nối
    this.wsClient.on('__connection_close', () => {
      console.log('Mất kết nối - đang thử kết nối lại...');
      this.updateConnectionStatus('disconnected');
    });
    
    // Tham gia phòng thành công
    this.wsClient.on('joined_room', (data) => {
      console.log('Đã tham gia phòng:', data.room_id);
      this.showNotification(`Đã vào phòng ${data.room_id}`);
    });
    
    // Tin nhắn mới
    this.wsClient.on('new_message', (data) => {
      this.displayMessage(data);
    });
    
    // User tham gia
    this.wsClient.on('user_joined', (data) => {
      this.showNotification(`${data.username} đã tham gia phòng`);
    });
    
    // User rời đi
    this.wsClient.on('user_left', (data) => {
      this.showNotification(`User ${data.user_id} đã rời phòng`);
    });
    
    // Typing indicator
    this.wsClient.on('user_typing', (data) => {
      this.showTypingIndicator(data.username);
    });
    
    // Xử lý lỗi
    this.wsClient.on('error', (data) => {
      if (data.type === 'validation') {
        // Validation error - hiển thị thông báo cho user
        this.showValidationError(data.message);
      } else {
        // Server error - hiển thị thông báo chung
        this.showServerError('Đã xảy ra lỗi, vui lòng thử lại');
      }
    });
    
    this.wsClient.on('validation_error', (data) => {
      // Xử lý validation error riêng (nếu dùng event riêng)
      this.showValidationError(data.message);
    });
    
    this.wsClient.on('server_error', (data) => {
      // Xử lý server error riêng (nếu dùng event riêng)
      this.showServerError(data.message);
    });
  }
  
  joinRoom(roomId: string) {
    this.wsClient.emit('join_room', { room_id: roomId });
  }
  
  leaveRoom(roomId: string) {
    this.wsClient.emit('leave_room', { room_id: roomId });
  }
  
  sendMessage(roomId: string, message: string) {
    this.wsClient.emit('send_message', {
      room_id: roomId,
      message: message
    });
  }
  
  sendTyping(roomId: string) {
    this.wsClient.emit('typing', { room_id: roomId });
  }
  
  disconnect() {
    this.wsClient.disconnect(false);
  }
  
  // UI methods
  private updateConnectionStatus(status: string) {
    // Update UI
  }
  
  private displayMessage(data: any) {
    // Display message in UI
  }
  
  private showNotification(message: string) {
    // Show notification
  }
  
  private showTypingIndicator(username: string) {
    // Show typing indicator
  }
  
  private showValidationError(message: string) {
    // Hiển thị validation error - user có thể fix
    console.warn('Validation:', message);
  }
  
  private showServerError(message: string) {
    // Hiển thị server error - lỗi hệ thống
    console.error('Server error:', message);
  }
}

// Sử dụng
const chat = new ChatApp();
chat.connect('user123', 'John Doe');
chat.joinRoom('general');
```

## 📖 API Reference

### Server API

#### WebsocketServer

| Method | Tham số | Mô tả |
|--------|---------|-------|
| `init()` | `options: ws.ServerOptions, callback?` | Khởi tạo server (singleton) |
| `getInstance()` | - | Lấy instance server |
| `onInstanceInit()` | `callback: (ws: WebsocketServer) => void` | Đăng ký callback chạy sau khi init (cho NestJS/module isolation) |
| `attachServer()` | `httpServer: http.Server` | Gắn vào HTTP server |
| `setAuth()` | `auth: (req, query) => any\|Promise<any>` | Callback xác thực, throw error nếu xác thực thất bại, return data sẽ được truyền vào authData |
| `connected()` | `options: ConnectedOptions` | Xử lý kết nối |
| `toClients()` | `...clientIds: string[]` | Chọn clients theo ID |
| `toRooms()` | `...roomIds: string[]` | Chọn các phòng |
| `toAll()` | - | Chọn tất cả clients |
| `filter()` | `callback: (client) => boolean` | Lọc clients |
| `isExistRoom()` | `roomId: string` | Kiểm tra phòng tồn tại |
| `close()` | - | Đóng server |

#### SocketConnection

| Method | Tham số | Mô tả |
|--------|---------|-------|
| `setId()` | `id: string` | Đặt ID cho client |
| `getId()` | - | Lấy ID client |
| `onS()` | `event: string, ...callbacks` | Lắng nghe sự kiện với middleware chain |
| `emitS()` | `event: string, data?: any` | Gửi sự kiện đến client |
| `join()` | `roomId: string` | Tham gia phòng |
| `leave()` | `roomId: string` | Rời phòng |
| `getRooms()` | - | Lấy danh sách phòng |
| `setVariable()` | `key: string, value: any` | Lưu biến |
| `getVariable()` | `key: string` | Lấy biến |
| `getQuery()` | - | Lấy query params |
| `getAuthData()` | - | Lấy dữ liệu từ setAuth callback |
| `ping()` | - | Ping client |
| `getAlive()` | - | Kiểm tra trạng thái |
| `close()` | - | Đóng kết nối |

### Client API

#### WebsocketBrowser / WebsocketNode

| Method | Tham số | Mô tả |
|--------|---------|-------|
| `getInstance()` | - | Lấy instance (singleton) |
| `connect()` | `url: string, reconnectInterval?: number, options?` | Kết nối đến server |
| `disconnect()` | `shouldReconnect?: boolean` | Ngắt kết nối |
| `emit()` | `event: string, data?: any` | Gửi sự kiện |
| `on()` | `event: string, handler: Function` | Lắng nghe sự kiện |
| `once()` | `event: string, handler: Function` | Lắng nghe một lần |
| `off()` | `event: string, handler?: Function` | Hủy lắng nghe |
| `isConnected()` | - | Kiểm tra kết nối |
| `getReadyState()` | - | Lấy trạng thái |
| `setMaxQueueSize()` | `size: number` | Đặt kích thước queue |
| `getQueueSize()` | - | Lấy kích thước queue |
| `clearAllHandlers()` | - | Xóa tất cả handlers |
| `getRegisteredEvents()` | - | Lấy danh sách events |

#### Chỉ WebsocketNode

| Method | Tham số | Mô tả |
|--------|---------|-------|
| `ping()` | `data?: Buffer\|string` | Gửi ping |
| `setupHeartbeat()` | `interval?: number` | Thiết lập heartbeat |
| `getWebSocketInstance()` | - | Lấy WebSocket instance |

## 🔧 TypeScript Support

Thư viện được viết hoàn toàn bằng TypeScript và cung cấp đầy đủ type definitions:

```typescript
import { Server, Client } from '@maxsida/websocket';

// Tất cả đều có type hints
const wsServer: Server.IWebsocketServer = Server.WebsocketServer.init({ noServer: true });
const wsClient: Client.WebsocketBrowser = Client.WebsocketBrowser.getInstance();
```

## 📝 License

MIT

## 👨‍💻 Tác giả

maxsida <maxsida.dev@gmail.com>

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng tạo issue hoặc pull request.
