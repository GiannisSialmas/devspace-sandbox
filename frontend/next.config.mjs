/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  // `next dev` refuses to serve its JS to hosts other than localhost unless listed here,
  // so without this the page renders but never hydrates (buttons do nothing) via the ingress.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS || "").split(",").filter(Boolean),
};
