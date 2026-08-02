// ===== mqtt-network.js — Real-time networking via MQTT =====
// Uses free public MQTT broker (no signup needed)

class MqttNetwork {
    constructor() {
        this.client = null;
        this.roomCode = '';
        this.myId = '';
        this.isHost = false;
        this.isSolo = false;
        this.connected = false;
        this.players = new Map(); // id -> {name, color}
        this.onMessage = null;   // callback(msg)
        this.onConnect = null;   // callback()
        this.onError = null;     // callback(err)
        
        // Free public MQTT brokers (fallback list)
        this.brokers = [
            'wss://broker.emqx.io:8084/mqtt',
            'wss://mqtt.eclipseprojects.io:443/mqtt',
            'wss://test.mosquitto.org:8081/mqtt'
        ];
    }

    // Generate unique player ID
    generateId() {
        return 'p' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    }

    // ===== SOLO MODE =====
    connectSolo() {
        this.isSolo = true;
        this.isHost = true;
        this.myId = this.generateId();
        this.roomCode = 'solo';
        this.connected = true;
        if (this.onConnect) this.onConnect();
    }

    // ===== MULTIPLAYER =====
    connect(roomCode, playerName, playerColor) {
        this.isSolo = false;
        this.roomCode = roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        this.myId = this.generateId();
        this.playerName = playerName;
        this.playerColor = playerColor;

        const topic = `dnd-online/${this.roomCode}`;

        // Try brokers in order
        this._tryConnect(0, topic);
    }

    _tryConnect(brokerIndex, topic) {
        if (brokerIndex >= this.brokers.length) {
            if (this.onError) this.onError('Не удалось подключиться. Попробуйте "Играть одному".');
            return;
        }

        const brokerUrl = this.brokers[brokerIndex];
        console.log(`[MQTT] Trying broker ${brokerIndex + 1}: ${brokerUrl}`);

        try {
            this.client = mqtt.connect(brokerUrl, {
                clientId: 'dnd_' + this.myId + '_' + Math.random().toString(36).substring(2, 8),
                clean: true,
                connectTimeout: 8000,
                reconnectPeriod: 3000,
                keepalive: 30
            });

            this.client.on('connect', () => {
                console.log('[MQTT] Connected to broker!');
                this.connected = true;

                // Subscribe to room topic
                this.client.subscribe(topic + '/#', { qos: 0 }, (err) => {
                    if (err) {
                        console.error('[MQTT] Subscribe error:', err);
                        return;
                    }
                    console.log('[MQTT] Subscribed to:', topic);

                    // Announce myself
                    this.publish('join', {
                        playerId: this.myId,
                        name: this.playerName,
                        color: this.playerColor,
                        timestamp: Date.now()
                    });

                    if (this.onConnect) this.onConnect();
                });
            });

            this.client.on('message', (receivedTopic, message) => {
                try {
                    const msg = JSON.parse(message.toString());
                    const subTopic = receivedTopic.replace(topic + '/', '');
                    msg._subTopic = subTopic;
                    if (this.onMessage) this.onMessage(msg);
                } catch (e) {
                    console.error('[MQTT] Parse error:', e);
                }
            });

            this.client.on('error', (err) => {
                console.error('[MQTT] Error:', err);
                // Try next broker
                this.client.end(true);
                this._tryConnect(brokerIndex + 1, topic);
            });

            this.client.on('close', () => {
                console.log('[MQTT] Connection closed');
                this.connected = false;
            });

            this.client.on('reconnect', () => {
                console.log('[MQTT] Reconnecting...');
            });

        } catch (e) {
            console.error('[MQTT] Connection failed:', e);
            this._tryConnect(brokerIndex + 1, topic);
        }
    }

    // Publish message to room
    publish(type, data) {
        if (this.isSolo) return;

        const topic = `dnd-online/${this.roomCode}/${type}`;
        const msg = {
            ...data,
            type: type,
            from: this.myId,
            timestamp: Date.now()
        };

        if (this.client && this.connected) {
            this.client.publish(topic, JSON.stringify(msg), { qos: 0 });
        }
    }

    // Disconnect
    disconnect() {
        if (this.client) {
            this.publish('leave', { playerId: this.myId });
            this.client.end(true);
            this.client = null;
        }
        this.connected = false;
        this.isSolo = false;
    }
}
