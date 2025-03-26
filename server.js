const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'chat.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

class ChatServer {
    constructor() {
        this.clients = new Map();
        this.server = new grpc.Server();
        this.isShuttingDown = false;
        this.connectedUsers = new Set();
    }

    formatTime() {
        return new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    start() {
        const chatServer = {
            joinChat: (call) => {
                const username = call.request.username;
                const isReconnection = call.request.isReconnection || false;
                
                // Clean up existing connection if any
                const existingClient = this.clients.get(username);
                if (existingClient) {
                    try {
                        existingClient.end();
                    } catch (err) {
                        console.error(`Error ending existing connection for ${username}:`, err);
                    }
                    this.clients.delete(username);
                }

                // Set new connection
                this.clients.set(username, call);

                if (!this.connectedUsers.has(username) && !isReconnection) {
                    console.log(`${this.formatTime()} - ${username} joined the chat`);
                    this.connectedUsers.add(username);
                    
                    this.broadcastMessage({
                        username: 'System',
                        message: `${username} joined the chat`,
                        timestamp: this.formatTime()
                    });
                } else if (isReconnection) {
                    console.log(`${this.formatTime()} - ${username} reconnected`);
                }

                call.on('cancelled', () => {
                    if (this.clients.get(username) === call) {  // Only if this is the current connection
                        this.clients.delete(username);
                        if (!this.isShuttingDown) {
                            setTimeout(() => {
                                if (!this.clients.has(username)) {
                                    this.connectedUsers.delete(username);
                                    this.broadcastMessage({
                                        username: 'System',
                                        message: `${username} left the chat`,
                                        timestamp: this.formatTime()
                                    });
                                }
                            }, 1000);
                        }
                    }
                });
            },

            sendMessage: (call, callback) => {
                const message = {
                    ...call.request,
                    timestamp: this.formatTime()
                };
                
                // Only log once
                console.log(`${message.timestamp} - ${message.username}: ${message.message}`);
                
                // Ensure message is broadcast only once
                this.broadcastMessage(message);
                callback(null, {});
            }
        };

        this.server.addService(protoDescriptor.ChatService.service, chatServer);

        this.server.bindAsync(
            '0.0.0.0:50051',
            grpc.ServerCredentials.createInsecure(),
            (err, port) => {
                if (err) {
                    console.error(`${this.formatTime()} - ${err}`);
                    return;
                }
                console.log(`${this.formatTime()} - Server running at http://0.0.0.0:${port}`);
                this.server.start();
            }
        );

        this.setupGracefulShutdown();
    }

    broadcastMessage(message) {
        const sentTo = new Set(); // Track who we've sent to
        
        for (const [username, clientStream] of this.clients.entries()) {
            if (!sentTo.has(username)) { // Only send once per user
                try {
                    clientStream.write(message);
                    sentTo.add(username);
                } catch (err) {
                    console.error(`${this.formatTime()} - Error sending to ${username}:`, err);
                    this.clients.delete(username);
                }
            }
        }
    }

    setupGracefulShutdown() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.log(`\n${this.formatTime()} - Received ${signal}. Starting graceful shutdown...`);
                await this.shutdown();
            });
        });
    }

    async shutdown() {
        this.isShuttingDown = true;

        this.broadcastMessage({
            username: 'System',
            message: 'Server is shutting down...',
            timestamp: this.formatTime()
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        this.clients.forEach((client) => {
            try {
                client.end();
            } catch (err) {
                console.error('Error closing client connection:', err);
            }
        });

        this.clients.clear();

        const shutdownPromise = new Promise((resolve) => {
            this.server.tryShutdown(() => {
                console.log(`${this.formatTime()} - Server shutdown completed`);
                resolve();
            });
        });

        try {
            await Promise.race([
                shutdownPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 5000))
            ]);
        } catch (err) {
            console.error('Forcing server shutdown...');
            this.server.forceShutdown();
        }

        process.exit(0);
    }
}

const chatServer = new ChatServer();
chatServer.start();
