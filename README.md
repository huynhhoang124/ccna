# CCNA DOCX Quiz

Web app tao quiz trac nghiem tu file Word `.docx` cho bo cau hoi CCNA.

## Chuc nang

- Upload file Word `.docx` / `.docm`.
- Doc cau hoi, dap an A-H, hinh anh trong file Word.
- Tu nhan nhieu format:
  - `Question 1`, `Cau 1`, `Q1`, `1.`
  - `A. ... B. ... C. ...`
  - `Option A ... Option B ...`
  - `Answer: B`, `Answer: B D`, bang dap an cuoi file
- Ho tro cau nhieu dap an bang checkbox.
- Dao thu tu cau hoi khi lam bai.
- Cham diem va to mau dap an dung/sai.
- Giu lai cau khong doc duoc trong muc `Cau can tu lam`.
- Cho phep nhap thu cong cau can tu lam thanh cau quiz.
- Luu nhieu quiz vao thu vien trong trinh duyet de lam lai.
- Xuat/nhap quiz bang file JSON.

## Cai dat

Can co Node.js va npm.

```bash
npm install
```

## Chay dev

```bash
npm run dev -- --port 5190
```

Mo trinh duyet:

```text
http://localhost:5190
```

## Build

```bash
npm run build
```

## Cach su dung

1. Bam `Chon file Word`.
2. Chon file `.docx`.
3. Kiem tra so cau da nhap va so cau can tu lam.
4. Bam `Bat dau lam bai`.
5. Chon dap an, sau do bam `Nop bai`.

Neu file co cau dang drag/drop, mapping, hoac cau khong du A/B/C/D, app se dua vao `Cau can tu lam` de ban tu nhap lai.

## Luu quiz

App tu luu quiz vao thu vien trong trinh duyet bang IndexedDB.

- Bam `Mo` trong `Thu vien quiz da luu` de lam lai quiz cu.
- Bam `Xuat JSON` de tai quiz ve may.
- Bam `Nhap JSON` de nap lai quiz da xuat.

## Gioi han

- File Word cu `.doc` khong doc truc tiep trong trinh duyet. Hay mo Word va `Save As` sang `.docx`.
- Anh nam trong textbox/shape dac biet co the khong duoc Mammoth trich xuat.
- Cau drag/drop khong tu chuyen thanh trac nghiem, nhung se duoc ghi lai trong `Cau can tu lam`.

## Cau truc project

```text
src/App.jsx        Giao dien, upload file, thu vien quiz, lam bai
src/quizParser.js  Parser cau hoi/dap an tu text Word
src/styles.css     CSS giao dien
```
