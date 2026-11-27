/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["xlsx"],
  outputFileTracingIncludes: {
    "/api/**": ["./structured.json"],
    "/*": ["./structured.json"]
  }
};

export default nextConfig;
