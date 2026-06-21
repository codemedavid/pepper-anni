import { createHmac, randomUUID } from 'crypto';

// Authentication endpoint for ImageKit client-side uploads.
// The private key NEVER reaches the browser — it is only read here, server-side.
// The browser calls this to obtain { token, expire, signature }, then POSTs the
// file directly to ImageKit's upload API together with the public key.
//
// Signature spec: HMAC-SHA1(token + expire, privateKey) — see
// https://imagekit.io/docs/api-reference/upload-file/client-side-file-upload

const TOKEN_VALIDITY_SECONDS = 30 * 60; // 30 minutes (ImageKit requires < 1 hour)

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
        console.error('ImageKit auth failed: IMAGEKIT_PRIVATE_KEY is not configured');
        return res.status(500).json({ error: 'Image upload is not configured on the server.' });
    }

    try {
        const token = randomUUID();
        const expire = Math.floor(Date.now() / 1000) + TOKEN_VALIDITY_SECONDS;
        const signature = createHmac('sha1', privateKey)
            .update(token + expire)
            .digest('hex');

        // These params are short-lived and safe to expose to the client.
        return res.status(200).json({ token, expire, signature });
    } catch (error: any) {
        console.error('ImageKit auth failed:', error?.message);
        return res.status(500).json({ error: 'Failed to authenticate upload.' });
    }
}
