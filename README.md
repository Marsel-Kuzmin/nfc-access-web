# NFC Access

Static web interface for a private NFC registry. The database and device receiver run in Supabase. Only authenticated, allowlisted administrators can read or change records.

The publishable Supabase key in cloud-config.json is public by design; access is enforced by Postgres grants, row level security and administrator checks. No device keys, Wi-Fi passwords, local databases or firmware are included in this repository.
