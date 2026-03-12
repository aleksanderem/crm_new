# Side Effects

When a status change triggers audit logs, activity logs, notifications, reminder cancellation, email, or SMS, keep those effects behind a shared domain path instead of duplicating them in every caller.

The caller should describe intent. The owning domain should enforce business consequences.
