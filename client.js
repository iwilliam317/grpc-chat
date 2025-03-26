const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const readline = require('readline');

class ChatClient {
    constructor() {
        this.PROTO_PATH = path.join(__dirname, 'chat.proto');
        this.username = '';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.hasJoinedBefore = false;
        this.currentCall = null;
        this.setupProto();
        this.setupReadline();
    }

    setupProto() {
        const packageDefinition = protoLoader.loadSync(this.PROTO_PATH, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });
        this.protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    }

    setupReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    formatTime() {
        return new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    async connect() {
        this.client = new this.protoDescriptor.ChatService(
            'localhost:50051',
            grpc.credentials.createInsecure()
        );

        if (!this.username) {
            this.username = await this.askUsername();
        }

        this.startChat();
    }

    askUsername() {
        return new Promise((resolve) => {
            this.rl.question('Enter your username: ', (username) => {
                resolve(username);
            });
        });
    }

    startChat() {
        try {
            if (this.currentCall) {
                try {
                    this.currentCall.cancel();
                } catch (err) {
                    // Ignore error during cleanup
                }
            }

            const call = this.client.joinChat({ 
                username: this.username,
                isReconnection: this.hasJoinedBefore
            });
            
            this.currentCall = call;
            this.isConnected = true;
            this.reconnectAttempts = 0;

            if (!this.hasJoinedBefore) {
                console.log(`${this.colors.system}Connected to chat. Type your messages below. Type 'quit' to exit.${this.colors.reset}`);
                this.hasJoinedBefore = true;
            } else {
                console.log(`${this.colors.system}Reconnected to chat.${this.colors.reset}`);
            }

            call.on('data', (message) => {
                if (message.username !== this.username) {
                    const formattedMessage = `${this.colors.timestamp}[${message.timestamp}] ${this.colors.username}${message.username}${this.colors.reset}: ${message.message}`;
                    console.log(formattedMessage);
                }
            });

            call.on('error', (error) => {
                this.handleError(error);
            });

            call.on('end', () => {
                this.handleDisconnect();
            });

            this.setupMessageInput();

        } catch (error) {
            this.handleError(error);
        }
    }

    handleError(error) {
        if (this.isConnected) {
            this.isConnected = false;
            console.log(`\n${this.colors.error}Lost connection to the chat server. Attempting to reconnect...${this.colors.reset}`);
            this.attemptReconnect();
        }
    }

    handleDisconnect() {
        if (this.isConnected) {
            this.isConnected = false;
            this.attemptReconnect();
        }
    }

    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`\n${this.colors.error}Failed to reconnect after ${this.maxReconnectAttempts} attempts. Please restart the chat client.${this.colors.reset}`);
            this.shutdown();
            return;
        }

        const delay = this.reconnectDelay * (this.reconnectAttempts + 1);
        this.reconnectAttempts++;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        this.connect();
    }

    setupMessageInput() {
        this.rl.removeAllListeners('line');
        this.rl.on('line', (line) => {
            if (line.toLowerCase() === 'quit') {
                this.shutdown();
                return;
            }

            if (!this.isConnected) {
                console.log(`${this.colors.system}Waiting to reconnect. Your message will be sent once connected.${this.colors.reset}`);
                return;
            }

            this.client.sendMessage({
                username: this.username,
                message: line,
                timestamp: this.formatTime()
            }, (error) => {
                if (error) {
                    this.handleError(error);
                }
            });
        });
    }

    shutdown() {
        console.log(`\n${this.colors.system}Disconnecting from chat. Goodbye!${this.colors.reset}`);
        if (this.currentCall) {
            try {
                this.currentCall.cancel();
            } catch (err) {
                // Ignore errors during shutdown
            }
        }
        this.rl.close();
        process.exit(0);
    }

    colors = {
        system: '\x1b[33m',    // yellow
        timestamp: '\x1b[36m', // cyan
        username: '\x1b[32m',  // green
        error: '\x1b[31m',     // red
        reset: '\x1b[0m'       // reset
    };
}

const chatClient = new ChatClient();
chatClient.connect();

process.on('SIGINT', () => {
    chatClient.shutdown();
});
