export {
  COOKIE_NAME,
  ONE_YEAR_MS,
  OAUTH_STATE_COOKIE,
  encodeOAuthState,
} from "@shared/const";

/** Start the GitHub OAuth flow. The server creates and validates the CSRF state. */
export const startLogin = () => {
  window.location.href = "/api/auth/github";
};
