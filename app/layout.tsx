import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "PDF Gọn - Gộp, tách và chỉnh sửa PDF miễn phí";
const description = "Gộp, tách, sắp xếp, xoay, thêm và xoá trang PDF ngay trong trình duyệt. File luôn nằm trên thiết bị của bạn.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "vi_VN",
      images: [{ url: `${origin}/og.png`, width: 2048, height: 1152, alt: "PDF Gọn - Gộp, tách và sắp xếp PDF riêng tư" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
