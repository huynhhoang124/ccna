const STORAGE_KEY = "docx-quiz-redo:lastQuiz:v2";
const DB_NAME = "docx-quiz-redo-db";
const DB_VERSION = 1;
const QUIZ_STORE = "quizzes";

export function loadStoredQuiz(subject = "ccna") {
  try {
    const key = subject === "ccna" ? STORAGE_KEY : `${STORAGE_KEY}:${subject}`;
    const value = localStorage.getItem(key);
    if (!value) return null;
    const quiz = JSON.parse(value);
    if (!quiz || !Array.isArray(quiz.questions)) {
      return null;
    }
    return quiz.id ? quiz : { ...quiz, id: crypto.randomUUID?.() || `quiz-${Date.now()}` };
  } catch {
    return null;
  }
}

export function saveStoredQuiz(quiz, subject = "ccna") {
  try {
    const key = subject === "ccna" ? STORAGE_KEY : `${STORAGE_KEY}:${subject}`;
    localStorage.setItem(key, JSON.stringify(quiz));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredQuiz(subject = "ccna") {
  const key = subject === "ccna" ? STORAGE_KEY : `${STORAGE_KEY}:${subject}`;
  localStorage.removeItem(key);
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

export function quizMeta(quiz) {
  return {
    id: quiz.id,
    fileName: quiz.fileName,
    importedAt: quiz.importedAt,
    questionCount: quiz.questions?.length || 0,
    manualCount: quiz.manualNotes?.length || 0
  };
}

export async function saveQuizToLibrary(quiz, subject = "ccna") {
  const quizWithSubject = { ...quiz, subject };
  await idbRequest({ mode: "readwrite", run: (store) => store.put(quizWithSubject) });
}

export async function loadQuizLibrary(subject = "ccna") {
  const quizzes = await idbRequest({ mode: "readonly", run: (store) => store.getAll() });
  return quizzes
    .filter((q) => (subject === "ccna" ? !q.subject || q.subject === "ccna" : q.subject === subject))
    .map(quizMeta)
    .sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

export async function getSavedQuiz(id) {
  return idbRequest({ mode: "readonly", run: (store) => store.get(id) });
}

export async function deleteSavedQuiz(id) {
  await idbRequest({ mode: "readwrite", run: (store) => store.delete(id) });
}
