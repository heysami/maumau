import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyPairedOperatorToken } from "../infra/device-pairing.js";
import {
  AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN,
  AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
  type AuthRateLimiter,
} from "./auth-rate-limit.js";
import { authorizeHttpGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendGatewayAuthFailure } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { resolveRequestClientIp } from "./net.js";

const HTTP_DEVICE_AUTH_REQUIRED_SCOPES = ["operator.admin"] as const;

export async function authorizeGatewayBearerRequestOrReply(params: {
  req: IncomingMessage;
  res: ServerResponse;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
}): Promise<boolean> {
  const token = getBearerToken(params.req);
  const clientIp =
    resolveRequestClientIp(
      params.req,
      params.trustedProxies,
      params.allowRealIpFallback === true,
    ) ?? params.req.socket?.remoteAddress;
  const sharedRateLimiter = token ? undefined : params.rateLimiter;
  const sharedAuthResult = await authorizeHttpGatewayConnect({
    auth: params.auth,
    connectAuth: token ? { token, password: token } : null,
    req: params.req,
    trustedProxies: params.trustedProxies,
    allowRealIpFallback: params.allowRealIpFallback,
    rateLimiter: sharedRateLimiter,
    clientIp,
    rateLimitScope: AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
  });

  if (sharedAuthResult.ok) {
    if (token && params.rateLimiter) {
      const rateCheck = params.rateLimiter.check(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
      if (!rateCheck.allowed) {
        sendGatewayAuthFailure(params.res, {
          ok: false,
          reason: "rate_limited",
          rateLimited: true,
          retryAfterMs: rateCheck.retryAfterMs,
        });
        return false;
      }
      params.rateLimiter.reset(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
    }
    return true;
  }

  if (token) {
    if (params.rateLimiter) {
      const deviceRateCheck = params.rateLimiter.check(
        clientIp,
        AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN,
      );
      if (!deviceRateCheck.allowed) {
        sendGatewayAuthFailure(params.res, {
          ok: false,
          reason: "rate_limited",
          rateLimited: true,
          retryAfterMs: deviceRateCheck.retryAfterMs,
        });
        return false;
      }
    }

    const deviceAuthResult = await verifyPairedOperatorToken({
      token,
      requiredScopes: [...HTTP_DEVICE_AUTH_REQUIRED_SCOPES],
    });
    if (deviceAuthResult.ok) {
      params.rateLimiter?.reset(clientIp, AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
      return true;
    }

    params.rateLimiter?.recordFailure(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
    params.rateLimiter?.recordFailure(clientIp, AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
  }

  if (!sharedAuthResult.ok) {
    sendGatewayAuthFailure(params.res, sharedAuthResult);
    return false;
  }
  return false;
}
