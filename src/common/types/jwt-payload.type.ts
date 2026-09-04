import { Role } from '@prisma/client';

/** Claims embedded in a signed access token. */
export interface AccessTokenPayload {
  sub: string; // User.id
  tenantId: string;
  role: Role;
  email: string;
}

/** Claims embedded in a signed refresh token. `jti` is the RefreshToken row id. */
export interface RefreshTokenPayload {
  sub: string; // User.id
  jti: string; // RefreshToken.id
  tenantId: string;
}

/** Shape of `req.user` after JwtAuthGuard has run. */
export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: Role;
  email: string;
}
