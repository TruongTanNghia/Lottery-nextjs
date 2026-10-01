/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 enables Turbopack by default; tsconfig "paths" handles @/* aliases.
  turbopack: {},
  // gramjs ("telegram") tự nạp mô-đun theo tên lúc chạy; đem đóng gói thì dễ thiếu.
  // Để nguyên ngoài gói, máy chủ nạp thẳng từ node_modules.
  serverExternalPackages: ["telegram"],
};

module.exports = nextConfig;
