import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client';

const router = Router();
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const jwtSecret = process.env.JWT_SECRET || 'reachinbox_secret';
const client = new OAuth2Client(googleClientId);

// Utility to create JWT token
function createSessionToken(user: { id: string; email: string; name: string; avatar: string | null }) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

// GET /api/auth/google/config - Return client ID & auth info
router.get('/google/config', (_req: Request, res: Response) => {
  res.json({
    clientId: googleClientId,
    configured: Boolean(googleClientId && googleClientId !== 'your-google-client-id.apps.googleusercontent.com'),
  });
});

// POST /api/auth/google - Real Google OAuth ID Token verification
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, credentialToken } = req.body;
    const token = credential || credentialToken;

    if (!token) {
      return res.status(400).json({ error: 'Google credential token is required' });
    }

    let payload: any = null;

    if (googleClientId && googleClientId !== 'your-google-client-id.apps.googleusercontent.com') {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } else {
      // Decode unverified jwt token if client ID is mock/testing
      const decoded: any = jwt.decode(token);
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
    const user = await prisma.user.upsert({
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
  } catch (err: any) {
    console.error('[Auth API] Google OAuth verify error:', err);
    res.status(500).json({ error: err?.message || 'Google OAuth verification failed' });
  }
});

// POST /api/auth/demo - Instant Demo Login
router.post('/demo', async (_req: Request, res: Response) => {
  try {
    const demoUser = await prisma.user.upsert({
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Demo login error' });
  }
});

// GET /api/auth/me - Get logged-in user profile
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      user: {
        id: user.id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
