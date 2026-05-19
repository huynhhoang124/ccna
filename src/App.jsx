import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth/mammoth.browser";
import { parseQuizItems, shuffleQuestions } from "./quizParser.js";

const STORAGE_KEY = "docx-quiz-redo:lastQuiz:v2";
const DB_NAME = "docx-quiz-redo-db";
const DB_VERSION = 1;
const QUIZ_STORE = "quizzes";

function loadStoredQuiz() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const quiz = JSON.parse(value);
    return quiz.id ? quiz : { ...quiz, id: crypto.randomUUID?.() || `quiz-${Date.now()}` };
  } catch {
    return null;
  }
}

function saveStoredQuiz(quiz) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quiz));
    return true;
  } catch {
    return false;
  }
}

function openQuizDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(QUIZ_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRequest(operation) {
  const db = await openQuizDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUIZ_STORE, operation.mode);
    const store = transaction.objectStore(QUIZ_STORE);
    const request = operation.run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function quizMeta(quiz) {
  return {
    id: quiz.id,
    fileName: quiz.fileName,
    importedAt: quiz.importedAt,
    questionCount: quiz.questions?.length || 0,
    manualCount: quiz.manualNotes?.length || 0
  };
}

async function saveQuizToLibrary(quiz) {
  await idbRequest({ mode: "readwrite", run: (store) => store.put(quiz) });
}

async function loadQuizLibrary() {
  const quizzes = await idbRequest({ mode: "readonly", run: (store) => store.getAll() });
  return quizzes.map(quizMeta).sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

async function getSavedQuiz(id) {
  return idbRequest({ mode: "readonly", run: (store) => store.get(id) });
}

async function deleteSavedQuiz(id) {
  await idbRequest({ mode: "readwrite", run: (store) => store.delete(id) });
}

function optionClass({ submitted, selected, correct }) {
  if (!submitted) return selected ? "option selected" : "option";
  if (correct) return "option correct";
  if (selected) return "option wrong";
  return "option muted";
}

function sameAnswers(selectedAnswers, correctAnswers) {
  if (selectedAnswers.length !== correctAnswers.length) return false;
  return correctAnswers.every((answer) => selectedAnswers.includes(answer));
}

function cleanText(value) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

async function extractDocxItems(arrayBuffer) {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read("base64");
        return {
          src: `data:${image.contentType};base64,${base64}`
        };
      })
    }
  );

  const documentHtml = new DOMParser().parseFromString(result.value, "text/html");
  const blocks = [...documentHtml.body.querySelectorAll("p, li, td, th")];
  const nodes = blocks.length ? blocks : [...documentHtml.body.children];

  return nodes.flatMap((node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const images = [...clone.querySelectorAll("img")].map((image) => image.getAttribute("src")).filter(Boolean);
    clone.querySelectorAll("img").forEach((image) => image.remove());

    const lines = (clone.textContent || "")
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean);

    if (lines.length === 0) {
      return images.length ? [{ text: "", images }] : [];
    }

    return lines.map((line, index) => ({
      text: line,
      images: index === lines.length - 1 ? images : []
    }));
  });
}

function ImageList({ images, compact = false }) {
  if (!images?.length) return null;

  return (
    <div className={compact ? "imageGrid compactImages" : "imageGrid"}>
      {images.map((src, index) => (
        <img className="docImage" src={src} alt={`Hình ${index + 1}`} key={`${src.slice(0, 64)}-${index}`} />
      ))}
    </div>
  );
}

function formatReadableLines(text) {
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

function isCodeLine(line) {
  return (
    /#/.test(line) ||
    /^(?:interface|ip|access-list|switchport|spanning-tree|line vty|router|show|copy|enable|configure)\b/i.test(line)
  );
}

function RichText({ text, className = "" }) {
  const lines = formatReadableLines(text || "");
  const groups = [];

  for (const line of lines) {
    const type = isCodeLine(line) ? "code" : "text";
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.type === type) {
      lastGroup.lines.push(line);
    } else {
      groups.push({ type, lines: [line] });
    }
  }

  return (
    <div className={className}>
      {groups.map((group, index) =>
        group.type === "code" ? (
          <pre className="codeBlock" key={`${group.type}-${index}`}>
            {group.lines.join("\n")}
          </pre>
        ) : (
          <div className="textBlock" key={`${group.type}-${index}`}>
            {group.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )
      )}
    </div>
  );
}

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
    setQuestions(shuffleQuestions(quiz.questions));
    setAnswers({});
    setSubmitted(false);
    setMessage("Đã đảo thứ tự câu hỏi. Bắt đầu làm bài.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearQuiz() {
    localStorage.removeItem(STORAGE_KEY);
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
        <section className="summary">
          <div>
            <p className="label">Quiz hiện tại</p>
            <h2>{quiz.fileName}</h2>
            <p>
              Có {quiz.questions.length} câu. Nhập lúc{" "}
              {new Date(quiz.importedAt).toLocaleString("vi-VN")}.
            </p>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={startQuiz}>
              {questions.length ? "Làm lại và đảo câu" : "Bắt đầu làm bài"}
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

          {quiz.warnings.length > 0 && (
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
            {questions.map((question, index) => (
              <article className="question" key={question.id}>
                <div className="questionTop">
                  <span>Câu {index + 1}</span>
                  {submitted && <strong>Đáp án đúng: {(question.correctAnswers || [question.correctAnswer]).join(", ")}</strong>}
                </div>
                {(question.correctAnswers || [question.correctAnswer]).length > 1 && (
                  <p className="multiHint">Chọn {(question.correctAnswers || []).length} đáp án</p>
                )}
                <RichText text={question.question} className="questionText" />
                <ImageList images={question.images} />

                <div className="options">
                  {question.choices.map((choice) => {
                    const selectedAnswers = answers[question.id] || [];
                    const correctAnswers = question.correctAnswers || [question.correctAnswer];
                    const selected = selectedAnswers.includes(choice.label);
                    const correct = correctAnswers.includes(choice.label);
                    const isMultiAnswer = correctAnswers.length > 1;

                    return (
                      <label
                        className={optionClass({ submitted, selected, correct })}
                        key={choice.label}
                      >
                        <input
                          type={isMultiAnswer ? "checkbox" : "radio"}
                          name={question.id}
                          checked={selected}
                          disabled={submitted}
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
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
