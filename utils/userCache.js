// Lightweight in-memory cache for per-user info (name, phone) needed by socket
// event handlers. Populated on socket connection; cleared on disconnect.
// For multi-instance deployments, this should be replaced with Redis.

const userInfoById = new Map();

function setUserInfo(userId, info) {
  if (!userId) return;
  userInfoById.set(String(userId), {
    name: info && info.name,
    phone: info && info.phone,
  });
}

function getUserInfo(userId) {
  if (!userId) return null;
  return userInfoById.get(String(userId)) || null;
}

function clearUserInfo(userId) {
  if (!userId) return;
  userInfoById.delete(String(userId));
}

module.exports = { setUserInfo, getUserInfo, clearUserInfo };
