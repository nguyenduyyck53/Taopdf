# Hướng dẫn sử dụng VietOCR Studio

VietOCR Studio chuyển tài liệu PDF dạng text hoặc ảnh scan sang Word có thể chỉnh sửa. Tool hỗ trợ tiếng Việt, nhiều ngôn ngữ, bảng biểu, công thức và tài liệu có số lượng trang lớn.

## 1. Mở tool

Truy cập:

<https://pdf-gon-vn.barbed-fitful-2dtaru.chatgpt.site/>

Tool hoạt động trực tiếp trên trình duyệt. File PDF không được tải lên máy chủ.

## 2. Chọn tài liệu PDF

1. Nhấn **Chọn file PDF** hoặc kéo thả PDF vào vùng tải file.
2. Chờ tool đọc số trang và hiển thị bản xem trước.
3. PDF có mật khẩu cần được mở khóa trước khi sử dụng.

Tool nhận cả hai loại tài liệu:

- PDF có sẵn lớp text.
- PDF scan, PDF tạo từ ảnh chụp hoặc máy quét.

## 3. Chọn trang cần chuyển đổi

Tại ô **Trang cần chuyển**, có thể nhập:

- `Tất cả`: xử lý toàn bộ tài liệu.
- `1-20`: xử lý từ trang 1 đến trang 20.
- `1-20, 25, 30-40`: xử lý nhiều khoảng trang.

## 4. Chọn ngôn ngữ OCR

Mặc định nên giữ:

- **VI – Tiếng Việt**.
- **EN – English**.

Có thể chọn tối đa bốn ngôn ngữ. Chỉ nên chọn các ngôn ngữ thật sự có trong tài liệu để tăng tốc độ và hạn chế nhận diện sai.

## 5. Chọn cách đọc PDF

### Tự động

Khuyến nghị sử dụng. Tool lấy text trực tiếp ở trang đã có lớp text và chỉ OCR trang dạng ảnh.

### Luôn OCR

Dùng khi lớp text trong PDF bị lỗi font, sai mã hóa, mất dấu hoặc không thể sao chép đúng.

### Chỉ text

Dùng cho PDF điện tử có lớp text tốt. Chế độ này nhanh nhưng không đọc được chữ trong ảnh scan.

## 6. Chọn độ bám bố cục

### Bám sát bản gốc

- Giữ hình ảnh, đường kẻ và vị trí nội dung gần bản gốc nhất.
- Nội dung Word vẫn có thể chọn và chỉnh sửa.
- Dung lượng file Word lớn hơn.

### Cân bằng

- Giữ nền cho trang scan.
- Tối ưu dung lượng cho tài liệu vừa và lớn.
- Phù hợp với đa số hồ sơ thông thường.

### Word gọn nhẹ

- Ưu tiên văn bản chảy liên tục và dễ biên tập.
- Dung lượng nhỏ hơn.
- Bố cục có thể không giống hoàn toàn PDF gốc.

## 7. Bảng và công thức

Bật **Dựng lại bảng** để tạo hàng, cột và ô Word thật.

Bật **Công thức chỉnh sửa** để chuyển công thức nhận diện được sang Word Equation (OMML). Công thức lấy từ PDF có lớp text thường chính xác hơn công thức OCR từ ảnh.

Với công thức phức tạp, ảnh mờ, ký hiệu viết tay hoặc nhiều chỉ số trên/dưới, cần kiểm tra lại kết quả trong Word.

## 8. Xử lý tài liệu nhiều trang

Nên bật **Tối ưu tài liệu lớn**. Tool sẽ xử lý lần lượt từng trang để giảm lượng RAM sử dụng.

Có thể chọn:

- Một file Word duy nhất.
- Mỗi 100 trang một file.
- Mỗi 200 trang một file.
- Mỗi 500 trang một file.

Khi chia file, kết quả được đóng trong một file ZIP.

Đối với hồ sơ nhiều trang scan màu, nên dùng chế độ **Cân bằng** và chia mỗi 100 hoặc 200 trang để giảm nguy cơ trình duyệt hết bộ nhớ.

## 9. Xuất Word

1. Đặt tên tại ô **Tên file kết quả**.
2. Nhấn **Nhận diện & xuất Word**.
3. Giữ tab trình duyệt mở trong lúc xử lý.
4. Khi hoàn tất, nhấn **Tải file Word** hoặc **Tải gói Word**.

## 10. Khắc phục lỗi thường gặp

### Giao diện hiển thị sai dấu tiếng Việt

- Tải lại trang bằng `Ctrl + F5` để xóa bản CSS cũ trong bộ nhớ đệm.
- Đặt mức thu phóng trình duyệt về 100%.
- Ưu tiên Chrome, Edge hoặc Firefox phiên bản mới.

### Word đầu ra bị sai font hoặc mất dấu

- Chọn **Luôn OCR** nếu lớp text trong PDF gốc bị lỗi mã hóa.
- Đảm bảo máy có font Arial hoặc Segoe UI.
- Không dùng các bộ font TCVN3/VNI cũ cho tài liệu Unicode.

### OCR tiếng Việt sai nhiều

- Chỉ chọn `VI` và `EN` nếu tài liệu không có ngôn ngữ khác.
- Dùng bản scan thẳng, rõ, tối thiểu khoảng 200–300 DPI.
- Tránh ảnh bị nghiêng, bóng, nhòe hoặc nền quá tối.

### Trình duyệt thiếu bộ nhớ

- Bật **Tối ưu tài liệu lớn**.
- Chọn chế độ **Cân bằng** hoặc **Word gọn nhẹ**.
- Chia mỗi 100–200 trang một file.
- Đóng các tab và ứng dụng nặng trước khi xử lý.

## 11. Lưu ý bảo mật

- Nội dung PDF được xử lý trên thiết bị của người dùng.
- Tool chỉ tải mô hình ngôn ngữ OCR về trình duyệt khi cần.
- Đóng tab sẽ giải phóng dữ liệu tài liệu đang làm việc.
