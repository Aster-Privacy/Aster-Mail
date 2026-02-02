export const API_ENDPOINTS = {
  core: {
    auth: {
      login: "/core/v1/auth/login",
      register: "/core/v1/auth/register",
      refresh: "/core/v1/auth/refresh",
      logout: "/core/v1/auth/logout",
      logout_others: "/core/v1/auth/logout-others",
      logout_all: "/core/v1/auth/logout-all",
      me: "/core/v1/auth/me",
      password: "/core/v1/auth/me/password",
      clear_session: "/core/v1/auth/clear-session",
      totp: {
        base: "/core/v1/auth/totp",
        setup_initiate: "/core/v1/auth/totp/setup/initiate",
        setup_verify: "/core/v1/auth/totp/setup/verify",
        verify: "/core/v1/auth/totp/verify",
        backup_code: "/core/v1/auth/totp/backup-code",
        status: "/core/v1/auth/totp/status",
        disable: "/core/v1/auth/totp/disable",
        backup_codes_regenerate: "/core/v1/auth/totp/backup-codes/regenerate",
      },
      hardware_keys: "/core/v1/auth/hardware-keys",
    },
    account: {
      base: "/core/v1/account",
      delete: "/core/v1/account/delete",
      export: "/core/v1/account/export",
    },
    security: {
      base: "/core/v1/security",
      sessions: "/core/v1/security/sessions",
      audit_log: "/core/v1/security/audit-log",
      events: "/core/v1/security/events",
    },
    recovery: {
      base: "/core/v1/recovery",
      email: "/core/v1/recovery/email",
      phone: "/core/v1/recovery/phone",
      options: "/core/v1/recovery/options",
    },
    onboarding: {
      base: "/core/v1/onboarding",
      status: "/core/v1/onboarding/status",
      complete: "/core/v1/onboarding/complete",
    },
    feedback: {
      base: "/core/v1/feedback",
    },
  },
  mail: {
    messages: {
      base: "/mail/v1/messages",
      by_id: (id: string) => `/mail/v1/messages/${id}`,
      bulk: "/mail/v1/messages/bulk",
      sync: "/mail/v1/messages/sync",
      migration: "/mail/v1/messages/migration",
    },
    metadata: {
      base: "/mail/v1/metadata",
      by_id: (id: string) => `/mail/v1/metadata/${id}`,
    },
    drafts: {
      base: "/mail/v1/drafts",
      by_id: (id: string) => `/mail/v1/drafts/${id}`,
    },
    send: {
      base: "/mail/v1/send",
      simple: "/mail/v1/send/simple",
      external: "/mail/v1/send/external",
    },
    scheduled: {
      base: "/mail/v1/scheduled",
      by_id: (id: string) => `/mail/v1/scheduled/${id}`,
    },
    undo_send: {
      base: "/mail/v1/undo_send",
    },
    search: {
      base: "/mail/v1/search",
    },
    archive: {
      base: "/mail/v1/archive",
    },
    attachments: {
      base: "/mail/v1/attachments",
      by_id: (id: string) => `/mail/v1/attachments/${id}`,
    },
    snooze: {
      base: "/mail/v1/snooze",
      by_id: (id: string) => `/mail/v1/snooze/${id}`,
    },
    labels: {
      base: "/mail/v1/labels",
      by_id: (id: string) => `/mail/v1/labels/${id}`,
    },
    templates: {
      base: "/mail/v1/templates",
      by_id: (id: string) => `/mail/v1/templates/${id}`,
    },
    signatures: {
      base: "/mail/v1/signatures",
      by_id: (id: string) => `/mail/v1/signatures/${id}`,
    },
    import: {
      base: "/mail/v1/import",
      status: "/mail/v1/import/status",
    },
  },
  contacts: {
    base: "/contacts/v1",
    by_id: (id: string) => `/contacts/v1/${id}`,
    allowed_senders: {
      base: "/contacts/v1/allowed_senders",
      by_id: (id: string) => `/contacts/v1/allowed_senders/${id}`,
    },
    blocked_senders: {
      base: "/contacts/v1/blocked_senders",
      by_id: (id: string) => `/contacts/v1/blocked_senders/${id}`,
    },
  },
  addresses: {
    aliases: {
      base: "/addresses/v1/aliases",
      by_id: (id: string) => `/addresses/v1/aliases/${id}`,
      check: "/addresses/v1/aliases/check",
      generate: (id: string) => `/addresses/v1/aliases/${id}/generate`,
    },
    domains: {
      base: "/addresses/v1/domains",
      by_id: (id: string) => `/addresses/v1/domains/${id}`,
      verify: (id: string) => `/addresses/v1/domains/${id}/verify`,
      dns_records: (id: string) => `/addresses/v1/domains/${id}/dns-records`,
      addresses: (domain_id: string) =>
        `/addresses/v1/domains/${domain_id}/addresses`,
      address_by_id: (domain_id: string, address_id: string) =>
        `/addresses/v1/domains/${domain_id}/addresses/${address_id}`,
    },
  },
  settings: {
    preferences: {
      base: "/settings/v1/preferences",
    },
    encryption: {
      base: "/settings/v1/encryption",
    },
    profile_notes: {
      base: "/settings/v1/profile_notes",
      by_email: (email: string) => `/settings/v1/profile_notes/${email}`,
    },
  },
  crypto: {
    encryption: {
      base: "/crypto/v1/encryption",
    },
    keys: {
      base: "/crypto/v1/keys",
      by_id: (id: string) => `/crypto/v1/keys/${id}`,
      public: "/crypto/v1/keys/public",
    },
    ratchet: {
      base: "/crypto/v1/ratchet",
      sync: "/crypto/v1/ratchet/sync",
    },
  },
  payments: {
    billing: {
      base: "/payments/v1",
      webhook: "/payments/v1/webhook",
    },
    plans: {
      base: "/payments/v1/plans",
    },
    subscription: {
      base: "/payments/v1/subscription",
      cancel: "/payments/v1/cancel",
      reactivate: "/payments/v1/reactivate",
      checkout_session: "/payments/v1/checkout-session",
      portal_session: "/payments/v1/portal-session",
    },
    referrals: {
      base: "/payments/v1/referrals",
      stats: "/payments/v1/referrals/stats",
      leaderboard: "/payments/v1/referrals/leaderboard",
    },
  },
  developer: {
    base: "/developer/v1",
    api_keys: {
      base: "/developer/v1/api-keys",
      by_id: (id: string) => `/developer/v1/api-keys/${id}`,
    },
    webhooks: {
      base: "/developer/v1/webhooks",
      by_id: (id: string) => `/developer/v1/webhooks/${id}`,
      deliveries: (id: string) => `/developer/v1/webhooks/${id}/deliveries`,
    },
    oauth_apps: {
      base: "/developer/v1/oauth-apps",
      by_id: (id: string) => `/developer/v1/oauth-apps/${id}`,
      regenerate_secret: (id: string) =>
        `/developer/v1/oauth-apps/${id}/regenerate-secret`,
    },
    apps: {
      base: "/developer/v1/apps",
      by_id: (id: string) => `/developer/v1/apps/${id}`,
    },
  },
  admin: {
    base: "/admin/v1",
    auth: {
      session: "/admin/v1/auth/session",
    },
    dashboard: {
      metrics: "/admin/v1/dashboard/metrics",
      activity: "/admin/v1/dashboard/activity",
    },
    users: {
      search: "/admin/v1/users/search",
      by_id: (id: string) => `/admin/v1/users/${id}`,
      suspend: (id: string) => `/admin/v1/users/${id}/suspend`,
      unsuspend: (id: string) => `/admin/v1/users/${id}/unsuspend`,
    },
    tickets: {
      base: "/admin/v1/tickets",
      by_id: (id: string) => `/admin/v1/tickets/${id}`,
      reply: (id: string) => `/admin/v1/tickets/${id}/reply`,
    },
    roles: {
      base: "/admin/v1/roles",
      by_id: (id: string) => `/admin/v1/roles/${id}`,
      permissions: "/admin/v1/roles/permissions",
      assign: "/admin/v1/roles/assign",
      unassign: "/admin/v1/roles/unassign",
    },
    audit: {
      logs: "/admin/v1/audit/logs",
    },
    compliance: {
      gdpr: "/admin/v1/compliance/gdpr",
      gdpr_by_id: (id: string) => `/admin/v1/compliance/gdpr/${id}`,
    },
    domains: {
      base: "/admin/v1/domains",
      by_id: (id: string) => `/admin/v1/domains/${id}`,
      status: (id: string) => `/admin/v1/domains/${id}/status`,
    },
    notifications: {
      base: "/admin/v1/notifications",
      unread_count: "/admin/v1/notifications/unread-count",
      mark_all_read: "/admin/v1/notifications/mark-all-read",
      mark_read: (id: string) => `/admin/v1/notifications/${id}/read`,
    },
  },
  sync: {
    base: "/sync/v1",
    storage: {
      base: "/sync/v1/storage",
      usage: "/sync/v1/storage/usage",
    },
    logos: {
      base: "/sync/v1/logos",
      by_domain: (domain: string) => `/sync/v1/logos/${domain}`,
    },
  },
} as const;
