import { withPayload } from "@payloadcms/next/withPayload";
export default withPayload({
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/^\/api\/subscriptions\/one-click(?:[/?]|$)/] } },
  experimental: { globalNotFound: true },
});
