const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Import Routes
const whatsappRoutes = require('./src/routes/whatsapp');

// Import WebSocket Manager
const wsManager = require('./src/services/websocket/WebSocketManager');

// Initialize WebSocket
wsManager.initialize(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*'
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder (for media access)
app.use('/media', express.static(path.join(__dirname, 'public', 'media')));

// Serve Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve WebSocket test page
app.get('/ws-test', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'websocket-test.html'));
});

// Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Chatery WhatsApp API',
        version: '1.0.0',
        endpoints: {
            sessions: {
                list: 'GET /api/whatsapp/sessions',
                connect: 'POST /api/whatsapp/sessions/:sessionId/connect { metadata?, webhooks[]? }',
                status: 'GET /api/whatsapp/sessions/:sessionId/status',
                updateConfig: 'PATCH /api/whatsapp/sessions/:sessionId/config { metadata?, webhooks[]? }',
                addWebhook: 'POST /api/whatsapp/sessions/:sessionId/webhooks { url, events[]? }',
                removeWebhook: 'DELETE /api/whatsapp/sessions/:sessionId/webhooks { url }',
                qrCode: 'GET /api/whatsapp/sessions/:sessionId/qr',
                qrImage: 'GET /api/whatsapp/sessions/:sessionId/qr/image',
                delete: 'DELETE /api/whatsapp/sessions/:sessionId'
            },
            chat: {
                sendText: 'POST /api/whatsapp/chats/send-text { sessionId, chatId, message, typingTime? }',
                sendImage: 'POST /api/whatsapp/chats/send-image { sessionId, chatId, imageUrl, caption?, typingTime? }',
                sendDocument: 'POST /api/whatsapp/chats/send-document { sessionId, chatId, documentUrl, filename, mimetype?, typingTime? }',
                sendLocation: 'POST /api/whatsapp/chats/send-location { sessionId, chatId, latitude, longitude, name?, typingTime? }',
                sendContact: 'POST /api/whatsapp/chats/send-contact { sessionId, chatId, contactName, contactPhone, typingTime? }',
                sendButton: 'POST /api/whatsapp/chats/send-button { sessionId, chatId, text, footer?, buttons[], typingTime? }',
                sendPresenceUpdate: 'POST /api/whatsapp/chats/presence { sessionId, chatId, presence }',
                checkNumber: 'POST /api/whatsapp/chats/check-number { sessionId, phone }',
                profilePicture: 'POST /api/whatsapp/chats/profile-picture { sessionId, phone }',
                contactInfo: 'POST /api/whatsapp/chats/contact-info { sessionId, phone }'
            },
            history: {
                overview: 'POST /api/whatsapp/chats/overview { sessionId, limit?, offset?, type? }',
                contacts: 'POST /api/whatsapp/contacts { sessionId, limit?, offset?, search? }',
                messages: 'POST /api/whatsapp/chats/messages { sessionId, chatId, limit?, cursor? }',
                info: 'POST /api/whatsapp/chats/info { sessionId, chatId }',
                markRead: 'POST /api/whatsapp/chats/mark-read { sessionId, chatId, messageId? }'
            },
            groups: {
                list: 'POST /api/whatsapp/groups { sessionId }',
                create: 'POST /api/whatsapp/groups/create { sessionId, name, participants[] }',
                metadata: 'POST /api/whatsapp/groups/metadata { sessionId, groupId }',
                addParticipants: 'POST /api/whatsapp/groups/participants/add { sessionId, groupId, participants[] }',
                removeParticipants: 'POST /api/whatsapp/groups/participants/remove { sessionId, groupId, participants[] }',
                promoteParticipants: 'POST /api/whatsapp/groups/participants/promote { sessionId, groupId, participants[] }',
                demoteParticipants: 'POST /api/whatsapp/groups/participants/demote { sessionId, groupId, participants[] }',
                updateSubject: 'POST /api/whatsapp/groups/subject { sessionId, groupId, subject }',
                updateDescription: 'POST /api/whatsapp/groups/description { sessionId, groupId, description }',
                updateSettings: 'POST /api/whatsapp/groups/settings { sessionId, groupId, setting }',
                updatePicture: 'POST /api/whatsapp/groups/picture { sessionId, groupId, imageUrl }',
                leave: 'POST /api/whatsapp/groups/leave { sessionId, groupId }',
                join: 'POST /api/whatsapp/groups/join { sessionId, inviteCode }',
                getInviteCode: 'POST /api/whatsapp/groups/invite-code { sessionId, groupId }',
                revokeInvite: 'POST /api/whatsapp/groups/revoke-invite { sessionId, groupId }'
            },
            websocket: {
                info: 'WebSocket connection available at ws://localhost:PORT',
                events: [
                    'subscribe(sessionId) - Subscribe to session events',
                    'unsubscribe(sessionId) - Unsubscribe from session',
                    'qr - QR code generated',
                    'connection.update - Connection status changed',
                    'message - New message received',
                    'message.sent - Message sent confirmation',
                    'message.update - Message status update',
                    'message.revoke - Message deleted/revoked',
                    'chat.update - Chat updated',
                    'chat.upsert - New chat created',
                    'chat.delete - Chat deleted',
                    'contact.update - Contact updated',
                    'presence.update - Presence (typing, online)',
                    'group.participants - Group members update',
                    'group.update - Group info update',
                    'call - Incoming call',
                    'logged.out - Session logged out'
                ],
                stats: 'GET /api/websocket/stats'
            }
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Dashboard Login
app.post('/api/dashboard/login', (req, res) => {
    const { username, password } = req.body;
    
    const validUsername = process.env.DASHBOARD_USERNAME || 'admin';
    const validPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
    
    if (username === validUsername && password === validPassword) {
        res.json({
            success: true,
            message: 'Login successful'
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid username or password'
        });
    }
});

// WebSocket Stats
app.get('/api/websocket/stats', (req, res) => {
    res.json({
        success: true,
        data: wsManager.getStats()
    });
});

// WhatsApp Routes
app.use('/api/whatsapp', whatsappRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Chatery WhatsApp API running on http://localhost:${PORT}`);
    console.log(`WebSocket server running on ws://localhost:${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}`);
});
