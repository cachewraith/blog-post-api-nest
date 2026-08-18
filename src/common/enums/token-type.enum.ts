/**
 * Discriminates JWTs by intent. Every issued token carries this in its payload
 * so an access token can never be replayed where a refresh or reset token is
 * expected (and vice versa).
 */
export enum TokenType {
  Access = 'access',
  Refresh = 'refresh',
  PasswordReset = 'password_reset',
}
