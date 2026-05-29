import { useEffect, useMemo, useRef, useState } from "react";
import { parseQuizItems, shuffleQuestions } from "./quizParser.js";
import {
  loadStoredQuiz,
  saveStoredQuiz,
  clearStoredQuiz,
  saveQuizToLibrary,
  loadQuizLibrary,
  getSavedQuiz,
  deleteSavedQuiz
} from "./db.js";
import { sameAnswers, optionClass } from "./utils.js";
import { extractDocxItems } from "./docxExtractor.js";
import ImageList from "./components/ImageList.jsx";
import RichText from "./components/RichText.jsx";

const PRELOADED_DEVOPS_EXAMS = [
  {
    id: "devops-exam-1",
    title: "Đề 1: AWS Cloud Practitioner CLF-C02",
    meta: "100 câu hỏi song ngữ Anh - Việt",
    fileName: "Đề_1_CLF2 song ngữ 100 câu.docx",
    path: "/devops/Đề_1_CLF2_song_ngữ_100_câu.json"
  },
  {
    id: "devops-exam-2",
    title: "Đề 2: AWS Cloud Practitioner CLF-C02",
    meta: "100 câu hỏi song ngữ Anh - Việt",
    fileName: "Đề_2_CLF2 song ngữ 100 câu.docx",
    path: "/devops/Đề_2_CLF2_song_ngữ_100_câu.json"
  },
  {
    id: "devops-exam-3",
    title: "Đề 3: AWS Cloud Practitioner CLF-C02",
    meta: "100 câu hỏi song ngữ Anh - Việt",
    fileName: "Đề_3_CLF2 song ngữ 100 câu.docx",
    path: "/devops/Đề_3_CLF2_song_ngữ_100_câu.json"
  },
  {
    id: "devops-exam-4",
    title: "Đề 4: AWS Cloud Practitioner CLF-C02",
    meta: "100 câu hỏi song ngữ Anh - Việt",
    fileName: "Đề_4_CLF2 song ngữ 100 câu.docx",
    path: "/devops/Đề_4_CLF2_song_ngữ_100_câu.json"
  },
  {
    id: "devops-exam-5",
    title: "Đề 5: AWS Cloud Practitioner CLF-C02",
    meta: "75 câu hỏi song ngữ Anh - Việt",
    fileName: "Đề_5_CLF2 song ngữ 100 câu.docx",
    path: "/devops/Đề_5_CLF2_song_ngữ_100_câu.json"
  }
];

const PRELOADED_TTHCM_EXAMS = [
  {
    id: "tthcm-exam-1",
    title: "Đề 1: 125 câu hỏi trắc nghiệm ôn tập tổng hợp",
    meta: "Ngân hàng câu hỏi trắc nghiệm Tư tưởng HCM",
    fileName: "Ngân hàng câu hỏi từ Google Form.docx",
    path: "/tthcm/questions_tthcm.json"
  }
];

function getSubjectFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const subject = params.get("subject");
  if (subject === "tthcm") return "tthcm";
  return subject === "devops" ? "devops" : "ccna";
}

