import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";
import { logger } from "@/lib/server/logger";
import { generateState, storeOAuthState } from "@/lib/server/services/oauth";
import { getGoogleAuthUrl } from "@/lib/server/services/oauth/google";

/** Base URL for this request (so OAuth works when app runs on any port). */
function getRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return getConfig().APP_URL.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const redirectUri =
    req.nextUrl.searchParams.get("redirect_uri") || `${origin}/oauth-callback`;
  const state = generateState();
  logger.info("Google OAuth start", { redirectUri });
  await storeOAuthState(state, { redirectUri });
  const callbackUrl = `${origin}/api/auth/google/callback`;
  logger.info("Google OAuth redirect_uri sent to Google", { callbackUrl });
  const authUrl = getGoogleAuthUrl(state, callbackUrl);
  return NextResponse.redirect(authUrl);
}
