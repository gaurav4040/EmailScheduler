"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHourWindowKey = getHourWindowKey;
exports.checkAndIncrementHourlyLimit = checkAndIncrementHourlyLimit;
exports.getCurrentHourlyUsage = getCurrentHourlyUsage;
// In-memory fallback map if Redis is temporarily unreachable
const memoryCounters = new Map();
function getHourWindowKey(sender, date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const hourKey = `${year}${month}${day}${hour}`;
    const key = `rate:${sender}:${hourKey}`;
    // Next hour calculation
    const nextHour = new Date(date);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    const msUntilNextHour = Math.max(1000, nextHour.getTime() - date.getTime());
    return { key, msUntilNextHour };
}
async function checkAndIncrementHourlyLimit(redis, sender, maxEmailsPerHour) {
    const { key, msUntilNextHour } = getHourWindowKey(sender);
    if (redis && redis.status === 'ready') {
        try {
            const count = await redis.incr(key);
            if (count === 1) {
                // Expire key after 1 hour + 5 minutes buffer
                await redis.expire(key, 3900);
            }
            if (count > maxEmailsPerHour) {
                return {
                    allowed: false,
                    count,
                    max: maxEmailsPerHour,
                    msUntilNextHour,
                };
            }
            return {
                allowed: true,
                count,
                max: maxEmailsPerHour,
                msUntilNextHour,
            };
        }
        catch (err) {
            console.warn('[HourlyLimiter] Redis error, falling back to memory counter:', err);
        }
    }
    // Memory fallback logic
    const now = Date.now();
    const resetAt = now + msUntilNextHour;
    const existing = memoryCounters.get(key);
    if (!existing || existing.resetAt <= now) {
        memoryCounters.set(key, { count: 1, resetAt });
        return { allowed: true, count: 1, max: maxEmailsPerHour, msUntilNextHour };
    }
    existing.count += 1;
    if (existing.count > maxEmailsPerHour) {
        return {
            allowed: false,
            count: existing.count,
            max: maxEmailsPerHour,
            msUntilNextHour,
        };
    }
    return {
        allowed: true,
        count: existing.count,
        max: maxEmailsPerHour,
        msUntilNextHour,
    };
}
async function getCurrentHourlyUsage(redis, sender) {
    const { key } = getHourWindowKey(sender);
    if (redis && redis.status === 'ready') {
        try {
            const val = await redis.get(key);
            return { count: val ? parseInt(val, 10) : 0, hourKey: key };
        }
        catch {
            // ignore
        }
    }
    const existing = memoryCounters.get(key);
    return { count: existing ? existing.count : 0, hourKey: key };
}
