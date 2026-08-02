# PDF Gọn

PDF Gọn là công cụ web miễn phí để gộp, tách và chỉnh sửa trang PDF ngay trong trình duyệt. File không được tải lên máy chủ.

## Tính năng

- Kéo thả và gộp nhiều file PDF.
- Xem trước, chọn nhiều trang, sắp xếp bằng kéo thả hoặc nút điều hướng.
- Xoay, xoá và hoàn tác/làm lại tối đa 50 bước.
- Thêm trang trắng A4 dọc, A4 ngang hoặc Letter, có thể chọn màu nền.
- Tách mỗi trang thành một PDF hoặc tách theo khoảng như `1-3, 4-6, 8`.
- Tải các file đã tách trong một gói ZIP.
- Giao diện responsive, hỗ trợ phím tắt và không cần đăng nhập.

## Chạy trên máy

Yêu cầu Node.js 22.13 trở lên.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Kiểm tra và đóng gói

```bash
npm test
```

## Phím tắt

- `Ctrl/Cmd + A`: chọn tất cả trang.
- `Delete` hoặc `Backspace`: xoá trang đang chọn.
- `Ctrl/Cmd + Z`: hoàn tác.
- `Ctrl/Cmd + Shift + Z`: làm lại.
- `Esc`: bỏ chọn hoặc đóng hộp thoại.

## Công nghệ

React, Vinext/Vite, PDF.js, pdf-lib và JSZip. Toàn bộ xử lý diễn ra phía trình duyệt.

## Giấy phép

MIT
