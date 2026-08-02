# VietOCR Studio

VietOCR Studio chuyển PDF dạng text hoặc ảnh scan sang Word có thể chỉnh sửa. Toàn bộ nội dung tài liệu được xử lý trong trình duyệt; file PDF không được tải lên máy chủ.

## Khả năng chính

- Nhận diện tiếng Việt tốt, mặc định kết hợp `vie + eng` và hỗ trợ tối đa bốn ngôn ngữ cùng lúc.
- Tự dùng lớp text có sẵn trong PDF và chỉ OCR những trang dạng ảnh.
- Dựng lại bảng thành hàng, cột và ô Word thật.
- Chuyển dòng công thức sang Word Equation (OMML) để tiếp tục chỉnh sửa.
- Chế độ bám sát bản gốc giữ hình, đường kẻ và vị trí bằng nền trang đã loại chữ, sau đó phủ nội dung Word có thể sửa lên trên.
- Xử lý tuần tự từng trang, giới hạn kích thước ảnh tạm và có thể chia hồ sơ lớn thành nhiều tệp Word trong một gói ZIP.
- Hỗ trợ chọn khoảng trang, theo dõi tiến độ, dừng xử lý và tải lại kết quả.

## Chạy trên máy

Yêu cầu Node.js 22.13 trở lên và pnpm.

```bash
pnpm install
pnpm dev
```

Mở `http://localhost:3000`.

## Kiểm tra và đóng gói

```bash
pnpm test
```

Tạo bản tĩnh cho GitHub Pages:

```bash
pnpm build:pages
```

## Công nghệ

React, Vinext/Vite, PDF.js, Tesseract.js, docx và JSZip.

## Ghi chú về OCR công thức

PDF có lớp text sẽ giữ ký hiệu chính xác hơn. Với ảnh scan, công thức được tạo thành Equation có thể sửa dựa trên kết quả OCR; nên kiểm tra lại các công thức phức tạp hoặc ảnh có độ phân giải thấp.

## Giấy phép

MIT
