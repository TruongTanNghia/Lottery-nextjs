/**
 * Who may talk to the bot.
 *
 * The list lives in the database, not in an env var, because adding a person
 * used to mean editing Vercel and redeploying the whole app. Now a stranger
 * messages the bot, an admin taps a button, and they are in.
 *
 * Admins themselves stay in the environment: that list is the bootstrap, it
 * changes almost never, and it must not be editable by anything the bot does.
 */
import { getConfigValue, setConfigValue } from "@/lib/db";

const KEY = "telegram:users";

export type UserStatus = "pending" | "allowed" | "blocked";

export interface BotUser {
  id: string;
  name: string;
  username: string | null;
  status: UserStatus;
  /** ISO date, for the "ai đang dùng bot" listing. */
  since: string;
}

/**
 * Bootstrap admins. Reads TELEGRAM_ADMIN_CHAT_IDS, falling back to the older
 * TELEGRAM_ALLOWED_CHAT_IDS so an existing deployment keeps working and
 * whoever was on it becomes an admin rather than being locked out.
 */
export function adminIds(): Set<string> {
  const raw =
    process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_ALLOWED_CHAT_IDS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isAdmin(id: number | string): boolean {
  return adminIds().has(String(id));
}

export async function loadUsers(): Promise<BotUser[]> {
  const raw = await getConfigValue(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BotUser[]) : [];
  } catch {
    return [];
  }
}

async function saveUsers(users: BotUser[]): Promise<void> {
  await setConfigValue(KEY, JSON.stringify(users));
}

export async function getUser(id: number | string): Promise<BotUser | undefined> {
  const key = String(id);
  return (await loadUsers()).find((u) => u.id === key);
}

/** Admins are always in, whatever the table says. */
export async function canUse(id: number | string): Promise<boolean> {
  if (isAdmin(id)) return true;
  return (await getUser(id))?.status === "allowed";
}

/**
 * Records a first-time knock.
 *
 * Returns whether this is a NEW request, so repeated messages from someone
 * still waiting do not page the admin over and over.
 */
export async function requestAccess(
  id: number | string,
  name: string,
  username: string | null
): Promise<{ user: BotUser; isNew: boolean }> {
  const key = String(id);
  const users = await loadUsers();
  const found = users.find((u) => u.id === key);

  if (found) {
    // Keep the display name fresh; people rename themselves.
    found.name = name || found.name;
    found.username = username ?? found.username;
    await saveUsers(users);
    return { user: found, isNew: false };
  }

  const user: BotUser = {
    id: key,
    name,
    username,
    status: "pending",
    since: new Date().toISOString().slice(0, 10),
  };
  users.push(user);
  await saveUsers(users);
  return { user, isNew: true };
}

export async function setStatus(
  id: number | string,
  status: UserStatus
): Promise<BotUser | undefined> {
  const key = String(id);
  const users = await loadUsers();
  const found = users.find((u) => u.id === key);
  if (!found) return undefined;
  found.status = status;
  await saveUsers(users);
  return found;
}

/** Removes someone entirely, so a later message counts as a fresh request. */
export async function forgetUser(id: number | string): Promise<boolean> {
  const key = String(id);
  const users = await loadUsers();
  const next = users.filter((u) => u.id !== key);
  if (next.length === users.length) return false;
  await saveUsers(next);
  return true;
}
