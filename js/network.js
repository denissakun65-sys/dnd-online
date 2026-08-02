// ===== network.js — Stable MQTT networking =====
// Key fix: player ID is set ONCE in connect(), game.js uses network.myId

class Network {
    constructor() {
        this.client = null;
        this.roomCode = '';
        this.myId = null;       // Set ONCE in connect/connectSolo
        this.myName = '';
        this.myColor = '';
        this.isHost = false;
        this.isSolo = false;
        this.connected = false;
        this.onMessage = null;  // (msg)
        this.onConnect = null;  // ()
        this.onError = null;    // (err)
        this._connectFired = false;  // Prevent double onConnect

        this.brokers = [
            'wss://broker.emqx.io:8084/mqtt',
            'wss://mqtt.eclipseprojects.io:443/mqtt',
            'wss://test.mosquitto.org:8081/mqtt'
        ];
    }

    _genId() {
        return 'p' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    // ===== SOLO MODE =====
    connectSolo() {
        this.isSolo = true;
        this.isHost = true;
        this.myId = this._genId();
        this.myName = 'Solo';
        this.myColor = '#e74c3c';
        this.roomCode = 'solo';
        this.connected = true;
        this._connectFired = false;
        if (this.onConnect) this.onConnect();
        this._connectFired = true;
    }

    // ===== MULTIPLAYER =====
    connect(roomCode, playerName, playerColor) {
        this.isSolo = false;
        this.roomCode = roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        this.myId = this._genId();       // ONE source of truth
        this.myName = playerName;
        this.myColor = playerColor;
        this._connectFired = false;

        const topic = `dnd-online/${this.roomCode}`;
        this._tryConnect(0, topic);
    }

    _tryConnect(brokerIndex, topic) {
        if (brokerIndex >= this.brokers.length) {
            if (this.onError) this.onError('Не удалось подключиться. Попробуйте "Одиночка".');
            return;
        }

        const brokerUrl = this.brokers[brokerIndex];
        console.log(`[NET] Trying broker ${brokerIndex + 1}: ${brokerUrl}`);

        try {
            this.client = mqtt.connect(brokerUrl, {
                clientId: 'dnd_' + this.myId + '_' + Math.random().toString(36).substr(2, 6),
                clean: true,
                connectTimeout: 10000,
                reconnectPeriod: 5000,
                keepalive: 30
            });

            this.client.on('connect', () => {
                console.log('[NET] Connected to broker');
                this.connected = true;

                this.client.subscribe(topic + '/#', { qos: 0 }, (err) => {
                    if (err) { console.error('[NET] Subscribe error:', err); return; }
                    console.log('[NET] Subscribed to:', topic);

                    // Announce myself (other players will see this)
                    this.publish('join', {
                        playerId: this.myId,
                        name: this.myName,
                        color: this.myColor
                    });

                    // Fire onConnect ONCE
                    if (!this._connectFired && this.onConnect) {
                        this.onConnect();
                        this._connectFired = true;
                    }
                });
            });

            this.client.on('message', (receivedTopic, message) => {
                try {
                    const msg = JSON.parse(message.toString());
                    if (this.onMessage) this.onMessage(msg);
                } catch (e) {
                    console.error('[NET] Parse error:', e);
                }
            });

            this.client.on('error', (err) => {
                console.error('[NET] Error:', err);
                if (this.client) {
                    this.client.end(true);
                    this.client = null;
                }
                this._tryConnect(brokerIndex + 1, topic);
            });

            this.client.on('close', () => {
                console.log('[NET] Connection closed');
                this.connected = false;
            });

            this.client.on('reconnect', () => {
                console.log('[NET] Reconnecting...');
            });

        } catch (e) {
            console.error('[NET] Connection failed:', e);
            this._tryConnect(brokerIndex + 1, topic);
        }
    }

    publish(type, data) {
        if (this.isSolo) return;  // Solo: no network needed

        const topic = `dnd-online/${this.roomCode}/${type}`;
        const msg = {
            ...data,
            type: type,
            from: this.myId,     // Always include sender ID
            ts: Date.now()
        };

        if (this.client && this.connected) {
            this.client.publish(topic, JSON.stringify(msg), { qos: 0 });
        }
    }

    disconnect() {
        if (this.client) {
            this.publish('leave', { playerId: this.myId, name: this.myName });
            this.client.end(true);
            this.client = null;
        }
        this.connected = false;
    }
}
