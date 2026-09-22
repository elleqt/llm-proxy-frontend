export const en = {
  "app.title": "llm-proxy — API keys and access",
  "app.loading": "Loading…",

  "prefs.theme": "Theme",
  "prefs.theme.auto": "System",
  "prefs.theme.light": "Light",
  "prefs.theme.pink": "Pink",
  "prefs.theme.dark": "Dark",
  "prefs.lang": "Language",
  // Each language by its own name, identical in both dictionaries.
  "prefs.lang.en": "English",
  "prefs.lang.ru": "Русский",

  "page.login.title": "Sign in",
  "page.password.title": "Change password",
  "page.cabinet.title": "API keys",
  "page.connect.title": "Connect a client",
  "page.admin.users.title": "Users",
  "page.admin.user.title": "User",
  "page.admin.providers.title": "Providers",
  "page.admin.settings.title": "Settings",
  "page.notFound.title": "Not found",
  "page.notFound.body": "There is nothing at this address.",
  "page.notFound.home": "Go to the start page",

  "error.unknown": "Something went wrong. Try again.",
  "error.forbidden": "You are not allowed to do this.",
  "error.network_error": "The server could not be reached. Check your connection and try again.",
  "error.unauthenticated": "Your session has ended. Sign in again.",
  "error.password_change_required": "Change your temporary password to continue.",
  "error.invalid_credentials": "Wrong email or password.",
  // Context-specific overrides, looked up before `error.<code>` (see errorMessage).
  "errorIn.password.invalid_credentials":
    "The current password is wrong, or the temporary password has expired. If it has expired, sign in again.",
  "error.locked_out": "Too many failed attempts. Try again later.",
  "error.oidc_disabled": "Sign-in through the identity provider is turned off.",
  "error.oidc_forbidden": "Your identity-provider account is not allowed to use this service.",
  "error.oidc_failed": "Sign-in through the identity provider failed. Try again.",
  "error.weak_password": "The password is too weak.",
  "error.empty_password": "Enter a password.",
  "error.not_found": "Not found.",
  "error.email_taken": "An account with this email already exists.",
  "error.policy_managed_by_idp": "This policy comes from the identity provider and cannot be edited here.",
  "error.invalid_rule": "This rule is not valid.",
  "error.not_local": "A service account has no password.",
  "error.unsupported_provider": "This provider is not supported.",
  "error.login_expired": "The provider sign-in expired. Start again.",
  "error.login_failed": "The provider rejected the sign-in.",
  "error.invalid_settings": "The settings are not valid.",
  "error.forbidden_setting": "This setting is managed by the gateway and cannot be changed here.",

  "ui.copy": "Copy",
  "ui.copied": "Copied",
  "ui.copyFailed": "Could not copy. Select the value and copy it by hand.",
  "ui.shownOnce": "Save it now: it will not be shown again.",
  "ui.close": "Close",
  "ui.dismiss": "Dismiss",
  "ui.notifications": "Notifications",
};

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
