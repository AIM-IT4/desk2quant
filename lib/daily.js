// Daily.co rooms for paid sessions. Enabled only when DAILY_API_KEY is set;
// otherwise sessions keep using the stored meet.jit.si link.
//
// Rooms are private with knocking on: learners (no token) must ask to join and
// only the host, who gets an owner token, can let them in. This is what
// meet.jit.si cannot guarantee -- there, whoever signs in first is moderator.

const DAILY_API = 'https://api.daily.co/v1';
const ROOM_TTL_SECONDS = 4 * 3600;

export function dailyEnabled() {
    return !!process.env.DAILY_API_KEY;
}

async function daily(path, method = 'GET', body) {
    const resp = await fetch(`${DAILY_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
}

function roomProperties() {
    return {
        exp: Math.floor(Date.now() / 1000) + ROOM_TTL_SECONDS,
        enable_knocking: true,
        enable_prejoin_ui: true,
        eject_at_room_exp: true
    };
}

// One room per booking, created on first join. A room left over from an
// earlier date (e.g. before a reschedule) is given a fresh expiry.
export async function ensureDailyRoom(bookingId) {
    const name = `d2q-${String(bookingId).toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
    let room = await daily(`/rooms/${name}`);
    if (room.status === 404) {
        room = await daily('/rooms', 'POST', { name, privacy: 'private', properties: roomProperties() });
    } else if (room.ok && (room.data?.config?.exp || 0) < Math.floor(Date.now() / 1000) + 3600) {
        room = await daily(`/rooms/${name}`, 'POST', { privacy: 'private', properties: roomProperties() });
    }
    if (!room.ok || !room.data?.url) throw new Error(`Daily room request failed (${room.status})`);
    return { name, url: room.data.url };
}

export async function createDailyOwnerToken(roomName, userName) {
    const resp = await daily('/meeting-tokens', 'POST', {
        properties: {
            room_name: roomName,
            is_owner: true,
            user_name: String(userName || 'Desk2Quant Mentor').slice(0, 100),
            exp: Math.floor(Date.now() / 1000) + ROOM_TTL_SECONDS
        }
    });
    if (!resp.ok || !resp.data?.token) throw new Error(`Daily token request failed (${resp.status})`);
    return resp.data.token;
}
