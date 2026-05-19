export function sameAnswers(selectedAnswers, correctAnswers) {
  if (selectedAnswers.length !== correctAnswers.length) return false;
  return correctAnswers.every((answer) => selectedAnswers.includes(answer));
}

export function cleanText(value) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function formatReadableLines(text) {
  return text
    .replace(/\s+(?=(?:[A-Za-z]+)?(?:Router|Switch|switch|router)\d*(?:\([^)]+\))?#)/g, "\n")
    .replace(/\s+(?=interface\s+(?:gigabit|fast|ethernet|gi|fa)\S*)/gi, "\n")
    .replace(/\s+(?=ip\s+(?:address|nat|access-list|route|access-group)\b)/gi, "\n")
    .replace(/\s+(?=access-list\s+\d+\b)/gi, "\n")
    .replace(/\s+(?=switchport\s+\b)/gi, "\n")
    .replace(/\s+(?=spanning-tree\s+\b)/gi, "\n")
    .replace(/\s+(?=line\s+vty\b)/gi, "\n")
    .replace(/\s+(?=Option\s+[A-H]\b)/g, "\n")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

export function isCodeLine(line) {
  return (
    /#/.test(line) ||
    /^(?:interface|ip|access-list|switchport|spanning-tree|line vty|router|show|copy|enable|configure)\b/i.test(line)
  );
}

/**
 * Hàm đánh giá CSS class cho từng đáp án
 * @param {object} params
 * @param {boolean} params.submitted Trạng thái đã nộp bài hoặc cần xem kết quả
 * @param {boolean} params.selected Người dùng có chọn đáp án này không
 * @param {boolean} params.correct Đây có phải là đáp án đúng không
 */
export function optionClass({ submitted, selected, correct }) {
  if (!submitted) return selected ? "option selected" : "option";
  if (correct) return "option correct";
  if (selected) return "option wrong";
  return "option muted";
}
