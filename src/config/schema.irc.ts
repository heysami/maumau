export const IRC_FIELD_LABELS: Record<string, string> = {
  "channels.irc": "IRC",
  "channels.irc.dmPolicy": "Who Can Start a Direct Chat",
  "channels.irc.nickserv.enabled": "IRC NickServ Enabled",
  "channels.irc.nickserv.service": "IRC NickServ Service",
  "channels.irc.nickserv.password": "IRC NickServ Password",
  "channels.irc.nickserv.passwordFile": "IRC NickServ Password File",
  "channels.irc.nickserv.register": "IRC NickServ Register",
  "channels.irc.nickserv.registerEmail": "IRC NickServ Register Email",
};

export const IRC_FIELD_HELP: Record<string, string> = {
  "channels.irc.configWrites":
    "Allow IRC to write config in response to channel events/commands (default: true).",
  "channels.irc.dmPolicy":
    'Choose who can start a direct chat with this IRC identity. "pairing" lets people request access once, "allowlist" only allows listed people, and "open" allows anyone and requires channels.irc.allowFrom=["*"].',
  "channels.irc.nickserv.enabled":
    "Enable NickServ identify/register after connect (defaults to enabled when password is configured).",
  "channels.irc.nickserv.service": "NickServ service nick (default: NickServ).",
  "channels.irc.nickserv.password": "NickServ password used for IDENTIFY/REGISTER (sensitive).",
  "channels.irc.nickserv.passwordFile": "Optional file path containing NickServ password.",
  "channels.irc.nickserv.register":
    "If true, send NickServ REGISTER on every connect. Use once for initial registration, then disable.",
  "channels.irc.nickserv.registerEmail":
    "Email used with NickServ REGISTER (required when register=true).",
};
