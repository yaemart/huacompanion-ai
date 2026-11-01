// Payload HMR rebuilds shared database mappings while requests may still use them.
// Keep Next Fast Refresh, and restart npm run dev after CMS config/schema changes.
process.env.DISABLE_PAYLOAD_HMR = "true";
