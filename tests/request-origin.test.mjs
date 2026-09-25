import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin } from '../lib/request-origin.ts';

test('origin validation uses the public host and preserves cross-site protection', () => {
    const request = (origin, host='127.0.0.1:5173') => new Request('http://localhost:5173/api/auth', {
        headers: { host, ...(origin === undefined ? {} : { origin }) },
    });
    assert.equal(isSameOrigin(request('http://127.0.0.1:5173')), true);
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://127.0.0.1:9999', 'https://127.0.0.1:5173', 'http://127.0.0.1:5173/path', 'garbage']) {
        assert.equal(isSameOrigin(request(origin)), false, String(origin));
    }
    assert.equal(isSameOrigin(new Request('https://scimentor.example/api/auth', { headers: { origin: 'https://scimentor.example', host:'scimentor.example' } })), true);
});

test('Vercel TLS forwarding does not trust a forwarded host', () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = '1';
    try {
        const headers = { host:'scimentor.example', 'x-forwarded-proto':'https', 'x-forwarded-host':'evil.example', origin:'https://scimentor.example' };
        assert.equal(isSameOrigin(new Request('http://internal/api/auth', {headers})), true);
        headers.origin='https://evil.example';
        assert.equal(isSameOrigin(new Request('http://internal/api/auth', {headers})), false);
    } finally {
        if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL=previous;
    }
});
