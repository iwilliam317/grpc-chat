# gRPC Chat Application

A simple real-time chat application built with Node.js and gRPC, featuring automatic reconnection and multi-client support.

## Features

- Real-time messaging with gRPC streams
- Multiple client support
- Automatic reconnection on connection loss
- Color-coded messages
- Graceful server shutdown

## Prerequisites

- Node.js (v14+ recommended)
- npm

## Installation

\```bash
git clone <repository-url>
cd grpc-chat
npm install
\```

## Usage

1. Start the server:
\```bash
node server.js
\```

2. Start client(s):
\```bash
node client.js
\```

3. Enter username when prompted
4. Type messages and press Enter to send
5. Type 'quit' to exit
6. Press Ctrl+C for graceful shutdown

## Project Structure

\```
grpc-chat/
├── chat.proto        # Protocol Buffer definition
├── server.js         # Chat server implementation
├── client.js         # Chat client implementation
└── package.json      # Project dependencies
\```

## Key Features

- Connection Management: Tracks active connections and handles disconnections
- Auto-Reconnection: Automatic reconnection with progressive delay
- Message Broadcasting: Real-time message delivery to all clients
- Error Handling: Graceful shutdown and connection recovery


## Future Improvements

- Private messaging
- Chat rooms
- Message history
- User authentication
- Message encryption
