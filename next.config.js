/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SANITY_STUDIO_GOOGLE_TRANSLATE_API_KEY: process.env.SANITY_STUDIO_GOOGLE_TRANSLATE_API_KEY,
  },
  // ... 다른 설정들
}

module.exports = nextConfig 