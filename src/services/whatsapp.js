const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

class WhatsAppSession {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.socket = null;
        this.qrCode = null;
        this.connectionStatus = 'disconnected';
        this.authFolder = path.join(process.cwd(), 'sessions', sessionId);
        this.phoneNumber = null;
        this.name = null;
    }

    async connect() {
        try {
            // Pastikan folder auth ada
            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
            const { version } = await fetchLatestBaileysVersion();

            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: true,
                logger: pino({ level: 'silent' }),
                browser: ['Chatery API', 'Chrome', '1.0.0'],
                syncFullHistory: true
            });

            // Event listener untuk connection update
            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    // Generate QR Code sebagai base64 image
                    this.qrCode = await qrcode.toDataURL(qr);
                    this.connectionStatus = 'qr_ready';
                    console.log(`📱 [${this.sessionId}] QR Code generated! Scan dengan WhatsApp Anda.`);
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`❌ [${this.sessionId}] Connection closed:`, lastDisconnect?.error?.message);
                    this.connectionStatus = 'disconnected';
                    this.qrCode = null;
                    
                    if (shouldReconnect) {
                        console.log(`🔄 [${this.sessionId}] Reconnecting...`);
                        setTimeout(() => this.connect(), 5000);
                    } else {
                        console.log(`🚪 [${this.sessionId}] Logged out.`);
                        this.deleteAuthFolder();
                    }
                } else if (connection === 'open') {
                    console.log(`✅ [${this.sessionId}] WhatsApp Connected Successfully!`);
                    this.connectionStatus = 'connected';
                    this.qrCode = null;
                    
                    // Get user info
                    if (this.socket.user) {
                        this.phoneNumber = this.socket.user.id.split(':')[0];
                        this.name = this.socket.user.name || 'Unknown';
                        console.log(`👤 [${this.sessionId}] Connected as: ${this.name} (${this.phoneNumber})`);
                    }
                } else if (connection === 'connecting') {
                    console.log(`🔄 [${this.sessionId}] Connecting to WhatsApp...`);
                    this.connectionStatus = 'connecting';
                }
            });

            // Save credentials ketika diupdate
            this.socket.ev.on('creds.update', saveCreds);

            // Event listener untuk pesan masuk
            this.socket.ev.on('messages.upsert', async (m) => {
                const message = m.messages[0];
                if (!message.key.fromMe && m.type === 'notify') {
                    console.log(`📩 [${this.sessionId}] New message from:`, message.key.remoteJid);
                    console.log('Message:', message.message?.conversation || message.message?.extendedTextMessage?.text || '[Media/Other]');
                }
            });

            return { success: true, message: 'Initializing connection...' };
        } catch (error) {
            console.error(`[${this.sessionId}] Error connecting:`, error);
            this.connectionStatus = 'error';
            return { success: false, message: error.message };
        }
    }

    getInfo() {
        return {
            sessionId: this.sessionId,
            status: this.connectionStatus,
            isConnected: this.connectionStatus === 'connected',
            phoneNumber: this.phoneNumber,
            name: this.name,
            qrCode: this.qrCode
        };
    }

    async logout() {
        try {
            if (this.socket) {
                await this.socket.logout();
                this.socket = null;
            }
            this.deleteAuthFolder();
            this.connectionStatus = 'disconnected';
            this.qrCode = null;
            this.phoneNumber = null;
            this.name = null;
            return { success: true, message: 'Logged out successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    deleteAuthFolder() {
        try {
            if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
                console.log(`🗑️ [${this.sessionId}] Auth folder deleted`);
            }
        } catch (error) {
            console.error(`[${this.sessionId}] Error deleting auth folder:`, error);
        }
    }

    getSocket() {
        return this.socket;
    }

    // Format nomor telepon ke format WhatsApp
    formatPhoneNumber(phone) {
        let formatted = phone.replace(/\D/g, '');
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        }
        if (!formatted.includes('@')) {
            formatted = formatted + '@s.whatsapp.net';
        }
        return formatted;
    }

    // Kirim pesan teks
    async sendTextMessage(to, message) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, { text: message });
            
            return { 
                success: true, 
                message: 'Message sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Kirim gambar
    async sendImage(to, imageUrl, caption = '') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                image: { url: imageUrl },
                caption: caption
            });

            return {
                success: true,
                message: 'Image sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Kirim dokumen/file
    async sendDocument(to, documentUrl, filename, mimetype = 'application/pdf') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                document: { url: documentUrl },
                fileName: filename,
                mimetype: mimetype
            });

            return {
                success: true,
                message: 'Document sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Kirim lokasi
    async sendLocation(to, latitude, longitude, name = '') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                location: {
                    degreesLatitude: latitude,
                    degreesLongitude: longitude,
                    name: name
                }
            });

            return {
                success: true,
                message: 'Location sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Kirim kontak
    async sendContact(to, contactName, contactPhone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${contactPhone}:+${contactPhone}\nEND:VCARD`;
            
            const result = await this.socket.sendMessage(jid, {
                contacts: {
                    displayName: contactName,
                    contacts: [{ vcard }]
                }
            });

            return {
                success: true,
                message: 'Contact sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Kirim button (interactive message)
    async sendButton(to, text, footer, buttons) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                text: text,
                footer: footer,
                buttons: buttons.map((btn, idx) => ({
                    buttonId: `btn_${idx}`,
                    buttonText: { displayText: btn },
                    type: 1
                })),
                headerType: 1
            });

            return {
                success: true,
                message: 'Button message sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Cek apakah nomor terdaftar di WhatsApp
    async isRegistered(phone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(phone);
            const [result] = await this.socket.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
            
            return {
                success: true,
                data: {
                    phone: phone,
                    isRegistered: !!result?.exists,
                    jid: result?.jid || null
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Get profile picture URL
    async getProfilePicture(phone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(phone);
            const ppUrl = await this.socket.profilePictureUrl(jid, 'image');
            
            return {
                success: true,
                data: {
                    phone: phone,
                    profilePicture: ppUrl
                }
            };
        } catch (error) {
            return { 
                success: true, 
                data: { 
                    phone: phone, 
                    profilePicture: null 
                } 
            };
        }
    }
}

class WhatsAppManager {
    constructor() {
        this.sessions = new Map();
        this.sessionsFolder = path.join(process.cwd(), 'sessions');
        this.initExistingSessions();
    }

    // Load existing sessions on startup
    async initExistingSessions() {
        try {
            if (!fs.existsSync(this.sessionsFolder)) {
                fs.mkdirSync(this.sessionsFolder, { recursive: true });
                return;
            }

            const sessionDirs = fs.readdirSync(this.sessionsFolder);
            for (const sessionId of sessionDirs) {
                const sessionPath = path.join(this.sessionsFolder, sessionId);
                if (fs.statSync(sessionPath).isDirectory()) {
                    console.log(`🔄 Restoring session: ${sessionId}`);
                    const session = new WhatsAppSession(sessionId);
                    this.sessions.set(sessionId, session);
                    await session.connect();
                }
            }
        } catch (error) {
            console.error('Error initializing sessions:', error);
        }
    }

    async createSession(sessionId) {
        // Validate session ID
        if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
            return { success: false, message: 'Invalid session ID. Use only letters, numbers, underscore, and dash.' };
        }

        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            const existingSession = this.sessions.get(sessionId);
            if (existingSession.connectionStatus === 'connected') {
                return { success: false, message: 'Session already connected', data: existingSession.getInfo() };
            }
            // Reconnect existing session
            await existingSession.connect();
            return { success: true, message: 'Reconnecting existing session', data: existingSession.getInfo() };
        }

        // Create new session
        const session = new WhatsAppSession(sessionId);
        this.sessions.set(sessionId, session);
        await session.connect();

        return { success: true, message: 'Session created', data: session.getInfo() };
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getAllSessions() {
        const sessionsInfo = [];
        for (const [sessionId, session] of this.sessions) {
            sessionsInfo.push(session.getInfo());
        }
        return sessionsInfo;
    }

    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, message: 'Session not found' };
        }

        await session.logout();
        this.sessions.delete(sessionId);
        return { success: true, message: 'Session deleted successfully' };
    }

    getSessionQR(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        return session.getInfo();
    }
}

// Singleton instance
const whatsappManager = new WhatsAppManager();

module.exports = whatsappManager;