export default function App() {
  const inputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [subject, setSubject] = useState(getSubjectFromUrl);
  const [quiz, setQuiz] = useState(() => loadStoredQuiz(getSubjectFromUrl()));
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editingNoteIndex, setEditingNoteIndex] = useState(null);
  const [manualDraft, setManualDraft] = useState(null);
  const [savedQuizzes, setSavedQuizzes] = useState([]);
  
  // Các state mới cho Chế độ Thực chiến
  const [quizMode, setQuizMode] = useState("exam"); // "exam" | "practice"
  const [isShuffle, setIsShuffle] = useState(true);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  useEffect(() => {
    setActiveQuestionIndex(0);
  }, [questions]);

  function getQuestionStatus(question) {
    const selectedAnswers = answers[question.id] || [];
    const correctAnswers = question.correctAnswers || [question.correctAnswer];
    
    if (selectedAnswers.length === 0) {
      return "unanswered";
    }
    
    const isQuestionSubmitted = submitted || (quizMode === "practice" && selectedAnswers.length === correctAnswers.length);
    
    if (!isQuestionSubmitted) {
      return "answering";
    }
    
    const correct = sameAnswers(selectedAnswers, correctAnswers);
    return correct ? "correct" : "wrong";
  }

  // Sync subject to URL and update body class
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (subject === "devops") {
      params.set("subject", "devops");
    } else if (subject === "tthcm") {
      params.set("subject", "tthcm");
    } else {
      params.delete("subject");
    }
    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}${newSearch ? "?" + newSearch : ""}`;
    window.history.replaceState({}, "", newUrl);

    // Apply class to body or root element
    if (subject === "devops") {
      document.documentElement.classList.add("theme-devops");
      document.documentElement.classList.remove("theme-tthcm");
    } else if (subject === "tthcm") {
      document.documentElement.classList.add("theme-tthcm");
      document.documentElement.classList.remove("theme-devops");
    } else {
      document.documentElement.classList.remove("theme-devops", "theme-tthcm");
    }
  }, [subject]);

  useEffect(() => {
    setQuiz(loadStoredQuiz(subject));
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setMessage("");
    refreshLibrary();
  }, [subject]);

  async function refreshLibrary() {
    try {
      setSavedQuizzes(await loadQuizLibrary(subject));
    } catch {
      setSavedQuizzes([]);
    }
  }

  async function persistQuiz(quiz) {
    const savedLocally = saveStoredQuiz(quiz, subject);
    try {
      await saveQuizToLibrary(quiz, subject);
      await refreshLibrary();
      return { savedLocally, savedInLibrary: true };
    } catch {
      return { savedLocally, savedInLibrary: false };
    }
  }

  async function loadPreloadedExam(exam) {
    setLoading(true);
    setMessage(`Đang tải ${exam.title}...`);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);

    try {
      const response = await fetch(exam.path);
      if (!response.ok) {
        throw new Error("Không thể tải file đề thi từ máy chủ.");
      }

      let nextQuiz;
      if (exam.path.endsWith(".json")) {
        const json = await response.json();
        nextQuiz = {
          id: json.id || crypto.randomUUID?.() || `quiz-${Date.now()}`,
          fileName: exam.fileName,
          importedAt: new Date().toISOString(),
          questions: json.questions,
          warnings: json.warnings || [],
          manualNotes: json.manualNotes || []
        };
      } else {
        const arrayBuffer = await response.arrayBuffer();
        const items = await extractDocxItems(arrayBuffer);
        const parsed = parseQuizItems(items);

        if (parsed.questions.length === 0 && (parsed.manualNotes || []).length === 0) {
          setMessage(parsed.warnings[0] || "Không đọc được câu hỏi từ file.");
          return;
        }

        nextQuiz = {
          id: crypto.randomUUID?.() || `quiz-${Date.now()}`,
          fileName: exam.fileName,
          importedAt: new Date().toISOString(),
          questions: parsed.questions,
          warnings: parsed.warnings,
          manualNotes: parsed.manualNotes || []
        };
      }

      setQuiz(nextQuiz);
      const saved = await persistQuiz(nextQuiz);

      const isJson = exam.path.endsWith(".json");
      const manualCount = nextQuiz.manualNotes?.length || 0;
      const saveMessage = saved.savedInLibrary ? "" : " Không lưu được vào thư viện vì dung lượng quá lớn.";
      setMessage(`Đã tải thành công ${exam.title}: Nhập ${nextQuiz.questions.length} câu hỏi.${manualCount > 0 ? ` ${manualCount} câu cần tự làm.` : ""}${saveMessage}`);
    } catch (error) {
      setMessage(error?.message || "Không thể tải hoặc phân tích đề thi.");
    } finally {
      setLoading(false);
    }
  }

  const answeredCount = useMemo(
    () => questions.filter((question) => (answers[question.id] || []).length > 0).length,
    [answers, questions]
  );

  const score = useMemo(
    () =>
      questions.reduce(
        (total, question) =>
          total + (sameAnswers(answers[question.id] || [], question.correctAnswers || [question.correctAnswer]) ? 1 : 0),
        0
      ),
    [answers, questions]
  );

  async function handleFile(file) {
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".doc")) {
      setMessage("File .doc Word cũ chưa đọc trực tiếp trong trình duyệt được. Vui lòng mở Word và Save As sang .docx rồi upload lại.");
      return;
    }

    if (!fileName.endsWith(".docx") && !fileName.endsWith(".docm")) {
      setMessage("Vui lòng chọn file Word .docx hoặc .docm.");
      return;
    }

    setLoading(true);
    setMessage("");
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const items = await extractDocxItems(arrayBuffer);
      const parsed = parseQuizItems(items);

      if (parsed.questions.length === 0 && (parsed.manualNotes || []).length === 0) {
        setMessage(parsed.warnings[0] || "Không đọc được câu hỏi từ file.");
        return;
      }

      const nextQuiz = {
        id: crypto.randomUUID?.() || `quiz-${Date.now()}`,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        questions: parsed.questions,
        warnings: parsed.warnings,
        manualNotes: parsed.manualNotes || []
      };

      setQuiz(nextQuiz);
      const saved = await persistQuiz(nextQuiz);
      const imageCount = items.reduce((total, item) => total + (item.images?.length || 0), 0);
      const manualCount = parsed.manualNotes?.length || 0;
      const saveMessage = saved.savedInLibrary ? "" : " Không lưu được vào thư viện vì trình duyệt từ chối dung lượng.";
      setMessage(`Đã nhập ${parsed.questions.length} câu hỏi, ${imageCount} hình ảnh. ${manualCount} câu cần tự làm.${saveMessage}`);
    } catch (error) {
      setMessage(error?.message || "Không thể đọc file Word.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function startQuiz() {
    if (!quiz?.questions?.length) return;
    setQuestions(isShuffle ? shuffleQuestions(quiz.questions) : quiz.questions);
    setAnswers({});
    setSubmitted(false);
    setActiveQuestionIndex(0);
    setMessage(isShuffle ? "Đã đảo thứ tự câu hỏi. Bắt đầu làm bài." : "Đã bắt đầu làm bài.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearQuiz() {
    clearStoredQuiz(subject);
    setQuiz(null);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setActiveQuestionIndex(0);
    setMessage("Đã xóa quiz hiện tại.");
  }

  function exportQuizJson() {
    if (!quiz) return;

    const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (quiz.fileName || "quiz").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
    link.href = url;
    link.download = `${safeName}-quiz.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importQuizJson(file) {
    if (!file) return;

    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.questions)) {
        setMessage("File JSON không đúng định dạng quiz.");
        return;
      }

      const nextQuiz = {
        id: imported.id || crypto.randomUUID?.() || `quiz-${Date.now()}`,
        fileName: imported.fileName || file.name,
        importedAt: imported.importedAt || new Date().toISOString(),
        questions: imported.questions,
        warnings: Array.isArray(imported.warnings) ? imported.warnings : [],
        manualNotes: Array.isArray(imported.manualNotes) ? imported.manualNotes : []
      };

      setQuiz(nextQuiz);
      await persistQuiz(nextQuiz);
      setQuestions([]);
      setAnswers({});
      setSubmitted(false);
      setMessage(`Đã nhập quiz JSON: ${nextQuiz.questions.length} câu, ${nextQuiz.manualNotes.length} câu cần tự làm.`);
    } catch {
      setMessage("Không đọc được file JSON.");
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = "";
    }
  }

  function beginManualEdit(note, index) {
    const choicesByLabel = Object.fromEntries((note.choices || []).map((choice) => [choice.label, choice.text || ""]));
    setEditingNoteIndex(index);
    setManualDraft({
      number: note.number,
      question: note.question || "",
      images: note.images || [],
      choices: {
        A: choicesByLabel.A || "",
        B: choicesByLabel.B || "",
        C: choicesByLabel.C || "",
        D: choicesByLabel.D || ""
      },
      correctAnswers: note.correctAnswers?.length ? note.correctAnswers : ["A"]
    });
  }

  function cancelManualEdit() {
    setEditingNoteIndex(null);
    setManualDraft(null);
  }

  function updateManualChoice(label, value) {
    setManualDraft((current) => ({
      ...current,
      choices: {
        ...current.choices,
        [label]: value
      }
    }));
  }

  function toggleManualCorrect(label) {
    setManualDraft((current) => {
      const currentAnswers = current.correctAnswers || [];
      const nextAnswers = currentAnswers.includes(label)
        ? currentAnswers.filter((answer) => answer !== label)
        : [...currentAnswers, label];

      return {
        ...current,
        correctAnswers: nextAnswers.length ? nextAnswers : [label]
      };
    });
  }

  function saveManualQuestion() {
    const labels = ["A", "B", "C", "D"];
    const choices = labels
      .map((label) => ({
        label,
        text: manualDraft.choices[label].trim(),
        images: []
      }))
      .filter((choice) => choice.text);
    const correctAnswers = (manualDraft.correctAnswers || []).filter((answer) =>
      choices.some((choice) => choice.label === answer)
    );

    if (!manualDraft.question.trim() || choices.length < 2 || correctAnswers.length === 0) {
      setMessage("Câu tự làm cần có nội dung, ít nhất 2 đáp án và ít nhất 1 đáp án đúng.");
      return;
    }

    const newQuestion = {
      id: `manual-${Date.now()}`,
      number: manualDraft.number,
      question: manualDraft.question.trim(),
      images: manualDraft.images || [],
      choices,
      correctAnswers,
      correctAnswer: correctAnswers[0]
    };

    setQuiz((current) => {
      const nextQuiz = {
        ...current,
        questions: [...current.questions, newQuestion],
        manualNotes: current.manualNotes.filter((_, index) => index !== editingNoteIndex)
      };
      persistQuiz(nextQuiz);
      return nextQuiz;
    });

    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    cancelManualEdit();
    setMessage("Đã chuyển câu tự làm thành câu quiz.");
  }

  async function openSavedQuiz(id) {
    const savedQuiz = await getSavedQuiz(id);
    if (!savedQuiz) {
      setMessage("Không tìm thấy quiz đã lưu.");
      await refreshLibrary();
      return;
    }

    setQuiz(savedQuiz);
    saveStoredQuiz(savedQuiz);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setMessage(`Đã mở lại quiz ${savedQuiz.fileName}.`);
  }

  async function removeSavedQuiz(id) {
    await deleteSavedQuiz(id);
    await refreshLibrary();
    if (quiz?.id === id) {
      clearQuiz();
    }
    setMessage("Đã xóa quiz khỏi thư viện.");
  }

  function chooseAnswer(question, answer) {
    if (submitted) return;
    const isMultiAnswer = (question.correctAnswers || []).length > 1;

    setAnswers((current) => {
      const currentAnswers = current[question.id] || [];
      if (!isMultiAnswer) {
        return { ...current, [question.id]: [answer] };
      }

      const nextAnswers = currentAnswers.includes(answer)
        ? currentAnswers.filter((item) => item !== answer)
        : [...currentAnswers, answer];

      return { ...current, [question.id]: nextAnswers };
    });
  }

  return (
    <main className="page">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            {subject === "devops" ? "☁" : subject === "tthcm" ? "🇻🇳" : "⚙"}
          </div>
          <strong>{subject === "devops" ? "DevOps Cloud Quiz" : subject === "tthcm" ? "Tư tưởng HCM Quiz" : "CCNA Cisco Quiz"}</strong>
        </div>
        <nav className="nav-tabs">
          <button
            type="button"
            className={subject === "ccna" ? "nav-tab active" : "nav-tab"}
            onClick={() => setSubject("ccna")}
          >
            💻 CCNA Prep
          </button>
          <button
            type="button"
            className={subject === "devops" ? "nav-tab active" : "nav-tab"}
            onClick={() => setSubject("devops")}
          >
            ☁ DevOps Prep
          </button>
          <button
            type="button"
            className={subject === "tthcm" ? "nav-tab active" : "nav-tab"}
            onClick={() => setSubject("tthcm")}
          >
            🇻🇳 Tư tưởng HCM
          </button>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="kicker">
            {subject === "devops" ? "AWS & DevOps Cloud Prep" : subject === "tthcm" ? "Tư tưởng Hồ Chí Minh" : "CCNA Routing & Switching"}
          </p>
          <h1>
            {subject === "devops" ? "Luyện thi DevOps Cloud Practitioner" : subject === "tthcm" ? "Ôn tập Tư tưởng Hồ Chí Minh" : "Tạo bài trắc nghiệm từ file Word"}
          </h1>
          <p className="heroText">
            {subject === "devops"
              ? "Trang luyện thi chứng chỉ AWS Certified Cloud Practitioner CLF-C02. Tải lên file .docx của riêng bạn hoặc ôn tập trực tiếp với 5 bộ đề song ngữ được tích hợp sẵn ở dưới."
              : subject === "tthcm"
              ? "Hệ thống trắc nghiệm ôn tập Tư tưởng Hồ Chí Minh. Bộ câu hỏi được biên soạn chuẩn xác từ Google Form, hỗ trợ chế độ thi thử và thực chiến đắc lực."
              : "Upload file Word .docx có câu hỏi, hình ảnh và đáp án A/B/C/D. Web sẽ tự nhận nhiều kiểu format, đảo thứ tự câu và chấm điểm sau khi nộp."}
          </p>
        </div>

        <div className="metrics">
          <div>
            <strong>{quiz?.questions?.length || 0}</strong>
            <span>Câu đã nhập</span>
          </div>
          <div>
            <strong>{answeredCount}</strong>
            <span>Đã trả lời</span>
          </div>
          <div>
            <strong>{submitted ? score : "-"}</strong>
            <span>Điểm</span>
          </div>
        </div>
      </section>

      <section
        className={dragging ? "dropzone active" : "dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          className="hiddenInput"
          type="file"
          accept=".docx,.docm,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <input
          ref={jsonInputRef}
          className="hiddenInput"
          type="file"
          accept=".json,application/json"
          onChange={(event) => importQuizJson(event.target.files?.[0])}
        />
        <div>
          <h2>Đẩy file Word lên</h2>
          <p>Hỗ trợ câu hỏi có hình ảnh, A/B/C/D nhiều dòng hoặc chung dòng, đáp án dưới câu hoặc bảng đáp án cuối file.</p>
        </div>
        <button type="button" className="primary" onClick={() => inputRef.current?.click()}>
          Chọn file Word
        </button>
      </section>

      {subject === "devops" && (
        <section className="preloaded-exams">
          <p className="label">Đề thi CLF-C02 song ngữ có sẵn</p>
          <h2>Luyện tập tức thì</h2>
          <p style={{ color: "#647381", margin: "0 0 18px", lineHeight: 1.5 }}>
            Chọn một trong 5 bộ đề AWS Cloud Practitioner được tích hợp sẵn để bắt đầu học ngay lập tức mà không cần chuẩn bị file:
          </p>
          <div className="preloaded-grid">
            {PRELOADED_DEVOPS_EXAMS.map((exam) => (
              <div
                key={exam.id}
                className="preloaded-card"
                onClick={() => loadPreloadedExam(exam)}
              >
                <div>
                  <h3 className="preloaded-card-title">{exam.title}</h3>
                  <p className="preloaded-card-meta">{exam.meta}</p>
                </div>
                <div className="preloaded-card-action">
                  ⚡ Vào làm bài ngay →
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {subject === "tthcm" && (
        <section className="preloaded-exams">
          <p className="label">Đề ôn tập Tư tưởng Hồ Chí Minh có sẵn</p>
          <h2>Luyện tập tức thì</h2>
          <p style={{ color: "#647381", margin: "0 0 18px", lineHeight: 1.5 }}>
            Chọn bộ đề thi trắc nghiệm Tư tưởng Hồ Chí Minh được tích hợp từ file Word gốc để vào ôn luyện ngay lập tức:
          </p>
          <div className="preloaded-grid">
            {PRELOADED_TTHCM_EXAMS.map((exam) => (
              <div
                key={exam.id}
                className="preloaded-card"
                onClick={() => loadPreloadedExam(exam)}
              >
                <div>
                  <h3 className="preloaded-card-title">{exam.title}</h3>
                  <p className="preloaded-card-meta">{exam.meta}</p>
                </div>
                <div className="preloaded-card-action">
                  ⚡ Vào làm bài ngay →
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="notice">Đang đọc file...</p>}
      {message && <p className="notice">{message}</p>}

      {savedQuizzes.length > 0 && (
        <section className="library">
          <div>
            <p className="label">Thư viện quiz đã lưu</p>
            <h2>Làm lại nhanh</h2>
          </div>
          <div className="libraryList">
            {savedQuizzes.map((item) => (
              <article className="libraryItem" key={item.id}>
                <div>
                  <strong>{item.fileName}</strong>
                  <span>
                    {item.questionCount} câu, {item.manualCount} câu cần tự làm ·{" "}
                    {new Date(item.importedAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="libraryActions">
                  <button type="button" className="primary smallButton" onClick={() => openSavedQuiz(item.id)}>
                    Mở
                  </button>
                  <button type="button" className="secondary smallButton" onClick={() => removeSavedQuiz(item.id)}>
                    Xóa
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {quiz && (
        <section className="summary" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <p className="label">Quiz hiện tại</p>
            <h2>{quiz.fileName || "Quiz không tên"}</h2>
            <p>
              Có {quiz.questions?.length || 0} câu. Nhập lúc{" "}
              {quiz.importedAt ? new Date(quiz.importedAt).toLocaleString("vi-VN") : "không rõ"}.
            </p>
          </div>
          <div className="actions" style={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}>
            <div className="quizOptions" style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap", padding: "1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "500" }}>
                <input
                  type="checkbox"
                  checked={isShuffle}
                  onChange={(e) => setIsShuffle(e.target.checked)}
                />
                Trộn câu hỏi
              </label>
              <div style={{ width: "1px", height: "24px", backgroundColor: "var(--border-color)" }}></div>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="quizMode"
                  value="exam"
                  checked={quizMode === "exam"}
                  onChange={() => setQuizMode("exam")}
                />
                Thi thử (Nộp bài mới biết điểm)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="quizMode"
                  value="practice"
                  checked={quizMode === "practice"}
                  onChange={() => setQuizMode("practice")}
                />
                Thực chiến (Hiện đáp án ngay khi chọn đủ)
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" className="primary" onClick={startQuiz}>
                {questions.length ? "Làm lại bài" : "Bắt đầu làm bài"}
              </button>
              <button type="button" className="secondary" onClick={exportQuizJson}>
                Xuất JSON
              </button>
              <button type="button" className="secondary" onClick={() => jsonInputRef.current?.click()}>
                Nhập JSON
              </button>
              <button type="button" className="secondary" onClick={clearQuiz}>
                Xóa quiz
              </button>
            </div>
          </div>

          {quiz.warnings && quiz.warnings.length > 0 && (
            <div className="warnings">
              <strong>Cảnh báo khi nhập file</strong>
              <ul>
                {quiz.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {(quiz.manualNotes || []).length > 0 && (
            <div className="manualNotes">
              <strong>Câu cần tự làm ({quiz.manualNotes.length})</strong>
              <p>Những phần này không đủ dạng trắc nghiệm để tự chấm, nên được giữ lại để bạn nhập/sửa thủ công.</p>
              <div className="manualList">
                {quiz.manualNotes.map((note, index) => (
                  <article className="manualItem" key={`${note.number}-${index}`}>
                    <div className="manualTop">
                      <span>Câu gốc {note.number}</span>
                      <em>{note.reason}</em>
                    </div>
                    {note.question && <RichText text={note.question} className="manualQuestion" />}
                    <ImageList images={note.images} compact />
                    {editingNoteIndex === index && manualDraft ? (
                      <div className="manualEditor">
                        <label>
                          Nội dung câu hỏi
                          <textarea
                            value={manualDraft.question}
                            onChange={(event) => setManualDraft((current) => ({ ...current, question: event.target.value }))}
                          />
                        </label>
                        <div className="manualChoiceGrid">
                          {["A", "B", "C", "D"].map((label) => (
                            <label key={label}>
                              <span>
                                <input
                                  type="checkbox"
                                  checked={manualDraft.correctAnswers.includes(label)}
                                  onChange={() => toggleManualCorrect(label)}
                                />
                                Đáp án {label}
                              </span>
                              <textarea
                                value={manualDraft.choices[label]}
                                onChange={(event) => updateManualChoice(label, event.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                        <div className="editorActions">
                          <button type="button" className="primary" onClick={saveManualQuestion}>
                            Lưu thành quiz
                          </button>
                          <button type="button" className="secondary" onClick={cancelManualEdit}>
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="secondary smallButton" onClick={() => beginManualEdit(note, index)}>
                        Nhập thủ công
                      </button>
                    )}
                    {note.choices?.length > 0 && (
                      <ul>
                        {note.choices.map((choice) => (
                          <li key={choice.label}>
                            <strong>{choice.label}.</strong> <RichText text={choice.text} className="inlineRichText" />
                            <ImageList images={choice.images} compact />
                          </li>
                        ))}
                      </ul>
                    )}
                    {note.correctAnswers?.length > 0 && (
                      <p className="manualAnswer">Đáp án đọc được: {note.correctAnswers.join(", ")}</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {questions.length > 0 && quizMode === "exam" && (
        <section className="quiz">
          <div className="toolbar">
            <div>
              <p className="label">Bài làm (Chế độ Thi thử)</p>
              <h2>
                {answeredCount}/{questions.length} câu đã chọn
              </h2>
            </div>
            <button
              type="button"
              className="primary"
              disabled={submitted}
              onClick={() => setSubmitted(true)}
            >
              Nộp bài
            </button>
          </div>

          {submitted && (
            <div className="result">
              <strong>
                Điểm: {score}/{questions.length}
              </strong>
              <span>Đáp án đúng được tô xanh, đáp án sai được tô đỏ.</span>
            </div>
          )}

          <div className="questionList">
            {questions.map((question, index) => {
              const selectedAnswers = answers[question.id] || [];
              const correctAnswers = question.correctAnswers || [question.correctAnswer];
              const isQuestionSubmitted = submitted;

              return (
                <article className="question" key={question.id}>
                  <div className="questionTop">
                    <span>Câu {question.number || (index + 1)}</span>
                    {isQuestionSubmitted && <strong>Đáp án đúng: {correctAnswers.join(", ")}</strong>}
                  </div>
                  {correctAnswers.length > 1 && (
                    <p className="multiHint">Chọn {correctAnswers.length} đáp án</p>
                  )}
                  <RichText text={question.question} className="questionText" />
                  <ImageList images={question.images} />

                  <div className="options">
                    {question.choices.map((choice) => {
                      const selected = selectedAnswers.includes(choice.label);
                      const correct = correctAnswers.includes(choice.label);
                      const isMultiAnswer = correctAnswers.length > 1;

                      return (
                        <label
                          className={optionClass({ submitted: isQuestionSubmitted, selected, correct })}
                          key={choice.label}
                        >
                          <input
                            type={isMultiAnswer ? "checkbox" : "radio"}
                            name={question.id}
                            checked={selected}
                            disabled={isQuestionSubmitted}
                            onChange={() => chooseAnswer(question, choice.label)}
                          />
                          <span className="letter">{choice.label}</span>
                          <span className="choiceContent">
                            <RichText text={choice.text} className="choiceText" />
                            <ImageList images={choice.images} compact />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {questions.length > 0 && quizMode === "practice" && (
        <section className="practice-playground">
          <div className="practice-main">
            <div className="practice-card-header">
              <div>
                <p className="label">Chế độ Thực chiến</p>
                <h2>Câu {questions[activeQuestionIndex].number || (activeQuestionIndex + 1)}</h2>
              </div>
              <div className="practice-nav-actions">
                <button
                  type="button"
                  className="secondary smallButton"
                  style={{ marginTop: 0 }}
                  disabled={activeQuestionIndex === 0}
                  onClick={() => {
                    setActiveQuestionIndex((prev) => prev - 1);
                  }}
                >
                  ← Câu trước
                </button>
                <span className="practice-counter">
                  <strong>{activeQuestionIndex + 1}</strong> / {questions.length}
                </span>
                <button
                  type="button"
                  className="primary smallButton"
                  style={{ marginTop: 0 }}
                  disabled={activeQuestionIndex === questions.length - 1}
                  onClick={() => {
                    setActiveQuestionIndex((prev) => prev + 1);
                  }}
                >
                  Câu tiếp →
                </button>
              </div>
            </div>

            {(() => {
              const question = questions[activeQuestionIndex];
              const selectedAnswers = answers[question.id] || [];
              const correctAnswers = question.correctAnswers || [question.correctAnswer];
              const isQuestionSubmitted = submitted || (selectedAnswers.length === correctAnswers.length);

              return (
                <article className="question active-question-card" key={question.id}>
                  {correctAnswers.length > 1 && (
                    <p className="multiHint">Chọn {correctAnswers.length} đáp án</p>
                  )}
                  <RichText text={question.question} className="questionText" />
                  <ImageList images={question.images} />

                  <div className="options">
                    {question.choices.map((choice) => {
                      const selected = selectedAnswers.includes(choice.label);
                      const correct = correctAnswers.includes(choice.label);
                      const isMultiAnswer = correctAnswers.length > 1;

                      return (
                        <label
                          className={optionClass({ submitted: isQuestionSubmitted, selected, correct })}
                          key={choice.label}
                        >
                          <input
                            type={isMultiAnswer ? "checkbox" : "radio"}
                            name={question.id}
                            checked={selected}
                            disabled={isQuestionSubmitted}
                            onChange={() => chooseAnswer(question, choice.label)}
                          />
                          <span className="letter">{choice.label}</span>
                          <span className="choiceContent">
                            <RichText text={choice.text} className="choiceText" />
                            <ImageList images={choice.images} compact />
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {isQuestionSubmitted && (
                    <div className={`practice-feedback ${sameAnswers(selectedAnswers, correctAnswers) ? "practice-feedback--correct" : "practice-feedback--wrong"}`}>
                      <strong>
                        {sameAnswers(selectedAnswers, correctAnswers) ? "✓ Chính xác!" : "✗ Chưa chính xác!"}
                      </strong>
                      <span> Đáp án đúng: {correctAnswers.join(", ")}</span>
                    </div>
                  )}
                </article>
              );
            })()}

            <div className="practice-footer-nav">
              <button
                type="button"
                className="secondary"
                disabled={activeQuestionIndex === 0}
                onClick={() => {
                  setActiveQuestionIndex((prev) => prev - 1);
                }}
              >
                ← Câu trước
              </button>

              <button
                type="button"
                className="primary"
                disabled={activeQuestionIndex === questions.length - 1}
                onClick={() => {
                  setActiveQuestionIndex((prev) => prev + 1);
                }}
              >
                Câu tiếp theo →
              </button>
            </div>
          </div>

          <aside className="practice-sidebar">
            <div className="sidebar-header">
              <h3>Bản đồ câu hỏi</h3>
              <div className="sidebar-stats">
                <span className="stat-item stat-item--correct">
                  <span className="stat-dot"></span>
                  Đúng: {
                    questions.filter((q) => {
                      const sel = answers[q.id] || [];
                      const cor = q.correctAnswers || [q.correctAnswer];
                      return sel.length === cor.length && sameAnswers(sel, cor);
                    }).length
                  }
                </span>
                <span className="stat-item stat-item--wrong">
                  <span className="stat-dot"></span>
                  Sai: {
                    questions.filter((q) => {
                      const sel = answers[q.id] || [];
                      const cor = q.correctAnswers || [q.correctAnswer];
                      return sel.length === cor.length && !sameAnswers(sel, cor);
                    }).length
                  }
                </span>
                <span className="stat-item stat-item--unanswered">
                  <span className="stat-dot"></span>
                  Chưa làm: {
                    questions.filter((q) => (answers[q.id] || []).length === 0).length
                  }
                </span>
              </div>
            </div>

            <div className="practice-grid">
              {questions.map((q, idx) => {
                const status = getQuestionStatus(q);
                let btnClass = "practice-grid-btn";
                if (idx === activeQuestionIndex) btnClass += " active";
                btnClass += ` ${status}`;

                return (
                  <button
                    key={q.id}
                    type="button"
                    className={btnClass}
                    onClick={() => {
                      setActiveQuestionIndex(idx);
                    }}
                    title={`Câu ${q.number || (idx + 1)}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}
