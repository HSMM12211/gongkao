/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.TAURI_DESKTOP === "1" ? "export" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
