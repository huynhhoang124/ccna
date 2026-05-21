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

export default function App() {
  const inputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [quiz, setQuiz] = useState(() => loadStoredQuiz());
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

  useEffect(() => {
    refreshLibrary();
  }, []);

  async function refreshLibrary() {
    try {
      setSavedQuizzes(await loadQuizLibrary());
    } catch {
      setSavedQuizzes([]);
    }
  }

  async function persistQuiz(quiz) {
    const savedLocally = saveStoredQuiz(quiz);
    try {
      await saveQuizToLibrary(quiz);
      await refreshLibrary();
      return { savedLocally, savedInLibrary: true };
    } catch {
      return { savedLocally, savedInLibrary: false };
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
    setMessage(isShuffle ? "Đã đảo thứ tự câu hỏi. Bắt đầu làm bài." : "Đã bắt đầu làm bài.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearQuiz() {
    clearStoredQuiz();
    setQuiz(null);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
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
      <section className="hero">
        <div>
          <p className="kicker">DOCX Quiz</p>
          <h1>Tạo bài trắc nghiệm từ file Word</h1>
          <p className="heroText">
            Upload file Word .docx có câu hỏi, hình ảnh và đáp án A/B/C/D. Web sẽ tự nhận nhiều kiểu format,
            đảo thứ tự câu và chấm điểm sau khi nộp.
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

      {questions.length > 0 && (
        <section className="quiz">
          <div className="toolbar">
            <div>
              <p className="label">Bài làm</p>
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
              
              // Trong chế độ thực chiến, câu hỏi được đánh giá ngay khi số lượng đáp án được chọn bằng với số lượng đáp án đúng
              const isQuestionSubmitted = submitted || (quizMode === "practice" && selectedAnswers.length === correctAnswers.length);

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
    </main>
  );
}
