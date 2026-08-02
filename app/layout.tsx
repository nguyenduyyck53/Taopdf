import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "VietOCR Studio - Chuyển PDF sang Word có thể chỉnh sửa";
const description = "OCR PDF tiếng Việt và đa ngôn ngữ, giữ bảng biểu, bố cục và chuyển công thức sang Word Equation có thể chỉnh sửa. Hỗ trợ tài liệu nhiều trang.";

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
      images: [{
        url: `${origin}/og-vietocr.png`,
        width: 1672,
        height: 941,
        alt: "VietOCR Studio - PDF sang Word có bảng và công thức chỉnh sửa",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-vietocr.png`],
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
