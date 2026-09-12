"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("../db/client");
const router = (0, express_1.Router)();
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const jwtSecret = process.env.JWT_SECRET || 'reachinbox_secret';
const client = new google_auth_library_1.OAuth2Client(googleClientId);
// Utility to create JWT token
function createSessionToken(user) {
    return jsonwebtoken_1.default.sign({
        userId: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
    }, jwtSecret, { expiresIn: '7d' });
}
// GET /api/auth/google/config - Return client ID & auth info
router.get('/google/config', (_req, res) => {
    res.json({
        clientId: googleClientId,
        configured: Boolean(googleClientId && googleClientId !== 'your-google-client-id.apps.googleusercontent.com'),
    });
});
// POST /api/auth/google - Real Google OAuth ID Token verification
router.post('/google', async (req, res) => {
    try {
        const { credential, credentialToken } = req.body;
        const token = credential || credentialToken;
        if (!token) {
            return res.status(400).json({ error: 'Google credential token is required' });
        }
        let payload = null;
        if (googleClientId && googleClientId !== 'your-google-client-id.apps.googleusercontent.com') {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: googleClientId,
            });
            payload = ticket.getPayload();
        }
        else {
            // Decode unverified jwt token if client ID is mock/testing
            const decoded = jsonwebtoken_1.default.decode(token);
            payload = decoded || {
                sub: 'google-demo-id',
                email: 'user@reachinbox.ai',
                name: 'ReachInbox Demo User',
                picture: 'https://lh3.googleusercontent.com/a/default-user',
            };
        }
        if (!payload || !payload.email) {
            return res.status(401).json({ error: 'Invalid Google token payload' });
        }
        const { sub: googleId, email, name, picture: avatar } = payload;
        // Upsert user in relational DB
        const user = await client_1.prisma.user.upsert({
            where: { googleId },
            update: { name: name || 'User', avatar: avatar || null },
            create: {
                googleId,
                email,
                name: name || 'User',
                avatar: avatar || null,
            },
        });
        const sessionToken = createSessionToken(user);
        res.json({
            success: true,
            token: sessionToken,
            user: {
                id: user.id,
                googleId: user.googleId,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
            },
        });
    }
    catch (err) {
        console.error('[Auth API] Google OAuth verify error:', err);
        res.status(500).json({ error: err?.message || 'Google OAuth verification failed' });
    }
});
// POST /api/auth/demo - Instant Demo Login
router.post('/demo', async (_req, res) => {
    try {
        const demoUser = await client_1.prisma.user.upsert({
            where: { googleId: 'demo-google-id-123' },
            update: { name: 'Demo Candidate', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=reachinbox' },
            create: {
                googleId: 'demo-google-id-123',
                email: 'candidate@reachinbox.ai',
                name: 'Demo Candidate',
                avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=reachinbox',
            },
        });
        const token = createSessionToken(demoUser);
        res.json({
            success: true,
            token,
            user: {
                id: demoUser.id,
                googleId: demoUser.googleId,
                email: demoUser.email,
                name: demoUser.name,
                avatar: demoUser.avatar,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Demo login error' });
    }
});
// GET /api/auth/me - Get logged-in user profile
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const user = await client_1.prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({
            user: {
                id: user.id,
                googleId: user.googleId,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
            },
        });
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});
exports.default = router;
