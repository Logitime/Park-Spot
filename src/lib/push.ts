import { prisma } from "./prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  sound?: "default" | null;
}

async function sendToExpo(messages: ExpoMessage[]) {
  if (messages.length === 0) return 0;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let delivered = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        delivered += chunk.length;
      } else {
        console.warn(
          `[push:send] expo responded ${res.status}: ${await res.text()}`
        );
      }
    } catch (error) {
      console.error("[push:send] request failed:", error);
    }
  }
  return delivered;
}

export async function sendPushNotification(args: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: args.userId },
    select: { token: true },
  });

  if (tokens.length === 0) {
    return 0;
  }

  const delivered = await sendToExpo(
    tokens.map((t) => ({
      to: t.token,
      title: args.title,
      body: args.body,
      data: args.data,
      sound: "default",
    }))
  );

  if (delivered === 0 && !process.env.EXPO_ACCESS_TOKEN) {
    console.warn(
      "[push:send] no Expo access token configured (set EXPO_ACCESS_TOKEN)."
    );
  }

  return delivered;
}